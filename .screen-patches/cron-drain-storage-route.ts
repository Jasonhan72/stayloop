// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §3 P1 follow-up — Cloudflare cron handler that
// drains the pending_storage_deletions queue.
// -----------------------------------------------------------------------------
// WHY THIS EXISTS
//   We can't delete files from Supabase Storage inside a Postgres trigger
//   (storage lives in a different system, and triggers can't make outbound
//   HTTP). The migration in this batch added a `pending_storage_deletions`
//   queue + claim_pending_storage_deletions / mark_storage_deletion_done
//   RPCs to defer storage cleanup to a worker. This route IS that worker.
//
// WIRING — Cloudflare Cron Trigger
//   Schedule POST /api/cron/drain-storage every 6 hours (e.g. cron pattern
//   `0 */6 * * *`) via:
//
//     Cloudflare Dashboard → Workers & Pages → Pages project →
//     Settings → Functions → Cron Triggers → Add Cron Trigger
//
//   or equivalent in `wrangler.toml`:
//
//     [triggers]
//     crons = ["0 */6 * * *"]
//
//   The Trigger fires a `fetch` against the deployed origin. Configure the
//   Trigger handler to POST to /api/cron/drain-storage with:
//
//     X-Stayloop-Cron-Secret: ${CRON_SECRET}
//
//   so the route can authenticate the call (Cloudflare cron triggers do
//   NOT carry any built-in auth header).
//
// ENV VARS REQUIRED (Cloudflare Pages → Settings → Environment variables)
//   - CRON_SECRET                  random 32+ char string, also set on Trigger
//   - NEXT_PUBLIC_SUPABASE_URL     already set
//   - SUPABASE_SERVICE_ROLE_KEY    already set
//
// IDEMPOTENCY / SAFETY
//   - claim_pending_storage_deletions marks rows `claimed_at = now()` so
//     concurrent cron invocations don't double-process. The 100-row limit
//     keeps a single run under the Workers CPU budget.
//   - On per-file errors we mark_storage_deletion_done(p_id, p_error=...)
//     which (per the RPC contract) records the error AND bumps an attempt
//     counter so we don't loop on permanently-bad rows forever.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { captureException, captureMessage } from '@/lib/observability/sentry'

export const runtime = 'edge'

interface PendingDeletion {
  id: string
  bucket: string
  path: string
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const expected = process.env.CRON_SECRET
  const got = req.headers.get('x-stayloop-cron-secret')
  if (!expected) {
    // Misconfiguration — treat as 500 so the cron operator notices instead
    // of the route silently returning 401 forever.
    captureMessage('cron drain-storage: CRON_SECRET not configured', {
      route: 'cron-drain-storage',
      level: 'error',
    })
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  if (!got || got !== expected) {
    captureMessage('cron drain-storage: unauthorized call', {
      route: 'cron-drain-storage',
      level: 'warning',
      extra: { has_header: !!got },
    })
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Service-role Supabase client ───────────────────────────────────────
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !serviceKey) {
    captureMessage('cron drain-storage: SUPABASE_* env missing', {
      route: 'cron-drain-storage',
      level: 'error',
    })
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }
  const admin = createClient(supaUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── Claim a batch ───────────────────────────────────────────────────────
  // The RPC marks claimed_at=now() inside a single transaction so concurrent
  // workers can't double-process a row.
  const { data: claimed, error: claimErr } = await admin.rpc(
    'claim_pending_storage_deletions',
    { p_limit: 100 },
  )
  if (claimErr) {
    captureException(claimErr, {
      route: 'cron-drain-storage',
      level: 'error',
    })
    return NextResponse.json(
      { error: claimErr.message.slice(0, 300) },
      { status: 500 },
    )
  }

  const rows: PendingDeletion[] = Array.isArray(claimed)
    ? (claimed as unknown[]).filter(isPendingDeletion)
    : []

  if (rows.length === 0) {
    return NextResponse.json({ drained: 0, errors: 0 })
  }

  // ── Drain ───────────────────────────────────────────────────────────────
  // We process serially rather than fanning out: Supabase Storage's API has
  // strict per-bucket rate limits and the queue is rarely deep enough to
  // make parallelism worthwhile. Each iteration ≤ 200 ms even on cold path.
  let drained = 0
  let errors = 0
  for (const row of rows) {
    try {
      const { error: rmErr } = await admin.storage
        .from(row.bucket)
        .remove([row.path])
      if (rmErr) {
        errors += 1
        await markDone(admin, row.id, rmErr.message)
        captureMessage('cron drain-storage: storage.remove failed', {
          route: 'cron-drain-storage',
          level: 'warning',
          extra: {
            id: row.id,
            bucket: row.bucket,
            path: row.path.slice(0, 200),
            err: rmErr.message.slice(0, 300),
          },
        })
        continue
      }
      // Success — clear the row.
      const { error: doneErr } = await admin.rpc(
        'mark_storage_deletion_done',
        { p_id: row.id },
      )
      if (doneErr) {
        // The file IS deleted but we couldn't clear the queue row. Next
        // cron run will re-claim it, hit a 404 on .remove() (which Supabase
        // surfaces as a soft error), and then succeed in marking it done.
        errors += 1
        captureException(doneErr, {
          route: 'cron-drain-storage',
          level: 'warning',
          extra: { id: row.id },
        })
        continue
      }
      drained += 1
    } catch (err: unknown) {
      errors += 1
      const msg = err instanceof Error ? err.message : 'unknown'
      await markDone(admin, row.id, msg)
      captureException(err, {
        route: 'cron-drain-storage',
        level: 'warning',
        extra: { id: row.id, bucket: row.bucket, path: row.path.slice(0, 200) },
      })
    }
  }

  return NextResponse.json({ drained, errors })
}

// 2026-06-02 — Build fix: `ReturnType<typeof createClient>` resolved to
// a SupabaseClient generic shape that didn't unify with the concrete
// `createClient(url, key, options)` call site, AND its `.rpc()` arg type
// collapsed to `undefined` so passing an args object failed type-check.
// Using SupabaseClient<any, any, any> sidesteps both — the helper still
// gets a strongly-typed client surface; only the unused Database/Schema
// generics are loosened so the param accepts whatever createClient returns.
async function markDone(
  admin: SupabaseClient<any, any, any>,
  id: string,
  errMsg?: string,
): Promise<void> {
  try {
    const params: Record<string, unknown> = { p_id: id }
    if (errMsg) params.p_error = errMsg.slice(0, 300)
    await admin.rpc('mark_storage_deletion_done', params)
  } catch {
    // Swallow — already accounted for in the outer error count; Sentry
    // already has the original failure. We don't want a secondary RPC
    // failure to abort the whole drain loop.
  }
}

function isPendingDeletion(x: unknown): x is PendingDeletion {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.bucket === 'string' &&
    typeof r.path === 'string'
  )
}

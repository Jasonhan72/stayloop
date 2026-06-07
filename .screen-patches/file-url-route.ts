// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §3 P2 — Tighten file-url authorization.
// -----------------------------------------------------------------------------
// PRIOR ISSUE
//   The previous version pulled `application_id = path.split('/')[0]` and
//   then asked Supabase whether the caller could read that application
//   (under RLS). That's correct for the application-scoped flow BUT:
//
//     a) the prefix check is positional and forgiving — a crafted path like
//        `${appId}/../another-landlord/file.pdf` still starts with `appId`
//        so the SELECT succeeds, after which `createSignedUrl()` resolves
//        against the literal storage path and happily issues a URL to the
//        other landlord's file.
//
//     b) screening-flow uploads live under `landlords/${landlordId}/...`
//        (NOT under `${applicationId}/...`), so the legacy check rejected
//        them — meaning we silently rely on auth_id RLS bypass to make
//        the screen workspace work, and there's no defence-in-depth at
//        the route layer for that branch.
//
// FIX
//   1. Hard input scrub — reject any path containing `..`, `\`, or starting
//      with `/`. Reject any null bytes for good measure.
//   2. Inventory check — instead of prefix-matching, require the requested
//      path to appear in EITHER:
//        • applications.files[].path where the application's listing
//          belongs to the caller's landlord, OR
//        • screenings.files[].path where landlord_id matches the caller.
//      We collect both lists with a service-role client (RLS would lock
//      out the cross-table join anyway), then membership-test in JS.
//      If neither table claims this path → 403.
//
//   The signed URL is still scoped to 600 s and served from the
//   tenant-files bucket. Preserves the existing { url } response shape so
//   callers don't need to change.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { path } = (await req.json()) as { path?: unknown }
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    // ── §3 P2: reject obviously malicious inputs before any DB work. ───
    if (!isSafeStoragePath(path)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Require authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    // ── §3 P2: inventory-based authorization ─────────────────────────────
    // The service-role client is needed because we join across
    // applications → listings (the caller may own the listing under RLS
    // but the applications row is owned by the prospective tenant under
    // the post-consent RLS policy; we can't always read it as the caller).
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supaUrl || !serviceKey) {
      return NextResponse.json({ error: 'not_configured' }, { status: 500 })
    }
    const admin = createClient(supaUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1) Resolve the caller's landlord_id (under the user's auth, NOT
    //    service role — we want this to fail naturally if the user isn't
    //    a landlord and shouldn't be calling this route at all).
    const { data: landlord, error: llErr } = await supabase
      .from('landlords')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()
    if (llErr || !landlord?.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const landlordId = landlord.id as string

    // 2) Build the set of paths the caller is entitled to.
    const owned = await collectOwnedFilePaths(admin, landlordId)

    if (!owned.has(path)) {
      // Don't leak whether the path exists at all — generic 403.
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('tenant-files')
      .createSignedUrl(path, 600)
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signErr?.message || 'sign failed' },
        { status: 500 },
      )
    }

    return NextResponse.json({ url: signed.signedUrl })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[file-url] uncaught:', e)
    captureException(e, { route: 'file-url', level: 'error' })
    return NextResponse.json(
      { error: 'file-url failed: ' + msg.slice(0, 300) },
      { status: 500 },
    )
  }
}

/**
 * Allow only path segments that look like Supabase Storage keys we
 * actually generate. Bucket keys are arbitrary strings, but we constrain
 * the API surface so an attacker can't smuggle `..` or absolute paths
 * past the inventory check via odd encodings.
 *
 * Reject:
 *   - empty / not a string (caller checked, belt-and-braces)
 *   - >1024 chars (well above legitimate keys; CF Pages headers also cap)
 *   - leading `/` (Supabase treats keys as relative — leading slash is
 *     ambiguous and never produced by our upload code)
 *   - any `..` segment (path traversal)
 *   - any `\\` (Windows-style separator — never produced by us)
 *   - any control char (incl. null bytes)
 */
function isSafeStoragePath(p: string): boolean {
  if (p.length === 0 || p.length > 1024) return false
  if (p.startsWith('/')) return false
  if (p.includes('\\')) return false
  // Control chars (incl. \x00 null byte).
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(p)) return false
  // Reject any `..` segment — covers `..`, `a/..`, `../foo`, `foo/..`,
  // `foo/../bar`, etc. We check segments rather than the raw substring
  // because some legitimate paths contain `..` as part of a name (e.g.
  // a timestamp); splitting on `/` keeps that branch open.
  const parts = p.split('/')
  for (const seg of parts) {
    if (seg === '..' || seg === '.') return false
  }
  return true
}

/**
 * Collect every storage path the caller is entitled to read. Returns a
 * Set so membership checks are O(1).
 *
 * Sources:
 *   - applications.files[].path joined to listings owned by `landlordId`
 *   - screenings.files[].path where screenings.landlord_id = `landlordId`
 *
 * We deliberately use the service-role client here so this join works
 * regardless of the applications RLS policy state.
 */
// 2026-06-02 — Build fix: `ReturnType<typeof createClient>` resolved to
// a SupabaseClient generic shape that didn't unify with the concrete
// `createClient(url, key, options)` call site (Schema='public' wouldn't
// fit into the helper's inferred `never`). Loosening to
// SupabaseClient<any, any, any> keeps the method surface typed while
// letting the param accept any client createClient returns.
async function collectOwnedFilePaths(
  admin: SupabaseClient<any, any, any>,
  landlordId: string,
): Promise<Set<string>> {
  const out = new Set<string>()

  // ── screenings.files[].path ─────────────────────────────────────────
  const { data: screenings } = await admin
    .from('screenings')
    .select('files')
    .eq('landlord_id', landlordId)
  if (Array.isArray(screenings)) {
    for (const row of screenings) {
      const files = Array.isArray((row as { files?: unknown }).files)
        ? ((row as { files: unknown[] }).files as unknown[])
        : []
      for (const f of files) {
        if (
          f &&
          typeof f === 'object' &&
          typeof (f as { path?: unknown }).path === 'string'
        ) {
          out.add((f as { path: string }).path)
        }
      }
    }
  }

  // ── applications.files[].path WHERE listing.landlord_id = landlordId ─
  const { data: listings } = await admin
    .from('listings')
    .select('id')
    .eq('landlord_id', landlordId)
  const listingIds = Array.isArray(listings)
    ? listings
        .map((l) => (l as { id?: unknown }).id)
        .filter((id): id is string => typeof id === 'string')
    : []
  if (listingIds.length > 0) {
    const { data: apps } = await admin
      .from('applications')
      .select('files')
      .in('listing_id', listingIds)
    if (Array.isArray(apps)) {
      for (const row of apps) {
        const files = Array.isArray((row as { files?: unknown }).files)
          ? ((row as { files: unknown[] }).files as unknown[])
          : []
        for (const f of files) {
          if (
            f &&
            typeof f === 'object' &&
            typeof (f as { path?: unknown }).path === 'string'
          ) {
            out.add((f as { path: string }).path)
          }
        }
      }
    }
  }

  return out
}

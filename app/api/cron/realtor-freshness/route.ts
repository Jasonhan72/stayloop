// Realtor.ca freshness sweep: takes imported listings offline once their
// Realtor.ca page says "no longer exists", and follows price changes.
//
// pg_cron (hourly, :35) POSTs here with x-cron-secret; an admin can also run
// it from /admin/verify (user JWT + is_stayloop_admin). Each run reads the
// REALTOR_BATCH least recently checked rows through Jina. Decisions are in
// lib/listings/realtorFreshness.ts (pure, tested).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'
import {
  applyReading,
  classifyRealtorDetail,
  pickBatch,
  type RealtorCheck,
  type RealtorReading,
} from '@/lib/listings/realtorFreshness'

export const runtime = 'edge'

async function secretMatches(given: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(secret)),
  ])
  const va = new Uint8Array(a)
  const vb = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const given = (req.headers.get('x-cron-secret') || '').trim()
  if (secret && given && (await secretMatches(given, secret))) return true
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return false
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user) return false
  const { data: isAdmin } = await sb.rpc('is_stayloop_admin')
  return !!isAdmin
}

async function readDetail(key: string, url: string, mls: string | null, proxy = false): Promise<RealtorReading> {
  try {
    const res = await fetch(`https://r.jina.ai/${encodeURI(url)}`, {
      headers: { Authorization: `Bearer ${key}`, ...(proxy ? { 'X-Proxy': 'auto' } : {}) },
      signal: AbortSignal.timeout(proxy ? 30000 : 22000),
    })
    if (!res.ok) return { kind: 'error', status: res.status }
    const reading = classifyRealtorDetail(await res.text(), mls)
    if (reading.kind === 'blocked' && !proxy) return readDetail(key, url, mls, true)
    return reading
  } catch {
    return { kind: 'error', status: 0 }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

type Row = { id: string; slug: string | null; mls_number: string | null; source_url: string | null; monthly_rent: number | null; realtor_check: RealtorCheck | null }

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const key = process.env.JINA_API_KEY
  if (!key) return NextResponse.json({ error: 'JINA_API_KEY not configured' }, { status: 503 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin
    .from('listings')
    .select('id,slug,mls_number,source_url,monthly_rent,realtor_check')
    .eq('source', 'realtor')
    .eq('is_active', true)
    .limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const batch = pickBatch((data || []) as Row[], now)
  const results = await mapLimit(batch, 5, async (row) => {
    const reading: RealtorReading = row.source_url && /^https:\/\/www\.realtor\.ca\/real-estate\//.test(row.source_url)
      ? await readDetail(key, row.source_url, row.mls_number)
      : { kind: 'no_url' }
    const { check, delist, newRent } = applyReading(row.realtor_check, reading, row.monthly_rent, new Date())
    const patch: Record<string, unknown> = { realtor_check: check }
    if (delist) { patch.is_active = false; patch.status = 'archived' }
    if (newRent != null) patch.monthly_rent = newRent
    // Only write over the state this run read, so an admin edit or a parallel
    // run in between isn't overwritten.
    let q = admin.from('listings').update(patch).eq('id', row.id).eq('is_active', true)
    q = row.realtor_check ? q.eq('realtor_check->>checked_at', row.realtor_check.checked_at) : q.is('realtor_check', null)
    const { error: ue } = await q
    if (ue) captureException(new Error(`realtor-freshness write failed: ${ue.message}`), { route: 'realtor-freshness', level: 'warning', extra: { id: row.id } })
    return { id: row.id, slug: row.slug, state: reading.kind, delisted: delist, rent: newRent, written: !ue }
  })

  const jinaDown = results.filter((r) => r.state === 'error').length
  if (batch.length && jinaDown === batch.length) {
    captureException(new Error('realtor-freshness: every read failed (Jina balance / outage?)'), { route: 'realtor-freshness', level: 'warning' })
  }
  return NextResponse.json({
    checked: results.length,
    delisted: results.filter((r) => r.delisted).map((r) => r.slug),
    repriced: results.filter((r) => r.rent != null).map((r) => ({ slug: r.slug, rent: r.rent })),
    states: results.reduce<Record<string, number>>((m, r) => ((m[r.state] = (m[r.state] || 0) + 1), m), {}),
  })
}

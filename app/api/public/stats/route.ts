// Public, cached counters for the homepage's "things you can verify" band.
// Every number here is read from the production database at request time —
// the page must never carry a hand-typed figure that drifts from the system.
//
// 2026-10-09: one RPC (`public_stats`, migration 20261009) instead of four PostgREST calls, the LTB
// figure is the planner estimate rather than an exact count over 176k rows, and the response is kept
// in the Workers Cache API for an hour — Cloudflare does not honour `s-maxage` on a dynamic JSON
// response from a Pages Function (production showed `cf-cache-status: DYNAMIC`), so until now every
// homepage visit reached the database.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

const CACHE_SECONDS = 3600
const HEADERS = { 'Cache-Control': `public, max-age=1800, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400` }
// Fixed key: the route takes no inputs, so every colo shares one entry regardless of query string.
const CACHE_KEY = 'https://www.stayloop.ai/api/public/stats'

type Stats = { screenings: number | null; ltbOrders: number | null; listings: number | null; trrebQuarters: number | null; ltbOrdersEstimated: boolean }

async function readStats(): Promise<Stats | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const svc = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await svc.rpc('public_stats')
  if (error || !data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    screenings: num(d.screenings),
    ltbOrders: num(d.ltb_orders),
    listings: num(d.listings),
    trrebQuarters: num(d.trreb_quarters),
    ltbOrdersEstimated: d.ltb_orders_estimated === true,
  }
}

function edgeCache(): Cache | null {
  try {
    const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default
    return c ?? null
  } catch { return null }
}

export async function GET() {
  const cache = edgeCache()
  if (cache) {
    try {
      const hit = await cache.match(CACHE_KEY)
      if (hit) {
        const res = new NextResponse(hit.body, { status: hit.status, headers: hit.headers })
        res.headers.set('x-stats-cache', 'hit')
        return res
      }
    } catch { /* cache unavailable → compute */ }
  }
  const stats = await readStats()
  if (!stats) return NextResponse.json({ ok: false }, { status: 503, headers: HEADERS })
  const body = { ok: true, ...stats, at: new Date().toISOString() }
  const res = NextResponse.json(body, { headers: { ...HEADERS, 'x-stats-cache': 'miss' } })
  if (cache) {
    const copy = new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })
    const put = cache.put(CACHE_KEY, copy).catch(() => {})
    try { getRequestContext().ctx.waitUntil(put) } catch { void put }
  }
  return res
}

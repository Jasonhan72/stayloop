// Public, cached counters for the homepage's "things you can verify" band.
// Every number here is read from the production database at request time —
// the page must never carry a hand-typed figure that drifts from the system.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const headers = { 'Cache-Control': 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=86400' }
  if (!url || !key) return NextResponse.json({ ok: false }, { status: 503, headers })
  const svc = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const count = async (table: string, filter?: (q: any) => any): Promise<number | null> => {
    try {
      let q: any = svc.from(table).select('*', { count: 'exact', head: true })
      if (filter) q = filter(q)
      const { count: c, error } = await q
      return error ? null : (c ?? 0)
    } catch { return null }
  }
  const [screenings, ltbOrders, listings, periods] = await Promise.all([
    count('screenings'),
    count('ltb_orders'),
    count('listings', (q) => q.eq('is_active', true).or('verification_status.eq.verified,source.eq.realtor')),
    (async () => {
      try {
        const { data } = await svc.from('trreb_rent_stats').select('period')
        return data ? new Set(data.map((r: { period: string }) => r.period)).size : null
      } catch { return null }
    })(),
  ])
  return NextResponse.json({ ok: true, screenings, ltbOrders, listings, trrebQuarters: periods, at: new Date().toISOString() }, { headers })
}

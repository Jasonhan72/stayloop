// TRREB rental-report cache refresher.
//
// pg_cron (weekly) POSTs here with x-cron-secret. The route walks candidate
// quarterly report URLs (newest first), extracts the PDF via Jina, parses the
// Rental Market Summary (fail-closed cross-check in lib/agent/trrebRent.ts)
// and upserts the per-bedroom averages into public.trreb_rent_stats.
// The agent turn never fetches the PDF — it reads this cache.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseTrrebRentalReport, trrebReportCandidates } from '@/lib/agent/trrebRent'

export const runtime = 'edge'

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const given = req.headers.get('x-cron-secret') || ''
  if (!secret || given !== secret) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const jinaKey = process.env.JINA_API_KEY
  if (!jinaKey) return NextResponse.json({ error: 'JINA_API_KEY not configured' }, { status: 503 })

  for (const cand of trrebReportCandidates(new Date())) {
    let md: string
    try {
      const res = await fetch(`https://r.jina.ai/${encodeURI(cand.url)}`, {
        headers: { Authorization: `Bearer ${jinaKey}` },
        signal: AbortSignal.timeout(45000),
      })
      if (!res.ok) continue
      md = await res.text()
    } catch {
      continue
    }
    const report = parseTrrebRentalReport(md)
    if (!report) continue

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { error } = await admin.from('trreb_rent_stats').upsert(
      report.rows.map((r) => ({
        period: report.period,
        bed_type: r.bed_type,
        avg_rent: r.avg_rent,
        prev_avg_rent: r.prev_avg_rent,
        leased: r.leased,
        source_url: cand.url,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: 'period,bed_type' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ period: report.period, rows: report.rows.length, source: cand.url })
  }
  return NextResponse.json({ error: 'no parseable report found' }, { status: 502 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'

export const runtime = 'edge'

interface CanLIICase {
  databaseId: string
  caseId: { en: string }
  title: string
  citation: string
}

export async function POST(req: NextRequest) {
  try {
    const { application_id } = await req.json()

    const authHeader = req.headers.get('authorization') || ''
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify caller can access this application (RLS enforces ownership)
    const { data: app, error } = await supabase
      .from('applications')
      .select('id, first_name, last_name, ai_extracted_name')
      .eq('id', application_id)
      .single()

    if (error || !app) {
      return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
    }

    // Prefer the AI-extracted (verified from ID) name if available
    const fullName = (app.ai_extracted_name || `${app.first_name} ${app.last_name}`).trim()

    const apiKey = process.env.CANLII_API_KEY
    const records: Array<{ title: string; citation: string; url: string; date?: string; databaseId: string; caseId: string }> = []
    let status: 'ok' | 'no_api_key' | 'error' | 'no_results' = 'ok'

    if (!apiKey) {
      status = 'no_api_key'
    } else {
      try {
        // CanLII v1 case browse API — search ONLTB (Landlord Tenant Board) decisions.
        // publishedBefore is computed (today + 1y): a hardcoded date silently
        // excludes every decision published after it once the date passes.
        const publishedBefore = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)
        const url = `https://api.canlii.org/v1/caseBrowse/en/onltb/?api_key=${apiKey}&resultCount=20&offset=0&publishedBefore=${publishedBefore}&publishedAfter=2018-01-01&fullText=${encodeURIComponent(`"${fullName}"`)}`
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) {
          status = 'error'
        } else {
          const data = await res.json() as { cases?: CanLIICase[] }
          if (data.cases && data.cases.length > 0) {
            for (const c of data.cases.slice(0, 10)) {
              const cid = c.caseId?.en
              records.push({
                title: c.title,
                citation: c.citation,
                databaseId: c.databaseId,
                caseId: cid,
                url: cid ? `https://www.canlii.org/en/on/onltb/doc/${cid.split('.')[0] || cid}/${cid}.html` : 'https://www.canlii.org/en/on/onltb/',
              })
            }
          } else {
            status = 'no_results'
          }
        }
      } catch (e) {
        captureException(e, { route: 'ltb-search', level: 'warning', tags: { phase: 'canlii-fetch' } })
        status = 'error'
      }
    }

    // Compute a court_records dimension score: 100 if 0 hits, 70 if 1, 40 if 2, 10 if 3+.
    // ONLY meaningful when the search actually ran — a failed/keyless search
    // must NOT be persisted as a perfect clean record (score 100 / 0 hits).
    const searchRan = status === 'ok' || status === 'no_results'
    const recordCount = records.length
    let courtScore: number | null = null
    if (searchRan) {
      courtScore = 100
      if (recordCount >= 3) courtScore = 10
      else if (recordCount === 2) courtScore = 40
      else if (recordCount === 1) courtScore = 70
    }

    const { error: updateErr } = await supabase.from('applications').update({
      ltb_records_found: searchRan ? recordCount : null,
      ltb_records_json: searchRan ? records : null,
      court_records_score: courtScore,
      court_search_status: status,
      court_search_results: { name_searched: fullName, records, status },
    }).eq('id', application_id)
    if (updateErr) {
      captureException(updateErr, { route: 'ltb-search', level: 'warning', tags: { phase: 'persist' } })
    }

    return NextResponse.json({
      name_searched: fullName,
      status,
      count: recordCount,
      records,
      court_records_score: courtScore,
    })
  } catch (e: any) {
    console.error('[ltb-search] uncaught:', e)
    captureException(e, { route: 'ltb-search', level: 'error' })
    return NextResponse.json(
      { error: 'LTB search failed: ' + (e?.message || String(e) || 'unknown error').slice(0, 300) },
      { status: 500 }
    )
  }
}

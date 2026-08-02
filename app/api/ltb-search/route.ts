import { NextRequest, NextResponse } from 'next/server'
import { readJsonBody, INVALID_BODY } from '@/lib/api/body'
import { createClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'
import { describeCodes, searchLtbOrders, summarizeLtb } from '@/lib/ltb/search'

export const runtime = 'edge'

interface CanLIICase {
  databaseId: string
  caseId: { en: string }
  title: string
  citation: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody<{ application_id?: string }>(req)
    if (!body) return NextResponse.json(INVALID_BODY, { status: 400 })
    const { application_id } = body
    if (!application_id || typeof application_id !== 'string') {
      return NextResponse.json({ error: 'application_id required' }, { status: 400 })
    }

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

    // Ontario Open Data LTB Order Catalogue — a real, indexed name search.
    //
    // This route used to call CanLII:
    //   caseBrowse/en/onltb/?fullText="<name>"
    // CanLII's API has no full-text or party search — `fullText` is not a
    // parameter and is silently ignored (verified live: the same request with
    // a real name and with the nonsense string "zzqqxx9988nonsense" returns
    // identical results). This route then returned the 20 most recent ONLTB
    // decisions AS THE APPLICANT'S RECORDS, without even a name filter. Nothing
    // called it, which is the only reason that never reached a landlord.
    const ltb = await searchLtbOrders(
      (fn, args) => supabase.rpc(fn, args) as never,
      fullName,
      [],
    )
    const records = ltb.as_respondent.map((m) => ({
      title: `${m.file_number} · ${describeCodes(m.application_codes, 'en')}`,
      citation: m.file_number,
      url: m.order_pdf_url ?? 'https://data.ontario.ca/dataset/ltb-order-catalogue',
      date: m.order_date,
      databaseId: 'ltb_order_catalogue',
      caseId: m.document_id,
      address_match: m.address_match,
    }))
    const status: 'ok' | 'no_results' | 'skipped' | 'unavailable' =
      ltb.status === 'ok' ? (records.length ? 'ok' : 'no_results') : ltb.status

    return NextResponse.json({
      name_searched: fullName,
      status,
      count: records.length,
      records,
      // Applications the applicant BROUGHT (T1/T2/T5/T6). Surfaced separately
      // and never as a negative — see the rules at the top of lib/ltb/search.ts.
      tenant_filed_count: ltb.as_applicant.length,
      // What the catalogue actually holds right now. A clean result across five
      // months means much less than a clean result across five years, and the
      // caller must be able to say which it got.
      coverage: ltb.coverage,
      summary_en: summarizeLtb(ltb, 'en'),
      summary_zh: summarizeLtb(ltb, 'zh'),
      source: 'Ontario Open Data — LTB Order Catalogue (Open Government Licence – Ontario)',
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

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { application_id, first_name, last_name } = await req.json()

  // Search CanLII API for LTB decisions
  const query = `${first_name} ${last_name}`
  const canLiiUrl = `https://api.canlii.org/v1/caseBrowse/en/tribunal/onltb/?api_key=${process.env.CANLII_API_KEY}&resultCount=10&keyword=${encodeURIComponent(query)}`

  let ltbRecords = []
  let recordCount = 0

  try {
    const res = await fetch(canLiiUrl)
    const data = await res.json()
    if (data.cases) {
      ltbRecords = data.cases.slice(0, 5).map((c: any) => ({
        title: c.title,
        citation: c.citation,
        url: c.url,
        date: c.decisionDate,
      }))
      recordCount = ltbRecords.length
    }
  } catch {
    // CanLII API unavailable — log but continue
    console.log('CanLII API unavailable')
  }

  await supabase.from('applications').update({
    ltb_records_found: recordCount,
    ltb_records_json: ltbRecords,
  }).eq('id', application_id)

  return NextResponse.json({ records: ltbRecords, count: recordCount })
}

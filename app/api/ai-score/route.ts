import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const { application_id } = await req.json()

  const { data: app, error } = await supabase
    .from('applications')
    .select('*, listing:listings(*)')
    .eq('id', application_id)
    .single()

  if (error || !app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const monthlyRent = app.listing?.monthly_rent || 0
  const incomeRatio = app.monthly_income ? app.monthly_income / monthlyRent : 0

  const prompt = `You are a tenant screening assistant for Ontario, Canada landlords. Analyze this rental application and provide a risk score and summary.

LISTING: ${app.listing?.address} ${app.listing?.unit || ''}, ${app.listing?.city} — $${monthlyRent}/month

APPLICANT: ${app.first_name} ${app.last_name}
Employment: ${app.employment_status} at ${app.employer_name} as ${app.job_title} since ${app.employment_start_date || 'unknown'}
Monthly Income: $${app.monthly_income} (ratio to rent: ${incomeRatio.toFixed(2)}x)
Previous Landlord: ${app.prev_landlord_name || 'N/A'} | Previous Rent: $${app.prev_rent || 'N/A'} | Duration: ${app.prev_move_in || '?'} to ${app.prev_move_out || '?'}
Reason for leaving: ${app.reason_for_leaving || 'N/A'}
LTB Records Found: ${app.ltb_records_found}
Occupants: ${app.num_occupants} | Pets: ${app.has_pets} | Smoker: ${app.is_smoker}

Score each category 0-100 and provide an overall score. Ontario Human Rights Code applies — do NOT factor in age, race, religion, disability, or other protected grounds.

Respond in this exact JSON format:
{
  "overall_score": <0-100>,
  "income_score": <0-100>,
  "employment_score": <0-100>,
  "rental_history_score": <0-100>,
  "ltb_score": <0-100>,
  "reference_score": <0-100>,
  "summary": "<2-3 sentence professional summary with key risk factors and recommendation>"
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const aiData = await response.json()
  const text = aiData.content?.[0]?.text || '{}'

  let scores
  try {
    scores = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'AI parse error' }, { status: 500 })
  }

  await supabase.from('applications').update({
    ai_score: scores.overall_score,
    ai_summary: scores.summary,
    ai_income_score: scores.income_score,
    ai_employment_score: scores.employment_score,
    ai_rental_history_score: scores.rental_history_score,
    ai_ltb_score: scores.ltb_score,
    ai_reference_score: scores.reference_score,
    status: 'reviewing',
  }).eq('id', application_id)

  return NextResponse.json({ success: true, scores })
}

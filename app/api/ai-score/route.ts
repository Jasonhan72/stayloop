import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

interface AppFile {
  kind: string
  path: string
  name: string
  size: number
  mime: string
}

interface SixDimScores {
  doc_authenticity: number
  payment_ability: number
  court_records: number
  stability: number
  behavior_signals: number
  info_consistency: number
}

const WEIGHTS: Record<keyof SixDimScores, number> = {
  doc_authenticity: 0.20,
  payment_ability: 0.20,
  court_records: 0.20,
  stability: 0.15,
  behavior_signals: 0.13,
  info_consistency: 0.12,
}

export async function POST(req: NextRequest) {
  const { application_id } = await req.json()

  const authHeader = req.headers.get('authorization') || ''
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: app, error } = await supabase
    .from('applications')
    .select('*, listing:listings(*)')
    .eq('id', application_id)
    .single()

  if (error || !app) {
    return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
  }

  const monthlyRent = app.listing?.monthly_rent || 0
  const incomeRatio = app.monthly_income ? app.monthly_income / monthlyRent : 0
  const files: AppFile[] = Array.isArray(app.files) ? app.files : []

  // Build multimodal content blocks. For each uploaded file, create a signed URL
  // and pass it to Claude as image (PNG/JPG/WEBP) or document (PDF).
  const contentBlocks: any[] = []

  for (const f of files) {
    const { data: signed, error: signErr } = await supabase
      .storage.from('tenant-files').createSignedUrl(f.path, 600)
    if (signErr || !signed?.signedUrl) continue
    if (f.mime === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'url', url: signed.signedUrl },
        title: `${f.kind}: ${f.name}`,
      })
    } else if (f.mime.startsWith('image/')) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'url', url: signed.signedUrl },
      })
      contentBlocks.push({
        type: 'text',
        text: `(file above is: ${f.kind} — ${f.name})`,
      })
    }
  }

  const formText = `LISTING: ${app.listing?.address ?? ''} ${app.listing?.unit ?? ''}, ${app.listing?.city ?? ''} — $${monthlyRent}/month

APPLICANT (self-reported): ${app.first_name} ${app.last_name}
Email: ${app.email}  Phone: ${app.phone || 'N/A'}
DOB: ${app.date_of_birth || 'N/A'}
Current address: ${app.current_address || 'N/A'}

Employment: ${app.employment_status || 'N/A'} at ${app.employer_name || 'N/A'} as ${app.job_title || 'N/A'}
Start date: ${app.employment_start_date || 'N/A'}
Self-reported gross monthly income: $${app.monthly_income || 0} (income/rent ratio: ${incomeRatio.toFixed(2)}x)
Employer phone: ${app.employer_phone || 'N/A'}

Previous landlord: ${app.prev_landlord_name || 'N/A'} (${app.prev_landlord_phone || 'N/A'})
Previous address: ${app.prev_address || 'N/A'}
Previous rent: $${app.prev_rent || 'N/A'}/mo
Previous tenancy: ${app.prev_move_in || '?'} → ${app.prev_move_out || '?'}
Reason for leaving: ${app.reason_for_leaving || 'N/A'}

Occupants: ${app.num_occupants}  Pets: ${app.has_pets}  Smoker: ${app.is_smoker}
LTB records currently on file: ${app.ltb_records_found ?? 0}
Uploaded documents: ${files.length === 0 ? 'NONE' : files.map(f => `${f.kind}(${f.name})`).join(', ')}`

  const systemPrompt = `You are Stayloop, an AI tenant-screening analyst for Ontario, Canada landlords.
You MUST follow the Ontario Human Rights Code: do NOT factor in age, race, ethnicity, religion, disability, family status, sexual orientation, marital status, or other protected grounds. Score only based on financial capacity, employment stability, document evidence, behavior signals, and information consistency.
You will read uploaded documents (IDs, paystubs, bank statements, employment letters) using vision/OCR and cross-check them against the applicant's self-reported information.
Output strictly the JSON schema requested — no markdown, no prose, no preamble.`

  const userInstruction = `Score this rental application across SIX dimensions (each 0-100). Then write a 2-3 sentence professional summary highlighting key risks, strengths, and a recommendation.

SIX DIMENSIONS:
1. doc_authenticity (weight 20%) — Are the uploaded documents real, complete, unaltered? If no documents are uploaded, score 30. Look for tampering, mismatched fonts, inconsistent dates.
2. payment_ability (weight 20%) — Income / rent ratio (target: 3x rent or higher), bank balance, deposit history. Cross-check paystubs and bank statements against self-reported income.
3. court_records (weight 20%) — LTB / Ontario court records on file. Use the "LTB records currently on file" number provided. 0 records = high score; 1+ = significant deduction.
4. stability (weight 15%) — Employment tenure, rental history length, address stability.
5. behavior_signals (weight 13%) — Reason for leaving, completeness of application, presence of red flags in documents.
6. info_consistency (weight 12%) — Does the name on the ID match the application? Does the employer on the paystub match the self-reported employer? Does the income on paystubs/bank statements match self-reported income?

Also extract the applicant's full legal name from their ID document if uploaded (else use self-reported). Provide brief notes per dimension explaining your reasoning.

RESPOND WITH ONLY THIS JSON (no markdown, no fences):
{
  "extracted_name": "<full legal name from ID, or self-reported>",
  "scores": {
    "doc_authenticity": <0-100>,
    "payment_ability": <0-100>,
    "court_records": <0-100>,
    "stability": <0-100>,
    "behavior_signals": <0-100>,
    "info_consistency": <0-100>
  },
  "notes": {
    "doc_authenticity": "<one sentence>",
    "payment_ability": "<one sentence>",
    "court_records": "<one sentence>",
    "stability": "<one sentence>",
    "behavior_signals": "<one sentence>",
    "info_consistency": "<one sentence>"
  },
  "summary": "<2-3 sentence professional recommendation>"
}`

  // Final user content: text instruction + form text + uploaded file blocks
  const userContent: any[] = [
    { type: 'text', text: userInstruction },
    { type: 'text', text: '\n--- APPLICATION FORM ---\n' + formText },
  ]
  if (contentBlocks.length > 0) {
    userContent.push({ type: 'text', text: '\n--- UPLOADED DOCUMENTS ---\n' })
    userContent.push(...contentBlocks)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    return NextResponse.json({ error: `Anthropic API error: ${errText}` }, { status: 500 })
  }

  const aiData = await response.json() as { content?: Array<{ text: string }> }
  let text = aiData.content?.[0]?.text || '{}'
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: { extracted_name?: string; scores?: SixDimScores; notes?: Record<string, string>; summary?: string }
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'AI parse error', raw: text }, { status: 500 })
  }

  const s = parsed.scores
  if (!s) return NextResponse.json({ error: 'Missing scores', raw: text }, { status: 500 })

  const overall = Math.round(
    s.doc_authenticity * WEIGHTS.doc_authenticity +
    s.payment_ability * WEIGHTS.payment_ability +
    s.court_records * WEIGHTS.court_records +
    s.stability * WEIGHTS.stability +
    s.behavior_signals * WEIGHTS.behavior_signals +
    s.info_consistency * WEIGHTS.info_consistency
  )

  const { error: updateError } = await supabase.from('applications').update({
    ai_score: overall,
    ai_summary: parsed.summary,
    ai_extracted_name: parsed.extracted_name,
    ai_dimension_notes: parsed.notes || null,
    doc_authenticity_score: s.doc_authenticity,
    payment_ability_score: s.payment_ability,
    court_records_score: s.court_records,
    stability_score: s.stability,
    behavior_signals_score: s.behavior_signals,
    info_consistency_score: s.info_consistency,
    status: 'reviewing',
  }).eq('id', application_id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    overall,
    scores: s,
    notes: parsed.notes,
    extracted_name: parsed.extracted_name,
    summary: parsed.summary,
  })
}

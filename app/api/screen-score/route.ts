import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

interface ScreenFile {
  path: string
  name: string
  size: number
  mime: string
  kind?: string
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
  const { screening_id } = await req.json()
  if (!screening_id) {
    return NextResponse.json({ error: 'screening_id required' }, { status: 400 })
  }

  const authHeader = req.headers.get('authorization') || ''
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: screening, error } = await supabase
    .from('screenings')
    .select('*')
    .eq('id', screening_id)
    .single()

  if (error || !screening) {
    return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
  }

  const monthlyRent = Number(screening.monthly_rent) || 0
  const monthlyIncome = Number(screening.monthly_income) || 0
  const incomeRatio = monthlyRent > 0 ? monthlyIncome / monthlyRent : 0
  const files: ScreenFile[] = Array.isArray(screening.files) ? screening.files : []

  // Build multimodal content blocks: signed URLs to uploaded docs.
  const contentBlocks: any[] = []
  for (const f of files) {
    const { data: signed } = await supabase
      .storage.from('tenant-files').createSignedUrl(f.path, 600)
    if (!signed?.signedUrl) continue
    if (f.mime === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'url', url: signed.signedUrl },
        title: `${f.kind || 'doc'}: ${f.name}`,
      })
    } else if (f.mime?.startsWith('image/')) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'url', url: signed.signedUrl },
      })
      contentBlocks.push({
        type: 'text',
        text: `(file above is: ${f.kind || 'doc'} — ${f.name})`,
      })
    }
  }

  const formText = `LANDLORD-PROVIDED CONTEXT:
Tenant name (self-reported): ${screening.tenant_name || 'N/A'}
Monthly rent for unit: $${monthlyRent || 'N/A'}
Tenant gross monthly income (self-reported): $${monthlyIncome || 'N/A'} (income/rent ratio: ${incomeRatio ? incomeRatio.toFixed(2) + 'x' : 'N/A'})
Landlord notes: ${screening.notes || 'N/A'}

Uploaded documents: ${files.length === 0 ? 'NONE' : files.map(f => `${f.kind || 'doc'}(${f.name})`).join(', ')}

${screening.pasted_text ? `--- PASTED TEXT FROM LANDLORD (e.g. credit report, prior conversation, email) ---\n${screening.pasted_text}\n` : ''}`

  const systemPrompt = `You are Stayloop, an AI tenant-screening analyst for Ontario, Canada landlords.
You MUST follow the Ontario Human Rights Code: do NOT factor in age, race, ethnicity, religion, disability, family status, sexual orientation, marital status, or other protected grounds. Score only based on financial capacity, employment stability, document evidence, behavior signals, and information consistency.
You are reviewing materials a landlord uploaded directly (NOT a tenant-completed form). Some fields will be missing or thin — score conservatively against the evidence you actually have, and call out gaps in the notes.
Output strictly the JSON schema requested — no markdown, no prose, no preamble.`

  const userInstruction = `Score this rental candidate across SIX dimensions (each 0-100). Then write a 2-3 sentence professional summary highlighting key risks, strengths, and a recommendation.

SIX DIMENSIONS:
1. doc_authenticity (weight 20%) — Are uploaded documents real, complete, unaltered? If no documents are uploaded, score 30. Look for tampering, mismatched fonts, inconsistent dates.
2. payment_ability (weight 20%) — Income / rent ratio (target: 3x rent or higher), bank balance, deposit history. Cross-check paystubs and bank statements against any self-reported income.
3. court_records (weight 20%) — Any LTB / Ontario court records visible in the documents or pasted text. None known = neutral-high; any flag = significant deduction. If you have no information, score 60 and say so in notes.
4. stability (weight 15%) — Employment tenure, rental history length, address stability — based only on what's visible.
5. behavior_signals (weight 13%) — Red flags in the documents, completeness of materials, anything unusual in the pasted text.
6. info_consistency (weight 12%) — Do the names, employers, and income figures match across documents and the landlord's stated info?

Also extract the candidate's full legal name from any ID document if uploaded (else use the landlord-provided name). Provide brief notes per dimension explaining your reasoning, including which evidence was missing.

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

  const userContent: any[] = [
    { type: 'text', text: userInstruction },
    { type: 'text', text: '\n--- SCREENING CONTEXT ---\n' + formText },
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
    await supabase.from('screenings').update({ status: 'error', error: errText.slice(0, 500) }).eq('id', screening_id)
    return NextResponse.json({ error: `Anthropic API error: ${errText}` }, { status: 500 })
  }

  const aiData = await response.json() as { content?: Array<{ text: string }> }
  let text = aiData.content?.[0]?.text || '{}'
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: { extracted_name?: string; scores?: SixDimScores; notes?: Record<string, string>; summary?: string }
  try {
    parsed = JSON.parse(text)
  } catch {
    await supabase.from('screenings').update({ status: 'error', error: 'AI parse error' }).eq('id', screening_id)
    return NextResponse.json({ error: 'AI parse error', raw: text }, { status: 500 })
  }

  const s = parsed.scores
  if (!s) {
    await supabase.from('screenings').update({ status: 'error', error: 'Missing scores' }).eq('id', screening_id)
    return NextResponse.json({ error: 'Missing scores', raw: text }, { status: 500 })
  }

  const overall = Math.round(
    s.doc_authenticity * WEIGHTS.doc_authenticity +
    s.payment_ability * WEIGHTS.payment_ability +
    s.court_records * WEIGHTS.court_records +
    s.stability * WEIGHTS.stability +
    s.behavior_signals * WEIGHTS.behavior_signals +
    s.info_consistency * WEIGHTS.info_consistency
  )

  const { error: updateError } = await supabase.from('screenings').update({
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
    status: 'scored',
    scored_at: new Date().toISOString(),
  }).eq('id', screening_id)

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

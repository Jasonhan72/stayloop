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

interface CourtQuery {
  source: string
  tier: 'free' | 'pro'
  status: 'ok' | 'unavailable' | 'skipped' | 'coming_soon'
  hits: number | null
  url?: string
  note?: string
}

const WEIGHTS: Record<keyof SixDimScores, number> = {
  doc_authenticity: 0.20,
  payment_ability: 0.20,
  court_records: 0.20,
  stability: 0.15,
  behavior_signals: 0.13,
  info_consistency: 0.12,
}

// Best-effort CanLII search. Public site, fragile to layout changes.
// Returns a CourtQuery with status and hit count. Never throws.
async function searchCanLII(name: string, jurisdictionId: string, label: string): Promise<CourtQuery> {
  if (!name?.trim() || name.trim().length < 3) {
    return { source: label, tier: 'free', status: 'skipped', hits: null, note: 'No name to search' }
  }
  const q = encodeURIComponent(`"${name.trim()}"`)
  const url = `https://www.canlii.org/en/search/searchResults.do?text=${q}&jId=${jurisdictionId}&type=decision`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StayloopBot/0.1; +https://www.stayloop.ai/about)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    clearTimeout(t)
    if (!res.ok) {
      return { source: label, tier: 'free', status: 'unavailable', hits: null, note: `HTTP ${res.status}` }
    }
    const html = await res.text()
    if (/no results/i.test(html) || /aucun résultat/i.test(html)) {
      return { source: label, tier: 'free', status: 'ok', hits: 0, url }
    }
    // Try several patterns CanLII uses to display result counts
    let hits = 0
    const m1 = html.match(/of\s+([0-9,]+)\s+results?/i)
    const m2 = html.match(/([0-9,]+)\s+results?\s+for/i)
    const m3 = html.match(/data-total=["']([0-9]+)["']/i)
    if (m1) hits = parseInt(m1[1].replace(/,/g, ''), 10)
    else if (m2) hits = parseInt(m2[1].replace(/,/g, ''), 10)
    else if (m3) hits = parseInt(m3[1], 10)
    return { source: label, tier: 'free', status: 'ok', hits, url }
  } catch (e: any) {
    return { source: label, tier: 'free', status: 'unavailable', hits: null, note: e?.message?.slice(0, 80) || 'fetch failed' }
  }
}

async function runCourtRecordCheck(name: string, plan: string): Promise<{ queries: CourtQuery[]; total_hits: number; queried_name: string }> {
  const queries: CourtQuery[] = []
  // Free tier sources — both run for everyone
  const ltb = await searchCanLII(name, 'onltb', 'CanLII — LTB rulings')
  queries.push(ltb)
  const sc = await searchCanLII(name, 'onscsm', 'CanLII — Small Claims Court')
  queries.push(sc)
  // Pro tier sources — shown as coming soon (no public API)
  const isPro = plan === 'pro' || plan === 'enterprise'
  queries.push({
    source: 'Ontario Courts Portal',
    tier: 'pro',
    status: 'coming_soon',
    hits: null,
    note: isPro ? 'Integration in progress' : 'Pro feature — coming soon',
  })
  queries.push({
    source: 'Stayloop Verified Network',
    tier: 'pro',
    status: 'coming_soon',
    hits: null,
    note: isPro ? 'Integration in progress' : 'Pro feature — coming soon',
  })
  const total_hits = queries.reduce((a, q) => a + (q.hits ?? 0), 0)
  return { queries, total_hits, queried_name: name || '' }
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
    .select('*, landlord:landlords(plan)')
    .eq('id', screening_id)
    .single()

  if (error || !screening) {
    return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
  }

  const plan: string = screening.landlord?.plan || 'free'
  const monthlyRent = Number(screening.monthly_rent) || 0
  const monthlyIncome = Number(screening.monthly_income) || 0
  const incomeRatio = monthlyRent > 0 ? monthlyIncome / monthlyRent : 0
  const files: ScreenFile[] = Array.isArray(screening.files) ? screening.files : []

  // ---- Stage 1: Build multimodal blocks (signed URLs to docs) ----
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
      contentBlocks.push({ type: 'image', source: { type: 'url', url: signed.signedUrl } })
      contentBlocks.push({ type: 'text', text: `(file above is: ${f.kind || 'doc'} — ${f.name})` })
    }
  }

  // ---- Stage 2: Extract candidate name (use input if present, otherwise let Claude extract) ----
  // We do this in the same Claude call below — Claude returns extracted_name in JSON.
  // But for the court records lookup we want to query with whatever name we have.
  // If the landlord provided one, use it for both lookup and prompt context.
  // If not, we run a quick pre-call to get the name, then court records, then full scoring.
  let nameForLookup = (screening.tenant_name || '').trim()
  let prelimExtractedName: string | undefined

  if (!nameForLookup && contentBlocks.length > 0) {
    // Cheap extraction call: ask Claude for the name only.
    const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        system: 'You extract the candidate full legal name from rental application documents. Output JSON only: {"name": "..."} or {"name": null} if you cannot find one.',
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Find the candidate full legal name in these uploaded documents (look at IDs, paystubs, employment letters first). Return ONLY {"name": "..."} JSON.' },
          ...contentBlocks,
        ]}],
      }),
    })
    if (extractRes.ok) {
      const ej = await extractRes.json() as any
      let et = ej.content?.[0]?.text || '{}'
      et = et.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      try {
        const parsed = JSON.parse(et)
        if (parsed?.name && typeof parsed.name === 'string') {
          prelimExtractedName = parsed.name.trim()
          nameForLookup = prelimExtractedName
        }
      } catch {}
    }
  }

  // ---- Stage 3: Court records lookup ----
  const courtDetail = await runCourtRecordCheck(nameForLookup, plan)

  // Persist court detail + extracted name early so the UI can poll if needed
  await supabase.from('screenings').update({
    court_records_detail: courtDetail,
    ai_extracted_name: prelimExtractedName || null,
    tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
    status: 'scoring',
  }).eq('id', screening_id)

  // ---- Stage 4: Run six-dimension scoring with court findings injected ----
  const courtFindingsText = courtDetail.queries.map(q => {
    if (q.status === 'ok') return `- ${q.source}: ${q.hits} match${q.hits === 1 ? '' : 'es'}`
    if (q.status === 'coming_soon') return `- ${q.source}: not yet integrated`
    if (q.status === 'unavailable') return `- ${q.source}: query failed (${q.note})`
    return `- ${q.source}: skipped (${q.note || 'no name'})`
  }).join('\n')

  const formText = `LANDLORD-PROVIDED CONTEXT:
Tenant name (input or extracted): ${nameForLookup || screening.tenant_name || 'N/A'}
Monthly rent for unit: $${monthlyRent || 'N/A'}
Tenant gross monthly income (self-reported): $${monthlyIncome || 'N/A'} (income/rent ratio: ${incomeRatio ? incomeRatio.toFixed(2) + 'x' : 'N/A'})
Landlord notes: ${screening.notes || 'N/A'}

Uploaded documents: ${files.length === 0 ? 'NONE' : files.map(f => `${f.kind || 'doc'}(${f.name})`).join(', ')}

PUBLIC COURT-RECORD LOOKUP RESULTS for "${nameForLookup || 'unknown'}":
${courtFindingsText}
Total hits across queried sources: ${courtDetail.total_hits}

${screening.pasted_text ? `--- PASTED TEXT FROM LANDLORD ---\n${screening.pasted_text}\n` : ''}`

  const systemPrompt = `You are Stayloop, an AI tenant-screening analyst for Ontario, Canada landlords.
You MUST follow the Ontario Human Rights Code: do NOT factor in age, race, ethnicity, religion, disability, family status, sexual orientation, marital status, or other protected grounds. Score only based on financial capacity, employment stability, document evidence, behavior signals, and information consistency.
You are reviewing materials a landlord uploaded directly. Some fields will be missing or thin — score conservatively against the evidence you actually have, and call out gaps in the notes.
Higher scores mean LOWER risk (FICO-style). 100 = ideal candidate, 0 = unrentable.
Output strictly the JSON schema requested — no markdown, no prose, no preamble.`

  const userInstruction = `Score this rental candidate across SIX dimensions (each 0-100, higher = safer). Then write a 2-3 sentence professional summary highlighting key risks, strengths, and a recommendation.

SIX DIMENSIONS:
1. doc_authenticity (weight 20%) — Are uploaded documents real, complete, unaltered? If no documents uploaded, score 30. Look for tampering, mismatched fonts, inconsistent dates.
2. payment_ability (weight 20%) — Income / rent ratio (target: 3x rent or higher), bank balance, deposit history. Cross-check paystubs and bank statements against any self-reported income.
3. court_records (weight 20%) — Use the public court-record lookup results provided. ZERO matches across all queried sources = score 90. Each LTB hit = significant deduction (down to 20). Each Small Claims hit = moderate deduction. If no name was queryable, score 60 and call out the gap.
4. stability (weight 15%) — Employment tenure, rental history length, address stability — based only on what's visible.
5. behavior_signals (weight 13%) — Red flags in the documents, completeness of materials, anything unusual in the pasted text.
6. info_consistency (weight 12%) — Do names, employers, and income figures match across documents and the landlord's stated info?

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

  const finalExtractedName = parsed.extracted_name || prelimExtractedName || null

  const { error: updateError } = await supabase.from('screenings').update({
    ai_score: overall,
    ai_summary: parsed.summary,
    ai_extracted_name: finalExtractedName,
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
    extracted_name: finalExtractedName,
    name_was_extracted: !screening.tenant_name && !!finalExtractedName,
    summary: parsed.summary,
    court_records_detail: courtDetail,
    tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
  })
}

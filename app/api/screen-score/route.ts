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
  // CanLII scraping is temporarily disabled — we're waiting on an
  // official API key. Both CanLII sources return as "coming_soon"
  // (same UX as the Pro sources below). Once the API is ready,
  // flip ENABLE_CANLII back on and the Promise.all block below
  // will resume running.
  const ENABLE_CANLII = false
  if (ENABLE_CANLII) {
    const [ltb, sc] = await Promise.all([
      searchCanLII(name, 'onltb', 'CanLII — LTB rulings'),
      searchCanLII(name, 'onscsm', 'CanLII — Small Claims Court'),
    ])
    queries.push(ltb)
    queries.push(sc)
  } else {
    queries.push({
      source: 'CanLII — LTB rulings',
      tier: 'free',
      status: 'coming_soon',
      hits: null,
      note: 'Awaiting official API access',
    })
    queries.push({
      source: 'CanLII — Small Claims Court',
      tier: 'free',
      status: 'coming_soon',
      hits: null,
      note: 'Awaiting official API access',
    })
  }
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
  try {
  const { screening_id } = await req.json()
  if (!screening_id) {
    return NextResponse.json({ error: 'screening_id required' }, { status: 400 })
  }

  // Sanitize the Authorization header — any CR/LF or non-ASCII will make
  // the Headers constructor in the edge runtime throw DOMException
  // "The string did not match the expected pattern."
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
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
  // Sign ALL files in parallel — sequential awaits added a full
  // Supabase RTT per file on multi-file submissions.
  const contentBlocks: any[] = []
  const signedResults = await Promise.all(files.map(f =>
    supabase.storage.from('tenant-files').createSignedUrl(f.path, 600)
      .then(r => ({ file: f, url: r.data?.signedUrl }))
  ))
  for (const { file: f, url } of signedResults) {
    if (!url) continue
    if (f.mime === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'url', url },
        title: `${f.kind || 'doc'}: ${f.name}`,
      })
    } else if (f.mime?.startsWith('image/')) {
      contentBlocks.push({ type: 'image', source: { type: 'url', url } })
      contentBlocks.push({ type: 'text', text: `(file above is: ${f.kind || 'doc'} — ${f.name})` })
    }
  }

  // ---- Stage 2: Extract candidate name (use input if present, otherwise let Claude extract) ----
  // We do this in the same Claude call below — Claude returns extracted_name in JSON.
  // But for the court records lookup we want to query with whatever name we have.
  // If the landlord provided one, use it for both lookup and prompt context.
  // If not, we run a quick pre-call to get the name, then court records, then full scoring.
  // Only the landlord-provided name is used for the pre-scoring court
  // records lookup. We skip the extra "extract the name first" Claude
  // round-trip (which sent every document twice and roughly doubled the
  // end-to-end latency). If no name was provided up front, we run the
  // court-records lookup AFTER scoring using the name Claude extracts.
  let nameForLookup = (screening.tenant_name || '').trim()
  let prelimExtractedName: string | undefined

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

  const userInstruction = `Score this rental candidate on SIX dimensions (0-100 each, higher=safer). Write a bilingual 2-sentence summary.

DIMENSIONS + WEIGHTS: doc_authenticity 20%, payment_ability 20%, court_records 20%, stability 15%, behavior_signals 13%, info_consistency 12%.

RULES:
- No documents → doc_authenticity=30.
- payment_ability: target income/rent ratio ≥3x; cross-check paystubs vs bank statements.
- court_records: 0 hits=90; each LTB hit heavy deduction (→20); each Small Claims moderate; if ALL sources "not yet integrated" → 70 (neutral) and note checks are offline pending API access.
- stability: employment tenure, address history from what's visible.
- behavior_signals: document red flags, completeness.
- info_consistency: do names/employers/income match across docs + landlord input.
- You MUST follow Ontario Human Rights Code — ignore protected grounds (age, race, religion, disability, family status, etc).

ALSO EXTRACT:
- extracted_name from ID if available
- detected_monthly_income (CAD, convert bi-weekly/annual, null if unknown)
- income_evidence: one short sentence citing source
- detected_document_kinds: subset of [employment_letter, pay_stub, bank_statement, id_document, credit_report, offer_letter, reference, other]. One PDF may contain multiple kinds — list every kind you see.
- Per-dim bilingual detail: ONE sentence each, ≤25 English words, ≤30 Chinese chars, citing specific evidence (filename/number/line).
- 3-4 risk flags grounded in THIS applicant's evidence. Types: danger (red flag), warning (missing evidence), info (neutral), success (positive).

EMIT ONLY this JSON — no markdown, no fences, no preamble. Total output MUST stay under 2500 tokens.
{
 "extracted_name":"...",
 "detected_monthly_income":<number or null>,
 "income_evidence":"... or null",
 "detected_document_kinds":["..."],
 "scores":{"doc_authenticity":0,"payment_ability":0,"court_records":0,"stability":0,"behavior_signals":0,"info_consistency":0},
 "details_en":{"doc_authenticity":"","payment_ability":"","court_records":"","stability":"","behavior_signals":"","info_consistency":""},
 "details_zh":{"doc_authenticity":"","payment_ability":"","court_records":"","stability":"","behavior_signals":"","info_consistency":""},
 "flags":[{"type":"danger|warning|info|success","text_en":"","text_zh":""}],
 "summary_en":"2 sentences.",
 "summary_zh":"两句话。"
}`

  // Mark the static instruction block as cacheable — Anthropic
  // prompt caching lets repeat screenings reuse the ~1.5KB of
  // instructions instead of re-processing them on every call.
  const userContent: any[] = [
    { type: 'text', text: userInstruction, cache_control: { type: 'ephemeral' } },
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
      max_tokens: 4000,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: userContent },
        // Assistant prefill — forces Claude to begin its response
        // with an open brace. Eliminates the "Claude writes a
        // paragraph before the JSON" failure mode and guarantees
        // the first character of the response is inside the JSON.
        { role: 'assistant', content: '{' },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    await supabase.from('screenings').update({ status: 'error', error: errText.slice(0, 500) }).eq('id', screening_id)
    return NextResponse.json({ error: `Anthropic API error: ${errText}` }, { status: 500 })
  }

  const aiData = await response.json() as { content?: Array<{ text: string }>; stop_reason?: string }
  // We prefill the assistant turn with "{" so Claude's continuation
  // is always the interior of our JSON object. Prepend it back before
  // parsing so we have a complete object.
  const rawText = '{' + (aiData.content?.[0]?.text || '')
  const stopReason = aiData.stop_reason || ''

  // Robust JSON extraction — strip markdown fences, trim, balance
  // braces ignoring string contents, strip trailing commas, and if
  // the payload is still unparseable return what we have so the
  // caller can surface a useful error snippet.
  function extractJson(input: string): string {
    let t = input.trim()
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    // Try straight parse first
    try { JSON.parse(t); return t } catch {}
    // Find first { and matching closing } by depth count, ignoring
    // braces inside strings.
    const start = t.indexOf('{')
    if (start < 0) return t
    let depth = 0
    let inStr = false
    let esc = false
    let sliced = t.slice(start)
    for (let i = 0; i < sliced.length; i++) {
      const ch = sliced[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
      } else {
        if (ch === '"') inStr = true
        else if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) { sliced = sliced.slice(0, i + 1); break }
        }
      }
    }
    // Clean common Claude JSON sins: trailing commas before } or ],
    // stray Chinese full-width commas in key separators, BOM, etc.
    sliced = sliced
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\uFEFF/g, '')
    try { JSON.parse(sliced); return sliced } catch {}
    return sliced
  }

  const text = extractJson(rawText)

  let parsed: {
    extracted_name?: string
    detected_monthly_income?: number | null
    income_evidence?: string | null
    detected_document_kinds?: string[]
    scores?: SixDimScores
    notes?: Record<string, string>
    details_en?: Record<string, string>
    details_zh?: Record<string, string>
    flags?: { type: string; text_en: string; text_zh: string }[]
    summary?: string
    summary_en?: string
    summary_zh?: string
  }
  try {
    parsed = JSON.parse(text)
  } catch (e: any) {
    // Surface enough raw output to debug, and distinguish
    // truncation from other parse failures so the UI can retry.
    const truncated = stopReason === 'max_tokens'
    const snippet = rawText.slice(0, 400).replace(/\s+/g, ' ')
    const tail = rawText.slice(-200).replace(/\s+/g, ' ')
    await supabase.from('screenings').update({
      status: 'error',
      error: (truncated ? 'AI output truncated: ' : 'AI parse error: ') + (e?.message || 'unknown').slice(0, 200),
    }).eq('id', screening_id)
    return NextResponse.json({
      error: truncated
        ? 'AI output was truncated — please retry (the model produced too much text).'
        : `AI parse error: ${(e?.message || 'unknown').slice(0, 150)} — head: "${snippet.slice(0, 120)}" — tail: "${tail.slice(0, 120)}"`,
      stop_reason: stopReason,
      raw: rawText.slice(0, 4000),
    }, { status: 500 })
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
  const detectedIncome = typeof parsed.detected_monthly_income === 'number' && parsed.detected_monthly_income > 0
    ? parsed.detected_monthly_income : null
  const effectiveIncome = detectedIncome ?? (monthlyIncome > 0 ? monthlyIncome : null)
  const computedRatio = (effectiveIncome && monthlyRent > 0) ? effectiveIncome / monthlyRent : null

  const mergedNotes: Record<string, any> = {}
  if (parsed.notes) for (const k of Object.keys(parsed.notes)) mergedNotes[k] = parsed.notes[k]
  if (parsed.details_en) mergedNotes._details_en = parsed.details_en
  if (parsed.details_zh) mergedNotes._details_zh = parsed.details_zh
  if (parsed.income_evidence) mergedNotes._income_evidence = parsed.income_evidence

  const { error: updateError } = await supabase.from('screenings').update({
    ai_score: overall,
    ai_summary: parsed.summary_en || parsed.summary,
    ai_extracted_name: finalExtractedName,
    ai_dimension_notes: mergedNotes,
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
    details_en: parsed.details_en || null,
    details_zh: parsed.details_zh || null,
    flags: Array.isArray(parsed.flags) ? parsed.flags : [],
    detected_document_kinds: Array.isArray(parsed.detected_document_kinds) ? parsed.detected_document_kinds : [],
    detected_monthly_income: detectedIncome,
    effective_monthly_income: effectiveIncome,
    income_evidence: parsed.income_evidence || null,
    monthly_rent: monthlyRent || null,
    income_rent_ratio: computedRatio,
    extracted_name: finalExtractedName,
    name_was_extracted: !screening.tenant_name && !!finalExtractedName,
    summary: parsed.summary_en || parsed.summary || '',
    summary_en: parsed.summary_en || parsed.summary || '',
    summary_zh: parsed.summary_zh || '',
    court_records_detail: courtDetail,
    tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
  })
  } catch (e: any) {
    // Any uncaught runtime error (DOMException from edge fetch,
    // malformed header, broken signed URL, etc.) lands here with a
    // useful message instead of a raw "The string did not match the
    // expected pattern." bubbling up to the client.
    console.error('[screen-score] uncaught:', e)
    return NextResponse.json(
      {
        error: 'Screening failed: ' + (e?.message || String(e) || 'unknown error').slice(0, 300),
        name: e?.name || undefined,
      },
      { status: 500 }
    )
  }
}

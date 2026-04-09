import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

// -----------------------------------------------------------------------------
// Stayloop Risk Model v3 (2026)
// Design doc: /sessions/epic-eager-volta/mnt/stayloop/Stayloop_Risk_Model_v3.md
//
// 5-dimension weighted model with hard gates, red-flag penalties, evidence
// coverage, compliance_audit, and action_items for hard-to-measure (L3)
// sub-components. Backwards-compatible with the existing 6-column DB schema:
// the legacy columns still get populated via a deterministic mapping so the
// dashboards and old screenings keep rendering; the full v3 payload is
// persisted into ai_dimension_notes._v3.
// -----------------------------------------------------------------------------

interface ScreenFile {
  path: string
  name: string
  size: number
  mime: string
  kind?: string
}

// 5-dimension v3 structure
interface V3Scores {
  ability_to_pay: number       // 40%
  credit_health: number        // 25%
  rental_history: number       // 20%
  verification: number         // 10%
  communication: number        //  5%
}

const V3_WEIGHTS: Record<keyof V3Scores, number> = {
  ability_to_pay: 0.40,
  credit_health: 0.25,
  rental_history: 0.20,
  verification: 0.10,
  communication: 0.05,
}

interface CourtQuery {
  source: string
  tier: 'free' | 'pro'
  status: 'ok' | 'unavailable' | 'skipped' | 'coming_soon'
  hits: number | null
  url?: string
  note?: string
}

async function runCourtRecordCheck(name: string, plan: string): Promise<{ queries: CourtQuery[]; total_hits: number; queried_name: string }> {
  // CanLII scraping is temporarily disabled — we're waiting on an official
  // API key. All sources return "coming_soon" so the UI shows a consistent
  // "integration pending" message.
  const queries: CourtQuery[] = [
    { source: 'CanLII — LTB rulings', tier: 'free', status: 'coming_soon', hits: null, note: 'Awaiting official API access' },
    { source: 'CanLII — Small Claims Court', tier: 'free', status: 'coming_soon', hits: null, note: 'Awaiting official API access' },
  ]
  const isPro = plan === 'pro' || plan === 'enterprise'
  queries.push({ source: 'Ontario Courts Portal', tier: 'pro', status: 'coming_soon', hits: null, note: isPro ? 'Integration in progress' : 'Pro feature — coming soon' })
  queries.push({ source: 'Stayloop Verified Network', tier: 'pro', status: 'coming_soon', hits: null, note: isPro ? 'Integration in progress' : 'Pro feature — coming soon' })
  return { queries, total_hits: 0, queried_name: name || '' }
}

// Map v3's 5 dims → legacy 6 columns, so old dashboards keep working.
// This is deterministic and documented — nothing is invented.
function mapV3ToLegacy(v3: V3Scores, redFlagCount: number, identityMatch: number): {
  doc_authenticity: number
  payment_ability: number
  court_records: number
  stability: number
  behavior_signals: number
  info_consistency: number
} {
  return {
    doc_authenticity: v3.verification,                          // verification covers doc auth + identity
    payment_ability: v3.ability_to_pay,                         // direct mapping
    court_records: v3.rental_history,                           // v3 bundles LTB into rental_history
    stability: Math.round((v3.ability_to_pay + v3.verification) / 2),  // stability derived
    behavior_signals: Math.max(0, 100 - redFlagCount * 15),     // more red flags → lower
    info_consistency: identityMatch,                            // identity cross-match score
  }
}

export async function POST(req: NextRequest) {
  try {
    const { screening_id } = await req.json()
    if (!screening_id) {
      return NextResponse.json({ error: 'screening_id required' }, { status: 400 })
    }

    // Sanitize Authorization header — edge runtime Headers ctor throws
    // "The string did not match the expected pattern." on non-ASCII / CRLF.
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

    // ---- Stage 1: Sign all files in parallel ----
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

    const nameForLookup = (screening.tenant_name || '').trim()

    // ---- Stage 2: Court records lookup (currently all coming_soon) ----
    const courtDetail = await runCourtRecordCheck(nameForLookup, plan)

    await supabase.from('screenings').update({
      court_records_detail: courtDetail,
      tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
      status: 'scoring',
    }).eq('id', screening_id)

    // ---- Stage 3: Build v3 Claude prompt ----
    const formText = `LANDLORD-PROVIDED CONTEXT:
Tenant name: ${nameForLookup || 'unknown'}
Monthly rent: $${monthlyRent || 'N/A'}
Self-reported income: $${monthlyIncome || 'N/A'}/mo${incomeRatio ? ` (ratio ${incomeRatio.toFixed(2)}x)` : ''}
Landlord notes: ${screening.notes || 'N/A'}

Uploaded: ${files.length === 0 ? 'NONE' : files.map(f => `${f.kind || 'doc'}(${f.name})`).join(', ')}

LTB/COURT LOOKUP: automated queries currently offline (awaiting CanLII API). Score LTB sub-component as 70 neutral + note.
${screening.pasted_text ? `\n--- PASTED TEXT ---\n${screening.pasted_text}\n` : ''}`

    const systemPrompt = `You are Stayloop, an AI tenant-screening analyst for Ontario, Canada landlords. Score risk using the Stayloop v3 model.

ONTARIO HUMAN RIGHTS CODE — HARD RULE:
You MUST NOT factor age, race, ethnicity, national origin, religion, disability, family status, marital status, sexual orientation, gender identity, immigration status, or source of income into any score. If you observe any of these in the documents, note them in compliance_audit.protected_grounds_observed but leave compliance_audit.protected_grounds_used_in_scoring empty.

A tenant volunteering to prepay 6–12 months of rent is NOT a red flag in Ontario — it is common for newcomers and those without Canadian credit history. Treat it as a POSITIVE liquidity signal under ability_to_pay.emergency_reserves, NOT a penalty.

EVIDENCE DISCIPLINE — HARD RULE:
If you have no direct evidence for a sub-component, return null for its raw_score and mark its coverage as "action_pending" or "missing". DO NOT fill in 50 or any placeholder based on "typical applicant". The backend decides how to weight missing sub-components.

SOCIAL MEDIA SCOPE — HARD RULE:
You may reference LinkedIn job verification, company website existence, and reverse phone lookup ONLY as action_items for the landlord to perform. NEVER browse or judge Facebook, Instagram, TikTok, Xiaohongshu, personal photos, or lifestyle content.

Higher scores = LOWER risk. 100 = ideal candidate, 0 = unrentable.
Output ONLY the JSON schema — no markdown, no prose, no preamble.`

    const userInstruction = `Score this rental candidate using the Stayloop v3 5-dimension model.

DIMENSIONS + WEIGHTS:
1. ability_to_pay (40%) — income/rent ratio (25%), income stability (10%), emergency reserves (5%)
2. credit_health (25%) — credit score (15%), DTI ratio (10%)
3. rental_history (20%) — prior landlord references (10%), LTB/small claims (10%)
4. verification (10%) — employer verification (5%), document authenticity (5%)
5. communication (5%) — application completeness + disclosure + landlord override

SUB-COMPONENT COVERAGE TAGS (mandatory):
- "measured" — directly read from uploaded docs
- "inferred" — reasonable inference from adjacent evidence
- "action_pending" — cannot be determined from docs, needs landlord action (e.g. call prev landlord, verify LinkedIn)
- "missing" — no evidence and no realistic action item

HARD GATES (if any condition is met, set gate in hard_gates_triggered[]):
- "income_severe" — income/rent < 2.0x → caps overall at 65
- "ltb_eviction" — confirmed LTB eviction in past 3yrs → caps overall at 40
- "doc_tampering" — visible PS/overwrite/font anomalies → caps overall at 55
- "identity_mismatch" — same name, different DOB/addresses/IDs → caps overall at 50
- "employer_fraud" — company doesn't exist OR HR phone matches applicant's phone → caps overall at 45

RED FLAGS — additive penalties (return as array; backend will apply):
- "rush_move_in" (-4), "cross_doc_contradictions" (-8), "hr_phone_is_applicant" (-10),
  "no_linkedin_for_professional_role" (-3), "volunteered_sin" (-2)
- DO NOT penalize volunteer prepayment of 6–12 months rent. That is a POSITIVE signal.

ACTION ITEMS (critical for L3 sub-components):
Generate 1-4 action_items the landlord must perform to close evidence gaps. Each item:
- id: short snake_case
- dimension: one of the 5 dim names
- title_en / title_zh
- details_en / details_zh: specific, cite filenames/phone numbers/names from docs
- impact_on_score: e.g. "+15 if positive, -25 if negative"
- status: "pending"

EXTRACT these fields too:
- extracted_name (from ID if available)
- detected_monthly_income (CAD/month, convert bi-weekly or annual, null if unknown)
- income_evidence (one short sentence citing source)
- detected_document_kinds (subset of [employment_letter, pay_stub, bank_statement, id_document, credit_report, offer_letter, reference, other])
- bank_min_balance (number or null) — if bank statements present, lowest closing balance seen
- identity_match_score (0-100) — cross-doc name/DOB/address consistency; if only 1 doc, return null

PER-DIMENSION DETAILS: one sentence each, ≤25 English words, ≤30 Chinese chars, citing specific evidence.

RISK FLAGS: 2-4 human-readable flags for UI display. Types: danger / warning / info / success.

COMPLIANCE AUDIT: list protected grounds you observed (even if ignored). This creates the audit trail.

EMIT ONLY this JSON — no markdown, no fences, no preamble. Stay under 3000 tokens total.
{
 "extracted_name":"...",
 "detected_monthly_income":<number or null>,
 "income_evidence":"... or null",
 "detected_document_kinds":["..."],
 "bank_min_balance":<number or null>,
 "identity_match_score":<0-100 or null>,
 "scores":{
   "ability_to_pay":<0-100>,
   "credit_health":<0-100>,
   "rental_history":<0-100>,
   "verification":<0-100>,
   "communication":<0-100>
 },
 "sub_coverage":{
   "income_rent_ratio":"measured|inferred|action_pending|missing",
   "income_stability":"...",
   "emergency_reserves":"...",
   "credit_score":"...",
   "dti":"...",
   "prior_landlord_refs":"...",
   "ltb_check":"...",
   "employer_verify":"...",
   "doc_authenticity":"...",
   "identity_match":"..."
 },
 "details_en":{"ability_to_pay":"","credit_health":"","rental_history":"","verification":"","communication":""},
 "details_zh":{"ability_to_pay":"","credit_health":"","rental_history":"","verification":"","communication":""},
 "hard_gates_triggered":["..."],
 "red_flags":["rush_move_in","..."],
 "flags":[{"type":"danger|warning|info|success","text_en":"","text_zh":""}],
 "action_items":[
   {"id":"...","dimension":"rental_history","title_en":"","title_zh":"","details_en":"","details_zh":"","impact_on_score":"","status":"pending"}
 ],
 "compliance_audit":{
   "protected_grounds_observed":["..."],
   "protected_grounds_used_in_scoring":[],
   "hrc_compliant":true,
   "reviewer_note":"..."
 },
 "summary_en":"2 sentences.",
 "summary_zh":"两句话。"
}`

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
        max_tokens: 4500,
        system: [
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: '{' },  // prefill forces JSON start
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      await supabase.from('screenings').update({ status: 'error', error: errText.slice(0, 500) }).eq('id', screening_id)
      return NextResponse.json({ error: `Anthropic API error: ${errText}` }, { status: 500 })
    }

    const aiData = await response.json() as { content?: Array<{ text: string }>; stop_reason?: string }
    const rawText = '{' + (aiData.content?.[0]?.text || '')
    const stopReason = aiData.stop_reason || ''

    function extractJson(input: string): string {
      let t = input.trim()
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      try { JSON.parse(t); return t } catch {}
      const start = t.indexOf('{')
      if (start < 0) return t
      let depth = 0, inStr = false, esc = false
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
          else if (ch === '}') { depth--; if (depth === 0) { sliced = sliced.slice(0, i + 1); break } }
        }
      }
      sliced = sliced.replace(/,(\s*[}\]])/g, '$1').replace(/\uFEFF/g, '')
      try { JSON.parse(sliced); return sliced } catch {}
      return sliced
    }

    const text = extractJson(rawText)

    let parsed: any = {}
    try {
      parsed = JSON.parse(text)
    } catch (e: any) {
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

    const s: V3Scores = parsed.scores || {}
    if (typeof s.ability_to_pay !== 'number') {
      await supabase.from('screenings').update({ status: 'error', error: 'Missing v3 scores' }).eq('id', screening_id)
      return NextResponse.json({ error: 'Missing v3 scores', raw: text }, { status: 500 })
    }

    // ---- Stage 4: Apply hard gates + red flag penalties + coverage ----
    const HARD_GATE_CAPS: Record<string, number> = {
      income_severe: 65,
      ltb_eviction: 40,
      doc_tampering: 55,
      identity_mismatch: 50,
      employer_fraud: 45,
    }
    const RED_FLAG_PENALTIES: Record<string, number> = {
      rush_move_in: 4,
      cross_doc_contradictions: 8,
      hr_phone_is_applicant: 10,
      no_linkedin_for_professional_role: 3,
      volunteered_sin: 2,
    }

    const baseScore =
      s.ability_to_pay * V3_WEIGHTS.ability_to_pay +
      s.credit_health * V3_WEIGHTS.credit_health +
      s.rental_history * V3_WEIGHTS.rental_history +
      s.verification * V3_WEIGHTS.verification +
      s.communication * V3_WEIGHTS.communication

    const hardGates: string[] = Array.isArray(parsed.hard_gates_triggered) ? parsed.hard_gates_triggered : []
    const redFlags: string[] = Array.isArray(parsed.red_flags) ? parsed.red_flags : []

    // Enforce hard gates in backend (don't fully trust Claude)
    if (monthlyRent > 0 && incomeRatio > 0 && incomeRatio < 2.0 && !hardGates.includes('income_severe')) {
      hardGates.push('income_severe')
    }

    const penalty = redFlags.reduce((sum, flag) => sum + (RED_FLAG_PENALTIES[flag] || 0), 0)
    const gateCap = hardGates.length > 0
      ? Math.min(...hardGates.map(g => HARD_GATE_CAPS[g] ?? 100))
      : 100

    let overall = Math.round(Math.max(0, Math.min(100, Math.min(baseScore - penalty, gateCap))))

    // Evidence coverage — weight each sub-coverage tag
    const coverageWeights: Record<string, number> = {
      measured: 1.0,
      inferred: 0.6,
      action_pending: 0.3,
      missing: 0.0,
    }
    const subCov = parsed.sub_coverage || {}
    const subKeys = Object.keys(subCov)
    const evidenceCoverage = subKeys.length > 0
      ? subKeys.reduce((sum, k) => sum + (coverageWeights[subCov[k]] ?? 0), 0) / subKeys.length
      : 0.5  // fallback when Claude omits sub_coverage

    // Determine tier
    let tier: 'approve' | 'conditional' | 'decline'
    let tierReason = ''
    if (evidenceCoverage < 0.4) {
      tier = 'conditional'
      tierReason = 'insufficient_evidence'
    } else if (hardGates.length > 0) {
      tier = 'decline'
      tierReason = 'hard_gate_triggered'
    } else if (evidenceCoverage < 0.6) {
      tier = 'conditional'
      tierReason = 'low_confidence'
    } else if (overall >= 85) {
      tier = 'approve'
    } else if (overall >= 70) {
      tier = 'conditional'
    } else {
      tier = 'decline'
    }

    // ---- Stage 5: Map to legacy columns for backward compat ----
    const identityMatch = typeof parsed.identity_match_score === 'number' ? parsed.identity_match_score : 70
    const legacy = mapV3ToLegacy(s, redFlags.length, identityMatch)

    const finalExtractedName = parsed.extracted_name || null
    const detectedIncome = typeof parsed.detected_monthly_income === 'number' && parsed.detected_monthly_income > 0
      ? parsed.detected_monthly_income : null
    const effectiveIncome = detectedIncome ?? (monthlyIncome > 0 ? monthlyIncome : null)
    const computedRatio = (effectiveIncome && monthlyRent > 0) ? effectiveIncome / monthlyRent : null

    // Pack the full v3 payload into ai_dimension_notes._v3
    const mergedNotes: Record<string, any> = {
      _v3: {
        model_version: 'v3_2026',
        scores: s,
        sub_coverage: subCov,
        details_en: parsed.details_en || {},
        details_zh: parsed.details_zh || {},
        hard_gates_triggered: hardGates,
        red_flags: redFlags,
        red_flag_penalty: penalty,
        gate_cap: gateCap,
        evidence_coverage: Number(evidenceCoverage.toFixed(2)),
        tier,
        tier_reason: tierReason,
        action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
        compliance_audit: parsed.compliance_audit || null,
        bank_min_balance: typeof parsed.bank_min_balance === 'number' ? parsed.bank_min_balance : null,
        identity_match_score: identityMatch,
      },
      _details_en: parsed.details_en,
      _details_zh: parsed.details_zh,
      _income_evidence: parsed.income_evidence,
    }

    const { error: updateError } = await supabase.from('screenings').update({
      ai_score: overall,
      ai_summary: parsed.summary_en || '',
      ai_extracted_name: finalExtractedName,
      ai_dimension_notes: mergedNotes,
      doc_authenticity_score: legacy.doc_authenticity,
      payment_ability_score: legacy.payment_ability,
      court_records_score: legacy.court_records,
      stability_score: legacy.stability,
      behavior_signals_score: legacy.behavior_signals,
      info_consistency_score: legacy.info_consistency,
      status: 'scored',
      scored_at: new Date().toISOString(),
    }).eq('id', screening_id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      overall,
      model_version: 'v3_2026',
      scores_v3: s,
      scores: legacy,  // legacy shape for current UI
      // NOTE: 'tier' in the response is kept as 'free'|'pro' for backwards
      // compat with the existing frontend. The v3 model tier (approve /
      // conditional / decline) is returned under 'v3_tier'.
      tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
      v3_tier: tier,
      tier_reason: tierReason,
      hard_gates_triggered: hardGates,
      red_flags: redFlags,
      red_flag_penalty: penalty,
      gate_cap: gateCap,
      evidence_coverage: Number(evidenceCoverage.toFixed(2)),
      sub_coverage: subCov,
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      compliance_audit: parsed.compliance_audit || null,
      details_en: parsed.details_en || null,
      details_zh: parsed.details_zh || null,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      detected_document_kinds: Array.isArray(parsed.detected_document_kinds) ? parsed.detected_document_kinds : [],
      detected_monthly_income: detectedIncome,
      effective_monthly_income: effectiveIncome,
      income_evidence: parsed.income_evidence || null,
      bank_min_balance: typeof parsed.bank_min_balance === 'number' ? parsed.bank_min_balance : null,
      identity_match_score: identityMatch,
      monthly_rent: monthlyRent || null,
      income_rent_ratio: computedRatio,
      extracted_name: finalExtractedName,
      name_was_extracted: !screening.tenant_name && !!finalExtractedName,
      summary: parsed.summary_en || '',
      summary_en: parsed.summary_en || '',
      summary_zh: parsed.summary_zh || '',
      court_records_detail: courtDetail,
    })
  } catch (e: any) {
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

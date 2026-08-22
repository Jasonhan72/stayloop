// -----------------------------------------------------------------------------
// Document coherence review — the "read everything as a whole" pass.
//
// Case 24 (2026-08-21): two external reviewers, reading the same seven files
// by eye, caught things no rule anticipated — a credit report whose accounts
// were opened when the applicant was 2, 11, 13 and 15; a phone on the
// application that differs from the one on the bureau report; a $33k car loan
// beside an empty "vehicles" field; a monthly salary on the form that doesn't
// match the letter. Deterministic rules catch what they were written for.
// This pass asks the model to do what the human reviewers did: read every
// document in full, hold them side by side, and list every contradiction,
// impossibility or anomaly — each one anchored to a verbatim quote.
//
// Discipline (the same rules the rest of the pipeline lives by):
//   · Every anomaly must cite the evidence verbatim. No quote, no anomaly.
//   · Verify-first: the output is a REVIEW, not a verdict. Anomalies surface
//     prominently and feed the scoring narrative, but they carry low weight
//     in the deterministic severity math and never trigger a hard gate on
//     their own — deterministic confirmation does that.
//   · Protected grounds (OHRC) are never an anomaly, never mentioned.
//   · A record of a filing is not an outcome; a mention is not a party.
// -----------------------------------------------------------------------------

import type { ForensicFlag } from '@/lib/forensics/types'
import { parseModelJson, repairUnescapedQuotes } from './jsonRepair'
import { llmChat, LlmKeyMissingError, type ChatContentBlock } from '../llmChat'
import type { ModelDef } from '../modelConfig'

export type CoherenceCategory =
  | 'internal_inconsistency'   // a document contradicts itself
  | 'cross_document'           // two documents disagree
  | 'impossibility'            // cannot be true (dates vs age, math)
  | 'format_provenance'        // looks unlike what its source produces
  | 'omission'                 // something expected is conspicuously absent
  | 'other'

export interface CoherenceAnomaly {
  id: string
  category: CoherenceCategory
  severity: 'critical' | 'high' | 'medium' | 'low'
  files: string[]
  claim_zh: string
  claim_en: string
  /** verbatim quotes from the documents that establish the anomaly */
  evidence: string[]
  check_zh: string
  check_en: string
  confidence: number
}

export interface CoherenceDocSummary {
  file: string
  kind: string
  summary_zh: string
  summary_en: string
  key_facts: {
    dob?: string | null
    names?: string[]
    phones?: string[]
    addresses?: string[]
    /** every distinct report/request/as-of/statement date printed on it */
    dates?: string[]
    employer?: string | null
  }
}

export interface CoherenceReview {
  status: 'ok' | 'failed' | 'skipped'
  model: string | null
  anomalies: CoherenceAnomaly[]
  documents: CoherenceDocSummary[]
  error?: string
  elapsed_ms: number
}

const PROMPT = `You are a forensic document examiner reviewing a tenant's rental-application file for an Ontario landlord. You will receive every uploaded document. Read EACH document in full, then hold them side by side.

Your job is NOT to score the applicant. Your job is to find every contradiction, impossibility, or anomaly — inside a document, or between documents — that a careful human examiner would notice, and to anchor each one to the exact text that proves it.

Look for (non-exhaustive — use judgement):
- Dates that cannot coexist: account open dates vs the applicant's date of birth (a minor cannot hold an individual credit account); a document's printed date vs other dates in it; report dates that appear more than once with different values; pay periods that overlap or skip.
- The same fact stated differently across documents: name spellings, date of birth, addresses, phone numbers, employer names, salaries (monthly on the form vs annual in the letter vs period gross on stubs), bank account numbers.
- Arithmetic that doesn't reconcile: gross − deductions ≠ net; YTD progression; annualised pay vs stated salary; statutory deductions far from Canadian CPP/EI proportions.
- Content that is conspicuously absent: a large auto loan on the credit report but "vehicles" left blank on the application; an employer everywhere but no contact path except a personal cell; a stated rent with no lease.
- Provenance mismatches: a document whose layout, wording, fonts or field labels do not match what its claimed source (Equifax/TransUnion, a bank, ADP/Ceridian, Service Ontario) actually produces — say precisely what differs.
- Text that looks overlaid, re-typed or misaligned relative to the rest of the page.

HARD RULES:
1. Every anomaly MUST include at least one VERBATIM quote from the document(s) in "evidence" (copy the exact characters; do not paraphrase). If you cannot quote it, do not report it.
2. Never report, infer, or mention protected grounds (race, ethnicity, national origin, religion, disability, family status, marital status, sexual orientation, gender identity, age as a characteristic, receipt of public assistance). Age only matters arithmetically (e.g. a minor opening an account).
3. A court/tribunal filing proves a filing, not an outcome. A web mention is not a party record. Do not conclude guilt, eviction, debt or fraud — describe the contradiction and what would resolve it.
4. Be specific and short. No advice about approving or declining.
5. Output ONLY the JSON object below — no markdown, no prose. Inside string values NEVER use an ASCII double quote (") — use 「」 in Chinese and single quotes in English (verbatim evidence included: quote it with 「」 or ').

{
  "anomalies": [
    {
      "id": "A1",
      "category": "internal_inconsistency|cross_document|impossibility|format_provenance|omission|other",
      "severity": "critical|high|medium|low",
      "files": ["<file names involved>"],
      "claim_zh": "<what is contradictory/impossible, Chinese, ≤ 60 chars>",
      "claim_en": "<same, English, ≤ 160 chars>",
      "evidence": ["<verbatim quote 1, ≤ 120 chars>", "<verbatim quote 2>"],
      "check_zh": "<what the landlord should do to resolve it, Chinese, ≤ 40 chars>",
      "check_en": "<same, English, ≤ 120 chars>",
      "confidence": <0.0-1.0>
    }
  ],
  "documents": [
    {
      "file": "<file name as given>",
      "kind": "<credit_report|pay_stub|employment_letter|bank_statement|id_document|application_form|reference|lease|other>",
      "summary_zh": "<≤ 25 Chinese characters>",
      "summary_en": "<≤ 15 words>",
      "key_facts": {
        "dob": "<YYYY-MM-DD as printed, or null>",
        "names": ["<full names printed for the applicant (max 3)>"],
        "phones": ["<phone numbers printed (max 3)>"],
        "addresses": ["<addresses printed (max 3)>"],
        "dates": ["<distinct report/request/statement/pay/letter dates, YYYY-MM-DD (max 6)>"],
        "employer": "<employer name as printed or null>"
      }
    }
  ]
}

OUTPUT SIZE: compact JSON on a single line, no indentation, no trailing prose. Anomalies first. Keep the whole answer under ~2500 tokens — brevity over completeness in "documents"; never cut an anomaly short.

Severity guide: critical = cannot be genuine as presented (e.g. accounts opened in childhood, a date that predates the document); high = strong contradiction needing explanation; medium = notable inconsistency; low = minor/likely clerical. Report at most 12 anomalies, most severe first. If you find none, return an empty "anomalies" array — do not invent.`

const clampStr = (v: unknown, n: number): string => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const strArr = (v: unknown, n: number, each: number): string[] =>
  Array.isArray(v) ? v.filter(x => typeof x === 'string').map(x => (x as string).trim().slice(0, each)).filter(Boolean).slice(0, n) : []

const CATS: CoherenceCategory[] = ['internal_inconsistency', 'cross_document', 'impossibility', 'format_provenance', 'omission', 'other']
const SEVS = new Set(['critical', 'high', 'medium', 'low'])

/** Whitelist-sanitize whatever the model returned. Pure — unit-tested. */
export function sanitizeCoherenceOutput(raw: unknown, model: string | null, elapsed: number): CoherenceReview {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const documents: CoherenceDocSummary[] = (Array.isArray(o.documents) ? o.documents : []).slice(0, 30).map((d: any) => ({
    file: clampStr(d?.file, 200),
    kind: clampStr(d?.kind, 40) || 'other',
    summary_zh: clampStr(d?.summary_zh, 300),
    summary_en: clampStr(d?.summary_en, 400),
    key_facts: {
      dob: clampStr(d?.key_facts?.dob, 20) || null,
      names: strArr(d?.key_facts?.names, 10, 80),
      phones: strArr(d?.key_facts?.phones, 10, 30),
      addresses: strArr(d?.key_facts?.addresses, 10, 160),
      dates: strArr(d?.key_facts?.dates, 20, 20),
      employer: clampStr(d?.key_facts?.employer, 120) || null,
    },
  })).filter(d => d.file)
  const anomalies: CoherenceAnomaly[] = (Array.isArray(o.anomalies) ? o.anomalies : []).slice(0, 20).map((a: any, i: number) => {
    const sev = typeof a?.severity === 'string' && SEVS.has(a.severity) ? a.severity : 'medium'
    const cat = CATS.includes(a?.category) ? a.category : 'other'
    const conf = typeof a?.confidence === 'number' && Number.isFinite(a.confidence) ? Math.max(0, Math.min(1, a.confidence)) : 0.5
    return {
      id: clampStr(a?.id, 8) || `A${i + 1}`,
      category: cat as CoherenceCategory,
      severity: sev as CoherenceAnomaly['severity'],
      files: strArr(a?.files, 10, 200),
      claim_zh: clampStr(a?.claim_zh, 200),
      claim_en: clampStr(a?.claim_en, 400),
      evidence: strArr(a?.evidence, 6, 300),
      check_zh: clampStr(a?.check_zh, 300),
      check_en: clampStr(a?.check_en, 400),
      confidence: conf,
    }
  })
  // Rule 1 enforced mechanically: no verbatim evidence, no anomaly.
  .filter(a => a.evidence.length > 0 && (a.claim_zh || a.claim_en))
  return { status: 'ok', model, anomalies, documents, elapsed_ms: elapsed }
}

function extractJson(text: string): unknown {
  const direct = parseModelJson(text)
  if (direct) return direct
  const t = repairUnescapedQuotes(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)) } catch { /* ignore */ } }
  return salvageTruncated(t)
}

/**
 * Output cut at max_tokens (seen 2026-08-22: 7 documents, 110 s, "unparseable
 * output"): keep every COMPLETE anomaly object that was emitted. Anomalies are
 * first in the schema precisely so a truncated answer still yields them.
 * Exported for tests.
 */
export function salvageTruncated(t: string): unknown {
  const key = t.indexOf('"anomalies"')
  if (key < 0) return null
  const arr = t.indexOf('[', key)
  if (arr < 0) return null
  const anomalies: unknown[] = []
  let depth = 0, inStr = false, esc = false, objStart = -1
  for (let i = arr + 1; i < t.length; i++) {
    const ch = t[i]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') { if (depth === 0) objStart = i; depth++ }
    else if (ch === '}') { depth--; if (depth === 0 && objStart >= 0) { try { anomalies.push(JSON.parse(t.slice(objStart, i + 1))) } catch { /* skip broken */ } objStart = -1 } }
    else if (ch === ']' && depth === 0) break
  }
  if (!anomalies.length) return null
  return { anomalies, documents: [], truncated: true }
}

/**
 * Run the review. Never throws — returns status 'failed' with the reason so
 * the report can say "not run" instead of pretending.
 */
export async function runCoherenceReview(args: {
  contentBlocks: unknown[]
  /** Catalogue model definition — any vision-capable provider (llmChat converts the blocks). */
  model: ModelDef
  applicant: { name?: string | null; phone?: string | null; email?: string | null }
}): Promise<CoherenceReview> {
  const started = Date.now()
  const modelId = args.model.id
  if (!args.contentBlocks.length) return { status: 'skipped', model: modelId, anomalies: [], documents: [], error: 'no documents', elapsed_ms: 0 }
  try {
    const ctx = `APPLICANT (as typed by the landlord — may itself be wrong): name="${args.applicant.name || 'unknown'}"${args.applicant.phone ? `, phone=${args.applicant.phone}` : ''}${args.applicant.email ? `, email=${args.applicant.email}` : ''}.`
    const { text } = await llmChat({
      model: args.model,
      system: PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: ctx }, ...(args.contentBlocks as ChatContentBlock[]), { type: 'text', text: 'Return the JSON object now.' }] }],
      temperature: 0,
      maxTokens: 7000,
      jsonMode: true,
      // 140 s: the review is an input to scoring, so it is bounded; with the
      // compact output contract above a 7-document case finishes in ~40-60 s.
      signal: AbortSignal.timeout(140_000),
    })
    const parsed = extractJson(text)
    if (!parsed) {
      console.warn('[coherence] unparseable output from', modelId, 'len=', text.length, 'head=', text.slice(0, 160))
      return { status: 'failed', model: modelId, anomalies: [], documents: [], error: 'unparseable output', elapsed_ms: Date.now() - started }
    }
    return sanitizeCoherenceOutput(parsed, modelId, Date.now() - started)
  } catch (e) {
    if (e instanceof LlmKeyMissingError) return { status: 'skipped', model: modelId, anomalies: [], documents: [], error: 'no api key', elapsed_ms: 0 }
    console.warn('[coherence] failed', modelId, (e as Error)?.name, (e as Error)?.message?.slice(0, 300))
    return { status: 'failed', model: modelId, anomalies: [], documents: [], error: `${(e as Error)?.name || 'error'}: ${(e as Error)?.message?.slice(0, 200) || ''}`, elapsed_ms: Date.now() - started }
  }
}

/** Compact block for the scoring prompt. */
export function coherenceToPromptBlock(r: CoherenceReview): string {
  if (r.status !== 'ok') return `(coherence review ${r.status}${r.error ? `: ${r.error}` : ''} — no independent anomaly list available)`
  if (!r.anomalies.length) return 'Independent coherence review found no internal or cross-document contradictions.'
  return r.anomalies.map(a =>
    `- [${a.severity.toUpperCase()} · ${a.category}] ${a.claim_en} (files: ${a.files.join(', ') || '—'}; evidence: ${a.evidence.map(e => `"${e}"`).join(' | ')}; confidence ${a.confidence.toFixed(2)})`
  ).join('\n')
}

/**
 * Anomalies as forensic flags for the flags table. Severity is carried in
 * the evidence text; the flag weight is LOW — a model-found anomaly surfaces,
 * it does not gate. Deterministic confirmation (tradeline ages, document
 * dates, statutory math) carries its own high/critical flags.
 */
export function coherenceToFlags(r: CoherenceReview): ForensicFlag[] {
  if (r.status !== 'ok') return []
  return r.anomalies.map(a => ({
    code: `coherence_${a.category}`,
    severity: 'low' as const,
    file: a.files[0],
    evidence_en: `[AI coherence review · ${a.severity}] ${a.claim_en} Evidence: ${a.evidence.map(e => `"${e}"`).join(' | ')}. Resolve: ${a.check_en}`,
    evidence_zh: `[AI 整体一致性审查 · ${a.severity}] ${a.claim_zh} 依据：${a.evidence.map(e => `“${e}”`).join('｜')}。核实方式：${a.check_zh}`,
  }))
}

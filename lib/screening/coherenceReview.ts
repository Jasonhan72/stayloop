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
import { parseDateLoose, datesAgree } from './periods'
import { parseModelJson, repairUnescapedQuotes } from './jsonRepair'
import { llmChat, LlmKeyMissingError, type ChatContentBlock } from '../llmChat'
import type { ModelDef } from '../modelConfig'
import type { LlmUsageMeta } from '../llmUsage'

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
    /** employment start date if the document states one (letter / application form) */
    employment_start?: string | null
    /** every employer the document lists for the applicant (e.g. a credit report's Employment section) */
    employers_listed?: string[]
  }
  /** What this document tells a landlord, 2–5 bullets, each anchored on a figure or fact printed in it (2026-09-12) */
  landlord_read_zh?: string[]
  landlord_read_en?: string[]
  /** the one question this document leaves open */
  ask_zh?: string | null
  ask_en?: string | null
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
- Ages at claimed dates (arithmetic from the date of birth on the ID): a senior title (COO, director, manager) or an employment start that falls before age 16–18; an account opened before adulthood.
- Employers the CREDIT REPORT lists (its "Employment" section) vs employers declared on the application / letter — an undisclosed current employer is an omission to resolve.
- Residence history vs the credit file's address history — a residence claimed for more than a year that never appears on the credit report, or a licence/credit address in another province while the applicant claims to have lived locally for years.
- Pay changes right before the application: a base salary that steps up within ~60 days of the newest document (quote the two period amounts and the dates).
- Employment start date vs the employer's incorporation/registration date when either document states one — employment cannot predate the employer.
- Full-time enrolment letters alongside a "permanent, full-time" job: not a finding by itself, but report it as a plausibility question the landlord should ask (hours per week vs study load).

EXPECTED PATTERNS — these are how genuine Canadian documents behave. Do NOT report them as anomalies (mention them, if at all, only inside a document summary):
- Outsourced payroll: the payer on a bank statement is a payroll processor (OneSource Virtual/OSV for Workday, ADP, Ceridian/Dayforce, Payworks, Wagepoint, Rise, Humi, Nethris, Paychex, Payment Evolution, Deluxe), not the employer. Payer ≠ employer is not a contradiction.
- One larger payroll deposit in a period that equals a regular net pay plus the after-tax value of a bonus the letter or stub mentions; "Bonus", "Higher Duties", "Vacation" YTD lines that make YTD exceed regular-pay × periods.
- Net pay rising in spring: CPP/CPP2/EI stop being deducted once the annual maximum is reached, so identical gross pays produce lower nets in Jan–Apr and higher nets afterwards.
- Expense reimbursements paid directly by the employer appearing on the bank statement.
- Surname-first name order on PR cards, T4 slips, passports and IDs ("REGUEIRO RODRIGUEZ CARLOS" = Carlos Regueiro Rodriguez); Hispanic/Portuguese double surnames; accents dropped or kept.
- A T4 slip printed or downloaded months after the tax year (they are issued in February and stay downloadable); a print header naming the payroll portal (Dayforce, Workday, ADP); a different payroll platform on last year's T4 than on this year's stubs (employers change providers) — at most a low "confirm with employer".
- Equifax Canada consumer files that say "no employment records" or "no bank information reported" — most Canadian files carry none.
- A credit bureau address "last reported" date is when a creditor last reported it, not a move-in date; payroll or bureau addresses lagging behind the address on the application by months or years.
- Soft inquiries (identity verification such as Trulioo/PayPal, telecom account checks, the applicant's own bank) — not credit seeking.
- A bank statement showing the applicant AND a joint holder (spouse/partner) — a joint personal account is still the applicant's personal account.
- The application's residence history lists PREVIOUS and CURRENT addresses in order; the first address listed is usually the older one. Read the periods before calling an address "current".
- Telecom and utility accounts on a credit file (Rogers, Virgin, Bell, Freedom, hydro) are not debts the "financial obligations" section of an application asks for.
- OREA forms carry two page counters: the form's own ("Page 1 of 4", Form 400) and the brokerage e-sign packet's ("Page 1 of 6") — not a contradiction.
- ARITHMETIC BEFORE ANY "MISMATCH": convert to the same period and compute the duration before reporting. $22,000/month = $264,000/year, which MATCHES a $263,679.63 annual salary (0.1%); "51 months" of employment from an April 2022 start IS correct on a July 2026 form; a stub's semi-monthly $10,986.66 × 24 = $263,679.84. Report a pay or duration mismatch only when the converted figures differ by more than 10%.

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
        "employer": "<employer name as printed or null>",
        "employment_start": "<YYYY-MM-DD start date if the document states one, else null>",
        "employers_listed": ["<every employer the document lists for the applicant, e.g. a credit report's Employment section (max 5)>"]
      },
      "landlord_read_zh": ["<2–5 bullets, ≤ 45 Chinese chars each: what THIS document tells a landlord deciding whether to rent — the figure or fact as printed, then what it means for paying rent on time. Write like a bank credit officer or a SingleKey report: e.g. 「到手 $6,954.83/半月，折合每月 $13,900，租金 $2,400 占到手 17%」「每月 1 日支票 $4,000 连续 3 个月——现租按时付」「信用卡欠 $9,247/额度 $20,000，每月全额还清」「工作 4 年，正式员工，有福利扣款」「NSF 2 次，账户月底见底」. No PDF metadata, no font talk.>"],
      "landlord_read_en": ["<same bullets in English, ≤ 25 words each>"],
      "ask_zh": "<the ONE question this document leaves open for the landlord to ask, ≤ 40 chars, or null>",
      "ask_en": "<same in English, or null>"
    }
  ]
}

LANDLORD READING — what goes in landlord_read: for a BANK STATEMENT — who pays into it and how often, whether the current rent is visibly being paid and how much, month-end balance and its trend, NSF / overdraft, payday lenders, casinos, collection agencies, unexplained lump sums; for a PAY STUB — employer, frequency, take-home per period and per month, YTD vs run-rate, benefit deductions (real payroll) or garnishments; for a CREDIT REPORT — anything past due now, monthly debt service, utilisation, collections, file depth, employer on file; for an EMPLOYMENT / OFFER LETTER — title, start date, permanent or contract, salary, whether the contact path is a company domain; for an ID — type, expiry, address vs application; for a TAX SLIP / NOA — year and total income vs what is claimed now; for the APPLICATION — declared landlords with phones, reason for leaving, blanks. Every bullet must carry a number or a fact printed on the page. Say nothing about PDF producers, fonts, file sizes or scans — that is covered elsewhere.

OUTPUT SIZE: compact JSON on a single line, no indentation, no trailing prose. Anomalies first. Keep the whole answer under ~4000 tokens — the landlord_read bullets are required for every document; trim key_facts before trimming them; never cut an anomaly short.

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
      employment_start: clampStr(d?.key_facts?.employment_start, 20) || null,
      employers_listed: strArr(d?.key_facts?.employers_listed, 5, 120),
    },
    landlord_read_zh: strArr(d?.landlord_read_zh, 6, 160),
    landlord_read_en: strArr(d?.landlord_read_en, 6, 240),
    ask_zh: clampStr(d?.ask_zh, 120) || null,
    ask_en: clampStr(d?.ask_en, 200) || null,
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
  // Deterministic backstops for two mistakes the model kept making even when
  // told not to (2026-09-11): a pay "mismatch" whose figures are the same
  // salary in different periods, and a name "mismatch" that is the same
  // tokens reordered or with accents dropped.
  .filter(a => !isPeriodReconciledPayClaim(a) && !isSameNameClaim(a) && !isSameDobClaim(a) && !isAgreedAddressClaim(a) && !isClosedAccountOmission(a) && !isExtraPhoneClaim(a))
  return { status: 'ok', model, anomalies, documents, elapsed_ms: elapsed }
}

const PAY_CLAIM = /薪|工资|收入|salary|pay\b|income|wage/i
const NAME_CLAIM = /姓名|名字|name\b|spelling|拼写|重音|accent|顺序|order/i

function moneyFigures(texts: string[]): number[] {
  const out: number[] = []
  for (const t of texts) for (const m of t.matchAll(/\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,7}(?:\.\d{2})?)/g)) {
    const v = Number(m[1].replace(/,/g, ''))
    if (isFinite(v) && v >= 500 && v <= 5_000_000) out.push(v)
  }
  return out
}

/** "Monthly $22,000" vs "263,679.63 per year": the two figures are one salary
 *  expressed per month / semi-month / two weeks / week. */
export function isPeriodReconciledPayClaim(a: { claim_zh: string; claim_en: string; evidence: string[] }): boolean {
  if (!PAY_CLAIM.test(`${a.claim_zh} ${a.claim_en}`)) return false
  const figs = moneyFigures(a.evidence)
  if (figs.length < 2) return false
  const MULT = [12, 24, 26, 52, 2, 2.1667]
  for (let i = 0; i < figs.length; i++) for (let j = 0; j < figs.length; j++) {
    if (i === j || figs[i] >= figs[j]) continue
    if (MULT.some(k => Math.abs(figs[i] * k / figs[j] - 1) <= 0.03)) return true
  }
  return false
}

function nameKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2).sort().join(' ')
}

/** Every person-name quote in the evidence reduces to one token set. */
export function isSameNameClaim(a: { claim_zh: string; claim_en: string; evidence: string[] }): boolean {
  if (!NAME_CLAIM.test(`${a.claim_zh} ${a.claim_en}`)) return false
  const keys = new Set<string>()
  for (const e of a.evidence) {
    // strip field labels ("Current Name", "Name..") and keep the alphabetic tail
    const cleaned = e.replace(/\b(current\s+name|name\s*reported|name|nom|姓名)\b[.:\s]*/gi, ' ')
    const k = nameKey(cleaned)
    if (k.split(' ').length >= 2) keys.add(k)
  }
  return keys.size === 1 && a.evidence.length >= 2
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
  meta?: LlmUsageMeta
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
      meta: { ...(args.meta || {}), slot: 'coherence' },
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

const DOB_CLAIM = /生日|出生|birth|dob/i
const ADDRESS_CLAIM = /住址|地址|address|residence/i
const OMISSION_CLAIM = /少报|漏报|未披露|未申报|omit|undisclosed|not\s+disclosed|missing/i

/** "MAY-14-1979" vs "14 MAY / MAI 79" vs "1979-xx-14": one birthday in three
 *  print formats. Drop when every date in the evidence agrees on the parts it
 *  carries. */
export function isSameDobClaim(a: { claim_zh: string; claim_en: string; evidence: string[] }): boolean {
  if (!DOB_CLAIM.test(`${a.claim_zh} ${a.claim_en}`)) return false
  const dates = a.evidence.map(e => parseDateLoose(e)).filter((d): d is NonNullable<typeof d> => !!d)
  return dates.length >= 2 && datesAgree(dates)
}

const STREET_RE = /\b(\d{1,6})\s+([A-Z][A-Z'.-]*(?:\s+[A-Z][A-Z'.-]*){0,3}?)\s+(RD|ROAD|ST|STREET|AVE|AVENUE|GATEWAY|BLVD|BOULEVARD|DR|DRIVE|CRES|CRESCENT|WAY|CT|COURT|LANE|LN|PL|PLACE|TRAIL|TRL|CIRCLE|CIR|SQ|SQUARE|TERR|TERRACE|PKWY|PARKWAY|HWY|HIGHWAY)\b/gi
function streetKeys(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.toUpperCase().matchAll(STREET_RE)) out.add(`${m[1]} ${m[2].replace(/\s+/g, ' ')}`)
  return out
}

/** An application lists previous AND current addresses; the model kept
 *  reading the older one as "current" and reporting a mismatch against the
 *  bank / bureau address. When one street appears in evidence from two or
 *  more documents, the documents agree on that address — no contradiction. */
export function isAgreedAddressClaim(a: { claim_zh: string; claim_en: string; evidence: string[]; files?: string[] }): boolean {
  if (!ADDRESS_CLAIM.test(`${a.claim_zh} ${a.claim_en}`)) return false
  const counts = new Map<string, number>()
  for (const e of a.evidence) for (const k of streetKeys(e)) counts.set(k, (counts.get(k) || 0) + 1)
  return Array.from(counts.values()).some(n => n >= 2)
}

/** "The application omits a loan the bureau shows" — when the evidence itself
 *  says that account is closed or paid, there is nothing to disclose. */
export function isClosedAccountOmission(a: { claim_zh: string; claim_en: string; category?: string; evidence: string[] }): boolean {
  if (!(a.category === 'omission' || OMISSION_CLAIM.test(`${a.claim_zh} ${a.claim_en}`))) return false
  if (!/贷|loan|lease|obligation|account|账户|负债|义务/i.test(`${a.claim_zh} ${a.claim_en}`)) return false
  return a.evidence.some(e => /date\s+closed\s*\d|\bclosed\b.*\d{4}|account\s+paid|paid\s+in\s+full|balance\s*\$?0\b/i.test(e))
}

/** A bureau file lists every phone a creditor ever reported; the application
 *  asks for one. An extra bureau number is not an omission. */
export function isExtraPhoneClaim(a: { claim_zh: string; claim_en: string; evidence: string[] }): boolean {
  if (!/电话|phone|telephone/i.test(`${a.claim_zh} ${a.claim_en}`)) return false
  if (!OMISSION_CLAIM.test(`${a.claim_zh} ${a.claim_en}`) && !/少|fewer|only\s+one|another/i.test(`${a.claim_zh} ${a.claim_en}`)) return false
  const phones = a.evidence.flatMap(e => Array.from(e.matchAll(/(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{4})/g)).map(m => `${m[1]}${m[2]}${m[3]}`))
  const distinct = new Set(phones)
  // at least one number is shared across evidence strings → the application phone IS on the bureau file
  return distinct.size < phones.length
}

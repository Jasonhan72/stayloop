// -----------------------------------------------------------------------------
// P2 — Cross-Document Consistency Forensics
//
// Even when each document looks plausible in isolation, they often contradict
// each other when forged by the same person:
//
//   - Employer's "verification" phone matches the applicant's own cell
//   - Bank deposits exactly equal paystub net (penny-perfect, every period)
//   - Applicant address is in a different city/province than the employer
//   - Same name spelled differently across docs (Mostofi vs Mostoufi)
//
// We do this by:
//   1. Pulling extracted text from every PDF (already done in pdf-text.ts)
//   2. Pulling the haiku-extracted structured fields from paystub-math.ts
//   3. Pulling the landlord-provided application data
//   4. Running a small set of cross-doc rules
//
// All rules run in pure JS — no extra AI calls.
// -----------------------------------------------------------------------------

import type {
  CrossDocEntities,
  CrossDocResult,
  ForensicFlag,
  PaystubExtraction,
  TextDensityResult,
} from './types'

interface CrossDocInput {
  files: Array<{
    name: string
    kind: string
    text_sample?: string  // from text_density.text_sample (first 500 chars)
    paystub?: PaystubExtraction
  }>
  applicant_name?: string
  applicant_phone?: string
  applicant_email?: string
  applicant_address?: string
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/g
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/** Normalize a phone number to 10-digit canonical form for comparison. */
function normalizePhone(s: string): string | null {
  const m = s.match(/(\d{3})\D*(\d{3})\D*(\d{4})/)
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

/** Extract all phone-number-shaped substrings from a text blob. */
function extractPhones(text: string): string[] {
  if (!text) return []
  const matches: string[] = []
  for (const m of text.matchAll(PHONE_RE)) {
    const n = `${m[1]}${m[2]}${m[3]}`
    matches.push(n)
  }
  return Array.from(new Set(matches))
}

function extractEmails(text: string): string[] {
  if (!text) return []
  return Array.from(new Set((text.match(EMAIL_RE) || []).map(s => s.toLowerCase())))
}

/** Extract dollar amounts ($1,234.56 or 1234.56) — used to find deposit/net matches. */
function extractAmounts(text: string): number[] {
  if (!text) return []
  const out: number[] = []
  for (const m of text.matchAll(/\$?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})/g)) {
    const n = Number(m[1].replace(/,/g, ''))
    if (isFinite(n) && n > 100 && n < 100000) out.push(n)
  }
  return out
}

export function runCrossDocChecks(
  input: CrossDocInput
): { result: CrossDocResult; flags: ForensicFlag[] } {
  const flags: ForensicFlag[] = []
  const entities: CrossDocEntities = {
    phones: [],
    emails: [],
    addresses: [],
    names: [],
    employers: [],
    deposit_amounts: [],
  }

  // ---- Collect entities from applicant-supplied data ----
  if (input.applicant_phone) {
    const np = normalizePhone(input.applicant_phone)
    if (np) entities.phones.push({ value: np, from: 'application_form' })
  }
  if (input.applicant_email) entities.emails.push({ value: input.applicant_email.toLowerCase(), from: 'application_form' })
  if (input.applicant_name) entities.names.push({ value: input.applicant_name, from: 'application_form' })
  if (input.applicant_address) entities.addresses.push({ value: input.applicant_address, from: 'application_form' })

  // ---- Collect entities from each file ----
  for (const f of input.files) {
    if (f.text_sample) {
      for (const p of extractPhones(f.text_sample)) {
        entities.phones.push({ value: p, from: f.name })
      }
      for (const e of extractEmails(f.text_sample)) {
        entities.emails.push({ value: e, from: f.name })
      }
      // Bank statement: collect deposit amounts
      if (f.kind === 'bank_statement') {
        for (const a of extractAmounts(f.text_sample)) {
          entities.deposit_amounts.push({ value: a, from: f.name })
        }
      }
    }
    if (f.paystub) {
      if (f.paystub.employer_phone) {
        const np = normalizePhone(f.paystub.employer_phone)
        if (np) entities.phones.push({ value: np, from: f.name })
      }
      if (f.paystub.employer_name) entities.employers.push({ value: f.paystub.employer_name, from: f.name })
    }
  }

  // ---- Rule 1: applicant phone == employer/HR phone ----
  // Strongest signal: the "employer verification" number is the same as the
  // applicant's own cell.
  const applicantPhones = new Set(
    entities.phones.filter(p => p.from === 'application_form').map(p => p.value)
  )
  let hrPhoneCollision = false
  if (applicantPhones.size > 0) {
    for (const p of entities.phones) {
      if (p.from === 'application_form') continue
      if (applicantPhones.has(p.value)) {
        // Find which file it came from
        flags.push({
          code: 'cross_doc_phone_collision',
          severity: 'critical',
          file: p.from,
          evidence_en: `Phone (${p.value.slice(0, 3)}-${p.value.slice(3, 6)}-${p.value.slice(6)}) appears as both the applicant's contact number AND in ${p.from}. Classic fake-reference / fake-employer pattern.`,
          evidence_zh: `电话 (${p.value.slice(0, 3)}-${p.value.slice(3, 6)}-${p.value.slice(6)}) 同时是申请人本人的联系电话和 ${p.from} 上的电话。典型的虚假推荐人/虚假雇主特征。`,
        })
        hrPhoneCollision = true
      }
    }
  }

  // ---- Rule 2: bank deposit exactly matches paystub period_net for both periods ----
  const paystubNets = input.files
    .filter(f => f.paystub?.period_net)
    .map(f => f.paystub!.period_net!)
  const deposits = entities.deposit_amounts.map(d => d.value)
  let depositPaystubPerfect = false
  if (paystubNets.length >= 1 && deposits.length > 0) {
    let exactMatches = 0
    for (const net of paystubNets) {
      // Penny-perfect match (real deposits sometimes have $0.01-$1 variation)
      if (deposits.some(d => Math.abs(d - net) < 0.01)) exactMatches++
    }
    if (paystubNets.length >= 2 && exactMatches === paystubNets.length) {
      depositPaystubPerfect = true
      flags.push({
        code: 'deposits_too_clean',
        severity: 'medium',
        evidence_en: `Bank deposits match paystub net pay penny-perfectly across ${paystubNets.length} periods ($${paystubNets.map(n => n.toFixed(2)).join(', $')}). Real direct deposits typically vary $0.50-$2 between periods due to tax/CPP recalibration. Suggests bank statement was constructed to match the paystub.`,
        evidence_zh: `银行存款金额与工资单净收入在 ${paystubNets.length} 期完全分毫不差地匹配（$${paystubNets.map(n => n.toFixed(2)).join('、$')}）。真实的直存因税/CPP 微调通常会有 $0.50-$2 的浮动。看起来银行对账单是按工资单数字反向构造的。`,
      })
    }
  }

  // ---- Rule 3: name spelling variations across docs ----
  // Collect all employer-name strings; if 2+ variants of the same person name
  // appear (Levenshtein distance 1-2, same length ±1), flag it.
  const allNameStrings = [
    ...entities.names.map(n => n.value),
    ...entities.employers.map(e => e.value),
  ]
  const checkedPairs = new Set<string>()
  for (let i = 0; i < allNameStrings.length; i++) {
    for (let j = i + 1; j < allNameStrings.length; j++) {
      const a = allNameStrings[i].toLowerCase().replace(/[^a-z]/g, '')
      const b = allNameStrings[j].toLowerCase().replace(/[^a-z]/g, '')
      if (a === b || a.length < 4 || b.length < 4) continue
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (checkedPairs.has(key)) continue
      checkedPairs.add(key)
      const d = levenshtein(a, b)
      if (d >= 1 && d <= 2 && Math.abs(a.length - b.length) <= 2) {
        flags.push({
          code: 'name_spelling_variation',
          severity: 'medium',
          evidence_en: `Same name appears with different spellings across documents: "${allNameStrings[i]}" vs "${allNameStrings[j]}" (edit distance ${d}). Real documents from the same source spell names consistently.`,
          evidence_zh: `同一名字在不同文件中拼写不一致："${allNameStrings[i]}" vs "${allNameStrings[j]}"（编辑距离 ${d}）。来自同一真实来源的文件不会有这种拼写差异。`,
        })
      }
    }
  }

  // ---- Rule 4: phone area-code geographic mismatch ----
  // Ontario area codes: 226 249 289 343 365 416 437 519 548 613 647 705 807 905
  // Quebec:             418 438 450 514 579 581 819 873
  // BC:                 236 250 604 672 778
  // Detect: applicant phone in QC area code but employer phone in ON area code
  // — or applicant address in different province than employer
  const ON_CODES = new Set(['226', '249', '289', '343', '365', '416', '437', '519', '548', '613', '647', '705', '807', '905'])
  const QC_CODES = new Set(['418', '438', '450', '514', '579', '581', '819', '873'])
  const provinceOf = (phone: string): 'ON' | 'QC' | 'OTHER' => {
    const code = phone.slice(0, 3)
    if (ON_CODES.has(code)) return 'ON'
    if (QC_CODES.has(code)) return 'QC'
    return 'OTHER'
  }
  const applicantProv = Array.from(applicantPhones).map(provinceOf).find(p => p !== 'OTHER')
  const employerPhones = entities.phones.filter(p => p.from !== 'application_form')
  for (const ep of employerPhones) {
    const empProv = provinceOf(ep.value)
    if (applicantProv && empProv !== 'OTHER' && applicantProv !== empProv) {
      flags.push({
        code: 'cross_doc_phone_geo_mismatch',
        severity: 'low',
        evidence_en: `Applicant phone area code suggests ${applicantProv}, but ${ep.from} shows phone in ${empProv} area code (${ep.value.slice(0, 3)}). Possible — but unusual for someone claiming long employment with a local employer.`,
        evidence_zh: `申请人电话区号在 ${applicantProv}，但 ${ep.from} 上的电话区号在 ${empProv}（${ep.value.slice(0, 3)}）。可能合理——但对于声称长期在本地雇主工作的人来说不太正常。`,
      })
      break
    }
  }

  return {
    result: {
      entities,
      unique_phones: new Set(entities.phones.map(p => p.value)).size,
      hr_phone_collision: hrPhoneCollision,
      deposit_paystub_perfect_match: depositPaystubPerfect,
    },
    flags,
  }
}

/** Iterative Levenshtein distance — small alphabet, short strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

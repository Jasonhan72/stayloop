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

// ---- Rule 5: Timestamp clustering — batch forgery detection ----
// When multiple "different-month" documents (pay stubs from March, April, May)
// all have the same CreationDate within a 2-hour window, the forger created
// them all in one sitting. Real documents are generated weeks/months apart.

export interface TimestampClusterInput {
  file_name: string
  file_kind: string
  creation_date: string | null
}

export function checkTimestampClustering(
  files: TimestampClusterInput[],
): ForensicFlag[] {
  const flags: ForensicFlag[] = []

  // Only check files with valid creation dates AND strict kinds.
  // credit_report is deliberately EXCLUDED: the rule's premise ("documents
  // covering different periods should be generated weeks apart") only holds
  // for period documents. A credit report is a point-in-time snapshot
  // generated at request time — co-applicants downloading their own reports
  // in one sitting, or one person pulling Equifax + TransUnion the same
  // evening, is the EXPECTED honest behavior. Two genuine co-applicant
  // Equifax downloads 42 seconds apart were hard-gated as "batch forgery"
  // under the old rule.
  const CLUSTER_KINDS = new Set(['bank_statement', 'pay_stub'])
  const dated = files
    .filter(f => f.creation_date && CLUSTER_KINDS.has(f.file_kind))
    .map(f => ({
      name: f.file_name,
      kind: f.file_kind,
      ts: new Date(f.creation_date!).getTime(),
    }))
    .filter(f => !isNaN(f.ts))
    .sort((a, b) => a.ts - b.ts)

  if (dated.length < 2) return flags

  // Check if all files were created within a 2-hour window
  const windowMs = 2 * 60 * 60 * 1000
  const span = dated[dated.length - 1].ts - dated[0].ts

  if (span <= windowMs && span >= 0) {
    // All files created within 2 hours — check if they SHOULD have different dates
    const distinctKinds = new Set(dated.map(f => f.kind))
    const fileNames = dated.map(f => f.name)

    // Multiple pay stubs (different months) created at the same time = batch forgery
    // Multiple bank statements created at the same time = batch forgery
    // Mix of pay stubs + bank statements at the same time = batch forgery
    if (dated.length >= 2) {
      const spanMinutes = Math.round(span / (60 * 1000))
      flags.push({
        code: 'timestamp_batch_creation',
        severity: 'high',
        evidence_en: `${dated.length} documents (${fileNames.join(', ')}) were all created within ${spanMinutes} minutes of each other. Documents claiming to cover different periods (monthly statements, pay stubs) should have been generated weeks or months apart. Batch creation strongly indicates forgery.`,
        evidence_zh: `${dated.length} 份文件（${fileNames.join('、')}）全部在 ${spanMinutes} 分钟内创建。声称覆盖不同时期的文件（月度对账单、工资单）应该相隔数周或数月生成。批量创建强烈暗示伪造。`,
      })
    }
  }

  // Also check: creation timestamp very close to the screening submission
  // (within 1 hour before) — suggests just-in-time fabrication
  const now = Date.now()
  const oneHourMs = 60 * 60 * 1000
  for (const f of dated) {
    if (now - f.ts < oneHourMs && now - f.ts >= 0) {
      flags.push({
        code: 'timestamp_just_created',
        severity: 'medium',
        file: f.name,
        evidence_en: `"${f.name}" was created less than 1 hour before submission. Authentic ${f.kind.replace(/_/g, ' ')} documents are generated days to months before being shared with a landlord.`,
        evidence_zh: `"${f.name}" 在提交前不到 1 小时内创建。真实的${zhKindLocal(f.kind)}在分享给房东之前通常已生成数天到数月。`,
      })
    }
  }

  return flags
}

function zhKindLocal(kind: string): string {
  switch (kind) {
    case 'bank_statement': return '银行对账单'
    case 'credit_report': return '信用报告'
    case 'pay_stub': return '工资单'
    default: return '官方文件'
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

// -----------------------------------------------------------------------------
// LOE stated-salary extraction — deterministic regex over employment-letter
// text. Feeds the LOE ↔ pay-stub ↔ YTD income reconciliation in index.ts:
// agreement is authenticity corroboration; contradiction is a verification
// flag; and a paystub math anomaly that the LOE independently corroborates
// gets demoted from fraud-gate to verify-first.
// -----------------------------------------------------------------------------

/** Extract the annual salary stated in an employment/offer letter.
 *  Returns null when no plausible figure is found. Hourly rates are
 *  annualized at 2080 full-time hours. */
export function extractStatedAnnualSalary(text: string): number | null {
  if (!text) return null
  // Explicit-period patterns FIRST — "salary of $25,000 per month" must be
  // annualized (×12), never mistaken for a $25k annual salary.
  const monthly = text.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:CAD\s*)?(?:per\s+month|\/\s*mo(?:nth)?\b|monthly)/i)
  if (monthly) {
    const v = Number(monthly[1].replace(/,/g, ''))
    if (isFinite(v) && v >= 1_500 && v <= 170_000) return Math.round(v * 12)
  }
  const biweekly = text.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*(?:CAD\s*)?(?:bi-?weekly|every\s+two\s+weeks)/i)
  if (biweekly) {
    const v = Number(biweekly[1].replace(/,/g, ''))
    if (isFinite(v) && v >= 700 && v <= 80_000) return Math.round(v * 26)
  }
  const hourly = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:CAD\s*)?(?:per\s+hour|\/\s*(?:hour|hr)\b|hourly)/i)
  if (hourly) {
    const hr = Number(hourly[1].replace(/,/g, ''))
    if (isFinite(hr) && hr >= 15 && hr <= 500) return Math.round(hr * 2080)
  }
  const annualPatterns = [
    /annual(?:ized)?\s+(?:base\s+)?(?:salary|compensation)\s*(?:of|is|:)?\s*(?:CAD|C\$)?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\$\s*([\d,]+(?:\.\d{2})?)\s*(?:CAD\s*)?(?:per\s+annum|annually|per\s+year|\/\s*(?:year|yr)|a\s+year)/i,
    // Bare "salary of $X" LAST and only when NOT followed by a shorter-period
    // qualifier (explicit periods were consumed above; lookahead is defense).
    /(?:base\s+)?salary\s+of\s+(?:CAD|C\$)?\s*\$?\s*([\d,]+(?:\.\d{2})?)(?!\s*(?:CAD\s*)?(?:per\s+month|\/\s*mo|monthly|bi-?weekly|per\s+week|weekly|per\s+hour|\/\s*h|hourly))/i,
  ]
  for (const p of annualPatterns) {
    const m = text.match(p)
    if (m) {
      const v = Number(m[1].replace(/,/g, ''))
      if (isFinite(v) && v >= 20_000 && v <= 2_000_000) return v
    }
  }
  return null
}

/** First significant word of an employer name, for matching a pay stub to
 *  the employment letter that talks about the same company.
 *  "STACKADAPT INC" → "STACKADAPT", "Tidal Commerce Inc." → "TIDAL". */
function employerToken(name: string | null): string | null {
  if (!name) return null
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const skip = new Set(['THE', 'INC', 'LTD', 'LLC', 'CORP', 'CO', 'LIMITED', 'INCORPORATED', 'CORPORATION', 'GROUP', 'CANADA'])
  const w = words.find(x => x.length >= 4 && !skip.has(x)) || words.find(x => !skip.has(x))
  return w || null
}

/** Minimal per-file shape needed by income reconciliation — structural subset
 *  of PerFileForensics so the orchestrator can pass its files straight in. */
export interface IncomeReconcileFile {
  file_name: string
  file_kind: string
  text_density?: { text_sample: string }
  paystub_math?: { extraction: PaystubExtraction }
  flags: ForensicFlag[]
}

function kindHas(kind: string, target: string): boolean {
  return kind.split(',').map(k => k.trim().toLowerCase()).includes(target)
}

/** LOE ↔ pay-stub ↔ YTD reconciliation. Mirrors a human forensic pass:
 *  independent documents that AGREE upgrade authenticity; documents that
 *  CONTRADICT get flagged; and a paystub math anomaly that the employment
 *  letter independently corroborates is demoted from fraud-gate to
 *  verify-first. Mutates per-file flags (demotion) and appends cross-doc
 *  corroboration/mismatch flags. Must run BEFORE hard gates are computed. */
export function reconcileIncomeAcrossDocs(perFile: IncomeReconcileFile[], crossDocFlags: ForensicFlag[]): void {
  const letters = perFile
    .filter(pf => kindHas(pf.file_kind, 'employment_letter') || kindHas(pf.file_kind, 'offer_letter'))
    .map(pf => ({
      name: pf.file_name,
      text: pf.text_density?.text_sample || '',
      salary: extractStatedAnnualSalary(pf.text_density?.text_sample || ''),
    }))
    .filter(l => l.salary !== null)
  const stubs = perFile.filter(pf => pf.paystub_math)
  if (letters.length === 0 || stubs.length === 0) return

  // One corroborated/mismatch flag PER LETTER, not per stub — an applicant's
  // standard 3 recent stubs against 1 letter must not triple-count a single
  // salary discrepancy in severity scoring and penalties.
  const flaggedLetters = new Set<string>()

  for (const stub of stubs) {
    const ext = stub.paystub_math!.extraction
    // Pair the stub with the letter that mentions the same employer;
    // fall back to the only letter when the bundle has exactly one of each.
    const token = employerToken(ext.employer_name)
    let letter = token ? letters.find(l => l.text.toUpperCase().includes(token)) : undefined
    if (!letter && letters.length === 1 && stubs.length === 1) letter = letters[0]
    if (!letter) continue
    const stated = letter.salary!

    // 1) Demotion: a critical YTD-inflation flag whose YTD is INDEPENDENTLY
    //    consistent with the salary the employment letter states is an
    //    extraction artifact, not proven forgery. Verify-first, don't gate.
    let demoted = false
    const idx = stub.flags.findIndex(fl => fl.code === 'paystub_ytd_inflated')
    if (idx >= 0 && ext.pay_date && ext.ytd_gross) {
      // Pure-UTC day-of-year: new Date('YYYY-MM-DD') is UTC-parsed but
      // getFullYear() is LOCAL — mixing them skews Jan-boundary dates by a
      // whole year in non-UTC runtimes.
      const dm = ext.pay_date.match(/^(\d{4})-(\d{2})-(\d{2})/)
      const daysElapsed = dm
        ? (Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) - Date.UTC(+dm[1], 0, 1)) / 86_400_000
        : -1
      if (daysElapsed > 0 && daysElapsed <= 366) {
        const loeRatio = ext.ytd_gross / (stated * daysElapsed / 365)
        if (loeRatio >= 0.6 && loeRatio <= 1.6) {
          stub.flags.splice(idx, 1, {
            code: 'paystub_math_needs_verification',
            severity: 'medium',
            file: stub.file_name,
            evidence_en: `Pay stub YTD $${ext.ytd_gross.toLocaleString()} conflicted with the extracted salary figure, BUT it is consistent (${loeRatio.toFixed(2)}x pro-rata) with the $${stated.toLocaleString()}/yr stated in "${letter.name}". Most likely an extraction artifact — verify the salary with the employer instead of rejecting.`,
            evidence_zh: `工资单 YTD $${ext.ytd_gross.toLocaleString()} 与提取到的年薪数字冲突，但与雇佣信《${letter.name}》声明的年薪 $${stated.toLocaleString()} 自洽（按比例 ${loeRatio.toFixed(2)} 倍）。大概率是提取误差——建议致电雇主核实薪资，而非直接判伪。`,
          })
          demoted = true
        }
      }
    }

    // 2) Corroboration / mismatch between the two independent annual figures.
    //    Skipped when a demotion just happened — the mismatch there is the
    //    same extraction artifact, already reported above.
    if (!demoted && ext.annual_salary && !flaggedLetters.has(letter.name)) {
      flaggedLetters.add(letter.name)
      const diff = Math.abs(ext.annual_salary - stated) / stated
      if (diff <= 0.10) {
        crossDocFlags.push({
          code: 'cross_doc_income_corroborated',
          severity: 'info',
          evidence_en: `Pay stub annualized salary $${ext.annual_salary.toLocaleString()} matches the $${stated.toLocaleString()}/yr stated in "${letter.name}" (within ${(diff * 100).toFixed(1)}%). Two independent documents agree — authenticity corroboration.`,
          evidence_zh: `工资单年化薪资 $${ext.annual_salary.toLocaleString()} 与雇佣信《${letter.name}》声明的 $${stated.toLocaleString()}/年 吻合（偏差 ${(diff * 100).toFixed(1)}%）。两份独立文件互证——真实性佐证。`,
        })
      } else if (diff >= 0.25) {
        crossDocFlags.push({
          code: 'cross_doc_income_mismatch',
          severity: 'medium',
          evidence_en: `Pay stub annualized salary $${ext.annual_salary.toLocaleString()} differs from the $${stated.toLocaleString()}/yr stated in "${letter.name}" by ${(diff * 100).toFixed(0)}%. The two documents contradict each other — verify with the employer.`,
          evidence_zh: `工资单年化薪资 $${ext.annual_salary.toLocaleString()} 与雇佣信《${letter.name}》声明的 $${stated.toLocaleString()}/年 相差 ${(diff * 100).toFixed(0)}%。两份文件互相矛盾——需向雇主核实。`,
        })
      }
    }
  }
}

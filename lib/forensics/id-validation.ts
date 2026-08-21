// -----------------------------------------------------------------------------
// ID document number format validation
//
// Pure string/checksum validation for Canadian IDs — no external calls.
// Used to catch obvious forgeries where a fraudster types a plausible-looking
// number without computing the checksum digit.
//
// Covered:
//   - SIN (Social Insurance Number): 9 digits, Luhn checksum
//   - Ontario DL (Driver's Licence): 15 chars, X1111-11111-11111, where X is
//     the first letter of the licence holder's surname (uppercase)
//   - OHIP (Ontario Health Card): 10 digits, 4-3-3 format, optional 2-letter
//     version code (red-and-white cards don't have version code)
//
// Each validator returns both the raw match and a normalized form. Callers
// decide how to weight a failure — a SIN with bad checksum is a strong
// forgery signal, but a DL without surname match might just be OCR noise.
// -----------------------------------------------------------------------------

export interface IdExtraction {
  sins: Array<{ raw: string; normalized: string; luhn_valid: boolean }>
  ontario_dls: Array<{ raw: string; normalized: string; format_valid: boolean; surname_initial: string | null }>
  ohips: Array<{ raw: string; normalized: string; format_valid: boolean; version_code: string | null }>
  passports: Array<{ raw: string; country: 'CA' | 'UNKNOWN'; format_valid: boolean }>
}

// ── SIN (Social Insurance Number) ───────────────────────────────────────────

/**
 * Canadian SIN is 9 digits with a Luhn checksum. First digit encodes issuing
 * region: 1-7 for provinces, 8 unused, 9 for temporary workers. All 9-digit
 * sequences of 0s are invalid.
 *
 * Luhn: double every 2nd digit from the right, subtract 9 if result > 9, sum
 * all digits, result must be divisible by 10.
 */
export function validateSINLuhn(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false
  if (digits === '000000000') return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = Number(digits[i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/** Extract SIN-like 9-digit strings from text, discount very common number runs. */
function extractSINs(text: string): Array<{ raw: string; normalized: string }> {
  const out: Array<{ raw: string; normalized: string }> = []
  // Match 9 digits with optional spaces/hyphens, commonly in formats 123-456-789 or 123 456 789
  const re = /\b(\d{3}[ \-]?\d{3}[ \-]?\d{3})\b/g
  const seen = new Set<string>()
  let m
  while ((m = re.exec(text))) {
    const raw = m[1]
    const normalized = raw.replace(/\D/g, '')
    if (normalized.length !== 9) continue
    if (seen.has(normalized)) continue
    // Skip obvious non-SIN patterns (all same digit, 123456789, etc.)
    if (/^(\d)\1{8}$/.test(normalized)) continue
    if (normalized === '123456789' || normalized === '987654321') continue
    // Require a SIN-adjacent keyword within 80 chars BEFORE the number (same
    // pass the BN check uses). Application forms and statements are full of
    // 9-digit runs that are NOT SINs — reference numbers, account numbers,
    // transit+account concatenations — and ~90% of arbitrary 9-digit strings
    // fail Luhn, so treating every 3-3-3 run as a SIN produced critical
    // "fabricated SIN" verdicts on genuine documents.
    const ctxStart = Math.max(0, m.index - 80)
    const ctx = text.slice(ctxStart, m.index)
    if (!/\b(?:SIN|S\.I\.N|social\s+insurance|NAS|num[ée]ro\s+d'assurance\s+sociale)\b/i.test(ctx)) continue
    seen.add(normalized)
    out.push({ raw, normalized })
  }
  return out
}

// ── Ontario Driver's Licence ────────────────────────────────────────────────

/**
 * Ontario DL format: `X1111-11111-11111` — 1 letter + 14 digits, hyphenated
 * as 1-4-5-5. The letter is the first letter of the applicant's surname
 * (uppercase). Format existed since 1989.
 */
// Separator allows "M2246-42409-30726", "M2246 42409 30726" AND the
// card-face print style "M2246 - 42409 - 30726" (hyphen padded with spaces).
const ONTARIO_DL_RE = /\b([A-Z])(\d{4})\s?-?\s?(\d{5})\s?-?\s?(\d{5})\b/g

function extractOntarioDLs(text: string): Array<{ raw: string; normalized: string; surname_initial: string }> {
  const out: Array<{ raw: string; normalized: string; surname_initial: string }> = []
  const seen = new Set<string>()
  let m
  while ((m = ONTARIO_DL_RE.exec(text))) {
    const [raw, initial, a, b, c] = m
    const normalized = `${initial}${a}-${b}-${c}`
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push({ raw, normalized, surname_initial: initial })
  }
  return out
}

// ── Ontario Health Card (OHIP) ──────────────────────────────────────────────

/**
 * OHIP format: `####-###-###` (10 digits) with optional two-letter version
 * code `AA` on photo cards (post-1995 green cards). Red-and-white cards
 * still in circulation are 10 digits only.
 *
 * Note: there are proprietary OHIP validation algorithms (Mod-10-variant)
 * but they are not documented publicly. We only verify format structure.
 */
const OHIP_RE = /\b(\d{4}[- ]?\d{3}[- ]?\d{3})(?:[\s-]+([A-Z]{2}))?\b/g

function extractOHIPs(text: string): Array<{ raw: string; normalized: string; version_code: string | null }> {
  const out: Array<{ raw: string; normalized: string; version_code: string | null }> = []
  const seen = new Set<string>()
  let m
  while ((m = OHIP_RE.exec(text))) {
    const digits = m[1].replace(/\D/g, '')
    if (digits.length !== 10) continue
    // Reject sequences that are obviously not health cards (all zeros, sequential)
    if (/^(\d)\1{9}$/.test(digits)) continue
    if (digits === '1234567890') continue
    const normalized = `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
    const version_code = m[2] || null
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push({ raw: m[0], normalized, version_code })
  }
  return out
}

// ── Canadian passport ──────────────────────────────────────────────────────

/**
 * Canadian passport number format: 2 uppercase letters followed by 6 digits,
 * commonly written as e.g. `AB123456`. Pattern has changed over time but
 * the post-2013 e-passport uses this format. We only verify shape.
 */
const CA_PASSPORT_RE = /\b([A-Z]{2})(\d{6})\b/g

function extractPassports(text: string): Array<{ raw: string; country: 'CA' | 'UNKNOWN'; format_valid: boolean }> {
  const out: Array<{ raw: string; country: 'CA' | 'UNKNOWN'; format_valid: boolean }> = []
  const seen = new Set<string>()
  let m
  while ((m = CA_PASSPORT_RE.exec(text))) {
    const raw = m[0]
    if (seen.has(raw)) continue
    seen.add(raw)
    // Tight check: must look like passport (context or specific prefixes)
    // Canadian passports use a variety of letter prefixes. For now we flag
    // format-valid but don't country-assert.
    out.push({ raw, country: 'UNKNOWN', format_valid: true })
  }
  return out
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Extract and validate all recognized ID numbers from arbitrary document text.
 * @param text        OCR'd or extracted text from an ID / application doc.
 * @param surname     (deprecated, unused) — DL surname matching now happens in
 *                    checkIdValidation against ALL candidate surnames.
 */
export function extractAndValidateIds(text: string, surname?: string): IdExtraction {
  if (!text) {
    return { sins: [], ontario_dls: [], ohips: [], passports: [] }
  }

  // SINs
  const sins = extractSINs(text).map(s => ({
    ...s,
    luhn_valid: validateSINLuhn(s.normalized),
  }))

  // Ontario DLs — surname_initial is the licence number's ACTUAL first
  // letter, as printed. Whether it mismatches anything is decided by
  // checkIdValidation, which knows every candidate surname (the name ON
  // the document, not just the form-provided applicant).
  const dls = extractOntarioDLs(text).map(d => ({
    raw: d.raw,
    normalized: d.normalized,
    format_valid: /^[A-Z]\d{4}-\d{5}-\d{5}$/.test(d.normalized),
    surname_initial: d.surname_initial as string | null,
  }))

  // OHIPs
  const ohips = extractOHIPs(text).map(o => ({
    ...o,
    format_valid: /^\d{4}-\d{3}-\d{3}$/.test(o.normalized),
  }))

  // Passports
  const passports = extractPassports(text)

  return { sins, ontario_dls: dls, ohips, passports }
}

// ── Flag generation ────────────────────────────────────────────────────────

import type { ForensicFlag } from './types'

/** Words that look like "SURNAME," in ID-card OCR text but are actually
 *  geography/boilerplate. Keeps address lines ("TORONTO, ON, M5V 0B8") from
 *  polluting the candidate-surname set. */
const NON_SURNAME_WORDS = new Set([
  'ON', 'ONTARIO', 'CANADA', 'TORONTO', 'OTTAWA', 'MISSISSAUGA', 'BRAMPTON',
  'HAMILTON', 'LONDON', 'MARKHAM', 'VAUGHAN', 'KITCHENER', 'WINDSOR',
  'RICHMOND', 'OAKVILLE', 'BURLINGTON', 'OSHAWA', 'BARRIE', 'GUELPH',
  'YORK', 'SCARBOROUGH', 'ETOBICOKE', 'NEPEAN', 'KANATA', 'WATERLOO',
  'LICENCE', 'LICENSE', 'PERMIS', 'CONDUIRE', 'NOM', 'NAME',
])

/** Every surname initial the DL number could legitimately start with:
 *  the name printed ON the document itself (OCR apparent_name + any
 *  "SURNAME," patterns in the text) plus the form-provided applicant.
 *  A co-applicant's ID legitimately differs from the form name — a real
 *  mismatch is one that matches NO name anywhere on the document. */
function candidateSurnameInitials(text: string, docName?: string | null, formSurname?: string): { initials: Set<string>; names: string[] } {
  const initials = new Set<string>()
  const names: string[] = []
  const add = (word: string | undefined) => {
    const w = (word || '').replace(/[^A-Za-z'’-]/g, '').toUpperCase()
    if (w.length >= 2 && !NON_SURNAME_WORDS.has(w)) {
      initials.add(w.charAt(0))
      names.push(w)
    }
  }
  // Name printed on the document ("BAJAJ, AANCHAL" or "Aanchal Bajaj") —
  // surname position varies, so take both first and last tokens.
  if (docName) {
    const tokens = docName.trim().split(/[\s,]+/).filter(Boolean)
    add(tokens[0])
    if (tokens.length > 1) add(tokens[tokens.length - 1])
  }
  // "SURNAME, GIVENNAME" patterns in the OCR text (Ontario cards print
  // "MEHROTTRA, KARAAN"). Require a name-like word AFTER the comma so
  // address lines ("AJAX, ON, L1S 2H5") can't inject city initials — a
  // stoplist alone can never enumerate every Ontario municipality.
  const PROVINCE_WORDS = new Set(['ONT', 'ONTARIO', 'QUEBEC', 'ALBERTA', 'MANITOBA', 'SASKATCHEWAN', 'CANADA', 'YUKON', 'NUNAVUT'])
  const re = /\b([A-Z][A-Z'’-]{1,25}),\s*\n?\s*([A-Z][A-Z'’-]{2,25})\b/g
  let m
  while ((m = re.exec(text))) {
    const second = m[2].toUpperCase()
    if (PROVINCE_WORDS.has(second) || NON_SURNAME_WORDS.has(second)) continue
    add(m[1])
  }
  // Form-provided applicant surname (may be a co-applicant — corroborating only)
  if (formSurname) add(formSurname)
  return { initials, names }
}

export function checkIdValidation(
  text: string,
  file: string,
  fileKind: string,
  surname?: string,
  docName?: string | null,
  /** true when `text` came from OCR of a photo/scan — a single misread digit
   *  on a GENUINE SIN fails Luhn, so OCR-sourced checksum failures are a
   *  verify-first signal, not proof of fabrication. */
  isOcrText?: boolean,
): ForensicFlag[] {
  // Only check ID-like documents. Application forms and credit reports often
  // contain ID numbers too, but the risk of false positives from noise is
  // higher there — limit to dedicated ID docs.
  // The set covers the kinds emitted by /api/classify-files plus historical
  // synonyms so we don't miss anything when classifier wording shifts.
  const ID_KINDS = new Set([
    'id',
    'id_document',
    'identity',
    'drivers_license',
    'driver_license',
    'driver_licence',
    'drivers_licence',
    'passport',
    'health_card',
    'health_insurance',
    'ohip',
    'permanent_resident',
    'pr_card',
    'work_permit',
    'study_permit',
    'application',
    'application_form',
    'lease_application',
  ])
  if (!ID_KINDS.has((fileKind || '').toLowerCase())) return []

  const flags: ForensicFlag[] = []
  const ids = extractAndValidateIds(text, surname)

  // SIN with bad Luhn checksum → strong forgery signal on machine-produced
  // text; on OCR text a single misread digit produces the same failure on a
  // genuine SIN, so it downgrades to a verify-first code that carries no
  // hard gate (id_sin_invalid_checksum is an identity_mismatch trigger).
  for (const sin of ids.sins) {
    if (!sin.luhn_valid) {
      if (isOcrText) {
        flags.push({
          code: 'id_sin_checksum_unverified',
          severity: 'medium',
          file,
          evidence_en: `SIN ${sin.normalized.slice(0, 3)}-***-${sin.normalized.slice(-3)} (read via OCR) fails the Luhn checksum. Real SINs always pass, but a single OCR misread produces the same failure — verify the number against the original document before drawing conclusions.`,
          evidence_zh: `SIN ${sin.normalized.slice(0, 3)}-***-${sin.normalized.slice(-3)}（OCR 识别）未通过 Luhn 校验。真实 SIN 必然通过校验，但 OCR 认错一个数字也会产生同样的结果——请先对照原件核实号码，再下结论。`,
        })
      } else {
        flags.push({
          code: 'id_sin_invalid_checksum',
          severity: 'critical',
          file,
          evidence_en: `SIN ${sin.normalized.slice(0, 3)}-***-${sin.normalized.slice(-3)} fails the Luhn checksum. Real SINs always pass — this is either fabricated or a typo that the applicant didn't bother to fix.`,
          evidence_zh: `SIN ${sin.normalized.slice(0, 3)}-***-${sin.normalized.slice(-3)} 未通过 Luhn 校验。真实的 SIN 必然通过此校验 — 这要么是伪造，要么是申请人没检查就提交的错号。`,
        })
      }
    }
  }

  // Ontario DL surname-initial check. The licence number must start with
  // the first letter of the surname printed ON THAT CARD — comparing against
  // the form-typed applicant name false-positives on every co-applicant's ID
  // (two people, two licences, one form name). So: flag ONLY when the DL
  // initial matches none of the document's own names AND not the form name.
  if (ids.ontario_dls.length > 0) {
    const { initials, names } = candidateSurnameInitials(text, docName, surname)
    for (const dl of ids.ontario_dls) {
      const initial = dl.surname_initial
      if (!initial) continue
      if (initials.size === 0) continue  // no name evidence at all — skip, don't guess
      if (initials.has(initial)) {
        // Positive: number matches a surname printed on the same document.
        const matched = names.find(n => n.charAt(0) === initial)
        flags.push({
          code: 'id_dl_surname_match',
          severity: 'info',
          file,
          evidence_en: `Ontario DL "${dl.normalized}" starts with "${initial}", matching the surname "${matched}" printed on the document — consistent with the province's licence-number encoding.`,
          evidence_zh: `安省驾照号 "${dl.normalized}" 首字母 "${initial}" 与证件上的姓氏 "${matched}" 吻合——符合安省驾照号编码规则。`,
        })
      } else {
        flags.push({
          code: 'id_dl_surname_mismatch',
          severity: 'high',
          file,
          evidence_en: `Ontario DL "${dl.normalized}" starts with "${initial}", which matches NO name on the document (${names.slice(0, 4).join(', ') || 'none legible'})${surname ? ` nor the applicant "${surname}"` : ''}. Ontario DL numbers always begin with the first letter of the holder's surname.`,
          evidence_zh: `安省驾照号 "${dl.normalized}" 首字母 "${initial}" 与证件上的任何姓名（${names.slice(0, 4).join('、') || '无可读姓名'}）${surname ? `及申请人 "${surname}" ` : ''}均不符。安省驾照号首字母必定为持照人姓氏首字母。`,
        })
      }
    }
  }

  // Ontario DL date-of-birth encoding. The last 6 digits of the 14-digit
  // number are YYMMDD of the holder's birth date, with +50 added to the
  // month for female holders (e.g. ...945701 = 1994/07/01, female).
  // Cross-checked against every date printed on the card that is old
  // enough to be a birth date (≥16 years back — ISS/EXP dates are recent,
  // so they never collide with this filter).
  if (ids.ontario_dls.length > 0) {
    const nowYear = new Date().getFullYear()
    // Two candidate pools with different evidentiary weight:
    //   labeledDob — dates explicitly marked DOB/DDN/BIRTH: authoritative,
    //     a non-matching encoding IS a mismatch flag.
    //   dobCandidates — any birth-eligible date on the doc: enough to
    //     CONFIRM a match, but their absence proves nothing (the real DOB
    //     may simply be printed in a format our regex doesn't capture),
    //     so no mismatch flag is raised from this pool alone.
    const labeledDob: string[] = []
    const labRe = /(?:DOB|DDN|BIRTH|NAISSANCE|出生)[^0-9]{0,20}(19\d{2}|20\d{2})[/\-](\d{2})[/\-](\d{2})/gi
    let lm
    while ((lm = labRe.exec(text))) {
      const month = Number(lm[2]), day = Number(lm[3])
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        labeledDob.push(`${lm[1].slice(2)}${lm[2]}${lm[3]}`)
      }
    }
    const dobCandidates: string[] = [...labeledDob]  // as "YYMMDD"
    const dateRe = /\b(19\d{2}|20\d{2})[/\-](\d{2})[/\-](\d{2})\b/g
    let dm
    while ((dm = dateRe.exec(text))) {
      const [, y, mo, d] = dm
      const year = Number(y), month = Number(mo), day = Number(d)
      if (month < 1 || month > 12 || day < 1 || day > 31) continue
      if (nowYear - year < 16 || nowYear - year > 100) continue
      dobCandidates.push(`${y.slice(2)}${mo}${d}`)
    }
    for (const dl of ids.ontario_dls) {
      const digits = dl.normalized.replace(/[^0-9]/g, '')
      if (digits.length !== 14 || dobCandidates.length === 0) continue
      const last6 = digits.slice(8)
      const yy = last6.slice(0, 2), mm = Number(last6.slice(2, 4)), dd = last6.slice(4)
      const decodedMonth = mm > 50 ? mm - 50 : mm  // +50 = female encoding
      if (decodedMonth < 1 || decodedMonth > 12 || Number(dd) < 1 || Number(dd) > 31) {
        // The digits cannot encode ANY calendar date — no valid Ontario
        // licence number has this shape.
        flags.push({
          code: 'id_dl_dob_mismatch',
          severity: 'high',
          file,
          evidence_en: `Ontario DL "${dl.normalized}" last 6 digits (${last6}) cannot encode any birth date (month ${mm} is invalid even after the female +50 adjustment). Genuine Ontario licence numbers always encode the holder's DOB as YYMMDD.`,
          evidence_zh: `安省驾照号 "${dl.normalized}" 末 6 位（${last6}）无法编码任何出生日期（月份 ${mm} 即使按女性 +50 调整后仍无效）。真实安省驾照号末 6 位必定是 YYMMDD 格式的出生日期。`,
        })
        continue
      }
      const decoded = `${yy}${String(decodedMonth).padStart(2, '0')}${dd}`
      if (dobCandidates.includes(decoded)) {
        flags.push({
          code: 'id_dl_dob_match',
          severity: 'info',
          file,
          evidence_en: `Ontario DL "${dl.normalized}" encodes birth date ${yy}/${String(decodedMonth).padStart(2, '0')}/${dd}${mm > 50 ? ' (female +50 month encoding)' : ''} in its last 6 digits, matching the DOB printed on the card — consistent with the province's encoding.`,
          evidence_zh: `安省驾照号 "${dl.normalized}" 末 6 位编码出生日期 ${yy}/${String(decodedMonth).padStart(2, '0')}/${dd}${mm > 50 ? '（女性月份 +50 编码）' : ''}，与卡面打印的出生日期吻合——符合安省编码规则。`,
        })
      } else if (labeledDob.length > 0) {
        // Only an explicitly-labeled DOB is authoritative enough to call a
        // mismatch — an unmatched pool of generic old dates proves nothing
        // (the real DOB may be printed in a format the regex doesn't read).
        flags.push({
          code: 'id_dl_dob_mismatch',
          severity: 'high',
          file,
          evidence_en: `Ontario DL "${dl.normalized}" last-6-digit birth-date encoding (${decoded}, after female +50 adjustment if any) contradicts the labeled DOB printed on the document (${labeledDob.join(', ')}). Genuine Ontario licences always encode the holder's DOB in the number.`,
          evidence_zh: `安省驾照号 "${dl.normalized}" 末 6 位的出生日期编码（${decoded}，已考虑女性 +50）与证件上标注的出生日期（${labeledDob.join('、')}）矛盾。真实安省驾照号必定编码持照人出生日期。`,
        })
      }
    }
  }

  // OHIP with wrong number of digits — extraction already filters, so a
  // format_valid=false result is genuinely malformed.
  for (const oh of ids.ohips) {
    if (!oh.format_valid) {
      flags.push({
        code: 'id_ohip_invalid_format',
        severity: 'medium',
        file,
        evidence_en: `Ontario Health Card "${oh.normalized}" does not match the 4-3-3 digit format.`,
        evidence_zh: `安省健康卡号 "${oh.normalized}" 格式不符合标准的 4-3-3 位数格式。`,
      })
    }
  }

  return flags
}

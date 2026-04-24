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
const ONTARIO_DL_RE = /\b([A-Z])(\d{4})[-\s]?(\d{5})[-\s]?(\d{5})\b/g

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
 * @param surname     (optional) extracted applicant surname, uppercase. Used
 *                    to cross-check Ontario DL first letter.
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

  // Ontario DLs — compare first letter with provided surname if we have one
  const surnameInitial = surname
    ? surname.trim().replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase()
    : null
  const dls = extractOntarioDLs(text).map(d => ({
    raw: d.raw,
    normalized: d.normalized,
    format_valid: /^[A-Z]\d{4}-\d{5}-\d{5}$/.test(d.normalized),
    surname_initial: surnameInitial && d.surname_initial !== surnameInitial
      ? null  // explicit mismatch — signal to caller
      : d.surname_initial,
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

export function checkIdValidation(
  text: string,
  file: string,
  fileKind: string,
  surname?: string,
): ForensicFlag[] {
  // Only check ID-like documents. Application forms and credit reports often
  // contain ID numbers too, but the risk of false positives from noise is
  // higher there — limit to dedicated ID docs for now.
  const ID_KINDS = new Set(['id', 'drivers_license', 'passport', 'health_card', 'application'])
  if (!ID_KINDS.has(fileKind)) return []

  const flags: ForensicFlag[] = []
  const ids = extractAndValidateIds(text, surname)

  // SIN with bad Luhn checksum → strong forgery signal
  for (const sin of ids.sins) {
    if (!sin.luhn_valid) {
      flags.push({
        code: 'id_sin_invalid_checksum',
        severity: 'critical',
        file,
        evidence_en: `SIN ${sin.normalized.slice(0, 3)}-***-${sin.normalized.slice(-3)} fails the Luhn checksum. Real SINs always pass — this is either fabricated or a typo that the applicant didn't bother to fix.`,
        evidence_zh: `SIN ${sin.normalized.slice(0, 3)}-***-${sin.normalized.slice(-3)} 未通过 Luhn 校验。真实的 SIN 必然通过此校验 — 这要么是伪造，要么是申请人没检查就提交的错号。`,
      })
    }
  }

  // Ontario DL with surname-initial mismatch → suspicious
  if (surname && ids.ontario_dls.length > 0) {
    const expectedInitial = surname.trim().charAt(0).toUpperCase()
    for (const dl of ids.ontario_dls) {
      if (dl.surname_initial === null) {
        flags.push({
          code: 'id_dl_surname_mismatch',
          severity: 'high',
          file,
          evidence_en: `Ontario DL "${dl.normalized}" starts with a letter that does not match the applicant's surname "${surname}" (expected "${expectedInitial}"). Ontario DL numbers always begin with the first letter of the surname.`,
          evidence_zh: `安省驾照号 "${dl.normalized}" 的首字母与申请人姓氏 "${surname}" 不符（应为 "${expectedInitial}"）。安省驾照号首字母必定为姓氏首字母。`,
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

// -----------------------------------------------------------------------------
// Document recency — how old is the evidence?
//
// 2026-09-12: a file screened in September 2026 carried an October 2024
// employment letter, August–October 2024 pay stubs and statements, an
// October 2024 bureau disclosure and a photo card that had expired in June.
// Nothing said so. A landlord's convention (and every lender's) is that
// income evidence must be recent — stubs and statements within 60–90 days,
// a letter within 90, a bureau report within 90 — and that identification
// must be valid on the day of the application.
//
// Every document's "as-of" date is read deterministically from its own
// text (period end, cheque date, letter date, report date, notice date) or
// from the ID's printed expiry. Flags are per file, plus one cross-document
// verdict on the income package as a whole.
// -----------------------------------------------------------------------------

import type { ForensicFlag, PerFileForensics } from './types'

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const toISO = (y: number, m: number, d: number) => (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
const yr2 = (s: string) => { const n = Number(s); return s.length === 2 ? (n > 50 ? 1900 + n : 2000 + n) : n }

/** Every date-like token in a text, as ISO strings. Handles
 *  2024-08-31 · 2024/08/31 · 10/25/2024 · Oct 20th 2024 · Oct 23, 2024 ·
 *  23 October 2024 · AUG 27/24 · SEP03 (TD row; year from elsewhere). */
export function extractDates(text: string, fallbackYear?: number): string[] {
  const t = (text || '').replace(/\s+/g, ' ')
  const out: string[] = []
  for (const m of t.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) { const v = toISO(+m[1], +m[2], +m[3]); if (v) out.push(v) }
  // 03/09/2026: Canadian exports print both MM/DD and DD/MM. An unambiguous
  // first field (>12) decides; otherwise take the reading that is not in
  // the future and closest to today (review 2026-09-13).
  const today = new Date().toISOString().slice(0, 10)
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) {
    const a = +m[1], b = +m[2], y = +m[3]
    const mdy = toISO(y, a, b), dmy = toISO(y, b, a)
    if (a > 12) { if (dmy) out.push(dmy); continue }
    if (b > 12) { if (mdy) out.push(mdy); continue }
    const past = [mdy, dmy].filter((v): v is string => !!v && v <= today).sort()
    const v = past.length ? past[past.length - 1] : (mdy || dmy)
    if (v) out.push(v)
  }
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g)) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) { const v = toISO(+m[3], mo, +m[2]); if (v) out.push(v) } }
  for (const m of t.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/g)) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) { const v = toISO(+m[3], mo, +m[1]); if (v) out.push(v) } }
  for (const m of t.matchAll(/\b([A-Z]{3})\s+(\d{1,2})\/(\d{2})\b/g)) { const mo = MONTHS[m[1].toLowerCase()]; if (mo) { const v = toISO(yr2(m[3]), mo, +m[2]); if (v) out.push(v) } }
  if (fallbackYear) for (const m of t.matchAll(/\b([A-Z]{3})(\d{2})\b/g)) { const mo = MONTHS[m[1].toLowerCase()]; if (mo) { const v = toISO(fallbackYear, mo, +m[2]); if (v) out.push(v) } }
  return out
}

export interface DocDate { as_of: string | null; expiry: string | null; basis: string }

const kindHas = (kind: string, k: string) => (kind || '').split(',').map(x => x.trim()).includes(k)

/** The date a document speaks for. */
export function documentAsOf(pf: PerFileForensics): DocDate {
  const kind = pf.file_kind || ''
  const text = `${pf.text_density?.text_sample || ''}\n${pf.ocr?.text || ''}`
  const flat = text.replace(/\s+/g, ' ')
  const none: DocDate = { as_of: null, expiry: null, basis: 'none' }
  const latest = (ds: string[]) => ds.length ? ds.slice().sort().reverse()[0] : null

  if (kindHas(kind, 'id_document')) {
    const exp = flat.match(/(?:EXP(?:IRY|IRES|IRATION)?|Expiry|Date of expiry)[^0-9A-Za-z]{0,12}(20\d{2}[-/]\d{2}[-/]\d{2}|\d{1,2}\s+[A-Z]{3}\s*\/?\s*[A-Z]{0,4}\s*\d{2,4}|[A-Z]{3}\s+\d{1,2},?\s+20\d{2})/i)
    let expiry: string | null = null
    if (exp) {
      const ds = extractDates(exp[1].replace(/\s*\/\s*[A-Z]{3,4}/, ''))
      expiry = ds[0] || null
      if (!expiry) { const m = exp[1].match(/(\d{1,2})\s+([A-Z]{3})\D+(\d{2})$/i); if (m) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) expiry = toISO(yr2(m[3]), mo, +m[1]) } }
    }
    return { as_of: null, expiry, basis: expiry ? 'printed expiry' : 'none' }
  }
  if (kindHas(kind, 'pay_stub')) {
    const pd = pf.paystub_math?.extraction?.pay_date
    if (pd && /^\d{4}-\d{2}-\d{2}/.test(pd)) return { as_of: pd.slice(0, 10), expiry: null, basis: 'pay date' }
    const ds = extractDates(flat)
    return { as_of: latest(ds), expiry: null, basis: ds.length ? 'latest date on stub' : 'none' }
  }
  if (kindHas(kind, 'bank_statement')) {
    const td = flat.match(/\b([A-Z]{3})\s+(\d{1,2})\/(\d{2})\s*-\s*([A-Z]{3})\s+(\d{1,2})\/(\d{2})\b/)
    if (td) { const mo = MONTHS[td[4].toLowerCase()]; const v = mo ? toISO(yr2(td[6]), mo, +td[5]) : null; if (v) return { as_of: v, expiry: null, basis: 'statement period end' } }
    // The period END: "… to July 2, 2026" first, then a closing-balance
    // date. The old alternation matched "Statement period June 3" — the
    // START — 30 days early (review 2026-09-13).
    const close = flat.match(/\bto\s+(?:on\s+)?([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2})/i)
      || flat.match(/Closing\s+Balance\s+(?:on\s+)?([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2})/i)
    if (close) { const ds = extractDates(close[1]); if (ds[0]) return { as_of: ds[0], expiry: null, basis: 'statement period end' } }
    const ds = extractDates(flat)
    return { as_of: latest(ds), expiry: null, basis: ds.length ? 'latest date on statement' : 'none' }
  }
  if (kindHas(kind, 'employment_letter') || kindHas(kind, 'offer_letter')) {
    // A labelled "Date:" wins; otherwise the latest date that is not in the
    // future. The first date in the header used to win — often the hire
    // date ("employed since March 15, 2019") (review 2026-09-13).
    const today = new Date().toISOString().slice(0, 10)
    const labelled = flat.match(/\b(?:date|dated)\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+20\d{2}|20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\/\d{1,2}\/20\d{2})/i)
    if (labelled) { const ds = extractDates(labelled[1]); if (ds[0]) return { as_of: ds[0], expiry: null, basis: 'letter date' } }
    const all = extractDates(flat).filter(d => d <= today)
    return { as_of: latest(all), expiry: null, basis: all.length ? 'latest date in letter' : 'none' }
  }
  if (kindHas(kind, 'credit_report')) {
    const m = flat.match(/(?:as of|Updated on|Request Date|Report Date|Credit Score as of|reviewed by[^.]{0,60}on)\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2}|\d{1,2}\/\d{1,2}\/20\d{2}|20\d{2}[-/]\d{2}[-/]\d{2})/i)
    if (m) { const ds = extractDates(m[1]); if (ds[0]) return { as_of: ds[0], expiry: null, basis: 'report date' } }
    const ds = extractDates(flat)
    return { as_of: latest(ds), expiry: null, basis: ds.length ? 'latest date on report' : 'none' }
  }
  const noa = flat.match(/Date issued\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+20\d{2})/i)
  if (noa) { const ds = extractDates(noa[1]); if (ds[0]) return { as_of: ds[0], expiry: null, basis: 'notice date' } }
  const tax = flat.match(/Tax year\s*:?\s*(20\d{2})/i)
  if (tax) return { as_of: `${tax[1]}-12-31`, expiry: null, basis: 'tax year' }
  return none
}

const daysBetween = (a: string, b: Date) => Math.round((b.getTime() - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export interface RecencyResult {
  /** median age in days of the income documents (stubs, statements, letters) */
  income_docs_median_age_days: number | null
  per_file: Array<{ file: string; kind: string; as_of: string | null; expiry: string | null; age_days: number | null }>
}

/** Per-file staleness and ID validity, plus the package verdict. Mutates
 *  pf.flags; returns cross-document flags and the summary. */
export function checkRecency(perFile: PerFileForensics[], now: Date = new Date()): { result: RecencyResult; crossFlags: ForensicFlag[] } {
  const crossFlags: ForensicFlag[] = []
  const rows: RecencyResult['per_file'] = []
  const incomeAges: number[] = []
  let idCount = 0, idExpired = 0
  for (const pf of perFile) {
    const kind = pf.file_kind || ''
    const d = documentAsOf(pf)
    const age = d.as_of ? daysBetween(d.as_of, now) : null
    rows.push({ file: pf.file_name, kind, as_of: d.as_of, expiry: d.expiry, age_days: age })
    if (kindHas(kind, 'id_document')) {
      idCount++
      if (d.expiry) {
        const left = -daysBetween(d.expiry, now)
        if (left < 0) {
          idExpired++
          pf.flags.push({ code: 'id_expired', severity: 'medium', file: pf.file_name,
            evidence_en: `The identification expired on ${d.expiry} (${-left} days before this screening). An expired ID cannot be used to verify identity; ask for a current one.`,
            evidence_zh: `证件已于 ${d.expiry} 过期（早于本次筛查 ${-left} 天）。过期证件不能用于身份核验，请要求提供有效证件。` })
        } else if (left <= 30) {
          pf.flags.push({ code: 'id_expiring_soon', severity: 'info', file: pf.file_name,
            evidence_en: `The identification expires on ${d.expiry} (${left} days). Valid today; a renewed ID will be needed for the lease.`,
            evidence_zh: `证件将于 ${d.expiry} 到期（${left} 天后）。目前有效；签约前需要更新后的证件。` })
        }
      }
      continue
    }
    const income = kindHas(kind, 'pay_stub') || kindHas(kind, 'bank_statement') || kindHas(kind, 'employment_letter')
    const bureau = kindHas(kind, 'credit_report')
    if (age === null || age < 0) continue
    // A prior-year NOA or T4 is what a lender asks for; its age is the tax
    // year, not staleness. Only income and bureau documents go stale
    // (review 2026-09-13).
    if (!income && !bureau) continue
    if (income) incomeAges.push(age)
    const limit = income ? 90 : bureau ? 90 : 400
    if (age > limit) {
      const months = Math.round(age / 30)
      const sev: ForensicFlag['severity'] = age > 365 ? 'high' : 'medium'
      pf.flags.push({ code: 'document_stale', severity: sev, file: pf.file_name,
        evidence_en: `This ${kind.replace(/_/g, ' ')} speaks for ${d.as_of} (${d.basis}) — ${months} months before this screening. Landlords and lenders take income and bureau evidence within 90 days; ${age > 365 ? 'a document over a year old describes a different financial situation and cannot support today\'s application on its own' : 'ask for a current one'}.`,
        evidence_zh: `这份${kind.includes('pay_stub') ? '工资单' : kind.includes('bank') ? '对账单' : kind.includes('employment') ? '在职信' : bureau ? '信用报告' : '文件'}反映的是 ${d.as_of}（${d.basis}）的情况——距本次筛查 ${months} 个月。房东和银行只接受 90 天内的收入与征信证据；${age > 365 ? '超过一年的文件描述的是另一段财务状况，不能单独支撑今天的申请' : '请要求提供最新的'}。` })
    }
  }
  const median = incomeAges.length ? incomeAges.slice().sort((a, b) => a - b)[Math.floor(incomeAges.length / 2)] : null
  if (median !== null && median > 180) {
    crossFlags.push({ code: 'income_package_stale', severity: median > 365 ? 'high' : 'medium',
      evidence_en: `The income documents (stubs, statements, letter) are on median ${Math.round(median / 30)} months old. They describe the applicant's finances as they were then, not now: employment, balances and debts may all have changed. Treat income as unverified until current documents arrive.`,
      evidence_zh: `收入类文件（工资单、对账单、在职信）的中位年龄为 ${Math.round(median / 30)} 个月。它们描述的是当时而非现在的财务状况：工作、余额、负债都可能已变。在拿到最新文件前，收入按未核验处理。` })
  }
  if (idCount > 0 && idExpired === idCount) {
    crossFlags.push({ code: 'all_ids_expired', severity: 'high',
      evidence_en: `Every identification document in the file has expired. Identity cannot be verified from this package.`,
      evidence_zh: `文件中所有身份证件均已过期，无法据此核验身份。` })
  }
  return { result: { income_docs_median_age_days: median, per_file: rows }, crossFlags }
}

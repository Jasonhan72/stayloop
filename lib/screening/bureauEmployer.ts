// Why the bureau's "current employer" differs from the letter (2026-09-22,
// case 28). Equifax / TransUnion do not learn where someone works; the
// employer line is copied from the last credit APPLICATION a lender sent
// them. If nothing was applied for since the new job started, the file
// still names the old employer — by construction, not by anyone's fault.
// The user's instruction: do not read that as "the letter is fake"; find
// the reason. This finds it deterministically.

export interface BureauEmployerInput {
  bureau_employer: string | null | undefined
  /** employer the letter / stubs name */
  current_employer: string | null | undefined
  /** employment start per the letter, YYYY-MM-DD (or YYYY-MM) */
  employment_start: string | null | undefined
  /** dates of hard inquiries on the file (any parseable form) */
  hard_inquiry_dates?: Array<string | null | undefined>
  /** tradeline open dates */
  account_open_dates?: Array<string | null | undefined>
  /** employers the application lists (current + previous) */
  application_employers?: string[]
}

export interface BureauEmployerVerdict {
  kind: 'same' | 'stale_by_construction' | 'previous_on_application' | 'unexplained' | 'insufficient'
  bureau_employer?: string
  last_credit_event?: string | null
  explanation_zh: string
  explanation_en: string
}

const key = (s: string) => s.toLowerCase().replace(/\b(inc|ltd|limited|corp|corporation|co|the|international|canada|group|services?)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
const sameEmployer = (a: string, b: string) => { const x = key(a), y = key(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)) }

export function toIsoLoose(d: string | null | undefined): string | null {
  if (!d) return null
  const s = String(d).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] || '01').padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) { const a = +m[1], b = +m[2]; const [mo, dd] = a > 12 ? [b, a] : [a, b]; return `${m[3]}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}` }
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null
}

export function explainBureauEmployer(inp: BureauEmployerInput): BureauEmployerVerdict {
  const be = (inp.bureau_employer || '').trim()
  const cur = (inp.current_employer || '').trim()
  if (!be || !cur) return { kind: 'insufficient', explanation_zh: '', explanation_en: '' }
  if (sameEmployer(be, cur)) return { kind: 'same', bureau_employer: be, explanation_zh: '征信档雇主与在职信一致。', explanation_en: 'The bureau employer matches the letter.' }
  const start = toIsoLoose(inp.employment_start)
  const events = [...(inp.hard_inquiry_dates || []), ...(inp.account_open_dates || [])].map(toIsoLoose).filter((x): x is string => !!x).sort()
  const last = events.length ? events[events.length - 1] : null
  const onApp = (inp.application_employers || []).some(e => sameEmployer(e, be))
  if (start && last && last < start) {
    return {
      kind: 'stale_by_construction', bureau_employer: be, last_credit_event: last,
      explanation_zh: `征信档写的雇主是「${be}」，与在职信的 ${cur} 不同——这不是矛盾。征信局只在申请人申请信贷时才从贷款方那里更新雇主字段；档案上最近一次硬查询 / 开户是 ${last}，早于在职信所称的入职日 ${start}，所以档案上仍是上一份工作${onApp ? '（申请表也把它列为前雇主）' : ''}。核实现职请直接联系 ${cur} 的 HR。`,
      explanation_en: `The bureau lists "${be}" as employer while the letter names ${cur} — not a contradiction. Bureaus refresh the employer line only when a lender sends a credit application; the last hard inquiry / account opening on this file is ${last}, before the ${start} start date the letter gives, so the file still carries the previous job${onApp ? ' (the application lists it as a previous employer)' : ''}. Verify the current job with ${cur}'s HR.`,
    }
  }
  if (onApp) {
    return {
      kind: 'previous_on_application', bureau_employer: be, last_credit_event: last,
      explanation_zh: `征信档雇主「${be}」是申请表上列出的前雇主；征信局的雇主字段只随信贷申请更新，滞后是常态。核实现职请联系 ${cur} 的 HR。`,
      explanation_en: `The bureau employer "${be}" is the previous employer on the application; the bureau's employer line lags credit applications by design. Verify the current job with ${cur}'s HR.`,
    }
  }
  return {
    kind: 'unexplained', bureau_employer: be, last_credit_event: last,
    explanation_zh: `征信档雇主「${be}」与在职信的 ${cur} 不同，且档案上 ${last ? `${last} 之后` : '近期'}有信贷活动、申请表也没列出「${be}」——向 ${cur} 的 HR 核实现职，并问申请人「${be}」是哪段经历。`,
    explanation_en: `The bureau employer "${be}" differs from ${cur} on the letter, there is credit activity ${last ? `after ${last}` : 'recently'}, and the application does not list "${be}" — verify the job with ${cur}'s HR and ask the applicant about "${be}".`,
  }
}

/** Dates of credit events on a bureau report's own text: Equifax inquiry
 *  rows whose "May affect scores" column is Yes (hard), and tradeline
 *  "Opened" dates. Enough to know whether anything could have refreshed the
 *  employer line after a given date. */
export function bureauCreditEventDates(text: string | null | undefined): { hard_inquiries: string[]; opened: string[] } {
  const t = (text || '').replace(/\s+/g, ' ')
  const hard: string[] = []
  for (const m of t.matchAll(/(\d{4}\/\d{2}\/\d{2})\s+\S+\s+[A-Z][A-Z0-9 .,&'()-]{2,60}?\s+(?:\d{3}-\d{3}-\d{4}\s+)?Yes\b/g)) hard.push(m[1].replace(/\//g, '-'))
  // TransUnion prints "Hard" / "Credit Related" tables: a date within an
  // inquiry row followed by the word Hard
  for (const m of t.matchAll(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})[^.]{0,80}?\bHard\b/gi)) { const iso = toIsoLoose(m[1]); if (iso) hard.push(iso) }
  const opened: string[] = []
  for (const m of t.matchAll(/\bOpened\s+(\d{4}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/g)) { const iso = toIsoLoose(m[1]); if (iso) opened.push(iso) }
  return { hard_inquiries: Array.from(new Set(hard)), opened: Array.from(new Set(opened)) }
}

/** "Employment Type Current GTS SERVICES" / "Employer: Acme Ltd" on the report text. */
export function bureauEmployerFromText(text: string | null | undefined): string | null {
  const t = (text || '').replace(/\s+/g, ' ')
  // Equifax consumer PDF flattens the table to "Employment Type Employer
  // Name Current GTS SERVICES Credit Report …"; older layouts print
  // "Employment Type Current GTS SERVICES".
  const m = t.match(/Employment(?:\s+Type)?(?:\s+Employer\s+Name)?\s+Current\s+([A-Z][A-Z0-9 .,&'()-]{2,60}?)(?=\s+(?:Previous|Occupation|Date|Employer|Address|Other|Telephone|Credit\s+Report|Page\b|$))/)
    || t.match(/\bEmployer\s*:?\s+([A-Z][A-Z0-9 .,&'()-]{2,60}?)(?=\s+(?:Occupation|Date|Address|Previous|Telephone|Reported)\b)/)
  return m ? m[1].trim() : null
}

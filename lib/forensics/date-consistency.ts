// -----------------------------------------------------------------------------
// Document-date vs file-date consistency.
//
// A PDF's CreationDate cannot legitimately be YEARS before the date printed on
// the document itself. Case 24 (2026-08-21): three "July 2026" pay stubs were
// all created 2023-08-10 in Excel and modified 2026-08-13; an employment
// letter dated August 3rd, 2026 was created 2024-12-12 (title
// "NEHroughemploy.docx"). Both are textbook template reuse — and both sailed
// through because nothing compared the file's own timestamps against the
// date the document claims for itself.
//
// Two questions, answered per document:
//   1. What date does the document say it is?  (extractDocumentDate)
//   2. Is the file's CreationDate compatible with that?  (checkDocumentDateConsistency)
//
// Pure functions, no I/O — unit-tested in tests/forensicsDates.spec.ts.
// -----------------------------------------------------------------------------

import type { ForensicFlag } from './types'

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * The date a document claims for itself, as an ISO day — or null when no
 * unambiguous date is printed. Per-kind preference:
 *   credit_report    "Request Date YYYY/MM/DD" / "as of YYYY/MM/DD"
 *   pay_stub         "PAYMENT DATE: YYYYMMDD" / "Pay Date" / "Cheque Date"
 *   employment_letter / reference  the first long-form date ("August 3rd, 2026",
 *                    "3 August 2026", "2026-08-03")
 *   bank_statement   "Statement Date" / "Statement Period ... to <date>"
 * Numeric MM/DD/YYYY vs DD/MM/YYYY is ambiguous and deliberately NOT parsed
 * unless the day field exceeds 12 (then the order is provable).
 */
export function extractDocumentDate(kind: string, text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.replace(/\s+/g, ' ')

  const ymdSlash = (s: string) => {
    const m = s.match(/((?:19|20)\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)
    return m ? iso(+m[1], +m[2], +m[3]) : null
  }
  const compact = (s: string) => {
    const m = s.match(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/)
    return m ? iso(+m[1], +m[2], +m[3]) : null
  }
  const longForm = (s: string) => {
    // "August 3rd, 2026" / "Aug 3, 2026" / "3 August 2026" / "3rd of August, 2026"
    let m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{2})\b/)
    if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2])
    m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+((?:19|20)\d{2})\b/)
    if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1])
    return null
  }
  const labelled = (labels: RegExp): string | null => {
    const m = t.match(labels)
    if (!m) return null
    const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 40)
    return ymdSlash(after) || compact(after) || longForm(after)
  }

  switch (kind) {
    case 'credit_report':
      return labelled(/Request\s+Date\s*:?/i) || labelled(/\bas\s+of\s*:?/i) || labelled(/Report\s+Date\s*:?/i)
    case 'pay_stub': {
      const l = labelled(/(?:PAYMENT|PAY|CHEQUE|CHECK|DEPOSIT)\s+DATE\s*:?/i) || labelled(/\bPay\s+Day\s*:?/i)
      if (l) return l
      // pdf.js text order can separate a label from its value ("PAYMENT
      // DATE: PAY END DATE : … 20260703 20260627"). Fall back to the LATEST
      // compact YYYYMMDD anywhere on the stub — the payment date is never
      // earlier than the period-end date printed beside it.
      const all = Array.from(t.matchAll(/\b((?:19|20)\d{2})(\d{2})(\d{2})\b/g)).map(m => iso(+m[1], +m[2], +m[3])).filter((d): d is string => !!d)
      return all.length ? all.sort().pop()! : null
    }
    case 'bank_statement':
      return labelled(/Statement\s+(?:Date|Period|Ending|End)\s*:?(?:[^0-9]{0,25}\bto\b)?/i)
    case 'employment_letter':
    case 'offer_letter':
    case 'reference':
      return longForm(t) || ymdSlash(t)
    default:
      return null
  }
}

const DAY = 86_400_000

/**
 * Compare the file's own timestamps against the date printed on the document.
 *   · CreationDate more than 30 days BEFORE the document's date → the file
 *     predates the document it claims to be: template reuse. HIGH. (Payroll
 *     systems do pre-generate stubs, but by days, never by months.)
 *   · Financial kinds: ModDate more than 30 days after CreationDate → the file
 *     was revised long after it was produced. MEDIUM — honest re-saves exist,
 *     but a bank/bureau/payroll export is written once.
 */
export function checkDocumentDateConsistency(args: {
  kind: string
  file: string
  creation_date: string | null | undefined
  modification_date: string | null | undefined
  document_date: string | null | undefined
}): ForensicFlag[] {
  const flags: ForensicFlag[] = []
  const { kind, file } = args
  const created = args.creation_date ? Date.parse(args.creation_date) : NaN
  const modified = args.modification_date ? Date.parse(args.modification_date) : NaN
  const docDate = args.document_date ? Date.parse(`${args.document_date}T00:00:00Z`) : NaN

  const DATE_KINDS = new Set(['pay_stub', 'employment_letter', 'offer_letter', 'credit_report', 'bank_statement', 'reference'])
  if (!DATE_KINDS.has(kind)) return flags

  if (Number.isFinite(created) && Number.isFinite(docDate)) {
    const daysBefore = Math.round((docDate - created) / DAY)
    if (daysBefore > 30) {
      flags.push({
        code: 'pdf_created_before_document_date',
        severity: 'high',
        file,
        evidence_en: `The PDF was created ${daysBefore} days BEFORE the date printed on the document (file created ${args.creation_date!.slice(0, 10)}, document dated ${args.document_date}). A file cannot predate the document it claims to be — this is the signature of an older file reused as a template with the dates and figures changed.`,
        evidence_zh: `PDF 文件的创建时间比文件上印的日期早 ${daysBefore} 天（文件创建于 ${args.creation_date!.slice(0, 10)}，文件自称日期 ${args.document_date}）。文件不可能早于它所声称的那份文件存在——这是拿旧文件当模板、改日期改数字的典型特征。`,
      })
    }
  }

  const REVISION_KINDS = new Set(['pay_stub', 'credit_report', 'bank_statement'])
  if (REVISION_KINDS.has(kind) && Number.isFinite(created) && Number.isFinite(modified)) {
    const gapDays = Math.round((modified - created) / DAY)
    if (gapDays > 30) {
      flags.push({
        code: 'pdf_modified_long_after_creation',
        severity: 'medium',
        file,
        evidence_en: `The PDF was modified ${gapDays} days after it was created (created ${args.creation_date!.slice(0, 10)}, last modified ${args.modification_date!.slice(0, 10)}). Bank, bureau and payroll exports are written once; a revision months later means the file was reopened and re-saved by an editor.`,
        evidence_zh: `PDF 在创建 ${gapDays} 天后被修改过（创建 ${args.creation_date!.slice(0, 10)}，最后修改 ${args.modification_date!.slice(0, 10)}）。银行/征信局/工资系统导出的文件是一次写成的；数月之后的修改意味着文件被编辑器重新打开并保存过。`,
      })
    }
  }
  return flags
}


/**
 * Two DIFFERENT dates printed where a document should carry one. Case 24's
 * Equifax report: the text layer still held the original "Request Date
 * 2026/03/27" under a white rectangle, with a visible "as of 2026/05/27"
 * laid on top — two report dates in one file. Genuine bureau output has one.
 */
export function checkDocumentDateConflicts(kind: string, file: string, text: string | null | undefined): ForensicFlag[] {
  if (kind !== 'credit_report' || !text) return []
  const t = text.replace(/\s+/g, ' ')
  const found = new Set<string>()
  const re = /(?:Request\s+Date|\bas\s+of|Report\s+Date)\s*:?\s*((?:19|20)\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const d = iso(+m[1], +m[2], +m[3])
    if (d) found.add(d)
  }
  if (found.size < 2) return []
  const list = Array.from(found).sort().join(', ')
  return [{
    code: 'credit_report_date_conflict',
    severity: 'high',
    file,
    evidence_en: `The report's text layer carries ${found.size} different report dates (${list}). A bureau disclosure is generated for one date; a second date still present underneath the visible one is the signature of text covered by an overlay and re-labelled.`,
    evidence_zh: `报告文字层里有 ${found.size} 个不同的报告日期（${list}）。征信报告只为一个日期生成；可见日期之下还残留另一个日期，是「白色图层覆盖、重新标注」的典型痕迹。`,
  }]
}

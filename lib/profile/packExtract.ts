// Reading a pay stub or an employment letter for the applicant pack (2026-11-25) — what the model
// is asked for and what is allowed back. Used by POST /api/profile/extract, which the AI
// conversation's pack card calls (components/agent/PackFillChatCard); nothing is stored by either
// until the applicant confirms on the card.
//
// The extraction is an accelerator, not a source of truth (the rule since the lease import): every
// value it yields is shown to the applicant, editable, and goes into the pack only when confirmed —
// it stays self-declared. The sanitizer's job is narrower: only the pack's own columns, each in its
// own shape, and never an identifier. There is no field here for a SIN, an ID or account number, a
// date of birth or a health number, so one cannot come back even if the model writes it.
//
// There is no free-text field either. The first real read (2026-11-25) came back with a note saying
// the pay stub and the letter disagreed — they agreed to the dollar. A model's remark on an
// applicant's own documents is a risk with nothing to gain, so the model is not asked for one and
// none can come back; what the card warns about is checked here in code (lib/profile/packFill.ts nameDiffers).
//
// The income is never the model's arithmetic: it reports the gross pay as printed and how often it
// is paid, and `monthlyFromPay` converts. An hourly rate is not converted — the hours are not known.
import { EMPLOYMENT_STATUS_LABEL } from './exportPack'
import { PROFILE_FILE_KIND_IDS, type ProfileFileKind } from './types'
import { emailShapeOk } from '@/lib/validation/emailShape'

export type PayPeriod = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'annual'
export type PackPay = { amount: number; period: PayPeriod }
export type PackFileRead = { kind: ProfileFileKind | null; as_of: string | null }

export interface PackExtraction {
  first_name: string | null
  last_name: string | null
  employment_status: string | null
  employer_name: string | null
  job_title: string | null
  employment_start_date: string | null
  employer_phone: string | null
  employer_email: string | null
  /** Gross pay as printed and how often — kept so the card can say what the monthly figure was worked out from. */
  pay: PackPay | null
  /** Derived from `pay` here, never by the model. */
  monthly_income: number | null
  /** One entry per file sent, in order: what kind of document it is and its own date. */
  files: PackFileRead[]
}

export const PACK_EXTRACT_MAX_FILES = 3
export const PACK_EXTRACT_MAX_BYTES = 10 * 1024 * 1024
/** What the model can read: PDFs and the image types the providers take (a HEIC photo can be kept in the pack but not read). */
export const PACK_EXTRACT_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp))$/

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const PER_YEAR: Record<PayPeriod, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, annual: 1 }

const line = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, max) : null
}
/** A person's name part: letters (any script), spaces, hyphens, apostrophes, dots — no digits, no symbols. */
const namePart = (v: unknown): string | null => {
  const s = line(v, 60)
  return s && /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(s) ? s : null
}
const validDay = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const pastDate = (v: unknown, today: string): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, 10) : ''
  return ISO_DATE.test(s) && validDay(s) && s >= '1960-01-01' && s <= today ? s : null
}
const phone = (v: unknown): string | null => {
  const s = line(v, 30)
  if (!s || !/^[\d\s()+.x#-]+$/i.test(s)) return null
  const digits = s.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15 ? s : null
}

/** Gross monthly income from pay as printed: yearly total over twelve, to the dollar; null outside a plausible range. */
export function monthlyFromPay(pay: PackPay | null): number | null {
  if (!pay) return null
  const monthly = Math.round((pay.amount * PER_YEAR[pay.period]) / 12)
  return monthly >= 100 && monthly <= 100_000 ? monthly : null
}

function payOf(v: unknown): PackPay | null {
  if (!v || typeof v !== 'object') return null
  const o = v as { amount?: unknown; period?: unknown }
  const amount = typeof o.amount === 'number' ? o.amount : typeof o.amount === 'string' ? Number(o.amount.replace(/[$,\s]/g, '')) : NaN
  const period = typeof o.period === 'string' ? o.period.toLowerCase().replace(/[^a-z]/g, '') : ''
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null
  if (!(period in PER_YEAR)) return null
  return { amount: Math.round(amount * 100) / 100, period: period as PayPeriod }
}

/** What is allowed into the card from the model's answer. `fileCount` is how many files were sent; `today` is a Toronto date. */
export function sanitizePackExtraction(raw: unknown, fileCount: number, today: string): PackExtraction {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const status = typeof o.employment_status === 'string' ? o.employment_status.trim().toLowerCase() : ''
  const email = line(o.employer_email, 120)
  const pay = payOf(o.pay)
  const list = Array.isArray(o.files) ? o.files : []
  const files: PackFileRead[] = []
  for (let i = 0; i < Math.max(0, Math.min(fileCount, PACK_EXTRACT_MAX_FILES)); i++) {
    const f = (list[i] && typeof list[i] === 'object' ? list[i] : {}) as { kind?: unknown; as_of?: unknown }
    const kind = typeof f.kind === 'string' && (PROFILE_FILE_KIND_IDS as string[]).includes(f.kind) ? (f.kind as ProfileFileKind) : null
    const day = typeof f.as_of === 'string' ? f.as_of.trim().slice(0, 10) : ''
    // an ID's own date is its expiry, which lies ahead; every other document is dated today or earlier
    const as_of = kind === 'id' ? (ISO_DATE.test(day) && validDay(day) && day >= '1960-01-01' ? day : null) : pastDate(day, today)
    files.push({ kind, as_of })
  }
  return {
    first_name: namePart(o.first_name),
    last_name: namePart(o.last_name),
    employment_status: status in EMPLOYMENT_STATUS_LABEL ? status : null,
    employer_name: line(o.employer_name, 120),
    job_title: line(o.job_title, 80),
    employment_start_date: pastDate(o.employment_start_date, today),
    employer_phone: phone(o.employer_phone),
    employer_email: email && emailShapeOk(email) ? email : null,
    pay,
    monthly_income: monthlyFromPay(pay),
    files,
  }
}

export const PACK_EXTRACT_PROMPT = `You are reading documents a rental applicant chose to put in their own application pack: usually a pay stub and an employment or offer letter, sometimes a bank statement, a government ID, a credit report or a reference letter. Read what is printed. Reply with ONE JSON object and nothing else:

{
  "first_name": the employee's given name as printed, or null,
  "last_name": the employee's family name as printed, or null,
  "employment_status": one of "employed" | "self_employed" | "student" | "retired" | "unemployed" | "other" — only when a document states it or plainly shows it (a pay stub or an employment letter shows "employed"), else null,
  "employer_name": the employer's name as printed, or null,
  "job_title": the job title as printed, or null,
  "employment_start_date": "YYYY-MM-DD" the start / hire date as printed, or null,
  "employer_phone": the employer's or HR contact's phone number as printed, or null,
  "employer_email": the employer's or HR contact's e-mail address as printed, or null,
  "pay": { "amount": the GROSS pay for one pay period, or the gross salary, as printed (a number), "period": "weekly" | "biweekly" | "semimonthly" | "monthly" | "annual" } or null,
  "files": [ one object per document, in the order given: { "kind": "id" | "paystub" | "bank_statement" | "employment_letter" | "credit_report" | "reference" | "other", "as_of": "YYYY-MM-DD" the document's own date (pay date, statement end date, letter date, ID expiry) or null } ]
}

Rules:
- Only what is printed. If you are not sure, use null. Never guess, never fill a gap.
- "pay": report the gross figure exactly as printed and its period; do NOT convert it to monthly. If only an hourly rate is printed, use null.
- NEVER output a Social Insurance Number, an ID / licence / passport number, a bank account number, a date of birth, a health card number or a home address — not in any field.
- Output these keys only. No remarks, no summary, no comparison between the documents, no comment on whether the income is enough.`

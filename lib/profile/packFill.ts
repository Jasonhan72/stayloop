// What the AI conversation's pack card proposes, and what it writes (2026-11-25). Pure.
//
// Three rules, the ones the 「申请加入」 form already follows (lib/onboard/assist.ts):
//   · only what is still empty in the pack is proposed — a value the applicant typed is never
//     replaced by a value a model read;
//   · every proposed value is editable and is written only when the applicant confirms it;
//   · the consent box, the date of birth, the rental history and everything about the household are
//     not here at all: they are the applicant's own to enter on the passport page.
import { EMPLOYMENT_STATUS_LABEL } from './exportPack'
import type { PackExtraction, PackPay } from './packExtract'
import type { ApplicantProfile } from './types'
import { emailShapeOk, EMAIL_SHAPE_MESSAGE } from '@/lib/validation/emailShape'

export const PACK_FILL_FIELDS = ['first_name', 'last_name', 'employment_status', 'employer_name', 'job_title', 'employment_start_date', 'monthly_income', 'employer_phone', 'employer_email'] as const
export type PackFillField = (typeof PACK_FILL_FIELDS)[number]
export type PackFillValues = Partial<Record<PackFillField, string>>

/** The passport page's own labels for these fields (components/profile/ProfileSections.tsx). */
export const PACK_FILL_LABEL: Record<PackFillField, { zh: string; en: string }> = {
  first_name: { zh: '名', en: 'First name' },
  last_name: { zh: '姓', en: 'Last name' },
  employment_status: { zh: '雇佣状态', en: 'Employment status' },
  employer_name: { zh: '雇主', en: 'Employer' },
  job_title: { zh: '职位', en: 'Job title' },
  employment_start_date: { zh: '入职日期', en: 'Start date' },
  monthly_income: { zh: '月收入（税前，$）', en: 'Monthly income (gross, $)' },
  employer_phone: { zh: '雇主电话', en: 'Employer phone' },
  employer_email: { zh: '雇主邮箱', en: 'Employer email' },
}

const isEmpty = (field: PackFillField, p: Partial<ApplicantProfile> | null | undefined): boolean => {
  const v = p?.[field]
  if (field === 'monthly_income') return !(typeof v === 'number' && v > 0)
  return v === null || v === undefined || String(v).trim() === ''
}

/**
 * What the card proposes: for each field the documents showed, the value — but only where the pack
 * has nothing. `kept` are the fields the documents also showed that the pack already holds, which stay as they are.
 */
export function packSuggestion(current: Partial<ApplicantProfile> | null | undefined, x: PackExtraction): { fill: PackFillValues; kept: PackFillField[] } {
  const fill: PackFillValues = {}
  const kept: PackFillField[] = []
  for (const f of PACK_FILL_FIELDS) {
    const read = f === 'monthly_income' ? (x.monthly_income != null ? String(x.monthly_income) : null) : x[f]
    if (!read) continue
    if (isEmpty(f, current)) fill[f] = read
    else kept.push(f)
  }
  return { fill, kept }
}

/** Why the values cannot be written yet, in the reader's language — or null. */
export function packFillError(values: PackFillValues, zh: boolean): string | null {
  const income = (values.monthly_income ?? '').trim()
  if (income && !(Number(income) > 0 && Number(income) <= 1_000_000)) return zh ? '月收入请填一个数字。' : 'Monthly income must be a number.'
  const day = (values.employment_start_date ?? '').trim()
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return zh ? '入职日期的格式应为 YYYY-MM-DD。' : 'The start date must be YYYY-MM-DD.'
  const status = (values.employment_status ?? '').trim()
  if (status && !(status in EMPLOYMENT_STATUS_LABEL)) return zh ? '雇佣状态请从列表里选。' : 'Choose an employment status from the list.'
  const email = (values.employer_email ?? '').trim()
  if (email && !emailShapeOk(email)) return zh ? EMAIL_SHAPE_MESSAGE.zh : EMAIL_SHAPE_MESSAGE.en
  return null
}

/** The columns to write for the values the applicant confirmed: blanks are left out, the income is a number. */
export function packPatch(values: PackFillValues): Partial<ApplicantProfile> {
  const out: Partial<ApplicantProfile> = {}
  for (const f of PACK_FILL_FIELDS) {
    const v = (values[f] ?? '').trim()
    if (!v) continue
    if (f === 'monthly_income') { const n = Math.round(Number(v)); if (n > 0) out.monthly_income = n }
    else out[f] = v.slice(0, 200)
  }
  return out
}

const nameKey = (first: string | null | undefined, last: string | null | undefined) => `${first ?? ''} ${last ?? ''}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * The documents carry one full name and the pack another: both names as written, so the card can
 * say so — the pack's name is never changed by a read, and a document in someone else's name is
 * the applicant's to notice. Null when either side has no full name, or they are the same.
 */
export function nameDiffers(current: Partial<ApplicantProfile> | null | undefined, x: Pick<PackExtraction, 'first_name' | 'last_name'> | null | undefined): { doc: string; pack: string } | null {
  if (!x?.first_name || !x.last_name || !current?.first_name?.trim() || !current.last_name?.trim()) return null
  const doc = nameKey(x.first_name, x.last_name)
  const pack = nameKey(current.first_name, current.last_name)
  // the same two words in the other order is the same name (「Chen Mia」 on a pay stub)
  if (doc === pack || doc.split(' ').sort().join(' ') === pack.split(' ').sort().join(' ')) return null
  return { doc: `${x.first_name} ${x.last_name}`, pack: `${current.first_name.trim()} ${current.last_name.trim()}` }
}

const PERIOD_LABEL: Record<PackPay['period'], { zh: string; en: string }> = {
  weekly: { zh: '每周', en: 'weekly' }, biweekly: { zh: '每两周', en: 'every two weeks' }, semimonthly: { zh: '每半月', en: 'twice a month' }, monthly: { zh: '每月', en: 'monthly' }, annual: { zh: '每年', en: 'a year' },
}
const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`

/** How the monthly figure was worked out, so the applicant can check it against the page: 「按工资单上每两周税前 $2,400 折算」. */
export function payBasisLine(pay: PackPay | null, zh: boolean): string | null {
  if (!pay) return null
  return zh
    ? `按文件上${PERIOD_LABEL[pay.period].zh}税前 ${money(pay.amount)} 折算成月收入，请对一下。`
    : `Worked out from ${money(pay.amount)} gross ${PERIOD_LABEL[pay.period].en} as printed — please check it.`
}

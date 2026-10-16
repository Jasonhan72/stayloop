// Ontario LTB notice forms — date arithmetic and a fill-in sheet (V1.0 阶段 3 · 甲 #5).
//
// Boundary (LSA s.1(5), design/v1-scope-and-roadmap-2026-10.md §6): Stayloop
// does not pick the form, does not suggest how to serve it and does not say
// whether to serve it. Every value below comes from the lease row or from
// what the landlord typed; the functions only do the arithmetic the statute
// defines and flag what fails it. The official PDFs are Crown copyright and
// are linked, never downloaded, embedded or rewritten — `fillSheet` renders
// OUR OWN sheet of values to copy across. No React, no I/O.
//
// Citations are taken from lib/ontario/rules.ts (`ruleById`) — the
// statute strings printed next to a flag come from there, not from memory.
// The service-method list is the one the task names: RTA s.191 / LTB Rule 3.

import { isoDate, parseDateOnly, utcDateClamped } from '../dates'
import {
  guidelineFor,
  N1_NOTICE_DAYS,
  N4_MAIL_DEEMED_SERVICE_DAYS,
  N4_OLD_FORMS_REJECTED_AFTER,
  N4_TERMINATION_DAYS,
  n4EarliestTermination,
  ruleById,
} from './rules'

export type Lang = 'zh' | 'en'
export type Bi = { zh: string; en: string }
export type NoticeCode = 'N1' | 'N4' | 'N12' | 'L1'
export type FlagLevel = 'block' | 'warn' | 'info'
export type Flag = { level: FlagLevel; rule?: string; zh: string; en: string }
/** One line of the fill-in sheet: an official column name and the value to copy. */
export type SheetField = { key: string; label: Bi; value: string; source: 'lease' | 'input' | 'computed' }
export type ComputeResult = { fields: SheetField[]; flags: Flag[] }

// ── Service methods (RTA s.191 · LTB Rule 3) ─────────────────────────────
// A neutral list: each entry only changes the deemed-service date. Nothing
// here ranks them.
export type ServiceMethod = 'hand' | 'mailbox' | 'mail' | 'fax' | 'email'
export const SERVICE_CITATION = 'RTA s.191 · LTB Rule 3'
export const SERVICE_METHODS: { id: ServiceMethod; label: Bi; deemedDays: number }[] = [
  { id: 'hand', label: { zh: '亲手交给租客', en: 'Handed to the tenant' }, deemedDays: 0 },
  { id: 'mailbox', label: { zh: '放入门缝或信箱', en: 'Left in the mailbox or under the door' }, deemedDays: 0 },
  { id: 'mail', label: { zh: `邮寄（视为 ${N4_MAIL_DEEMED_SERVICE_DAYS} 天后送达）`, en: `Mailed (deemed served ${N4_MAIL_DEEMED_SERVICE_DAYS} days later)` }, deemedDays: N4_MAIL_DEEMED_SERVICE_DAYS },
  { id: 'fax', label: { zh: '传真', en: 'Fax' }, deemedDays: 0 },
  { id: 'email', label: { zh: '电子邮件（双方事先书面同意）', en: 'Email (with prior written consent)' }, deemedDays: 0 },
]
export const SERVICE_METHOD_IDS: ServiceMethod[] = SERVICE_METHODS.map((m) => m.id)

export function serviceMethodLabel(method: ServiceMethod, lang: Lang): string {
  return SERVICE_METHODS.find((m) => m.id === method)?.label[lang] ?? method
}

/** The date a notice served on `servedOn` counts as served: mail adds the deemed-service days; every other method is the same day. */
export function deemedServedOn(servedOn: string, method: ServiceMethod): string {
  const d = parseDateOnly(servedOn)
  if (!d) return ''
  const days = SERVICE_METHODS.find((m) => m.id === method)?.deemedDays ?? 0
  return isoDate(addDays(d, days))
}

// ── The four forms (equal weight; "what it is", never "when to use it") ──
export type NoticeForm = {
  code: NoticeCode
  title: Bi
  /** What this form is — a description of the document, not advice on whether to use it. */
  what: Bi
  /** Version mark printed on the current official PDF ('2026/09'), or 'current' when the LTB has not re-versioned it. */
  version: string
  versionLabel: Bi
  official: { form: string; instructions?: string }
}

export const LTB_FORMS_INDEX = 'https://tribunalsontario.ca/ltb/forms/'
const DOCS = 'https://tribunalsontario.ca/documents/ltb'
// Verified 2026-10-16 with GET (HEAD misreports text/html on this host): each
// .pdf starts with %PDF-1.7; the _Instructions.html pages are the LTB's own
// instruction pages. N4 / N12 / L1 carry the 2026/09 mark; N1 was not in the
// 2026-09 re-versioning (rule LTB-forms-2026-09) and prints no version.
export const NOTICE_FORMS: NoticeForm[] = [
  {
    code: 'N1',
    title: { zh: 'N1 · 涨租通知', en: 'N1 · Notice of Rent Increase' },
    what: {
      zh: '房东通知租客租金将在某个日期涨到某个数额的书面通知。表上填现租金、新租金、涨幅百分比、生效日，并勾选涨幅是否在指导比例内。',
      en: 'The written notice by which a landlord tells the tenant that the rent will rise to a stated amount on a stated date. It carries the current rent, the new rent, the percentage, the effective date and a box for whether the increase is within the guideline.',
    },
    version: 'current',
    versionLabel: { zh: 'LTB 现行版（不在 2026/09 换版名单）', en: 'Current LTB version (not part of the 2026/09 re-versioning)' },
    official: {
      form: `${DOCS}/Notices%20of%20Rent%20Increase%20%26%20Instructions/N1.pdf`,
      instructions: `${DOCS}/Notices%20of%20Rent%20Increase%20%26%20Instructions/N1%20instructions_final_Nov30_2015.pdf`,
    },
  },
  {
    code: 'N4',
    title: { zh: 'N4 · 欠租终止通知', en: 'N4 · Notice to End your Tenancy Early for Non-payment of Rent' },
    what: {
      zh: '房东因租客未付租金而发出的终止通知。表上列出每个欠款租期与金额、合计，以及一个「付清或搬离」的终止日；租客在终止日前付清则通知失效。',
      en: 'The notice a landlord gives when rent has not been paid. It lists each unpaid rent period and amount, the total, and a termination date by which the tenant may pay or move out; paying in full by that date voids the notice.',
    },
    version: '2026/09',
    versionLabel: { zh: '2026/09 版（旧版 2026-11-30 后不再受理）', en: '2026/09 version (older versions rejected after 2026-11-30)' },
    official: {
      form: `${DOCS}/Notices%20of%20Termination%20%26%20Instructions/N4.pdf`,
      instructions: `${DOCS}/Notices%20of%20Termination%20%26%20Instructions/N4_Instructions.html`,
    },
  },
  {
    code: 'N12',
    title: { zh: 'N12 · 房东、买家或家属自用终止通知', en: 'N12 · Notice to End your Tenancy Because the Landlord, a Purchaser or a Family Member Requires the Rental Unit' },
    what: {
      zh: '房东本人、家属、照护者或买家要搬进该单位时发出的终止通知。表上填终止日、谁要入住（理由 1 房东方 / 理由 2 买家方）、补偿方式；入住人另需作宣誓声明。',
      en: 'The notice given when the landlord, a family member, a caregiver or a purchaser intends to move into the unit. It carries the termination date, who will occupy it (reason 1 landlord side / reason 2 purchaser side) and the compensation offered; the occupant also completes an affidavit or declaration.',
    },
    version: '2026/09',
    versionLabel: { zh: '2026/09 版（旧版 2026-11-30 后不再受理）', en: '2026/09 version (older versions rejected after 2026-11-30)' },
    official: {
      form: `${DOCS}/Notices%20of%20Termination%20%26%20Instructions/N12.pdf`,
      instructions: `${DOCS}/Notices%20of%20Termination%20%26%20Instructions/N12_Instructions.html`,
    },
  },
  {
    code: 'L1',
    title: { zh: 'L1 · 向 LTB 申请（欠租，N4 终止日已过）', en: 'L1 · Application to Evict a Tenant for Non-payment of Rent and to Collect Rent the Tenant Owes' },
    what: {
      zh: '房东在 N4 终止日过后租客仍未付清时，向 LTB 提交的申请书。随表附 N4 副本与送达证明（Certificate of Service），并按租期列出欠款计算。',
      en: 'The application a landlord files with the LTB when rent is still owing after the N4 termination date. It is filed with a copy of the N4 and a Certificate of Service, and shows the arrears period by period.',
    },
    version: '2026/09',
    versionLabel: { zh: '2026/09 版（旧版 2026-11-30 后不再受理）', en: '2026/09 version (older versions rejected after 2026-11-30)' },
    official: {
      form: `${DOCS}/Landlord%20Applications%20%26%20Instructions/L1.pdf`,
      instructions: `${DOCS}/Landlord%20Applications%20%26%20Instructions/L1_Instructions.html`,
    },
  },
]

export function noticeForm(code: NoticeCode): NoticeForm {
  return NOTICE_FORMS.find((f) => f.code === code)!
}

// ── Small date helpers (UTC, date-only) ──────────────────────────────────
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}
function addMonthsClamped(d: Date, months: number): Date {
  return utcDateClamped(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())
}
function days(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}
const statuteOf = (ruleId: string): string => ruleById(ruleId)?.statute ?? ruleId

/** `$2,500.00` — the sheet prints cents because the official forms have cents boxes. */
export function moneyText(n: number): string {
  return `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** The last day of the rental period that ends before the next due day (N12 / N9 arithmetic). */
export function isLastDayOfRentalPeriod(dateIso: string, dueDay: number): boolean {
  const d = parseDateOnly(dateIso)
  if (!d || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return false
  const next = addDays(d, 1)
  const due = utcDateClamped(next.getUTCFullYear(), next.getUTCMonth(), dueDay)
  return isoDate(due) === isoDate(next)
}

/** Next rental-period end on/after `fromIso` for a tenancy whose rent is due on `dueDay`. */
export function nextRentalPeriodEnd(fromIso: string, dueDay: number): string {
  const d = parseDateOnly(fromIso)
  if (!d) return ''
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  for (let i = 0; i < 3; i++) {
    const due = utcDateClamped(y, m, dueDay)
    const end = addDays(due, -1)
    if (end.getTime() >= d.getTime()) return isoDate(end)
    m += 1
    if (m > 11) { m = 0; y += 1 }
  }
  return ''
}

/** The rent due day out of a lease: `households.rent_due_day` first, else the
 *  standard lease's free-text `terms.rent.due_day` ("first day of each month",
 *  "15th", "1"). Null when nothing usable is found — callers default to 1 and say so. */
const ORDINAL_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, tenth: 10, fifteenth: 15, twentieth: 20, last: 31 }
export function dueDayFromText(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 31 ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  if (!t) return null
  const num = t.match(/\b([0-9]{1,2})(?:st|nd|rd|th)?\b/)
  if (num) { const n = Number(num[1]); return n >= 1 && n <= 31 ? n : null }
  for (const [w, n] of Object.entries(ORDINAL_WORDS)) if (new RegExp(`\\b${w}\\b`).test(t)) return n
  return null
}

// ── N1 ───────────────────────────────────────────────────────────────────
export type N1Input = {
  currentRent: number
  newRent: number
  servedOn: string
  method: ServiceMethod
  effectiveOn: string
  /** Date of the last rent increase, when there was one. */
  lastIncreaseOn?: string | null
  /** Otherwise the day the tenant moved in (lease start). */
  leaseStart?: string | null
  /** The landlord's own statement that the unit was first occupied for residential purposes after 2018-11-15 (RTA s.6.1). */
  firstOccupiedAfter2018?: boolean
  dueDay?: number | null
}

export function computeN1(i: N1Input): ComputeResult {
  const flags: Flag[] = []
  const fields: SheetField[] = []
  const inc = i.newRent - i.currentRent
  const pct = i.currentRent > 0 ? (inc / i.currentRent) * 100 : NaN
  const deemed = i.servedOn ? deemedServedOn(i.servedOn, i.method) : ''
  const g = i.effectiveOn ? guidelineFor(i.effectiveOn) : null

  fields.push(
    { key: 'current_rent', label: { zh: '现租金', en: 'Current rent' }, value: moneyText(i.currentRent), source: 'lease' },
    { key: 'new_rent', label: { zh: '新租金', en: 'New rent' }, value: moneyText(i.newRent), source: 'input' },
    { key: 'increase', label: { zh: '涨幅', en: 'Increase' }, value: Number.isFinite(pct) ? `${moneyText(inc)} · ${pct.toFixed(2)}%` : moneyText(inc), source: 'computed' },
    { key: 'effective_on', label: { zh: '生效日（涨租日）', en: 'Date the increase takes effect' }, value: i.effectiveOn, source: 'input' },
    { key: 'served_on', label: { zh: '通知日期（送达日）', en: 'Date of this notice (service)' }, value: i.servedOn, source: 'input' },
    { key: 'method', label: { zh: '送达方式', en: 'Service method' }, value: i.method, source: 'input' },
    { key: 'deemed_served_on', label: { zh: '视为送达日', en: 'Deemed served on' }, value: deemed, source: 'computed' },
  )
  if (g) fields.push({ key: 'guideline', label: { zh: '该生效年份的指导比例', en: 'Guideline for the effective year' }, value: `${g.year} · ${g.pct}%${g.published ? '' : ' (?)'}`, source: 'computed' })

  if (!(i.newRent > i.currentRent)) {
    flags.push({ level: 'warn', zh: '新租金没有高于现租金：N1 是涨租通知。', en: 'The new rent is not higher than the current rent: N1 is a rent-increase notice.' })
  }
  const dDeemed = parseDateOnly(deemed)
  const dEff = parseDateOnly(i.effectiveOn)
  if (dDeemed && dEff) {
    const earliest = addDays(dDeemed, N1_NOTICE_DAYS)
    if (dEff.getTime() < earliest.getTime()) {
      flags.push({
        level: 'block', rule: 'RTA-116-n1-90-days',
        zh: `生效日 ${i.effectiveOn} 距视为送达日 ${deemed} 不足 ${N1_NOTICE_DAYS} 天；按这个送达日，最早生效日是 ${isoDate(earliest)}。（${statuteOf('RTA-116-n1-90-days')}）`,
        en: `The effective date ${i.effectiveOn} is less than ${N1_NOTICE_DAYS} days after the deemed service date ${deemed}; with this service date the earliest effective date is ${isoDate(earliest)}. (${statuteOf('RTA-116-n1-90-days')})`,
      })
    }
  }
  const baseline = parseDateOnly(i.lastIncreaseOn ?? null) ?? parseDateOnly(i.leaseStart ?? null)
  if (baseline && dEff) {
    const twelve = addMonthsClamped(baseline, 12)
    if (dEff.getTime() < twelve.getTime()) {
      const base = isoDate(baseline)
      flags.push({
        level: 'block', rule: 'RTA-116-n1-90-days',
        zh: `生效日 ${i.effectiveOn} 距 ${i.lastIncreaseOn ? '上次涨租' : '起租'}日 ${base} 不满 12 个月（最早 ${isoDate(twelve)}）。（${statuteOf('RTA-116-n1-90-days')}）`,
        en: `The effective date ${i.effectiveOn} is less than 12 months after the ${i.lastIncreaseOn ? 'last increase' : 'lease start'} on ${base} (earliest ${isoDate(twelve)}). (${statuteOf('RTA-116-n1-90-days')})`,
      })
    }
  }
  if (g && Number.isFinite(pct)) {
    if (!g.published) {
      flags.push({ level: 'info', rule: 'RTA-120-guideline', zh: `${g.year} 年的指导比例尚未公布，这里按最近公布的 ${g.pct}% 对照。`, en: `The ${g.year} guideline is not published yet; the latest published figure (${g.pct}%) is used for comparison.` })
    }
    if (pct > g.pct + 1e-9) {
      if (i.firstOccupiedAfter2018) {
        flags.push({
          level: 'info', rule: 'RTA-120-guideline',
          zh: `涨幅 ${pct.toFixed(2)}% 超过 ${g.year} 年指导比例 ${g.pct}%。你勾选了「2018-11-15 后首次入住」：这类单位不受指导比例限制（s.6.1）。豁免单位的涨租通知是另一张表（N2）；是否适用由你自行判断。`,
          en: `The increase of ${pct.toFixed(2)}% is above the ${g.year} guideline of ${g.pct}%. You ticked “first occupied after 2018-11-15”: such units are not bound by the guideline (s.6.1). The notice for exempt units is a different form (N2); whether it applies is your call.`,
        })
      } else {
        flags.push({
          level: 'block', rule: 'RTA-120-guideline',
          zh: `涨幅 ${pct.toFixed(2)}% 超过 ${g.year} 年指导比例 ${g.pct}%。N1 用于指导比例内的涨租；超过指导线须有 LTB 的 AGI 裁定。2018-11-15 后首次入住的豁免单位用另一张表（N2），是否适用由你自行判断。（${statuteOf('RTA-120-guideline')}）`,
          en: `The increase of ${pct.toFixed(2)}% is above the ${g.year} guideline of ${g.pct}%. N1 is for increases within the guideline; anything above it needs an LTB order (AGI). Units first occupied after 2018-11-15 use a different form (N2); whether that applies is your call. (${statuteOf('RTA-120-guideline')})`,
        })
      }
    }
  }
  if (dEff && i.dueDay && Number.isInteger(i.dueDay)) {
    const dueThatMonth = utcDateClamped(dEff.getUTCFullYear(), dEff.getUTCMonth(), i.dueDay)
    if (isoDate(dueThatMonth) !== isoDate(dEff)) {
      flags.push({
        level: 'warn',
        zh: `生效日 ${i.effectiveOn} 不是租期首日（这份租约的交租日是每月 ${i.dueDay} 号，该月为 ${isoDate(dueThatMonth)}）。`,
        en: `The effective date ${i.effectiveOn} is not the first day of a rental period (rent is due on the ${i.dueDay} each month; that month it is ${isoDate(dueThatMonth)}).`,
      })
    }
  }
  return { fields, flags }
}

// ── N4 ───────────────────────────────────────────────────────────────────
export type N4Period = { due: string; amountOwed: number }
export type N4Input = {
  dueDay?: number | null
  monthlyRent: number
  unpaidPeriods: N4Period[]
  servedOn: string
  method: ServiceMethod
  terminationOn: string
}

export function computeN4(i: N4Input): ComputeResult {
  const flags: Flag[] = []
  const fields: SheetField[] = []
  const periods = [...i.unpaidPeriods].sort((a, b) => a.due.localeCompare(b.due))
  const total = periods.reduce((s, p) => s + (Number.isFinite(p.amountOwed) ? p.amountOwed : 0), 0)
  const deemed = i.servedOn ? deemedServedOn(i.servedOn, i.method) : ''
  const earliest = i.servedOn ? n4EarliestTermination(i.servedOn, i.method === 'mail' ? 'mail' : 'hand') : ''

  for (const p of periods) {
    fields.push({ key: `period_${p.due}`, label: { zh: `欠款租期（到期日 ${p.due}）`, en: `Rent period owed (due ${p.due})` }, value: moneyText(p.amountOwed), source: 'input' })
  }
  fields.push(
    { key: 'total_owing', label: { zh: '欠款合计（Total Rent Owing）', en: 'Total rent owing' }, value: moneyText(total), source: 'computed' },
    { key: 'served_on', label: { zh: '送达日', en: 'Date served' }, value: i.servedOn, source: 'input' },
    { key: 'method', label: { zh: '送达方式', en: 'Service method' }, value: i.method, source: 'input' },
    { key: 'deemed_served_on', label: { zh: '视为送达日', en: 'Deemed served on' }, value: deemed, source: 'computed' },
    { key: 'earliest_termination', label: { zh: '最早可填的终止日', en: 'Earliest termination date' }, value: earliest, source: 'computed' },
    { key: 'termination_on', label: { zh: '终止日（付清或搬离）', en: 'Termination date (pay or move out by)' }, value: i.terminationOn, source: 'input' },
  )

  if (!periods.length) {
    flags.push({ level: 'warn', zh: '还没有勾选任何欠款租期；N4 的表上必须列出每个欠款租期与金额。', en: 'No unpaid rent period is ticked; the N4 lists each unpaid period and amount.' })
  }
  const dServed = parseDateOnly(i.servedOn)
  for (const p of periods) {
    const dDue = parseDateOnly(p.due)
    if (dServed && dDue && dServed.getTime() <= dDue.getTime()) {
      flags.push({
        level: 'block', rule: 'RTA-59-n4-7-days',
        zh: `送达日 ${i.servedOn} 不晚于租期到期日 ${p.due}：欠租通知只能在租金到期日之后送达。（${statuteOf('RTA-59-n4-7-days')}）`,
        en: `The service date ${i.servedOn} is not after the due date ${p.due}: a non-payment notice is served only after rent is due. (${statuteOf('RTA-59-n4-7-days')})`,
      })
    }
    if (!(p.amountOwed > 0)) {
      flags.push({ level: 'warn', zh: `租期 ${p.due} 的欠款金额为 0。`, en: `The amount owed for the period due ${p.due} is 0.` })
    }
  }
  const dTerm = parseDateOnly(i.terminationOn)
  const dEarliest = parseDateOnly(earliest)
  if (dTerm && dEarliest && dTerm.getTime() < dEarliest.getTime()) {
    flags.push({
      level: 'block', rule: 'RTA-59-n4-7-days',
      zh: `终止日 ${i.terminationOn} 早于最早允许的 ${earliest}（送达后 ${N4_TERMINATION_DAYS} 天${i.method === 'mail' ? `，邮寄另加 ${N4_MAIL_DEEMED_SERVICE_DAYS} 天` : ''}）。（${statuteOf('RTA-59-n4-7-days')}）`,
      en: `The termination date ${i.terminationOn} is before the earliest allowed, ${earliest} (${N4_TERMINATION_DAYS} days after service${i.method === 'mail' ? `, plus ${N4_MAIL_DEEMED_SERVICE_DAYS} for mail` : ''}). (${statuteOf('RTA-59-n4-7-days')})`,
    })
  }
  flags.push({
    level: 'info', rule: 'LTB-forms-2026-09',
    zh: `官方 N4 是 2026/09 版；旧版表格 ${N4_OLD_FORMS_REJECTED_AFTER} 后 LTB 不再受理。表上只能填租金（不含押金、水电等其他款项）。`,
    en: `The official N4 is the 2026/09 version; older versions are not accepted after ${N4_OLD_FORMS_REJECTED_AFTER}. Only rent goes on the form (not deposits, utilities or other charges).`,
  })
  return { fields, flags }
}

// ── N12 ──────────────────────────────────────────────────────────────────
export type N12Who = 'landlord' | 'family' | 'caregiver' | 'purchaser'
export type N12Compensation = 'one_month' | 'alt_unit' | 'none'
export const N12_NOTICE_DAYS = 60
export const N12_WAIVER_DAYS = 120
export const N12_OCCUPY_WITHIN_DAYS = 60
export const N12_WHO_LABEL: Record<N12Who, Bi> = {
  landlord: { zh: '房东本人（理由 1）', en: 'The landlord (reason 1)' },
  family: { zh: '房东的家属（理由 1）', en: 'A member of the landlord’s family (reason 1)' },
  caregiver: { zh: '照护者（理由 1）', en: 'A caregiver (reason 1)' },
  purchaser: { zh: '买家或买家的家属 / 照护者（理由 2）', en: 'The purchaser, or the purchaser’s family member / caregiver (reason 2)' },
}
export const N12_COMPENSATION_LABEL: Record<N12Compensation, Bi> = {
  one_month: { zh: '支付一个月租金的补偿', en: 'One month’s rent as compensation' },
  alt_unit: { zh: '提供租客可接受的另一单位', en: 'Another unit acceptable to the tenant' },
  none: { zh: '不支付补偿', en: 'No compensation' },
}
export type N12Input = {
  servedOn: string
  method: ServiceMethod
  terminationOn: string
  dueDay?: number | null
  who: N12Who
  compensationOffered: N12Compensation
}

export function computeN12(i: N12Input): ComputeResult {
  const flags: Flag[] = []
  const fields: SheetField[] = []
  const deemed = i.servedOn ? deemedServedOn(i.servedOn, i.method) : ''
  const dDeemed = parseDateOnly(deemed)
  const dTerm = parseDateOnly(i.terminationOn)
  const earliest = dDeemed ? isoDate(addDays(dDeemed, N12_NOTICE_DAYS)) : ''
  const noticeDays = dDeemed && dTerm ? days(dDeemed, dTerm) : null

  fields.push(
    { key: 'who', label: { zh: '谁要入住 / 理由', en: 'Who will occupy / reason' }, value: i.who, source: 'input' },
    { key: 'termination_on', label: { zh: '终止日', en: 'Termination date' }, value: i.terminationOn, source: 'input' },
    { key: 'served_on', label: { zh: '送达日', en: 'Date served' }, value: i.servedOn, source: 'input' },
    { key: 'method', label: { zh: '送达方式', en: 'Service method' }, value: i.method, source: 'input' },
    { key: 'deemed_served_on', label: { zh: '视为送达日', en: 'Deemed served on' }, value: deemed, source: 'computed' },
    { key: 'earliest_termination', label: { zh: `最早可填的终止日（${N12_NOTICE_DAYS} 天）`, en: `Earliest termination date (${N12_NOTICE_DAYS} days)` }, value: earliest, source: 'computed' },
    { key: 'notice_days', label: { zh: '提前天数', en: 'Days of notice' }, value: noticeDays == null ? '' : String(noticeDays), source: 'computed' },
    { key: 'compensation', label: { zh: '补偿', en: 'Compensation' }, value: i.compensationOffered, source: 'input' },
  )

  const rule = 'RTA-48-1-n12-120-days'
  if (dDeemed && dTerm && dTerm.getTime() < addDays(dDeemed, N12_NOTICE_DAYS).getTime()) {
    flags.push({
      level: 'block', rule,
      zh: `终止日 ${i.terminationOn} 距视为送达日 ${deemed} 不足 ${N12_NOTICE_DAYS} 天；按这个送达日最早是 ${earliest}。（${statuteOf(rule)}）`,
      en: `The termination date ${i.terminationOn} is less than ${N12_NOTICE_DAYS} days after the deemed service date ${deemed}; the earliest with this service date is ${earliest}. (${statuteOf(rule)})`,
    })
  }
  if (dTerm && i.dueDay && Number.isInteger(i.dueDay) && !isLastDayOfRentalPeriod(i.terminationOn, i.dueDay)) {
    const next = nextRentalPeriodEnd(i.terminationOn, i.dueDay)
    flags.push({
      level: 'block', rule,
      zh: `终止日 ${i.terminationOn} 不是租期末日（交租日每月 ${i.dueDay} 号，租期末日是其前一天；之后最近的一个是 ${next}）。（${statuteOf(rule)}）`,
      en: `The termination date ${i.terminationOn} is not the last day of a rental period (rent is due on the ${i.dueDay}; the period ends the day before; the next such day is ${next}). (${statuteOf(rule)})`,
    })
  }
  if (noticeDays != null) {
    if (i.who !== 'purchaser' && noticeDays >= N12_WAIVER_DAYS) {
      flags.push({
        level: 'info', rule,
        zh: `提前 ${noticeDays} 天（≥ ${N12_WAIVER_DAYS} 天）且入住人是房东方：按 s.48.1(2) 不需要支付一个月补偿或提供替代单位。${i.compensationOffered !== 'none' ? '你仍填写了补偿，照你填的写。' : ''}`,
        en: `${noticeDays} days of notice (≥ ${N12_WAIVER_DAYS}) with a landlord-side occupant: under s.48.1(2) no one-month compensation or alternative unit is required.${i.compensationOffered !== 'none' ? ' You still entered compensation; the sheet keeps what you entered.' : ''}`,
      })
    } else if (i.compensationOffered === 'none') {
      flags.push({
        level: 'block', rule,
        zh: i.who === 'purchaser'
          ? `买家自用（理由 2）不适用 120 天豁免：必须在终止日前支付一个月租金补偿或提供替代单位。（${statuteOf(rule)}）`
          : `提前 ${noticeDays} 天（不足 ${N12_WAIVER_DAYS} 天）：必须在终止日前支付一个月租金补偿或提供替代单位。（${statuteOf(rule)}）`,
        en: i.who === 'purchaser'
          ? `Purchaser’s own use (reason 2) is not covered by the 120-day waiver: one month’s rent or an alternative unit must be given by the termination date. (${statuteOf(rule)})`
          : `${noticeDays} days of notice (under ${N12_WAIVER_DAYS}): one month’s rent or an alternative unit must be given by the termination date. (${statuteOf(rule)})`,
      })
    }
  }
  flags.push({
    level: 'info', rule,
    zh: `入住人须在终止日后 ${N12_OCCUPY_WITHIN_DAYS} 天内搬入；入住人另需完成宣誓声明（随 N12 一并交给租客）。`,
    en: `The named occupant must move in within ${N12_OCCUPY_WITHIN_DAYS} days of the termination date and completes an affidavit or declaration given to the tenant with the N12.`,
  })
  flags.push({
    level: 'info', rule: 'LTB-forms-2026-09',
    zh: `官方 N12 是 2026/09 版；旧版表格 ${N4_OLD_FORMS_REJECTED_AFTER} 后 LTB 不再受理。`,
    en: `The official N12 is the 2026/09 version; older versions are not accepted after ${N4_OLD_FORMS_REJECTED_AFTER}.`,
  })
  return { fields, flags }
}

// ── L1 ───────────────────────────────────────────────────────────────────
export type L1Input = { n4TerminationOn: string; today: string; totalOwing?: number | null }

export function computeL1(i: L1Input): ComputeResult {
  const flags: Flag[] = []
  const fields: SheetField[] = []
  const dTerm = parseDateOnly(i.n4TerminationOn)
  const earliest = dTerm ? isoDate(addDays(dTerm, 1)) : ''
  fields.push(
    { key: 'n4_termination_on', label: { zh: 'N4 上的终止日', en: 'Termination date on the N4' }, value: i.n4TerminationOn, source: 'input' },
    { key: 'earliest_filing', label: { zh: '最早可提交日（终止日次日）', en: 'Earliest filing date (day after the termination date)' }, value: earliest, source: 'computed' },
  )
  if (i.totalOwing != null && Number.isFinite(i.totalOwing)) {
    fields.push({ key: 'total_owing', label: { zh: '申请书上的欠款合计', en: 'Total owing on the application' }, value: moneyText(i.totalOwing), source: 'input' })
  }
  const dToday = parseDateOnly(i.today)
  if (dToday && dTerm && dToday.getTime() <= dTerm.getTime()) {
    flags.push({
      level: 'block',
      zh: `今天 ${i.today} 还没过 N4 的终止日 ${i.n4TerminationOn}：L1 最早在 ${earliest} 提交（官方 L1 说明：不得早于终止日次日）。`,
      en: `Today ${i.today} is not past the N4 termination date ${i.n4TerminationOn}: the L1 can be filed from ${earliest} at the earliest (official L1 instructions: not before the day after the termination date).`,
    })
  }
  flags.push({
    level: 'info', rule: 'RTA-59-n4-7-days',
    zh: '租客在 N4 终止日前付清所列欠款，该 N4 即失效，不能据以提交 L1。',
    en: 'If the tenant pays the amount on the N4 in full by its termination date, that N4 is void and cannot ground an L1.',
  })
  flags.push({
    level: 'info', rule: 'RTA-82-half-arrears',
    zh: '随 L1 一并提交 N4 副本与送达证明（Certificate of Service）。租客要在欠租听证上提出维修等问题，须提前把申请书上欠款的一半付给房东。',
    en: 'File a copy of the N4 and a Certificate of Service with the L1. A tenant raising maintenance or other issues at the arrears hearing must first pay the landlord half the arrears claimed.',
  })
  flags.push({
    level: 'info', rule: 'LTB-forms-2026-09',
    zh: `官方 L1 是 2026/09 版；旧版表格 ${N4_OLD_FORMS_REJECTED_AFTER} 后 LTB 不再受理。`,
    en: `The official L1 is the 2026/09 version; older versions are not accepted after ${N4_OLD_FORMS_REJECTED_AFTER}.`,
  })
  return { fields, flags }
}

// ── Fill-in sheet (our own document; the official PDF is only linked) ────
export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const SOURCE_LABEL: Record<SheetField['source'], Bi> = {
  lease: { zh: '来自租约', en: 'From the lease' },
  input: { zh: '你填写', en: 'Entered by you' },
  computed: { zh: '按规则算出', en: 'Computed' },
}
const LEVEL_LABEL: Record<FlagLevel, Bi> = {
  block: { zh: '不符合', en: 'Fails' },
  warn: { zh: '请核对', en: 'Check' },
  info: { zh: '说明', en: 'Note' },
}

export const SHEET_TITLE: Bi = { zh: 'Stayloop 填写稿 · 不是官方表格', en: 'Stayloop fill-in sheet · not the official form' }
export const SHEET_BOUNDARY: Bi = {
  zh: '这是日期算术与填写稿，不是法律意见。官方表格须用 LTB 的 PDF，Stayloop 不改官方文件（Crown copyright）。每个值来自你的租约记录或你自己的输入。',
  en: 'This is date arithmetic and a fill-in sheet, not legal advice. The official form is the LTB’s PDF; Stayloop does not alter official documents (Crown copyright). Every value comes from your lease record or your own input.',
}

export function fillSheet(form: NoticeForm, fields: SheetField[], flags: Flag[], lang: Lang, generatedOn: string = isoDate(new Date())): string {
  const zh = lang === 'zh'
  const blocks = flags.filter((f) => f.level === 'block')
  const rows = fields
    .map((f) => `<tr><th>${esc(f.label[lang])}</th><td>${esc(f.value) || '<span class="muted">—</span>'}</td><td class="src">${esc(SOURCE_LABEL[f.source][lang])}</td></tr>`)
    .join('')
  const flagRows = flags
    .map((f) => `<li class="${f.level}"><b>${esc(LEVEL_LABEL[f.level][lang])}</b> ${esc(f[lang])}${f.rule ? ` <span class="rule">${esc(statuteOf(f.rule))}</span>` : ''}</li>`)
    .join('')
  const title = `${esc(SHEET_TITLE[lang])} · ${esc(form.code)}`
  return `<!doctype html><html lang="${zh ? 'zh-CN' : 'en-CA'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
  body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#1B1B3C;margin:0;background:#F3F8FC}
  .sheet{max-width:820px;margin:24px auto;background:#fff;padding:32px 36px;border-radius:12px;box-shadow:0 2px 12px rgba(27,27,60,.08)}
  h1{font-size:20px;margin:0 0 4px}
  .eyebrow{font:600 11px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6E6E8A}
  .boundary{margin:12px 0 20px;padding:10px 12px;border:1px solid #D3E3EF;border-radius:8px;font-size:12.5px;color:#4A4A6A;background:#F3F8FC}
  table{border-collapse:collapse;width:100%;font-size:13.5px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #E4EEF6;vertical-align:top}
  th{width:42%;font-weight:600;color:#1B1B3C}
  td.src{width:18%;font-size:11.5px;color:#6E6E8A}
  .muted{color:#9FBBD0}
  ul.flags{list-style:none;padding:0;margin:16px 0 0}
  ul.flags li{padding:8px 10px;border-radius:8px;margin-bottom:6px;font-size:13px;line-height:1.5}
  li.block{background:#FEF2F2;color:#991B1B;border:1px solid #FCA5A5}
  li.warn{background:#FFFBEB;color:#92400E;border:1px solid #FCD34D}
  li.info{background:#F3F8FC;color:#4A4A6A;border:1px solid #D3E3EF}
  .rule{font:11px ui-monospace,Menlo,monospace;opacity:.8}
  .links{margin-top:20px;font-size:13px}
  .links a{color:#0094C6}
  .foot{margin-top:24px;font-size:11.5px;color:#6E6E8A}
  .toolbar{max-width:820px;margin:16px auto 0;text-align:right}
  .toolbar button{font:600 13px system-ui;padding:8px 14px;border-radius:999px;border:1px solid #1B1B3C;background:#1B1B3C;color:#fff;cursor:pointer}
  @media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;border-radius:0}.toolbar{display:none}}
</style></head><body>
<div class="toolbar"><button type="button" onclick="window.print()">${zh ? '打印 / 保存为 PDF' : 'Print / Save as PDF'}</button></div>
<div class="sheet">
  <div class="eyebrow">${esc(SHEET_TITLE[lang])}</div>
  <h1>${esc(form.title[lang])}</h1>
  <div class="eyebrow">${esc(form.versionLabel[lang])} · ${esc(zh ? '生成于' : 'Generated')} ${esc(generatedOn)}</div>
  <div class="boundary">${esc(SHEET_BOUNDARY[lang])}</div>
  ${blocks.length ? `<div class="boundary" style="border-color:#FCA5A5;background:#FEF2F2;color:#991B1B">${esc(zh ? `有 ${blocks.length} 项不符合规则（下方红色）。` : `${blocks.length} value(s) fail a rule (red, below).`)}</div>` : ''}
  <table><thead><tr><th>${esc(zh ? '官方表格栏目' : 'Official form field')}</th><th>${esc(zh ? '值' : 'Value')}</th><th>${esc(zh ? '来源' : 'Source')}</th></tr></thead><tbody>${rows}</tbody></table>
  ${flags.length ? `<ul class="flags">${flagRows}</ul>` : ''}
  <div class="links">${esc(zh ? '把这些值抄到官方 PDF：' : 'Copy these values into the official PDF: ')}<a href="${esc(form.official.form)}" target="_blank" rel="noreferrer">${esc(form.code)} (LTB)</a>${form.official.instructions ? ` · <a href="${esc(form.official.instructions)}" target="_blank" rel="noreferrer">${esc(zh ? '填写说明' : 'Instructions')}</a>` : ''} · <a href="${esc(LTB_FORMS_INDEX)}" target="_blank" rel="noreferrer">${esc(zh ? 'LTB 表格索引' : 'LTB forms index')}</a></div>
  <div class="foot">Stayloop.ai · ${esc(zh ? '送达方式清单依据' : 'Service methods per')} ${esc(SERVICE_CITATION)}</div>
</div>
</body></html>`
}

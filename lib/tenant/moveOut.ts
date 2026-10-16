// Tenant move-out tools — V1.0 stage 2, 乙 #10 (research A3③ M1 / M2 / M4).
// Three pure pieces: N9 timing (RTA s.44 / s.47), rent-deposit interest
// (s.106(6) · (9) · (10), guideline from lib/ontario/rules) and a move-out
// checklist written the way lib/household/moveIn.ts writes the move-in one.
// Dates are calendar dates in UTC (lib/dates). Nothing here fills or selects
// an LTB form; it computes dates and amounts and links to the official page.
import { RENT_GUIDELINE, guidelineFor } from '@/lib/ontario/rules'
import { daysBetween, isoDate, parseDateOnly, todayUtc, utcDateClamped } from '@/lib/dates'

export type Bi = { zh: string; en: string }

// ── N9 · tenant's notice to end the tenancy ─────────────────────────────────
export const N9_NOTICE_DAYS = 60
export const LTB_FORMS_URL = 'https://tribunalsontario.ca/ltb/forms/'

export type N9Input = {
  /** fixed term: the end date on the lease · monthly: the original term's end date (it anchors the monthly periods) */
  leaseEndDate: string
  termType: 'fixed' | 'monthly'
  today?: Date | string
}

export type N9Timing = {
  /** earliest termination date if the notice is given today */
  earliest: string
  /** latest day to give the notice for that termination date (= earliest − 60) */
  serveBy: string
  noticeDays: number
  /** term_end = the fixed term's last day · period_end = last day of a monthly period */
  basis: 'term_end' | 'period_end'
  /** day of month the periods end on (from the lease end date; 31 clamps to month-end) */
  periodEndDay: number
  /** the fixed term can no longer be met with 60 days' notice: the tenancy runs on monthly (s.38) and the date falls after the term */
  afterTermEnd: boolean
  notes: { statute: string; text: Bi }[]
}

/** Earliest date a tenant can end the tenancy with an N9 given today, and the
 *  day the notice must reach the landlord by. s.44(3): fixed term → ≥ 60 days
 *  before the term's last day, terminating on that day. s.44(2): monthly →
 *  ≥ 60 days, terminating on the last day of a monthly period. s.47 lets the
 *  tenant give that notice. */
export function n9Timing(input: N9Input): N9Timing | null {
  const end = parseDateOnly(input.leaseEndDate)
  if (!end) return null
  const t = input.today instanceof Date ? todayUtc(input.today) : input.today ? parseDateOnly(input.today) : todayUtc()
  if (!t) return null
  const min = new Date(t.getTime() + N9_NOTICE_DAYS * 86_400_000)
  const periodEndDay = end.getUTCDate()
  let earliest: Date
  let basis: N9Timing['basis']
  if (input.termType === 'fixed' && min.getTime() <= end.getTime()) {
    earliest = end
    basis = 'term_end'
  } else {
    // first period end on/after `min`: the same day-of-month as the lease end, clamped
    let y = min.getUTCFullYear()
    let m = min.getUTCMonth()
    let cand = utcDateClamped(y, m, periodEndDay)
    if (cand.getTime() < min.getTime()) {
      m += 1
      if (m > 11) { m = 0; y += 1 }
      cand = utcDateClamped(y, m, periodEndDay)
    }
    earliest = cand
    basis = 'period_end'
  }
  const serveBy = new Date(earliest.getTime() - N9_NOTICE_DAYS * 86_400_000)
  const afterTermEnd = input.termType === 'fixed' && basis === 'period_end'
  const notes: N9Timing['notes'] = [
    { statute: 'RTA s.47 · s.44', text: { zh: `租客用 N9 表格终止租约：至少提前 ${N9_NOTICE_DAYS} 天送达，终止日须是租期末日（定期租约）或月租期的最后一天。`, en: `A tenant ends a tenancy with Form N9: at least ${N9_NOTICE_DAYS} days before, and the termination date must be the last day of the term (fixed term) or of a monthly period.` } },
  ]
  if (afterTermEnd) {
    notes.push({ statute: 'RTA s.38(1)', text: { zh: `今天起已不足 ${N9_NOTICE_DAYS} 天到租期末日 ${isoDate(end)}；到期后租约按原条款转为月租，所以最早的终止日是下一个月租期的末日。`, en: `Fewer than ${N9_NOTICE_DAYS} days remain to the term's last day (${isoDate(end)}); the tenancy continues month-to-month on the same terms, so the earliest termination date is the end of the next monthly period.` } })
  }
  notes.push({ statute: 'N9 · LTB', text: { zh: '表格在 LTB 官网下载；留一份送达副本与送达日期的记录。Stayloop 不代填、不代送。', en: 'Download the form from the LTB site; keep a copy and a record of the date you gave it. Stayloop does not fill or serve forms.' } })
  return { earliest: isoDate(earliest), serveBy: isoDate(serveBy), noticeDays: N9_NOTICE_DAYS, basis, periodEndDay, afterTermEnd, notes }
}

// ── Rent-deposit interest · s.106 ───────────────────────────────────────────
export type DepositInterestInput = {
  /** rent deposit, dollars */
  deposit: number
  /** date the deposit was paid (YYYY-MM-DD) */
  paidOn: string
  today?: Date | string
}

export type DepositInterestRow = {
  /** anniversary the payment became due */
  dueOn: string
  year: number
  /** guideline in effect that day (s.106(6)) */
  pct: number
  published: boolean
  amount: number
}

export type DepositInterest = {
  rows: DepositInterestRow[]
  /** interest due so far (completed years), dollars, 2 decimals */
  total: number
  /** the current incomplete year, pro-rated at the guideline of the next anniversary — an estimate */
  accrued: { since: string; nextDueOn: string; days: number; pct: number; published: boolean; amount: number } | null
  notes: { statute: string; text: Bi }[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Annual interest on the rent deposit (s.106(6)): one row per completed year,
 *  at the guideline in effect on that anniversary (RENT_GUIDELINE by year;
 *  years not yet published use the latest figure and say so). */
export function depositInterest(input: DepositInterestInput): DepositInterest | null {
  const dep = Number(input.deposit)
  const paid = parseDateOnly(input.paidOn)
  if (!Number.isFinite(dep) || dep <= 0 || !paid) return null
  const t = input.today instanceof Date ? todayUtc(input.today) : input.today ? parseDateOnly(input.today) : todayUtc()
  if (!t || t.getTime() < paid.getTime()) return null
  const rows: DepositInterestRow[] = []
  let k = 1
  let lastDue = paid
  for (;;) {
    const due = utcDateClamped(paid.getUTCFullYear() + k, paid.getUTCMonth(), paid.getUTCDate())
    if (due.getTime() > t.getTime()) {
      const g = guidelineFor(isoDate(due))
      const days = daysBetween(lastDue, t)
      const yearLen = daysBetween(lastDue, due) || 365
      const accrued = days > 0 ? { since: isoDate(lastDue), nextDueOn: isoDate(due), days, pct: g.pct, published: g.published, amount: round2((dep * g.pct) / 100 * (days / yearLen)) } : null
      const total = round2(rows.reduce((s, r) => s + r.amount, 0))
      return { rows, total, accrued, notes: depositNotes() }
    }
    const g = guidelineFor(isoDate(due))
    rows.push({ dueOn: isoDate(due), year: g.year, pct: g.pct, published: g.published, amount: round2((dep * g.pct) / 100) })
    lastDue = due
    k += 1
    if (k > 60) break
  }
  return { rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)), accrued: null, notes: depositNotes() }
}

function depositNotes(): { statute: string; text: Bi }[] {
  const years = Object.keys(RENT_GUIDELINE).map(Number).sort((a, b) => a - b)
  const table = years.map((y) => `${y}: ${RENT_GUIDELINE[y]}%`).join(' · ')
  return [
    { statute: 'RTA s.106(6)', text: { zh: `房东须每年按当时有效的指导比例向租客支付押金利息（${table}）。`, en: `The landlord must pay interest on the deposit annually at the guideline in effect when the payment falls due (${table}).` } },
    { statute: 'RTA s.106(9)', text: { zh: '房东到期没付利息的，租客可以从随后任何一期租金里扣掉这笔金额——不限于最后一个月。', en: 'If the landlord does not pay the interest when due, the tenant may deduct it from a subsequent rent payment — any later payment, not only the last month.' } },
    { statute: 'RTA s.106(10)', text: { zh: '押金只能抵租约终止前最后一个租期的租金。', en: 'The deposit is applied to the rent for the last rental period before the tenancy ends.' } },
  ]
}

// ── Move-out checklist (shape follows lib/household/moveIn.ts) ───────────────
export type MoveOutItem = { key: string; group: 'notice' | 'money' | 'handover'; label: Bi; note?: Bi; needsNote?: Bi }

export const MOVE_OUT_ITEMS: MoveOutItem[] = [
  { key: 'n9_copy', group: 'notice', label: { zh: '退租通知（N9）副本与送达记录', en: 'Copy of the move-out notice (N9) and when it was given' }, needsNote: { zh: '送达日期 · 方式', en: 'date · how it was given' }, note: { zh: 'RTA s.47 · s.44：至少提前 60 天，终止日须是租期末日。', en: 'RTA s.47 · s.44: at least 60 days, ending on the last day of a rental period.' } },
  { key: 'deposit_interest', group: 'money', label: { zh: '核对押金利息是否付清', en: 'Check the deposit interest has been paid' }, note: { zh: 'RTA s.106(6) 每年按指导比例付息；未付的可从随后任一期租金里扣（s.106(9)）。', en: 'RTA s.106(6): interest annually at the guideline; unpaid interest may be deducted from a subsequent rent payment (s.106(9)).' } },
  { key: 'last_month', group: 'money', label: { zh: '确认最后一个月租金由押金抵付', en: 'Confirm the deposit covers the last month’s rent' }, note: { zh: 'RTA s.106(10)：押金只能抵最后一个租期的租金。', en: 'RTA s.106(10): the deposit is applied to the last rental period’s rent.' } },
  { key: 'photos_out', group: 'handover', label: { zh: '退房状态照片 · 与入住照片对照', en: 'Move-out photos · compared with the move-in set' }, note: { zh: '照片留在你自己的设备与邮件里；Stayloop 只记录「已拍」。', en: 'Photos stay on your own devices and email; Stayloop records only that they were taken.' } },
  { key: 'keys_return', group: 'handover', label: { zh: '钥匙 · 门禁卡 · 遥控交接记录', en: 'Keys, fobs and remotes handed back — with a record' }, needsNote: { zh: '几把 · 交给谁 · 日期', en: 'how many · to whom · date' } },
  { key: 'address_change', group: 'handover', label: { zh: '地址变更：邮局转寄、银行、驾照、健康卡、CRA', en: 'Change of address: mail forwarding, bank, driver’s licence, health card, CRA' } },
  { key: 'utilities_cancel', group: 'handover', label: { zh: '取消或过户水 / 电 / 气 / 网', en: 'Cancel or transfer hydro, water, gas, internet' }, needsNote: { zh: '哪几项 · 停用日', en: 'which ones · end date' } },
]

export function moveOutProgress(done: Set<string> | string[], items: MoveOutItem[] = MOVE_OUT_ITEMS): { done: number; total: number } {
  const set = done instanceof Set ? done : new Set(done)
  return { done: items.filter((i) => set.has(i.key)).length, total: items.length }
}

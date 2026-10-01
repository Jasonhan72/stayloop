// Rent-arrears repayment plan draft (proposal 2026-09-23 §3.4, P2). Pure.
// Ontario facts the draft has to respect:
//   • RTA s.206 — a repayment agreement filed with the LTB must be on the
//     LTB Payment Agreement Form since 2026-07-01 (rule RTA-206); a letter
//     between the parties is NOT the s.206 order. This draft is the
//     proposal the two sides agree on before the landlord fills the form.
//   • The landlord cannot add interest, fees or "late charges" (s.134).
//   • Nothing here is a notice of termination; an N4 is separate.
import { isoDate, parseDateOnly, todayUtc } from '@/lib/dates'

export type PaymentPlanInput = {
  arrears: number
  monthlyRent: number
  installments: number
  /** ISO date of the first instalment. */
  firstDue: string
  unit: string
  tenantName: string
  /** Due dates already missed (for the record line). */
  missed: string[]
}

export type PaymentPlan = {
  schedule: { due: string; amount: number; rentIncluded: number; arrearsPart: number }[]
  total: number
  ok: boolean
  reason?: 'no_arrears' | 'installments_out_of_range' | 'bad_date'
}

export const MIN_INSTALLMENTS = 1
export const MAX_INSTALLMENTS = 6

export function buildPaymentPlan(i: PaymentPlanInput): PaymentPlan {
  if (!(i.arrears > 0)) return { schedule: [], total: 0, ok: false, reason: 'no_arrears' }
  if (i.installments < MIN_INSTALLMENTS || i.installments > MAX_INSTALLMENTS) return { schedule: [], total: 0, ok: false, reason: 'installments_out_of_range' }
  const first = parseDateOnly(i.firstDue)
  if (!first) return { schedule: [], total: 0, ok: false, reason: 'bad_date' }
  const per = Math.round((i.arrears / i.installments) * 100) / 100
  const schedule: PaymentPlan['schedule'] = []
  let remaining = Math.round(i.arrears * 100) / 100
  for (let k = 0; k < i.installments; k++) {
    // Clamp to the month's last day (Jan 31 + 1 month = Feb 28/29, not Mar 3).
    const y = first.getUTCFullYear(); const m = first.getUTCMonth() + k
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const d = new Date(Date.UTC(y, m, Math.min(first.getUTCDate(), last)))
    const part = k === i.installments - 1 ? remaining : per
    remaining = Math.round((remaining - part) * 100) / 100
    schedule.push({ due: isoDate(d), arrearsPart: part, rentIncluded: i.monthlyRent, amount: Math.round((part + i.monthlyRent) * 100) / 100 })
  }
  return { schedule, total: Math.round(i.arrears * 100) / 100, ok: true }
}

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Bilingual proposal text for a send_message card. */
export function paymentPlanText(i: PaymentPlanInput, plan: PaymentPlan): { subject: string; body: string } {
  const rows = plan.schedule.map((s, k) => `  ${k + 1}. ${s.due} — ${money(s.amount)}（当月租金 ${money(s.rentIncluded)} + 欠款 ${money(s.arrearsPart)}）`).join('\n')
  const rowsEn = plan.schedule.map((s, k) => `  ${k + 1}. ${s.due} — ${money(s.amount)} (rent ${money(s.rentIncluded)} + arrears ${money(s.arrearsPart)})`).join('\n')
  const missed = i.missed.length ? i.missed.join('、') : '—'
  const subject = `还款计划提议 · ${i.unit} · 欠款 ${money(plan.total)} / Repayment plan proposal`
  const body =
    `${i.tenantName} 您好，\n\n` +
    `${i.unit} 的租金记录显示以下到期日未记录付款：${missed}，合计 ${money(plan.total)}。` +
    `为了不走 LTB 程序，我提议按下面的计划分 ${plan.schedule.length} 期补齐，每期与当月租金一起付：\n\n${rows}\n\n` +
    `说明：\n` +
    `  • 计划里没有任何利息、手续费或滞纳金（《住宅租赁法》s.134 不允许房东收取）。\n` +
    `  • 这封信只是提议，不是终止通知（N4 是另一份表格）。\n` +
    `  • 如果双方同意并希望有 LTB 效力，须自 2026-07-01 起使用 LTB 的「Payment Agreement Form」（RTA s.206）提交，邮件约定本身不具备该效力。\n` +
    `  • 请在方便时回复是否接受，或提出您能承受的期数。\n\n谢谢！\n\n` +
    `Hi ${i.tenantName},\n\n` +
    `The rent record for ${i.unit} shows no payment recorded for: ${missed}, totalling ${money(plan.total)}. ` +
    `To avoid the LTB route I propose clearing it in ${plan.schedule.length} instalment(s), each paid together with that month's rent:\n\n${rowsEn}\n\n` +
    `Notes:\n` +
    `  • No interest, fees or late charges are included (RTA s.134 does not allow them).\n` +
    `  • This is a proposal, not a notice of termination (an N4 is a separate form).\n` +
    `  • For LTB effect under s.206 the agreement must be filed on the LTB Payment Agreement Form (mandatory since 2026-07-01); an email agreement alone does not carry that effect.\n` +
    `  • Please reply whether this works, or suggest the number of instalments you can manage.\n\nThank you!`
  return { subject, body }
}

// ── The to-do card (sweep 2026-10-01) ─────────────────────────────────────────
// The card stores its inputs, not just frozen text: the executor re-checks
// rent_payments against missed_due_dates and refuses ('arrears_changed') once a
// listed period is recorded; mark_rent_paid() expires a pending card that listed
// the period. One pending card per lease — re-drafting updates it.
export const PAYMENT_PLAN_STAGE = 'payment_plan'

export type PaymentPlanCardMeta = {
  stage: typeof PAYMENT_PLAN_STAGE
  source: 'household_hub'
  lease_id: string
  household_id: string
  to_email: string
  missed_due_dates: string[]
  installments: number
  first_due: string
  arrears_total: number
  monthly_rent: number
  subject: string
  body: string
}

export function paymentPlanCardMetadata(a: { leaseId: string; householdId: string; toEmail: string; input: PaymentPlanInput; plan: PaymentPlan }): PaymentPlanCardMeta {
  const { subject, body } = paymentPlanText(a.input, a.plan)
  return {
    stage: PAYMENT_PLAN_STAGE,
    source: 'household_hub',
    lease_id: a.leaseId,
    household_id: a.householdId,
    to_email: a.toEmail,
    missed_due_dates: Array.from(new Set(a.input.missed.map((d) => d.slice(0, 10)))).sort(),
    installments: a.input.installments,
    first_due: a.input.firstDue,
    arrears_total: a.plan.total,
    monthly_rent: a.input.monthlyRent,
    subject,
    body,
  }
}

/** True when a stored card was drafted for exactly the periods that are unpaid now. */
export function planCardMatchesMissed(meta: unknown, missed: string[]): boolean {
  const listed = (meta as { missed_due_dates?: unknown } | null)?.missed_due_dates
  if (!Array.isArray(listed)) return false
  const a = Array.from(new Set(listed.map((d) => String(d).slice(0, 10)))).sort()
  const b = Array.from(new Set(missed.map((d) => d.slice(0, 10)))).sort()
  return a.length === b.length && a.every((d, i) => d === b[i])
}

/** Newest pending card is reused; any older duplicates are superseded. */
export function splitPlanCards<T extends { id: string; created_at: string }>(cards: T[]): { reuse: T | null; supersede: T[] } {
  const sorted = [...cards].sort((x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1 : 0))
  return { reuse: sorted[0] ?? null, supersede: sorted.slice(1) }
}

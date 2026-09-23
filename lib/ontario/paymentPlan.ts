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
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + k, first.getUTCDate()))
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

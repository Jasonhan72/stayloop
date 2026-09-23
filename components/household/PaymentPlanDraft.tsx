'use client'

// Landlord-side repayment plan draft on the household rent tab (P2
// 2026-09-23). Builds the schedule deterministically, then writes a
// `send_message` card the landlord approves on 待办 — the email goes out only
// after approval, and the executor takes the recipient from the lease.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { isoDate, todayUtc } from '@/lib/dates'
import { buildPaymentPlan, MAX_INSTALLMENTS, paymentPlanText } from '@/lib/ontario/paymentPlan'

export default function PaymentPlanDraft({ householdId, leaseId, unit, monthlyRent, missed, recorded, zh }: {
  householdId: string
  leaseId: string | null
  unit: string
  monthlyRent: number
  /** Past-due dates with no payment recorded. */
  missed: string[]
  /** Payments recorded so far — the draft is offered only when the ledger is actually in use (review 2026-09-23). */
  recorded: number
  zh: boolean
}) {
  const { user } = useAuth()
  const [lease, setLease] = useState<{ tenant_name: string | null; tenant_email: string | null } | null>(null)
  const [installments, setInstallments] = useState(3)
  const [firstDue, setFirstDue] = useState(() => { const d = todayUtc(); d.setUTCMonth(d.getUTCMonth() + 1, 1); return isoDate(d) })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!leaseId) return
    let cancelled = false
    supabase.from('lease_documents').select('tenant_name, tenant_email').eq('id', leaseId).maybeSingle().then(({ data }) => { if (!cancelled) setLease((data as typeof lease) ?? null) })
    return () => { cancelled = true }
  }, [leaseId])
  const arrears = missed.length * monthlyRent
  if (!missed.length || !monthlyRent || recorded === 0) return null
  const input = { arrears, monthlyRent, installments, firstDue, unit, tenantName: lease?.tenant_name || (zh ? '租客' : 'Tenant'), missed }
  const plan = buildPaymentPlan(input)

  async function propose() {
    if (!user || !plan.ok) return
    if (!lease?.tenant_email) { setErr(zh ? '租约上没有租客邮箱，无法发送。' : 'The lease has no tenant email.'); return }
    setBusy(true)
    const { subject, body } = paymentPlanText(input, plan)
    const { error } = await supabase.from('agent_pending_actions').insert({
      user_id: user.id,
      role: 'landlord',
      action_type: 'send_message',
      title: zh ? `还款计划提议 · ${unit} · ${missed.length} 期欠款` : `Repayment plan proposal · ${unit} · ${missed.length} period(s)`,
      summary: zh ? `按 ${installments} 期补齐 $${arrears.toLocaleString()}，每期随当月租金一起付，无利息与手续费。批准后发给 ${lease.tenant_email}；LTB 效力须另用 Payment Agreement Form（s.206）。` : `Clear $${arrears.toLocaleString()} in ${installments} instalment(s), each with that month's rent, no interest or fees. Sent to ${lease.tenant_email} after approval; LTB effect needs the Payment Agreement Form (s.206).`,
      recipient_label: lease.tenant_email,
      data_scope: ['租金记录', '还款计划'],
      excluded_data: ['筛查报告'],
      risk_level: 'low',
      status: 'pending',
      requires_approval: true,
      metadata: { lease_id: leaseId, household_id: householdId, to_email: lease.tenant_email, subject, body, stage: 'payment_plan', source: 'household_hub' },
    })
    setErr(error ? error.message : null)
    if (!error) setDone(subject)
    setBusy(false)
  }

  return (
    <div className="mt-4 rounded-xl border border-line-divider bg-surface-chip p-4" data-testid="payment-plan-draft">
      <div className="text-[13px] font-extrabold">{zh ? '起草还款计划' : 'Draft a repayment plan'}</div>
      <p className="mt-1 text-[11.5px] text-body-3">
        {zh ? `未记录付款 ${missed.length} 期，合计 $${arrears.toLocaleString()}——如果其实已收到，请先在下方「标记已付」。计划里不含利息或手续费（RTA s.134）；要有 LTB 效力须用 Payment Agreement Form（s.206，2026-07-01 起强制）。这不是 N4。` : `${missed.length} period(s) with no payment recorded, $${arrears.toLocaleString()} in total — if you did receive them, mark them paid below first. No interest or fees (RTA s.134); for LTB effect use the Payment Agreement Form (s.206, mandatory since 2026-07-01). This is not an N4.`}
      </p>
      {done ? (
        <div className="mt-3 text-[13px]">
          <span className="font-semibold text-success">✓ </span>{zh ? '已放到待办，预览后批准才会发送。' : 'Placed on your to-dos; it is sent only after you preview and approve.'}
          <Link href="/landlord/todo" className="ml-2 font-bold text-brand underline underline-offset-2">{zh ? '去批准 →' : 'Approve →'}</Link>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3 text-[12.5px]">
            <label className="flex flex-col gap-1">
              <span className="text-body-3">{zh ? '分几期' : 'Instalments'}</span>
              <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className="rounded-md border border-line-divider bg-white px-2 py-1.5">
                {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-body-3">{zh ? '第一期日期' : 'First instalment'}</span>
              <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className="rounded-md border border-line-divider bg-white px-2 py-1.5" />
            </label>
            <button type="button" disabled={busy || !plan.ok} onClick={() => void propose()} className="rounded-full bg-[#00ACE4] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">
              {zh ? '生成提议 → 待办' : 'Draft → to-dos'}
            </button>
          </div>
          {plan.ok && (
            <ul className="mt-3 space-y-1 font-mono text-[11.5px] text-body-2">
              {plan.schedule.map((s, k) => <li key={s.due}>{k + 1}. {s.due} — ${s.amount.toLocaleString()}（{zh ? '租金' : 'rent'} ${s.rentIncluded.toLocaleString()} + {zh ? '欠款' : 'arrears'} ${s.arrearsPart.toLocaleString()}）</li>)}
            </ul>
          )}
          {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
        </>
      )}
    </div>
  )
}

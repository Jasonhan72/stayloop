'use client'

// Landlord-side repayment plan draft on the household rent tab (P2
// 2026-09-23). Builds the schedule deterministically, then writes a
// `send_message` card the landlord approves on 待办 — the email goes out only
// after approval, and the executor takes the recipient from the lease.
// Sweep 2026-10-01: the card stores its inputs (missed_due_dates, instalments,
// first_due) so the executor can refuse once a listed period is recorded, and
// there is one pending card per lease — drafting again updates it.
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { isoDate, todayUtc } from '@/lib/dates'
import { notifyPendingChanged } from '@/lib/agent/pendingCount'
import {
  buildPaymentPlan, MAX_INSTALLMENTS, PAYMENT_PLAN_STAGE, paymentPlanCardMetadata, planCardMatchesMissed, splitPlanCards,
  type PaymentPlanCardMeta,
} from '@/lib/ontario/paymentPlan'

type PlanCard = { id: string; created_at: string; metadata: Partial<PaymentPlanCardMeta> | null }

export default function PaymentPlanDraft({ householdId, leaseId, unit, monthlyRent, missed, arrears: arrearsIn, recorded, zh }: {
  householdId: string
  leaseId: string | null
  unit: string
  monthlyRent: number
  /** Past-due scheduled dates with no payment recorded. */
  missed: string[]
  /** Their total from each period's own amount (missedArrears); falls back to missed × monthly rent. */
  arrears?: number
  /** Payments recorded so far — the draft is offered only when the ledger is actually in use (review 2026-09-23). */
  recorded: number
  zh: boolean
}) {
  const { user } = useAuth()
  const [lease, setLease] = useState<{ tenant_name: string | null; tenant_email: string | null } | null>(null)
  const [cards, setCards] = useState<PlanCard[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [installments, setInstallments] = useState(3)
  const [firstDue, setFirstDue] = useState(() => { const d = todayUtc(); d.setUTCMonth(d.getUTCMonth() + 1, 1); return isoDate(d) })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!leaseId) return
    let cancelled = false
    supabase.from('lease_documents').select('tenant_name, tenant_email').eq('id', leaseId).maybeSingle().then(({ data }) => { if (!cancelled) setLease((data as typeof lease) ?? null) })
    return () => { cancelled = true }
  }, [leaseId])
  // The pending plan card(s) already on 待办 for this lease. Re-read whenever the unpaid
  // periods change: recording a period expires a card that listed it (mark_rent_paid).
  const missedKey = missed.join(',')
  const loadCards = useCallback(async () => {
    if (!leaseId || !user) return
    const { data } = await supabase.from('agent_pending_actions')
      .select('id, created_at, metadata')
      .eq('user_id', user.id).eq('status', 'pending').eq('action_type', 'send_message')
      .contains('metadata', { stage: PAYMENT_PLAN_STAGE, lease_id: leaseId })
      .order('created_at', { ascending: false })
    setCards((data as PlanCard[] | null) ?? [])
  }, [leaseId, user])
  useEffect(() => { void loadCards() }, [loadCards, missedKey])

  const arrears = typeof arrearsIn === 'number' && arrearsIn > 0 ? arrearsIn : missed.length * monthlyRent
  if (!missed.length || !monthlyRent || recorded === 0) return null
  const input = { arrears, monthlyRent, installments, firstDue, unit, tenantName: lease?.tenant_name || (zh ? '租客' : 'Tenant'), missed }
  const plan = buildPaymentPlan(input)
  const current = cards?.[0] ?? null
  const currentMatches = current ? planCardMatchesMissed(current.metadata, missed) : false
  const cm = current?.metadata ?? null
  const cmArrears = cm && typeof cm.arrears_total === 'number' ? cm.arrears_total : null
  const cmInstallments = cm && typeof cm.installments === 'number' ? cm.installments : null
  const cmFirstDue = cm && typeof cm.first_due === 'string' ? cm.first_due : null
  const existingDetail = [
    cmArrears != null ? `$${cmArrears.toLocaleString()}` : null,
    cmInstallments != null ? (zh ? `分 ${cmInstallments} 期` : `${cmInstallments} instalment(s)`) : null,
    cmFirstDue ? (zh ? `第一期 ${cmFirstDue}` : `first on ${cmFirstDue}`) : null,
  ].filter(Boolean).join(zh ? '，' : ', ')

  function startEditing() {
    const m = current?.metadata
    if (m && typeof m.installments === 'number' && m.installments >= 1 && m.installments <= MAX_INSTALLMENTS) setInstallments(m.installments)
    if (m && typeof m.first_due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.first_due)) setFirstDue(m.first_due)
    setDone(false)
    setEditing(true)
  }

  async function propose() {
    if (!user || !plan.ok || !leaseId) return
    if (!lease?.tenant_email) { setErr(zh ? '租约上没有租客邮箱，无法发送。' : 'The lease has no tenant email.'); return }
    setBusy(true)
    const metadata = paymentPlanCardMetadata({ leaseId, householdId, toEmail: lease.tenant_email, input, plan })
    const fields = {
      title: zh ? `还款计划提议 · ${unit} · ${missed.length} 期欠款` : `Repayment plan proposal · ${unit} · ${missed.length} period(s)`,
      summary: zh ? `按 ${installments} 期补齐 $${arrears.toLocaleString()}，每期随当月租金一起付，无利息与手续费。批准后发给 ${lease.tenant_email}；LTB 效力须另用 Payment Agreement Form（s.206）。` : `Clear $${arrears.toLocaleString()} in ${installments} instalment(s), each with that month's rent, no interest or fees. Sent to ${lease.tenant_email} after approval; LTB effect needs the Payment Agreement Form (s.206).`,
      recipient_label: lease.tenant_email,
      data_scope: ['租金记录', '还款计划'],
      excluded_data: ['筛查报告'],
      risk_level: 'low',
      metadata,
    }
    const { reuse, supersede } = splitPlanCards(cards ?? [])
    let saved = false
    let error: { message: string } | null = null
    if (reuse) {
      // Only while it is still pending — an approved or expired card is never rewritten.
      const r = await supabase.from('agent_pending_actions').update(fields).eq('id', reuse.id).eq('status', 'pending').select('id')
      error = r.error
      saved = !r.error && (r.data?.length ?? 0) > 0
    }
    if (!saved && !error) {
      const r = await supabase.from('agent_pending_actions').insert({
        user_id: user.id, role: 'landlord', action_type: 'send_message', status: 'pending', requires_approval: true, ...fields,
      })
      error = r.error
      saved = !r.error
    }
    if (saved && supersede.length) {
      await supabase.from('agent_pending_actions')
        .update({ status: 'expired', execution_result: { ok: false, reason: 'superseded' } })
        .in('id', supersede.map((c) => c.id)).eq('status', 'pending')
    }
    setErr(error ? error.message : null)
    if (saved) { setDone(true); setEditing(false); notifyPendingChanged() }
    await loadCards()
    setBusy(false)
  }

  const showForm = editing || !current
  return (
    <div className="mt-4 rounded-xl border border-line-divider bg-surface-chip p-4" data-testid="payment-plan-draft">
      <div className="text-[13px] font-extrabold">{zh ? '起草还款计划' : 'Draft a repayment plan'}</div>
      <p className="mt-1 text-[11.5px] text-body-3">
        {zh ? `未记录付款 ${missed.length} 期，合计 $${arrears.toLocaleString()}——如果其实已收到，请先在下方「标记已付」。计划里不含利息或手续费（RTA s.134）；要有 LTB 效力须用 Payment Agreement Form（s.206，2026-07-01 起强制）。这不是 N4。` : `${missed.length} period(s) with no payment recorded, $${arrears.toLocaleString()} in total — if you did receive them, mark them paid below first. No interest or fees (RTA s.134); for LTB effect use the Payment Agreement Form (s.206, mandatory since 2026-07-01). This is not an N4.`}
      </p>
      {done && !editing && (
        <div className="mt-3 text-[13px]">
          <span className="font-semibold text-success">✓ </span>{zh ? '已放到待办，预览后批准才会发送。' : 'Placed on your to-dos; it is sent only after you preview and approve.'}
          <Link href="/landlord/todo" className="ml-2 font-bold text-brand underline underline-offset-2">{zh ? '去批准 →' : 'Approve →'}</Link>
        </div>
      )}
      {current && !editing && !done && (
        <div className="mt-3 text-[12.5px]" data-testid="payment-plan-existing">
          <p className="text-body-2">
            {zh
              ? `待办里已有一张还款计划提议${existingDetail ? `（${existingDetail}）` : ''}，还没有发送，预览后批准才会发出。`
              : `A repayment plan proposal is already on your to-dos${existingDetail ? ` (${existingDetail})` : ''}; nothing has been sent — it goes out only after you preview and approve.`}
          </p>
          {!currentMatches && (
            <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800" data-testid="payment-plan-stale">
              {zh ? '这张提议是按之前的租金记录生成的，和现在未记录的期数不一致。请按现在的记录重新生成后再批准。' : 'That proposal was drafted from an earlier rent record and no longer matches the unpaid periods. Regenerate it from the current record before approving.'}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={startEditing} className="rounded-full border border-line-divider bg-white px-3.5 py-1.5 text-[12px] font-bold hover:border-[#00ACE4]">
              {zh ? '按现在的记录重新生成' : 'Regenerate from the current record'}
            </button>
            <Link href="/landlord/todo" className="font-bold text-brand underline underline-offset-2">{zh ? '去待办查看 →' : 'Open to-dos →'}</Link>
          </div>
        </div>
      )}
      {showForm && !(done && !editing) && cards !== null && (
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
              {current ? (zh ? '更新待办里的提议' : 'Update the proposal on to-dos') : (zh ? '生成提议 → 待办' : 'Draft → to-dos')}
            </button>
            {editing && (
              <button type="button" onClick={() => setEditing(false)} className="text-[12px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button>
            )}
          </div>
          {plan.ok && (
            <ul className="mt-3 space-y-1 font-mono text-[11.5px] text-body-2">
              {plan.schedule.map((s, k) => <li key={s.due}>{k + 1}. {s.due} — ${s.amount.toLocaleString()}（{zh ? '租金' : 'rent'} ${s.rentIncluded.toLocaleString()} + {zh ? '欠款' : 'arrears'} ${s.arrearsPart.toLocaleString()}）</li>)}
            </ul>
          )}
        </>
      )}
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
    </div>
  )
}

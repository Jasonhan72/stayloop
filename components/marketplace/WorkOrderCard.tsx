'use client'

// One work order as each party sees it (services marketplace §3). The same
// card renders on the household hub (landlord + tenant), the landlord board
// and the provider's job list; `viewer` decides which buttons appear. All
// transitions go through /api/work-orders/[id]/act — the server derives the
// actor from the row, this component only offers the buttons.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { canAct, invoiceWithinEstimate, WO_STATUS_LABEL, type ActorKind, type WoAction, type WorkOrderStatus } from '@/lib/marketplace/workOrders'
import { TRADES } from '@/lib/marketplace/trades'

export type WorkOrderLite = {
  id: string; status: WorkOrderStatus; trade: string | null; scope: string | null; emergency: boolean; entry_permission: string | null
  provider_id: string | null; external_email: string | null; external_name: string | null
  quote_amount: number | null; quote_type: string | null; quote_note: string | null; quoted_at: string | null
  approved_amount: number | null; approved_at: string | null; schedule_start: string | null; schedule_end: string | null; entry_notice_sent_at: string | null
  arrived_at: string | null; completed_at: string | null; completion_note: string | null; invoice_amount: string | number | null; invoice_note: string | null
  tenant_confirmed_at: string | null; accepted_at: string | null; paid_at: string | null; dispute_reason: string | null; resolution_note: string | null; cancel_reason: string | null
  created_at: string; updated_at: string
}
type Ev = { id: number; actor_kind: string; event: string; payload: Record<string, unknown>; created_at: string }

const money = (n: number | string | null | undefined) => (n == null || n === '' ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) : '—')
const EVENT_ZH: Record<string, string> = { offered: '已派单', accept: '接单并报价', quote: '更新报价', decline: '婉拒', approve_quote: '房东批准报价', reject_quote: '房东拒绝报价', arrive: '已到场', complete: '已完工', tenant_confirm: '租客确认已解决', accept_completion: '房东验收', request_rework: '要求返工', dispute: '提出争议', resolve_dispute: '争议已裁定', mark_paid: '已标记付款', close: '归档', cancel: '取消' }

export async function actOn(id: string, action: WoAction, payload: Record<string, unknown> = {}): Promise<{ ok: boolean; error?: string; status?: string }> {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) return { ok: false, error: 'not signed in' }
  const res = await fetch(`/api/work-orders/${id}/act`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, payload }) })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string }
  return res.ok ? { ok: true, status: j.status } : { ok: false, error: j.error || `HTTP ${res.status}` }
}

export default function WorkOrderCard({ wo, viewer, zh, providerName, onChange, compact = false }: {
  wo: WorkOrderLite
  viewer: ActorKind
  zh: boolean
  providerName?: string | null
  onChange?: () => void | Promise<void>
  compact?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<null | 'quote' | 'complete' | 'rework' | 'dispute' | 'cancel'>(null)
  const [form, setForm] = useState({ amount: '', type: 'fixed', note: '', schedule_start: '', schedule_end: '', invoice_amount: '', reason: '' })
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [showEvents, setShowEvents] = useState(false)
  useEffect(() => {
    if (!showEvents) return
    supabase.from('work_order_events').select('id, actor_kind, event, payload, created_at').eq('work_order_id', wo.id).order('id', { ascending: true }).then(({ data }) => setEvents((data ?? []) as Ev[]))
  }, [showEvents, wo.id, wo.updated_at])

  const st = WO_STATUS_LABEL[wo.status]
  const tone = st.tone === 'ok' ? 'bg-success/10 text-success' : st.tone === 'danger' ? 'bg-danger/10 text-danger' : st.tone === 'warn' ? 'bg-amber-50 text-amber-800' : st.tone === 'info' ? 'bg-brand/10 text-brand' : 'bg-surface-chip text-body-3'
  const who = providerName || wo.external_name || wo.external_email || (zh ? '服务商' : 'Contractor')
  const trade = TRADES.find((t) => t.key === wo.trade)
  const cpa = invoiceWithinEstimate(wo.approved_amount, wo.invoice_amount == null || wo.invoice_amount === '' ? null : Number(wo.invoice_amount))
  const can = (a: WoAction) => canAct(a, wo.status, viewer).ok

  async function run(action: WoAction, payload: Record<string, unknown> = {}) {
    setBusy(action); setErr(null)
    const r = await actOn(wo.id, action, payload)
    if (!r.ok) setErr(r.error || 'failed')
    else { setOpen(null); await onChange?.() }
    setBusy(null)
  }
  const btn = 'rounded-full px-3 py-1.5 text-[12px] font-bold disabled:opacity-50'
  const primary = btn + ' bg-brand text-white'
  const secondary = btn + ' border border-line-strong bg-white text-body'
  const danger = btn + ' border border-danger/40 bg-white text-danger'
  const input = 'rounded-md border border-line-divider bg-white px-2.5 py-1.5 text-[12.5px]'

  return (
    <div className="rounded-xl border border-line-divider bg-white p-4" data-testid="work-order-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className={'rounded-full px-2.5 py-[3px] font-mono text-[10.5px] font-bold ' + tone}>{zh ? st.zh : st.en}</span>
        {wo.emergency && <span className="rounded-full bg-danger/10 px-2 py-[3px] font-mono text-[10px] font-bold text-danger">{zh ? '紧急' : 'URGENT'}</span>}
        <span className="text-[13px] font-semibold">{who}</span>
        {trade && <span className="text-[11.5px] text-body-3">· {zh ? trade.zh : trade.en}</span>}
        <span className="ml-auto text-[11px] text-body-3">{when(wo.updated_at)}</span>
      </div>
      {!compact && wo.scope && <p className="mt-1.5 text-[12.5px] text-body-2">{wo.scope}</p>}
      <div className="mt-2 grid gap-1 text-[12px] text-body-2 sm:grid-cols-2">
        {wo.quote_amount != null && <div>{zh ? '报价' : 'Quote'}: <b>{money(wo.quote_amount)}</b>{wo.quote_type === 'hourly_estimate' ? (zh ? '（工时估算）' : ' (hourly est.)') : ''}{wo.quote_note ? ` · ${wo.quote_note}` : ''}</div>}
        {wo.schedule_start && <div>{zh ? '到场时间' : 'Window'}: {when(wo.schedule_start)}{wo.schedule_end ? ` – ${when(wo.schedule_end)}` : ''}</div>}
        {wo.entry_permission && <div>{zh ? '进入方式' : 'Entry'}: {wo.entry_permission === 'tenant_present' ? (zh ? '须租客在场' : 'tenant present') : wo.entry_permission === 'call_first' ? (zh ? '先电话' : 'call first') : (zh ? '按通知进入' : 'per notice')}{wo.entry_notice_sent_at ? (zh ? ' · 进入通知已发' : ' · notice sent') : ''}</div>}
        {wo.arrived_at && <div>{zh ? '到场' : 'Arrived'}: {when(wo.arrived_at)}</div>}
        {wo.completed_at && <div>{zh ? '完工' : 'Completed'}: {when(wo.completed_at)}{wo.completion_note ? ` · ${wo.completion_note}` : ''}</div>}
        {wo.invoice_amount != null && wo.invoice_amount !== '' && <div>{zh ? '账单' : 'Invoice'}: <b>{money(wo.invoice_amount)}</b>{wo.approved_amount != null ? ` (${zh ? '批准报价' : 'approved'} ${money(wo.approved_amount)})` : ''}{!cpa.ok && <span className="ml-1 font-bold text-danger">{zh ? `⚠ 超出报价 ${cpa.overBy}%（CPA 10% 规则）` : `⚠ ${cpa.overBy}% over the estimate (CPA 10% rule)`}</span>}</div>}
        {wo.tenant_confirmed_at && <div className="text-success">✓ {zh ? '租客确认已解决' : 'Tenant confirmed resolved'} · {when(wo.tenant_confirmed_at)}</div>}
        {wo.accepted_at && <div className="text-success">✓ {zh ? '房东已验收' : 'Accepted by landlord'} · {when(wo.accepted_at)}</div>}
        {wo.paid_at && <div className="text-success">✓ {zh ? '已付款（线下）' : 'Paid (offline)'} · {when(wo.paid_at)}</div>}
        {wo.dispute_reason && <div className="text-danger">{zh ? '争议' : 'Dispute'}: {wo.dispute_reason}{wo.resolution_note ? ` → ${wo.resolution_note}` : ''}</div>}
        {wo.cancel_reason && <div className="text-body-3">{zh ? '取消原因' : 'Cancelled'}: {wo.cancel_reason}</div>}
      </div>

      {/* Actions by viewer */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(viewer === 'provider' || viewer === 'external') && (<>
          {can('accept') && <button className={primary} disabled={!!busy} onClick={() => setOpen(open === 'quote' ? null : 'quote')}>{zh ? '接单并报价' : 'Accept & quote'}</button>}
          {can('quote') && wo.status === 'quoted' && <button className={secondary} disabled={!!busy} onClick={() => setOpen(open === 'quote' ? null : 'quote')}>{zh ? '修改报价' : 'Revise quote'}</button>}
          {can('decline') && <button className={danger} disabled={!!busy} onClick={() => void run('decline')}>{zh ? '婉拒' : 'Decline'}</button>}
          {can('arrive') && <button className={primary} disabled={!!busy} onClick={() => void run('arrive')}>{zh ? '已到场' : 'Arrived'}</button>}
          {can('complete') && <button className={primary} disabled={!!busy} onClick={() => setOpen(open === 'complete' ? null : 'complete')}>{zh ? '完工 + 账单' : 'Complete + invoice'}</button>}
          {can('cancel') && wo.status !== 'offered' && <button className={secondary} disabled={!!busy} onClick={() => setOpen(open === 'cancel' ? null : 'cancel')}>{zh ? '取消' : 'Cancel'}</button>}
        </>)}
        {viewer === 'landlord' && (<>
          {can('approve_quote') && <button className={primary} disabled={!!busy} onClick={() => void run('approve_quote')}>{zh ? '批准报价（会发进入通知）' : 'Approve quote (sends entry notice)'}</button>}
          {can('reject_quote') && <button className={danger} disabled={!!busy} onClick={() => void run('reject_quote')}>{zh ? '拒绝报价' : 'Reject quote'}</button>}
          {can('accept_completion') && <button className={primary} disabled={!!busy} onClick={() => void run('accept_completion')}>{zh ? '验收' : 'Accept work'}</button>}
          {can('request_rework') && <button className={secondary} disabled={!!busy} onClick={() => setOpen(open === 'rework' ? null : 'rework')}>{zh ? '要求返工' : 'Request rework'}</button>}
          {can('mark_paid') && <button className={secondary} disabled={!!busy} onClick={() => void run('mark_paid')}>{zh ? '标记已付（线下）' : 'Mark paid (offline)'}</button>}
          {can('dispute') && <button className={danger} disabled={!!busy} onClick={() => setOpen(open === 'dispute' ? null : 'dispute')}>{zh ? '争议' : 'Dispute'}</button>}
          {can('cancel') && <button className={secondary} disabled={!!busy} onClick={() => setOpen(open === 'cancel' ? null : 'cancel')}>{zh ? '取消工单' : 'Cancel'}</button>}
          {can('close') && wo.status === 'paid' && <button className={secondary} disabled={!!busy} onClick={() => void run('close')}>{zh ? '归档' : 'Close'}</button>}
        </>)}
        {viewer === 'tenant' && can('tenant_confirm') && !wo.tenant_confirmed_at && (
          <button className={primary} disabled={!!busy} onClick={() => void run('tenant_confirm')}>{zh ? '确认问题已解决' : 'Confirm it is fixed'}</button>
        )}
        <button className="ml-auto text-[11.5px] text-body-3 underline underline-offset-2" onClick={() => setShowEvents((v) => !v)}>{showEvents ? (zh ? '收起记录' : 'Hide log') : (zh ? '时间线' : 'Timeline')}</button>
      </div>

      {open === 'quote' && (
        <div className="mt-3 grid gap-2 rounded-lg bg-surface-chip p-3 sm:grid-cols-2">
          <input className={input} inputMode="decimal" placeholder={zh ? '金额（CAD，含税前）' : 'Amount (CAD)'} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="fixed">{zh ? '固定价' : 'Fixed'}</option><option value="hourly_estimate">{zh ? '工时估算' : 'Hourly estimate'}</option></select>
          <label className="text-[11px] text-body-3">{zh ? '可到场 从' : 'Window from'}<input type="datetime-local" className={input + ' mt-1 w-full'} value={form.schedule_start} onChange={(e) => setForm({ ...form, schedule_start: e.target.value })} /></label>
          <label className="text-[11px] text-body-3">{zh ? '到' : 'to'}<input type="datetime-local" className={input + ' mt-1 w-full'} value={form.schedule_end} onChange={(e) => setForm({ ...form, schedule_end: e.target.value })} /></label>
          <input className={input + ' sm:col-span-2'} placeholder={zh ? '范围说明（材料 / 不含项）' : 'Scope note (materials / exclusions)'} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="sm:col-span-2"><button className={primary} disabled={!!busy || form.amount === ''} onClick={() => void run(wo.status === 'offered' ? 'accept' : 'quote', { amount: Number(form.amount), type: form.type, note: form.note, schedule_start: form.schedule_start ? new Date(form.schedule_start).toISOString() : undefined, schedule_end: form.schedule_end ? new Date(form.schedule_end).toISOString() : undefined })}>{zh ? '发送报价' : 'Send quote'}</button></div>
          <p className="text-[11px] text-body-3 sm:col-span-2">{zh ? '报价一经房东批准，最终账单不得超出 10%，除非增项经房东再次批准（安省《消费者保护法》）。' : 'Once approved, the invoice may not exceed the quote by more than 10% unless extras are re-approved (Ontario CPA).'}</p>
        </div>
      )}
      {open === 'complete' && (
        <div className="mt-3 grid gap-2 rounded-lg bg-surface-chip p-3 sm:grid-cols-2">
          <input className={input + ' sm:col-span-2'} placeholder={zh ? '完工说明（做了什么、用了什么）' : 'What was done, what was used'} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <input className={input} inputMode="decimal" placeholder={zh ? '账单金额（CAD）' : 'Invoice amount (CAD)'} value={form.invoice_amount} onChange={(e) => setForm({ ...form, invoice_amount: e.target.value })} />
          <div><button className={primary} disabled={!!busy} onClick={() => void run('complete', { note: form.note, invoice_amount: form.invoice_amount === '' ? null : Number(form.invoice_amount) })}>{zh ? '提交完工' : 'Submit completion'}</button></div>
        </div>
      )}
      {(open === 'rework' || open === 'dispute' || open === 'cancel') && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-lg bg-surface-chip p-3">
          <input className={input + ' flex-1'} placeholder={zh ? '原因' : 'Reason'} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <button className={open === 'rework' ? primary : danger} disabled={!!busy || !form.reason.trim()} onClick={() => void run(open === 'rework' ? 'request_rework' : open === 'dispute' ? 'dispute' : 'cancel', { reason: form.reason })}>{zh ? '确认' : 'Confirm'}</button>
        </div>
      )}
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      {showEvents && (
        <ul className="mt-3 space-y-1 border-t border-line-divider pt-2 font-mono text-[11px] text-body-3">
          {(events ?? []).map((e) => <li key={e.id}>{when(e.created_at)} · {e.actor_kind} · {zh ? EVENT_ZH[e.event] ?? e.event : e.event}{e.payload && typeof e.payload.amount === 'number' ? ` · ${money(e.payload.amount as number)}` : ''}{typeof e.payload?.reason === 'string' && e.payload.reason ? ` · ${e.payload.reason}` : ''}</li>)}
          {events && events.length === 0 && <li>—</li>}
        </ul>
      )}
    </div>
  )
}

'use client'

export const runtime = 'edge'

// /w/[token] — the external contractor's job page (Phase 0 "派给自己的联系人").
// No account: the emailed token is the credential. Mobile-first, four big
// buttons. The full address appears only after accepting.
import { useCallback, useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useParams } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { WO_STATUS_LABEL, type WorkOrderStatus } from '@/lib/marketplace/workOrders'

type View = {
  work_order: { id: string; status: WorkOrderStatus; trade: string | null; scope: string | null; emergency: boolean; entry_permission: string | null; quote_amount: number | null; quote_type: string | null; approved_amount: number | null; schedule_start: string | null; schedule_end: string | null; arrived_at: string | null; completed_at: string | null; invoice_amount: number | null; accepted_at: string | null; paid_at: string | null; external_name: string | null; created_at: string }
  ticket: { title: string; description: string | null; category: string | null; priority: string }
  address: { city: string | null; full: string | null }
  landlord_email: string | null
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-white"><Header variant="transparent" /><div className="mx-auto w-full max-w-[640px] flex-1 px-5 py-8">{children}</div><Footer /></div>
}

export default function ExternalJobPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const { lang } = useT()
  const zh = lang === 'zh'
  const [v, setV] = useState<View | null | 'loading' | 'missing'>('loading')
  const [form, setForm] = useState({ amount: '', type: 'fixed', note: '', schedule_start: '', schedule_end: '', invoice_amount: '', reason: '' })
  const [open, setOpen] = useState<null | 'quote' | 'complete' | 'decline'>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/w/${token}`, { cache: 'no-store' })
    if (!res.ok) { setV('missing'); return }
    setV((await res.json()) as View)
  }, [token])
  useEffect(() => { if (token) void load() }, [token, load])

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setErr(null)
    const res = await fetch(`/api/w/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) setErr(j.error || `HTTP ${res.status}`)
    else { setOpen(null); await load() }
    setBusy(false)
  }
  if (v === 'loading') return <Shell><div className="py-20 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div></Shell>
  if (v === 'missing' || !v) return <Shell><div className="py-16 text-center"><h1 className="text-[20px] font-extrabold">{zh ? '链接无效或已过期' : 'This link is invalid or expired'}</h1><p className="mt-2 text-[13px] text-body-3">{zh ? '请联系派单的房东重新发送。' : 'Ask the landlord who sent it to resend.'}</p></div></Shell>
  const w = v.work_order
  const st = WO_STATUS_LABEL[w.status]
  const money = (n: number | null) => (n == null ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`)
  const when = (s: string | null) => (s ? new Date(s).toLocaleString(zh ? 'zh-CN' : 'en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) : '—')
  const input = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2.5 text-[15px]'
  const big = 'w-full rounded-xl px-4 py-3.5 text-[15px] font-bold disabled:opacity-50'
  return (
    <Shell>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '维修工单 · 通过 Stayloop 派单' : 'WORK ORDER · VIA STAYLOOP'}</div>
      <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">{v.ticket.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-surface-chip px-2.5 py-[3px] font-mono text-[11px] font-bold text-body-2">{zh ? st.zh : st.en}</span>
        {w.emergency && <span className="rounded-full bg-danger/10 px-2.5 py-[3px] font-mono text-[11px] font-bold text-danger">{zh ? '紧急' : 'URGENT'}</span>}
      </div>
      <div className="mt-4 space-y-1.5 rounded-2xl border border-line-divider bg-white p-4 text-[13.5px]">
        {v.ticket.description && <p className="text-body-2">{v.ticket.description}</p>}
        <div><b>{zh ? '位置' : 'Location'}:</b> {v.address.full || `${v.address.city || '—'}（${zh ? '接单后显示完整地址' : 'full address after you accept'}）`}</div>
        <div><b>{zh ? '进入方式' : 'Entry'}:</b> {w.entry_permission === 'tenant_present' ? (zh ? '须租客在场' : 'tenant must be present') : w.entry_permission === 'call_first' ? (zh ? '进入前先电话联系租客' : 'call the tenant before entering') : (zh ? '房东会给租客发 24 小时进入通知' : 'the landlord sends the tenant a 24-hour notice')}</div>
        {v.landlord_email && <div><b>{zh ? '房东' : 'Landlord'}:</b> <a className="underline" href={`mailto:${v.landlord_email}`}>{v.landlord_email}</a></div>}
        {w.quote_amount != null && <div><b>{zh ? '你的报价' : 'Your quote'}:</b> {money(w.quote_amount)}{w.approved_amount != null ? ` · ${zh ? '已批准' : 'approved'}` : ''}</div>}
        {w.schedule_start && <div><b>{zh ? '到场时间' : 'Window'}:</b> {when(w.schedule_start)}{w.schedule_end ? ` – ${when(w.schedule_end)}` : ''}</div>}
        {w.arrived_at && <div>✓ {zh ? '已到场' : 'Arrived'} {when(w.arrived_at)}</div>}
        {w.completed_at && <div>✓ {zh ? '已完工' : 'Completed'} {when(w.completed_at)} · {zh ? '账单' : 'invoice'} {money(w.invoice_amount)}</div>}
        {w.accepted_at && <div className="text-success">✓ {zh ? '房东已验收' : 'Accepted by the landlord'}</div>}
        {w.paid_at && <div className="text-success">✓ {zh ? '房东已标记付款' : 'Marked paid by the landlord'}</div>}
      </div>

      <div className="mt-4 space-y-2">
        {w.status === 'offered' && (<>
          <button className={big + ' bg-brand text-white'} disabled={busy} onClick={() => setOpen(open === 'quote' ? null : 'quote')}>{zh ? '接单并报价' : 'Accept & quote'}</button>
          <button className={big + ' border border-line-strong bg-white text-body'} disabled={busy} onClick={() => setOpen(open === 'decline' ? null : 'decline')}>{zh ? '婉拒' : 'Decline'}</button>
        </>)}
        {w.status === 'quoted' && <p className="text-[13px] text-body-3">{zh ? '等房东批准报价。批准后这里会出现「已到场」按钮，你也会收到邮件。' : 'Waiting for the landlord to approve. The "Arrived" button appears here once approved; you will also get an email.'}</p>}
        {(w.status === 'scheduled' || w.status === 'rework') && <button className={big + ' bg-brand text-white'} disabled={busy} onClick={() => void act('arrive')}>{zh ? '我已到场' : 'I have arrived'}</button>}
        {(w.status === 'scheduled' || w.status === 'in_progress' || w.status === 'rework') && <button className={big + ' bg-success text-white'} disabled={busy} onClick={() => setOpen(open === 'complete' ? null : 'complete')}>{zh ? '完工 + 账单' : 'Complete + invoice'}</button>}
        {w.status === 'completed' && <p className="text-[13px] text-body-3">{zh ? '已提交完工，等房东验收。' : 'Completion submitted; waiting for the landlord to accept.'}</p>}
      </div>

      {open === 'quote' && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-chip p-4">
          <input className={input} inputMode="decimal" placeholder={zh ? '报价金额（CAD，税前）' : 'Quote amount (CAD)'} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="fixed">{zh ? '固定价' : 'Fixed price'}</option><option value="hourly_estimate">{zh ? '工时估算' : 'Hourly estimate'}</option></select>
          <label className="block text-[12px] text-body-3">{zh ? '可到场 从' : 'Window from'}<input type="datetime-local" className={input + ' mt-1'} value={form.schedule_start} onChange={(e) => setForm({ ...form, schedule_start: e.target.value })} /></label>
          <label className="block text-[12px] text-body-3">{zh ? '到' : 'to'}<input type="datetime-local" className={input + ' mt-1'} value={form.schedule_end} onChange={(e) => setForm({ ...form, schedule_end: e.target.value })} /></label>
          <input className={input} placeholder={zh ? '范围说明（可选）' : 'Scope note (optional)'} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button className={big + ' bg-brand text-white'} disabled={busy || form.amount === ''} onClick={() => void act('accept', { amount: Number(form.amount), type: form.type, note: form.note, schedule_start: form.schedule_start ? new Date(form.schedule_start).toISOString() : undefined, schedule_end: form.schedule_end ? new Date(form.schedule_end).toISOString() : undefined })}>{zh ? '发送报价' : 'Send quote'}</button>
          <p className="text-[11.5px] text-body-3">{zh ? '报价一经房东批准，最终账单不得超出 10%，除非增项经房东再次批准（安省《消费者保护法》）。费用由房东承担。' : 'Once approved, the invoice may not exceed the quote by more than 10% unless extras are re-approved (Ontario CPA). The landlord pays.'}</p>
        </div>
      )}
      {open === 'complete' && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-chip p-4">
          <textarea className={input + ' min-h-[80px]'} placeholder={zh ? '完工说明：做了什么、换了什么' : 'What was done, what was replaced'} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <input className={input} inputMode="decimal" placeholder={zh ? '账单金额（CAD）' : 'Invoice amount (CAD)'} value={form.invoice_amount} onChange={(e) => setForm({ ...form, invoice_amount: e.target.value })} />
          <button className={big + ' bg-success text-white'} disabled={busy} onClick={() => void act('complete', { note: form.note, invoice_amount: form.invoice_amount === '' ? null : Number(form.invoice_amount) })}>{zh ? '提交完工' : 'Submit'}</button>
        </div>
      )}
      {open === 'decline' && (
        <div className="mt-3 space-y-2 rounded-2xl bg-surface-chip p-4">
          <input className={input} placeholder={zh ? '原因（可选）' : 'Reason (optional)'} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <button className={big + ' border border-danger/40 bg-white text-danger'} disabled={busy} onClick={() => void act('decline', { reason: form.reason })}>{zh ? '确认婉拒' : 'Confirm decline'}</button>
        </div>
      )}
      {err && <p className="mt-3 text-[12.5px] text-danger">{err}</p>}
      <p className="mt-6 text-[11px] leading-relaxed text-body-3">{zh ? '这个链接就是你的凭证，请勿转发。Stayloop 只做撮合与记录：服务合同在你与房东之间，付款由房东线下完成。' : 'This link is your credential — do not forward it. Stayloop only brokers and records: the contract is between you and the landlord, who pays you directly.'}</p>
    </Shell>
  )
}

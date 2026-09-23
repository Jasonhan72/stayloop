'use client'

// Maintenance on a household, for all three parties (services marketplace
// §3): tickets with the real status machine (new → assigned → in_progress →
// review → done), the work order under each ticket, the landlord's 指派
// button and the tenant's "确认已解决". Everything reads through RLS; every
// transition is a server call.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import WorkOrderCard, { type WorkOrderLite } from '@/components/marketplace/WorkOrderCard'
import DispatchModal from '@/components/marketplace/DispatchModal'
import { CATEGORY_LABEL, MAINTENANCE_CATEGORIES } from '@/lib/agent/maintenanceTriage'

export type Ticket = { id: string; title: string; description: string | null; category: string | null; priority: string; status: string; created_at: string; resolved_at: string | null; opened_by: string | null; photos: string[] | null }
type Wo = WorkOrderLite & { ticket_id: string }

export const TICKET_STATUS: Record<string, { zh: string; en: string; cls: string }> = {
  new: { zh: '新工单', en: 'NEW', cls: 'bg-amber-50 text-amber-800' },
  assigned: { zh: '已派单', en: 'ASSIGNED', cls: 'bg-brand/10 text-brand' },
  in_progress: { zh: '处理中', en: 'IN PROGRESS', cls: 'bg-brand/10 text-brand' },
  review: { zh: '待验收', en: 'REVIEW', cls: 'bg-amber-50 text-amber-800' },
  done: { zh: '已完成', en: 'DONE', cls: 'bg-success/10 text-success' },
  cancelled: { zh: '已取消', en: 'CANCELLED', cls: 'bg-surface-chip text-body-3' },
}
const OPEN = new Set(['offered', 'quoted', 'scheduled', 'in_progress', 'completed', 'rework', 'disputed'])

export default function MaintenancePanel({ householdId, city, myRole, zh, providerNames }: {
  householdId: string
  city: string | null
  myRole: 'landlord' | 'tenant' | 'property_manager' | 'agent' | null
  zh: boolean
  providerNames?: Record<string, string>
}) {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [orders, setOrders] = useState<Wo[]>([])
  const [names, setNames] = useState<Record<string, string>>(providerNames ?? {})
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', category: 'other' })
  const [dispatchFor, setDispatchFor] = useState<Ticket | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Ticket photos live in the private tenancy-files bucket; members get
  // short-lived signed URLs (the bucket read policy is the gate).
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const isLandlord = myRole === 'landlord' || myRole === 'property_manager'

  const load = useCallback(async () => {
    const [{ data: t }, { data: w }] = await Promise.all([
      supabase.from('maintenance_tickets').select('id, title, description, category, priority, status, created_at, resolved_at, opened_by, photos').eq('household_id', householdId).order('created_at', { ascending: false }),
      supabase.from('work_orders').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
    ])
    const ticketRows = (t ?? []) as Ticket[]
    setTickets(ticketRows)
    const paths = ticketRows.flatMap((x) => x.photos ?? [])
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('tenancy-files').createSignedUrls(paths, 600)
      const m: Record<string, string> = {}
      for (const x of signed ?? []) if (x.path && x.signedUrl) m[x.path] = x.signedUrl
      setPhotoUrls(m)
    }
    const wos = (w ?? []) as Wo[]
    setOrders(wos)
    const pids = Array.from(new Set(wos.map((x) => x.provider_id).filter(Boolean))) as string[]
    if (pids.length) {
      const { data: p } = await supabase.from('provider_directory').select('id, legal_name, trade_name').in('id', pids)
      const m: Record<string, string> = {}
      for (const x of (p ?? []) as { id: string; legal_name: string; trade_name: string | null }[]) m[x.id] = x.trade_name || x.legal_name
      setNames((n) => ({ ...n, ...m }))
    }
  }, [householdId])
  useEffect(() => { void load() }, [load])

  async function createTicket() {
    if (!form.title.trim() || !user) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('maintenance_tickets').insert({ household_id: householdId, opened_by: user.id, title: form.title.trim().slice(0, 200), description: form.description.trim().slice(0, 2000) || null, priority: form.priority, category: form.category, status: 'new' })
    if (error) setErr(error.message)
    else { setForm({ title: '', description: '', priority: 'medium', category: 'other' }); setShowForm(false); await load() }
    setBusy(false)
  }
  async function setStatus(t: Ticket, status: string) {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('maintenance_tickets').update({ status, resolved_at: status === 'done' ? new Date().toISOString() : null }).eq('id', t.id)
    if (error) setErr(error.message)
    await load(); setBusy(false)
  }
  const input = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2.5 text-[14px]'
  return (
    <div className="space-y-4" data-testid="maintenance-panel">
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>+ {zh ? '提交报修' : 'New request'}</button>
      ) : (
        <div className="rounded-xl border border-line-divider bg-white p-5">
          <input className={input} placeholder={zh ? '标题(如:厨房水龙头漏水)' : 'Title (e.g. kitchen tap leaking)'} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <textarea className={`${input} mt-2 min-h-[80px]`} placeholder={zh ? '描述(可选)' : 'Details (optional)'} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select className="rounded-lg border border-line-divider bg-white px-2 py-2 text-[13px]" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {MAINTENANCE_CATEGORIES.map((c) => <option key={c} value={c}>{zh ? CATEGORY_LABEL[c].zh : CATEGORY_LABEL[c].en}</option>)}
            </select>
            <select className="rounded-lg border border-line-divider bg-white px-2 py-2 text-[13px]" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="low">{zh ? '低' : 'Low'}</option><option value="medium">{zh ? '中' : 'Medium'}</option><option value="high">{zh ? '高 · 紧急' : 'High / urgent'}</option>
            </select>
            <button onClick={() => void createTicket()} disabled={busy || !form.title.trim()} className="rounded-lg px-5 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: '#00ACE4' }}>{zh ? '提交' : 'Submit'}</button>
            <button onClick={() => setShowForm(false)} className="text-[12.5px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button>
          </div>
        </div>
      )}
      {err && <p className="text-[12.5px] text-danger">{err}</p>}
      {tickets.length === 0 && <p className="py-6 text-center text-[13px] text-body-3">{zh ? '暂无报修记录。' : 'No maintenance requests yet.'}</p>}
      {tickets.map((t) => {
        const st = TICKET_STATUS[t.status] ?? TICKET_STATUS.new
        const wos = orders.filter((w) => w.ticket_id === t.id)
        const open = wos.find((w) => OPEN.has(w.status))
        const cat = MAINTENANCE_CATEGORIES.includes(t.category as never) ? CATEGORY_LABEL[t.category as (typeof MAINTENANCE_CATEGORIES)[number]] : null
        return (
          <div key={t.id} className="rounded-xl border border-line-divider bg-white p-5" data-testid="ticket">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold">{t.title}</span>
              <span className={'rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ' + st.cls}>{zh ? st.zh : st.en}</span>
              {t.priority === 'high' && <span className="rounded-md bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-600">{zh ? '紧急' : 'URGENT'}</span>}
              {cat && <span className="text-[11px] text-body-3">{zh ? cat.zh : cat.en}</span>}
              <span className="ml-auto text-[11px] text-body-3">{new Date(t.created_at).toLocaleDateString('en-CA')}</span>
            </div>
            {t.description && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-body-2">{t.description}</p>}
            {(t.photos?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="ticket-photos">
                {(t.photos ?? []).map((p) => photoUrls[p] ? (
                  <a key={p} href={photoUrls[p]} target="_blank" rel="noopener noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-line-divider bg-surface-chip">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrls[p]} alt="" className="h-full w-full object-cover" />
                  </a>
                ) : <span key={p} className="flex h-16 w-16 items-center justify-center rounded-lg border border-line-divider bg-surface-chip text-[11px] text-body-3">📷</span>)}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {isLandlord && !open && !['done', 'cancelled'].includes(t.status) && (
                <button onClick={() => setDispatchFor(t)} className="rounded-full bg-brand px-3.5 py-1.5 text-[12px] font-bold text-white">{zh ? '指派 →' : 'Dispatch →'}</button>
              )}
              {isLandlord && !open && t.status === 'new' && <button disabled={busy} onClick={() => void setStatus(t, 'in_progress')} className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12px] font-bold">{zh ? '我自己处理' : 'Handle it myself'}</button>}
              {isLandlord && !open && t.status === 'in_progress' && <button disabled={busy} onClick={() => void setStatus(t, 'done')} className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12px] font-bold">{zh ? '标记完成' : 'Mark done'}</button>}
              {isLandlord && !open && !['done', 'cancelled'].includes(t.status) && <button disabled={busy} onClick={() => void setStatus(t, 'cancelled')} className="rounded-full px-3 py-1.5 text-[12px] text-body-3 underline">{zh ? '取消工单' : 'Cancel'}</button>}
            </div>
            {wos.length > 0 && (
              <div className="mt-3 space-y-2">
                {wos.map((w) => <WorkOrderCard key={w.id} wo={w} viewer={isLandlord ? 'landlord' : myRole === 'tenant' ? 'tenant' : 'system'} zh={zh} providerName={w.provider_id ? names[w.provider_id] : null} onChange={load} compact />)}
              </div>
            )}
          </div>
        )
      })}
      {dispatchFor && <DispatchModal ticketId={dispatchFor.id} category={dispatchFor.category} priority={dispatchFor.priority} city={city} zh={zh} onClose={() => setDispatchFor(null)} onDone={load} />}
    </div>
  )
}

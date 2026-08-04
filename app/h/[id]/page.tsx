'use client'

export const runtime = 'edge'

// /h/[id] — the household hub: one shared surface where landlord, tenant and
// agent see the same facts. Four tabs: overview (lease + members + invites),
// messages, rent, maintenance. Everything reads through RLS — membership is
// the only key that opens this page.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { rentSchedule } from '@/lib/household/schedule'

interface Household {
  id: string; address: string; unit: string | null; city: string | null
  monthly_rent: number | null; rent_due_day: number | null
  start_date: string | null; end_date: string | null
  current_lease_id: string | null; status: string; verified: boolean; created_by: string
}
interface Member { user_id: string; role: string; status: string; joined_at: string }
interface Invite { id: string; invited_email: string; invited_role: string; accepted_at: string | null; declined_at: string | null; revoked_at: string | null; expires_at: string }
interface Msg { id: number; sender_id: string; body: string; created_at: string }
interface Payment { id: string; due_date: string; paid_at: string | null; amount: number | null; status: string }
interface Ticket { id: string; title: string; description: string | null; category: string | null; priority: string; status: string; created_at: string }

const ROLE_ZH: Record<string, string> = { landlord: '房东', tenant: '租客', agent: '经纪', property_manager: '物业' }
type Tab = 'overview' | 'messages' | 'rent' | 'maintenance'

export default function HouseholdHub() {
  const params = useParams()
  const id = String(params?.id || '')
  const { user, loading } = useAuth()
  const { lang } = useT()
  const zh = lang === 'zh'

  const [tab, setTab] = useState<Tab>('overview')
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [notFound, setNotFound] = useState(false)
  const [draft, setDraft] = useState('')
  const [ticketForm, setTicketForm] = useState({ title: '', description: '', priority: 'medium' })
  const [showTicketForm, setShowTicketForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const msgEndRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data: h } = await supabase.from('households').select('*').eq('id', id).maybeSingle()
    if (!h) { setNotFound(true); return }
    setHousehold(h as Household)
    const [{ data: m }, { data: inv }, { data: t }] = await Promise.all([
      supabase.from('household_members').select('*').eq('household_id', id).eq('status', 'active'),
      supabase.from('household_invites').select('*').eq('household_id', id).order('created_at', { ascending: false }),
      supabase.from('maintenance_tickets').select('*').eq('household_id', id).order('created_at', { ascending: false }),
    ])
    setMembers((m as Member[]) ?? [])
    setInvites((inv as Invite[]) ?? [])
    setTickets((t as Ticket[]) ?? [])
    if ((h as Household).current_lease_id) {
      const { data: p } = await supabase.from('rent_payments')
        .select('*').eq('lease_id', (h as Household).current_lease_id).order('due_date', { ascending: false })
      setPayments((p as Payment[]) ?? [])
    }
  }, [id])

  const loadMsgs = useCallback(async () => {
    const { data } = await supabase.from('household_messages')
      .select('*').eq('household_id', id).order('id', { ascending: true }).limit(200)
    setMsgs((data as Msg[]) ?? [])
  }, [id])

  useEffect(() => {
    if (!user || !id) return
    void load()
    void loadMsgs()
    const iv = setInterval(() => { void loadMsgs() }, 8000)
    return () => clearInterval(iv)
  }, [user, id, load, loadMsgs])

  useEffect(() => {
    if (tab === 'messages') msgEndRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, tab])

  async function send() {
    const body = draft.trim()
    if (!body || !user) return
    setDraft('')
    await supabase.from('household_messages').insert({ household_id: id, sender_id: user.id, body })
    void loadMsgs()
  }

  async function markPaid(due: string) {
    if (!household?.current_lease_id || !user) return
    setBusy(true)
    const paidAt = new Date().toISOString()
    await supabase.from('rent_payments').insert({
      lease_id: household.current_lease_id,
      tenant_id: user.id,
      due_date: due,
      amount: household.monthly_rent,
      paid_at: paidAt,
      status: paidAt.slice(0, 10) <= due ? 'paid' : 'late',
    })
    await load()
    setBusy(false)
  }

  async function createTicket() {
    if (!ticketForm.title.trim() || !user) return
    setBusy(true)
    await supabase.from('maintenance_tickets').insert({
      household_id: id,
      opened_by: user.id,
      title: ticketForm.title.trim().slice(0, 200),
      description: ticketForm.description.trim().slice(0, 2000) || null,
      priority: ticketForm.priority,
      status: 'new',
    })
    setTicketForm({ title: '', description: '', priority: 'medium' })
    setShowTicketForm(false)
    await load()
    setBusy(false)
  }

  async function advanceTicket(t: Ticket) {
    const next = t.status === 'new' ? 'in_progress' : t.status === 'in_progress' ? 'resolved' : null
    if (!next) return
    await supabase.from('maintenance_tickets')
      .update({ status: next, resolved_at: next === 'resolved' ? new Date().toISOString() : null })
      .eq('id', t.id)
    await load()
  }

  async function openLeaseFile() {
    const { data: list } = await supabase.storage.from('tenancy-files').list(id)
    const first = list?.[0]
    if (!first) return
    const { data } = await supabase.storage.from('tenancy-files').createSignedUrl(`${id}/${first.name}`, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (!loading && !user) {
    return (
      <Shell zh={zh}><div className="py-20 text-center">
        <p className="text-[14px] text-body-2">{zh ? '请先登录。' : 'Please sign in.'}</p>
        <Link href={`/login?next=/h/${id}`} className="mt-4 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#7C3AED' }}>
          {zh ? '去登录' : 'Sign in'}
        </Link>
      </div></Shell>
    )
  }
  if (notFound) {
    return (
      <Shell zh={zh}><div className="py-20 text-center">
        <h1 className="text-[20px] font-extrabold">{zh ? '无权访问或不存在' : 'Not found or no access'}</h1>
        <p className="mt-2 text-[13px] text-body-3">{zh ? '只有该租约的成员可以查看。' : 'Only members of this household can view it.'}</p>
      </div></Shell>
    )
  }
  if (!household) {
    return <Shell zh={zh}><div className="py-24 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#7C3AED] border-t-transparent" /></div></Shell>
  }

  const address = [household.address, household.unit ? `#${household.unit}` : null, household.city].filter(Boolean).join(', ')
  const schedule = rentSchedule(household.start_date, household.rent_due_day)
  const paidByDue = new Map(payments.map((p) => [p.due_date, p]))
  const TABS: Array<{ id: Tab; zh: string; en: string }> = [
    { id: 'overview', zh: '概览', en: 'Overview' },
    { id: 'messages', zh: '对话', en: 'Messages' },
    { id: 'rent', zh: '租金', en: 'Rent' },
    { id: 'maintenance', zh: '报修', en: 'Maintenance' },
  ]
  const input = 'w-full rounded-lg border border-line-divider bg-white px-3 py-2.5 text-[14px]'

  return (
    <Shell zh={zh}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-extrabold tracking-tight">{address}</h1>
        {household.status === 'disputed' && (
          <span className="rounded-md bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-600">{zh ? '有争议' : 'DISPUTED'}</span>
        )}
        <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
          style={household.verified ? { color: '#047857', background: '#04785714' } : { color: '#A16207', background: '#A1620714' }}>
          {household.verified ? (zh ? '双方已确认' : 'CONFIRMED') : (zh ? '单方上传 · 未经对方确认' : 'SELF-REPORTED')}
        </span>
      </div>
      <div className="mt-1 text-[12.5px] text-body-3">
        {household.monthly_rent ? `$${household.monthly_rent.toLocaleString()}/${zh ? '月' : 'mo'}` : ''}
        {household.rent_due_day ? ` · ${zh ? `每月 ${household.rent_due_day} 号` : `due day ${household.rent_due_day}`}` : ''}
        {household.start_date ? ` · ${household.start_date} → ${household.end_date || (zh ? '月租续' : 'month-to-month')}` : ''}
      </div>

      <div className="mt-6 flex gap-1 border-b border-line-divider">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[13px] font-semibold ${tab === t.id ? 'border-b-2 border-[#7C3AED] text-[#7C3AED]' : 'text-body-3'}`}>
            {zh ? t.zh : t.en}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="mt-6 space-y-5">
          <section className="rounded-xl border border-line-divider bg-white p-5">
            <h2 className="text-[14px] font-extrabold">{zh ? '租约文件' : 'Lease document'}</h2>
            <button onClick={() => void openLeaseFile()} className="mt-3 rounded-lg border border-line-divider px-4 py-2 text-[13px] font-semibold hover:border-[#7C3AED]">
              {zh ? '查看租约原件 ↗' : 'Open the lease ↗'}
            </button>
            <p className="mt-2 text-[11.5px] text-body-3">
              {zh ? '内容由上传方提供;所有成员看到的是同一份文件。' : 'Uploaded by the importing party; every member sees the same file.'}
            </p>
          </section>

          <section className="rounded-xl border border-line-divider bg-white p-5">
            <h2 className="text-[14px] font-extrabold">{zh ? `成员 · ${members.length}` : `Members · ${members.length}`}</h2>
            <div className="mt-3 space-y-2">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 text-[13px]">
                  <span className="rounded-md bg-surface-chip px-2 py-0.5 font-mono text-[10px] font-bold">{zh ? ROLE_ZH[m.role] ?? m.role : m.role}</span>
                  <span className="text-body-2">{m.user_id === user?.id ? (zh ? '我' : 'me') : m.user_id.slice(0, 8)}</span>
                  <span className="text-[11px] text-body-3">{new Date(m.joined_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
            {invites.filter((i) => !i.accepted_at && !i.declined_at && !i.revoked_at).length > 0 && (
              <div className="mt-4 border-t border-line-divider pt-3">
                <div className="font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '待接受的邀请' : 'Pending invites'}</div>
                {invites.filter((i) => !i.accepted_at && !i.declined_at && !i.revoked_at).map((i) => (
                  <div key={i.id} className="mt-1.5 text-[12.5px] text-body-2">
                    {i.invited_email} · {zh ? ROLE_ZH[i.invited_role] ?? i.invited_role : i.invited_role}
                  </div>
                ))}
              </div>
            )}
            <Link href="/leases/import" className="mt-4 inline-block text-[12.5px] text-body-3 underline">
              {zh ? '导入另一套租约' : 'Import another lease'}
            </Link>
          </section>
        </div>
      )}

      {tab === 'messages' && (
        <div className="mt-6 rounded-xl border border-line-divider bg-white">
          <div className="max-h-[420px] min-h-[240px] overflow-y-auto p-5">
            {msgs.length === 0 && <p className="py-10 text-center text-[13px] text-body-3">{zh ? '还没有消息——说点什么吧。' : 'No messages yet — say something.'}</p>}
            {msgs.map((m) => {
              const mine = m.sender_id === user?.id
              const role = members.find((x) => x.user_id === m.sender_id)?.role
              return (
                <div key={m.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed ${mine ? 'text-white' : 'bg-[#F4F1E8] text-body'}`}
                    style={mine ? { background: '#7C3AED' } : undefined}>
                    {!mine && <div className="mb-0.5 font-mono text-[10px] font-bold opacity-70">{zh ? ROLE_ZH[role ?? ''] ?? '成员' : role ?? 'member'}</div>}
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-body-3'}`}>{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                </div>
              )
            })}
            <div ref={msgEndRef} />
          </div>
          <div className="flex gap-2 border-t border-line-divider p-3">
            <input className={input} value={draft} placeholder={zh ? '输入消息…' : 'Type a message…'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
            <button onClick={() => void send()} className="rounded-lg px-5 text-[13px] font-bold text-white" style={{ background: '#7C3AED' }}>
              {zh ? '发送' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {tab === 'rent' && (
        <div className="mt-6 rounded-xl border border-line-divider bg-white p-5">
          <h2 className="text-[14px] font-extrabold">{zh ? '租金记录' : 'Rent record'}</h2>
          <p className="mt-1 text-[11.5px] text-body-3">
            {zh ? '只做记录与提醒,不经手资金。标记后各方可见。' : 'Records and reminders only — no money moves through Stayloop.'}
          </p>
          {schedule.length === 0 ? (
            <p className="mt-5 text-[13px] text-body-3">{zh ? '缺少起租日或交租日,无法生成账期。' : 'Needs a start date and due day to build the schedule.'}</p>
          ) : (
            <div className="mt-4 space-y-2">
              {schedule.map((p) => {
                const rec = paidByDue.get(p.due)
                return (
                  <div key={p.due} className="flex flex-wrap items-center gap-3 rounded-lg border border-line-divider/60 px-4 py-2.5 text-[13px]">
                    <span className="font-mono font-semibold">{p.due}</span>
                    {household.monthly_rent && <span className="text-body-3">${household.monthly_rent.toLocaleString()}</span>}
                    <span className="ml-auto">
                      {rec ? (
                        <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                          style={rec.status === 'paid' ? { color: '#047857', background: '#04785714' } : { color: '#DC2626', background: '#DC262614' }}>
                          {rec.status === 'paid' ? (zh ? '✓ 已付' : '✓ PAID') : (zh ? '迟付' : 'LATE')}
                        </span>
                      ) : p.upcoming ? (
                        <span className="font-mono text-[10px] font-bold text-body-3">{zh ? '未到期' : 'UPCOMING'}</span>
                      ) : (
                        <button onClick={() => void markPaid(p.due)} disabled={busy}
                          className="rounded-md border border-line-divider px-3 py-1 text-[11px] font-bold hover:border-[#7C3AED] disabled:opacity-50">
                          {zh ? '标记已付' : 'Mark paid'}
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="mt-6 space-y-4">
          {!showTicketForm ? (
            <button onClick={() => setShowTicketForm(true)} className="rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#7C3AED' }}>
              + {zh ? '提交报修' : 'New request'}
            </button>
          ) : (
            <div className="rounded-xl border border-line-divider bg-white p-5">
              <input className={input} placeholder={zh ? '标题(如:厨房水龙头漏水)' : 'Title (e.g. kitchen tap leaking)'}
                value={ticketForm.title} onChange={(e) => setTicketForm((f) => ({ ...f, title: e.target.value }))} />
              <textarea className={`${input} mt-2 min-h-[80px]`} placeholder={zh ? '描述(可选)' : 'Details (optional)'}
                value={ticketForm.description} onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))} />
              <div className="mt-3 flex items-center gap-3">
                <select className="rounded-lg border border-line-divider bg-white px-2 py-2 text-[13px]"
                  value={ticketForm.priority} onChange={(e) => setTicketForm((f) => ({ ...f, priority: e.target.value }))}>
                  <option value="low">{zh ? '低' : 'Low'}</option>
                  <option value="medium">{zh ? '中' : 'Medium'}</option>
                  <option value="high">{zh ? '高 · 紧急' : 'High / urgent'}</option>
                </select>
                <button onClick={() => void createTicket()} disabled={busy || !ticketForm.title.trim()}
                  className="rounded-lg px-5 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: '#7C3AED' }}>
                  {zh ? '提交' : 'Submit'}
                </button>
                <button onClick={() => setShowTicketForm(false)} className="text-[12.5px] text-body-3 underline">{zh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          )}
          {tickets.length === 0 && <p className="py-6 text-center text-[13px] text-body-3">{zh ? '暂无报修记录。' : 'No maintenance requests yet.'}</p>}
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl border border-line-divider bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-bold">{t.title}</span>
                <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                  style={t.status === 'resolved' ? { color: '#047857', background: '#04785714' }
                    : t.status === 'in_progress' ? { color: '#1D4ED8', background: '#1D4ED814' }
                    : { color: '#A16207', background: '#A1620714' }}>
                  {t.status === 'resolved' ? (zh ? '已解决' : 'RESOLVED') : t.status === 'in_progress' ? (zh ? '处理中' : 'IN PROGRESS') : (zh ? '新工单' : 'NEW')}
                </span>
                {t.priority === 'high' && <span className="rounded-md bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-red-600">{zh ? '紧急' : 'URGENT'}</span>}
                <span className="ml-auto text-[11px] text-body-3">{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
              {t.description && <p className="mt-2 text-[13px] leading-relaxed text-body-2">{t.description}</p>}
              {t.status !== 'resolved' && (
                <button onClick={() => void advanceTicket(t)} className="mt-3 rounded-md border border-line-divider px-3 py-1 text-[11px] font-bold hover:border-[#7C3AED]">
                  {t.status === 'new' ? (zh ? '开始处理' : 'Start') : (zh ? '标记已解决' : 'Mark resolved')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

function Shell({ zh, children }: { zh: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FAF7EE', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <div className="mx-auto w-full max-w-[860px] flex-1 px-5 py-10">{children}</div>
      <Footer />
    </div>
  )
}

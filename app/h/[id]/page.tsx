'use client'

export const runtime = 'edge'

// /h/[id] — the household hub: one shared surface where landlord, tenant and
// agent see the same facts. Four tabs: overview (lease + members + invites),
// messages, rent, maintenance. Everything reads through RLS — membership is
// the only key that opens this page.

import { setReadMark } from '@/lib/household/readMarks'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { rentSchedule } from '@/lib/household/schedule'
import { persistentLatePayment } from '@/lib/ontario/rules'
import { tenancyClock } from '@/lib/household/clock'
import MoveInChecklist from '@/components/household/MoveInChecklist'
import MaintenancePanel from '@/components/household/MaintenancePanel'
import PaymentPlanDraft from '@/components/household/PaymentPlanDraft'

// Tenant's answer to the 30-day touchpoint (renewal_intents, P1 2026-09-23).
type Intent = { id: string; intent: string; note: string | null; tenant_user_id: string; created_at: string }
const INTENT_LABEL: Record<string, { zh: string; en: string }> = {
  renew: { zh: '续约', en: 'Renew' },
  leave: { zh: '计划搬离', en: 'Plan to move out' },
  negotiate: { zh: '想谈谈条件', en: 'Discuss terms' },
}



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
  const [intents, setIntents] = useState<Intent[]>([])
  const [intentPick, setIntentPick] = useState<string | null>(null)
  const [intentNote, setIntentNote] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data: h } = await supabase.from('households').select('*').eq('id', id).maybeSingle()
    if (!h) { setNotFound(true); return }
    setHousehold(h as Household)
    const [{ data: m }, { data: inv }, { data: ri }] = await Promise.all([
      supabase.from('household_members').select('*').eq('household_id', id).eq('status', 'active'),
      supabase.from('household_invites').select('id, household_id, invited_email, invited_role, invited_by, expires_at, accepted_by, accepted_at, declined_at, revoked_at, created_at').eq('household_id', id).order('created_at', { ascending: false }),
      supabase.from('renewal_intents').select('id, intent, note, tenant_user_id, created_at').eq('household_id', id).order('created_at', { ascending: false }).limit(10),
    ])
    setMembers((m as Member[]) ?? [])
    setInvites((inv as Invite[]) ?? [])
    setIntents((ri as Intent[]) ?? [])
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
  }, [user?.id, id, load, loadMsgs]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'messages') msgEndRef.current?.scrollIntoView({ block: 'end' })
    // Opening the conversation marks it read for the inbox (/tenant|landlord/messages).
    if (tab === 'messages' && msgs.length) setReadMark(id, Math.max(...msgs.map((m) => Number((m as { id: number | string }).id) || 0)))
  }, [msgs.length, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ?intent=renew|leave|negotiate from the 30-day email: preselect, the
  // tenant confirms with one click (read in an effect — never on first paint).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const v = q.get('intent')
      if (v && INTENT_LABEL[v]) setIntentPick(v)
      const t = q.get('tab')
      if (t === 'maintenance' || t === 'rent' || t === 'messages') setTab(t)
    } catch { /* no window */ }
  }, [])

  async function submitIntent(intent: string) {
    if (!user || !household) return
    setBusy(true)
    const { error } = await supabase.from('renewal_intents').insert({ household_id: id, lease_id: household.current_lease_id, tenant_user_id: user.id, intent, note: intentNote.trim().slice(0, 1000) || null })
    setWriteError(error ? error.message : null)
    if (!error) { setIntentPick(null); setIntentNote(''); try { const q = new URLSearchParams(window.location.search); q.delete('intent'); window.history.replaceState(null, '', window.location.pathname + (q.toString() ? `?${q}` : '')) } catch { /* noop */ } }
    await load()
    setBusy(false)
  }

  async function send() {
    const body = draft.trim()
    if (!body || !user) return
    // Review 2026-09-14: the draft was cleared BEFORE the insert and the
    // error discarded — a denied write (household not active) vanished.
    const { error } = await supabase.from('household_messages').insert({ household_id: id, sender_id: user.id, body })
    if (error) { setWriteError(error.message); return }
    setWriteError(null)
    setDraft('')
    void loadMsgs()
  }

  async function markPaid(due: string) {
    if (!household?.current_lease_id || !user) return
    setBusy(true)
    const paidAt = new Date().toISOString()
    const { error } = await supabase.from('rent_payments').insert({
      lease_id: household.current_lease_id,
      tenant_id: user.id,
      due_date: due,
      amount: household.monthly_rent,
      paid_at: paidAt,
      status: paidAt.slice(0, 10) <= due ? 'paid' : 'late',
    })
    setWriteError(error ? error.message : null)
    await load()
    setBusy(false)
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
        <Link href={`/login?next=/h/${id}`} className="mt-4 inline-block rounded-lg px-5 py-2.5 text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>
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
    return <Shell zh={zh}><div className="py-24 text-center"><div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#00ACE4] border-t-transparent" /></div></Shell>
  }

  const address = [household.address, household.unit ? `#${household.unit}` : null, household.city].filter(Boolean).join(', ')
  const schedule = rentSchedule(household.start_date, household.rent_due_day)
  const paidByDue = new Map(payments.map((p) => [p.due_date, p]))
  // RTA s.58(1.1) (in force 2026-09-21): >7 days late, 3 times in 6 months.
  const lateness = persistentLatePayment(payments)
  const clock = tenancyClock(household.start_date, household.end_date)
  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? null
  // Ledger vs lease: rows recorded so far against the schedule to date.
  const dueSoFar = schedule.filter((d) => !d.upcoming).length
  const recorded = payments.filter((p) => p.status === 'paid' || p.status === 'late').length
  const latestIntent = intents[0] ?? null
  // Past-due periods with nothing recorded → the landlord may draft a repayment plan.
  const missedDue = schedule.filter((d) => !d.upcoming && !paidByDue.get(d.due)).map((d) => d.due)
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
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="tenancy-clock">
        <span className="rounded-full bg-brand/10 px-2.5 py-[3px] font-mono text-[11px] font-bold text-brand">{zh ? '租中' : 'IN TENANCY'}{clock.month ? (zh ? ` · 第 ${clock.month} 个月` : ` · month ${clock.month}`) : ''}</span>
        {clock.daysToEnd != null && (
          <span className={'rounded-full px-2.5 py-[3px] font-mono text-[11px] font-bold ' + (clock.daysToEnd < 0 ? 'bg-surface-chip text-body-2' : clock.daysToEnd <= 120 ? 'bg-amber-50 text-amber-800' : 'bg-surface-chip text-body-2')}>
            {clock.daysToEnd < 0 ? (zh ? `已到期 ${-clock.daysToEnd} 天 · 已转月租（RTA s.38）` : `Ended ${-clock.daysToEnd} days ago · month-to-month (RTA s.38)`) : zh ? `到期 ${clock.daysToEnd} 天（${household.end_date}）` : `${clock.daysToEnd} days to ${household.end_date}`}
          </span>
        )}
        {dueSoFar > 0 && (
          <span className="rounded-full bg-surface-chip px-2.5 py-[3px] font-mono text-[11px] text-body-2">{zh ? `租金记录 ${recorded}/${dueSoFar} 期` : `Ledger ${recorded}/${dueSoFar} periods`}</span>
        )}
        {latestIntent && (
          <span className="rounded-full bg-success/10 px-2.5 py-[3px] font-mono text-[11px] font-bold text-success">{zh ? `租客意向：${INTENT_LABEL[latestIntent.intent]?.zh ?? latestIntent.intent}` : `Tenant intent: ${INTENT_LABEL[latestIntent.intent]?.en ?? latestIntent.intent}`}</span>
        )}
      </div>
      <div className="mt-1 text-[12.5px] text-body-3">
        {household.monthly_rent ? `$${household.monthly_rent.toLocaleString()}/${zh ? '月' : 'mo'}` : ''}
        {household.rent_due_day ? ` · ${zh ? `每月 ${household.rent_due_day} 号` : `due day ${household.rent_due_day}`}` : ''}
        {household.start_date ? ` · ${household.start_date} → ${household.end_date || (zh ? '月租续' : 'month-to-month')}` : ''}
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-line-divider">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[13px] font-semibold ${tab === t.id ? 'border-b-2 border-[#00ACE4] text-[#00ACE4]' : 'text-body-3'}`}>
            {zh ? t.zh : t.en}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="mt-6 space-y-5">
          {(myRole === 'tenant' || intents.length > 0 || intentPick) && (
            <section className="rounded-xl border border-line-divider bg-white p-5" data-testid="renewal-intent">
              <h2 className="text-[14px] font-extrabold">{zh ? '续约意向' : 'Renewal intent'}</h2>
              <p className="mt-1 text-[12px] text-body-3">{zh ? '只是意向，不是通知：搬离仍需按 RTA 提前 60 天送达 N9；不续签会自动转为月租（s.38），你的权利不变。' : 'An intention, not a notice: moving out still needs a Form N9 served 60 days ahead; an unrenewed lease continues month-to-month (s.38) with your rights unchanged.'}</p>
              {intents.length > 0 && (
                <div className="mt-3 space-y-1 text-[13px]">
                  {intents.slice(0, 3).map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-success/10 px-2 py-0.5 font-mono text-[10.5px] font-bold text-success">{zh ? INTENT_LABEL[i.intent]?.zh ?? i.intent : INTENT_LABEL[i.intent]?.en ?? i.intent}</span>
                      <span className="text-[11.5px] text-body-3">{i.created_at.slice(0, 10)}{i.tenant_user_id === user?.id ? (zh ? ' · 我' : ' · me') : ''}</span>
                      {i.note && <span className="text-body-2">{i.note}</span>}
                    </div>
                  ))}
                </div>
              )}
              {myRole === 'tenant' && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    {(['renew', 'leave', 'negotiate'] as const).map((k) => (
                      <button key={k} type="button" onClick={() => setIntentPick(k)} aria-pressed={intentPick === k}
                        className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${intentPick === k ? 'bg-[#00ACE4] text-white' : 'border border-line-divider text-body-2 hover:border-[#00ACE4]'}`}>
                        {zh ? INTENT_LABEL[k].zh : INTENT_LABEL[k].en}
                      </button>
                    ))}
                  </div>
                  {intentPick && (
                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                      <input value={intentNote} onChange={(e) => setIntentNote(e.target.value)} placeholder={zh ? '补一句（可选）：比如希望的租金或搬离日期' : 'Optional: e.g. the rent you have in mind or a move-out date'} className={input} />
                      <button type="button" disabled={busy} onClick={() => void submitIntent(intentPick)} className="rounded-lg px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: '#00ACE4' }}>
                        {zh ? `确认：${INTENT_LABEL[intentPick].zh}` : `Confirm: ${INTENT_LABEL[intentPick].en}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
          <MoveInChecklist householdId={id} zh={zh} compact />
          <section className="rounded-xl border border-line-divider bg-white p-5">
            <h2 className="text-[14px] font-extrabold">{zh ? '租约文件' : 'Lease document'}</h2>
            <button onClick={() => void openLeaseFile()} className="mt-3 rounded-lg border border-line-divider px-4 py-2 text-[13px] font-semibold hover:border-[#00ACE4]">
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
                  <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed ${mine ? 'text-white' : 'bg-surface-chip text-body'}`}
                    style={mine ? { background: '#00ACE4' } : undefined}>
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
            <button onClick={() => void send()} className="rounded-lg px-5 text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>
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
          {lateness.late.length > 0 && (
            <div className={'mt-3 rounded-lg px-3 py-2 text-[12px] ' + (lateness.persistent ? 'bg-danger/10 text-danger' : 'bg-amber-50 text-amber-800')}>
              {lateness.persistent
                ? (zh
                  ? `已构成 RTA s.58 定义的「持续迟付」：${lateness.window![0]} 至 ${lateness.window![1]} 期间 3 次在到期日 7 天后才付（2026-09-21 起的法定定义，N8 终止理由）。这里只做记录，Stayloop 不会代发任何通知。`
                  : `Meets the RTA s.58 definition of persistent late payment: three payments more than 7 days late between ${lateness.window![0]} and ${lateness.window![1]} (statutory definition since 2026-09-21; an N8 ground). Record only — Stayloop sends no notice.`)
                : (zh
                  ? `迟付（到期日 7 天后）${lateness.late.length} 次：${lateness.late.join('、')}。6 个月内满 3 次即为 RTA s.58 的「持续迟付」。`
                  : `${lateness.late.length} payment(s) more than 7 days late: ${lateness.late.join(', ')}. Three within 6 months meets the RTA s.58 definition of persistent late payment.`)}
            </div>
          )}
          {myRole === 'landlord' && missedDue.length > 0 && (
            <PaymentPlanDraft householdId={id} leaseId={household.current_lease_id} unit={address} monthlyRent={Number(household.monthly_rent) || 0} missed={missedDue} recorded={recorded} zh={zh} />
          )}
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
                          className="rounded-md border border-line-divider px-3 py-1 text-[11px] font-bold hover:border-[#00ACE4] disabled:opacity-50">
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
        <div className="mt-6">
          <MaintenancePanel householdId={id} city={household.city} myRole={(myRole as 'landlord' | 'tenant' | 'property_manager' | 'agent' | null)} zh={zh} />
        </div>
      )}
    </Shell>
  )
}

function Shell({ zh, children }: { zh: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh' }} className="flex flex-col">
      <Header variant="transparent" />
      <div className="mx-auto w-full max-w-[860px] flex-1 px-5 py-10">{children}</div>
      <Footer />
    </div>
  )
}

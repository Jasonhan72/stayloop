'use client'

export const runtime = 'edge'

// /h/[id] — the household hub: one shared surface where landlord, tenant and
// agent see the same facts. Four tabs: overview (lease + members + invites),
// messages, rent, maintenance. Everything reads through RLS — membership is
// the only key that opens this page.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { rentSchedule } from '@/lib/household/schedule'
import { checkPaidOn, earliestPaidOn, latenessRows, ledgerStart, missedArrears, rentDueDay, rentLedger, torontoDate } from '@/lib/household/ledger'
import { persistentLatePayment } from '@/lib/ontario/rules'
import { leaseProvince, unitTermsOf, type LeasePlace } from '@/lib/provinces/lease'
import { leaseEndFact } from '@/lib/provinces/renewal'
import { tenancyClock } from '@/lib/household/clock'
import { leaseDisplayState, leaseStateDetail } from '@/lib/matters/states'
import MoveInChecklist from '@/components/household/MoveInChecklist'
import MaintenancePanel from '@/components/household/MaintenancePanel'
import PaymentPlanDraft from '@/components/household/PaymentPlanDraft'
import ThreadPanel from '@/components/threads/ThreadPanel'
import MessageButton from '@/components/messages/MessageButton'
import { personName, roleLabel, type Person } from '@/lib/threads/shared'
import { notifyPendingChanged } from '@/lib/agent/pendingCount'
import { notifyFactsChanged } from '@/lib/facts/useFacts'

// Tenant's answer to the 30-day touchpoint (renewal_intents, P1 2026-09-23).
type Intent = { id: string; intent: string; note: string | null; tenant_user_id: string; created_at: string; lease_id?: string | null }
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
  /** 'imported' (self-reported upload) or 'esign'. */
  source?: string | null
  /** A signed renewal waiting for its start date (promoted daily · B1 2026-10-01). */
  next_lease_id?: string | null
  /** The lease a renewal replaced: its unrecorded periods stay listed and recordable (review 2026-10-01). */
  previous_lease_id?: string | null
}
interface Member { user_id: string; role: string; status: string; joined_at: string }
// No invited_email: the hub never shows another person's address (relay principle, 2026-09-30).
interface Invite { id: string; invited_role: string; accepted_at: string | null; declined_at: string | null; revoked_at: string | null; expires_at: string }
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
  const [leasePlace, setLeasePlace] = useState<Pick<LeasePlace, 'listing' | 'unit'>>({ listing: null, unit: null })
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  // Who is in this tenancy, by name (people_for · 找得到人 2026-09-30) — one call per page, never an address.
  const [people, setPeople] = useState<Person[] | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  // The current lease's own start: after a renewal it is later than the household's.
  const [leaseStart, setLeaseStart] = useState<string | null>(null)
  // The signed renewal's start date, when the household has one waiting (null if unreadable).
  const [nextStart, setNextStart] = useState<string | null>(null)
  // The lease a renewal replaced, and its rent rows: periods nobody recorded before the switch.
  const [prevLease, setPrevLease] = useState<{ id: string; start_date: string | null; end_date: string | null; monthly_rent: number | null; due_day: number | null } | null>(null)
  const [prevPayments, setPrevPayments] = useState<Payment[]>([])
  // Per period: the day the rent was paid, as the member enters it (default today, Toronto).
  const [paidOn, setPaidOn] = useState<Record<string, string>>({})
  const [intents, setIntents] = useState<Intent[]>([])
  const [intentPick, setIntentPick] = useState<string | null>(null)
  const [intentNote, setIntentNote] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: h } = await supabase.from('households').select('*').eq('id', id).maybeSingle()
    if (!h) { setNotFound(true); return }
    const leaseId = (h as Household).current_lease_id
    const [{ data: m }, { data: inv }, { data: ri }, { data: ppl, error: pplErr }, { data: ld }] = await Promise.all([
      supabase.from('household_members').select('*').eq('household_id', id).eq('status', 'active'),
      supabase.from('household_invites').select('id, household_id, invited_role, invited_by, expires_at, accepted_by, accepted_at, declined_at, revoked_at, created_at').eq('household_id', id).order('created_at', { ascending: false }),
      supabase.from('renewal_intents').select('id, intent, note, tenant_user_id, created_at, lease_id').eq('household_id', id).order('created_at', { ascending: false }).limit(10),
      supabase.rpc('people_for', { p_kind: 'tenancy', p_ref: id, p_listing: null, p_subject: null }),
      // The lease's term start and where it is (listing + §2 block): the province is settled
      // before the page renders, so a Quebec tenancy never shows Ontario wording first.
      leaseId ? supabase.from('lease_documents').select('start_date, listing_id, unit_place:terms->unit').eq('id', leaseId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const leaseRow = ld as { start_date: string | null; listing_id: string | null; unit_place?: unknown } | null
    const { data: lst } = leaseRow?.listing_id ? await supabase.from('listings').select('province, address, city, postal_code').eq('id', leaseRow.listing_id).maybeSingle() : { data: null }
    setLeasePlace({ listing: (lst as LeasePlace['listing']) ?? null, unit: unitTermsOf({ unit: leaseRow?.unit_place }) })
    setHousehold(h as Household)
    setMembers((m as Member[]) ?? [])
    setInvites((inv as Invite[]) ?? [])
    setPeople(pplErr ? null : ((ppl as Person[] | null) ?? []))
    setIntents((ri as Intent[]) ?? [])
    if (leaseId) {
      const { data: p } = await supabase.from('rent_payments').select('*').eq('lease_id', leaseId).order('due_date', { ascending: false })
      setPayments((p as Payment[]) ?? [])
      setLeaseStart(leaseRow?.start_date ?? null)
    }
    const prevId = (h as Household).previous_lease_id
    if (prevId) {
      const [{ data: pp }, { data: pl }] = await Promise.all([
        supabase.from('rent_payments').select('*').eq('lease_id', prevId).order('due_date', { ascending: false }),
        supabase.from('lease_documents').select('id, start_date, end_date, monthly_rent, terms').eq('id', prevId).maybeSingle(),
      ])
      const row = pl as { id: string; start_date: string | null; end_date: string | null; monthly_rent: number | null; terms: { rent?: { due_day?: unknown } } | null } | null
      setPrevPayments((pp as Payment[]) ?? [])
      setPrevLease(row ? { id: row.id, start_date: row.start_date, end_date: row.end_date, monthly_rent: row.monthly_rent, due_day: rentDueDay(row.terms?.rent?.due_day) } : null)
    } else { setPrevLease(null); setPrevPayments([]) }
    const nextId = (h as Household).next_lease_id
    if (nextId) {
      const { data: nx } = await supabase.from('lease_documents').select('start_date').eq('id', nextId).maybeSingle()
      setNextStart(((nx as { start_date: string | null } | null)?.start_date) ?? null)
    } else setNextStart(null)
  }, [id])

  useEffect(() => {
    if (!user || !id) return
    void load()
  }, [user?.id, id, load]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // One row per (lease, due date): the RPC records an unrecorded period or fills the
  // 'due' placeholder in place with the day it was paid (paid vs late follows that day,
  // not the day it is entered), and expires pending repayment-plan cards that listed
  // this period (sweep 2026-10-01).
  async function markPaid(due: string, paidOnDate: string, leaseId: string | null = household?.current_lease_id ?? null) {
    if (!leaseId || !user) return
    setBusy(true)
    const { error } = await supabase.rpc('mark_rent_paid', { p_lease: leaseId, p_due: due, p_paid_on: paidOnDate })
    setWriteError(error ? markPaidError(error.message, zh) : null)
    await load()
    if (!error) { notifyFactsChanged(); notifyPendingChanged() }
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
  // The ledger covers the current lease's term (a renewal keeps the household start).
  const termStart = ledgerStart(household.start_date, leaseStart)
  // Periods from a signed renewal's start date belong to that lease: they appear here once it
  // takes over (promoted daily on its start date), not on the running term's ledger.
  const nextTermFrom = household.next_lease_id ? nextStart : null
  const schedule = rentSchedule(termStart, household.rent_due_day).filter((p) => !nextTermFrom || p.due < nextTermFrom)
  const ledger = rentLedger(schedule, payments)
  // The replaced term (review 2026-10-01): its own schedule, start..end, before the current term.
  const prevSchedule = prevLease
    ? rentSchedule(ledgerStart(household.start_date, prevLease.start_date), prevLease.due_day ?? household.rent_due_day)
        .filter((p) => (!prevLease.end_date || p.due <= prevLease.end_date) && (!termStart || p.due < termStart))
    : []
  const prevLedger = rentLedger(prevSchedule, prevPayments)
  const prevOpen = prevLedger.periods.filter((p) => p.state === 'due' && !p.upcoming)
  const prevRent = Number(prevLease?.monthly_rent ?? household.monthly_rent) || 0
  const today = torontoDate()
  // RTA s.58(1.1) (in force 2026-09-21): rent *received* >7 days late, 3 times in 6 months —
  // counted over recorded rows only, by the calendar day paid; an unrecorded 'due'
  // placeholder is arrears, not lateness.
  // The tenancy's province (lib/provinces/lease, 2026-10-06) — the same chain as the
  // planner, the executor and the rail: the lease's listing, then the household's
  // address, then the lease's own §2 block. s.38 / N9 / s.58 / the repayment-plan
  // draft are Ontario's — elsewhere the hub says that province's own end-of-term
  // sentence and nothing about the Ontario-only tools.
  const province = leaseProvince({ listing: leasePlace.listing ?? null, household: { address: household.address, city: household.city }, unit: leasePlace.unit ?? null })
  const ontario = province === 'ON'
  // RTA s.58(1.1) is Ontario's; elsewhere nothing is computed, so nothing can leak into the page.
  const lateness = ontario ? persistentLatePayment(latenessRows(ledger.recordedRows)) : null
  const clock = tenancyClock(household.start_date, household.end_date)
  // A tenancy whose start date is still ahead has not begun. Only that case leaves "in tenancy":
  // past the end date it carries on month-to-month (RTA s.38), which the end-date chip says.
  const tenancyLease = { status: 'active', start_date: household.start_date, end_date: household.end_date }
  const notStarted = leaseDisplayState(tenancyLease) === 'upcoming'
  const myRole = members.find((m) => m.user_id === user?.id)?.role ?? null
  // The importer (still a member) may correct an upload until the other side joins and confirms —
  // the same rule as the import page's ?edit= and update_household_import.
  // Not once anyone else is an active member: they have seen these facts (update_household_import refuses too).
  const canCorrectImport = !household.verified && household.source === 'imported' && household.status === 'active' && !!myRole && !!user && household.created_by === user.id && !members.some((m) => m.user_id !== user.id)
  // Ledger vs lease: rows recorded so far against the schedule to date.
  const dueSoFar = ledger.dueSoFar
  const recorded = ledger.recordedSoFar
  // The household carries over into a renewal: only answers about the CURRENT lease are the
  // tenant's intent now (the planner, the rail and /landlord/leases match by lease_id too);
  // earlier answers are history from the previous term (review 2026-10-01).
  const currentIntents = intents.filter((i) => !i.lease_id || i.lease_id === household.current_lease_id)
  const pastIntents = intents.filter((i) => !!i.lease_id && i.lease_id !== household.current_lease_id)
  const latestIntent = currentIntents[0] ?? null
  // People: names from people_for when it answered, otherwise members/invites without names.
  const nameOf = new Map((people ?? []).filter((p) => p.user_id && !p.pending).map((p) => [p.user_id as string, p.name]))
  const pendingPeople: Array<{ key: string; role: string }> = people
    ? people.filter((p) => p.pending && !p.is_me).map((p, i) => ({ key: `p${i}`, role: p.role }))
    : invites.filter((i) => !i.accepted_at && !i.declined_at && !i.revoked_at && new Date(i.expires_at).getTime() > Date.now())
        .map((i) => ({ key: i.id, role: i.invited_role === 'property_manager' ? 'landlord' : i.invited_role }))
  const memberRole = (r: string) => (r === 'property_manager' ? 'landlord' : r)
  const others = members.filter((m) => m.user_id !== user?.id)
  // The tenancy thread is shared by every member (and pending invitees by email): a
  // button may name one person only when exactly one other person is in it.
  const otherCount = others.length + pendingPeople.length
  const soleOther = otherCount === 1 && others.length === 1 ? others[0] : null
  const soleName = soleOther ? nameOf.get(soleOther.user_id) ?? null : null
  const soleLabel = !soleOther ? null
    : soleName ? (zh ? `发消息给 ${personName(soleName, memberRole(soleOther.role), true)}` : `Message ${personName(soleName, memberRole(soleOther.role), false)}`)
    : (zh ? `发消息给${roleLabel(memberRole(soleOther.role), true)}` : `Message the ${roleLabel(memberRole(soleOther.role), false).toLowerCase()}`)
  // Past-due periods with nothing recorded (a 'due' placeholder is not a record) → the landlord may draft a repayment plan.
  const missedDue = ledger.missed
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
        {notStarted ? (
          // Signed but the start date is ahead: the shared lease-state words (lib/matters/states.ts),
          // not "in tenancy" (site test 2026-10-02: a lease starting 11-01 read 租中 on 10-02).
          <span className="rounded-full bg-surface-chip px-2.5 py-[3px] font-mono text-[11px] font-bold text-body-2" data-testid="tenancy-upcoming">{leaseStateDetail(tenancyLease, zh)}</span>
        ) : (
          <span className="rounded-full bg-brand/10 px-2.5 py-[3px] font-mono text-[11px] font-bold text-brand">{zh ? '租中' : 'IN TENANCY'}{clock.month ? (zh ? ` · 第 ${clock.month} 个月` : ` · month ${clock.month}`) : ''}</span>
        )}
        {clock.daysToEnd != null && (
          <span className={'rounded-full px-2.5 py-[3px] font-mono text-[11px] font-bold ' + (clock.daysToEnd < 0 ? 'bg-surface-chip text-body-2' : clock.daysToEnd <= 120 ? 'bg-amber-50 text-amber-800' : 'bg-surface-chip text-body-2')}>
            {clock.daysToEnd < 0
              ? (ontario
                ? (zh ? `已到期 ${-clock.daysToEnd} 天 · 已转月租（RTA s.38）` : `Ended ${-clock.daysToEnd} days ago · month-to-month (RTA s.38)`)
                : (zh ? `已到期 ${-clock.daysToEnd} 天` : `Ended ${-clock.daysToEnd} days ago`))
              : zh ? `到期 ${clock.daysToEnd} 天（${household.end_date}）` : `${clock.daysToEnd} days to ${household.end_date}`}
          </span>
        )}
        {dueSoFar > 0 && (
          <span className="rounded-full bg-surface-chip px-2.5 py-[3px] font-mono text-[11px] text-body-2">{zh ? `租金记录 ${recorded}/${dueSoFar} 期` : `Ledger ${recorded}/${dueSoFar} periods`}</span>
        )}
        {latestIntent && (
          <span className="rounded-full bg-success/10 px-2.5 py-[3px] font-mono text-[11px] font-bold text-success">{zh ? `租客意向：${INTENT_LABEL[latestIntent.intent]?.zh ?? latestIntent.intent}` : `Tenant intent: ${INTENT_LABEL[latestIntent.intent]?.en ?? latestIntent.intent}`}</span>
        )}
        {household.next_lease_id && (
          <span className="rounded-full bg-success/10 px-2.5 py-[3px] font-mono text-[11px] font-bold text-success" data-testid="next-lease">
            {nextStart
              ? (zh ? `续约租约已双方签署 · ${nextStart} 起生效` : `Renewal signed by both · takes effect ${nextStart}`)
              : (zh ? '续约租约已双方签署 · 起租日起生效' : 'Renewal signed by both · takes effect on its start date')}
          </span>
        )}
      </div>
      <div className="mt-1 text-[12.5px] text-body-3">
        {household.monthly_rent ? `$${household.monthly_rent.toLocaleString()}/${zh ? '月' : 'mo'}` : ''}
        {household.rent_due_day ? ` · ${zh ? `每月 ${household.rent_due_day} 号` : `due day ${household.rent_due_day}`}` : ''}
        {household.start_date ? ` · ${household.start_date} → ${household.end_date || (zh ? '月租续' : 'month-to-month')}` : ''}
        {canCorrectImport && (
          <>
            {' · '}
            <Link href={`/leases/import?edit=${household.id}`} className="underline hover:text-[#00ACE4]" data-testid="hub-correct-import">
              {zh ? '更正导入信息' : 'Correct the imported details'}
            </Link>
          </>
        )}
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-line-divider">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[13px] font-semibold ${tab === t.id ? 'border-b-2 border-[#00ACE4] text-[#00ACE4]' : 'text-body-3'}`}>
            {zh ? t.zh : t.en}
          </button>
        ))}
      </div>
      {writeError && <p className="mt-3 text-[12px] text-danger" role="alert" data-testid="hub-write-error">{writeError}</p>}

      {tab === 'overview' && (
        <div className="mt-6 space-y-5">
          {(myRole === 'tenant' || intents.length > 0 || intentPick) && (
            <section className="rounded-xl border border-line-divider bg-white p-5" data-testid="renewal-intent">
              <h2 className="text-[14px] font-extrabold">{zh ? '续约意向' : 'Renewal intent'}</h2>
              <p className="mt-1 text-[12px] text-body-3">{ontario
                ? (zh ? '只是意向，不是通知：搬离仍需按 RTA 提前 60 天送达 N9；不续签会自动转为月租（s.38），你的权利不变。' : 'An intention, not a notice: moving out still needs a Form N9 served 60 days ahead; an unrenewed lease continues month-to-month (s.38) with your rights unchanged.')
                : (zh ? `只是意向，不是通知。${leaseEndFact(province, 'zh') ?? ''}` : `An intention, not a notice. ${leaseEndFact(province, 'en') ?? ''}`)}</p>
              {currentIntents.length > 0 && (
                <div className="mt-3 space-y-1 text-[13px]">
                  {currentIntents.slice(0, 3).map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-success/10 px-2 py-0.5 font-mono text-[10.5px] font-bold text-success">{zh ? INTENT_LABEL[i.intent]?.zh ?? i.intent : INTENT_LABEL[i.intent]?.en ?? i.intent}</span>
                      <span className="text-[11.5px] text-body-3">{i.created_at.slice(0, 10)}{i.tenant_user_id === user?.id ? (zh ? ' · 我' : ' · me') : ''}</span>
                      {i.note && <span className="text-body-2">{i.note}</span>}
                    </div>
                  ))}
                </div>
              )}
              {pastIntents.length > 0 && (
                <div className="mt-3 space-y-1 text-[12px] text-body-3" data-testid="renewal-intent-history">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow">{zh ? '上一期租约' : 'Previous term'}</div>
                  {pastIntents.slice(0, 3).map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-surface-chip px-2 py-0.5 font-mono text-[10.5px] font-bold">{zh ? INTENT_LABEL[i.intent]?.zh ?? i.intent : INTENT_LABEL[i.intent]?.en ?? i.intent}</span>
                      <span>{i.created_at.slice(0, 10)}</span>
                      {i.note && <span>{i.note}</span>}
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
          <MoveInChecklist householdId={id} zh={zh} compact province={province} />
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-extrabold">{zh ? `成员 · ${members.length}` : `Members · ${members.length}`}</h2>
              {myRole && otherCount > 1 && (
                <MessageButton target={{ kind: 'tenancy', ref: id }} zh={zh} className="ml-auto" testId="hub-message-shared"
                  label={zh ? `在租约对话里发消息（${otherCount + 1} 人都能看到）` : `Message in the tenancy thread (all ${otherCount + 1} can see it)`} />
              )}
            </div>
            <div className="mt-3 space-y-2" data-testid="hub-members">
              {members.map((m) => {
                const me = m.user_id === user?.id
                const role = memberRole(m.role)
                const name = nameOf.get(m.user_id) ?? null
                return (
                  <div key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                    <span className="rounded-md bg-surface-chip px-2 py-0.5 font-mono text-[10px] font-bold">{zh ? ROLE_ZH[m.role] ?? m.role : m.role === 'property_manager' ? 'Property manager' : roleLabel(role, false)}</span>
                    {(me || name) && <span className="min-w-0 break-words text-body-2">{me ? (zh ? '我' : 'me') : name}</span>}
                    <span className="text-[11px] text-body-3">{new Date(m.joined_at).toLocaleDateString()}</span>
                    {!me && myRole && soleOther?.user_id === m.user_id && (
                      <MessageButton target={{ kind: 'tenancy', ref: id }} zh={zh} className="ml-auto" testId="hub-message-member"
                        label={soleLabel ?? undefined} />
                    )}
                  </div>
                )
              })}
            </div>
            {pendingPeople.length > 0 && (
              <div className="mt-4 border-t border-line-divider pt-3">
                <div className="font-mono text-[10px] font-bold uppercase text-body-3">{zh ? '待接受的邀请' : 'Pending invites'}</div>
                {pendingPeople.map((p) => (
                  <div key={p.key} className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-body-2" data-testid="hub-pending-invite">
                    <span className="rounded-md bg-surface-chip px-2 py-0.5 font-mono text-[10px] font-bold">{roleLabel(p.role, zh)}</span>
                    <span>{zh ? '邀请中 · 消息会经邮件送达' : 'Invited · messages reach them by email'}</span>
                    {myRole && otherCount === 1 && (
                      <MessageButton target={{ kind: 'tenancy', ref: id }} zh={zh} className="ml-auto" testId="hub-message-invitee"
                        label={zh ? `发消息给${roleLabel(p.role, true)}` : `Message the ${roleLabel(p.role, false).toLowerCase()}`} />
                    )}
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
        <div className="mt-6">
          {/* 节点 4: the tenancy thread (threads / thread_messages) replaced the per-household message table; the old rows were migrated in. */}
          <ThreadPanel kind="tenancy" refId={id} viewer={myRole === 'landlord' || myRole === 'property_manager' ? 'landlord' : myRole === 'agent' ? 'agent' : 'tenant'} zh={zh} title={zh ? '租约对话（房东 · 租客）' : 'Tenancy thread (landlord · tenant)'} />
        </div>
      )}

      {tab === 'rent' && (
        <div className="mt-6 rounded-xl border border-line-divider bg-white p-5">
          <h2 className="text-[14px] font-extrabold">{zh ? '租金记录' : 'Rent record'}</h2>
          <p className="mt-1 text-[11.5px] text-body-3">
            {zh ? '只做记录与提醒,不经手资金。标记后各方可见。' : 'Records and reminders only — no money moves through Stayloop.'}
          </p>
          {lateness && lateness.late.length > 0 && (
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
          {ontario && myRole === 'landlord' && missedDue.length > 0 && (
            <PaymentPlanDraft householdId={id} leaseId={household.current_lease_id} unit={address} monthlyRent={Number(household.monthly_rent) || 0} missed={missedDue} arrears={missedArrears(ledger, Number(household.monthly_rent) || 0)} recorded={ledger.recordedRows.length} zh={zh} />
          )}
          {prevLease && prevOpen.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4" data-testid="rent-previous-term">
              <div className="text-[13px] font-extrabold">{zh ? `上一期租约 · 还没记录的租金（${prevOpen.length} 期）` : `Previous term · rent not yet recorded (${prevOpen.length})`}</div>
              <p className="mt-1 text-[11.5px] text-body-3">{zh ? `续约生效前没有标记的账期仍属于上一期租约${prevLease.end_date ? `（至 ${prevLease.end_date}）` : ''}，在这里记录。` : `Periods not marked before the renewal took over still belong to the previous lease${prevLease.end_date ? ` (to ${prevLease.end_date})` : ''}; record them here.`}</p>
              <div className="mt-3 space-y-2">
                {prevOpen.map((p) => {
                  const amount = Number(p.record?.amount ?? prevRent) || 0
                  const paidOnValue = paidOn[`prev:${p.due}`] ?? today
                  const chk = checkPaidOn(p.due, paidOnValue, today)
                  return (
                    <div key={p.due} className="flex flex-wrap items-center gap-3 rounded-lg border border-line-divider/60 bg-white px-4 py-2.5 text-[13px]" data-state={p.state}>
                      <span className="font-mono font-semibold">{p.due}</span>
                      {amount > 0 && <span className="text-body-3">${amount.toLocaleString()}</span>}
                      <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                        <span className="font-mono text-[10px] font-bold text-amber-700">{zh ? '待付' : 'DUE'}</span>
                        <label className="flex items-center gap-1.5 text-[11px] text-body-3">
                          {zh ? '付款日期' : 'Paid on'}
                          <input type="date" value={paidOnValue} min={earliestPaidOn(p.due, today)} max={today}
                            aria-label={zh ? `${p.due} 这一期的付款日期` : `Payment date for the ${p.due} period`}
                            onChange={(e) => setPaidOn((m) => ({ ...m, [`prev:${p.due}`]: e.target.value }))}
                            className="rounded-md border border-line-divider bg-white px-2 py-1 text-[12px] text-ink" />
                        </label>
                        <button onClick={() => void markPaid(p.due, paidOnValue, prevLease.id)} disabled={busy || !chk.ok}
                          className="rounded-md border border-line-divider px-3 py-1 text-[11px] font-bold hover:border-[#00ACE4] disabled:opacity-50">
                          {zh ? '标记已付' : 'Mark paid'}
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
              {ontario && myRole === 'landlord' && prevLedger.missed.length > 0 && (
                <PaymentPlanDraft householdId={id} leaseId={prevLease.id} unit={address} monthlyRent={prevRent} missed={prevLedger.missed} arrears={missedArrears(prevLedger, prevRent)} recorded={prevLedger.recordedRows.length} zh={zh} />
              )}
            </div>
          )}
          {nextTermFrom && (
            <p className="mt-2 text-[11.5px] text-body-3" data-testid="rent-next-term-note">
              {zh ? `续约租约 ${nextTermFrom} 起生效；从那天起的账期在新租约生效后显示在这里。` : `The renewal takes effect ${nextTermFrom}; periods from that date appear here once it does.`}
            </p>
          )}
          {termStart && household.start_date && termStart > household.start_date.slice(0, 10) && (
            <p className="mt-2 text-[11.5px] text-body-3" data-testid="rent-term-note">
              {zh ? `这里是当前租约（${termStart} 起）的账期；之前租约已记录的租金仍保存在原租约下${prevOpen.length ? '，还没记录的几期列在上方' : ''}。` : `Periods of the current lease (from ${termStart}). Records under the previous lease stay with that lease${prevOpen.length ? '; its unrecorded periods are listed above' : ''}.`}
            </p>
          )}
          {ledger.periods.length === 0 ? (
            <p className="mt-5 text-[13px] text-body-3">
              {termStart && termStart > today
                ? (zh ? `当前租约 ${termStart} 起租，账期从那时开始。` : `The current lease starts ${termStart}; periods begin then.`)
                : (zh ? '缺少起租日或交租日,无法生成账期。' : 'Needs a start date and due day to build the schedule.')}
            </p>
          ) : (
            <div className="mt-4 space-y-2" data-testid="rent-ledger">
              {ledger.periods.map((p) => {
                const amount = Number(p.record?.amount ?? household.monthly_rent) || 0
                const paidOnValue = paidOn[p.due] ?? today
                const chk = checkPaidOn(p.due, paidOnValue, today)
                return (
                  <div key={p.due} className="flex flex-wrap items-center gap-3 rounded-lg border border-line-divider/60 px-4 py-2.5 text-[13px]" data-state={p.state}>
                    <span className="font-mono font-semibold">{p.due}</span>
                    {amount > 0 && <span className="text-body-3">${amount.toLocaleString()}</span>}
                    {!p.onSchedule && p.state === 'due' && (
                      <span className="text-[11px] text-body-3" data-testid="rent-off-schedule">{zh ? '不在每月账期上 · 不计入欠款合计' : 'Not on the monthly schedule · not counted in arrears'}</span>
                    )}
                    <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                      {p.state === 'paid' || p.state === 'late' ? (
                        <span className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                          style={p.state === 'paid' ? { color: '#047857', background: '#04785714' } : { color: '#DC2626', background: '#DC262614' }}>
                          {p.state === 'paid' ? (zh ? '✓ 已付' : '✓ PAID') : (zh ? '已付 · 迟付' : 'PAID LATE')}
                        </span>
                      ) : p.state === 'upcoming' ? (
                        <span className="font-mono text-[10px] font-bold text-body-3">{zh ? '未到期' : 'UPCOMING'}</span>
                      ) : (
                        <>
                          <span className="font-mono text-[10px] font-bold text-amber-700">{p.upcoming ? (zh ? '待付 · 未到期' : 'DUE · UPCOMING') : (zh ? '待付' : 'DUE')}</span>
                          <label className="flex items-center gap-1.5 text-[11px] text-body-3">
                            {zh ? '付款日期' : 'Paid on'}
                            <input type="date" value={paidOnValue} min={earliestPaidOn(p.due, today)} max={today} data-testid="rent-paid-on"
                              aria-label={zh ? `${p.due} 这一期的付款日期` : `Payment date for the ${p.due} period`}
                              onChange={(e) => setPaidOn((m) => ({ ...m, [p.due]: e.target.value }))}
                              className="rounded-md border border-line-divider bg-white px-2 py-1 text-[12px] text-ink" />
                          </label>
                          {chk.ok && chk.late && (
                            <span className="text-[11px] text-amber-700" data-testid="rent-paid-on-late">
                              {zh
                                ? `将记为迟付 ${chk.daysLate} 天${chk.countsTowardS58 ? '（超过 7 天，计入 s.58 次数）' : ''} · 不是这天付的请改成实际日期`
                                : `Will be recorded ${chk.daysLate} day(s) late${chk.countsTowardS58 ? ' (over 7 days — counts toward s.58)' : ''} · not paid that day? Change it to the actual date`}
                            </span>
                          )}
                          {!chk.ok && <span className="text-[11px] text-danger">{zh ? '付款日期不能晚于今天，也不能早于到期日 62 天以上。' : 'The payment date cannot be after today or more than 62 days before the due date.'}</span>}
                          <button onClick={() => void markPaid(p.due, paidOnValue)} disabled={busy || !chk.ok}
                            className="rounded-md border border-line-divider px-3 py-1 text-[11px] font-bold hover:border-[#00ACE4] disabled:opacity-50">
                            {zh ? '标记已付' : 'Mark paid'}
                          </button>
                        </>
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

function markPaidError(message: string, zh: boolean): string {
  if (/future_period/.test(message)) return zh ? '这一期还没到期，到期后再标记。' : 'This period is not due yet; mark it once it is due.'
  if (/not_a_member/.test(message)) return zh ? '只有这份租约的成员可以记录租金。' : 'Only members of this tenancy can record rent.'
  if (/before_lease/.test(message)) return zh ? '这一期早于起租日，不能记录。' : 'This period is before the lease start.'
  if (/no_rent_amount/.test(message)) return zh ? '租约上没有月租金额，无法记录。' : 'The lease has no monthly rent to record.'
  if (/bad_paid_date/.test(message)) return zh ? '付款日期不对：不能晚于今天，也不能早于到期日 62 天以上。' : 'Check the payment date: it cannot be after today or more than 62 days before the due date.'
  if (/after_lease/.test(message)) return zh ? '这一期在上一期租约结束之后，属于新租约的账期。' : 'This period is after the previous lease ended; it belongs to the new lease.'
  return zh ? `没有记录成功：${message}` : `Not recorded: ${message}`
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

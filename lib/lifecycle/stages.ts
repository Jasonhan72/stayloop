// Lifecycle stages — 租前 · 租中 · 租后 derived from the rows a user actually
// has (proposal 2026-09-23 §3.1, user go-ahead the same day). Pure: no I/O,
// no model. `useLifecycle` loads the facts; `LifecycleRail` renders.
//
// Rules of the rail:
//   • a stage is derived from database rows, never from the model's
//     `next_stage` (the V4 WORKFLOW_STAGES are no longer shown);
//   • every "next step" links to a real page or prefills a real prompt;
//   • no scores, no percentages, no rankings in the rail;
//   • each phase states what the AI does and what the person decides.
import { daysBetween, isoDate, parseDateOnly, todayUtc } from '@/lib/dates'
import { n1DeadlineFor } from '@/lib/ontario/rules'
import type { AgentRole } from '@/lib/agent/types'

export type Bi = { zh: string; en: string }
export type PhaseKey = 'pre' | 'mid' | 'post'
export type StepState = 'done' | 'current' | 'todo'

export type Step = { key: string; label: Bi; state: StepState; detail?: Bi; href?: string; prompt?: Bi }
export type Clock = { label: Bi; date: string; days: number; tone: 'ok' | 'warn' | 'late' }
export type Phase = {
  key: PhaseKey
  title: Bi
  eyebrow: string
  state: 'idle' | 'active' | 'done'
  headline: Bi
  steps: Step[]
  next?: { label: Bi; href?: string; prompt?: Bi }
  clock?: Clock
  ai: Bi
  you: Bi
}
export type Lifecycle = { role: AgentRole; current: PhaseKey; phases: Phase[]; empty: boolean }

// ---------------------------------------------------------------------------
// Facts (all optional so partial loads still render something honest)
// ---------------------------------------------------------------------------
export type LeaseFact = { id: string; status: string | null; start_date: string | null; end_date: string | null; unit_label: string | null; tenant_name?: string | null; monthly_rent?: number | null }
export type HouseholdFact = { id: string; current_lease_id: string | null; verified: boolean | null; status: string | null; end_date: string | null; address?: string | null; unit?: string | null; monthly_rent?: number | null }
export type RentFact = { lease_id: string | null; due_date: string; status: string | null; amount?: number | null }
export type TicketFact = { household_id: string | null; status: string | null }
export type RenewalCardFact = { lease_id?: string; stage?: string; status: string; action_type: string }

export type LandlordFacts = {
  listings: { id: string; verification_status: string | null; is_active: boolean | null; address?: string | null; unit?: string | null; images?: unknown }[]
  showingsPending: number
  applications: { id: string; listing_id: string | null; status: string | null; decision_notified_at: string | null }[]
  screenings: { application_id: string | null; status: string | null }[]
  leases: LeaseFact[]
  households: HouseholdFact[]
  rent: RentFact[]
  tickets: TicketFact[]
  renewalCards: RenewalCardFact[]
}
export type TenantFacts = {
  showings: { kind: string | null; status: string | null }[]
  applications: { id: string; status: string | null; decision_notified_at: string | null }[]
  leases: LeaseFact[]
  households: HouseholdFact[]
  memberOf: string[] // household ids the tenant already joined
  rent: RentFact[]
  tickets: TicketFact[]
  passportShares: number
  moveInDate?: string | null
}
export type AgentFacts = { profileStatus: string | null; pendingCards: number }

const RENEWAL_WINDOW_DAYS = 120
const SIGNED = new Set(['signed_both', 'active'])

function clockFor(dateIso: string, today: Date, label: Bi, warnAt = 30): Clock {
  const d = parseDateOnly(dateIso) ?? today
  const days = daysBetween(todayUtc(today), d)
  return { label, date: isoDate(d), days, tone: days < 0 ? 'late' : days <= warnAt ? 'warn' : 'ok' }
}

const AI_YOU = {
  pre: {
    landlord: { ai: { zh: 'AI 发布检查、回答看房提问、一键筛查、拟决定通知', en: 'AI checks the listing, answers viewers, screens on one click, drafts the decision notice' }, you: { zh: '你决定录取谁；通知由你批准后才发出', en: 'You decide who to accept; nothing is sent until you approve' } },
    tenant: { ai: { zh: 'AI 找房、对行情、备材料、跟进申请', en: 'AI searches, checks the market, prepares documents, follows up' }, you: { zh: '你选房源、提交申请、决定分享什么', en: 'You choose the home, apply, and decide what to share' } },
    agent: { ai: { zh: 'AI 备带看包、拉行情、说清筛查要什么', en: 'AI preps showings, pulls the market, explains screening' }, you: { zh: '你与客户签代表协议、带看、交接申请', en: 'You sign the representation agreement, show, hand off applications' } },
  },
  mid: {
    landlord: { ai: { zh: 'AI 起草标准租约、建在管租约、记租金、拟提醒', en: 'AI drafts the standard lease, opens the managed tenancy, keeps the ledger, drafts reminders' }, you: { zh: '你签租约、批准每一封发出的信', en: 'You sign the lease and approve every message that goes out' } },
    tenant: { ai: { zh: 'AI 解读租约、记付租、整理报修', en: 'AI explains the lease, records rent, writes up repairs' }, you: { zh: '你签字、付租、确认报修内容', en: 'You sign, pay, and confirm what to report' } },
    agent: { ai: { zh: 'AI 说明标准租约与押金规则', en: 'AI explains the standard lease and deposit rules' }, you: { zh: '你陪客户签约并交付副本', en: 'You see the signing through and deliver copies' } },
  },
  post: {
    landlord: { ai: { zh: 'AI 算续约方案与 N1 截止、拟续约函、到期提议重新挂牌', en: 'AI computes renewal options and the N1 deadline, drafts the letter, proposes re-listing' }, you: { zh: '你选方案 A / B、决定是否续约', en: 'You choose option A or B and decide on renewal' } },
    tenant: { ai: { zh: 'AI 核对涨幅是否合规、准备谈判要点、提醒 N9', en: 'AI checks the increase, prepares talking points, reminds you about the N9' }, you: { zh: '你决定续、不续或谈；租史进你的护照', en: 'You decide to renew, leave or negotiate; the tenancy goes into your passport' } },
    agent: { ai: { zh: 'AI 归档客户记录', en: 'AI files the client record' }, you: { zh: '你决定是否再次介绍（无佣金）', en: 'You decide whether to introduce again (no commission)' } },
  },
} as const

function phaseShell(key: PhaseKey, role: AgentRole): Phase {
  const titles: Record<PhaseKey, { title: Bi; eyebrow: string }> = {
    pre: { title: { zh: '租前', en: 'Before' }, eyebrow: 'LEASING' },
    mid: { title: { zh: '租中', en: 'During' }, eyebrow: 'LIVING' },
    post: { title: { zh: '租后', en: 'Renewal' }, eyebrow: 'RENEWAL' },
  }
  const r = role === 'tenant' ? 'tenant' : role === 'agent' ? 'agent' : 'landlord'
  return { key, ...titles[key], state: 'idle', headline: { zh: '', en: '' }, steps: [], ai: AI_YOU[key][r].ai, you: AI_YOU[key][r].you }
}

// ---------------------------------------------------------------------------
// Landlord — portfolio view: the rail shows the most advanced phase that has
// something in it; each phase lists what is going on across all units.
// ---------------------------------------------------------------------------
export function landlordLifecycle(f: LandlordFacts, today = new Date()): Lifecycle {
  const pre = phaseShell('pre', 'landlord')
  const mid = phaseShell('mid', 'landlord')
  const post = phaseShell('post', 'landlord')

  const activeListings = f.listings.filter((l) => l.is_active !== false)
  const pendingListings = activeListings.filter((l) => l.verification_status !== 'verified')
  const newApps = f.applications.filter((a) => (a.status ?? 'new') === 'new' || a.status === 'scored' || a.status === 'reviewing')
  const screenedAppIds = new Set(f.screenings.filter((s) => s.status === 'scored').map((s) => s.application_id))
  const unscreened = newApps.filter((a) => !screenedAppIds.has(a.id))
  const scoredUndecided = newApps.filter((a) => screenedAppIds.has(a.id) && !a.decision_notified_at)
  const decided = f.applications.filter((a) => !!a.decision_notified_at)
  const signedLeases = f.leases.filter((l) => SIGNED.has(l.status ?? ''))
  const draftLeases = f.leases.filter((l) => l.status === 'draft')
  const sentLeases = f.leases.filter((l) => l.status === 'sent' || l.status === 'signed_tenant')
  const verifiedHh = f.households.filter((h) => h.verified)
  const unconfirmedHh = f.households.filter((h) => !h.verified)
  const rentDue = f.rent.filter((r) => r.status === 'due' || r.status === 'late')
  const openTickets = f.tickets.filter((t) => t.status && !['done', 'cancelled'].includes(t.status))
  const inWindow = signedLeases.filter((l) => l.end_date && daysBetween(todayUtc(today), parseDateOnly(l.end_date) ?? today) <= RENEWAL_WINDOW_DAYS && daysBetween(todayUtc(today), parseDateOnly(l.end_date) ?? today) >= 0)
  const ended = f.leases.filter((l) => l.status === 'ended' || (l.end_date && daysBetween(todayUtc(today), parseDateOnly(l.end_date) ?? today) < 0 && SIGNED.has(l.status ?? '')))
  const renewalSent = new Set(f.renewalCards.filter((c) => c.action_type === 'send_renewal_letter' && c.status !== 'rejected').map((c) => c.lease_id))

  // ── 租前
  pre.steps = [
    { key: 'publish', label: { zh: '房源发布', en: 'Listing published' }, state: activeListings.length ? (pendingListings.length ? 'current' : 'done') : 'todo', detail: activeListings.length ? { zh: `${activeListings.length} 套${pendingListings.length ? ` · ${pendingListings.length} 套待核验` : ''}`, en: `${activeListings.length} listed${pendingListings.length ? ` · ${pendingListings.length} awaiting verification` : ''}` } : undefined, href: activeListings.length ? '/dashboard' : '/dashboard/listings/new' },
    { key: 'showings', label: { zh: '看房 / 提问', en: 'Showings / questions' }, state: f.showingsPending ? 'current' : activeListings.length ? 'done' : 'todo', detail: f.showingsPending ? { zh: `${f.showingsPending} 条等你回复`, en: `${f.showingsPending} waiting for you` } : undefined, href: '/landlord/todo' },
    { key: 'applications', label: { zh: '申请', en: 'Applications' }, state: newApps.length ? 'current' : decided.length ? 'done' : 'todo', detail: newApps.length ? { zh: `${newApps.length} 份进行中`, en: `${newApps.length} in progress` } : undefined, href: '/landlord/applicants' },
    { key: 'screening', label: { zh: '筛查', en: 'Screening' }, state: unscreened.length ? 'current' : screenedAppIds.size ? 'done' : 'todo', detail: unscreened.length ? { zh: `${unscreened.length} 份未筛查`, en: `${unscreened.length} not screened yet` } : undefined, href: '/landlord/applicants' },
    { key: 'decision', label: { zh: '决定通知', en: 'Decision notice' }, state: scoredUndecided.length ? 'current' : decided.length ? 'done' : 'todo', detail: scoredUndecided.length ? { zh: `${scoredUndecided.length} 份已评分待决定`, en: `${scoredUndecided.length} scored, undecided` } : undefined, href: '/landlord/applicants' },
  ]
  pre.state = !activeListings.length && !f.applications.length ? 'idle' : (newApps.length || f.showingsPending || pendingListings.length) ? 'active' : 'done'
  pre.headline = pre.state === 'idle'
    ? { zh: '还没有房源。发布第一套，租客的申请会进这里。', en: 'No listing yet. Publish one and applications land here.' }
    : { zh: `${activeListings.length} 套房源 · ${newApps.length} 份申请进行中`, en: `${activeListings.length} listings · ${newApps.length} applications in progress` }
  pre.next = pre.state === 'idle'
    ? { label: { zh: '发布房源', en: 'Publish a listing' }, href: '/dashboard/listings/new' }
    : unscreened.length ? { label: { zh: '一键筛查', en: 'Screen on one click' }, href: '/landlord/applicants' }
    : scoredUndecided.length ? { label: { zh: '做决定', en: 'Decide' }, href: '/landlord/applicants' }
    : f.showingsPending ? { label: { zh: '回复看房请求', en: 'Answer showing requests' }, href: '/landlord/todo' }
    : undefined

  // ── 租中
  const midHas = signedLeases.length || draftLeases.length || sentLeases.length || f.households.length
  mid.steps = [
    { key: 'lease', label: { zh: '标准租约', en: 'Standard lease' }, state: sentLeases.length || draftLeases.length ? 'current' : signedLeases.length ? 'done' : 'todo', detail: sentLeases.length ? { zh: `${sentLeases.length} 份待签`, en: `${sentLeases.length} awaiting signature` } : draftLeases.length ? { zh: `${draftLeases.length} 份草稿`, en: `${draftLeases.length} drafts` } : undefined, href: '/landlord/leases' },
    { key: 'household', label: { zh: '在管租约', en: 'Managed tenancy' }, state: unconfirmedHh.length ? 'current' : verifiedHh.length ? 'done' : 'todo', detail: unconfirmedHh.length ? { zh: `${unconfirmedHh.length} 份等租客确认`, en: `${unconfirmedHh.length} awaiting tenant confirmation` } : verifiedHh.length ? { zh: `${verifiedHh.length} 份已确认`, en: `${verifiedHh.length} confirmed` } : undefined, href: '/landlord/leases' },
    { key: 'rent', label: { zh: '租金记录', en: 'Rent ledger' }, state: rentDue.length ? 'current' : verifiedHh.length ? 'done' : 'todo', detail: rentDue.length ? { zh: `${rentDue.length} 期待付`, en: `${rentDue.length} due` } : undefined, href: verifiedHh[0] ? `/h/${verifiedHh[0].id}` : '/landlord/leases' },
    { key: 'repairs', label: { zh: '报修', en: 'Repairs' }, state: openTickets.length ? 'current' : verifiedHh.length ? 'done' : 'todo', detail: openTickets.length ? { zh: `${openTickets.length} 张开放工单`, en: `${openTickets.length} open tickets` } : undefined, href: '/landlord/maintenance' },
  ]
  mid.state = !midHas ? 'idle' : (sentLeases.length || draftLeases.length || unconfirmedHh.length || rentDue.length || openTickets.length) ? 'active' : 'done'
  mid.headline = mid.state === 'idle'
    ? { zh: '录取后从申请一键起草租约，双签即成在管租约。', en: 'After a decision, draft the lease from the application; two signatures create the managed tenancy.' }
    : { zh: `${signedLeases.length} 份已签 · ${verifiedHh.length} 份在管`, en: `${signedLeases.length} signed · ${verifiedHh.length} managed` }
  const nextRent = rentDue.map((r) => r.due_date).sort()[0]
  if (nextRent) mid.clock = clockFor(nextRent, today, { zh: '下期租金', en: 'Next rent' }, 5)
  mid.next = sentLeases.length ? { label: { zh: '查看待签租约', en: 'See leases awaiting signature' }, href: '/landlord/leases' }
    : draftLeases.length ? { label: { zh: '发送租约签署', en: 'Send the lease for signature' }, href: '/landlord/leases' }
    : unconfirmedHh.length ? { label: { zh: '提醒租客确认', en: 'Remind the tenant to confirm' }, prompt: { zh: '帮我提醒租客接受在管租约的邀请。', en: 'Remind my tenant to accept the managed-tenancy invitation.' } }
    : openTickets.length ? { label: { zh: '处理工单', en: 'Handle tickets' }, href: '/landlord/maintenance' }
    : decided.length && !midHas ? { label: { zh: '起草租约', en: 'Draft the lease' }, href: '/landlord/leases/new' }
    : undefined

  // ── 租后
  post.steps = [
    { key: 'window', label: { zh: '续约窗口', en: 'Renewal window' }, state: inWindow.length ? 'current' : signedLeases.length ? 'todo' : 'todo', detail: inWindow.length ? { zh: `${inWindow.length} 份 120 天内到期`, en: `${inWindow.length} ending within 120 days` } : undefined, href: '/landlord/leases' },
    { key: 'letter', label: { zh: '续约函 A/B', en: 'Renewal letter A/B' }, state: inWindow.some((l) => renewalSent.has(l.id)) ? 'done' : inWindow.length ? 'current' : 'todo', href: '/landlord/todo' },
    { key: 'intent', label: { zh: '租客意向', en: 'Tenant intent' }, state: 'todo', detail: { zh: '租客回复后显示', en: 'Shows once the tenant replies' } },
    { key: 'turnover', label: { zh: '退租 → 重新挂牌', en: 'Move-out → re-list' }, state: ended.length ? 'current' : 'todo', detail: ended.length ? { zh: `${ended.length} 份已到期`, en: `${ended.length} ended` } : undefined, href: '/dashboard/listings/new' },
  ]
  post.state = inWindow.length || ended.length ? 'active' : signedLeases.length ? 'idle' : 'idle'
  const soonest = inWindow.map((l) => l.end_date!).sort()[0]
  if (soonest) {
    post.clock = clockFor(soonest, today, { zh: '最近到期', en: 'Next lease end' }, 60)
    const n1 = n1DeadlineFor(soonest)
    const n1days = daysBetween(todayUtc(today), parseDateOnly(n1) ?? today)
    post.headline = { zh: `${inWindow.length} 份进入续约窗口 · 涨租 N1 最晚 ${n1}${n1days < 0 ? '（已过，本期不涨）' : `（还有 ${n1days} 天）`}`, en: `${inWindow.length} in the renewal window · N1 for an increase by ${n1}${n1days < 0 ? ' (passed — no increase this term)' : ` (${n1days} days)`}` }
  } else {
    post.headline = signedLeases.length
      ? { zh: '到期前 120 天起自动生成 90 / 60 / 30 天触点。', en: 'Touchpoints at 90 / 60 / 30 days start 120 days before the end.' }
      : { zh: '有生效租约后，这里会跟进续约与退租。', en: 'Once a lease is active, renewal and move-out are followed up here.' }
  }
  post.next = inWindow.some((l) => !renewalSent.has(l.id)) ? { label: { zh: '批准续约函', en: 'Approve the renewal letter' }, href: '/landlord/todo' }
    : ended.length ? { label: { zh: '重新挂牌', en: 'Re-list the unit' }, href: '/dashboard/listings/new' }
    : undefined

  const current: PhaseKey = post.state === 'active' ? 'post' : mid.state === 'active' ? 'mid' : mid.state === 'done' && pre.state !== 'active' ? 'mid' : 'pre'
  return { role: 'landlord', current, phases: [pre, mid, post], empty: pre.state === 'idle' && mid.state === 'idle' && post.state === 'idle' }
}

// ---------------------------------------------------------------------------
// Tenant — one tenancy at a time (the latest lease / household wins).
// ---------------------------------------------------------------------------
export function tenantLifecycle(f: TenantFacts, today = new Date()): Lifecycle {
  const pre = phaseShell('pre', 'tenant')
  const mid = phaseShell('mid', 'tenant')
  const post = phaseShell('post', 'tenant')

  const showings = f.showings.filter((s) => s.kind !== 'question')
  const pendingShowings = showings.filter((s) => s.status === 'pending')
  const apps = f.applications
  const openApps = apps.filter((a) => !a.decision_notified_at && a.status !== 'declined')
  const approved = apps.filter((a) => a.status === 'approved')
  const lease = [...f.leases].sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0]
  const leaseSigned = !!lease && SIGNED.has(lease.status ?? '')
  const leaseToSign = !!lease && lease.status === 'sent'
  const hh = f.households.find((h) => h.current_lease_id === lease?.id) ?? f.households[0]
  const joined = !!hh && f.memberOf.includes(hh.id)
  const rentDue = f.rent.filter((r) => r.status === 'due' || r.status === 'late')
  const openTickets = f.tickets.filter((t) => t.status && !['done', 'cancelled'].includes(t.status))
  const endIso = hh?.end_date || lease?.end_date || null
  const daysToEnd = endIso ? daysBetween(todayUtc(today), parseDateOnly(endIso) ?? today) : null
  const inWindow = daysToEnd != null && daysToEnd >= 0 && daysToEnd <= RENEWAL_WINDOW_DAYS

  pre.steps = [
    { key: 'search', label: { zh: '对话找房', en: 'Search by chat' }, state: apps.length || showings.length ? 'done' : 'current', href: '/tenant/agent', prompt: { zh: '帮我找【区域】、预算【$金额】以内的【户型】。', en: 'Find me a 【unit type】 in 【area】 under 【$budget】.' } },
    { key: 'showing', label: { zh: '看房请求', en: 'Showing request' }, state: pendingShowings.length ? 'current' : showings.length ? 'done' : 'todo', detail: pendingShowings.length ? { zh: `${pendingShowings.length} 条等房东回应`, en: `${pendingShowings.length} waiting for the landlord` } : undefined, href: '/tenant/applications' },
    { key: 'apply', label: { zh: '提交申请', en: 'Apply' }, state: openApps.length ? 'current' : apps.length ? 'done' : 'todo', detail: openApps.length ? { zh: `${openApps.length} 份等房东决定`, en: `${openApps.length} awaiting a decision` } : undefined, href: '/tenant/applications' },
    { key: 'decision', label: { zh: '房东决定', en: 'Landlord decision' }, state: approved.length ? 'done' : openApps.length ? 'current' : 'todo', detail: approved.length ? { zh: '已录取', en: 'Approved' } : undefined, href: '/tenant/applications' },
  ]
  pre.state = leaseSigned ? 'done' : apps.length || showings.length ? 'active' : 'idle'
  pre.headline = pre.state === 'idle'
    ? { zh: '从一句话开始：区域、预算、户型。', en: 'Start with one sentence: area, budget, unit type.' }
    : approved.length && !leaseSigned ? { zh: '申请已录取，等房东发来租约。', en: 'Approved — the lease is on its way.' }
    : { zh: `${showings.length} 次看房请求 · ${apps.length} 份申请`, en: `${showings.length} showing requests · ${apps.length} applications` }
  if (f.moveInDate && !leaseSigned) pre.clock = clockFor(f.moveInDate, today, { zh: '目标入住', en: 'Target move-in' }, 30)
  pre.next = pre.state === 'idle' ? { label: { zh: '开始找房', en: 'Start searching' }, prompt: { zh: '帮我找【区域】、预算【$金额】以内的【户型】，【其他要求】。', en: 'Find me a 【unit type】 in 【area】 under 【$budget】, 【other needs】.' } }
    : openApps.length ? { label: { zh: '查看申请进度', en: 'Track my application' }, href: '/tenant/applications' }
    : undefined

  mid.steps = [
    { key: 'sign', label: { zh: '签署租约', en: 'Sign the lease' }, state: leaseSigned ? 'done' : leaseToSign ? 'current' : 'todo', detail: leaseToSign ? { zh: '等你签署（查收邮件里的链接）', en: 'Awaiting your signature (link in your email)' } : undefined, href: '/tenant/lease' },
    { key: 'join', label: { zh: '确认在管租约', en: 'Confirm the tenancy' }, state: joined ? 'done' : hh ? 'current' : 'todo', detail: hh && !joined ? { zh: '接受房东的邀请后可见租金记录与报修', en: 'Accept the invitation to see the ledger and repairs' } : undefined, href: hh ? `/h/${hh.id}` : '/tenant/lease' },
    { key: 'rent', label: { zh: '租金记录', en: 'Rent ledger' }, state: rentDue.length ? 'current' : joined ? 'done' : 'todo', detail: rentDue.length ? { zh: `${rentDue.length} 期待付`, en: `${rentDue.length} due` } : undefined, href: hh ? `/h/${hh.id}` : '/tenant/lease' },
    { key: 'repairs', label: { zh: '报修', en: 'Repairs' }, state: openTickets.length ? 'current' : joined ? 'done' : 'todo', detail: openTickets.length ? { zh: `${openTickets.length} 张工单进行中`, en: `${openTickets.length} tickets open` } : undefined, href: hh ? `/h/${hh.id}` : '/tenant/maintenance', prompt: { zh: '我要报修：【哪里】【什么问题】，【从什么时候开始】，【是否紧急】。', en: 'Repair request: 【where】【what】, 【since when】, 【urgent?】.' } },
  ]
  mid.state = leaseSigned || joined ? (leaseToSign || (hh && !joined) || rentDue.length || openTickets.length ? 'active' : 'done') : leaseToSign ? 'active' : 'idle'
  mid.headline = mid.state === 'idle'
    ? { zh: '录取后房东会发来安省标准租约，凭链接在线签署。', en: 'After approval the landlord sends the Ontario standard lease; sign it online by link.' }
    : { zh: `${lease?.unit_label || hh?.address || '你的租约'} · ${lease?.start_date || ''}${endIso ? ` → ${endIso}` : ''}`, en: `${lease?.unit_label || hh?.address || 'Your lease'} · ${lease?.start_date || ''}${endIso ? ` → ${endIso}` : ''}` }
  const nextRent = rentDue.map((r) => r.due_date).sort()[0]
  if (nextRent) mid.clock = clockFor(nextRent, today, { zh: '下期租金', en: 'Next rent' }, 5)
  else if (lease?.start_date && leaseSigned && daysBetween(todayUtc(today), parseDateOnly(lease.start_date) ?? today) > 0) mid.clock = clockFor(lease.start_date, today, { zh: '入住日', en: 'Move-in' }, 14)
  mid.next = leaseToSign ? { label: { zh: '去签署', en: 'Sign now' }, href: '/tenant/lease' }
    : hh && !joined ? { label: { zh: '接受在管租约邀请', en: 'Accept the tenancy invitation' }, href: `/h/${hh.id}` }
    : openTickets.length ? { label: { zh: '查看工单', en: 'See tickets' }, href: `/h/${hh!.id}` }
    : undefined

  post.steps = [
    { key: 'window', label: { zh: '续约窗口', en: 'Renewal window' }, state: inWindow ? 'current' : 'todo', detail: inWindow ? { zh: `${daysToEnd} 天后到期`, en: `ends in ${daysToEnd} days` } : undefined },
    { key: 'intent', label: { zh: '续 / 不续 / 谈', en: 'Renew / leave / negotiate' }, state: 'todo', href: '/tenant/agent', prompt: { zh: '我的租约快到期了，帮我看看房东的续约方案是否合规，我该怎么谈。', en: 'My lease is ending — check whether the renewal offer is lawful and how I should negotiate.' } },
    { key: 'n9', label: { zh: '退租 N9（60 天）', en: 'Move-out N9 (60 days)' }, state: 'todo', href: '/rules' },
    { key: 'passport', label: { zh: '租史进护照', en: 'Tenancy into passport' }, state: f.passportShares ? 'done' : joined ? 'current' : 'todo', href: '/tenant/passport' },
  ]
  post.state = inWindow ? 'active' : 'idle'
  if (inWindow && endIso) {
    post.clock = clockFor(endIso, today, { zh: '租约到期', en: 'Lease ends' }, 60)
    const n9 = new Date((parseDateOnly(endIso) ?? today).getTime() - 60 * 86_400_000)
    post.headline = { zh: `租约 ${endIso} 到期 · 若搬离，N9 最晚 ${isoDate(n9)} 送达`, en: `Lease ends ${endIso} · to move out, serve the N9 by ${isoDate(n9)}` }
  } else {
    post.headline = joined ? { zh: '到期前 120 天起，续约与退租在这里跟进。', en: 'From 120 days out, renewal and move-out are followed up here.' } : { zh: '按时付租的记录会进你的租客护照。', en: 'On-time rent goes into your tenant passport.' }
  }
  post.next = inWindow ? { label: { zh: '看续约方案', en: 'Review the renewal' }, prompt: { zh: '我的租约快到期了，帮我看看房东的续约方案是否合规，我该怎么谈。', en: 'My lease is ending — check the renewal offer and how I should respond.' } } : undefined

  const current: PhaseKey = post.state === 'active' ? 'post' : mid.state === 'active' || mid.state === 'done' ? 'mid' : 'pre'
  return { role: 'tenant', current, phases: [pre, mid, post], empty: pre.state === 'idle' && mid.state === 'idle' && post.state === 'idle' }
}

// ---------------------------------------------------------------------------
// Agent — no client table yet (proposal P2): the rail shows verification and
// where the agent can act in each phase.
// ---------------------------------------------------------------------------
export function agentLifecycle(f: AgentFacts): Lifecycle {
  const pre = phaseShell('pre', 'agent')
  const mid = phaseShell('mid', 'agent')
  const post = phaseShell('post', 'agent')
  const verified = f.profileStatus === 'verified'
  pre.steps = [
    { key: 'reco', label: { zh: 'RECO 认证', en: 'RECO verification' }, state: verified ? 'done' : f.profileStatus ? 'current' : 'todo', detail: { zh: verified ? '已核验 · 出现在经纪目录' : f.profileStatus ? '待 Stayloop 人工核验' : '提交注册信息', en: verified ? 'Verified · listed in the directory' : f.profileStatus ? 'Awaiting manual check' : 'Submit your registration' }, href: '/agent/verify' },
    { key: 'client', label: { zh: '客户接入（代表协议）', en: 'Client intake (representation agreement)' }, state: 'todo', detail: { zh: '记录代表协议与 Information Guide · 即将', en: 'Record the agreement and Information Guide · soon' } },
    { key: 'pricing', label: { zh: '挂牌定价 / 找房', en: 'Pricing / search' }, state: verified ? 'current' : 'todo', prompt: { zh: '帮客户的房源定租金：拉【区域】同户型的实时挂牌和 TRREB 数据。', en: 'Price my client’s unit: pull live listings for 【area】 and the TRREB benchmark.' } },
    { key: 'screen', label: { zh: '申请与筛查交接', en: 'Application & screening hand-off' }, state: 'todo', href: '/screening/app' },
  ]
  pre.state = verified ? 'active' : f.profileStatus ? 'active' : 'idle'
  pre.headline = verified ? { zh: 'RECO 已核 · 租客可在房源页联系你', en: 'RECO verified · tenants can contact you from listings' } : { zh: '先完成 RECO 注册核验，经纪目录才会列出你。', en: 'Complete the RECO check first; the directory lists verified agents only.' }
  pre.next = verified ? undefined : { label: { zh: '提交认证', en: 'Submit verification' }, href: '/agent/verify' }
  mid.steps = [{ key: 'lease', label: { zh: '标准租约与押金规则', en: 'Standard lease & deposit rules' }, state: 'todo', prompt: { zh: '客户要签约了：安省标准租约和 OREA Form 400 各管什么、押金最多收多少？', en: 'My client is signing: what do the standard lease and Form 400 each cover, and how much deposit is allowed?' } }]
  mid.headline = { zh: '签约时只引用标准租约与 RTA 事实。', en: 'At signing, only the standard lease and RTA facts.' }
  post.steps = [{ key: 'file', label: { zh: '客户记录归档', en: 'File the client record' }, state: 'todo', detail: { zh: '即将 · 无佣金结算', en: 'Soon · no commission settlement' } }]
  post.headline = { zh: 'Stayloop 不做经纪业务、不收佣金。', en: 'Stayloop is not a brokerage and takes no commission.' }
  return { role: 'agent', current: 'pre', phases: [pre, mid, post], empty: false }
}

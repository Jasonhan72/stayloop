'use client'

import { isRegistrationLive } from '@/lib/agentProfile'
import { ReactNode, useEffect, useState } from 'react'
import { fetchPendingCount, PENDING_CHANGED_EVENT } from '@/lib/agent/pendingCount'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useHats } from '@/lib/useHats'
import Header from './Header'
import { useI18n } from '@/lib/i18n'
import { LiveRowsProvider, useLiveRowsTotal } from '@/lib/liveRows'
import { SampleBanner } from './SampleNotice'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { BulbIcon, ChatIcon, GearIcon, PhoneTabs, PlusIcon, ProgressIcon, RAIL_BY_ROLE, TodoIcon, type RailItem, type WorkspaceRole } from './workspace/rail'

export type { WorkspaceRole } from './workspace/rail'

interface Props {
  role: WorkspaceRole
  aside?: ReactNode
  children: ReactNode
  // hide aside (e.g. on small surfaces)
  hideAside?: boolean
  // Real rows that must stay visible even when the route's fixture body is
  // gated behind the honest empty state (e2e 2026-09-23: a tenant with live
  // showing requests and an application saw only "还没有租房申请").
  liveSlot?: ReactNode
  /** Phone: no content padding — the page owns the whole viewport (assistant screens). md+ unchanged. */
  phoneApp?: boolean
}

// Workspace routes whose page body is still design-canon fixture content
// (Mia Chen / Thompson / Kevin Tran…). The old treatment kept the fixtures
// on screen with a banner on top; real users still read canned tenants as
// their own data, and new users met a wall of somebody else's numbers.
// Activation plan 2026-08-12: the DEFAULT is an honest empty state carrying
// the next-step CTA for that surface; the fixtures stay one click away
// behind "查看产品演示" (session-scoped).
//
// /tenant/passport and /tenant/lease are deliberately NOT gated: both carry
// real functionality (share-token generation; HouseholdList) mixed with
// demo sections, and blanket-hiding them would hide the real parts too.
// /landlord/leases and /landlord/applicants self-manage (real rows render
// once any exist).
type GateNote = { zh: string; en: string }
const DEMO_GATE: Record<string, { zh: string; en: string; ctaZh: string; ctaEn: string; href: string; note?: GateNote }> = {
  '/notifications': {
    zh: '还没有通知。你的 AI 与各方产生的动态会出现在这里。', en: 'No notifications yet — activity from your AI and counterparties lands here.',
    ctaZh: '回到工作台', ctaEn: 'Back to workspace', href: '/dashboard',
  },
  '/landlord/finance': {
    zh: '还没有收支记录。导入一份已签租约,租金台账从第一天起自动记录。', en: 'No ledger yet. Import a signed lease and the rent ledger starts itself.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
  },
  '/landlord/maintenance': {
    zh: '还没有报修工单。工单来自你的在管租约——导入后租客可直接在站内报修。', en: 'No tickets yet. Tickets come from your managed tenancies — import a lease and tenants file them here.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
  },
  '/tenant/applications': {
    zh: '还没有租房申请。让助手按你的预算和区域先找几套,再一键申请。', en: 'No applications yet. Let your assistant shortlist homes for your budget and area first.',
    ctaZh: '让助手开始找房 →', ctaEn: 'Let your assistant start searching →', href: '/tenant/agent',
  },
  '/tenant/payments': {
    zh: '还没有租金记录。加入或导入你的在管租约后,每月租金在这里留痕——准时记录会进入你的租客护照。', en: 'No rent records yet. Join or import your managed tenancy and every month leaves a record here.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
    note: {
      zh: '在线收租尚未上线：「立即支付」不会扣款，没有任何银行或支付机构接入。',
      en: 'Online rent collection is not live yet: "Pay now" does not debit anything — no bank or payment processor is connected.',
    },
  },
  '/tenant/move-in': {
    zh: '入住清单会在你的租约开始时生成。', en: 'Your move-in checklist is generated when a tenancy starts.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
  },
  '/tenant/maintenance': {
    zh: '还没有报修记录。加入你的在管租约后,报修、进度、留痕都在这里。', en: 'No maintenance yet. Join your managed tenancy and repairs live here.',
    ctaZh: '导入已签租约 →', ctaEn: 'Import a signed lease →', href: '/leases/import',
  },
  '/agent/tasks': {
    zh: '任务由你的客户表自动生成：缺代表协议 / Information Guide 的日期、超过 7 天没联系、看房中要备带看包、已申请要跟进结果。先在客户表里加第一位客户。', en: 'Tasks come from your client table: missing agreement / Information Guide dates, 7+ days quiet, a showing pack to prepare, an application to follow up. Add your first client in the client table.',
    ctaZh: '去客户表 →', ctaEn: 'Open the client table →', href: '/agent/clients',
  },
  '/agent/clients': {
    zh: '上面是你的真实客户表：加第一位客户，并记录代表协议与 Information Guide 的日期。下面的样例只是演示。', en: 'Your real client table is above: add the first client and record the agreement and Information Guide dates. The samples below are a demo.',
    ctaZh: '和助手开工 →', ctaEn: 'Start with your assistant →', href: '/agent/agent',
  },
  '/agent/calendar': {
    zh: '还没有带看日程。让助手帮你安排第一场。', en: 'No showings yet. Let your assistant schedule your first.',
    ctaZh: '打开助手 →', ctaEn: 'Open your assistant →', href: '/agent/agent',
  },
  '/agent/earnings': {
    zh: '还没有结算记录。完成的转介与筛查服务会在这里对账。', en: 'No settlements yet. Completed referrals and screenings reconcile here.',
    ctaZh: '打开助手 →', ctaEn: 'Open your assistant →', href: '/agent/agent',
  },
  '/tenant/passport/sharing': {
    zh: '还没有授权记录。第一次分享护照后，谁能看到什么会列在这里。', en: 'No grants yet. Once you share your Passport, who can see what is listed here.',
    ctaZh: '打开护照 →', ctaEn: 'Open Passport →', href: '/tenant/passport',
  },
  '/tenant/audit': {
    zh: '还没有审计记录。助手替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your assistant does for you is logged here.',
    ctaZh: '打开助手 →', ctaEn: 'Open your assistant →', href: '/tenant/agent',
  },
  '/landlord/audit': {
    zh: '还没有审计记录。助手替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your assistant does for you is logged here.',
    ctaZh: '打开助手 →', ctaEn: 'Open your assistant →', href: '/landlord/agent',
  },
  '/agent/audit': {
    zh: '还没有审计记录。助手替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your assistant does for you is logged here.',
    ctaZh: '打开助手 →', ctaEn: 'Open your assistant →', href: '/agent/agent',
  },
  '/agent/showings/*': {
    zh: '还没有带看任务。让助手帮你接第一场。', en: 'No showings yet. Let your assistant book your first.',
    ctaZh: '打开助手 →', ctaEn: 'Open your assistant →', href: '/agent/agent',
  },
}

// Routes that mix real functionality with fixture sections (deliberately not
// gated — see above). They carry the banner permanently; the note says which
// parts are real.
const SAMPLE_NOTE: Record<string, GateNote> = {
  '/tenant/passport': {
    zh: '本页只有「分享链接」与「租金上报候补」是真实功能；四枚章的状态、查看记录与验证历史是示范数据。',
    en: 'Only the share link and the rent-reporting waitlist are live here; stamp status, view log and verification history are sample data.',
  },
  '/tenant/lease': {
    zh: '本页只有「在管租约」列表是真实数据；租约条款、签署进度与助手解读是示范数据。',
    en: 'Only the managed-lease list is live here; the clauses, signing progress and assistant commentary are sample data.',
  },
}

function lookupGate(path: string) {
  if (DEMO_GATE[path]) return DEMO_GATE[path]
  const prefix = Object.keys(DEMO_GATE).find((k) => k.endsWith('/*') && path.startsWith(k.slice(0, -1)))
  return prefix ? DEMO_GATE[prefix] : null
}

function useDemoGate() {
  const path = usePathname() || ''
  const gate = lookupGate(path)
  const sampleNote = SAMPLE_NOTE[path] ?? null
  const [showDemo, setShowDemo] = useState(false)
  useEffect(() => {
    try { setShowDemo(sessionStorage.getItem('sl-show-demo') === '1') } catch {}
  }, [])
  return { gate, sampleNote, showDemo, setShowDemo }
}

function DemoGate({ children, gate, showDemo, setShowDemo, liveSlot }: {
  children: React.ReactNode
  gate: (typeof DEMO_GATE)[string] | null
  showDemo: boolean
  setShowDemo: (v: boolean) => void
  liveSlot?: ReactNode
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  if (!gate) return <>{children}</>
  if (showDemo) {
    return (
      <>
        <SampleBanner
          zh={zh}
          note={gate.note}
          onExit={() => { try { sessionStorage.removeItem('sl-show-demo') } catch {}; setShowDemo(false) }}
        />
        {children}
      </>
    )
  }
  return (
    <LiveRowsProvider>
      {liveSlot}
      <GateEmptyState gate={gate} zh={zh} setShowDemo={setShowDemo} hasLive={!!liveSlot} />
    </LiveRowsProvider>
  )
}

function GateEmptyState({ gate, zh, setShowDemo, hasLive }: { gate: NonNullable<(typeof DEMO_GATE)[string]>; zh: boolean; setShowDemo: (v: boolean) => void; hasLive: boolean }) {
  const live = useLiveRowsTotal()
  // Real rows are on screen: the "nothing yet" copy would contradict them.
  const copy = hasLive && live > 0
    ? (zh ? '以上是你的真实记录。这一页的其余部分仍是产品演示。' : 'Those are your real records. The rest of this page is still a product demo.')
    : (zh ? gate.zh : gate.en)
  return (
    <div className="rounded-2xl border border-line-divider bg-white px-6 py-16 text-center">
      <p className="mx-auto max-w-[420px] text-[14px] leading-relaxed text-body-2">{copy}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={gate.href} className="rounded-xl px-6 py-3 text-[14px] font-bold text-white" style={{ background: '#00ACE4' }}>
          {zh ? gate.ctaZh : gate.ctaEn}
        </Link>
        <button
          className="rounded-xl border border-line-divider px-5 py-3 text-[13px] font-semibold text-body-2"
          onClick={() => { try { sessionStorage.setItem('sl-show-demo', '1') } catch {}; setShowDemo(true) }}
        >
          {zh ? '查看产品演示' : 'View product demo'}
        </button>
      </div>
    </div>
  )
}

// Agents must be RECO-verified before the agent-only surfaces mean anything
// (decision 2026-09-13). The shell shows the state on every agent page; the
// public directory (AgentPicker) only lists status = verified.
function useAgentVerification(role: WorkspaceRole) {
  const auth = useAuth()
  const [status, setStatus] = useState<'loading' | 'none' | 'pending' | 'verified' | 'rejected' | 'renewal_due' | 'expired'>('loading')
  useEffect(() => {
    if (role !== 'agent') return
    if (auth.loading) return
    if (!auth.user) { setStatus('none'); return }
    supabase.from('agent_profiles').select('status').eq('auth_id', auth.user.id).maybeSingle()
      .then(({ data }) => setStatus((data?.status as typeof status) || 'none'))
  }, [role, auth.loading, auth.user])
  return status
}

function AgentVerificationBanner({ status, zh }: { status: ReturnType<typeof useAgentVerification>; zh: boolean }) {
  const path = usePathname() || ''
  if (status === 'loading' || status === 'verified' || path.startsWith('/agent/verify')) return null
  const text = status === 'pending'
    ? (zh ? '你的 RECO 注册信息已提交，等待人工核验。核验通过后进入租客可选的经纪目录。' : 'Your RECO registration is submitted and awaiting manual verification. Once verified you appear in the tenant-facing agent directory.')
    : status === 'rejected'
      ? (zh ? '认证未通过。请检查提交的注册信息并重新提交。' : 'Verification was not approved. Check the submitted registration and resubmit.')
      : status === 'renewal_due'
        ? (zh ? '你的 RECO 注册将在 30 天内到期。续期后在认证页更新到期日，我们会重新核验；到期前你仍在经纪目录中。' : 'Your RECO registration expires within 30 days. After renewing, update the expiry date on the verification page to be re-checked; you stay in the directory until it lapses.')
      : status === 'expired'
        ? (zh ? '你的 RECO 注册已过期，已暂时移出经纪目录。续期后更新到期日即可重新核验。' : 'Your RECO registration has expired and you have been removed from the directory for now. Update the expiry date after renewing to be re-verified.')
        : (zh ? '经纪身份尚未认证：提交 RECO 注册信息，人工核验后获得「RECO 注册已核」标记并进入租客可选目录。Stayloop 不是经纪公司，不收取佣金或转介费。' : 'Not yet verified as an agent: submit your RECO registration; once checked by hand you get the “RECO verified” mark and appear in the tenant-facing directory. Stayloop is not a brokerage and takes no commission or referral fee.')
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
      <span>{text}</span>
      <Link href="/agent/verify" className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: '#1B1B3C' }}>{zh ? (status === 'none' ? '去认证' : '查看 / 更新') : (status === 'none' ? 'Get verified' : 'View / update')}</Link>
    </div>
  )
}

// Agent-only surfaces (clients, tasks, calendar, earnings, showings) stay an
// empty state until the RECO check passes; the assistant home and the
// verification page remain usable (decision 2026-09-13).
function isAgentOnlyRoute(path: string): boolean {
  if (!path.startsWith('/agent/')) return false
  // The assistant home, verification, and the phone tabs around the
  // assistant (todo / ideas / progress) stay open before RECO verification.
  return !/^\/agent\/(agent|verify|todo|ideas|progress)(\/|$)/.test(path)
}
function usePathnameSafe(): string { return usePathname() || '' }
function AgentLockedState({ status, zh }: { status: string; zh: boolean }) {
  return (
    <div className="rounded-2xl border border-line-divider bg-white px-6 py-16 text-center">
      <p className="mx-auto max-w-[460px] text-[14px] leading-relaxed text-body-2">
        {status === 'pending'
          ? (zh ? '这一页在 RECO 注册核验通过后开放。你的资料已提交，等待人工核验。' : 'This page opens once your RECO registration is verified. Your submission is awaiting a manual check.')
          : (zh ? '这一页只对已认证的经纪开放：提交 RECO 注册信息，人工核验后即可使用客户、带看与目录功能。' : 'This page is for verified agents: submit your RECO registration and, once checked, clients, showings and the directory open up.')}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/agent/verify" className="rounded-xl px-6 py-3 text-[14px] font-bold text-white" style={{ background: '#00ACE4' }}>{zh ? (status === 'pending' ? '查看认证状态' : '去认证') : (status === 'pending' ? 'View status' : 'Get verified')}</Link>
        <Link href="/agent/agent" className="rounded-xl border border-line-divider px-5 py-3 text-[13px] font-semibold text-body-2">{zh ? '先和助手聊聊' : 'Talk to your assistant meanwhile'}</Link>
      </div>
    </div>
  )
}

// The landlord workspace is for accounts that hold the landlord hat (three-role
// test report 2026-09-24, SL-A-01 / SL-T-06 / SL-T-08). A signed-in tenant or
// agent without one is sent to /landlord/become — an explicit opt-in — rather
// than silently shown (and, before, silently granted) the landlord tools.
// Anonymous visitors keep the preview.
function useLandlordHatGuard(role: WorkspaceRole): boolean {
  const auth = useAuth()
  const hats = useHats()
  const router = useRouter()
  const path = usePathnameSafe()
  const signedIn = !!auth.user && !(auth.user as { is_anonymous?: boolean }).is_anonymous
  const blocked = role === 'landlord' && signedIn && !hats.loading && !hats.landlord
  useEffect(() => {
    if (!blocked) return
    const q = typeof window !== 'undefined' ? window.location.search : ''
    router.replace('/landlord/become?next=' + encodeURIComponent(path + q))
  }, [blocked, path, router])
  return blocked
}

export default function WorkspaceShell({ role, aside, children, hideAside, liveSlot, phoneApp = false }: Props) {
  const hatBlocked = useLandlordHatGuard(role)
  const { gate, sampleNote, showDemo, setShowDemo } = useDemoGate()
  const agentStatus = useAgentVerification(role)
  const shellPath = usePathnameSafe()
  const { lang } = useI18n()
  // On a gated route the aside is demo narrative too (Unit 1207 stories) —
  // an honest empty state beside a fixture-driven aside defeats the point.
  const asideHidden = hideAside || (gate != null && !showDemo)
  return (
    <>
      <Header variant="solid" mobileNav={false} />
      <main style={{ background: '#F3F8FC' }}>
        {/* mobile: stacked (Rail becomes a fixed bottom tab bar); md+: navy
            sidebar left · content · aside right (2026-09 console redesign,
            design/redesign-2026-09/Console.dc.html) */}
        <div className="md:flex md:min-h-[calc(100vh-66px)]">
          <Rail role={role} />
          <div className={phoneApp ? 'sl-phone-pb min-w-0 flex-1 p-0 md:p-0' : 'min-w-0 flex-1 px-5 py-6 pb-24 sm:px-7 md:py-9 md:pb-9 lg:px-12'}>
            {(sampleNote || role === 'agent') && (
              <div className={phoneApp ? 'px-5 pt-4 md:px-8 md:pt-4' : ''}>
                {sampleNote && <SampleBanner zh={lang === 'zh'} note={sampleNote} />}
                {role === 'agent' && <AgentVerificationBanner status={agentStatus} zh={lang === 'zh'} />}
              </div>
            )}
            {hatBlocked
              ? <div className="py-24 text-center font-mono text-[13px] text-body-3">…</div>
              : role === 'agent' && agentStatus !== 'loading' && !isRegistrationLive(agentStatus) && isAgentOnlyRoute(shellPath)
              ? <AgentLockedState status={agentStatus} zh={lang === 'zh'} />
              : <DemoGate gate={gate} showDemo={showDemo} setShowDemo={setShowDemo} liveSlot={liveSlot}>{children}</DemoGate>}
          </div>
          {!asideHidden && (
            <aside className="border-t border-line-divider bg-white px-5 py-6 md:w-[320px] md:flex-none md:overflow-y-auto md:border-l md:border-t-0 md:p-6">
              {aside}
            </aside>
          )}
        </div>
      </main>
    </>
  )
}

function Rail({ role }: { role: WorkspaceRole }) {
  const path = usePathname() || ''
  const { lang } = useI18n()
  const en = lang === 'en'
  const items = RAIL_BY_ROLE[role]
  const auth = useAuth()
  // 待办 badge = cards waiting on this hat (same shared fetch as the phone tabs).
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => {
    if (auth.loading || !auth.user) { setPendingCount(0); return }
    let cancelled = false
    const load = () => fetchPendingCount(role).then((n) => { if (!cancelled) setPendingCount(n) })
    void load()
    window.addEventListener(PENDING_CHANGED_EVENT, load)
    return () => { cancelled = true; window.removeEventListener(PENDING_CHANGED_EVENT, load) }
  }, [auth.loading, auth.user, role, path])
  // md+ (Muse web reference, design/muse-web-blueprint-2026-09.html, user
  // 2026-09-25 "按蓝本改"): a 64px icon column — light, like the rest of the
  // screen (user 2026-09-25 "把这个条的颜色改为浅色") — no text labels, the name
  // appears on hover; the assistant's four pages first (the same four as the
  // phone tabs, which had no desktop entry before), then the role's pages,
  // the current hat and settings at the bottom. The labelled 220px sidebar
  // (09-05) is retired.
  const assistant: RailItem[] = [
    { key: 'assistant', href: `/${role}/agent`, icon: <ChatIcon />, label: { zh: '助手', en: 'Assistant' }, desc: { zh: '和助手对话', en: 'Talk to your assistant' } },
    { key: 'todo', href: `/${role}/todo`, icon: <TodoIcon />, label: { zh: '待办', en: 'To-do' }, desc: { zh: '等你点头的', en: 'Waiting on you' } },
    { key: 'ideas', href: `/${role}/ideas`, icon: <BulbIcon />, label: { zh: '想法', en: 'Ideas' }, desc: { zh: '它可以替你做', en: 'What it can do for you' } },
    { key: 'progress', href: `/${role}/progress`, icon: <ProgressIcon />, label: { zh: '进度', en: 'Progress' }, desc: { zh: '租前 · 租中 · 租后', en: 'Leasing · Living · Renewal' } },
  ]
  const pages = items.filter((it) => it.key !== 'home')
  const settingsItem: RailItem = { key: 'settings', href: '/settings', icon: <GearIcon />, label: { zh: '设置', en: 'Settings' }, desc: { zh: '账号与设置', en: 'Account and settings' } }
  const link = (it: RailItem, badge = 0) => {
    const on = path === it.href || path.startsWith(it.href + '/')
    return (
      <Link
        key={it.key}
        href={it.href}
        aria-label={en ? it.label.en : it.label.zh}
        aria-current={on ? 'page' : undefined}
        className="group relative flex h-11 w-11 flex-none items-center justify-center rounded-[10px] transition hover:bg-white"
        style={on ? { background: '#FFFFFF', color: '#1B1B3C', boxShadow: '0 1px 2px rgba(27,27,60,0.10)' } : { color: '#6E6E8A' }}
      >
        {it.icon}
        {badge > 0 && (
          <span className="absolute right-1 top-1 min-w-[16px] rounded-full px-1 text-center text-[10px] font-extrabold leading-4 text-white" style={{ background: '#EF4444' }}>{badge > 99 ? '99+' : badge}</span>
        )}
        <span className="pointer-events-none absolute left-[52px] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-lg group-hover:block group-focus-visible:block" style={{ background: '#1B1B3C' }}>{en ? it.label.en : it.label.zh}</span>
      </Link>
    )
  }
  return (
    <>
    <PhoneTabs role={role} items={items} />
    <nav
      className="hidden md:flex md:w-16 md:flex-none md:flex-col md:items-center md:gap-1 md:border-r md:border-line-divider md:px-2 md:py-3"
      style={{ background: '#F3F8FC' }}
      aria-label={en ? 'Workspace' : '工作台'}
    >
      {/* "+" = new conversation (user 2026-09-25, as on claude.ai): on the
          assistant page it starts one in place; elsewhere it opens the page
          with ?new=1. The role avatar that used to sit here is gone, and so
          is the text label under it — hats switch in the Header's identity
          menu only (user 2026-09-25, final round: no role marker anywhere
          around the assistant). */}
      <Link
        href={`/${role}/agent?new=1`}
        onClick={(e) => { if (path === `/${role}/agent`) { e.preventDefault(); window.dispatchEvent(new Event('sl-new-thread')) } }}
        aria-label={en ? 'New conversation' : '新会话'}
        className="group relative flex h-10 w-10 flex-none items-center justify-center rounded-xl text-white transition hover:opacity-90"
        style={{ background: '#1B1B3C' }}
      >
        <PlusIcon />
        <span className="pointer-events-none absolute left-[52px] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-[7px] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-lg group-hover:block" style={{ background: '#1B1B3C' }}>{en ? 'New conversation' : '新会话'}</span>
      </Link>
      <div className="h-2 flex-none" />
      {assistant.map((it) => link(it, it.key === 'todo' ? pendingCount : 0))}
      <div className="my-1.5 h-px w-7 flex-none" style={{ background: '#D3E3EF' }} />
      {pages.map((it) => link(it))}
      <div className="mt-auto" />
      {link(settingsItem)}
    </nav>
    </>
  )
}

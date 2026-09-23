'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from './Header'
import { useI18n } from '@/lib/i18n'
import { ROLE_THEME } from '@/lib/roleTheme'
import { LiveRowsProvider, useLiveRowsTotal } from '@/lib/liveRows'
import { SampleBanner } from './SampleNotice'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'

export type WorkspaceRole = 'tenant' | 'landlord' | 'agent'

interface RailItem {
  key: string
  href: string
  icon: ReactNode
  label: { zh: string; en: string }
  desc: { zh: string; en: string }
}

const RAIL_BY_ROLE: Record<WorkspaceRole, RailItem[]> = {
  tenant: [
    { key: 'home',      href: '/tenant/agent',     icon: <ChatIcon />,    label: { zh: '主页', en: 'Home' } , desc: { zh: '和 Luna 对话——找房、办事的入口', en: 'Chat with Luna — search and get things done' } },
    { key: 'apps',      href: '/tenant/applications', icon: <FileIcon />, label: { zh: '申请', en: 'Apps' } , desc: { zh: '我的申请进度', en: 'Track your applications' } },
    { key: 'passport',  href: '/tenant/passport',  icon: <PassIcon />,    label: { zh: 'Passport', en: 'Passport' } , desc: { zh: '租客护照与四枚章', en: 'Your Passport and four stamps' } },
    { key: 'lease',     href: '/tenant/lease',     icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } , desc: { zh: '查看与签署租约', en: 'View and sign leases' } },
    { key: 'maint',     href: '/tenant/maintenance', icon: <ToolIcon />,  label: { zh: '维修', en: 'Maint.' } , desc: { zh: '报修与进度跟踪', en: 'Report and track repairs' } },
    { key: 'pay',       href: '/tenant/payments',  icon: <CashIcon />,    label: { zh: '付款', en: 'Pay' } , desc: { zh: '房租账单与支付', en: 'Rent bills and payments' } },
    { key: 'audit',     href: '/tenant/audit',     icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } , desc: { zh: '操作审计记录', en: 'Your audit trail' } },
  ],
  landlord: [
    { key: 'home',      href: '/landlord/agent',   icon: <ChatIcon />,    label: { zh: '主页', en: 'Home' } , desc: { zh: '和 Logic 对话——管房的入口', en: 'Chat with Logic — manage your rentals' } },
    { key: 'apps',      href: '/landlord/applicants', icon: <FileIcon />, label: { zh: '申请', en: 'Apps' } , desc: { zh: '申请人审查与评分', en: 'Review and score applicants' } },
    { key: 'screen',    href: '/screening/app',    icon: <ScreenIcon />,  label: { zh: '筛查', en: 'Screen' } , desc: { zh: '租客筛查报告', en: 'Tenant screening reports' } },
    { key: 'lease',     href: '/landlord/leases',  icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } , desc: { zh: '租约管理与续约', en: 'Leases and renewals' } },
    { key: 'maint',     href: '/landlord/maintenance', icon: <ToolIcon />,label: { zh: '维修', en: 'Maint.' } , desc: { zh: '维修工单处理', en: 'Handle maintenance tickets' } },
    { key: 'fin',       href: '/landlord/finance', icon: <CashIcon />,    label: { zh: '财务', en: 'Finance' } , desc: { zh: '收租与财务面板', en: 'Rent collection and finances' } },
    { key: 'audit',     href: '/landlord/audit',   icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } , desc: { zh: '操作审计记录', en: 'Your audit trail' } },
  ],
  agent: [
    { key: 'home',      href: '/agent/agent',      icon: <ChatIcon />,    label: { zh: '主页', en: 'Home' } , desc: { zh: '和 Brief 对话——业务的入口', en: 'Chat with Brief — run your business' } },
    { key: 'tasks',     href: '/agent/tasks',      icon: <FileIcon />,    label: { zh: '任务', en: 'Tasks' } , desc: { zh: '今日任务与带看', en: "Today's tasks and showings" } },
    { key: 'clients',   href: '/agent/clients',    icon: <ListIcon />,    label: { zh: '客户', en: 'Clients' } , desc: { zh: '客户管理', en: 'Manage clients' } },
    { key: 'cal',       href: '/agent/calendar',   icon: <ToolIcon />,    label: { zh: '日历', en: 'Calendar' } , desc: { zh: '日程安排', en: 'Your calendar' } },
    { key: 'earn',      href: '/agent/earnings',   icon: <CashIcon />,    label: { zh: '佣金', en: 'Earnings' } , desc: { zh: '佣金与结算', en: 'Commissions and payouts' } },
  ],
}

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
    zh: '还没有租房申请。让 Luna 按你的预算和区域先找几套,再一键申请。', en: 'No applications yet. Let Luna shortlist homes for your budget and area first.',
    ctaZh: '让 Luna 开始找房 →', ctaEn: 'Let Luna start searching →', href: '/tenant/agent',
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
    zh: '还没有客户任务。客户与任务功能将在代表协议记录上线后开放;现在可以先让 Brief 准备带看包或定价。', en: 'No client tasks yet. Clients and tasks open once representation records ship; meanwhile Brief can prep a showing pack or price a unit.',
    ctaZh: '和 Brief 开工 →', ctaEn: 'Start with Brief →', href: '/agent/agent',
  },
  '/agent/clients': {
    zh: '上面是你的真实客户表：加第一位客户，并记录代表协议与 Information Guide 的日期。下面的样例只是演示。', en: 'Your real client table is above: add the first client and record the agreement and Information Guide dates. The samples below are a demo.',
    ctaZh: '和 Brief 开工 →', ctaEn: 'Start with Brief →', href: '/agent/agent',
  },
  '/agent/calendar': {
    zh: '还没有带看日程。让 Brief 帮你安排第一场。', en: 'No showings yet. Let Brief schedule your first.',
    ctaZh: '打开 Brief →', ctaEn: 'Open Brief →', href: '/agent/agent',
  },
  '/agent/earnings': {
    zh: '还没有结算记录。完成的转介与筛查服务会在这里对账。', en: 'No settlements yet. Completed referrals and screenings reconcile here.',
    ctaZh: '打开 Brief →', ctaEn: 'Open Brief →', href: '/agent/agent',
  },
  '/tenant/passport/sharing': {
    zh: '还没有授权记录。第一次分享护照后，谁能看到什么会列在这里。', en: 'No grants yet. Once you share your Passport, who can see what is listed here.',
    ctaZh: '打开护照 →', ctaEn: 'Open Passport →', href: '/tenant/passport',
  },
  '/tenant/audit': {
    zh: '还没有审计记录。助手替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your assistant does for you is logged here.',
    ctaZh: '打开 Luna →', ctaEn: 'Open Luna →', href: '/tenant/agent',
  },
  '/landlord/audit': {
    zh: '还没有审计记录。助手替你做的每件事都会在这里留痕。', en: 'No audit events yet. Everything your assistant does for you is logged here.',
    ctaZh: '打开 Logic →', ctaEn: 'Open Logic →', href: '/landlord/agent',
  },
  '/agent/showings/*': {
    zh: '还没有带看任务。让 Brief 帮你接第一场。', en: 'No showings yet. Let Brief book your first.',
    ctaZh: '打开 Brief →', ctaEn: 'Open Brief →', href: '/agent/agent',
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
      : status === 'renewal_due' || status === 'expired'
        ? (zh ? '你的 RECO 注册已到期或即将到期，请更新到期日以重新核验。' : 'Your RECO registration has expired or is about to; update the expiry date to be re-verified.')
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
        <Link href="/agent/agent" className="rounded-xl border border-line-divider px-5 py-3 text-[13px] font-semibold text-body-2">{zh ? '先和 Brief 聊聊' : 'Talk to Brief meanwhile'}</Link>
      </div>
    </div>
  )
}

export default function WorkspaceShell({ role, aside, children, hideAside, liveSlot }: Props) {
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
          <div className="min-w-0 flex-1 px-5 py-6 pb-24 sm:px-7 md:py-9 md:pb-9 lg:px-12">
            {sampleNote && <SampleBanner zh={lang === 'zh'} note={sampleNote} />}
            {role === 'agent' && <AgentVerificationBanner status={agentStatus} zh={lang === 'zh'} />}
            {role === 'agent' && agentStatus !== 'loading' && agentStatus !== 'verified' && isAgentOnlyRoute(shellPath)
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('stayloop-avatar') : null
    if (cached) setAvatarUrl(cached)
  }, [])
  const ROLE_LABEL: Record<WorkspaceRole, { zh: string; en: string }> = {
    tenant: { zh: '租客', en: 'Tenant' }, landlord: { zh: '房东', en: 'Landlord' }, agent: { zh: '经纪', en: 'Agent' },
  }
  const onSettings = path.startsWith('/settings')
  return (
    <>
    <PhoneTabs role={role} items={items} />
    <nav
      // md+: the navy sidebar. Phones get the five-tab bar above (Muse
      // benchmark 2026-09-22) — the old eight-cell bar is gone.
      className="hidden md:static md:flex md:h-auto md:w-[220px] md:flex-none md:flex-col md:items-stretch md:justify-start md:gap-1 md:overflow-visible md:px-[14px] md:py-[18px]"
      style={{ background: '#1B1B3C' }}
    >
      {/* role card (md+) */}
      <div className="mb-3 hidden items-center gap-3 rounded-[10px] px-3 py-[10px] md:flex" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-8 w-8 flex-none rounded-full object-cover" />
        ) : (
          <div className="h-8 w-8 flex-none rounded-full" style={{ background: ROLE_THEME[role].avatarGradient }} />
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-white">{en ? ROLE_LABEL[role].en : ROLE_LABEL[role].zh}</div>
          <div className="text-[11px]" style={{ color: '#94a3b8' }}>{en ? 'Workspace' : '工作台'}</div>
        </div>
      </div>

      {items.map((it) => {
        const on = path === it.href || path.startsWith(it.href + '/')
        return (
          <Link
            key={it.key}
            href={it.href}
            title={en ? it.desc.en : it.desc.zh}
            className={
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[16px] transition md:h-[42px] md:w-auto md:flex-none md:flex-row md:justify-start md:gap-3 md:px-[14px] md:text-[13.5px] md:font-semibold ' +
              (on ? 'text-white' : 'hover:text-white')
            }
            style={on ? { background: 'rgba(255,255,255,0.10)', color: '#ffffff' } : { color: '#c7d2e3' }}
          >
            {it.icon}
            <span className="max-w-full truncate text-[9.5px] font-medium leading-none md:text-[13.5px] md:font-semibold md:leading-normal">{en ? it.label.en : it.label.zh}</span>
          </Link>
        )
      })}

      <div className="hidden md:mt-auto md:block" />
      <Link
        href="/settings"
        title={en ? 'Settings and subscription' : '设置与订阅'}
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[16px] transition md:h-[42px] md:w-auto md:flex-none md:flex-row md:justify-start md:gap-3 md:px-[14px] md:text-[13.5px] md:font-semibold"
        style={onSettings ? { background: 'rgba(255,255,255,0.10)', color: '#ffffff' } : { color: '#c7d2e3' }}
      >
        <GearIcon />
        <span className="max-w-full truncate text-[9.5px] font-medium leading-none md:text-[13.5px] md:font-semibold md:leading-normal">{en ? 'Settings' : '设置'}</span>
      </Link>
    </nav>
    </>
  )
}

/* ============= PHONE TABS (md and below) =============
   助手 · 待办 (badge = pending approvals) · 想法 · 进度 · 更多 (sheet with the
   rest of the role's pages, settings, notifications). */
function PhoneTabs({ role, items }: { role: WorkspaceRole; items: RailItem[] }) {
  const path = usePathname() || ''
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [more, setMore] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => {
    if (auth.loading || !auth.user) { setPendingCount(0); return }
    let cancelled = false
    supabase
      .from('agent_pending_actions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('role', role)
      .then(({ count }) => { if (!cancelled) setPendingCount(count ?? 0) })
    return () => { cancelled = true }
  }, [auth.loading, auth.user, role, path])
  useEffect(() => { setMore(false) }, [path])
  // Install hint + service-worker registration live here because every
  // signed-in phone visit passes through the shell (PWA, benchmark item F).
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  const tabs: { key: string; href: string; label: string; icon: ReactNode; badge?: number }[] = [
    { key: 'agent', href: `/${role}/agent`, label: zh ? '助手' : 'Assistant', icon: <ChatIcon /> },
    { key: 'todo', href: `/${role}/todo`, label: zh ? '待办' : 'To-do', icon: <TodoIcon />, badge: pendingCount },
    { key: 'ideas', href: `/${role}/ideas`, label: zh ? '想法' : 'Ideas', icon: <BulbIcon /> },
    { key: 'progress', href: `/${role}/progress`, label: zh ? '进度' : 'Progress', icon: <HomeIcon /> },
  ]
  const cell = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[16px] transition'
  const moreOn = more || (!tabs.some((t) => path === t.href || path.startsWith(t.href + '/')) && path !== `/${role}/agent`)
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-between px-1 pb-[env(safe-area-inset-bottom)] md:hidden" style={{ background: '#1B1B3C' }} aria-label={zh ? '工作台' : 'Workspace'}>
        {tabs.map((t) => {
          const on = path === t.href || path.startsWith(t.href + '/')
          return (
            <Link key={t.key} href={t.href} className={cell} style={{ color: on ? '#ffffff' : '#c7d2e3', background: on ? 'rgba(255,255,255,0.10)' : undefined }}>
              <span className="relative">
                {t.icon}
                {!!t.badge && <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{t.badge > 9 ? '9+' : t.badge}</span>}
              </span>
              <span className="max-w-full truncate text-[11px] font-medium leading-none">{t.label}</span>
            </Link>
          )
        })}
        <button type="button" onClick={() => setMore((v) => !v)} className={cell} style={{ color: moreOn ? '#ffffff' : '#c7d2e3', background: moreOn ? 'rgba(255,255,255,0.10)' : undefined }} aria-expanded={more}>
          <MoreIcon />
          <span className="text-[11px] font-medium leading-none">{zh ? '更多' : 'More'}</span>
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[45] bg-black/35 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-16 rounded-t-2xl bg-white px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={zh ? '更多页面' : 'More pages'}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />
            <div className="grid grid-cols-4 gap-2">
              {items.filter((it) => it.key !== 'home').map((it) => {
                const on = path === it.href || path.startsWith(it.href + '/')
                return (
                  <Link key={it.key} href={it.href} className={'flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11.5px] font-medium ' + (on ? 'bg-brand/10 text-brand' : 'bg-surface text-body-2')}>
                    {it.icon}
                    <span className="max-w-full truncate">{zh ? it.label.zh : it.label.en}</span>
                  </Link>
                )
              })}
              <Link href="/notifications" className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-3 text-[11.5px] font-medium text-body-2"><BellSmall /><span>{zh ? '通知' : 'Alerts'}</span></Link>
              <Link href="/settings" className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-3 text-[11.5px] font-medium text-body-2"><GearIcon /><span>{zh ? '设置' : 'Settings'}</span></Link>
            </div>
          </div>
        </div>
      )}
      <InstallHint zh={zh} />
    </>
  )
}

// "Add to Home Screen" nudge — once, only on phones, only in a browser tab
// (not when already running standalone). Dismissal is remembered locally.
function InstallHint({ zh }: { zh: boolean }) {
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem('sl-install-hint') === '1') return
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
      if (standalone || window.innerWidth >= 768) return
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
      const t = setTimeout(() => setShow(true), 4000)
      return () => clearTimeout(t)
    } catch { /* no-op */ }
  }, [])
  if (!show) return null
  const dismiss = () => { try { localStorage.setItem('sl-install-hint', '1') } catch {}; setShow(false) }
  return (
    <div className="fixed inset-x-3 bottom-[76px] z-[44] flex items-start gap-3 rounded-xl border border-line-divider bg-white p-3 text-[12.5px] leading-snug text-body-2 shadow-[0_10px_30px_rgba(27,27,60,.18)] md:hidden">
      <img src="/icons/icon-192.png" alt="" className="h-9 w-9 flex-none rounded-lg" />
      <div className="min-w-0 flex-1">
        <b className="text-body">{zh ? '把 Stayloop 放到主屏' : 'Add Stayloop to your Home Screen'}</b>
        <div className="mt-0.5">
          {ios
            ? (zh ? '在 Safari 里点「分享」→「添加到主屏幕」，像 App 一样打开。' : 'In Safari tap Share → “Add to Home Screen” to open it like an app.')
            : (zh ? '浏览器菜单里选「安装应用」或「添加到主屏幕」。' : 'Choose “Install app” or “Add to Home screen” in the browser menu.')}
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label={zh ? '关闭' : 'Close'} className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[16px] text-body-3">×</button>
    </div>
  )
}
function TodoIcon() { return I('M4 4h16v16H4z|M8 12l3 3 5-6') }
function BulbIcon() { return I('M9 18h6|M10 21h4|M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z') }
function MoreIcon() { return I('M5 12h.01|M12 12h.01|M19 12h.01') }
function BellSmall() { return I('M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0') }

/* ============= ICON SET (compact, monoline) ============= */

const I = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
)

function HomeIcon()  { return I('M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z') }
function ChatIcon()  { return I('M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z') }
function ListIcon()  { return I('M3 6h18|M3 12h18|M3 18h18') }
function FileIcon()  { return I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8') }
function PassIcon()  { return I('M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M3 10h18|M9 16h.01') }
function LeaseIcon() { return I('M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v3|M14 14l3 3 6-6') }
function ToolIcon()  { return I('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z') }
function CashIcon()  { return I('M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6') }
function ScreenIcon() { return I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15l2 2 4-4') }
function AuditIcon() { return I('M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z|M9 12l2 2 4-4') }
function GearIcon()  { return I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z') }

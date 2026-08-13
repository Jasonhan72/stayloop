'use client'

import { Fragment, ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from './Header'
import { useI18n } from '@/lib/i18n'
import { ROLE_THEME } from '@/lib/roleTheme'

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

const ROLE_ACCENT: Record<WorkspaceRole, { bg: string; fg: string }> = {
  tenant:   { bg: ROLE_THEME.tenant.accent,   fg: ROLE_THEME.tenant.deep },
  landlord: { bg: ROLE_THEME.landlord.accent, fg: ROLE_THEME.landlord.deep },
  agent:    { bg: ROLE_THEME.agent.accent,    fg: ROLE_THEME.agent.deep },
}

interface Props {
  role: WorkspaceRole
  aside?: ReactNode
  children: ReactNode
  // hide aside (e.g. on small surfaces)
  hideAside?: boolean
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
const DEMO_GATE: Record<string, { zh: string; en: string; ctaZh: string; ctaEn: string; href: string }> = {
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
    zh: '还没有客户任务。替客户下单一次租客筛查,任务与进度在这里跟踪。', en: 'No client tasks yet. Order a screening for a client and track it here.',
    ctaZh: '发起筛查 →', ctaEn: 'Start a screening →', href: '/screening/app',
  },
  '/agent/clients': {
    zh: '还没有客户档案。从替第一位客户下单筛查开始。', en: 'No clients yet. Start by ordering a screening for your first one.',
    ctaZh: '发起筛查 →', ctaEn: 'Start a screening →', href: '/screening/app',
  },
  '/agent/calendar': {
    zh: '还没有带看日程。让 Brief 帮你安排第一场。', en: 'No showings yet. Let Brief schedule your first.',
    ctaZh: '打开 Brief →', ctaEn: 'Open Brief →', href: '/agent/agent',
  },
  '/agent/earnings': {
    zh: '还没有结算记录。完成的转介与筛查服务会在这里对账。', en: 'No settlements yet. Completed referrals and screenings reconcile here.',
    ctaZh: '打开 Brief →', ctaEn: 'Open Brief →', href: '/agent/agent',
  },
}

function useDemoGate() {
  const path = usePathname() || ''
  const gate = DEMO_GATE[path] ?? null
  const [showDemo, setShowDemo] = useState(false)
  useEffect(() => {
    try { setShowDemo(sessionStorage.getItem('sl-show-demo') === '1') } catch {}
  }, [])
  return { gate, showDemo, setShowDemo }
}

function DemoGate({ children, gate, showDemo, setShowDemo }: {
  children: React.ReactNode
  gate: (typeof DEMO_GATE)[string] | null
  showDemo: boolean
  setShowDemo: (v: boolean) => void
}) {
  const { lang } = useI18n()
  const zh = lang === 'zh'
  if (!gate) return <>{children}</>
  if (showDemo) {
    return (
      <>
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line-strong bg-surface-chip px-4 py-2.5 font-mono text-[11px] leading-relaxed text-body-3">
          <span className="min-w-0 flex-1">
            {zh
              ? '产品演示 · 以下是演示内容,并非你的真实数据'
              : 'PRODUCT DEMO · what follows is demo content, not your live records'}
          </span>
          <button
            className="underline"
            onClick={() => { try { sessionStorage.removeItem('sl-show-demo') } catch {}; setShowDemo(false) }}
          >
            {zh ? '返回' : 'Exit demo'}
          </button>
        </div>
        {children}
      </>
    )
  }
  return (
    <div className="rounded-2xl border border-line-divider bg-white px-6 py-16 text-center">
      <p className="mx-auto max-w-[420px] text-[14px] leading-relaxed text-body-2">{zh ? gate.zh : gate.en}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={gate.href} className="rounded-xl px-6 py-3 text-[14px] font-bold text-white" style={{ background: '#7C3AED' }}>
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

export default function WorkspaceShell({ role, aside, children, hideAside }: Props) {
  const { gate, showDemo, setShowDemo } = useDemoGate()
  // On a gated route the aside is demo narrative too (Unit 1207 stories) —
  // an honest empty state beside a fixture-driven aside defeats the point.
  const asideHidden = hideAside || (gate != null && !showDemo)
  return (
    <>
      <Header variant="solid" />
      <main className="bg-surface">
        {/* mobile: stacked (Rail becomes a fixed bottom tab bar); md+: Rail left
            · content · aside right */}
        <div className="md:flex md:min-h-[calc(100vh-66px)]">
          <Rail role={role} />
          <div className="min-w-0 flex-1 px-5 py-6 pb-24 sm:px-7 md:py-9 md:pb-9 lg:px-12">
            <DemoGate gate={gate} showDemo={showDemo} setShowDemo={setShowDemo}>{children}</DemoGate>
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
  const items = RAIL_BY_ROLE[role]
  const accent = ROLE_ACCENT[role]
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('stayloop-avatar') : null
    if (cached) setAvatarUrl(cached)
  }, [])
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around gap-1 overflow-x-auto border-t border-line-divider bg-surface-muted px-2 md:static md:h-auto md:w-[76px] md:flex-col md:justify-start md:gap-1.5 md:overflow-visible md:border-r md:border-t-0 md:px-0 md:py-4"
    >
      {items.map((it, i) => {
        const on = path === it.href || path.startsWith(it.href + '/')
        // The Agent home is the OS entry (architecture §13) — render it as a
        // distinct accent tile, then a divider before the related V4 flows.
        if (i === 0) {
          return (
            <Fragment key={it.key}>
              <Link
                href={it.href}
                className={
                  'group relative flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[16px] text-white shadow-sm transition ' +
                  (on ? 'ring-2 ring-offset-2 ring-offset-surface-muted' : 'hover:opacity-90')
                }
                style={{ background: accent.bg, ['--tw-ring-color' as string]: accent.bg }}
              >
                {it.icon}
                {/* hover tooltip: label + one-line function intro */}
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 flex-col whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-left shadow-lg md:group-hover:flex">
                  <span className="text-[12px] font-bold text-white">{lang === 'en' ? it.label.en : it.label.zh}</span>
                  <span className="text-[11px] text-white/70">{lang === 'en' ? it.desc.en : it.desc.zh}</span>
                </span>
              </Link>
              <div className="my-1.5 hidden h-px w-7 bg-line-divider md:block" />
            </Fragment>
          )
        }
        return (
          <Link
            key={it.key}
            href={it.href}
            className={
              'group relative flex h-11 w-11 flex-none items-center justify-center rounded-lg text-[16px] transition ' +
              (on
                ? 'bg-white text-brand shadow-sm'
                : 'text-body-3 hover:bg-white/60 hover:text-body')
            }
            style={on ? { color: accent.fg } : undefined}
          >
            {it.icon}
            {/* hover tooltip: label + one-line function intro */}
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 flex-col whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-left shadow-lg md:group-hover:flex">
                  <span className="text-[12px] font-bold text-white">{lang === 'en' ? it.label.en : it.label.zh}</span>
                  <span className="text-[11px] text-white/70">{lang === 'en' ? it.desc.en : it.desc.zh}</span>
                </span>
          </Link>
        )
      })}
      <div className="hidden md:mt-auto md:block" />
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="hidden h-8 w-8 rounded-full object-cover md:block" />
      ) : (
        <div
          className="hidden h-8 w-8 rounded-full md:block"
          style={{ background: ROLE_THEME[role].avatarGradient }}
        />
      )}
    </nav>
  )
}

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
function AuditIcon() { return I('M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z|M9 12l2 2 4-4') }

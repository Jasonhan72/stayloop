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
}

const RAIL_BY_ROLE: Record<WorkspaceRole, RailItem[]> = {
  tenant: [
    { key: 'home',      href: '/tenant/agent',     icon: <HomeIcon />,    label: { zh: '主页', en: 'Home' } },
    { key: 'listings',  href: '/listings',         icon: <ListIcon />,    label: { zh: '房源', en: 'Listings' } },
    { key: 'apps',      href: '/tenant/applications', icon: <FileIcon />, label: { zh: '申请', en: 'Apps' } },
    { key: 'passport',  href: '/tenant/passport',  icon: <PassIcon />,    label: { zh: 'Passport', en: 'Passport' } },
    { key: 'lease',     href: '/tenant/lease',     icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } },
    { key: 'maint',     href: '/tenant/maintenance', icon: <ToolIcon />,  label: { zh: '维修', en: 'Maint.' } },
    { key: 'pay',       href: '/tenant/payments',  icon: <CashIcon />,    label: { zh: '付款', en: 'Pay' } },
    { key: 'audit',     href: '/tenant/audit',     icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } },
  ],
  landlord: [
    { key: 'home',      href: '/landlord/agent',   icon: <HomeIcon />,    label: { zh: '主页', en: 'Home' } },
    { key: 'listings',  href: '/dashboard',        icon: <ListIcon />,    label: { zh: '房源', en: 'Listings' } },
    { key: 'apps',      href: '/landlord/applicants', icon: <FileIcon />, label: { zh: '申请', en: 'Apps' } },
    { key: 'lease',     href: '/landlord/leases',  icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } },
    { key: 'maint',     href: '/landlord/maintenance', icon: <ToolIcon />,label: { zh: '维修', en: 'Maint.' } },
    { key: 'fin',       href: '/landlord/finance', icon: <CashIcon />,    label: { zh: '财务', en: 'Finance' } },
    { key: 'audit',     href: '/landlord/audit',   icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } },
  ],
  agent: [
    { key: 'home',      href: '/agent/agent',      icon: <HomeIcon />,    label: { zh: '主页', en: 'Home' } },
    { key: 'tasks',     href: '/agent/tasks',      icon: <FileIcon />,    label: { zh: '任务', en: 'Tasks' } },
    { key: 'clients',   href: '/agent/clients',    icon: <ListIcon />,    label: { zh: '客户', en: 'Clients' } },
    { key: 'cal',       href: '/agent/calendar',   icon: <ToolIcon />,    label: { zh: '日历', en: 'Calendar' } },
    { key: 'earn',      href: '/agent/earnings',   icon: <CashIcon />,    label: { zh: '佣金', en: 'Earnings' } },
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

// Workspace pages that still render hardcoded design-canon fixtures (Mia
// Chen / Thompson / Kevin Tran…) instead of the user's real data. Until each
// one is wired to live tables, every route on this list gets a visible
// "示范数据" notice — a real landlord must never mistake canned tenants,
// payouts or notifications for their own.
const DEMO_DATA_ROUTES = new Set([
  '/notifications',
  // /landlord/leases and /landlord/applicants self-manage their notice —
  // they render REAL rows once any exist, labeled demo fixtures before that.
  '/landlord/finance', '/landlord/maintenance',
  '/tenant/applications', '/tenant/payments', '/tenant/passport', '/tenant/lease', '/tenant/maintenance', '/tenant/move-in',
  '/agent/tasks', '/agent/clients', '/agent/calendar', '/agent/earnings',
])

function DemoDataNotice() {
  const path = usePathname() || ''
  const isDemo = DEMO_DATA_ROUTES.has(path) ||
    [...DEMO_DATA_ROUTES].some(r => r !== '/notifications' && path.startsWith(r + '/'))
  if (!isDemo) return null
  return (
    <div className="mb-5 rounded-xl border border-line-strong bg-surface-chip px-4 py-2.5 font-mono text-[11px] leading-relaxed text-body-3">
      示范数据 · 此页面当前展示的是产品演示内容,并非你的真实数据 · SAMPLE DATA — not your live records
    </div>
  )
}

export default function WorkspaceShell({ role, aside, children, hideAside }: Props) {
  return (
    <>
      <Header variant="solid" />
      <main className="bg-surface">
        {/* mobile: stacked (Rail becomes a fixed bottom tab bar); md+: Rail left
            · content · aside right */}
        <div className="md:flex md:min-h-[calc(100vh-66px)]">
          <Rail role={role} />
          <div className="min-w-0 flex-1 px-5 py-6 pb-24 sm:px-7 md:py-9 md:pb-9 lg:px-12">
            <DemoDataNotice />
            {children}
          </div>
          {!hideAside && (
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
                title={lang === 'en' ? it.label.en : it.label.zh}
                className={
                  'flex h-11 w-11 flex-none items-center justify-center rounded-xl text-[16px] text-white shadow-sm transition ' +
                  (on ? 'ring-2 ring-offset-2 ring-offset-surface-muted' : 'hover:opacity-90')
                }
                style={{ background: accent.bg, ['--tw-ring-color' as string]: accent.bg }}
              >
                {it.icon}
              </Link>
              <div className="my-1.5 hidden h-px w-7 bg-line-divider md:block" />
            </Fragment>
          )
        }
        return (
          <Link
            key={it.key}
            href={it.href}
            title={lang === 'en' ? it.label.en : it.label.zh}
            className={
              'flex h-11 w-11 flex-none items-center justify-center rounded-lg text-[16px] transition ' +
              (on
                ? 'bg-white text-brand shadow-sm'
                : 'text-body-3 hover:bg-white/60 hover:text-body')
            }
            style={on ? { color: accent.fg } : undefined}
          >
            {it.icon}
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
function ListIcon()  { return I('M3 6h18|M3 12h18|M3 18h18') }
function FileIcon()  { return I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8') }
function PassIcon()  { return I('M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M3 10h18|M9 16h.01') }
function LeaseIcon() { return I('M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v3|M14 14l3 3 6-6') }
function ToolIcon()  { return I('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z') }
function CashIcon()  { return I('M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6') }
function AuditIcon() { return I('M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z|M9 12l2 2 4-4') }

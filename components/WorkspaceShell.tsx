'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Header from './Header'
import { useI18n } from '@/lib/i18n'

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
  ],
  landlord: [
    { key: 'home',      href: '/landlord/agent',   icon: <HomeIcon />,    label: { zh: '主页', en: 'Home' } },
    { key: 'listings',  href: '/dashboard',        icon: <ListIcon />,    label: { zh: '房源', en: 'Listings' } },
    { key: 'apps',      href: '/landlord/applicants', icon: <FileIcon />, label: { zh: '申请', en: 'Apps' } },
    { key: 'lease',     href: '/landlord/leases',  icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } },
    { key: 'maint',     href: '/landlord/maintenance', icon: <ToolIcon />,label: { zh: '维修', en: 'Maint.' } },
    { key: 'fin',       href: '/landlord/finance', icon: <CashIcon />,    label: { zh: '财务', en: 'Finance' } },
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
  tenant:   { bg: '#7C3AED', fg: '#5B21B6' },
  landlord: { bg: '#047857', fg: '#065F46' },
  agent:    { bg: '#2563EB', fg: '#1E3A8A' },
}

interface Props {
  role: WorkspaceRole
  aside?: ReactNode
  children: ReactNode
  // hide aside (e.g. on small surfaces)
  hideAside?: boolean
}

export default function WorkspaceShell({ role, aside, children, hideAside }: Props) {
  return (
    <>
      <Header variant="solid" />
      <main className="bg-surface">
        <div className="grid min-h-[calc(100vh-56px)]" style={{
          gridTemplateColumns: hideAside ? '76px 1fr' : '76px 1fr 320px',
        }}>
          <Rail role={role} />
          <div className="overflow-y-auto px-7 py-9 lg:px-12">
            {children}
          </div>
          {!hideAside && (
            <aside className="hidden overflow-y-auto border-l border-line-divider bg-white p-6 lg:block">
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
  return (
    <nav
      className="flex flex-col items-center gap-1.5 border-r border-line-divider bg-surface-muted py-4"
    >
      <div
        className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg text-[15px] font-extrabold text-white"
        style={{ background: accent.bg }}
      >
        S
      </div>
      {items.map((it) => {
        const on = path === it.href || path.startsWith(it.href + '/')
        return (
          <Link
            key={it.key}
            href={it.href}
            title={lang === 'en' ? it.label.en : it.label.zh}
            className={
              'flex h-11 w-11 items-center justify-center rounded-lg text-[16px] transition ' +
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
      <div className="mt-auto" />
      <div
        className="h-8 w-8 rounded-full"
        style={{
          background:
            role === 'tenant'
              ? 'linear-gradient(135deg,#C4B5FD,#7C3AED)'
              : role === 'agent'
                ? 'linear-gradient(135deg,#93C5FD,#2563EB)'
                : 'linear-gradient(135deg,#6EE7B7,#047857)',
        }}
      />
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

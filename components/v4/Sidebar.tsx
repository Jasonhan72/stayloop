'use client'
// -----------------------------------------------------------------------------
// V4 Sidebar — 220px role-based primary nav
// -----------------------------------------------------------------------------
// Spec: .v4-source/primitives.jsx Sidebar()
//
// Logo + "Stayloop" + role-portal eyebrow → Workspace eyebrow → role-scoped
// nav items (icon + label + optional count tag) → flex spacer → AICopilotCard.
//
// Active link is detected via usePathname against each item's href. The
// landing route can be a prefix (e.g. /listings/* all activates the listings
// link) — we mark items as active when pathname startsWith() href, but with
// "/" treated as exact-only.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import type { UserRole, UserSession } from '@/lib/useUser'
import AICopilotCard from './AICopilotCard'

interface NavItem {
  id: string
  label_en: string
  label_zh: string
  href: string
  icon: string
  count?: number
  tone?: 'default' | 'gold' | 'ai'
}

const NAV: Record<UserRole, NavItem[]> = {
  tenant: [
    { id: 'dashboard',    label_en: 'Dashboard',    label_zh: '仪表盘',     href: '/tenant/dashboard',     icon: '◇' },
    { id: 'passport',     label_en: 'Passport',     label_zh: 'Passport',   href: '/passport',             icon: '◈', tone: 'ai' },
    { id: 'listings',     label_en: 'Listings',     label_zh: '房源',       href: '/tenant/listings',      icon: '⌂' },
    { id: 'applications', label_en: 'Applications', label_zh: '申请',       href: '/tenant/applications',  icon: '▤', tone: 'gold' },
    { id: 'leases',       label_en: 'Leases',       label_zh: '租约',       href: '/tenant/leases',        icon: '⎙' },
    { id: 'messages',     label_en: 'Messages',     label_zh: '消息',       href: '/chat',                 icon: '✉' },
    { id: 'settings',     label_en: 'Settings',     label_zh: '设置',       href: '/profile',              icon: '⚙' },
  ],
  landlord: [
    { id: 'dashboard',    label_en: 'Dashboard',    label_zh: '仪表盘',     href: '/dashboard',            icon: '◇' },
    { id: 'listings',     label_en: 'Listings',     label_zh: '房源',       href: '/listings/new',         icon: '⌂' },
    { id: 'applications', label_en: 'Applications', label_zh: '申请',       href: '/dashboard/pipeline',   icon: '▤', tone: 'gold' },
    { id: 'screening',    label_en: 'Screening',    label_zh: '筛查',       href: '/screen',               icon: '◉', tone: 'ai' },
    { id: 'leases',       label_en: 'Leases',       label_zh: '租约',       href: '/landlord/leases',      icon: '⎙' },
    { id: 'tenants',      label_en: 'Tenants',      label_zh: '租客',       href: '/dashboard/portfolio',  icon: '◈' },
    { id: 'messages',     label_en: 'Messages',     label_zh: '消息',       href: '/chat',                 icon: '✉' },
    { id: 'billing',      label_en: 'Billing',      label_zh: '账单',       href: '/billing',              icon: '$' },
    { id: 'settings',     label_en: 'Settings',     label_zh: '设置',       href: '/profile',              icon: '⚙' },
  ],
  agent: [
    { id: 'dashboard',  label_en: 'Dashboard',  label_zh: '仪表盘',   href: '/agent/dashboard',           icon: '◇' },
    { id: 'clients',    label_en: 'Clients',    label_zh: '客户',     href: '/agent/clients',             icon: '◈' },
    { id: 'packages',   label_en: 'Packages',   label_zh: '报告包',   href: '/agent/screening-packages',  icon: '◉', tone: 'gold' },
    { id: 'listings',   label_en: 'Listings',   label_zh: '房源',     href: '/agent/mls',                 icon: '⌂' },
    { id: 'leases',     label_en: 'Leases',     label_zh: '租约',     href: '/agent/leases',              icon: '⎙' },
    { id: 'messages',   label_en: 'Messages',   label_zh: '消息',     href: '/chat',                      icon: '✉' },
    { id: 'billing',    label_en: 'Billing',    label_zh: '账单',     href: '/billing',                   icon: '$' },
    { id: 'settings',   label_en: 'Settings',   label_zh: '设置',     href: '/profile',                   icon: '⚙' },
  ],
}

const ROLE_LABEL: Record<UserRole, { en: string; zh: string; color: string }> = {
  tenant:   { en: 'Tenant Portal',   zh: '租客门户',     color: v3.trust },
  landlord: { en: 'Landlord Portal', zh: '房东门户',     color: v3.brand },
  agent:    { en: 'Agent Portal',    zh: '经纪门户',     color: v3.brandBright },
}

interface Props {
  user: UserSession | null
  role?: UserRole
}

export default function Sidebar({ user, role }: Props) {
  const pathname = usePathname()
  const { lang } = useT()
  const isZh = lang === 'zh'

  const effectiveRole: UserRole = role || user?.role || 'tenant'
  const nav = NAV[effectiveRole] || NAV.tenant
  const portalLabel = ROLE_LABEL[effectiveRole]

  function isActive(href: string): boolean {
    if (!pathname) return false
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      style={{
        width: 220,
        background: '#FFFFFF',
        borderRight: `1px solid ${v3.border}`,
        padding: '18px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Brand block */}
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 8px 14px',
          textDecoration: 'none',
          color: v3.textPrimary,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: v3.brand,
            color: v3.surface,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.04em',
            flexShrink: 0,
          }}
        >
          S
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>
            Stayloop
          </div>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              color: portalLabel.color,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              marginTop: 3,
              fontWeight: 700,
            }}
          >
            {isZh ? portalLabel.zh : portalLabel.en}
          </div>
        </div>
      </Link>

      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: v3.textMuted,
          fontWeight: 700,
          padding: '6px 8px',
        }}
      >
        {isZh ? '工作区' : 'Workspace'}
      </div>

      {nav.map((l) => {
        const active = isActive(l.href)
        const tone = l.tone || 'default'
        const tagFg =
          tone === 'gold'
            ? v3.brand
            : tone === 'ai'
              ? v3.trust
              : v3.textSecondary
        const tagBg =
          tone === 'gold'
            ? '#DCFCE7'
            : tone === 'ai'
              ? '#F3E8FF'
              : v3.surfaceMuted
        const tagBd =
          tone === 'gold'
            ? 'rgba(16,185,129,0.32)'
            : tone === 'ai'
              ? '#D7C5FA'
              : v3.border
        return (
          <Link
            key={l.id}
            href={l.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 6,
              background: active ? v3.surfaceMuted : 'transparent',
              color: active ? v3.textPrimary : v3.textSecondary,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              borderLeft: active ? `2px solid ${v3.brand}` : '2px solid transparent',
              textDecoration: 'none',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 16,
                color: active ? v3.brand : v3.textFaint,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              {l.icon}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isZh ? l.label_zh : l.label_en}
            </span>
            {l.count != null && l.count > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  fontSize: 10.5,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: `1px solid ${tagBd}`,
                  color: tagFg,
                  background: tagBg,
                  letterSpacing: '-0.005em',
                }}
              >
                {l.count}
              </span>
            )}
          </Link>
        )
      })}

      <div style={{ flex: 1 }} />
      <AICopilotCard user={user} />
    </aside>
  )
}

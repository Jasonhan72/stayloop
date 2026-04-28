'use client'
// -----------------------------------------------------------------------------
// UserAvatar — just the avatar + dropdown, no nav chrome
// -----------------------------------------------------------------------------
// Used inside MarketingNav. The full UserNav renders its own <nav> wrapper
// with logo + language toggle, which would double up if dropped into
// MarketingNav's right column. This is the slim version.
// -----------------------------------------------------------------------------

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import type { UserSession } from '@/lib/useUser'

interface Props {
  user: UserSession
  signOut: () => Promise<void>
}

export default function UserAvatar({ user, signOut }: Props) {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const initials = (() => {
    if (user.fullName?.trim()) {
      const p = user.fullName.trim().split(/\s+/)
      return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase()
    }
    return (user.email || '?').charAt(0).toUpperCase()
  })()

  // Build menu items based on role.
  const items: Array<{ href: string; label_en: string; label_zh: string; icon: string }> =
    user.role === 'tenant'
      ? [
          { href: '/passport', label_en: 'My Passport', label_zh: '我的 Passport', icon: '🪪' },
          { href: '/score', label_en: 'My score', label_zh: '我的评分', icon: '◷' },
          { href: '/history', label_en: 'Rental history', label_zh: '租房记录', icon: '⌂' },
          { href: '/disputes', label_en: 'Disputes', label_zh: '纠纷', icon: '⚖' },
          { href: '/profile', label_en: 'Account', label_zh: '账户设置', icon: '⚙' },
        ]
      : user.role === 'agent'
        ? [
            { href: '/agent/day', label_en: 'Day brief', label_zh: '今日任务', icon: '☉' },
            { href: '/dashboard/pipeline', label_en: 'Pipeline', label_zh: 'Pipeline', icon: '≣' },
            { href: '/dashboard/find-agent', label_en: 'Find an agent', label_zh: '找经纪', icon: '◈' },
            { href: '/profile', label_en: 'Account', label_zh: '账户设置', icon: '⚙' },
          ]
        : [
            // landlord (default)
            { href: '/dashboard', label_en: 'Dashboard', label_zh: '仪表盘', icon: '⌂' },
            { href: '/dashboard/pipeline', label_en: 'Pipeline', label_zh: 'Pipeline', icon: '≣' },
            { href: '/dashboard/portfolio', label_en: 'Portfolio', label_zh: '资产组合', icon: '◫' },
            { href: '/screen', label_en: 'Screen a tenant', label_zh: '筛查租客', icon: '◉' },
            { href: '/listings/new', label_en: 'New listing', label_zh: '新建房源', icon: '+' },
            { href: '/profile', label_en: 'Account', label_zh: '账户设置', icon: '⚙' },
          ]

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={user.email}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${v3.brand}, ${v3.brandStrong})`,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          border: 'none',
          cursor: 'pointer',
          boxShadow: open ? `0 0 0 3px ${v3.brandSoft}` : 'none',
          transition: 'box-shadow .15s',
        }}
      >
        {initials}
      </button>

      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          background: v3.surface,
          border: `1px solid ${v3.border}`,
          borderRadius: 14,
          minWidth: 240,
          boxShadow: '0 16px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transform: open ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity .15s, transform .15s',
          zIndex: 100,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${v3.divider}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
            {user.fullName || user.email.split('@')[0]}
          </div>
          <div style={{ fontSize: 11.5, color: v3.textMuted, marginTop: 2 }}>{user.email}</div>
          <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {isZh
              ? user.role === 'tenant' ? '租客' : user.role === 'agent' ? '经纪' : '房东'
              : user.role}
          </div>
        </div>

        {/* Menu items */}
        <div style={{ padding: '6px 0' }}>
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                fontSize: 13.5,
                color: v3.textPrimary,
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = v3.surfaceMuted)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 14, width: 18, color: v3.textMuted, textAlign: 'center' }}>
                {it.icon}
              </span>
              {isZh ? it.label_zh : it.label_en}
            </Link>
          ))}
        </div>

        {/* Sign out */}
        <div style={{ borderTop: `1px solid ${v3.divider}`, padding: '6px 0' }}>
          <button
            onClick={async () => {
              setOpen(false)
              await signOut()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '10px 16px',
              fontSize: 13.5,
              color: v3.danger,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = v3.dangerSoft)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>↩</span>
            {isZh ? '退出登录' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}

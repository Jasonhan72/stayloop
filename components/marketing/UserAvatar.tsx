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

  // Resolve the avatar glyph. When the user object is present but both
  // fullName and email are empty (transient load state, or OAuth without
  // email exposure), fall back to a hamburger icon (☰) instead of '?'.
  // The "?" reads as an error state; the hamburger reads as "menu" —
  // which is exactly what the avatar dropdown opens.
  const initials = (() => {
    if (user.fullName?.trim()) {
      const p = user.fullName.trim().split(/\s+/)
      const i = ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase()
      if (i) return i
    }
    if (user.email && user.email.charAt(0)) {
      return user.email.charAt(0).toUpperCase()
    }
    return '☰'
  })()

  // -----------------------------------------------------------------------
  // Avatar dropdown structure (2026-05-08 update):
  //   1. "控制面板 / Workspace"  — role-aware deep-link to the workspace
  //      landing page (workspace = the page with the left Sidebar). When
  //      a logged-in user is on a public marketing page, this is the
  //      shortest path back to their actual app surface.
  //   2. role-specific shortcuts (Passport / Day brief)
  //   3. account-operational items (Notifications, Billing, Activity, Account)
  //
  // The workflow items themselves live in the left Sidebar — we don't
  // duplicate Pipeline / Properties / etc. here.
  // -----------------------------------------------------------------------
  const workspaceHref =
    user.role === 'tenant' ? '/tenant/dashboard'
    : user.role === 'agent' ? '/agent/dashboard'
    : '/landlord/dashboard'

  const items: Array<{ href: string; label_en: string; label_zh: string; icon: string }> =
    user.role === 'tenant'
      ? [
          { href: workspaceHref, label_en: 'Back to workspace', label_zh: '回工作台', icon: '◇' },
          { href: '/passport', label_en: 'My Passport', label_zh: '我的 Passport', icon: '🪪' },
          { href: '/disputes', label_en: 'Disputes', label_zh: '纠纷', icon: '⚖' },
          { href: '/notifications', label_en: 'Notifications', label_zh: '通知', icon: '🔔' },
          { href: '/audit', label_en: 'Activity log', label_zh: '操作日志', icon: '⊜' },
          { href: '/profile', label_en: 'Account', label_zh: '账户设置', icon: '⚙' },
        ]
      : user.role === 'agent'
        ? [
            { href: workspaceHref, label_en: 'Back to workspace', label_zh: '回工作台', icon: '◇' },
            { href: '/agent/day', label_en: 'Day brief', label_zh: '今日任务', icon: '☉' },
            { href: '/notifications', label_en: 'Notifications', label_zh: '通知', icon: '🔔' },
            { href: '/billing', label_en: 'Billing', label_zh: '账单', icon: '◐' },
            { href: '/audit', label_en: 'Activity log', label_zh: '操作日志', icon: '⊜' },
            { href: '/profile', label_en: 'Account', label_zh: '账户设置', icon: '⚙' },
          ]
        : [
            // landlord (default)
            { href: workspaceHref, label_en: 'Back to workspace', label_zh: '回工作台', icon: '◇' },
            { href: '/notifications', label_en: 'Notifications', label_zh: '通知', icon: '🔔' },
            { href: '/billing', label_en: 'Billing', label_zh: '账单', icon: '◐' },
            { href: '/audit', label_en: 'Activity log', label_zh: '操作日志', icon: '⊜' },
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
          // Initials get the brand-colored gradient (loud, identity-forward).
          // The hamburger fallback gets a muted treatment (subtle, neutral)
          // since it signals "no profile loaded" rather than a real identity.
          background: initials === '☰'
            ? v3.surfaceMuted
            : `linear-gradient(135deg, ${v3.brand}, ${v3.brandStrong})`,
          display: 'grid',
          placeItems: 'center',
          color: initials === '☰' ? v3.textPrimary : '#fff',
          fontWeight: initials === '☰' ? 800 : 700,
          fontSize: initials === '☰' ? 18 : 13,
          lineHeight: 1,
          border: initials === '☰' ? `1px solid ${v3.border}` : 'none',
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
          {items.map((it, i) => {
            // First item is the workspace deep-link (primary action) — give
            // it the brand color and a divider below so it doesn't blend
            // with the account-operational items underneath.
            const isPrimary = i === 0
            return (
              <div key={it.href}>
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    fontSize: 13.5,
                    color: isPrimary ? v3.brand : v3.textPrimary,
                    fontWeight: isPrimary ? 600 : 400,
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = v3.surfaceMuted)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{
                      fontSize: 14,
                      width: 18,
                      color: isPrimary ? v3.brand : v3.textMuted,
                      textAlign: 'center',
                    }}
                  >
                    {it.icon}
                  </span>
                  {isZh ? it.label_zh : it.label_en}
                </Link>
                {isPrimary && (
                  <div
                    style={{
                      height: 1,
                      background: v3.divider,
                      margin: '4px 0',
                    }}
                    aria-hidden
                  />
                )}
              </div>
            )
          })}
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

'use client'
// -----------------------------------------------------------------------------
// V4 AppBar — top of every authenticated page (56px)
// -----------------------------------------------------------------------------
// Spec: .v4-source/primitives.jsx AppBar()
//
// Layout: small logo + Stayloop wordmark + role badge + breadcrumb separator +
// current path → flex spacer → ⌘K command bar (visual-only for now) →
// notifications bell with badge → email + small avatar.
//
// The bell links to /notifications. The avatar is reused from the existing
// UserAvatar component which carries the dropdown (Profile, Billing,
// Notifications, Activity log, Sign out etc).
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT, LanguageToggle } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import type { UserRole, UserSession } from '@/lib/useUser'
import UserAvatar from '@/components/marketing/UserAvatar'

interface Props {
  user: UserSession | null
  loading: boolean
  signOut: () => Promise<void>
  /** Optional override; otherwise read from user.role. */
  role?: UserRole
  /** Optional explicit breadcrumb; otherwise derived from pathname. */
  path?: string
}

const ROLE_BADGE: Record<UserRole, { en: string; zh: string; color: string }> = {
  tenant:   { en: 'TENANT',   zh: '租客', color: v3.trust },
  landlord: { en: 'LANDLORD', zh: '房东', color: v3.brand },
  agent:    { en: 'AGENT',    zh: '经纪', color: v3.brandBright },
}

export default function AppBar({ user, loading, signOut, role, path }: Props) {
  const pathname = usePathname()
  const { lang } = useT()
  const isZh = lang === 'zh'

  const effectiveRole: UserRole | null = role || user?.role || null
  const badge = effectiveRole ? ROLE_BADGE[effectiveRole] : null
  const breadcrumb = path || pathname || '/'

  // Notifications count — synthesize from leases/applications same way the
  // /notifications page does. Simple count query: leases in tenant_review or
  // landlord_review where the user is one side, plus (for landlords) new
  // applications. Cheap enough to do on every page load.
  const [notifCount, setNotifCount] = useState<number>(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        let count = 0
        const { count: leasesCount } = await supabase
          .from('lease_agreements')
          .select('id', { count: 'exact', head: true })
          .in('status', ['tenant_review', 'landlord_review'])
          .or(`tenant_id.eq.${user.profileId},landlord_id.eq.${user.profileId}`)
        count += leasesCount || 0

        if (user.role === 'landlord') {
          const { count: appsCount } = await supabase
            .from('applications')
            .select('id', { count: 'exact', head: true })
            .eq('landlord_id', user.profileId)
            .eq('status', 'new')
          count += appsCount || 0
        }

        if (!cancelled) setNotifCount(count)
      } catch {
        // swallow — bell is decorative if backend is unreachable
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.profileId, user?.role])

  return (
    <header
      style={{
        height: 56,
        padding: '0 22px',
        borderBottom: `1px solid ${v3.border}`,
        background: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      <Link
        href="/"
        aria-label="Home"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          textDecoration: 'none',
          color: v3.textPrimary,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: v3.brand,
            color: v3.surface,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '-0.04em',
          }}
        >
          S
        </span>
        <span style={{ fontSize: 16, fontWeight: 600, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
          Stayloop
        </span>
      </Link>

      {badge && (
        <>
          <span aria-hidden style={{ width: 1, height: 16, background: v3.borderStrong }} />
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: badge.color,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}
          >
            {isZh ? badge.zh : badge.en}
          </span>
        </>
      )}

      <span aria-hidden style={{ color: v3.textFaint }}>›</span>
      <span
        style={{
          fontSize: 13,
          color: v3.textPrimary,
          fontWeight: 500,
          fontFamily: 'JetBrains Mono, monospace',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 280,
        }}
      >
        {breadcrumb}
      </span>

      <div style={{ flex: 1 }} />

      {/* ⌘K command bar — visual-only for now; clicking opens /chat */}
      <Link
        href="/chat"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: v3.surfaceMuted,
          border: `1px solid ${v3.border}`,
          borderRadius: 6,
          minWidth: 220,
          color: v3.textMuted,
          fontSize: 12,
          textDecoration: 'none',
        }}
      >
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: v3.textFaint }}>⌘K</span>
        <span>{isZh ? '搜索房源、申请、租约…' : 'Search listings, applicants, leases…'}</span>
      </Link>

      {/* Notifications bell */}
      <Link
        href="/notifications"
        aria-label={isZh ? '通知' : 'Notifications'}
        style={{
          position: 'relative',
          padding: 6,
          color: v3.textSecondary,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 18 }}>◉</span>
        {notifCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              borderRadius: 7,
              background: v3.danger,
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {notifCount}
          </span>
        )}
      </Link>

      <LanguageToggle />

      {loading ? (
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: v3.divider,
            display: 'inline-block',
            opacity: 0.5,
          }}
        />
      ) : user && !user.isAnonymous ? (
        <UserAvatar user={user} signOut={signOut} />
      ) : (
        <Link
          href="/login"
          style={{
            background: v3.brand,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 14px',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          {isZh ? '登录' : 'Sign in'}
        </Link>
      )}
    </header>
  )
}

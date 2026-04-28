'use client'
// -----------------------------------------------------------------------------
// AppHeader — unified in-app header used across every authenticated page
// -----------------------------------------------------------------------------
// Rationale: previously each in-app page (/disputes, /score, /agent/day, etc.)
// rolled its own <header> with logo + title and no avatar dropdown. Clicking
// from the avatar menu jumped to a page where the avatar disappeared, so the
// menu was inconsistent across the app. This component is now the single
// shared chrome for every page that lives behind login.
//
// Usage:
//   <AppHeader title="Dashboard" titleZh="仪表盘" right={<button>+ New</button>} />
//
// Props:
//   - title / titleZh: optional page title (skip for plain logo)
//   - right: optional ReactNode rendered before LanguageToggle + avatar
//   - back: optional href; if set, renders a back arrow to that route
// -----------------------------------------------------------------------------

import Link from 'next/link'
import type { ReactNode } from 'react'
import { v3 } from '@/lib/brand'
import { useT, LanguageToggle } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import UserAvatar from '@/components/marketing/UserAvatar'

interface Props {
  title?: string
  titleZh?: string
  right?: ReactNode
  back?: string
  /** Hide the title block but keep logo + chrome. */
  hideTitle?: boolean
}

export default function AppHeader({ title, titleZh, right, back, hideTitle }: Props) {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading, signOut } = useUser({ redirectIfMissing: false, allowAnonymous: false })
  const isAuthed = !!user && !user.isAnonymous

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: v3.surface,
        borderBottom: `1px solid ${v3.divider}`,
      }}
    >
      <div
        style={{
          maxWidth: 1260,
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* Left: logo (+ optional back arrow) + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
          {back && (
            <Link
              href={back}
              aria-label={isZh ? '返回' : 'Back'}
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                color: v3.textSecondary,
                textDecoration: 'none',
                fontSize: 18,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = v3.surfaceMuted)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ←
            </Link>
          )}

          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: v3.textPrimary,
              flexShrink: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: 26,
                height: 26,
                borderRadius: 7,
                background: v3.brand,
                color: '#fff',
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: '-0.02em',
              }}
            >
              S
            </span>
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-0.025em',
              }}
            >
              Stayloop
            </span>
          </Link>

          {!hideTitle && (title || titleZh) && (
            <>
              <span
                aria-hidden
                style={{
                  width: 1,
                  height: 18,
                  background: v3.border,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: v3.textPrimary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isZh ? titleZh || title : title || titleZh}
              </span>
            </>
          )}
        </div>

        {/* Right: page action slot + language + avatar
            ── While auth is resolving on a fresh page mount, render a same-size
            placeholder instead of the Sign-in button. Otherwise we'd flash
            "Sign in" for a frame before the session loads and the avatar
            swaps in — which the user noticed when clicking dropdown links. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {right}
          <LanguageToggle />
          {loading ? (
            <span
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: v3.divider,
                display: 'inline-block',
                opacity: 0.5,
              }}
            />
          ) : isAuthed && user ? (
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
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {isZh ? '登录' : 'Sign in'}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

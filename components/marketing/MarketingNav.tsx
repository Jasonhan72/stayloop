'use client'
// -----------------------------------------------------------------------------
// V3 marketing nav — used by /, /tenants, /landlords, /agents, /trust-api
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT, LanguageToggle } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import AuthModal from '@/components/AuthModal'
import UserAvatar from '@/components/marketing/UserAvatar'

const NAV_ITEMS: Array<{ href: string; zh: string; en: string }> = [
  { href: '/tenants', zh: '租客', en: 'Tenants' },
  { href: '/landlords', zh: '房东', en: 'Landlords' },
  { href: '/agents', zh: '经纪', en: 'Agents' },
  { href: '/trust-api', zh: 'Trust API', en: 'Trust API' },
  { href: '/about', zh: '关于', en: 'About' },
]

export default function MarketingNav() {
  const { lang } = useT()
  const [authOpen, setAuthOpen] = useState(false)
  const { user, loading, signOut } = useUser({ redirectIfMissing: false, allowAnonymous: false })
  const isAuthed = !!user && !user.isAnonymous

  return (
    <>
      <nav
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
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          <Link
            href="/"
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
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em' }}>
              Stayloop
            </span>
          </Link>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              fontSize: 14,
              color: v3.textSecondary,
            }}
            className="mk-nav-links"
          >
            {NAV_ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  color: v3.textSecondary,
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                {lang === 'zh' ? it.zh : it.en}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LanguageToggle />
            {/* While auth is resolving, render a same-size placeholder so we
                don't flash the Sign-in button before the avatar appears. */}
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
              <button
                onClick={() => setAuthOpen(true)}
                style={{
                  background: v3.brand,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {lang === 'zh' ? '登录' : 'Sign in'}
              </button>
            )}
          </div>
        </div>
      </nav>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      <style jsx>{`
        @media (max-width: 760px) {
          :global(.mk-nav-links) {
            display: none !important;
          }
        }
      `}</style>
    </>
  )
}

'use client'
// -----------------------------------------------------------------------------
// V4 marketing nav (PubNav) — used on /, /tenants, /landlords, /agents,
// /trust-api, /pricing, /about
// -----------------------------------------------------------------------------
// Spec: .v4-source/pages-public.jsx PubNav()
//
// Layout (64px tall, white bg, 1px divider):
//   FPLogo · Stayloop wordmark   Product · Pricing · For Tenants ·
//                                For Landlords · For Agents · Docs
//                                                   Sign in · Get started
//
// Active link gets a 2px emerald underline + bold weight. The "Get started"
// CTA uses the mint gradient primary button.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT, LanguageToggle } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import AuthModal from '@/components/AuthModal'
import UserAvatar from '@/components/marketing/UserAvatar'

interface NavItem {
  id: string
  href: string
  zh: string
  en: string
}

// Order + labels match V4 PubNav prototype exactly.
const NAV_ITEMS: NavItem[] = [
  { id: 'product',       href: '/',                 zh: '产品',     en: 'Product' },
  { id: 'pricing',       href: '/pricing',          zh: '价格',     en: 'Pricing' },
  { id: 'for-tenants',   href: '/tenants',          zh: '租客',     en: 'For Tenants' },
  { id: 'for-landlords', href: '/landlords',        zh: '房东',     en: 'For Landlords' },
  { id: 'for-agents',    href: '/agents',           zh: '经纪',     en: 'For Agents' },
  { id: 'docs',          href: '/trust-api/docs',   zh: '文档',     en: 'Docs' },
]

function isItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function MarketingNav() {
  const { lang } = useT()
  const pathname = usePathname()
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
          background: '#FFFFFF',
          borderBottom: `1px solid ${v3.border}`,
          height: 64,
        }}
      >
        <div
          style={{
            height: '100%',
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              textDecoration: 'none',
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.025em',
            }}
          >
            <span style={{ color: v3.textPrimary }}>stay</span>
            <span
              style={{
                background:
                  'linear-gradient(90deg, #4F46E5 0%, #7C3AED 50%, #A855F7 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              loop
            </span>
          </Link>

          <div
            className="mk-nav-links"
            style={{
              display: 'flex',
              gap: 18,
              marginLeft: 18,
              alignItems: 'stretch',
              height: '100%',
            }}
          >
            {NAV_ITEMS.map((it) => {
              const active = isItemActive(pathname, it.href)
              return (
                <Link
                  key={it.id}
                  href={it.href}
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? v3.textPrimary : v3.textSecondary,
                    textDecoration: 'none',
                    borderBottom: active
                      ? `2px solid ${v3.brand}`
                      : '2px solid transparent',
                    paddingTop: 22,
                    paddingBottom: 21,
                    transition: 'color 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = v3.textPrimary
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = v3.textSecondary
                  }}
                >
                  {lang === 'zh' ? it.zh : it.en}
                </Link>
              )
            })}
          </div>

          <div style={{ flex: 1 }} />

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
            <>
              <button
                onClick={() => setAuthOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: v3.textSecondary,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: '6px 4px',
                }}
              >
                {lang === 'zh' ? '登录' : 'Sign in'}
              </button>
              <button
                onClick={() => setAuthOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  background:
                    'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontFamily: 'Inter Tight, system-ui, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow:
                    '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                {lang === 'zh' ? '开始使用' : 'Get started'}
              </button>
            </>
          )}
        </div>
      </nav>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      <style jsx>{`
        @media (max-width: 860px) {
          :global(.mk-nav-links) {
            display: none !important;
          }
        }
      `}</style>
    </>
  )
}

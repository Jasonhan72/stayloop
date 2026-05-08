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
import { useState, useEffect } from 'react'
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

// Tenant Screening lives as a dedicated section on the homepage hero
// rather than as a nav entry — keeps the top bar uncluttered and makes
// the screening CTA the FIRST thing visitors land on.
// Pricing was removed from the top bar (2026-05-08): kept the nav focused
// on audience-first browsing (listings + role landing pages + docs). The
// /pricing page is still reachable from homepage CTAs and footer.
const NAV_ITEMS: NavItem[] = [
  { id: 'listings',      href: '/listings',         zh: '房源',         en: 'Listings' },
  { id: 'for-tenants',   href: '/tenants',          zh: '租客',         en: 'For Tenants' },
  { id: 'for-landlords', href: '/landlords',        zh: '房东',         en: 'For Landlords' },
  { id: 'for-agents',    href: '/agents',           zh: '经纪',         en: 'For Agents' },
  { id: 'docs',          href: '/trust-api/docs',   zh: '文档',         en: 'Docs' },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user, loading, signOut } = useUser({ redirectIfMissing: false, allowAnonymous: false })
  const isAuthed = !!user && !user.isAnonymous

  // Close the mobile menu whenever the route changes — without this it
  // would stay open across page transitions and obscure the new page.
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

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
          {/* Hamburger — visible only on mobile (≤860px). Click toggles
              the slide-out drawer. 44×44px tap target meets WCAG. */}
          <button
            type="button"
            aria-label={lang === 'zh' ? '打开菜单' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="mk-hamburger"
            onClick={() => setMobileMenuOpen((o) => !o)}
            style={{
              display: 'none', // overridden by media query below
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              marginLeft: -10,
              padding: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: v3.textPrimary,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path
                d={mobileMenuOpen
                  ? 'M5 5 L17 17 M17 5 L5 17' // X icon when open
                  : 'M3 6 H19 M3 11 H19 M3 16 H19' // hamburger when closed
                }
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

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
              {/* "Get started" button removed in V4.1 nav cleanup — the
                  homepage hero already carries the primary CTA, and stacking
                  a duplicate "Get started" beside "Sign in" reads cluttered. */}
            </>
          )}
        </div>
      </nav>

      {/* Mobile drawer + backdrop. Slides in from the left on screens
          ≤860px when the hamburger is tapped. */}
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label={lang === 'zh' ? '关闭菜单' : 'Close menu'}
          onClick={() => setMobileMenuOpen(false)}
          className="mk-mobile-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 55,
            background: 'rgba(15,23,42,0.32)',
            backdropFilter: 'blur(2px)',
            border: 0,
            cursor: 'pointer',
            padding: 0,
          }}
        />
      )}
      <aside
        className="mk-mobile-drawer"
        aria-hidden={!mobileMenuOpen}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'min(280px, 80vw)',
          background: '#FFFFFF',
          borderRight: `1px solid ${v3.border}`,
          zIndex: 60,
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(.2,.8,.2,1)',
          boxShadow: mobileMenuOpen ? '0 24px 80px rgba(32,24,12,0.18)' : 'none',
          display: 'none', // shown only at <=860px via CSS below
          flexDirection: 'column',
          padding: '20px 18px',
          gap: 4,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span
            style={{
              fontFamily: 'Inter Tight, system-ui, sans-serif',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.025em',
            }}
          >
            <span style={{ color: v3.textPrimary }}>stay</span>
            <span style={{ color: '#7C3AED' }}>loop</span>
          </span>
          <button
            type="button"
            aria-label={lang === 'zh' ? '关闭菜单' : 'Close menu'}
            onClick={() => setMobileMenuOpen(false)}
            style={{
              width: 36,
              height: 36,
              padding: 0,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: v3.textSecondary,
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {NAV_ITEMS.map((it) => {
          const active = isItemActive(pathname, it.href)
          return (
            <Link
              key={it.id}
              href={it.href}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: '13px 12px',
                fontSize: 15,
                fontWeight: active ? 600 : 500,
                color: active ? v3.brand : v3.textPrimary,
                textDecoration: 'none',
                borderRadius: 8,
                background: active ? v3.surfaceMuted : 'transparent',
              }}
            >
              {lang === 'zh' ? it.zh : it.en}
            </Link>
          )
        })}
      </aside>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      <style jsx>{`
        @media (max-width: 860px) {
          :global(.mk-nav-links) {
            display: none !important;
          }
          :global(.mk-hamburger) {
            display: inline-flex !important;
          }
          :global(.mk-mobile-drawer) {
            display: flex !important;
          }
        }
      `}</style>
    </>
  )
}

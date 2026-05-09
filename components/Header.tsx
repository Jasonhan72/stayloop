'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import Logo from './Logo'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'

interface HeaderProps {
  // `transparent` = hero variant (homepage) — sits over a colored hero
  // `solid` = sticky white nav (every other page)
  variant?: 'transparent' | 'solid'
}

interface NavItem {
  key: string
  href: string
  // "Screening" always renders with a green pulse dot (always-on indicator,
  // NOT an active-route marker)
  alwaysLive?: boolean
}

const NAV: NavItem[] = [
  { key: 'nav.listings', href: '/listings' },
  { key: 'nav.tenant', href: '/tenant' },
  { key: 'nav.landlord', href: '/landlord' },
  { key: 'nav.agent', href: '/agent' },
  { key: 'nav.screening', href: '/screening', alwaysLive: true },
  { key: 'nav.trustApi', href: '/trust-api' },
]

/**
 * Stayloop V5 — single global header reused on every page.
 *
 * Spec:
 *   .hero-nav (used on homepage, transparent over hero gradient)
 *   .gnav     (used on every other page, solid surface-nav background)
 * Both have the SAME logo + SAME 6-item menu + SAME right-side CTAs.
 *
 * IMPORTANT: each menu item reserves space for its bold (active) state via
 * an invisible ::after pseudo, so switching pages does NOT jiggle layout.
 */
export default function Header({ variant = 'solid' }: HeaderProps) {
  const pathname = usePathname() || '/'
  const { lang, toggle } = useI18n()
  const auth = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [profileOpen])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <header
      className={
        'sticky top-0 z-40 w-full ' +
        (variant === 'transparent'
          ? 'bg-transparent'
          : 'border-b border-line-divider bg-surface-nav/95 backdrop-blur')
      }
    >
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center px-6 sm:px-8 lg:px-12">
        {/* Logo */}
        <Logo size="md" />

        {/* Nav links — desktop */}
        <nav className="ml-12 hidden items-center gap-[26px] lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.key}
              i18nKey={item.key}
              href={item.href}
              alwaysLive={item.alwaysLive}
              active={isActive(item.href)}
              currentLang={lang}
            />
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={toggle}
            className="hidden items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1 font-mono text-[10.5px] text-body-2 transition hover:border-line-strong sm:inline-flex"
            aria-label="Switch language"
          >
            <span className={lang === 'zh' ? 'font-bold text-body' : ''}>ZH</span>
            <span className="text-body-4">/</span>
            <span className={lang === 'en' ? 'font-bold text-body' : ''}>EN</span>
          </button>

          {auth.loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-line-divider/60" />
          ) : auth.user ? (
            <>
              <button
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-body-2 transition hover:bg-line-divider/60"
              >
                <BellIcon />
                <span
                  aria-hidden
                  className="absolute right-[3px] top-[3px] flex h-[14px] min-w-[14px] items-center justify-center rounded-full border-[1.5px] border-surface-nav bg-danger px-[3px] text-[9px] font-bold text-white"
                >
                  3
                </span>
              </button>
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 text-[13px] font-bold text-white transition"
                  style={{
                    borderColor:
                      auth.role === 'tenant' ? '#7C3AED' :
                      auth.role === 'agent' ? '#2563EB' :
                      '#047857',
                    background:
                      auth.role === 'tenant'
                        ? 'linear-gradient(135deg,#C4B5FD,#7C3AED)'
                        : auth.role === 'agent'
                          ? 'linear-gradient(135deg,#93C5FD,#2563EB)'
                          : 'linear-gradient(135deg,#6EE7B7,#047857)',
                  }}
                >
                  {(auth.fullName || auth.email || 'U').slice(0, 1).toUpperCase()}
                </button>
                {profileOpen && (
                  <div className="sl-card absolute right-0 mt-2 w-64 overflow-hidden p-1" role="menu">
                    <div className="border-b border-line-divider px-3 py-3">
                      <div className="text-[13px] font-bold text-body">
                        {auth.fullName || auth.email}
                      </div>
                      {auth.role && <div className="mt-1 sl-eyebrow">{auth.role}</div>}
                    </div>
                    <Link
                      href={
                        auth.role === 'landlord'
                          ? '/dashboard'
                          : auth.role === 'agent'
                            ? '/agent/agent'
                            : '/tenant/agent'
                      }
                      className="block rounded-md px-3 py-2 text-[13px] text-body hover:bg-surface-chip"
                      onClick={() => setProfileOpen(false)}
                    >
                      工作台
                    </Link>
                    <Link
                      href="/settings"
                      className="block rounded-md px-3 py-2 text-[13px] text-body hover:bg-surface-chip"
                      onClick={() => setProfileOpen(false)}
                    >
                      设置
                    </Link>
                    <button
                      onClick={async () => {
                        setProfileOpen(false)
                        await auth.signOut()
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-[13px] text-danger hover:bg-danger/5"
                    >
                      退出
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-[10px] border border-line-strong bg-white px-4 py-[9px] text-[13.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                登录
              </Link>
              <Link
                href="/onboarding/tier1"
                className="inline-flex items-center justify-center rounded-[10px] px-4 py-[9px] text-[13.5px] font-semibold text-white shadow-cta-mint"
                style={{ background: 'linear-gradient(135deg,#6EE7B7,#34D399)' }}
              >
                注册
              </Link>
            </>
          )}

          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-body-2 transition hover:bg-line-divider/60 lg:hidden"
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-line-divider bg-surface-nav lg:hidden">
          <nav className="mx-auto flex max-w-[1320px] flex-col gap-1 px-6 py-3">
            {NAV.map((item) => (
              <NavLink
                key={item.key}
                i18nKey={item.key}
                href={item.href}
                alwaysLive={item.alwaysLive}
                active={isActive(item.href)}
                currentLang={lang}
                mobile
                onClick={() => setMenuOpen(false)}
              />
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}

/**
 * Each link reserves space for the bold-weight version via an invisible
 * ::after that mirrors the label at font-weight 600. This means switching
 * between active/inactive on page navigation never reflows neighbouring
 * items — fixes the "menu jumps when you click around" bug.
 */
function NavLink({
  i18nKey,
  href,
  alwaysLive,
  active,
  currentLang,
  mobile,
  onClick,
}: {
  i18nKey: string
  href: string
  alwaysLive?: boolean
  active: boolean
  currentLang: 'zh' | 'en'
  mobile?: boolean
  onClick?: () => void
}) {
  const { t } = useI18n()
  const label = t(i18nKey)
  const greenWhenLive = alwaysLive
  const isBold = active || alwaysLive
  const color = alwaysLive ? '#047857' : active ? '#171717' : '#3F3F46'

  return (
    <Link
      href={href}
      onClick={onClick}
      className={
        mobile
          ? 'rounded-md px-3 py-2 text-[14px] transition hover:bg-line-divider/40'
          : 'group relative inline-flex items-center text-[14px] transition'
      }
      style={{
        color,
        fontWeight: isBold ? 600 : 400,
      }}
    >
      {greenWhenLive && (
        <span
          aria-hidden
          className="mr-[5px] inline-block h-[6px] w-[6px] rounded-full"
          style={{
            background: '#047857',
            boxShadow: '0 0 6px #047857',
          }}
        />
      )}
      <ReservedText text={label} bold={isBold} />
    </Link>
  )
}

/**
 * Renders text whose width is always sized to the bold version, even when
 * the current font-weight is normal. This prevents layout shift when the
 * active state of a nav item flips between pages.
 */
function ReservedText({ text, bold }: { text: string; bold: boolean }) {
  return (
    <span
      aria-label={text}
      style={{ display: 'inline-grid', gridTemplateRows: '1fr', alignItems: 'center' }}
    >
      {/* width reserver — always bold but invisible */}
      <span
        aria-hidden
        style={{
          gridRow: 1,
          gridColumn: 1,
          fontWeight: 600,
          visibility: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
      {/* visible text */}
      <span
        style={{
          gridRow: 1,
          gridColumn: 1,
          fontWeight: bold ? 600 : 400,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </span>
  )
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

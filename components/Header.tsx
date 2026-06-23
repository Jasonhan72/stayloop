'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import Logo from './Logo'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'

interface HeaderProps {
  variant?: 'transparent' | 'solid'
}

const PRODUCT_ITEMS = [
  { key: 'nav.tenants', href: '/tenant', color: '#7C3AED' },
  { key: 'nav.landlords', href: '/landlord', color: '#047857' },
  { key: 'nav.agents', href: '/agent', color: '#2563EB' },
]

export default function Header({ variant = 'solid' }: HeaderProps) {
  const pathname = usePathname() || '/'
  const { lang, t, toggle } = useI18n()
  const auth = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const productRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!profileOpen && !productOpen) return
    const handler = (e: MouseEvent) => {
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (productOpen && productRef.current && !productRef.current.contains(e.target as Node)) {
        setProductOpen(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setProfileOpen(false); setProductOpen(false) }
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [profileOpen, productOpen])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isProductActive = PRODUCT_ITEMS.some((p) => isActive(p.href))

  return (
    <header
      className={
        'sticky top-0 z-40 w-full transition-colors duration-200 ' +
        (variant === 'transparent' && !scrolled
          ? 'bg-transparent'
          : 'border-b border-line-divider bg-surface-nav/95 backdrop-blur')
      }
    >
      <div className="mx-auto flex h-[66px] max-w-[1240px] items-center justify-between px-6 sm:px-8 lg:px-12">
        <Logo size="md" />

        {/* Desktop nav */}
        <nav className="hidden items-center gap-[26px] lg:flex">
          {/* Product dropdown */}
          <div className="relative" ref={productRef}>
            <button
              onClick={() => setProductOpen((v) => !v)}
              className="group inline-flex items-center gap-1 text-[14px] transition"
              style={{
                color: isProductActive ? '#171717' : '#3F3F46',
                fontWeight: isProductActive ? 600 : 400,
              }}
            >
              <ReservedText text={t('nav.product')} bold={isProductActive} />
              <ChevronIcon open={productOpen} />
            </button>
            {productOpen && (
              <div className="sl-card absolute left-1/2 mt-3 w-52 -translate-x-1/2 overflow-hidden p-1">
                {PRODUCT_ITEMS.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setProductOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] text-body transition hover:bg-surface-chip"
                  >
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ background: item.color }}
                    />
                    {t(item.key)}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Listings */}
          <NavLink
            i18nKey="nav.listings"
            href="/listings"
            active={isActive('/listings')}
          />

          {/* Pricing */}
          <NavLink
            i18nKey="nav.pricing"
            href="/pricing"
            active={isActive('/pricing')}
          />

          {/* Screening — green pulse */}
          <NavLink
            i18nKey="nav.screening"
            href="/screening"
            active={isActive('/screening')}
            alwaysLive
          />
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
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
              <Link
                href="/notifications"
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-body-2 transition hover:bg-line-divider/60"
              >
                <BellIcon />
              </Link>
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
                          ? '/landlord/agent'
                          : auth.role === 'agent'
                            ? '/agent/agent'
                            : '/tenant/agent'
                      }
                      className="block rounded-md px-3 py-2 text-[13px] text-body hover:bg-surface-chip"
                      role="menuitem"
                      onClick={() => setProfileOpen(false)}
                    >
                      {t('nav.dashboard')}
                    </Link>
                    <Link
                      href="/settings"
                      className="block rounded-md px-3 py-2 text-[13px] text-body hover:bg-surface-chip"
                      role="menuitem"
                      onClick={() => setProfileOpen(false)}
                    >
                      {t('nav.settings', '设置')}
                    </Link>
                    <button
                      onClick={async () => {
                        setProfileOpen(false)
                        await auth.signOut()
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-[13px] text-danger hover:bg-danger/5"
                      role="menuitem"
                    >
                      {t('nav.signOut')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-[10px] border border-line bg-white px-[18px] py-[10px] text-[14px] font-semibold text-body transition hover:border-line-strong"
              >
                {t('nav.login')}
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ink px-[18px] py-[10px] text-[14px] font-semibold text-white transition"
              >
                {t('nav.register')} →
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

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-line-divider bg-surface-nav lg:hidden">
          <nav className="mx-auto flex max-w-[1320px] flex-col gap-1 px-6 py-3">
            <div className="px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">
              {t('nav.product')}
            </div>
            {PRODUCT_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[14px] transition hover:bg-line-divider/40"
                style={{
                  color: isActive(item.href) ? '#171717' : '#3F3F46',
                  fontWeight: isActive(item.href) ? 600 : 400,
                }}
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                {t(item.key)}
              </Link>
            ))}
            <div className="my-1 h-px bg-line-divider" />
            <NavLink i18nKey="nav.listings" href="/listings" active={isActive('/listings')} mobile onClick={() => setMenuOpen(false)} />
            <NavLink i18nKey="nav.pricing" href="/pricing" active={isActive('/pricing')} mobile onClick={() => setMenuOpen(false)} />
            <NavLink i18nKey="nav.screening" href="/screening" active={isActive('/screening')} alwaysLive mobile onClick={() => setMenuOpen(false)} />
          </nav>
        </div>
      )}
    </header>
  )
}

function NavLink({
  i18nKey,
  href,
  alwaysLive,
  active,
  mobile,
  onClick,
}: {
  i18nKey: string
  href: string
  alwaysLive?: boolean
  active: boolean
  mobile?: boolean
  onClick?: () => void
}) {
  const { t } = useI18n()
  const label = t(i18nKey)
  const isBold = active || !!alwaysLive
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
      style={{ color, fontWeight: isBold ? 600 : 400 }}
    >
      {alwaysLive && (
        <span
          aria-hidden
          className="mr-[5px] inline-block h-[6px] w-[6px] rounded-full"
          style={{ background: '#047857', boxShadow: '0 0 6px #047857' }}
        />
      )}
      <ReservedText text={label} bold={isBold} />
    </Link>
  )
}

function ReservedText({ text, bold }: { text: string; bold: boolean }) {
  return (
    <span
      aria-label={text}
      style={{ display: 'inline-grid', gridTemplateRows: '1fr', alignItems: 'center' }}
    >
      <span
        aria-hidden
        style={{ gridRow: 1, gridColumn: 1, fontWeight: 600, visibility: 'hidden', whiteSpace: 'nowrap' }}
      >
        {text}
      </span>
      <span style={{ gridRow: 1, gridColumn: 1, fontWeight: bold ? 600 : 400, whiteSpace: 'nowrap' }}>
        {text}
      </span>
    </span>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform duration-150"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
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

'use client'

// Phone-only bottom tab bar for the PUBLIC pages (2026-09-07): 助手 · 房源 ·
// 筛查 · 登录 for visitors. Signed in, the SAME workbench bar as on /x/*
// (助手 · 待办 · 想法 · 进度 · 更多) is mounted here instead, so a phone never
// shows two different bottom menus (user 2026-09-25: "容易分不清"); 房源 sits
// in that bar's 更多 sheet. Skipped on auth / onboarding / signing flows where
// a nav would only distract, and on /x/* where the shell mounts it. Body gets
// bottom padding while it is mounted so nothing hides behind it.
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { activeHat, useHats } from '@/lib/useHats'
import { useT } from '@/lib/i18n'
import { shouldShowMobileNav } from '@/lib/mobileNavRoutes'
import { PhoneTabs, RAIL_BY_ROLE } from './workspace/rail'

export default function MobileBottomNav() {
  const path = usePathname() || '/'
  const { lang } = useT()
  const auth = useAuth()
  const hats = useHats()
  const zh = lang === 'zh'
  const show = shouldShowMobileNav(path)

  useEffect(() => {
    if (!show) return
    document.body.classList.add('has-bottom-nav')
    return () => document.body.classList.remove('has-bottom-nav')
  }, [show])

  if (!show) return null
  const signedIn = !auth.loading && !!auth.user
  if (signedIn) {
    // The hat the workbench bar is for — the same predicate as the header and
    // /settings (activeHat): the remembered role when the account holds it,
    // else the best hat it does hold. While hats load, show nothing rather
    // than guess (review 2026-09-25: a tenant with "landlord" remembered saw
    // the landlord bar flash and fired a landlord badge query).
    if (hats.loading) return null
    const role = activeHat(hats, auth.role)
    return <PhoneTabs role={role} items={RAIL_BY_ROLE[role]} />
  }
  const items = [
    { key: 'home', href: '/', label: zh ? '助手' : 'Assistant', active: path === '/', icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
    { key: 'listings', href: '/listings', label: zh ? '房源' : 'Listings', active: path.startsWith('/listings'), icon: <><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /></> },
    { key: 'screening', href: '/screening', label: zh ? '筛查' : 'Screening', active: path.startsWith('/screening'), icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></> },
    { key: 'me', href: '/login', label: zh ? '登录' : 'Sign in', active: false, icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
  ]
  return (
    <nav
      aria-label={zh ? '底部导航' : 'Bottom navigation'}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-divider bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid h-16 grid-cols-4">
        {items.map((it) => (
          <Link key={it.key} href={it.href} className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold" style={{ color: it.active ? '#00ACE4' : '#4A4A6A' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}

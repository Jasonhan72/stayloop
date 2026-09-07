'use client'

// Phone-only bottom tab bar for the PUBLIC pages (2026-09-07). The signed-in
// workspace keeps its own rail (WorkspaceShell), so this one is skipped
// there, and on auth / onboarding / signing flows where a nav would only
// distract. Body gets bottom padding while it is mounted so nothing hides
// behind it.
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'

const HIDE_PREFIXES = ['/onboarding', '/login', '/register', '/auth', '/verify', '/lease/sign', '/join', '/p/', '/h/', '/dashboard', '/settings', '/admin', '/screening/app', '/screening/']
const WORKSPACE_ROLE_PREFIXES = ['/tenant/', '/landlord/', '/agent/']

export function shouldShowMobileNav(path: string): boolean {
  if (HIDE_PREFIXES.some((p) => path.startsWith(p))) return false
  if (WORKSPACE_ROLE_PREFIXES.some((p) => path.startsWith(p))) return false
  return true
}

const HOME: Record<string, string> = { tenant: '/tenant/agent', landlord: '/landlord/agent', agent: '/agent/agent' }

export default function MobileBottomNav() {
  const path = usePathname() || '/'
  const { lang } = useT()
  const auth = useAuth()
  const zh = lang === 'zh'
  const show = shouldShowMobileNav(path)

  useEffect(() => {
    if (!show) return
    document.body.classList.add('has-bottom-nav')
    return () => document.body.classList.remove('has-bottom-nav')
  }, [show])

  if (!show) return null
  const signedIn = !auth.loading && !!auth.user
  const mine = signedIn ? HOME[auth.role || ''] || '/dashboard' : '/login'
  const items = [
    { key: 'home', href: '/', label: zh ? '助手' : 'Assistant', active: path === '/', icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
    { key: 'listings', href: '/listings', label: zh ? '房源' : 'Listings', active: path.startsWith('/listings'), icon: <><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /></> },
    { key: 'screening', href: '/screening', label: zh ? '筛查' : 'Screening', active: path.startsWith('/screening'), icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></> },
    { key: 'me', href: mine, label: signedIn ? (zh ? '我的' : 'Me') : (zh ? '登录' : 'Sign in'), active: false, icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
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

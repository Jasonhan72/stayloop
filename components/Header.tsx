'use client'

import { useUnreadMessages } from '@/lib/messages/unread'
import { isRegistrationLive } from '@/lib/agentProfile'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import Logo from './Logo'
import MobileBottomNav from './MobileBottomNav'
import LanguageCurrencyModal from './LanguageCurrencyModal'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useAdmin } from '@/lib/useAdmin'
import { activeHat, useHats } from '@/lib/useHats'
import { useHomeHref } from '@/lib/useHomeHref'
import { fetchPendingCount, PENDING_CHANGED_EVENT } from '@/lib/agent/pendingCount'
import { supabase } from '@/lib/supabase'
import { PROVIDER_ACCENT, ROLE_THEME, type RoleKey } from '@/lib/roleTheme'
import { displayIdentity } from '@/lib/displayIdentity'

const ROLE_META: Record<string, { label: string; labelEn: string; color: string; home: string; icon: string }> = {
  tenant:   { label: '租客', labelEn: 'Tenant',   color: ROLE_THEME.tenant.accent,   home: '/tenant/agent',   icon: '🏠' },
  landlord: { label: '房东', labelEn: 'Landlord', color: ROLE_THEME.landlord.accent, home: '/landlord/agent', icon: '🔑' },
  agent:    { label: '经纪', labelEn: 'Agent',    color: ROLE_THEME.agent.accent,    home: '/agent/agent',    icon: '💼' },
  // not a UI role (no switch, no assistant page) — only named when you are on its pages
  provider: { label: '服务商', labelEn: 'Provider', color: PROVIDER_ACCENT,          home: '/provider/jobs',  icon: '🔧' },
}

interface HeaderProps {
  variant?: 'transparent' | 'solid'
  /** Phone bottom tab bar for public pages (WorkspaceShell turns it off — it has its own rail). */
  mobileNav?: boolean
}

const PRODUCT_ITEMS = [
  { key: 'nav.tenants', href: '/tenant', color: ROLE_THEME.tenant.accent, tag: { zh: '让 AI 替你找到家', en: 'AI finds you home' } },
  { key: 'nav.landlords', href: '/landlord', color: ROLE_THEME.landlord.accent, tag: { zh: '租得快,选得准', en: 'Rent faster, choose right' } },
  { key: 'nav.agents', href: '/agent', color: ROLE_THEME.agent.accent, tag: { zh: '杂活交给 AI', en: 'Busywork goes to AI' } },
  // Fourth door (services marketplace entry, 2026-09-26): the repairs network's
  // public page — landlords dispatch there, providers apply to join.
  { key: 'nav.services', href: '/services', color: '#00ACE4', tag: { zh: '维修与服务网络 · 入驻', en: 'Repairs network · join' } },
]

export default function Header({ variant = 'solid', mobileNav = true }: HeaderProps) {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const { lang, t } = useI18n()
  const auth = useAuth()
  const { role: adminRole } = useAdmin()
  const isAdmin = !!adminRole

  // Hats come from the server (my_hats RPC); the switcher shows the ones the
  // account holds and a door to each it does not. localStorage only remembers
  // the last one used (design/multi-role-accounts-2026-09.md §3).
  const hats = useHats()
  // The remembered role only counts when the account holds that hat (review 2026-09-25).
  const currentRole = activeHat(hats, auth.role)
  // The provider hat is remembered in storage, not in auth.role (it is not a UI
  // role); on neutral pages the chip must still say 服务商 when that is what the
  // account came from (节点 3 verification 2026-09-26: /notifications said 租客).
  // useHomeHref reads it now and also gives both logos their destination (V0.7, 2026-09-27).
  const home = useHomeHref()
  const heldRoles = (['tenant', 'landlord', 'agent'] as const).filter((r) =>
    r === 'tenant' ? true : r === 'landlord' ? hats.landlord : hats.agent !== null)
  // The identity the header names — label, colour, the avatar menu's「当前：…」chip and the
  // current row: the area you are in (lib/displayIdentity.ts). Permissions read the hats.
  const displayRole = displayIdentity(pathname, home.onProvider, currentRole)

  // The menu names hats, never assistants: 「当前：房东」「房东工作台」「租客 / 房东 / 经纪」
  // (user 2026-09-25: the assistant names — Atlas, Nova and the like — made it unclear who the
  // user is; the 2026-09-22 assistant-named workspace entry is gone).
  // The hamburger's red dot used to be decorative (always on when signed in);
  // now it means "cards waiting for you" on the current hat.
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => {
    if (auth.loading || !auth.user) { setPendingCount(0); return }
    let cancelled = false
    // the displayed hat's cards; the provider hat has none, so its pages keep the active hat's
    const countRole = displayRole === 'provider' ? currentRole : displayRole
    const load = () => fetchPendingCount(countRole).then((n) => { if (!cancelled) setPendingCount(n) })
    void load()
    window.addEventListener(PENDING_CHANGED_EVENT, load)
    return () => { cancelled = true; window.removeEventListener(PENDING_CHANGED_EVENT, load) }
  }, [auth.loading, auth.user, currentRole, displayRole, pathname])

  // Messages (消息系统 A 期): the envelope folded into the hamburger (user 2026-09-30) —
  // one red dot for "something is waiting": approval cards on this hat or unread messages.
  const unreadMessages = useUnreadMessages(!auth.loading && !!auth.user)
  const attention = pendingCount + unreadMessages
  const attentionLabel = lang === 'zh'
    ? [pendingCount ? `${pendingCount} 件等你点头` : '', unreadMessages ? `${unreadMessages} 条未读消息` : ''].filter(Boolean).join('，')
    : [pendingCount ? `${pendingCount} waiting on you` : '', unreadMessages ? `${unreadMessages} unread messages` : ''].filter(Boolean).join(', ')

  const handleRoleSwitch = (newRole: string) => {
    auth.setRole(newRole as 'tenant' | 'landlord' | 'agent')
    closeMenus()
    router.push(ROLE_META[newRole].home)
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  // Closes both surfaces that list the hats: the hamburger and the「我是」dropdown.
  const closeMenus = () => { setMenuOpen(false); setProductOpen(false) }
  const [scrolled, setScrolled] = useState(false)
  const [langModalOpen, setLangModalOpen] = useState(false)
  // Phone menu: marketing links fold into one row once you are signed in
  // (the identity section already covers the three roles; the bottom tabs
  // cover the workspace). Anonymous visitors still see them expanded.
  const [browseOpen, setBrowseOpen] = useState(false)
  // The identity list (four or five hats with doors) folds behind one row —
  // the menu had grown to a full screen (user 2026-09-26). Collapsed on every open.
  const [hatsOpen, setHatsOpen] = useState(false)
  useEffect(() => { if (!menuOpen) setHatsOpen(false) }, [menuOpen])
  const menuRef = useRef<HTMLDivElement>(null)
  const productRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen && !productOpen) return
    const handler = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (productOpen && productRef.current && !productRef.current.contains(e.target as Node)) {
        setProductOpen(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setProductOpen(false) }
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [menuOpen, productOpen])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const isProductActive = PRODUCT_ITEMS.some((p) => isActive(p.href))

  const initial = (auth.fullName || auth.email || 'U').slice(0, 1).toUpperCase()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('stayloop-avatar') : null
    if (cached) setAvatarUrl(cached)
    const meta = (auth.user?.user_metadata as any)?.avatar_url
    if (meta && typeof meta === 'string') setAvatarUrl(meta)
  }, [auth.user])
  const avatarBg =
    displayRole === 'provider' ? `linear-gradient(135deg, #FDBA74, ${PROVIDER_ACCENT})` : (ROLE_THEME[displayRole as RoleKey] ?? ROLE_THEME.landlord).avatarGradient

  // Signed in, the「我是」trigger names the displayed identity (providers included).
  const actingLabel = lang === 'zh' ? ROLE_META[displayRole].label : ROLE_META[displayRole].labelEn
  // …in that identity's colour, the same one as the「当前：房东」chip in the avatar menu, so the
  // acting role reads at a glance (user 2026-09-29:「我是房东这个菜单文字的颜色也改成…一样的
  // 绿色」, then「我是经纪，我是服务商，也是要一样的处理下」): landlord green, tenant purple,
  // agent blue, provider orange.
  const identityColor = home.signedIn ? ROLE_META[displayRole].color : null
  const navIdentityLabel = lang === 'zh' ? `我是${actingLabel}` : `I’m ${/^[aeiou]/i.test(actingLabel) ? 'an' : 'a'} ${actingLabel.toLowerCase()}`
  // The hat rows: the hamburger's folded list and the「我是」dropdown render the same set.
  const identityRows = (
    <>
                    <div className="px-4 pb-1 pt-1 font-mono text-[10.5px] font-bold uppercase tracking-[.12em] text-[#717171]">{lang === 'zh' ? '身份' : 'Identity'}</div>
                    {(['tenant', 'landlord', 'agent'] as const).map((r) => {
                      const held = heldRoles.includes(r)
                      const isCurrent = r === displayRole
                      const pendingAgent = r === 'agent' && hats.agent && !isRegistrationLive(hats.agent)
                      const sub = r === 'tenant'
                        ? (lang === 'zh' ? '找房 · 申请 · 签约' : 'Search · Apply · Lease')
                        : r === 'landlord'
                          ? (held ? (lang === 'zh' ? '管房 · 筛查 · 续约' : 'Manage · Screen · Renew') : (lang === 'zh' ? '发布房源 · 筛查租客' : 'List a unit · screen tenants'))
                          : (held ? (lang === 'zh' ? '客户 · 带看 · 经纪目录' : 'Clients · Showings · Directory') : (lang === 'zh' ? '需 RECO 注册核验' : 'Requires RECO registration check'))
                      const inner = (
                        <>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full text-[15px]" style={{ background: ROLE_META[r].color + '14' }}>{ROLE_META[r].icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-[14px] font-semibold text-[#222]">
                              <span>{lang === 'zh' ? ROLE_META[r].label : ROLE_META[r].labelEn}</span>
                              {isCurrent && <span className="rounded-full px-2 py-[1px] text-[11px] font-bold" style={{ background: ROLE_META[r].color + '14', color: ROLE_META[r].color }}>{lang === 'zh' ? '当前' : 'current'}</span>}
                              {pendingAgent && <span className="rounded-full bg-amber-50 px-2 py-[1px] text-[11px] font-bold text-amber-800">{lang === 'zh' ? '待认证' : 'pending'}</span>}
                              {!held && !pendingAgent && <span className="rounded-full border border-[#E5E5E5] px-2 py-[1px] text-[11px] font-semibold text-[#717171]">{isCurrent ? (lang === 'zh' ? '未认证' : 'not verified') : (lang === 'zh' ? '开通' : 'add')}</span>}
                            </div>
                            <div className="text-[12px] text-[#717171]">{sub}</div>
                          </div>
                          {!isCurrent && <span className="text-[#717171]">›</span>}
                        </>
                      )
                      if (isCurrent) return <div key={r} className="flex w-full items-center gap-3 px-4 py-2.5 text-left" aria-current="true">{inner}</div>
                      if (held) return <button key={r} onClick={() => handleRoleSwitch(r)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[#F7F7F7]" role="menuitem">{inner}</button>
                      return <Link key={r} href={r === 'landlord' ? '/onboarding/name?role=landlord' : '/agent/verify'} onClick={closeMenus} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[#F7F7F7]" role="menuitem">{inner}</Link>
                    })}
                    {/* Fifth hat (services marketplace 2026-09-23): the jobs door once a provider row
                        exists; otherwise the onboarding door (entry proposal 2026-09-26). */}
                    {!hats.loading && !hats.provider && (
                      <Link href="/provider/onboard" onClick={closeMenus} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[#F7F7F7]" role="menuitem" data-testid="become-provider">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-[15px]" style={{ background: PROVIDER_ACCENT + '14' }}>🔧</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-[14px] font-semibold text-[#222]"><span>{lang === 'zh' ? '服务商' : 'Provider'}</span>{displayRole === 'provider' && <span className="rounded-full px-2 py-[1px] text-[11px] font-bold" style={{ background: PROVIDER_ACCENT + '14', color: PROVIDER_ACCENT }}>{lang === 'zh' ? '当前' : 'current'}</span>}<span className="rounded-full border border-[#E5E5E5] px-2 py-[1px] text-[11px] font-semibold text-[#717171]">{displayRole === 'provider' ? (lang === 'zh' ? '未入驻' : 'not joined') : (lang === 'zh' ? '开通' : 'add')}</span></div>
                          <div className="text-[12px] text-[#717171]">{lang === 'zh' ? '成为服务商 · 需资质核验' : 'Become a provider · credentials checked'}</div>
                        </div>
                        <span className="text-[#717171]">›</span>
                      </Link>
                    )}
                    {hats.provider && (
                      <Link href="/provider/jobs" onClick={closeMenus} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[#F7F7F7]" role="menuitem">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-[15px]" style={{ background: PROVIDER_ACCENT + '14' }}>🔧</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-[14px] font-semibold text-[#222]"><span>{lang === 'zh' ? '服务商 · 工单' : 'Provider · Jobs'}</span>{displayRole === 'provider' && <span className="rounded-full px-2 py-[1px] text-[11px] font-bold" style={{ background: PROVIDER_ACCENT + '14', color: PROVIDER_ACCENT }}>{lang === 'zh' ? '当前' : 'current'}</span>}{hats.provider !== 'verified' && <span className="rounded-full bg-amber-50 px-2 py-[1px] text-[11px] font-bold text-amber-800">{({ pending: { zh: '待核验', en: 'pending' }, rejected: { zh: '未通过', en: 'rejected' }, suspended: { zh: '已暂停', en: 'suspended' }, expired: { zh: '已过期', en: 'expired' } } as Record<string, { zh: string; en: string }>)[hats.provider]?.[lang === 'zh' ? 'zh' : 'en'] ?? hats.provider}</span>}</div>
                          <div className="text-[12px] text-[#717171]">{lang === 'zh' ? '接单 · 报价 · 完工' : 'Accept · Quote · Complete'}</div>
                        </div>
                        <span className="text-[#717171]">›</span>
                      </Link>
                    )}
    </>
  )

  return (
    <>
    <header
      className={
        'sticky top-0 z-40 w-full transition-colors duration-200 ' +
        (variant === 'transparent' && !scrolled
          ? 'bg-transparent'
          : 'border-b border-line-divider bg-surface-nav/95 backdrop-blur')
      }
    >
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-5 sm:px-8 md:h-[66px] lg:px-12">
        <Logo size="md" href={home.href} />

        {/* Desktop nav — the same menu on every page, workbench included (user 2026-09-27:
            "header 的菜单就一直保留在顶部，各个模块都可以使用"). Signed in, the「我是」
            dropdown IS the identity switcher — its label names the acting hat and its rows
            are the hamburger's — while visitors get the four role pages. */}
        <nav className="hidden items-center gap-[26px] lg:flex">
          <div className="relative" ref={productRef}>
            <button
              onClick={() => setProductOpen((v) => !v)}
              className="group inline-flex items-center gap-1 text-[14px] transition"
              style={{
                color: identityColor ?? (isProductActive ? '#171717' : '#3F3F46'),
                fontWeight: identityColor || isProductActive ? 600 : 400,
              }}
              aria-haspopup="menu"
              aria-expanded={productOpen}
              data-testid="nav-identity"
            >
              <ReservedText text={home.signedIn ? navIdentityLabel : t('nav.product')} bold={!!identityColor || isProductActive} />
              <ChevronIcon open={productOpen} />
            </button>
            {productOpen && home.signedIn && (
              <div className="sl-card absolute left-0 mt-3 w-[300px] overflow-hidden p-1" role="menu" data-testid="nav-identity-menu">
                {identityRows}
              </div>
            )}
            {productOpen && !home.signedIn && (
              <div className="sl-card absolute left-1/2 mt-3 w-60 -translate-x-1/2 overflow-hidden p-1">
                {PRODUCT_ITEMS.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setProductOpen(false)}
                    className="flex items-start gap-2.5 rounded-md px-3 py-2.5 transition hover:bg-surface-chip"
                  >
                    <span
                      className="mt-[5px] h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-body">{t(item.key)}</span>
                      <span className="block text-[11.5px] text-body-3">{item.tag[lang]}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <NavLink i18nKey="nav.platform" href="/platform" active={isActive('/platform') || isActive('/stayloop-api')} />
          <NavLink i18nKey="nav.listings" href="/listings" active={isActive('/listings')} />
          <NavLink i18nKey="nav.pricing" href="/pricing" active={isActive('/pricing')} />
          <NavLink i18nKey="nav.screening" href="/screening" active={isActive('/screening')} />
        </nav>

        {/* Right side — avatar + hamburger (messages live in the hamburger since 2026-09-30) */}
        <div className="flex items-center gap-[10px]">
          {/* Avatar — links to profile/settings like Airbnb */}
          {!auth.loading && auth.user && (
            <Link
              href="/settings"
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full text-[15px] font-bold text-white transition-shadow hover:shadow-[0_2px_4px_rgba(0,0,0,0.18)] hover:ring-2 hover:ring-black/10 overflow-hidden"
              style={{ background: avatarUrl ? undefined : avatarBg }}
              title={auth.fullName || auth.email || ''}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </Link>
          )}

          {/* Hamburger — always visible, opens unified dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[#DDDDDD] bg-white text-[#222] transition hover:shadow-[0_2px_4px_rgba(0,0,0,0.18)]"
              aria-label={auth.user && attention > 0 ? `Menu · ${attentionLabel}` : 'Menu'}
            >
              <HamburgerIcon />
              {auth.user && attention > 0 && (
                <span data-testid="menu-attention-dot" className="absolute right-[3px] top-[3px] h-[8px] w-[8px] rounded-full bg-[#FF385C] ring-[1.5px] ring-white" aria-hidden="true" />
              )}
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-2 max-h-[calc(100vh-90px)] w-[min(300px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-[#DDDDDD] bg-white py-2 shadow-[0_2px_16px_rgba(0,0,0,0.12)] supports-[height:100dvh]:max-h-[calc(100dvh-90px)]"
                role="menu"
              >
                {/* Mobile-only: nav links — expanded for visitors; signed-in users get them folded under「浏览 Stayloop」below */}
                {!auth.user && (
                <div className="lg:hidden">
                  {PRODUCT_ITEMS.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]"
                    >
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      {t(item.key)}
                    </Link>
                  ))}
                  <Link href="/platform" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]">{t('nav.platform')}</Link>
                  <Link href="/listings" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]">{t('nav.listings')}</Link>
                  <Link href="/pricing" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]">{t('nav.pricing')}</Link>
                  <Link href="/screening" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]">{t('nav.screening')}</Link>
                  <div className="mx-4 my-1 h-px bg-[#EBEBEB]" />
                </div>
                )}

                {auth.loading ? null : auth.user ? (
                  <>
                    {/* Identity row — who you are and which hat is active */}
                    <div className="flex items-center gap-3 px-4 pb-3 pt-1">
                      <span className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full text-[14px] font-bold text-white" style={{ background: avatarUrl ? undefined : avatarBg }}>
                        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initial}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-[#222]">{auth.fullName || auth.email}</div>
                        <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[11px] font-bold" style={{ background: ROLE_META[displayRole].color + '14', color: ROLE_META[displayRole].color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_META[displayRole].color }} />
                          {lang === 'zh' ? `当前：${ROLE_META[displayRole].label}` : `Now: ${ROLE_META[displayRole].labelEn}`}
                        </div>
                      </div>
                    </div>
                    <div className="mx-4 my-1 h-px bg-[#EBEBEB]" />

                    {/* Primary — the displayed identity's workspace */}
                    <Link
                      href={ROLE_META[displayRole]?.home || '/tenant/agent'}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-[14px] font-semibold text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      <WorkspaceIcon />
                      <span className="flex-1">{lang === 'zh' ? `${ROLE_META[displayRole].label}工作台` : `${ROLE_META[displayRole].labelEn} workspace`}</span>
                      {pendingCount > 0 && <span className="rounded-full bg-[#FF385C] px-2 py-[1px] text-[11px] font-bold text-white">{pendingCount}</span>}
                    </Link>
                    {displayRole === 'landlord' && (
                      <Link
                        href="/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-[14px] font-semibold text-[#222] transition hover:bg-[#F7F7F7]"
                        role="menuitem"
                      >
                        <ListingMgmtIcon />
                        {lang === 'zh' ? '房源管理' : 'Manage listings'}
                      </Link>
                    )}
                    <Link
                      href="/messages"
                      onClick={() => setMenuOpen(false)}
                      data-testid="menu-messages"
                      className="flex items-center gap-3 px-4 py-3 text-[14px] font-semibold text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      <MailIcon />
                      <span className="flex-1">{lang === 'zh' ? '消息' : 'Messages'}</span>
                      {unreadMessages > 0 && <span className="rounded-full bg-[#FF385C] px-2 py-[1px] text-[11px] font-bold text-white">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
                    </Link>
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-[14px] font-semibold text-[#222] transition hover:bg-[#F7F7F7]"
                        role="menuitem"
                      >
                        <span className="flex h-[18px] w-[18px] items-center justify-center">🛡️</span>
                        {lang === 'zh' ? '后台管理' : 'Back office'}
                      </Link>
                    )}

                    <div className="mx-4 my-1 h-px bg-[#EBEBEB]" />

                    {/* Hats — every identity this account has or can get, current one marked.
                        Folded behind one row; the top identity row already says which hat is on. */}
                    <button
                      onClick={() => setHatsOpen((v) => !v)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-semibold text-[#222] transition hover:bg-[#F7F7F7]"
                      aria-expanded={hatsOpen}
                      aria-controls="sl-identity-list"
                      role="menuitem"
                      data-testid="identity-toggle"
                    >
                      <IdentityIcon />
                      <span className="flex-1">{lang === 'zh' ? '切换身份' : 'Switch identity'}</span>
                      {heldRoles.length > 1 && <span className="text-[12px] font-normal text-[#717171]">{lang === 'zh' ? `${heldRoles.length} 个身份` : `${heldRoles.length} identities`}</span>}
                      <span className={'text-[#717171] transition-transform ' + (hatsOpen ? 'rotate-90' : '')}>›</span>
                    </button>
                    {hatsOpen && <div id="sl-identity-list" className="pb-1" data-testid="identity-list">{identityRows}</div>}

                    <div className="mx-4 my-1 h-px bg-[#EBEBEB]" />

                    {/* Account */}
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      <SettingsIcon />
                      {lang === 'zh' ? '账号设置' : 'Account settings'}
                    </Link>
                    <button
                      onClick={() => { setLangModalOpen(true); setMenuOpen(false) }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      <GlobeIcon />
                      {lang === 'zh' ? '语言和货币' : 'Language and currency'}
                    </button>

                    {/* Phone (and the app shell on desktop): the public pages, folded into one row */}
                    <div className="lg:hidden">
                      <button
                        onClick={() => setBrowseOpen((v) => !v)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-[#222] transition hover:bg-[#F7F7F7]"
                        aria-expanded={browseOpen}
                        role="menuitem"
                      >
                        <CompassIcon />
                        <span className="flex-1">{lang === 'zh' ? '浏览 Stayloop' : 'Browse Stayloop'}</span>
                        <span className={'text-[#717171] transition-transform ' + (browseOpen ? 'rotate-90' : '')}>›</span>
                      </button>
                      {browseOpen && (
                        <div className="pb-1">
                          {[
                            { href: '/platform', label: t('nav.platform') },
                            { href: '/listings', label: t('nav.listings') },
                            { href: '/pricing', label: t('nav.pricing') },
                            { href: '/screening', label: t('nav.screening') },
                            ...PRODUCT_ITEMS.map((item) => ({ href: item.href, label: `${t(item.key)} · ${item.tag[lang]}` })),
                          ].map((l) => (
                            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block py-2 pl-[46px] pr-4 text-[13.5px] text-[#444] transition hover:bg-[#F7F7F7]">{l.label}</Link>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mx-4 my-1 h-px bg-[#EBEBEB]" />

                    {/* Logout */}
                    <button
                      onClick={async () => {
                        setMenuOpen(false)
                        await auth.signOut()
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      <LogoutIcon />
                      {t('nav.signOut')}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-[14px] font-semibold text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      {t('nav.login')}
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-[14px] text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      {t('nav.register')}
                    </Link>
                    <div className="mx-4 my-1 h-px bg-[#EBEBEB]" />
                    <button
                      onClick={() => { setLangModalOpen(true); setMenuOpen(false) }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-[#222] transition hover:bg-[#F7F7F7]"
                      role="menuitem"
                    >
                      <GlobeIcon />
                      {lang === 'zh' ? '语言和货币' : 'Language and currency'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </header>
      <LanguageCurrencyModal
        open={langModalOpen}
        onClose={() => setLangModalOpen(false)}
      />
      {mobileNav && <MobileBottomNav />}
    </>
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

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M1.5 8h13" />
      <path d="M8 1.5c1.66 1.63 2.6 3.56 2.6 6.5s-.94 4.87-2.6 6.5c-1.66-1.63-2.6-3.56-2.6-6.5s.94-4.87 2.6-6.5z" />
    </svg>
  )
}

function IdentityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 6h5m0 0-2-2m2 2-2 2" />
      <path d="M21 12h-5m0 0 2-2m-2 2 2 2" />
    </svg>
  )
}

function CompassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5-5 2.2 2.2-5z" />
    </svg>
  )
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
  )
}


function WorkspaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[#222]">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[#222]">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ListingMgmtIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[#222]">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[#222]">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

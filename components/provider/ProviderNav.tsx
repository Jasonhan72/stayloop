'use client'

// The service provider's own navigation (2026-11-17, product report §4.7). The other three hats have a
// workspace rail; a provider had none, and on a phone a provider-only account saw the tenant workspace's
// four tabs with its own jobs two taps away under 更多. Same look as the workspace rail (64px icon column,
// name on hover; a five-tab bar on phones), its own five places: 工单 · 历史 · 资料与资质 · 消息 · 找人.
// No AI Agent items here — a provider has no assistant workspace.
// 2026-11-23: a provider who lists professional services only (paralegal, lawyer, insurance broker,
// photography) is never dispatched a work order, so their navigation has no 工单 / 历史 — three places:
// 资料与牌照 · 消息 · 找人 (providerItemsFor).
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useOnChange } from '@/lib/ui/useOnChange'
import { useUnreadMessages } from '@/lib/messages/unread'
import { supabase } from '@/lib/supabase'
import { BadgeIcon, BriefcaseIcon, FIND_ITEM, GearIcon, MailIcon, ProgressIcon, type RailItem } from '@/components/workspace/rail'
import { isProfessionalOnly, onboardHref } from '@/lib/marketplace/onboardKind'

export const PROVIDER_ITEMS: RailItem[] = [
  { key: 'jobs', href: '/provider/jobs', icon: <BriefcaseIcon />, label: { zh: '工单', en: 'Jobs' }, desc: { zh: '新邀请、进行中和待验收的工单', en: 'New invitations, jobs in progress and awaiting acceptance' }, group: 'pages' },
  { key: 'history', href: '/provider/history', icon: <ProgressIcon />, label: { zh: '历史', en: 'History' }, desc: { zh: '结束的工单、结算记录与评价', en: 'Closed jobs, settlements and reviews' }, group: 'pages' },
  { key: 'profile', href: '/provider/onboard', icon: <BadgeIcon />, label: { zh: '资料与资质', en: 'Profile & credentials' }, desc: { zh: '工种、服务城市、资质编号与到期日', en: 'Trades, cities, credential numbers and expiry dates' }, group: 'pages' },
  { key: 'msgs', href: '/messages', icon: <MailIcon />, label: { zh: '消息', en: 'Messages' }, desc: { zh: '和房东、租客、Stayloop 的对话', en: 'Conversations with landlords, tenants and Stayloop' }, group: 'inbox' },
  FIND_ITEM,
]
const PROFESSIONAL_PROFILE: RailItem = { key: 'profile', href: onboardHref('professional'), icon: <BadgeIcon />, label: { zh: '资料与牌照', en: 'Profile & licences' }, desc: { zh: '服务类别、服务城市、牌照号与到期日', en: 'Services, cities, licence numbers and expiry dates' }, group: 'pages' }

/** The places a provider's navigation lists: all five, or three for a professional-only record. */
export function providerItemsFor(professionalOnly: boolean): RailItem[] {
  if (!professionalOnly) return PROVIDER_ITEMS
  return [PROFESSIONAL_PROFILE, ...PROVIDER_ITEMS.filter((it) => it.key === 'msgs' || it.key === 'find')]
}

/** Short names for the phone bar (five cells across 375px). */
const TAB_LABEL: Record<string, { zh: string; en: string }> = { profile: { zh: '资料', en: 'Profile' }, find: { zh: '找人', en: 'Find' } }

const SETTINGS: RailItem = { key: 'settings', href: '/settings', icon: <GearIcon />, label: { zh: '账号设置', en: 'Account settings' }, desc: { zh: '账号、登录方式、语言、推送', en: 'Account, sign-in, language, notifications' } }

// What the last read said about each account, so the navigation does not flash 工单 / 历史 at a
// professional-only provider on every page before the record is read again.
const knownProfessionalOnly = new Map<string, boolean>()

/**
 * What the navigation needs from the account's provider record: whether it is professional-only,
 * and the invitations waiting for an answer (work orders in `offered`) — the 工单 badge. A
 * professional-only record is never offered a work order, so none are counted for it.
 */
export function useProviderNav(enabled: boolean): { invites: number; professionalOnly: boolean } {
  const auth = useAuth()
  const path = usePathname() || ''
  const uid = auth.user?.id ?? null
  const [n, setN] = useState(0)
  const [pro, setPro] = useState(false)
  useEffect(() => {
    if (!enabled || auth.loading || !auth.user) { setN(0); setPro(false); return }
    let on = true
    setPro(knownProfessionalOnly.get(auth.user.id) ?? false)
    void (async () => {
      const { data: p } = await supabase.from('service_providers').select('id, trades').eq('auth_id', auth.user!.id).maybeSingle()
      const row = p as { id?: string; trades?: string[] | null } | null
      const only = !!row?.id && isProfessionalOnly(row.trades)
      knownProfessionalOnly.set(auth.user!.id, only)
      if (on) setPro(only)
      if (!row?.id || only) { if (on) setN(0); return }
      const { count } = await supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('provider_id', row.id).eq('status', 'offered')
      if (on) setN(count ?? 0)
    })()
    return () => { on = false }
    // Re-read on navigation: answering an invitation on the jobs page changes the count.
  }, [enabled, auth.loading, auth.user, path])
  return { invites: n, professionalOnly: !!uid && pro }
}

/** Invitations waiting for this provider's answer — the 工单 badge. */
export function useProviderInvites(enabled: boolean): number {
  return useProviderNav(enabled).invites
}

// 找人 is one section with three addresses (/agents, /providers, /providers/professional) — not /provider/….
const isOn = (path: string, href: string) => (href === FIND_ITEM.href ? /^\/(agents|providers)(\/|$)/.test(path) : path === href || path.startsWith(href + '/'))
const Dot = ({ n }: { n: number }) => (
  <span aria-hidden className="sl-rail-badge absolute right-1 top-1 min-w-[16px] rounded-full px-1 text-center text-[10px] font-extrabold leading-4 text-white" style={{ background: '#EF4444' }}>{n > 99 ? '99+' : n}</span>
)

/** Phone: a fixed five-tab bar (md and below). */
export function ProviderTabs() {
  const path = usePathname() || ''
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const auth = useAuth()
  const signedIn = !auth.loading && !!auth.user
  const unread = useUnreadMessages(signedIn)
  const { invites, professionalOnly } = useProviderNav(signedIn)
  const items = providerItemsFor(professionalOnly)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-divider md:hidden" style={{ background: '#FFFFFF', paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={zh ? '服务商' : 'Provider'} data-testid="provider-tabs">
      <div className="flex h-16 items-stretch justify-between px-1">
        {items.map((it) => {
          const on = isOn(path, it.href)
          const badge = it.key === 'jobs' ? invites : it.key === 'msgs' ? unread : 0
          const label = TAB_LABEL[it.key] ?? it.label
          return (
            <Link key={it.key} href={it.href} aria-current={on ? 'page' : undefined} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg transition" style={{ color: on ? '#1B1B3C' : '#6E6E8A', background: on ? '#EEF5FA' : undefined }}>
              <span className="relative">
                {it.icon}
                {badge > 0 && <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{badge > 9 ? '9+' : badge}</span>}
              </span>
              <span className="max-w-full truncate text-[11px] font-medium leading-none">{zh ? label.zh : label.en}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/** Desktop: the 64px icon rail. `phone` also mounts the phone bar — for shells whose Header does not
 *  (WorkspaceShell passes mobileNav={false}); on the provider's own pages the Header mounts it. */
export function ProviderRail({ phone = false }: { phone?: boolean }) {
  const path = usePathname() || ''
  const { lang } = useI18n()
  const en = lang === 'en'
  const auth = useAuth()
  const signedIn = !auth.loading && !!auth.user
  const unread = useUnreadMessages(signedIn)
  const { invites, professionalOnly } = useProviderNav(signedIn)
  const items = providerItemsFor(professionalOnly)
  // The name (and what the page is for) beside the icon on hover / focus, drawn fixed so the rail can scroll.
  const [tip, setTip] = useState<{ label: string; desc?: string; x: number; y: number } | null>(null)
  const showTip = (el: HTMLElement, label: string, desc?: string) => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) return // the name is under the icon there
    const r = el.getBoundingClientRect()
    const railRight = el.closest('nav')?.getBoundingClientRect().right ?? r.right
    setTip({ label, desc, x: railRight + 6, y: r.top + r.height / 2 })
  }
  useOnChange(path, () => setTip(null))
  const link = (it: RailItem, badge = 0): ReactNode => {
    const on = isOn(path, it.href)
    const label = en ? it.label.en : it.label.zh
    const desc = en ? it.desc.en : it.desc.zh
    const named = badge > 0 ? (en ? `${label}, ${badge} new` : `${label}，${badge} 条新的`) : label
    return (
      <Link
        key={it.key}
        href={it.href}
        aria-label={named}
        aria-current={on ? 'page' : undefined}
        onMouseEnter={(e) => showTip(e.currentTarget, label, desc)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => showTip(e.currentTarget, label, desc)}
        onBlur={() => setTip(null)}
        className="sl-rail-item relative flex h-11 w-11 flex-none items-center justify-center rounded-[10px] transition hover:bg-white"
        style={on ? { background: '#FFFFFF', color: '#1B1B3C', boxShadow: '0 1px 2px rgba(27,27,60,0.10)' } : { color: '#6E6E8A' }}
      >
        {it.icon}
        <span className="sl-rail-label" data-testid="rail-label">{label}</span>
        {badge > 0 && <Dot n={badge} />}
      </Link>
    )
  }
  const pages = items.filter((it) => it.group === 'pages')
  const inbox = items.filter((it) => it.group === 'inbox')
  return (
    <>
      {phone && <ProviderTabs />}
      <nav
        className="sl-rail hidden md:sticky md:top-[66px] md:flex md:h-[calc(100vh-66px)] md:w-16 md:flex-none md:flex-col md:items-center md:gap-0.5 md:self-start md:overflow-y-auto md:border-r md:border-line-divider md:px-2 md:py-3"
        style={{ background: '#F3F8FC', scrollbarWidth: 'none' }}
        aria-label={en ? 'Provider' : '服务商'}
        data-testid="provider-rail"
      >
        {pages.map((it) => link(it, it.key === 'jobs' ? invites : 0))}
        <div className="my-1.5 h-px w-7 flex-none" style={{ background: '#D3E3EF' }} />
        {inbox.map((it) => link(it, it.key === 'msgs' ? unread : 0))}
        <div className="mt-auto" />
        {link(SETTINGS)}
      </nav>
      {tip && (
        <span role="tooltip" className="pointer-events-none fixed z-[70] hidden max-w-[260px] -translate-y-1/2 rounded-[8px] px-2.5 py-1.5 text-white shadow-lg md:block" style={{ left: tip.x, top: tip.y, background: '#1B1B3C' }}>
          <span className="block whitespace-nowrap text-[12px] font-semibold">{tip.label}</span>
          {tip.desc && <span className="mt-0.5 block text-[11px] leading-snug text-white/75">{tip.desc}</span>}
        </span>
      )}
    </>
  )
}

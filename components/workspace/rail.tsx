'use client'

// The workbench's page list per role, the phone bottom tab bar and the icon
// set — in their own module so the public site can mount the same phone bar
// (components/MobileBottomNav.tsx) without importing the whole shell: a
// signed-in phone shows ONE bottom bar everywhere (user 2026-09-25: the public
// bar and the workbench bar side by side were "容易分不清"). Desktop rail and
// the shell itself stay in components/WorkspaceShell.tsx.
import { useUnreadMessages } from '@/lib/messages/unread'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useModalA11y } from '@/lib/ui/useModalA11y'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { fetchPendingCount, PENDING_CHANGED_EVENT } from '@/lib/agent/pendingCount'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'

export type WorkspaceRole = 'tenant' | 'landlord' | 'agent'

export interface RailItem {
  key: string
  href: string
  icon: ReactNode
  label: { zh: string; en: string }
  /** What the page is for — the second line of the rail's hover / focus tooltip. */
  desc: { zh: string; en: string }
  /** Where it sits (2026-10-04 regroup): 消息 · the hat's pages · records at the bottom. */
  group?: 'inbox' | 'pages' | 'records'
}

/** The AI Agent's own four pages — one definition for the desktop rail, the
 *  phone tab bar and the shell's page titles (they used to be three copies). */
export function assistantItems(role: WorkspaceRole): RailItem[] {
  return [
    { key: 'assistant', href: `/${role}/agent`, icon: <ChatIcon />, label: { zh: 'AI 助理', en: 'AI Agent' }, desc: { zh: '和 AI 助理对话', en: 'Talk to your AI Agent' } },
    { key: 'todo', href: `/${role}/todo`, icon: <TodoIcon />, label: { zh: '待办', en: 'To-do' }, desc: { zh: '等你点头的事', en: 'Waiting on you' } },
    { key: 'ideas', href: `/${role}/ideas`, icon: <BulbIcon />, label: { zh: '想法', en: 'Ideas' }, desc: { zh: '它可以替你做的事', en: 'What it can do for you' } },
    { key: 'progress', href: `/${role}/progress`, icon: <ProgressIcon />, label: { zh: '进度', en: 'Progress' }, desc: { zh: '租前 · 租中 · 租后，每件事走到哪', en: 'Leasing · living · renewal — where each matter stands' } },
  ]
}


// One entry per page, grouped (2026-10-04): 消息 (talking to people) · the hat's
// pages · records. The rail stays icon-only with the name on hover (user
// 2026-10-04: 「保持只有图标」); no icon repeats within one hat's rail.
export const RAIL_BY_ROLE: Record<WorkspaceRole, RailItem[]> = {
  tenant: [
    { key: 'msgs',      href: '/messages',  icon: <MailIcon />,    label: { zh: '消息', en: 'Messages' } , desc: { zh: '和房东、服务商、Stayloop 的对话', en: 'Conversations with landlords, providers and Stayloop' }, group: 'inbox' },
    { key: 'passport',  href: '/tenant/passport',  icon: <PassIcon />,    label: { zh: '护照', en: 'Passport' } , desc: { zh: '材料包与只读分享链接', en: 'Your documents and a read-only share link' }, group: 'pages' },
    { key: 'apps',      href: '/tenant/applications', icon: <FileIcon />, label: { zh: '申请', en: 'Applications' } , desc: { zh: '我的申请进度', en: 'Track your applications' }, group: 'pages' },
    { key: 'lease',     href: '/tenant/lease',     icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } , desc: { zh: '查看与签署租约', en: 'View and sign leases' }, group: 'pages' },
    { key: 'maint',     href: '/tenant/maintenance', icon: <ToolIcon />,  label: { zh: '维修', en: 'Repairs' } , desc: { zh: '报修与进度', en: 'Report and track repairs' }, group: 'pages' },
    { key: 'pay',       href: '/tenant/payments',  icon: <CashIcon />,    label: { zh: '租金', en: 'Rent' } , desc: { zh: '租金记录 · 线下支付', en: 'Rent records · paid offline' }, group: 'pages' },
    { key: 'audit',     href: '/tenant/audit',     icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } , desc: { zh: '你的操作和它替你做的事，逐条留痕', en: 'Everything you and your AI Agent did, line by line' }, group: 'records' },
  ],
  landlord: [
    { key: 'msgs',      href: '/messages', icon: <MailIcon />,   label: { zh: '消息', en: 'Messages' } , desc: { zh: '和租客、申请人、服务商、Stayloop 的对话', en: 'Conversations with tenants, applicants, providers and Stayloop' }, group: 'inbox' },
    { key: 'listings',  href: '/dashboard',        icon: <HomeIcon />,    label: { zh: '房源', en: 'Listings' } , desc: { zh: '你发布的房源与草稿', en: 'Your listings and drafts' }, group: 'pages' },
    { key: 'apps',      href: '/landlord/applicants', icon: <FileIcon />, label: { zh: '申请', en: 'Applicants' } , desc: { zh: '收到的申请与一键筛查', en: 'Applications received and one-tap screening' }, group: 'pages' },
    { key: 'screen',    href: '/screening/app',    icon: <ScreenIcon />,  label: { zh: '筛查', en: 'Screening' } , desc: { zh: '租客筛查报告', en: 'Tenant screening reports' }, group: 'pages' },
    { key: 'lease',     href: '/landlord/leases',  icon: <LeaseIcon />,   label: { zh: '租约', en: 'Leases' } , desc: { zh: '租约、电子签与续约', en: 'Leases, e-signing and renewals' }, group: 'pages' },
    { key: 'maint',     href: '/landlord/maintenance', icon: <ToolIcon />,label: { zh: '维修', en: 'Repairs' } , desc: { zh: '报修工单与派单', en: 'Repair tickets and dispatch' }, group: 'pages' },
    { key: 'providers', href: '/landlord/providers', icon: <UsersIcon />, label: { zh: '服务商', en: 'Providers' } , desc: { zh: '维修服务商目录与派单策略', en: 'Repair providers and your dispatch policy' }, group: 'pages' },
    { key: 'fin',       href: '/landlord/finance', icon: <CashIcon />,    label: { zh: '财务', en: 'Finance' } , desc: { zh: '收支面板（示范，尚未上线）', en: 'Finance panel (sample, not live yet)' }, group: 'pages' },
    { key: 'audit',     href: '/landlord/audit',   icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } , desc: { zh: '你的操作和它替你做的事，逐条留痕', en: 'Everything you and your AI Agent did, line by line' }, group: 'records' },
  ],
  agent: [
    { key: 'msgs',      href: '/messages',         icon: <MailIcon />,    label: { zh: '消息', en: 'Messages' } , desc: { zh: '和客户、各方的对话', en: 'Conversations with clients and other parties' }, group: 'inbox' },
    { key: 'clients',   href: '/agent/clients',    icon: <UsersIcon />,   label: { zh: '客户', en: 'Clients' } , desc: { zh: '客户表、委托与代客筛查', en: 'Clients, delegations and screening for clients' }, group: 'pages' },
    { key: 'tasks',     href: '/agent/tasks',      icon: <TaskIcon />,    label: { zh: '任务', en: 'Tasks' } , desc: { zh: '客户表生成的待跟进事项', en: 'Follow-ups generated from your client book' }, group: 'pages' },
    { key: 'cal',       href: '/agent/calendar',   icon: <CalendarIcon />, label: { zh: '日历', en: 'Calendar' } , desc: { zh: '日程（示范）', en: 'Calendar (sample)' }, group: 'pages' },
    { key: 'earn',      href: '/agent/earnings',   icon: <CashIcon />,    label: { zh: '佣金', en: 'Earnings' } , desc: { zh: '佣金记录（示范，尚未上线）', en: 'Earnings (sample, not live yet)' }, group: 'pages' },
    { key: 'audit',     href: '/agent/audit',      icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } , desc: { zh: '你的操作和它替你做的事，逐条留痕', en: 'Everything you and your AI Agent did, line by line' }, group: 'records' },
  ],
}

/* ============= PHONE TABS (md and below) =============
   AI 助理 · 待办 (badge = cards waiting on you) · 想法 · 进度 · 更多 (a sheet with
   the rest, in the rail's groups: 消息 · 页面 · 记录与账号). */
export function PhoneTabs({ role, items }: { role: WorkspaceRole; items: RailItem[] }) {
  const path = usePathname() || ''
  const { lang } = useI18n()
  const zh = lang === 'zh'
  const auth = useAuth()
  const hats = useHats()
  const [more, setMore] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => {
    if (auth.loading || !auth.user) { setPendingCount(0); return }
    let cancelled = false
    const load = () => fetchPendingCount(role).then((n) => { if (!cancelled) setPendingCount(n) })
    void load()
    window.addEventListener(PENDING_CHANGED_EVENT, load)
    return () => { cancelled = true; window.removeEventListener(PENDING_CHANGED_EVENT, load) }
  }, [auth.loading, auth.user, role, path])
  useEffect(() => { setMore(false) }, [path])
  const sheetRef = useRef<HTMLDivElement>(null)
  useModalA11y(more, () => setMore(false), sheetRef)
  // Install hint + service-worker registration live here because every
  // signed-in phone visit passes through the shell (PWA, benchmark item F).
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  const tabs: { key: string; href: string; label: string; icon: ReactNode; badge?: number }[] = assistantItems(role).map((it) => ({
    key: it.key === 'assistant' ? 'agent' : it.key, href: it.href, label: zh ? it.label.zh : it.label.en, icon: it.icon, badge: it.key === 'todo' ? pendingCount : undefined,
  }))
  // Messages live under 更多 on phones: its tab and the 消息 tile carry the unread count (找得到人 2026-09-30).
  const unreadMessages = useUnreadMessages(!auth.loading && !!auth.user)
  const cell = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[16px] transition'
  const moreOn = more || (!tabs.some((t) => path === t.href || path.startsWith(t.href + '/')) && path !== `/${role}/agent`)
  return (
    <>
      {/* The safe-area padding sits OUTSIDE the 64px row: with border-box sizing, padding inside
          `h-16` squeezed the icons + labels into ~29px on a home-screen iPhone (review 2026-09-25). */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-divider md:hidden" style={{ background: '#FFFFFF', paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label={zh ? '工作台' : 'Workspace'}>
       <div className="flex h-16 items-stretch justify-between px-1">
        {tabs.map((t) => {
          const on = path === t.href || path.startsWith(t.href + '/')
          return (
            <Link key={t.key} href={t.href} className={cell} style={{ color: on ? '#1B1B3C' : '#6E6E8A', background: on ? '#EEF5FA' : undefined }}>
              <span className="relative">
                {t.icon}
                {!!t.badge && <span className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{t.badge > 9 ? '9+' : t.badge}</span>}
              </span>
              <span className="max-w-full truncate text-[11px] font-medium leading-none">{t.label}</span>
            </Link>
          )
        })}
        <button type="button" onClick={() => setMore((v) => !v)} className={cell} style={{ color: moreOn ? '#1B1B3C' : '#6E6E8A', background: moreOn ? '#EEF5FA' : undefined }} aria-expanded={more}>
          <span className="relative">
            <MoreIcon />
            {unreadMessages > 0 && <span data-testid="more-unread" className="absolute -right-2.5 -top-1.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}
          </span>
          <span className="text-[11px] font-medium leading-none">{zh ? '更多' : 'More'}</span>
        </button>
       </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[45] bg-black/35 md:hidden" onClick={() => setMore(false)}>
          <div ref={sheetRef} className="absolute inset-x-0 overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pb-4 pt-3" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))', maxHeight: 'calc(100dvh - 4rem - env(safe-area-inset-bottom) - 12px)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={zh ? '更多页面' : 'More pages'}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />
            {(() => {
              // Same groups and order as the desktop rail (2026-10-04): 消息 · the hat's pages · records & account.
              const tile = 'relative flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl px-1.5 py-2.5 text-[11.5px] font-medium'
              const tileCls = (on: boolean) => tile + ' ' + (on ? 'bg-brand/10 text-brand' : 'bg-surface text-body-2')
              const grid = 'grid grid-cols-3 gap-2 min-[360px]:grid-cols-4'
              const cap = 'mb-1.5 mt-3 px-0.5 text-[11px] font-medium text-body-3 first:mt-0'
              const itemTile = (it: RailItem) => {
                const on = path === it.href || path.startsWith(it.href + '/')
                return (
                  <Link key={it.key} href={it.href} className={tileCls(on)}>
                    {it.icon}
                    {it.key === 'msgs' && unreadMessages > 0 && <span className="absolute right-2 top-1.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}
                    <span className="max-w-full truncate">{zh ? it.label.zh : it.label.en}</span>
                  </Link>
                )
              }
              const pages = items.filter((it) => it.group === 'pages')
              const hasListings = pages.some((it) => it.key === 'listings')
              return (
                <>
                  <div className={cap}>{zh ? '消息' : 'Messages'}</div>
                  <div className={grid}>{items.filter((it) => it.group === 'inbox').map(itemTile)}</div>
                  <div className={cap}>{zh ? '页面' : 'Pages'}</div>
                  <div className={grid}>
                    {pages.map(itemTile)}
                    <Link href="/listings" className={tileCls(path.startsWith('/listings'))}>{hasListings ? <SearchIcon /> : <HomeIcon />}<span className="max-w-full truncate">{hasListings ? (zh ? '浏览房源' : 'Browse') : (zh ? '房源' : 'Listings')}</span></Link>
                    {/* Fifth hat: a provider account reaches its jobs from every role's drawer (entry proposal 2026-09-26). */}
                    {hats.provider && (
                      <Link href="/provider/jobs" data-testid="drawer-provider-jobs" className={tileCls(path.startsWith('/provider'))}><BriefcaseIcon /><span>{zh ? '工单' : 'Jobs'}</span></Link>
                    )}
                  </div>
                  <div className={cap}>{zh ? '记录与账号' : 'Records & account'}</div>
                  <div className={grid}>
                    {items.filter((it) => it.group === 'records').map(itemTile)}
                    <Link href="/settings" className={tileCls(path === '/settings')}><GearIcon /><span className="max-w-full truncate">{zh ? '账号设置' : 'Account'}</span></Link>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
      <InstallHint zh={zh} />
    </>
  )
}

// "Add to Home Screen" nudge — once, only on phones, only in a browser tab
// (not when already running standalone). Dismissal is remembered locally.
function InstallHint({ zh }: { zh: boolean }) {
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem('sl-install-hint') === '1') return
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
      if (standalone || window.innerWidth >= 768) return
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
      const t = setTimeout(() => setShow(true), 4000)
      return () => clearTimeout(t)
    } catch { /* no-op */ }
  }, [])
  if (!show) return null
  const dismiss = () => { try { localStorage.setItem('sl-install-hint', '1') } catch {}; setShow(false) }
  return (
    <div className="fixed inset-x-3 bottom-[76px] z-[44] flex items-start gap-3 rounded-xl border border-line-divider bg-white p-3 text-[12.5px] leading-snug text-body-2 shadow-[0_10px_30px_rgba(27,27,60,.18)] md:hidden">
      <img src="/icons/icon-192.png" alt="" className="h-9 w-9 flex-none rounded-lg" />
      <div className="min-w-0 flex-1">
        <b className="text-body">{zh ? '把 Stayloop 放到主屏' : 'Add Stayloop to your Home Screen'}</b>
        <div className="mt-0.5">
          {ios
            ? (zh ? '在 Safari 里点「分享」→「添加到主屏幕」，像 App 一样打开。' : 'In Safari tap Share → “Add to Home Screen” to open it like an app.')
            : (zh ? '浏览器菜单里选「安装应用」或「添加到主屏幕」。' : 'Choose “Install app” or “Add to Home screen” in the browser menu.')}
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label={zh ? '关闭' : 'Close'} className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[16px] text-body-3">×</button>
    </div>
  )
}
export function TodoIcon() { return I('M4 4h16v16H4z|M8 12l3 3 5-6') }
export function PlusIcon() { return I('M12 5v14|M5 12h14') }
export function ProgressIcon() { return I('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 7v5l3 2') }
export function BulbIcon() { return I('M9 18h6|M10 21h4|M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3z') }
export function MoreIcon() { return I('M5 12h.01|M12 12h.01|M19 12h.01') }
export function BellSmall() { return I('M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0') }

/* ============= ICON SET (compact, monoline) ============= */

const I = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
)

export function HomeIcon()  { return I('M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z') }
export function ChatIcon()  { return I('M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z') }
export function MailIcon()  { return I('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M22 6l-10 7L2 6') }
export function ListIcon()  { return I('M3 6h18|M3 12h18|M3 18h18') }
export function FileIcon()  { return I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8') }
export function PassIcon()  { return I('M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M3 10h18|M9 16h.01') }
export function LeaseIcon() { return I('M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v3|M14 14l3 3 6-6') }
export function ToolIcon()  { return I('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z') }
export function CashIcon()  { return I('M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6') }
export function ScreenIcon() { return I('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z|M21 21l-5.6-5.6|M7.8 10.6l1.8 1.8 3.4-3.6') }
export function SearchIcon() { return I('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z|M21 21l-5.6-5.6') }
export function TaskIcon() { return I('M9 6h11|M9 12h11|M9 18h11|M4 6l1 1 2-2|M4 12l1 1 2-2|M4 18l1 1 2-2') }
export function CalendarIcon() { return I('M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M16 2v4|M8 2v4|M3 10h18') }
export function AuditIcon() { return I('M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z|M9 12l2 2 4-4') }
export function UsersIcon() { return I('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75') }
export function BriefcaseIcon() { return I('M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z|M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16') }
export function GearIcon()  { return I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z') }

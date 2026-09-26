'use client'

// The workbench's page list per role, the phone bottom tab bar and the icon
// set — in their own module so the public site can mount the same phone bar
// (components/MobileBottomNav.tsx) without importing the whole shell: a
// signed-in phone shows ONE bottom bar everywhere (user 2026-09-25: the public
// bar and the workbench bar side by side were "容易分不清"). Desktop rail and
// the shell itself stay in components/WorkspaceShell.tsx.
import { ReactNode, useEffect, useState } from 'react'
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
  desc: { zh: string; en: string }
}

export const RAIL_BY_ROLE: Record<WorkspaceRole, RailItem[]> = {
  tenant: [
    { key: 'home',      href: '/tenant/agent',     icon: <ChatIcon />,    label: { zh: '主页', en: 'Home' } , desc: { zh: '和助手对话——找房、办事的入口', en: 'Chat with your assistant — search and get things done' } },
    { key: 'msgs',      href: '/tenant/messages',  icon: <MailIcon />,    label: { zh: '消息', en: 'Messages' } , desc: { zh: '租约对话与看房请求', en: 'Tenancy conversations and showing requests' } },
    { key: 'apps',      href: '/tenant/applications', icon: <FileIcon />, label: { zh: '申请', en: 'Apps' } , desc: { zh: '我的申请进度', en: 'Track your applications' } },
    { key: 'passport',  href: '/tenant/passport',  icon: <PassIcon />,    label: { zh: 'Passport', en: 'Passport' } , desc: { zh: '租客护照与四枚章', en: 'Your Passport and four stamps' } },
    { key: 'lease',     href: '/tenant/lease',     icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } , desc: { zh: '查看与签署租约', en: 'View and sign leases' } },
    { key: 'maint',     href: '/tenant/maintenance', icon: <ToolIcon />,  label: { zh: '维修', en: 'Maint.' } , desc: { zh: '报修与进度跟踪', en: 'Report and track repairs' } },
    { key: 'pay',       href: '/tenant/payments',  icon: <CashIcon />,    label: { zh: '付款', en: 'Pay' } , desc: { zh: '房租账单与支付', en: 'Rent bills and payments' } },
    { key: 'audit',     href: '/tenant/audit',     icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } , desc: { zh: '操作审计记录', en: 'Your audit trail' } },
  ],
  landlord: [
    { key: 'home',      href: '/landlord/agent',   icon: <ChatIcon />,    label: { zh: '主页', en: 'Home' } , desc: { zh: '和助手对话——管房的入口', en: 'Chat with your assistant — manage your rentals' } },
    { key: 'msgs',      href: '/landlord/messages', icon: <MailIcon />,   label: { zh: '消息', en: 'Messages' } , desc: { zh: '租约对话与看房请求', en: 'Tenancy conversations and showing requests' } },
    { key: 'apps',      href: '/landlord/applicants', icon: <FileIcon />, label: { zh: '申请', en: 'Apps' } , desc: { zh: '申请人审查与评分', en: 'Review and score applicants' } },
    { key: 'screen',    href: '/screening/app',    icon: <ScreenIcon />,  label: { zh: '筛查', en: 'Screen' } , desc: { zh: '租客筛查报告', en: 'Tenant screening reports' } },
    { key: 'lease',     href: '/landlord/leases',  icon: <LeaseIcon />,   label: { zh: '租约', en: 'Lease' } , desc: { zh: '租约管理与续约', en: 'Leases and renewals' } },
    { key: 'maint',     href: '/landlord/maintenance', icon: <ToolIcon />,label: { zh: '维修', en: 'Maint.' } , desc: { zh: '维修工单处理', en: 'Handle maintenance tickets' } },
    { key: 'providers', href: '/landlord/providers', icon: <UsersIcon />, label: { zh: '服务商', en: 'Providers' } , desc: { zh: '维修服务商目录与派单策略', en: 'Repair providers and your dispatch policy' } },
    { key: 'fin',       href: '/landlord/finance', icon: <CashIcon />,    label: { zh: '财务', en: 'Finance' } , desc: { zh: '收租与财务面板', en: 'Rent collection and finances' } },
    { key: 'audit',     href: '/landlord/audit',   icon: <AuditIcon />,   label: { zh: '审计', en: 'Audit' } , desc: { zh: '操作审计记录', en: 'Your audit trail' } },
  ],
  agent: [
    { key: 'home',      href: '/agent/agent',      icon: <ChatIcon />,    label: { zh: '主页', en: 'Home' } , desc: { zh: '和助手对话——业务的入口', en: 'Chat with your assistant — run your business' } },
    { key: 'tasks',     href: '/agent/tasks',      icon: <FileIcon />,    label: { zh: '任务', en: 'Tasks' } , desc: { zh: '今日任务与带看', en: "Today's tasks and showings" } },
    { key: 'clients',   href: '/agent/clients',    icon: <ListIcon />,    label: { zh: '客户', en: 'Clients' } , desc: { zh: '客户管理', en: 'Manage clients' } },
    { key: 'cal',       href: '/agent/calendar',   icon: <ToolIcon />,    label: { zh: '日历', en: 'Calendar' } , desc: { zh: '日程安排', en: 'Your calendar' } },
    { key: 'earn',      href: '/agent/earnings',   icon: <CashIcon />,    label: { zh: '佣金', en: 'Earnings' } , desc: { zh: '佣金与结算', en: 'Commissions and payouts' } },
  ],
}

/* ============= PHONE TABS (md and below) =============
   助手 · 待办 (badge = pending approvals) · 想法 · 进度 · 更多 (sheet with the
   rest of the role's pages, settings, notifications). */
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
  // Install hint + service-worker registration live here because every
  // signed-in phone visit passes through the shell (PWA, benchmark item F).
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  const tabs: { key: string; href: string; label: string; icon: ReactNode; badge?: number }[] = [
    { key: 'agent', href: `/${role}/agent`, label: zh ? '助手' : 'Assistant', icon: <ChatIcon /> },
    { key: 'todo', href: `/${role}/todo`, label: zh ? '待办' : 'To-do', icon: <TodoIcon />, badge: pendingCount },
    { key: 'ideas', href: `/${role}/ideas`, label: zh ? '想法' : 'Ideas', icon: <BulbIcon /> },
    { key: 'progress', href: `/${role}/progress`, label: zh ? '进度' : 'Progress', icon: <ProgressIcon /> },
  ]
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
          <MoreIcon />
          <span className="text-[11px] font-medium leading-none">{zh ? '更多' : 'More'}</span>
        </button>
       </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[45] bg-black/35 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 rounded-t-2xl bg-white px-4 pb-4 pt-3" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={zh ? '更多页面' : 'More pages'}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line-strong" />
            <div className="grid grid-cols-4 gap-2">
              {items.filter((it) => it.key !== 'home').map((it) => {
                const on = path === it.href || path.startsWith(it.href + '/')
                return (
                  <Link key={it.key} href={it.href} className={'flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11.5px] font-medium ' + (on ? 'bg-brand/10 text-brand' : 'bg-surface text-body-2')}>
                    {it.icon}
                    <span className="max-w-full truncate">{zh ? it.label.zh : it.label.en}</span>
                  </Link>
                )
              })}
              <Link href="/listings" className={'flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11.5px] font-medium ' + (path.startsWith('/listings') ? 'bg-brand/10 text-brand' : 'bg-surface text-body-2')}><HomeIcon /><span>{zh ? '房源' : 'Listings'}</span></Link>
              {/* Fifth hat: a provider account reaches its jobs from every role's drawer (entry proposal 2026-09-26). */}
              {hats.provider && (
                <Link href="/provider/jobs" data-testid="drawer-provider-jobs" className={'flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11.5px] font-medium ' + (path.startsWith('/provider') ? 'bg-brand/10 text-brand' : 'bg-surface text-body-2')}><BriefcaseIcon /><span>{zh ? '工单' : 'Jobs'}</span></Link>
              )}
              <Link href="/notifications" className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-3 text-[11.5px] font-medium text-body-2"><BellSmall /><span>{zh ? '通知' : 'Alerts'}</span></Link>
              <Link href="/settings" className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-3 text-[11.5px] font-medium text-body-2"><GearIcon /><span>{zh ? '设置' : 'Settings'}</span></Link>
            </div>
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
export function ScreenIcon() { return I('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 15l2 2 4-4') }
export function AuditIcon() { return I('M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z|M9 12l2 2 4-4') }
export function UsersIcon() { return I('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75') }
export function BriefcaseIcon() { return I('M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z|M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16') }
export function GearIcon()  { return I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z') }

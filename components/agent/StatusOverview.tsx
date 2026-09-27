'use client'

// 状态总览 — the at-a-glance tile grid on the progress page: one tile per
// real-world fact (applications, lease, tickets, rent, passport / clients,
// commission…), each linking to the page where the user acts on it. Since
// 节点 1 (2026-09-26) every number comes from lib/facts/useFacts — the same
// RPC payload the lifecycle rail, the today card and the boards read — and
// the tile logic is the pure lib/facts/stats. Demo sessions show the
// design-canon sample numbers with the usual 示范数据 tag.
import Link from 'next/link'
import { useAuth } from '@/lib/useAuth'
import { useT, type Lang } from '@/lib/i18n'
import type { AgentRole } from '@/lib/agent/types'
import { useFacts } from '@/lib/facts/useFacts'
import { statsFromFacts, type Stats } from '@/lib/facts/stats'
import { LEASE_STATE_LABEL } from '@/lib/matters/states'

// Design-canon sample numbers — mirror the demo fixtures already shown on
// the destination pages so the rail and the pages agree.
function demoStats(role: AgentRole): Stats {
  if (role === 'tenant')
    return { apps: 2, leaseState: 'awaiting_landlord', openTickets: 2, nextRent: { date: '2026-06-01', amount: 2800, late: false }, passportTier: 2 }
  if (role === 'landlord')
    return { pendingApps: 6, activeLeases: 2, upcomingLeases: 0, expiringLeases: 1, renewal: { d90: 1, d60: 0, d30: 0 }, openTickets: 3, rentMonth: { collected: 10590, expected: 10590 } }
  return { clientsToFollowUp: 2, activeClients: 7, unsettled: { count: 1, amount: 1475 } }
}

// ------------------------------------------------------------ formatting --

function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

const money = (n: number) => `$${n.toLocaleString()}`

// -------------------------------------------------------------- rendering --

type Tone = 'ok' | 'warn' | 'muted' | 'default' | 'danger'

type TileSpec = {
  key: string
  icon: React.ReactNode
  label: string
  value: string // compact form shown on the tile (number / money / 2-4 char word)
  full?: string // full sentence behind a compressed value — tooltip only
  sub?: string
  tone?: Tone
  href: string // '#…' = scroll to an in-page anchor (e.g. the approval card)
  dead?: boolean // no target to act on (e.g. 0 pending approvals) — render inert
}

function Ic({ d, bg, fg }: { d: string; bg: string; fg: string }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: bg, color: fg }} aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  )
}

const IC = {
  doc: <Ic bg="#F3EEFB" fg="#00ACE4" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z M14 2v6h6" />,
  home: <Ic bg="#EBF4F0" fg="#047857" d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22v-8h6v8" />,
  tool: <Ic bg="#FDF3E7" fg="#B45309" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  dollar: <Ic bg="#EBF1FD" fg="#2563EB" d="M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />,
  shield: <Ic bg="#F0F7EC" fg="#6AB344" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4" />,
  users: <Ic bg="#EBF4F0" fg="#047857" d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />,
  calendar: <Ic bg="#F3EEFB" fg="#00ACE4" d="M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
  zap: <Ic bg="#FCEBEA" fg="#DC2626" d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
}

const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-success',
  warn: 'text-[#B45309]',
  muted: 'text-body-4',
  default: 'text-body',
  danger: 'text-danger',
}

export function buildTiles(role: AgentRole, s: Stats, lang: Lang, pendingCount: number): TileSpec[] {
  const zh = lang === 'zh'
  const n = (v: number | null | undefined) => (v == null ? '—' : String(v))
  const zeroTone = (v: number | null | undefined): Tone => (v == null ? 'muted' : v === 0 ? 'muted' : 'default')

  if (role === 'tenant') {
    const lease = s.leaseState ? LEASE_STATE_LABEL[s.leaseState] : null
    const leaseFull = lease
      ? s.leaseState === 'upcoming' && s.leaseDetail?.start
        ? (zh ? `已签 · ${s.leaseDetail.start} 起租` : `Signed · starts ${s.leaseDetail.start}`)
        : s.leaseState === 'active' && s.leaseDetail?.end
          ? (zh ? `生效中 · ${s.leaseDetail.end} 到期` : `In force · ends ${s.leaseDetail.end}`)
          : (zh ? lease.zh : lease.en)
      : zh ? '暂无租约' : 'No lease yet'
    return [
      {
        key: 'apps',
        icon: IC.doc,
        label: zh ? '进行中的申请' : 'Active applications',
        value: n(s.apps),
        sub: s.apps === 0 ? (zh ? '还没有进行中的申请' : 'Nothing in flight yet') : undefined,
        tone: zeroTone(s.apps),
        href: '/tenant/applications',
      },
      {
        key: 'lease',
        icon: IC.home,
        label: zh ? '当前租约' : 'Current lease',
        value: lease ? (zh ? lease.shortZh : lease.shortEn) : zh ? '暂无' : 'None',
        full: leaseFull,
        tone: lease ? lease.tone : 'muted',
        href: '/tenant/lease',
      },
      {
        key: 'maint',
        icon: IC.tool,
        label: zh ? '开放维修工单' : 'Open repair tickets',
        value: n(s.openTickets),
        sub: s.openTickets === 0 ? (zh ? '没有未结工单' : 'All clear') : undefined,
        tone: zeroTone(s.openTickets),
        href: '/tenant/maintenance',
      },
      {
        key: 'rent',
        icon: IC.dollar,
        label: zh ? '待付租金' : 'Rent due',
        value: s.nextRent ? money(s.nextRent.amount) : zh ? '暂无' : 'None',
        full: s.nextRent ? undefined : zh ? '暂无待付' : 'Nothing due',
        sub: s.nextRent
          ? s.nextRent.late
            ? zh ? `已逾期 · 应付 ${fmtDate(s.nextRent.date, lang)}` : `Overdue · was due ${fmtDate(s.nextRent.date, lang)}`
            : zh ? `下次缴租 ${fmtDate(s.nextRent.date, lang)}` : `Next payment ${fmtDate(s.nextRent.date, lang)}`
          : undefined,
        tone: s.nextRent ? (s.nextRent.late ? 'warn' : 'default') : 'muted',
        href: '/tenant/payments',
      },
      {
        key: 'passport',
        icon: IC.shield,
        label: zh ? 'Passport 盖章进度' : 'Passport stamps',
        value: s.passportTier == null ? '—' : `${s.passportTier}/4`,
        tone: s.passportTier == null ? 'muted' : s.passportTier >= 4 ? 'ok' : 'default',
        href: '/tenant/passport',
      },
    ]
  }

  if (role === 'landlord') {
    const rm = s.rentMonth
    const rentFull = !!rm && rm.expected > 0 && rm.collected >= rm.expected
    return [
      {
        key: 'apps',
        icon: IC.doc,
        label: zh ? '待审申请' : 'Applications to review',
        value: n(s.pendingApps),
        sub: s.pendingApps === 0 ? (zh ? '没有等你审的申请' : 'Nothing awaiting review') : undefined,
        tone: zeroTone(s.pendingApps),
        href: '/landlord/applicants',
      },
      {
        key: 'leases',
        icon: IC.home,
        label: zh ? '生效中的租约' : 'Leases in force',
        value: n(s.activeLeases),
        sub:
          (s.upcomingLeases ?? 0) > 0
            ? zh ? `另有 ${s.upcomingLeases} 份已签待起租` : `${s.upcomingLeases} more signed, starting later`
            : (s.expiringLeases ?? 0) > 0
              ? zh ? `${s.expiringLeases} 份进入续约窗口` : `${s.expiringLeases} in the renewal window`
              : s.activeLeases === 0
                ? zh ? '还没有生效中的租约' : 'No lease in force yet'
                : undefined,
        tone: zeroTone(s.activeLeases),
        href: '/landlord/leases',
      },
      {
        key: 'renewal',
        icon: IC.home,
        label: zh ? '续约窗口' : 'Renewal window',
        value: n(s.expiringLeases),
        full: s.renewal
          ? zh ? `90 天触点 ${s.renewal.d90} · 60 天 ${s.renewal.d60} · 30 天 ${s.renewal.d30}` : `90-day ${s.renewal.d90} · 60-day ${s.renewal.d60} · 30-day ${s.renewal.d30}`
          : undefined,
        sub: s.renewal && (s.renewal.d30 > 0 || s.renewal.d60 > 0)
          ? zh ? `${s.renewal.d30 > 0 ? `${s.renewal.d30} 份 ≤30 天` : `${s.renewal.d60} 份 ≤60 天`}` : `${s.renewal.d30 > 0 ? `${s.renewal.d30} within 30 days` : `${s.renewal.d60} within 60 days`}`
          : (s.expiringLeases ?? 0) === 0
            ? zh ? '120 天内没有到期的租约' : 'Nothing ending within 120 days'
            : undefined,
        tone: (s.renewal?.d30 ?? 0) > 0 ? 'warn' : zeroTone(s.expiringLeases ?? 0),
        href: '/landlord/leases',
      },
      {
        key: 'maint',
        icon: IC.tool,
        label: zh ? '开放工单' : 'Open tickets',
        value: n(s.openTickets),
        sub: s.openTickets === 0 ? (zh ? '没有未结工单' : 'All clear') : undefined,
        tone: zeroTone(s.openTickets),
        href: '/landlord/maintenance',
      },
      {
        key: 'rent',
        icon: IC.dollar,
        label: zh ? '本月收租' : "This month's rent",
        value: rm ? money(rm.collected) : zh ? '暂无' : 'None',
        full: rm
          ? zh ? `已收 ${money(rm.collected)} / 应收 ${money(rm.expected)}` : `${money(rm.collected)} collected of ${money(rm.expected)}`
          : zh ? '本月暂无账单' : 'No rent due this month',
        sub: rentFull ? (zh ? '已收齐' : 'Fully collected') : undefined,
        tone: rm ? (rentFull ? 'ok' : 'default') : 'muted',
        href: '/landlord/finance',
      },
      {
        key: 'approvals',
        icon: IC.zap,
        label: zh ? '待批 Agent 动作' : 'Agent actions to approve',
        value: String(pendingCount),
        sub: pendingCount === 0 ? (zh ? '没有等你点头的动作' : 'Nothing awaiting your nod') : undefined,
        tone: pendingCount === 0 ? 'muted' : 'warn',
        href: '#sl-approvals',
        dead: pendingCount === 0,
      },
    ]
  }

  return [
    {
      key: 'followup',
      icon: IC.calendar,
      label: zh ? '待跟进的客户' : 'Clients to follow up',
      value: n(s.clientsToFollowUp),
      full: zh ? '缺代表协议 / Information Guide 日期，或 7 天以上没联系' : 'Missing agreement / Information Guide dates, or quiet for 7+ days',
      sub: s.clientsToFollowUp === 0 ? (zh ? '客户表里没有待跟进的' : 'Nothing to follow up') : undefined,
      tone: zeroTone(s.clientsToFollowUp),
      href: '/agent/tasks',
    },
    {
      key: 'clients',
      icon: IC.users,
      label: zh ? '活跃客户' : 'Active clients',
      value: n(s.activeClients),
      sub: s.activeClients === 0 ? (zh ? '还没有进行中的客户' : 'No clients in progress yet') : undefined,
      tone: zeroTone(s.activeClients),
      href: '/agent/clients',
    },
    {
      key: 'commission',
      icon: IC.dollar,
      label: zh ? '待结算佣金' : 'Commission to settle',
      value: s.unsettled ? money(s.unsettled.amount) : zh ? '暂无' : 'None',
      full: s.unsettled ? undefined : zh ? '暂无待结算' : 'Nothing pending',
      sub: s.unsettled ? (zh ? `${s.unsettled.count} 笔在途` : `${s.unsettled.count} in transit`) : undefined,
      tone: s.unsettled ? 'default' : 'muted',
      href: '/agent/earnings',
    },
  ]
}

function Tile({ tile }: { tile: TileSpec }) {
  const fullValue = tile.full ?? tile.value
  const desc = [tile.full, tile.sub].filter(Boolean).join(' · ')
  const aria = `${tile.label}：${fullValue}${tile.sub ? `（${tile.sub}）` : ''}`
  const body = (
    <>
      {tile.icon}
      <span className={`max-w-full truncate text-[16px] font-semibold leading-tight ${TONE_CLASS[tile.tone ?? 'default']}`}>
        {tile.value}
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 flex-col whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-left shadow-lg md:group-hover:flex">
        <span className="text-[12px] font-bold text-white">{tile.label}</span>
        {desc && <span className="text-[11px] text-white/70">{desc}</span>}
      </span>
    </>
  )
  const cls = 'group relative flex w-full flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-3 text-center transition hover:bg-surface-muted'
  if (tile.dead) return <div className={cls} aria-label={aria}>{body}</div>
  if (tile.href.startsWith('#')) {
    return (
      <button type="button" className={cls} aria-label={aria} onClick={() => document.getElementById(tile.href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        {body}
      </button>
    )
  }
  return <Link href={tile.href} className={cls} aria-label={aria}>{body}</Link>
}

export default function StatusOverview({ role, live, pendingCount = 0 }: { role: AgentRole; live: boolean; pendingCount?: number }) {
  const { lang } = useT()
  const { user } = useAuth()
  const zh = lang === 'zh'
  // Real tiles come from the shared facts (one RPC per page, cached across the
  // rail / today card / tiles); `live` only decides what is shown.
  const { facts, loading } = useFacts(role)
  const stats: Stats | null = live && user ? (loading && !facts ? null : facts ? statsFromFacts(role, facts) : {}) : demoStats(role)

  return (
    <div className="sl-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {zh ? '状态总览' : 'STATUS OVERVIEW'}
        </div>
        {!live && (
          <span className="rounded-full bg-surface-chip px-2 py-[2px] font-mono text-[9.5px] font-bold text-body-4">
            {zh ? '示范数据' : 'SAMPLE'}
          </span>
        )}
      </div>

      {stats === null ? (
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[70px] animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {buildTiles(role, stats, lang, pendingCount).map((tile) => (
            <Tile key={tile.key} tile={tile} />
          ))}
        </div>
      )}
    </div>
  )
}

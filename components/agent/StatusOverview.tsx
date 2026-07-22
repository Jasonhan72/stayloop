'use client'

// 状态总览 — the at-a-glance panel at the top of the agent-workspace right
// rail. One row per real-world fact (applications, lease, tickets, rent,
// passport / clients, showings, commission…), each row linking to the page
// where the user acts on it. Live sessions read real RLS-scoped tables in a
// single mount-time sweep (silent empty state on failure/timeout — never
// blocks the page); demo sessions show the design-canon sample numbers with
// the usual 示范数据 tag.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getSupabaseBrowser } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT, type Lang } from '@/lib/i18n'
import type { AgentRole } from '@/lib/agent/types'

// ---------------------------------------------------------------- types --

type Stats = {
  // tenant
  apps?: number | null
  leaseStatus?: string | null // lease_documents.status, or null = no lease
  openTickets?: number | null
  nextRent?: { date: string; amount: number; late: boolean } | null
  passportTier?: number | null
  // landlord
  pendingApps?: number | null
  activeLeases?: number | null
  expiringLeases?: number | null
  rentMonth?: { collected: number; expected: number } | null
  // agent
  showingsToday?: number | null
  activeClients?: number | null
  unsettled?: { count: number; amount: number } | null
}

// Design-canon sample numbers — mirror the demo fixtures already shown on
// the destination pages (applications/leases/maintenance/payments/passport,
// finance, tasks/clients/earnings) so the rail and the pages agree.
function demoStats(role: AgentRole): Stats {
  if (role === 'tenant')
    return {
      apps: 2,
      leaseStatus: 'signed_tenant',
      openTickets: 2,
      nextRent: { date: '2026-06-01', amount: 2800, late: false },
      passportTier: 2,
    }
  if (role === 'landlord')
    return {
      pendingApps: 6,
      activeLeases: 2,
      expiringLeases: 1,
      openTickets: 3,
      rentMonth: { collected: 10590, expected: 10590 },
    }
  return { showingsToday: 5, activeClients: 7, unsettled: { count: 1, amount: 1475 } }
}

// ------------------------------------------------------------- live load --

function withTimeout<T>(p: Promise<T>, ms = 6000): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null)
}

type Sb = ReturnType<typeof getSupabaseBrowser>

const OPEN_TICKETS = '(done,cancelled)' // maintenance statuses that count as closed

async function loadTenantStats(sb: Sb, uid: string): Promise<Stats> {
  const { data: t } = await sb.from('tenants').select('id, tier').eq('auth_id', uid).maybeSingle()
  if (!t) return { apps: 0, leaseStatus: null, openTickets: 0, nextRent: null, passportTier: null }
  const tid = t.id as string

  const [intents, leases, maint, passport] = await Promise.all([
    sb.from('showing_intents').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'pending'),
    sb
      .from('lease_documents')
      .select('id, status')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
      .limit(20),
    sb
      .from('maintenance_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tid)
      .not('status', 'in', OPEN_TICKETS),
    sb.from('rental_passports').select('tier').eq('tenant_id', tid).maybeSingle(),
  ])

  // The lease that matters most: an in-force one first, else the freshest
  // in-flight one, else (only ended leases) the ended state.
  const rows = (leases.data ?? []) as { id: string; status: string | null }[]
  const lease =
    rows.find((l) => l.status === 'active' || l.status === 'signed_both') ??
    rows.find((l) => l.status !== 'ended') ??
    rows[0]

  // Next rent: earliest unpaid instalment across this tenant's leases.
  let nextRent: Stats['nextRent'] = null
  const leaseIds = rows.map((l) => l.id)
  if (leaseIds.length) {
    const { data: pays } = await sb
      .from('rent_payments')
      .select('due_date, amount, status')
      .in('lease_id', leaseIds)
      .in('status', ['due', 'late'])
      .order('due_date', { ascending: true })
      .limit(1)
    const p = pays?.[0]
    if (p) nextRent = { date: p.due_date as string, amount: Number(p.amount) || 0, late: p.status === 'late' }
  }

  return {
    apps: intents.count ?? 0,
    leaseStatus: lease?.status ?? null,
    openTickets: maint.count ?? 0,
    nextRent,
    passportTier: (passport.data?.tier as number | undefined) ?? (t.tier as number | undefined) ?? 1,
  }
}

function monthBounds(): { start: string; end: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
  const n2 = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const end = `${n2.getFullYear()}-${pad(n2.getMonth() + 1)}-01`
  return { start, end }
}

async function loadLandlordStats(sb: Sb, uid: string): Promise<Stats> {
  // Dual-ID invariant: landlords.id (profileId) ≠ auth.users.id — resolve
  // profile rows with the .or() pattern, never assume one equals the other.
  const { data: lls } = await sb.from('landlords').select('id').or(`id.eq.${uid},auth_id.eq.${uid}`)
  const llIds = (lls ?? []).map((r) => r.id as string)

  // Applications are RLS-scoped ("Landlords see own applications") — no hard
  // owner filter here, per the dual-ID rule.
  const appsQ = sb
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '(approved,declined,rejected,withdrawn)')

  const leasesQ = llIds.length
    ? sb.from('lease_documents').select('id, status, end_date').in('landlord_id', llIds).limit(200)
    : Promise.resolve({ data: [] as { id: string; status: string | null; end_date: string | null }[] })

  const listingsQ = llIds.length
    ? sb.from('listings').select('id').in('landlord_id', llIds).limit(200)
    : Promise.resolve({ data: [] as { id: string }[] })

  const [apps, leases, listings] = await Promise.all([appsQ, leasesQ, listingsQ])

  const leaseRows = (leases.data ?? []) as { id: string; status: string | null; end_date: string | null }[]
  const active = leaseRows.filter((l) => l.status === 'active' || l.status === 'signed_both')
  const now = Date.now()
  const expiring = active.filter((l) => {
    if (!l.end_date) return false
    const days = (new Date(l.end_date).getTime() - now) / 86_400_000
    return days >= 0 && days <= 120 // matches the renewal-window convention
  }).length

  const listingIds = ((listings.data ?? []) as { id: string }[]).map((r) => r.id)
  let openTickets = 0
  if (listingIds.length) {
    const { count } = await sb
      .from('maintenance_tickets')
      .select('id', { count: 'exact', head: true })
      .in('listing_id', listingIds)
      .not('status', 'in', OPEN_TICKETS)
    openTickets = count ?? 0
  }

  // This month's rent roll across the landlord's leases.
  let rentMonth: Stats['rentMonth'] = null
  const leaseIds = leaseRows.map((l) => l.id)
  if (leaseIds.length) {
    const { start, end } = monthBounds()
    const { data: pays } = await sb
      .from('rent_payments')
      .select('amount, status')
      .in('lease_id', leaseIds)
      .gte('due_date', start)
      .lt('due_date', end)
      .limit(200)
    if (pays && pays.length) {
      const expected = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0)
      const collected = pays.filter((p) => p.status === 'paid').reduce((s, p) => s + (Number(p.amount) || 0), 0)
      rentMonth = { collected, expected }
    }
  }

  return {
    pendingApps: apps.count ?? 0,
    activeLeases: active.length,
    expiringLeases: expiring,
    openTickets,
    rentMonth,
  }
}

async function loadAgentStats(sb: Sb, uid: string): Promise<Stats> {
  const { data: fas } = await sb.from('field_agents').select('id').eq('auth_id', uid)
  const faIds = (fas ?? []).map((r) => r.id as string)

  let showingsToday = 0
  let activeClients = 0
  if (faIds.length) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const [showings, tasks] = await Promise.all([
      sb
        .from('agent_tasks')
        .select('id', { count: 'exact', head: true })
        .in('agent_id', faIds)
        .eq('kind', 'showing')
        .in('status', ['scheduled', 'in_progress'])
        .gte('scheduled_at', dayStart.toISOString())
        .lt('scheduled_at', dayEnd.toISOString()),
      sb
        .from('agent_tasks')
        .select('client_tenant_id')
        .in('agent_id', faIds)
        .in('status', ['scheduled', 'in_progress'])
        .not('client_tenant_id', 'is', null)
        .limit(200),
    ])
    showingsToday = showings.count ?? 0
    activeClients = new Set((tasks.data ?? []).map((t) => t.client_tenant_id as string)).size
  }

  // Referral-fee ledger (RLS: brokerage owner) — unsettled = no transfer yet.
  const { data: coms } = await sb.from('commission').select('fee_amount, stripe_transfer_id').limit(200)
  const open = (coms ?? []).filter((c) => !c.stripe_transfer_id)
  const unsettled = open.length
    ? { count: open.length, amount: open.reduce((s, c) => s + (Number(c.fee_amount) || 0), 0) }
    : null

  return { showingsToday, activeClients, unsettled }
}

function loadStats(role: AgentRole, uid: string): Promise<Stats> {
  const sb = getSupabaseBrowser()
  if (role === 'tenant') return loadTenantStats(sb, uid)
  if (role === 'landlord') return loadLandlordStats(sb, uid)
  return loadAgentStats(sb, uid)
}

// ------------------------------------------------------------ formatting --

const LEASE_LABEL: Record<string, { zh: string; en: string; tone: Tone }> = {
  draft: { zh: '草拟中', en: 'Draft', tone: 'muted' },
  sent: { zh: '待你签署', en: 'Awaiting your signature', tone: 'warn' },
  signed_tenant: { zh: '待房东签', en: 'Awaiting landlord', tone: 'default' },
  signed_both: { zh: '生效中', en: 'Active', tone: 'ok' },
  active: { zh: '生效中', en: 'Active', tone: 'ok' },
  ended: { zh: '已结束', en: 'Ended', tone: 'muted' },
}

function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  if (isNaN(d.getTime())) return iso
  if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

const money = (n: number) => `$${n.toLocaleString()}`

// -------------------------------------------------------------- rendering --

type Tone = 'ok' | 'warn' | 'muted' | 'default'

type RowSpec = {
  key: string
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: Tone
  href: string // '#…' = scroll to an in-page anchor (e.g. the approval card)
  dead?: boolean // no target to act on (e.g. 0 pending approvals) — render inert
}

function Ic({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

const IC = {
  doc: <Ic d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z M14 2v6h6" />,
  home: <Ic d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22v-8h6v8" />,
  tool: <Ic d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  dollar: <Ic d="M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" />,
  shield: <Ic d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4" />,
  users: <Ic d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />,
  calendar: <Ic d="M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
  zap: <Ic d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
}

const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-success',
  warn: 'text-[#B45309]',
  muted: 'text-body-4',
  default: 'text-body',
}

function buildRows(role: AgentRole, s: Stats, lang: Lang, pendingCount: number): RowSpec[] {
  const zh = lang === 'zh'
  const n = (v: number | null | undefined) => (v == null ? '—' : String(v))
  const zeroTone = (v: number | null | undefined): Tone => (v == null ? 'muted' : v === 0 ? 'muted' : 'default')

  if (role === 'tenant') {
    const lease = s.leaseStatus ? LEASE_LABEL[s.leaseStatus] : null
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
        value: lease ? (zh ? lease.zh : lease.en) : zh ? '暂无租约' : 'No lease yet',
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
        value: s.nextRent ? money(s.nextRent.amount) : zh ? '暂无待付' : 'Nothing due',
        sub: s.nextRent
          ? s.nextRent.late
            ? zh
              ? `已逾期 · 应付 ${fmtDate(s.nextRent.date, lang)}`
              : `Overdue · was due ${fmtDate(s.nextRent.date, lang)}`
            : zh
              ? `下次缴租 ${fmtDate(s.nextRent.date, lang)}`
              : `Next payment ${fmtDate(s.nextRent.date, lang)}`
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
        label: zh ? '活跃租约' : 'Active leases',
        value: n(s.activeLeases),
        sub:
          (s.expiringLeases ?? 0) > 0
            ? zh
              ? `${s.expiringLeases} 份进入续约窗口`
              : `${s.expiringLeases} in the renewal window`
            : s.activeLeases === 0
              ? zh
                ? '还没有生效中的租约'
                : 'No active leases yet'
              : undefined,
        tone: zeroTone(s.activeLeases),
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
        value: rm ? `${money(rm.collected)} / ${money(rm.expected)}` : zh ? '本月暂无账单' : 'No rent due this month',
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
      key: 'showings',
      icon: IC.calendar,
      label: zh ? '今日带看' : "Today's showings",
      value: n(s.showingsToday),
      sub: s.showingsToday === 0 ? (zh ? '今天没有排带看' : 'No showings scheduled today') : undefined,
      tone: zeroTone(s.showingsToday),
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
      value: s.unsettled ? money(s.unsettled.amount) : zh ? '暂无待结算' : 'Nothing pending',
      sub: s.unsettled ? (zh ? `${s.unsettled.count} 笔在途` : `${s.unsettled.count} in transit`) : undefined,
      tone: s.unsettled ? 'default' : 'muted',
      href: '/agent/earnings',
    },
  ]
}

function Row({ row }: { row: RowSpec }) {
  const body = (
    <>
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-surface-chip text-body-3 transition group-hover:text-brand">
        {row.icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-snug text-body">{row.label}</div>
        {row.sub && <div className="mt-[1px] text-[11px] leading-snug text-body-3">{row.sub}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`text-[13px] font-bold ${TONE_CLASS[row.tone ?? 'default']}`}>{row.value}</span>
        {!row.dead && <span className="text-[14px] leading-none text-body-4 transition group-hover:text-brand">›</span>}
      </div>
    </>
  )
  const cls =
    'group grid w-full grid-cols-[26px_1fr_auto] items-center gap-3 border-t border-dashed border-line-divider py-3 text-left first:border-0 first:pt-0'

  if (row.dead) return <div className={cls}>{body}</div>
  if (row.href.startsWith('#')) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => document.getElementById(row.href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        {body}
      </button>
    )
  }
  return (
    <Link href={row.href} className={cls}>
      {body}
    </Link>
  )
}

export default function StatusOverview({
  role,
  live,
  pendingCount = 0,
}: {
  role: AgentRole
  live: boolean
  pendingCount?: number
}) {
  const { lang } = useT()
  const { user } = useAuth()
  const zh = lang === 'zh'
  const [stats, setStats] = useState<Stats | null>(live ? null : demoStats(role))

  useEffect(() => {
    if (!live || !user) {
      setStats(demoStats(role))
      return
    }
    let cancelled = false
    ;(async () => {
      const s = await withTimeout(loadStats(role, user.id))
      // Silent empty state on failure — rows render with '—', never an error.
      if (!cancelled) setStats(s ?? {})
    })()
    return () => {
      cancelled = true
    }
  }, [live, user, role])

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
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : (
        buildRows(role, stats, lang, pendingCount).map((row) => <Row key={row.key} row={row} />)
      )}
    </div>
  )
}

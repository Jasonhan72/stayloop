'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5 ART 25 · Landlord · Leases
 * Lists active + upcoming + expired leases with activity timeline.
 * Empty state for landlords without active leases.
 */

const LEASES = [
  {
    id: 'L-202',
    tenant: '陈思宇',
    unit: '88 Harbour St #4502',
    rent: 3450,
    start: '2025-08-01',
    end: '2026-07-31',
    status: 'active',
    onTime: '11/11',
    monthsLeft: 3,
    nextRenewal: '续约提醒已发',
  },
  {
    id: 'L-198',
    tenant: 'Mike Park',
    unit: '15 Hanna Ave Loft 312',
    rent: 2890,
    start: '2025-04-01',
    end: '2026-03-31',
    status: 'expired',
    onTime: '12/12',
    monthsLeft: 0,
    nextRenewal: '续约 — 月租中',
  },
  {
    id: 'L-209',
    tenant: 'Anna L.',
    unit: '432 Brunswick Ave',
    rent: 4250,
    start: '2026-06-01',
    end: '2027-05-31',
    status: 'pending',
    onTime: '—',
    monthsLeft: 12,
    nextRenewal: '等待租客签字',
  },
]

const ACTIVITY = [
  { time: '今天 09:14', text: 'Logic 已生成 L-202 续约草稿（OREA Form 400），等待你审阅。' },
  { time: '昨天 16:30', text: 'L-198 转入 month-to-month。Mike Park 同意上调 $80/月。' },
  { time: '5/4 11:00', text: 'L-209 已发送给 Anna L. e-sign。' },
  { time: '5/2 10:00', text: 'L-202 第 11 个月按时入账 — Tier 信任记录 +1。' },
]

export default function LandlordLeasesPage() {
  const active = LEASES.filter((l) => l.status === 'active')
  const pending = LEASES.filter((l) => l.status === 'pending')
  const expired = LEASES.filter((l) => l.status === 'expired')

  return (
    <WorkspaceShell role="landlord" aside={<RailAside />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
            LANDLORD · LEASES
          </div>
          <h1 className="mt-2 text-[36px] font-bold tracking-tight">租约管理</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            OREA Form 400 兼容 · LTB 条款自动校验 · 续约 / 涨租通知一键发送
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">
          + 起草新租约
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="活跃租约" value={active.length} accent="#047857" />
        <Stat label="待签字" value={pending.length} accent="#B45309" />
        <Stat label="本月到期" value={1} accent="#71717A" />
      </div>

      {/* Active section */}
      <section className="mt-10">
        <SectionHead
          title="活跃租约"
          eyebrow="ACTIVE"
          count={active.length}
          right="按到期日 ↑"
        />
        <LeaseList items={active} />
      </section>

      <section className="mt-10">
        <SectionHead
          title="等待签字"
          eyebrow="PENDING"
          count={pending.length}
          right="本月新增 1"
        />
        <LeaseList items={pending} />
      </section>

      <section className="mt-10">
        <SectionHead
          title="已结束 / 月租中"
          eyebrow="EXPIRED"
          count={expired.length}
          right="近 6 个月"
        />
        <LeaseList items={expired} />
      </section>
    </WorkspaceShell>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="sl-card p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {label}
      </div>
      <div className="mt-1.5 text-[28px] font-extrabold tracking-tight" style={{ color: accent }}>
        {value}
      </div>
    </div>
  )
}

function SectionHead({
  title,
  eyebrow,
  count,
  right,
}: {
  title: string
  eyebrow: string
  count: number
  right?: string
}) {
  return (
    <div className="mb-3 flex items-end justify-between border-b border-line-divider pb-2">
      <div>
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {eyebrow} · {count}
        </div>
        <h2 className="text-[20px] font-bold tracking-tight">{title}</h2>
      </div>
      {right && (
        <span className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
          {right}
        </span>
      )}
    </div>
  )
}

function LeaseList({ items }: { items: typeof LEASES }) {
  if (items.length === 0) {
    return (
      <div className="sl-card p-8 text-center text-[13.5px] text-body-3">
        暂无 — 这里会列出对应状态的租约。
      </div>
    )
  }
  return (
    <div className="sl-card overflow-hidden">
      {items.map((l, i) => (
        <div
          key={l.id}
          className={
            'grid grid-cols-[1fr_auto] items-center gap-4 px-6 py-5 sm:grid-cols-[1.6fr_1fr_1fr_auto] ' +
            (i > 0 ? 'border-t border-line-divider' : '')
          }
        >
          <div>
            <div className="text-[14px] font-bold">{l.tenant}</div>
            <div className="text-[12.5px] text-body-2">{l.unit}</div>
            <div className="mt-1 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
              {l.id} · {l.start} → {l.end}
            </div>
          </div>
          <div className="hidden text-[13px] sm:block">
            <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
              月租
            </div>
            <div className="font-bold">${l.rent.toLocaleString()}</div>
            <div className="text-[11.5px] text-body-2">按时 {l.onTime}</div>
          </div>
          <div className="hidden text-[13px] sm:block">
            <StatusPill status={l.status} />
            <div className="mt-1 text-[12px] text-body-2">{l.nextRenewal}</div>
          </div>
          <Link
            href="#"
            className="rounded-[10px] border border-line-strong bg-white px-4 py-[8px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            打开 →
          </Link>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: 'ACTIVE' },
    pending: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: 'PENDING' },
    expired: { bg: 'rgba(113,113,122,0.10)', fg: '#52525B', label: 'EXPIRED' },
  }
  const m = map[status]
  return (
    <span
      className="inline-block font-mono"
      style={{
        background: m.bg,
        color: m.fg,
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.10em',
      }}
    >
      {m.label}
    </span>
  )
}

function RailAside() {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        最近活动
      </div>
      <ul className="mt-3 space-y-4">
        {ACTIVITY.map((a, i) => (
          <li key={i} className="border-l-2 border-line-divider pl-3">
            <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
              {a.time}
            </div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">{a.text}</div>
          </li>
        ))}
      </ul>

      <div className="mt-8 sl-card p-4">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
          LTB 提醒
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
          安省涨租上限 2026 年为 <b>2.5%</b>。Logic 会在续约时自动套用。
        </p>
        <Link
          href="#"
          className="mt-3 inline-block text-[12px] font-semibold text-brand hover:underline"
        >
          查看 N1 / N2 通知模板 →
        </Link>
      </div>
    </div>
  )
}

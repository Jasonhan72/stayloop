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
    tenant: 'Mia Chen',
    unit: 'Unit 1207 · King West',
    rent: 2800,
    start: '2025-08-01',
    end: '2026-07-31',
    status: 'active',
    onTime: '11/11',
    monthsLeft: 3,
    nextRenewal: '续约提醒已发',
  },
  {
    id: 'L-205',
    tenant: 'Thompson',
    unit: 'Liberty Village 2B',
    rent: 3200,
    start: '2025-07-01',
    end: '2026-06-30',
    status: 'active',
    onTime: '12/12',
    monthsLeft: 1,
    nextRenewal: '续约决策包待审',
  },
  {
    id: 'L-198',
    tenant: 'Kevin Tran',
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
  { time: '今天 09:14', text: 'Logic 已生成 L-205 续约草稿（Ontario LTB 标准租约），等待你审阅。' },
  { time: '昨天 16:30', text: 'L-198 转入 month-to-month。Kevin Tran 同意上调 $80/月。' },
  { time: '5/4 11:00', text: 'L-209 已发送给 Anna L. e-sign。' },
  { time: '5/2 10:00', text: 'L-202 第 11 个月按时入账 — 认证信任记录 +1。' },
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
            Ontario LTB 标准租约 · RTA 条款自动校验 · 续约 / 涨租通知一键发送
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">
          + 起草新租约
        </button>
      </div>

      <RenewalPack />

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

function RenewalPack() {
  const DIMS = [
    { k: '租客评级', v: 'A+', d: '12/12 准时 · 0 投诉 · 0 维修延迟', accent: '#047857' },
    { k: '市场租金', v: '$3,400', d: '区域 +6% · 同栋 unit 4F 3 月以 $3,420 出租', accent: '#171717' },
    { k: '空置成本', v: '$3,200 × 1.5 月', d: '区域平均空置 45 天 · 你历史 22 天', accent: '#B45309' },
  ]
  const OPTIONS = [
    { tag: 'A · 保守', price: '$3,200 · 不涨', note: '他大概率续。但你年付损失 $2,400 vs 市场。', hot: false },
    { tag: 'B · 推荐 · 平衡', price: '$3,296 · +3%', note: '略低于市场 · 留温度。Thompson 历史接受度高。', hot: true },
    { tag: 'C · 激进', price: '$3,400 · +6.25%', note: '完全市场价。Thompson 60% 续 · 40% 离开。', hot: false },
  ]
  return (
    <section className="mb-10 sl-card overflow-hidden p-7">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-landlord">
        续约决策包 · LIBERTY VILLAGE 2B
      </div>
      <h2 className="mt-2 text-[22px] font-bold tracking-tight">
        Thompson 租期 6/30 到期 · 续不续？涨多少？
      </h2>
      <p className="mt-1 text-[13.5px] text-body-2">Logic 整理了 4 个数据维度 + 3 个建议方案。你 1 click 就好。</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {DIMS.map((d) => (
          <div key={d.k} className="rounded-xl bg-surface-chip p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{d.k}</div>
            <div className="mt-1 text-[20px] font-extrabold tracking-tight" style={{ color: d.accent }}>{d.v}</div>
            <div className="mt-1 text-[11.5px] leading-snug text-body-2">{d.d}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">Logic 给你 3 个方案</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <div
            key={o.tag}
            className={'rounded-xl border p-4 ' + (o.hot ? 'border-landlord bg-landlord/[0.06]' : 'border-line-divider bg-white')}
          >
            <div className={'font-mono text-[11px] font-bold ' + (o.hot ? 'text-landlord' : 'text-body-3')}>{o.tag}</div>
            <div className="mt-1 text-[16px] font-bold tracking-tight">{o.price}</div>
            <div className="mt-1.5 text-[11.5px] leading-snug text-body-2">{o.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-landlord/20 bg-landlord/5 px-3 py-3">
        <span className="h-5 w-5 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #6EE7B7, #047857 70%)' }} />
        <div className="text-[12.5px] leading-relaxed text-body-2">
          <b className="text-body">Logic 解读：</b>B 方案是过去 3 年你这种「A 级租客」的最优 ROI。Thompson 价值 = 准时 + 0 维修争议 + 邻里好评 = 隐性 $5k+/年。
          <br />
          <span className="text-body-3">注：Ontario 2026 涨幅上限 2.5%,但你这套 2018 后建,不在限制内 — 任何涨幅合法。</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13.5px]">✓ 用 B · $3,296 · 起草续约函发给 Thompson</button>
        <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[12px] text-[13.5px] font-semibold text-body hover:border-brand hover:text-brand">改方案</button>
        <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[12px] text-[13.5px] font-semibold text-body-3">不续约</button>
      </div>
    </section>
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
          安省 2026 涨租上限为 <b>2.5%</b>。但 2018 年 11 月后首次入住的单位不受限 —
          Logic 会先判断房龄，再决定是否套用。
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

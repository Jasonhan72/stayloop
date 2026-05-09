'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5 ART 27 / 43 · Landlord · Finance
 * Monthly rent collection + expenses + KPIs across all properties.
 */

const MONTHS = [
  { m: '12月', collected: 9540, expected: 10590 },
  { m: '1月', collected: 10590, expected: 10590 },
  { m: '2月', collected: 10590, expected: 10590 },
  { m: '3月', collected: 10590, expected: 10590 },
  { m: '4月', collected: 10590, expected: 10590 },
  { m: '5月', collected: 10590, expected: 10590 },
]

const PROPERTIES = [
  { name: '88 Harbour St #4502', tenant: '陈思宇', rent: 3450, status: 'paid', tier: 3 },
  { name: '15 Hanna Ave Loft 312', tenant: 'Mike Park', rent: 2890, status: 'paid', tier: 2 },
  { name: '432 Brunswick Ave', tenant: 'Anna L.（待入住）', rent: 4250, status: 'upcoming', tier: 3 },
]

const EXPENSES = [
  { date: '5/2', desc: 'L-202 · 洗碗机维修', amount: 280 },
  { date: '4/22', desc: '88 Harbour · 物业管理费', amount: 645 },
  { date: '4/15', desc: '432 Brunswick · 屋顶检查', amount: 420 },
  { date: '4/3', desc: '15 Hanna · 空调清洗', amount: 180 },
]

export default function LandlordFinancePage() {
  const totalCollected = MONTHS.reduce((s, m) => s + m.collected, 0)
  const totalExpected = MONTHS.reduce((s, m) => s + m.expected, 0)
  const collectionRate = (totalCollected / totalExpected) * 100
  const totalExpense = EXPENSES.reduce((s, e) => s + e.amount, 0)

  return (
    <WorkspaceShell role="landlord" aside={<Aside />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
            LANDLORD · FINANCE
          </div>
          <h1 className="mt-2 text-[36px] font-bold tracking-tight">财务总览</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            6 个月 · 3 套房产 · 自动核账 · 适配 Schedule 776 报税
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand">
            导出 CSV
          </button>
          <button className="sl-btn-primary !px-5 !py-[10px] !text-[13px]">报税包 →</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="6 月合计收租" value={`$${totalCollected.toLocaleString()}`} accent="#047857" />
        <Kpi
          label="收租率"
          value={`${collectionRate.toFixed(1)}%`}
          accent={collectionRate >= 99 ? '#047857' : '#B45309'}
          sub="99% 达标线"
        />
        <Kpi label="6 月合计支出" value={`$${totalExpense.toLocaleString()}`} accent="#B91C1C" />
        <Kpi label="净现金流" value={`$${(totalCollected - totalExpense).toLocaleString()}`} accent="#171717" />
      </div>

      {/* Chart */}
      <section className="mt-10 sl-card p-7">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              月度收租
            </div>
            <h2 className="text-[18px] font-bold tracking-tight">最近 6 个月</h2>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            ▮ 实收 ▯ 应收
          </div>
        </div>
        <div className="mt-6 grid grid-cols-6 items-end gap-3">
          {MONTHS.map((m) => {
            const max = Math.max(...MONTHS.map((x) => x.expected))
            const ch = (m.collected / max) * 100
            const eh = (m.expected / max) * 100
            return (
              <div key={m.m} className="flex flex-col items-center gap-1">
                <div className="flex h-[180px] w-full items-end gap-1">
                  <div
                    className="flex-1 rounded-t-[3px]"
                    style={{ height: `${ch}%`, background: '#047857' }}
                  />
                  <div
                    className="flex-1 rounded-t-[3px]"
                    style={{ height: `${eh}%`, background: 'rgba(4,120,87,0.20)' }}
                  />
                </div>
                <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                  {m.m}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Two columns */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="sl-card overflow-hidden">
          <div className="border-b border-line-divider px-6 py-4">
            <h3 className="text-[16px] font-bold tracking-tight">本月收租明细</h3>
          </div>
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-chip">
              <tr>
                <Th>房产</Th>
                <Th>租客</Th>
                <Th right>金额</Th>
                <Th right>状态</Th>
              </tr>
            </thead>
            <tbody>
              {PROPERTIES.map((p) => (
                <tr key={p.name} className="border-t border-line-divider">
                  <td className="px-6 py-3 text-[12.5px] font-bold">{p.name}</td>
                  <td className="px-6 py-3 text-[12.5px] text-body-2">{p.tenant}</td>
                  <td className="px-6 py-3 text-right font-mono font-bold">
                    ${p.rent.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Pill status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sl-card overflow-hidden">
          <div className="border-b border-line-divider px-6 py-4">
            <h3 className="text-[16px] font-bold tracking-tight">支出 / 维修</h3>
          </div>
          <ul>
            {EXPENSES.map((e, i) => (
              <li
                key={i}
                className={
                  'flex items-center justify-between px-6 py-3 ' +
                  (i > 0 ? 'border-t border-line-divider' : '')
                }
              >
                <div>
                  <div className="text-[12.5px] font-semibold">{e.desc}</div>
                  <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                    {e.date}
                  </div>
                </div>
                <div className="font-mono text-[13px] font-bold text-danger">
                  −${e.amount.toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </WorkspaceShell>
  )
}

function Kpi({
  label,
  value,
  accent,
  sub,
}: {
  label: string
  value: string
  accent: string
  sub?: string
}) {
  return (
    <div className="sl-card p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {label}
      </div>
      <div className="mt-1.5 text-[24px] font-extrabold tracking-tight" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-body-3">{sub}</div>}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={
        'px-6 py-3 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3 ' +
        (right ? 'text-right' : 'text-left')
      }
    >
      {children}
    </th>
  )
}

function Pill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    paid: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: 'PAID' },
    late: { bg: 'rgba(220,38,38,0.10)', fg: '#B91C1C', label: 'LATE' },
    upcoming: { bg: 'rgba(113,113,122,0.10)', fg: '#52525B', label: 'UPCOMING' },
  }
  const m = map[status] || map.upcoming
  return (
    <span
      className="font-mono"
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

function Aside() {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        税务
      </div>
      <div className="mt-3 sl-card p-4">
        <div className="text-[14px] font-bold">CRA Schedule 776</div>
        <div className="mt-1 text-[12.5px] text-body-2">
          Logic 会把所有租金 / 支出按 776 表格归集，T1 报税季节一键导出。
        </div>
        <button className="mt-3 w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-[12.5px] font-semibold transition hover:border-brand hover:text-brand">
          预览 2025 报税包
        </button>
      </div>

      <div className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        Logic 提示
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        <p>
          📈 你 6 个月平均收租率 <b>98.4%</b> — 高于 GTA 业主平均 <b>92.1%</b>。
        </p>
        <p>
          💡 88 Harbour 的市场租金已升至 $3,580。续约时可考虑上调到 LTB 上限。
        </p>
        <p>🧾 上次 GST 申报：2026 Q1 已完成。</p>
      </div>
    </div>
  )
}

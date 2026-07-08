'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'

/**
 * V5 ART 27 / 43 · Landlord · Finance
 * Monthly rent collection + expenses + KPIs across all properties.
 */

const MONTHS = [
  { m: { zh: '12月', en: 'Dec' }, collected: 9540, expected: 10590 },
  { m: { zh: '1月', en: 'Jan' }, collected: 10590, expected: 10590 },
  { m: { zh: '2月', en: 'Feb' }, collected: 10590, expected: 10590 },
  { m: { zh: '3月', en: 'Mar' }, collected: 10590, expected: 10590 },
  { m: { zh: '4月', en: 'Apr' }, collected: 10590, expected: 10590 },
  { m: { zh: '5月', en: 'May' }, collected: 10590, expected: 10590 },
]

const PROPERTIES = [
  { name: 'Unit 1207 · King West', tenant: { zh: 'Mia Chen', en: 'Mia Chen' }, rent: 2800, status: 'paid', tier: 3 },
  { name: 'Liberty Village 2B', tenant: { zh: 'Thompson', en: 'Thompson' }, rent: 3200, status: 'paid', tier: 3 },
  { name: '432 Brunswick Ave', tenant: { zh: 'Anna L.（待入住）', en: 'Anna L. (moving in)' }, rent: 4250, status: 'upcoming', tier: 3 },
]

const EXPENSES = [
  { date: '5/2', desc: { zh: 'Liberty Village 2B · 洗碗机维修', en: 'Liberty Village 2B · dishwasher repair' }, amount: 280 },
  { date: '4/22', desc: { zh: 'Unit 1207 · 物业管理费', en: 'Unit 1207 · property management fee' }, amount: 645 },
  { date: '4/15', desc: { zh: '432 Brunswick · 屋顶检查', en: '432 Brunswick · roof inspection' }, amount: 420 },
  { date: '4/3', desc: { zh: 'Liberty Village 2B · 空调清洗', en: 'Liberty Village 2B · AC cleaning' }, amount: 180 },
]

export default function LandlordFinancePage() {
  const { lang } = useT()
  const totalCollected = MONTHS.reduce((s, m) => s + m.collected, 0)
  const totalExpected = MONTHS.reduce((s, m) => s + m.expected, 0)
  const collectionRate = (totalCollected / totalExpected) * 100
  const totalExpense = EXPENSES.reduce((s, e) => s + e.amount, 0)

  return (
    <WorkspaceShell role="landlord" aside={<Aside lang={lang} />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
            {lang === 'zh' ? '财务 · 2026 YTD' : 'Finance · 2026 YTD'}
          </div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">
            {lang === 'zh' ? 'Sarah 你今年到 5 月赚了 $30,000' : 'Sarah, you’ve earned $30,000 through May this year'}
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand">
            {lang === 'zh' ? '导出 CSV' : 'Export CSV'}
          </button>
          <button className="sl-btn-primary !px-5 !py-[10px] !text-[13px]">{lang === 'zh' ? '报税包 →' : 'Tax package →'}</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label={lang === 'zh' ? 'YTD 租金收入' : 'YTD rent income'} value="$30,000" accent="#047857" sub={lang === 'zh' ? '▲ +12% vs 2025' : '▲ +12% vs 2025'} />
        <Kpi label={lang === 'zh' ? 'YTD 净利' : 'YTD net profit'} value="$22,840" accent="#047857" sub={lang === 'zh' ? '▲ +14% · 维修成本下降' : '▲ +14% · repair costs down'} />
        <Kpi label={lang === 'zh' ? '空置率' : 'Vacancy rate'} value="2.4%" accent="#171717" sub={lang === 'zh' ? '▼ 区域均 8.7%' : '▼ area avg 8.7%'} />
        <Kpi
          label={lang === 'zh' ? '税务待缴' : 'Tax payable'}
          value="$3,420"
          accent="#B45309"
          sub={lang === 'zh' ? 'CRA Q2 · 6/15 截止' : 'CRA Q2 · due 6/15'}
        />
      </div>

      {/* Chart */}
      <section className="mt-10 sl-card p-7">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {lang === 'zh' ? '月度收租' : 'Monthly rent collected'}
            </div>
            <h2 className="text-[18px] font-bold tracking-tight">{lang === 'zh' ? '最近 6 个月' : 'Last 6 months'}</h2>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            {lang === 'zh' ? '▮ 实收 ▯ 应收' : '▮ Collected ▯ Expected'}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-6 items-end gap-3">
          {MONTHS.map((m) => {
            const max = Math.max(...MONTHS.map((x) => x.expected))
            const ch = (m.collected / max) * 100
            const eh = (m.expected / max) * 100
            return (
              <div key={m.m.en} className="flex flex-col items-center gap-1">
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
                  {m.m[lang]}
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
            <h3 className="text-[16px] font-bold tracking-tight">{lang === 'zh' ? '本月收租明细' : 'Rent ledger · this month'}</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-[13.5px]">
            <thead className="bg-surface-chip">
              <tr>
                <Th>{lang === 'zh' ? '房产' : 'Property'}</Th>
                <Th>{lang === 'zh' ? '租客' : 'Tenant'}</Th>
                <Th right>{lang === 'zh' ? '金额' : 'Amount'}</Th>
                <Th right>{lang === 'zh' ? '状态' : 'Status'}</Th>
              </tr>
            </thead>
            <tbody>
              {PROPERTIES.map((p) => (
                <tr key={p.name} className="border-t border-line-divider">
                  <td className="px-6 py-3 text-[12.5px] font-bold">{p.name}</td>
                  <td className="px-6 py-3 text-[12.5px] text-body-2">{p.tenant[lang]}</td>
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
          </div>
        </section>

        <section className="sl-card overflow-hidden">
          <div className="border-b border-line-divider px-6 py-4">
            <h3 className="text-[16px] font-bold tracking-tight">{lang === 'zh' ? '支出 / 维修' : 'Expenses / repairs'}</h3>
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
                  <div className="text-[12.5px] font-semibold">{e.desc[lang]}</div>
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

function Aside({ lang }: { lang: Lang }) {
  const aiName = useAIName('landlord')
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '税务' : 'Taxes'}
      </div>
      <div className="mt-3 sl-card p-4">
        <div className="text-[14px] font-bold">CRA Schedule 776</div>
        <div className="mt-1 text-[12.5px] text-body-2">
          {lang === 'zh'
            ? `${aiName} 会把所有租金 / 支出按 776 表格归集，T1 报税季节一键导出。`
            : `${aiName} groups all rent and expenses by the Schedule 776 form, ready for one-click export at T1 tax time.`}
        </div>
        <button className="mt-3 w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-[12.5px] font-semibold transition hover:border-brand hover:text-brand">
          {lang === 'zh' ? '预览 2025 报税包' : 'Preview 2025 tax package'}
        </button>
      </div>

      <div className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? `${aiName} 提示` : `${aiName} tips`}
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        {lang === 'zh' ? (
          <>
            <p>
              📈 你 6 个月平均收租率 <b>98.4%</b> — 高于 GTA 业主平均 <b>92.1%</b>。
            </p>
            <p>
              💡 Unit 1207 的市场租金已升至 $2,980。续约时可考虑上调到 LTB 上限。
            </p>
            <p>🧾 上次 GST 申报：2026 Q1 已完成。</p>
          </>
        ) : (
          <>
            <p>
              📈 Your 6-month average collection rate is <b>98.4%</b> — above the GTA landlord average of <b>92.1%</b>.
            </p>
            <p>
              💡 Market rent for Unit 1207 has risen to $2,980. Consider raising to the LTB cap at renewal.
            </p>
            <p>🧾 Last GST filing: 2026 Q1 completed.</p>
          </>
        )}
      </div>
    </div>
  )
}

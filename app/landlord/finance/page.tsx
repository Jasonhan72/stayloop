'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AIProactive, { type AIInsight } from '@/components/AIProactive'
import TrrebTrendChart from '@/components/agent/TrrebTrendChart'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  Table,
  Td,
  Tr,
} from '@/components/workspace'
import { useAIName } from '@/lib/aiName'
import { readTrrebBenchmark, type TrrebBenchmark } from '@/lib/agent/trrebRent'
import {
  CRA776_LABEL,
  EXPENSES,
  PROPERTY_PNL,
  cra776Subtotals,
} from '@/lib/demo/landlordFinance'
import { useT, type Lang } from '@/lib/i18n'
import { ROLE_THEME } from '@/lib/roleTheme'

/**
 * V5 ART 27 / 43 · Landlord · Finance
 * Monthly rent collection + expenses + KPIs across all properties.
 * Layout follows design/v9-workspace-finance.html.
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

// Receivables — the ledger behind the collection chart. The December bar sits
// below its expected line; these rows say why, and that it was settled.
const RECEIVABLES = [
  {
    period: { zh: '2026-05 · 本月', en: '2026-05 · this month' },
    expected: 10590,
    collected: 10590,
    note: { zh: '逾期 $0', en: 'Arrears $0' },
    tone: 'ok' as const,
  },
  {
    period: { zh: '2025-12', en: '2025-12' },
    expected: 10590,
    collected: 9540,
    note: { zh: '差额 $1,050 · 已结清', en: 'Shortfall $1,050 · settled' },
    tone: 'neutral' as const,
  },
  {
    period: { zh: '2026-03', en: '2026-03' },
    expected: 10590,
    collected: 10590,
    note: { zh: '迟付 3 天 · 已结清', en: 'Paid 3 days late · settled' },
    tone: 'neutral' as const,
  },
]

export default function LandlordFinancePage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const subtotals = cra776Subtotals()

  const insights: AIInsight[] = [
    {
      text: {
        zh: 'Unit 1207 当前租金低于同区中位数约 6%。Month 11 续约时可建议 +2.5%（2026 合规上限）。',
        en: 'Unit 1207 rents about 6% under the area median. At Month 11 you can propose +2.5% (the 2026 legal cap).',
      },
      action: {
        label: { zh: '生成续约方案', en: 'Draft renewal options' },
        prompt: {
          zh: '帮我生成 Unit 1207 的续约方案，包含合规涨幅和市场对比。',
          en: 'Draft renewal options for Unit 1207 with the legal increase and market comparison.',
        },
      },
    },
    {
      text: {
        zh: '3 月有一笔迟付。开启自动催租后，{ai} 会在到期前 3 天温和提醒租客。',
        en: 'There was one late payment in March. With auto-reminders on, {ai} nudges tenants 3 days before rent is due.',
      },
      action: {
        label: { zh: '开启催租提醒', en: 'Turn on reminders' },
        prompt: {
          zh: '帮我给所有租约开启到期前 3 天的自动缴租提醒。',
          en: 'Turn on automatic rent reminders 3 days before due date for all my leases.',
        },
      },
    },
  ]

  return (
    <WorkspaceShell role="landlord" aside={<Aside lang={lang} insights={insights} />}>
      <PageHeader
        title={zh ? '财务 · 2026 YTD' : 'Finance · 2026 YTD'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-landlord">LANDLORD · FINANCE</span>
            <span className="mx-1.5 text-body-3">·</span>
            {zh ? 'Sarah 你今年到 5 月赚了 $30,000' : 'Sarah, you’ve earned $30,000 through May this year'}
          </>
        }
        actions={
          <>
            <Link
              href={`/landlord/agent?prompt=${encodeURIComponent(zh ? '帮我导出 2026 年至今的租金和支出明细 CSV' : 'Export a CSV of my 2026 YTD rent and expenses')}`}
              className="rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
            >
              {zh ? '导出 CSV' : 'Export CSV'}
            </Link>
            <Link
              href={`/landlord/agent?prompt=${encodeURIComponent(zh ? '帮我准备报税包（CRA Schedule 776 归集）' : 'Prepare my tax package (CRA Schedule 776 grouping)')}`}
              className="sl-btn-primary !px-4 !py-2 !text-[12.5px]"
            >
              {zh ? '报税包 →' : 'Tax package →'}
            </Link>
          </>
        }
      />

      <StatStrip
        stats={[
          {
            label: zh ? 'YTD 租金收入' : 'YTD rent income',
            value: '$30,000',
            sub: '▲ +12% vs 2025',
            tone: 'up',
          },
          {
            label: zh ? 'YTD 净利' : 'YTD net profit',
            value: '$22,840',
            sub: zh ? '▲ +14% · 维修成本下降' : '▲ +14% · repair costs down',
            tone: 'up',
          },
          {
            label: zh ? '空置率' : 'Vacancy rate',
            value: '2.4%',
            sub: zh ? '▼ 区域均 8.7%' : '▼ area avg 8.7%',
          },
          {
            label: zh ? '税务待缴' : 'Tax payable',
            value: '$3,420',
            sub: zh ? 'CRA Q2 · 6/15 截止' : 'CRA Q2 · due 6/15',
            tone: 'warn',
          },
        ]}
      />

      {/* Chart */}
      <SectionCard
        className="mb-3"
        title={zh ? '月度收租 · 最近 6 个月' : 'Monthly rent collected · last 6 months'}
        meta={zh ? '▮ 实收 ▯ 应收' : '▮ Collected ▯ Expected'}
      >
        <div className="grid grid-cols-6 items-end gap-3">
          {MONTHS.map((m) => {
            const max = Math.max(...MONTHS.map((x) => x.expected))
            const ch = (m.collected / max) * 100
            const eh = (m.expected / max) * 100
            return (
              <div key={m.m.en} className="flex flex-col items-center gap-1.5">
                <div className="flex h-[118px] w-full items-end gap-1">
                  <div className="flex-1 rounded-t-[3px]" style={{ height: `${ch}%`, background: '#047857' }} />
                  <div className="flex-1 rounded-t-[3px]" style={{ height: `${eh}%`, background: 'rgba(4,120,87,0.18)' }} />
                </div>
                <div className="text-[11px] text-body-3">{m.m[lang]}</div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* Receivables & arrears — explains the December gap in the chart above */}
      <SectionCard
        className="mb-3"
        padded={false}
        title={zh ? '应收与逾期' : 'Receivables & arrears'}
        meta={zh ? '已全部结清' : 'All settled'}
      >
        <Table
          head={[
            zh ? '期间' : 'Period',
            zh ? '应收' : 'Expected',
            zh ? '已收' : 'Collected',
            zh ? '状态' : 'Status',
          ]}
        >
          {RECEIVABLES.map((r) => (
            <Tr key={r.period.en}>
              <Td strong>{r.period[lang]}</Td>
              <Td align="right" mono>
                ${r.expected.toLocaleString()}
              </Td>
              <Td align="right" mono>
                ${r.collected.toLocaleString()}
              </Td>
              <Td align="right">
                <StatusPill tone={r.tone}>{r.note[lang]}</StatusPill>
              </Td>
            </Tr>
          ))}
        </Table>
      </SectionCard>

      {/* Per-property P&L */}
      <SectionCard
        className="mb-3"
        padded={false}
        title={zh ? '按房源盈亏 · YTD' : 'Per-property P&L · YTD'}
        meta={zh ? '租金 − 支出' : 'Rent − expenses'}
      >
        <Table
          head={[
            zh ? '房源' : 'Property',
            zh ? '租金' : 'Rent',
            zh ? '支出' : 'Expenses',
            zh ? '净额' : 'Net',
            zh ? '净利率' : 'Margin',
            zh ? '空置' : 'Vacancy',
          ]}
        >
          {PROPERTY_PNL.map((p) => {
            const net = p.rent - p.expense
            return (
              <Tr key={p.name}>
                <Td>
                  <div className="text-[13px] font-semibold">{p.name}</div>
                  <div className="text-[11.5px] text-body-2">{p.tenant[lang]}</div>
                </Td>
                <Td align="right" mono>
                  ${p.rent.toLocaleString()}
                </Td>
                <Td align="right" mono muted>
                  ${p.expense.toLocaleString()}
                </Td>
                <Td align="right" mono strong>
                  <span className={net < 0 ? 'text-danger' : undefined}>
                    {net < 0 ? '−' : ''}${Math.abs(net).toLocaleString()}
                  </span>
                </Td>
                <Td align="right" mono>
                  {p.rent > 0 ? `${Math.round((net / p.rent) * 100)}%` : '—'}
                </Td>
                <Td align="right">
                  {p.vacantDays != null
                    ? zh
                      ? `${p.vacantDays} 天`
                      : `${p.vacantDays} days`
                    : (p.vacancyNote?.[lang] ?? '—')}
                </Td>
              </Tr>
            )
          })}
        </Table>
      </SectionCard>

      {/* Two columns */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard padded={false} title={zh ? '本月收租明细' : 'Rent ledger · this month'}>
          <Table
            head={[
              zh ? '房产' : 'Property',
              zh ? '租客' : 'Tenant',
              zh ? '金额' : 'Amount',
              zh ? '状态' : 'Status',
            ]}
          >
            {PROPERTIES.map((p) => (
              <Tr key={p.name}>
                <Td strong>{p.name}</Td>
                <Td align="right" muted>
                  {p.tenant[lang]}
                </Td>
                <Td align="right" mono strong>
                  ${p.rent.toLocaleString()}
                </Td>
                <Td align="right">
                  <StatusPill tone={p.status === 'paid' ? 'ok' : 'pending'}>
                    {p.status === 'paid' ? (zh ? '已收' : 'Paid') : zh ? '待入住' : 'Upcoming'}
                  </StatusPill>
                </Td>
              </Tr>
            ))}
          </Table>
        </SectionCard>

        <SectionCard padded={false} title={zh ? '支出 / 维修' : 'Expenses / repairs'}>
          {/* CRA Schedule 776 subtotals — the grouping promised in the rail */}
          <div className="flex flex-wrap gap-1.5 border-b border-line-divider bg-surface-chip px-4 py-2.5">
            {subtotals.map((c) => (
              <span
                key={c.key}
                className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-body-2 ring-1 ring-line-divider"
              >
                {CRA776_LABEL[c.key][lang]} <span className="font-mono">${c.total.toLocaleString()}</span>
              </span>
            ))}
          </div>
          <Table
            head={[
              zh ? '支出' : 'Expense',
              zh ? 'CRA 776 分类' : 'CRA 776 line',
              zh ? '金额' : 'Amount',
            ]}
          >
            {EXPENSES.map((e) => (
              <Tr key={`${e.date}-${e.desc.en}`}>
                <Td>
                  <div className="text-[12.5px] font-semibold">{e.desc[lang]}</div>
                  <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">{e.date}</div>
                </Td>
                <Td align="right" muted>
                  {CRA776_LABEL[e.cra776][lang]}
                </Td>
                <Td align="right" mono strong>
                  <span className="text-danger">−${e.amount.toLocaleString()}</span>
                </Td>
              </Tr>
            ))}
          </Table>
        </SectionCard>
      </div>
    </WorkspaceShell>
  )
}

function Aside({ lang, insights }: { lang: Lang; insights: AIInsight[] }) {
  const aiName = useAIName('landlord')
  const zh = lang === 'zh'
  return (
    <div>
      <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>
        <AIProactive role="landlord" insights={insights} variant="rail" />
      </AsideBlock>

      <AsideBlock title={zh ? '市场对照' : 'Market benchmark'}>
        <MarketBenchmark lang={lang} />
      </AsideBlock>

      <AsideBlock title={zh ? '税务' : 'Taxes'}>
        <div className="rounded-xl border border-line-divider bg-white p-3.5">
          <div className="text-[14px] font-bold">CRA Schedule 776</div>
          <div className="mt-1 text-[12.5px] text-body-2">
            {zh
              ? `${aiName} 会把所有租金 / 支出按 776 表格归集，T1 报税季节一键导出。`
              : `${aiName} groups all rent and expenses by the Schedule 776 form, ready for one-click export at T1 tax time.`}
          </div>
          <Link
            href={`/landlord/agent?prompt=${encodeURIComponent(zh ? '预览我的 2025 报税包（CRA Schedule 776）' : 'Preview my 2025 tax package (CRA Schedule 776)')}`}
            className="mt-3 block w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-center text-[12.5px] font-semibold transition hover:border-brand hover:text-brand"
          >
            {zh ? '预览 2025 报税包' : 'Preview 2025 tax package'}
          </Link>
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? `${aiName} 提示` : `${aiName} tips`}>
        <div className="space-y-2 text-[12.5px] leading-relaxed text-body-2">
          {zh ? (
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
      </AsideBlock>
    </div>
  )
}

/**
 * Official TRREB quarterly benchmark for the King West unit, read from the
 * same cache the agent workspace uses (lib/agent/trrebRent). No cached row →
 * the block renders nothing rather than an invented number.
 */
function MarketBenchmark({ lang }: { lang: Lang }) {
  const zh = lang === 'zh'
  const accent = ROLE_THEME.landlord.accent
  const [bm, setBm] = useState<TrrebBenchmark | null>(null)

  useEffect(() => {
    let cancelled = false
    void readTrrebBenchmark(1, ['King West'], 'apartment').then((r) => {
      if (!cancelled) setBm(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const CURRENT_RENT = 2800
  const delta = bm ? ((CURRENT_RENT - bm.avg) / bm.avg) * 100 : null

  return (
    <div className="rounded-xl border border-line-divider bg-white p-3.5">
      <div className="text-[12.5px] font-bold">TRREB Rental Market Report</div>
      {bm ? (
        <>
          <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
            {bm.period} · {bm.area}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
            {zh
              ? `官方 1 房成交均价 $${bm.avg.toLocaleString()}。Unit 1207 现租 $${CURRENT_RENT.toLocaleString()} · `
              : `Official 1-bed average leased rent $${bm.avg.toLocaleString()}. Unit 1207 currently rents at $${CURRENT_RENT.toLocaleString()} · `}
            <b style={{ color: accent }}>
              {delta != null && delta >= 0
                ? zh
                  ? `高于官方均值 ${delta.toFixed(1)}%`
                  : `${delta.toFixed(1)}% above the official average`
                : zh
                  ? `低于官方均值 ${Math.abs(delta ?? 0).toFixed(1)}%`
                  : `${Math.abs(delta ?? 0).toFixed(1)}% below the official average`}
            </b>
          </p>
          {bm.history && bm.history.length >= 4 && <TrrebTrendChart history={bm.history} accent={accent} />}
        </>
      ) : (
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
          {zh
            ? '官方季度基准正在刷新，稍后再看。Unit 1207 现租 $2,800。'
            : 'The official quarterly benchmark is refreshing — check back shortly. Unit 1207 currently rents at $2,800.'}
        </p>
      )}
      <p className="mt-2.5 border-t border-line-divider pt-2 text-[11px] leading-relaxed text-body-3">
        {zh
          ? '涨租仍受 2026 指导上限 2.5% 约束；2018 年 11 月后首次入住的单位豁免。'
          : 'Rent increases remain bound by the 2026 guideline cap of 2.5%; units first occupied after November 2018 are exempt.'}
      </p>
    </div>
  )
}

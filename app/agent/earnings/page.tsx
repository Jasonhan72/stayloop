'use client'

import WorkspaceShell from '@/components/WorkspaceShell'

/**
 * V5 Agent · Earnings
 * Commission ledger + Stripe payouts + tax export.
 */

const PAYOUTS = [
  { date: '5/8', client: 'Yuki M.', listing: 'King West condo', amount: 1475, status: 'paid' },
  { date: '5/3', client: 'David Z.', listing: 'Distillery 1207', amount: 1840, status: 'paid' },
  { date: '4/28', client: 'Mike Park 续约', listing: 'Hanna Loft', amount: 720, status: 'paid' },
  { date: '4/22', client: 'Marcus T.', listing: 'Leslieville Stack', amount: 1550, status: 'paid' },
  { date: '4/14', client: 'Lisa W.', listing: 'CityPlace 4502', amount: 1725, status: 'paid' },
  { date: '4/4', client: 'Anna L.（首签）', listing: 'Brunswick Ave', amount: 2125, status: 'paid' },
]

const PIPELINE = [
  { client: 'Anna L.', listing: 'Brunswick Ave 续约', amount: 2125, eta: '7/2', stage: 'showing' },
  { client: 'Lisa W.', listing: 'CityPlace 4502', amount: 1725, eta: '5/15', stage: 'applied' },
  { client: 'Eric K.', listing: 'Yorkville', amount: 2600, eta: '5/22', stage: 'showing' },
  { client: 'Jason H.', listing: 'King West / Liberty', amount: 1700, eta: '5/30', stage: 'searching' },
]

const STAGE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  searching: { bg: 'rgba(124,58,237,0.10)', fg: '#5B21B6', label: '寻房中' },
  showing: { bg: 'rgba(37,99,235,0.10)', fg: '#1E3A8A', label: '看房中' },
  applied: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: '已申请' },
  closing: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: '关单中' },
}

export default function AgentEarningsPage() {
  const ytd = PAYOUTS.reduce((s, p) => s + p.amount, 0)
  const pipelineTotal = PIPELINE.reduce((s, p) => s + p.amount, 0)
  return (
    <WorkspaceShell role="agent" aside={<Aside />}>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
          AGENT · EARNINGS
        </div>
        <h1 className="mt-2 text-[36px] font-bold tracking-tight">佣金 · 即时结算</h1>
        <p className="mt-1 text-[13.5px] text-body-2">
          每单签字后 24h 内结算到 Stripe · 自动归集到 T4A
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="本月已结算" value="$3,315" accent="#047857" />
        <Kpi label="YTD 实收" value={`$${ytd.toLocaleString()}`} accent="#171717" />
        <Kpi label="Pipeline" value={`$${pipelineTotal.toLocaleString()}`} accent="#7C3AED" sub={`${PIPELINE.length} 单进行中`} />
        <Kpi label="预计 6 月" value="$5,700" accent="#1E3A8A" sub="按当前 pipeline 概率加权" />
      </div>

      {/* Big card: this month */}
      <section className="mt-10 sl-card p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              本月（5月）佣金分布
            </div>
            <h2 className="text-[20px] font-bold tracking-tight">
              $3,315 已结 · $1,475 在途
            </h2>
          </div>
          <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand">
            导出 CSV
          </button>
        </div>
        {/* Stacked horizontal bar */}
        <div className="mt-5 h-[18px] overflow-hidden rounded-full bg-surface-chip">
          <div
            className="h-full"
            style={{ width: '70%', background: '#047857', float: 'left' }}
          />
          <div
            className="h-full"
            style={{ width: '30%', background: 'rgba(124,58,237,0.55)', float: 'left' }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#047857' }} />
            已结算 70%
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(124,58,237,0.55)' }} />
            在途 30%
          </span>
        </div>
      </section>

      {/* Two columns */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="sl-card overflow-hidden">
          <div className="border-b border-line-divider px-6 py-4">
            <h3 className="text-[16px] font-bold tracking-tight">最近结算（Stripe Payouts）</h3>
          </div>
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-chip">
              <tr>
                <Th>日期</Th>
                <Th>客户 / 房源</Th>
                <Th right>金额</Th>
                <Th right>状态</Th>
              </tr>
            </thead>
            <tbody>
              {PAYOUTS.map((p, i) => (
                <tr key={i} className="border-t border-line-divider">
                  <td className="px-6 py-3 font-mono">{p.date}</td>
                  <td className="px-6 py-3 text-[12.5px]">
                    <div className="font-bold">{p.client}</div>
                    <div className="text-body-2">{p.listing}</div>
                  </td>
                  <td className="px-6 py-3 text-right font-mono font-bold">
                    +${p.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className="font-mono"
                      style={{
                        background: 'rgba(4,120,87,0.10)',
                        color: '#047857',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.10em',
                      }}
                    >
                      PAID
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sl-card overflow-hidden">
          <div className="border-b border-line-divider px-6 py-4">
            <h3 className="text-[16px] font-bold tracking-tight">在途 Pipeline</h3>
          </div>
          <ul>
            {PIPELINE.map((p, i) => {
              const ss = STAGE_STYLE[p.stage]
              return (
                <li
                  key={i}
                  className={
                    'px-6 py-4 ' + (i > 0 ? 'border-t border-line-divider' : '')
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-bold">{p.client}</div>
                    <div className="font-mono text-[13px] font-bold">
                      ${p.amount.toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="text-[12px] text-body-2">{p.listing}</div>
                    <span
                      className="font-mono"
                      style={{
                        background: ss.bg,
                        color: ss.fg,
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: '0.10em',
                      }}
                    >
                      {ss.label}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                    预计签字 {p.eta}
                  </div>
                </li>
              )
            })}
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

function Aside() {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        报税
      </div>
      <div className="mt-3 sl-card p-4">
        <div className="text-[14px] font-bold">2025 T4A · 已生成</div>
        <p className="mt-1 text-[12.5px] text-body-2">
          全年总收入 $52,800 · Stripe 已自动报送 CRA。
        </p>
        <button className="mt-3 w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-[12.5px] font-semibold transition hover:border-brand hover:text-brand">
          下载 T4A PDF
        </button>
      </div>

      <div className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        Brief 提示
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        <p>📈 你的成单率比 GTA 同行高 <b>27%</b> — 主要靠快速响应。</p>
        <p>💡 4 个 pipeline 客户中 3 个在 5 月底前能关单。</p>
        <p>🪙 Stripe 提现：每周一自动转账。</p>
      </div>
    </div>
  )
}

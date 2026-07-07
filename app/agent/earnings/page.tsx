'use client'

import WorkspaceShell from '@/components/WorkspaceShell'
import { useT } from '@/lib/i18n'

/**
 * V5 Agent · Earnings
 * Commission ledger + Stripe payouts + tax export.
 */

const PAYOUTS = [
  { date: '5/8', client: { zh: 'Yuki M.', en: 'Yuki M.' }, listing: 'King West condo', amount: 1475, status: 'paid' },
  { date: '5/3', client: { zh: 'David Z.', en: 'David Z.' }, listing: 'Distillery 1207', amount: 1840, status: 'paid' },
  { date: '4/28', client: { zh: 'Kevin Tran 续约', en: 'Kevin Tran renewal' }, listing: 'Hanna Loft', amount: 720, status: 'paid' },
  { date: '4/22', client: { zh: 'Marcus T.', en: 'Marcus T.' }, listing: 'Leslieville Stack', amount: 1550, status: 'paid' },
  { date: '4/14', client: { zh: 'Lisa W.', en: 'Lisa W.' }, listing: 'CityPlace 4502', amount: 1725, status: 'paid' },
  { date: '4/4', client: { zh: 'Anna L.（首签）', en: 'Anna L. (first signing)' }, listing: 'Brunswick Ave', amount: 2125, status: 'paid' },
]

const PIPELINE = [
  { client: 'Anna L.', listing: { zh: 'Brunswick Ave 续约', en: 'Brunswick Ave renewal' }, amount: 2125, eta: '7/2', stage: 'showing' },
  { client: 'Lisa W.', listing: { zh: 'CityPlace 4502', en: 'CityPlace 4502' }, amount: 1725, eta: '5/15', stage: 'applied' },
  { client: 'Eric K.', listing: { zh: 'Yorkville', en: 'Yorkville' }, amount: 2600, eta: '5/22', stage: 'showing' },
  { client: 'Jason H.', listing: { zh: 'King West / Liberty', en: 'King West / Liberty' }, amount: 1700, eta: '5/30', stage: 'searching' },
]

const STAGE_STYLE: Record<string, { bg: string; fg: string; label: { zh: string; en: string } }> = {
  searching: { bg: 'rgba(124,58,237,0.10)', fg: '#5B21B6', label: { zh: '寻房中', en: 'Searching' } },
  showing: { bg: 'rgba(37,99,235,0.10)', fg: '#1E3A8A', label: { zh: '看房中', en: 'Showing' } },
  applied: { bg: 'rgba(217,119,6,0.10)', fg: '#B45309', label: { zh: '已申请', en: 'Applied' } },
  closing: { bg: 'rgba(4,120,87,0.10)', fg: '#047857', label: { zh: '关单中', en: 'Closing' } },
}

export default function AgentEarningsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const ytd = PAYOUTS.reduce((s, p) => s + p.amount, 0)
  const pipelineTotal = PIPELINE.reduce((s, p) => s + p.amount, 0)
  return (
    <WorkspaceShell role="agent" aside={<Aside />}>
      <div className="mb-9">
        <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-agent">
          AGENT · EARNINGS
        </div>
        <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">
          {zh ? '本周 9 场带看 · $720 已锁' : '9 showings this week · $720 locked'}
        </h1>
        <p className="mt-1 text-[13.5px] text-body-2">
          {zh ? '示范数据 · 订阅后解锁完整面板' : 'Sample data · subscribe to unlock full dashboard'}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label={zh ? '本月已结算' : 'Settled this month'} value="$3,315" accent="#047857" />
        <Kpi label={zh ? 'YTD 实收' : 'YTD received'} value={`$${ytd.toLocaleString()}`} accent="#171717" />
        <Kpi label="Pipeline" value={`$${pipelineTotal.toLocaleString()}`} accent="#7C3AED" sub={zh ? `${PIPELINE.length} 单进行中` : `${PIPELINE.length} deals in progress`} />
        <Kpi label={zh ? '预计 6 月' : 'June forecast'} value="$5,700" accent="#1E3A8A" sub={zh ? '按当前 pipeline 概率加权' : 'probability-weighted on current pipeline'} />
      </div>

      {/* Big card: this month */}
      <section className="mt-10 sl-card p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
              {zh ? '本月（5月）佣金分布' : 'This month (May) commission split'}
            </div>
            <h2 className="text-[20px] font-bold tracking-tight">
              {zh ? '$3,315 已结 · $1,475 在途' : '$3,315 settled · $1,475 in transit'}
            </h2>
          </div>
          <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand">
            {zh ? '导出 CSV' : 'Export CSV'}
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
            {zh ? '已结算 70%' : 'Settled 70%'}
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(124,58,237,0.55)' }} />
            {zh ? '在途 30%' : 'In transit 30%'}
          </span>
        </div>
      </section>

      {/* Two columns */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="sl-card overflow-hidden">
          <div className="border-b border-line-divider px-6 py-4">
            <h3 className="text-[16px] font-bold tracking-tight">{zh ? '最近结算（Stripe Payouts）' : 'Recent settlements (Stripe Payouts)'}</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-[13.5px]">
            <thead className="bg-surface-chip">
              <tr>
                <Th>{zh ? '日期' : 'Date'}</Th>
                <Th>{zh ? '客户 / 房源' : 'Client / Listing'}</Th>
                <Th right>{zh ? '金额' : 'Amount'}</Th>
                <Th right>{zh ? '状态' : 'Status'}</Th>
              </tr>
            </thead>
            <tbody>
              {PAYOUTS.map((p, i) => (
                <tr key={i} className="border-t border-line-divider">
                  <td className="px-6 py-3 font-mono">{p.date}</td>
                  <td className="px-6 py-3 text-[12.5px]">
                    <div className="font-bold">{p.client[lang]}</div>
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
          </div>
        </section>

        <section className="sl-card overflow-hidden">
          <div className="border-b border-line-divider px-6 py-4">
            <h3 className="text-[16px] font-bold tracking-tight">{zh ? '在途 Pipeline' : 'In-transit Pipeline'}</h3>
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
                    <div className="text-[12px] text-body-2">{p.listing[lang]}</div>
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
                      {ss.label[lang]}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                    {zh ? `预计签字 ${p.eta}` : `Est. signing ${p.eta}`}
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
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {zh ? '报税' : 'Tax filing'}
      </div>
      <div className="mt-3 sl-card p-4">
        <div className="text-[14px] font-bold">{zh ? '2025 T4A · 已生成' : '2025 T4A · Generated'}</div>
        <p className="mt-1 text-[12.5px] text-body-2">
          {zh ? '全年总收入 $52,800 · Stripe 已自动报送 CRA。' : 'Total annual income $52,800 · Stripe has auto-filed with CRA.'}
        </p>
        <button className="mt-3 w-full rounded-[8px] border border-line-strong bg-white py-[8px] text-[12.5px] font-semibold transition hover:border-brand hover:text-brand">
          {zh ? '下载 T4A PDF' : 'Download T4A PDF'}
        </button>
      </div>

      <div className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {zh ? 'Brief 提示' : 'Brief tips'}
      </div>
      <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
        <p>{zh ? <>📈 你的成单率比 GTA 同行高 <b>27%</b> — 主要靠快速响应。</> : <>📈 Your close rate is <b>27%</b> higher than GTA peers — mostly from fast response.</>}</p>
        <p>{zh ? '💡 4 个 pipeline 客户中 3 个在 5 月底前能关单。' : '💡 3 of 4 pipeline clients can close before end of May.'}</p>
        <p>{zh ? '🪙 Stripe 提现:每周一自动转账。' : '🪙 Stripe payout: auto-transferred every Monday.'}</p>
      </div>
    </div>
  )
}

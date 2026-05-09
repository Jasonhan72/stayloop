'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'

export default function LandlordAgentHome() {
  return (
    <WorkspaceShell role="landlord" aside={<LandlordAside />}>
      <div className="mb-9 flex items-center gap-4">
        <span className="orb landlord pulse h-14 w-14" style={{ color: '#047857' }} />
        <div>
          <div className="text-[28px] font-bold leading-tight tracking-tight">Logic</div>
          <div className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand-bright" />
            ACTIVE · 已扫描申请
          </div>
        </div>
      </div>

      <h1 className="text-[36px] font-bold leading-tight tracking-tight">
        早上好 Mike，<br />
        88 Harbour 收到 <span className="text-brand">7 份意向</span>，
        我建议你先看 <span className="text-brand">3 份</span>。
      </h1>
      <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-body-2">
        我已经按你设的 Tier 3 / 信用 ≥ 720 / DTI ≤ 35% 筛过一遍。
        7 份意向里 3 份完整匹配，1 份 Tier 2 但材料齐全你可以决定要不要破例，3 份不达标。
      </p>

      {/* KPI row */}
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="本月待租" value="2 套" delta="+1 自上周" />
        <Kpi label="收到意向" value="14 份" delta="+5 今天" />
        <Kpi label="平均决策时长" value="11h" delta="−3h vs 平均" warn />
      </div>

      {/* Pending */}
      <SectionH>等你确认</SectionH>
      <div className="rounded-2xl border border-brand bg-white p-6 shadow-[0_0_0_1px_rgba(4,120,87,0.22),0_6px_18px_rgba(4,120,87,0.06)]">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-brand">
          PENDING APPROVAL
        </div>
        <h3 className="mt-2 text-[18px] font-bold tracking-tight">
          要不要我把 88 Harbour 的电子租约寄给 Mia Wang？
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          Mia (Tier 3, 92% match, 信用 758, 月入 $11k) 已通过 3-way 比较。
          租约草稿基于你 5 月 1 日批的模板 + 88 Harbour 的特殊条款（宠物保证金 $500）。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="sl-btn-primary !py-[10px] !px-4 !text-[13.5px]">
            ✓ 寄出租约
          </button>
          <button className="rounded-lg border border-line-strong bg-white px-4 py-[9px] text-[13.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
            先让我看看条款
          </button>
        </div>
      </div>

      {/* Top applicants */}
      <SectionH>顶部 3 位申请人</SectionH>
      <div className="space-y-2">
        {[
          { n: 'Mia Wang',   av: 'M', avc: 'tenant',   t: 3, score: 92, qual: '收入 ✓ 信用 ✓ 法庭 ✓' },
          { n: 'David Park', av: 'D', avc: 'agent',    t: 3, score: 87, qual: '收入 ✓ 信用 ✓ 上家 5⭐' },
          { n: 'Lina Chen',  av: 'L', avc: 'landlord', t: 2, score: 81, qual: '材料齐 · 短租意向 · 可议价', warn: true },
        ].map((a) => (
          <div
            key={a.n}
            className="grid grid-cols-[44px_1fr_140px_90px] items-center gap-4 rounded-xl border border-line-divider bg-white p-4 transition hover:border-brand/40 hover:shadow-md"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold text-white"
              style={{
                background:
                  a.avc === 'tenant'
                    ? 'linear-gradient(135deg,#C4B5FD,#7C3AED)'
                    : a.avc === 'agent'
                      ? 'linear-gradient(135deg,#93C5FD,#2563EB)'
                      : 'linear-gradient(135deg,#FDBA74,#EA580C)',
              }}
            >
              {a.av}
            </span>
            <div>
              <div className="text-[15px] font-bold">{a.n}</div>
              <div className="font-mono text-[11px] text-body-3">88 Harbour · 5/22 起 · 12mo</div>
              <div
                className={
                  'mt-1 font-mono text-[11.5px] ' + (a.warn ? 'text-warning' : 'text-success')
                }
              >
                {a.qual}
              </div>
            </div>
            <span className={`tier-badge t${a.t}`}>TIER {a.t}</span>
            <div className="text-right">
              <div className="font-mono text-[24px] font-bold">{a.score}</div>
              <div className="font-mono text-[10px] font-bold uppercase text-body-3">
                MATCH
              </div>
            </div>
          </div>
        ))}
        <Link
          href="/landlord/applicants"
          className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
        >
          查看全部 7 份意向 →
        </Link>
      </div>
    </WorkspaceShell>
  )
}

function Kpi({ label, value, delta, warn }: { label: string; value: string; delta: string; warn?: boolean }) {
  return (
    <div className="sl-card p-5">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
        {label}
      </div>
      <div className={'mt-1 text-[28px] font-bold tracking-tight ' + (warn ? 'text-warning' : '')}>
        {value}
      </div>
      <div className="mt-1 font-mono text-[11.5px] text-success">{delta}</div>
    </div>
  )
}

function SectionH({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-8 flex items-center gap-3">
      <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {children}
      </span>
      <span className="h-px flex-1 bg-line-divider" />
    </div>
  )
}

function LandlordAside() {
  return (
    <>
      <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        LOGIC 记得 · 关于你的政策
      </h4>
      <div className="mt-3 divide-y divide-dashed divide-line-divider">
        {[
          { k: 'TIER',     v: '默认 Tier 3 起申 · 88 Harbour 提至 T3' },
          { k: 'CREDIT',   v: '最低 720 · 分数 < 720 → 自动降级提示' },
          { k: 'DTI',      v: '租金 / 收入 ≤ 35%' },
          { k: 'PETS',     v: '猫 ✓ · 狗 仅小型 + $500 押金' },
          { k: 'TERM',     v: '12 个月起 · 拒绝 < 6 个月' },
        ].map((m) => (
          <div key={m.k} className="grid grid-cols-[60px_1fr] items-baseline gap-3 py-2">
            <span className="font-mono text-[10px] font-bold text-brand">{m.k}</span>
            <span className="text-[12.5px] leading-snug text-body">{m.v}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-line-divider bg-surface-chip p-4">
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          市场比较
        </div>
        <h4 className="mt-2 text-[14px] font-bold">88 Harbour 现价位于市场上 35%</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-body-2">
          类似户型最近 30 天平均 $3,520 · 你的房源 $3,450。Logic 建议保持。
        </p>
      </div>
    </>
  )
}

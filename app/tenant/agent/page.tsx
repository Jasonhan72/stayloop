'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { SAMPLE_LISTINGS } from '@/lib/sampleListings'

export default function TenantAgentHome() {
  const recommendations = SAMPLE_LISTINGS.slice(0, 4)

  return (
    <WorkspaceShell role="tenant" aside={<TenantAside />}>
      {/* Agent header */}
      <div className="mb-9 flex items-center gap-4">
        <span className="orb tenant pulse h-14 w-14" style={{ color: '#7C3AED' }} />
        <div>
          <div className="text-[28px] font-bold leading-tight tracking-tight">Luna</div>
          <div className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand-bright" />
            ACTIVE · LISTENING
          </div>
        </div>
      </div>

      {/* Big narrative */}
      <h1 className="text-[36px] font-bold leading-tight tracking-tight">
        Mia，我帮你看了 <span className="text-brand">28 套</span> 房，
        <br />
        其中 <span className="text-brand">4 套</span> 真的值得你看。
      </h1>
      <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-body-2">
        基于你周五说的预算 ($3,200) 和上周三在 The Annex 看的两套，我刷了今天新上的 28 套 ——
        筛掉了价格偏高、Tier 不匹配、和你已 dismiss 的房型，留下 4 套真值得你看。
      </p>

      {/* Pending action */}
      <div className="mt-8 rounded-2xl border border-brand bg-white p-6 shadow-[0_0_0_1px_rgba(4,120,87,0.22),0_6px_18px_rgba(4,120,87,0.06)]">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-brand">
          PENDING APPROVAL · 等你确认
        </div>
        <h3 className="mt-2 text-[18px] font-bold tracking-tight">
          要不要我替你向 88 Harbour St 提交看房意向？
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          我已经按你的口味起草了一段意向说明（突出 12 个月稳定租期 + 安静两人）。
          房东开放周日 2-5pm。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="sl-btn-primary !py-[10px] !px-4 !text-[13.5px]">
            ✓ 确认 · 替我提交
          </button>
          <button className="rounded-lg border border-line-strong bg-white px-4 py-[9px] text-[13.5px] font-semibold text-body transition hover:border-brand hover:text-brand">
            先让我看看草稿
          </button>
          <button className="rounded-lg border border-warning/40 bg-white px-4 py-[9px] text-[13.5px] font-semibold text-warning transition hover:bg-warning/5">
            跳过这套
          </button>
        </div>
      </div>

      {/* Workflow */}
      <SectionH>当前进度</SectionH>
      <div className="sl-card p-6">
        <Wf state="done" name="Tier 1 · ID 验证" desc="Apr 28 · Persona ✓" stat="DONE" />
        <Wf state="done" name="设定偏好 · The Annex / 2BR / $3,200" desc="May 3 · 25 min 对话" stat="DONE" />
        <Wf state="now"  name="筛选房源 + 提交意向" desc="今天 · 4 套待你确认" stat="NOW" />
        <Wf state="next" name="申请 → 房东审核 → 看房" desc="收到邀请后启动" stat="NEXT" />
        <Wf state="next" name="电子签约 + 入住" desc="一切顺利时 5/22 入住" stat="NEXT" />
      </div>

      {/* Recommendations */}
      <SectionH>Luna 今天为你筛的 4 套</SectionH>
      <div className="grid gap-4 sm:grid-cols-2">
        {recommendations.map((l) => {
          const [a, b] = l.thumb.split('|')
          return (
            <Link
              key={l.slug}
              href={`/listings/${l.slug}`}
              className="sl-card overflow-hidden transition lift-hover"
            >
              <div
                className="relative h-32 w-full"
                style={{ background: `linear-gradient(135deg,${a},${b})` }}
              >
                <div className="absolute left-3 top-3 rounded-md bg-tenant px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                  {l.match}% MATCH
                </div>
              </div>
              <div className="p-4">
                <div className="text-[16px] font-bold">${l.monthly_rent.toLocaleString()}/mo</div>
                <div className="text-[12px] text-body-3">{l.address} · {l.neighborhood}</div>
                <div className="mt-2 flex gap-2">
                  <span className="sl-chip">{l.bedrooms === 0 ? 'Studio' : `${l.bedrooms}BR`}</span>
                  <span className="sl-chip">{l.bathrooms} BA</span>
                  <span className={`tier-badge t${l.trustTier}`}>T{l.trustTier}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </WorkspaceShell>
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

function Wf({
  state,
  name,
  desc,
  stat,
}: {
  state: 'done' | 'now' | 'next'
  name: string
  desc: string
  stat: string
}) {
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-t border-dashed border-line-divider py-3 first:border-0 first:pt-0">
      <span
        className={
          'flex h-[22px] w-[22px] items-center justify-center rounded-full text-[12px] font-bold ' +
          (state === 'done'
            ? 'bg-brand/15 text-success'
            : state === 'now'
              ? 'bg-brand text-white shadow-[0_0_0_4px_rgba(4,120,87,0.15)]'
              : 'bg-line-divider text-body-4')
        }
      >
        {state === 'done' ? '✓' : state === 'now' ? '·' : ''}
      </span>
      <div>
        <div className={'text-[14px] font-semibold ' + (state === 'now' ? 'text-brand' : 'text-body')}>
          {name}
        </div>
        <div className="text-[12px] text-body-3">{desc}</div>
      </div>
      <span className="font-mono text-[11px] text-body-3">{stat}</span>
    </div>
  )
}

function TenantAside() {
  return (
    <>
      <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        LUNA 记得 · 关于你
      </h4>
      <div className="mt-3 divide-y divide-dashed divide-line-divider">
        {[
          { k: 'BUDGET', v: '$3,000–3,400 · 工作两年' },
          { k: 'AREA',   v: 'The Annex · King West · Harbourfront' },
          { k: 'BEDS',   v: '2BR · in-unit laundry · 不要狗' },
          { k: 'HABIT',  v: '在家工作 · 安静 · 不抽烟' },
          { k: 'TIER',   v: 'Tier 1 完成 · 周末升 Tier 2' },
        ].map((m) => (
          <div key={m.k} className="grid grid-cols-[60px_1fr] items-baseline gap-3 py-2">
            <span className="font-mono text-[10px] font-bold text-brand">{m.k}</span>
            <span className="text-[12.5px] leading-snug text-body">{m.v}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-line-divider bg-surface-chip p-4">
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          NEXT NUDGE
        </div>
        <h4 className="mt-2 text-[14px] font-bold">升级到 Tier 2 解锁 12 套房源</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-body-2">
          上传一张工资单或连接 Plaid，5 分钟搞定。
        </p>
        <Link
          href="/tenant/passport"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] font-bold text-brand"
        >
          OPEN PASSPORT →
        </Link>
      </div>
    </>
  )
}

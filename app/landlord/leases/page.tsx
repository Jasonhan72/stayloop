'use client'

import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useT, type Lang } from '@/lib/i18n'

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
    nextRenewal: { zh: '续约提醒已发', en: 'Renewal reminder sent' },
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
    nextRenewal: { zh: '续约决策包待审', en: 'Renewal pack awaiting review' },
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
    nextRenewal: { zh: '续约 — 月租中', en: 'Renewed — month-to-month' },
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
    nextRenewal: { zh: '等待租客签字', en: 'Awaiting tenant signature' },
  },
]

const ACTIVITY = [
  { time: { zh: '今天 09:14', en: 'Today 09:14' }, text: { zh: 'Logic 已生成 L-205 续约草稿（Ontario LTB 标准租约），等待你审阅。', en: 'Logic has drafted the L-205 renewal (Ontario LTB Standard Lease), awaiting your review.' } },
  { time: { zh: '昨天 16:30', en: 'Yesterday 16:30' }, text: { zh: 'L-198 转入 month-to-month。Kevin Tran 同意上调 $80/月。', en: 'L-198 moved to month-to-month. Kevin Tran agreed to a $80/mo increase.' } },
  { time: { zh: '5/4 11:00', en: '5/4 11:00' }, text: { zh: 'L-209 已发送给 Anna L. e-sign。', en: 'L-209 sent to Anna L. for e-sign.' } },
  { time: { zh: '5/2 10:00', en: '5/2 10:00' }, text: { zh: 'L-202 第 11 个月按时入账 — 认证信任记录 +1。', en: 'L-202 month 11 paid on time — trust record +1.' } },
]

export default function LandlordLeasesPage() {
  const { lang } = useT()
  const active = LEASES.filter((l) => l.status === 'active')
  const pending = LEASES.filter((l) => l.status === 'pending')
  const expired = LEASES.filter((l) => l.status === 'expired')

  return (
    <WorkspaceShell role="landlord" aside={<RailAside lang={lang} />}>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-landlord">
            LANDLORD · LEASES
          </div>
          <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[36px]">{lang === 'zh' ? '租约管理' : 'Lease management'}</h1>
          <p className="mt-1 text-[13.5px] text-body-2">
            {lang === 'zh'
              ? 'Ontario LTB 标准租约 · RTA 条款自动校验 · 续约 / 涨租通知一键发送'
              : 'Ontario LTB Standard Lease · automatic RTA clause checks · one-click renewal / rent-increase notices'}
          </p>
        </div>
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13px]">
          {lang === 'zh' ? '+ 起草新租约' : '+ Draft new lease'}
        </button>
      </div>

      <RenewalPack lang={lang} />

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={lang === 'zh' ? '活跃租约' : 'Active leases'} value={active.length} accent="#047857" />
        <Stat label={lang === 'zh' ? '待签字' : 'Awaiting signature'} value={pending.length} accent="#B45309" />
        <Stat label={lang === 'zh' ? '本月到期' : 'Expiring this month'} value={1} accent="#71717A" />
      </div>

      {/* Active section */}
      <section className="mt-10">
        <SectionHead
          title={lang === 'zh' ? '活跃租约' : 'Active leases'}
          eyebrow="ACTIVE"
          count={active.length}
          right={lang === 'zh' ? '按到期日 ↑' : 'By end date ↑'}
        />
        <LeaseList items={active} lang={lang} />
      </section>

      <section className="mt-10">
        <SectionHead
          title={lang === 'zh' ? '等待签字' : 'Awaiting signature'}
          eyebrow="PENDING"
          count={pending.length}
          right={lang === 'zh' ? '本月新增 1' : '1 new this month'}
        />
        <LeaseList items={pending} lang={lang} />
      </section>

      <section className="mt-10">
        <SectionHead
          title={lang === 'zh' ? '已结束 / 月租中' : 'Ended / month-to-month'}
          eyebrow="EXPIRED"
          count={expired.length}
          right={lang === 'zh' ? '近 6 个月' : 'Last 6 months'}
        />
        <LeaseList items={expired} lang={lang} />
      </section>
    </WorkspaceShell>
  )
}

function RenewalPack({ lang }: { lang: Lang }) {
  const DIMS = [
    { k: { zh: '租客评级', en: 'Tenant rating' }, v: 'A+', d: { zh: '12/12 准时 · 0 投诉 · 0 维修延迟', en: '12/12 on time · 0 complaints · 0 repair delays' }, accent: '#047857' },
    { k: { zh: '市场租金', en: 'Market rent' }, v: '$3,400', d: { zh: '区域 +6% · 同栋 unit 4F 3 月以 $3,420 出租', en: 'Area +6% · unit 4F in same building leased at $3,420 in March' }, accent: '#171717' },
    { k: { zh: '空置成本', en: 'Vacancy cost' }, v: { zh: '$3,200 × 1.5 月', en: '$3,200 × 1.5 mo' }, d: { zh: '区域平均空置 45 天 · 你历史 22 天', en: 'Area avg vacancy 45 days · your history 22 days' }, accent: '#B45309' },
  ]
  const OPTIONS = [
    { tag: { zh: 'A · 保守', en: 'A · Conservative' }, price: { zh: '$3,200 · 不涨', en: '$3,200 · no increase' }, note: { zh: '他大概率续。但你年付损失 $2,400 vs 市场。', en: 'He very likely renews. But you lose $2,400/yr vs market.' }, hot: false },
    { tag: { zh: 'B · 推荐 · 平衡', en: 'B · Recommended · Balanced' }, price: { zh: '$3,296 · +3%', en: '$3,296 · +3%' }, note: { zh: '略低于市场 · 留温度。Thompson 历史接受度高。', en: 'Slightly below market · keeps goodwill. Thompson historically accepts.' }, hot: true },
    { tag: { zh: 'C · 激进', en: 'C · Aggressive' }, price: { zh: '$3,400 · +6.25%', en: '$3,400 · +6.25%' }, note: { zh: '完全市场价。Thompson 60% 续 · 40% 离开。', en: 'Full market price. Thompson 60% renew · 40% leave.' }, hot: false },
  ]
  return (
    <section className="mb-10 sl-card overflow-hidden p-7">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-landlord">
        {lang === 'zh' ? '续约决策包 · LIBERTY VILLAGE 2B' : 'RENEWAL PACK · LIBERTY VILLAGE 2B'}
      </div>
      <h2 className="mt-2 text-[22px] font-bold tracking-tight">
        {lang === 'zh'
          ? 'Thompson 租期 6/30 到期 · 续不续？涨多少？'
          : 'Thompson’s lease ends 6/30 · Renew? By how much?'}
      </h2>
      <p className="mt-1 text-[13.5px] text-body-2">
        {lang === 'zh'
          ? 'Logic 整理了 4 个数据维度 + 3 个建议方案。你 1 click 就好。'
          : 'Logic has compiled 4 data dimensions + 3 suggested options. One click is all it takes.'}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {DIMS.map((d) => (
          <div key={d.k.en} className="rounded-xl bg-surface-chip p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{d.k[lang]}</div>
            <div className="mt-1 text-[20px] font-extrabold tracking-tight" style={{ color: d.accent }}>{typeof d.v === 'string' ? d.v : d.v[lang]}</div>
            <div className="mt-1 text-[11.5px] leading-snug text-body-2">{d.d[lang]}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">{lang === 'zh' ? 'Logic 给你 3 个方案' : 'Logic offers 3 options'}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <div
            key={o.tag.en}
            className={'rounded-xl border p-4 ' + (o.hot ? 'border-landlord bg-landlord/[0.06]' : 'border-line-divider bg-white')}
          >
            <div className={'font-mono text-[11px] font-bold ' + (o.hot ? 'text-landlord' : 'text-body-3')}>{o.tag[lang]}</div>
            <div className="mt-1 text-[16px] font-bold tracking-tight">{o.price[lang]}</div>
            <div className="mt-1.5 text-[11.5px] leading-snug text-body-2">{o.note[lang]}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-landlord/20 bg-landlord/5 px-3 py-3">
        <span className="h-5 w-5 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #6EE7B7, #047857 70%)' }} />
        <div className="text-[12.5px] leading-relaxed text-body-2">
          {lang === 'zh' ? (
            <>
              <b className="text-body">Logic 解读：</b>B 方案是过去 3 年你这种「A 级租客」的最优 ROI。Thompson 价值 = 准时 + 0 维修争议 + 邻里好评 = 隐性 $5k+/年。
              <br />
              <span className="text-body-3">注：Ontario 2026 涨幅上限 2.5%,但你这套 2018 后建,不在限制内 — 任何涨幅合法。</span>
            </>
          ) : (
            <>
              <b className="text-body">Logic’s read: </b>Option B is the best ROI for an A-grade tenant like this over the past 3 years. Thompson’s value = on time + 0 repair disputes + good neighbor reviews = a hidden $5k+/yr.
              <br />
              <span className="text-body-3">Note: Ontario’s 2026 increase cap is 2.5%, but this unit was built post-2018 and is exempt — any increase is legal.</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="sl-btn-primary !px-5 !py-[12px] !text-[13.5px]">{lang === 'zh' ? '✓ 用 B · $3,296 · 起草续约函发给 Thompson' : '✓ Use B · $3,296 · draft renewal letter for Thompson'}</button>
        <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[12px] text-[13.5px] font-semibold text-body hover:border-brand hover:text-brand">{lang === 'zh' ? '改方案' : 'Adjust option'}</button>
        <button className="rounded-[10px] border border-line-strong bg-white px-4 py-[12px] text-[13.5px] font-semibold text-body-3">{lang === 'zh' ? '不续约' : 'Don’t renew'}</button>
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

function LeaseList({ items, lang }: { items: typeof LEASES; lang: Lang }) {
  if (items.length === 0) {
    return (
      <div className="sl-card p-8 text-center text-[13.5px] text-body-3">
        {lang === 'zh' ? '暂无 — 这里会列出对应状态的租约。' : 'None yet — leases with this status will appear here.'}
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
              {lang === 'zh' ? '月租' : 'Monthly rent'}
            </div>
            <div className="font-bold">${l.rent.toLocaleString()}</div>
            <div className="text-[11.5px] text-body-2">{lang === 'zh' ? '按时' : 'On time'} {l.onTime}</div>
          </div>
          <div className="hidden text-[13px] sm:block">
            <StatusPill status={l.status} />
            <div className="mt-1 text-[12px] text-body-2">{l.nextRenewal[lang]}</div>
          </div>
          <Link
            href="#"
            className="rounded-[10px] border border-line-strong bg-white px-4 py-[8px] text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {lang === 'zh' ? '打开 →' : 'Open →'}
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

function RailAside({ lang }: { lang: Lang }) {
  return (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {lang === 'zh' ? '最近活动' : 'Recent activity'}
      </div>
      <ul className="mt-3 space-y-4">
        {ACTIVITY.map((a, i) => (
          <li key={i} className="border-l-2 border-line-divider pl-3">
            <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
              {a.time[lang]}
            </div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">{a.text[lang]}</div>
          </li>
        ))}
      </ul>

      <div className="mt-8 sl-card p-4">
        <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {lang === 'zh' ? 'LTB 提醒' : 'LTB reminder'}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
          {lang === 'zh' ? (
            <>
              安省 2026 涨租上限为 <b>2.5%</b>。但 2018 年 11 月后首次入住的单位不受限 —
              Logic 会先判断房龄，再决定是否套用。
            </>
          ) : (
            <>
              Ontario’s 2026 rent-increase cap is <b>2.5%</b>. But units first occupied after November 2018 are exempt —
              Logic checks the unit’s age first, then decides whether the cap applies.
            </>
          )}
        </p>
        <Link
          href="#"
          className="mt-3 inline-block text-[12px] font-semibold text-brand hover:underline"
        >
          {lang === 'zh' ? '查看 N1 / N2 通知模板 →' : 'View N1 / N2 notice templates →'}
        </Link>
      </div>
    </div>
  )
}

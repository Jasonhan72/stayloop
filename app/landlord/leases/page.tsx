'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  AsideBlock,
  EmptyState,
  PageHeader,
  SectionCard,
  StatStrip,
  StatusPill,
  Table,
  Td,
  Tr,
  type PillTone,
} from '@/components/workspace'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import { downloadCsv, toCsv } from '@/lib/csv'
import { daysBetween, monthsBetween, parseDateOnly, todayUtc } from '@/lib/dates'

// A real lease row from lease_documents, mapped to the display shape.
type LeaseItem = {
  id: string
  tenant: string
  unit: string
  rent: number
  start: string
  end: string
  status: 'active' | 'pending' | 'expired'
  onTime: string
  monthsLeft: number
  nextRenewal: { zh: string; en: string }
}

function mapDbLease(row: {
  id: string; tenant_name: string | null; tenant_email: string | null
  unit_label: string | null; monthly_rent: number | null
  start_date: string | null; end_date: string | null; status: string | null
}, aiName: string): LeaseItem {
  const status: LeaseItem['status'] =
    row.status === 'active' || row.status === 'signed_both' ? 'active'
    : row.status === 'ended' ? 'expired'
    : 'pending'
  const end = parseDateOnly(row.end_date)
  const now = todayUtc()
  const monthsLeft = end ? monthsBetween(now, end) : 0
  const daysToEnd = end ? daysBetween(now, end) : Infinity
  const inWindow = status === 'active' && daysToEnd <= 120 && daysToEnd >= 0
  return {
    id: row.id,
    tenant: row.tenant_name || row.tenant_email || '—',
    unit: row.unit_label || '—',
    rent: Number(row.monthly_rent) || 0,
    start: row.start_date || '—',
    end: row.end_date || '—',
    status,
    onTime: '—',
    monthsLeft,
    nextRenewal: inWindow
      ? { zh: `续约窗口已开 · ${aiName} 已在工作台准备方案`, en: `Renewal window open · ${aiName} prepared options in your workspace` }
      : { zh: '—', en: '—' },
  }
}

const LEASES: LeaseItem[] = [
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

// E-sign progress for leases already out for signature. Keyed by lease id so
// live rows (which carry no e-sign trail yet) simply render a dash.
const SIGNING: Record<string, { sent: string; landlord: boolean; tenant: boolean; days: number }> = {
  'L-209': { sent: '5/4 11:00', landlord: true, tenant: false, days: 4 },
}

// Ontario LTB notice forms the landlord can actually reach for. Each one
// states its own timing rule; the rent-increase cap is never shown without
// the post-2018 exemption beside it.
const N_FORMS: { code: string; title: { zh: string; en: string }; rule: { zh: string; en: string }; prompt: { zh: string; en: string } }[] = [
  {
    code: 'N1',
    title: { zh: '涨租', en: 'Rent increase' },
    rule: {
      zh: '提前 90 天 · 12 个月一次 · 2026 指导上限 2.5%',
      en: '90 days notice · once per 12 months · 2026 guideline cap 2.5%',
    },
    prompt: {
      zh: '帮我准备一份 N1 涨租通知，检查 90 天提前期、12 个月间隔和 2026 指导上限 2.5% 是否满足。',
      en: 'Prepare an N1 rent-increase notice for me and check the 90-day notice period, the 12-month interval and the 2026 guideline cap of 2.5%.',
    },
  },
  {
    code: 'N2',
    title: { zh: '豁免单位涨租', en: 'Rent increase · exempt unit' },
    rule: {
      zh: '2018 年 11 月后首次入住的单位不受指导上限约束',
      en: 'Units first occupied after November 2018 are exempt from the guideline cap',
    },
    prompt: {
      zh: '我的单位是 2018 年 11 月之后首次入住，帮我准备 N2 涨租通知，并确认豁免条件成立。',
      en: 'My unit was first occupied after November 2018 — prepare an N2 rent-increase notice and confirm the exemption applies.',
    },
  },
  {
    code: 'N4',
    title: { zh: '欠租', en: 'Non-payment of rent' },
    rule: { zh: '到期后 5 天宽限期届满才可送达', en: 'Serve only after the 5-day grace period following the due date' },
    prompt: {
      zh: '帮我准备 N4 欠租通知，核对到期日、5 天宽限期和欠款金额。',
      en: 'Prepare an N4 non-payment notice and verify the due date, the 5-day grace period and the arrears amount.',
    },
  },
  {
    code: 'N12',
    title: { zh: '房东自用', en: "Landlord's own use" },
    rule: { zh: '到期前 90 天送达 · 需支付一个月补偿', en: 'Serve 90 days before term end · one month compensation required' },
    prompt: {
      zh: '帮我准备 N12 房东自用通知，核对 90 天提前期和一个月补偿要求。',
      en: 'Prepare an N12 notice for landlord’s own use and verify the 90-day notice period and the one-month compensation requirement.',
    },
  },
]

const ACTIVITY = (aiName: string) => [
  { time: { zh: '今天 09:14', en: 'Today 09:14' }, text: { zh: `${aiName} 已生成 L-205 续约草稿（Ontario LTB 标准租约），等待你审阅。`, en: `${aiName} has drafted the L-205 renewal (Ontario LTB Standard Lease), awaiting your review.` } },
  { time: { zh: '昨天 16:30', en: 'Yesterday 16:30' }, text: { zh: 'L-198 转入 month-to-month。Kevin Tran 同意上调 $80/月。', en: 'L-198 moved to month-to-month. Kevin Tran agreed to a $80/mo increase.' } },
  { time: { zh: '5/4 11:00', en: '5/4 11:00' }, text: { zh: 'L-209 已发送给 Anna L. e-sign。', en: 'L-209 sent to Anna L. for e-sign.' } },
  { time: { zh: '5/2 10:00', en: '5/2 10:00' }, text: { zh: 'L-202 第 11 个月按时入账 — 护照信任记录 +1。', en: 'L-202 month 11 paid on time — trust record +1.' } },
]

function downloadCSV(lang: Lang, rows: LeaseItem[]) {
  const header = lang === 'zh'
    ? '租约编号,租客,单元,月租,开始日期,结束日期,状态,按时率'
    : 'Lease ID,Tenant,Unit,Monthly Rent,Start Date,End Date,Status,On-time Rate'
  const csv = toCsv(
    header.split(','),
    rows.map(l => [l.id, l.tenant, l.unit, l.rent, l.start, l.end, l.status, l.onTime]),
  )
  downloadCsv(`stayloop-leases-${new Date().toISOString().slice(0, 10)}.csv`, csv)
}

export default function LandlordLeasesPage() {
  const { lang } = useT()
  const router = useRouter()
  const { landlord, loading: authLoading } = useLandlord()
  const aiName = useAIName('landlord')

  // Real leases from lease_documents (RLS-scoped). While the user has none,
  // the design-canon demo fixtures render with an explicit 示范数据 notice.
  const [realLeases, setRealLeases] = useState<LeaseItem[] | null>(null)
  const [showEntry, setShowEntry] = useState(false)
  const loadLeases = useCallback(async () => {
    if (!landlord) return
    const { data, error } = await supabase
      .from('lease_documents')
      .select('id, tenant_name, tenant_email, unit_label, monthly_rent, start_date, end_date, status')
      .order('end_date', { ascending: true })
    if (!error && data) setRealLeases(data.map((row) => mapDbLease(row, aiName)))
  }, [landlord, aiName])
  useEffect(() => { void loadLeases() }, [loadLeases])

  const liveMode = (realLeases?.length ?? 0) > 0
  const rows: LeaseItem[] = liveMode ? realLeases! : LEASES
  const active = rows.filter((l) => l.status === 'active')
  const pending = rows.filter((l) => l.status === 'pending')
  const expired = rows.filter((l) => l.status === 'expired')
  const now = todayUtc()
  const expiringSoon = active.filter((l) => {
    const end = parseDateOnly(l.end)
    return !!end && end.getUTCFullYear() === now.getUTCFullYear() && end.getUTCMonth() === now.getUTCMonth()
  }).length
  // Leases that still bill going forward — the basis for the annualized rent
  // and the average remaining term (ended / month-to-month rows are excluded).
  const billing = [...active, ...pending]
  const avgMonthsLeft = billing.length
    ? (billing.reduce((s, l) => s + l.monthsLeft, 0) / billing.length).toFixed(1)
    : '0.0'

  // The renewal-window notice is advisory — it now lives in the right rail
  // instead of pushing the lease list below the fold (design/v9-workspace-*).
  const renewalNotice: ReactNode =
    liveMode && expiringSoon >= 0 && active.some((l) => l.nextRenewal.zh !== '—') ? (
      <div className="rounded-xl border border-landlord/25 bg-landlord/[0.05] p-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 h-5 w-5 flex-none rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #6EE7B7, #047857 70%)' }} />
          <div className="text-[12.5px] leading-relaxed text-body-2">
            {lang === 'zh'
              ? <>有租约进入续约窗口。{aiName} 已在<Link href="/landlord/agent" className="mx-1 font-semibold text-landlord underline underline-offset-2">你的工作台</Link>准备好方案（不涨 / 指导上限 +2.5%）—— 批准后续约函会真实发送给租客。</>
              : <>A lease entered its renewal window. {aiName} prepared options in <Link href="/landlord/agent" className="mx-1 font-semibold text-landlord underline underline-offset-2">your workspace</Link> — approve and the renewal letter is actually sent to your tenant.</>}
          </div>
        </div>
      </div>
    ) : null

  return (
    <WorkspaceShell role="landlord" aside={<RailAside lang={lang} aiNotice={renewalNotice} />}>
      {!liveMode && !authLoading && (
        <div className="mb-3 rounded-xl border border-line-strong bg-surface-chip px-4 py-2.5 font-mono text-[11px] leading-relaxed text-body-3">
          {lang === 'zh'
            ? `示范数据 · 录入你的第一份真实租约后，此页与 ${aiName} 的续约提醒将切换为你的真实数据`
            : `SAMPLE DATA · enter your first real lease and this page plus ${aiName}’s renewal alerts switch to your live records`}
        </div>
      )}
      <PageHeader
        title={lang === 'zh' ? '租约管理' : 'Lease management'}
        sub={
          <>
            <span className="font-mono text-[11px] uppercase tracking-eyebrow text-landlord">LANDLORD · LEASES</span>
            <span className="mx-1.5 text-body-3">·</span>
            {lang === 'zh'
              ? 'Ontario LTB 标准租约 · RTA 条款自动校验 · 续约 / 涨租通知一键发送'
              : 'Ontario LTB Standard Lease · automatic RTA clause checks · one-click renewal / rent-increase notices'}
          </>
        }
        actions={
          <>
            <button
              onClick={() => downloadCSV(lang, rows)}
              className="rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
            >
              {lang === 'zh' ? '导出 CSV' : 'Export CSV'}
            </button>
            {landlord && (
              <button
                onClick={() => setShowEntry(true)}
                className="rounded-[10px] border border-landlord bg-landlord/10 px-4 py-2 text-[12.5px] font-semibold text-landlord transition hover:bg-landlord/20"
              >
                {lang === 'zh' ? '＋ 录入现有租约' : '+ Enter existing lease'}
              </button>
            )}
            <button
              onClick={() => router.push('/landlord/leases/new')}
              className="sl-btn-primary !px-4 !py-2 !text-[12.5px]"
            >
              {lang === 'zh' ? '+ 起草新租约' : '+ Draft new lease'}
            </button>
          </>
        }
      />

      {showEntry && landlord && (
        <LeaseEntryModal
          lang={lang}
          landlordId={landlord.landlordId}
          onClose={() => setShowEntry(false)}
          onSaved={() => { setShowEntry(false); void loadLeases() }}
        />
      )}

      {!liveMode && <RenewalPack lang={lang} />}

      {/* Quick stats */}
      <StatStrip
        stats={[
          { label: lang === 'zh' ? '活跃租约' : 'Active leases', value: String(active.length) },
          { label: lang === 'zh' ? '待签字' : 'Awaiting signature', value: String(pending.length) },
          { label: lang === 'zh' ? '本月到期' : 'Expiring this month', value: String(liveMode ? expiringSoon : 1) },
          {
            label: lang === 'zh' ? '年化租金' : 'Annualized rent',
            value: `$${(billing.reduce((s, l) => s + l.rent, 0) * 12).toLocaleString()}`,
            sub: lang === 'zh' ? '活跃 + 待签字 · 月租 × 12' : 'Active + awaiting signature · rent × 12',
          },
          {
            label: lang === 'zh' ? '平均剩余租期' : 'Avg term remaining',
            value: lang === 'zh' ? `${avgMonthsLeft} 个月` : `${avgMonthsLeft} mo`,
            sub: lang === 'zh' ? '按到期日计算' : 'By end date',
          },
        ]}
      />

      <ExpiryTimeline lang={lang} leases={billing} liveMode={liveMode} />

      <LeaseSection
        title={lang === 'zh' ? '活跃租约' : 'Active leases'}
        eyebrow="ACTIVE"
        count={active.length}
        right={lang === 'zh' ? '按到期日 ↑' : 'By end date ↑'}
        items={active}
        lang={lang}
      />

      <LeaseSection
        title={lang === 'zh' ? '等待签字' : 'Awaiting signature'}
        eyebrow="PENDING"
        count={pending.length}
        right={lang === 'zh' ? '本月新增 1' : '1 new this month'}
        items={pending}
        lang={lang}
        showSigning
      />

      <LeaseSection
        title={lang === 'zh' ? '已结束 / 月租中' : 'Ended / month-to-month'}
        eyebrow="EXPIRED"
        count={expired.length}
        right={lang === 'zh' ? '近 6 个月' : 'Last 6 months'}
        items={expired}
        lang={lang}
      />
    </WorkspaceShell>
  )
}

function RenewalPack({ lang }: { lang: Lang }) {
  const aiName = useAIName('landlord')
  const [selected, setSelected] = useState<number | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [declined, setDeclined] = useState(false)
  const router = useRouter()
  const zh = lang === 'zh'

  const DIMS = [
    { k: { zh: '租客评级', en: 'Tenant rating' }, v: 'A+', d: { zh: '12/12 准时 · 0 投诉 · 0 维修延迟', en: '12/12 on time · 0 complaints · 0 repair delays' }, accent: '#047857' },
    { k: { zh: '市场租金', en: 'Market rent' }, v: '$3,400', d: { zh: '区域 +6% · 同栋 unit 4F 3 月以 $3,420 出租', en: 'Area +6% · unit 4F in same building leased at $3,420 in March' }, accent: '#171717' },
    { k: { zh: '空置成本', en: 'Vacancy cost' }, v: { zh: '$3,200 × 1.5 月', en: '$3,200 × 1.5 mo' }, d: { zh: '区域平均空置 45 天 · 你历史 22 天', en: 'Area avg vacancy 45 days · your history 22 days' }, accent: '#B45309' },
  ]
  const OPTIONS = [
    { tag: { zh: 'A · 保守', en: 'A · Conservative' }, price: { zh: '$3,200 · 不涨', en: '$3,200 · no increase' }, rent: 3200, note: { zh: '他大概率续。但你年付损失 $2,400 vs 市场。', en: 'He very likely renews. But you lose $2,400/yr vs market.' }, hot: false },
    { tag: { zh: 'B · 推荐 · 平衡', en: 'B · Recommended · Balanced' }, price: { zh: '$3,296 · +3%', en: '$3,296 · +3%' }, rent: 3296, note: { zh: '略低于市场 · 留温度。Thompson 历史接受度高。', en: 'Slightly below market · keeps goodwill. Thompson historically accepts.' }, hot: true },
    { tag: { zh: 'C · 激进', en: 'C · Aggressive' }, price: { zh: '$3,400 · +6.25%', en: '$3,400 · +6.25%' }, rent: 3400, note: { zh: '完全市场价。Thompson 60% 续 · 40% 离开。', en: 'Full market price. Thompson 60% renew · 40% leave.' }, hot: false },
  ]

  if (declined) {
    return (
      <SectionCard className="mb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 text-[16px]">✕</span>
          <div>
            <div className="text-[16px] font-bold">{zh ? '已选择不续约 · Thompson · Liberty Village 2B' : 'Chose not to renew · Thompson · Liberty Village 2B'}</div>
            <p className="mt-1 text-[13px] text-body-2">{zh ? `${aiName} 将在到期前 90 天提醒你发送 N12 通知。` : `${aiName} will remind you to issue an N12 notice 90 days before expiry.`}</p>
          </div>
        </div>
        <button onClick={() => { setDeclined(false); setSelected(null); setConfirmed(false) }} className="mt-4 text-[12.5px] font-semibold text-brand hover:underline">
          {zh ? '撤回决定' : 'Undo decision'}
        </button>
      </SectionCard>
    )
  }

  if (confirmed && selected !== null) {
    const opt = OPTIONS[selected]
    return (
      <SectionCard className="mb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700 text-[16px]">✓</span>
          <div>
            <div className="text-[16px] font-bold">{zh ? `已选方案 ${opt.tag[lang]} · $${opt.rent.toLocaleString()}/月` : `Selected ${opt.tag[lang]} · $${opt.rent.toLocaleString()}/mo`}</div>
            <p className="mt-1 text-[13px] text-body-2">{zh ? `${aiName} 正在为 Thompson 起草续约函...` : `${aiName} is drafting the renewal letter for Thompson...`}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Link
            href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `用方案 ${opt.tag[lang]} ($${opt.rent}) 为 Thompson 起草 Liberty Village 2B 的续约函` : `Draft a renewal letter for Thompson at Liberty Village 2B using ${opt.tag[lang]} ($${opt.rent})`)}`}
            className="sl-btn-primary !px-4 !py-[10px] !text-[13px]"
          >
            {zh ? '去工作台查看续约函 →' : 'View renewal letter in your workspace →'}
          </Link>
          <button onClick={() => { setConfirmed(false); setSelected(null) }} className="rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-[13px] font-semibold text-body hover:border-brand hover:text-brand">
            {zh ? '改方案' : 'Change option'}
          </button>
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard className="mb-4">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-landlord">
        {zh ? '续约决策包 · LIBERTY VILLAGE 2B' : 'RENEWAL PACK · LIBERTY VILLAGE 2B'}
      </div>
      <h2 className="mt-1.5 text-[18px] font-bold tracking-tight">
        {zh
          ? 'Thompson 租期 6/30 到期 · 续不续？涨多少？'
          : "Thompson's lease ends 6/30 · Renew? By how much?"}
      </h2>
      <p className="mt-1 text-[13px] text-body-2">
        {zh
          ? `${aiName} 整理了 4 个数据维度 + 3 个建议方案。你 1 click 就好。`
          : `${aiName} has compiled 4 data dimensions + 3 suggested options. One click is all it takes.`}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {DIMS.map((d) => (
          <div key={d.k.en} className="rounded-xl bg-surface-chip p-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrow text-body-3">{d.k[lang]}</div>
            <div className="mt-1 text-[20px] font-extrabold tracking-tight" style={{ color: d.accent }}>{typeof d.v === 'string' ? d.v : d.v[lang]}</div>
            <div className="mt-1 text-[11.5px] leading-snug text-body-2">{d.d[lang]}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? `${aiName} 给你 3 个方案` : `${aiName} offers 3 options`}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o, i) => (
          <button
            key={o.tag.en}
            onClick={() => setSelected(i)}
            className={'rounded-xl border p-3 text-left transition ' + (
              selected === i
                ? 'border-landlord bg-landlord/[0.10] ring-2 ring-landlord/30'
                : o.hot
                  ? 'border-landlord bg-landlord/[0.06] hover:bg-landlord/[0.10]'
                  : 'border-line-divider bg-white hover:border-landlord/40'
            )}
          >
            <div className={'font-mono text-[11px] font-bold ' + (selected === i || o.hot ? 'text-landlord' : 'text-body-3')}>
              {selected === i && '● '}{o.tag[lang]}
            </div>
            <div className="mt-1 text-[16px] font-bold tracking-tight">{o.price[lang]}</div>
            <div className="mt-1.5 text-[11.5px] leading-snug text-body-2">{o.note[lang]}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[28px_1fr] gap-3 rounded-lg border border-landlord/20 bg-landlord/5 px-3 py-3">
        <span className="h-5 w-5 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #6EE7B7, #047857 70%)' }} />
        <div className="text-[12.5px] leading-relaxed text-body-2">
          {zh ? (
            <>
              <b className="text-body">{aiName} 解读：</b>B 方案是过去 3 年你这种「A 级租客」的最优 ROI。Thompson 价值 = 准时 + 0 维修争议 + 邻里好评 = 隐性 $5k+/年。
              <br />
              <span className="text-body-3">
                注：Ontario 2026 涨幅上限 2.5%。豁免看的是「首次住人日期」而不是建成年份 —— 只有 2018-11-15 之后首次作住宅使用的单元才豁免（RTA s.6.1），请先核对这套的首次入住日期再选 B/C。无论是否豁免，涨租都要提前 90 天送达 N1，且距上次涨租满 12 个月。
              </span>
            </>
          ) : (
            <>
              <b className="text-body">{`${aiName}'s read: `}</b>Option B is the best ROI for an A-grade tenant like this over the past 3 years. {"Thompson's"} value = on time + 0 repair disputes + good neighbor reviews = a hidden $5k+/yr.
              <br />
              <span className="text-body-3">
                {
                  "Note: Ontario's 2026 cap is 2.5%. The exemption turns on FIRST RESIDENTIAL OCCUPANCY, not the year built — only units first occupied after Nov 15 2018 are exempt (RTA s.6.1), so confirm this unit's first-occupancy date before choosing B or C. Exempt or not, an increase still requires an N1 served 90 days ahead and 12 months since the last increase."
                }
              </span>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (selected === null) setSelected(1)
            setConfirmed(true)
          }}
          className="sl-btn-primary !px-4 !py-2 !text-[12.5px]"
        >
          {selected !== null
            ? (zh ? `✓ 用 ${OPTIONS[selected].tag[lang]} · $${OPTIONS[selected].rent.toLocaleString()} · 起草续约函` : `✓ Use ${OPTIONS[selected].tag[lang]} · $${OPTIONS[selected].rent.toLocaleString()} · draft renewal`)
            : (zh ? '✓ 用 B · $3,296 · 起草续约函发给 Thompson' : '✓ Use B · $3,296 · draft renewal letter for Thompson')
          }
        </button>
        <button
          onClick={() => setSelected(null)}
          className="rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] font-semibold text-body hover:border-brand hover:text-brand"
        >
          {zh ? '改方案' : 'Adjust option'}
        </button>
        <button
          onClick={() => setDeclined(true)}
          className="rounded-[10px] border border-line-strong bg-white px-4 py-2 text-[12.5px] font-semibold text-body-3 hover:border-red-400 hover:text-red-600"
        >
          {zh ? '不续约' : "Don't renew"}
        </button>
      </div>
    </SectionCard>
  )
}


// Minimal "enter an existing tenancy" form. This is the on-ramp to live
// mode: one real lease and Logic's proactive renewal engine has something
// true to reason about.
function LeaseEntryModal({ lang, landlordId, onClose, onSaved }: {
  lang: Lang
  landlordId: string
  onClose: () => void
  onSaved: () => void
}) {
  const zh = lang === 'zh'
  const aiName = useAIName('landlord')
  const [f, setF] = useState({ tenant_name: '', tenant_email: '', unit_label: '', monthly_rent: '', start_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    if (saving) return
    if (!f.tenant_name.trim() || !f.unit_label.trim() || !f.monthly_rent.trim() || !f.end_date) {
      setErr(zh ? '请填写租客姓名、单元、月租和到期日' : 'Tenant name, unit, rent and end date are required')
      return
    }
    if (f.tenant_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.tenant_email.trim())) {
      setErr(zh ? '租客邮箱格式不对' : 'Tenant email looks invalid')
      return
    }
    setErr(null)
    setSaving(true)
    const { error } = await supabase.from('lease_documents').insert({
      landlord_id: landlordId,
      status: 'active',
      tenant_name: f.tenant_name.trim(),
      tenant_email: f.tenant_email.trim() || null,
      unit_label: f.unit_label.trim(),
      monthly_rent: parseFloat(f.monthly_rent) || null,
      start_date: f.start_date || null,
      end_date: f.end_date,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const field = (label: string, key: keyof typeof f, type = 'text', placeholder = '') => (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-body-2">{label}</span>
      <input
        type={type}
        value={f[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        className="w-full rounded-[10px] border border-line-strong bg-white px-3 py-[10px] text-[13.5px] outline-none focus:border-landlord"
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[18px] font-bold tracking-tight">{zh ? '录入现有租约' : 'Enter an existing lease'}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-body-2">
          {zh
            ? `录入后 ${aiName} 会盯住到期日：进入 90 天续约窗口时自动准备方案，你批准后续约函会真实发送给租客。`
            : `${aiName} watches the end date: when the 90-day renewal window opens it prepares options, and on your approval the renewal letter is actually sent to your tenant.`}
        </p>
        <div className="mt-4 grid gap-3">
          {field(zh ? '租客姓名 *' : 'Tenant name *', 'tenant_name', 'text', zh ? '例如 张伟' : 'e.g. Alex Wong')}
          {field(zh ? '租客邮箱（发送续约函用）' : 'Tenant email (for the renewal letter)', 'tenant_email', 'email', 'tenant@email.com')}
          {field(zh ? '单元 / 地址 *' : 'Unit / address *', 'unit_label', 'text', zh ? '例如 Unit 1207 · 100 Western Battery Rd' : 'e.g. Unit 1207 · 100 Western Battery Rd')}
          {field(zh ? '月租 (CAD) *' : 'Monthly rent (CAD) *', 'monthly_rent', 'number', '2800')}
          <div className="grid grid-cols-2 gap-3">
            {field(zh ? '起租日' : 'Start date', 'start_date', 'date')}
            {field(zh ? '到期日 *' : 'End date *', 'end_date', 'date')}
          </div>
        </div>
        {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err}</div>}
        <div className="mt-5 flex gap-2">
          <button onClick={save} disabled={saving} className="sl-btn-primary flex-1 !py-[11px] !text-[13.5px]">
            {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存租约' : 'Save lease')}
          </button>
          <button onClick={onClose} className="rounded-[10px] border border-line-strong bg-white px-4 py-[11px] text-[13.5px] font-semibold text-body">
            {zh ? '取消' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Twelve-month expiry timeline. Each slot is a calendar month; a lease lands
 * in the month its term ends. Two or more expiries in one month is the shape
 * that hurts (one vacancy window, doubled exposure), so it turns red.
 *
 * The window starts at the earliest upcoming expiry in sample mode and at the
 * current month once real leases are loaded.
 */
function ExpiryTimeline({ lang, leases, liveMode }: { lang: Lang; leases: LeaseItem[]; liveMode: boolean }) {
  const zh = lang === 'zh'
  const aiName = useAIName('landlord')
  const dated = leases
    .map((l) => ({ l, end: parseDateOnly(l.end) }))
    .filter((x): x is { l: LeaseItem; end: Date } => x.end !== null)
  if (dated.length === 0) return null

  const earliest = dated.reduce((a, b) => (a.end < b.end ? a : b)).end
  const anchor = liveMode ? todayUtc() : earliest
  const startY = anchor.getUTCFullYear()
  const startM = anchor.getUTCMonth()

  const slots = Array.from({ length: 12 }, (_, i) => {
    const y = startY + Math.floor((startM + i) / 12)
    const m = (startM + i) % 12
    return {
      y,
      m,
      nextYear: y > startY,
      items: dated.filter((x) => x.end.getUTCFullYear() === y && x.end.getUTCMonth() === m).map((x) => x.l),
    }
  })

  // Longest run of consecutive months that each carry at least one expiry.
  let bestStart = -1
  let bestLen = 0
  let runStart = -1
  for (let i = 0; i <= slots.length; i++) {
    const filled = i < slots.length && slots[i].items.length > 0
    if (filled && runStart < 0) runStart = i
    if (!filled && runStart >= 0) {
      if (i - runStart > bestLen) {
        bestLen = i - runStart
        bestStart = runStart
      }
      runStart = -1
    }
  }
  const run = bestLen >= 2 ? slots.slice(bestStart, bestStart + bestLen) : null
  const runExposure = run
    ? run.reduce((s, sl) => s + sl.items.reduce((t, l) => t + l.rent, 0), 0)
    : 0
  const monthLabel = (s: (typeof slots)[number]) =>
    zh
      ? `${s.nextYear ? '次年 ' : ''}${s.m + 1}月`
      : `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][s.m]}${s.nextYear ? ` ’${String(s.y).slice(2)}` : ''}`

  return (
    <SectionCard
      className="mb-3"
      title={zh ? '到期时间轴 · 未来 12 个月' : 'Expiry timeline · next 12 months'}
      meta={zh ? '同月 2 份以上标红' : '2+ in one month flagged'}
    >
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-12 gap-1.5">
          {slots.map((s) => {
            const crowded = s.items.length >= 2
            return (
              <div
                key={`${s.y}-${s.m}`}
                className={
                  'min-h-[86px] rounded-[8px] border px-2 py-1.5 ' +
                  (crowded
                    ? 'border-danger/40 bg-danger/[0.06]'
                    : s.items.length > 0
                      ? 'border-landlord/30 bg-landlord/[0.06]'
                      : 'border-line-divider bg-surface')
                }
              >
                <div
                  className={
                    'font-mono text-[10px] uppercase tracking-eyebrow ' +
                    (crowded ? 'text-danger' : s.items.length > 0 ? 'text-landlord' : 'text-body-3')
                  }
                >
                  {monthLabel(s)}
                </div>
                {s.items.map((l) => (
                  <div key={l.id} className="mt-1.5">
                    <div className="font-mono text-[10px] font-bold">{l.id}</div>
                    <div className="text-[10.5px] leading-tight text-body-2">{l.unit}</div>
                    <div className="font-mono text-[10.5px] font-semibold">${l.rent.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      {run && (
        <p className="mt-3 rounded-lg bg-surface-chip px-3 py-2.5 text-[12px] leading-relaxed text-body-2">
          {zh
            ? `${run.map((s) => `${s.nextYear ? '次年 ' : ''}${s.m + 1}`).join('-')} 月连续到期，合计 $${runExposure.toLocaleString()}/月敞口 · ${aiName} 建议错开续约起始日。`
            : `Back-to-back expiries across ${run.map(monthLabel).join(' – ')}, $${runExposure.toLocaleString()}/mo of exposure · ${aiName} suggests staggering the renewal start dates.`}
        </p>
      )}
    </SectionCard>
  )
}

// Lease status → the shared status vocabulary. Labels are unchanged.
const LEASE_STATUS: Record<LeaseItem['status'], { tone: PillTone; label: string }> = {
  active: { tone: 'ok', label: 'ACTIVE' },
  pending: { tone: 'pending', label: 'PENDING' },
  expired: { tone: 'neutral', label: 'EXPIRED' },
}

function LeaseSection({
  title,
  eyebrow,
  count,
  right,
  items,
  lang,
  /** Adds the e-sign progress column — only the awaiting-signature lane has one. */
  showSigning,
}: {
  title: string
  eyebrow: string
  count: number
  right?: string
  items: LeaseItem[]
  lang: Lang
  showSigning?: boolean
}) {
  const zh = lang === 'zh'
  return (
    <SectionCard
      className="mb-3"
      padded={false}
      title={
        <>
          {title}
          <span className="ml-2 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
            {eyebrow} · {count}
          </span>
        </>
      }
      meta={right}
    >
      {items.length === 0 ? (
        <EmptyState>
          {lang === 'zh' ? '暂无 — 这里会列出对应状态的租约。' : 'None yet — leases with this status will appear here.'}
        </EmptyState>
      ) : (
        <Table
          head={[
            lang === 'zh' ? '租客' : 'Tenant',
            lang === 'zh' ? '月租' : 'Monthly rent',
            ...(showSigning ? [lang === 'zh' ? '签署状态' : 'Signature status'] : []),
            lang === 'zh' ? '状态' : 'Status',
            '',
          ]}
        >
          {items.map((l) => {
            const s = LEASE_STATUS[l.status]
            return (
              <Tr key={l.id}>
                <Td>
                  <div className="text-[13px] font-semibold">{l.tenant}</div>
                  <div className="text-[12px] text-body-2">{l.unit}</div>
                  <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                    {l.id} · {l.start} → {l.end}
                  </div>
                </Td>
                <Td align="right" mono>
                  <div className="font-semibold">${l.rent.toLocaleString()}</div>
                  <div className="text-[11px] font-normal text-body-2">
                    {lang === 'zh' ? '按时' : 'On time'} {l.onTime}
                  </div>
                </Td>
                {showSigning && (
                  <Td align="right">
                    {SIGNING[l.id] ? (
                      <>
                        <div className="text-[11.5px] leading-snug text-body-2">
                          {zh
                            ? `已发送 ${SIGNING[l.id].sent} · ${SIGNING[l.id].landlord ? '房东已签' : '房东待签'} · ${SIGNING[l.id].tenant ? '租客已签' : '待租客签'}`
                            : `Sent ${SIGNING[l.id].sent} · ${SIGNING[l.id].landlord ? 'landlord signed' : 'landlord to sign'} · ${SIGNING[l.id].tenant ? 'tenant signed' : 'awaiting tenant'}`}
                        </div>
                        <div className="font-mono text-[10.5px] text-body-3">
                          {zh ? `已 ${SIGNING[l.id].days} 天` : `${SIGNING[l.id].days} days`}
                        </div>
                        <div className="mt-1 flex justify-end gap-1.5">
                          <Link
                            href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `帮我重新给 ${l.tenant} 发送租约 ${l.id} 的签署链接` : `Resend the e-sign link for lease ${l.id} to ${l.tenant}`)}`}
                            className="whitespace-nowrap rounded-[6px] border border-line-strong bg-white px-2 py-[3px] text-[11px] font-semibold text-body transition hover:border-brand hover:text-brand"
                          >
                            {zh ? '重发链接' : 'Resend link'}
                          </Link>
                          <Link
                            href={`/landlord/agent?prompt=${encodeURIComponent(zh ? `我想撤回租约 ${l.id} 的签署请求，帮我走流程并通知 ${l.tenant}` : `I want to withdraw the signature request for lease ${l.id} — walk me through it and notify ${l.tenant}`)}`}
                            className="whitespace-nowrap rounded-[6px] border border-line-strong bg-white px-2 py-[3px] text-[11px] font-semibold text-body-3 transition hover:border-red-400 hover:text-red-600"
                          >
                            {zh ? '撤回' : 'Withdraw'}
                          </Link>
                        </div>
                      </>
                    ) : (
                      <span className="text-[12px] text-body-3">—</span>
                    )}
                  </Td>
                )}
                <Td align="right">
                  <StatusPill tone={s.tone}>{s.label}</StatusPill>
                  <div className="mt-0.5 text-[11.5px] text-body-2">{l.nextRenewal[lang]}</div>
                </Td>
                <Td align="right">
                  <Link
                    href={`/landlord/leases/${l.id}`}
                    className="inline-block whitespace-nowrap rounded-[8px] border border-line-strong bg-white px-3 py-1.5 text-[12px] font-semibold text-body transition hover:border-brand hover:text-brand"
                  >
                    {lang === 'zh' ? '打开 →' : 'Open →'}
                  </Link>
                </Td>
              </Tr>
            )
          })}
        </Table>
      )}
    </SectionCard>
  )
}

function RailAside({ lang, aiNotice }: { lang: Lang; aiNotice?: ReactNode }) {
  const zh = lang === 'zh'
  const aiName = useAIName('landlord')
  return (
    <div>
      {aiNotice && <AsideBlock title={zh ? 'AI 建议' : 'AI SUGGESTIONS'}>{aiNotice}</AsideBlock>}

      <AsideBlock title={zh ? '最近活动' : 'Recent activity'}>
        <ul className="space-y-3.5">
          {ACTIVITY(aiName).map((a, i) => (
            <li key={i} className="border-l-2 border-line-divider pl-3">
              <div className="font-mono text-[10px] uppercase tracking-eyebrow text-body-3">
                {a.time[lang]}
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">{a.text[lang]}</div>
            </li>
          ))}
        </ul>
      </AsideBlock>

      <AsideBlock title={zh ? 'N 表单工具箱' : 'N-form toolbox'}>
        <div className="space-y-2">
          {N_FORMS.map((f) => (
            <Link
              key={f.code}
              href={`/landlord/agent?prompt=${encodeURIComponent(f.prompt[lang])}`}
              className="block rounded-[8px] border border-line-divider bg-white px-3 py-2 transition hover:border-landlord/50"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] font-bold text-landlord">{f.code}</span>
                <span className="text-[12.5px] font-semibold">{f.title[lang]}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-body-3">{f.rule[lang]}</div>
            </Link>
          ))}
        </div>
      </AsideBlock>

      <AsideBlock title={zh ? 'LTB 提醒' : 'LTB reminder'}>
        <p className="text-[12.5px] leading-relaxed text-body-2">
          {zh ? (
            <>
              安省 2026 涨租上限为 <b>2.5%</b>。但 2018 年 11 月后首次入住的单位不受限 — {aiName} 会先判断房龄，再决定是否套用。
            </>
          ) : (
            <>
              {"Ontario's"} 2026 rent-increase cap is <b>2.5%</b>. But units first occupied after November 2018 are exempt — {aiName} checks the {"unit's"} age first, then decides whether the cap applies.
            </>
          )}
        </p>
        <Link
          href={`/landlord/agent?prompt=${encodeURIComponent(zh ? '帮我查看 Ontario N1 和 N2 涨租通知模板，以及使用时机和注意事项' : 'Show me the Ontario N1 and N2 rent increase notice templates, with timing rules and key considerations')}`}
          className="mt-3 inline-block text-[12px] font-semibold text-brand hover:underline"
        >
          {zh ? '查看 N1 / N2 通知模板 →' : 'View N1 / N2 notice templates →'}
        </Link>
      </AsideBlock>
    </div>
  )
}

'use client'

// V5.3 · Disputes & arbitration (handbook §06 / VOL 8). 三方共用:
// 仲裁工作台 · LTB 表格 · 律师目录 · AI 法律助手。
//
// ⚠️ 这是一个**纯示范页**——没有任何后端(全库无 dispute 表),页面上的案件、
// 当事人、律师、LSO 执照号、评分/胜率与统计数字全部是虚构样例。因此每一块
// 虚构数据旁边都必须有 <SampleTag/>,页顶必须有 <SampleBanner/>。
// LSO 号是安省法律协会的真实监管标识,示范用号一律写成 SAMPLE-NN 形态,
// 绝不能再出现 #L88421 这种可能撞上真实执业者的真格式号。
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT, type Lang } from '@/lib/i18n'

type LS = Record<Lang, string>

const CASES: { id: string; title: LS; parties: LS; statusLabel: LS; color: string; day: string; urgent?: boolean }[] = [
  {
    id: 'DSP-2K8X',
    title: { zh: '押金返还争议 · DSP-2K8X', en: 'Deposit return dispute · DSP-2K8X' },
    parties: { zh: 'Mia (租客) ⇄ Sarah (房东) · 退租基线对比中 · 房东主张扣 $480 清洁费', en: 'Mia (tenant) ⇄ Sarah (landlord) · comparing move-out baseline · landlord claims a $480 cleaning deduction' },
    statusLabel: { zh: '等你回', en: 'Awaiting you' },
    color: '#DC2626',
    day: 'DAY 3 / 14',
    urgent: true,
  },
  {
    id: 'DSP-3M9P',
    title: { zh: '维修延迟 · DSP-3M9P', en: 'Maintenance delay · DSP-3M9P' },
    parties: { zh: 'R. Liu (租客) ⇄ 房东 · 暖气故障 9 天未修 · 援引 RTA s.20 维护义务', en: 'R. Liu (tenant) ⇄ landlord · heating broken, unrepaired for 9 days · cites RTA s.20 maintenance duty' },
    statusLabel: { zh: '证据收集', en: 'Evidence gathering' },
    color: '#B45309',
    day: 'DAY 5 / 14',
  },
  {
    id: 'DSP-7K2L',
    title: { zh: '租金涨幅争议 · DSP-7K2L', en: 'Rent increase dispute · DSP-7K2L' },
    parties: { zh: 'D. Tay (租客) ⇄ 房东 · 涨幅 4.8% 超过 2026 安省指引 2.5% · 等仲裁员合议', en: 'D. Tay (tenant) ⇄ landlord · 4.8% increase exceeds the 2026 Ontario guideline of 2.5% · awaiting arbitrator deliberation' },
    statusLabel: { zh: '合议中', en: 'In deliberation' },
    color: '#7C3AED',
    day: 'DAY 4 / 14',
  },
  {
    id: 'DSP-1J5N',
    title: { zh: '骚扰投诉 · DSP-1J5N', en: 'Harassment complaint · DSP-1J5N' },
    parties: { zh: '租客 ⇄ 房东 · 多次未约入屋 · RTA s.26 隐私权 · 调解阶段', en: 'Tenant ⇄ landlord · repeated entry without notice · RTA s.26 privacy · mediation stage' },
    statusLabel: { zh: '调解中', en: 'In mediation' },
    color: '#2563EB',
    day: 'DAY 2 / 14',
  },
]

const CLOSED: { id: string; kind: LS; outcome: LS; how: LS; days: LS }[] = [
  { id: 'DSP-9X1A', kind: { zh: '退租 / 押金', en: 'Move-out / deposit' }, outcome: { zh: '押金原额返还 + $120 利息', en: 'Full deposit returned + $120 interest' }, how: { zh: '和解', en: 'Settled' }, days: { zh: '5.2 天', en: '5.2 days' } },
  { id: 'DSP-7P3K', kind: { zh: '装修工损坏', en: 'Contractor damage' }, outcome: { zh: 'Stripe 自动扣 $340', en: '$340 auto-debited via Stripe' }, how: { zh: '和解', en: 'Settled' }, days: { zh: '2.1 天', en: '2.1 days' } },
  { id: 'DSP-5M8B', kind: { zh: '违法涨租', en: 'Illegal rent increase' }, outcome: { zh: '退还 $186 + 未来 12 月按 2.5%', en: '$186 refunded + capped at 2.5% for next 12 months' }, how: { zh: '仲裁裁定', en: 'Arbitration ruling' }, days: { zh: '8.7 天', en: '8.7 days' } },
  { id: 'DSP-3R6Q', kind: { zh: '提前驱逐', en: 'Early eviction' }, outcome: { zh: '房东撤销 + 赔 1 月房租', en: 'Landlord withdrew + 1 month rent compensation' }, how: { zh: '升级 LTB', en: 'Escalated to LTB' }, days: { zh: '14 天', en: '14 days' } },
  { id: 'DSP-1V4W', kind: { zh: '水患损失', en: 'Flood damage' }, outcome: { zh: '保险走 + 临时安置', en: 'Insurance covered + temporary housing' }, how: { zh: '和解', en: 'Settled' }, days: { zh: '3.4 天', en: '3.4 days' } },
]

const STAGES: { k: string; range: LS; title: LS; desc: LS; s: string }[] = [
  { k: 'STAGE 1', range: { zh: '0-3 天', en: '0-3 days' }, title: { zh: '调解', en: 'Mediation' }, desc: { zh: 'AI 出中立摘要 · 双方在线沟通 · 80% 案件这里和解', en: 'AI produces a neutral summary · both sides communicate online · 80% of cases settle here' }, s: 'now' },
  { k: 'STAGE 2', range: { zh: '3-7 天', en: '3-7 days' }, title: { zh: '仲裁员合议', en: 'Arbitrator deliberation' }, desc: { zh: '3 名独立仲裁员 · RTA / 案例库 · 出非约束建议', en: '3 independent arbitrators · RTA / case law · issues a non-binding recommendation' }, s: 'next' },
  { k: 'STAGE 3', range: { zh: '7-14 天', en: '7-14 days' }, title: { zh: '升级 LTB', en: 'Escalate to LTB' }, desc: { zh: 'Stayloop 把所有证据自动 prefill 到 LTB 表格', en: 'Stayloop auto-prefills all evidence into the LTB forms' }, s: 'next' },
]

const RTA_NOTES: LS[] = [
  { zh: '✓ Stayloop 仲裁是非约束的', en: '✓ Stayloop arbitration is non-binding' },
  { zh: '✓ 你随时可直接走 LTB', en: '✓ You can go straight to the LTB at any time' },
  { zh: '✓ 援引条款都可被独立验证', en: '✓ Every cited clause can be independently verified' },
  { zh: '✓ 仲裁员独立 · 非 Stayloop 员工', en: '✓ Arbitrators are independent · not Stayloop employees' },
  { zh: '✕ 我们不替你做最终决定', en: '✕ We do not make the final decision for you' },
]

const LTB_FORMS: { code: string; name: LS; who: LS }[] = [
  { code: 'T1', name: { zh: '押金返还申请', en: 'Deposit return application' }, who: { zh: '租客 → LTB', en: 'Tenant → LTB' } },
  { code: 'T2', name: { zh: '房东违法行为', en: 'Landlord conduct violation' }, who: { zh: '租客 → LTB', en: 'Tenant → LTB' } },
  { code: 'T6', name: { zh: '维修义务申请', en: 'Maintenance obligation application' }, who: { zh: '租客 → LTB', en: 'Tenant → LTB' } },
  { code: 'L1', name: { zh: '欠租驱逐申请', en: 'Eviction for rent arrears' }, who: { zh: '房东 → LTB', en: 'Landlord → LTB' } },
  { code: 'L2', name: { zh: '其他终止申请', en: 'Other termination application' }, who: { zh: '房东 → LTB', en: 'Landlord → LTB' } },
  { code: 'N4', name: { zh: '欠租终止通知', en: 'Notice to end for arrears' }, who: { zh: '房东 → 租客', en: 'Landlord → tenant' } },
]

const LAWYERS: { initials: string; name: string; match: number; lso: LS; rate: string; ratePkg: LS; tags: LS[]; focus: LS; rating: LS; winRate: LS; response: LS; lang: string; video: LS }[] = [
  {
    initials: 'JL',
    name: 'Jennifer Lee',
    match: 96,
    lso: { zh: 'P1 PARALEGAL · LSO #SAMPLE-03 · 8 年 · 中 / EN', en: 'P1 PARALEGAL · LSO #SAMPLE-03 · 8 yrs · ZH / EN' },
    rate: '$180/h',
    ratePkg: { zh: '$300 听证打包价', en: '$300 hearing package' },
    tags: [{ zh: '押金 / T1 · 142 件', en: 'Deposits / T1 · 142 cases' }, { zh: '维修 / T6', en: 'Maintenance / T6' }, { zh: 'Legal Aid ✓', en: 'Legal Aid ✓' }, { zh: '7 天内可约', en: 'Available within 7 days' }],
    focus: { zh: '专门做小额押金返还 · 多伦多 South 区出庭过 142 次 · 平均替租客拿回 87% 索赔额。中文流利。', en: 'Specializes in small deposit-return cases · has appeared 142 times in Toronto South · recovers 87% of the claim for tenants on average. Fluent in Chinese.' },
    rating: { zh: '★ 4.92 · 318 评', en: '★ 4.92 · 318 reviews' },
    winRate: { zh: '胜率 89%', en: '89% win rate' },
    response: { zh: '响应 2h', en: 'Responds in 2h' },
    lang: 'EN + 中文',
    video: { zh: '📞 30 min 视频 · $90', en: '📞 30 min video · $90' },
  },
  {
    initials: 'DC',
    name: 'David Chen, J.D.',
    match: 91,
    lso: { zh: 'LAWYER · LSO #SAMPLE-01 · 12 年 · EN / 粤', en: 'LAWYER · LSO #SAMPLE-01 · 12 yrs · EN / Cantonese' },
    rate: '$420/h',
    ratePkg: { zh: '第一次 30min 免费', en: 'First 30 min free' },
    tags: [{ zh: 'RTA 全谱', en: 'Full RTA spectrum' }, { zh: '驱逐复议', en: 'Eviction reviews' }, { zh: '复杂案', en: 'Complex cases' }, { zh: '不接 Legal Aid', en: 'No Legal Aid' }],
    focus: { zh: '前 LTB 仲裁员 · Bay Street 出身 · 复杂案 + 上诉。简单押金案我会建议你找 paralegal 更经济。', en: 'Former LTB arbitrator · Bay Street background · complex cases and appeals. For simple deposit cases I’ll point you to a paralegal — it’s more economical.' },
    rating: { zh: '★ 4.85 · 84 评', en: '★ 4.85 · 84 reviews' },
    winRate: { zh: '胜率 94%', en: '94% win rate' },
    response: { zh: '响应 4h', en: 'Responds in 4h' },
    lang: 'EN + 粤',
    video: { zh: '📞 30 min 视频 · 免费', en: '📞 30 min video · free' },
  },
  {
    initials: 'SP',
    name: 'Sanjay Patel',
    match: 88,
    lso: { zh: 'P1 PARALEGAL · LSO #SAMPLE-02 · 5 年 · EN / 印', en: 'P1 PARALEGAL · LSO #SAMPLE-02 · 5 yrs · EN / Hindi' },
    rate: '$120/h',
    ratePkg: { zh: 'flat $250 case', en: 'flat $250 case' },
    tags: [{ zh: '租客权益', en: 'Tenant rights' }, { zh: 'Legal Aid ✓', en: 'Legal Aid ✓' }, { zh: '明天可约', en: 'Available tomorrow' }],
    focus: { zh: '专做租客方 · 接受 Legal Aid 证书 · 服务 Scarborough / North York 大量南亚社区。', en: 'Tenant-side only · accepts Legal Aid certificates · serves the large South Asian communities of Scarborough / North York.' },
    rating: { zh: '★ 4.78 · 156 评', en: '★ 4.78 · 156 reviews' },
    winRate: { zh: '胜率 82%', en: '82% win rate' },
    response: { zh: '响应 1h', en: 'Responds in 1h' },
    lang: 'EN + Hindi',
    video: { zh: '📞 30 min 视频 · $60', en: '📞 30 min video · $60' },
  },
  {
    initials: 'CT',
    name: 'Catherine Tremblay',
    match: 84,
    lso: { zh: 'P1 PARALEGAL · LSO #SAMPLE-04 · 14 年 · EN / FR', en: 'P1 PARALEGAL · LSO #SAMPLE-04 · 14 yrs · EN / FR' },
    rate: '$220/h',
    ratePkg: { zh: '分期可', en: 'Installments available' },
    tags: [{ zh: '押金 / 维修', en: 'Deposits / maintenance' }, { zh: '骚扰', en: 'Harassment' }, { zh: 'FR available', en: 'FR available' }],
    focus: { zh: '前 ACTO（多伦多租客社区中心）律师 · 强组织能力 · 复杂案件偏好。可分期付款。', en: 'Former ACTO (Advocacy Centre for Tenants Ontario) lawyer · highly organized · prefers complex cases. Payment plans available.' },
    rating: { zh: '★ 4.91 · 198 评', en: '★ 4.91 · 198 reviews' },
    winRate: { zh: '胜率 91%', en: '91% win rate' },
    response: { zh: '响应 3h', en: 'Responds in 3h' },
    lang: 'EN + FR',
    video: { zh: '📞 30 min 视频 · $110', en: '📞 30 min video · $110' },
  },
]

/**
 * 页顶示范横幅。这一页没有任何真实数据源,横幅必须在 Header 之下、Hero 之上,
 * 且不可被折叠/关闭——它是本页唯一说明「你看到的全是虚构样例」的地方。
 */
function SampleBanner({ zh }: { zh: boolean }) {
  return (
    <div role="note" style={{ background: '#FEF3C7', borderBottom: '1px solid rgba(180,83,9,0.35)' }}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2.5 px-5 py-4 sm:flex-row sm:items-start sm:gap-3.5 sm:px-7 lg:px-12">
        <span
          className="w-fit flex-shrink-0 rounded-md px-2.5 py-[4px] font-mono text-[10.5px] font-bold uppercase tracking-wider text-white"
          style={{ background: '#B45309' }}
        >
          {zh ? '产品示范' : 'Sample'}
        </span>
        <p className="text-[12.5px] font-semibold leading-relaxed" style={{ color: '#78350F' }}>
          {zh
            ? '本页展示的是产品示范。页面上的案件编号、当事人、律师姓名、LSO 执照号、评分、胜率与所有统计数字均为虚构样例,不对应任何真实案件或真实执业者。争议调解与律师目录尚未上线。'
            : 'This page is a product demonstration. Every case number, party, lawyer name, LSO licence number, rating, win rate and statistic shown here is a fabricated sample — none of them correspond to a real case or a real licensee. Dispute mediation and the lawyer directory are not live yet.'}
          <br />
          {zh
            ? '如果你正面临真实纠纷,请直接联系 '
            : 'If you are facing an actual dispute, contact the '}
          <a href="https://tribunalsontario.ca/ltb/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {zh ? '安省房东与租客委员会 (LTB)' : 'Landlord and Tenant Board'}
          </a>
          {zh ? ' 或 ' : ' or the '}
          <a href="https://lso.ca/public-resources/finding-a-lawyer-or-paralegal" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {zh ? '安省法律协会 (LSO) 的转介服务' : 'Law Society of Ontario referral service'}
          </a>
          {zh ? '。' : ' directly.'}
        </p>
      </div>
    </div>
  )
}

/** 区块级示范角标 — 每一块虚构数据的标题行都要挂一个。 */
function SampleTag({ zh, tone = 'quiet' }: { zh: boolean; tone?: 'quiet' | 'loud' }) {
  const loud = tone === 'loud'
  return (
    <span
      className="w-fit flex-shrink-0 rounded-full px-2 py-[2px] font-mono text-[9.5px] font-bold uppercase tracking-wider"
      style={
        loud
          ? { background: '#B45309', color: '#fff' }
          : { background: 'rgba(180,83,9,0.12)', color: '#92400E' }
      }
    >
      {zh ? '示范数据' : 'Sample'}
    </span>
  )
}

export default function DisputesPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  return (
    <div style={{ background: '#FFFFFF', color: '#171717' }}>
      <Header variant="transparent" />
      <SampleBanner zh={zh} />

      <section style={{ background: 'linear-gradient(180deg,#F4F6F9 0%,rgba(139,92,246,0.06) 100%)' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#7C3AED' }}>
              {zh ? 'DISPUTE CENTER · 仲裁案件中心' : 'DISPUTE CENTER'}
            </span>
            <SampleTag zh={zh} tone="loud" />
          </div>
          <h1 className="mt-4 max-w-[820px] text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[44px] lg:text-[48px]">
            {zh ? <>出了纠纷,<br />也有 AI 陪你走完流程。</> : <>When a dispute arises,<br />AI walks you through it too.</>}
          </h1>
          <p className="mt-5 max-w-[640px] text-[16px] leading-relaxed text-body-2">
            {zh
              ? 'Stayloop 内部 dispute resolution 是非约束性的 · 双方任何阶段均可终止并直接诉诸 LTB / 法院 · 仲裁员独立中立 · 每一步留痕可查。'
              : 'Stayloop’s in-house dispute resolution is non-binding · either party can stop at any stage and go straight to the LTB / courts · arbitrators are independent and neutral · every step is logged and traceable.'}
          </p>
          {/* Quick stats — 虚构样例,见页顶横幅 */}
          <div className="mt-8 flex items-center gap-2.5">
            <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">
              {zh ? '示范指标' : 'Sample metrics'}
            </span>
            <SampleTag zh={zh} />
          </div>
          <div className="mt-3 flex flex-wrap gap-8">
            {[
              { v: '4', l: { zh: '进行中', en: 'In progress' } },
              { v: '12', l: { zh: '本月已结', en: 'Closed this month' } },
              { v: '6.4d', l: { zh: '中位耗时', en: 'Median time' } },
              { v: '82%', l: { zh: '和解率', en: 'Settlement rate' } },
            ].map((s) => (
              <div key={s.v}>
                <div className="text-[28px] font-extrabold tracking-tight">{s.v}</div>
                <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">{s.l[lang]}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case list */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-7 lg:px-12">
          <div className="sl-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line-divider px-5 py-4 sm:px-6">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
                {zh ? '进行中的案件' : 'Cases in progress'}
              </span>
              <SampleTag zh={zh} />
            </div>
            {CASES.map((c, i) => (
              <div
                key={c.id}
                className={'flex flex-wrap items-center gap-3 px-5 py-5 sm:gap-4 sm:px-6 ' + (i > 0 ? 'border-t border-line-divider' : '')}
              >
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ background: c.color }}
                >
                  {c.id.slice(-2)}
                </span>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[14px] font-bold">{c.title[lang]}</div>
                  <div className="mt-0.5 text-[12.5px] text-body-2">{c.parties[lang]}</div>
                </div>
                <span className="hidden flex-shrink-0 font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3 sm:block">
                  {c.day}
                </span>
                <span
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-[4px] font-mono text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: c.color + '18', color: c.color }}
                >
                  {c.urgent && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: c.color }} />}
                  {c.statusLabel[lang]}
                </span>
                <Link href="#case-detail" className="flex-shrink-0 text-[12.5px] font-semibold hover:underline" style={{ color: '#7C3AED' }}>
                  {zh ? '打开 →' : 'Open →'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto grid max-w-[1240px] gap-6 px-5 py-8 sm:px-7 lg:grid-cols-[1.3fr_0.7fr] lg:px-12">
          {/* case detail + stages */}
          <div className="space-y-6">
            <div id="case-detail" className="sl-card scroll-mt-24 p-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '当前案件 · DSP-2K8X · DAY 3 / 14' : 'CURRENT CASE · DSP-2K8X · DAY 3 / 14'}</span>
                  <SampleTag zh={zh} />
                </div>
                <span className="flex items-center gap-1.5 rounded-md px-2 py-[3px] font-mono text-[10px] font-bold" style={{ background: 'rgba(220,38,38,0.10)', color: '#DC2626' }}>
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#DC2626]" />{zh ? '等你回' : 'Awaiting you'}
                </span>
              </div>
              <h3 className="mt-2 text-[18px] font-bold">{zh ? 'Mia (租客) ⇄ Sarah (房东) · 退租基线对比中' : 'Mia (tenant) ⇄ Sarah (landlord) · comparing move-out baseline'}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
                {zh
                  ? '房东主张扣 $480 清洁费。AI 已比对入住 / 退租状态照与安省 RTA,出中立摘要;双方在线沟通中 —— 80% 同类案件在调解阶段就和解。'
                  : 'The landlord claims a $480 cleaning deduction. The AI has compared the move-in / move-out condition photos against Ontario’s RTA and produced a neutral summary; both sides are talking online — 80% of similar cases settle at the mediation stage.'}
              </p>
              <div className="mt-5 font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '三阶递进' : 'Three escalating stages'}</div>
              <div className="mt-3 space-y-2">
                {STAGES.map((s) => (
                  <div
                    key={s.k}
                    className={'rounded-xl border px-4 py-3 ' +
                      (s.s === 'now' ? 'border-[rgba(124,58,237,0.40)] bg-[rgba(124,58,237,0.06)]' : 'border-line-divider bg-white')}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={'font-mono text-[11px] font-bold ' + (s.s === 'now' ? 'text-[#7C3AED]' : 'text-body-3')}>{s.k}</span>
                      <span className="font-mono text-[10px] text-body-3">{s.range[lang]}</span>
                      <span className="text-[13.5px] font-bold">{s.title[lang]}</span>
                    </div>
                    <div className="mt-1 text-[12.5px] leading-relaxed text-body-2">{s.desc[lang]}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI legal assistant */}
            <div className="sl-card p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #7C3AED 70%)' }} />
                <div>
                  <div className="text-[14px] font-bold">{zh ? 'AI-Legal · 专业模型' : 'AI-Legal · specialist model'}</div>
                  <div className="font-mono text-[10.5px] text-body-3">{zh ? '引用 RTA / O.Reg / 1.4M CanLII 案例 · 不构成法律意见' : 'Cites RTA / O.Reg / 1.4M CanLII cases · not legal advice'}</div>
                </div>
              </div>
              <div className="mt-3 rounded-md px-3 py-2 font-mono text-[10.5px] font-bold" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626' }}>
                ⚠ AI-GENERATED CONTENT · NOT LEGAL ADVICE
              </div>
              <div className="mt-2 rounded-md px-3 py-2 font-mono text-[10.5px] font-bold" style={{ background: 'rgba(180,83,9,0.10)', color: '#92400E' }}>
                {zh ? '⚠ 以下是针对虚构案件 DSP-2K8X 的示范分析' : '⚠ The analysis below is a sample, written for the fictional case DSP-2K8X'}
              </div>
              <div className="mt-3 rounded-xl rounded-tl-sm bg-surface-chip p-3 text-[13px] leading-relaxed text-body-2">
                {zh ? (
                  <>清洁费扣减须有合理依据并提供凭证(RTA s.105 / 109)。我已比对你的退租状态照,
                  并准备好 <b className="text-body">T1(押金返还申请)</b> 草稿;若调解 7 天内无果,可一键升级 LTB。</>
                ) : (
                  <>A cleaning deduction needs a reasonable basis and supporting evidence (RTA s.105 / 109). I’ve compared your move-out condition photos
                  and prepared a <b className="text-body">T1 (deposit return application)</b> draft; if mediation yields nothing within 7 days, you can escalate to the LTB in one click.</>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/tenant/agent?prompt=${encodeURIComponent(zh ? '给我看 DSP-2K8X 押金争议的协商函草稿' : 'Show me the negotiation letter draft for deposit dispute DSP-2K8X')}`} className="rounded-lg px-4 py-[9px] text-[13px] font-semibold text-white" style={{ background: '#7C3AED' }}>{zh ? '查看协商函草稿' : 'View negotiation letter draft'}</Link>
                <Link href={`/tenant/agent?prompt=${encodeURIComponent(zh ? '调解没有进展，帮我把 DSP-2K8X 押金争议升级到 LTB，准备 T1 表格' : 'Mediation stalled — escalate deposit dispute DSP-2K8X to the LTB and prepare the T1 form')}`} className="rounded-lg border border-line-strong bg-white px-4 py-[8px] text-[13px] font-semibold text-body hover:border-[#7C3AED]" style={{ ['--tw-text-opacity' as string]: 1 }}>{zh ? '📋 帮我升级 LTB' : '📋 Help me escalate to LTB'}</Link>
              </div>
            </div>
          </div>

          {/* LTB forms */}
          <div>
            <div className="sl-card p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? 'LTB 表格 · 一键生成' : 'LTB forms · one-click generate'}</span>
                <SampleTag zh={zh} />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-body-3">
                {zh
                  ? '表格清单是真实的 LTB 表格;一键生成功能尚未上线,「生成」按钮在本页不可用。'
                  : 'The form list is real LTB paperwork; one-click generation is not live yet and the “Generate” action does nothing on this page.'}
              </p>
              <div className="mt-4 space-y-2">
                {LTB_FORMS.map((f) => (
                  <div key={f.code} className="flex items-center gap-3 rounded-lg border border-line-divider bg-white p-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg font-mono text-[12px] font-bold" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>{f.code}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold leading-tight">{f.name[lang]}</div>
                      <div className="font-mono text-[10.5px] text-body-3">{f.who[lang]}</div>
                    </div>
                    <span className="text-[12px] font-semibold" style={{ color: '#7C3AED' }}>{zh ? '生成 →' : 'Generate →'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 sl-card p-6">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? 'RTA · 仲裁不替代' : 'RTA · arbitration is not a substitute'}</div>
              <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-body-2">
                {RTA_NOTES.map((n) => (
                  <li key={n.zh}>{n[lang]}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Closed cases */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 pb-4 sm:px-7 lg:px-12">
          <div className="sl-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line-divider px-6 py-4">
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
                {zh ? '已结案 · 最近 5' : 'Closed · last 5'}
              </span>
              <SampleTag zh={zh} />
            </div>
            {CLOSED.map((c, i) => (
              <div
                key={c.id}
                className={'grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3.5 sm:grid-cols-[auto_0.7fr_1.3fr_auto_auto] sm:gap-4 sm:px-6 ' + (i > 0 ? 'border-t border-line-divider' : '')}
              >
                <span className="font-mono text-[11.5px] font-bold text-body-3">{c.id}</span>
                <span className="text-[12.5px] font-semibold">{c.kind[lang]}</span>
                <span className="hidden text-[12.5px] text-body-2 sm:block">{c.outcome[lang]}</span>
                <span className="rounded-md bg-success/10 px-2 py-[3px] font-mono text-[10px] font-bold text-success">{c.how[lang]}</span>
                <span className="font-mono text-[11px] text-body-3">{c.days[lang]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* lawyer directory */}
      <section style={{ background: '#F4F6F9' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-16 sm:px-7 lg:px-12">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#7C3AED' }}>
              {zh ? 'Lawyer Directory · 律师目录' : 'Lawyer Directory'}
            </span>
            <SampleTag zh={zh} tone="loud" />
          </div>
          <h2 className="mt-3 text-[28px] font-extrabold tracking-tight sm:text-[34px]">{zh ? '需要真人时,对接持牌律师。' : 'When you need a human, connect with a licensed lawyer.'}</h2>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">
            RANKED BY CASE FIT · LSO LICENSED · NO COMMISSION · YOU PAY THEM DIRECTLY
          </p>
          <p
            className="mt-3 max-w-[720px] rounded-lg px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed"
            style={{ background: 'rgba(180,83,9,0.10)', color: '#78350F' }}
          >
            {zh
              ? '⚠ 下面四位是示范档案,不是真实执业者。姓名、执照号(SAMPLE-NN)、费率、评分、胜率与响应时间全部虚构。目录尚未上线,没有任何律师入驻。'
              : '⚠ The four profiles below are sample records, not real licensees. The names, licence numbers (SAMPLE-NN), rates, ratings, win rates and response times are all fabricated. The directory is not live — no lawyer has joined it.'}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {LAWYERS.map((l) => (
              <div key={l.name} className="sl-card p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold text-white" style={{ background: '#7C3AED' }}>
                    {l.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-bold">{l.name}</span>
                      <SampleTag zh={zh} />
                      <span className="rounded-md px-2 py-[2px] font-mono text-[9.5px] font-bold" style={{ background: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>
                        ★ MATCH {l.match}%
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10.5px] text-body-3">{l.lso[lang]}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {l.tags.map((t) => (
                    <span key={t.zh} className="rounded-md bg-surface-chip px-2 py-[3px] font-mono text-[10px] font-semibold text-body-2">{t[lang]}</span>
                  ))}
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-body-2">{zh ? `「${l.focus.zh}」` : `“${l.focus.en}”`}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-body-3">
                  <span className="font-bold text-body">{l.rating[lang]}</span>
                  <span>{l.winRate[lang]}</span>
                  <span>{l.response[lang]}</span>
                  <span>{zh ? '语言' : 'Lang'} {l.lang}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-divider pt-3">
                  <div>
                    <span className="font-mono text-[13px] font-bold" style={{ color: '#7C3AED' }}>{l.rate}</span>
                    <span className="ml-2 font-mono text-[10.5px] text-body-3">{l.ratePkg[lang]}</span>
                  </div>
                  <Link href="/contact" className="rounded-lg px-3 py-[7px] text-[11.5px] font-semibold text-white" style={{ background: '#7C3AED' }}>{l.video[lang]}</Link>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 sl-card p-5">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg" style={{ color: '#7C3AED' }}>
              {zh ? 'STAYLOOP 不抽佣 · 透明披露' : 'STAYLOOP takes no commission · transparent disclosure'}
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-body-2">
              {zh
                ? '目录上线后的规则:所有律师须由 Law Society of Ontario 持牌 · Stayloop 不收任何介绍费 · 你直接付律师 · 评价系统由验证客户匿名打分 · 律师可申诉但不能删评。以上为承诺的运行规则,当前页面上没有任何真实入驻律师。'
                : 'The rules once the directory goes live: every lawyer must be licensed by the Law Society of Ontario · Stayloop charges no referral fee · you pay the lawyer directly · reviews are rated anonymously by verified clients · lawyers may appeal but cannot delete reviews. These are the committed operating rules — no real lawyer has joined yet.'}
            </p>
          </div>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-body-3">
            {zh
              ? '⚠ 免责声明 · 本页所有律师档案与执照号均为示范用虚构数据,不指向任何真实执业者;SAMPLE-NN 不是有效的 LSO 号。目录上线后:Stayloop 仅核验 LSO 牌照真实性,不背书任何律师,不对其专业意见或服务质量负责;匹配度 (% MATCH) 是基于案件类型 + 经验 + 评价的算法参考,不是质量背书。AI-Legal 不能替代真人律师。'
              : '⚠ Disclaimer · Every lawyer profile and licence number on this page is fabricated sample data pointing to no real licensee; SAMPLE-NN is not a valid LSO number. Once the directory is live: Stayloop only verifies the validity of LSO licences, does not endorse any lawyer, and is not responsible for their professional opinions or service quality; the match score (% MATCH) is an algorithmic reference based on case type + experience + reviews — not a quality endorsement. AI-Legal cannot replace a human lawyer.'}
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}

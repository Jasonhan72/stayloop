'use client'

// Candidate homepage — "the homepage is the assistant" (2026-09-06).
//
// Built from the live homepage (app/page.tsx, v8 structure + flinks palette),
// not from any earlier design file. What changes:
//   1. The hero's scripted chat demo becomes the REAL assistant: the visitor
//      picks a role and types; anonymous preview turns go through
//      /api/agent/turn exactly as on /tenant/agent (real listings, official
//      TRREB market data, per-IP hourly limit, nothing persisted).
//   2. Every "try it" chip on the page sends into that one assistant, so the
//      whole page drives a single live conversation instead of showing
//      screenshots of one.
//   3. No photos, no fabricated consoles (Mia 87 分 / $1,225 到账). The
//      "verify it" band reads its numbers from /api/public/stats at load.
//   4. Copy is the approved homepage copy wherever a section survives;
//      benefits that describe features which are not live are rewritten or
//      tagged 即将.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import AgentChat from '@/components/agent/AgentChat'
import { useAgentSession } from '@/lib/agent/useAgentSession'
import { useT, type Lang } from '@/lib/i18n'
import { GENERIC_AI_NAME, useAIName } from '@/lib/aiName'
import { useAuth } from '@/lib/useAuth'
import { activeHat, useHats } from '@/lib/useHats'
import type { AgentRole } from '@/lib/agent/types'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

const ROLE_LABEL: Record<AgentRole, Bi> = {
  tenant: { zh: '我是租客', en: 'Tenant' },
  landlord: { zh: '我是房东', en: 'Landlord' },
  agent: { zh: '我是经纪', en: 'Agent' },
}

// One source for the assistant's name everywhere on the page: the name the
// signed-in user gave it (agent_configs) or, for visitors, nothing — the
// chat header then shows the generic label and the copy says "AI". The
// marketing names (Luna / Logic / Brief) are never shown here because the
// live chat panel would contradict them.
function customName(n: string): string | null {
  const t = (n || '').trim()
  return t && t !== GENERIC_AI_NAME ? t : null
}
const NAME_TOKEN = '{ai}'
function withName(b: Bi, lang: Lang, name: string | null): string {
  return pick(b, lang).split(NAME_TOKEN).join(name ?? 'AI')
}

// Per-role sections. Copy follows the approved homepage; the landlord's
// second benefit and the agent's list are rewritten to what is live today.
// The fourth role (2026-09-27): providers have no assistant persona, so their
// panel shows facts instead of chips; every role maps to three REAL pages.
type HomeRole = AgentRole | 'provider'
type Module = { h: Bi; s: Bi; href: string }
const ROLES: {
  key: HomeRole
  tag: Bi
  /** small mono tag on the tab — the provider network is a pilot */
  pilot?: boolean
  h2: Bi
  lead: Bi
  benefits: { b: Bi; s: Bi; soon?: boolean }[]
  /** example sentences that send into the hero conversation (roles with an assistant) */
  chips: { label: Bi; prompt: Bi }[]
  /** role → module map: three real pages; the copy names only what ships */
  modules: Module[]
  /** shown instead of chips when the role has no assistant persona */
  facts?: Bi[]
  cta: Bi
  href: string
}[] = [
  {
    key: 'landlord',
    tag: { zh: '房东 × {ai}', en: 'Landlord × {ai}' },
    h2: { zh: '选对租客，按时收租，后台有支持。', en: 'Pick the right tenant, get paid on time, with a back office behind you.' },
    lead: {
      zh: '房东的难题，{ai} 接：把每份申请查完材料真伪和法庭记录，每一分写明理由，再排好序给你。',
      en: "A landlord's problems go to {ai}: it checks every application for document authenticity and court records, explains every point, then ranks them for you.",
    },
    benefits: [
      { b: { zh: '每份申请先过六维筛查', en: 'Every application goes through six-dimension screening first' }, s: { zh: '材料真伪、LTB 判令与法院记录都查过，伪造材料会被识别并拦下。', en: 'Document authenticity, LTB orders and court records are checked; forged files are flagged and stopped.' } },
      { b: { zh: '租约与续约由系统跟进', en: 'Leases and renewals are tracked by the system' }, s: { zh: '起草、电子签、到期前 120 天备好续约方案，批准就发。', en: 'Drafting, e-signing, and renewal options ready 120 days before expiry — approve and send.' } },
      { b: { zh: 'AI 后台全天候在线', en: 'An AI back office, on around the clock' }, s: { zh: '合规拦截、审计留痕、报修接待，你只需要确认。', en: 'Compliance guardrails, audit trail, repair intake — you only confirm.' } },
    ],
    chips: [
      { label: { zh: '租客筛查', en: 'Tenant screening' }, prompt: { zh: '我要筛查一位申请人：告诉我报告会查什么、需要准备哪些材料，然后带我开始。', en: 'I want to screen an applicant: tell me what the report checks, what documents I need, then take me to start.' } },
      { label: { zh: '看看新申请', en: 'Review applications' }, prompt: { zh: '帮我看看最新的申请，按质量排序并说明理由。', en: 'Review my latest applications, rank them and explain why.' } },
      { label: { zh: '续约方案', en: 'Renewal options' }, prompt: { zh: '帮我看看哪些租约快到期了，给我续约方案和合规涨幅。', en: 'Which leases are coming up? Give me renewal options with the legal increase.' } },
      { label: { zh: '合规检查', en: 'Compliance check' }, prompt: { zh: '帮我检查我的房源和租约有没有 RTA 合规风险。', en: 'Check my listings and leases for RTA compliance risks.' } },
      { label: { zh: '发布房源', en: 'List a property' }, prompt: { zh: '我要发布一个新房源，你来帮我整理信息。', en: 'I want to list a new property — help me put it together.' } },
    ],
    modules: [
      { h: { zh: '租客筛查', en: 'Tenant screening' }, s: { zh: '六维核验 · 文件取证 · LTB 判令与法院记录', en: 'Six dimensions · document forensics · LTB orders and court records' }, href: '/screening' },
      { h: { zh: '发布房源与申请队列', en: 'Listing and applications' }, s: { zh: '五步向导 · 一键导入 Realtor.ca 链接 · 核验后上线 · 申请一键筛查', en: 'Five-step wizard · import from a Realtor.ca link · live after verification · one-tap screening from an application' }, href: '/dashboard/listings/new' },
      { h: { zh: '租约、续约与维修', en: 'Leases, renewals and repairs' }, s: { zh: '安省标准租约电子签 · 续约 90 / 60 / 30 天 · 报修派给已核验服务商', en: 'Ontario standard lease e-sign · renewal at 90 / 60 / 30 days · repairs dispatched to verified providers' }, href: '/landlord/leases' },
    ],
    cta: { zh: '让 {ai} 协助管理房源 →', en: 'Let {ai} help manage your rentals →' },
    href: '/landlord',
  },
  {
    key: 'tenant',
    tag: { zh: '租客 × {ai}', en: 'Tenant × {ai}' },
    h2: { zh: '没有本地信用记录，也能建立可信的租房履历。', en: 'Build a trusted rental record, even without local credit history.' },
    lead: {
      zh: '租客的难题，{ai} 接：条件说人话，房源全是真的；四枚章盖好，申请任何房源不再重复交材料。',
      en: "A tenant's problems go to {ai}: say what you want in plain language — every listing is real; earn the four stamps once and apply anywhere without re-submitting.",
    },
    benefits: [
      { b: { zh: '真实挂牌 + 官方行情作答', en: 'Real listings + official market data' }, s: { zh: 'TRREB 官方成交对照，绝不编造；英文租约逐条讲成中文。', en: 'Checked against official TRREB transactions, never invented; English leases explained clause by clause.' } },
      { b: { zh: '验证一次，处处通行', en: 'Verify once, use it everywhere' }, s: { zh: '护照、枫叶卡、工签都支持——材料只交一次。', en: 'Passport, PR card, work permit all supported — submit documents once.' } },
      { b: { zh: '评分带理由，拒绝有依据', en: 'Scores come with reasons; rejections need grounds' }, s: { zh: '按时租金、真实记录都写进你的护照，替你说话。', en: 'On-time rent and verified records go into your Passport and speak for you.' } },
    ],
    chips: [
      { label: { zh: '帮我找房', en: 'Find me a home' }, prompt: { zh: '帮我找市中心 $2,500 以内的一居室，最好离地铁近。', en: 'Find me a downtown 1-bed under $2,500, close to the subway.' } },
      { label: { zh: '北约克两房', en: 'North York 2-bed' }, prompt: { zh: '北约克两房，预算 2800，能养猫', en: 'North York 2-bed, budget 2800, cats OK' } },
      { label: { zh: '解读租约', en: 'Explain my lease' }, prompt: { zh: '帮我逐条解释租约里最需要注意的条款。', en: 'Walk me through the lease clauses I should watch out for.' } },
      { label: { zh: '发起报修', en: 'Report a repair' }, prompt: { zh: '厨房水槽漏水，帮我整理成报修工单发给房东。', en: 'The kitchen sink is leaking — turn this into a repair ticket for my landlord.' } },
    ],
    modules: [
      { h: { zh: '找房', en: 'Find a home' }, s: { zh: '真实挂牌 · 地图 · 交通与行情 · 看房与提问', en: 'Real listings · map · transit and market · showings and questions' }, href: '/listings' },
      { h: { zh: '申请与追踪', en: 'Apply and track' }, s: { zh: '已提交 → 房东已查看 → 筛查 → 决定 → 租约 → 在管租约', en: 'Submitted → viewed → screened → decision → lease → tenancy' }, href: '/tenant/applications' },
      { h: { zh: '租客护照', en: 'Tenant passport' }, s: { zh: '四枚章 · 分享链接 · API 可读范围由你勾选', en: 'Four stamps · share link · you choose what the API may read' }, href: '/tenant/passport' },
    ],
    cta: { zh: '让 {ai} 开始找 →', en: 'Let {ai} start searching →' },
    href: '/tenant',
  },
  {
    key: 'agent',
    tag: { zh: '经纪 × {ai}', en: 'Agent × {ai}' },
    h2: { zh: '行政事务交给 AI，时间留给专业工作。', en: 'Hand the admin to AI, keep your time for the work that closes.' },
    lead: {
      zh: '经纪的难题，{ai} 接：替客户把关、记住每位客户的偏好、把报告直接送到房东手上。',
      en: "An agent's problems go to {ai}: vouch for clients with evidence, remember every client's preferences, and put the report straight in the landlord's hands.",
    },
    benefits: [
      { b: { zh: '替客户下单筛查，报告直接分享给房东', en: 'Order a screening for a client, share the report with the landlord' }, s: { zh: '你、客户、房东看到的是同一份报告。', en: 'You, your client and the landlord read the same report.' } },
      { b: { zh: '{ai} 记住每位客户', en: '{ai} remembers every client' }, s: { zh: '预算、区域、偏好只说一次；下次开口它就接上。', en: 'Budget, area, preferences said once; next time it picks up where you left off.' } },
      { b: { zh: '带看日程、反馈归档、佣金结算', en: 'Showing schedules, feedback filing, commission settlement' }, s: { zh: '上线前不进首页数字。', en: 'Not counted on this page until it ships.' }, soon: true },
    ],
    chips: [
      { label: { zh: '租客筛查', en: 'Tenant screening' }, prompt: { zh: '我替房东客户收到一份租房申请。帮我筛查这位申请人：告诉我报告会查什么、要申请人提交哪些材料，然后带我开始。', en: 'I have a rental application for my landlord client. Screen the applicant: tell me what the report checks, what the applicant must submit, then take me to start.' } },
      { label: { zh: '挂牌定价', en: 'Price the listing' }, prompt: { zh: '帮客户的房源定租金：拉这个区域同户型的实时挂牌和 TRREB 官方成交数据做比价。', en: "Price my client's unit: pull live listings for the same area and unit type plus the TRREB benchmark for comparison." } },
      { label: { zh: '合规边界', en: 'Compliance boundaries' }, prompt: { zh: '带看和收申请时：哪些问题不能问（人权法）、哪些话不能替房东答、TRESA 要我先给客户什么文件？', en: 'At showings and intake: which questions are off-limits (Human Rights Code), what must I not answer for the landlord, and what does TRESA require me to give a client first?' } },
    ],
    modules: [
      { h: { zh: '客户表与委托', en: 'Client book and delegations' }, s: { zh: 'TRESA 两个日期 · 委托由客户确认 · 有效委托下代客筛查', en: 'Two TRESA dates · delegation confirmed by the client · screen for a client under a live delegation' }, href: '/agent/clients' },
      { h: { zh: '挂牌定价与带看准备', en: 'Pricing and showing prep' }, s: { zh: '实时挂牌 + TRREB 比价 · 带看准备包 · 租约与押金规则', en: 'Live listings + TRREB benchmark · showing prep pack · lease and deposit rules' }, href: '/agent/agent' },
      { h: { zh: '规则与合规边界', en: 'Rules and boundaries' }, s: { zh: 'RTA · OHRC · TRESA 条文与编号 · 发布与租约保存前自动检查', en: 'RTA · OHRC · TRESA clauses with ids · checked before a listing or lease is saved' }, href: '/rules' },
    ],
    cta: { zh: '让 {ai} 安排工作 →', en: 'Let {ai} run your day →' },
    href: '/agent',
  },
  {
    key: 'provider',
    pilot: true,
    tag: { zh: '服务商', en: 'Provider' },
    h2: { zh: '想接多伦多租房市场的维修工单？先把资质核了。', en: 'Want repair work orders from Toronto rentals? Get your credentials verified first.' },
    lead: {
      zh: '房东在 Stayloop 里给报修派单，只会派给资质已核验的服务商，或自己的联系人。入驻填工种与资质，管理员对照公开注册库核验后，你就会出现在派单候选里。',
      en: 'Landlords dispatch repairs inside Stayloop only to providers whose credentials were verified, or to their own contacts. Enter your trades and credentials; an admin checks them against the public registries, and you appear among the dispatch candidates.',
    },
    benefits: [
      { b: { zh: '资质一次核验，覆盖一目了然', en: 'Credentials verified once, coverage at a glance' }, s: { zh: 'STO / ESA / TSSA / WSIB / 责任险 / 企业注册按工种要求；到期前 90 / 60 / 30 / 7 天提醒。', en: 'STO / ESA / TSSA / WSIB / liability insurance / business registration as each trade requires; reminders 90 / 60 / 30 / 7 days before expiry.' } },
      { b: { zh: '报价 · 到场 · 完工 · 验收，一条时间线', en: 'Quote · arrive · complete · accept, one timeline' }, s: { zh: '报价须房东批准，进入前租客收到通知（RTA s.27）；三方在同一条工单对话里。', en: 'Quotes need the landlord’s approval and tenants are notified before entry (RTA s.27); all three parties share one work-order thread.' } },
      { b: { zh: '线下结算，不抽成', en: 'Settle offline, no commission' }, s: { zh: '账单对照批准报价（CPA 10%），验收后房东标记付款，可导出结算回执。', en: 'The invoice is checked against the approved quote (CPA 10%); after acceptance the landlord marks payment and a receipt can be exported.' } },
    ],
    chips: [],
    facts: [
      { zh: '试点阶段 · 多伦多及周边', en: 'Pilot · Toronto and nearby' },
      { zh: '没有公开目录：只有正在派单的房东看得到你', en: 'No public directory: only a landlord dispatching a job sees you' },
      { zh: '「已核」只表示核验日在公开注册库上有效，到期即不计入覆盖', en: '“Verified” means valid on the public registry on the day of the check; an expired credential stops counting' },
      { zh: '付款线下 · Stayloop 不经手资金', en: 'Payment offline · Stayloop handles no money' },
    ],
    modules: [
      { h: { zh: '入驻与资质', en: 'Onboarding and credentials' }, s: { zh: '填工种与资质 · 管理员对照公开注册库核验', en: 'Trades and credentials · verified against the public registries' }, href: '/provider/onboard' },
      { h: { zh: '我的工单', en: 'My work orders' }, s: { zh: '新邀请 · 已报价 · 进行中 · 待验收 · 待结算', en: 'Invitations · quoted · in progress · awaiting acceptance · to settle' }, href: '/provider/jobs' },
      { h: { zh: '运作规则', en: 'How it works' }, s: { zh: '六步工单流 · 工种与必需资质表 · 现状与边界', en: 'The six-step flow · trades and required credentials · scope and limits' }, href: '/services' },
    ],
    cta: { zh: '申请入驻 →', en: 'Apply to join →' },
    href: '/provider/onboard',
  },
]

// Homepage FAQ (2026-09-27): five cross-role questions; every answer names only
// what is live and checkable on the site. Also emitted as FAQPage JSON-LD.
const FAQ: { q: Bi; a: Bi; href: string; more: Bi }[] = [
  {
    q: { zh: '房源和行情从哪里来？', en: 'Where do the listings and market numbers come from?' },
    a: { zh: '公开房源有两类：房东在 Stayloop 发布、经管理员核验后上线的；以及从 Realtor.ca 导入并标明来源的（目前是示范阶段，TRREB 数据库尚未接入）。行情对照用 TRREB 官方按季度公布的成交数据，页面会写明季度与来源。', en: 'Two kinds of public listings: ones landlords publish on Stayloop and an admin verifies before they go live, and ones imported from Realtor.ca with the source shown (a demonstration stage; the TRREB database is not connected yet). Market comparisons use TRREB’s official quarterly transaction data, with the quarter and source stated on the page.' },
    href: '/listings', more: { zh: '看房源 →', en: 'Browse listings →' },
  },
  {
    q: { zh: '筛查报告会不会一票否决申请人？', en: 'Can the screening report reject an applicant on its own?' },
    a: { zh: '不会。报告列出可核验的事实——材料真伪、收入佐证、LTB 判令与法院记录——每条结论注明依据；按 OHRC 租房政策，租金收入比和信用分不设硬性截止线，只作参考。录取或婉拒由房东本人决定，通知信附《消费者报告法》s.10(7) 的说明。', en: 'No. The report lists checkable facts, document authenticity, income corroboration, LTB orders and court records, and every conclusion cites its evidence; following the OHRC rental policy there is no hard cut-off on rent-to-income ratio or credit score, they are context only. Admitting or declining is the landlord’s own decision, and the notice letter carries the Consumer Reporting Act s.10(7) statement.' },
    href: '/screening', more: { zh: '筛查怎么做 →', en: 'How screening works →' },
  },
  {
    q: { zh: 'AI 会不会替我做决定？', en: 'Will the AI decide things for me?' },
    a: { zh: '不会。发消息、签署、派单、发通知这类会影响到别人的动作，先变成一张等你批准的卡片；批准后有 60 秒可撤销，批准与拒绝都写入审计记录，随时可回查。', en: 'No. Anything that reaches another person, sending a message, signing, dispatching a repair, issuing a notice, first becomes a card awaiting your approval; after approval there is a 60-second undo, and approvals and rejections are both written to the audit log.' },
    href: '/platform', more: { zh: '看产品结构 →', en: 'See the product structure →' },
  },
  {
    q: { zh: '我的数据放在哪里，谁能看到？', en: 'Where is my data, and who can see it?' },
    a: { zh: '数据库在加拿大（AWS 蒙特利尔）。租客、房东、经纪、服务商各自只能读到与自己有关的记录，这是数据库层面的权限，不只是页面上的隐藏；筛查记录房东可随时删除，租赁事务可导出带内容指纹的证据包。AI 服务商及其所在地在隐私页逐家列明。', en: 'The database is in Canada (AWS Montréal). Tenants, landlords, agents and providers can each read only the records that concern them, enforced at the database rather than hidden in the page. A landlord can delete a screening at any time; a rental matter can be exported as a fingerprinted evidence pack. The AI providers and where they run are listed one by one on the privacy page.' },
    href: '/privacy', more: { zh: '隐私页 →', en: 'Privacy page →' },
  },
  {
    q: { zh: '服务商怎么加入，要付费吗？', en: 'How does a provider join, and does it cost anything?' },
    a: { zh: '在入驻页填工种与资质（STO / ESA / TSSA / WSIB / 责任险 / 企业注册，按工种要求），管理员对照公开注册库核验后，你会进入房东的派单候选：报价须房东批准，进入前租客会收到通知，验收后线下结算。目前是多伦多及周边的试点阶段，Stayloop 不抽成、不经手资金。', en: 'Fill in your trades and credentials on the onboarding page (STO / ESA / TSSA / WSIB / liability insurance / business registration, as each trade requires). Once an admin has checked them against the public registries you appear among the landlords’ dispatch candidates: quotes need the landlord’s approval, tenants are notified before entry, and settlement is offline after acceptance. It is a pilot in Toronto and nearby; Stayloop takes no commission and handles no money.' },
    href: '/services', more: { zh: '维修与服务网络 →', en: 'Repair and service network →' },
  },
]

const STEPS: { h: Bi; p: Bi }[] = [
  { h: { zh: '说一句', en: 'Say it' }, p: { zh: '「多大附近、能养猫、4000 以内」——地标、预算、偏好都能理解。', en: '"Near UofT, cats OK, under 4000" — landmarks, budgets and preferences all understood.' } },
  { h: { zh: 'Agent 去办', en: 'The agent does it' }, p: { zh: '查真实挂牌、对官方行情、备好材料——例行工作自动完成，睡觉时也在盯。', en: 'Searches real listings, checks official market data, prepares documents — routine work done, even while you sleep.' } },
  { h: { zh: '你来确认', en: 'You confirm' }, p: { zh: '发送、签署、付款先变成等你批准的卡片；每一步留痕，随时回查。', en: 'Sending, signing and paying become cards awaiting your approval; every step is logged.' } },
]

type Stats = { screenings: number | null; ltbOrders: number | null; listings: number | null; trrebQuarters: number | null }

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-CA')
}

export default function HomeNext() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [role, setRole] = useState<AgentRole>('tenant')
  const [queued, setQueued] = useState<{ role: AgentRole; prompt: string } | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  // Signed in: the hero talks to the hat you are wearing (header menu switches
  // it); the three pills are for visitors trying the assistant (2026-09-22,
  // user: the pills duplicate the menu once you are logged in).
  const auth = useAuth()
  const hats = useHats()
  const signedIn = !auth.loading && !!auth.user
  const pinnedRole = useRef(false)
  useEffect(() => {
    if (!signedIn || hats.loading || pinnedRole.current) return
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ask')) { pinnedRole.current = true; return }
    // Mirror the header exactly — the same predicate (activeHat): the remembered
    // hat when the account holds it, else the best hat it does hold.
    setRole(activeHat(hats, auth.role))
    pinnedRole.current = true
  }, [signedIn, hats.loading, hats.landlord, hats.agent, auth.role])
  // One assistant per account (2026-09-25): the same name under every hat.
  const assistantName = customName(useAIName())
  const names: Record<AgentRole, string | null> = { tenant: assistantName, landlord: assistantName, agent: assistantName }

  // Deep link from role / screening pages: `/?role=landlord&ask=<question>` opens
  // the hero conversation on that role and sends the question once (2026-09-22,
  // EliseAI benchmark item C). Read after mount only — never during hydration.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const q = (sp.get('ask') || '').trim().slice(0, 300)
      if (!q) return
      const r = sp.get('role')
      const rr: AgentRole = r === 'landlord' || r === 'agent' || r === 'tenant' ? r : 'tenant'
      setRole(rr)
      setQueued({ role: rr, prompt: q })
      window.history.replaceState(null, '', window.location.pathname)
    } catch { /* no-op */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/public/stats').then((r) => r.json()).then((j) => { if (!cancelled && j?.ok) setStats(j) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Any chip on the page: switch the assistant to that role, send the prompt,
  // bring the conversation into view.
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: pick(f.q, lang), acceptedAnswer: { '@type': 'Answer', text: pick(f.a, lang) } })) }

  const ask = useCallback((r: AgentRole, prompt: string) => {
    setRole(r)
    setQueued({ role: r, prompt })
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />

      {/* ================= HERO = the assistant ================= */}
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        {/* Phone: everything above the chat is trimmed (smaller h1, one-line
            lead, tighter gaps) and the chat is sized to the viewport so the
            whole box — header, messages, input — is on screen without
            scrolling (2026-09-12). ≥640px keeps the original hero. */}
        <div className="mx-auto max-w-[1100px] px-4 pb-10 pt-3 sm:px-7 sm:pt-9 lg:pt-11">
          <div className="mx-auto max-w-[760px] text-center">
            <div className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.16em] sm:block" style={{ color: '#00ACE4' }}>
              AI-Native Rental OS · Toronto
            </div>
            <h1 className="text-[22px] font-extrabold leading-[1.15] tracking-tight sm:mt-3 sm:text-[44px]">
              {zh ? <>租房路上的难题，<br />交给<em className="not-italic" style={{ color: '#00ACE4' }}>各自的 AI</em>。</> : <>The hard parts of renting,<br />handled by <em className="not-italic" style={{ color: '#00ACE4' }}>your own AI</em>.</>}
            </h1>
            <p className="mx-auto mt-3 hidden max-w-[640px] text-[16px] leading-relaxed text-body-2 sm:block">
              {zh
                ? <>Stayloop 给你一个<b className="text-body">独立的 AI 助理</b>：租客、房东、经纪的事它都会办，你说一句，它去办，关键决定由你确认。下面这个就是——不用注册，直接说。</>
                : <>Stayloop gives you one <b className="text-body">dedicated AI assistant</b> for everything a tenant, landlord or agent does: say it, it gets done, you confirm the key decisions. This is it — no signup, just talk.</>}
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-body-3 sm:hidden">
              {zh ? '不用注册，直接对它说。' : 'No signup — just talk to it.'}
            </p>
          </div>

          {/* role switch + live assistant */}
          <div ref={heroRef} id="assistant" className="mx-auto mt-2.5 min-w-0 max-w-[920px] scroll-mt-24 sm:mt-6">
            {/* Signed in: no hat line above the card and no hat label in it (user 2026-09-25:
                "把所有这里的角色标记都去掉") — hats switch in the Header's identity menu; the
                hero follows auth.role. Visitors keep the three pills (the demo switcher). */}
            {!signedIn && (
            <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 sm:mb-2.5 sm:gap-2">
              {(['tenant', 'landlord', 'agent'] as AgentRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="rounded-full px-3 py-1 text-[12.5px] font-bold transition sm:px-4 sm:py-2 sm:text-[13.5px]"
                  style={role === r ? { background: '#1B1B3C', color: '#fff' } : { background: '#fff', color: '#1B1B3C', border: '1px solid #D3E3EF' }}
                >
                  {pick(ROLE_LABEL[r], lang)}
                </button>
              ))}
              {/* the fourth role has no assistant persona — a text entry to its public page (2026-09-27) */}
              <Link href="/services" className="ml-1 text-[12.5px] font-semibold text-brand hover:underline sm:text-[13px]">{zh ? '服务商 · 维修与服务网络 →' : 'Providers · repair network →'}</Link>
            </div>
            )}
            {/* Phone height = viewport − (header 67 + title/lead/pills ≈ 120 +
                bottom tab bar 64 + a little air); floor 360px so the messages
                area never collapses on short screens. ≥640px: the chat box runs
                to the fold instead of a fixed 600px — viewport − (header 66 +
                eyebrow / title / lead / hat line ≈ 320px) — floor 400px (user
                2026-09-25: the hero was squeezing the conversation; the layout
                itself stays as it was, only the spacing is tighter). */}
            <div className={signedIn
              ? 'h-[max(360px,calc(100vh-230px))] supports-[height:100dvh]:h-[max(360px,calc(100dvh-230px))] sm:h-[max(400px,calc(100vh-345px))]'
              : 'h-[max(360px,calc(100vh-270px))] supports-[height:100dvh]:h-[max(360px,calc(100dvh-270px))] sm:h-[max(400px,calc(100vh-390px))]'}>
              <AssistantPanel key={role} role={role} name={names[role]} queued={queued} onQueuedSent={() => setQueued(null)} />
            </div>
            <div className="mt-3 flex flex-col items-center justify-between gap-2 text-[12px] text-body-3 sm:flex-row">
              <span>{zh ? '免注册体验 · 每小时有次数上限 · 登录后它才会记住你' : 'Try without signing up · hourly limit · it only remembers you after you sign in'}</span>
              <span className="hidden items-center gap-2 rounded-full border border-line-divider bg-white px-3 py-1 sm:inline-flex">
                <span className="h-2 w-2 rounded-full" style={{ background: '#00ACE4' }} />
                <b className="text-body">{zh ? 'AI 提议，你决定' : 'AI proposes, you decide'}</b>
                <span>{zh ? '对外动作先经你批准 · 全程留痕' : 'outbound actions wait for your approval · fully logged'}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================= trust strip ================= */}
      <section className="border-y border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-[13px] text-body-3 sm:px-7 md:grid-cols-4">
          <div>{zh ? '模型' : 'Models'} <b className="text-body">Claude · GPT · Gemini</b> · {zh ? '可自选' : 'your choice'}</div>
          <div>{zh ? '行情' : 'Market'} <b className="text-body">TRREB · Realtor.ca</b></div>
          <div>{zh ? '合规' : 'Compliance'} <b className="text-body">RTA · OHRC · PIPEDA</b></div>
          <div><b className="text-body">Proudly Canadian</b> · {zh ? '数据库驻加' : 'database hosted in Canada'}</div>
        </div>
      </section>

      {/* ================= PAINS ================= */}
      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7">
        <div className="grid gap-8 md:grid-cols-3">
          <Pain who={zh ? '房东' : 'Landlord'} text={zh ? '怕租错人？每份申请先查真伪和法庭记录。' : 'Afraid of the wrong tenant? Every application is checked for authenticity and court records first.'} onTry={() => ask('landlord', zh ? '帮我看看最新的申请，按质量排序并说明理由。' : 'Review my latest applications, rank them and explain why.')} tryLabel={zh ? `对${names.landlord ? ' ' + names.landlord : '房东 AI'} 说` : `Ask ${names.landlord ?? 'the landlord AI'}`} />
          <Pain who={zh ? '租客' : 'Tenant'} text={zh ? '怕材料白填？交一次，处处通行。' : 'Tired of re-submitting documents? Submit once, use it everywhere.'} onTry={() => ask('tenant', zh ? '我现在盖了几枚章？下一枚怎么盖，能解锁什么？' : 'How many stamps do I have? How do I earn the next one, and what does it unlock?')} tryLabel={zh ? `对${names.tenant ? ' ' + names.tenant : '租客 AI'} 说` : `Ask ${names.tenant ?? 'the tenant AI'}`} />
          <Pain who={zh ? '经纪' : 'Agent'} text={zh ? '怕杂活吃掉专业？行政事务全交给 AI。' : 'Admin eating your day? Hand it to the AI.'} onTry={() => ask('agent', zh ? '哪些客户需要跟进？帮我列出来并起草跟进消息。' : 'Which clients need follow-ups? List them and draft the messages.')} tryLabel={zh ? `对${names.agent ? ' ' + names.agent : '经纪 AI'} 说` : `Ask ${names.agent ?? 'the agent AI'}`} />
        </div>
      </section>

      {/* ================= ROLES ================= */}
      <section id="roles" className="border-t border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7">
          <div className="max-w-[640px]">
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '四种身份，各自的入口' : 'Four roles, each with its own entry'}</h2>
            <p className="mt-2 text-[16px] text-body-2">{zh ? '租客、房东、经纪各有一个立场不同、只对你负责的 AI；服务商有自己的工单工作台。例句直接发给上面的对话，模块卡直接进真实页面。' : 'Tenant, landlord and agent each get an AI with its own loyalty, answering only to you; providers get a work-order desk. Examples send straight to the conversation above; module cards open the real pages.'}</p>
          </div>
          <RoleTabs lang={lang} names={names} onAsk={ask} />
        </div>
      </section>

      {/* ================= PRODUCTS: one flow + API (2026-09-23) ================= */}
      <section className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-[640px]">
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '租前 · 租中 · 租后，一条流程' : 'Before, during and after the lease — one flow'}</h2>
            <p className="mt-2 text-[16px] text-body-2">{zh ? '找房到续约，同一个房源、同一位申请人、同一份租约在每个阶段接力；会对外产生影响的事先变成等你批准的卡片。' : 'From search to renewal the same listing, applicant and lease hand off at every stage; anything that reaches another person becomes a card awaiting your approval.'}</p>
          </div>
          <Link href="/platform" className="text-[14px] font-semibold text-brand hover:underline">{zh ? '看产品结构 →' : 'See the product structure →'}</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            { k: '01', h: { zh: '租前', en: 'Before' }, p: { zh: '对话找房 · 房源发布 · 看房与提问 · 申请 · 租客筛查 · 决定通知', en: 'Search · publish · showings · applications · screening · decision notice' }, href: '/platform#lifecycle' },
            { k: '02', h: { zh: '租中', en: 'During' }, p: { zh: '安省标准租约 · 电子签 · 在管租约 · 租金记录 · 报修 · 维修派单', en: 'Ontario standard lease · e-sign · managed tenancy · rent ledger · maintenance · repair dispatch' }, href: '/platform#lifecycle' },
            { k: '03', h: { zh: '租后', en: 'After' }, p: { zh: '续约 90/60/30 天触点 · 指导比例 · N 表 · 退租 · 租客护照', en: 'Renewal touchpoints · guideline · N-forms · move-out · tenant passport' }, href: '/platform#lifecycle' },
            { k: 'API', h: { zh: 'Stayloop API', en: 'Stayloop API' }, p: { zh: '合规检查 · 申请人出示的核验结论 · 发起筛查——三个端点给合作方', en: 'Compliance · applicant-presented verification · screening — three endpoints for partners' }, href: '/stayloop-api' },
          ].map((c) => (
            <Link key={c.k} href={c.href} className={'rounded-2xl border p-5 transition hover:border-brand ' + (c.k === 'API' ? 'border-transparent text-white' : 'border-line-divider bg-white')} style={c.k === 'API' ? { background: '#1B1B3C' } : undefined}>
              <div className={'font-mono text-[11px] font-bold tracking-eyebrowLg ' + (c.k === 'API' ? 'text-[#7DD3FC]' : 'text-brand')}>{c.k}</div>
              <div className="mt-2 text-[18px] font-bold">{pick(c.h, lang)}</div>
              <p className={'mt-1.5 text-[13.5px] leading-relaxed ' + (c.k === 'API' ? '' : 'text-body-2')} style={c.k === 'API' ? { color: '#B7C2D6' } : undefined}>{pick(c.p, lang)}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ================= STEPS ================= */}
      <section className="mx-auto max-w-[1100px] px-5 py-16 sm:px-7">
        <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '把难题交出去，只要三步' : 'Handing it over takes three steps'}</h2>
        <p className="mt-2 text-[16px] text-body-2">{zh ? '没有表单迷宫——对话就是入口。' : 'No form maze — conversation is the interface.'}</p>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.h.en} className="border-t-2 border-line-divider pt-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>{i + 1}</div>
              <div className="mt-3 text-[17px] font-bold">{pick(s.h, lang)}</div>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-body-2">{pick(s.p, lang)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= VERIFY: live numbers ================= */}
      <section className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-7">
        <div className="rounded-2xl px-7 py-12 text-white sm:px-12" style={{ background: '#1B1B3C' }}>
          <h2 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{zh ? '不给形容词，给可以验证的东西' : 'No adjectives — only things you can verify'}</h2>
          <p className="mt-2 text-[15px]" style={{ color: '#B7C2D6' }}>{zh ? '下面的每个数字都是此刻从线上数据库读出来的，不是写死的。' : 'Every number below is read from the production database right now, not typed in.'}</p>
          <div className="mt-9 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Fact n={fmt(stats?.screenings)} s={zh ? <>份筛查报告已生成，<i>每条结论注明所依据的数值</i></> : <>screening reports generated, <i>every conclusion cites its numbers</i></>} />
            <Fact n={fmt(stats?.ltbOrders)} s={zh ? <>份 LTB 判令已入库可查，<i>姓名命中须地址佐证</i></> : <>LTB orders on file and searchable, <i>name hits need address corroboration</i></>} />
            <Fact n={fmt(stats?.trrebQuarters)} s={zh ? <>个季度的 TRREB 官方成交数据，<i>行情有据</i></> : <>quarters of official TRREB data, <i>market answers with sources</i></>} />
            <Fact n={fmt(stats?.listings)} s={zh ? <>套公开房源，<i>平台核验或 Realtor.ca 实时</i></> : <>public listings, <i>platform-verified or live from Realtor.ca</i></>} />
          </div>
        </div>
      </section>

      {/* ================= FAQ (2026-09-27) ================= */}
      <section id="faq" className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-7">
        <div className="grid gap-8 lg:grid-cols-[4fr_7fr] lg:gap-12">
          <div>
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '你可能想问' : 'You may be wondering'}</h2>
            <p className="mt-2 text-[16px] text-body-2">{zh ? '答案只写已经上线、能在页面上核对的事；各身份更细的问题在角色页。' : 'Answers name only what is live and checkable; role-specific questions live on the role pages.'}</p>
          </div>
          <div data-testid="home-faq">
            {FAQ.map((f, i) => (
              <details key={f.q.en} className="group border-t border-line-divider py-4 last:border-b" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[17px] font-semibold leading-snug text-body [&::-webkit-details-marker]:hidden">
                  <span>{pick(f.q, lang)}</span>
                  <span className="mt-0.5 flex-none font-mono text-[18px] leading-none text-body-3 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-[640px] text-[14.5px] leading-relaxed text-body-2">
                  {pick(f.a, lang)} <Link href={f.href} className="font-semibold text-brand hover:underline">{pick(f.more, lang)}</Link>
                </p>
              </details>
            ))}
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      </section>

      {/* ================= FINAL ================= */}
      <section className="mx-auto max-w-[1100px] px-5 pb-20 text-center sm:px-7">
        <h2 className="text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]">{zh ? <>下一个家，<br />从一句话开始。</> : <>Your next home<br />starts with one sentence.</>}</h2>
        <p className="mx-auto mt-3 max-w-[460px] text-[15px] text-body-2">{zh ? '免注册体验——你的 Agent 现在就能开始干活。租客永远免费。' : 'Try without signing up — your agent can start right now. Free for tenants, always.'}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="sl-btn-primary">{zh ? '对它说一句 ↑' : 'Say something ↑'}</button>
          <Link href="/onboarding/name" className="sl-btn-secondary">{zh ? '注册，让它记住你' : 'Sign up so it remembers you'}</Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}

// One live session per role; remounted (key=role) when the role switches.
function AssistantPanel({ role, name, queued, onQueuedSent }: { role: AgentRole; name: string | null; queued: { role: AgentRole; prompt: string } | null; onQueuedSent: () => void }) {
  const { loading, live, data, status, messages, sendMessage, markListingsShown } = useAgentSession(role)
  const sentRef = useRef<string | null>(null)
  useEffect(() => {
    if (loading || !queued || queued.role !== role) return
    if (sentRef.current === queued.prompt) return
    sentRef.current = queued.prompt
    void sendMessage(queued.prompt)
    onQueuedSent()
  }, [loading, queued, role, sendMessage, onQueuedSent])

  if (loading || !data) {
    return <div className="h-full animate-pulse rounded-2xl border border-line-divider bg-white" />
  }
  return <AgentChat role={role} agentName={name ?? data.agent.agent_name} avatar={data.agent.avatar ?? null} avatarFallback={live ? 'brand' : 'role'} live={live} status={status} messages={messages} onSend={sendMessage} onListingsShown={markListingsShown} fill compactHeader />
}

function Pain({ who, text, onTry, tryLabel }: { who: string; text: string; onTry: () => void; tryLabel: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">{who}</div>
      <div className="text-[17px] font-semibold leading-snug">{text}</div>
      <button type="button" onClick={onTry} className="mt-1 w-fit text-[13.5px] font-bold" style={{ color: '#00ACE4' }}>{tryLabel} →</button>
    </div>
  )
}

function Fact({ n, s }: { n: string; s: ReactNode }) {
  return (
    <div className="border-t pt-5" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
      <div className="font-mono text-[34px] font-bold leading-none [font-variant-numeric:tabular-nums]" style={{ color: '#33BCEA' }}>{n}</div>
      <div className="mt-3 text-[13.5px] leading-relaxed" style={{ color: '#D3E3EF' }}>{s}</div>
    </div>
  )
}

function RoleTabs({ lang, names, onAsk }: { lang: Lang; names: Record<AgentRole, string | null>; onAsk: (r: AgentRole, prompt: string) => void }) {
  const [tab, setTab] = useState<HomeRole>('landlord')
  const zh = lang === 'zh'
  const r = ROLES.find((x) => x.key === tab)!
  const nameFor = (k: HomeRole): string | null => (k === 'provider' ? null : names[k])
  const nm = nameFor(r.key)
  const chatRole: AgentRole | null = r.key === 'provider' ? null : r.key
  // The selected state is one pill that slides to the active tab (2026-09-27):
  // measured from the button, eased, no spring. Until measured, the active
  // button paints its own background so the first frame is never empty.
  const rowRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const measure = () => {
      const btn = rowRef.current?.querySelector<HTMLButtonElement>(`button[data-role="${tab}"]`)
      if (!btn) return
      setInd({ left: btn.offsetLeft, top: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tab, lang])
  return (
    <div className="mt-8">
      <div ref={rowRef} role="tablist" aria-label={zh ? '身份' : 'Roles'} className="relative flex flex-wrap gap-2">
        {ind && (
          <span aria-hidden data-testid="role-tab-indicator" className="pointer-events-none absolute rounded-full"
            style={{ left: ind.left, top: ind.top, width: ind.width, height: ind.height, background: '#1B1B3C', transition: 'left .25s ease, top .25s ease, width .25s ease' }} />
        )}
        {ROLES.map((x) => {
          const on = tab === x.key
          const label = nameFor(x.key)
          return (
            <button key={x.key} type="button" role="tab" aria-selected={on} data-role={x.key} onClick={() => setTab(x.key)}
              className="relative z-[1] rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors"
              style={on ? { background: ind ? 'transparent' : '#1B1B3C', color: '#fff', border: '1px solid transparent' } : { background: '#fff', color: '#1B1B3C', border: '1px solid #D3E3EF' }}>
              {withName(x.tag, lang, label ? label.toUpperCase() : null)}
              {x.pilot && <span className="ml-2 rounded-full px-1.5 py-[1px] font-mono text-[10px] font-bold" style={on ? { background: 'rgba(255,255,255,0.18)', color: '#fff' } : { background: '#EEF5FA', color: '#6E6E8A' }}>{zh ? '试点' : 'PILOT'}</span>}
            </button>
          )
        })}
      </div>
      <div className="mt-6 rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[5fr_6fr] lg:gap-12">
          <div className="min-w-0">
            <h3 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{withName(r.h2, lang, nm)}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-body-2">{withName(r.lead, lang, nm)}</p>
            <ul className="mt-6 space-y-4">
              {r.benefits.map((b) => (
                <li key={b.b.en} className="flex gap-3">
                  <span className="mt-[7px] h-2 w-2 flex-none rounded-full" style={{ background: b.soon ? '#9FBBD0' : '#00ACE4' }} />
                  <div>
                    <div className="text-[15px] font-bold">
                      {withName(b.b, lang, nm)}
                      {b.soon && <span className="ml-2 rounded-full px-2 py-[2px] font-mono text-[10px] font-bold" style={{ background: '#EEF0F4', color: '#6E6E8A' }}>{zh ? '即将' : 'SOON'}</span>}
                    </div>
                    <div className="mt-0.5 text-[13.5px] leading-relaxed text-body-2">{pick(b.s, lang)}</div>
                  </div>
                </li>
              ))}
            </ul>
            <Link href={r.href} className="sl-btn-secondary mt-7 inline-flex">{withName(r.cta, lang, nm)}</Link>
          </div>
          <div className="min-w-0 rounded-xl p-5" style={{ background: '#F3F8FC' }}>
            {chatRole ? (
              <>
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '对它说 · 点一下就发到上面的对话里' : 'Say it · one tap sends it to the conversation above'}</div>
                <div className="mt-3 grid gap-2">
                  {r.chips.map((c) => (
                    <button key={c.label.en} type="button" onClick={() => onAsk(chatRole, pick(c.prompt, lang))}
                      className="group flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-line-divider bg-white px-4 py-3 text-left transition hover:border-[#00ACE4]">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-bold">{pick(c.label, lang)}</span>
                        <span className="block truncate text-[12px] text-body-3">{pick(c.prompt, lang)}</span>
                      </span>
                      <span className="flex-none text-[13px] font-bold" style={{ color: '#00ACE4' }}>→</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 text-[12px] leading-relaxed text-body-3">
                  {zh ? '回答来自真实房源与官方行情；登录后它才读取你的申请、租约与记忆。' : 'Answers come from real listings and official market data; it reads your applications, leases and memory only after you sign in.'}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '现状 · 如实写' : 'Where it stands'}</div>
                <ul className="mt-3 space-y-2.5" data-testid="provider-facts">
                  {(r.facts ?? []).map((f) => (
                    <li key={f.en} className="flex gap-2 text-[13.5px] leading-relaxed text-body">
                      <span className="mt-[8px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: '#00ACE4' }} />
                      <span>{pick(f, lang)}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/services" className="mt-4 inline-block text-[13px] font-bold text-brand hover:underline">{zh ? '看它怎么运作 →' : 'See how it works →'}</Link>
              </>
            )}
          </div>
        </div>
        {/* role → module map: three real pages per role (Muse advice 2026-09-27: link modules by role, not as a catalogue) */}
        <div className="mt-8 border-t border-line-divider pt-6">
          <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '模块 · 直接进真实页面' : 'Modules · open the real page'}</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3" data-testid="role-modules">
            {r.modules.map((m) => (
              <Link key={m.href} href={m.href} className="group flex min-w-0 items-start justify-between gap-3 rounded-xl border border-line-divider bg-white px-4 py-3.5 transition hover:border-[#00ACE4]">
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold">{pick(m.h, lang)}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-body-3">{pick(m.s, lang)}</span>
                </span>
                <span className="flex-none text-[13px] font-bold transition-transform group-hover:translate-x-0.5" style={{ color: '#00ACE4' }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

// Homepage V0.7 (2026-09-27) — a marketing + login page.
//
// Until V0.6 the hero WAS the live assistant ("首页就是助手", 2026-09-06). The
// user's verdict after three weeks: the box was too small to show what the
// assistant does, and the page never explained the system. So now:
//   1. The hero explains Stayloop in one screen and carries the login card
//      (Google / email + password sign-in and registration — the same hook as /login and /register).
//   2. Signed-in visitors never see this page: they are sent straight to the
//      assistant of the hat they wear (providers to their work-order desk),
//      the same predicate the login page uses (homeForHats).
//   3. The free, no-account demo still exists — on the assistant preview
//      pages, where the conversation gets the whole screen. Every「试一试」
//      here and every legacy `/?role=&ask=` link (middleware) lands there.
// One story, each point told once (user 2026-09-28: "动画和这个图片重复了…要把
// stayloop 的故事讲清晰和简单"): what it is (hero) → how it works (the film +
// the four-step loop) → what it does for each role (tabs) → why you can trust
// it (Ontario rules with ids, live numbers) → questions → how to start.
// The landing tiles, the static sample exchange, the lifecycle cards and the
// separate closing band were retired: each repeated something shown elsewhere.
// No photos, no invented numbers, no pricing (that has one source: /pricing);
// the header, footer, logo and palette are untouched.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import LoginCard from '@/components/home/LoginCard'
import { useT, type Lang } from '@/lib/i18n'
import { roleStorageKey, useAuth } from '@/lib/useAuth'
import { useHats } from '@/lib/useHats'
import { HOME, landingForAccount } from '@/lib/landlordHat'
import { getStoredAIName, resolveAccountNameFor } from '@/lib/aiName'
import { assistantPromptHref } from '@/lib/homeDeepLink'
import { GUIDELINE_TEXT, ONTARIO_RULES, ruleById, type Rule } from '@/lib/ontario/rules'
import type { AgentRole } from '@/lib/agent/types'

type Bi = { zh: string; en: string }
const pick = (b: Bi, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

// Copy that used to name the visitor's assistant ({ai}) now says "AI": the
// signed-in user, who has a named assistant, is redirected off this page.
const NAME_TOKEN = '{ai}'
function withName(b: Bi, lang: Lang): string {
  return pick(b, lang).split(NAME_TOKEN).join('AI')
}

type HomeRole = AgentRole | 'provider'

// ── Per-role sections (four tabs, 2026-09-27) ────────────────────────────────
// Copy follows the approved homepage; every module opens a REAL page. The
// example sentences open the assistant PREVIEW for that role (no account),
// where the conversation has the whole screen.
type Module = { h: Bi; s: Bi; href: string }
const ROLES: {
  key: HomeRole
  tag: Bi
  /** small mono tag on the tab — the provider network is a pilot */
  pilot?: boolean
  h2: Bi
  lead: Bi
  benefits: { b: Bi; s: Bi; soon?: boolean }[]
  /** example sentences that open the role's assistant preview (roles with an assistant) */
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
    h2: { zh: '选对租客，租约、续约、维修都有人跟进。', en: 'Pick the right tenant; leases, renewals and repairs are followed up for you.' },
    lead: {
      zh: '每份申请先查材料真伪、收入佐证和法庭记录，每条结论写明依据；录取与否由你决定。',
      en: 'Every application is checked for document authenticity, income corroboration and court records, each conclusion with its evidence; whether to admit is your decision.',
    },
    benefits: [
      { b: { zh: '每份申请先查真伪与记录', en: 'Every application is checked first' }, s: { zh: '材料取证、收入佐证、LTB 判令与法院记录都查过；发现伪造迹象会标出并写明依据。', en: 'Document forensics, income corroboration, LTB orders and court records; signs of forgery are flagged with the evidence.' } },
      { b: { zh: '租约与续约由系统跟进', en: 'Leases and renewals are followed up' }, s: { zh: '安省标准租约起草与电子签；到期前 90 / 60 / 30 天提醒续约，方案按指导比例备好，你批准才发。', en: 'Ontario standard lease drafting and e-signing; renewal reminders at 90 / 60 / 30 days with options within the guideline, sent only when you approve.' } },
      { b: { zh: 'AI 后台全天候在线', en: 'An AI back office, on around the clock' }, s: { zh: '合规检查、审计留痕、报修接待与派单，你只需要确认。', en: 'Compliance checks, an audit trail, repair intake and dispatch; you only confirm.' } },
    ],
    chips: [
      { label: { zh: '租客筛查', en: 'Tenant screening' }, prompt: { zh: '我要筛查一位申请人：告诉我报告会查什么、需要准备哪些材料，然后带我开始。', en: 'I want to screen an applicant: tell me what the report checks, what documents I need, then take me to start.' } },
      { label: { zh: '看看新申请', en: 'Review applications' }, prompt: { zh: '帮我看看最新的申请，按材料是否齐全和递交时间整理。', en: 'Review my latest applications and sort them by completeness and submission time.' } },
      { label: { zh: '续约方案', en: 'Renewal options' }, prompt: { zh: '帮我看看哪些租约快到期了，给我续约方案和合规涨幅。', en: 'Which leases are coming up? Give me renewal options with the legal increase.' } },
      { label: { zh: '合规检查', en: 'Compliance check' }, prompt: { zh: '帮我检查我的房源和租约有没有 RTA 合规风险。', en: 'Check my listings and leases for RTA compliance risks.' } },
      { label: { zh: '发布房源', en: 'List a property' }, prompt: { zh: '我要发布一个新房源，你来帮我整理信息。', en: 'I want to list a new property — help me put it together.' } },
    ],
    modules: [
      { h: { zh: '租客筛查', en: 'Tenant screening' }, s: { zh: '材料取证 · 收入佐证 · LTB 判令与法院记录', en: 'Document forensics · income corroboration · LTB orders and court records' }, href: '/screening' },
      { h: { zh: '发布房源与申请队列', en: 'Listing and applications' }, s: { zh: '五步向导 · 一键导入 Realtor.ca 链接 · 核验后上线 · 申请一键筛查', en: 'Five-step wizard · import from a Realtor.ca link · live after verification · one-tap screening from an application' }, href: '/dashboard/listings/new' },
      { h: { zh: '租约、续约与维修', en: 'Leases, renewals and repairs' }, s: { zh: '安省标准租约电子签 · 续约 90 / 60 / 30 天 · 报修派给已核验服务商', en: 'Ontario standard lease e-sign · renewal at 90 / 60 / 30 days · repairs dispatched to verified providers' }, href: '/landlord/leases' },
    ],
    cta: { zh: '让 {ai} 协助管理房源 →', en: 'Let {ai} help manage your rentals →' },
    href: '/landlord',
  },
  {
    key: 'tenant',
    tag: { zh: '租客 × {ai}', en: 'Tenant × {ai}' },
    h2: { zh: '说出你想要的家，剩下的它来跑。', en: 'Say what home you want; it does the legwork.' },
    lead: {
      zh: '条件说人话，房源都是真实挂牌；看房、申请、签约、报修都在一处，每一步看得到进度。',
      en: 'Say it in plain language; every listing is real. Showings, applications, signing and repairs sit in one place, and you can see each step.',
    },
    benefits: [
      { b: { zh: '真实挂牌 + 官方行情作答', en: 'Real listings + official market data' }, s: { zh: 'TRREB 官方成交对照，不编造；看房和提问直接送到房东。', en: 'Checked against official TRREB transactions, never invented; showings and questions go straight to the landlord.' } },
      { b: { zh: '申请进度看得见', en: 'See where your application stands' }, s: { zh: '已提交、房东已查看、筛查、决定、租约，每一步都看得到。', en: 'Submitted, viewed by the landlord, screened, decided, lease: every step is visible.' } },
      { b: { zh: '租约讲清楚，报修有着落', en: 'Leases explained, repairs followed up' }, s: { zh: '英文租约逐条讲成中文；报修可附照片，有人上门前按 RTA 提前通知你。', en: 'English leases explained clause by clause; repairs can carry photos, and you are notified before anyone enters, as the RTA requires.' } },
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
      { h: { zh: '签约与报修', en: 'Signing and repairs' }, s: { zh: '安省标准租约电子签 · 在管租约 · 报修可附照片', en: 'Ontario standard lease e-sign · managed tenancy · repairs with photos' }, href: '/tenant/maintenance' },
    ],
    cta: { zh: '让 {ai} 开始找 →', en: 'Let {ai} start searching →' },
    href: '/tenant',
  },
  {
    key: 'agent',
    tag: { zh: '经纪 × {ai}', en: 'Agent × {ai}' },
    h2: { zh: '行政事务交给 AI，时间留给专业工作。', en: 'Hand the admin to AI, keep your time for the work that closes.' },
    lead: {
      zh: '客户、定价、带看准备交给 {ai}；客户在邮件链接里确认过委托，你才能替他发起筛查。',
      en: 'Clients, pricing and showing prep go to {ai}; screening for a client needs a delegation the client has confirmed from an email link.',
    },
    benefits: [
      { b: { zh: '有委托，才代客筛查', en: 'Screen for a client only under a delegation' }, s: { zh: 'TRESA 两个日期记录齐、客户确认委托后才能发起；报告房东直接看得到。', en: 'Both TRESA dates recorded and the delegation confirmed by the client; the landlord sees the report directly.' } },
      { b: { zh: '{ai} 记住每位客户', en: '{ai} remembers every client' }, s: { zh: '预算、区域、偏好只说一次；下次开口它就接上。', en: 'Budget, area, preferences said once; next time it picks up where you left off.' } },
      { b: { zh: '挂牌定价有依据', en: 'Pricing with sources' }, s: { zh: '同区实时挂牌加 TRREB 官方成交做比价，写明样本与来源。', en: 'Live listings nearby plus official TRREB data, with the sample and the source stated.' } },
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

// ── "It proposes, you decide": the loop the film plays, in four lines ────────
// The only place on the page that spells out the approval rule in full; the
// hero states it in one clause and the FAQ no longer repeats it.
const FLOW: { h: Bi; p: Bi }[] = [
  { h: { zh: '你说一句', en: 'You say it' }, p: { zh: '「多大附近、能养猫、4000 以内」这样说就行；不想打字，也可以点卡片一步步选。', en: '"Near UofT, cats OK, under 4000" is enough; or tap a card and pick step by step.' } },
  { h: { zh: '它去办', en: 'It does the work' }, p: { zh: '查真实挂牌与 TRREB 行情、核材料真伪、查 LTB 与法院记录、起草租约与通知。', en: 'Searches real listings and TRREB data, checks documents, looks up LTB and court records, drafts leases and notices.' } },
  { h: { zh: '你来批准', en: 'You approve' }, p: { zh: '会影响到别人的动作先变成一张卡片，写明将分享什么、不分享什么；批准后 60 秒内可撤销。', en: 'Anything that reaches another person becomes a card first, saying what will and will not be shared; an approval can be undone for 60 seconds.' } },
  { h: { zh: '执行并留痕', en: 'Done, and logged' }, p: { zh: '每一步写进审计记录；一件租赁事务可以导出带内容指纹的证据包。', en: 'Every step goes to the audit log; a rental matter can be exported as a fingerprinted evidence pack.' } },
]

// ── Ontario rules shown on the page — ids resolved against the single source ─
const RULE_IDS = [
  'RTA-106-deposit-cap', 'RTA-134-no-fees', 'RTA-120-guideline', 'RTA-116-n1-90-days', 'RTA-59-n4-7-days',
  'RTA-27-entry-notice', 'OHRC-no-income-cutoff', 'OREG9-18-standard-lease', 'TRESA-32-registrant-disclosure', 'CRA-10-7-notice',
] as const
const RULE_CHIPS: Rule[] = RULE_IDS.map((id) => ruleById(id)).filter((r): r is Rule => !!r)
const statuteShort = (s: string) => s.split(' · ')[0]

const STEPS: { h: Bi; p: Bi }[] = [
  { h: { zh: '登录', en: 'Sign in' }, p: { zh: '一键 Google，或邮箱 + 密码注册，不要信用卡。登录后直接进入你的 AI 助理。', en: 'One tap with Google, or email + password; no credit card. After sign-in you land in your AI Agent.' } },
  { h: { zh: '选身份，给 AI 助理起个名字', en: 'Pick a role, name your AI Agent' }, p: { zh: '租客 / 房东 / 经纪 / 服务商，之后随时在右上角切换。名字只起一次，租客、房东、经纪共用同一个 AI 助理。', en: 'Tenant / landlord / agent / provider, switchable any time from the top-right menu. You name it once; tenant, landlord and agent share one AI Agent.' } },
  { h: { zh: '说第一句话', en: 'Say the first sentence' }, p: { zh: '它会一步步问清楚，再去办。', en: 'It asks what it needs, step by step, then gets to work.' } },
]

// Homepage FAQ: cross-role questions the page does not answer elsewhere; every
// answer names only what is live and checkable on the site. Also emitted as
// FAQPage JSON-LD. The first question exists because the page no longer carries
// the conversation itself. (「AI 会不会替我做决定」is the four-step loop, and
// 「服务商怎么加入」is the provider tab — both retired here on 2026-09-28.)
const FAQ: { q: Bi; a: Bi; href: string; more: Bi }[] = [
  {
    q: { zh: '不登录能试吗？', en: 'Can I try it without signing in?' },
    a: { zh: '能。AI 助理预览页免注册、不记住你、每小时有次数上限；回答来自真实房源与官方行情。登录后它才读取你的申请、租约与记忆，也才能替你发出任何东西。', en: 'Yes. The AI Agent preview needs no account, remembers nothing and has an hourly limit; answers come from real listings and official market data. Only after you sign in does it read your applications, leases and memory, or send anything on your behalf.' },
    href: '/tenant/agent', more: { zh: '打开 AI 助理预览 →', en: 'Open the preview →' },
  },
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
    q: { zh: '我的数据放在哪里，谁能看到？', en: 'Where is my data, and who can see it?' },
    a: { zh: '数据库在加拿大（AWS 蒙特利尔）。租客、房东、经纪、服务商各自只能读到与自己有关的记录，这是数据库层面的权限，不只是页面上的隐藏；筛查记录房东可随时删除，租赁事务可导出带内容指纹的证据包。AI 服务商（Claude · GPT · Gemini，可自选）及其所在地在隐私页逐家列明。', en: 'The database is in Canada (AWS Montréal). Tenants, landlords, agents and providers can each read only the records that concern them, enforced at the database rather than hidden in the page. A landlord can delete a screening at any time; a rental matter can be exported as a fingerprinted evidence pack. The AI providers (Claude · GPT · Gemini, your choice) and where they run are listed one by one on the privacy page.' },
    href: '/privacy', more: { zh: '隐私页 →', en: 'Privacy page →' },
  },
]

type Stats = { screenings: number | null; ltbOrders: number | null; listings: number | null; trrebQuarters: number | null }

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-CA')
}

const TRY_HREF = '/tenant/agent'

// The film (2026-09-28): Mia, Sarah and David — tenant, landlord, agent — each
// with their own assistant, one unit from listing to renewal. Their phones run
// the product's own chat, cards and composer driven by a script — see
// components/home/ThreeRoleFilm.tsx and lib/home/film.ts. It is the "How
// Stayloop works" section (user 2026-09-28), loaded lazily so the hero paints
// first; the placeholder keeps the film's exact size (no layout shift).
const ThreeRoleFilm = dynamic(() => import('@/components/home/ThreeRoleFilm'), {
  ssr: false,
  loading: () => (
    <div aria-hidden>
      <div className="mx-auto mb-3 h-[42px] max-w-[420px] lg:hidden" />
      <div className="mx-auto h-[600px] max-w-[420px] rounded-[22px] border border-line-divider bg-[#EEF5FA] lg:h-[660px] lg:max-w-none" />
      <div className="mt-4 h-[74px] md:h-[52px]" />
      <div className="mt-1 h-[74px] md:h-[59px]" />
    </div>
  ),
})

export default function HomeNext() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [stats, setStats] = useState<Stats | null>(null)
  const router = useRouter()

  // Signed in → straight to the assistant of the hat you wear (providers to
  // the work-order desk; a brand-new account to onboarding); this page is for
  // visitors. Same predicate as /login (homeForHats: the remembered hat only
  // counts when the account holds it), wrapped by landingForAccount.
  // The first client render matches the server (auth still loading → the
  // marketing page), so nothing here branches during hydration.
  const auth = useAuth()
  const hats = useHats()
  const signedIn = !auth.loading && !!auth.user && !(auth.user as { is_anonymous?: boolean }).is_anonymous
  const remembered = signedIn && typeof window !== 'undefined' ? (window.localStorage.getItem(roleStorageKey(auth.user!.id)) ?? auth.role) : auth.role
  // Has this account ever named its assistant? A brand-new account (no hat,
  // never named) must go through onboarding even when it reaches `/` signed
  // in without the auth callback having run (a link that carried no
  // redirect_to lands on the site URL) — V0.7 follow-up, 2026-09-27.
  const [named, setNamed] = useState<boolean | null>(null)
  useEffect(() => {
    if (!signedIn) { setNamed(null); return }
    const uid = auth.user!.id
    if (getStoredAIName(uid)) { setNamed(true); return }
    let cancelled = false
    resolveAccountNameFor(uid).then(({ uid: u, name }) => { if (!cancelled) setNamed(u === uid && !!name) })
    return () => { cancelled = true }
  }, [signedIn, auth.user])
  const ready = signedIn && !hats.loading && named !== null
  const target = ready ? landingForAccount(remembered, hats, named) : HOME.tenant
  const redirected = useRef(false)
  useEffect(() => {
    if (!ready || redirected.current) return
    redirected.current = true
    router.replace(target)
  }, [ready, target, router])

  useEffect(() => {
    if (signedIn) return
    let cancelled = false
    fetch('/api/public/stats').then((r) => r.json()).then((j) => { if (!cancelled && j?.ok) setStats(j) }).catch(() => {})
    return () => { cancelled = true }
  }, [signedIn])

  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: pick(f.q, lang), acceptedAnswer: { '@type': 'Answer', text: pick(f.a, lang) } })) }

  if (signedIn) {
    return (
      <div className="min-h-screen bg-white text-body">
        <Header variant="transparent" />
        <main className="mx-auto flex max-w-[1100px] flex-col items-center px-5 py-28 text-center" data-testid="home-redirect">
          <span className="h-10 w-10 animate-pulse rounded-full" style={{ background: '#00ACE4' }} aria-hidden />
          <p className="mt-5 text-[15px] text-body-2">{zh ? '正在打开你的 AI 助理…' : 'Opening your AI Agent…'}</p>
          <Link href={target} className="mt-3 text-[13px] font-semibold text-brand hover:underline">{zh ? '没有自动跳转？点这里' : 'Not redirected? Tap here'}</Link>
        </main>
      </div>
    )
  }

  return (
    <div style={{ background: '#FFFFFF' }} className="text-body">
      <Header variant="transparent" />

      {/* ================= HERO: message + login card ================= */}
      <section style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto grid max-w-[1100px] gap-8 px-5 pb-10 pt-8 sm:px-7 sm:pt-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12 lg:pb-11 lg:pt-[52px]">
          <div className="min-w-0">
            <h1 className="text-[30px] font-extrabold leading-[1.15] tracking-tight sm:text-[44px]">
              {zh
                ? <>租房路上的每一步，<br className="hidden sm:block" />交给<em className="not-italic" style={{ color: '#00ACE4' }}>你自己的 AI 助理</em>。</>
                : <>Every step of renting,<br className="hidden sm:block" />handled by <em className="not-italic" style={{ color: '#00ACE4' }}>your own AI Agent</em>.</>}
            </h1>
            <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-body-2 sm:mt-4 sm:text-[17px]">
              {zh
                ? '找房、筛查、租约、维修、续约都由它去办；会影响到别人的动作先经你批准，安省规则内置，全程留痕。'
                : 'Search, screening, leases, repairs and renewals are its job; anything that reaches another person waits for your approval, Ontario rules built in, every step logged.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 sm:mt-6">
              <a href="#login" className="sl-btn-primary">{zh ? '免费开始 →' : 'Start free →'}</a>
              <Link href={TRY_HREF} className="sl-btn-secondary">{zh ? '先免登录试一试' : 'Try it without signing in'}</Link>
            </div>
          </div>
          <LoginCard className="min-w-0" />
        </div>
      </section>

      {/* ================= HOW IT WORKS: three people, three assistants, one unit ================= */}
      <section id="how-it-works" className="border-t border-line-divider">
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[760px]">
              <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? 'Stayloop 是怎么工作的' : 'How Stayloop works'}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-body-2 [text-wrap:pretty]">
                {zh
                  ? '租客、房东、经纪各有自己的 AI 助理，事情在三个助理之间接力。下面用同一套房，从委托挂牌演到续约。'
                  : 'Tenants, landlords and agents each have their own AI Agent, and work passes from one to the next. Below, one unit from listing to renewal.'}
              </p>
            </div>
            <Link href="/platform" className="text-[14px] font-semibold text-brand hover:underline">{zh ? '看完整产品结构 →' : 'See the full product →'}</Link>
          </div>
          <div className="mt-8" data-testid="home-film">
            <ThreeRoleFilm />
          </div>
          {/* the loop the film plays, in four lines — the only place the approval rule is spelled out */}
          <div className="mt-10 border-t border-line-divider pt-6">
            <div className="text-[16px] font-extrabold text-ink">{zh ? '它提议，你决定。' : 'It proposes. You decide.'}</div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0" data-testid="home-flow">
              {FLOW.map((s, i) => (
                <div key={s.h.en} className={`min-w-0 ${i > 0 ? 'lg:border-l lg:border-dashed lg:border-line-divider lg:pl-6' : ''} lg:pr-6`}>
                  <div className="font-mono text-[12px] font-bold text-brand">0{i + 1}</div>
                  <div className="mt-2 text-[16px] font-extrabold text-ink">{pick(s.h, lang)}</div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-body-2">{pick(s.p, lang)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= ROLES ================= */}
      <section id="roles" className="border-t border-line-divider" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7 sm:py-16">
          <div className="max-w-[640px]">
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '四种身份，各自的入口' : 'Four roles, each with its own entry'}</h2>
            <p className="mt-2 text-[16px] text-body-2">{zh ? '同一个 AI 助理按你的身份办事，立场只对你负责；服务商用自己的工单工作台。' : 'One AI Agent works in whichever role you are in and answers only to you; providers use their own work-order desk.'}</p>
          </div>
          <RoleTabs lang={lang} />
        </div>
      </section>

      {/* ================= RULES: Ontario law with ids ================= */}
      <section className="border-t border-line-divider">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-14 sm:px-7 sm:py-16 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-10">
          <div>
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '安省规则内置，每条有编号。' : 'Ontario rules built in, each with an id.'}</h2>
            <p className="mt-2 text-[16px] text-body-2">{zh ? '发布房源、保存租约、发出通知之前自动检查；对话里的建议也受同一套规则约束。规则、法条与生效日期公开可查。' : 'Checked before a listing is published, a lease is saved or a notice goes out; the AI Agent’s advice is bound by the same set. Rules, statutes and effective dates are public.'}</p>
            <Link href="/rules" className="mt-4 inline-block text-[14px] font-bold text-brand hover:underline">{zh ? `全部 ${ONTARIO_RULES.length} 条规则 →` : `All ${ONTARIO_RULES.length} rules →`}</Link>
          </div>
          <div className="flex flex-wrap gap-2.5" data-testid="home-rules">
            {RULE_CHIPS.map((r) => (
              <Link key={r.id} href="/rules" className="inline-flex max-w-full items-baseline gap-2 rounded-full border border-line-divider bg-white px-3.5 py-2 text-[13.5px] transition hover:border-[#00ACE4]">
                <span className="font-mono text-[11px] font-bold text-brand-strong">{statuteShort(r.statute)}</span>
                <span className="min-w-0">{pick(r.title, lang)}{r.id === 'RTA-120-guideline' ? `（${pick(GUIDELINE_TEXT, lang)}）` : ''}</span>
              </Link>
            ))}
          </div>
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

      {/* ================= FAQ ================= */}
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

      {/* ================= START: three steps + the two doors ================= */}
      <section className="border-t border-line-divider">
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-7 sm:py-16">
          <div className="max-w-[640px]">
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">{zh ? '三步开始' : 'Three steps to start'}</h2>
            <p className="mt-2 text-[16px] text-body-2">{zh ? '登录后就是对话。租客永远免费。' : 'After sign-in, it is a conversation. Free for tenants, always.'}</p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.h.en} className="border-t-2 border-line-divider pt-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full font-mono text-[13px] font-bold text-white" style={{ background: '#00ACE4' }}>{i + 1}</div>
                <div className="mt-3 text-[17px] font-bold">{pick(s.h, lang)}</div>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-body-2 [text-wrap:pretty]">{pick(s.p, lang)}</p>
              </div>
            ))}
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a href="#login" className="sl-btn-primary">{zh ? '免费开始 ↑' : 'Start free ↑'}</a>
            <Link href={TRY_HREF} className="sl-btn-secondary">{zh ? '先免登录试一试' : 'Try it without signing in'}</Link>
          </div>
        </div>
      </section>

      <Footer />
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

function RoleTabs({ lang }: { lang: Lang }) {
  const [tab, setTab] = useState<HomeRole>('landlord')
  const zh = lang === 'zh'
  const r = ROLES.find((x) => x.key === tab)!
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
          return (
            <button key={x.key} type="button" role="tab" aria-selected={on} data-role={x.key} onClick={() => setTab(x.key)}
              className="relative z-[1] rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors"
              style={on ? { background: ind ? 'transparent' : '#1B1B3C', color: '#fff', border: '1px solid transparent' } : { background: '#fff', color: '#1B1B3C', border: '1px solid #D3E3EF' }}>
              {withName(x.tag, lang)}
              {x.pilot && <span className="ml-2 rounded-full px-1.5 py-[1px] font-mono text-[10px] font-bold" style={on ? { background: 'rgba(255,255,255,0.18)', color: '#fff' } : { background: '#EEF5FA', color: '#6E6E8A' }}>{zh ? '试点' : 'PILOT'}</span>}
            </button>
          )
        })}
      </div>
      <div className="mt-6 rounded-2xl border border-line-divider bg-white p-6 sm:p-8">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[5fr_6fr] lg:gap-12">
          <div className="min-w-0">
            <h3 className="text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">{withName(r.h2, lang)}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-body-2">{withName(r.lead, lang)}</p>
            <ul className="mt-6 space-y-4">
              {r.benefits.map((b) => (
                <li key={b.b.en} className="flex gap-3">
                  <span className="mt-[7px] h-2 w-2 flex-none rounded-full" style={{ background: b.soon ? '#9FBBD0' : '#00ACE4' }} />
                  <div>
                    <div className="text-[15px] font-bold">
                      {withName(b.b, lang)}
                      {b.soon && <span className="ml-2 rounded-full px-2 py-[2px] font-mono text-[10px] font-bold" style={{ background: '#EEF0F4', color: '#6E6E8A' }}>{zh ? '即将' : 'SOON'}</span>}
                    </div>
                    <div className="mt-0.5 text-[13.5px] leading-relaxed text-body-2">{pick(b.s, lang)}</div>
                  </div>
                </li>
              ))}
            </ul>
            <Link href={r.href} className="sl-btn-secondary mt-7 inline-flex">{withName(r.cta, lang)}</Link>
          </div>
          <div className="min-w-0 rounded-xl p-5" style={{ background: '#F3F8FC' }}>
            {chatRole ? (
              <>
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-body-3">{zh ? '试一试 · 打开 AI 助理预览，不用登录' : 'Try it · opens the AI Agent preview, no account'}</div>
                <div className="mt-3 grid gap-2">
                  {r.chips.map((c) => (
                    <Link key={c.label.en} href={assistantPromptHref(chatRole, pick(c.prompt, lang))}
                      className="group flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-line-divider bg-white px-4 py-3 text-left transition hover:border-[#00ACE4]">
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-bold">{pick(c.label, lang)}</span>
                        <span className="block truncate text-[12px] text-body-3">{pick(c.prompt, lang)}</span>
                      </span>
                      <span className="flex-none text-[13px] font-bold" style={{ color: '#00ACE4' }}>→</span>
                    </Link>
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

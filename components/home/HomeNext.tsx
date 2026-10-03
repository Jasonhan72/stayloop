'use client'

// Homepage V0.7 (2026-09-27) — a marketing + login page.
//
// Until V0.6 the hero WAS the live assistant ("首页就是助手", 2026-09-06). The
// user's verdict after three weeks: the box was too small to show what the
// assistant does, and the page never explained the system. So now:
//   1. The hero explains Stayloop in one screen and carries the ask box (components/home/HeroComposer,
//      2026-10-01, after America.gov): the question goes to the chosen role's AI Agent page; sign-in /
//      sign-up are one line under it (the sign-in block itself lives on /login and /register).
//   2. Signed-in visitors never see this page: they are sent straight to the
//      assistant of the hat they wear (providers to their work-order desk),
//      the same predicate the login page uses (homeForHats).
//   3. The free, no-account conversation happens on the AI Agent preview pages, where it gets the
//      whole screen. The ask box, the role tabs' examples and every legacy `/?role=&ask=` link
//      (middleware) land there.
// One story, each point told once (user 2026-09-28: "动画和这个图片重复了…要把
// stayloop 的故事讲清晰和简单"). Since 2026-10-01 (plan A, after muse.ai / america.gov) one idea per
// screen: hero (ask box) → one-sentence statement → how it works (the film in a media card) → six
// panels, picture and words alternating (approval · tenant · landlord · agent · provider · rules; the
// role tabs are gone) → live numbers → questions → one closing band with the three steps.
// No real photos (the pictures are the film's 3D scenes or the product's own components), no invented
// numbers, no pricing (that has one source: /pricing);
// the header, footer, logo and palette are untouched.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import HeroComposer from '@/components/home/HeroComposer'
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

// Type scale, plan A (2026-10-01, after muse.ai / america.gov): 600 headings and 400 text only,
// headings 44 / 36px on desktop (28 / 26 on phones), 20px muted leads, 17px text at 1.75 for Chinese.
// The CJK details (no negative tracking, proportional punctuation, balanced lines) live in globals.css.
// Chinese headings break only at punctuation (keep-all); a long run without punctuation gets an explicit
// break point — '\u200b' at the phrase boundary — instead of the emergency mid-word break.
const H2 = 'sl-type-head text-[28px] leading-[1.18] text-ink sm:text-[44px] sm:leading-[1.12]'
const LEAD = 'sl-type-text text-[17px] leading-[1.6] text-body-3 sm:text-[20px]'
const BODY = 'sl-type-text text-[16px] leading-[1.75] text-body-2 sm:text-[17px]'
const SMALL = 'sl-type-text text-[15px] leading-[1.7] text-body-3'
const TEXT_LINK = 'text-[15px] font-semibold text-brand hover:underline'

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
    h2: { zh: '行政事务交给 AI，时间留给\u200b专业工作。', en: 'Hand the admin to AI, keep your time for the work that closes.' },
    lead: {
      zh: '客户、定价、带看准备交给 {ai}；RECO 注册有效就能直接筛查申请人，客户确认委托后，从客户表发起的筛查也进客户自己的账号。',
      en: 'Clients, pricing and showing prep go to {ai}; with a verified RECO registration you screen applicants directly, and once the client confirms a delegation, screenings started from your client book land in their account too.',
    },
    benefits: [
      { b: { zh: '租客筛查，直接发起', en: 'Run tenant screening yourself' }, s: { zh: 'RECO 注册核验有效即可，报告记在你名下；客户确认委托后，从客户表那一行发起的筛查，房东客户在自己的账号里也看得到。', en: 'A verified RECO registration is enough and the report sits under your name; once the client confirms a delegation, screenings started from their row in your client book show in their own account too.' } },
      { b: { zh: '{ai} 记住每位客户', en: '{ai} remembers every client' }, s: { zh: '预算、区域、偏好只说一次；下次开口它就接上。', en: 'Budget, area, preferences said once; next time it picks up where you left off.' } },
      { b: { zh: '挂牌定价有依据', en: 'Pricing with sources' }, s: { zh: '同区实时挂牌加 TRREB 官方成交做比价，写明样本与来源。', en: 'Live listings nearby plus official TRREB data, with the sample and the source stated.' } },
    ],
    chips: [
      { label: { zh: '租客筛查', en: 'Tenant screening' }, prompt: { zh: '我替房东客户收到一份租房申请。帮我筛查这位申请人：告诉我报告会查什么、要申请人提交哪些材料，然后带我开始。', en: 'I have a rental application for my landlord client. Screen the applicant: tell me what the report checks, what the applicant must submit, then take me to start.' } },
      { label: { zh: '挂牌定价', en: 'Price the listing' }, prompt: { zh: '帮客户的房源定租金：拉这个区域同户型的实时挂牌和 TRREB 官方成交数据做比价。', en: "Price my client's unit: pull live listings for the same area and unit type plus the TRREB benchmark for comparison." } },
      { label: { zh: '合规边界', en: 'Compliance boundaries' }, prompt: { zh: '带看和收申请时：哪些问题不能问（人权法）、哪些话不能替房东答、TRESA 要我先给客户什么文件？', en: 'At showings and intake: which questions are off-limits (Human Rights Code), what must I not answer for the landlord, and what does TRESA require me to give a client first?' } },
    ],
    modules: [
      { h: { zh: '客户表与委托', en: 'Client book and delegations' }, s: { zh: 'TRESA 两个日期 · 委托由客户确认 · 委托下发起的筛查客户也看得到', en: 'Two TRESA dates · delegation confirmed by the client · screenings under a delegation show in the client’s account' }, href: '/agent/clients' },
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
    h2: { zh: '想接多伦多\u200b租房市场的\u200b维修工单？先把资质核了。', en: 'Want repair work orders from Toronto rentals? Get your credentials verified first.' },
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
  { h: { zh: '执行并留痕', en: 'Done, and logged' }, p: { zh: '每一步写进审计记录；一件租赁事务的聊天记录可以导出，带内容指纹。', en: 'Every step goes to the audit log; a rental matter’s chat history can be exported, fingerprinted.' } },
]

// A break point inside a long unpunctuated Chinese run, for narrow screens only (below md the statement's
// clauses are wider than the column). From md up the paragraph breaks only at punctuation, so a phrase like
// 当地的租房规定 is never split on a desktop.
const ZW = <span className="md:hidden">{'\u200b'}</span>
// One statement group — from md up a group never wraps inside, so lines always fall between groups
// (opening clause / before move-in / after move-in / end of term / the two safeguards). Below md it wraps
// normally at punctuation and the {ZW} points.
function Seg({ children }: { children: ReactNode }) {
  return <span className="md:whitespace-nowrap">{children}</span>
}

// ── Ontario rules shown on the page — ids resolved against the single source ─
const RULE_IDS = [
  'RTA-106-deposit-cap', 'RTA-134-no-fees', 'RTA-120-guideline', 'RTA-116-n1-90-days', 'RTA-59-n4-7-days',
  'RTA-27-entry-notice', 'OHRC-no-income-cutoff', 'OREG9-18-standard-lease', 'TRESA-32-registrant-disclosure', 'CRA-10-7-notice',
] as const
const RULE_CHIPS: Rule[] = RULE_IDS.map((id) => ruleById(id)).filter((r): r is Rule => !!r)
// Phones leave out four rules that the page says again elsewhere (the entry notice in the tenant and
// provider cards, OHRC and s.10(7) in the FAQ, the standard lease in the landlord card); all ten are one
// tap away through 「全部 N 条规则 →」 in the same panel (2026-10-01, phone trim; TRESA s.32 stays because
// nothing else on the page says it).
const PHONE_HIDDEN_RULES = new Set<string>(['RTA-27-entry-notice', 'OHRC-no-income-cutoff', 'OREG9-18-standard-lease', 'CRA-10-7-notice'])
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
    q: { zh: '筛查报告会不会\u200b一票否决申请人？', en: 'Can the screening report reject an applicant on its own?' },
    a: { zh: '不会。报告列出可核验的事实——材料真伪、收入佐证、LTB 判令与法院记录——每条结论注明依据；按 OHRC 租房政策，租金收入比和信用分不设硬性截止线，只作参考。录取或婉拒由房东本人决定，通知信附《消费者报告法》s.10(7) 的说明。', en: 'No. The report lists checkable facts, document authenticity, income corroboration, LTB orders and court records, and every conclusion cites its evidence; following the OHRC rental policy there is no hard cut-off on rent-to-income ratio or credit score, they are context only. Admitting or declining is the landlord’s own decision, and the notice letter carries the Consumer Reporting Act s.10(7) statement.' },
    href: '/screening', more: { zh: '筛查怎么做 →', en: 'How screening works →' },
  },
  {
    q: { zh: '我的数据放在哪里，谁能看到？', en: 'Where is my data, and who can see it?' },
    a: { zh: '数据库在加拿大（AWS 蒙特利尔）。租客、房东、经纪、服务商各自只能读到与自己有关的记录，这是数据库层面的权限，不只是页面上的隐藏；筛查记录房东可随时删除，租赁事务的聊天记录可以导出，带内容指纹。AI 服务商（Claude · GPT · Gemini，可自选）及其所在地在隐私页逐家列明。', en: 'The database is in Canada (AWS Montréal). Tenants, landlords, agents and providers can each read only the records that concern them, enforced at the database rather than hidden in the page. A landlord can delete a screening at any time; a rental matter’s chat history can be exported, fingerprinted. The AI providers (Claude · GPT · Gemini, your choice) and where they run are listed one by one on the privacy page.' },
    href: '/privacy', more: { zh: '隐私页 →', en: 'Privacy page →' },
  },
]

type Stats = { screenings: number | null; ltbOrders: number | null; listings: number | null; trrebQuarters: number | null }

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-CA')
}


// The film (2026-09-28): Mia, Sarah and David — tenant, landlord, agent — each
// with their own assistant, one unit from listing to renewal. Their phones run
// the product's own chat, cards and composer driven by a script — see
// components/home/ThreeRoleFilm.tsx and lib/home/film.ts. It is the "How
// Stayloop works" section (user 2026-09-28), loaded lazily so the hero paints
// first; the placeholder keeps the film's exact size (no layout shift).
// The approval panel's picture is the product's real card; loaded after the hero like the film.
const ApprovalSample = dynamic(() => import('@/components/home/ApprovalSample'), {
  ssr: false,
  loading: () => <div aria-hidden className="h-[440px] rounded-2xl bg-white/60" />,
})

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

  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: pick(f.q, lang).replace(/\u200b/g, ''), acceptedAnswer: { '@type': 'Answer', text: pick(f.a, lang) } })) }

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

      {/* ================= HERO: message + ask box ================= */}
      {/* One centered column (user 2026-09-29: titles centered). 2026-10-01, after measuring muse.ai and
          america.gov: the hero is the whole first screen (minus the 56 / 66px header and, on phones, the
          64px bottom bar) with a big light headline (60px, weight 700) and a 24px muted line; under it
          America.gov's ask box over a photo card (components/home/HeroComposer). */}
      <section className="flex min-h-[calc(100svh-120px)] flex-col md:min-h-[calc(100svh-66px)]" style={{ background: 'linear-gradient(180deg,#E9F5FD 0%,#FFFFFF 100%)' }}>
        <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-center justify-center px-4 pb-12 pt-10 text-center sm:px-7 sm:pb-16 sm:pt-12" data-testid="home-hero">
          <div className="w-full min-w-0">
            <h1 className="sl-type-head mx-auto max-w-[1000px] text-[clamp(22px,8.2vw,34px)] leading-[1.1] sm:text-[48px] lg:text-[60px]">
              {zh
                ? <span className="whitespace-nowrap">租房的事，交给<em className="not-italic" style={{ color: '#00ACE4' }}>AI助理</em></span>
                : <>Leave renting to <em className="not-italic whitespace-nowrap" style={{ color: '#00ACE4' }}>an AI Agent</em></>}
            </h1>
            {/* 2026-10-01 user: one line, simpler — like america.gov ("Whatever you need from government, start here."). */}
            <p className="sl-type-text mx-auto mt-4 text-[clamp(15px,4.6vw,18px)] leading-snug text-body-3 sm:mt-5 sm:text-[22px] lg:text-[24px]">
              {zh
                ? <span className="whitespace-nowrap">找房到续约，它去办，你来批准。</span>
                : 'From search to renewal: it does the work, you approve.'}
            </p>
          </div>
          {/* 2026-10-01: America.gov's ask box over a photo card replaces the sign-in block — ask first,
              no account; sign-in / sign-up are one line under it (and in the header menu). */}
          <HeroComposer zh={zh} className="mt-10 w-full sm:mt-12" />
        </div>
      </section>

      {/* ================= STATEMENT: what Stayloop is, in one sentence ================= */}
      {/* america.gov's second screen: one sentence, big, nothing else (2026-10-01, plan A). */}
      <section data-testid="home-statement">
        <div className="mx-auto max-w-[1000px] px-5 py-16 text-center sm:px-7 sm:py-36 lg:py-44 sm:max-lg:py-24">
          <p className="sl-reveal sl-type-head mx-auto max-w-[920px] text-[26px] font-medium leading-[1.45] text-ink sm:text-[36px] lg:text-[44px] lg:leading-[1.4]">
            {/* 2026-10-03, four rounds with the user: 「把特定的安省去掉」 → 「话语太长了…专业一点的术语」 → keep 「Stayloop 用 AI
                把租房的每一步办完：…」 → 「还要加帮助管理物业，租金催收，法律协助，等等租房方方面面…重新整理一下」. The list now
                runs by stage (before move-in → after move-in → end of term). Kept true: 催租 = rent reminders (no money is
                collected), 按当地法规把关 = rules checked + explained (not a licensed legal service). No province name.
                {ZW} marks the only places a clause may break below md; from md up each <Seg> group is one line. */}
            {zh
              ? <><Seg>Stayloop 用 AI 把租房的{ZW}<em className="not-italic whitespace-nowrap" style={{ color: '#00ACE4' }}>每一步办完</em>：</Seg><Seg>找房、筛查、签约，</Seg><Seg>入住后的{ZW}物业管理、维修、催租，</Seg><Seg>到期续约，全程按当地法规把关。</Seg><Seg>涉及他人的操作{ZW}<em className="not-italic whitespace-nowrap" style={{ color: '#00ACE4' }}>须经你审批</em>，</Seg><Seg>沟通经平台中转，记录不可删改。</Seg></>
              : <>Stayloop uses AI to <em className="not-italic" style={{ color: '#00ACE4' }}>get every step of renting done</em>: search, screening and signing; property management, repairs and rent reminders once you’ve moved in; renewal at the end of the term, all checked against local tenancy rules. Actions that affect others <em className="not-italic" style={{ color: '#00ACE4' }}>require your approval</em>; communication is relayed through the platform, and records can’t be edited or deleted.</>}
          </p>
        </div>
      </section>

      {/* ================= HOW IT WORKS: three people, three assistants, one unit ================= */}
      {/* Muse's "Built around your whole life": a centered heading, a muted lead, then one big media card. */}
      <section id="how-it-works" className="scroll-mt-16" style={{ background: '#F3F8FC' }}>
        <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-7 sm:py-28 sm:max-lg:py-20">
          <div className="sl-reveal mx-auto max-w-[760px] text-center">
            <h2 className={H2}>{zh ? 'Stayloop 是怎么工作的' : 'How Stayloop works'}</h2>
            <p className={`mx-auto mt-3 max-w-[640px] sm:mt-5 ${LEAD}`}>
              {zh
                ? '租客、房东、经纪各有自己的 AI 助理，事情在三个助理之间接力。下面用同一套房，从委托挂牌演到续约。'
                : 'Tenants, landlords and agents each have their own AI Agent, and work passes from one to the next. Below, one unit from listing to renewal.'}
            </p>
            <Link href="/platform" className={`mt-3 inline-block sm:mt-5 ${TEXT_LINK}`}>{zh ? '看完整产品结构 →' : 'See the full product →'}</Link>
          </div>
          <div className="mt-8 rounded-[28px] bg-white p-3 shadow-[0_30px_80px_-40px_rgba(27,27,60,0.35)] sm:mt-16 sm:rounded-[36px] sm:p-8 sm:max-lg:mt-10" data-testid="home-film">
            <ThreeRoleFilm />
          </div>
        </div>
      </section>

      {/* ================= PANELS: one idea per block, picture and words alternating ================= */}
      {/* Muse's six full-height panels + america.gov's picture-and-short-text rows: approval, the four
          roles (they replace the tabs), the Ontario rules. Pictures are the film's 3D scenes or the
          product's own components, never drawings of UI. */}
      <Panel
        tint={false}
        hideLeadOnPhone
        splitFromMd
        media={<div className="rounded-[28px] p-4 sm:rounded-[36px] sm:p-10 sm:max-lg:rounded-[28px] sm:max-lg:p-6" style={{ background: 'linear-gradient(160deg,#E9F5FD 0%,#F3F8FC 100%)' }}><ApprovalSample zh={zh} /></div>}
        eyebrow={zh ? '批准' : 'Approval'}
        title={zh ? '它提议，你决定。' : 'It proposes. You decide.'}
        lead={zh ? '会影响到别人的动作先变成一张卡片：发给谁、分享什么、不分享什么，都写在上面。你批准才执行，批准后 60 秒内可撤销，每一步写进审计记录。' : 'Anything that reaches another person becomes a card first: who it goes to, what is shared and what is not. Nothing runs until you approve; an approval can be undone for 60 seconds, and every step is logged.'}
      >
        <ol className="mt-6 grid gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-5 md:max-lg:grid-cols-1" data-testid="home-flow">
          {FLOW.map((x, i) => (
            <li key={x.h.en} className="min-w-0">
              <div className="font-mono text-[12px] font-bold text-brand max-sm:mr-2 max-sm:inline">0{i + 1}</div>
              <div className="sl-type-head mt-1 text-[17px] text-ink max-sm:inline">{pick(x.h, lang)}</div>
              <p className={`mt-1 ${SMALL}`}>{pick(x.p, lang)}</p>
            </li>
          ))}
        </ol>
      </Panel>
      {/* ================= ROLES: the four roles as four panels (they replace the tabs) ================= */}
      {/* Phones (<640px, 2026-10-01 「手机端的首页确实有点长」): the four panels become one swipe row of cards
          under a heading and four anchor chips (one tap to any card). Tablets (640–1023px, 2026-10-02
          「平板端的首页也一起缩短吧」): the same heading, chips and cards as a 2 × 2 grid of equal-height cards
          (nothing to swipe, so no hint). From 1024px both wrappers carry no styles and the heading block is
          display:none: four full-width panels. The scroll-driven reveal is switched off inside the phone row
          (a horizontal scroller gives it no range). */}
      <div className="max-sm:bg-[#F3F8FC] max-sm:py-12 sm:max-lg:bg-[#F3F8FC] sm:max-lg:py-20" data-testid="home-roles">
        <div className="px-5 text-center lg:hidden">
          <h2 className={H2}>{zh ? '四种身份，各自的入口' : 'Four roles, each with its own entry'}</h2>
          <nav aria-label={zh ? '四种身份' : 'Four roles'} className="mt-4 flex flex-wrap justify-center gap-2">
            {PANEL_ROLES.map((k) => (
              <a key={k} href={`#home-role-${k}`} onClick={() => focusCardSoon(`home-role-${k}`)} className="inline-flex min-h-[44px] items-center rounded-full border border-line-divider bg-white px-4 text-[15px] font-semibold text-ink">{pick(ROLE_ART[k].eyebrow, lang)}</a>
            ))}
          </nav>
          <p aria-hidden className="mt-2 text-[13px] text-body-3 sm:max-lg:hidden">{zh ? '← 左右滑动 →' : '← Swipe →'}</p>
        </div>
        <RoleRow>
          {PANEL_ROLES.map((key, i) => <RolePanel key={key} role={key} lang={lang} tint={i % 2 === 0} flip={i % 2 === 0} />)}
        </RoleRow>
      </div>
      {/* ================= RULES: Ontario law with ids ================= */}
      <Panel
        tint
        flip
        phoneWhite
        media={
          <div className="rounded-[28px] bg-white px-5 py-2 shadow-[0_24px_60px_-36px_rgba(27,27,60,0.35)] sm:rounded-[36px] sm:px-8 sm:py-4">
            {/* an index, not a cloud of chips: the statute sits above its rule, so long ids never wrap mid-chip */}
            <ul className="divide-y divide-line-divider sm:max-lg:grid sm:max-lg:grid-cols-2 sm:max-lg:gap-x-8 sm:max-lg:[&>li:nth-child(2)]:!border-t-0" data-testid="home-rules">
              {RULE_CHIPS.map((r) => (
                <li key={r.id} className={PHONE_HIDDEN_RULES.has(r.id) ? 'max-sm:hidden' : undefined}>
                  <Link href="/rules" className="group block py-3">
                    <span className="block font-mono text-[11px] font-bold tracking-wide text-brand-strong">{statuteShort(r.statute)}</span>
                    <span className="sl-type-text mt-0.5 block text-[15px] leading-[1.55] text-ink group-hover:text-brand">{pick(r.title, lang)}{r.id === 'RTA-120-guideline' ? `（${pick(GUIDELINE_TEXT, lang)}）` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        }
        eyebrow={zh ? '规则' : 'Rules'}
        title={zh ? '安省规则内置，每条有编号。' : 'Ontario rules built in, each with an id.'}
        lead={zh ? '发布房源、保存租约、发出通知之前自动检查；对话里的建议也受同一套规则约束。规则、法条与生效日期公开可查。' : 'Checked before a listing is published, a lease is saved or a notice goes out; the AI Agent’s advice is bound by the same set. Rules, statutes and effective dates are public.'}
      >
        <Link href="/rules" className={`mt-7 inline-block ${TEXT_LINK}`}>{zh ? `全部 ${ONTARIO_RULES.length} 条规则 →` : `All ${ONTARIO_RULES.length} rules →`}</Link>
      </Panel>

      {/* ================= VERIFY: live numbers — a full-width band ================= */}
      <section className="text-white" style={{ background: '#1B1B3C' }}>
        <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-7 sm:py-28 sm:max-lg:py-20">
          <div className="sl-reveal mx-auto max-w-[760px] text-center">
            <h2 className={`${H2} text-white`}>{zh ? '不给形容词，给可以验证的东西' : 'No adjectives — only things you can verify'}</h2>
            <p className={`mx-auto mt-5 max-w-[640px] text-[17px] leading-[1.6] sl-type-text sm:text-[20px]`} style={{ color: '#B7C2D6' }}>{zh ? '下面的每个数字都是此刻从线上数据库读出来的，不是写死的。' : 'Every number below is read from the production database right now, not typed in.'}</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 sm:mt-14 sm:gap-10 lg:grid-cols-4 sm:max-lg:mt-10">
            <Fact n={fmt(stats?.screenings)} s={zh ? <>份筛查报告已生成，<i>每条结论注明所依据的数值</i></> : <>screening reports generated, <i>every conclusion cites its numbers</i></>} />
            <Fact n={fmt(stats?.ltbOrders)} s={zh ? <>份 LTB 判令已入库可查，<i>姓名命中须地址佐证</i></> : <>LTB orders on file and searchable, <i>name hits need address corroboration</i></>} />
            <Fact n={fmt(stats?.trrebQuarters)} s={zh ? <>个季度的 TRREB 官方成交数据，<i>行情有据</i></> : <>quarters of official TRREB data, <i>market answers with sources</i></>} />
            <Fact n={fmt(stats?.listings)} s={zh ? <>套公开房源，<i>平台核验或 Realtor.ca 实时</i></> : <>public listings, <i>platform-verified or live from Realtor.ca</i></>} />
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      {/* Muse's "Learn more": the heading on the left, the answers on the right. */}
      <section id="faq">
        <div className="mx-auto grid max-w-[1180px] gap-6 px-5 py-12 sm:px-7 sm:py-28 sm:gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16 sm:max-lg:py-20 md:max-lg:grid-cols-[5fr_7fr]">
          <div className="sl-reveal min-w-0">
            <h2 className={H2}>{zh ? '你可能想问' : 'You may be wondering'}</h2>
            <p className={`mt-5 max-w-[460px] ${LEAD}`}>{zh ? '答案只写已经上线、能在页面上核对的事；各身份更细的问题在角色页。' : 'Answers name only what is live and checkable; role-specific questions live on the role pages.'}</p>
          </div>
          <div className="min-w-0" data-testid="home-faq">
            {FAQ.map((f, i) => (
              <details key={f.q.en} className="group border-t border-line-divider py-6 last:border-b max-sm:py-0" open={i === 0}>
                <summary className="sl-type-head flex cursor-pointer list-none items-start justify-between gap-4 text-[18px] leading-snug text-ink sm:text-[20px] [&::-webkit-details-marker]:hidden max-sm:py-4">
                  <span>{pick(f.q, lang)}</span>
                  <span className="mt-0.5 flex-none font-mono text-[20px] font-normal leading-none text-body-3 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className={`mt-3 max-w-[640px] max-sm:mt-0 max-sm:pb-4 ${BODY}`}>
                  {pick(f.a, lang)} <Link href={f.href} className="whitespace-nowrap font-semibold text-brand hover:underline">{pick(f.more, lang)}</Link>
                </p>
              </details>
            ))}
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      </section>

      {/* ================= START: one closing band ================= */}
      {/* america.gov's closing band: a big heading, one line, one door — the three steps as a single row. */}
      <section style={{ background: '#F3F8FC' }}>
        <div className="sl-reveal mx-auto max-w-[900px] px-5 py-16 text-center sm:px-7 sm:py-32 sm:max-lg:py-20">
          <h2 className="sl-type-head text-[32px] leading-[1.15] text-ink sm:text-[52px]">{zh ? '从一句话开始' : 'Start with one sentence'}</h2>
          <p className={`mx-auto mt-5 max-w-[620px] ${LEAD}`}>{zh ? '不用登录就能问；登录后它会记住你、替你跟进。租客永远免费。' : 'Ask without an account; sign in and it remembers you and follows up. Free for tenants, always.'}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10">
            <a href="#ask" className="sl-btn-primary !h-[52px] !px-7 !text-[16px]">{zh ? '先问一句试试 ↑' : 'Ask something first ↑'}</a>
            <Link href="/register" className="sl-btn-secondary !h-[52px] !px-7 !text-[16px]">{zh ? '免费注册' : 'Create a free account'}</Link>
          </div>
          <ol className="mx-auto mt-8 grid max-w-[760px] gap-4 text-left sm:mt-12 sm:grid-cols-3" aria-label={zh ? '三步开始' : 'Three steps to start'}>
            {STEPS.map((x, i) => (
              <li key={x.h.en} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[12px] font-bold text-white" style={{ background: '#00ACE4' }}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="sl-type-head block text-[15px] text-ink">{pick(x.h, lang)}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-[1.6] text-body-3">{pick(x.p, lang)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Footer />
    </div>
  )
}

function Fact({ n, s }: { n: string; s: ReactNode }) {
  return (
    <div className="min-w-0 border-t pt-5 text-center sm:pt-6" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
      <div className="sl-type-num text-[clamp(26px,8.5vw,44px)] font-semibold leading-none sm:text-[56px]" style={{ color: '#33BCEA' }}>{n}</div>
      <div className="mt-3 text-[15px] leading-[1.6] sm:mt-4" style={{ color: '#D3E3EF' }}>{s}</div>
    </div>
  )
}

// One block of the panel run: picture on one side, words on the other (stacked on phones, picture
// first), backgrounds alternating white / pale blue (Muse's alternating panels, 2026-10-01).
// The phone swipe row of role cards (<640px). At 640px and up every ROW_CLASS class is inert (tablets get
// ROW_ON_TABLET, a 2 × 2 grid) and the handlers do nothing (the row only scrolls sideways on phones).
// Review 2026-10-01: (1) Tab into a card that
// only peeks in at the right edge scrolls the row so the whole card shows; (2) a swipe made while
// reading the bottom of a tall card lands on the next card, so if that card's top is above the screen
// the page scrolls up to it; the trailing 24px spacer lets the last card snap flush, pb-8 keeps the
// card shadow from being clipped.
const ROW_CLASS = 'max-sm:mt-5 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:items-start max-sm:gap-3 max-sm:overflow-x-auto max-sm:scroll-px-4 max-sm:px-4 max-sm:pb-8 max-sm:after:block max-sm:after:w-6 max-sm:after:flex-none max-sm:[&_.sl-reveal]:[animation:none]'
const ROW_ON_TABLET = 'sm:max-lg:mt-8 sm:max-lg:grid sm:max-lg:grid-cols-2 sm:max-lg:gap-4 sm:max-lg:px-7'
const CARD_SEL = '[data-testid^="home-role-"]'
function RoleRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = ref.current
    if (!row) return
    const swipes = () => row.scrollWidth > row.clientWidth + 1
    const smooth = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
    const cards = () => Array.from(row.querySelectorAll<HTMLElement>(CARD_SEL))
    const current = () => {
      const left = row.getBoundingClientRect().left
      let best = 0, dist = Infinity
      cards().forEach((c, i) => { const d = Math.abs(c.getBoundingClientRect().left - left - 16); if (d < dist) { dist = d; best = i } })
      return best
    }
    let shown = 0, timer = 0
    const onFocus = (e: FocusEvent) => {
      if (!swipes()) return
      const card = (e.target as Element | null)?.closest<HTMLElement>(CARD_SEL)
      if (!card) return
      const r = row.getBoundingClientRect(), c = card.getBoundingClientRect()
      if (c.left < r.left + 1 || c.right > r.right - 1) {
        shown = cards().indexOf(card) // a keyboard move: the page must not jump away from the focused link
        row.scrollTo({ left: row.scrollLeft + c.left - r.left - 16, behavior: smooth() })
      }
    }
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!swipes()) return
        const i = current()
        if (i === shown) return
        shown = i
        const top = cards()[i]?.getBoundingClientRect().top ?? 0
        if (top < 64) window.scrollBy({ top: top - 72, behavior: smooth() })
      }, 140)
    }
    row.addEventListener('focusin', onFocus)
    row.addEventListener('scroll', onScroll, { passive: true })
    return () => { row.removeEventListener('focusin', onFocus); row.removeEventListener('scroll', onScroll); window.clearTimeout(timer) }
  }, [])
  return <div ref={ref} className={`${ROW_CLASS} ${ROW_ON_TABLET}`}>{children}</div>
}
// After a chip's own jump, move focus to the card it points at (screen readers follow focus).
function focusCardSoon(id: string) {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }))
}

// Phones (<640px, 2026-10-01): tighter rhythm (48px band padding), a role panel becomes a card in the
// swipe row (`card`), the rules panel turns white so it doesn't merge with the pale roles band
// (`phoneWhite`), and a lead that only repeats what the panel shows can be skipped (`hideLeadOnPhone`).
// Tablets (640–1023px, 2026-10-02 「平板端的首页也一起缩短吧」): a role panel is the same card in a 2 × 2 grid with
// the phone card's padding and type (26 / 17px); the other panels keep their layout with 80px band padding, the
// rules panel is white here too (it follows the pale roles band), and `splitFromMd` puts the approval card and
// its words side by side from 768px (the real card gets the wider 7fr column, the title 30px, the lead 18px).
const CARD_ON_TABLET = 'sm:max-lg:scroll-mt-20 sm:max-lg:rounded-[24px] sm:max-lg:!bg-white sm:max-lg:shadow-[0_18px_40px_-28px_rgba(27,27,60,0.35)]'
const CARD_ON_PHONE = 'max-sm:w-[calc(100%-36px)] max-sm:flex-none max-sm:snap-start max-sm:scroll-mt-20 max-sm:rounded-[24px] max-sm:!bg-white max-sm:shadow-[0_18px_40px_-28px_rgba(27,27,60,0.35)]'
function Panel({ tint, flip, media, eyebrow, title, lead, children, testId, card, phoneWhite, hideLeadOnPhone, splitFromMd }: { tint: boolean; flip?: boolean; media: ReactNode; eyebrow: string; title: string; lead: string; children?: ReactNode; testId?: string; card?: boolean; phoneWhite?: boolean; hideLeadOnPhone?: boolean; splitFromMd?: boolean }) {
  return (
    <section id={testId} tabIndex={card ? -1 : undefined} style={{ background: tint ? '#F3F8FC' : '#FFFFFF' }} data-testid={testId} className={card ? `${CARD_ON_PHONE} ${CARD_ON_TABLET} focus:outline-none` : phoneWhite ? 'max-sm:!bg-white sm:max-lg:!bg-white' : undefined}>
      <div className={`mx-auto grid max-w-[1180px] items-center gap-7 px-5 py-12 sm:px-7 sm:py-28 sm:gap-10 lg:grid-cols-2 lg:gap-20${card ? ' max-sm:items-start max-sm:gap-5 max-sm:p-3 max-sm:pb-6 sm:max-lg:gap-5 sm:max-lg:p-3 sm:max-lg:pb-6' : ' sm:max-lg:py-20'}${splitFromMd ? ' md:max-lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]' : ''}`}>
        <div className={`sl-reveal min-w-0 ${flip ? 'lg:order-2' : ''}`}>{media}</div>
        <div className="sl-reveal min-w-0">
          <div className="text-[14px] font-semibold text-brand">{eyebrow}</div>
          <h3 className={`sl-type-head mt-2 text-[26px] leading-[1.2] text-ink sm:mt-3 sm:text-[36px]${card ? ' sm:max-lg:text-[26px]' : ''}${splitFromMd ? ' md:max-lg:text-[30px]' : ''}`}>{title}</h3>
          <p className={`mt-3 max-w-[540px] sm:mt-5 ${LEAD}${hideLeadOnPhone ? ' max-sm:hidden' : ''}${card ? ' sm:max-lg:text-[17px]' : ''}${splitFromMd ? ' md:max-lg:text-[18px]' : ''}`}>{lead}</p>
          {children}
        </div>
      </div>
    </section>
  )
}

// The four roles as four panels (they replace the tabs): the role's scene, what it does for you,
// one example that opens the AI Agent preview, and the real pages behind it.
const PANEL_ROLES: HomeRole[] = ['tenant', 'landlord', 'agent', 'provider']
const ROLE_ART: Record<HomeRole, { img: string; alt: Bi; eyebrow: Bi }> = {
  tenant: { img: '/home/film/mia-sofa.webp', alt: { zh: '租客 Mia 在沙发上用电脑找房', en: 'Mia, a tenant, looking for a home on her laptop' }, eyebrow: { zh: '租客', en: 'Tenants' } },
  landlord: { img: '/home/film/sarah-report.webp', alt: { zh: '房东 Sarah 在看筛查报告', en: 'Sarah, a landlord, reading a screening report' }, eyebrow: { zh: '房东', en: 'Landlords' } },
  agent: { img: '/home/film/david-lobby.webp', alt: { zh: '经纪 David 在公寓大堂', en: 'David, an agent, in a condo lobby' }, eyebrow: { zh: '经纪', en: 'Agents' } },
  provider: { img: '/home/film/provider-repair.webp', alt: { zh: '服务商在租客家里修水槽，平板上是工单', en: 'A contractor fixing a sink, the work order on a tablet' }, eyebrow: { zh: '服务商 · 试点', en: 'Providers · pilot' } },
}

function RolePanel({ role, lang, tint, flip }: { role: HomeRole; lang: Lang; tint: boolean; flip: boolean }) {
  const r = ROLES.find((x) => x.key === role)!
  const art = ROLE_ART[role]
  const chatRole: AgentRole | null = role === 'provider' ? null : role
  const zh = lang === 'zh'
  return (
    <Panel
      tint={tint}
      flip={flip}
      card
      testId={`home-role-${role}`}
      media={
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art.img} alt={pick(art.alt, lang)} loading="eager" decoding="async" className="aspect-[3/2] w-full rounded-[16px] object-cover sm:aspect-square sm:rounded-[36px] sm:max-lg:aspect-[3/2] sm:max-lg:rounded-[16px]" />
      }
      eyebrow={pick(art.eyebrow, lang)}
      title={withName(r.h2, lang)}
      lead={withName(r.lead, lang)}
    >
      <ul className="mt-5 space-y-3 sm:mt-7 sm:space-y-4">
        {r.benefits.map((b) => (
          <li key={b.b.en} className="flex gap-3">
            <span className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: b.soon ? '#9FBBD0' : '#00ACE4' }} />
            <div className="min-w-0">
              <div className="sl-type-head text-[16px] text-ink sm:text-[17px]">{withName(b.b, lang)}</div>
              <div className={`mt-0.5 ${SMALL}`}>{pick(b.s, lang)}</div>
            </div>
          </li>
        ))}
      </ul>
      {chatRole && r.chips[0] ? (
        <Link href={assistantPromptHref(chatRole, pick(r.chips[0].prompt, lang))} className="mt-5 flex max-w-[540px] items-center justify-between gap-3 rounded-2xl border border-line-divider bg-white px-4 py-3 transition hover:border-[#00ACE4] sm:mt-7">
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-body-3">{zh ? '问 AI 助理试试 · 不用登录' : 'Ask the AI Agent · no account'}</span>
            <span className="mt-0.5 block truncate text-[15px] text-ink">{pick(r.chips[0].prompt, lang)}</span>
          </span>
          <span className="flex-none text-[15px] font-bold" style={{ color: '#00ACE4' }}>→</span>
        </Link>
      ) : (
        <ul className="mt-5 space-y-2 sm:mt-7" data-testid="provider-facts">
          {(r.facts ?? []).map((f) => (
            <li key={f.en} className={`flex gap-2 ${SMALL}`}><span aria-hidden>·</span><span>{pick(f, lang)}</span></li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 sm:mt-6" data-testid="role-modules">
        {r.modules.map((m) => (
          <Link key={m.href} href={m.href} className={TEXT_LINK} title={pick(m.s, lang)}>{pick(m.h, lang)} →</Link>
        ))}
      </div>
      <Link href={r.href} className="sl-btn-secondary mt-6 inline-flex text-center [text-wrap:balance] sm:mt-8">{withName(r.cta, lang)}</Link>
    </Panel>
  )
}

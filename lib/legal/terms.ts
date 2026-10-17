// Terms of Service version + the listing-data acceptable-use clauses.
// One source for /terms, the sign-up checkbox and the one-time consent gate
// (components/legal/TermsConsentGate). First written 2026-10-10 to the shape
// MLS boards require of a consumer-facing listing site; on 2026-10-13 PropTx
// refused Stayloop's IDX/VOW request and Stayloop stopped reading Realtor.ca
// (lib/listings/externalSources.ts), so there is no MLS feed and no member
// relationship to acknowledge. The clauses stay as general acceptable-use rules
// for the listing data landlords publish here: personal non-commercial use,
// bona fide interest, no copying / redistribution, no AI or automated
// collection, no scraping, ownership stays with the people who publish, the
// site may be audited for compliance, and agreeing creates no fee or representation.
// 2026-10-16 (V1.0 stage 5): API_CLAUSES — the seven API usage rules from
// design/research/v1/open-api-2026-10.md D4-6, rendered on /terms as their own
// section. Tier 1 of the Stayloop API (rules, compliance checks, date
// arithmetic, rent benchmarks, the MCP endpoint) is free and keyless, so the
// rules travel with the Terms rather than with a key.
// Bump TERMS_VERSION whenever the wording changes: every signed-in account is
// asked to accept the new version once (user_metadata.terms_version).
export const TERMS_VERSION = '2026-10-16'

export type ListingDataClause = { zh: string; en: string }

export const LISTING_DATA_CLAUSES: ListingDataClause[] = [
  {
    zh: '房源信息仅供你本人、非商业用途使用，用于考虑是否租赁、购买或出售某一处房产。',
    en: 'Listing information is for your personal, non-commercial use only, in connection with considering the rental, purchase or sale of an individual property.',
  },
  {
    zh: '你确认自己对平台上所展示类型的房产有真实的租赁、购买或出售意向。',
    en: 'You confirm you have a bona fide interest in renting, buying or selling real estate of the type shown on the platform.',
  },
  {
    zh: '你不会复制、转发、转载、出售、转授权或以其他方式向任何个人或机构分发任何房源信息。',
    en: 'You will not copy, redistribute, retransmit, sell, sublicense or otherwise provide any listing information to any other person or entity.',
  },
  {
    zh: '你不会使用任何 AI 系统、自动化工具或其他技术来收集、存储、整理、分析、汇总或处理房源信息及相关数据，也不会把房源信息提供给此类系统。Stayloop 自己的 AI 助理在平台内处理房东发布的房源信息，是我们向你提供的服务，不属于本条所指的用户行为。',
    en: 'You will not use any AI system, automation or other technology to collect, store, reorganize, analyze, summarize or manipulate listing information or related data, nor provide listing information to any such system. Stayloop’s own AI Agent processing landlord-published listings inside the platform is a service we provide and is not covered by this clause.',
  },
  {
    zh: '禁止抓取（包括屏幕抓取与数据库抓取）、数据挖掘，或任何旨在收集、存储、整理、汇总房源信息的活动。',
    en: 'Scraping (including screen scraping and database scraping), data mining and any other activity intended to collect, store, reorganize or summarize listing information is prohibited.',
  },
  {
    zh: '房源信息、照片与相关数据的所有权和版权属于其来源——发布房源的房东与挂牌方，以及 Stayloop 自有的内容。你不对这些信息主张任何权利。',
    en: 'Ownership of and copyright in listing information, photos and related data remain with their sources — the landlords and listing parties who publish them, and Stayloop for its own content. You assert no rights of any kind in that information.',
  },
  {
    zh: '你授权 Stayloop 访问本平台以核查对本条款的遵守情况。',
    en: 'You authorize Stayloop to access the platform to verify compliance with these terms.',
  },
  {
    zh: '同意本条款不产生任何费用，也不构成你与 Stayloop 或任何经纪公司之间的代表协议。任何代表协议或收费安排须另行以书面方式单独建立并明确标注，不能仅凭点击同意成立。',
    en: 'Accepting these terms creates no fee and no representation agreement between you and Stayloop or any brokerage. Any representation agreement or financial obligation must be established separately, in writing, clearly labelled as such, and cannot be formed by a click alone.',
  },
]

// ── API usage rules (D4-6) ───────────────────────────────────────────────────
// Seven plain-language clauses for anyone calling the Stayloop API or the MCP
// endpoint: licence scope, attribution, personal information, prohibited uses,
// screening, availability / versioning, liability. Draft wording; lawyer review
// pending (D4-3). /terms renders them in order.
export type ApiClause = { zh: string; en: string }

export const API_CLAUSES: ApiClause[] = [
  {
    zh: '许可范围：API 与 MCP 端点返回的内容只能用在你自己的产品里、向你自己的用户展示。不得把响应整理成数据集转售或分发，不得用于训练模型。',
    en: 'Licence scope: what the API and the MCP endpoint return may be used only inside your own product, shown to your own users. Responses may not be compiled into a dataset for resale or redistribution, and may not be used to train models.',
  },
  {
    zh: '署名：租金基准必须原样展示响应里的 attribution（来源句：CMHC 租赁市场调查、加拿大统计局）。规则类响应必须保留「非法律意见」的边界声明和 as_of（规则快照日），不得把它们改写成法律结论或成交价。',
    en: 'Attribution: rent benchmarks must display the response’s attribution text as-is (the source line: CMHC Rental Market Survey, Statistics Canada). Rule responses must keep the “not legal advice” boundary statement and the as_of date (the rules snapshot); neither may be rewritten into a legal conclusion or a leased price.',
  },
  {
    zh: '个人信息：需要用户本人授权才返回的数据（第二档）只能在该用户的当前会话里使用，不得持久化，不得与其他来源合并成画像。你对自己所用 AI 服务商的跨境传输自行负责，并要告知用户。',
    en: 'Personal information: data returned only with the user’s own authorisation (tier 2) may be used only within that user’s current session; it may not be persisted or merged with other sources into a profile. You are responsible for any cross-border transfer by your own AI providers, and you must tell the user about it.',
  },
  {
    zh: '禁止：绕过限流、共享密钥、冒充 Stayloop，或把 API 用于住房歧视——包括按《人权法典》受保护特征筛选申请人。',
    en: 'Prohibited: circumventing rate limits, sharing keys, impersonating Stayloop, or using the API for housing discrimination — including screening applicants by a ground protected under the Human Rights Code.',
  },
  {
    zh: '筛查：在 Stayloop 完成《消费者报告法》注册之前，不通过 API 提供筛查。注册之后也只对房东身份的接入方开放，须有申请人的同意记录，录取与否由房东本人作出。',
    en: 'Screening: screening is not offered through the API until Stayloop’s Consumer Reporting Act registration is complete. After registration it is open only to landlord-bound integrations, requires the applicant’s consent record, and the decision is made by the landlord themselves.',
  },
  {
    zh: '可用性：免费期间没有服务水平承诺（SLA）。版本按日期命名（请求头 x-api-version）；弃用某个版本或端点会提前 90 天通知。',
    en: 'Availability: there is no service-level agreement (SLA) during the free period. Versions are named by date (the x-api-version header); deprecating a version or an endpoint is announced at least 90 days in advance.',
  },
  {
    zh: '责任：Stayloop 对 API 的责任以你在过去 12 个月向我们支付的 API 费用为上限（免费期为零）；因你违反这些规则引起的索赔由你负责赔偿。本节适用安省法律。Stayloop 可以随时停用某把密钥或某个端点。',
    en: 'Liability: Stayloop’s liability for the API is capped at the API fees you paid us in the preceding 12 months (zero during the free period); you indemnify Stayloop against claims arising from your breach of these rules. This section is governed by the laws of Ontario. Stayloop may disable a key or an endpoint at any time.',
  },
]

/** Reads the accepted terms version off a Supabase user object (user_metadata), if any. */
export function acceptedTermsVersion(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): string | null {
  const v = user?.user_metadata?.terms_version
  return typeof v === 'string' && v ? v : null
}

export function hasAcceptedCurrentTerms(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return acceptedTermsVersion(user) === TERMS_VERSION
}

/** The metadata written when someone accepts (sign-up form or the consent gate). */
export function termsAcceptanceMetadata(now = new Date()): { terms_version: string; terms_accepted_at: string } {
  return { terms_version: TERMS_VERSION, terms_accepted_at: now.toISOString() }
}

// ── PropTx 8.05 / 8.06 account rules ────────────────────────────────────────────
// 8.05(b): the member must hold each consumer's NAME and a valid email; 8.06: a password is valid
// for at most 90 days (renewable). Name lives in user_metadata.full_name; the password's age in
// user_metadata.password_changed_at (set at sign-up, reset and every change).
export const PASSWORD_MAX_AGE_DAYS = 90

type MetaUser = { user_metadata?: Record<string, unknown> | null; identities?: { provider?: string }[] | null } | null | undefined

export function accountName(user: MetaUser): string | null {
  const m = user?.user_metadata || {}
  for (const k of ['full_name', 'name', 'display_name']) {
    const v = m[k]
    if (typeof v === 'string' && v.trim().length >= 2) return v.trim()
  }
  return null
}

export function passwordStampMetadata(now = new Date()): { password_changed_at: string } {
  return { password_changed_at: now.toISOString() }
}

/** Only accounts that actually sign in with a password are subject to the 90-day rule. */
export function usesPassword(user: MetaUser): boolean {
  return !!user?.identities?.some((i) => i.provider === 'email')
}

/** null = no stamp on record (set one, don't prompt); number = days since the last change. */
export function passwordAgeDays(user: MetaUser, now = new Date()): number | null {
  const v = user?.user_metadata?.password_changed_at
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / 86_400_000)
}

export function passwordExpired(user: MetaUser, now = new Date()): boolean {
  if (!usesPassword(user)) return false
  const age = passwordAgeDays(user, now)
  return age != null && age >= PASSWORD_MAX_AGE_DAYS
}

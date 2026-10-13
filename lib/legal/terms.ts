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
// Bump TERMS_VERSION whenever the wording changes: every signed-in account is
// asked to accept the new version once (user_metadata.terms_version).
export const TERMS_VERSION = '2026-10-13'

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

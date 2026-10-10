// Terms of Service version + the listing-data acceptable-use clauses (2026-10-10).
// One source for /terms, the sign-up checkbox and the one-time consent gate
// (components/legal/TermsConsentGate). Written to the shape MLS boards require
// of a consumer-facing listing site (PropTx MLS Rules Art. 8.09–8.11): personal
// non-commercial use, bona fide interest, no copying / redistribution, no AI or
// automated collection, no scraping, ownership stays with the data sources, the
// site may be audited for compliance, and agreeing creates no fee or representation.
// Bump TERMS_VERSION whenever the wording changes: every signed-in account is
// asked to accept the new version once (user_metadata.terms_version).
export const TERMS_VERSION = '2026-10-10'

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
    zh: '你不会使用任何 AI 系统、自动化工具或其他技术来收集、存储、整理、分析、汇总或处理房源信息及相关数据，也不会把房源信息提供给此类系统。Stayloop 自己的 AI 助理在平台内处理房源信息，是我们在数据许可范围内向你提供的服务，不属于本条所指的用户行为。',
    en: 'You will not use any AI system, automation or other technology to collect, store, reorganize, analyze, summarize or manipulate listing information or related data, nor provide listing information to any such system. Stayloop’s own AI Agent processing listings inside the platform is a service we provide under our data licences and is not covered by this clause.',
  },
  {
    zh: '禁止抓取（包括屏幕抓取与数据库抓取）、数据挖掘，或任何旨在收集、存储、整理、汇总房源信息的活动。',
    en: 'Scraping (including screen scraping and database scraping), data mining and any other activity intended to collect, store, reorganize or summarize listing information is prohibited.',
  },
  {
    zh: '房源信息、照片与相关数据的所有权和版权属于其来源——挂牌经纪公司、提供数据的房地产协会与 MLS® 系统，以及 Stayloop 自有的内容。你不对这些信息主张任何权利。',
    en: 'Ownership of and copyright in listing information, photos and related data remain with their sources — the listing brokerages, the real estate associations and MLS® systems that supply the data, and Stayloop for its own content. You assert no rights of any kind in that information.',
  },
  {
    zh: '你授权 Stayloop 以及向我们提供房源数据的房地产协会、MLS® 系统及其会员访问本平台，以核查对本条款与其数据规则的遵守情况。',
    en: 'You authorize Stayloop, and the real estate associations, MLS® systems and their members that supply listing data to us, to access the platform to verify compliance with these terms and their data rules.',
  },
  {
    zh: '同意本条款不产生任何费用，也不在你与 Stayloop 或任何经纪公司之间建立代理或代表关系。任何代理关系须另行以书面协议建立，不能仅凭点击同意成立。',
    en: 'Accepting these terms creates no fee and no agency or representation relationship between you and Stayloop or any brokerage. Any representation agreement must be made separately in writing and cannot be formed by a click alone.',
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

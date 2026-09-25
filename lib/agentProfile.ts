// Agent (RECO registrant) profile — shared shapes and display rules.
// design/roles-and-agent-verification-2026-09.md.
//
// Display rules come from O. Reg. 567/05 s.12.1: the registrant's REGISTERED
// name, one permitted descriptor, and the employing brokerage's registered
// name, clearly and prominently, wherever the agent appears. "REALTOR®" is a
// CREA trademark and may only be shown for members.

export type AgentCategory = 'salesperson' | 'broker' | 'broker_of_record'
export type AgentStatus = 'pending' | 'verified' | 'rejected' | 'renewal_due' | 'expired'

export type AgentProfile = {
  auth_id: string
  legal_name: string
  trade_name: string | null
  reco_number: string
  category: AgentCategory
  brokerage_name: string
  business_email: string | null
  business_phone: string | null
  crea_member: boolean
  expires_at: string | null
  status: AgentStatus
  verified_at: string | null
  review_note: string | null
  attested_at: string | null
  created_at: string
  updated_at: string
}

export const RECO_REGISTER_URL = 'https://registrantsearch.reco.on.ca/'
export const RECO_COMPLAINTS_URL = 'https://complaints.reco.on.ca/'

/** Permitted descriptor for the category (O. Reg. 567/05 s.12.1(4)). */
export function categoryLabel(c: AgentCategory, lang: 'zh' | 'en'): string {
  if (c === 'broker_of_record') return lang === 'zh' ? '主管经纪 (Broker of Record)' : 'Broker of Record'
  if (c === 'broker') return lang === 'zh' ? '经纪 (Broker)' : 'Broker'
  return lang === 'zh' ? '地产销售代表 (Salesperson)' : 'Salesperson'
}

export function statusLabel(s: AgentStatus, lang: 'zh' | 'en'): string {
  const zh = lang === 'zh'
  switch (s) {
    case 'verified': return zh ? 'RECO 注册已核' : 'RECO registration verified'
    case 'pending': return zh ? '待人工核验' : 'Pending verification'
    case 'rejected': return zh ? '未通过核验' : 'Not verified'
    case 'renewal_due': return zh ? '注册即将到期 · 待复核' : 'Registration expiring · re-check due'
    case 'expired': return zh ? '注册已过期' : 'Registration expired'
  }
}

/** Registration still valid on RECO's register as last checked: verified, or
 *  verified-but-expiring (renewal_due, set by the daily sweep 30 days out). */
export function isRegistrationLive(s: AgentStatus | string | null | undefined): boolean {
  return s === 'verified' || s === 'renewal_due'
}

export function isRecoNumber(s: string): boolean {
  return /^[0-9]{7}$/.test(s.trim())
}

/** Days until the RECO registration expiry; null when unknown. */
export function daysToExpiry(expires_at: string | null, now = new Date()): number | null {
  if (!expires_at) return null
  const t = Date.parse(expires_at)
  if (!Number.isFinite(t)) return null
  return Math.round((t - now.getTime()) / 86_400_000)
}

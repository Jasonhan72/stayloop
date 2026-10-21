// Public agent profiles (/agents, /agents/<slug>) — shared, pure (2026-10-21).
//
// Modelled on HouseSigma's agent pages, but built only from Stayloop's own data: no MLS
// sales history (that needs a VOW). Opt-in by the agent; only verified, live registrations.
// Display rules (O. Reg. 567/05 s.12.1): registered name, one permitted descriptor and the
// employing brokerage's registered name, clearly and prominently — see lib/agentProfile.ts.
import { isRegistrationLive, type AgentCategory, type AgentStatus } from './agentProfile'

export const AGENT_LANGUAGES: { code: string; zh: string; en: string }[] = [
  { code: 'zh', zh: '普通话', en: 'Mandarin' },
  { code: 'yue', zh: '粤语', en: 'Cantonese' },
  { code: 'en', zh: '英语', en: 'English' },
  { code: 'fr', zh: '法语', en: 'French' },
  { code: 'ko', zh: '韩语', en: 'Korean' },
  { code: 'fa', zh: '波斯语', en: 'Farsi' },
  { code: 'hi', zh: '印地语', en: 'Hindi' },
  { code: 'pa', zh: '旁遮普语', en: 'Punjabi' },
  { code: 'ur', zh: '乌尔都语', en: 'Urdu' },
  { code: 'ta', zh: '泰米尔语', en: 'Tamil' },
  { code: 'tl', zh: '他加禄语', en: 'Tagalog' },
  { code: 'vi', zh: '越南语', en: 'Vietnamese' },
  { code: 'es', zh: '西班牙语', en: 'Spanish' },
  { code: 'pt', zh: '葡萄牙语', en: 'Portuguese' },
  { code: 'ru', zh: '俄语', en: 'Russian' },
  { code: 'uk', zh: '乌克兰语', en: 'Ukrainian' },
  { code: 'ar', zh: '阿拉伯语', en: 'Arabic' },
  { code: 'it', zh: '意大利语', en: 'Italian' },
]

export const AGENT_FOCUS: { code: string; zh: string; en: string }[] = [
  { code: 'tenant_rep', zh: '帮租客找房', en: 'Helping tenants find a place' },
  { code: 'landlord_rep', zh: '帮房东出租', en: 'Leasing for landlords' },
  { code: 'condo', zh: '公寓', en: 'Condos' },
  { code: 'house', zh: '独立屋 · 镇屋', en: 'Houses & townhouses' },
  { code: 'students', zh: '学生租房', en: 'Students' },
  { code: 'newcomers', zh: '新移民', en: 'Newcomers to Canada' },
]

export const BIO_MAX = 800
export const AREA_MAX = 12
export const AREA_LEN = 40
export const LANG_MAX = 8
export const FOCUS_MAX = 6

const LANG_CODES = new Set(AGENT_LANGUAGES.map((l) => l.code))
const FOCUS_CODES = new Set(AGENT_FOCUS.map((f) => f.code))

export function languageLabel(code: string, lang: 'zh' | 'en'): string {
  const l = AGENT_LANGUAGES.find((x) => x.code === code)
  return l ? l[lang] : code
}
export function focusLabel(code: string, lang: 'zh' | 'en'): string {
  const f = AGENT_FOCUS.find((x) => x.code === code)
  return f ? f[lang] : code
}

/** Same rule as the DB check agent_profiles_slug_format. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/
export function isValidSlug(s: unknown): s is string {
  return typeof s === 'string' && SLUG_RE.test(s) && !s.includes('--')
}

/** A first suggestion from the registered name; Chinese-only names get "agent-xxxx". */
export function suggestSlug(legalName: string, authId: string): string {
  const ascii = legalName.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const words = ascii.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  const tail = authId.replace(/[^0-9a-f]/gi, '').slice(0, 4).toLowerCase() || '0000'
  const base = words.join('-').slice(0, 40).replace(/-+$/, '')
  return base.length >= 2 ? `${base}-${tail}` : `agent-${tail}`
}

/** Normalise what the agent typed into a candidate slug (still to be checked with isValidSlug). */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export type BioProblem = 'too_long' | 'contact_details'

/**
 * Contact goes through Stayloop's message relay, so the bio carries no links, email
 * addresses or phone numbers (they would also bypass the relay's spam limits).
 */
export function bioProblem(bio: string): BioProblem | null {
  if (bio.length > BIO_MAX) return 'too_long'
  if (/https?:\/\/|www\.|\b[\w.-]+\.(com|ca|net|org|io|ai|cn)\b/i.test(bio)) return 'contact_details'
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(bio)) return 'contact_details'
  if ((bio.match(/\d/g) || []).length >= 9 && /\d[\d\s().-]{8,}\d/.test(bio)) return 'contact_details'
  return null
}

export function cleanLanguages(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return Array.from(new Set(list.filter((x): x is string => typeof x === 'string' && LANG_CODES.has(x)))).slice(0, LANG_MAX)
}
export function cleanFocus(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return Array.from(new Set(list.filter((x): x is string => typeof x === 'string' && FOCUS_CODES.has(x)))).slice(0, FOCUS_MAX)
}
export function cleanAreas(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const a = raw.replace(/\s+/g, ' ').trim().slice(0, AREA_LEN)
    if (a.length < 2 || seen.has(a.toLowerCase())) continue
    seen.add(a.toLowerCase())
    out.push(a)
    if (out.length >= AREA_MAX) break
  }
  return out
}

/** The stored row as the server reads it (service role). */
export type AgentProfileRow = {
  auth_id: string
  legal_name: string
  reco_number: string
  category: AgentCategory
  brokerage_name: string
  crea_member: boolean
  status: AgentStatus
  verified_at: string | null
  expires_at: string | null
  created_at: string
  public_profile: boolean
  profile_slug: string | null
  bio: string | null
  languages: string[] | null
  service_areas: string[] | null
  focus: string[] | null
  show_activity: boolean
}

/** Columns the public routes read — never business email / phone, review notes or attestation. */
export const PUBLIC_AGENT_COLUMNS = 'auth_id, legal_name, reco_number, category, brokerage_name, crea_member, status, verified_at, expires_at, created_at, public_profile, profile_slug, bio, languages, service_areas, focus, show_activity'

export function isPublishable(row: Pick<AgentProfileRow, 'status' | 'expires_at' | 'public_profile' | 'profile_slug'>, now: Date = new Date()): boolean {
  if (!row.public_profile || !row.profile_slug) return false
  if (!isRegistrationLive(row.status)) return false
  if (row.expires_at && Date.parse(row.expires_at) < Date.parse(now.toISOString().slice(0, 10))) return false
  return true
}

export type PublicAgent = {
  slug: string
  name: string
  category: AgentCategory
  brokerage_name: string
  reco_number: string
  crea_member: boolean
  status: AgentStatus
  verified_at: string | null
  joined: string
  languages: string[]
  service_areas: string[]
  focus: string[]
  bio: string | null
}

export type AgentActivity = { clients: number; confirmed_delegations: number; listings: number }

/** The only fields that leave the server. No auth id, no contact details. */
export function toPublicAgent(row: AgentProfileRow): PublicAgent {
  return {
    slug: row.profile_slug as string,
    name: row.legal_name,
    category: row.category,
    brokerage_name: row.brokerage_name,
    reco_number: row.reco_number,
    crea_member: !!row.crea_member,
    status: row.status,
    verified_at: row.verified_at,
    joined: (row.created_at || '').slice(0, 7),
    languages: cleanLanguages(row.languages ?? []),
    service_areas: cleanAreas(row.service_areas ?? []),
    focus: cleanFocus(row.focus ?? []),
    bio: row.bio ? row.bio.slice(0, BIO_MAX) : null,
  }
}

/** Directory filters, applied server-side on the published rows. */
export function matchesDirectoryFilter(a: PublicAgent, f: { language?: string | null; focus?: string | null; area?: string | null }): boolean {
  if (f.language && !a.languages.includes(f.language)) return false
  if (f.focus && !a.focus.includes(f.focus)) return false
  if (f.area) {
    const q = f.area.trim().toLowerCase()
    if (q && !a.service_areas.some((s) => s.toLowerCase().includes(q))) return false
  }
  return true
}

export const CONTACT_MIN = 10
export const CONTACT_MAX = 1500

export function initials(name: string): string {
  // Letters only: "[TEST] Agent Person" → "AP", not "[P".
  const parts = name.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
  if (!parts.length) return '?'
  if (/[一-鿿]/.test(parts[0])) return parts[0].slice(0, 1)
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

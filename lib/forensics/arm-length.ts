// -----------------------------------------------------------------------------
// P4 — Arm's-Length Employment Verification
//
// Checks whether the employer on the employment letter / pay stub is truly
// independent of the applicant. Non-arm's-length employment (own company,
// family business, shell corp) undermines all income verification.
//
// Data sources:
//   1. OpenCorporates API — PAID ONLY. Verified 2026-07-26: there is no free
//      API tier; the cheapest self-serve plan is GBP 2,250/yr for 500 calls/mo
//      (the "free" tier on their site is website search, not API). Runs only
//      when OPENCORPORATES_API_TOKEN is set, which today it is NOT.
//      — company name, incorporation date, status, jurisdiction, officers
//   2. Cross-doc entity matching (applicant name vs signatory/director)
//   3. Heuristics (numbered company, recent incorporation, etc.)
//
// Returns ArmLengthResult with risk signals + flags.
// -----------------------------------------------------------------------------

import type { ForensicFlag } from './types'

export interface CompanyRegistryInfo {
  name: string
  company_number: string | null
  jurisdiction: string | null
  incorporation_date: string | null  // ISO date
  status: string | null              // e.g. "Active", "Dissolved"
  registered_address: string | null
  company_type: string | null        // e.g. "Corporation", "Sole Proprietorship"
  officers: Array<{ name: string; position: string }> // directors, officers
  registry_url: string | null
  source: string                     // "opencorporates" | "not_found"
}

export interface ArmLengthResult {
  employer_name: string
  company_info: CompanyRegistryInfo | null
  is_numbered_company: boolean
  is_recently_incorporated: boolean      // < 2 years old
  applicant_is_officer: boolean          // applicant name matches a director/officer
  applicant_lastname_match: boolean      // last name matches a director/officer
  company_address_matches_applicant: boolean
  arm_length_risk: 'high' | 'medium' | 'low' | 'clean'
  flags: ForensicFlag[]
}

// Numbered Ontario company pattern: "1234567 Ontario Inc" or "12345678 Canada Inc"
const NUMBERED_COMPANY_RE = /^\d{5,10}\s+(ontario|canada|québec|quebec|alberta|bc|british columbia)\s*(inc\.?|ltd\.?|corp\.?|limited|incorporated)?$/i

// Check if a company name looks like a numbered/shell company
function isNumberedCompany(name: string): boolean {
  return NUMBERED_COMPANY_RE.test(name.trim())
}

// Common surnames — if the ONLY signal of a non-arm's-length relationship is a
// last-name collision with a company officer, and the surname is common, we
// downgrade to "low" or drop the flag entirely. Without this, every applicant
// named "Chen / Li / Zhang / Wang / Smith / Lee" would be marked as
// "family business" whenever the company had an officer with the same surname.
const COMMON_SURNAMES = new Set<string>([
  // Top Chinese surnames (covers >40% of Chinese population)
  'wang', 'li', 'zhang', 'liu', 'chen', 'yang', 'huang', 'zhao', 'wu', 'zhou',
  'xu', 'sun', 'ma', 'zhu', 'hu', 'guo', 'he', 'gao', 'lin', 'luo',
  'zheng', 'liang', 'xie', 'song', 'tang', 'han', 'feng', 'deng', 'cao', 'peng',
  'xiao', 'pan', 'dong', 'yuan', 'jiang', 'cai', 'yu', 'du', 'ye', 'cheng',
  'wei', 'su', 'lu', 'ding', 'ren', 'shen', 'yao', 'lu', 'zhong', 'jiang',
  // Cantonese/Taiwanese romanizations
  'wong', 'chan', 'cheung', 'ng', 'ho', 'lau', 'chow', 'leung', 'tsang', 'yip',
  'chiu', 'cheng', 'hung', 'fung', 'mok', 'tse', 'tam', 'poon', 'kwok', 'tang',
  'hsu', 'hsieh', 'kuo', 'chao', 'chou', 'tsai',
  // Korean
  'kim', 'lee', 'park', 'choi', 'jung', 'jeong', 'kang', 'cho', 'yoon', 'jang',
  'lim', 'shin', 'han', 'oh', 'seo', 'moon', 'nam', 'baek',
  // Vietnamese
  'nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'vo', 'vu', 'dang', 'bui',
  // Common English / European
  'smith', 'jones', 'williams', 'brown', 'davis', 'miller', 'wilson', 'taylor',
  'anderson', 'thomas', 'jackson', 'white', 'harris', 'martin', 'thompson',
  'garcia', 'martinez', 'robinson', 'clark', 'rodriguez', 'lewis', 'walker',
  'hall', 'allen', 'young', 'king', 'wright', 'scott', 'green', 'baker',
  'adams', 'nelson', 'carter', 'mitchell', 'roberts', 'turner', 'phillips',
  'campbell', 'parker', 'evans', 'edwards', 'collins', 'morris', 'murphy',
  'cook', 'morgan', 'bell', 'cooper', 'ward', 'rivera', 'lopez', 'gonzales',
  // South Asian
  'singh', 'kumar', 'sharma', 'patel', 'shah', 'gupta', 'khan', 'ahmed',
  // Middle Eastern
  'hassan', 'ali', 'ahmad', 'mohamed', 'mohammed', 'hussain', 'ibrahim',
])

function isCommonSurname(name: string): boolean {
  const parts = name.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/)
  if (parts.length === 0) return false
  const last = parts[parts.length - 1]
  if (last.length < 2) return false
  return COMMON_SURNAMES.has(last)
}

/**
 * Canonicalize an employer name: strip legal suffixes (Inc/Ltd/Corp/…),
 * normalize whitespace + punctuation. Used for deduplication so that
 * "ABC Consulting", "ABC Consulting Inc.", "ABC CONSULTING LIMITED"
 * collapse to one canonical lookup. The original user-facing display
 * string is preserved separately.
 */
export function canonicalizeEmployerName(name: string): string {
  let s = name.toLowerCase().trim()
  // Strip trailing legal suffixes, possibly repeated
  // The separator prefix is REQUIRED: without it the alternation matches inside
  // a word ("Costco" -> "cost", "Visa Inc" -> "vi"), which produced confident
  // matches against unrelated companies.
  const suffixRe = /(?:^|[\s,.])(incorporated|incorporée|corporation|corp|company|co|limited|limitée|ltée|ltd|inc|llc|llp|lp|pc|plc|gmbh|ag|sa)[\s.,]*$/i
  for (let i = 0; i < 3; i++) {
    const prev = s
    s = s.replace(suffixRe, '').trim()
    if (prev === s) break
  }
  return s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Check if two names likely refer to the same person (fuzzy last-name match)
function lastNameMatch(name1: string, name2: string): boolean {
  // Family-relatedness, not same-person identity — deliberately broader than
  // the LTB module's matching, because the question here is "could these two
  // people be relatives", and the cost of a hit is a review flag, not a score.
  //
  // The case that forced this shape: employment letter signed "Sia Allas
  // (Director/Owner)" for applicant "Alaleh Allasvandi Toghian". Last-token
  // equality failed three ways at once — the applicant's surname is compound
  // (last token: TOGHIAN), the family surname is not the last token
  // (ALLASVANDI), and the signatory used the truncated variant (ALLAS). So:
  // compare EVERY token of one name against every token of the other, and
  // accept equality or a >=5-char prefix relation (5, not 4, so Park/Parker —
  // a genuinely different surname pair the LTB work documented — stays apart).
  // Given names colliding this way (e.g. two Mohammads) is possible; the
  // common-surname downgrade in the caller absorbs that class.
  const normalize = (n: string) => n.toLowerCase().replace(/[^a-z\s]/g, '').trim()
  const parts1 = normalize(name1).split(/\s+/).filter((p) => p.length >= 3)
  const parts2 = normalize(name2).split(/\s+/).filter((p) => p.length >= 3)
  if (parts1.length === 0 || parts2.length === 0) return false
  for (const a of parts1) {
    for (const b of parts2) {
      if (a === b) return true
      const [short, long] = a.length <= b.length ? [a, b] : [b, a]
      if (short.length >= 5 && long.startsWith(short)) return true
    }
  }
  return false
}

// Check if name1 is a fuzzy match of name2 (same person)
function fullNameMatch(name1: string, name2: string): boolean {
  const normalize = (n: string) => n.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).sort().join(' ')
  const n1 = normalize(name1)
  const n2 = normalize(name2)
  if (n1 === n2) return true
  // Check if all parts of the shorter name appear in the longer name
  const parts1 = n1.split(' ')
  const parts2 = n2.split(' ')
  const shorter = parts1.length <= parts2.length ? parts1 : parts2
  const longer = parts1.length <= parts2.length ? parts2 : parts1
  return shorter.length >= 2 && shorter.every(p => longer.includes(p))
}

// Simple address similarity (city/province overlap)
function addressOverlap(addr1: string, addr2: string): boolean {
  if (!addr1 || !addr2) return false
  const normalize = (a: string) => a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const a1 = normalize(addr1)
  const a2 = normalize(addr2)
  // Check if they share a city name (word of 4+ chars)
  // City/province tokens are shared by nearly every address in a Toronto-only
  // product; matching on them alone flagged unrelated parties as co-located.
  const GENERIC_LOCATION = new Set([
    'toronto', 'ontario', 'canada', 'north', 'south', 'east', 'west', 'unit', 'suite',
    'street', 'avenue', 'road', 'drive', 'boulevard', 'court', 'lane', 'york', 'scarborough',
    'etobicoke', 'mississauga', 'markham', 'vaughan', 'brampton',
  ])
  const distinctive = (a: string) =>
    a.split(/\s+/).filter(w => w.length >= 4 && !GENERIC_LOCATION.has(w))
  const words2 = new Set(distinctive(a2))
  const commonWords = distinctive(a1).filter(w => words2.has(w))
  // A shared street NUMBER plus a distinctive word is the real signal.
  const num1 = a1.match(/\b\d{1,6}\b/)?.[0]
  const num2 = a2.match(/\b\d{1,6}\b/)?.[0]
  const sameNumber = !!num1 && num1 === num2
  return commonWords.length >= 2 || (sameNumber && commonWords.length >= 1)
}

/**
 * Search OpenCorporates for a company name in Canadian jurisdictions.
 * Requires a PAID plan token (no free API tier — see the note at the top of
 * this file). Returns null without any network call when unset.
 * Officers may or may not be available depending on the jurisdiction.
 *
 * Phase 3 change: jurisdictions are queried in PARALLEL (was serial, 9×8s worst
 * case = 72s, which exceeds the edge-runtime budget). We race all 9 Canadian
 * jurisdictions + the "ca" federal bucket with a 6s overall budget, then pick
 * the best scoring match across all responses. Officer lookup remains a single
 * follow-up call for the winner.
 */
/**
 * Sentinel thrown when the OpenCorporates API rejects the request with an
 * auth error (401/403) or fails in a way that suggests misconfiguration.
 * This is different from "searched successfully, found nothing" — we must
 * NOT cache this or claim the company doesn't exist.
 */
export class RegistryAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryAuthError'
  }
}

/**
 * True when OpenCorporates is configured (token present). The caller uses
 * this to distinguish "queried registry, found nothing" from "registry
 * lookup disabled" — they produce different flags.
 */
export function isRegistryConfigured(): boolean {
  return !!process.env.OPENCORPORATES_API_TOKEN
}

/**
 * Pick the best registry candidate for a target company name.
 *
 * Both sides are canonicalized (legal suffixes stripped) BEFORE comparison,
 * so "Inc"/"Ltd" can't inflate a match — the previous scoring counted them
 * as ordinary words, which let "ABC Auto Inc" match an unrelated "XYZ Auto
 * Inc" at 2/3. Matching the WRONG company is worse than no match here: this
 * feeds an arm's-length fraud check, and a wrong hit would show someone
 * else's officers and address as if verified.
 *
 * Acceptance is deliberately strict and two-sided:
 *   • containment — EVERY word of the target must appear in the candidate
 *   • precision   — at least half the candidate's words are explained by
 *                   the target (blocks "Northline" → "Northline Pacific
 *                   Shipping Holdings International")
 * Ranked by precision, so the tightest name wins.
 *
 * Pure — unit-tested directly.
 */
export function pickBestCompanyMatch<T extends { name?: string }>(
  targetName: string,
  candidates: T[],
): T | null {
  const targetWords = canonicalizeEmployerName(targetName || '').split(/\s+/).filter(Boolean)
  if (targetWords.length === 0) return null
  let best: T | null = null
  let bestPrecision = 0
  for (const c of candidates || []) {
    const candWords = canonicalizeEmployerName(c?.name || '').split(/\s+/).filter(Boolean)
    if (candWords.length === 0) continue
    const candSet = new Set(candWords)
    const hits = targetWords.filter((w) => candSet.has(w)).length
    if (hits !== targetWords.length) continue          // containment must be total
    const precision = hits / candWords.length
    if (precision < 0.5) continue
    if (precision > bestPrecision) {
      bestPrecision = precision
      best = c
    }
  }
  return best
}

export async function searchOpenCorporates(companyName: string): Promise<CompanyRegistryInfo | null> {
  if (!companyName || companyName.trim().length < 3) return null

  // As of late 2025, OpenCorporates closed their unauthenticated free tier —
  // every unauthenticated search returns 401 "Invalid Api Token". If no
  // token is configured we return null *without* making any network calls,
  // and the caller treats this as "registry lookup disabled" (different
  // from "searched and found nothing"). If a token IS set but the server
  // rejects it, we throw RegistryAuthError so the operator knows their
  // config is broken.
  const apiToken = process.env.OPENCORPORATES_API_TOKEN
  if (!apiToken) return null
  const tokenParam = `&api_token=${encodeURIComponent(apiToken)}`

  // ONE call for all Canadian jurisdictions (country_code=ca), not one call
  // per province. The old 9-way fan-out burned 9 requests per employer
  // against a quota that starts at 200/month — ~20 lookups. At 1 search + 1
  // officer detail it's ~100. country_code also covers the provinces the
  // hardcoded list missed entirely (PE, NL, and the territories).
  const query = encodeURIComponent(companyName.trim())
  const url =
    `https://api.opencorporates.com/v0.4/companies/search?q=${query}` +
    `&country_code=ca&normalise_company_name=true&per_page=30${tokenParam}`

  let companies: Array<{ company?: Record<string, any> }> = []
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 401 || res.status === 403) {
      throw new RegistryAuthError(
        'OpenCorporates rejected the API token — check OPENCORPORATES_API_TOKEN in Cloudflare env',
      )
    }
    if (!res.ok) return null
    const data = (await res.json()) as any
    // Defensive: the API sometimes returns 200 with an error body shape.
    if (data?.error?.message) {
      if (/token|auth/i.test(String(data.error.message))) {
        throw new RegistryAuthError(
          'OpenCorporates rejected the API token — check OPENCORPORATES_API_TOKEN in Cloudflare env',
        )
      }
      return null
    }
    companies = data?.results?.companies || []
  } catch (e) {
    if (e instanceof RegistryAuthError) throw e
    return null   // network/timeout — caller renders "not found in registry"
  }

  const bestMatch = pickBestCompanyMatch(
    companyName,
    companies.map((c) => c.company || {}).filter((co) => !!co.name),
  ) as Record<string, any> | null
  if (!bestMatch) return null

  // Officer lookup for the winner
  let officers: Array<{ name: string; position: string }> = []
  try {
    const detailUrl = `https://api.opencorporates.com/v0.4/companies/${bestMatch.jurisdiction_code}/${bestMatch.company_number}${apiToken ? `?api_token=${encodeURIComponent(apiToken)}` : ''}`
    const detailRes = await fetch(detailUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (detailRes.ok) {
      const detailData = await detailRes.json() as any
      const officerList = detailData?.results?.company?.officers || []
      officers = officerList.map((o: any) => ({
        name: o.officer?.name || '',
        position: o.officer?.position || '',
      })).filter((o: { name: string }) => o.name.length > 0)
    }
  } catch {
    // Officer lookup failed — not critical
  }

  return {
    name: bestMatch.name,
    company_number: bestMatch.company_number || null,
    jurisdiction: bestMatch.jurisdiction_code || null,
    incorporation_date: bestMatch.incorporation_date || null,
    status: bestMatch.current_status || null,
    registered_address: bestMatch.registered_address_in_full || null,
    company_type: bestMatch.company_type || null,
    officers,
    registry_url: bestMatch.opencorporates_url || null,
    source: 'opencorporates',
  }
}

/**
 * Run arm's-length checks for the given employer.
 *
 * @param employerName - extracted from employment letter or pay stub
 * @param applicantName - tenant's full name
 * @param applicantAddress - tenant's address (if known)
 * @param signatory - name of the person who signed the employment letter (if extractable)
 */
export interface CheckArmLengthOptions {
  /** signatory's printed title on the letter, e.g. "Director/Owner" */
  signatory_title?: string
  /** phone extracted from ID or lease application (applicant's phone) */
  applicant_phone?: string
  /** email extracted from ID or lease application */
  applicant_email?: string
  /** true if cross_doc.hr_phone_collision fired — applicant phone appears in employer letter HR contact */
  hr_phone_collision?: boolean
  /**
   * Dependency injection for the company registry lookup. Defaults to direct
   * OpenCorporates fetch. The route layer can inject a caching wrapper so
   * repeat lookups within 7 days don't hit the 500/month free quota.
   */
  companyLookup?: (name: string) => Promise<CompanyRegistryInfo | null>
}

export async function checkArmLength(
  employerName: string,
  applicantName: string,
  applicantAddress?: string,
  signatory?: string,
  options: CheckArmLengthOptions = {},
): Promise<ArmLengthResult> {
  const flags: ForensicFlag[] = []
  const numbered = isNumberedCompany(employerName)
  const commonSurname = isCommonSurname(applicantName)

  // 1. Registry lookup (cache-aware if caller injected companyLookup)
  const lookup = options.companyLookup || searchOpenCorporates
  const companyInfo = await lookup(employerName)

  // 2. Check if recently incorporated (< 2 years)
  let recentlyIncorporated = false
  if (companyInfo?.incorporation_date) {
    const incDate = new Date(companyInfo.incorporation_date)
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    recentlyIncorporated = incDate > twoYearsAgo
  }

  // 3. Check if applicant is a director/officer
  let applicantIsOfficer = false
  let applicantLastnameMatch = false
  if (companyInfo && companyInfo.officers.length > 0) {
    for (const officer of companyInfo.officers) {
      if (fullNameMatch(officer.name, applicantName)) {
        applicantIsOfficer = true
        break
      }
      if (lastNameMatch(officer.name, applicantName)) {
        applicantLastnameMatch = true
      }
    }
  }

  // Also check signatory name if provided
  let signatoryOwnerFamily = false
  if (signatory && applicantName) {
    if (fullNameMatch(signatory, applicantName)) {
      applicantIsOfficer = true
    } else if (lastNameMatch(signatory, applicantName)) {
      applicantLastnameMatch = true
      // The letter's own words: a signer titled Director/Owner who shares the
      // applicant's family name needs no registry to establish the
      // relationship — the letter asserts it. This is what the registries
      // could not see (CBR carries no officers, OpenCorporates has no token):
      // the evidence was on the letter the whole time.
      if (/owner|director|president|proprietor|principal|founder/i.test(options.signatory_title || '')) {
        signatoryOwnerFamily = true
      }
    }
  }

  // 4. Address match
  let addressMatch = false
  if (applicantAddress && companyInfo?.registered_address) {
    addressMatch = addressOverlap(applicantAddress, companyInfo.registered_address)
  }

  // 5. Determine overall risk level
  // Common-surname handling: a lastname-only match is suggestive but unreliable
  // when the surname is common (e.g., Chen, Li, Smith). In that case, require
  // at least one other signal (numbered, recent incorporation, address overlap,
  // HR phone collision) before escalating risk.
  const hrPhoneCollision = !!options.hr_phone_collision
  const corroboratingSignal = numbered || recentlyIncorporated || addressMatch || hrPhoneCollision
  const effectiveLastnameMatch = applicantLastnameMatch && (!commonSurname || corroboratingSignal)

  let risk: 'high' | 'medium' | 'low' | 'clean' = 'clean'
  if (applicantIsOfficer) {
    risk = 'high'
  } else if (signatoryOwnerFamily) {
    risk = 'high'
  } else if (effectiveLastnameMatch && (numbered || recentlyIncorporated)) {
    risk = 'high'
  } else if (hrPhoneCollision && (numbered || recentlyIncorporated || applicantLastnameMatch)) {
    risk = 'high'
  } else if (effectiveLastnameMatch) {
    risk = 'medium'
  } else if (hrPhoneCollision) {
    risk = 'medium'
  } else if (numbered && recentlyIncorporated) {
    risk = 'medium'
  } else if (numbered || recentlyIncorporated) {
    risk = 'low'
  } else if (applicantLastnameMatch && commonSurname) {
    // Common surname alone → informational only
    risk = 'low'
  }

  // 6. Generate flags
  if (applicantIsOfficer) {
    const officerMatch = companyInfo?.officers.find(o => fullNameMatch(o.name, applicantName))
    flags.push({
      code: 'arm_length_applicant_is_officer',
      severity: 'critical',
      evidence_en: `Applicant "${applicantName}" is listed as ${officerMatch?.position || 'director/officer'} of "${employerName}"${companyInfo?.registry_url ? ` (${companyInfo.source})` : ''}. Employment letter is self-issued — income claims cannot be trusted.`,
      evidence_zh: `申请人"${applicantName}"是"${employerName}"的${officerMatch?.position || '董事/高管'}${companyInfo?.registry_url ? `（来源：${companyInfo.source}）` : ''}。雇佣信为自己给自己开的——收入声明不可信。`,
    })
  }

  if (signatoryOwnerFamily && !applicantIsOfficer) {
    flags.push({
      code: 'arm_length_signatory_owner_family',
      severity: 'critical',
      evidence_en: `The employment letter is signed by "${signatory}" whose printed title is "${options.signatory_title}" and whose surname is related to the applicant's ("${applicantName}"). By the letter's own words, the income claim is issued by a family-owned company — not an arm's-length employer. Require independent proof: CRA Notice of Assessment, T4, or personal-account payroll deposits.`,
      evidence_zh: `雇佣信由"${signatory}"签署，信上头衔为"${options.signatory_title}"，且其姓氏与申请人（"${applicantName}"）为同族变体。按雇佣信自己的表述，收入声明出自亲属所有的公司——不是独立第三方雇主。需要独立证据：CRA 税务评估通知（NOA）、T4，或个人账户的工资入账。`,
    })
  }

  if (applicantLastnameMatch && !applicantIsOfficer && !signatoryOwnerFamily) {
    const matchingOfficer = companyInfo?.officers.find(o => lastNameMatch(o.name, applicantName))
    const matchName = matchingOfficer?.name || signatory || ''
    // Downgrade severity when surname is common and not corroborated.
    const severity: 'high' | 'medium' | 'low' =
      commonSurname && !corroboratingSignal ? 'low' : (commonSurname ? 'medium' : 'high')
    const commonNote_en = commonSurname && !corroboratingSignal
      ? ' (common surname — this alone is not conclusive)'
      : ''
    const commonNote_zh = commonSurname && !corroboratingSignal
      ? '（姓氏常见——单独这一项不足以判定）'
      : ''
    flags.push({
      code: 'arm_length_family_business',
      severity,
      evidence_en: `Company officer "${matchName}" shares last name with applicant "${applicantName}"${commonNote_en}. ${severity === 'low' ? 'Informational.' : 'Likely a family business — employment verification is not arm\'s-length.'}`,
      evidence_zh: `公司高管"${matchName}"与申请人"${applicantName}"姓氏相同${commonNote_zh}。${severity === 'low' ? '仅供参考。' : '很可能是家族企业——雇佣证明不是独立第三方出具的。'}`,
    })
  }

  if (hrPhoneCollision) {
    flags.push({
      code: 'arm_length_hr_phone_collision',
      severity: 'critical',
      evidence_en: `Applicant's personal phone number also appears as the HR contact on the employment letter for "${employerName}". The applicant is verifying their own employment.`,
      evidence_zh: `申请人的个人电话同时出现在"${employerName}"雇佣信的 HR 联系方式中。申请人在给自己做雇佣验证。`,
    })
  }

  if (numbered) {
    flags.push({
      code: 'arm_length_numbered_company',
      severity: 'medium',
      evidence_en: `Employer "${employerName}" is a numbered company. Numbered corporations are easy to register and commonly used for shell companies. Combined with other signals, this lowers income credibility.`,
      evidence_zh: `雇主"${employerName}"是编号公司。编号公司注册门槛低，常被用作空壳公司。结合其他信号，降低收入可信度。`,
    })
  }

  if (recentlyIncorporated && companyInfo) {
    const incDate = companyInfo.incorporation_date
    flags.push({
      code: 'arm_length_recent_incorporation',
      severity: 'medium',
      evidence_en: `"${employerName}" was incorporated on ${incDate} (less than 2 years ago). Recently formed companies claiming long-term employment are suspicious.`,
      evidence_zh: `"${employerName}"注册于 ${incDate}（不到两年前）。新成立的公司声称长期雇佣关系令人怀疑。`,
    })
  }

  if (companyInfo && companyInfo.officers.length === 0 && !applicantIsOfficer && !signatoryOwnerFamily) {
    // CBR/MRAS carries no director data, and OpenCorporates runs only with a
    // paid token. Without this line a "clean" verdict reads as "directors
    // checked, no relationship found" when the truth is "directors could not
    // be checked". The signatory comparison above still ran.
    flags.push({
      code: 'arm_length_officers_unavailable',
      severity: 'low',
      evidence_en: `The registry consulted (${companyInfo.source}) does not publish director/officer names, so the applicant-vs-directors comparison could NOT be performed for "${employerName}". A clean result here reflects only the checks that ran (company existence, incorporation date, signatory name).`,
      evidence_zh: `所查询的注册库（${companyInfo.source}）不公开董事/高管名单，因此无法对"${employerName}"执行申请人与董事的比对。此项"无发现"仅代表已执行的检查（公司存在性、注册日期、签署人比对），不代表董事核验通过。`,
    })
  }

  if (addressMatch) {
    flags.push({
      code: 'arm_length_address_overlap',
      severity: 'medium',
      evidence_en: `Employer registered address overlaps with applicant's address. This suggests the "employer" may be operating from the applicant's home.`,
      evidence_zh: `雇主注册地址与申请人地址重叠。表明"雇主"可能在申请人家中运营。`,
    })
  }

  // Only emit "company not found" when some registry was actually queryable
  // (i.e., the caller injected a companyLookup, which means the route has
  // access to our Supabase CA registry). In that case the miss is meaningful
  // — the company is not in Corporations Canada's federal dataset.
  //
  // Note the scoping: Federal registry covers ~1.5M corps but EXCLUDES
  // Ontario-only businesses and financial institutions (banks, broker-
  // dealers like Citigroup Global Markets Canada). A miss therefore does
  // NOT mean the company is fake — just that it's not federally incorporated
  // under CBCA/NFP/COOP/BOTA. That's why severity is still 'low'.
  const registryConfigured = isRegistryConfigured() || !!options.companyLookup
  if (companyInfo === null && employerName.length > 3) {
    if (registryConfigured) {
      flags.push({
        code: 'arm_length_company_not_found',
        severity: 'low',
        evidence_en: `"${employerName}" was not found in the federal registry (Corporations Canada) or in the participating provincial registries searched via Canada's Business Registries (ON, BC, AB, QC, MB, SK, NS). It may be a sole proprietorship or operating/trade name (no corporate record), registered in a non-participating jurisdiction (NB, PE, NL, territories), or a regulated financial institution.`,
        evidence_zh: `在联邦注册库（Corporations Canada）以及加拿大商业登记（CBR）联查的各省注册库（安省、BC、阿省、魁省、曼省、萨省、新斯科舍）中均未找到"${employerName}"。可能是个人经营/商号（无公司注册记录）、注册在未接入的辖区（新不伦瑞克、PEI、纽芬兰、各地区），或受金融监管机构（如银行、券商）。`,
      })
    } else {
      flags.push({
        code: 'arm_length_registry_not_configured',
        severity: 'low',
        evidence_en: `Company registry lookup is not configured — could not verify "${employerName}" against corporate registries. Heuristic checks still apply.`,
        evidence_zh: `公司注册查询未配置——未能在注册数据库中核对"${employerName}"。启发式检查仍然适用（编号公司、电话碰撞等）。`,
      })
    }
  }

  return {
    employer_name: employerName,
    company_info: companyInfo,
    is_numbered_company: numbered,
    is_recently_incorporated: recentlyIncorporated,
    applicant_is_officer: applicantIsOfficer,
    applicant_lastname_match: applicantLastnameMatch,
    company_address_matches_applicant: addressMatch,
    arm_length_risk: risk,
    flags,
  }
}

// -----------------------------------------------------------------------------
// P4 — Arm's-Length Employment Verification
//
// Checks whether the employer on the employment letter / pay stub is truly
// independent of the applicant. Non-arm's-length employment (own company,
// family business, shell corp) undermines all income verification.
//
// Data sources:
//   1. OpenCorporates API (free tier, no key needed, 500 req/mo)
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
  const suffixRe = /\s*[,.]?\s*(incorporated|incorporée|corporation|corp|company|co|limited|limitée|ltée|ltd|inc|llc|llp|lp|pc|plc|gmbh|ag|sa)\s*\.?$/i
  for (let i = 0; i < 3; i++) {
    const prev = s
    s = s.replace(suffixRe, '').trim()
    if (prev === s) break
  }
  return s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Check if two names likely refer to the same person (fuzzy last-name match)
function lastNameMatch(name1: string, name2: string): boolean {
  const normalize = (n: string) => n.toLowerCase().replace(/[^a-z\s]/g, '').trim()
  const parts1 = normalize(name1).split(/\s+/)
  const parts2 = normalize(name2).split(/\s+/)
  if (parts1.length === 0 || parts2.length === 0) return false
  const last1 = parts1[parts1.length - 1]
  const last2 = parts2[parts2.length - 1]
  if (last1.length < 3 || last2.length < 3) return false
  return last1 === last2
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
  const words1 = a1.split(/\s+/).filter(w => w.length >= 4)
  const words2 = new Set(a2.split(/\s+/).filter(w => w.length >= 4))
  const commonWords = words1.filter(w => words2.has(w))
  return commonWords.length >= 2 // At least 2 common location words
}

/**
 * Search OpenCorporates for a company name in Canadian jurisdictions.
 * Free tier: no API key needed, 500 req/month, basic company info.
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

  const jurisdictions = ['ca_on', 'ca_bc', 'ca_ab', 'ca_qc', 'ca_mb', 'ca_sk', 'ca_ns', 'ca_nb', 'ca']
  const query = encodeURIComponent(companyName.trim())
  const target = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const targetWords = target.split(/\s+/).filter(Boolean)

  // Parallel fan-out
  const perCallTimeoutMs = 6000
  let authErrorSeen = false
  const searches = jurisdictions.map(async (jurisdiction) => {
    try {
      const url = `https://api.opencorporates.com/v0.4/companies/search?q=${query}&jurisdiction_code=${jurisdiction}&per_page=5${tokenParam}`
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(perCallTimeoutMs),
      })
      if (res.status === 401 || res.status === 403) {
        authErrorSeen = true
        return null
      }
      if (!res.ok) return null
      const data = await res.json() as any
      // Defensive: API sometimes returns 200 with an error body shape
      if (data?.error?.message) {
        if (/token|auth/i.test(String(data.error.message))) authErrorSeen = true
        return null
      }
      const companies = data?.results?.companies || []
      return companies.length ? companies : null
    } catch {
      return null
    }
  })
  const settled = await Promise.allSettled(searches)

  if (authErrorSeen) {
    throw new RegistryAuthError(
      apiToken
        ? 'OpenCorporates rejected the API token — check OPENCORPORATES_API_TOKEN in Cloudflare env'
        : 'OpenCorporates requires an API token. Set OPENCORPORATES_API_TOKEN in Cloudflare Pages env vars (sign up for free at opencorporates.com/users/sign_up).'
    )
  }

  // Score every candidate across all jurisdictions
  let bestMatch: any = null
  let bestScore = 0
  for (const r of settled) {
    if (r.status !== 'fulfilled' || !r.value) continue
    for (const c of r.value) {
      const co = c.company
      const coName = (co.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
      const coWords = new Set(coName.split(/\s+/))
      const overlap = targetWords.length > 0
        ? targetWords.filter(w => coWords.has(w)).length / targetWords.length
        : 0
      if (overlap > bestScore) {
        bestScore = overlap
        bestMatch = co
      }
    }
  }

  if (!bestMatch || bestScore < 0.5) return null

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
  if (signatory && applicantName) {
    if (fullNameMatch(signatory, applicantName)) {
      applicantIsOfficer = true
    } else if (lastNameMatch(signatory, applicantName)) {
      applicantLastnameMatch = true
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

  if (applicantLastnameMatch && !applicantIsOfficer) {
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
        evidence_en: `"${employerName}" was not found in the Canadian federal corporate registry (Corporations Canada). It may be provincially registered (e.g., Ontario / BC / Quebec), a sole proprietorship, or a regulated financial institution — none of which are in the federal dataset.`,
        evidence_zh: `在加拿大联邦公司注册数据库（Corporations Canada）中未找到"${employerName}"。可能是省级注册（Ontario / BC / Quebec 等）、个人经营、或受金融监管机构（如银行、券商）——这几类都不在联邦数据集中。`,
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

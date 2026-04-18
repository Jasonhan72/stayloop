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
 */
async function searchOpenCorporates(companyName: string): Promise<CompanyRegistryInfo | null> {
  if (!companyName || companyName.trim().length < 3) return null

  const jurisdictions = ['ca_on', 'ca_bc', 'ca_ab', 'ca_qc', 'ca_mb', 'ca_sk', 'ca_ns', 'ca_nb', 'ca']
  const query = encodeURIComponent(companyName.trim())

  for (const jurisdiction of jurisdictions) {
    try {
      const url = `https://api.opencorporates.com/v0.4/companies/search?q=${query}&jurisdiction_code=${jurisdiction}&per_page=5`
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const data = await res.json() as any

      const companies = data?.results?.companies || []
      if (companies.length === 0) continue

      // Find best match by name similarity
      const target = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
      let bestMatch: any = null
      let bestScore = 0
      for (const c of companies) {
        const co = c.company
        const coName = (co.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
        // Simple overlap score
        const targetWords = target.split(/\s+/)
        const coWords = new Set(coName.split(/\s+/))
        const overlap = targetWords.filter(w => coWords.has(w)).length / targetWords.length
        if (overlap > bestScore) {
          bestScore = overlap
          bestMatch = co
        }
      }

      if (!bestMatch || bestScore < 0.5) continue

      // Try to fetch officers if available
      let officers: Array<{ name: string; position: string }> = []
      try {
        const detailUrl = `https://api.opencorporates.com/v0.4/companies/${bestMatch.jurisdiction_code}/${bestMatch.company_number}`
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
    } catch {
      // Network error for this jurisdiction — try next
      continue
    }
  }

  return null
}

/**
 * Run arm's-length checks for the given employer.
 *
 * @param employerName - extracted from employment letter or pay stub
 * @param applicantName - tenant's full name
 * @param applicantAddress - tenant's address (if known)
 * @param signatory - name of the person who signed the employment letter (if extractable)
 */
export async function checkArmLength(
  employerName: string,
  applicantName: string,
  applicantAddress?: string,
  signatory?: string,
): Promise<ArmLengthResult> {
  const flags: ForensicFlag[] = []
  const numbered = isNumberedCompany(employerName)

  // 1. Registry lookup
  const companyInfo = await searchOpenCorporates(employerName)

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
  let risk: 'high' | 'medium' | 'low' | 'clean' = 'clean'
  if (applicantIsOfficer) {
    risk = 'high'
  } else if (applicantLastnameMatch && (numbered || recentlyIncorporated)) {
    risk = 'high'
  } else if (applicantLastnameMatch) {
    risk = 'medium'
  } else if (numbered && recentlyIncorporated) {
    risk = 'medium'
  } else if (numbered || recentlyIncorporated) {
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
    flags.push({
      code: 'arm_length_family_business',
      severity: 'high',
      evidence_en: `Company officer "${matchName}" shares last name with applicant "${applicantName}". Likely a family business — employment verification is not arm's-length.`,
      evidence_zh: `公司高管"${matchName}"与申请人"${applicantName}"姓氏相同。很可能是家族企业——雇佣证明不是独立第三方出具的。`,
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

  if (companyInfo === null && employerName.length > 3) {
    flags.push({
      code: 'arm_length_company_not_found',
      severity: 'low',
      evidence_en: `"${employerName}" was not found in Canadian corporate registries (OpenCorporates). Could be a DBA, sole proprietorship, or fictitious employer.`,
      evidence_zh: `在加拿大公司注册数据库（OpenCorporates）中未找到"${employerName}"。可能是个人经营名称、独资企业或虚构雇主。`,
    })
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

// Employer deep-check additions (2026-09-16, 6269 Ash St). The registry
// card showed "Inactive" beside a green "正常" badge, and nothing looked at
// the employer's domain, contact path, address or litigation. Everything
// here is deterministic; the two network reads (RDAP, courts portal) are
// injected so the module stays testable and never calls out on its own.
import type { ForensicFlag } from './types'

export type RegistryStatusKind = 'active' | 'inactive' | 'unknown'

/** Ontario/federal registries print many spellings; only these mean "gone". */
export function registryStatusKind(status: string | null | undefined): RegistryStatusKind {
  const s = (status || '').toLowerCase()
  if (!s) return 'unknown'
  if (/inactive|dissol|cancel|revok|struck|discontinu|amalgamat|not active|expired|terminated|wound|liquidat/.test(s)) return 'inactive'
  if (/active|good standing|in existence|registered|subsisting|current/.test(s)) return 'active'
  return 'unknown'
}

const PERSONAL_MAIL = /^(gmail|googlemail|hotmail|outlook|live|yahoo|ymail|icloud|me|aol|proton|protonmail|qq|163|126|sina|foxmail|mail|gmx|yandex|rogers|bell|sympatico|shaw|telus)\.(com|ca|net|org|me|ch|cn)$/i

/** Domains the employer's own documents name (email domains + URLs), minus personal providers. */
export function extractEmployerDomains(text: string | null | undefined): { domains: string[]; personal_emails: string[] } {
  const t = text || ''
  const domains = new Set<string>()
  const personal = new Set<string>()
  for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    const d = m[1].toLowerCase()
    if (PERSONAL_MAIL.test(d)) personal.add(m[0].toLowerCase())
    else domains.add(d)
  }
  for (const m of t.matchAll(/\b(?:https?:\/\/|www\.)([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) domains.add(m[1].toLowerCase().replace(/^www\./, ''))
  return { domains: Array.from(domains).slice(0, 3), personal_emails: Array.from(personal).slice(0, 3) }
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
/** "employed … since 23 June 2015" / "start date: June 23, 2015" / "since 2015-06-23" → ISO date */
export function extractEmploymentStart(text: string | null | undefined): string | null {
  const t = (text || '').replace(/\s+/g, ' ')
  // "since" is the word forged letters most often misspell ("scince",
  // "sinse", "sicne") — accept those, and "from <date>" after "employed".
  const win = t.match(/(?:\bs[ci]{1,2}n[cs]e\b|\bsince\b|\bscince\b|start(?:ed|ing)? (?:date|on)?|commenc\w+|joined(?: us)?(?: on)?|effective|employed[^.;]{0,40}?\bfrom)\s*:?\s*([^.;]{0,40})/i)
  if (!win) return null
  const s = win[1]
  let m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+((?:19|20)\d{2})/)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{2})/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  m = s.match(/((?:19|20)\d{2})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[2]}-${String(MONTHS[m[1].slice(0, 3).toLowerCase()]).padStart(2, '0')}-01`
  m = s.match(/\b((?:19|20)\d{2})\b/)
  if (m) return `${m[1]}-01-01`
  return null
}

/** The city the employer's own letterhead / stub prints (best effort). */
export function extractStatedCity(text: string | null | undefined): string | null {
  const t = (text || '').replace(/\s+/g, ' ')
  const cities = ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Markham', 'Vaughan', 'Kitchener', 'Windsor', 'Richmond Hill', 'Oakville', 'Burlington', 'Oshawa', 'Barrie', 'St. Catharines', 'Cambridge', 'Kingston', 'Guelph', 'Whitby', 'Ajax', 'Pickering', 'Milton', 'Niagara Falls', 'Waterloo', 'Thunder Bay', 'Sudbury', 'Newmarket', 'Aurora', 'Scarborough', 'Etobicoke', 'North York', 'Montreal', 'Montréal', 'Laval', 'Vancouver', 'Surrey', 'Burnaby', 'Calgary', 'Edmonton', 'Winnipeg', 'Halifax', 'Regina', 'Saskatoon', 'Victoria', 'Concord', 'Woodbridge', 'Thornhill', 'Scarborough']
  for (const c of cities) if (new RegExp(`\\b${c.replace('.', '\\.')}\\b`, 'i').test(t)) return c
  return null
}

const ONTARIO_AREA: Record<string, string> = {
  '416': 'Toronto', '647': 'Toronto', '437': 'Toronto', '387': 'Toronto',
  '905': 'GTA suburbs / Hamilton–Niagara', '289': 'GTA suburbs / Hamilton–Niagara', '365': 'GTA suburbs / Hamilton–Niagara', '742': 'GTA suburbs / Hamilton–Niagara',
  '613': 'Ottawa / Eastern Ontario', '343': 'Ottawa / Eastern Ontario', '519': 'Southwestern Ontario', '226': 'Southwestern Ontario', '548': 'Southwestern Ontario',
  '705': 'Central / Northern Ontario', '249': 'Central / Northern Ontario', '807': 'Northwestern Ontario',
}
export function phoneRegion(phone: string | null | undefined): string | null {
  const d = (phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  if (d.length !== 10) return null
  return ONTARIO_AREA[d.slice(0, 3)] ?? null
}

export interface RdapResult { domain: string; registered: boolean; registration_date: string | null; expiration_date: string | null }
/** rdap.org redirects to the registry's RDAP server; a 404 means the domain does not exist. */
export async function rdapLookup(domain: string, fetchImpl: typeof fetch = fetch): Promise<RdapResult | null> {
  try {
    const res = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { accept: 'application/rdap+json, application/json' }, signal: AbortSignal.timeout(8000), redirect: 'follow' })
    if (res.status === 404) return { domain, registered: false, registration_date: null, expiration_date: null }
    if (!res.ok) return null
    const j = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> }
    const ev = (a: string) => (j.events || []).find(e => (e.eventAction || '').toLowerCase() === a)?.eventDate?.slice(0, 10) ?? null
    return { domain, registered: true, registration_date: ev('registration'), expiration_date: ev('expiration') }
  } catch {
    return null
  }
}

export interface EmployerLitigation { total: number; cases: Array<{ title: string; role: string; filed: string; closed: boolean | null }> }

export interface EmployerExtraInput {
  employer_name: string
  company_status?: string | null
  company_registered_address?: string | null
  incorporation_date?: string | null
  doc_text?: string | null
  business_phone?: string | null
  rdap?: RdapResult[] | null
  litigation?: EmployerLitigation | null
  today?: Date
}

export interface EmployerExtraResult {
  registry_status_kind: RegistryStatusKind
  employment_start: string | null
  stated_city: string | null
  domain_check: RdapResult[]
  personal_emails: string[]
  litigation: EmployerLitigation | null
  flags: ForensicFlag[]
}

export function employerExtraChecks(inp: EmployerExtraInput): EmployerExtraResult {
  const flags: ForensicFlag[] = []
  const kind = registryStatusKind(inp.company_status)
  const start = extractEmploymentStart(inp.doc_text)
  const city = extractStatedCity(inp.doc_text)
  const { personal_emails } = extractEmployerDomains(inp.doc_text)
  const emp = inp.employer_name

  if (kind === 'inactive') {
    flags.push({
      code: 'employer_registry_inactive',
      severity: 'critical',
      evidence_en: `The registry lists ${emp} as "${inp.company_status}"${inp.incorporation_date ? ` (incorporated ${inp.incorporation_date})` : ''}. An inactive or dissolved corporation cannot be issuing current pay stubs or an employment letter${start ? ` claiming employment since ${start}` : ''}. Either the documents are not genuine or the employer trades under another entity — ask for the CRA payroll account number (BN + RP) and a T4.`,
      evidence_zh: `注册库显示 ${emp} 状态为「${inp.company_status}」${inp.incorporation_date ? `（成立于 ${inp.incorporation_date}）` : ''}。已注销 / 非活跃的公司不可能出具当前的工资单和在职信${start ? `（信称自 ${start} 起受雇）` : ''}。要么文件不真实，要么雇主以另一实体经营——请索取 CRA 工资账户号（BN + RP）与 T4。`,
    })
  }

  if (start && inp.incorporation_date && start < inp.incorporation_date) {
    flags.push({
      code: 'employer_employment_predates_incorporation',
      severity: 'high',
      evidence_en: `The letter says employment began ${start}, but ${emp} was incorporated ${inp.incorporation_date}. Nobody can be employed by a company before it exists.`,
      evidence_zh: `信称 ${start} 起受雇，而 ${emp} 成立于 ${inp.incorporation_date}。公司存在之前不可能有人受雇。`,
    })
  }

  if (city && inp.company_registered_address) {
    const regCity = extractStatedCity(inp.company_registered_address)
    if (regCity && regCity.toLowerCase() !== city.toLowerCase()) {
      flags.push({
        code: 'employer_address_differs_from_registry',
        severity: 'low',
        evidence_en: `The letterhead / stub places ${emp} in ${city}; the registry's address is in ${regCity}. A branch office is common — but a registered address in one town and payroll in another is worth one question.`,
        evidence_zh: `信头 / 工资单把 ${emp} 写在 ${city}，注册库地址在 ${regCity}。分支机构常见，但注册地和发薪地不同值得问一句。`,
      })
    }
  }

  for (const r of inp.rdap || []) {
    if (!r.registered) {
      flags.push({
        code: 'employer_domain_unregistered',
        severity: 'high',
        evidence_en: `The employer's contact domain ${r.domain} is not a registered domain — the email address on the letter cannot receive mail.`,
        evidence_zh: `雇主联系域名 ${r.domain} 并未注册——信上的邮箱根本收不到邮件。`,
      })
    } else if (r.registration_date && start && r.registration_date > `${+start.slice(0, 4) + 1}${start.slice(4)}`) {
      flags.push({
        code: 'employer_domain_younger_than_employment',
        severity: 'medium',
        evidence_en: `${r.domain} was registered ${r.registration_date}, but the letter says employment there began ${start}. Companies do rebrand, but a firm that has employed someone since ${start.slice(0, 4)} usually owns its domain by then — confirm the employer's history.`,
        evidence_zh: `${r.domain} 注册于 ${r.registration_date}，而信称 ${start} 起在该公司受雇。公司可能换过名字，但 ${start.slice(0, 4)} 年就在雇人的公司通常早已有自己的域名——请核实公司沿革。`,
      })
    }
  }

  if (personal_emails.length && !(inp.rdap || []).length) {
    flags.push({
      code: 'employer_contact_personal_email',
      severity: 'medium',
      evidence_en: `The only employer contact on the documents is a personal mailbox (${personal_emails.join(', ')}). A company that issues payroll normally verifies employment from its own domain; a personal address cannot be tied to the employer.`,
      evidence_zh: `文件上唯一的雇主联系方式是个人邮箱（${personal_emails.join('、')}）。发工资的公司通常用自己域名的邮箱核实雇佣；个人邮箱无法与雇主挂钩。`,
    })
  }

  const region = phoneRegion(inp.business_phone)
  if (region && city && !region.toLowerCase().includes(city.toLowerCase()) && !(city === 'Toronto' && /Toronto/.test(region))) {
    flags.push({
      code: 'employer_phone_region_differs',
      severity: 'low',
      evidence_en: `The business phone given for ${emp} (${inp.business_phone}) is a ${region} number, while the documents place the office in ${city}. Cell numbers travel — but a "business telephone" that is not local to the office is worth a call to the company's listed main line instead.`,
      evidence_zh: `${emp} 的公司电话（${inp.business_phone}）是 ${region} 区号，而文件写的办公地在 ${city}。手机号会跟人走，但「公司电话」不在办公地所在区域时，建议改打公司公开的总机核实。`,
    })
  }

  const lit = inp.litigation ?? null
  if (lit && lit.total > 0) {
    const asDefendant = lit.cases.filter(c => /defendant|respondent|debtor|garnishee/i.test(c.role))
    const open = lit.cases.filter(c => c.closed === false)
    flags.push({
      code: 'employer_court_cases',
      severity: asDefendant.length >= 2 || open.length ? 'medium' : 'low',
      evidence_en: `${emp} appears as a party in ${lit.total} Ontario civil / small-claims case(s)${asDefendant.length ? `, ${asDefendant.length} as defendant/respondent` : ''}${open.length ? `, ${open.length} still open` : ''}: ${lit.cases.slice(0, 3).map(c => `${c.title} (${c.role}${c.filed ? `, ${c.filed.slice(0, 10)}` : ''})`).join('; ')}. A filing proves a filing, not an outcome — read the case before drawing conclusions about the employer's stability.`,
      evidence_zh: `${emp} 在安省民事 / 小额法庭有 ${lit.total} 件案件为当事人${asDefendant.length ? `，其中 ${asDefendant.length} 件为被告 / 被申请人` : ''}${open.length ? `，${open.length} 件未结` : ''}：${lit.cases.slice(0, 3).map(c => `${c.title}（${c.role}${c.filed ? `，${c.filed.slice(0, 10)}` : ''}）`).join('；')}。立案只证明有诉讼，不代表结果——判断雇主经营稳定性前请先读案件。`,
    })
  }

  return { registry_status_kind: kind, employment_start: start, stated_city: city, domain_check: inp.rdap || [], personal_emails, litigation: lit, flags }
}

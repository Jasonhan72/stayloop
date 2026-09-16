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
  // The federal CBR prints "Active (New Amalgamated)" for a live successor and
  // "Discontinued" for a corporation continued into a province that still
  // trades — an explicit Active wins over any qualifier (review 2026-09-16).
  if (/^\s*(?:active|in existence|good standing|registered|subsisting|current)\b/.test(s) && !/\b(?:not|in)active\b|\bnot in good standing\b/.test(s)) return 'active'
  if (/inactive|not active|dissol|cancel|revok|struck|expired|terminated|wound|liquidat|not in good standing/.test(s)) return 'inactive'
  if (/discontinu|amalgamat/.test(s)) return /\bactive\b/.test(s) ? 'active' : 'unknown'
  if (/active|good standing|in existence|registered|subsisting|current/.test(s)) return 'active'
  return 'unknown'
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number)
  return Math.max(0, (by - ay) * 12 + (bm - am))
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
  return extractEmploymentStartDetailed(text)?.date ?? null
}

export type DatePrecision = 'day' | 'month' | 'year'
/** Same, with how precise the letter was: "since 2015" is a year, not January 1 (review 2026-09-16). */
export function extractEmploymentStartDetailed(text: string | null | undefined): { date: string; precision: DatePrecision } | null {
  const t = (text || '').replace(/\s+/g, ' ')
  // "since" is the word forged letters most often misspell ("scince",
  // "sinse", "sicne") — accept those, and "from <date>" after "employed".
  // Start-of-employment wording is tried first; "effective / commencing"
  // (which also introduce salary changes) only when nothing else matched.
  const primary = t.match(/(?:\bs[ci]{1,2}n[cs]e\b|\bsince\b|\bscince\b|start(?:ed|ing)? (?:date|on)?|joined(?: us)?(?: on)?|employed[^.;]{0,40}?\bfrom|date of hire|hire date)\s*:?\s*([^.;]{0,40})/i)
  const win = primary ?? t.match(/(?:commenc\w+|effective)\s*:?\s*([^.;]{0,40})/i)
  if (!win) return null
  // Text layers of edited letters print years like "20 I 5" (a retyped
  // digit in a different font maps to a letter glyph) — repair before
  // parsing (2026-09-16: "scince 23 June 20 I 5").
  const s = win[1].replace(/(\d)\s*[Il|]\s*(\d)/g, '$11$2').replace(/\b(19|20)\s+(\d)\s*(\d)\b/g, '$1$2$3')
  const pad = (v: string) => v.padStart(2, '0')
  let m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+((?:19|20)\d{2})/)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return { date: `${m[3]}-${pad(String(MONTHS[m[2].slice(0, 3).toLowerCase()]))}-${pad(m[1])}`, precision: 'day' }
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{2})/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return { date: `${m[3]}-${pad(String(MONTHS[m[1].slice(0, 3).toLowerCase()]))}-${pad(m[2])}`, precision: 'day' }
  m = s.match(/((?:19|20)\d{2})-(\d{2})-(\d{2})/)
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, precision: 'day' }
  // Numeric slash dates: 23/06/2015 (DMY) / 06/23/2015 (MDY); ambiguous
  // ones (both parts ≤ 12) are only trusted to the year.
  m = s.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.]((?:19|20)\d{2})\b/)
  if (m) {
    const a = +m[1], b = +m[2]
    if (a > 12 && b <= 12) return { date: `${m[3]}-${pad(String(b))}-${pad(String(a))}`, precision: 'day' }
    if (b > 12 && a <= 12) return { date: `${m[3]}-${pad(String(a))}-${pad(String(b))}`, precision: 'day' }
    return { date: `${m[3]}-01-01`, precision: 'year' }
  }
  m = s.match(/([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return { date: `${m[2]}-${pad(String(MONTHS[m[1].slice(0, 3).toLowerCase()]))}-01`, precision: 'month' }
  m = s.match(/\b((?:19|20)\d{2})\b/)
  if (m) return { date: `${m[1]}-01-01`, precision: 'year' }
  return null
}

/** a < b at the coarser of the two precisions ("since 2015" never predates 2015-03-10). */
export function dateBefore(a: string, ap: DatePrecision, b: string, bp: DatePrecision = 'day'): boolean {
  const n = ap === 'year' || bp === 'year' ? 4 : ap === 'month' || bp === 'month' ? 7 : 10
  return a.slice(0, n) < b.slice(0, n)
}

/** The city the employer's own letterhead / stub prints (best effort). */
const CITY_LIST = ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Markham', 'Vaughan', 'Kitchener', 'Windsor', 'Richmond Hill', 'Oakville', 'Burlington', 'Oshawa', 'Barrie', 'St. Catharines', 'Cambridge', 'Kingston', 'Guelph', 'Whitby', 'Ajax', 'Pickering', 'Milton', 'Niagara Falls', 'Waterloo', 'Thunder Bay', 'Sudbury', 'Newmarket', 'Aurora', 'Scarborough', 'Etobicoke', 'North York', 'Montreal', 'Montréal', 'Laval', 'Vancouver', 'Surrey', 'Burnaby', 'Calgary', 'Edmonton', 'Winnipeg', 'Halifax', 'Regina', 'Saskatoon', 'Victoria', 'Concord', 'Woodbridge', 'Thornhill']
const CITY_RE = new RegExp(`\\b(${CITY_LIST.map(c => c.replace('.', '\\.')).join('|')})\\b[ ,]*(?:,?\\s*(?:ON|Ont\\.?|Ontario|QC|Quebec|Québec|BC|AB|MB|SK|NS|NB|Canada)\\b|[A-CEGHJ-NPR-TVXY]\\d[A-CEGHJ-NPR-TV-Z]\\s?\\d[A-CEGHJ-NPR-TV-Z]\\d)`, 'i')
/** The city the employer's own letterhead prints (best effort): the FIRST
 *  "<city>, ON / postal code" in the letterhead region of the letter (the
 *  employee's address on a stub / T4 and street names like "Hamilton Rd"
 *  do not count — review 2026-09-16). */
export function extractStatedCity(text: string | null | undefined): string | null {
  const t = (text || '').replace(/\s+/g, ' ')
  // Letterhead = first 600 chars of the letter segment (segments are joined
  // with "---"); fall back to the whole text when there is no letter.
  const segs = t.split(/\s---\s/)
  const letter = segs.find(x => /employ|verif|confirm|to whom it may concern|human resources/i.test(x)) ?? segs[0] ?? ''
  const m = letter.slice(0, 600).match(CITY_RE) ?? letter.match(CITY_RE)
  if (!m) return null
  const c = m[1]
  return CITY_LIST.find(x => x.toLowerCase() === c.toLowerCase()) ?? c
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
const TORONTO = ['416', '647', '437', '387']
const GTA_905 = ['905', '289', '365', '742']
const AREA_BY_CITY: Record<string, string[]> = {
  toronto: TORONTO, scarborough: TORONTO, etobicoke: TORONTO, 'north york': TORONTO,
  mississauga: GTA_905, brampton: GTA_905, markham: GTA_905, vaughan: GTA_905, 'richmond hill': GTA_905, oakville: GTA_905, burlington: GTA_905,
  oshawa: GTA_905, whitby: GTA_905, ajax: GTA_905, pickering: GTA_905, milton: GTA_905, newmarket: GTA_905, aurora: GTA_905, hamilton: GTA_905,
  'niagara falls': GTA_905, 'st. catharines': GTA_905, concord: GTA_905, woodbridge: GTA_905, thornhill: GTA_905,
  ottawa: ['613', '343'], kingston: ['613', '343'],
  london: ['519', '226', '548'], kitchener: ['519', '226', '548'], waterloo: ['519', '226', '548'], cambridge: ['519', '226', '548'], guelph: ['519', '226', '548'], windsor: ['519', '226', '548'],
  barrie: ['705', '249'], sudbury: ['705', '249'], 'thunder bay': ['807'],
}
/** True only when the area code is an Ontario code that does NOT serve the stated city (unknown cities / non-Ontario codes never flag). */
export function phoneOutsideCity(phone: string | null | undefined, city: string | null | undefined): boolean {
  const d = (phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  if (d.length !== 10 || !city) return false
  const code = d.slice(0, 3)
  if (!ONTARIO_AREA[code]) return false
  const codes = AREA_BY_CITY[city.toLowerCase()]
  return !!codes && !codes.includes(code)
}

export interface RdapResult { domain: string; registered: boolean; registration_date: string | null; expiration_date: string | null }
/** rdap.org redirects to the registry's RDAP server; a 404 means the domain does not exist. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'gc', 'ac', 'edu', 'on', 'qc', 'bc', 'ab', 'mb', 'sk', 'ns', 'nb'])
/** wd5.myworkday.com → myworkday.com; cra-arc.gc.ca → cra-arc.gc.ca (registries answer for the registrable name only). */
export function registrableDomain(domain: string): string {
  const parts = domain.toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  return (SECOND_LEVEL.has(parts[parts.length - 2]) ? parts.slice(-3) : parts.slice(-2)).join('.')
}
export async function rdapLookup(domain: string, fetchImpl: typeof fetch = fetch): Promise<RdapResult | null> {
  try {
    const name = registrableDomain(domain)
    // rdap.org fronts with Cloudflare and answers 403 to an empty / node UA
    // (review 2026-09-16: every production lookup silently returned null).
    const res = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(name)}`, { headers: { accept: 'application/rdap+json, application/json', 'user-agent': 'Stayloop/1.0 (+https://www.stayloop.ai)' }, signal: AbortSignal.timeout(8000), redirect: 'follow' })
    if (res.status === 404) {
      // Only an RDAP error document from the registry means "no such domain";
      // a bare 404 (TLD without RDAP, gateway) is unknown, not unregistered.
      let body: { errorCode?: number; title?: string } | null = null
      try { body = (await res.json()) as { errorCode?: number; title?: string } } catch { body = null }
      return body && (body.errorCode === 404 || /not found/i.test(body.title || '')) ? { domain: name, registered: false, registration_date: null, expiration_date: null } : null
    }
    if (!res.ok) return null
    const j = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> }
    const ev = (a: string) => (j.events || []).find(e => (e.eventAction || '').toLowerCase() === a)?.eventDate?.slice(0, 10) ?? null
    return { domain: registrableDomain(domain), registered: true, registration_date: ev('registration'), expiration_date: ev('expiration') }
  } catch {
    return null
  }
}


// ── Ontario Gazette: why a corporation is "Inactive" ────────────────────
// The registry says Inactive and nothing more. The Ontario Gazette's
// "Government Notices Respecting Corporations" says why: a notice of
// default under the Corporations Tax Act (Minister of Finance), the
// cancellation that follows it, cancellation under the Corporations
// Information Act (annual returns not filed), a voluntary dissolution
// under OBCA s.237/238, or a revival. 6269 Ash St: GLOBE NET INTERNATIONAL
// INC. 002072032 — default notice 2014-10-18 (Vol 147 Iss 45), certificate
// cancelled 2015-01-26 (Vol 148 Iss 08) — while the letter claims
// employment since 2015-06-23.
export type GazetteNoticeKind = 'tax_default_notice' | 'tax_default_cancellation' | 'cia_default_notice' | 'cia_cancellation' | 'voluntary_dissolution' | 'revival' | 'other'
export interface GazetteNotice { kind: GazetteNoticeKind; date: string | null; heading: string; issue: string; url: string }

export function classifyGazetteSection(heading: string): GazetteNoticeKind {
  const h = heading.toLowerCase()
  const tax = /corporations tax act/.test(h)
  const cia = /corporations information act/.test(h)
  if (/reviv/.test(h)) return 'revival'
  if (/cancellation|cancelled|dissolved by order|dissolution by/.test(h) && tax) return 'tax_default_cancellation'
  if (/notice of default|in default/.test(h) && tax) return 'tax_default_notice'
  if (/cancellation|cancelled/.test(h) && cia) return 'cia_cancellation'
  if (/notice of default|in default/.test(h) && cia) return 'cia_default_notice'
  if (/certificate of dissolution|voluntar|section 23[78]|s\. ?23[78]/.test(h)) return 'voluntary_dissolution'
  return 'other'
}

const GAZETTE_HEADING = /^(notice of default[^\n]*|cancellation[^\n]*|certificate of dissolution[^\n]*|order for revival[^\n]*|revival[^\n]*|errors in notices[^\n]*|notice of dissolution[^\n]*|corporations tax act[^\n]*|corporations information act[^\n]*)$/i

/** Ontario corporation numbers are printed zero-padded to 9 digits ("002072032"). */
export function padOntarioNumber(n: string | null | undefined): string | null {
  const d = (n || '').replace(/\D/g, '')
  return d ? d.padStart(9, '0') : null
}

function gazetteIssueFromUrl(url: string): string {
  const m = url.match(/ontario-gazette-volume-(\d+)-issue-(\d+)(?:-([a-z]+)-(\d+)-(\d{4}))?/i)
  if (!m) return 'Ontario Gazette'
  const month = m[3] ? m[3][0].toUpperCase() + m[3].slice(1) : ''
  return `Volume ${m[1]} Issue ${m[2]}${m[3] ? ` (${month} ${m[4]}, ${m[5]})` : ''}`
}

/** Find the company in one Gazette page (Jina text) and say which section it sits in. Pure. */
export function parseGazettePage(text: string, url: string, companyName: string, companyNumber: string | null | undefined): GazetteNotice[] {
  const out: GazetteNotice[] = []
  const lines = text.split(/\r?\n/)
  const num = padOntarioNumber(companyNumber)
  const name = companyName.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  let heading = ''
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/﻿/g, '').trim()
    if (!raw) continue
    if (raw.length < 160 && GAZETTE_HEADING.test(raw)) { heading = raw; continue }
    const norm = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    const nameHit = name.length >= 6 && norm === name
    if (!nameHit) continue
    // The number and the date sit in the next few cells.
    const window = lines.slice(i + 1, i + 12).map(l => l.replace(/﻿/g, '').trim()).filter(Boolean)
    const numCell = window.find(c => /^\d{9}$/.test(c)) || null
    if (num && numCell && numCell !== num) continue
    const dateCell = window.find(c => /^\d{4}-\d{2}-\d{2}$/.test(c)) || null
    if (!heading) continue
    out.push({ kind: classifyGazetteSection(heading), date: dateCell, heading, issue: gazetteIssueFromUrl(url), url })
  }
  return out
}

/** Search the Gazette for the company (only called for an inactive registry row). Best-effort. */
export async function gazetteLookup(
  companyName: string,
  companyNumber: string | null | undefined,
  webSearch: ((q: string) => Promise<Array<{ title: string; snippet: string; link: string }>>) | undefined,
  webRead: ((url: string) => Promise<string>) | undefined,
): Promise<GazetteNotice[]> {
  if (!webSearch || !webRead) return []
  const bare = companyName.replace(/\.+$/, '').trim()
  let hits: Array<{ title: string; snippet: string; link: string }> = []
  try { hits = await webSearch(`"${bare}" Ontario Gazette corporations`) } catch { hits = [] }
  const num = padOntarioNumber(companyNumber)
  const urls = Array.from(new Set(hits
    .filter(h => /^https?:\/\/(?:www\.)?ontario\.ca\/document\/ontario-gazette-/i.test(h.link))
    .filter(h => !num || (h.snippet + h.title).includes(num) || new RegExp(bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(h.snippet + h.title))
    .map(h => h.link.replace(/^http:/, 'https:')))).slice(0, 4)
  const pages = await Promise.all(urls.map(async (u) => {
    // The issue's landing page lists the sections; the corporations section
    // is its own document. Read that one when the URL is the issue root.
    const target = /government-notices-respecting-corporations/i.test(u) ? u : `${u.replace(/\/$/, '')}/government-notices-respecting-corporations`
    try { return { url: target, text: await webRead(target) } } catch { return { url: target, text: '' } }
  }))
  const notices: GazetteNotice[] = []
  const seen = new Set<string>()
  for (const p of pages) {
    for (const n of parseGazettePage(p.text, p.url, companyName, companyNumber)) {
      const k = `${n.kind}|${n.date}`
      if (seen.has(k)) continue
      seen.add(k); notices.push(n)
    }
  }
  return notices.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
}

/** One line for the registry card: the last thing the Gazette says about the company. */
export function dissolutionReason(notices: Array<Pick<GazetteNotice, 'date' | 'url'> & { kind: string }> | null | undefined, zh: boolean): string | null {
  if (!notices?.length) return null
  const last = [...notices].reverse().find(n => n.kind !== 'other') || notices[notices.length - 1]
  const when = last.date ? `${last.date} ` : ''
  switch (last.kind) {
    case 'tax_default_cancellation': return zh ? `${when}因《公司税法》违约被注销（安省财政部通知、注册处注销公司证书）` : `${when}certificate cancelled — Corporations Tax Act defaulter (Minister of Finance notice, then cancellation by the Director)`
    case 'tax_default_notice': return zh ? `${when}安省财政部通知：未遵守《公司税法》（违约通知）` : `${when}Minister of Finance notice of default under the Corporations Tax Act`
    case 'cia_cancellation': return zh ? `${when}因未按《公司信息法》申报被注销` : `${when}certificate cancelled for non-compliance with the Corporations Information Act (returns not filed)`
    case 'cia_default_notice': return zh ? `${when}《公司信息法》违约通知（未申报）` : `${when}notice of default under the Corporations Information Act`
    case 'voluntary_dissolution': return zh ? `${when}自愿解散（解散证书）` : `${when}voluntary dissolution (certificate of dissolution)`
    case 'revival': return zh ? `${when}已复活（Gazette 复活通知）` : `${when}revived (Gazette revival notice)`
    default: return zh ? `${when}见 Ontario Gazette 公司通知` : `${when}see the Ontario Gazette corporate notices`
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
  gazette?: GazetteNotice[] | null
  today?: Date
}

export interface EmployerExtraResult {
  registry_status_kind: RegistryStatusKind
  employment_start: string | null
  stated_city: string | null
  domain_check: RdapResult[]
  personal_emails: string[]
  litigation: EmployerLitigation | null
  gazette: GazetteNotice[]
  dissolution_reason: string | null
  flags: ForensicFlag[]
}

export function employerExtraChecks(inp: EmployerExtraInput): EmployerExtraResult {
  const flags: ForensicFlag[] = []
  const kind = registryStatusKind(inp.company_status)
  const startD = extractEmploymentStartDetailed(inp.doc_text)
  const start = startD?.date ?? null
  const city = extractStatedCity(inp.doc_text)
  const { domains: docDomains, personal_emails } = extractEmployerDomains(inp.doc_text)
  const emp = inp.employer_name

  // A year printed as "20 I 5" in the text layer: a digit was retyped in a
  // font whose glyph maps to a letter — the trace of editing a PDF's text.
  if (/(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{0,2},?\s*|\b(?:since|scince|dated|on|from)\s+(?:\d{1,2}\s+)?(?:[a-z]{3,9}\s+)?)(?:\b(?:19|20)\s*[Il|]\s*\d\b|\b(?:19|20)\d\s*[Il|]\b)/i.test((inp.doc_text || '').replace(/\s+/g, ' '))) {
    flags.push({
      code: 'employer_letter_digit_glyph_artifact',
      severity: 'low',
      evidence_en: `A year in the employer's letter is encoded with a letter glyph in place of a digit (e.g. "20 I 5") in the PDF's text layer. That is what a date retyped over an existing PDF in a mismatched font looks like — consistent with the letter's dates having been edited.`,
      evidence_zh: `在职信的 PDF 文本层里，年份用字母字形代替了数字（如「20 I 5」）。这是在已有 PDF 上用不匹配字体重打日期留下的痕迹——与信件日期被改过的判断一致。`,
    })
  }

  if (kind === 'inactive') {
    flags.push({
      code: 'employer_registry_inactive',
      severity: 'critical',
      evidence_en: `The registry lists ${emp} as "${inp.company_status}"${inp.incorporation_date ? ` (incorporated ${inp.incorporation_date})` : ''}. An inactive or dissolved corporation cannot be issuing current pay stubs or an employment letter${start ? ` claiming employment since ${start}` : ''}. Either the documents are not genuine or the employer trades under another entity — ask for the CRA payroll account number (BN + RP) and a T4.`,
      evidence_zh: `注册库显示 ${emp} 状态为「${inp.company_status}」${inp.incorporation_date ? `（成立于 ${inp.incorporation_date}）` : ''}。已注销 / 非活跃的公司不可能出具当前的工资单和在职信${start ? `（信称自 ${start} 起受雇）` : ''}。要么文件不真实，要么雇主以另一实体经营——请索取 CRA 工资账户号（BN + RP）与 T4。`,
    })
  }

  const gazette = inp.gazette || []
  const cancel = gazette.find(g => g.kind === 'tax_default_cancellation') || gazette.find(g => g.kind === 'cia_cancellation') || gazette.find(g => g.kind === 'voluntary_dissolution')
  const taxNotice = gazette.find(g => g.kind === 'tax_default_notice')
  const revived = gazette.find(g => g.kind === 'revival' && (!cancel?.date || (g.date || '') > cancel.date))
  if (cancel && !revived) {
    const after = start && cancel.date && start > cancel.date
    const isTax = cancel.kind === 'tax_default_cancellation'
    flags.push({
      code: isTax ? 'employer_dissolved_tax_default' : cancel.kind === 'cia_cancellation' ? 'employer_dissolved_returns_not_filed' : 'employer_voluntarily_dissolved',
      severity: 'critical',
      evidence_en: isTax
        ? `The Ontario Gazette (${cancel.issue}) lists ${emp} under "${cancel.heading}"${cancel.date ? ` effective ${cancel.date}` : ''}${taxNotice?.date ? `, after a Minister of Finance notice of default dated ${taxNotice.date}` : ''}. The corporation was dissolved by the province for not complying with the Corporations Tax Act — a compliance default (returns / tax not filed or paid), not a conviction.${after ? ` The letter claims employment from ${start}, ${monthsBetween(cancel.date!, start)} months after the corporation ceased to exist.` : ''} No revival notice found.`
        : cancel.kind === 'cia_cancellation'
          ? `The Ontario Gazette (${cancel.issue}) lists ${emp} under "${cancel.heading}"${cancel.date ? ` effective ${cancel.date}` : ''}: the corporation was cancelled for not filing its Corporations Information Act returns.${after ? ` The letter claims employment from ${start}, after the cancellation.` : ''} No revival notice found.`
          : `The Ontario Gazette (${cancel.issue}) records a certificate of dissolution for ${emp}${cancel.date ? ` dated ${cancel.date}` : ''}: the owners wound the corporation up voluntarily.${after ? ` The letter claims employment from ${start}, after the dissolution.` : ''} No revival notice found.`,
      evidence_zh: isTax
        ? `Ontario Gazette（${cancel.issue}）把 ${emp} 列在「${cancel.heading}」之下${cancel.date ? `，生效日 ${cancel.date}` : ''}${taxNotice?.date ? `；此前 ${taxNotice.date} 安省财政部已发出《公司税法》违约通知` : ''}。即该公司因未遵守《公司税法》被省政府注销——这是税务合规违约（未申报 / 未缴），不是刑事定罪。${after ? `在职信却称 ${start} 起受雇，比公司注销晚 ${monthsBetween(cancel.date!, start)} 个月。` : ''}未见复活通知。`
        : cancel.kind === 'cia_cancellation'
          ? `Ontario Gazette（${cancel.issue}）把 ${emp} 列在「${cancel.heading}」之下${cancel.date ? `，生效日 ${cancel.date}` : ''}：因未按《公司信息法》申报被注销。${after ? `在职信却称 ${start} 起受雇，晚于注销日。` : ''}未见复活通知。`
          : `Ontario Gazette（${cancel.issue}）记录了 ${emp} 的解散证书${cancel.date ? `（${cancel.date}）` : ''}：股东自愿解散公司。${after ? `在职信却称 ${start} 起受雇，晚于解散日。` : ''}未见复活通知。`,
    })
  } else if (taxNotice && !revived) {
    flags.push({
      code: 'employer_tax_default_notice',
      severity: 'high',
      evidence_en: `The Ontario Gazette (${taxNotice.issue}) lists ${emp} under a Minister of Finance "notice of default in complying with the Corporations Tax Act"${taxNotice.date ? ` dated ${taxNotice.date}` : ''}. The cancellation that normally follows was not found — check the registry for the current status.`,
      evidence_zh: `Ontario Gazette（${taxNotice.issue}）把 ${emp} 列在安省财政部「未遵守《公司税法》违约通知」之下${taxNotice.date ? `（${taxNotice.date}）` : ''}。通常随后会有注销通知，本次未找到——请在注册库核对当前状态。`,
    })
  }

  if (start && startD && inp.incorporation_date && dateBefore(start, startD.precision, inp.incorporation_date)) {
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

  if (personal_emails.length && docDomains.length === 0) {
    flags.push({
      code: 'employer_contact_personal_email',
      severity: 'medium',
      evidence_en: `The only employer contact on the documents is a personal mailbox (${personal_emails.join(', ')}). A company that issues payroll normally verifies employment from its own domain; a personal address cannot be tied to the employer.`,
      evidence_zh: `文件上唯一的雇主联系方式是个人邮箱（${personal_emails.join('、')}）。发工资的公司通常用自己域名的邮箱核实雇佣；个人邮箱无法与雇主挂钩。`,
    })
  }

  const region = phoneRegion(inp.business_phone)
  if (region && city && phoneOutsideCity(inp.business_phone, city)) {
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

  return { registry_status_kind: kind, employment_start: start, stated_city: city, domain_check: inp.rdap || [], personal_emails, litigation: lit, gazette, dissolution_reason: dissolutionReason(gazette, false), flags }
}

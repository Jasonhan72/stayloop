// Cross-document residence timeline (2026-09-16, 6269 Ash St).
//
// The application said the applicant lived abroad 2016–2026 and was "moving
// back to Canada"; the bureau file showed a Canadian current address since
// 2022, cards opened 2021/2022/2026, rental-screening inquiries in 2025–2026
// and an Ontario licence issued 2022. Each fact was on the report; nothing
// connected them. These are pure functions over the facts the pipeline
// already extracts; they emit forensics-style flags so the rubric prices
// them as contradictions and the report lists them.

export interface ResidenceEntry { address: string; period: string; landlord_name?: string | null; landlord_phone?: string | null }
export interface FootprintEvent { date: string; kind: 'bureau_address' | 'account_opened' | 'rental_screening_inquiry' | 'licence_issued' | 'credit_inquiry'; label: string }
export interface TimelineFlag { code: string; severity: 'high' | 'medium' | 'low' | 'info'; evidence_en: string; evidence_zh: string }

const CA_POSTAL = /\b[A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z]\s?\d[A-CEGHJ-NPR-TV-Z]\d\b/i
const CA_PROVINCE = /\b(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU|Ontario|Quebec|Québec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|Prince Edward Island|Yukon|Nunavut|Canada)\b/i
const CA_CITY = /\b(Toronto|Ottawa|Mississauga|Brampton|Hamilton|London|Markham|Vaughan|Kitchener|Windsor|Richmond Hill|Oakville|Burlington|Oshawa|Barrie|St\.? Catharines|Cambridge|Kingston|Guelph|Whitby|Ajax|Pickering|Milton|Niagara Falls|Waterloo|Thunder Bay|Sudbury|Newmarket|Aurora|Scarborough|Etobicoke|North York|Montreal|Montréal|Laval|Vancouver|Surrey|Burnaby|Calgary|Edmonton|Winnipeg|Halifax|Regina|Saskatoon|Victoria)\b/i
export const RENTAL_SCREENING_CREDITORS = /\b(yardi|certn|singlekey|single key|naborly|rentcheck|rent check|openroom|frontlobby|front lobby|landlord credit bureau|lcb|rent ?panda|liv\.?rent|rentify|tenantverification|rentprep)\b/i

const CA_PROVINCE_FULL = /\b(Ontario|Quebec|Québec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|Prince Edward Island|Yukon|Nunavut|Canada)\b/i
const CA_PROVINCE_ABBR = /,\s*(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/
const FOREIGN_COUNTRY = /\b(USA|U\.S\.A?\.?|United States|United Kingdom|UK|England|Scotland|Wales|Ireland|France|Germany|Italy|Spain|Portugal|Netherlands|Belgium|Switzerland|Austria|Poland|Ukraine|Russia|Greece|Turkey|Israel|Iran|Iraq|Lebanon|Egypt|Nigeria|Ghana|Kenya|South Africa|India|Pakistan|Bangladesh|Sri Lanka|Nepal|China|Hong Kong|Taiwan|Japan|Korea|Philippines|Vietnam|Thailand|Malaysia|Singapore|Indonesia|Australia|New Zealand|Mexico|Brazil|Colombia|Peru|Chile|Argentina|Venezuela|Jamaica|Trinidad|Dubai|UAE|United Arab Emirates|Saudi Arabia|Qatar|Kuwait)\b/i
const AMBIGUOUS_CITY = /^(London|Kingston|Cambridge|Windsor|Hamilton|Victoria|Waterloo|Halifax|Surrey|Aurora|Milton|Burlington|Newmarket)$/i
const US_STATE_ZIP = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/
/** A Canadian address needs a positive marker: postal code, "Canada" / full
 *  province name, or a known city with a province abbreviation. A bare street
 *  ("6269 Ash St") is neither Canadian nor foreign (review 2026-09-16). */
export function looksCanadian(address: string): boolean {
  const a = address || ''
  if (FOREIGN_COUNTRY.test(a) && !/\bCanada\b/i.test(a)) return false
  if (CA_POSTAL.test(a) || CA_PROVINCE_FULL.test(a) || (CA_CITY.test(a) && CA_PROVINCE_ABBR.test(a))) return true
  // Review 2026-09-19: "55 Bloor St W, Toronto" is how most forms write a
  // Canadian address. A known Canadian city with no foreign marker of any
  // kind is Canadian — except the names that are better known abroad
  // (London, Kingston, Cambridge …), which still need a province / postcode.
  if (US_STATE_ZIP.test(a) || UK_POSTCODE.test(a)) return false
  const city = a.match(CA_CITY)
  return !!city && !AMBIGUOUS_CITY.test(city[0])
}
/** Positive evidence the address is outside Canada. */
export function looksForeign(address: string): boolean {
  const a = address || ''
  if (/\bCanada\b/i.test(a) || CA_POSTAL.test(a)) return false
  return FOREIGN_COUNTRY.test(a) || (US_STATE_ZIP.test(a) && !CA_PROVINCE_ABBR.test(a)) || UK_POSTCODE.test(a)
}

/** "2016 to 2026" / "2016-2026" / "Jan 2016 – present" / "2016" → [start, end] ISO dates */
export function parsePeriod(period: string | null | undefined, today = new Date()): { start: string; end: string } | null {
  // "Unit 2010, since 2016": unit / apt / suite numbers are not years.
  const p = (period || '').replace(/\b(?:unit|apt\.?|apartment|suite|ste\.?|#)\s*\d+\b/gi, ' ').trim()
  if (!p) return null
  const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
  const hits = [...p.matchAll(/(?:\b([A-Za-z]{3,9})\.?\s+)?\b((?:19|20)\d{2})\b/g)].map(m => ({ y: +m[2], mo: m[1] && MON[m[1].slice(0, 3).toLowerCase()] ? MON[m[1].slice(0, 3).toLowerCase()] : null }))
  if (hits.length === 0) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${hits[0].y}-${pad(hits[0].mo ?? 1)}-01`
  const nowY = today.getUTCFullYear()
  const endHit = hits.length >= 2 ? hits[1] : null
  const endY = endHit ? endHit.y : (/present|current|now|to date|至今/i.test(p) ? nowY : hits[0].y)
  const end = endY >= nowY ? today.toISOString().slice(0, 10) : (endHit?.mo ? `${endY}-${pad(endHit.mo)}-28` : `${endY}-12-31`)
  return { start, end }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length > 1)
/** Default self-name matcher: the shorter name's tokens are all in the longer
 *  one (Maria Garcia Lopez ≠ Jose Garcia Lopez). The route injects its own. */
function sameishName(a: string | null | undefined, b: string): boolean {
  const ta = norm(a || ''), tb = norm(b)
  if (ta.length < 2 || tb.length < 2) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return short.every(t => long.includes(t))
}

export function checkResidenceTimeline(args: {
  residences: ResidenceEntry[]
  vacating_reason?: string | null
  applicantNames: string[]
  footprint: FootprintEvent[]
  today?: Date
  /** the pipeline's own name matcher, so "self" means the same thing everywhere */
  isSelf?: (a: string, b: string) => boolean
}): TimelineFlag[] {
  const flags: TimelineFlag[] = []
  const today = args.today ?? new Date()
  const self = args.isSelf ?? ((a: string, b: string) => sameishName(a, b))

  // 1) The applicant names themselves as their own landlord: the reference
  //    cannot be called and the residence is self-attested.
  for (const r of args.residences) {
    if (r.landlord_name && args.applicantNames.some(n => self(r.landlord_name!, n))) {
      flags.push({
        code: 'cross_doc_landlord_is_applicant',
        severity: 'medium',
        evidence_en: `The application names "${r.landlord_name}" as the landlord of "${r.address}" (${r.period}) — that is the applicant. No prior-landlord reference exists for this residence; ask for an owner's proof (tax bill, deed) or another reference.`,
        evidence_zh: `申请表把「${r.address}」（${r.period}）的房东写成「${r.landlord_name}」——就是申请人本人。这段租史没有可致电的前房东；请索取产权证明（税单 / 地契）或其他参考人。`,
      })
    }
  }

  // 2) A long residence with no Canadian marker, while the bureau file /
  //    licence show the person active in Canada inside that same period.
  //    "Abroad" needs positive evidence (a foreign country / postcode) or the
  //    applicant's own words ("moving back to Canada") — a street-only
  //    transcription of a Canadian address is neither (review 2026-09-16).
  //    Review 2026-09-19: "relocating for work" / "immigrating" are what
  //    domestic movers and newcomers write — only an explicit return counts.
  const moving = /moving back|return(?:ing)? to canada|回加拿大|回国/i.test(args.vacating_reason || '')
  const abroad = args.residences.filter(r => r.address && !looksCanadian(r.address) && (looksForeign(r.address) || moving) && parsePeriod(r.period, today))
  const recentCutoff = new Date(today.getTime() - 60 * 86_400_000).toISOString().slice(0, 10)
  for (const r of abroad) {
    const p = parsePeriod(r.period, today)!
    const months = (Date.parse(p.end) - Date.parse(p.start)) / (30.44 * 86_400_000)
    if (months < 24) continue
    // One event per date (a tradeline's open month and the same month on
    // the coherence list are one fact), nothing from the last 60 days (that
    // is the report date), and at least two different kinds of evidence.
    const seenDates = new Set<string>()
    const inside = args.footprint.filter(e => e.date >= p.start && e.date <= p.end && e.date < recentCutoff && !seenDates.has(e.date) && seenDates.add(e.date))
    const kinds = new Set(inside.map(e => e.kind))
    if (inside.length >= 2 && kinds.size >= 2) {
      const list = inside.slice(0, 8).map(e => `${e.date} ${e.label}`).join('; ')
      flags.push({
        code: 'cross_doc_residence_timeline_contradiction',
        severity: 'high',
        evidence_en: `The application states the applicant lived at "${r.address}" from ${p.start.slice(0, 4)} to ${p.end.slice(0, 4)}${moving ? ` and is "${(args.vacating_reason || '').trim()}"` : ''} — an address with no Canadian province, city or postal code — yet the applicant's own Canadian records place them in Canada during that period: ${list}. A person cannot be a returning expatriate and an active Canadian resident at the same time; ask which is true and where they actually lived.`,
        evidence_zh: `申请表称申请人 ${p.start.slice(0, 4)} 至 ${p.end.slice(0, 4)} 住在「${r.address}」${moving ? `，并写明「${(args.vacating_reason || '').trim()}」` : ''}——该地址没有加拿大省份、城市或邮编——但申请人自己的加拿大记录显示同一期间人在加拿大：${list}。既是「即将回国」又是活跃的加拿大居民，两者不能同时成立；请问清实际居住地。`,
      })
    }
  }
  return flags
}

/** Build the footprint list from what the pipeline already has. */
export function footprintFromFacts(args: {
  tradelines?: Array<{ creditor: string; date_opened?: string | null }> | null
  inquiries?: Array<{ date: string; creditor: string; hard?: boolean | null }> | null
  bureauAddressDates?: Array<{ date: string; label: string }> | null
  licenceIssued?: string | null
}): FootprintEvent[] {
  const out: FootprintEvent[] = []
  const iso = (d: string | null | undefined) => {
    const m = (d || '').match(/((?:19|20)\d{2})[\/-](\d{2})(?:[\/-](\d{2}))?/)
    return m ? `${m[1]}-${m[2]}-${m[3] || '01'}` : null
  }
  for (const t of args.tradelines || []) { const d = iso(t.date_opened); if (d) out.push({ date: d, kind: 'account_opened', label: `${t.creditor} account opened` }) }
  for (const q of args.inquiries || []) {
    const d = iso(q.date); if (!d) continue
    if (RENTAL_SCREENING_CREDITORS.test(q.creditor)) out.push({ date: d, kind: 'rental_screening_inquiry', label: `rental-screening inquiry by ${q.creditor}` })
    else if (q.hard) out.push({ date: d, kind: 'credit_inquiry', label: `credit application inquiry by ${q.creditor}` })
  }
  for (const a of args.bureauAddressDates || []) { const d = iso(a.date); if (d) out.push({ date: d, kind: 'bureau_address', label: a.label }) }
  const li = iso(args.licenceIssued); if (li) out.push({ date: li, kind: 'licence_issued', label: 'Ontario licence issued' })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

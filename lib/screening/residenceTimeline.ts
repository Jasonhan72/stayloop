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

export function looksCanadian(address: string): boolean {
  const a = address || ''
  return CA_POSTAL.test(a) || CA_PROVINCE.test(a) || CA_CITY.test(a)
}

/** "2016 to 2026" / "2016-2026" / "Jan 2016 – present" / "2016" → [start, end] ISO dates */
export function parsePeriod(period: string | null | undefined, today = new Date()): { start: string; end: string } | null {
  const p = (period || '').trim()
  if (!p) return null
  const years = p.match(/(?:19|20)\d{2}/g)
  if (!years || years.length === 0) return null
  const start = `${years[0]}-01-01`
  const nowY = today.getUTCFullYear()
  const endY = years.length >= 2 ? +years[1] : (/present|current|now|to date|至今/i.test(p) ? nowY : +years[0])
  const end = endY >= nowY ? today.toISOString().slice(0, 10) : `${endY}-12-31`
  return { start, end }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length > 1)
function sameishName(a: string | null | undefined, b: string): boolean {
  const ta = norm(a || ''), tb = norm(b)
  if (ta.length < 2 || tb.length < 2) return false
  const overlap = ta.filter(t => tb.includes(t)).length
  return overlap >= 2 || (overlap >= 1 && ta.length === tb.length && ta.every(t => tb.includes(t)))
}

export function checkResidenceTimeline(args: {
  residences: ResidenceEntry[]
  vacating_reason?: string | null
  applicantNames: string[]
  footprint: FootprintEvent[]
  today?: Date
}): TimelineFlag[] {
  const flags: TimelineFlag[] = []
  const today = args.today ?? new Date()

  // 1) The applicant names themselves as their own landlord: the reference
  //    cannot be called and the residence is self-attested.
  for (const r of args.residences) {
    if (r.landlord_name && args.applicantNames.some(n => sameishName(r.landlord_name, n))) {
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
  const abroad = args.residences.filter(r => r.address && !looksCanadian(r.address) && parsePeriod(r.period, today))
  for (const r of abroad) {
    const p = parsePeriod(r.period, today)!
    const months = (Date.parse(p.end) - Date.parse(p.start)) / (30.44 * 86_400_000)
    if (months < 24) continue
    const inside = args.footprint.filter(e => e.date >= p.start && e.date <= p.end)
    const kinds = new Set(inside.map(e => e.kind))
    if (inside.length >= 2 && kinds.size >= 1) {
      const moving = /moving back|return(?:ing)? to canada|relocat|immigrat|回加拿大|回国/i.test(args.vacating_reason || '')
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

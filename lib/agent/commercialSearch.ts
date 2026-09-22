// Commercial / industrial / office / retail / land FOR LEASE on Realtor.ca —
// the tenant agent's "hidden skill" (2026-09-18). Not advertised in the UI
// chips; the model switches into it when the user asks for a warehouse, a
// storefront, an office, a sports facility, a studio… Stayloop's own
// inventory is residential only, so this path is Realtor.ca-only (via Jina).
//
// Two retrieval routes, both bounded:
//   1. LIST pages — `/on/<city>/commercial-space-for-lease` (and the office
//      variant). Jina renders ~11 rows per page. Rows carry price ($/Monthly
//      or $/sqft per YEAR), address, sometimes sqft — never the building type.
//   2. DETAIL pages via Jina search `site:realtor.ca/real-estate …`, fanned
//      out over the requested areas (or a default GTA set) — the only way to
//      hit specialised needs (industrial, ≥30,000 sqft, clear height). Detail
//      pages carry Property Type, Square Footage, Lease Type, the "Annual
//      Property Taxes" field (which lease listings use for TMI $/sqft) and the
//      description; we read at most DETAIL_READS of them, in parallel.
//
// Honesty rules baked in: a $/sqft asking rate is NET rent per year — the
// monthly figure we show is an estimate (rate × sqft ÷ 12), and the all-in
// figure adds the listing's own TMI when it prints one; specs (clear height,
// doors, parking, possession) are quoted from the listing text, never
// inferred; a listing that states an excluded use the tenant needs is kept
// but ranked last and flagged red, exactly as a broker's shortlist would.
// Pure parsers are exported for tests.
import type { ListingCard } from './types'
import type { ExternalStatus, SearchCriteria } from './listingSearch'

export type CommercialKind = 'commercial' | 'office' | 'retail' | 'industrial' | 'land'
const MAX_QUERIES = 16

const KIND_SET = new Set<string>(['commercial', 'office', 'retail', 'industrial', 'land'])

// Keyword fallback only fires on unmistakably commercial words — "健身房"
// alone is a condo amenity, "studio" alone is a bachelor apartment.
const KIND_KEYWORDS: [RegExp, CommercialKind][] = [
  [/厂房|仓库|工业(?:厂房|用地|单位|场地|物业|园)|物流(?:仓|园|中心)|\bwarehouse\b|industrial (?:space|unit|building|property|warehouse|condo|for lease)|logistics (?:space|facility)|manufacturing (?:space|facility)/i, 'industrial'],
  [/商铺|店面|店铺|零售(?:店|铺|空间|场地)|餐厅(?:位|铺|场地)|retail (?:space|unit|store|for lease)|storefront|restaurant space|shop space/i, 'retail'],
  [/写字楼|办公室(?:出租|租赁|场地|空间|单位)|办公空间|office (?:space|unit|suite|for lease)|coworking/i, 'office'],
  [/(?:商业|工业)?(?:土地|地块)(?:出租|租赁)?|\bland (?:for lease|lease|parcel)\b|vacant land|outside storage/i, 'land'],
  [/商业地产|商用|商业场地|商业空间|commercial (?:space|property|unit|lease|real estate|building)/i, 'commercial'],
]
// A home search that merely MENTIONS a commercial word ("hard loft,
// industrial style", "办公室附近的公寓", "house, big lot", "near Commercial
// Drive") must stay residential (review 2026-09-19).
const RESIDENTIAL_WORDS = /\b(?:house|home|condo|apartment|apt|loft|bedroom|bed|bdrm|basement|townhouse|studio|roommate)\b|公寓|住宅|卧室|居室|[一二两三四五1-5]\s*[居房室]|合租|地下室|独立屋|联排/i

// Which Realtor.ca lease family the criteria belong to, or null for the
// normal residential path. property_type wins; keywords are the fallback.
export function commercialKind(c: Pick<SearchCriteria, 'property_type' | 'keywords'> & { min_beds?: number | null }): CommercialKind | null {
  const t = (c.property_type || '').trim().toLowerCase()
  if (KIND_SET.has(t)) return t as CommercialKind
  if (t) return null // an explicit residential type never flips to commercial
  const kw = c.keywords || ''
  if (c.min_beds != null && c.min_beds > 0) return null
  if (RESIDENTIAL_WORDS.test(kw)) return null
  for (const [re, kind] of KIND_KEYWORDS) if (re.test(kw)) return kind
  return null
}

// ---------- Where on Realtor.ca ----------
// GTA municipalities that have their own `/on/<city>/…` pages. Anything
// else is treated as a Toronto district / neighbourhood (`/on/toronto/<slug>`).
const CITY_SLUGS = new Set([
  'toronto', 'mississauga', 'brampton', 'vaughan', 'markham', 'richmond-hill', 'oakville',
  'burlington', 'milton', 'pickering', 'ajax', 'whitby', 'oshawa', 'hamilton', 'newmarket',
  'aurora', 'king', 'caledon', 'halton-hills', 'whitchurch-stouffville', 'east-gwillimbury',
  'georgina', 'clarington', 'guelph', 'kitchener', 'waterloo', 'cambridge', 'barrie',
  'st-catharines', 'niagara-falls', 'london', 'ottawa', 'windsor', 'kingston',
])
const CITY_ALIASES: Record<string, string> = {
  密西沙加: 'mississauga', 万锦: 'markham', 萬錦: 'markham', 旺市: 'vaughan', 列治文山: 'richmond-hill',
  奥克维尔: 'oakville', 布兰普顿: 'brampton', 宾顿: 'brampton', 汉密尔顿: 'hamilton', 多伦多: 'toronto',
  北约克: 'north-york', 士嘉堡: 'scarborough', 怡陶碧谷: 'etobicoke', 大多伦多: 'greater-toronto-area',
  gta: 'greater-toronto-area', 'greater toronto': 'greater-toronto-area',
}
// A GTA-wide ask ("GTA 都行", no area at all) fans the detail search out over
// the employment-land municipalities a commercial broker would actually
// canvass. Order = rough inventory size.
export const DEFAULT_GTA_AREAS = ['Toronto', 'Vaughan', 'Mississauga', 'Markham', 'Richmond Hill', 'Brampton', 'Scarborough', 'Pickering']

export function slugify(name: string): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return /^[a-z0-9-]{2,60}$/.test(slug) ? slug : null
}

function isGtaWide(name: string): boolean {
  const l = name.toLowerCase()
  return /greater[- ]toronto|\bgta\b|大多伦多|大多|全 ?gta/.test(l)
}

// Base URL for an area label. The host is hardcoded and the slug is
// [a-z0-9-] only, so model text can never steer the fetch off-site.
export function resolveRealtorBase(area?: string | null, candidates?: string[] | null): string {
  const names = [area, ...(candidates ?? [])].map((s) => (s || '').trim()).filter(Boolean)
  for (const raw of names) {
    const lower = raw.toLowerCase()
    for (const [alias, slug] of Object.entries(CITY_ALIASES))
      if (lower.includes(alias.toLowerCase())) return slug === 'greater-toronto-area' ? `https://www.realtor.ca/on/${slug}` : CITY_SLUGS.has(slug) ? `https://www.realtor.ca/on/${slug}` : `https://www.realtor.ca/on/toronto/${slug}`
    const slug = slugify(raw.split(',')[0])
    if (!slug) continue
    const parent = SUBAREA_CITY[raw.split(',')[0].trim().toLowerCase()]
    if (parent) return `https://www.realtor.ca/on/${parent}`
    if (slug === 'greater-toronto-area') return 'https://www.realtor.ca/on/greater-toronto-area'
    if (CITY_SLUGS.has(slug)) return `https://www.realtor.ca/on/${slug}`
    return `https://www.realtor.ca/on/toronto/${slug}`
  }
  return 'https://www.realtor.ca/on/greater-toronto-area'
}

export function listPageUrls(base: string, kind: CommercialKind): string[] {
  const urls = [`${base}/commercial-space-for-lease`]
  if (kind === 'office') urls.unshift(`${base}/office-space-for-lease`)
  return urls
}

// "Markham/ Richmond Hill /Toronto" arrives as ONE area string when the
// model copies the user's phrasing — split it into the cities it names.
export function splitAreas(raw: (string | null | undefined)[]): string[] {
  return raw
    .flatMap((s) => (s || '').split(/\s*[\/、&;，,]\s*|\s+(?:and|or|和|或)\s+/i))
    .map((s) => s.trim().replace(/^(?:in|near)\s+/i, ''))
    // "Toronto, ON" must not leave "ON" behind — as an area it substring-
    // matched London, Brampton and Milton.
    .filter((s) => s.length > 2 && !/^(?:ont(?:ario)?|canada|安省|安大略省?|加拿大)$/i.test(s))
}

// The areas the detail search fans out over: the user's own areas (deduped,
// ≤8), or the default GTA set when the ask is GTA-wide / unlocated.
export function searchAreas(c: Pick<SearchCriteria, 'area' | 'area_candidates'>): string[] {
  const raw = splitAreas([c.area, ...(c.area_candidates ?? [])])
  const named = raw.filter((a) => !isGtaWide(a))
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of named) {
    const k = a.toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(a)
    }
  }
  if (!out.length) return DEFAULT_GTA_AREAS
  // "GTA + one named area" → the named area plus the default set.
  if (raw.some(isGtaWide)) for (const a of DEFAULT_GTA_AREAS) if (!seen.has(a.toLowerCase()) && out.length < 8) out.push(a)
  return out.slice(0, 8)
}

// ---------- Price normalisation ----------
export type PriceBasis = 'monthly' | 'psf_estimate' | 'unknown'

// Realtor.ca commercial asking rates are NET $/sqft per YEAR. Monthly ≈
// rate × area ÷ 12, excluding TMI — an estimate for ranking and budget
// filtering, labelled as such on the card.
export function monthlyFromRate(ratePsf: number, sqft: number | undefined): number | undefined {
  if (!ratePsf || !sqft) return undefined
  return Math.round((ratePsf * sqft) / 12)
}

// "0-699" → {min 0, max 699}; "700+" → {min 700}; "1750" → {min 1750, max 1750}
export function parseSqftRange(text: string): { min: number; max?: number } | undefined {
  const m = text.slice(0, 600).match(/([\d,]+)\s*(?:-\s*([\d,]+)|(\+))?\s*(?:square\s*feet|sq\.?\s*ft\.?|sqft|sf)\b/i)
  if (!m) return undefined
  const min = parseInt(m[1].replace(/,/g, ''), 10)
  if (!Number.isFinite(min)) return undefined
  if (m[2]) return { min, max: parseInt(m[2].replace(/,/g, ''), 10) }
  if (m[3]) return { min }
  return { min, max: min }
}

// ---------- Facts quoted from listing text ----------
export type CommercialFacts = {
  clearFt?: number
  truckDoors?: number
  driveInDoors?: number
  zoning?: string
  amps?: number
  parking?: number
  possession?: string
  sublease?: boolean
  subleaseUntil?: string
  esfr?: boolean
  sprinklers?: boolean
  officePct?: number
  freestanding?: boolean
  tmiPsfFromText?: number
  excludedUses: string[]
}

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?'
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 }
function wordNum(s: string): number {
  return WORD_NUM[s.toLowerCase()] ?? parseInt(s, 10)
}

export function extractFacts(text: string): CommercialFacts {
  const t = text.replace(/\s+/g, ' ')
  const f: CommercialFacts = { excludedUses: [] }
  // 17'8" clear → 17.7; "24 ft clear" / "clear height of 22'" → 24 / 22.
  // The number must carry a foot mark or unit so "clear height, 800 amps"
  // never reads as 80'.
  // A listing often states two heights — "office area with 9' ceilings …
  // warehouse offers 28' clear" — and the first one is the office. Collect
  // every figure, prefer the ones tied to the word CLEAR over CEILING, take
  // the largest; a left boundary keeps "5,000 ft clear span" from reading 0.
  const heights = (word: string): number[] => {
    const out: number[] = []
    const toFt = (ft: string, inch?: string) => Math.round((parseInt(ft, 10) + (inch ? parseInt(inch, 10) / 12 : 0)) * 10) / 10
    const pats = [
      new RegExp(`(?<![\\d,.])(\\d{1,2})\\s*(?:'|’|′)\\s*(\\d{1,2})\\s*(?:"|”|″)?\\s*${word}`, 'gi'),
      new RegExp(`(?<![\\d,.])(\\d{1,2}(?:\\.\\d)?)\\s*(?:'|’|′|ft\\.?|feet|foot|-foot)\\s*${word}`, 'gi'),
      new RegExp(`${word}\\s*(?:height|heights)?\\s*(?:of|is|at|to|up to|:|-|–|approx\\.?|approximately|ranging from)?\\s*(\\d{1,2})\\s*(?:'|’|′)\\s*(\\d{1,2})(?!\\d)`, 'gi'),
      new RegExp(`${word}\\s*(?:height|heights)\\s*(?:of|is|at|to|up to|:|-|–|approx\\.?|approximately|ranging from)?\\s*(\\d{1,2}(?:\\.\\d)?)(?!\\d)\\s*(?:'|’|′|ft\\.?|feet|foot)`, 'gi'),
    ]
    pats.forEach((re, i) => {
      for (const m of t.matchAll(re)) out.push(i === 0 || i === 2 ? toFt(m[1], m[2]) : parseFloat(m[1]))
    })
    return out.filter((n) => n >= 6 && n <= 80)
  }
  const clearHs = heights('clear')
  const anyHs = clearHs.length ? clearHs : heights('ceilings?')
  if (anyHs.length) f.clearFt = Math.max(...anyHs)
  const truck = t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:truck[- ]level|tl)\s*(?:shipping\s*)?doors?/i)
  if (truck) f.truckDoors = wordNum(truck[1])
  const drive = t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:drive[- ]in)\s*(?:shipping\s*)?doors?/i)
  if (drive) f.driveInDoors = wordNum(drive[1])
  const zoning =
    t.match(/[Zz]oning(?: [Dd]escription)?:?\s*([A-Z]{1,3}\d{0,2}(?:[-.]\d+)?)\b/) ||
    t.match(/\b[Zz]oned\s+([A-Z]{1,3}\s?\d{0,2}(?:[-.]\d+)?)\b/)
  if (zoning) f.zoning = zoning[1].replace(/\s+/g, ' ').trim()
  const power = t.match(/(\d{2,4})\s*(?:amps?|a)\b[^.]{0,20}(?:power|service|electrical)/i) || t.match(/(?:power|service)[^.]{0,20}?(\d{3,4})\s*amps?/i)
  if (power) f.amps = parseInt(power[1], 10)
  const parking = t.match(/Total Parking Spaces\s*(\d+)/i) || t.match(/(\d{1,4})\s+(?:marked\s+|surface\s+|dedicated\s+|on-site\s+)?parking\s+(?:spaces|spots|stalls)/i)
  if (parking) f.parking = parseInt(parking[1], 10)
  if (/immediate(?:ly)?\s+(?:possession|available|occupancy)|available\s+immediately|possession:?\s*immediate|possession\s+available\s+immediately/i.test(t)) f.possession = 'immediate'
  else {
    const poss = t.match(new RegExp(`(?:possession|available|occupancy)[^.]{0,25}?((?:Q[1-4]\\s+20\\d\\d)|(?:${MONTH}\\s+(?:\\d{1,2},?\\s+)?20\\d\\d)|20\\d\\d)`, 'i'))
    if (poss) f.possession = poss[1]
  }
  if (/\bsub-?lease|\bsublet\b/i.test(t)) {
    f.sublease = true
    const until = t.match(new RegExp(`(?:sublease|sublet|term)[^.]{0,60}?(?:through|until|to|expir\\w*|ending)\\s+(${MONTH}\\s+(?:\\d{1,2},?\\s+)?20\\d\\d|20\\d\\d)`, 'i'))
    if (until) f.subleaseUntil = until[1]
  }
  if (/\bESFR\b/i.test(t)) f.esfr = true
  if (/sprinkler/i.test(t)) f.sprinklers = true
  const office = t.match(/(\d{1,2})\s*%\s*(?:office|showroom)/i)
  if (office) f.officePct = parseInt(office[1], 10)
  if (/free-?standing|stand-?alone building/i.test(t)) f.freestanding = true
  // "TMI $4.50 psf" yes; "TMI: $12,000 per year" is a dollar total, not a rate.
  const tmi =
    t.match(/\bTMI\b[^0-9$]{0,20}\$?\s*(\d{1,2}(?:\.\d{1,2})?)(?![\d,])/i) ||
    t.match(/additional rent[^0-9$]{0,20}\$?\s*(\d{1,2}(?:\.\d{1,2})?)(?![\d,])/i)
  if (tmi && parseFloat(tmi[1]) <= 40 && !/per (?:year|month|annum)|\/\s*(?:yr|year|month|mo)\b/i.test(t.slice(tmi.index ?? 0, (tmi.index ?? 0) + tmi[0].length + 20).replace(/psf|per sq|\/ ?sq/gi, ''))) {
    f.tmiPsfFromText = parseFloat(tmi[1])
  }
  // "No Recreational Uses." / "No food uses" / "not suitable for automotive"
  // Lists ("No automotive, recreational or food uses"), passive forms
  // ("Recreational uses not permitted", "will not permit sports uses") — and
  // never prose like "no better location for recreational uses".
  const ex = t.matchAll(
    /\bno\s+([a-z ,/&-]{3,60}?)\s+uses?\b|\bnot\s+(?:suitable|permitted|allowed)\s+for\s+([a-z ,/&-]{3,60}?)(?:[.;]|$)|([a-z ,/&-]{3,60}?)\s+uses?\s+(?:are\s+|is\s+)?not\s+(?:permitted|allowed)|will\s+not\s+permit\s+([a-z ,/&-]{3,60}?)\s+uses?\b/gi,
  )
  for (const m of ex) {
    const phrase = (m[1] || m[2] || m[3] || m[4] || '').trim().replace(/^(?:and|the|any)\s+/i, '')
    if (!phrase) continue
    if (/^(?:other|additional|further)$/i.test(phrase)) continue
    if (/\b(?:better|matter|location|shortage|limit|end|doubt|need)\b/i.test(phrase)) continue
    f.excludedUses.push(phrase)
  }
  return f
}

// Spec pills (Chinese labels where the concept has one; English terms stay).
export function factsToSpecs(f: CommercialFacts, leaseType?: string, en = false): string[] {
  const out: string[] = []
  if (f.clearFt != null) out.push(en ? `${f.clearFt}' clear` : `净高 ${f.clearFt}'`)
  if (f.truckDoors) out.push(`${f.truckDoors} truck-level`)
  if (f.driveInDoors) out.push(`${f.driveInDoors} drive-in`)
  if (f.zoning) out.push(`Zoning ${f.zoning}`)
  if (f.amps) out.push(`${f.amps}A`)
  if (f.parking) out.push(en ? `${f.parking} parking` : `${f.parking} 车位`)
  if (f.esfr) out.push('ESFR')
  else if (f.sprinklers) out.push(en ? 'Sprinklered' : '喷淋')
  if (f.officePct) out.push(en ? `${f.officePct}% office` : `${f.officePct}% 办公`)
  if (f.freestanding) out.push(en ? 'Freestanding' : '独立物业')
  if (f.possession) out.push(f.possession === 'immediate' ? (en ? 'Immediate' : '即可入驻') : en ? `Possession ${f.possession}` : `交付 ${f.possession}`)
  if (f.sublease) out.push(f.subleaseUntil ? (en ? `Sublease to ${f.subleaseUntil}` : `转租至 ${f.subleaseUntil}`) : en ? 'Sublease' : '转租')
  if (leaseType) out.push(`${leaseType} lease`)
  return out
}

// Legacy shim used by tests / callers: just the pill strings.
export function extractSpecs(text: string): string[] {
  return factsToSpecs(extractFacts(text))
}

// ---------- Intended use vs. stated exclusions ----------
// The tenant's use (from `use` / keywords) mapped to the categories brokers
// exclude in listing text. "No Recreational Uses" kills a pickleball venue.
const USE_CATEGORIES: [RegExp, RegExp, string, string][] = [
  // [what the tenant said, what the listing excludes, label]
  // English tenant words carry \b — "daycare" must not hit /car/, "automation
  // lab" must not hit /auto/, "food court kiosk" must not hit /court/.
  [/\b(?:pickleball|badminton|basketball|volleyball|tennis|sports?|gym|fitness|recreation(?:al)?|arena|trampoline|climbing|yoga|dance|martial|boxing|athletic)\b|球馆|体育|运动|健身|球场/i, /recreation|sport|fitness|gym|athletic|entertainment|amusement/i, '娱乐 / 体育用途', 'recreation / sports'],
  [/\b(?:restaurant|cafe|café|food|kitchen|bakery|catering)\b|餐厅|餐饮|食品|厨房/i, /food|restaurant|cooking|kitchen/i, '餐饮用途', 'food'],
  [/\b(?:auto(?:motive)?|cars?|mechanic|body shop|vehicles?)\b|汽车|修车/i, /automotive|\bauto\b|vehicle|mechanic/i, '汽车用途', 'automotive'],
  [/\b(?:church|worship|temple|mosque)\b|教会|宗教/i, /worship|church|religious/i, '宗教用途', 'place of worship'],
  [/\b(?:school|daycare|tutoring)\b|学校|托儿|教育/i, /school|daycare|educational|children/i, '教育 / 托儿用途', 'school / daycare'],
  [/\b(?:cannabis|dispensary)\b|大麻/i, /cannabis|marijuana/i, '大麻', 'cannabis'],
  [/\b(?:retail|store|shop)\b|零售|店/i, /retail/i, '零售用途', 'retail'],
]

export function useProhibited(excluded: string[], use?: string | null): string | null {
  return prohibitedUseBoth(excluded, use)?.zh ?? null
}
export function prohibitedUseBoth(excluded: string[], use?: string | null): { zh: string; en: string } | null {
  if (!excluded.length || !use) return null
  for (const [tenantRe, listingRe, zh, en] of USE_CATEGORIES) {
    if (!tenantRe.test(use)) continue
    if (excluded.some((e) => listingRe.test(e))) return { zh, en }
  }
  return null
}

// ---------- LIST page rows ----------
// A Jina row:  `[![Image](cdn…jpg) MLS®: E13799758 $3,900/Monthly 1958-1960
// DANFORTH AVENUE, Toronto (Danforth), Ontario ![bath] 2 Bathrooms ![sqft]
// 1750 Square Feet RE/MAX …, Brokerage](https://www.realtor.ca/real-estate/…)`
// or `… $35/sqft 4 - 735 WARDEN AVENUE, Toronto (Clairlea-Birchmount), Ontario
// JONES LANG LASALLE …, Brokerage](…)` (no icons when no sqft/baths).
export function parseCommercialList(md: string, _kind: CommercialKind): ListingCard[] {
  const out: ListingCard[] = []
  for (const line of md.split('\n')) {
    if (!/realtor\.ca\/real-estate\//.test(line)) continue
    const priceM = line.match(/\$([\d,]+(?:\.\d+)?)\s*\/\s*(Monthly|Month|sqft|square\s*feet)/i)
    if (!priceM) continue
    const perSqft = /sqft|square/i.test(priceM[2])
    const amount = parseFloat(priceM[1].replace(/,/g, ''))
    if (isPlaceholderPrice(amount, perSqft)) continue
    const url = line.match(/\]\((https:\/\/www\.realtor\.ca\/real-estate\/[^)]+)\)/)?.[1]
    const image = line.match(/(https:\/\/cdn\.realtor\.ca\/listings\/[^)\s]+\.jpg)/)?.[1]
    const addrM = line.match(/\/(?:Monthly|Month|sqft|square\s*feet)\s+(.+?,\s*Ontario)\b/i)
    if (!addrM) continue
    const loc = splitAddress(addrM[1])
    const sq = parseSqftRange(line.slice(line.indexOf(addrM[1]) + addrM[1].length))
    const sqft = sq ? sq.max ?? sq.min : undefined
    const mls = line.match(/MLS®?:?\s*([A-Z]\d{6,9})/)?.[1]
    // List rows never print the building type — label them as generic
    // commercial space rather than echoing the type the user asked for.
    out.push(
      buildCard({
        id: url ? url.split('/').slice(-2, -1)[0] || `c-${out.length}` : `c-${out.length}`,
        url,
        image,
        ...loc,
        kind: 'commercial',
        propertyType: undefined,
        perSqft,
        amount,
        sqft,
        sqftMin: sq?.min,
        sqftMax: sq?.max,
        facts: { excludedUses: [] },
        mls,
      }),
    )
    if (out.length >= 40) break
  }
  return out
}

// ---------- DETAIL page ----------
export function parseCommercialDetail(md: string, url: string, kindHint: CommercialKind): ListingCard | null {
  const priceM = md.match(/\$([\d,]+(?:\.\d+)?)\s*\/\s*(square\s*feet|sqft|Monthly|Month)\b/i)
  // Realtor.ca renders the address as H1 on most pages and as H2 on some
  // (older DDF layouts) — accept both.
  const h1M = md.match(/^#{1,2}\s+([^\n]+?)\s*$/m)
  const h1 = h1M?.[1]?.trim()
  if (!h1 || !h1M) return null
  // Expired listings render an H1 apology instead of an address.
  if (/no longer exists|not found|can't find|cannot find|sorry/i.test(h1) || !/\d/.test(h1)) return null
  // The line after the H1 is "Toronto (West Humber-Clairville), Ontario M9W5N4".
  // Realtor.ca is national — a Coldstream, British Columbia hit for a
  // "Toronto" query is dropped here rather than shown with no city.
  // Only the few lines after the address matter — and a bounded slice keeps
  // the [^\n]* scan linear on pages with long blank runs.
  // (Anchored on the heading itself — the address also appears in the page
  // title and the map-pin line above it.)
  const h1End = (h1M.index ?? 0) + h1M[0].length
  const tail = md.slice(h1End, h1End + 400)
  const prov = tail.match(/\n\s*[^\n]*,\s*(Ontario|British Columbia|Alberta|Quebec|Québec|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland and Labrador|Prince Edward Island|Yukon|Northwest Territories|Nunavut)\b/)?.[1]
  if (prov && prov !== 'Ontario') return null
  const after = tail.match(/\n\s*([^\n]+?,\s*Ontario[^\n]*)/)?.[1] || ''
  const loc = splitAddress(`${h1}, ${after}`)
  const propertyType = md.match(/Property Type\s*\n\s*([A-Za-z][A-Za-z /-]{2,40})/)?.[1]?.trim()
  // A FOR-SALE page prints "$12,500,000" with no /sqft or /Monthly unit, and
  // a residential rental prints "Single Family" — neither is a commercial
  // lease, and both used to come back as perfect "price on request" matches
  // (review 2026-09-19). Placeholder asks still print "$1/sqft", so a lease
  // listing always has a unit-bearing price.
  if (!priceM) return null
  if (propertyType && /single family|multi-?family|residential|vacant land residential/i.test(propertyType)) return null
  const subtype = md.match(/^\s*(?:Industrial|Retail|Office|Commercial|Land)\s*\(([^)]+)\)\s*$/m)?.[1]?.trim()
  const sqM = md.match(/Square Footage[^\n]*\n\s*([\d,]+)\s*(?:sqft|sq\.? ?ft|square feet)/i)
  const sqft = sqM ? parseInt(sqM[1].replace(/,/g, ''), 10) : undefined
  const leaseType = md.match(/Lease Type\s*\n\s*([A-Za-z ]{2,20})\s*\n/)?.[1]?.trim()
  const descM = md.match(/## Listing Description\s*\n([\s\S]*?)(?:\n## |\n\* \* \*|$)/)
  const desc = (descM?.[1] || '').replace(/\s+/g, ' ').trim()
  const image = md.match(/(https:\/\/cdn\.realtor\.ca\/listings\/[^)\s]+\.jpg)/)?.[1]
  const mls = md.match(/MLS®?\s*Number:?\s*([A-Z]\d{6,9})/)?.[1]
  const brokerage = md.match(/\[([^\]\n]{3,80}?)\s+Brokerage\b[^\]]*\]\(https:\/\/www\.realtor\.ca\/office\//)?.[1]?.trim()
  const parkingField = md.match(/Total Parking Spaces\s*\n\s*(\d+)/)?.[1]
  // Lease listings put TMI ($/sqft/yr) in the "Annual Property Taxes" field;
  // a real tax bill would be thousands, so only a small number is TMI.
  const taxM = md.match(/Annual Property Taxes\s*\n\s*\$([\d,]+(?:\.\d+)?)/)
  const taxVal = taxM ? parseFloat(taxM[1].replace(/,/g, '')) : undefined
  const facts = extractFacts(`${desc} ${md.match(/Zoning Description\s*\n\s*([^\n]+)/)?.[0] || ''}`)
  if (parkingField) facts.parking = parseInt(parkingField, 10)
  const tmiPsf = taxVal != null && taxVal > 0 && taxVal <= 60 ? taxVal : facts.tmiPsfFromText
  const rawAmount = priceM ? parseFloat(priceM[1].replace(/,/g, '')) : 0
  const perSqft = !!priceM && /sqft|square/i.test(priceM[2])
  // "$1/sqft" and "$1/Monthly" are the broker's placeholder for "call for
  // pricing" — never a rate to multiply.
  const amount = isPlaceholderPrice(rawAmount, perSqft) ? 0 : rawAmount
  const typeLabel = propertyType && subtype ? `${propertyType} (${subtype})` : propertyType
  const kind = kindFromType(propertyType) || kindHint
  return buildCard({
    id: url.split('/').slice(-2, -1)[0] || url,
    url,
    image,
    ...loc,
    kind,
    propertyType: typeLabel,
    perSqft,
    amount,
    sqft,
    sqftMin: sqft,
    sqftMax: sqft,
    facts,
    leaseType,
    tmiPsf,
    mls,
    brokerage,
    description: desc.slice(0, 400),
  })
}

// "$1/sqft" / "$1/Monthly" = call for pricing. Genuine land and outside-
// storage leases do run $1.50–$3/sqft, so only ≤ $1 counts as a placeholder.
export function isPlaceholderPrice(amount: number, perSqft: boolean): boolean {
  return !amount || (perSqft ? amount <= 1 : amount < 100)
}

function kindFromType(t?: string): CommercialKind | null {
  if (!t) return null
  const l = t.toLowerCase()
  if (l.includes('industrial')) return 'industrial'
  if (l.includes('retail')) return 'retail'
  if (l.includes('office')) return 'office'
  if (l.includes('land') || l.includes('vacant')) return 'land'
  return 'commercial'
}

function splitAddress(full: string): { address: string; neighborhood?: string; city?: string } {
  const parts = full.split(',').map((s) => s.trim())
  const address = parts[0] || full
  const cityPart = parts[1] || ''
  const neighborhood = cityPart.match(/\(([^)]+)\)/)?.[1]
  const city = cityPart.replace(/\s*\([^)]*\)\s*/, '').trim() || undefined
  return { address, neighborhood, city }
}

function buildCard(x: {
  id: string
  url?: string
  image?: string
  address: string
  neighborhood?: string
  city?: string
  kind: CommercialKind
  propertyType?: string
  perSqft: boolean
  amount: number
  sqft?: number
  sqftMin?: number
  sqftMax?: number
  facts: CommercialFacts
  leaseType?: string
  tmiPsf?: number
  mls?: string
  brokerage?: string
  description?: string
}): ListingCard {
  const ratePsf = x.perSqft && x.amount ? x.amount : undefined
  const monthly = x.perSqft ? monthlyFromRate(x.amount, x.sqft) : x.amount ? Math.round(x.amount) : undefined
  const basis: PriceBasis = x.perSqft ? (monthly ? 'psf_estimate' : 'unknown') : x.amount ? 'monthly' : 'unknown'
  const gross = /gross/i.test(x.leaseType || '')
  // All-in = (net rate + TMI) × sqft; gross leases already include TMI.
  const tmi = gross ? 0 : x.tmiPsf
  // A MONTHLY net ask with a listed TMI: the TMI is still $/sqft/yr on top
  // ($10,000/mo + $5 × 10,000 sqft = $170,000, not $120,000).
  const annual =
    x.perSqft && x.amount && x.sqft
      ? Math.round((x.amount + (tmi ?? 0)) * x.sqft)
      : !x.perSqft && x.amount
        ? Math.round(x.amount * 12 + (tmi && x.sqft ? tmi * x.sqft : 0))
        : undefined
  // The annual figure is ALL-IN only when TMI is actually inside it.
  const allIn = annual != null && (gross || (tmi != null && tmi > 0 && !!x.sqft) || (tmi === 0))
  const typeZh: Record<CommercialKind, string> = {
    commercial: '商业空间', office: '办公', retail: '零售 / 店面', industrial: '工业 / 仓库', land: '土地',
  }
  const typeEn: Record<CommercialKind, string> = {
    commercial: 'Commercial space', office: 'Office', retail: 'Retail', industrial: 'Industrial', land: 'Land',
  }
  const sqftLabel = x.sqftMin != null && x.sqftMax != null && x.sqftMin !== x.sqftMax
    ? `${x.sqftMin.toLocaleString()}–${x.sqftMax.toLocaleString()} sqft`
    : x.sqftMin != null && x.sqftMax == null
      ? `${x.sqftMin.toLocaleString()}+ sqft`
      : x.sqft
        ? `${x.sqft.toLocaleString()} sqft`
        : null
  return {
    id: x.id,
    source: 'realtor',
    kind: 'commercial',
    property_type: x.propertyType || typeZh[x.kind],
    property_type_en: x.propertyType || typeEn[x.kind],
    title: [x.propertyType || typeZh[x.kind], sqftLabel].filter(Boolean).join(' · '),
    address: x.address,
    neighborhood: x.neighborhood,
    city: x.city,
    price: monthly ?? 0,
    price_basis: basis,
    rate_psf: ratePsf,
    tmi_psf: tmi != null && tmi > 0 ? tmi : gross ? 0 : undefined,
    lease_type: x.leaseType,
    annual_cost: annual,
    annual_all_in: allIn,
    monthly_all_in: allIn && annual != null ? Math.round(annual / 12) : undefined,
    beds: 0,
    sqft: x.sqft,
    sqft_min: x.sqftMin,
    sqft_max: x.sqftMax,
    clear_ft: x.facts.clearFt,
    zoning: x.facts.zoning,
    possession: x.facts.possession,
    sublease: x.facts.sublease,
    excluded_uses: x.facts.excludedUses.length ? x.facts.excludedUses : undefined,
    specs: (() => {
      const s = factsToSpecs(x.facts, x.leaseType)
      return s.length ? s : undefined
    })(),
    specs_en: (() => {
      const s = factsToSpecs(x.facts, x.leaseType, true)
      return s.length ? s : undefined
    })(),
    note_en: !x.amount
      ? 'External listing · Realtor.ca live · asking rate not published'
      : x.perSqft
        ? tmi != null && tmi > 0
          ? `External listing · Realtor.ca live · net $${x.amount}/sqft/yr + TMI $${tmi}/sqft/yr (as listed); all-in monthly is an estimate`
          : gross
            ? 'External listing · Realtor.ca live · gross (all-in) ask; monthly is an estimate'
            : 'External listing · Realtor.ca live · net $/sqft/yr ask; monthly is an estimate excluding TMI'
        : 'External listing · Realtor.ca live · not verified by Stayloop',
    mls: x.mls,
    brokerage: x.brokerage,
    description: x.description,
    image: x.image,
    url: x.url,
    note: !x.amount
      ? '外部房源 · Realtor.ca 实时 · 挂牌未公开报价（面议）'
      : x.perSqft
      ? tmi != null && tmi > 0
        ? `外部房源 · Realtor.ca 实时 · 净租 $${x.amount}/sqft/年 + TMI $${tmi}/sqft/年（挂牌自报），全包月租为估算`
        : gross
          ? '外部房源 · Realtor.ca 实时 · 全包（gross）报价，月租为估算'
          : '外部房源 · Realtor.ca 实时 · 报价为净租金 $/sqft/年，月租为估算、不含 TMI'
      : '外部房源 · Realtor.ca 实时 · 未经 Stayloop 验证',
  }
}

// ---------- Filter + rank against the tenant's requirements ----------
export type CommercialNeed = Pick<SearchCriteria, 'min_sqft' | 'max_sqft' | 'max_price' | 'min_clear_ft' | 'use' | 'keywords'>

// Attaches the red-flag pills and returns the fit tier:
//   0 = every stated requirement met; 1 = a soft miss (clear height unstated,
//   area 70–90% of the ask); 2 = far too big / over budget; 3 = area unknown
//   on a sized search; 4 = clear height short; 5 = the tenant's use is
//   excluded by the listing. Units far outside the size band (>4× the ask
//   with no mention of demising, or <70%) are dropped.
export function assessFit(l: ListingCard, need: CommercialNeed): { tier: number; warn: string[]; warnEn: string[]; codes: string[]; drop: boolean } {
  const minSq = need.min_sqft && need.min_sqft > 0 ? need.min_sqft : null
  const maxSq = need.max_sqft && need.max_sqft > 0 ? need.max_sqft : minSq ? minSq * 2 : null
  const minClear = need.min_clear_ft && need.min_clear_ft > 0 ? need.min_clear_ft : null
  const use = need.use || need.keywords || null
  // "700+ sqft" list rows are open-ended: the printed floor is not the area.
  const openRange = l.sqft_max == null && l.sqft_min != null
  const area = openRange ? undefined : l.sqft_max ?? l.sqft ?? l.sqft_min
  const warn: string[] = []
  const warnEn: string[] = []
  const codes: string[] = []
  const flag = (code: string, zh: string, en: string) => {
    codes.push(code)
    warn.push(zh)
    warnEn.push(en)
  }
  let tier = 0
  let drop = false
  if (minSq) {
    if (area == null) {
      // No printed area but a monthly rent implying <$5/sqft/yr at the asked
      // size — nothing leases that cheaply, so it is far smaller than asked.
      if (l.price_basis === 'monthly' && (l.price * 12) / minSq < 5) drop = true
      else tier = Math.max(tier, 3)
    } else if (area < minSq * 0.5) {
      drop = true
    } else if (area < minSq * 0.9) {
      flag('area_small', `面积偏小 ${area.toLocaleString()}`, `Smaller than asked · ${area.toLocaleString()}`)
      tier = Math.max(tier, 1)
    } else if (maxSq && area > maxSq * 2 && !/demis|divisible|can be divided|split|partial/i.test(l.description || '')) {
      drop = true
    } else if (maxSq && area > maxSq) {
      flag('area_large', '面积远超需求', 'Far larger than asked')
      tier = Math.max(tier, 2)
    }
  } else if (maxSq && area != null && area > maxSq) {
    flag('area_large', '面积超出上限', 'Over the size limit')
    tier = Math.max(tier, 2)
  }
  if (minClear) {
    if (l.clear_ft == null) tier = Math.max(tier, 1)
    else if (l.clear_ft < minClear) {
      flag('clear_short', `净高 ${l.clear_ft}' 不足`, `${l.clear_ft}' clear — below ${minClear}'`)
      tier = Math.max(tier, 4)
    }
  }
  const prohibited = prohibitedUseBoth(l.excluded_uses || [], use)
  if (prohibited) {
    flag('use_excluded', `房东明写禁止${prohibited.zh}`, `Listing excludes ${prohibited.en} uses`)
    tier = 5
  }
  if (need.max_price && need.max_price > 0) {
    const m = l.monthly_all_in ?? (l.price_basis !== 'unknown' ? l.price : undefined)
    if (m != null && m > need.max_price) {
      flag('over_budget', '超预算', 'Over budget')
      tier = Math.max(tier, 2)
    }
  }
  return { tier, warn, warnEn, codes, drop }
}

export function rankCommercial(cards: ListingCard[], need: CommercialNeed): ListingCard[] {
  const minSq = need.min_sqft && need.min_sqft > 0 ? need.min_sqft : null
  const scored = cards
    .map((l) => {
      const fit = assessFit(l, need)
      return { l: { ...l, specs_warn: fit.warn.length ? fit.warn : undefined, specs_warn_en: fit.warnEn.length ? fit.warnEn : undefined, warn_codes: fit.codes.length ? fit.codes : undefined, fit_tier: fit.tier }, fit }
    })
    .filter((x) => !x.fit.drop)
  const key = (x: { l: ListingCard }) => {
    const area = x.l.sqft_max ?? x.l.sqft ?? x.l.sqft_min
    if (minSq) return area == null ? Number.MAX_SAFE_INTEGER / 2 : Math.abs(area - minSq)
    // No size asked: detail pages (area + specs known) before bare list rows,
    // then by monthly cost.
    const base = area == null ? Number.MAX_SAFE_INTEGER / 4 : 0
    return base + (x.l.price_basis === 'unknown' ? Number.MAX_SAFE_INTEGER / 8 : x.l.monthly_all_in ?? x.l.price)
  }
  const ranked = scored.sort((a, b) => a.fit.tier - b.fit.tier || key(a) - key(b)).map((x) => x.l)
  // On a sized search, rows with no printed area (generic list-page rows)
  // are noise once there are enough sized candidates to compare.
  if (minSq && ranked.filter((l) => (l.fit_tier ?? 0) <= 2).length >= 3) return ranked.filter((l) => l.fit_tier !== 3)
  // Never hand back an empty screen while real pages were parsed: show the
  // closest sizes, flagged, so the tenant sees what the market has.
  if (!ranked.length && cards.length && minSq) {
    const byArea = (l: ListingCard) => l.sqft_max ?? l.sqft ?? l.sqft_min
    return cards
      .filter((l) => byArea(l) != null)
      .sort((a, b) => Math.abs((byArea(a) as number) - minSq) - Math.abs((byArea(b) as number) - minSq))
      .slice(0, 6)
      .map((l) => {
        const a = byArea(l) as number
        const small = a < minSq
        return {
          ...l,
          fit_tier: 2,
          specs_warn: [small ? `面积偏小 ${a.toLocaleString()}` : '面积远超需求'],
          specs_warn_en: [small ? `Smaller than asked · ${a.toLocaleString()}` : 'Far larger than asked'],
          warn_codes: [small ? 'area_small' : 'area_large'],
        }
      })
  }
  return ranked
}

// Deterministic one-paragraph digest appended to the reply — the model
// answered before the search ran, so this is the only place the numbers
// the tenant asked about (size band, clear heights, all-in cost, exclusions)
// can be stated truthfully.
export function summarizeCommercial(cards: ListingCard[], need: CommercialNeed, zh: boolean, checked = 0): string {
  if (!cards.length) return ''
  const cities = Array.from(new Set(cards.map((l) => l.city).filter((c): c is string => !!c)))
  const areas = cards.map((l) => l.sqft).filter((n): n is number => !!n)
  const clears = cards.map((l) => l.clear_ft).filter((n): n is number => n != null)
  const minClear = need.min_clear_ft && need.min_clear_ft > 0 ? need.min_clear_ft : null
  const clearOk = minClear ? clears.filter((c) => c >= minClear).length : 0
  // Cost range over the viable rows only (not the 166k-sqft full building
  // ranked at the bottom) and only where the listing printed a TMI.
  const costs = cards.filter((l) => (l.fit_tier ?? 0) <= 1 && l.annual_all_in && (l.annual_cost ?? 0) > 1000).map((l) => l.annual_cost as number)
  const prohibited = cards.filter((l) => l.fit_tier === 5).length
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  const range = (arr: number[]) => (arr.length ? `${Math.min(...arr).toLocaleString()}–${Math.max(...arr).toLocaleString()}` : '')
  if (zh) {
    const parts: string[] = []
    parts.push(`本轮核对了 ${Math.max(checked, cards.length)} 套 Realtor.ca 挂牌，${cards.length} 套接近你的条件（${cities.join(' / ') || 'GTA'}）`)
    if (areas.length) parts.push(`面积 ${range(areas)} sqft`)
    if (minClear) parts.push(clears.length ? `净高已标注 ${clears.length} 套，其中 ${clearOk} 套 ≥ ${minClear}'，其余需现场确认` : `净高均未标注，需现场确认`)
    else if (clears.length) parts.push(`净高已标注 ${clears.length} 套`)
    if (costs.length) parts.push(`年成本（净租 + 挂牌自报 TMI）${fmt(Math.min(...costs))}–${fmt(Math.max(...costs))}`)
    if (prohibited) parts.push(`${prohibited} 套房东明写禁止你的用途，已标红排在最后`)
    return `\n\n${parts.join('；')}。按匹配度排序，下方表格可横向对比；每轮检索结果有波动，点「换一批」会带着已看过的地址再挖一轮；zoning 是否允许你的用途需向市府申请书面确认（zoning confirmation letter）。`
  }
  const parts: string[] = []
  parts.push(`${Math.max(checked, cards.length)} Realtor.ca listings checked this round, ${cards.length} close to your criteria (${cities.join(' / ') || 'GTA'})`)
  if (areas.length) parts.push(`${range(areas)} sqft`)
  if (minClear) parts.push(clears.length ? `clear height stated on ${clears.length}, ${clearOk} at ≥ ${minClear}'` : 'no clear heights stated — verify on site')
  if (costs.length) parts.push(`annual cost (net + listed TMI) ${fmt(Math.min(...costs))}–${fmt(Math.max(...costs))}`)
  if (prohibited) parts.push(`${prohibited} exclude your use per the listing (flagged red, ranked last)`)
  return `\n\n${parts.join('; ')}. Ranked by fit; compare in the table below. Results vary run to run — "Next batch" digs again excluding what you've seen. Confirm zoning for your use with the municipality (zoning confirmation letter).`
}

// Search-result snippets from `site:realtor.ca/real-estate …` include
// residential and for-sale pages — keep only lease listings.
export function isLeaseCandidate(r: { url?: string; title?: string; description?: string }): boolean {
  const url = r.url || ''
  if (!/^https:\/\/(www\.)?realtor\.ca\/real-estate\/\d+\//i.test(url)) return false
  const text = `${r.title || ''} ${r.description || ''}`
  if (/for sale|current price|bedrooms?,?\s*\d*\s*bathrooms|\bcondo\b|\d\s*bedrooms/i.test(text)) return false
  return /for lease|lease|\/square feet|\/sqft|industrial|warehouse|retail|office|commercial/i.test(text)
}

// The web index behind Jina search matches terms literally and ranks
// short queries best: "industrial for lease Markham" returns 10 detail
// pages, the same query with "30,000 sq ft" appended returns 0–1 (2026-09-18
// probes, sequential and parallel). So queries carry NO size and NO numbers
// — kind + city in three phrasings, plus the spec WORD ("clear height") —
// and the size requirement is applied afterwards, first on the search
// snippets (scoreSnippet) to choose which detail pages to read, then on the
// parsed page. ≤10 queries total; 422 is Jina's "no results", not an outage.
export function buildDetailQueries(c: SearchCriteria, kind: CommercialKind): string[] {
  const kindWord = { commercial: 'commercial space', office: 'office space', retail: 'retail space', industrial: 'industrial warehouse', land: 'land' }[kind]
  const kindNoun = { commercial: 'commercial', office: 'office', retail: 'retail', industrial: 'industrial', land: 'land' }[kind]
  const firstSpec = (c.keywords || '')
    .split(/[,;，；\n]/)[0]
    .replace(/[^\p{L}\p{N}\s'’.-]/gu, ' ')
    .trim()
    .slice(0, 40)
  const specWord = firstSpec.replace(/\d+(?:\.\d+)?\s*(?:'|ft\.?|feet|foot|sq\.? ?ft|sqft|sf)?/gi, ' ').replace(/\s+/g, ' ').trim()
  const areas = searchAreas(c)
  const P = 'site:realtor.ca/real-estate'
  // Large-space vocabulary ("truck level", "freestanding", "sublease") pulls
  // whole buildings; the index otherwise favours small units and suites.
  const bigWords: Record<CommercialKind, string[]> = {
    industrial: ['"truck level"', 'freestanding warehouse', 'warehouse sublease'],
    commercial: ['freestanding building', '"entire building"', 'sublease'],
    office: ['"full floor"', '"entire floor"', 'sublease'],
    retail: ['"end cap"', 'freestanding retail', 'plaza'],
    land: ['acres', 'outside storage', 'yard'],
  }
  // Order = value per query when the budget cuts the list short.
  const variants = (a: string): string[] => {
    const big = bigWords[kind]
    const v = [`${P} ${kindWord} for lease ${a}`]
    if (specWord) v.push(`${P} "${a}" ${kindNoun} "${specWord}"`)
    v.push(`${P} "${a}" ${kindNoun} ${big[0]}`, `${P} ${a} Ontario ${kindNoun} lease`, `${P} "${a}" ${kindNoun} ${big[1]}`, `${P} "For lease" "${a} (" ${kindNoun}`, `${P} "${a}" ${kindNoun} ${big[2]}`)
    return v
  }
  const perArea = Math.max(1, Math.min(6, Math.floor(MAX_QUERIES / Math.max(areas.length, 1))))
  const qs: string[] = []
  for (let i = 0; i < perArea; i++) for (const a of areas) {
    const v = variants(a)
    if (v[i]) qs.push(v[i])
  }
  return Array.from(new Set(qs)).slice(0, MAX_QUERIES)
}

// Triage a search hit by its snippet before spending a detail read: a
// printed area inside the band is the strongest signal, a printed area far
// below it the strongest negative; the spec word is a mild plus.
export function scoreSnippet(r: { title?: string; description?: string }, need: Pick<SearchCriteria, 'min_sqft' | 'max_sqft' | 'keywords'>): number {
  const text = `${r.title || ''} ${r.description || ''}`
  let score = 0
  const minSq = need.min_sqft && need.min_sqft > 0 ? need.min_sqft : null
  if (minSq) {
    const maxSq = need.max_sqft && need.max_sqft > 0 ? need.max_sqft : minSq * 2
    const nums = Array.from(text.matchAll(/([\d,]{4,9})\s*(?:\+\/-\s*)?(?:sq\.?\s*ft\.?|sqft|square\s*feet|sf)\b/gi))
      .map((m) => parseInt(m[1].replace(/,/g, ''), 10))
      .filter((n) => Number.isFinite(n) && n >= 500)
    if (nums.length) {
      if (nums.some((n) => n >= minSq * 0.7 && n <= maxSq * 2)) score += 3
      else if (nums.every((n) => n < minSq * 0.7)) score -= 3
    }
  }
  const spec = (need.keywords || '').split(/[,;，；\n]/)[0].replace(/\d+(?:\.\d+)?\s*(?:'|ft\.?|feet|foot)?/gi, ' ').trim().toLowerCase()
  if (spec && spec.length > 3 && text.toLowerCase().includes(spec)) score += 1
  // Whole-building vocabulary vs. small-unit vocabulary.
  if (/truck[- ]level|freestanding|free-standing|entire building|full building|trailer|dock/i.test(text)) score += 1
  if (/\b(?:suite|office unit|small unit|mezzanine unit|studio|kiosk)\b/i.test(text) && !/warehouse|industrial/i.test(text)) score -= 1
  return score
}

// Primary query only (tests / callers that want one string).
export function buildDetailQuery(c: SearchCriteria, kind: CommercialKind): string {
  return buildDetailQueries(c, kind)[0]
}

// ---------- Geography gate ----------
// The web search ranks by text, so "for lease Toronto 30,000 sq ft" also
// returns Brantford and Barrie. Keep a card only if its city is inside the
// asked areas — or anywhere in the GTA when the ask was GTA-wide. Unknown
// cities pass (we cannot judge them).
const GTA_CITIES = new Set([
  'toronto', 'mississauga', 'brampton', 'vaughan', 'markham', 'richmond hill', 'oakville', 'burlington',
  'milton', 'pickering', 'ajax', 'whitby', 'oshawa', 'newmarket', 'aurora', 'king', 'king city', 'caledon',
  'halton hills', 'whitchurch-stouffville', 'stouffville', 'east gwillimbury', 'georgina', 'clarington',
  'scarborough', 'etobicoke', 'north york', 'east york', 'york', 'bolton', 'concord', 'woodbridge', 'thornhill', 'unionville',
])
// Districts Realtor.ca files under a parent municipality: "Vaughan (Concord)".
export const SUBAREA_CITY: Record<string, string> = {
  concord: 'vaughan', woodbridge: 'vaughan', maple: 'vaughan', kleinburg: 'vaughan', thornhill: 'vaughan',
  unionville: 'markham', milliken: 'markham', bolton: 'caledon', stouffville: 'whitchurch-stouffville',
  'king city': 'king', streetsville: 'mississauga', 'port credit': 'mississauga', malton: 'mississauga',
  bramalea: 'brampton', 'oak ridges': 'richmond hill',
}
const ONTARIO_CITIES = new Set([...GTA_CITIES, 'hamilton', 'guelph', 'kitchener', 'waterloo', 'cambridge', 'barrie', 'london', 'ottawa', 'windsor', 'kingston', 'st. catharines', 'niagara falls', 'brantford', 'peterborough'])
export function cityAllowed(city: string | undefined, c: Pick<SearchCriteria, 'area' | 'area_candidates'>, neighborhood?: string): boolean {
  if (!city) return true
  const l = city.toLowerCase().trim()
  const hood = (neighborhood || '').toLowerCase().trim()
  const raw = splitAreas([c.area, ...(c.area_candidates ?? [])])
  const wide = !raw.length || raw.some(isGtaWide)
  if (wide) return GTA_CITIES.has(l)
  const named = raw.filter((a) => !isGtaWide(a)).map((a) => a.toLowerCase())
  return named.some((a) => {
    if (l === a) return true
    // "Concord" → cards read "Vaughan (Concord)".
    if (hood && (hood === a || (a.length >= 4 && hood.includes(a)))) return true
    if (SUBAREA_CITY[a] && SUBAREA_CITY[a].replace(/-/g, ' ') === l) return true
    // Toronto districts / neighbourhoods resolve to city "Toronto" — but a
    // request for Ottawa or Hamilton must not admit Toronto cards.
    if (l === 'toronto') return TORONTO_DISTRICTS.has(a) || !ONTARIO_CITIES.has(a)
    return false
  })
}
const TORONTO_DISTRICTS = new Set(['scarborough', 'etobicoke', 'north york', 'east york', 'york', 'downtown', 'old toronto'])

// ---------- Network orchestration ----------
// Budget: ≤12 searches + ≤40 detail reads + ≤2 list pages, all parallel
// (wall-clock ≈ one read). Search snippets rarely print the area, so the
// only way to find the ~30% of hits that are in the size band is to read
// them; 40 reads ≈ 0.5¢ of Jina credit. Assumes the Workers Paid
// subrequest cap (1,000) — screen-score already makes far more than the
// Free plan's 50 per request.
const DETAIL_READS = 48
const PROVIDER_DOWN = new Set([401, 402, 403, 429])

async function jinaRead(key: string, url: string, timeoutMs: number): Promise<{ md: string; status: number }> {
  try {
    const r = await fetch(`https://r.jina.ai/${encodeURI(url)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!r.ok) return { md: '', status: r.status }
    return { md: await r.text(), status: 200 }
  } catch {
    return { md: '', status: 0 }
  }
}

export type CommercialBudget = { maxQueries: number; maxReads: number; retry: boolean }
// Signed-in members get the full sweep; the anonymous homepage preview gets
// a quarter of it (no retry) so rotating IPs cannot drain the prepaid Jina
// balance that five other features share (review 2026-09-19).
export const BUDGET_MEMBER: CommercialBudget = { maxQueries: MAX_QUERIES, maxReads: 48, retry: true }
export const BUDGET_ANON: CommercialBudget = { maxQueries: 6, maxReads: 12, retry: false }

// "301 - 20 TOWNS ROAD" → "301-20-towns-road": the prefix of the listing's
// URL slug, so already-shown addresses can be skipped BEFORE spending a read.
export function addressSlug(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function searchCommercial(
  c: SearchCriteria,
  kind: CommercialKind,
  onStatus: (statuses: number[]) => ExternalStatus,
  opts: { exclude?: string[]; budget?: CommercialBudget } = {},
): Promise<{ cards: ListingCard[]; external: ExternalStatus; checked: number }> {
  let checked = 0
  const budget = opts.budget ?? BUDGET_MEMBER
  const excludedSlugs = (opts.exclude ?? []).map(addressSlug).filter((x) => x.length >= 6)
  const key = process.env.JINA_API_KEY
  if (!key) return { cards: [], external: { status: 'no_key' }, checked: 0 }
  const statuses: number[] = []
  const seen = new Set<string>()
  const cards: ListingCard[] = []
  const merge = (list: ListingCard[]) => {
    for (const l of list) {
      const k = l.address.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      cards.push(l)
    }
  }

  // Specialised needs (subtype / size / specs) go through DETAIL search;
  // a bare "找个商业空间" is served by the list pages alone.
  const specialised = kind !== 'commercial' || !!c.min_sqft || !!(c.keywords || '').trim() || !!(c.use || '').trim()
  const base = resolveRealtorBase(c.area, c.area_candidates)
  const listPromise = Promise.all(listPageUrls(base, kind).map((u) => jinaRead(key, u, 22000)))
  const detailPromise: Promise<ListingCard[]> = specialised
    ? (async () => {
        try {
          type Hit = { url: string; score: number }
          const searchOne = async (q: string): Promise<Hit[]> => {
            const sres = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(q)}`, {
              headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'X-Respond-With': 'no-content' },
              signal: AbortSignal.timeout(18000),
            })
            // 422 = Jina's "no search results" — an empty answer, not an outage.
            if (!sres.ok) {
              if (sres.status !== 422) statuses.push(sres.status)
              return []
            }
            const d = (await sres.json()) as { data?: { url?: string; title?: string; description?: string }[] }
            return (Array.isArray(d?.data) ? d.data : []).filter(isLeaseCandidate).map((r) => ({ url: r.url as string, score: scoreSnippet(r, c) }))
          }
          const queries = buildDetailQueries(c, kind).slice(0, budget.maxQueries)
          let found = await Promise.all(queries.map((q) => searchOne(q).catch(() => [] as Hit[])))
          // The search backend answers 422 / empty to some queries under
          // parallel load and 10 hits to the same query a second later —
          // retry the empty ones once (measured 2026-09-18: Richmond Hill 7
          // sequential vs 422 in a batch of 9).
          if (budget.retry && found.some((f) => !f.length)) {
            await new Promise((r) => setTimeout(r, 800))
            found = await Promise.all(found.map((f, i) => (f.length ? Promise.resolve(f) : searchOne(queries[i]).catch(() => [] as Hit[]))))
          }
          if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] queries', queries.map((q, i) => `${found[i].length} ← ${q}`))
          // Dedupe (best score wins), then interleave the per-query lists by
          // score band so every area gets read within the DETAIL_READS budget
          // and snippet-confirmed sizes go first.
          const best = new Map<string, number>()
          for (const f of found) for (const h of f) best.set(h.url, Math.max(best.get(h.url) ?? -99, h.score))
          const byQuery = found.map((f) => Array.from(new Set(f.map((h) => h.url))))
          // Round-robin across queries (every area gets a turn), then a STABLE
          // sort by snippet score — every hit lands somewhere (the old band
          // table had no slot for −1, so most office/retail hits were never
          // read). Addresses already shown this conversation are skipped
          // here, before a read is spent, so 「换一批」 reaches new pages.
          const interleaved: string[] = []
          const rounds = Math.max(...byQuery.map((f) => f.length), 0)
          for (let i = 0; i < rounds; i++) for (const f of byQuery) if (f[i] && !interleaved.includes(f[i])) interleaved.push(f[i])
          const slugOf = (u: string) => u.split('/').slice(-1)[0] || ''
          const ordered = interleaved
            .filter((u) => !excludedSlugs.some((x) => slugOf(u).startsWith(x)))
            .map((u, i) => ({ u, i, sc: best.get(u) ?? 0 }))
            .sort((a, b) => b.sc - a.sc || a.i - b.i)
            .map((x) => x.u)
          const picked = ordered.slice(0, Math.min(DETAIL_READS, budget.maxReads))
          if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] candidates', ordered.length, 'scores', picked.map((u) => best.get(u)).join(','))
          const reads = await Promise.all(picked.map((u) => jinaRead(key, u, 22000)))
          const out: ListingCard[] = []
          reads.forEach((r, i) => {
            statuses.push(r.status)
            if (r.status !== 200) return
            const card = parseCommercialDetail(r.md, picked[i], kind)
            if (card) {
              out.push(card)
              checked++
            } else if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] unparsed', picked[i], r.md.match(/^#.*$/m)?.[0])
          })
          if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] picked', picked.length, 'statuses', reads.map((r) => r.status).join(','), 'parsed', out.length)
          return out
        } catch {
          return []
        }
      })()
    : Promise.resolve([])

  const [listReads, detailCards] = await Promise.all([listPromise, detailPromise])
  // Detail cards first — they carry the type + specs the user asked about.
  merge(detailCards)
  for (const r of listReads) {
    statuses.push(r.status)
    if (r.status === 200) merge(parseCommercialList(r.md, kind))
  }
  const inArea = cards.filter((l) => cityAllowed(l.city, c, l.neighborhood))
  if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] merged', cards.length, 'in-area', inArea.length, 'dropped-city', cards.filter((l) => !cityAllowed(l.city, c, l.neighborhood)).map((l) => `${l.address} (${l.city})`))
  const ranked = rankCommercial(inArea, c)
  if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] ranked', ranked.length, 'dropped-fit', inArea.filter((l) => !ranked.find((r) => r.id === l.id)).map((l) => `${l.address} ${l.sqft ?? '?'}sqft`))
  const external = onStatus(statuses)
  // Only provider failures count as "unavailable"; a 404'd slug with a
  // successful sibling is just an empty page.
  if (external.status === 'unavailable' && !statuses.some((s) => PROVIDER_DOWN.has(s)) && ranked.length) {
    return { cards: ranked, external: { status: 'ok' }, checked }
  }
  return { cards: ranked, external, checked }
}

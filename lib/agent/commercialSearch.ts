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

const KIND_SET = new Set<string>(['commercial', 'office', 'retail', 'industrial', 'land'])

// Keyword fallback only fires on unmistakably commercial words — "健身房"
// alone is a condo amenity, "studio" alone is a bachelor apartment.
const KIND_KEYWORDS: [RegExp, CommercialKind][] = [
  [/厂房|仓库|工业|物流|warehouse|industrial|logistics|manufactur/i, 'industrial'],
  [/商铺|店面|店铺|零售|餐厅|餐馆|retail|storefront|restaurant space|shop space/i, 'retail'],
  [/写字楼|办公室|办公空间|office space|office unit|coworking/i, 'office'],
  [/土地|地块|\bland\b|\blot\b/i, 'land'],
  [/商业地产|商用|商业场地|商业空间|commercial/i, 'commercial'],
]

// Which Realtor.ca lease family the criteria belong to, or null for the
// normal residential path. property_type wins; keywords are the fallback.
export function commercialKind(c: Pick<SearchCriteria, 'property_type' | 'keywords'>): CommercialKind | null {
  const t = (c.property_type || '').trim().toLowerCase()
  if (KIND_SET.has(t)) return t as CommercialKind
  if (t) return null // an explicit residential type never flips to commercial
  const kw = c.keywords || ''
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
    .filter(Boolean)
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
  const m = text.match(/([\d,]+)\s*(?:-\s*([\d,]+)|(\+))?\s*(?:square\s*feet|sq\.?\s*ft\.?|sqft|sf)\b/i)
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
  const ftIn = t.match(/(\d{1,2})\s*(?:'|’|′)\s*(\d{1,2})\s*(?:"|”|″)?\s*(?:clear|ceiling)/i)
  const clear =
    ftIn ||
    t.match(/(\d{1,2}(?:\.\d)?)\s*(?:'|’|′|ft\.?|feet|foot|-foot)\s*(?:clear|ceiling)/i) ||
    t.match(/(?:clear|ceiling)\s*height\s*(?:of|is|at|to|up to|:|-|–|approx\.?|approximately|ranging from)?\s*(\d{1,2}(?:\.\d)?)(?!\d)\s*(?:'|’|′|ft\.?|feet|foot)/i) ||
    t.match(/(?:clear|ceiling)\s*height\s*(?:of|is|:|-|–)?\s*(\d{1,2})\s*(?:'|’|′)\s*(\d{1,2})/i)
  if (clear) f.clearFt = clear[2] ? Math.round((parseInt(clear[1], 10) + parseInt(clear[2], 10) / 12) * 10) / 10 : parseFloat(clear[1])
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
  const tmi = t.match(/\bTMI\b[^0-9$]{0,20}\$?\s*(\d{1,2}(?:\.\d{1,2})?)\b/i) || t.match(/additional rent[^0-9$]{0,20}\$?\s*(\d{1,2}(?:\.\d{1,2})?)\b/i)
  if (tmi) f.tmiPsfFromText = parseFloat(tmi[1])
  // "No Recreational Uses." / "No food uses" / "not suitable for automotive"
  const ex = t.matchAll(/\bno\s+([a-z /&-]{3,40}?)\s+uses?\b|\bnot\s+(?:suitable|permitted)\s+for\s+([a-z /&-]{3,40}?)(?:[.,;]|$)/gi)
  for (const m of ex) {
    const phrase = (m[1] || m[2] || '').trim()
    if (phrase && !/^(?:other|additional|further)$/i.test(phrase)) f.excludedUses.push(phrase)
  }
  return f
}

// Spec pills (Chinese labels where the concept has one; English terms stay).
export function factsToSpecs(f: CommercialFacts, leaseType?: string): string[] {
  const out: string[] = []
  if (f.clearFt != null) out.push(`净高 ${f.clearFt}'`)
  if (f.truckDoors) out.push(`${f.truckDoors} truck-level`)
  if (f.driveInDoors) out.push(`${f.driveInDoors} drive-in`)
  if (f.zoning) out.push(`Zoning ${f.zoning}`)
  if (f.amps) out.push(`${f.amps}A`)
  if (f.parking) out.push(`${f.parking} 车位`)
  if (f.esfr) out.push('ESFR')
  else if (f.sprinklers) out.push('喷淋')
  if (f.officePct) out.push(`${f.officePct}% 办公`)
  if (f.freestanding) out.push('独立物业')
  if (f.possession) out.push(f.possession === 'immediate' ? '即可入驻' : `交付 ${f.possession}`)
  if (f.sublease) out.push(f.subleaseUntil ? `转租至 ${f.subleaseUntil}` : '转租')
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
const USE_CATEGORIES: [RegExp, RegExp, string][] = [
  // [what the tenant said, what the listing excludes, label]
  [/pickleball|badminton|basketball|volleyball|tennis|sport|gym|fitness|recreation|court|arena|trampoline|climbing|yoga|dance|martial|boxing|athletic|球馆|体育|运动|健身|球场/i, /recreation|sport|fitness|gym|athletic|entertainment|amusement/i, '娱乐 / 体育用途'],
  [/restaurant|cafe|café|food|kitchen|bakery|catering|餐厅|餐饮|食品|厨房/i, /food|restaurant|cooking|kitchen/i, '餐饮用途'],
  [/auto|car|mechanic|body shop|vehicle|汽车|修车/i, /automotive|auto|vehicle|mechanic/i, '汽车用途'],
  [/church|worship|temple|mosque|教会|宗教/i, /worship|church|religious/i, '宗教用途'],
  [/school|daycare|tutoring|学校|托儿|教育/i, /school|daycare|educational|children/i, '教育 / 托儿用途'],
  [/cannabis|dispensary|大麻/i, /cannabis|marijuana/i, '大麻'],
  [/retail|store|shop|零售|店/i, /retail/i, '零售用途'],
]

export function useProhibited(excluded: string[], use?: string | null): string | null {
  if (!excluded.length || !use) return null
  for (const [tenantRe, listingRe, label] of USE_CATEGORIES) {
    if (!tenantRe.test(use)) continue
    if (excluded.some((e) => listingRe.test(e))) return label
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
  const h1 = md.match(/^#{1,2}\s+([^\n]+?)\s*$/m)?.[1]?.trim()
  if (!h1) return null
  // Expired listings render an H1 apology instead of an address.
  if (/no longer exists|not found|can't find|cannot find|sorry/i.test(h1) || !/\d/.test(h1)) return null
  // The line after the H1 is "Toronto (West Humber-Clairville), Ontario M9W5N4".
  // Realtor.ca is national — a Coldstream, British Columbia hit for a
  // "Toronto" query is dropped here rather than shown with no city.
  const tail = md.slice(md.indexOf(h1) + h1.length)
  const prov = tail.match(/\n\s*[^\n]*,\s*(Ontario|British Columbia|Alberta|Quebec|Québec|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland and Labrador|Prince Edward Island|Yukon|Northwest Territories|Nunavut)\b/)?.[1]
  if (prov && prov !== 'Ontario') return null
  const after = tail.match(/\n\s*([^\n]+?,\s*Ontario[^\n]*)/)?.[1] || ''
  const loc = splitAddress(`${h1}, ${after}`)
  const propertyType = md.match(/Property Type\s*\n\s*([A-Za-z][A-Za-z /-]{2,40})/)?.[1]?.trim()
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

export function isPlaceholderPrice(amount: number, perSqft: boolean): boolean {
  return !amount || (perSqft ? amount < 3 : amount < 100)
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
  const annual =
    x.perSqft && x.amount && x.sqft ? Math.round((x.amount + (tmi ?? 0)) * x.sqft) : !x.perSqft && x.amount ? Math.round(x.amount * 12) : undefined
  const typeZh: Record<CommercialKind, string> = {
    commercial: '商业空间', office: '办公', retail: '零售 / 店面', industrial: '工业 / 仓库', land: '土地',
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
    monthly_all_in: annual != null && (tmi != null || gross || !x.perSqft) ? Math.round(annual / 12) : undefined,
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
export function assessFit(l: ListingCard, need: CommercialNeed): { tier: number; warn: string[]; drop: boolean } {
  const minSq = need.min_sqft && need.min_sqft > 0 ? need.min_sqft : null
  const maxSq = need.max_sqft && need.max_sqft > 0 ? need.max_sqft : minSq ? minSq * 2 : null
  const minClear = need.min_clear_ft && need.min_clear_ft > 0 ? need.min_clear_ft : null
  const use = need.use || need.keywords || null
  // "700+ sqft" list rows are open-ended: the printed floor is not the area.
  const openRange = l.sqft_max == null && l.sqft_min != null
  const area = openRange ? undefined : l.sqft_max ?? l.sqft ?? l.sqft_min
  const warn: string[] = []
  let tier = 0
  let drop = false
  if (minSq) {
    if (area == null) {
      // No printed area but a monthly rent implying <$5/sqft/yr at the asked
      // size — nothing leases that cheaply, so it is far smaller than asked.
      if (l.price_basis === 'monthly' && (l.price * 12) / minSq < 5) drop = true
      else tier = Math.max(tier, 3)
    } else if (area < minSq * 0.7) {
      drop = true
    } else if (area < minSq * 0.9) {
      warn.push(`面积偏小 ${area.toLocaleString()}`)
      tier = Math.max(tier, 1)
    } else if (maxSq && area > maxSq * 2 && !/demis|divisible|can be divided|split|partial/i.test(l.description || '')) {
      drop = true
    } else if (maxSq && area > maxSq) {
      warn.push('面积远超需求')
      tier = Math.max(tier, 2)
    }
  } else if (maxSq && area != null && area > maxSq) {
    warn.push('面积超出上限')
    tier = Math.max(tier, 2)
  }
  if (minClear) {
    if (l.clear_ft == null) tier = Math.max(tier, 1)
    else if (l.clear_ft < minClear) {
      warn.push(`净高 ${l.clear_ft}' 不足`)
      tier = Math.max(tier, 4)
    }
  }
  const prohibited = useProhibited(l.excluded_uses || [], use)
  if (prohibited) {
    warn.push(`房东明写禁止${prohibited}`)
    tier = 5
  }
  if (need.max_price && need.max_price > 0) {
    const m = l.monthly_all_in ?? (l.price_basis !== 'unknown' ? l.price : undefined)
    if (m != null && m > need.max_price) {
      warn.push('超预算')
      tier = Math.max(tier, 2)
    }
  }
  return { tier, warn, drop }
}

export function rankCommercial(cards: ListingCard[], need: CommercialNeed): ListingCard[] {
  const minSq = need.min_sqft && need.min_sqft > 0 ? need.min_sqft : null
  const scored = cards
    .map((l) => {
      const fit = assessFit(l, need)
      return { l: { ...l, specs_warn: fit.warn.length ? fit.warn : undefined, fit_tier: fit.tier }, fit }
    })
    .filter((x) => !x.fit.drop)
  const key = (x: { l: ListingCard }) => {
    const area = x.l.sqft_max ?? x.l.sqft ?? x.l.sqft_min
    if (minSq) return area == null ? Number.MAX_SAFE_INTEGER / 2 : Math.abs(area - minSq)
    return x.l.price_basis === 'unknown' ? Number.MAX_SAFE_INTEGER / 2 : x.l.monthly_all_in ?? x.l.price
  }
  const ranked = scored.sort((a, b) => a.fit.tier - b.fit.tier || key(a) - key(b)).map((x) => x.l)
  // On a sized search, rows with no printed area (generic list-page rows)
  // are noise once there are enough sized candidates to compare.
  if (minSq && ranked.filter((l) => (l.fit_tier ?? 0) <= 2).length >= 6) return ranked.filter((l) => l.fit_tier !== 3)
  return ranked
}

// Deterministic one-paragraph digest appended to the reply — the model
// answered before the search ran, so this is the only place the numbers
// the tenant asked about (size band, clear heights, all-in cost, exclusions)
// can be stated truthfully.
export function summarizeCommercial(cards: ListingCard[], need: CommercialNeed, zh: boolean): string {
  if (!cards.length) return ''
  const cities = Array.from(new Set(cards.map((l) => l.city).filter((c): c is string => !!c)))
  const areas = cards.map((l) => l.sqft).filter((n): n is number => !!n)
  const clears = cards.map((l) => l.clear_ft).filter((n): n is number => n != null)
  const minClear = need.min_clear_ft && need.min_clear_ft > 0 ? need.min_clear_ft : null
  const clearOk = minClear ? clears.filter((c) => c >= minClear).length : 0
  // Cost range over the viable rows only (not the 166k-sqft full building
  // ranked at the bottom) and only where the listing printed a TMI.
  const costs = cards.filter((l) => (l.fit_tier ?? 0) <= 1 && l.tmi_psf != null && (l.annual_cost ?? 0) > 1000).map((l) => l.annual_cost as number)
  const prohibited = cards.filter((l) => l.fit_tier === 5).length
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  const range = (arr: number[]) => (arr.length ? `${Math.min(...arr).toLocaleString()}–${Math.max(...arr).toLocaleString()}` : '')
  if (zh) {
    const parts: string[] = []
    parts.push(`实时共找到 ${cards.length} 套（${cities.join(' / ') || 'GTA'}）`)
    if (areas.length) parts.push(`面积 ${range(areas)} sqft`)
    if (minClear) parts.push(clears.length ? `净高已标注 ${clears.length} 套，其中 ${clearOk} 套 ≥ ${minClear}'，其余需现场确认` : `净高均未标注，需现场确认`)
    else if (clears.length) parts.push(`净高已标注 ${clears.length} 套`)
    if (costs.length) parts.push(`年成本（净租 + 挂牌自报 TMI）${fmt(Math.min(...costs))}–${fmt(Math.max(...costs))}`)
    if (prohibited) parts.push(`${prohibited} 套房东明写禁止你的用途，已标红排在最后`)
    return `\n\n${parts.join('；')}。按匹配度排序，下方表格可横向对比；zoning 是否允许你的用途需向市府申请书面确认（zoning confirmation letter）。`
  }
  const parts: string[] = []
  parts.push(`${cards.length} live listings found (${cities.join(' / ') || 'GTA'})`)
  if (areas.length) parts.push(`${range(areas)} sqft`)
  if (minClear) parts.push(clears.length ? `clear height stated on ${clears.length}, ${clearOk} at ≥ ${minClear}'` : 'no clear heights stated — verify on site')
  if (costs.length) parts.push(`annual cost (net + listed TMI) ${fmt(Math.min(...costs))}–${fmt(Math.max(...costs))}`)
  if (prohibited) parts.push(`${prohibited} exclude your use per the listing (flagged red, ranked last)`)
  return `\n\n${parts.join('; ')}. Ranked by fit; compare in the table below. Confirm zoning for your use with the municipality (zoning confirmation letter).`
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

// Jina search answers 422 ("no results") to over-specific queries — the
// full spec list ("clear height 24 ft, clear span, pickleball courts,
// parking") got zero hits where the same need phrased short got ten. So
// every query is SHORT: kind + area + size, and for the primary area one
// extra variant with the first spec phrase. Fanned out over the areas
// (≤8 queries total), unioned and deduped.
export function buildDetailQueries(c: SearchCriteria, kind: CommercialKind): string[] {
  const kindWord = { commercial: 'commercial space', office: 'office space', retail: 'retail space', industrial: 'industrial warehouse', land: 'land' }[kind]
  const firstSpec = (c.keywords || '')
    .split(/[,;，；\n]/)[0]
    .replace(/[^\p{L}\p{N}\s'’.-]/gu, ' ')
    .trim()
    .slice(0, 40)
  const sq = c.min_sqft ? `${Math.round(c.min_sqft).toLocaleString('en-CA')} sq ft` : ''
  const areas = searchAreas(c)
  const qs: string[] = []
  const q = (area: string, extra = '') => `site:realtor.ca/real-estate ${kindWord} for lease ${area} ${extra} ${sq}`.replace(/\s+/g, ' ').trim()
  // Every area gets the spec-bearing form (it pulls the right kind of unit —
  // "clear height" queries return warehouses, size-only ones return whatever
  // mentions the number); the primary area also gets the plain size form.
  for (const a of areas) qs.push(q(a, firstSpec))
  if (firstSpec) qs.push(q(areas[0]))
  return Array.from(new Set(qs)).slice(0, 10)
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
export function cityAllowed(city: string | undefined, c: Pick<SearchCriteria, 'area' | 'area_candidates'>): boolean {
  if (!city) return true
  const l = city.toLowerCase().trim()
  const raw = splitAreas([c.area, ...(c.area_candidates ?? [])])
  const wide = !raw.length || raw.some(isGtaWide)
  if (wide) return GTA_CITIES.has(l)
  const named = raw.filter((a) => !isGtaWide(a)).map((a) => a.toLowerCase())
  // Toronto districts / neighbourhoods resolve to city "Toronto".
  return named.some((a) => l === a || l.includes(a) || a.includes(l) || (l === 'toronto' && (TORONTO_DISTRICTS.has(a) || !GTA_CITIES.has(a))))
}
const TORONTO_DISTRICTS = new Set(['scarborough', 'etobicoke', 'north york', 'east york', 'york', 'downtown', 'old toronto'])

// ---------- Network orchestration ----------
// Subrequest budget: ≤10 searches + ≤22 detail reads + ≤2 list pages keeps
// the whole turn under Cloudflare's per-request cap with room for the
// model / DB calls.
const DETAIL_READS = 24
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

export async function searchCommercial(
  c: SearchCriteria,
  kind: CommercialKind,
  onStatus: (statuses: number[]) => ExternalStatus,
): Promise<{ cards: ListingCard[]; external: ExternalStatus }> {
  const key = process.env.JINA_API_KEY
  if (!key) return { cards: [], external: { status: 'no_key' } }
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
          const searchOne = async (q: string): Promise<string[]> => {
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
            return (Array.isArray(d?.data) ? d.data : []).filter(isLeaseCandidate).map((r) => r.url as string)
          }
          const queries = buildDetailQueries(c, kind)
          const found = await Promise.all(queries.map((q) => searchOne(q).catch(() => [] as string[])))
          if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] queries', queries.map((q, i) => `${found[i].length} ← ${q}`))
          // Interleave the per-query lists so every area gets read within the
          // DETAIL_READS budget instead of the first query hogging it.
          const urls: string[] = []
          for (let i = 0; i < Math.max(...found.map((f) => f.length), 0); i++) for (const f of found) if (f[i]) urls.push(f[i])
          const picked = Array.from(new Set(urls)).slice(0, DETAIL_READS)
          const reads = await Promise.all(picked.map((u) => jinaRead(key, u, 22000)))
          const out: ListingCard[] = []
          reads.forEach((r, i) => {
            statuses.push(r.status)
            if (r.status !== 200) return
            const card = parseCommercialDetail(r.md, picked[i], kind)
            if (card) out.push(card)
            else if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] unparsed', picked[i], r.md.match(/^#.*$/m)?.[0])
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
  const inArea = cards.filter((l) => cityAllowed(l.city, c))
  if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] merged', cards.length, 'in-area', inArea.length, 'dropped-city', cards.filter((l) => !cityAllowed(l.city, c)).map((l) => `${l.address} (${l.city})`))
  const ranked = rankCommercial(inArea, c)
  if (process.env.COMMERCIAL_DEBUG) console.warn('[commercial] ranked', ranked.length, 'dropped-fit', inArea.filter((l) => !ranked.find((r) => r.id === l.id)).map((l) => `${l.address} ${l.sqft ?? '?'}sqft`))
  const external = onStatus(statuses)
  // Only provider failures count as "unavailable"; a 404'd slug with a
  // successful sibling is just an empty page.
  if (external.status === 'unavailable' && !statuses.some((s) => PROVIDER_DOWN.has(s)) && ranked.length) {
    return { cards: ranked, external: { status: 'ok' } }
  }
  return { cards: ranked, external }
}

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
//   2. DETAIL pages via Jina search `site:realtor.ca/real-estate …` — the
//      only way to hit specialised needs (industrial, ≥30,000 sqft, clear
//      height). Detail pages carry Property Type, Square Footage, Lease Type
//      and the listing description; we read at most DETAIL_READS of them.
//
// Honesty rules baked in: a $/sqft asking rate is NET rent per year — the
// monthly figure we show is an estimate (rate × sqft ÷ 12) excluding TMI and
// is labelled as such; specs (clear height, doors) are quoted from the
// listing text, never inferred. Pure parsers are exported for tests.
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

export function slugify(name: string): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return /^[a-z0-9-]{2,60}$/.test(slug) ? slug : null
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

// ---------- Specs quoted from listing text ----------
// Only facts the listing itself states, in the listing's own numbers.
export function extractSpecs(text: string): string[] {
  const out: string[] = []
  const t = text.replace(/\s+/g, ' ')
  const clear =
    t.match(/(\d{1,2}(?:\.\d)?)\s*(?:'|’|′|ft\.?|feet|foot|-foot)?\s*(?:clear|ceiling)/i) ||
    t.match(/clear\s*height[^0-9]{0,30}(\d{1,2}(?:\.\d)?)/i) ||
    t.match(/ceiling\s*height[^0-9]{0,30}(\d{1,2}(?:\.\d)?)/i)
  if (clear) out.push(`净高 ${clear[1]}'`)
  const truck = t.match(/(\d+)\s*(?:truck[- ]level|tl)\s*(?:shipping\s*)?doors?/i)
  if (truck) out.push(`${truck[1]} truck-level`)
  const drive = t.match(/(\d+)\s*(?:drive[- ]in)\s*(?:shipping\s*)?doors?/i)
  if (drive) out.push(`${drive[1]} drive-in`)
  const zoning = t.match(/[Zz]oning(?: [Dd]escription)?:?\s*([A-Z]{1,3}\d{0,2}(?:-\d+)?)\b/)
  if (zoning) out.push(`Zoning ${zoning[1]}`)
  const power = t.match(/(\d{2,4})\s*(?:amps?|a)\b[^.]{0,20}(?:power|service|electrical)/i)
  if (power) out.push(`${power[1]}A`)
  return out
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
    const amount = parseFloat(priceM[1].replace(/,/g, ''))
    if (!amount) continue
    const perSqft = /sqft|square/i.test(priceM[2])
    const url = line.match(/\]\((https:\/\/www\.realtor\.ca\/real-estate\/[^)]+)\)/)?.[1]
    const image = line.match(/(https:\/\/cdn\.realtor\.ca\/listings\/[^)\s]+\.jpg)/)?.[1]
    const addrM = line.match(/\/(?:Monthly|Month|sqft|square\s*feet)\s+(.+?,\s*Ontario)\b/i)
    if (!addrM) continue
    const loc = splitAddress(addrM[1])
    const sq = parseSqftRange(line.slice(line.indexOf(addrM[1]) + addrM[1].length))
    const sqft = sq ? sq.max ?? sq.min : undefined
    // List rows never print the building type — label them as generic
    // commercial space rather than echoing the type the user asked for.
    const card = buildCard({
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
      specs: [],
    })
    out.push(card)
    if (out.length >= 40) break
  }
  return out
}

// ---------- DETAIL page ----------
export function parseCommercialDetail(md: string, url: string, kindHint: CommercialKind): ListingCard | null {
  const priceM = md.match(/\$([\d,]+(?:\.\d+)?)\s*\/\s*(square\s*feet|sqft|Monthly|Month)\b/i)
  const h1 = md.match(/^#\s+([^\n]+?)\s*$/m)?.[1]?.trim()
  if (!h1) return null
  // The line after the H1 is "Toronto (West Humber-Clairville), Ontario M9W5N4".
  const after = md.slice(md.indexOf(h1) + h1.length).match(/\n\s*([^\n]+?,\s*Ontario[^\n]*)/)?.[1] || ''
  const loc = splitAddress(`${h1}, ${after}`)
  const propertyType = md.match(/Property Type\s*\n\s*([A-Za-z][A-Za-z /-]{2,40})/)?.[1]?.trim()
  const subtype = md.match(/^\s*(?:Industrial|Retail|Office|Commercial|Land)\s*\(([^)]+)\)\s*$/m)?.[1]?.trim()
  const sqM = md.match(/Square Footage\s*\n\s*([\d,]+)\s*(?:sqft|sq\.? ?ft|square feet)/i)
  const sqft = sqM ? parseInt(sqM[1].replace(/,/g, ''), 10) : undefined
  const leaseType = md.match(/Lease Type\s*\n\s*([A-Za-z ]{2,20})\s*\n/)?.[1]?.trim()
  const descM = md.match(/## Listing Description\s*\n([\s\S]*?)(?:\n## |\n\* \* \*|$)/)
  const desc = (descM?.[1] || '').replace(/\s+/g, ' ').trim()
  const image = md.match(/(https:\/\/cdn\.realtor\.ca\/listings\/[^)\s]+\.jpg)/)?.[1]
  const specs = extractSpecs(`${desc} ${md.match(/Zoning Description\s*\n\s*([^\n]+)/)?.[0] || ''}`)
  if (leaseType) specs.push(`${leaseType} lease`)
  const amount = priceM ? parseFloat(priceM[1].replace(/,/g, '')) : 0
  const perSqft = !!priceM && /sqft|square/i.test(priceM[2])
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
    specs,
    description: desc.slice(0, 220),
  })
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
  specs: string[]
  description?: string
}): ListingCard {
  const ratePsf = x.perSqft ? x.amount : undefined
  const monthly = x.perSqft ? monthlyFromRate(x.amount, x.sqft) : x.amount ? Math.round(x.amount) : undefined
  const basis: PriceBasis = x.perSqft ? (monthly ? 'psf_estimate' : 'unknown') : x.amount ? 'monthly' : 'unknown'
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
    beds: 0,
    sqft: x.sqft,
    sqft_min: x.sqftMin,
    sqft_max: x.sqftMax,
    specs: x.specs.length ? x.specs : undefined,
    description: x.description,
    image: x.image,
    url: x.url,
    note: x.perSqft
      ? '外部房源 · Realtor.ca 实时 · 报价为净租金 $/sqft/年，月租为估算、不含 TMI'
      : '外部房源 · Realtor.ca 实时 · 未经 Stayloop 验证',
  }
}

// ---------- Filter + rank ----------
// min_sqft: keep units whose stated area (max of a range) reaches ≥90% of
// the ask; unknown-area units are kept but ranked last (the listing may
// still fit — the list row simply didn't print it). max_price applies to the
// monthly figure only when we have one.
export function rankCommercial(cards: ListingCard[], c: Pick<SearchCriteria, 'min_sqft' | 'max_price'>): ListingCard[] {
  const minSq = c.min_sqft && c.min_sqft > 0 ? c.min_sqft : null
  const maxP = c.max_price && c.max_price > 0 ? c.max_price : null
  const area = (l: ListingCard) => l.sqft_max ?? l.sqft ?? (l.sqft_min != null ? l.sqft_min : undefined)
  const kept = cards.filter((l) => {
    const a = area(l)
    if (minSq && a != null && a < minSq * 0.9 && l.sqft_max != null) return false
    // No printed area but an asking MONTHLY rent that would imply under
    // $5/sqft/year at the requested size — nothing in the GTA leases that
    // cheaply, so the unit is far smaller than asked. Drop it.
    if (minSq && a == null && l.price_basis === 'monthly' && (l.price * 12) / minSq < 5) return false
    if (maxP && l.price_basis !== 'unknown' && l.price > maxP) return false
    return true
  })
  const score = (l: ListingCard) => {
    const a = area(l)
    if (minSq) return a == null ? Number.MAX_SAFE_INTEGER / 2 : Math.abs(a - minSq)
    return l.price_basis === 'unknown' ? Number.MAX_SAFE_INTEGER / 2 : l.price
  }
  return kept.sort((a, b) => score(a) - score(b))
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
// parking") got zero hits where the same need phrased short got ten. So we
// issue TWO short queries in parallel and union them: one with the first
// spec phrase, one with size only (2026-09-18 probes).
export function buildDetailQueries(c: SearchCriteria, kind: CommercialKind): string[] {
  const kindWord = { commercial: 'commercial space', office: 'office space', retail: 'retail space', industrial: 'industrial warehouse', land: 'land' }[kind]
  const area = c.area || c.area_candidates?.[0] || 'Toronto'
  const firstSpec = (c.keywords || '')
    .split(/[,;，；\n]/)[0]
    .replace(/[^\p{L}\p{N}\s'’.-]/gu, ' ')
    .trim()
    .slice(0, 40)
  const sq = c.min_sqft ? `${Math.round(c.min_sqft).toLocaleString('en-CA')} sq ft` : ''
  const base = `site:realtor.ca/real-estate ${kindWord} for lease ${area}`
  const qs = [`${base} ${sq}`.replace(/\s+/g, ' ').trim()]
  if (firstSpec) qs.unshift(`${base} ${firstSpec} ${sq}`.replace(/\s+/g, ' ').trim())
  return Array.from(new Set(qs))
}

// Kept for the tests / callers that want the primary query only.
export function buildDetailQuery(c: SearchCriteria, kind: CommercialKind): string {
  return buildDetailQueries(c, kind)[0]
}

// ---------- Network orchestration ----------
const DETAIL_READS = 8
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

  // Specialised needs (subtype / area / specs) go through DETAIL search;
  // a bare "找个商业空间" is served by the list pages alone.
  const specialised = kind !== 'commercial' || !!c.min_sqft || !!(c.keywords || '').trim()
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
          const found = await Promise.all(buildDetailQueries(c, kind).map((q) => searchOne(q).catch(() => [] as string[])))
          // Interleave the two result lists so both the spec-matched and the
          // size-matched pages get read within the DETAIL_READS budget.
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
          })
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
  const ranked = rankCommercial(cards, c)
  const external = onStatus(statuses)
  // Only provider failures count as "unavailable"; a 404'd slug with a
  // successful sibling is just an empty page.
  if (external.status === 'unavailable' && !statuses.some((s) => PROVIDER_DOWN.has(s)) && ranked.length) {
    return { cards: ranked, external: { status: 'ok' } }
  }
  return { cards: ranked, external }
}

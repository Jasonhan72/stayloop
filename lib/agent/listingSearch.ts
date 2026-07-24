// Listing search for the agent turn: Stayloop's own listings first, then a
// LIVE external fallback (Realtor.ca via the Jina reader/search API) when
// Stayloop has no match. Runs server-side (edge). Requires JINA_API_KEY.
import type { ListingCard } from './types'
import { LISTING_VISIBILITY_OR, LISTING_VISIBILITY_OR_GROUP } from '../listingVisibility'
import { readTrrebBenchmark, type TrrebBenchmark } from './trrebRent'

export type SearchCriteria = {
  area?: string | null
  // Model-resolved neighbourhoods for landmark queries ("多大附近" →
  // ["Bay Street Corridor", ...]) — official Realtor.ca names, best first.
  area_candidates?: string[] | null
  max_price?: number | null
  min_beds?: number | null
  pets?: boolean | null
  keywords?: string | null
  property_type?: string | null
  count?: number | null
}

// What DB property_type values satisfy each requested type. 公寓 covers both
// purpose-built apartments and condos; house excludes them entirely.
const TYPE_MATCHES: Record<string, string[]> = {
  apartment: ['apartment', 'condo'],
  condo: ['apartment', 'condo'],
  house: ['house'],
  townhouse: ['townhouse'],
  basement: ['basement'],
  duplex: ['duplex'],
}

function normalizeType(c: SearchCriteria): string | null {
  const t = (c.property_type || '').trim().toLowerCase()
  if (TYPE_MATCHES[t]) return t
  const kw = `${c.keywords || ''} ${c.property_type || ''}`
  if (/公寓|apartment|condo|大厦|suite/i.test(kw)) return 'apartment'
  if (/联排|townhouse|town\s?home/i.test(kw)) return 'townhouse'
  if (/地下室|basement/i.test(kw)) return 'basement'
  if (/house|整栋|独立屋/i.test(kw)) return 'house'
  return null
}

const STOCK = [
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=600&q=80&auto=format&fit=crop',
]

// The model may emit the area in Chinese ("北约克") or as a building /
// development name; DB values and Realtor.ca queries are English official
// neighbourhoods, so normalize before filtering. Keys are matched
// case-insensitively (lowercase keys suffice for the English entries).
const AREA_ALIASES: Record<string, string> = {
  'sugar wharf': 'Harbourfront',
  cityplace: 'Fort York',
  'city place': 'Fort York',
  北约克: 'North York',
  北約克: 'North York',
  士嘉堡: 'Scarborough',
  世嘉堡: 'Scarborough',
  怡陶碧谷: 'Etobicoke',
  伊桃碧谷: 'Etobicoke',
  市中心: 'Downtown',
  约克维尔: 'Yorkville',
  約克維爾: 'Yorkville',
  湖滨: 'Harbourfront',
  湖濱: 'Harbourfront',
  万锦: 'Markham',
  萬錦: 'Markham',
  密西沙加: 'Mississauga',
  列治文山: 'Richmond Hill',
  旺市: 'Vaughan',
  奥克维尔: 'Oakville',
  // Landmarks students actually search by — mapped to the neighbourhood
  // Realtor.ca and our DB rows actually use.
  多伦多大学: 'University of Toronto',
  多倫多大學: 'University of Toronto',
  多大: 'University of Toronto',
  约克大学: 'York University',
  約克大學: 'York University',
}

export function normalizeArea(area?: string | null): string | null {
  const t = (area || '').trim()
  if (!t) return null
  const lower = t.toLowerCase()
  for (const [alias, en] of Object.entries(AREA_ALIASES))
    if (lower.includes(alias.toLowerCase())) return en
  // Model sometimes emits compound areas ("University of Toronto, Downtown
  // Toronto"). Keep the most specific segment — the compound string matches
  // nothing in the DB ilike pattern and dilutes the Realtor.ca query.
  return t.split(',')[0].trim() || null
}

// ---------- Street / building-level matching ----------
// Development / building names tenants search by directly. Realtor.ca card
// addresses carry the street, not the marketing name, so an alias hit here
// usually ends in the honest "no direct listing" notice rather than passing
// off same-area inventory as the named building.
const BUILDING_TOKENS = ['sugar wharf', 'cityplace', 'city place']

// "55 Cooper St" / "queens quay" style street references inside keywords.
const STREET_RE =
  /(?:\d+\s+)?([a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*)?)\s+(?:st|street|ave|avenue|rd|road|blvd|dr|drive|quay|lane|way|court|crt)\b/i

export type StreetRef = { token: string; label: string }

// Extract a street/building token from the model's keywords. Pure —
// unit-tested directly. "找 55 Cooper St 的房子" → { token: 'cooper',
// label: '55 Cooper St' }; "sugar wharf 一居" → alias hit; plain type
// keywords ("house", "北约克两房") → null.
export function extractStreetRef(keywords?: string | null): StreetRef | null {
  const kw = (keywords || '').trim()
  if (!kw) return null
  const lower = kw.toLowerCase()
  for (const b of BUILDING_TOKENS) {
    const i = lower.indexOf(b)
    if (i >= 0) return { token: b, label: kw.slice(i, i + b.length) }
  }
  const m = kw.match(STREET_RE)
  if (!m) return null
  // The last word of the street name is the distinctive match token
  // ("55 Cooper St" → cooper).
  const words = m[1].trim().split(/\s+/)
  const token = (words[words.length - 1] || '').toLowerCase()
  return token.length >= 3 ? { token, label: m[0].trim() } : null
}

export function extractStreetToken(keywords?: string | null): string | null {
  return extractStreetRef(keywords)?.token ?? null
}

// Street-level relevance pass over the assembled cards: token hits float to
// the front; when NOTHING matches, keep the cards but attach an honest zh
// notice — never silently present same-area listings as the named
// building/street. Pure — unit-tested directly.
export function filterByStreetToken(
  listings: ListingCard[],
  ref: StreetRef | null,
  areaLabel: string,
): { listings: ListingCard[]; notice?: string } {
  if (!ref || !listings.length) return { listings }
  const hit = (l: ListingCard) => l.address.toLowerCase().includes(ref.token)
  const hits = listings.filter(hit)
  if (hits.length) return { listings: [...hits, ...listings.filter((l) => !hit(l))] }
  return {
    listings,
    notice: `「${ref.label}」在 Realtor.ca 上暂无直接挂牌，以下是同片区（${areaLabel}）当前在租的房源`,
  }
}

export type MarketStats = {
  area: string
  beds?: number | null
  sample: number
  min: number
  median: number
  max: number
  budget?: number | null
  trreb?: TrrebBenchmark
}

// One市场样本行：address 用于跨页去重（同一套房出现在通用页和卧室专属页时只计一次）。
export type StatRow = { address: string; price: number }

function buildMarket(c: SearchCriteria, rows: StatRow[]): MarketStats | undefined {
  const byAddr = new Map<string, number>()
  for (const r of rows) {
    const k = r.address.toLowerCase()
    if (!byAddr.has(k)) byAddr.set(k, r.price)
  }
  const clean = Array.from(byAddr.values())
    .filter((p) => p > 300 && p < 60000)
    .sort((a, b) => a - b)
  if (clean.length < 3) return undefined
  return {
    // Landmark turns may carry candidates without a plain area — label the
    // card with the resolved neighbourhood, not a misleading "Toronto".
    area: c.area || c.area_candidates?.[0] || 'Toronto',
    beds: c.min_beds ?? null,
    sample: clean.length,
    min: clean[0],
    median: clean[Math.floor(clean.length / 2)],
    max: clean[clean.length - 1],
    budget: c.max_price ?? null,
  }
}

export async function searchListings(
  c: SearchCriteria,
  exclude: string[] = []
): Promise<{ listings: ListingCard[]; market?: MarketStats; notice?: string }> {
  c = { ...c, area: normalizeArea(c.area) }
  // Street/building reference in the keywords ("55 Cooper St", "Sugar
  // Wharf") — used AFTER assembly to rank exact-street cards first, or to
  // attach the honest same-area notice when none match.
  const streetRef = extractStreetRef(c.keywords)
  const areaLabel = () => c.area || c.area_candidates?.[0] || 'Toronto'
  const target = Math.min(Math.max(c.count ?? 4, 1), 6)
  // Already-shown addresses (this conversation) are skipped so "再找几个 /
  // 换一批" returns NEW results. Over-fetch a bit to leave room after filtering.
  const ex = new Set(exclude.map((s) => s.toLowerCase()))
  const fresh = (l: ListingCard) => !ex.has(l.address.toLowerCase())
  const fetchCount = Math.min(target + exclude.length, 12)

  // Realtor.ca runs UNCONDITIONALLY (in parallel with the Stayloop query):
  // the market card is computed exclusively from Realtor.ca asking prices —
  // the primary area's full visible sample, pre-budget — never from our own
  // inventory and never from the LLM.
  const extPromise = jinaRealtor({ ...c, count: fetchCount }).catch(
    () => ({ cards: [] as ListingCard[], statRows: [] as StatRow[] }),
  )
  // Official TRREB benchmark (cached quarterly report, fast DB read) —
  // resolved to the user's area (district/municipality) when the map covers
  // it, TRREB-wide otherwise. Townhouse searches read the townhouse tables.
  const trrebType = normalizeType(c) === 'townhouse' ? 'townhouse' : 'apartment'
  const trrebPromise = readTrrebBenchmark(
    c.min_beds,
    [c.area, ...(c.area_candidates ?? [])],
    trrebType,
  ).catch(() => null)

  // Stayloop's own listings come first (verified). If there aren't enough new
  // ones to meet what the user asked for, top up with external Realtor.ca.
  const stay = (await searchStayloop({ ...c, count: fetchCount })).filter(fresh)
  const extRes = await extPromise
  let market = buildMarket(c, extRes.statRows)
  const trreb = await trrebPromise
  if (market && trreb) market.trreb = trreb
  // The Realtor.ca sample was too thin (<3 clean prices) but the official
  // TRREB benchmark resolved — still show it: emit a minimal trreb-only
  // market object. sample=0 tells the chat card to hide the live-sample rows
  // (range / median / budget bar) and render only the benchmark section.
  if (!market && trreb) {
    market = {
      area: c.area || c.area_candidates?.[0] || 'Toronto',
      beds: c.min_beds ?? null,
      sample: 0,
      min: 0,
      median: 0,
      max: 0,
      budget: c.max_price ?? null,
      trreb,
    }
  }
  if (stay.length >= target) {
    const f = filterByStreetToken(stay, streetRef, areaLabel())
    return { listings: f.listings.slice(0, target), market, notice: f.notice }
  }

  // No synthetic fallback: when neither Stayloop nor Realtor.ca has a real
  // match, return empty and let the reply say so honestly. Fabricated cards
  // (budget-derived prices on a fixed street pool) are exactly what the
  // guardrail exists to prevent.
  const ext = extRes.cards.filter(fresh)
  const seen = new Set(stay.map((l) => l.address.toLowerCase()))
  const filled = [...stay, ...ext.filter((l) => !seen.has(l.address.toLowerCase()))]
  const f = filterByStreetToken(filled, streetRef, areaLabel())
  return { listings: f.listings.slice(0, target), market, notice: f.notice }
}

// ---------- Stayloop's own listings ----------
async function searchStayloop(c: SearchCriteria): Promise<ListingCard[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return []
  const p = new URLSearchParams()
  p.set(
    'select',
    'id,title,address,unit,city,neighborhood,monthly_rent,bedrooms,bathrooms,sqft,trust_tier,images,amenities,has_den,slug,source,verification_status'
  )
  p.set('is_active', 'eq.true')
  const wantType = normalizeType(c)
  if (wantType) {
    // Strict: rows without a property_type are excluded from typed searches —
    // an unclassified house showing up in a 公寓 search is exactly the bug.
    p.set('property_type', `in.(${TYPE_MATCHES[wantType].join(',')})`)
  }
  // Same visibility rule as the public listings page: verified, or
  // Realtor.ca-sourced (which display without verification). Combined with
  // the area OR-group via and=() — PostgREST allows only one bare `or` param.
  const visibility = LISTING_VISIBILITY_OR_GROUP
  // Location filter honours BOTH the plain area and the model-resolved
  // landmark neighbourhoods — a landmark turn may carry candidates with no
  // area at all, and skipping the filter then leaks other cities' rows.
  const areas = [c.area, ...(c.area_candidates ?? [])]
    .map((a) => (a || '').trim())
    .filter(Boolean)
  if (areas.length) {
    // Match city OR neighborhood OR address, for any area term. Spaces
    // become `*` wildcards so "North York" matches without value quoting.
    const ors = areas
      .map((a) => {
        const pat = `*${a.replace(/[,()"']/g, ' ').trim().replace(/\s+/g, '*')}*`
        return `city.ilike.${pat},neighborhood.ilike.${pat},address.ilike.${pat}`
      })
      .join(',')
    p.set('and', `(${visibility},or(${ors}))`)
  } else {
    p.set('or', `(${LISTING_VISIBILITY_OR})`)
  }
  if (c.max_price) p.set('monthly_rent', `lte.${Math.round(c.max_price)}`)
  if (c.min_beds) p.set('bedrooms', `gte.${Math.round(c.min_beds)}`)
  p.set('order', 'monthly_rent.asc')
  p.set('limit', String(Math.min(c.count ?? 4, 12)))
  try {
    const res = await fetch(`${url}/rest/v1/listings?${p.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const rows = (await res.json()) as Record<string, unknown>[]
    return rows.map((r) => {
      const imgs = r.images as unknown[] | null
      const amen = r.amenities as unknown[] | null
      return {
        // Realtor-imported rows are admitted by the visibility filter; label
        // them by their real source so the chat card shows the external /
        // unverified banner instead of counting them as Stayloop inventory.
        id: String(r.id),
        source: (r.source === 'realtor' ? 'realtor' : 'stayloop') as 'stayloop' | 'realtor',
        title: (r.title as string) || (r.address as string) || '房源',
        address: (() => {
          const a = ((r.address as string) || '').trim()
          const u = r.unit ? String(r.unit).trim() : ''
          // Some rows already embed the unit in the address ("605 - 28 Avondale…").
          return u && !a.toLowerCase().startsWith(u.toLowerCase()) ? `${u} - ${a}` : a
        })(),
        neighborhood: (r.neighborhood as string) || undefined,
        city: (r.city as string) || undefined,
        price: Number(r.monthly_rent) || 0,
        beds: Number(r.bedrooms) || 0,
        baths: r.bathrooms != null ? Number(r.bathrooms) : undefined,
        sqft: (r.sqft as number) || undefined,
        tier: (r.trust_tier as number) || undefined,
        image: Array.isArray(imgs) && imgs[0] ? String(imgs[0]) : STOCK[0],
        tags: [
          ...(r.has_den ? ['den'] : []),
          ...(Array.isArray(amen) ? amen.slice(0, 3).map(String) : []),
        ],
        url: r.slug ? `/listings/${r.slug}` : '/listings',
      }
    })
  } catch {
    return []
  }
}

// ---------- Live Realtor.ca via Jina (search → reader → parse) ----------
function isHouseQuery(kw?: string | null, propertyType?: string | null): boolean {
  if (propertyType === 'house' || propertyType === 'townhouse') return true
  if (propertyType === 'apartment' || propertyType === 'condo') return false
  return /house|整栋|独立屋|townhouse|联排|town\s?home/i.test(kw || '')
}

// Neighbourhood name → Realtor.ca URL slug ("Bay Street Corridor" →
// "bay-street-corridor"). Strictly [a-z0-9-] and the host is hardcoded at the
// call site, so model-provided names can never steer the fetch off-site.
function slugifyArea(name: string): string | null {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return /^[a-z0-9-]{3,60}$/.test(slug) ? slug : null
}

async function readRealtorPage(
  key: string,
  pageUrl: string,
  c: SearchCriteria,
): Promise<{ cards: ListingCard[]; rows: StatRow[] } | null> {
  try {
    const rres = await fetch(`https://r.jina.ai/${encodeURI(pageUrl)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(22000),
    })
    if (!rres.ok) return null
    return parseRealtor(await rres.text(), c)
  } catch {
    return null
  }
}

// Jina renders only the first ~11 rows of any Realtor.ca list page (JS
// pagination is invisible to the reader, and the raw HTML carries the same
// 11 listings). The way to approach "该区域所有同户型挂牌价" is the UNION of
// the area's page VARIANTS — each surfaces a different subset: the
// bed-filtered SEO page, apartments, condos, and the generic rentals page.
// Measured on North York 2-bed: 7 → 22 unique units. All fetched in
// parallel, so wall-clock stays ≈ one page read.
function statPageUrls(areaBase: string, beds: number | null | undefined, house: boolean): string[] {
  if (house) return [`${areaBase}/houses-for-rent`, `${areaBase}/rentals`]
  const urls = [`${areaBase}/apartments-for-rent`, `${areaBase}/condos-for-rent`, `${areaBase}/rentals`]
  if (beds && beds >= 1 && beds <= 4) urls.unshift(`${areaBase}/${beds}-bedroom-apartments-for-rent`)
  return urls
}

async function jinaRealtor(c: SearchCriteria): Promise<{ cards: ListingCard[]; statRows: StatRow[] }> {
  const EMPTY = { cards: [] as ListingCard[], statRows: [] as StatRow[] }
  const key = process.env.JINA_API_KEY
  if (!key) return EMPTY
  const area = c.area || 'Toronto'
  const house = isHouseQuery(c.keywords, normalizeType(c))
  // A house search implies ≥3 beds unless the user said otherwise.
  const crit = { ...c, min_beds: c.min_beds ?? (house ? 3 : undefined) }

  const cards: ListingCard[] = []
  // Market sample: the PRIMARY area's pages only — mixing adjacent
  // neighbourhoods would misstate "该片区" on the card.
  const statRows: StatRow[] = []
  const seen = new Set<string>()
  const merge = (r: { cards: ListingCard[]; rows: StatRow[] } | null, primary: boolean) => {
    if (!r) return
    if (primary) statRows.push(...r.rows)
    for (const card of r.cards) {
      const k = card.address.toLowerCase()
      if (!seen.has(k)) {
        seen.add(k)
        cards.push(card)
      }
    }
  }

  // 0. Landmark path: the model already resolved a vague location ("多大附近")
  //    into official neighbourhoods, so read those pages DIRECTLY — no search
  //    hop needed.
  const typePath = house ? 'houses-for-rent' : 'apartments-for-rent'
  const slugs = Array.from(
    new Set((c.area_candidates ?? []).map(slugifyArea).filter((s): s is string => !!s)),
  ).slice(0, 3)
  if (slugs.length) {
    // Primary area: ALL page variants IN PARALLEL — every one feeds the
    // market sample (deduped by address in buildMarket) and the card pool.
    const primaryBase = `https://www.realtor.ca/on/toronto/${slugs[0]}`
    const primaryReads = await Promise.all(
      statPageUrls(primaryBase, crit.min_beds, house).map((u) => readRealtorPage(key, u, crit)),
    )
    for (const r of primaryReads) merge(r, true)
    // Adjacent candidate pages top up CARDS only (consecutive searches
    // exclude already-shown addresses and drain thin pages fast).
    for (const slug of slugs.slice(1)) {
      if (cards.length >= (c.count ?? 4)) break
      merge(await readRealtorPage(key, `https://www.realtor.ca/on/toronto/${slug}/${typePath}`, crit), false)
    }
  }
  // Direct pages produced real rows (even if over budget) → that IS the
  // area's inventory; don't dilute it with the generic search fallback.
  if (statRows.length || cards.length) {
    cards.sort((a, b) => (house ? b.price - a.price : a.price - b.price))
    return { cards: cards.slice(0, Math.min(c.count ?? 4, 12)), statRows }
  }

  // 1. Find the Realtor.ca rentals page for this area.
  let pageUrl: string | null = null
  try {
    const q = `${area} Toronto ${house ? 'houses homes for rent' : 'apartments for rent'} site:realtor.ca`
    const sres = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'X-Respond-With': 'no-content' },
      signal: AbortSignal.timeout(18000),
    })
    if (sres.ok) {
      const d = (await sres.json()) as { data?: { url?: string }[] }
      const arr = Array.isArray(d?.data) ? d.data : []
      // Prefer a property-type-specific Realtor.ca page so a "house" search
      // doesn't land on the generic (mostly-condo) rentals page.
      const houseRe = /realtor\.ca\/on\/.+\/(houses?-for-rent|homes-for-rent|townhomes?-for-rent|detached)/i
      const aptRe = /realtor\.ca\/on\/.+\/(apartments-for-rent|condos?-for-rent|rentals)/i
      const anyRe = /realtor\.ca\/on\/.+\/(rentals|for-rent)/i
      // Among type-matching candidates, prefer the AREA-specific page: for
      // "University of Toronto" the results contain both the generic
      // /on/toronto/apartments-for-rent and the campus-specific slug —
      // taking the first regex hit used to always pick the generic one.
      const tokens = area.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && w !== 'toronto')
      const areaScore = (u: string) => tokens.reduce((n, t) => n + (u.toLowerCase().includes(t) ? 1 : 0), 0)
      const candidates = arr.map((r) => r.url || '').filter((u) => /realtor\.ca/i.test(u))
      const best = (re: RegExp | null): string | null => {
        let bestU: string | null = null
        let bestS = -1
        for (const u of candidates) {
          if (re && !re.test(u)) continue
          const s = areaScore(u)
          if (s > bestS) {
            bestS = s
            bestU = u
          }
        }
        return bestU
      }
      pageUrl = best(house ? houseRe : aptRe) || best(anyRe) || candidates[0] || null
    }
  } catch {
    /* fall through */
  }
  // Only ever hand the reader a genuine realtor.ca URL — never an arbitrary
  // host that slipped through the search results (SSRF hardening).
  if (!pageUrl || !/^https:\/\/(www\.)?realtor\.ca\//i.test(pageUrl)) return EMPTY

  // 2. Read the page — plus every sibling variant of the same area base, in
  //    parallel — parse all rows, then filter + rank for relevance.
  const baseM = pageUrl.match(/^(https:\/\/www\.realtor\.ca\/on\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\/[a-z0-9-]+$/i)
  const urls = baseM ? Array.from(new Set([pageUrl, ...statPageUrls(baseM[1], crit.min_beds, house)])) : [pageUrl]
  const reads = await Promise.all(urls.map((u) => readRealtorPage(key, u, crit)))
  if (reads.every((r) => !r)) return EMPTY
  for (const r of reads) merge(r, true)
  // Rank by budget relevance: houses → priciest-within-budget first
  // (closest to a high target like $6000); apartments → cheapest first.
  cards.sort((a, b) => (house ? b.price - a.price : a.price - b.price))
  return { cards: cards.slice(0, Math.min(c.count ?? 4, 12)), statRows }
}

function parseRealtor(md: string, c: SearchCriteria): { cards: ListingCard[]; rows: StatRow[] } {
  const out: ListingCard[] = []
  // Every bed-matching row (address + price), BEFORE the budget cap — the
  // honest market sample for the area, not just what fits the user's budget.
  // Address keys let the caller dedupe the same unit across page variants.
  const rows: StatRow[] = []
  for (const line of md.split('\n')) {
    if (!/\$[\d,]+\s*\/\s*Month/i.test(line)) continue
    const priceM = line.match(/\$([\d,]+)\s*\/\s*Month/i)
    if (!priceM) continue
    const price = parseInt(priceM[1].replace(/,/g, ''), 10)
    if (!price) continue
    const url = line.match(/\]\((https:\/\/www\.realtor\.ca\/real-estate\/[^)]+)\)/)?.[1]
    const image = line.match(/(https:\/\/cdn\.realtor\.ca\/listings\/[^)\s]+\.jpg)/)?.[1]
    const addrRaw = (line.match(/\/Month(?:ly)?\s+(.+?)\s+!\[/)?.[1] || '').trim()
    const bedsM = line.match(/(\d+)(?:\s*\+\s*(\d+))?\s+Bedrooms?/i)
    const bathsM = line.match(/(\d+)\s+Bathrooms?/i)
    const sqftM = line.match(/(\d+)[\d\-+]*\s+Square\s*Feet/i)
    const beds = bedsM ? parseInt(bedsM[1], 10) : 0
    const hasDen = !!(bedsM && bedsM[2])
    if (c.min_beds && beds < c.min_beds) continue
    const neighborhood = addrRaw.match(/\(([^)]+)\)/)?.[1]
    const street = addrRaw.split(',')[0].trim()
    rows.push({ address: street || addrRaw || `row-${rows.length}`, price })
    if (c.max_price && price > c.max_price) continue
    const sqft = sqftM ? parseInt(sqftM[1], 10) : 0
    out.push({
      id: url ? url.split('/').slice(-2, -1)[0] || `r-${out.length}` : `r-${out.length}`,
      source: 'realtor',
      title: hasDen ? `${beds}B + den` : beds ? `${beds}B 房源` : '工作室',
      address: street || addrRaw,
      neighborhood,
      city: 'Toronto',
      price,
      beds,
      baths: bathsM ? parseInt(bathsM[1], 10) : undefined,
      sqft: sqft > 0 ? sqft : undefined,
      image: image || STOCK[out.length % STOCK.length],
      url,
      tags: hasDen ? ['den'] : undefined,
      note: '外部房源 · Realtor.ca 实时 · 未经 Stayloop 验证',
    })
    if (out.length >= 40) break // safety cap; caller ranks + slices to 4
  }
  return { cards: out, rows }
}


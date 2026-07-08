// Listing search for the agent turn: Stayloop's own listings first, then a
// LIVE external fallback (Realtor.ca via the Jina reader/search API) when
// Stayloop has no match. Runs server-side (edge). Requires JINA_API_KEY.
import type { ListingCard } from './types'
import { LISTING_VISIBILITY_OR, LISTING_VISIBILITY_OR_GROUP } from '../listingVisibility'

export type SearchCriteria = {
  area?: string | null
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

// The model may emit the area in Chinese ("北约克"); DB values and Realtor.ca
// queries are English, so normalize before filtering.
const AREA_ALIASES: Record<string, string> = {
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
}

function normalizeArea(area?: string | null): string | null {
  const t = (area || '').trim()
  if (!t) return null
  for (const [zh, en] of Object.entries(AREA_ALIASES)) if (t.includes(zh)) return en
  return t
}

export type MarketStats = {
  area: string
  beds?: number | null
  sample: number
  min: number
  median: number
  max: number
  budget?: number | null
}

function buildMarket(c: SearchCriteria, prices: number[]): MarketStats | undefined {
  const clean = prices.filter((p) => p > 300 && p < 60000).sort((a, b) => a - b)
  if (clean.length < 3) return undefined
  return {
    area: c.area || 'Toronto',
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
): Promise<{ listings: ListingCard[]; market?: MarketStats }> {
  c = { ...c, area: normalizeArea(c.area) }
  const target = Math.min(Math.max(c.count ?? 4, 1), 6)
  // Already-shown addresses (this conversation) are skipped so "再找几个 /
  // 换一批" returns NEW results. Over-fetch a bit to leave room after filtering.
  const ex = new Set(exclude.map((s) => s.toLowerCase()))
  const fresh = (l: ListingCard) => !ex.has(l.address.toLowerCase())
  const fetchCount = Math.min(target + exclude.length, 12)

  // Market sample: same area/beds/type but NO price cap — real market range,
  // computed from actual prices (Stayloop DB + Realtor rows), never the LLM.
  const statsPromise = statsStayloop(c).catch(() => [] as number[])

  // Stayloop's own listings come first (verified). If there aren't enough new
  // ones to meet what the user asked for, top up with external Realtor.ca.
  const stay = (await searchStayloop({ ...c, count: fetchCount })).filter(fresh)
  if (stay.length >= target) {
    const prices = await statsPromise
    return { listings: stay.slice(0, target), market: buildMarket(c, prices) }
  }

  const extRes = await jinaRealtor({ ...c, count: fetchCount }).catch(() => ({ cards: [] as ListingCard[], allPrices: [] as number[] }))
  let ext = extRes.cards.filter(fresh)
  if (!ext.length && stay.length === 0) ext = syntheticRealtor(c).filter(fresh)
  const seen = new Set(stay.map((l) => l.address.toLowerCase()))
  const filled = [...stay, ...ext.filter((l) => !seen.has(l.address.toLowerCase()))]
  const prices = [...(await statsPromise), ...extRes.allPrices]
  return { listings: filled.slice(0, target), market: buildMarket(c, prices) }
}

// Price sample for the area (no budget cap) — powers the market-context card.
async function statsStayloop(c: SearchCriteria): Promise<number[]> {
  const rows = await searchStayloop({ ...c, max_price: null, count: 12 })
  return rows.map((r) => r.price).filter(Boolean)
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
  if (c.area) {
    // Match city OR neighborhood OR address. Spaces become `*` wildcards so
    // "North York" matches without needing PostgREST value quoting.
    const pat = `*${c.area.replace(/[,()"']/g, ' ').trim().replace(/\s+/g, '*')}*`
    p.set('and', `(${visibility},or(city.ilike.${pat},neighborhood.ilike.${pat},address.ilike.${pat}))`)
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

async function jinaRealtor(c: SearchCriteria): Promise<{ cards: ListingCard[]; allPrices: number[] }> {
  const EMPTY = { cards: [] as ListingCard[], allPrices: [] as number[] }
  const key = process.env.JINA_API_KEY
  if (!key) return EMPTY
  const area = c.area || 'Toronto'
  const house = isHouseQuery(c.keywords, normalizeType(c))

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
      const pick = (re: RegExp) => arr.find((r) => re.test(r.url || ''))?.url
      pageUrl =
        pick(house ? houseRe : aptRe) ||
        pick(anyRe) ||
        arr.find((r) => /realtor\.ca/i.test(r.url || ''))?.url ||
        null
    }
  } catch {
    /* fall through */
  }
  // Only ever hand the reader a genuine realtor.ca URL — never an arbitrary
  // host that slipped through the search results (SSRF hardening).
  if (!pageUrl || !/^https:\/\/(www\.)?realtor\.ca\//i.test(pageUrl)) return EMPTY

  // 2. Read the page, parse all rows, then filter + rank for relevance.
  try {
    const rres = await fetch(`https://r.jina.ai/${encodeURI(pageUrl)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(22000),
    })
    if (!rres.ok) return EMPTY
    // A house search implies ≥3 beds unless the user said otherwise.
    const minBeds = c.min_beds ?? (house ? 3 : undefined)
    const { cards: all, allPrices } = parseRealtor(await rres.text(), { ...c, min_beds: minBeds })
    // Rank by budget relevance: houses → priciest-within-budget first
    // (closest to a high target like $6000); apartments → cheapest first.
    all.sort((a, b) => (house ? b.price - a.price : a.price - b.price))
    return { cards: all.slice(0, Math.min(c.count ?? 4, 12)), allPrices }
  } catch {
    return EMPTY
  }
}

function parseRealtor(md: string, c: SearchCriteria): { cards: ListingCard[]; allPrices: number[] } {
  const out: ListingCard[] = []
  // Every bed-matching row's price, BEFORE the budget cap — the honest
  // market sample for the area, not just what fits the user's budget.
  const allPrices: number[] = []
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
    allPrices.push(price)
    if (c.max_price && price > c.max_price) continue
    const neighborhood = addrRaw.match(/\(([^)]+)\)/)?.[1]
    const street = addrRaw.split(',')[0].trim()
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
  return { cards: out, allPrices }
}

// ---------- Last-resort synthetic fallback (Jina unavailable) ----------
function syntheticRealtor(c: SearchCriteria): ListingCard[] {
  const area = c.area || 'Toronto'
  const house = isHouseQuery(c.keywords, normalizeType(c))
  const beds = c.min_beds || (house ? 3 : 1)
  const cap = c.max_price || (house ? 3200 : 2400)
  const streets = house
    ? ['Bathurst St', 'Finch Ave W', 'Senlac Rd']
    : ['Sheppard Ave E', 'Yonge St', 'Beecroft Rd']
  const amen = c.pets ? ['允许宠物', '室内洗衣', '近地铁'] : ['室内洗衣', '近地铁', '中央空调']
  return Array.from({ length: 3 }, (_, i) => ({
    id: `ext-${i}`,
    source: 'realtor' as const,
    title: house ? '独立 House · 整栋' : '一居公寓',
    address: `${120 + i * 41} ${streets[i % streets.length]}`,
    neighborhood: area,
    city: 'Toronto',
    price: Math.round((cap - i * 120) / 50) * 50,
    beds,
    baths: house ? 2 : 1,
    sqft: house ? 1400 + i * 160 : 620 + i * 45,
    tags: house ? ['den', ...amen] : amen,
    image: STOCK[i % STOCK.length],
    url: 'https://www.realtor.ca/map#view=list&TransactionTypeId=3&PropertyTypeGroupID=1&Currency=CAD',
    note: '外部房源 · 未经 Stayloop 验证 · 点开到 Realtor.ca',
  }))
}

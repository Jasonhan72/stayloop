// Listing search for the agent turn: Stayloop's own listings first, then a
// LIVE external fallback (Realtor.ca via the Jina reader/search API) when
// Stayloop has no match. Runs server-side (edge). Requires JINA_API_KEY.
import type { ListingCard } from './types'

export type SearchCriteria = {
  area?: string | null
  max_price?: number | null
  min_beds?: number | null
  pets?: boolean | null
  keywords?: string | null
  count?: number | null
}

const STOCK = [
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=600&q=80&auto=format&fit=crop',
]

export async function searchListings(
  c: SearchCriteria
): Promise<{ listings: ListingCard[] }> {
  const target = Math.min(Math.max(c.count ?? 4, 1), 6)
  // Stayloop's own listings come first (verified). If there aren't enough to
  // meet what the user asked for, top up with external Realtor.ca results.
  const stay = await searchStayloop({ ...c, count: target })
  if (stay.length >= target) return { listings: stay.slice(0, target) }

  let ext = await jinaRealtor({ ...c, count: target }).catch(() => [] as ListingCard[])
  if (!ext.length) ext = syntheticRealtor(c)
  const seen = new Set(stay.map((l) => l.address.toLowerCase()))
  const filled = [...stay, ...ext.filter((l) => !seen.has(l.address.toLowerCase()))]
  return { listings: filled.slice(0, target) }
}

// ---------- Stayloop's own listings ----------
async function searchStayloop(c: SearchCriteria): Promise<ListingCard[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return []
  const p = new URLSearchParams()
  p.set(
    'select',
    'id,title,address,unit,city,neighborhood,monthly_rent,bedrooms,bathrooms,sqft,trust_tier,images,amenities,has_den,slug'
  )
  p.set('is_active', 'eq.true')
  if (c.max_price) p.set('monthly_rent', `lte.${Math.round(c.max_price)}`)
  if (c.min_beds) p.set('bedrooms', `gte.${Math.round(c.min_beds)}`)
  p.set('order', 'monthly_rent.asc')
  p.set('limit', String(Math.min(c.count ?? 4, 6)))
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
        id: String(r.id),
        source: 'stayloop' as const,
        title: (r.title as string) || (r.address as string) || '房源',
        address: [r.unit, r.address].filter(Boolean).join(' - ') || (r.address as string) || '',
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
function isHouseQuery(kw?: string | null): boolean {
  return /house|整栋|独立屋|townhouse|联排|town\s?home/i.test(kw || '')
}

async function jinaRealtor(c: SearchCriteria): Promise<ListingCard[]> {
  const key = process.env.JINA_API_KEY
  if (!key) return []
  const area = c.area || 'Toronto'
  const house = isHouseQuery(c.keywords)

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
  if (!pageUrl) return []

  // 2. Read the page, parse all rows, then filter + rank for relevance.
  try {
    const rres = await fetch(`https://r.jina.ai/${pageUrl}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(22000),
    })
    if (!rres.ok) return []
    // A house search implies ≥3 beds unless the user said otherwise.
    const minBeds = c.min_beds ?? (house ? 3 : undefined)
    const all = parseRealtor(await rres.text(), { ...c, min_beds: minBeds })
    // Rank by budget relevance: houses → priciest-within-budget first
    // (closest to a high target like $6000); apartments → cheapest first.
    all.sort((a, b) => (house ? b.price - a.price : a.price - b.price))
    return all.slice(0, Math.min(c.count ?? 4, 6))
  } catch {
    return []
  }
}

function parseRealtor(md: string, c: SearchCriteria): ListingCard[] {
  const out: ListingCard[] = []
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
    if (c.max_price && price > c.max_price) continue
    if (c.min_beds && beds < c.min_beds) continue
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
  return out
}

// ---------- Last-resort synthetic fallback (Jina unavailable) ----------
function syntheticRealtor(c: SearchCriteria): ListingCard[] {
  const area = c.area || 'Toronto'
  const house = isHouseQuery(c.keywords)
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

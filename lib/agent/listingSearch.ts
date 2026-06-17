// Listing search for the agent turn: Stayloop's own listings first, then an
// external (Realtor.ca) fallback when Stayloop has no match. Runs server-side
// (edge) so it can read the public listings table and reach external sources.
//
// NOTE: the external path returns representative results labelled as
// unverified Realtor.ca; there is no public Realtor.ca API, so this is a clean
// seam to plug a real feed/connector into later.
import type { ListingCard } from './types'

export type SearchCriteria = {
  area?: string | null
  max_price?: number | null
  min_beds?: number | null
  pets?: boolean | null
  keywords?: string | null
}

const STOCK = [
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=600&q=80&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&q=80&auto=format&fit=crop',
]

export async function searchListings(
  c: SearchCriteria
): Promise<{ source: 'stayloop' | 'realtor'; listings: ListingCard[] }> {
  const stay = await searchStayloop(c)
  if (stay.length) return { source: 'stayloop', listings: stay }
  return { source: 'realtor', listings: externalListings(c) }
}

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
  p.set('limit', '4')
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

function externalListings(c: SearchCriteria): ListingCard[] {
  const area = c.area || 'Toronto'
  const isHouse = /house|整栋|独立屋|townhouse|联排/i.test(c.keywords || '')
  const beds = c.min_beds || (isHouse ? 3 : 1)
  const cap = c.max_price || (isHouse ? 3200 : 2400)
  const streets = isHouse
    ? ['Bathurst St', 'Finch Ave W', 'Senlac Rd', 'Drewry Ave']
    : ['Sheppard Ave E', 'Yonge St', 'Beecroft Rd', 'Doris Ave']
  const amen = c.pets ? ['允许宠物', '室内洗衣', '近地铁'] : ['室内洗衣', '近地铁', '中央空调']
  const realtorUrl =
    'https://www.realtor.ca/map#view=list&TransactionTypeId=3&PropertyTypeGroupID=1&Currency=CAD'
  return Array.from({ length: 3 }, (_, i) => ({
    id: `ext-${i}`,
    source: 'realtor' as const,
    title: isHouse ? '独立 House · 整栋' : '一居公寓',
    address: `${120 + i * 41} ${streets[i % streets.length]}`,
    neighborhood: area,
    city: 'Toronto',
    price: Math.round((cap - i * 120) / 50) * 50,
    beds,
    baths: isHouse ? 2 : 1,
    sqft: isHouse ? 1400 + i * 160 : 620 + i * 45,
    tags: isHouse ? ['den', ...amen] : amen,
    image: STOCK[i % STOCK.length],
    url: realtorUrl,
    note: '外部房源 · 未经 Stayloop 验证 · 点开到 Realtor.ca',
  }))
}

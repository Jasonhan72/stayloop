// Listing detail page after the StreetEasy comparison (user 2026-09-25: "看一下
// 这个房源详情页，我们的内容需要增加"): price facts, a policies grid, unit vs
// building features, price history, transit, neighbourhood medians + the
// TRREB benchmark. Pure helpers here; the page and the enrich route pinned by
// their source.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { amenityLabel, daysOnMarket, fmtDistance, groupFeatures, lastPriceChange, median, pickTransit, pricePerSqft, transitKind, walkMinutes } from '@/lib/listingInsights'

const read = (p: string) => readFileSync(p, 'utf8')

describe('listing insight helpers', () => {
  it('price facts', () => {
    expect(pricePerSqft(2700, 799)).toBe(3.38)
    expect(pricePerSqft(2700, null)).toBeNull()
    expect(daysOnMarket('2026-09-20T12:00:00Z', new Date('2026-09-25T12:00:00Z'))).toBe(5)
    expect(daysOnMarket(null)).toBeNull()
    expect(lastPriceChange([{ date: '2026-09-01', price: 2700, event: 'listed' }, { date: '2026-09-20', price: 2650, prev: 2700, event: 'changed' }])).toEqual({ date: '2026-09-20', delta: -50, pct: -1.9 })
    expect(lastPriceChange([{ date: '2026-09-01', price: 2700 }])).toBeNull()
    expect(median([2100, 2700, 2250])).toBe(2250)
    expect(median([2100, 2700])).toBe(2400)
    expect(median([])).toBeNull()
  })
  it('wizard amenity ids get labels; free text is split into unit vs building; nothing is listed twice', () => {
    expect(amenityLabel('parking_spot', 'zh')).toBe('1 个车位')
    expect(amenityLabel('Locker', 'zh')).toBe('Locker')
    const g = groupFeatures({ amenities: ['Locker', '24hr Concierge', 'Fitness Centre', 'Balcony', 'in_unit_laundry', 'Party Room', 'balcony'], appliances: ['Dishwasher'], building_features: ['Visitor Parking'] }, 'zh')
    expect(g.unit).toEqual(['洗碗机', '阳台', '室内洗衣机']) // known words are translated in the zh UI
    expect(g.building).toEqual(['Visitor Parking', 'Locker', '24hr Concierge', 'Fitness Centre', 'Party Room'])
    expect(groupFeatures({ amenities: ['laundry room'] }, 'en').building).toEqual(['laundry room'])
  })
  it('transit: kinds from OSM tags, one entry per station, nearest first, at most one streetcar stop', () => {
    expect(transitKind({ railway: 'station', station: 'subway', network: 'TTC' })).toBe('subway')
    expect(transitKind({ railway: 'station', network: 'GO Transit' })).toBe('go')
    expect(transitKind({ railway: 'tram_stop' })).toBe('streetcar')
    expect(transitKind({ amenity: 'cafe' })).toBeNull()
    const here = { lat: 43.6663, lng: -79.3865 } // 1001 Bay St
    const stops = pickTransit([
      { lat: 43.6650, lon: -79.3838, tags: { railway: 'station', station: 'subway', name: 'Wellesley' } },
      { lat: 43.6650, lon: -79.3838, tags: { railway: 'station', station: 'subway', name: 'Wellesley' } }, // platform duplicate
      { lat: 43.6673, lon: -79.3850, tags: { railway: 'tram_stop', name: 'Bay St at Wellesley' } },
      { lat: 43.6680, lon: -79.3860, tags: { railway: 'tram_stop', name: 'Bay St at St Joseph' } },
      { lat: 43.6455, lon: -79.3806, tags: { railway: 'station', network: 'GO Transit', name: 'Union Station' } }, // 2.3 km → out
    ], here.lat, here.lng)
    expect(stops.map((s) => s.name)).toEqual(['Bay St at Wellesley', 'Wellesley'])
    expect(stops[1].kind).toBe('subway')
    expect(fmtDistance(stops[1].distance_m, 'zh')).toMatch(/ m$/)
    expect(walkMinutes(260)).toBe(4)
    expect(fmtDistance(1240, 'en')).toBe('1.2 km')
  })
})

describe('page, route and migration', () => {
  it('the page shows the new sections and asks the enrich route once per listing', () => {
    const page = read('app/listings/[slug]/page.tsx')
    for (const eyebrow of ['eyebrow="POLICIES"', 'eyebrow="PRICE HISTORY"', 'eyebrow="LOCATION"', 'eyebrow="NEIGHBOURHOOD"']) expect(page).toContain(eyebrow)
    expect(page).toContain("fetch('/api/listings/enrich', { method: 'POST'")
    expect(page).toContain("readTrrebBenchmark(listing.bedrooms ?? 1, [listing.neighborhood, listing.city]")
    expect(page).toContain('groupFeatures({ amenities: listing.amenities, building_features: listing.building_features, appliances: listing.appliances }, lang)')
    expect(page).toContain('daysOnMarket(listing.published_at || listing.created_at)')
    expect(page).toContain('data © OpenStreetMap contributors')
  })
  it('the enrich route serves public listings only, rate-limits by IP, identifies itself to OSM and caches for 30 days', () => {
    const r = read('app/api/listings/enrich/route.ts')
    expect(r).toContain("if (!l || !l.is_active || !(l.verification_status === 'verified' || l.source === 'realtor')) return NextResponse.json({ error: 'not_found' }, { status: 404 })")
    expect(r).toContain("underHourlyLimit(`listing-enrich:${ip}`, 90, true)")
    expect(r).toContain("'User-Agent': UA")
    expect(r).toContain('https://overpass-api.de/api/interpreter')
    expect(r).toContain('https://nominatim.openstreetmap.org/search')
    expect(r).toContain('const FRESH_MS = 30 * 86_400_000')
  })
  it('price history is trigger-maintained and seeded; transit is cached on the row', () => {
    const sql = read('supabase/migrations/20260925_listings_history_transit.sql')
    expect(sql).toContain('create trigger listings_price_history before insert or update on public.listings')
    expect(sql).toContain("jsonb_build_object('date', current_date, 'price', new.monthly_rent, 'prev', old.monthly_rent, 'event', 'changed')")
    expect(sql).toContain('add column if not exists transit jsonb')
    expect(sql).toContain('revoke execute on function public.listings_price_history() from anon, authenticated')
  })
})

describe('second round (user 2026-09-25: Airbnb header, neighbourhood block, map with transit, StreetEasy similar cards)', () => {
  const page = read('app/listings/[slug]/page.tsx')
  it('title block above the photos: crumb · address as the only H1 · badge · one-line summary; share and save untouched', () => {
    expect(page).toContain('<h1 className="mt-2 text-[30px] font-extrabold tracking-tight sm:text-[36px]">{listing.address}{listing.unit ? ` #${listing.unit}` : \'\'}</h1>')
    expect((page.match(/<h1 /g) || []).length).toBe(2) // the listing title + the not-found state
    expect(page).toContain("{zh ? '分享' : 'Share'}")
    expect(page).toContain("{fav ? (zh ? '取消收藏' : 'Saved') : (zh ? '收藏' : 'Save')}")
    expect(page).toContain("zh ? '整套公寓' : 'Entire apartment'")
  })
  it('one neighbourhood block: AI primer (labelled) + asking / leased / this-listing tiles', () => {
    expect(page).toContain("{zh ? 'AI 根据公开资料整理的社区简介 · 不含数字与人群描述 · 仅供了解'")
    expect(page).toContain("{zh ? '出租 · 挂牌价' : 'Rentals · asking'}")
    expect(page).toContain("{zh ? '出租 · 成交均价' : 'Rentals · leased'}")
    expect(page).toContain("{zh ? '这套房源' : 'This listing'}")
    const r = read('app/api/listings/enrich/route.ts')
    expect(r).toContain("from('neighborhood_profiles')")
    expect(r).toContain('Do NOT include numbers, years, prices')
    expect(r).toContain("if (!zh || !en || hardNumber.test(zh) || hardNumber.test(en)) {") // money / % / years / big figures reject the primer; "Line 1" is fine
    expect(read('supabase/migrations/20260925_neighborhood_profiles.sql')).toContain('revoke all on public.neighborhood_profiles from anon, authenticated, public')
  })
  it('location and transit share one section with the listing map; similar homes are full cards with a heart, ranked by area → beds → rent', () => {
    expect(page).toContain('eyebrow="LOCATION"')
    expect(page).not.toContain('eyebrow="TRANSIT"')
    expect(page).toContain('<ListingLocationMap lat={insight.lat} lng={insight.lng}')
    expect(read('components/ListingsMap.tsx')).toContain('export function loadGoogleMaps(')
    expect(page).toContain("{zh ? '相似房源' : 'Similar homes'}")
    expect(page).toContain('onClick={() => toggle(snapS)}')
    expect(page).not.toContain("sl-eyebrow\">{zh ? '类似房源'")
    expect(page).toContain(".filter((x) => x.images && x.images.length > 0).sort((a, b) => score(a) - score(b)).slice(0, 3)")
  })
})

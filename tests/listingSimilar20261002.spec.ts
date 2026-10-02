// "Similar homes" ranking (user 2026-10-02): location first, then layout, then
// rent. Fixture = the 13 publicly visible production listings on 2026-10-02
// (is_active AND verified-or-realtor), the columns rankSimilar reads.
import { describe, expect, it } from 'vitest'
import { haversineMeters } from '@/lib/listingInsights'
import { normalizeNeighbourhood, rankSimilar, similarSearchBox, typeFamily, type SimilarListing } from '@/lib/listingSimilar'

const REALTOR_IMPORT = '2026-09-07 02:52:31.570757+00'
const ROWS: SimilarListing[] = [
  { slug: '1001-bay-st-mugm2yal', address: '1001 Bay St', city: 'Toronto', neighborhood: 'Bay Street Corridor', lat: 43.665416, lng: -79.387074, bedrooms: 1, has_den: true, property_type: 'condo', monthly_rent: 2700, created_at: '2026-09-25 07:00:28.421464+00' },
  { slug: '1105-203-college-street-toronto-waips', address: '1105 - 203 COLLEGE STREET', city: 'Toronto', neighborhood: 'Kensington-Chinatown', lat: 43.65861, lng: -79.39563, bedrooms: 1, has_den: true, property_type: 'condo', monthly_rent: 3200, created_at: REALTOR_IMPORT },
  { slug: '155-merchants-wharf-mqym7orq', address: "155 Merchants' Wharf", city: 'Toronto', neighborhood: 'Harbourfront / Waterfront Communities', lat: 43.6462, lng: -79.36141, bedrooms: 2, has_den: false, property_type: 'condo', monthly_rent: 6500, created_at: '2026-06-29 02:45:11.123845+00' },
  { slug: '1569-rue-st-hubert-montr-al-qc-h2l-3z1-mr33ii5a', address: '1569 rue St-Hubert, Montréal, QC, H2L 3Z1', city: 'Montréal', neighborhood: 'Ville-Marie / Quartier des Spectacles', lat: 45.51648, lng: -73.56076, bedrooms: 2, has_den: false, property_type: 'condo', monthly_rent: 2225, created_at: '2026-07-02 06:00:34.036335+00' },
  { slug: '1802-210-simcoe-street-toronto-nrhao', address: '1802 - 210 SIMCOE STREET', city: 'Toronto', neighborhood: 'University', lat: 43.6525, lng: -79.38843, bedrooms: 1, has_den: true, property_type: 'condo', monthly_rent: 2300, created_at: REALTOR_IMPORT },
  { slug: '238-simcoe-st-mqyimf8x', address: '238 Simcoe St', city: 'Toronto, ON', neighborhood: 'Downtown / Entertainment District', lat: 43.65369, lng: -79.38908, bedrooms: 3, has_den: false, property_type: 'condo', monthly_rent: 6500, created_at: '2026-06-29 01:04:40.173124+00' },
  { slug: '280-dundas-street-w-mugm71ht', address: '280 Dundas Street W', city: 'Toronto', neighborhood: 'Kensington-Chinatown', lat: 43.65463, lng: -79.39063, bedrooms: 1, has_den: false, property_type: 'condo', monthly_rent: 2250, created_at: '2026-09-25 07:03:39.181001+00' },
  { slug: '516-297-college-street-toronto-ouknm', address: '516 - 297 COLLEGE STREET', city: 'Toronto', neighborhood: 'Kensington-Chinatown', lat: 43.65745, lng: -79.40166, bedrooms: 2, has_den: false, property_type: 'condo', monthly_rent: 3200, created_at: REALTOR_IMPORT },
  { slug: '601-181-huron-street-toronto-bpjxe', address: '601 - 181 HURON STREET', city: 'Toronto', neighborhood: 'Kensington-Chinatown', lat: 43.65804, lng: -79.3979, bedrooms: 2, has_den: false, property_type: 'condo', monthly_rent: 3290, created_at: REALTOR_IMPORT },
  { slug: '605-28-avondale-ave-north-york-toronto-on-mr9vmlor', address: '605 - 28 Avondale Ave, North York, Toronto, ON', city: 'Toronto', neighborhood: 'Yonge & Sheppard, North York', lat: 43.75877, lng: -79.40845, bedrooms: 2, has_den: false, property_type: 'condo', monthly_rent: 4500, created_at: '2026-07-06 23:54:11.541044+00' },
  { slug: '608-1080-bay-street-toronto-tj6cv', address: '608 - 1080 BAY STREET', city: 'Toronto', neighborhood: 'Bay Street Corridor', lat: 43.6668, lng: -79.38867, bedrooms: 1, has_den: false, property_type: 'condo', monthly_rent: 2800, created_at: REALTOR_IMPORT },
  { slug: '609-195-mccaul-street-toronto-hi7la', address: '609 - 195 MCCAUL STREET', city: 'Toronto', neighborhood: 'Kensington-Chinatown', lat: 43.65673, lng: -79.39211, bedrooms: 1, has_den: true, property_type: 'condo', monthly_rent: 2325, created_at: REALTOR_IMPORT },
  { slug: '8-colvestone-road-toronto-c3ry3', address: '8 COLVESTONE ROAD', city: 'Toronto', neighborhood: 'Forest Hill', lat: 43.6884, lng: -79.4185, bedrooms: 8, has_den: false, property_type: 'house', monthly_rent: 13800, created_at: '2026-05-08 04:33:50.015341+00' },
]

const bySlug = (s: string) => {
  const r = ROWS.find((x) => x.slug.startsWith(s))
  if (!r) throw new Error(`no fixture row ${s}`)
  return r
}
const slugsFor = (s: string) => rankSimilar(bySlug(s), ROWS).map((m) => m.listing.slug)
const base = (over: Partial<SimilarListing>): SimilarListing => ({
  slug: 'x', address: '1 Test St', city: 'Toronto', neighborhood: null, lat: 43.6532, lng: -79.3832, bedrooms: 1, has_den: false, property_type: 'condo', monthly_rent: 2500, created_at: '2026-09-01T00:00:00Z', ...over,
})
/** A point `m` metres north of (lat, lng). */
const north = (lat: number, m: number) => lat + m / ((2 * Math.PI * 6_371_000) / 360)

describe('rankSimilar on the production listings', () => {
  it('Avondale (Yonge & Sheppard) has nothing within 6 km → no cards, never downtown fillers', () => {
    expect(slugsFor('605-28-avondale')).toEqual([])
  })

  it('Montréal has no other listing nearby → none', () => {
    expect(slugsFor('1569-rue-st-hubert')).toEqual([])
  })

  it('280 Dundas W → three 1+den units, all within 0.6 km, cheapest gap first', () => {
    const r = rankSimilar(bySlug('280-dundas'), ROWS)
    expect(r.map((m) => m.listing.slug)).toEqual([
      '1802-210-simcoe-street-toronto-nrhao',
      '609-195-mccaul-street-toronto-hi7la',
      '1105-203-college-street-toronto-waips',
    ])
    for (const m of r) {
      expect(m.distance_m).not.toBeNull()
      expect(m.distance_m!).toBeLessThanOrEqual(600)
      expect(m.location_tier).toBe(1)
      expect(m.unit_tier).toBe(1)
      expect(m.den_differs).toBe(true)
      expect(m.bedroom_delta).toBe(0)
      expect(m.same_type_family).toBe(true)
    }
    expect(r[0].rent_delta).toBe(50)
    expect(r[2].rent_delta).toBe(950)
    // 1080 Bay is the same layout (1 bed, no den) but 1.4 km away: layout never beats location.
    expect(r.map((m) => m.listing.slug)).not.toContain('608-1080-bay-street-toronto-tj6cv')
  })

  it('every page matches the agreed proposal', () => {
    expect(slugsFor('1001-bay')).toEqual(['608-1080-bay-street-toronto-tj6cv', '609-195-mccaul-street-toronto-hi7la', '1802-210-simcoe-street-toronto-nrhao'])
    expect(slugsFor('608-1080-bay')).toEqual(['1001-bay-st-mugm2yal', '280-dundas-street-w-mugm71ht', '1105-203-college-street-toronto-waips'])
    expect(slugsFor('609-195-mccaul')).toEqual(['1802-210-simcoe-street-toronto-nrhao', '1105-203-college-street-toronto-waips', '280-dundas-street-w-mugm71ht'])
    expect(slugsFor('601-181-huron')).toEqual(['516-297-college-street-toronto-ouknm', '1105-203-college-street-toronto-waips', '609-195-mccaul-street-toronto-hi7la'])
    expect(slugsFor('1802-210-simcoe')).toEqual(['609-195-mccaul-street-toronto-hi7la', '1105-203-college-street-toronto-waips', '280-dundas-street-w-mugm71ht'])
    expect(slugsFor('1105-203-college')).toEqual(['609-195-mccaul-street-toronto-hi7la', '1802-210-simcoe-street-toronto-nrhao', '280-dundas-street-w-mugm71ht'])
    expect(slugsFor('516-297-college')).toEqual(['601-181-huron-street-toronto-bpjxe', '1105-203-college-street-toronto-waips', '609-195-mccaul-street-toronto-hi7la'])
    expect(slugsFor('155-merchants-wharf')).toEqual(['238-simcoe-st-mqyimf8x', '601-181-huron-street-toronto-bpjxe'])
    expect(slugsFor('238-simcoe')).toEqual(['601-181-huron-street-toronto-bpjxe', '155-merchants-wharf-mqym7orq'])
    // An 8-bed house at $13,800: no listing within ±2 bedrooms and 0.5×–2× rent.
    expect(slugsFor('8-colvestone')).toEqual([])
  })

  it('never returns the listing itself or anything beyond 6 km', () => {
    for (const me of ROWS) {
      for (const m of rankSimilar(me, ROWS)) {
        expect(m.listing.slug).not.toBe(me.slug)
        expect(m.distance_m!).toBeLessThanOrEqual(6000)
        expect(Math.abs(m.bedroom_delta!)).toBeLessThanOrEqual(2)
        const rent = Number(m.listing.monthly_rent), mine = Number(me.monthly_rent)
        expect(rent).toBeGreaterThanOrEqual(mine * 0.5)
        expect(rent).toBeLessThanOrEqual(mine * 2)
      }
    }
  })

  it('results are ordered by location tier, then unit tier, on every page', () => {
    for (const me of ROWS) {
      const r = rankSimilar(me, ROWS, { limit: 20 })
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i]
        expect(a.location_tier).toBeLessThanOrEqual(b.location_tier)
        if (a.location_tier === b.location_tier) expect(a.unit_tier!).toBeLessThanOrEqual(b.unit_tier!)
      }
    }
  })

  it('same bedrooms beats ±1 within a tier: 297 College (2 bed, 0.3 km) before 203 College (1+den, 0.2 km)', () => {
    const r = rankSimilar(bySlug('601-181-huron'), ROWS)
    expect(r[0].listing.slug).toBe('516-297-college-street-toronto-ouknm')
    expect(r[0].unit_tier).toBe(0)
    expect(r[1].listing.slug).toBe('1105-203-college-street-toronto-waips')
    expect(r[1].unit_tier).toBe(2)
    expect(r[1].bedroom_delta).toBe(-1)
    expect(r[1].distance_m!).toBeLessThan(r[0].distance_m!)
  })

  it('238 Simcoe and 210 Simcoe are two buildings 140 m apart, not "same building"', () => {
    const a = base({ slug: 'a', address: '238 Simcoe St', lat: 43.65369, lng: -79.38908, monthly_rent: 2400 })
    const b = base({ slug: 'b', address: '1802 - 210 SIMCOE STREET', lat: 43.6525, lng: -79.38843, monthly_rent: 2300 })
    const [m] = rankSimilar(a, [b])
    expect(m.same_building).toBe(false)
    expect(m.location_tier).toBe(1)
    expect(m.distance_m!).toBeLessThan(200)
  })
})

describe('rankSimilar ordering rules', () => {
  const me = base({ slug: 'me', address: '100 Queen St W', monthly_rent: 2500 })

  it('rent never outranks a closer location tier', () => {
    const close = base({ slug: 'close', address: '1 Close St', lat: north(43.6532, 800), monthly_rent: 4900 }) // L1, ~96% dearer
    const far = base({ slug: 'far', address: '1 Far St', lat: north(43.6532, 2000), monthly_rent: 2500 }) // L2, same rent
    const farther = base({ slug: 'farther', address: '1 Farther St', lat: north(43.6532, 5000), monthly_rent: 2500 }) // L3
    expect(rankSimilar(me, [farther, far, close]).map((m) => [m.listing.slug, m.location_tier])).toEqual([['close', 1], ['far', 2], ['farther', 3]])
  })

  it('layout never yields to rent inside a tier, and den differences rank between same and ±1', () => {
    const plus1 = base({ slug: 'plus1', address: '2 A St', bedrooms: 2, monthly_rent: 2500 })
    const den = base({ slug: 'den', address: '2 B St', has_den: true, monthly_rent: 4000 })
    const same = base({ slug: 'same', address: '2 C St', monthly_rent: 4900 })
    const plus2 = base({ slug: 'plus2', address: '2 D St', bedrooms: 3, monthly_rent: 2500 })
    const r = rankSimilar(me, [plus2, plus1, den, same], { limit: 10 })
    expect(r.map((m) => [m.listing.slug, m.unit_tier])).toEqual([['same', 0], ['den', 1], ['plus1', 2], ['plus2', 3]])
  })

  it('the same building outranks a neighbour next door', () => {
    const neighbour = base({ slug: 'neighbour', address: '102 Queen St W', lat: north(43.6532, 50) })
    const sameBuilding = base({ slug: 'same-building', address: '1203 - 100 Queen Street West', lat: north(43.6532, 60), monthly_rent: 3500 })
    const r = rankSimilar(me, [neighbour, sameBuilding])
    expect(r[0].listing.slug).toBe('same-building')
    expect(r[0].same_building).toBe(true)
    expect(r[0].location_tier).toBe(0)
    expect(r[1].location_tier).toBe(1)
  })

  it('property-type family breaks ties before rent', () => {
    const town = base({ slug: 'town', address: '3 A St', property_type: 'townhouse', monthly_rent: 2500 })
    const condo = base({ slug: 'condo', address: '3 B St', property_type: 'apartment', monthly_rent: 2900 })
    const r = rankSimilar(me, [town, condo])
    expect(r.map((m) => [m.listing.slug, m.same_type_family])).toEqual([['condo', true], ['town', false]])
  })

  it('price ascending inside a tier and type family; rent_delta is signed dollars', () => {
    const cheaper = base({ slug: 'cheaper', address: '4 A St', monthly_rent: 2300 })
    const dearer = base({ slug: 'dearer', address: '4 B St', monthly_rent: 2600 })
    const r = rankSimilar(me, [cheaper, dearer])
    expect(r.map((m) => [m.listing.slug, m.rent_delta])).toEqual([['dearer', 100], ['cheaper', -200]])
  })

  it('deterministic tie-breaks: distance, then newest, then slug — independent of input order', () => {
    const near = base({ slug: 'z-near', address: '5 A St', lat: north(43.6532, 100) })
    const farA = base({ slug: 'b-far', address: '5 B St', lat: north(43.6532, 300), created_at: REALTOR_IMPORT })
    const farB = base({ slug: 'a-far', address: '5 C St', lat: north(43.6532, 300), created_at: REALTOR_IMPORT })
    const farNew = base({ slug: 'c-far-new', address: '5 D St', lat: north(43.6532, 300), created_at: '2026-09-30T00:00:00Z' })
    const input = [farA, farNew, near, farB]
    const expected = ['z-near', 'c-far-new', 'a-far', 'b-far']
    expect(rankSimilar(me, input, { limit: 10 }).map((m) => m.listing.slug)).toEqual(expected)
    expect(rankSimilar(me, [...input].reverse(), { limit: 10 }).map((m) => m.listing.slug)).toEqual(expected)
  })

  it('eligibility: ±2 bedrooms, 0.5×–2× rent, 6 km — and never padded', () => {
    const tooBig = base({ slug: 'too-big', address: '6 A St', bedrooms: 4 })
    const tooCheap = base({ slug: 'too-cheap', address: '6 B St', monthly_rent: 1249 })
    const tooDear = base({ slug: 'too-dear', address: '6 C St', monthly_rent: 5001 })
    const tooFar = base({ slug: 'too-far', address: '6 D St', lat: north(43.6532, 6100) })
    const edge = base({ slug: 'edge', address: '6 E St', lat: north(43.6532, 5990), monthly_rent: 5000 })
    expect(rankSimilar(me, [tooBig, tooCheap, tooDear, tooFar, edge]).map((m) => m.listing.slug)).toEqual(['edge'])
  })

  it('limit defaults to 3; coordinates may arrive as strings; duplicates and self are skipped', () => {
    const many = Array.from({ length: 6 }, (_, i) => base({ slug: `n${i}`, address: `${10 + i} A St`, lat: String(north(43.6532, 100 * (i + 1))), lng: '-79.3832' }))
    const r = rankSimilar(me, [me, ...many, many[0]])
    expect(r.map((m) => m.listing.slug)).toEqual(['n0', 'n1', 'n2'])
    expect(r[0].distance_m).toBe(100)
  })
})

describe('rankSimilar without coordinates', () => {
  const me = base({ slug: 'me', address: '7 Home St', lat: null, lng: null, neighborhood: 'Kensington-Chinatown' })

  it('uses the same neighbourhood only: L1, no distance', () => {
    const hood = base({ slug: 'hood', address: '8 A St', neighborhood: 'kensington  chinatown' })
    const other = base({ slug: 'other', address: '8 B St', neighborhood: 'University' })
    const r = rankSimilar(me, [hood, other])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ distance_m: null, location_tier: 1, same_neighbourhood: true })
  })

  it('a same-named neighbourhood in another city is not the same neighbourhood', () => {
    const elsewhere = base({ slug: 'elsewhere', address: '8 C St', city: 'Hamilton', neighborhood: 'Kensington-Chinatown' })
    expect(rankSimilar(me, [elsewhere])).toEqual([])
  })

  it('opts.origin supplies coordinates the row does not have yet (enrich geocodes lazily)', () => {
    const near = base({ slug: 'near', address: '9 A St', lat: north(43.6532, 400) })
    expect(rankSimilar(me, [near])).toEqual([])
    const r = rankSimilar(me, [near], { origin: { lat: 43.6532, lng: -79.3832 } })
    expect(r[0]).toMatchObject({ distance_m: 400, location_tier: 1 })
  })

  it('same neighbourhood within 6 km caps the tier at L1 even when farther than 1 km', () => {
    const meAt = base({ slug: 'me2', address: '7 Home St', neighborhood: 'The Annex' })
    const hood = base({ slug: 'hood2', address: '8 D St', neighborhood: 'the annex', lat: north(43.6532, 1800) })
    const [m] = rankSimilar(meAt, [hood])
    expect(m).toMatchObject({ location_tier: 1, same_neighbourhood: true })
    // …but a neighbourhood name never pulls in a listing beyond 6 km.
    const farHood = base({ slug: 'hood3', address: '8 E St', neighborhood: 'The Annex', lat: north(43.6532, 7000) })
    expect(rankSimilar(meAt, [farHood])).toEqual([])
  })
})

describe('helpers', () => {
  it('normalizeNeighbourhood strips accents, & → and, punctuation → space', () => {
    expect(normalizeNeighbourhood('Ville-Marie / Quartier des Spectacles')).toBe('ville marie quartier des spectacles')
    expect(normalizeNeighbourhood('Yonge & Sheppard, North York')).toBe('yonge and sheppard north york')
    expect(normalizeNeighbourhood('Montréal  Côte-des-Neiges')).toBe('montreal cote des neiges')
    expect(normalizeNeighbourhood(null)).toBe('')
  })

  it('typeFamily groups property types', () => {
    expect(typeFamily('condo')).toBe('apartment')
    expect(typeFamily('Apartment')).toBe('apartment')
    expect(typeFamily('loft')).toBe('apartment')
    expect(typeFamily('Condo Townhouse')).toBe('townhouse')
    expect(typeFamily('house')).toBe('house')
    expect(typeFamily('Semi-Detached')).toBe('house')
    expect(typeFamily('duplex')).toBe('house')
    expect(typeFamily('basement')).toBe('basement')
    expect(typeFamily(null)).toBeNull()
  })

  it('similarSearchBox contains the 6 km circle at Toronto and Montréal latitudes', () => {
    for (const [lat, lng] of [[43.65463, -79.39063], [45.51648, -73.56076]]) {
      const box = similarSearchBox(lat, lng)
      // 6 km due north / east is inside the box…
      expect(haversineMeters(lat, lng, box.maxLat, lng)).toBeGreaterThanOrEqual(6000)
      expect(haversineMeters(lat, lng, lat, box.maxLng)).toBeGreaterThanOrEqual(6000)
      expect(haversineMeters(lat, lng, box.minLat, lng)).toBeGreaterThanOrEqual(6000)
      expect(haversineMeters(lat, lng, lat, box.minLng)).toBeGreaterThanOrEqual(6000)
      // …and the box is not much bigger than the circle.
      expect(haversineMeters(lat, lng, box.maxLat, lng)).toBeLessThan(6200)
      expect(haversineMeters(lat, lng, lat, box.maxLng)).toBeLessThan(6200)
    }
    expect(similarSearchBox(45.5, -73.5).maxLng - (-73.5)).toBeGreaterThan(similarSearchBox(43.65, -79.4).maxLng - (-79.4))
  })
})

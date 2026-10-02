// "Similar homes" on the listing detail page (user 2026-10-02: "首先是要地段相似，
// 其次，是要房型相似。再次，是要价格相似"). Strict lexicographic ranking, so rent
// can never outrank location or layout:
//   1. location tier  L0 same building · L1 ≤ 1.0 km or same neighbourhood ·
//                     L2 ≤ 2.5 km · L3 ≤ 6 km
//   2. unit tier      U0 same bedrooms + den · U1 den differs · U2 ±1 bed · U3 ±2
//   3. property-type family (condo/apartment vs townhouse vs house vs basement)
//   4. |rent − this rent| / this rent
//   tie-breaks: exact distance → newest → slug (seven Realtor rows share one
//   created_at, so the order has to be fully determined).
// Eligibility is a filter, not a rank: |Δbedrooms| ≤ 2, rent within 0.5×–2×,
// and within 6 km (same neighbourhood or same building when either side has no
// coordinates). Nothing qualifies → no cards; never pad with far listings (the
// Avondale page used to show downtown units 11–13 km away). Pure, no I/O —
// tests/listingSimilar20261002.spec.ts.
import { haversineMeters } from '@/lib/listingInsights'
import { streetKey } from '@/lib/lease/householdMatch'

export const SIMILAR_RADIUS_M = 6000
export const SIMILAR_LIMIT = 3
/** L1 = walking distance (~12 min). */
const WALK_M = 1000
/** L2 = a stop or two on the subway / streetcar. */
const NEARBY_M = 2500
/** Same street key further apart than this is a data error or another city, not one building. */
const SAME_BUILDING_MAX_M = 500
/** Metres per degree of latitude on the sphere haversineMeters uses (R = 6,371 km). */
const M_PER_DEG = (2 * Math.PI * 6_371_000) / 360

export type LocationTier = 0 | 1 | 2 | 3
export type UnitTier = 0 | 1 | 2 | 3
export type TypeFamily = 'apartment' | 'townhouse' | 'house' | 'basement' | 'room'

/** The listing columns the ranking reads (a DBListing row satisfies it). numeric columns may arrive as strings. */
export type SimilarListing = {
  id?: string | null
  slug: string
  address: string | null
  city?: string | null
  neighborhood?: string | null
  lat?: number | string | null
  lng?: number | string | null
  bedrooms?: number | null
  has_den?: boolean | null
  property_type?: string | null
  monthly_rent: number | string | null
  created_at?: string | null
}

export type SimilarMatch<T> = {
  listing: T
  /** Straight-line metres; null when either side has no coordinates. */
  distance_m: number | null
  location_tier: LocationTier
  same_building: boolean
  same_neighbourhood: boolean
  /** null when this listing's bedroom count is unknown (layout is then not compared). */
  unit_tier: UnitTier | null
  /** candidate − this listing; null when either is unknown. */
  bedroom_delta: number | null
  /** Same bedroom count, one has a den and the other does not. */
  den_differs: boolean
  same_type_family: boolean
  /** candidate − this listing, dollars per month (negative = cheaper). */
  rent_delta: number
}

export type RankSimilarOptions = {
  /** Default 3. */
  limit?: number
  /** Coordinates for this listing when its row has none yet (enrich geocodes lazily). */
  origin?: { lat: number; lng: number } | null
}

/** "Ville-Marie / Quartier des Spectacles" → "ville marie quartier des spectacles"; "Yonge & Sheppard" → "yonge and sheppard". */
export function normalizeNeighbourhood(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** "Toronto, ON" and "Toronto" are the same city; "Montréal" = "montreal". */
function normalizeCity(city: string | null | undefined): string {
  return normalizeNeighbourhood(String(city ?? '').split(',')[0])
}

/** Two cities can be compared only when both are known; unknown never blocks a match. */
function citiesCompatible(a: SimilarListing, b: SimilarListing): boolean {
  const ca = normalizeCity(a.city), cb = normalizeCity(b.city)
  return !ca || !cb || ca === cb
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function coordsOf(rawLat: unknown, rawLng: unknown): { lat: number; lng: number } | null {
  const lat = num(rawLat), lng = num(rawLng)
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/**
 * Bounding box for the candidate query: ±radius in latitude and in longitude at
 * this latitude (a degree of longitude is ~80 km in Toronto, ~78 km in
 * Montréal). 1% margin so the box always contains the haversine circle; the
 * exact distance filter runs in rankSimilar.
 */
export function similarSearchBox(lat: number, lng: number, radiusM = SIMILAR_RADIUS_M): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = (radiusM / M_PER_DEG) * 1.01
  const cos = Math.max(0.01, Math.cos((lat * Math.PI) / 180))
  const dLng = (radiusM / (M_PER_DEG * cos)) * 1.01
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng }
}

/** apartment = condo / apartment / loft / studio; townhouse; house = house / semi / detached / duplex; basement; room. */
export function typeFamily(propertyType: string | null | undefined): TypeFamily | null {
  const t = String(propertyType ?? '').toLowerCase()
  if (!t.trim()) return null
  if (/basement|地下室/.test(t)) return 'basement'
  if (/town\s?house|town\s?home|\brow\b|联排/.test(t)) return 'townhouse'
  if (/semi|detached|duplex|triplex|fourplex|bungalow|house|独立屋|半独立/.test(t)) return 'house'
  if (/condo|apartment|\bapt\b|loft|studio|公寓/.test(t)) return 'apartment'
  if (/\broom\b|单间/.test(t)) return 'room'
  return null
}

function locationTierFor(distance: number | null, sameBuilding: boolean, sameHood: boolean): LocationTier | null {
  if (sameBuilding) return 0
  if (distance !== null) {
    if (distance > SIMILAR_RADIUS_M) return null
    if (distance <= WALK_M || sameHood) return 1
    return distance <= NEARBY_M ? 2 : 3
  }
  // No coordinates on one side: the neighbourhood is the only location fact left.
  return sameHood ? 1 : null
}

function createdMs(l: SimilarListing): number {
  const t = l.created_at ? Date.parse(l.created_at) : NaN
  return Number.isFinite(t) ? t : -Infinity
}

/**
 * Up to `limit` listings similar to `me`, best first, each with the facts the
 * card shows (distance, same building / neighbourhood, layout difference,
 * rent difference). `candidates` may include `me` itself — it is skipped.
 */
export function rankSimilar<T extends SimilarListing>(me: SimilarListing, candidates: readonly T[], opts: RankSimilarOptions = {}): SimilarMatch<T>[] {
  const limit = Math.max(0, opts.limit ?? SIMILAR_LIMIT)
  const origin = coordsOf(me.lat, me.lng) ?? coordsOf(opts.origin?.lat, opts.origin?.lng)
  const myKey = streetKey(me.address)
  const myHood = normalizeNeighbourhood(me.neighborhood)
  const myBeds = num(me.bedrooms)
  const myDen = !!me.has_den
  const myRent = num(me.monthly_rent)
  const myFamily = typeFamily(me.property_type)

  const out: (SimilarMatch<T> & { _created: number })[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    if (!c || !c.slug) continue
    if (c.slug === me.slug || (me.id && c.id && c.id === me.id)) continue
    const uid = c.id || c.slug
    if (seen.has(uid)) continue
    seen.add(uid)

    // Location.
    const cc = coordsOf(c.lat, c.lng)
    const distance = origin && cc ? haversineMeters(origin.lat, origin.lng, cc.lat, cc.lng) : null
    const ck = streetKey(c.address)
    // Same street key = same building (238 vs 210 Simcoe, 140 m apart, are two buildings);
    // without coordinates the cities must not disagree.
    const sameBuilding = !!myKey && myKey === ck && (distance !== null ? distance <= SAME_BUILDING_MAX_M : citiesCompatible(me, c))
    const cHood = normalizeNeighbourhood(c.neighborhood)
    const sameHood = !!myHood && myHood === cHood && citiesCompatible(me, c)
    const locationTier = locationTierFor(distance, sameBuilding, sameHood)
    if (locationTier === null) continue

    // Layout.
    const beds = num(c.bedrooms)
    let unitTier: UnitTier | null = null
    let bedroomDelta: number | null = null
    let denDiffers = false
    if (myBeds !== null) {
      if (beds === null) continue
      bedroomDelta = beds - myBeds
      const abs = Math.abs(bedroomDelta)
      if (abs > 2) continue
      denDiffers = abs === 0 && !!c.has_den !== myDen
      unitTier = abs === 0 ? (denDiffers ? 1 : 0) : abs === 1 ? 2 : 3
    }

    // Rent.
    const rent = num(c.monthly_rent)
    if (myRent !== null && myRent > 0) {
      if (rent === null || rent < myRent * 0.5 || rent > myRent * 2) continue
    }
    const rentDelta = rent !== null && myRent !== null ? rent - myRent : 0
    const family = typeFamily(c.property_type)

    out.push({
      listing: c,
      distance_m: distance,
      location_tier: locationTier,
      same_building: sameBuilding,
      same_neighbourhood: sameHood,
      unit_tier: unitTier,
      bedroom_delta: bedroomDelta,
      den_differs: denDiffers,
      same_type_family: !!myFamily && family === myFamily,
      rent_delta: rentDelta,
      _created: createdMs(c),
    })
  }

  const priceGap = (m: SimilarMatch<T>) => (myRent !== null && myRent > 0 ? Math.abs(m.rent_delta) / myRent : 0)
  out.sort((a, b) =>
    a.location_tier - b.location_tier ||
    (a.unit_tier ?? 4) - (b.unit_tier ?? 4) ||
    Number(b.same_type_family) - Number(a.same_type_family) ||
    priceGap(a) - priceGap(b) ||
    (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity) ||
    (b._created > a._created ? 1 : b._created < a._created ? -1 : 0) ||
    (a.listing.slug < b.listing.slug ? -1 : a.listing.slug > b.listing.slug ? 1 : 0),
  )
  return out.slice(0, limit).map(({ _created, ...m }) => m)
}

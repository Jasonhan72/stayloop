// Pure helpers for the listing detail page's added content (StreetEasy
// comparison, 2026-09-25): days on market, $/ft², the policies grid, unit vs
// building features, price history, transit distances, neighbourhood medians.
// No I/O — tests/listingDetail20260925.spec.ts.
import type { Lang } from '@/lib/i18n'

export type PriceEvent = { date: string; price: number; prev?: number | null; event?: string }
export type TransitStop = { name: string; kind: 'subway' | 'go' | 'streetcar' | 'rail'; lines?: string[]; distance_m: number; lat?: number; lng?: number }
/** `failed` marks a lookup that could not reach OpenStreetMap: shown as "temporarily unavailable" and retried after an hour, never cached as "no stations" for 30 days. */
export type ListingTransit = { stations: TransitStop[]; fetched_at?: string; failed?: boolean }

/** Days since the listing went live (published_at, else created_at). */
export function daysOnMarket(since: string | null | undefined, now = new Date()): number | null {
  if (!since) return null
  const t = Date.parse(since)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

/** Monthly rent per square foot, two decimals (StreetEasy shows $/ft²). */
export function pricePerSqft(rent: number, sqft: number | null | undefined): number | null {
  if (!sqft || sqft <= 0 || !rent) return null
  return Math.round((rent / sqft) * 100) / 100
}

/** Walking minutes at 80 m/min, rounded up. */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.ceil(meters / 80))
}

export function fmtDistance(meters: number, lang: Lang): string {
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toFixed(1)} km`
}

/** The most recent change in a price history (needs at least two entries). */
export function lastPriceChange(history: PriceEvent[] | null | undefined): { date: string; delta: number; pct: number } | null {
  if (!Array.isArray(history) || history.length < 2) return null
  // Sorted by date, not by array position; a zero "before" price has no percentage.
  const rows = history.filter((h) => h && typeof h.price === 'number' && typeof h.date === 'string').sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length < 2) return null
  const last = rows[rows.length - 1]
  const before = rows[rows.length - 2]
  const delta = last.price - before.price
  if (!delta || before.price <= 0) return null
  return { date: last.date.slice(0, 10), delta, pct: Math.round((delta / before.price) * 1000) / 10 }
}

export function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2)
}

// Wizard amenity ids (app/dashboard/listings/*/edit) — the detail page used to
// print the raw id ("parking_spot"). Imported listings carry free text.
const AMENITY_LABEL: Record<string, { zh: string; en: string }> = {
  central_ac: { zh: '中央空调', en: 'Central A/C' },
  heat_incl: { zh: '包暖', en: 'Heat included' },
  water_incl: { zh: '包水', en: 'Water included' },
  pool: { zh: '游泳池', en: 'Swimming pool' },
  gym: { zh: '健身房', en: 'Fitness centre' },
  dishwasher: { zh: '洗碗机', en: 'Dishwasher' },
  in_unit_laundry: { zh: '室内洗衣机', en: 'In-unit laundry' },
  concierge: { zh: '24 小时前台', en: '24h concierge' },
  parking_spot: { zh: '1 个车位', en: '1 parking spot' },
  storage: { zh: '储物柜', en: 'Storage locker' },
  balcony: { zh: '阳台', en: 'Balcony' },
  rooftop: { zh: '天台', en: 'Rooftop' },
}
export function amenityLabel(a: string, lang: Lang): string {
  const hit = AMENITY_LABEL[a.trim().toLowerCase()]
  return hit ? (lang === 'zh' ? hit.zh : hit.en) : a.trim()
}

const UNIT_RE = /in-?\s?unit|ensuite|en-suite|dishwasher|washer|dryer|balcony|hardwood|laminate|stainless|granite|quartz|walk-?in|closet|air ?con|\ba\/c\b|central air|fireplace|island|floor|window|洗碗|洗衣|烘干|阳台|硬木|空调|衣帽|壁炉|地板|包暖|包水|heat_incl|water_incl|central_ac/i
// Review 2026-09-25: Realtor.ca's usual building words (Recreation Centre, Games Room, Car Wash,
// Intercom, coin laundry, tennis / squash court, hot tub, parking) were landing under "室内".
const BUILDING_RE = /concierge|doorman|gym|fitness|exercise|pool|sauna|whirlpool|hot tub|party|rooftop|roof|elevator|security|intercom|bike|storage|locker|visitor|parking|playroom|theat|media|bbq|guest suite|laundry room|laundry facilit|coin|recreation|games|meeting|common room|car wash|court|yoga|lounge|business|courtyard|garden|游泳|健身|前台|电梯|储物|停车|车位|派对|天台|访客|门禁|会所|24h|24 小时/i

/** Unit features vs building amenities (StreetEasy splits "Home features" from
 *  "Building amenities"). Appliances are always the unit's; building_features
 *  always the building's; free-text amenities are classified by keyword —
 *  "in-unit" wins over a building word ("in-unit laundry" is not the laundry room). */
export function groupFeatures(input: { amenities?: string[] | null; building_features?: string[] | null; appliances?: string[] | null }, lang: Lang): { unit: string[]; building: string[] } {
  const unit: string[] = []
  const building: string[] = []
  const seen = new Set<string>()
  const push = (arr: string[], label: string) => {
    const k = label.toLowerCase()
    if (!label || seen.has(k)) return
    seen.add(k)
    arr.push(label)
  }
  const strings = (xs: unknown[] | null | undefined) => (xs || []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  for (const a of strings(input.appliances)) push(unit, amenityLabel(a, lang))
  for (const a of strings(input.building_features)) push(building, amenityLabel(a, lang))
  for (const a of strings(input.amenities)) {
    const label = amenityLabel(a, lang)
    // Classify on the raw value AND both labels so the split does not depend on the UI language.
    const probe = `${a} ${amenityLabel(a, 'zh')} ${amenityLabel(a, 'en')}`
    if (/in-?\s?unit|ensuite|en-suite|室内/i.test(probe)) push(unit, label)
    else if (BUILDING_RE.test(probe)) push(building, label)
    else if (UNIT_RE.test(probe)) push(unit, label)
    else push(unit, label)
  }
  return { unit, building }
}

/** Lines printed after a station name ("Line 1 · Line 2", "504"), from OSM tags. */
export function transitLines(tags: Record<string, string | undefined>): string[] {
  const out = new Set<string>()
  for (const key of ['route_ref', 'line', 'lines', 'ref']) {
    const v = tags[key]
    if (!v) continue
    // `ref` on a TTC node is often the stop number (14234), not a line.
    for (const part of v.split(/[;,/]/)) { const p = part.trim(); if (p && p.length <= 24 && !(key === 'ref' && /^\d{4,}$/.test(p))) out.add(p) }
    if (out.size) break
  }
  return [...out].slice(0, 4)
}

/** OSM node → our stop kind, or null when the node is not a rider-facing stop. */
export function transitKind(tags: Record<string, string | undefined>): TransitStop['kind'] | null {
  const station = (tags.station || '').toLowerCase()
  const net = `${tags.network || ''} ${tags.operator || ''}`.toLowerCase()
  if (tags.railway === 'tram_stop') return 'streetcar'
  if (station === 'subway' || tags.subway === 'yes') return 'subway'
  if (tags.railway === 'station' || tags.public_transport === 'station') {
    if (station === 'light_rail' || tags.light_rail === 'yes') return 'rail'
    if (/go transit|metrolinx|\bgo\b/.test(net)) return 'go' // a VIA-only station is rail, not GO
    return 'rail'
  }
  return null
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)))
}

/** Rider-facing list from raw OSM nodes: one entry per station name (nearest
 *  node wins), subway / GO / rail first, at most one streetcar stop, six total. */
export function pickTransit(nodes: { lat: number; lon: number; tags?: Record<string, string | undefined> }[], lat: number, lng: number): TransitStop[] {
  const byName = new Map<string, TransitStop>()
  for (const n of nodes) {
    const tags = n.tags || {}
    const kind = transitKind(tags)
    const name = (tags.name || '').trim()
    if (!kind || !name) continue
    const d = haversineMeters(lat, lng, n.lat, n.lon)
    if (kind === 'streetcar' && d > 600) continue
    if (kind !== 'streetcar' && d > 1500) continue
    const key = `${kind}:${name.toLowerCase()}`
    const cur = byName.get(key)
    if (!cur || cur.distance_m > d) byName.set(key, { name, kind, lines: transitLines(tags), distance_m: d, lat: n.lat, lng: n.lon })
  }
  const all = [...byName.values()].sort((a, b) => a.distance_m - b.distance_m)
  const stations = all.filter((s) => s.kind !== 'streetcar').slice(0, 5)
  const tram = all.find((s) => s.kind === 'streetcar')
  return tram ? [...stations, tram].sort((a, b) => a.distance_m - b.distance_m).slice(0, 6) : stations
}

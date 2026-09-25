// A follow-up turn regenerates the draft card from a 200-char history: on
// turn one the model read the Realtor.ca page and got 1001 Bay St #1618 at
// $2,700 with a den; on turn two ("补充：面积 799…") it had lost the page and
// "remembered" $2,800 and no den (landlord walk-through 2026-09-25). This is
// the deterministic guard: a fact extracted earlier survives a re-draft
// unless the user's own message mentions the new value; dropped photos and
// amenities come back too. Pure — tests/walkthrough20260925.spec.ts.
import type { DraftListing } from './types'

const GUARDED = ['monthly_rent', 'bedrooms', 'bathrooms', 'sqft', 'unit', 'address'] as const

const norm = (s: string) => s.toLowerCase().replace(/[\s,，、]/g, '')

// Street-type words and directions are abbreviated differently by the model
// and by Realtor.ca ("St W" / "Street West"); the street NAME must match whole.
const STREET_NOISE = /\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|cres|crescent|crt|court|ct|pl|place|way|lane|ln|trail|trl|terr|terrace|pkwy|parkway|hwy|highway|sq|square|circle|cir|e|east|w|west|n|north|s|south|unit|apt|suite|#)\b/g

/** Same street number + same street name (whole word) = the same property,
 *  whatever the abbreviation. Review 2026-09-25: the first three letters were
 *  compared, so "100 King St W" and "100 Kingston Rd" counted as one
 *  property and a re-draft "restored" the other building's rent and photos. */
export function sameProperty(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const na = norm(a), nb = norm(b)
  if (na === nb) return true
  const numA = a.match(/\d+/)?.[0], numB = b.match(/\d+/)?.[0]
  if (!numA || numA !== numB) return false
  const street = (s: string) => s.toLowerCase().replace(/^\s*[\d\-]+[a-z]?\s*/, '').split(/[,，]/)[0].replace(STREET_NOISE, ' ').replace(/[^a-z一-鿿]+/g, ' ').trim()
  const sa = street(a), sb = street(b)
  return sa.length > 0 && sa === sb
}

function mentioned(message: string, value: unknown): boolean {
  const m = norm(message)
  if (typeof value === 'number') return m.includes(String(value).replace(/\.0+$/, ''))
  if (typeof value === 'string') { const v = norm(value); return v.length > 0 && m.includes(v) }
  return false
}

export function reconcileDraft(prev: DraftListing | null | undefined, next: DraftListing, message: string): DraftListing {
  if (!prev) return next
  const same = sameProperty(prev.address, next.address) || (!!prev.unit && prev.unit === next.unit && !next.address)
  if (!same) return next
  const out: DraftListing = { ...next }
  for (const k of GUARDED) {
    const p = prev[k], n = next[k]
    if (p == null || p === '') continue
    if (n == null || n === '') { (out as Record<string, unknown>)[k] = p; continue } // dropped → restore
    if (p === n) continue
    if (!mentioned(message, n)) (out as Record<string, unknown>)[k] = p // changed without the user saying so → keep the earlier fact
  }
  if (prev.has_den != null && next.has_den !== prev.has_den && !/den|书房/i.test(message)) out.has_den = prev.has_den
  if (prev.images?.length && (next.images?.length ?? 0) < prev.images.length && !/照片|photo|图片|图/i.test(message)) out.images = prev.images
  if (prev.amenities?.length && !next.amenities?.length) out.amenities = prev.amenities
  return out
}

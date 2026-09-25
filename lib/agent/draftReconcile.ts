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

/** Same street number + same street name start = the same property, whatever the abbreviation. */
export function sameProperty(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const na = norm(a), nb = norm(b)
  if (na === nb) return true
  const numA = na.match(/\d+/)?.[0], numB = nb.match(/\d+/)?.[0]
  const streetA = na.replace(/\d+/g, '').slice(0, 3), streetB = nb.replace(/\d+/g, '').slice(0, 3)
  return !!numA && numA === numB && !!streetA && streetA === streetB
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

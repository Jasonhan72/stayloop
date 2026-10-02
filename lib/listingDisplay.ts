// Display helpers for the listing detail page (pure; tests in
// tests/walkthrough20260925.spec.ts and tests/siteTest20261002_g2.spec.ts).

import { normUnit, splitUnit } from '@/lib/agent/draftExisting'

/** True when the address already carries the unit up front ("608 - 1080 BAY
 *  STREET" with unit 608) — Realtor.ca imports store it both ways, and the
 *  title read "608 - 1080 BAY STREET #608" (site test 2026-10-02 · D-06). */
export function addressHasUnit(address: string | null | undefined, unit: string | null | undefined): boolean {
  const u = normUnit(unit)
  if (!u) return false
  const lead = splitUnit(address).unit
  return !!lead && normUnit(lead) === u
}

/** The one display title for a listing: address, plus " #unit" only when the
 *  address does not already start with that unit. H1, similar-homes cards,
 *  map label and the agent picker all use it. */
export function listingTitle(address: string | null | undefined, unit: string | null | undefined): string {
  const a = String(address ?? '').trim()
  const u = String(unit ?? '').trim()
  if (!u || addressHasUnit(a, u)) return a
  return `${a} #${u}`
}

/** Free-text parking ("不含车位（可选租 $100/月）") used to render as 有 — the
 *  walk-through listing said the opposite (2026-09-25). */
export function parkingStat(text: string | null | undefined, zh: boolean): string {
  const t = (text || '').trim()
  if (!t) return zh ? '未提供' : 'Not provided'
  if (/^(不含|无|没有|不带|不提供|no\b|none|not included|without)/i.test(t)) {
    return /(可租|可选租|另租|available|extra|additional|\$)/i.test(t) ? (zh ? '可另租' : 'Available (extra)') : (zh ? '不含' : 'Not included')
  }
  return zh ? '有' : 'Yes'
}

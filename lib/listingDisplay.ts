// Display helpers for the listing detail page (pure; tests in
// tests/walkthrough20260925.spec.ts and tests/siteTest20261002_g2.spec.ts).

import { normUnit, splitUnit } from '@/lib/agent/draftExisting'
import { splitBilingual } from '@/lib/listingLang'
import { effectiveProvince, normalizeProvince, provinceName, type ProvinceCode, type ProvinceRow } from '@/lib/provinces/detect'

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
 *  walk-through listing said the opposite (2026-09-25). "待确认（请告知是否含停车位）"
 *  rendered as 有 / Yes too (155 Merchants' Wharf, 2026-10-02): an unconfirmed
 *  value is 未说明 / Not stated, and a "中文 / English" pair is read on its Chinese half. */
export function parkingStat(text: string | null | undefined, zh: boolean): string {
  const raw = (text || '').trim()
  if (!raw) return zh ? '未提供' : 'Not provided'
  const parts = splitBilingual(raw)
  const t = parts.zh ?? parts.en ?? raw
  if (/^(待确认|待定|待告知|未确定|未知|不确定|请咨询|to be confirmed|to be determined|tbd|tbc|unknown|ask\b)/i.test(t)) return zh ? '未说明' : 'Not stated'
  if (/^(不含|无|没有|不带|不提供|no\b|none|not included|without)/i.test(t)) {
    return /(可租|可选租|另租|available|extra|additional|\$)/i.test(t) ? (zh ? '可另租' : 'Available (extra)') : (zh ? '不含' : 'Not included')
  }
  return zh ? '有' : 'Yes'
}

// Which province's rules a listing follows (2026-10-02, user: a Montréal listing was showing
// Ontario rules; 「外省的要查外省的法规，不要用安省的法规和说法」). The stored province alone is not
// trusted — lib/provinces/detect reads the postal code, the address and the city first. An empty or
// unknown province is Ontario: the product is Ontario-first and older rows were saved without one.
export function isOntarioListing(province: string | null | undefined): boolean {
  return (normalizeProvince(province) ?? 'ON') === 'ON'
}

/** The province whose rules apply to this listing (postal code > address > stored > city > ON). */
export function listingProvince(row: ProvinceRow | null | undefined): ProvinceCode {
  return effectiveProvince(row)
}

export { provinceName }

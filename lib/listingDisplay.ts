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

// Ontario-only content (RTA notes, the move-in cost card, TRREB averages) shows only on Ontario
// listings; a listing elsewhere gets one sentence instead (2026-10-02, user: a Montréal listing
// was showing Ontario rules). An empty province is treated as Ontario — the product is Ontario-only
// and older rows were saved without one.
const ON_RE = /^(on|ont|ontario|安省|安大略省?)$/i
export function isOntarioListing(province: string | null | undefined): boolean {
  const p = String(province ?? '').trim()
  return !p || ON_RE.test(p)
}

const PROVINCE_NAMES: Record<string, { zh: string; en: string }> = {
  QC: { zh: '魁北克省', en: 'Quebec' }, BC: { zh: '不列颠哥伦比亚省', en: 'British Columbia' }, AB: { zh: '阿尔伯塔省', en: 'Alberta' },
  MB: { zh: '曼尼托巴省', en: 'Manitoba' }, SK: { zh: '萨斯喀彻温省', en: 'Saskatchewan' }, NS: { zh: '新斯科舍省', en: 'Nova Scotia' },
  NB: { zh: '新不伦瑞克省', en: 'New Brunswick' }, NL: { zh: '纽芬兰与拉布拉多省', en: 'Newfoundland and Labrador' },
  PE: { zh: '爱德华王子岛省', en: 'Prince Edward Island' }, YT: { zh: '育空地区', en: 'Yukon' }, NT: { zh: '西北地区', en: 'Northwest Territories' }, NU: { zh: '努纳武特地区', en: 'Nunavut' },
}
export function provinceName(province: string | null | undefined, zh: boolean): string {
  const p = String(province ?? '').trim()
  const hit = PROVINCE_NAMES[p.toUpperCase()]
  return hit ? (zh ? hit.zh : hit.en) : p
}

/** The one sentence a listing outside Ontario shows where the Ontario notes would be. */
export function ontarioRulesNotApplicable(province: string | null | undefined, zh: boolean): string {
  const name = provinceName(province, zh)
  return zh
    ? `安省租房规则不适用于这套房源（${name}）。`
    : `Ontario rental rules do not apply to this listing (${name}).`
}


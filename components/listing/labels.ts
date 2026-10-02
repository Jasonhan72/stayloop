// Display labels for the listing detail page, one language at a time
// (2026-10-02 · user: "这个房源详情这里不要中文和英文混杂，除了有些必须要英文的（地址等），
// 其余的都要有语言切换来分开"). Addresses, street / neighbourhood / building and
// brokerage names stay as stored; everything the page itself writes comes from
// here in the UI language. Pure — tests/listingPageLang20261002.spec.ts.
import { addressHasUnit, listingTitle } from '@/lib/listingDisplay'
import type { SimilarMatch } from '@/lib/listingSimilar'

type L = 'zh' | 'en'

/** Bedrooms as the page prints them. summary: "1 间卧室 + 书房" / "1 bedroom + den";
 *  stat: "1 + 书房" / "1 + den"; short (cards): "1 卧 + 书房" / "1 bed + den". 0 = 开间 / Studio. */
export function bedsText(bedrooms: number | null | undefined, hasDen: boolean | null | undefined, lang: L, style: 'summary' | 'stat' | 'short'): string {
  const zh = lang === 'zh'
  if (bedrooms === 0) return zh ? '开间' : 'Studio'
  const n = bedrooms == null ? '—' : String(bedrooms)
  const den = hasDen ? (zh ? ' + 书房' : ' + den') : ''
  if (style === 'stat') return `${n}${den}`
  if (style === 'short') return zh ? `${n} 卧${den}` : `${n} bed${den}`
  return zh ? `${n} 间卧室${den}` : `${n} ${bedrooms === 1 ? 'bedroom' : 'bedrooms'}${den}`
}

/** "Toronto, ON" (one row stores the province in the city) → "Toronto", so the address line no longer reads "Toronto, ON, ON". */
export function cityOnly(city: string | null | undefined): string {
  return String(city ?? '').replace(/\s*,\s*(?:[A-Za-z]{2}|Ontario|Quebec|Québec)\s*$/i, '').trim()
}

/** The address with its unit: "#515" in Chinese (as the H1 writes it), ", Unit 515" in English. */
export function addressWithUnit(address: string | null | undefined, unit: string | null | undefined, lang: L): string {
  if (lang === 'zh') return listingTitle(address, unit)
  const a = String(address ?? '').trim()
  const u = String(unit ?? '').trim()
  return u && !addressHasUnit(a, u) ? `${a}, Unit ${u}` : a
}

/** Realtor.ca imports carry scraper junk in broker_name ("Agents.", "Website"): treated as missing. */
export function cleanBrokerName(name: string | null | undefined): string | null {
  const n = String(name ?? '').trim()
  if (!n || /^(agents?|website|realtor|broker(age)?|n\/?a|none|null|unknown|-+)\.?$/i.test(n)) return null
  return n
}

/** Distance chip on a similar-home card: 同楼 / Same building, else "350 m" / "1.2 km"; null without coordinates. */
export function similarDistanceText(m: Pick<SimilarMatch<unknown>, 'same_building' | 'distance_m'>, lang: L, fmt: (meters: number) => string): string | null {
  if (m.same_building) return lang === 'zh' ? '同楼' : 'Same building'
  return m.distance_m == null ? null : fmt(m.distance_m)
}

/** Layout chip: 同户型 · 2 卧 / Same layout · 2 bed; the den case names both sides; else 多 / 少 N 卧. null when this listing's bedroom count is unknown. */
export function similarLayoutText(
  m: Pick<SimilarMatch<unknown>, 'unit_tier' | 'bedroom_delta' | 'den_differs'>,
  cand: { bedrooms?: number | null; has_den?: boolean | null },
  me: { bedrooms?: number | null; has_den?: boolean | null },
  lang: L,
): string | null {
  const zh = lang === 'zh'
  if (m.unit_tier == null || m.bedroom_delta == null) return null
  if (m.unit_tier === 0) return zh ? `同户型 · ${bedsText(cand.bedrooms, cand.has_den, lang, 'short')}` : `Same layout · ${bedsText(cand.bedrooms, cand.has_den, lang, 'short')}`
  if (m.den_differs) {
    const theirs = bedsText(cand.bedrooms, cand.has_den, lang, 'short')
    const mine = bedsText(me.bedrooms, me.has_den, lang, 'short')
    return zh ? `${theirs}（这套 ${mine}）` : `${theirs} (this one ${mine})`
  }
  const d = m.bedroom_delta
  const n = Math.abs(d)
  if (zh) return d > 0 ? `多 ${n} 卧` : `少 ${n} 卧`
  return `${n} ${d > 0 ? 'more' : 'fewer'} ${n === 1 ? 'bedroom' : 'bedrooms'}`
}

/** Rent against this listing, in dollars (no percentages): 比这套低 $1,210 / $1,210 less. */
export function similarRentText(rentDelta: number, lang: L): string {
  const zh = lang === 'zh'
  const d = Math.round(rentDelta)
  if (d === 0) return zh ? '与这套同价' : 'Same rent'
  const amt = `$${Math.abs(d).toLocaleString('en-CA')}`
  if (zh) return d < 0 ? `比这套低 ${amt}` : `比这套高 ${amt}`
  return d < 0 ? `${amt} less` : `${amt} more`
}

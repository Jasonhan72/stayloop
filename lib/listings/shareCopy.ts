// The manual syndication line (V0.8 第二项 · 第 4 步, 2026-10-22): a post the landlord copies into
// WeChat / 小红书 / a Facebook group, where no API exists. Deterministic and built only from the
// listing's own fields (the title / description already passed the publish compliance check);
// every post links back to the Stayloop listing page, where viewing, questions and applications
// stay (message relay, application tracking, screening).
import { amenityLabel } from '@/lib/listingInsights'
import { AMENITY_VOCAB } from '@/lib/listings/quickDraft'

export type ShareFacts = {
  address: string
  unit?: string | null
  city?: string | null
  monthly_rent?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  sqft?: number | null
  property_type?: string | null
  title?: string | null
  description?: string | null
  available_date?: string | null
  amenities?: string[] | null
  utilities_included?: string[] | null
  pet_policy?: string | null
  is_test?: boolean | null
}

const TYPE: Record<string, { zh: string; en: string }> = {
  condo: { zh: '公寓', en: 'Condo' }, apartment: { zh: '公寓', en: 'Apartment' }, house: { zh: '独立屋', en: 'House' },
  townhouse: { zh: '联排', en: 'Townhouse' }, basement: { zh: '地下室单元', en: 'Basement unit' }, room: { zh: '单间', en: 'Room' },
}

/** Published titles are「中文 / English」(draftListingCopy); keep the half in the asked language. */
export function titleIn(title: string | null | undefined, lang: 'zh' | 'en'): string {
  const t = (title || '').trim()
  if (!t) return ''
  const parts = t.split(/\s+\/\s+/)
  if (parts.length !== 2) return t
  const han = (x: string) => /[\u4e00-\u9fff]/.test(x)
  return (parts.find((x) => (lang === 'zh' ? han(x) : !han(x))) ?? t).trim()
}

export function firstParagraph(desc: string | null | undefined, lang: 'zh' | 'en'): string {
  // Published descriptions are 中文 paragraph then English (draftListingCopy); take the paragraph in the asked language.
  const paras = (desc || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (!paras.length) return ''
  const han = (s: string) => /[一-鿿]/.test(s)
  const pick = paras.find((p) => (lang === 'zh' ? han(p) : !han(p))) ?? paras[0]
  return pick.slice(0, 600)
}

export function buildSharePost(f: ShareFacts, lang: 'zh' | 'en', url: string): string {
  const zh = lang === 'zh'
  const type = f.property_type ? TYPE[f.property_type]?.[lang] ?? '' : ''
  const where = [f.address, f.unit ? (zh ? `${f.unit} 单元` : `Unit ${f.unit}`) : '', f.city && !f.address.toLowerCase().includes(f.city.toLowerCase()) ? f.city : ''].filter(Boolean).join(zh ? '，' : ', ')
  const specs = [
    f.bedrooms != null ? (zh ? `${f.bedrooms} 卧` : `${f.bedrooms} bd`) : '',
    f.bathrooms != null ? (zh ? `${f.bathrooms} 卫` : `${f.bathrooms} ba`) : '',
    f.sqft ? `${f.sqft} sqft` : '',
    type,
  ].filter(Boolean).join(' · ')
  const lines: string[] = []
  if (f.is_test) lines.push(zh ? '【测试房源 · 非实际房源】' : '[Test listing · not a real rental]')
  lines.push(titleIn(f.title, lang) || (zh ? `${where} 出租` : `${where} for rent`))
  if (f.monthly_rent != null) lines.push(zh ? `租金 $${f.monthly_rent.toLocaleString()}/月` : `$${f.monthly_rent.toLocaleString()}/month`)
  if (specs) lines.push(specs)
  if (f.available_date) lines.push(zh ? `可入住：${f.available_date}` : `Available: ${f.available_date}`)
  // Quick-publish codes (AMENITY_VOCAB) first, then the listing-page label map; anything else is the landlord's own text.
  const label = (a: string) => { const v = AMENITY_VOCAB.find((x) => x.id === a.trim().toLowerCase()); return v ? v[lang] : amenityLabel(a, lang) }
  const am = (f.amenities ?? []).filter(Boolean).slice(0, 8).map(label)
  if (am.length) lines.push((zh ? '设施：' : 'Amenities: ') + am.join(zh ? '、' : ', '))
  const ut = (f.utilities_included ?? []).filter(Boolean)
  if (ut.length) lines.push((zh ? '租金包含：' : 'Included: ') + ut.join(zh ? '、' : ', '))
  const d = firstParagraph(f.description, lang)
  if (d) lines.push('', d)
  lines.push('', zh ? `看房、提问、申请都在这里：${url}` : `Viewings, questions and applications: ${url}`)
  return lines.join('\n')
}

/** A file name for the n-th photo of a listing in a download pack. */
export function photoFileName(address: string, n: number, src: string): string {
  const base = address.replace(/[^A-Za-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'listing'
  const ext = (/\.(jpe?g|png|webp)(\?|$)/i.exec(src)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg')
  return `${base}-${String(n + 1).padStart(2, '0')}.${ext}`
}

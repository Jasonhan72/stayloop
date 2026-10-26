// What a listing card says (2026-10-27 · 房源卡片优化, modelled on the StreetEasy
// card hierarchy: small type + neighbourhood line, the address as the title,
// the price, then a facts row). Pure helpers so the wording is one place:
//   • the address never repeats the unit ("605 - 28 Avondale Ave · Unit 605")
//   • the size row is one language ("2 卧 · 2 浴 · 850 ft²", not "2B · 2 浴")
//   • the facts line carries concrete facts (available date, pets, included
//     utilities) and only when the row has them
export type Lang = 'zh' | 'en'

export type CardRow = {
  address: string
  unit?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  sqft?: number | null
  has_den?: boolean | null
  available_date?: string | null
  pet_policy?: string | null
  property_type?: string | null
  neighborhood?: string | null
  city?: string | null
}

const PROPERTY_TYPE: Record<string, { zh: string; en: string }> = {
  condo: { zh: '公寓', en: 'Condo' }, apartment: { zh: '公寓', en: 'Apartment' }, house: { zh: '独立屋', en: 'House' },
  townhouse: { zh: '联排', en: 'Townhouse' }, basement: { zh: '地下室单元', en: 'Basement unit' }, room: { zh: '单间', en: 'Room' },
  duplex: { zh: '双拼', en: 'Duplex' }, semi: { zh: '半独立屋', en: 'Semi-detached' }, loft: { zh: 'Loft', en: 'Loft' },
}

/** "28 Avondale Ave #605" — the unit joins the address unless the address already names it. */
export function cardAddress(address: string, unit: string | null | undefined): string {
  const a = (address || '').trim()
  const u = (unit || '').trim().replace(/^(unit|apt|suite|#)\s*/i, '')
  if (!u) return a
  const token = u.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const head = a.toLowerCase()
  // Only a unit-shaped position counts — "605 - 28 Avondale Ave", "#605-28 Avondale", "28 Avondale Ave Unit 605",
  // "28 Avondale Ave #605", "…, Apt 605". A street number that happens to equal the unit ("605 Yonge St") does not.
  const unitShaped = new RegExp(`(^\\s*#?${token}\\s*-\\s*\\d)|((?:unit|apt|apartment|suite|ste|#)\\s*${token}(?![\\w-]))`)
  if (unitShaped.test(head)) return a
  return `${a} #${u}`
}

/** "公寓 · Yonge & Sheppard, North York" / "Condo in Yonge & Sheppard". */
export function cardKicker(l: Pick<CardRow, 'property_type' | 'neighborhood' | 'city'>, lang: Lang): string {
  const type = l.property_type ? PROPERTY_TYPE[l.property_type.toLowerCase()]?.[lang] ?? '' : ''
  const place = [l.neighborhood, l.city].filter(Boolean).join(lang === 'zh' ? '，' : ', ')
  if (type && place) return lang === 'zh' ? `${type} · ${place}` : `${type} in ${place}`
  return type || place
}

export type SizeFact = { key: 'bed' | 'bath' | 'sqft'; text: string }

/** The size row, one language: 开间 / 2 卧 + 书房 · 2 浴 · 850 ft². */
export function sizeFacts(l: Pick<CardRow, 'bedrooms' | 'bathrooms' | 'sqft' | 'has_den'>, lang: Lang): SizeFact[] {
  const zh = lang === 'zh'
  const out: SizeFact[] = []
  if (l.bedrooms != null) {
    const den = l.has_den ? (zh ? ' + 书房' : ' + den') : ''
    out.push({ key: 'bed', text: l.bedrooms === 0 ? (zh ? `开间${den}` : `Studio${den}`) : zh ? `${l.bedrooms} 卧${den}` : `${l.bedrooms} bed${den}` })
  }
  if (l.bathrooms != null) out.push({ key: 'bath', text: zh ? `${l.bathrooms} 浴` : `${l.bathrooms} bath` })
  if (l.sqft) out.push({ key: 'sqft', text: `${l.sqft.toLocaleString()} ft²` })
  return out
}

const PETS: Record<string, { zh: string; en: string }> = {
  yes: { zh: '允许宠物', en: 'Pets OK' }, allowed: { zh: '允许宠物', en: 'Pets OK' }, restricted: { zh: '宠物有限制', en: 'Pets restricted' },
  cats: { zh: '可养猫', en: 'Cats OK' }, dogs: { zh: '可养狗', en: 'Dogs OK' }, no: { zh: '不可养宠物', en: 'No pets' },
}

/** Concrete facts the row carries — nothing is invented and nothing generic ("kitchen") is listed. */
export function cardFacts(l: Pick<CardRow, 'available_date' | 'pet_policy'>, lang: Lang, today = new Date()): string[] {
  const zh = lang === 'zh'
  const out: string[] = []
  if (l.available_date) {
    const d = l.available_date.slice(0, 10)
    const past = d <= today.toISOString().slice(0, 10)
    out.push(past ? (zh ? '即可入住' : 'Available now') : zh ? `${d.slice(5).replace('-', '/')} 起可入住` : `From ${d}`)
  }
  if (l.pet_policy) {
    const p = PETS[l.pet_policy.toLowerCase().trim()]
    if (p) out.push(zh ? p.zh : p.en)
  }
  return out
}

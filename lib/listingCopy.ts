// Listing title + description drafted ONLY from fields the landlord entered
// (three-role test report 2026-09-24, SL-L-03). Deterministic — no model, so
// nothing the landlord did not say can appear. Bilingual: 中文 paragraph, then
// English. The landlord edits the result before publishing.
export type CopyFacts = {
  address: string
  unit?: string
  city?: string
  property_type?: string
  bedrooms?: number | null
  bathrooms?: number | null
  sqft?: number | null
  monthly_rent?: number | null
  lease_term?: string
  pets_allowed?: '' | 'yes' | 'restricted'
  smoking_policy?: '' | 'no' | 'outdoor_only' | 'yes'
  furnished?: '' | 'yes' | 'no'
  amenities?: { zh: string; en: string }[]
  utilities?: { zh: string; en: string }[]
}

const TYPE: Record<string, { zh: string; en: string }> = {
  condo: { zh: '公寓', en: 'condo' }, apartment: { zh: '公寓', en: 'apartment' }, house: { zh: '独立屋', en: 'house' },
  townhouse: { zh: '联排', en: 'townhouse' }, basement: { zh: '地下室单元', en: 'basement unit' }, room: { zh: '单间', en: 'room' },
}

export function draftListingCopy(f: CopyFacts): { title: string; description: string } {
  const t = TYPE[f.property_type || ''] ?? { zh: '房源', en: 'unit' }
  const bd = f.bedrooms != null ? f.bedrooms : null
  const ba = f.bathrooms != null ? f.bathrooms : null
  const place = [f.address, f.unit ? `#${f.unit}` : '', f.city ? `, ${f.city}` : ''].join(' ').replace(/\s+,/g, ',').trim()
  const titleZh = `${[bd != null ? `${bd} 卧` : '', ba != null ? `${ba} 卫` : '', t.zh].filter(Boolean).join(' ')} · ${f.address}`
  const titleEn = `${bd != null ? `${bd}-bed ` : ''}${t.en} at ${f.address}`
  const zh: string[] = []
  const en: string[] = []
  zh.push(`${place}，${bd != null ? `${bd} 卧 ` : ''}${ba != null ? `${ba} 卫 ` : ''}${t.zh}${f.sqft ? `，约 ${f.sqft} 平方英尺` : ''}。`)
  en.push(`${bd != null ? `${bd}-bedroom, ` : ''}${ba != null ? `${ba}-bathroom ` : ''}${t.en} at ${place}${f.sqft ? `, about ${f.sqft} sq ft` : ''}.`)
  if (f.monthly_rent) { zh.push(`月租 $${f.monthly_rent.toLocaleString('en-CA')}。`); en.push(`$${f.monthly_rent.toLocaleString('en-CA')}/month.`) }
  if (f.utilities?.length) { zh.push(`租金包含：${f.utilities.map((u) => u.zh).join('、')}。`); en.push(`Rent includes ${f.utilities.map((u) => u.en.toLowerCase()).join(', ')}.`) }
  if (f.amenities?.length) { zh.push(`配套：${f.amenities.map((a) => a.zh).join('、')}。`); en.push(`Features: ${f.amenities.map((a) => a.en).join(', ')}.`) }
  if (f.furnished === 'yes') { zh.push('带家具。'); en.push('Furnished.') } else if (f.furnished === 'no') { zh.push('不带家具。'); en.push('Unfurnished.') }
  if (f.pets_allowed === 'yes') { zh.push('可以养宠物。'); en.push('Pets welcome.') } else if (f.pets_allowed === 'restricted') { zh.push('宠物有限制，请先询问。'); en.push('Pets with restrictions — please ask.') }
  if (f.smoking_policy === 'no') { zh.push('室内禁烟。'); en.push('No smoking.') } else if (f.smoking_policy === 'outdoor_only') { zh.push('仅限室外吸烟。'); en.push('Smoking outdoors only.') }
  if (f.lease_term?.trim()) { zh.push(`租期：${f.lease_term.trim()}。`); en.push(`Lease term: ${f.lease_term.trim()}.`) }
  zh.push('安省标准租约；押金不超过一个月租金，不收申请费。')
  en.push('Ontario Standard Lease; deposit no more than one month’s rent; no application fee.')
  return { title: `${titleZh} / ${titleEn}`.slice(0, 160), description: `${zh.join('')}\n\n${en.join(' ')}` }
}

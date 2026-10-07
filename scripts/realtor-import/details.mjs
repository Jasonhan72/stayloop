// Fetch + parse each planned listing's Realtor.ca detail page (Jina reader, proxy retry on bot checks).
// Usage: node details.mjs [--backups] [--only=MLS,MLS]
import fs from 'node:fs'
const S = new URL('.', import.meta.url).pathname
const KEY = fs.readFileSync('/Users/neos/Documents/Claude/Projects/stayloop/.env.local', 'utf8').match(/^JINA_API_KEY=(.*)$/m)[1].trim()
const args = process.argv.slice(2)
const useBackups = args.includes('--backups')
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean)
const { plan, backups } = JSON.parse(fs.readFileSync(S + 'plan.json', 'utf8'))
let items = useBackups ? backups : plan
if (only.length) items = [...plan, ...backups].filter((r) => only.includes(r.mls))

async function read(url) {
  for (const proxy of [false, true]) {
    try {
      const r = await fetch('https://r.jina.ai/' + url, { headers: { Authorization: `Bearer ${KEY}`, ...(proxy ? { 'X-Proxy': 'auto' } : {}) }, signal: AbortSignal.timeout(70000) })
      const text = await r.text()
      if (!r.ok) { if (proxy) return { status: r.status, text }; continue }
      if (/Just a moment|Security Check|Performing security verification|returned error 403/i.test(text.slice(0, 2000))) { if (proxy) return { status: 599, text }; continue }
      return { status: 200, text }
    } catch (e) { if (proxy) return { status: 0, text: String(e) } }
  }
  return { status: 0, text: '' }
}
const LABELS = new Set(['Property Type','Building Type','Storeys','Square Footage','Community Name','Title','Parking Type','Time on REALTOR.ca','Above Grade','Below Grade','Total','Partial','Appliances Included','Flooring','Basement Features','Basement Type','Basement Development','Features','Foundation Type','Style','Building Amenities','Cooling','Heating Type','Heating Fuel','Utility Communications','Utility Sewer','Water','Exterior Finish','Total Parking Spaces','Land Size','Age','Age Of Building','Fireplace','Fireplace Type','Maintenance Fees','Architecture Style','Structures','Landscape Features','Amenities Nearby','Community Features','Pool Type','Fence Type','View Type','Access Type','Zoning Type','Zoning Description','Lot Size','Fire Protection','Ownership Type','Fixtures','Floor Space','Water Front Type','Road Type','Surrounding Features','Lease Term','Rental Equipment'])
const GROUPS = new Set(['Bedrooms','Bathrooms','Interior Features','Building Features','Heating & Cooling','Utilities','Exterior Features','Parking','Land','Neighbourhood Features','Measurements','Rooms','Property Summary','Building','Listing Description','Location Description'])
const PARTIAL_PREFIX = /^(BSMT|BASEMENT|LOWER|LWR|MAIN|UPPER|FRONT|REAR|GROUND|UPR|2ND|3RD|WO BSMT|LOWER UNIT\/BASEMENT|APT [A-Z0-9]+|#\s*[A-Z0-9]+|[A-Z0-9]{1,6})\s*-\s*/i
const HOUSE_PART_PREFIX = /^(BSMT|BASEMENT|LOWER|LWR|MAIN|UPPER|FRONT|REAR|GROUND|UPR|2ND|3RD|WO BSMT|LOWER UNIT\/BASEMENT)\b/i
const BSMT_RE = /^(BSMT|BASEMENT|LOWER|LWR|WO BSMT|LOWER UNIT\/BASEMENT)\b/i
async function geocode(street, city, postal) {
  // structured query; accept only a hit whose postcode shares the FSA or whose address names the city
  await new Promise((r) => setTimeout(r, 1100))
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=3&addressdetails=1&countrycodes=ca&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=Ontario${postal ? `&postalcode=${encodeURIComponent(postal)}` : ''}`
  const r = await fetch(u, { headers: { 'User-Agent': 'Stayloop/0.7 import (privacy@stayloop.ai)' } })
  if (!r.ok) return null
  const j = await r.json()
  const fsa = (postal || '').slice(0, 3).toUpperCase()
  for (const h of j) {
    const pc = (h.address?.postcode || '').replace(/\s/g, '').toUpperCase()
    const hitCity = [h.address?.city, h.address?.town, h.address?.municipality, h.address?.city_district].filter(Boolean).join(' ').toLowerCase()
    if ((fsa && pc.startsWith(fsa)) || hitCity.includes(city.toLowerCase())) return { lat: parseFloat(h.lat), lng: parseFloat(h.lon) }
  }
  return null
}
async function geocodeFree(q, postal, city) {
  await new Promise((r) => setTimeout(r, 1100))
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&countrycodes=ca&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'Stayloop/0.7 import (privacy@stayloop.ai)' } })
  if (!r.ok) return null
  const fsa = (postal || '').slice(0, 3).toUpperCase()
  for (const h of await r.json()) {
    const pc = (h.address?.postcode || '').replace(/\s/g, '').toUpperCase()
    const hitCity = [h.address?.city, h.address?.town, h.address?.municipality].filter(Boolean).join(' ').toLowerCase()
    if ((fsa && pc.startsWith(fsa)) || hitCity.includes(city.toLowerCase())) return { lat: parseFloat(h.lat), lng: parseFloat(h.lon) }
  }
  return null
}
function parse(md, item) {
  const L = md.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
  const T = L.map((l) => l.trim())
  const out = { mls: item.mls, url: item.url, warn: [] }
  if (/no longer exists|listing you are looking for/i.test(md)) { out.gone = true; return out }
  // header: "# ADDRESS" or "## ADDRESS" directly followed by "City (Area), Ontario POSTAL"
  let hi = T.findIndex((l, i) => /^#{1,2} \S/.test(l) && /,\s*Ontario/.test(T[i + 1] || ''))
  out.address = hi >= 0 ? T[hi].replace(/^#{1,2} /, '').trim() : item.address
  const cityLine = hi >= 0 ? T[hi + 1] : (T.find((l) => /^[A-Z][^,(]*(\([^)]*\))?,\s*Ontario\s+[A-Z]\d[A-Z]/.test(l)) || '')
  const cm = cityLine.match(/^([^(,]+?)\s*(?:\(([^)]+)\))?,\s*Ontario\s*([A-Z]\d[A-Z]\s?\d[A-Z]\d)?/)
  out.city = cm?.[1]?.trim() || item.city
  out.neighborhood = (cm?.[2] || item.neighborhood || '').replace(/^[A-Z]{2}\s+(?=[A-Z])/, '').trim() || null
  out.postal_code = cm?.[3] ? cm[3].replace(/\s/g, '').replace(/^(\w{3})(\w{3})$/, '$1 $2') : null
  out.mls_page = md.match(/MLS® Number:\s*([A-Z]\d+)/)?.[1] || null
  out.price = parseInt((md.match(/\$([\d,]+)\/Monthly/)?.[1] || '0').replace(/,/g, ''), 10) || null
  const after = (icon) => { const i = T.findIndex((l) => l.includes(icon)); return i >= 0 ? T[i + 1] || '' : '' }
  const bm = after('bed-gray.svg)').match(/(\d+)(?:\s*\+\s*(\d+))?/)
  out.bedrooms = bm ? parseInt(bm[1], 10) : item.beds
  out.has_den = bm ? !!bm[2] : item.den
  const sm = after('square_footage-gray.svg)').match(/([\d,]+)(?:\s*-\s*([\d,]+))?/)
  out.sqft_lo = sm ? parseInt(sm[1].replace(/,/g, ''), 10) : null; out.sqft_hi = sm?.[2] ? parseInt(sm[2].replace(/,/g, ''), 10) : null
  // description: the "## Listing Description" section (layout A) or the prose between "Square Feet" and the summary (layout B)
  let desc = []
  const di = T.findIndex((l) => l === '## Listing Description')
  if (di >= 0) { for (let j = di + 1; j < T.length && !/^## /.test(T[j]); j++) desc.push(T[j]) }
  else {
    const si = T.findIndex((l) => l === 'Square Feet')
    if (si >= 0) for (let j = si + 1; j < T.length; j++) { const l = T[j]; if (l === 'Property Type' || /^Cross Streets?:/i.test(l) || /^## /.test(l) || /^\[Highlights\]/.test(l)) break; if (/^[\[!]/.test(l)) continue; desc.push(l) }
  }
  out.description = desc.join('\n').trim() || null
  const loc = T.find((l) => /^Cross Streets?:/i.test(l)) || (T.find((l) => l === '## Location Description') ? T[T.findIndex((l) => l === '## Location Description') + 1] : '')
  out.cross_streets = (loc || '').match(/Cross Streets?:\s*([^.*]+)/i)?.[1]?.trim() || null
  // label → value, both layouts: a known label's value is the next line that is neither a label nor a group header
  const kv = {}
  const pi = T.findIndex((l) => l === 'Property Type')
  for (let j = pi; j >= 0 && j < T.length; j++) {
    const lab = T[j].replace(/!\[.*$/, '').trim()
    if (/^Data provided by|^Are you interested|^\[Request a showing/.test(T[j])) break
    if (LABELS.has(lab)) { const v = (T[j + 1] || '').replace(/!\[.*$/, '').trim(); if (v && !LABELS.has(v) && !GROUPS.has(v) && !/^## /.test(v) && !(lab in kv)) kv[lab] = v }
  }
  out.kv = kv
  out.photos = Array.from(new Set((md.match(/https:\/\/cdn\.realtor\.ca\/listings\/[^)\s"]+\/highres\/[^)\s"]+\.jpg/g) || [])))
  out.brokerage = md.match(/\[([^\]]+?)\s+Brokerage\s+[^\]]*\]\(https:\/\/www\.realtor\.ca\/office\//)?.[1]?.trim() || item.brokerage || null
  const dm = md.match(/destination=(-?\d+\.\d+)%2c(-?\d+\.\d+)/i)
  out.lat = dm ? parseFloat(dm[1]) : null; out.lng = dm ? parseFloat(dm[2]) : null
  // derived
  const partial = PARTIAL_PREFIX.test(out.address)
  const housePart = HOUSE_PART_PREFIX.test(out.address)
  const bt = (kv['Building Type'] || '').toLowerCase(); const title = (kv['Title'] || '').toLowerCase()
  const d = (out.description || '').toLowerCase()
  const houseLike = /house|duplex|triplex|fourplex|multi|bungalow/.test(bt) || (!bt && /\b(detached|semi|bungalow)\b/.test(d))
  if (BSMT_RE.test(out.address) || (partial && !housePart && houseLike && /\bbasement (apartment|unit|suite)\b|\blower level unit\b/.test(d))) out.property_type = 'basement'
  else if (/row|townhouse|town house/.test(bt)) out.property_type = 'townhouse'
  else if (/apartment/.test(bt)) out.property_type = /condo/.test(title) ? 'condo' : 'apartment'
  else if (/residential commercial mix|mixed/.test(bt)) out.property_type = 'apartment'
  else if (houseLike) out.property_type = partial ? 'apartment' : 'house'
  else out.property_type = 'other'
  if (out.property_type === 'house' && /\b(basement apartment|basement unit|lower unit|main floor (unit|only)|upper (floor|level|unit) only)\b/.test(d)) out.warn.push('house: description sounds like a partial unit')
  out.unit = null
  const um = out.address.match(/^(.*?)\s*-\s*(\d.*)$/); if (um && !HOUSE_PART_PREFIX.test(um[1].trim())) out.unit = um[1].replace(/^(APT|UNIT|#)\s*/i, '').trim()
  out.ownership_title = /condo/.test(title) ? 'condominium' : /freehold/.test(title) ? 'freehold' : null
  const total = parseInt(kv['Total'] || '', 10); const half = parseInt(kv['Partial'] || '', 10)
  out.bathrooms = Number.isFinite(total) ? total - (Number.isFinite(half) ? 0.5 * half : 0) : item.baths || null
  out.bathrooms_half = Number.isFinite(half) ? half : null
  out.bedrooms_above_grade = parseInt(kv['Above Grade'] || '', 10) || null
  out.bedrooms_below_grade = parseInt(kv['Below Grade'] || '', 10) || null
  const partialUnit = out.property_type === 'basement' || (partial && out.property_type === 'apartment' && houseLike)
  if (partialUnit) { out.sqft = null; out.sqft_max = null } else { out.sqft = out.sqft_lo; out.sqft_max = out.sqft_hi }
  const spaces = parseInt(kv['Total Parking Spaces'] || '', 10); const ptype = kv['Parking Type'] || ''
  out.parking_spaces = Number.isFinite(spaces) ? spaces : null
  if (partialUnit && Number.isFinite(spaces) && spaces > 2) { out.parking = null; out.parking_spaces = null; out.warn.push(`parking ${spaces} is the whole property's`) }
  else if (Number.isFinite(spaces) && spaces === 0) out.parking = 'No parking'
  else if (Number.isFinite(spaces) && spaces > 0) out.parking = `${spaces} parking space${spaces > 1 ? 's' : ''}` + (/underground/i.test(ptype) ? ' (underground)' : /garage/i.test(ptype) && !/no garage/i.test(ptype) ? ' (garage)' : '')
  else out.parking = /^no/i.test(ptype) || !ptype ? null : ptype
  const list = (s) => (s ? s.split(/,\s*/).map((x) => x.trim()).filter(Boolean) : [])
  out.amenities = Array.from(new Set([...list(kv['Features']), ...list(kv['Building Amenities'])]))
  out.appliances = list(kv['Appliances Included'])
  out.heating_type = kv['Heating Type'] || null; out.cooling = kv['Cooling'] || null; out.exterior_finish = kv['Exterior Finish'] || null
  out.basement_type = kv['Basement Type'] || null; out.storeys = parseFloat(kv['Storeys'] || '') || null; out.land_size = kv['Land Size'] || null
  out.year_built = (() => { const a = (kv['Age'] || kv['Age Of Building'] || '').match(/(\d{4})/); return a ? parseInt(a[1], 10) : null })()
  out.furnished = /\bunfurnished\b/.test(d) ? false : /\b(fully )?furnished\b/.test(d) ? true : null
  out.pets_allowed = /\bno pets?\b|pets? not (allowed|permitted)/.test(d) ? 'restricted' : /pet[- ]friendly|pets? (are )?(allowed|welcome|ok|permitted)/.test(d) ? 'yes' : null
  out.time_on = kv['Time on REALTOR.ca'] || null
  out.layout = di >= 0 ? 'A' : 'B'
  if (!out.mls_page || out.mls_page !== item.mls) out.warn.push(`mls ${out.mls_page} ≠ ${item.mls}`)
  if (!out.price || out.price !== item.price) out.warn.push(`price ${out.price} ≠ list ${item.price}`)
  if (out.photos.length < 3) out.warn.push(`photos ${out.photos.length}`)
  if (!out.postal_code) out.warn.push('no postal')
  if (!out.description) out.warn.push('no description')
  if (out.bedrooms !== item.beds) out.warn.push(`beds ${out.bedrooms} ≠ list ${item.beds}`)
  if (out.property_type === 'other') out.warn.push(`type? bt="${kv['Building Type']}" title="${kv['Title']}" ptype="${kv['Property Type']}"`)
  if (/\b(room|rooms) for rent\b|\bshared (kitchen|bath)|\bfemale only\b|\bstudents? only\b/.test(d)) out.warn.push('room rental?')
  return out
}
const results = []
let i = 0
async function worker() {
  while (i < items.length) {
    const item = items[i++]
    const f = `${S}details/${item.mls}.md`
    let md
    if (fs.existsSync(f) && fs.statSync(f).size > 5000) md = fs.readFileSync(f, 'utf8')
    else { const r = await read(item.url); if (r.status !== 200) { results.push({ mls: item.mls, url: item.url, error: `http ${r.status}` }); continue } md = r.text; fs.writeFileSync(f, md) }
    const p = parse(md, item)
    if (!p.gone && p.lat == null) { const street = p.address.replace(/^.*?-\s*/, ''); const g = await geocode(street, p.city, p.postal_code) || await geocode(street, p.city, null) || await geocodeFree(`${p.postal_code}, ${p.city}, Ontario, Canada`, p.postal_code, p.city) || await geocodeFree(`${street}, ${p.city}, Ontario, Canada`, p.postal_code, p.city); if (g) { p.lat = g.lat; p.lng = g.lng; p.geo = 'nominatim' } }
    if (!p.gone && (p.lat == null || p.lat < 43.3 || p.lat > 44.3 || p.lng < -80.4 || p.lng > -78.5)) p.warn.push(`coords ${p.lat},${p.lng}`)
    results.push(p)
  }
}
await Promise.all([worker(), worker(), worker(), worker()])
const prev = fs.existsSync(S + 'parsed.json') ? JSON.parse(fs.readFileSync(S + 'parsed.json', 'utf8')) : []
const merged = [...prev.filter((p) => !results.some((r) => r.mls === p.mls)), ...results]
fs.writeFileSync(S + 'parsed.json', JSON.stringify(merged, null, 1))
for (const r of results.sort((a, b) => (a.city || '').localeCompare(b.city || ''))) {
  if (r.error || r.gone) { console.log(`${r.mls} !! ${r.error || 'GONE'}`); continue }
  console.log([r.mls, r.city, r.neighborhood, r.address, '$' + r.price, `${r.bedrooms}${r.has_den ? '+1' : ''}b/${r.bathrooms}ba`, r.property_type + (r.unit ? ` #${r.unit}` : ''), r.sqft ? `${r.sqft}${r.sqft_max ? '-' + r.sqft_max : ''}` : '-', `${r.photos.length}p`, r.parking || '-', r.postal_code || '-', r.warn.length ? 'WARN: ' + r.warn.join('; ') : ''].join(' | '))
}

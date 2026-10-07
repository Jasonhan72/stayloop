// Build listings rows from parsed.json (+ overrides) and insert them with the service role.
// Usage: node insert.mjs [--write] [--only=MLS,…]
import fs from 'node:fs'
import crypto from 'node:crypto'
const S = new URL('.', import.meta.url).pathname
const env = Object.fromEntries(fs.readFileSync('/Users/neos/Documents/Claude/Projects/stayloop/.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''); const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const LANDLORD = '80646b6a-9c7b-4a17-a850-4ff774ea6d64'
const write = process.argv.includes('--write')
const only = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean)
const REJECT = new Set(JSON.parse(fs.readFileSync(S + 'reject.json', 'utf8')))
const OVERRIDE = JSON.parse(fs.readFileSync(S + 'overrides.json', 'utf8'))
const parsed = JSON.parse(fs.readFileSync(S + 'parsed.json', 'utf8')).filter((p) => !p.gone && !p.error && !REJECT.has(p.mls) && (!only.length || only.includes(p.mls)))
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const cap = (s) => (s ? s.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase()) : s)
function row(p) {
  const o = OVERRIDE[p.mls] || {}
  const now = new Date().toISOString()
  const base = {
    landlord_id: LANDLORD, source: 'realtor', province: 'ON', status: 'active', is_active: true, verification_status: 'verified', verified_at: now, published_at: now,
    address: p.address, unit: p.unit, title: p.address, city: p.city, neighborhood: p.neighborhood, postal_code: p.postal_code,
    monthly_rent: p.price, bedrooms: p.bedrooms, bathrooms: p.bathrooms, bathrooms_half: p.bathrooms_half, has_den: !!p.has_den,
    bedrooms_above_grade: p.bedrooms_above_grade, bedrooms_below_grade: p.bedrooms_below_grade,
    sqft: p.sqft, sqft_max: p.sqft_max, property_type: p.property_type, ownership_title: p.ownership_title, storeys: p.storeys, land_size: p.land_size,
    description: p.description, cross_streets: p.cross_streets, images: p.photos, photo_count: p.photos.length,
    amenities: p.amenities, appliances: p.appliances, building_features: null, utilities_included: [],
    heating_type: p.heating_type, cooling: p.cooling, exterior_finish: p.exterior_finish, basement_type: p.basement_type, year_built: p.year_built,
    parking: p.parking, parking_spaces: p.parking_spaces, furnished: p.furnished, pets_allowed: p.pets_allowed,
    brokerage: cap(p.brokerage), mls_number: p.mls, source_url: p.url, lat: p.lat, lng: p.lng,
    slug: `${slugify(`${p.address} ${p.city}`)}-${crypto.randomBytes(3).toString('hex').slice(0, 5)}`,
  }
  return { ...base, ...o }
}
const rows = parsed.map(row)
const bad = rows.filter((r) => !r.lat || !r.postal_code || !r.description || r.photo_count < 3 || !r.monthly_rent)
if (bad.length) { console.error('refusing — incomplete rows:', bad.map((r) => r.mls_number)); process.exit(1) }
console.log(`${rows.length} rows ready`)
if (!write) { console.log(JSON.stringify(rows.slice(0, 2), null, 1).slice(0, 3000)); process.exit(0) }
const res = await fetch(`${URL_}/rest/v1/listings`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(rows) })
const txt = await res.text()
if (!res.ok) { console.error('insert failed', res.status, txt.slice(0, 800)); process.exit(1) }
const out = JSON.parse(txt).map((r) => ({ id: r.id, mls: r.mls_number, slug: r.slug, lat: r.lat, lng: r.lng, city: r.city }))
fs.writeFileSync(S + 'inserted.json', JSON.stringify(out, null, 1))
console.log(`inserted ${out.length}`)

// Pick 50 Realtor.ca rentals from the probed list pages: per-area quotas, no MLS / street already
// in the DB, bed-type balance (1 bed ≈ 18 / 2 bed ≈ 20 / 3+ ≈ 12), no rooms / parking / < $1,000.
import fs from 'node:fs'
const S = new URL('.', import.meta.url).pathname
const EXISTING_MLS = new Set(JSON.parse(fs.readFileSync(S + 'existing_mls.json', 'utf8')))
const EXISTING_STREETS = new Set(JSON.parse(fs.readFileSync(S + 'existing_streets.json', 'utf8')).map((a) => streetKey(a)))
function streetKey(addr) {
  // "1105 - 203 COLLEGE STREET" → "203 college street"; "BSMT - 66 RICHMOND STREET" → "66 richmond street"
  const s = addr.toUpperCase().replace(/^(UNIT|APT|SUITE|PH|LPH|BSMT|BASEMENT|LOWER|UPPER|MAIN|GROUND|REAR|FRONT)?\s*[A-Z0-9#]*\s*-\s*/, '').trim()
  return s.toLowerCase()
}
// area quotas: [city, slug file, want]
const QUOTA = [
  ['Toronto','toronto_the-annex',2],['Toronto','toronto_roncesvalles',2],['Toronto','toronto_playter-estates-danforth',2],['Toronto','toronto_banbury-don-mills',2],
  ['Toronto','toronto_birchcliffe-cliffside',2],['Toronto','toronto_willowdale-west',2],['Toronto','toronto_stonegate-queensway',2],['Toronto','toronto_palmerston-little-italy',2],
  ['Toronto','toronto_cabbagetown-south-st-james-town',2],['Toronto','toronto_henry-farm',2],
  ['Vaughan','vaughan_maple',1],['Vaughan','vaughan_east-woodbridge',1],['Vaughan','vaughan_west-woodbridge',1],['Vaughan','vaughan_concord',1],['Vaughan','vaughan_patterson',1],['Vaughan','vaughan_kleinburg',1],
  ['Oakville','oakville_old-oakville',2],['Oakville','oakville_glen-abbey',1],['Oakville','oakville_river-oaks',1],['Oakville','oakville_west-oak-trails',1],
  ['Burlington','burlington_brant',1],['Burlington','burlington_orchard',1],['Burlington','burlington_uptown',1],['Burlington','burlington_appleby',1],
  ['Brampton','brampton_bram-west',1],['Brampton','brampton_credit-valley',1],['Brampton','brampton_fletchers-meadow',1],['Brampton','brampton_queen-street-corridor',1],['Brampton','brampton_sandringham-wellington',1],
  ['Pickering','pickering_bay-ridges',1],['Pickering','pickering_village-east',1],['Ajax','ajax',2],['Whitby','whitby',1],['Oshawa','oshawa',1],['Newmarket','newmarket',2],['Aurora','aurora',2],
]
const BACKUP = ['toronto_moss-park','toronto_rosedale-moore-park','toronto_lansing-westgate','toronto_clairlea-birchmount','toronto_milliken','toronto_eglinton-east','vaughan_vellore-village','vaughan_crestwood-springfarm-yorkhill']
function parseList(file) {
  const md = fs.readFileSync(S + 'lists/' + file + '__rentals.md', 'utf8')
  const rows = []
  for (const line of md.split('\n')) {
    if (!/\$[\d,]+\s*\/\s*Month/i.test(line)) continue
    const mls = line.match(/MLS®:\s*([A-Z]\d{7,8})/)?.[1]
    const price = parseInt((line.match(/\$([\d,]+)\s*\/\s*Month/i)?.[1] || '0').replace(/,/g, ''), 10)
    const url = line.match(/\]\((https:\/\/www\.realtor\.ca\/real-estate\/[^)]+)\)$/)?.[1]
    const addrRaw = (line.match(/\/Monthly\s+(.+?)\s+!\[/)?.[1] || '').trim()
    const m = addrRaw.match(/^(.*?),\s*([^,(]+?)(?:\s*\(([^)]+)\))?,\s*Ontario$/)
    const address = m ? m[1].trim() : addrRaw.split(',')[0].trim()
    const city = m ? m[2].trim() : ''
    const neighborhood = m ? (m[3] || '').trim() : ''
    const bedsM = line.match(/(\d+)(?:\s*\+\s*(\d+))?\s+Bedrooms?/i)
    const beds = bedsM ? parseInt(bedsM[1], 10) : 0
    const den = !!(bedsM && bedsM[2])
    const baths = parseInt(line.match(/(\d+)\s+Bathrooms?/i)?.[1] || '0', 10)
    const sqft = line.match(/([\d,]+(?:\s*-\s*[\d,]+)?\+?)\s+Square\s*Feet/i)?.[1] || ''
    const brokerage = (line.match(/Square\s*Feet\s+(.+?),\s*Brokerage\]/i)?.[1] || line.match(/Bathrooms?\s+(?:!\[[^\]]*\]\([^)]*\)\s*)?([A-Z][^!\]]+?),\s*Brokerage\]/)?.[1] || '').trim()
    rows.push({ file, mls, price, url, address, city, neighborhood, beds, den, baths, sqft, brokerage })
  }
  return rows
}
const taken = new Set(); const takenStreets = new Set(EXISTING_STREETS)
const bedCount = { 1: 0, 2: 0, 3: 0 }
const TARGET = { 1: 18, 2: 20, 3: 12 }
const bucket = (b) => (b >= 3 ? 3 : b)
function ok(r) {
  if (!r.mls || !r.url || !r.price) return false
  if (EXISTING_MLS.has(r.mls) || taken.has(r.mls)) return false
  if (r.price < 1000 || r.price > 6500) return false
  if (/\b(ROOM|PARKING|LOCKER)\b/i.test(r.address)) return false
  if (r.beds < 1 && !r.den) return false
  if (takenStreets.has(streetKey(r.address))) return false
  return true
}
const plan = []; const backups = []
for (const [city, file, want] of QUOTA) {
  const rows = parseList(file).filter(ok)
  // prefer the bed type that is furthest below its target
  rows.sort((a, b) => (bedCount[bucket(a.beds)] / TARGET[bucket(a.beds)]) - (bedCount[bucket(b.beds)] / TARGET[bucket(b.beds)]))
  let n = 0
  for (const r of rows) {
    if (n >= want) { if (backups.length < 40) backups.push({ ...r, city: r.city || city }); continue }
    taken.add(r.mls); takenStreets.add(streetKey(r.address)); bedCount[bucket(r.beds)]++; n++
    plan.push({ ...r, city: r.city || city })
  }
  if (n < want) console.error(`!! ${file}: only ${n}/${want}`)
}
for (const file of BACKUP) for (const r of parseList(file).filter(ok)) { if (backups.length < 60 && !taken.has(r.mls)) { taken.add(r.mls); backups.push(r) } }
fs.writeFileSync(S + 'plan.json', JSON.stringify({ plan, backups }, null, 1))
console.log(`planned ${plan.length} · beds 1:${bedCount[1]} 2:${bedCount[2]} 3+:${bedCount[3]} · backups ${backups.length}`)
for (const r of plan) console.log([r.mls, r.city, r.neighborhood, r.address, '$' + r.price, r.beds + (r.den ? '+1' : '') + 'b/' + r.baths + 'ba', r.sqft, r.brokerage.slice(0, 30)].join(' | '))

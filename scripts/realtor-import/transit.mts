// Transit stations for freshly imported listings — same Overpass query / picker as /api/listings/enrich,
// run slowly from this machine (the edge route gets 429s in bursts). Writes transit + enriched_at via service role.
import fs from 'node:fs'
import { transitOverpassQuery, overpassPoints, pickTransit } from '@/lib/listingInsights'
const S = process.env.IMPORT_DIR!.replace(/\/?$/, '/')
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, ''); const KEY = env.SUPABASE_SERVICE_ROLE_KEY!
const rows = JSON.parse(fs.readFileSync(S + 'inserted.json', 'utf8')) as { id: string; mls: string; lat: number; lng: number; city: string }[]
const done = fs.existsSync(S + 'transit_done.json') ? new Set<string>(JSON.parse(fs.readFileSync(S + 'transit_done.json', 'utf8'))) : new Set<string>()
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
async function overpass(q: string): Promise<unknown[] | null> {
  for (const ep of ENDPOINTS) {
    try {
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Stayloop/0.7 (import; privacy@stayloop.ai)' }, signal: AbortSignal.timeout(40000) })
      if (!r.ok) { console.log('  ', ep.split('/')[2], r.status); continue }
      const j = (await r.json()) as { elements?: unknown[]; remark?: string }
      if (j.remark && /timed out|runtime error/i.test(j.remark)) { console.log('   remark:', j.remark.slice(0, 80)); continue }
      return j.elements ?? []
    } catch (e) { console.log('   err', String(e).slice(0, 80)) }
  }
  return null
}
let ok = 0
for (const row of rows) {
  if (done.has(row.id) || !row.lat) continue
  const els = await overpass(transitOverpassQuery(row.lat, row.lng, 20))
  if (!els) { console.log(row.mls, 'FAILED (left for the edge route)'); await new Promise((r) => setTimeout(r, 8000)); continue }
  const stations = pickTransit(overpassPoints(els as never), row.lat, row.lng)
  const body = { transit: { stations, fetched_at: new Date().toISOString() }, enriched_at: new Date().toISOString() }
  const res = await fetch(`${URL_}/rest/v1/listings?id=eq.${row.id}`, { method: 'PATCH', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) })
  console.log(row.mls, row.city, res.status, `${stations.length} stations`, stations.slice(0, 2).map((s) => `${s.name} ${s.distance_m}m`).join(' · '))
  if (res.ok) { done.add(row.id); ok++; fs.writeFileSync(S + 'transit_done.json', JSON.stringify([...done])) }
  await new Promise((r) => setTimeout(r, 4000))
}
console.log(`transit written for ${ok}`)

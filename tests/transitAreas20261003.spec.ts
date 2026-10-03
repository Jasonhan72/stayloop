// 2026-10-03, importing 50 Realtor.ca rentals: 23 Oneida Crescent (540 m from Langstaff GO) and 15 Water Walk
// Drive (1.2 km from Unionville GO) came back with "no station within 1.5 km". Both GO stations exist in
// OpenStreetMap only as station areas (ways); the enrich route asked Overpass for nodes. It now asks for nodes,
// ways and relations with their centre, and treats Overpass's 200-with-a-timeout-remark as a failure.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { overpassPoints, pickTransit, transitOverpassQuery } from '@/lib/listingInsights'

describe('transit near stations mapped as areas', () => {
  it('the query covers ways and relations and returns their centre', () => {
    const q = transitOverpassQuery(43.8426, -79.4245)
    expect(q).toContain('nwr(around:1500,43.8426,-79.4245)["railway"="station"]')
    expect(q).toContain('nwr(around:1500,43.8426,-79.4245)["public_transport"="station"]["subway"="yes"]')
    expect(q).toContain('out center 80;')
  })
  it('a station way is placed at its centre and listed (Langstaff GO from 23 Oneida Cres)', () => {
    const els = [
      { type: 'way', center: { lat: 43.8378, lon: -79.4234 }, tags: { name: 'Langstaff', railway: 'station', public_transport: 'station', network: 'GO Transit' } },
      { type: 'way', tags: { name: 'No position' } },
    ]
    const pts = overpassPoints(els as never)
    expect(pts).toHaveLength(1)
    const stops = pickTransit(pts, 43.8426, -79.4245)
    expect(stops).toHaveLength(1)
    expect(stops[0]).toMatchObject({ name: 'Langstaff', kind: 'go' })
    expect(stops[0].distance_m).toBeGreaterThan(450)
    expect(stops[0].distance_m).toBeLessThan(650)
  })
  it('nodes keep their own position', () => {
    expect(overpassPoints([{ lat: 1, lon: 2, tags: { name: 'x' } }])).toEqual([{ lat: 1, lon: 2, tags: { name: 'x' } }])
  })
  it('the enrich route uses the shared query and does not cache a server-side timeout as "no stations"', () => {
    const route = readFileSync('app/api/listings/enrich/route.ts', 'utf8')
    expect(route).toContain('const q = transitOverpassQuery(lat, lng)')
    expect(route).toContain('pickTransit(overpassPoints(json.elements), lat, lng)')
    expect(route).toMatch(/!json\.elements\.length && \/error\|timed out\|runtime\/i\.test\(json\.remark/)
    expect(route).not.toContain('node(around:1500')
  })
})

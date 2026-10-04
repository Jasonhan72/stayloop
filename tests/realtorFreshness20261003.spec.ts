import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  applyReading,
  classifyRealtorDetail,
  pickBatch,
  plausibleRentChange,
  summarize,
  GONE_CONFIRMATIONS,
  type RealtorCheck,
} from '@/lib/listings/realtorFreshness'

// Trimmed from real Jina renders of realtor.ca detail pages (2026-10-03).
const LIVE = `Title: Check out this listing

URL Source: https://www.realtor.ca/real-estate/29755613/204-1191-ellesmere-road-toronto-bendale

Markdown Content:
204 - 1191 ELLESMERE ROAD

[![Image 3: View larger image on a Photo gallery](https://cdn.realtor.ca/listings/TS639143792980870000/reb82/highres/0/e13130710_1.jpg)]
![Image 9](https://static.realtor.ca/images/common/icons/svg/map-pin-blue.svg)204 - 1191 ELLESMERE ROAD $1,895/Monthly
MLS® Number: E13130710
$1,895/Monthly
`
const GONE = `Title: Real Estate Listings in Canada: houses, condos, land, property

URL Source: https://www.realtor.ca/real-estate/30227884/1802-210-simcoe-street-toronto-university

Markdown Content:
## The listing you are looking for no longer exists.

## Similar Listings

[![Image 6](https://cdn.realtor.ca/listings/TS639259399337930000/reb82/medres/4/c13829194_1.jpg) $2,300/Monthly 1018 - 121 ST. PATRICK STREET, Toronto (Kensington-Chinatown), Ontario](https://www.realtor.ca/real-estate/30328674/x)
`
const BLOCKED = `Title: Just a moment...\n\nPerforming security verification`

describe('classifyRealtorDetail', () => {
  it('reads a live page and its own price', () => {
    expect(classifyRealtorDetail(LIVE, 'E13130710')).toEqual({ kind: 'live', rent: 1895 })
  })
  it('says gone on "no longer exists" — similar listings\' prices are not ours', () => {
    expect(classifyRealtorDetail(GONE, 'C13738828')).toEqual({ kind: 'gone' })
  })
  it('a bot check is not gone', () => {
    expect(classifyRealtorDetail(BLOCKED, 'E13130710').kind).toBe('blocked')
  })
  it('a page that is neither (layout change, wrong listing) is unknown, never gone', () => {
    expect(classifyRealtorDetail(LIVE, 'C99999999').kind).toBe('unknown')
    expect(classifyRealtorDetail('Title: REALTOR.ca\n\nsomething else', 'E1').kind).toBe('unknown')
  })
  it('live via the photo filename when the MLS line moved', () => {
    expect(classifyRealtorDetail(LIVE.replace('MLS® Number: E13130710', ''), 'E13130710').kind).toBe('live')
  })
})

describe('applyReading', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  it('needs two gone readings before delisting', () => {
    const a = applyReading(null, { kind: 'gone' }, 2300, now)
    expect(a.delist).toBe(false)
    expect(a.check.gone_streak).toBe(1)
    const b = applyReading(a.check, { kind: 'gone' }, 2300, new Date('2026-10-03T14:00:00Z'))
    expect(GONE_CONFIRMATIONS).toBe(2)
    expect(b.delist).toBe(true)
    expect(b.check.delisted_at).toBe('2026-10-03T14:00:00.000Z')
  })
  it('a blocked read between two gone reads does not reset the streak; a live read does', () => {
    const a = applyReading(null, { kind: 'gone' }, 2300, now)
    const b = applyReading(a.check, { kind: 'blocked' }, 2300, now)
    expect(b.check.gone_streak).toBe(1)
    expect(b.check.miss_streak).toBe(1)
    expect(applyReading(b.check, { kind: 'gone' }, 2300, now).delist).toBe(true)
    expect(applyReading(a.check, { kind: 'live', rent: 2300 }, 2300, now).check.gone_streak).toBe(0)
  })
  it('follows a price change, ignores an implausible one', () => {
    expect(applyReading(null, { kind: 'live', rent: 2200 }, 2300, now).newRent).toBe(2200)
    expect(applyReading(null, { kind: 'live', rent: 2300 }, 2300, now).newRent).toBeNull()
    expect(applyReading(null, { kind: 'live', rent: 230000 }, 2300, now).newRent).toBeNull()
    expect(plausibleRentChange(null, 2300)).toBe(false)
  })
  it('errors and missing links never delist', () => {
    let c: RealtorCheck | null = null
    for (let i = 0; i < 5; i++) {
      const r = applyReading(c, { kind: 'error', status: 402 }, 2300, now)
      expect(r.delist).toBe(false)
      c = r.check
    }
    expect(c!.miss_streak).toBe(5)
    expect(applyReading(null, { kind: 'no_url' }, 2300, now).delist).toBe(false)
  })
})

describe('pickBatch', () => {
  const now = new Date('2026-10-03T12:00:00Z')
  const row = (id: string, check: Partial<RealtorCheck> | null) => ({
    id, source_url: 'x', realtor_check: check ? ({ gone_streak: 0, miss_streak: 0, state: 'live', ...check } as RealtorCheck) : null,
  })
  it('suspects first (after an hour), then never-checked, then oldest', () => {
    const rows = [
      row('old', { checked_at: '2026-10-02T00:00:00Z' }),
      row('new', null),
      row('suspect', { checked_at: '2026-10-03T10:00:00Z', gone_streak: 1 }),
      row('suspectFresh', { checked_at: '2026-10-03T11:30:00Z', gone_streak: 1 }),
      row('recent', { checked_at: '2026-10-03T11:00:00Z' }),
    ]
    expect(pickBatch(rows, now, 3).map((r) => r.id)).toEqual(['suspect', 'new', 'old'])
  })
})

describe('summarize', () => {
  it('counts', () => {
    const s = summarize([
      { source_url: null, realtor_check: null },
      { source_url: 'u', realtor_check: null },
      { source_url: 'u', realtor_check: { checked_at: '2026-10-03T01:00:00Z', state: 'live', gone_streak: 0, miss_streak: 0, last_live_at: 'x' } },
      { source_url: 'u', realtor_check: { checked_at: '2026-10-03T02:00:00Z', state: 'gone', gone_streak: 1, miss_streak: 0 } },
      { source_url: 'u', realtor_check: { checked_at: '2026-10-03T00:00:00Z', state: 'blocked', gone_streak: 0, miss_streak: 3 } },
    ], 4)
    expect(s).toMatchObject({ total: 5, noUrl: 1, never: 1, live: 1, suspect: 1, stale: 1, delisted: 4, lastRun: '2026-10-03T02:00:00Z' })
  })
})

describe('wiring', () => {
  const route = fs.readFileSync('app/api/cron/realtor-freshness/route.ts', 'utf8')
  const sql = fs.readFileSync('supabase/migrations/20261003_realtor_freshness.sql', 'utf8')
  it('route is cron-secret or admin only, and writes only over the state it read', () => {
    expect(route).toMatch(/x-cron-secret/)
    expect(route).toMatch(/is_stayloop_admin/)
    expect(route).toMatch(/realtor_check->>checked_at/)
    expect(route).toMatch(/source', 'realtor'/)
  })
  it('migration guards the column, keeps it out of updated_at, schedules hourly', () => {
    expect(sql).toMatch(/is_direct_client_write\(\)/)
    expect(sql).toMatch(/'trust_tier', 'realtor_check'/)
    expect(sql).toMatch(/'35 \* \* \* \*'/)
    expect(sql).toMatch(/from public, anon, authenticated, service_role/)
  })
  it('admin verify page shows the card', () => {
    expect(fs.readFileSync('app/admin/verify/page.tsx', 'utf8')).toMatch(/<RealtorFreshnessCard/)
  })
})

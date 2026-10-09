// 2026-10-09: /api/public/stats reads one RPC (planner estimate for ltb_orders, exact small counts,
// uncapped distinct TRREB quarters) and keeps the response in the Workers Cache API — Cloudflare never
// cached this JSON from `s-maxage` alone, so every homepage visit used to hit the database four times.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync('app/api/public/stats/route.ts', 'utf8')
const sql = readFileSync('supabase/migrations/20261009_public_stats_rpc.sql', 'utf8')

describe('public stats: estimate + one round trip + edge cache', () => {
  it('the route calls the RPC and no longer issues per-table counts', () => {
    expect(route).toContain("svc.rpc('public_stats')")
    expect(route).not.toMatch(/count: 'exact'/)
    expect(route).not.toMatch(/\.from\('ltb_orders'\)/)
    expect(route).not.toMatch(/\.from\('trreb_rent_stats'\)/)
    expect(route).toMatch(/caches\?\.default/)
    expect(route).toContain("'x-stats-cache'")
    expect(route).toContain('ltbOrdersEstimated')
  })
  it('the RPC uses the planner estimate for ltb_orders, exact counts for the small tables, and an uncapped distinct for quarters', () => {
    expect(sql).toMatch(/reltuples[\s\S]*'public\.ltb_orders'::regclass/)
    expect(sql).not.toMatch(/count\(\*\) from public\.ltb_orders/)
    expect(sql).toMatch(/count\(\*\) from public\.screenings/)
    expect(sql).toMatch(/verification_status = 'verified' or source = 'realtor'/)
    expect(sql).toMatch(/count\(distinct period\) from public\.trreb_rent_stats/)
    expect(sql).toMatch(/security invoker/)
    expect(sql).toMatch(/revoke all on function public\.public_stats\(\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.public_stats\(\) to service_role/)
  })
  it('the response shape the homepage and role pages read is unchanged', () => {
    for (const k of ['screenings', 'ltbOrders', 'listings', 'trrebQuarters']) expect(route).toContain(`${k}:`)
    const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
    expect(home).toMatch(/type Stats = \{ screenings: number \| null; ltbOrders: number \| null; listings: number \| null; trrebQuarters: number \| null \}/)
  })
})

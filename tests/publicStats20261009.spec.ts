// 2026-10-09: /api/public/stats reads one RPC (planner estimate for ltb_orders, exact small counts,
// uncapped distinct quarters) and keeps the response in the Workers Cache API — Cloudflare never
// cached this JSON from `s-maxage` alone, so every homepage visit used to hit the database four times.
// 2026-10-13: the quarter count is the Statistics Canada asking-rent series in rent_benchmarks
// (migration 20261013); the RPC still emits `trreb_quarters` with the same value and the route still
// sends `trrebQuarters` as a one-release alias so cached pages keep rendering.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync('app/api/public/stats/route.ts', 'utf8')
const sql = readFileSync('supabase/migrations/20261009_public_stats_rpc.sql', 'utf8')
const sql2 = readFileSync('supabase/migrations/20261013_rent_benchmarks.sql', 'utf8')

describe('public stats: estimate + one round trip + edge cache', () => {
  it('the route calls the RPC and no longer issues per-table counts', () => {
    expect(route).toContain("svc.rpc('public_stats')")
    expect(route).not.toMatch(/count: 'exact'/)
    expect(route).not.toMatch(/\.from\('ltb_orders'\)/)
    expect(route).not.toMatch(/\.from\('trreb_rent_stats'\)/)
    expect(route).toMatch(/caches\?\.default/)
    expect(route).toContain("'x-stats-cache'")
    expect(route).toContain('ltbOrdersEstimated')
    // benchmarkQuarters is the real key; trrebQuarters is the alias carrying the same value
    expect(route).toContain('benchmarkQuarters: num(d.benchmark_quarters ?? d.trreb_quarters)')
    expect(route).toContain('trrebQuarters: num(d.benchmark_quarters ?? d.trreb_quarters)')
  })
  it('the RPC uses the planner estimate for ltb_orders, exact counts for the small tables, and an uncapped distinct for quarters', () => {
    expect(sql).toMatch(/reltuples[\s\S]*'public\.ltb_orders'::regclass/)
    expect(sql).not.toMatch(/count\(\*\) from public\.ltb_orders/)
    expect(sql).toMatch(/count\(\*\) from public\.screenings/)
    expect(sql).toMatch(/verification_status = 'verified' or source = 'realtor'/)
    expect(sql).toMatch(/count\(distinct period\) from public\.trreb_rent_stats/)
    // 2026-10-13 redefinition: both keys count the StatCan quarters in rent_benchmarks, nothing reads the TRREB cache
    expect(sql2).toMatch(/'benchmark_quarters', \(select count\(distinct period\) from public\.rent_benchmarks where source = 'statcan'\)/)
    expect(sql2).toMatch(/'trreb_quarters', \(select count\(distinct period\) from public\.rent_benchmarks where source = 'statcan'\)/)
    expect(sql2).not.toMatch(/from public\.trreb_rent_stats/)
    expect(sql).toMatch(/security invoker/)
    expect(sql).toMatch(/revoke all on function public\.public_stats\(\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.public_stats\(\) to service_role/)
  })
  it('the response shape the homepage and role pages read: benchmarkQuarters plus the trrebQuarters alias', () => {
    for (const k of ['screenings', 'ltbOrders', 'listings', 'benchmarkQuarters', 'trrebQuarters']) expect(route).toContain(`${k}:`)
    const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
    expect(home).toMatch(/type Stats = \{ screenings: number \| null; ltbOrders: number \| null; listings: number \| null; benchmarkQuarters: number \| null; trrebQuarters\?: number \| null \}/)
    expect(home).toContain('fmt(stats?.benchmarkQuarters ?? stats?.trrebQuarters)')
    // the band names the real source: StatCan asking rents, never TRREB or "成交"
    expect(home).toContain('个季度的统计局挂牌租金数据，<i>注明来源</i>')
    expect(home).toContain('quarters of Statistics Canada asking-rent data, <i>sources shown</i>')
    const role = readFileSync('components/RoleLanding.tsx', 'utf8')
    expect(role).toContain("type StatKey = 'screenings' | 'ltbOrders' | 'listings' | 'benchmarkQuarters'")
  })
})

// 找房检索读不到库 (2026-10-27 · user: "查一下为什么 ai 没有找到这个房源"): anon lost
// SELECT on listings on 2026-10-11 (20261011_listings_anon_no_select.sql) and
// lib/agent/listingSearch kept querying PostgREST with the anon key, so every
// Stayloop search returned [] and the assistant said「库里没有符合条件的房源」.
// The server-side read now uses the service role with the public visibility
// filter; a failed request is logged, never silently "no listings".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const code = (p: string) => readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('agent home search reads the listings table as the server', () => {
  const s = code('lib/agent/listingSearch.ts')
  it('uses the service role (anon has no SELECT on listings since 2026-10-11) and logs a failed query', () => {
    expect(readFileSync('supabase/migrations/20261011_listings_anon_no_select.sql', 'utf8')).toContain('revoke select on public.listings from anon')
    expect(s).toContain('const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(s).toContain("console.warn('[listingSearch] stayloop query failed'")
  })
  it('keeps exactly the public page’s visibility: active, shown on the internet, verified-or-Realtor, photos', () => {
    expect(s).toContain("p.set('is_active', 'eq.true')")
    expect(s).toContain("p.set('display_internet', 'eq.true')")
    expect(s).toContain('LISTING_VISIBILITY_OR')
    expect(s).toContain('hasUsablePhotos(r.images)')
  })
  it('is only imported by server code (the key must never reach a client bundle)', () => {
    for (const p of ['app/api/agent/turn/route.ts', 'lib/listings/realtorFreshness.ts']) expect(code(p)).toContain("lib/agent/listingSearch'")
    expect(code('lib/agent/listingSearch.ts')).not.toContain("'use client'")
  })
})

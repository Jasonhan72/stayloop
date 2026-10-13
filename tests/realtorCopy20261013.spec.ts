// 2026-10-13 · PropTx refused Stayloop's IDX/VOW request; Stayloop stopped reading
// Realtor.ca (lib/listings/externalSources.ts). This guard keeps the user-facing
// copy honest: no page may still claim live Realtor.ca listings, Realtor.ca / MLS®
// link imports, an MLS sponsoring member or a TRREB member relationship.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FORBIDDEN = [
  'Realtor.ca 实时',
  'live from Realtor.ca',
  'Realtor.ca 链接',
  'Realtor.ca link',
  'MLS® 编号',
  'listing-sponsor-member',
  'NEXT_PUBLIC_MLS_SPONSOR',
  'TRREB 会员经纪',
]

// Scope: everything a visitor reads, minus the modules another decision owns —
// the agent search pipeline (lib/agent/*), API routes, the freshness cron helper
// and the admin-only freshness card (they talk about Realtor.ca by design).
const ROOTS = ['app', 'components', 'lib/home', 'lib/legal']
const FILES = ['lib/listings/dataNotice.ts']
const SKIP = [/\.spec\.tsx?$/, /^lib\/agent\//, /^app\/api\//, /^lib\/listings\/realtorFreshness\.ts$/, /^components\/admin\//]

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const files = [...ROOTS.flatMap((r) => walk(r, [])), ...FILES].filter((p) => !SKIP.some((re) => re.test(p)))

describe('no user-facing copy still claims Realtor.ca live reads, MLS imports or a sponsoring member', () => {
  it('scans app/, components/, lib/home, lib/legal and the data notice', () => {
    expect(files.length).toBeGreaterThan(50)
    const hits: string[] = []
    for (const p of files) {
      const src = readFileSync(p, 'utf8')
      for (const needle of FORBIDDEN) if (src.includes(needle)) hits.push(`${p}: ${needle}`)
    }
    expect(hits).toEqual([])
  })
  it('the policy module is the single switch and it is off', () => {
    const policy = readFileSync('lib/listings/externalSources.ts', 'utf8')
    expect(policy).toContain('export const REALTOR_LIVE_READS = false as const')
  })
})

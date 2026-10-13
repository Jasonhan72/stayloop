// 2026-10-13 · the rent benchmark moved from TRREB's quarterly report (all
// rights reserved, no licence) to two openly licensed sources loaded into
// public.rent_benchmarks: the CMHC Rental Market Survey (annual, zone ×
// bedroom; purpose-built and rental condo) and Statistics Canada table
// 46-10-0092-01 (quarterly asking rents, Toronto CMA). Pure helpers of
// lib/market/rentBenchmark.ts plus the surfaces that print the figure.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  bedBucket,
  benchmarkAttribution,
  benchmarkLabel,
  cmhcCondoAreaFor,
  cmhcPeriodLabel,
  cmhcZoneFor,
  statcanPeriodLabel,
} from '@/lib/market/rentBenchmark'
import { marketFromRows, marketLineText, marketPeriodLabel } from '@/lib/agent/renewalStages'

const read = (p: string) => readFileSync(p, 'utf8')

describe('rent benchmark helpers (lib/market/rentBenchmark)', () => {
  it('bedBucket: studio 0 · 1 · 2 · 3 = three or more · unknown → 1', () => {
    expect(bedBucket(0)).toBe(0)
    expect(bedBucket(1)).toBe(1)
    expect(bedBucket(2)).toBe(2)
    expect(bedBucket(3)).toBe(3)
    expect(bedBucket(8)).toBe(3)
    expect(bedBucket(null)).toBe(1)
    expect(bedBucket(undefined)).toBe(1)
  })
  it('cmhcZoneFor: neighbourhoods → CMHC zone rows, Toronto falls back to the city row', () => {
    expect(cmhcZoneFor(['Bay Street Corridor'])).toBe('Zone 1 - Toronto (Central)')
    expect(cmhcZoneFor(['Markham'])).toBe('Zone 27 - Markham')
    expect(cmhcZoneFor(['Willowdale'])).toBe('Zone 14 - North York (Northeast)')
    expect(cmhcZoneFor(['Toronto'])).toBe('City of Toronto (Zones 1-17)')
    expect(cmhcZoneFor([null, undefined, 'Unknown Place'])).toBeNull()
    // first term wins, case-insensitive
    expect(cmhcZoneFor(['MISSISSAUGA', 'Toronto'])).toBe('Mississauga City (Zones 18-20)')
  })
  it('cmhcCondoAreaFor: condo sub-areas (Table 4.1.3)', () => {
    expect(cmhcCondoAreaFor(['Willowdale'])).toBe('North York')
    expect(cmhcCondoAreaFor(['Markham'])).toBe('York Region')
    expect(cmhcCondoAreaFor(['Mimico'])).toBe('Etobicoke')
    expect(cmhcCondoAreaFor(['Toronto'])).toBe('Former City of Toronto, York and East York')
    expect(cmhcCondoAreaFor(['Nowhere'])).toBeNull()
  })
  it('period labels', () => {
    expect(statcanPeriodLabel('2026-04', 'en')).toBe('2026 Q2')
    expect(statcanPeriodLabel('2026-04', 'zh')).toBe('2026 年第 2 季度')
    expect(statcanPeriodLabel('2026-01', 'en')).toBe('2026 Q1')
    expect(statcanPeriodLabel('2025-10', 'en')).toBe('2025 Q4')
    expect(cmhcPeriodLabel('2025-10', 'en')).toBe('October 2025')
    expect(cmhcPeriodLabel('2025-10', 'zh')).toBe('2025 年 10 月')
  })
  it('benchmarkAttribution carries the exact CMHC licence notice', () => {
    expect(benchmarkAttribution({ source: 'cmhc', kind: 'purpose_built', period: '2025-10' }, 'en')).toContain(
      'Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, October 2025',
    )
    expect(benchmarkAttribution({ source: 'cmhc', kind: 'condo', period: '2025-10' }, 'en')).toContain('(rental condominium apartments)')
    expect(benchmarkAttribution({ source: 'cmhc', kind: 'purpose_built', period: '2025-10' }, 'zh')).toContain('加拿大按揭与住房公司（CMHC）租赁市场调查，2025 年 10 月')
    expect(benchmarkAttribution({ source: 'statcan', kind: 'asking', period: '2026-04' }, 'en')).toBe(
      'Source: Statistics Canada, Table 46-10-0092-01, average asking rent, 2026 Q2',
    )
    expect(benchmarkAttribution({ source: 'statcan', kind: 'asking', period: '2026-04' }, 'zh')).toContain('加拿大统计局，表 46-10-0092-01')
  })
  it('benchmarkLabel: short card caption per source', () => {
    expect(benchmarkLabel({ source: 'cmhc', area: 'Zone 1 - Toronto (Central)', period: '2025-10' }, 'zh')).toBe('CMHC · Zone 1 - Toronto (Central) · 2025 年 10 月')
    expect(benchmarkLabel({ source: 'statcan', area: 'Toronto CMA', period: '2026-04' }, 'en')).toBe('StatCan · Toronto CMA · 2026 Q2')
  })
})

describe('renewal market line reads StatCan quarters', () => {
  it('marketFromRows picks the latest period and marketLineText cites Statistics Canada', () => {
    const m = marketFromRows([
      { period: '2026-01', bed_type: 1, avg_rent: 2300 },
      { period: '2026-04', bed_type: 1, avg_rent: 2350 },
      { period: '2026-04', bed_type: 3, avg_rent: 3900 },
    ])
    expect(m?.period).toBe('2026-04')
    expect(marketLineText(m)).toBe('统计局（StatCan）2026 年第 2 季度多伦多 CMA 挂牌均租：1 房 $2,350 · 3+ 房 $3,900。')
    expect(marketPeriodLabel('2026-04', 'en')).toBe('2026 Q2')
    expect(marketPeriodLabel('2026 Q2', 'zh')).toBe('2026 年第 2 季度') // legacy period on an older card
    expect(marketLineText(null)).toBe('')
  })
})

describe('no TRREB figures printed anywhere (retired 2026-10-13)', () => {
  it('the market type carries `benchmark` (RentBenchmark), not `trreb`', () => {
    const types = read('lib/agent/types.ts')
    expect(types).toContain("import type { RentBenchmark } from '@/lib/market/rentBenchmark'")
    expect(types).toContain('benchmark?: RentBenchmark')
    expect(types).not.toMatch(/trreb\?:/)
    const search = read('lib/agent/listingSearch.ts')
    expect(search).toContain("import { readRentBenchmark, type RentBenchmark } from '@/lib/market/rentBenchmark'")
    expect(search).toContain("const benchmarkType = nt === 'condo' ? 'condo' : nt === 'townhouse' ? 'townhouse' : 'apartment'")
    expect(search).toContain('if (market && benchmark) market.benchmark = benchmark')
    expect(search).not.toContain('trrebRent')
  })
  it('the chat market card prints the label + attribution and the StatCan trend caption', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).not.toContain('TRREB')
    expect(chat).toContain("import BenchmarkTrendChart from './BenchmarkTrendChart'")
    expect(chat).toContain('{benchmarkLabel(b, lang)}')
    expect(chat).toContain('{benchmarkAttribution(b, lang)}')
    expect(chat).toContain("b.source === 'statcan' ? '挂牌均价' : '均租'")
    expect(chat).toContain('<BenchmarkTrendChart history={m.market.benchmark.history} accent={accent} lang={lang} />')
    const chart = read('components/agent/BenchmarkTrendChart.tsx')
    expect(chart).toContain("zh: 'StatCan 季度挂牌租金 · 多伦多 CMA'")
    expect(chart).toContain("en: 'StatCan quarterly asking rent · Toronto CMA'")
    expect(chart).not.toContain('TRREB')
  })
  it('the listing detail page and the finance page read the new source and print the attribution', () => {
    const page = read('app/listings/[slug]/page.tsx')
    expect(page).not.toContain('TRREB')
    expect(page).toContain("readRentBenchmark(listing.bedrooms, [listing.neighborhood, listing.city], benchmarkType)")
    expect(page).toContain('data-testid="benchmark-attribution"')
    expect(page).toContain("'CMHC 调查均租'")
    expect(page).toContain('CMHC 租赁市场调查（调查均租，非挂牌价）')
    const finance = read('app/landlord/finance/page.tsx')
    expect(finance).not.toContain('TRREB')
    expect(finance).toContain("readRentBenchmark(1, ['King West'], 'apartment')")
    expect(finance).toContain('{benchmarkAttribution(bm, lang)}')
  })
  it('the TRREB reader and its refresh route are gone; prompts and intake name the public sources', () => {
    expect(() => read('lib/agent/trrebRent.ts')).toThrow()
    expect(() => read('app/api/agent/trreb-refresh/route.ts')).toThrow()
    for (const f of ['lib/agent/prompts.ts', 'lib/agent/intake.ts', 'lib/agent/ideas.ts', 'lib/agent/renewalStages.ts', 'app/api/agent/proactive/route.ts']) {
      expect(read(f), f).not.toContain('TRREB 官方')
      expect(read(f), f).not.toMatch(/TRREB 行情|TRREB 均租|TRREB benchmark|TRREB \$\{/)
    }
    expect(read('app/api/agent/proactive/route.ts')).toContain(".from('rent_benchmarks')")
  })
})

import { benchmarkCandidates } from '@/lib/market/rentBenchmark'
describe('benchmarkCandidates — most specific first, honest fallbacks', () => {
  it('a Toronto condo reads the condo sub-area, then the city, then the CMA; purpose-built is the alt', () => {
    const c = benchmarkCandidates(['Yonge & Sheppard', 'Toronto'], 'condo')
    expect(c[0]).toEqual({ kind: 'condo', areas: ['North York', 'Toronto', 'Toronto CMA'] })
    expect(c[1]).toEqual({ kind: 'purpose_built', areas: ['Zone 14 - North York (Northeast)', 'City of Toronto (Zones 1-17)', 'Toronto CMA'] })
  })
  it('an ambiguous "apartment" also prefers the condo figure; a townhouse reads purpose-built first', () => {
    expect(benchmarkCandidates(['Bay Street Corridor'], 'apartment')[0].kind).toBe('condo')
    expect(benchmarkCandidates(['Bay Street Corridor'], 'townhouse')[0].kind).toBe('purpose_built')
  })
  it('a GTA area outside the City of Toronto never falls back to the City of Toronto row', () => {
    const c = benchmarkCandidates(['Oshawa'], 'condo')
    expect(c[0].areas).toEqual(['Durham Region', 'Toronto CMA'])
    expect(c[1].areas).toEqual(['Durham Region', 'Toronto CMA'])
    expect(c.flatMap((x) => x.areas)).not.toContain('City of Toronto (Zones 1-17)')
  })
})

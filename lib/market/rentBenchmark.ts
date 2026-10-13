// Rent benchmark (2026-10-13) — replaces lib/agent/trrebRent.ts.
//
// TRREB's quarterly Rental Market Report is "© Toronto Regional Real Estate
// Board, all rights reserved" with no reproduction licence we could find, so
// its figures are no longer republished here (the cache table stays, unread).
// Two openly licensed sources take its place:
//   • CMHC Rental Market Survey (annual, October): average rents by ZONE and
//     bedroom for purpose-built apartments, and by sub-area for rental condos.
//     Licence: https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-data/cmhc-licence-agreement-use-of-data
//     Required notice: "Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, October 2025".
//   • Statistics Canada table 46-10-0092-01 (quarterly): average ASKING rent
//     for the Toronto CMA by unit type. Open Government Licence – Canada.
// Rows live in public.rent_benchmarks (scripts/rent-benchmarks/).
//
// What callers get: the most specific CMHC figure for the area (condo sub-area
// when the unit is a condo, else the purpose-built zone), plus the StatCan
// asking-rent series for the trend chart. Numbers are never written by a model.

export type BenchmarkKind = 'purpose_built' | 'condo' | 'asking'

export type RentBenchmark = {
  source: 'cmhc' | 'statcan'
  kind: BenchmarkKind
  /** Period as published: CMHC '2025-10', StatCan '2026-04' (quarter start month). */
  period: string
  /** Area row as published ('Zone 1 - Toronto (Central)', 'North York', 'Toronto CMA'). */
  area: string
  avg: number
  prev_avg?: number | null
  /** CMHC reliability a/b/c/d (d = use with caution). */
  quality?: string | null
  /** Quarterly asking-rent series (StatCan, Toronto CMA), oldest first — the trend chart. */
  history?: { period: string; avg: number }[]
  /** The StatCan asking-rent benchmark alongside a CMHC figure (same bedroom count). */
  asking?: { period: string; avg: number; prev_avg?: number | null }
}

/** CMHC bedroom bucket: 0 studio · 1 · 2 · 3 = three or more. */
export function bedBucket(minBeds?: number | null): number | null {
  if (minBeds == null || !Number.isFinite(minBeds)) return 1
  if (minBeds <= 0) return 0
  return Math.min(3, Math.round(minBeds))
}

// Area / neighbourhood terms → CMHC zone row (Table 1.1.2). Substring match on
// the lower-cased term, first hit wins; unknown Toronto terms fall back to the
// city row, unknown GTA terms to the CMA row.
const ZONE_MAP: [string, string][] = [
  ['bay street corridor', 'Zone 1 - Toronto (Central)'], ['university of toronto', 'Zone 1 - Toronto (Central)'], ['kensington', 'Zone 1 - Toronto (Central)'],
  ['chinatown', 'Zone 1 - Toronto (Central)'], ['entertainment district', 'Zone 1 - Toronto (Central)'], ['financial district', 'Zone 1 - Toronto (Central)'],
  ['liberty village', 'Zone 1 - Toronto (Central)'], ['king west', 'Zone 1 - Toronto (Central)'], ['cityplace', 'Zone 1 - Toronto (Central)'],
  ['harbourfront', 'Zone 1 - Toronto (Central)'], ['downtown', 'Zone 1 - Toronto (Central)'], ['yorkville', 'Zone 1 - Toronto (Central)'],
  ['annex', 'Zone 1 - Toronto (Central)'], ['st lawrence', 'Zone 1 - Toronto (Central)'], ['st. lawrence', 'Zone 1 - Toronto (Central)'],
  ['corktown', 'Zone 1 - Toronto (Central)'], ['regent park', 'Zone 1 - Toronto (Central)'], ['church', 'Zone 1 - Toronto (Central)'],
  ['cabbagetown', 'Zone 1 - Toronto (Central)'], ['yonge-bay', 'Zone 1 - Toronto (Central)'], ['ryerson', 'Zone 1 - Toronto (Central)'], ['tmu', 'Zone 1 - Toronto (Central)'],
  ['leslieville', 'Zone 2 - Toronto (East)'], ['riverdale', 'Zone 2 - Toronto (East)'], ['danforth', 'Zone 2 - Toronto (East)'], ['the beaches', 'Zone 2 - Toronto (East)'], ['beach', 'Zone 2 - Toronto (East)'],
  ['yonge and eglinton', 'Zone 3 - Toronto (North)'], ['yonge & eglinton', 'Zone 3 - Toronto (North)'], ['davisville', 'Zone 3 - Toronto (North)'], ['midtown', 'Zone 3 - Toronto (North)'],
  ['forest hill', 'Zone 3 - Toronto (North)'], ['leaside', 'Zone 3 - Toronto (North)'], ['st. clair', 'Zone 3 - Toronto (North)'], ['st clair', 'Zone 3 - Toronto (North)'],
  ['parkdale', 'Zone 4 - Toronto (West)'], ['high park', 'Zone 4 - Toronto (West)'], ['junction', 'Zone 4 - Toronto (West)'], ['roncesvalles', 'Zone 4 - Toronto (West)'],
  ['little italy', 'Zone 4 - Toronto (West)'], ['trinity', 'Zone 4 - Toronto (West)'], ['niagara', 'Zone 4 - Toronto (West)'], ['dufferin', 'Zone 4 - Toronto (West)'],
  ['mimico', 'Zone 5 - Etobicoke (South)'], ['humber bay', 'Zone 5 - Etobicoke (South)'], ['queensway', 'Zone 5 - Etobicoke (South)'], ['etobicoke', 'Etobicoke (Zones 5-7)'],
  ['york university', 'Zone 17 - North York (Northwest)'], ['jane', 'Zone 17 - North York (Northwest)'],
  ['willowdale', 'Zone 14 - North York (Northeast)'], ['yonge and sheppard', 'Zone 14 - North York (Northeast)'], ['yonge & sheppard', 'Zone 14 - North York (Northeast)'],
  ['bayview village', 'Zone 14 - North York (Northeast)'], ['newtonbrook', 'Zone 16 - North York (N.Central)'], ['don mills', 'Zone 13 - North York (Southeast)'],
  ['henry farm', 'Zone 13 - North York (Southeast)'], ['flemingdon', 'Zone 13 - North York (Southeast)'], ['avondale', 'Zone 14 - North York (Northeast)'],
  ['north york', 'North York (Zones 13-17)'], ['east york', 'Zone 9 - East York'],
  ['scarborough', 'Scarborough (Zones 10-12)'], ['agincourt', 'Zone 11 - Scarborough (North)'], ['bendale', 'Zone 10 - Scarborough (Central)'],
  ['mississauga', 'Mississauga City (Zones 18-20)'], ['port credit', 'Zone 18 - Mississauga (South)'], ['brampton', 'Brampton City (Zones 21-22)'],
  ['oakville', 'Zone 23 - Oakville'], ['caledon', 'Zone 24 - Caledon'], ['richmond hill', 'Zone 25 - Richmond Hill/Vaughan/King'], ['vaughan', 'Zone 25 - Richmond Hill/Vaughan/King'],
  ['concord', 'Zone 25 - Richmond Hill/Vaughan/King'], ['woodbridge', 'Zone 25 - Richmond Hill/Vaughan/King'], ['maple', 'Zone 25 - Richmond Hill/Vaughan/King'],
  ['aurora', 'Zone 26 - Aurora, Newmkt, Whit-St.'], ['newmarket', 'Zone 26 - Aurora, Newmkt, Whit-St.'], ['markham', 'Zone 27 - Markham'], ['unionville', 'Zone 27 - Markham'],
  ['pickering', 'Zone 28 - Pickering/Ajax/Uxbridge'], ['ajax', 'Zone 28 - Pickering/Ajax/Uxbridge'], ['milton', 'Zone 29 - Milton/Halton Hills'],
  ['whitby', 'Durham Region'], ['oshawa', 'Durham Region'], ['burlington', 'Halton Region'],
  ['toronto', 'City of Toronto (Zones 1-17)'],
]

// Condo sub-areas (Table 4.1.3).
const CONDO_MAP: [string, string][] = [
  ['etobicoke', 'Etobicoke'], ['mimico', 'Etobicoke'], ['humber bay', 'Etobicoke'], ['scarborough', 'Scarborough'], ['agincourt', 'Scarborough'],
  ['north york', 'North York'], ['willowdale', 'North York'], ['yonge and sheppard', 'North York'], ['yonge & sheppard', 'North York'], ['don mills', 'North York'],
  ['bayview village', 'North York'], ['avondale', 'North York'], ['york university', 'North York'],
  ['mississauga', 'Peel Region'], ['brampton', 'Peel Region'], ['caledon', 'Peel Region'],
  ['oakville', 'Halton Region'], ['burlington', 'Halton Region'], ['milton', 'Halton Region'],
  ['markham', 'York Region'], ['richmond hill', 'York Region'], ['vaughan', 'York Region'], ['aurora', 'York Region'], ['newmarket', 'York Region'], ['unionville', 'York Region'],
  ['pickering', 'Durham Region'], ['ajax', 'Durham Region'], ['whitby', 'Durham Region'], ['oshawa', 'Durham Region'],
  ['toronto', 'Former City of Toronto, York and East York'],
]

export function cmhcZoneFor(terms: (string | null | undefined)[]): string | null {
  for (const t of terms) {
    const s = (t || '').toLowerCase()
    if (!s) continue
    for (const [key, zone] of ZONE_MAP) if (s.includes(key)) return zone
  }
  return null
}

export function cmhcCondoAreaFor(terms: (string | null | undefined)[]): string | null {
  for (const t of terms) {
    const s = (t || '').toLowerCase()
    if (!s) continue
    for (const [key, area] of CONDO_MAP) if (s.includes(key)) return area
  }
  return null
}

type Row = { source: string; kind: string; period: string; area: string; bedrooms: number; avg_rent: number | string; prev_avg: number | string | null; quality: string | null }

async function fetchRows(params: Record<string, string>): Promise<Row[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return []
  const q = new URLSearchParams({ select: 'source,kind,period,area,bedrooms,avg_rent,prev_avg,quality', ...params })
  try {
    const res = await fetch(`${url}/rest/v1/rent_benchmarks?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) })
    if (!res.ok) return []
    return (await res.json()) as Row[]
  } catch {
    return []
  }
}

/**
 * The benchmark for a unit: CMHC condo sub-area for condos, CMHC purpose-built
 * zone otherwise (fallback: city, then CMA), with the StatCan asking-rent
 * series attached. Null only when no source has the bedroom bucket.
 */
export async function readRentBenchmark(
  minBeds?: number | null,
  areaTerms: (string | null | undefined)[] = [],
  propertyType: 'apartment' | 'condo' | 'townhouse' | 'house' = 'apartment',
): Promise<RentBenchmark | null> {
  const bed = bedBucket(minBeds)
  if (bed == null) return null
  const condo = propertyType === 'condo'
  const candidates: { kind: BenchmarkKind; areas: string[] }[] = condo
    ? [
        { kind: 'condo', areas: [cmhcCondoAreaFor(areaTerms), 'Toronto', 'Toronto CMA'].filter((a): a is string => !!a) },
        { kind: 'purpose_built', areas: [cmhcZoneFor(areaTerms), 'City of Toronto (Zones 1-17)', 'Toronto CMA'].filter((a): a is string => !!a) },
      ]
    : [
        { kind: 'purpose_built', areas: [cmhcZoneFor(areaTerms), 'City of Toronto (Zones 1-17)', 'Toronto CMA'].filter((a): a is string => !!a) },
        { kind: 'condo', areas: [cmhcCondoAreaFor(areaTerms), 'Toronto', 'Toronto CMA'].filter((a): a is string => !!a) },
      ]
  const [askingRows, ...cmhcSets] = await Promise.all([
    fetchRows({ source: 'eq.statcan', kind: 'eq.asking', bedrooms: `eq.${bed}`, order: 'period.desc', limit: '12' }),
    ...candidates.map((c) => fetchRows({ source: 'eq.cmhc', kind: `eq.${c.kind}`, bedrooms: `eq.${bed}`, area_key: `in.(${c.areas.map((a) => `"${a.toLowerCase().replace(/"/g, '')}"`).join(',')})`, order: 'period.desc', limit: '12' })),
  ])
  const asking = askingRows[0]
    ? { period: askingRows[0].period, avg: Number(askingRows[0].avg_rent), prev_avg: askingRows[0].prev_avg != null ? Number(askingRows[0].prev_avg) : null }
    : undefined
  const history = askingRows.length ? askingRows.slice(0, 8).map((r) => ({ period: r.period, avg: Number(r.avg_rent) })).reverse() : undefined

  for (let i = 0; i < candidates.length; i++) {
    const rows = cmhcSets[i]
    if (!rows.length) continue
    const latest = rows.map((r) => r.period).sort().at(-1)!
    for (const area of candidates[i].areas) {
      const row = rows.find((r) => r.period === latest && r.area.toLowerCase() === area.toLowerCase())
      if (row) {
        return { source: 'cmhc', kind: candidates[i].kind, period: row.period, area: row.area, avg: Number(row.avg_rent), prev_avg: row.prev_avg != null ? Number(row.prev_avg) : null, quality: row.quality, history, asking }
      }
    }
  }
  if (asking) return { source: 'statcan', kind: 'asking', period: asking.period, area: 'Toronto CMA', avg: asking.avg, prev_avg: asking.prev_avg, history, asking }
  return null
}

/** Attribution lines required by the licences (shown wherever a figure is printed). */
export function benchmarkAttribution(b: Pick<RentBenchmark, 'source' | 'kind' | 'period'>, lang: 'zh' | 'en'): string {
  if (b.source === 'cmhc') {
    const date = cmhcPeriodLabel(b.period, lang)
    return lang === 'zh'
      ? `来源：加拿大按揭与住房公司（CMHC）租赁市场调查，${date}${b.kind === 'condo' ? '（出租公寓单元）' : '（专门出租公寓楼）'}`
      : `Source: Canada Mortgage and Housing Corporation (CMHC), Rental Market Survey, ${date}${b.kind === 'condo' ? ' (rental condominium apartments)' : ' (purpose-built apartments)'}`
  }
  return lang === 'zh'
    ? `来源：加拿大统计局，表 46-10-0092-01，季度平均挂牌租金，${statcanPeriodLabel(b.period, lang)}`
    : `Source: Statistics Canada, Table 46-10-0092-01, average asking rent, ${statcanPeriodLabel(b.period, lang)}`
}

export function cmhcPeriodLabel(period: string, lang: 'zh' | 'en'): string {
  const [y, m] = period.split('-')
  const months = lang === 'zh' ? null : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return lang === 'zh' ? `${y} 年 ${Number(m)} 月` : `${months![Number(m) - 1]} ${y}`
}

export function statcanPeriodLabel(period: string, lang: 'zh' | 'en'): string {
  const [y, m] = period.split('-')
  const q = Math.floor((Number(m) - 1) / 3) + 1
  return lang === 'zh' ? `${y} 年第 ${q} 季度` : `${y} Q${q}`
}

/** Short label for cards: "CMHC · Zone 1 - Toronto (Central) · 2025 年 10 月". */
export function benchmarkLabel(b: Pick<RentBenchmark, 'source' | 'area' | 'period'>, lang: 'zh' | 'en'): string {
  return b.source === 'cmhc' ? `CMHC · ${b.area} · ${cmhcPeriodLabel(b.period, lang)}` : `StatCan · ${b.area} · ${statcanPeriodLabel(b.period, lang)}`
}

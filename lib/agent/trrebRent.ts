// TRREB quarterly Rental Market Report → authoritative rent benchmark.
//
// The report PDF (trreb.ca, quarterly) carries a "Rental Market Summary"
// block with average LEASED rents by bedroom type across the whole TRREB
// MLS — thousands of closed transactions, far more authoritative than our
// scraped asking-price sample. Parsed rows are cached in
// public.trreb_rent_stats (refreshed weekly by /api/agent/trreb-refresh via
// pg_cron); the agent turn only ever does a fast DB read.
//
// Parsing is FAIL-CLOSED: the summary numbers must cross-check against the
// report's narrative sentence ("The average one-bedroom apartment rent was
// $X …") or nothing is stored — a wrong official-looking number is worse
// than none.

export type TrrebRentRow = {
  bed_type: number // 0 = bachelor, 1, 2, 3 = 3+
  avg_rent: number
  prev_avg_rent: number | null
  leased: number | null
}

export type TrrebReport = { period: string; rows: TrrebRentRow[] }

export type TrrebBenchmark = {
  period: string
  avg: number
  prev_avg?: number | null
  leased?: number | null
  // Which TRREB table row the number came from ('Toronto C14', 'Mississauga',
  // 'All TRREB Areas' fallback…).
  area: string
}

// User-facing area / neighbourhood terms → the TRREB report row that covers
// them. Districts first (most specific), then municipality identity matches;
// fallback is the TRREB-wide row. Substring match, lowercase.
const TRREB_AREA_MAP: [string, string][] = [
  ['bay street corridor', 'Toronto C01'],
  ['university of toronto', 'Toronto C01'],
  ['kensington', 'Toronto C01'],
  ['chinatown', 'Toronto C01'],
  ['entertainment district', 'Toronto C01'],
  ['financial district', 'Toronto C01'],
  ['liberty village', 'Toronto C01'],
  ['king west', 'Toronto C01'],
  ['cityplace', 'Toronto C01'],
  ['harbourfront', 'Toronto C01'],
  ['downtown', 'Toronto C01'],
  ['yorkville', 'Toronto C02'],
  ['annex', 'Toronto C02'],
  ['st lawrence', 'Toronto C08'],
  ['corktown', 'Toronto C08'],
  ['regent park', 'Toronto C08'],
  ['yonge and eglinton', 'Toronto C10'],
  ['davisville', 'Toronto C10'],
  ['midtown', 'Toronto C10'],
  ['willowdale', 'Toronto C14'],
  ['yonge and sheppard', 'Toronto C14'],
  ['yonge & sheppard', 'Toronto C14'],
  ['newtonbrook', 'Toronto C14'],
  ['north york', 'Toronto C14'],
  ['don mills', 'Toronto C15'],
  ['henry farm', 'Toronto C15'],
  ['york university', 'Toronto W05'],
  ['mimico', 'Toronto W06'],
  ['humber bay', 'Toronto W06'],
  ['etobicoke', 'Toronto West'],
  ['scarborough', 'Toronto East'],
  ['east york', 'Toronto East'],
  ['leslieville', 'Toronto E01'],
  ['danforth', 'Toronto E03'],
  ['mississauga', 'Mississauga'],
  ['markham', 'Markham'],
  ['vaughan', 'Vaughan'],
  ['richmond hill', 'Richmond Hill'],
  ['oakville', 'Oakville'],
  ['burlington', 'Burlington'],
  ['milton', 'Milton'],
  ['brampton', 'Brampton'],
  ['newmarket', 'Newmarket'],
  ['aurora', 'Aurora'],
  ['ajax', 'Ajax'],
  ['pickering', 'Pickering'],
  ['whitby', 'Whitby'],
  ['oshawa', 'Oshawa'],
]

export function trrebAreaFor(terms: (string | null | undefined)[]): string | null {
  for (const t of terms) {
    const s = (t || '').toLowerCase()
    if (!s) continue
    for (const [key, area] of TRREB_AREA_MAP) if (s.includes(key)) return area
  }
  return null
}

// Candidate report URLs, newest quarter first. Reports publish ~2 months
// after quarter end, so walk back a few quarters from today.
export function trrebReportCandidates(now: Date): { period: string; url: string }[] {
  const out: { period: string; url: string }[] = []
  let year = now.getUTCFullYear()
  let q = Math.floor(now.getUTCMonth() / 3) + 1
  for (let i = 0; i < 5; i++) {
    out.push({
      period: `${year} Q${q}`,
      url: `https://trreb.ca/wp-content/files/market-stats/rental-reports/rental_report_Q${q}-${year}.pdf`,
    })
    q -= 1
    if (q === 0) {
      q = 4
      year -= 1
    }
  }
  return out
}

const num = (s: string) => parseInt(s.replace(/,/g, ''), 10)

// Parse the Jina-extracted markdown of a rental report PDF.
export function parseTrrebRentalReport(md: string): TrrebReport | null {
  const periodM = md.match(/Rental Market Report,?\s*(\d{4})\s*Q([1-4])/i)
  if (!periodM) return null
  const period = `${periodM[1]} Q${periodM[2]}`

  const start = md.search(/Rental Market Summary/i)
  if (start < 0) return null
  const win = md.slice(start, start + 1600)

  // Sequential token walk: each bedroom group appears as two $-amounts
  // (prior year, current year) followed by two plain leased counts. Years
  // (1900–2100) are noise from surrounding text.
  const tokens: { v: number; dollar: boolean }[] = []
  const re = /\$([\d,]+)|(?<![\d,$])(\d{1,2},\d{3}|\d{3,5})(?![\d,])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(win))) {
    if (m[1]) tokens.push({ v: num(m[1]), dollar: true })
    else {
      const v = num(m[2])
      if (v >= 1900 && v <= 2100) continue
      tokens.push({ v, dollar: false })
    }
  }

  // Groups in document order: Grand Total, Bachelor, 1-Bdrm, 2-Bdrm, 3-Bdrm.
  const groups: { a: number; b: number; leased: number[] }[] = []
  for (let i = 0; i < tokens.length && groups.length < 5; i++) {
    if (!tokens[i].dollar || !tokens[i + 1]?.dollar) continue
    const g = { a: tokens[i].v, b: tokens[i + 1].v, leased: [] as number[] }
    let j = i + 2
    while (j < tokens.length && !tokens[j].dollar && g.leased.length < 2) {
      g.leased.push(tokens[j].v)
      j++
    }
    groups.push(g)
    i = j - 1
  }
  if (groups.length < 5) return null

  // Orientation cross-check against the narrative boilerplate — tells us
  // which of the pair is the CURRENT quarter. Fail closed without it.
  const oneBedM = md.match(/one[- ]bedroom apartment rent was \$([\d,]+)/i)
  if (!oneBedM) return null
  const oneBedCurr = num(oneBedM[1])
  const g1 = groups[2] // 1-bedroom group
  let currIsB: boolean
  if (g1.b === oneBedCurr) currIsB = true
  else if (g1.a === oneBedCurr) currIsB = false
  else return null

  const pick = (g: { a: number; b: number; leased: number[] }) => ({
    avg: currIsB ? g.b : g.a,
    prev: currIsB ? g.a : g.b,
    leased: g.leased.length === 2 ? (currIsB ? g.leased[1] : g.leased[0]) : null,
  })

  const rows: TrrebRentRow[] = []
  const bedTypes = [0, 1, 2, 3] // groups[1..4]
  for (let gi = 1; gi <= 4; gi++) {
    const { avg, prev, leased } = pick(groups[gi])
    if (avg < 800 || avg > 12000) return null
    if (prev && Math.abs(avg - prev) / prev > 0.35) return null
    rows.push({ bed_type: bedTypes[gi - 1], avg_rent: avg, prev_avg_rent: prev || null, leased })
  }
  return { period, rows }
}

export function bedTypeForMinBeds(minBeds?: number | null): number | null {
  if (minBeds == null) return null
  if (minBeds <= 0) return 0
  return Math.min(minBeds, 3)
}

// Fast cached read for the agent turn (anon key; table is public-read).
// Resolves the user's area terms to a TRREB table row (district or
// municipality), falling back to the TRREB-wide summary; the year-over-year
// delta comes from the backfilled history (same quarter one year earlier).
export async function readTrrebBenchmark(
  minBeds?: number | null,
  areaTerms: (string | null | undefined)[] = [],
  propertyType: 'apartment' | 'townhouse' = 'apartment',
): Promise<TrrebBenchmark | null> {
  const bedType = bedTypeForMinBeds(minBeds)
  if (bedType == null) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const mapped = trrebAreaFor(areaTerms)
  const areas = mapped ? [mapped, 'All TRREB Areas'] : ['All TRREB Areas']
  try {
    for (const area of areas) {
      const q = new URLSearchParams({
        area: `eq.${area}`,
        property_type: `eq.${propertyType}`,
        bed_type: `eq.${bedType}`,
        order: 'period.desc',
        limit: '6',
        select: 'period,avg_rent,prev_avg_rent,leased',
      })
      const res = await fetch(`${url}/rest/v1/trreb_rent_stats?${q}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) continue
      const rows = (await res.json()) as { period: string; avg_rent: number; prev_avg_rent: number | null; leased: number | null }[]
      if (!rows.length) continue
      const cur = rows[0]
      // 'YYYY QN' → same quarter previous year, from the backfilled history;
      // the summary-page prev value (if stored) wins when present.
      const [y, qn] = cur.period.split(' ')
      const prevPeriod = `${Number(y) - 1} ${qn}`
      const hist = rows.find((r) => r.period === prevPeriod)
      const prev = cur.prev_avg_rent != null ? Number(cur.prev_avg_rent) : hist ? Number(hist.avg_rent) : null
      return { period: cur.period, avg: Number(cur.avg_rent), prev_avg: prev, leased: cur.leased, area }
    }
    return null
  } catch {
    return null
  }
}

// CanLII coverage without a click — by searching the public web index, never
// CanLII itself.
//
// THE CONSTRAINT (measured, not assumed)
// CanLII's API has no name or full-text search: with our working key, requests
// with no fullText, a real name, and a nonsense string return byte-identical
// result sets. The website DOES search, but its bot protection 403s server-side
// fetches, and CanLII's terms prohibit scraping the site. So "automated CanLII
// search" cannot go through CanLII. What it can go through is a search engine's
// public index of canlii.org — Google indexes every decision page — which
// touches Google's API, not CanLII's servers.
//
// WHAT A RESULT MEANS, AND WHAT IT MUST NEVER DO
// An index hit is a decision page that MENTIONS the name. The live search for
// "David Park" surfaces Crown counsel David Parke, arbitrator David Parkes, and
// the sentence "Mr. David parked his car". A mention is not a party record.
// These results are DISPLAY-ONLY: they never touch total_hits, never reach
// countDebtRelevantHits(), never move a dimension. CanliiIndexMatch carries
// deliberately none of the fields (`nameInTitle`, `databaseId`) that the
// scoring path requires, so even a wiring mistake cannot count them.
//
// Configuration: GOOGLE_CSE_KEY + GOOGLE_CSE_CX (a Programmable Search Engine
// restricted to canlii.org). Absent config or any failure degrades to the
// pre-filled manual search link — the feature can only add information, never
// block a screening.

import type { CanliiIndexMatch } from '../screening-types'

/** Decision pages look like /en/on/onltb/doc/2026/2026onltb51167/... */
const DECISION_PATH = /\/(?:en|fr)\/[a-z]{2}\/[a-z0-9-]+\/doc\//i

const MAX_MATCHES = 10

interface CseItem {
  title?: unknown
  link?: unknown
  snippet?: unknown
}

/**
 * Pure parser over the Custom Search JSON response. Keeps only canlii.org
 * decision pages (drops search/browse/legislation pages the index also holds),
 * dedupes bilingual twins by their language-stripped path, caps the list.
 */
export function parseCanliiIndexItems(json: unknown): CanliiIndexMatch[] {
  const items = (json as { items?: CseItem[] } | null)?.items
  if (!Array.isArray(items)) return []
  const out: CanliiIndexMatch[] = []
  const seen = new Set<string>()
  for (const it of items) {
    const url = typeof it?.link === 'string' ? it.link : ''
    let path: string
    try {
      const u = new URL(url)
      if (!/(^|\.)canlii\.org$/i.test(u.hostname)) continue
      path = u.pathname
    } catch {
      continue
    }
    if (!DECISION_PATH.test(path)) continue
    // The same decision exists under /en/ and /fr/; one row per decision.
    const key = path.replace(/^\/(en|fr)\//i, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      title: (typeof it.title === 'string' ? it.title : '').slice(0, 300),
      url,
      snippet: (typeof it.snippet === 'string' ? it.snippet : '').slice(0, 400),
    })
    if (out.length >= MAX_MATCHES) break
  }
  return out
}

export type CanliiIndexResult =
  | { status: 'ok'; matches: CanliiIndexMatch[] }
  | { status: 'unconfigured' }
  | { status: 'error'; reason: string }

export async function searchCanliiViaIndex(
  fullName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CanliiIndexResult> {
  const key = process.env.GOOGLE_CSE_KEY
  const cx = process.env.GOOGLE_CSE_CX
  if (!key || !cx) return { status: 'unconfigured' }

  const name = (fullName || '').trim()
  // Same bar as every other name search here: a single token matches far too
  // many strangers to be worth listing.
  if (!name || !name.includes(' ')) return { status: 'error', reason: 'name not searchable' }

  const params = new URLSearchParams({
    key,
    cx,
    // Quoted phrase + exactTerms: mentions of the exact name, not of either word.
    q: `"${name}"`,
    exactTerms: name,
    num: String(MAX_MATCHES),
  })

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  try {
    const res = await fetchImpl(`https://www.googleapis.com/customsearch/v1?${params}`, {
      signal: ctl.signal,
    })
    if (!res.ok) return { status: 'error', reason: `cse http ${res.status}` }
    return { status: 'ok', matches: parseCanliiIndexItems(await res.json()) }
  } catch (err) {
    return { status: 'error', reason: err instanceof Error ? err.name : 'fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}

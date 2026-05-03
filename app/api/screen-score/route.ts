import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runForensics, forensicsToPromptBlock, type ForensicsReport } from '@/lib/forensics'
import { applyPageBudget } from '@/lib/anthropic/page-budget'

export const runtime = 'edge'

// -----------------------------------------------------------------------------
// Stayloop Risk Model v3 (2026)
// Design doc: /sessions/epic-eager-volta/mnt/stayloop/Stayloop_Risk_Model_v3.md
//
// 5-dimension weighted model with hard gates, red-flag penalties, evidence
// coverage, compliance_audit, and action_items for hard-to-measure (L3)
// sub-components. Backwards-compatible with the existing 6-column DB schema:
// the legacy columns still get populated via a deterministic mapping so the
// dashboards and old screenings keep rendering; the full v3 payload is
// persisted into ai_dimension_notes._v3.
// -----------------------------------------------------------------------------

interface ScreenFile {
  path: string
  name: string
  size: number
  mime: string
  kind?: string
}

// 5-dimension v3 structure
interface V3Scores {
  ability_to_pay: number       // 40%
  credit_health: number        // 25%
  rental_history: number       // 20%
  verification: number         // 10%
  communication: number        //  5%
}

const V3_WEIGHTS: Record<keyof V3Scores, number> = {
  ability_to_pay: 0.40,
  credit_health: 0.25,
  rental_history: 0.20,
  verification: 0.10,
  communication: 0.05,
}

interface CourtQuery {
  source: string
  tier: 'free' | 'pro'
  status: 'ok' | 'unavailable' | 'skipped' | 'coming_soon'
  hits: number | null
  url?: string
  note?: string
  severity?: number  // 3=critical, 2=high, 1=medium, 0=no hits
  records?: CanLIIMatch[]  // individual case records for this database
  portalRecords?: OntarioPortalMatch[]  // Ontario Courts Portal records
}

interface CanLIIMatch {
  title: string
  citation: string
  url: string
  databaseId: string
  databaseName?: string
  caseId: string
  nameInTitle: boolean   // true = tenant name found in case title (likely a party)
}

interface CanLIIDatabase {
  databaseId: string
  jurisdiction: string
  name: string
}

// Cache the Ontario database list across warm edge invocations
let ontarioDbCache: { dbs: CanLIIDatabase[]; fetchedAt: number } | null = null
const DB_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

async function listOntarioDatabases(apiKey: string): Promise<CanLIIDatabase[]> {
  const now = Date.now()
  if (ontarioDbCache && now - ontarioDbCache.fetchedAt < DB_CACHE_TTL_MS) {
    return ontarioDbCache.dbs
  }
  try {
    const url = `https://api.canlii.org/v1/caseBrowse/en/?api_key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return ontarioDbCache?.dbs || []
    const data = await res.json() as { caseDatabases?: CanLIIDatabase[] }
    const dbs = (data.caseDatabases || []).filter(d => d.jurisdiction === 'on')
    ontarioDbCache = { dbs, fetchedAt: now }
    return dbs
  } catch {
    return ontarioDbCache?.dbs || []
  }
}

// ── CanLII search helpers ─────────────────────────────────────────────
// CORE RULE: We only care about cases where the tenant is an actual
// PARTY (applicant, respondent, plaintiff, defendant).  CanLII's
// fullText API searches the entire document body, which produces
// massive false positives.  Our strategy:
//   1. Search with the tenant's FULL NAME in exact-phrase quotes.
//   2. Require the name to contain at least a first name + surname
//      (≥ 2 words for Latin names, ≥ 2 chars for CJK names).
//   3. After fetching results, ONLY keep cases where the tenant's
//      full name appears in the case title (party field).
//      Cases where the name merely appears in the document body are
//      discarded as false positives.

/** Validate that the name is a plausible full name (not just a first name). */
function isValidFullName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  // CJK names: at least 2 characters (e.g. "陈明" or "陈家明")
  const cjkChars = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkChars >= 2) return true
  // Latin names: require at least first name + surname (2 words, each ≥ 2 chars)
  const words = trimmed.split(/\s+/).filter(w => w.length >= 2)
  return words.length >= 2
}

/**
 * Strict check: is the tenant's full name in the case title?
 * The case title typically contains party names (e.g. "Smith v. Jones",
 * "Brown v. 123 Rental Corp").  For LTB, some titles are just case
 * numbers ("TSL-12345-22 (Re)") — those will NOT match, which is
 * correct: without party names visible we can't confirm the tenant
 * is involved, so we treat it as unconfirmed.
 *
 * Matching rules:
 * - CJK full name: exact substring match in title
 * - Latin names: ALL name parts (first, middle, last) must appear
 *   in the title.  "Nick Brown" matches "Brown v. Nick's Landlord"
 *   only if BOTH "nick" AND "brown" are present.
 */
function nameMatchesTitle(searchName: string, caseTitle: string): boolean {
  const titleLower = caseTitle.toLowerCase()
  const fullLower = searchName.toLowerCase().trim()

  // CJK: exact full-name substring match
  const cjkChars = (fullLower.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkChars >= 2) {
    const nameNospace = fullLower.replace(/\s/g, '')
    return titleLower.includes(nameNospace)
  }

  // Latin: require ALL name parts to appear in the title
  const parts = fullLower.split(/\s+/).filter(p => p.length >= 2)
  if (parts.length < 2) return false  // single word = can't confirm, reject
  return parts.every(part => titleLower.includes(part))
}

/**
 * Search a single CanLII database for the tenant's full name.
 * Uses exact-phrase fullText search, then filters to party matches only.
 */
async function searchCanLIIDb(fullName: string, db: CanLIIDatabase, apiKey: string): Promise<CanLIIMatch[]> {
  try {
    // Search with the FULL NAME in exact-phrase quotes
    const url = `https://api.canlii.org/v1/caseBrowse/en/${db.databaseId}/?api_key=${apiKey}&resultCount=10&offset=0&publishedBefore=2026-12-31&publishedAfter=2015-01-01&fullText=${encodeURIComponent(`"${fullName}"`)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const data = await res.json() as { cases?: Array<{ databaseId: string; caseId: { en: string }; title: string; citation: string }> }
    const cases = data.cases || []

    // Fetch metadata (real URLs) and check party match IN PARALLEL
    const results = await Promise.all(cases.map(async c => {
      const cid = c.caseId?.en || ''
      const dbId = c.databaseId || db.databaseId
      let caseUrl = `https://www.canlii.org/en/on/${dbId}/`
      if (cid) {
        try {
          const metaRes = await fetch(`https://api.canlii.org/v1/caseBrowse/en/${dbId}/${cid}?api_key=${apiKey}`, { signal: AbortSignal.timeout(4000) })
          if (metaRes.ok) {
            const meta = await metaRes.json() as { url?: string }
            caseUrl = meta.url || `https://www.canlii.org/en/on/${dbId}/doc/${cid.slice(0, 4)}/${cid}/${cid}.html`
          } else {
            caseUrl = `https://www.canlii.org/en/on/${dbId}/doc/${cid.slice(0, 4)}/${cid}/${cid}.html`
          }
        } catch {
          caseUrl = `https://www.canlii.org/en/on/${dbId}/doc/${cid.slice(0, 4)}/${cid}/${cid}.html`
        }
      }
      return {
        title: c.title,
        citation: c.citation,
        databaseId: dbId,
        databaseName: db.name,
        caseId: cid,
        url: caseUrl,
        nameInTitle: nameMatchesTitle(fullName, c.title),
      }
    }))

    // ONLY return cases where the tenant is confirmed as a party
    return results.filter(r => r.nameInTitle)
  } catch {
    return []
  }
}

// ── Ontario Courts Portal (courts.ontario.ca) search ────────────────
// Reverse-engineered API:
//   GET https://api1.courts.ontario.ca/courts/cms/parties
//     ?partyHeader.partyActorInstance.displayName={name}
//     &partyHeader.partyActorInstance.displayNameSearchType=300054
//     &caseHeader.courtID={courtUUID}
//     &page=0&size=10
// Court IDs:
//   Civil and Small Claims Court: 68f021c4-6a44-4735-9a76-5360b2e8af13
// Response: { _embedded: { results: [...] }, page: { totalElements, ... } }
// Each result has partyHeader.partyActorInstance.displayName and caseHeader.*

interface OntarioPortalMatch {
  caseNumber: string
  caseTitle: string
  caseCategory: string
  filedDate: string
  partyRole: string
  partyDisplayName: string
  courtAbbreviation: string
  closedFlag: boolean
  /** true if we only matched after swapping the first/last name order */
  nameSwapped?: boolean
  /** UUID of the case in the portal — used to build a direct-detail URL:
   *  https://www.courts.ontario.ca/portal/court/{courtID}/case/{caseInstanceUUID}
   *  When absent (older data or API change), frontend falls back to the
   *  generic portal search page. */
  caseInstanceUUID?: string
  /** UUID of the court the case lives in. For Civil & Small Claims this is
   *  always the civil-court UUID, but stashing it on the record keeps the
   *  URL construction self-contained without the frontend hard-coding it. */
  courtID?: string
}

const ONTARIO_PORTAL_CIVIL_COURT_ID = '68f021c4-6a44-4735-9a76-5360b2e8af13'

// Portal search types:
//   10462  — exact-phrase match (e.g. "BO HAN" must appear verbatim)
//   300054 — fuzzy / token-match (e.g. any word "BO" or "HAN" anywhere; 600+ results)
//
// Strategy:
//   1. Exact "BO HAN" (given-family order)
//   2. Exact "HAN BO" (family-given order) — mark nameSwapped=true
//   3. Fuzzy "BO HAN" with local filter as last-resort catchall
// Each later tier only runs if the earlier tier returned zero hits AFTER
// the local party-name verification, so we don't flood the user with
// false positives when exact match already worked.
async function portalQuery(
  displayName: string,
  searchType: '10462' | '300054',
): Promise<{ results: any[]; totalElements: number; error?: string }> {
  try {
    const params = new URLSearchParams({
      'partyHeader.partyActorInstance.displayName': displayName,
      'partyHeader.partyActorInstance.displayNameSearchType': searchType,
      'caseHeader.courtID': ONTARIO_PORTAL_CIVIL_COURT_ID,
      'page': '0',
      'size': '10',
    })
    const url = `https://api1.courts.ontario.ca/courts/cms/parties?${params.toString()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { results: [], totalElements: 0, error: `HTTP ${res.status}` }
    const data = await res.json() as any
    return {
      results: data?._embedded?.results || [],
      totalElements: data?.page?.totalElements || 0,
    }
  } catch (e: any) {
    return { results: [], totalElements: 0, error: e?.message || 'Fetch failed' }
  }
}

function shapePortalMatch(r: any, nameSwapped: boolean): OntarioPortalMatch {
  // The portal API returns caseInstanceUUID directly on caseHeader. This is
  // the primary key used by the portal's frontend SPA to route to the
  // per-case detail page.
  const caseInstanceUUID: string | undefined =
    r.caseHeader?.caseInstanceUUID ||
    r.caseHeader?.caseInstanceId ||
    r.caseInstanceUUID ||
    undefined
  // IMPORTANT: the API echoes a NUMERIC internal courtID (e.g. `1`) on
  // caseHeader.courtID, but the portal's frontend routes use the court's
  // UUID. We always query the Civil & Small Claims Court here, so hard-
  // code that UUID for the URL — never trust the API's numeric ID.
  const courtID = ONTARIO_PORTAL_CIVIL_COURT_ID
  return {
    caseNumber: r.caseHeader?.caseNumber || '',
    caseTitle: r.caseHeader?.caseTitle || '',
    caseCategory: r.caseHeader?.caseCategory || '',
    filedDate: r.caseHeader?.filedDate || '',
    partyRole: r.partyHeader?.partySubType || '',
    partyDisplayName: r.partyHeader?.partyActorInstance?.sortName || r.partyHeader?.partyActorInstance?.displayName || '',
    courtAbbreviation: r.caseHeader?.courtAbbreviation || 'Civil and Small Claims Court',
    closedFlag: r.caseHeader?.closedFlag ?? false,
    nameSwapped: nameSwapped || undefined,
    caseInstanceUUID,
    courtID,
  }
}

async function searchOntarioCourtsPortal(fullName: string): Promise<{ matches: OntarioPortalMatch[]; totalElements: number; error?: string }> {
  // Normalize whitespace (guards against "BO  HAN" with double spaces from
  // OCR — the portal API treats those differently than "BO HAN").
  const normalized = fullName.replace(/\s+/g, ' ').trim()
  if (!isValidFullName(normalized)) {
    return { matches: [], totalElements: 0, error: 'Invalid name for search' }
  }

  const parts = normalized.split(' ').filter(p => p.length >= 2)
  // Build the 1-flip swap: "A B C" → "C A B" (last token moved to front)
  // and the full reverse: "A B C" → "C B A". Either could match depending on
  // how the portal indexed the name.
  const tryOrders: string[] = [normalized]
  if (parts.length >= 2) {
    const swapped = [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ')
    if (swapped !== normalized) tryOrders.push(swapped)
    const reversed = [...parts].reverse().join(' ')
    if (reversed !== normalized && reversed !== swapped) tryOrders.push(reversed)
  }

  // Extract the record's surname. The portal's sortName is in "LAST, FIRST MIDDLE"
  // format, which is unambiguous. When the record has no comma (rare), we fall
  // back to the last token of displayName.
  //
  // Why this matters: a query for "XIONG YI" was matching "ZHENG, YI XIONG" —
  // the registered person's surname is ZHENG, and "XIONG" is part of their
  // given name. The old filter only checked token overlap, not position.
  const recordSurname = (dn: string, sn: string): string | null => {
    const snTrim = (sn || '').trim()
    if (snTrim.includes(',')) {
      const last = snTrim.split(',')[0].trim().toLowerCase()
      if (last) return last
    }
    const tokens = (dn || '').trim().split(/\s+/).filter(Boolean)
    if (tokens.length >= 2) return tokens[tokens.length - 1].toLowerCase()
    return null
  }

  const applyFilter = (results: any[], queryName: string, nameSwapped: boolean): OntarioPortalMatch[] => {
    const queryTokens = queryName
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length >= 2)

    return results
      .filter(r => {
        const dn = (r.partyHeader?.partyActorInstance?.displayName || '').toLowerCase()
        const sn = (r.partyHeader?.partyActorInstance?.sortName || '').toLowerCase()
        const combined = dn + ' ' + sn
        // Rule 1: every query token must appear somewhere in combined
        if (!nameMatchesTitle(queryName, combined)) return false
        // Rule 2 (new): at least one query token must EXACTLY equal the
        // record's surname. This stops false positives where the query's
        // surname appears in the middle of the record's given name.
        const surname = recordSurname(dn, sn)
        if (surname && queryTokens.length > 0) {
          const surnameMatched = queryTokens.some(t => t === surname)
          if (!surnameMatched) return false
        }
        return true
      })
      .map(r => shapePortalMatch(r, nameSwapped))
  }

  // Tier 1: exact match on each name ordering
  let lastError: string | undefined
  let totalSeen = 0
  for (let i = 0; i < tryOrders.length; i++) {
    const order = tryOrders[i]
    const isSwap = i > 0
    const q = await portalQuery(order, '10462')
    if (q.error) lastError = q.error
    totalSeen += q.totalElements
    const matches = applyFilter(q.results, order, isSwap)
    if (matches.length > 0) {
      return { matches, totalElements: q.totalElements }
    }
  }

  // Tier 2: fuzzy fallback on the canonical order — the local filter will
  // reject the noise (BO OUYANG, BO XIANG, etc.), but this rescues cases
  // where the portal stored the party name with extra tokens or ordering
  // that our exact queries didn't cover.
  const fuzzy = await portalQuery(normalized, '300054')
  if (fuzzy.error && !lastError) lastError = fuzzy.error
  const fuzzyMatches = applyFilter(fuzzy.results, normalized, false)
  if (fuzzyMatches.length > 0) {
    return { matches: fuzzyMatches, totalElements: fuzzy.totalElements }
  }

  return {
    matches: [],
    totalElements: Math.max(totalSeen, fuzzy.totalElements),
    error: lastError,
  }
}

// Database severity mapping for rental risk relevance
const DB_SEVERITY_MAP: Record<string, number> = {
  // Critical (severity 3) — highest relevance to rental risk
  'onltb': 3,          // Landlord & Tenant Board (eviction filings, disputes)
  'onsc': 3,           // Ontario Superior Court (civil disputes, evictions)
  'onscdc': 3,         // Divisional Court (appeals, serious cases)
  'onscsm': 3,         // Small Claims Court (debt collection, disputes)
  'onca': 3,           // Court of Appeal (serious escalations)
  // High (severity 2) — significant relevance
  'onhrt': 2,          // Human Rights Tribunal (discrimination, harassment)
  'oncicb': 2,         // Criminal Injuries Compensation Board (violence)
  'onorb': 2,          // Ontario Review Board (criminal matters)
  'oncfsrb': 2,        // Child & Family Services Review Board (family disputes)
  // Medium (severity 1) — general relevance, all others with hits
}

function getSeverity(databaseId: string, hasHits: boolean): number {
  if (!hasHits) return 0
  return DB_SEVERITY_MAP[databaseId] || 1  // Default to medium (1) if not mapped
}

// Priority databases that are ALWAYS queried by hardcoded ID, even if the
// full DB list API call fails. These two are the most relevant for rental
// risk: LTB covers eviction disputes, Small Claims covers debt/damage.
const PRIORITY_DBS: CanLIIDatabase[] = [
  { databaseId: 'onltb',  jurisdiction: 'on', name: 'Landlord and Tenant Board' },
  { databaseId: 'onscsm', jurisdiction: 'on', name: 'Small Claims Court' },
]

async function runCourtRecordCheck(name: string, plan: string): Promise<{ queries: CourtQuery[]; total_hits: number; queried_name: string; records: CanLIIMatch[]; databases_searched: number; portal_hits?: number; portal_records?: OntarioPortalMatch[]; court_summary_en?: string; court_summary_zh?: string }> {
  const queries: CourtQuery[] = []
  const apiKey = process.env.CANLII_API_KEY

  if (!apiKey) {
    queries.push({ source: 'CanLII — all Ontario databases', tier: 'free', status: 'unavailable', hits: null, note: 'API key not configured' })
    return { queries, total_hits: 0, queried_name: name || '', records: [], databases_searched: 0 }
  }
  const searchName = (name || '').trim()
  if (!isValidFullName(searchName)) {
    const reason = !searchName
      ? 'No applicant name provided'
      : 'Full name required (first + last name). Single names are too ambiguous for court record lookup.'
    queries.push({ source: 'CanLII — all Ontario databases', tier: 'free', status: 'skipped', hits: null, note: reason })
    return { queries, total_hits: 0, queried_name: searchName, records: [], databases_searched: 0 }
  }

  // ── Step 1: ALWAYS query the two priority databases (LTB + Small Claims) ──
  // These are hardcoded so they fire even if the full DB list fetch fails.
  const prioritySettled = await Promise.allSettled(
    PRIORITY_DBS.map(db => searchCanLIIDb(searchName, db, apiKey))
  )
  const priorityDbIds = new Set(PRIORITY_DBS.map(d => d.databaseId))
  const priorityResults: Array<{ db: CanLIIDatabase; records: CanLIIMatch[]; hits: number }> = []
  for (let i = 0; i < PRIORITY_DBS.length; i++) {
    const r = prioritySettled[i]
    const records = r.status === 'fulfilled' ? r.value : []
    priorityResults.push({ db: PRIORITY_DBS[i], records, hits: records.length })
  }

  // ── Step 2: Discover remaining Ontario databases and query them ──
  const allDbs = await listOntarioDatabases(apiKey)
  // Exclude already-queried priority DBs
  const extraDbs = allDbs.filter(db => !priorityDbIds.has(db.databaseId))
  const extraSettled = await Promise.allSettled(
    extraDbs.map(db => searchCanLIIDb(searchName, db, apiKey))
  )
  const extraResults: Array<{ db: CanLIIDatabase; records: CanLIIMatch[]; hits: number }> = []
  for (let i = 0; i < extraDbs.length; i++) {
    const r = extraSettled[i]
    const records = r.status === 'fulfilled' ? r.value : []
    extraResults.push({ db: extraDbs[i], records, hits: records.length })
  }

  // ── Step 3: Merge and build response ──
  // searchCanLIIDb already filters to party-only matches (name in title).
  // All records here are confirmed cases where the tenant is a party.
  const allResults = [...priorityResults, ...extraResults]
  const allRecords: CanLIIMatch[] = []
  for (const { records } of allResults) allRecords.push(...records)
  const totalHits = allRecords.length
  const totalDbsSearched = PRIORITY_DBS.length + extraDbs.length

  // Rollup query row
  queries.push({
    source: `CanLII — all Ontario databases (${totalDbsSearched} searched)`,
    tier: 'free',
    status: 'ok',
    hits: totalHits,
    note: totalHits === 0
      ? 'No matches across Ontario courts, tribunals, or boards'
      : `${totalHits} case(s) with "${searchName}" as party in ${allResults.filter(d => d.hits > 0).length} database(s)`,
  })

  // Always show priority DBs as explicit rows (even 0-hit) so the user sees
  // that LTB and Small Claims were actually queried every time.
  for (const pr of priorityResults) {
    const severity = getSeverity(pr.db.databaseId, pr.hits > 0)
    queries.push({
      source: `CanLII — ${pr.db.name}`,
      tier: 'free',
      status: 'ok',
      hits: pr.hits,
      severity: pr.hits > 0 ? severity : 0,
      records: pr.records.length > 0 ? pr.records : undefined,
      url: pr.records[0]?.url,
    })
  }

  // Extra DBs with hits (after filtering), sorted by severity desc then hit count desc
  const extraWithHits = extraResults
    .filter(d => d.hits > 0)
    .sort((a, b) => {
      const sevA = getSeverity(a.db.databaseId, true)
      const sevB = getSeverity(b.db.databaseId, true)
      if (sevA !== sevB) return sevB - sevA
      return b.hits - a.hits
    })

  for (const { db, records, hits } of extraWithHits) {
    const severity = getSeverity(db.databaseId, true)
    queries.push({
      source: `CanLII — ${db.name}`,
      tier: 'free',
      status: 'ok',
      hits,
      severity,
      records,
      url: records[0]?.url,
    })
  }

  // ── Step 4: Ontario Courts Portal (direct API) — free tier ──
  // This covers Civil and Small Claims Court cases from courts.ontario.ca
  // which may not appear in CanLII (especially recent filings).
  const portalResult = await searchOntarioCourtsPortal(searchName)
  const portalHits = portalResult.matches.length

  if (portalResult.error && portalHits === 0) {
    queries.push({
      source: 'Ontario Courts Portal — Civil & Small Claims',
      tier: 'free',
      status: 'unavailable',
      hits: null,
      note: `Portal query failed: ${portalResult.error}`,
      url: 'https://courts.ontario.ca/portal/search/party',
    })
  } else {
    queries.push({
      source: 'Ontario Courts Portal — Civil & Small Claims',
      tier: 'free',
      status: 'ok',
      hits: portalHits,
      severity: portalHits > 0 ? 2 : 0,
      note: portalHits === 0
        ? 'No matches in Ontario Courts Portal'
        : `${portalHits} case(s) found (of ${portalResult.totalElements} total results)`,
      portalRecords: portalHits > 0 ? portalResult.matches : undefined,
      url: 'https://courts.ontario.ca/portal/search/party',
    })
  }

  // Add portal hits to the total
  const combinedHits = totalHits + portalHits
  const totalSourcesSearched = totalDbsSearched + 1 // +1 for Ontario Courts Portal

  // Pro-tier sources still pending
  queries.push({ source: 'Stayloop Verified Network', tier: 'pro', status: 'coming_soon', hits: null, note: 'Pro feature — coming soon' })

  return { queries, total_hits: combinedHits, queried_name: name || '', records: allRecords, databases_searched: totalSourcesSearched, portal_hits: portalHits, portal_records: portalResult.matches }
}

// Map v3's 5 dims → legacy 6 columns, so old dashboards keep working.
// This is deterministic and documented — nothing is invented.
function mapV3ToLegacy(v3: V3Scores, redFlagCount: number, identityMatch: number): {
  doc_authenticity: number
  payment_ability: number
  court_records: number
  stability: number
  behavior_signals: number
  info_consistency: number
} {
  return {
    doc_authenticity: v3.verification,                          // verification covers doc auth + identity
    payment_ability: v3.ability_to_pay,                         // direct mapping
    court_records: v3.rental_history,                           // v3 bundles LTB into rental_history
    stability: Math.round((v3.ability_to_pay + v3.verification) / 2),  // stability derived
    behavior_signals: Math.max(0, 100 - redFlagCount * 15),     // more red flags → lower
    info_consistency: identityMatch,                            // identity cross-match score
  }
}

export async function POST(req: NextRequest) {
  try {
    const { screening_id } = await req.json()
    if (!screening_id) {
      return NextResponse.json({ error: 'screening_id required' }, { status: 400 })
    }

    // Sanitize Authorization header — edge runtime Headers ctor throws
    // "The string did not match the expected pattern." on non-ASCII / CRLF.
    const rawAuth = req.headers.get('authorization') || ''
    const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
    if (!authHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Defense in depth: verify the token actually resolves to a user. RLS
    // also guards the query below, but an explicit check catches forged/
    // expired tokens earlier and returns a 401 instead of a 404.
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    const { data: screening, error } = await supabase
      .from('screenings')
      .select('*, landlord:landlords(plan)')
      .eq('id', screening_id)
      .single()

    if (error || !screening) {
      return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
    }

    const plan: string = screening.landlord?.plan || 'free'

    // ---- Quota enforcement for free plan ----
    if (plan === 'free') {
      const landlordId = screening.landlord_id
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { count } = await supabase
        .from('screenings')
        .select('id', { count: 'exact', head: true })
        .eq('landlord_id', landlordId)
        .gte('created_at', monthStart)
        .neq('status', 'pending') // only count completed/scoring screenings
      if (count !== null && count >= 5) {
        return NextResponse.json(
          { error: 'Monthly screening limit reached (5/5). Upgrade to Pro for unlimited screenings.' },
          { status: 429 }
        )
      }
    }

    const monthlyRent = Number(screening.monthly_rent) || 0
    const monthlyIncome = Number(screening.monthly_income) || 0
    const incomeRatio = monthlyRent > 0 ? monthlyIncome / monthlyRent : 0
    const files: ScreenFile[] = Array.isArray(screening.files) ? screening.files : []

    // ---- Stage 1: Sign all files in parallel ----
    // Fix MIME types based on file extension — browser detection can be wrong
    const MIME_EXT_MAP: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.heic': 'image/heic', '.heif': 'image/heif',
      '.tiff': 'image/tiff', '.tif': 'image/tiff',
      '.bmp': 'image/bmp',
    }
    function fixMime(f: ScreenFile): string {
      const m = f.mime?.toLowerCase() || ''
      // If already a known PDF or image MIME, keep it
      if (m === 'application/pdf' || m.startsWith('image/')) return m
      // Fallback: infer from file extension
      const ext = f.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || ''
      return MIME_EXT_MAP[ext] || m || 'application/octet-stream'
    }

    const contentBlocks: any[] = []
    const signedResults = await Promise.all(files.map(f =>
      supabase.storage.from('tenant-files').createSignedUrl(f.path, 600)
        .then(r => ({ file: { ...f, mime: fixMime(f) }, url: r.data?.signedUrl }))
    ))

    // Apply Anthropic's 100-PDF-page request budget. For 5+ files or any
    // very long PDF, this fetches + counts pages, then truncates over-quota
    // files (sending only the most relevant pages as base64) so we never
    // exceed the hard limit. Forensics still runs on the original full
    // files via signed URLs in parallel below.
    const pdfFiles = signedResults
      .filter(r => r.url && r.file.mime === 'application/pdf')
      .map(r => ({
        name: r.file.name,
        kind: r.file.kind || 'other',
        mime: r.file.mime,
        signed_url: r.url!,
      }))
    const imageFiles = signedResults.filter(r => r.url && r.file.mime?.startsWith('image/'))

    const budget = await applyPageBudget(pdfFiles)
    const truncatedFilesNote: string[] = []

    // `kind` may be a comma-joined list when the classifier saw multiple
    // document kinds inside one bundled PDF (a "Supporting Documents.pdf"
    // packet). Render the kind list as `[A + B + C]` so Sonnet sees that
    // a single attachment covers multiple document types and looks for
    // each one's signal.
    function formatKind(kind: string | undefined): string {
      if (!kind) return 'doc'
      const parts = kind.split(',').map(k => k.trim()).filter(Boolean)
      if (parts.length === 0) return 'doc'
      if (parts.length === 1) return parts[0]
      return `bundle [${parts.join(' + ')}]`
    }

    for (const prep of budget.prepared) {
      contentBlocks.push({
        type: 'document',
        source: prep.source,
        title: `${formatKind(prep.kind)}: ${prep.name}${prep.truncated ? ` (page-truncated ${prep.sent_pages}/${prep.original_pages})` : ''}`,
      })
      if (prep.truncated) {
        truncatedFilesNote.push(`${prep.name}: ${prep.sent_pages}/${prep.original_pages} pages`)
      }
    }
    for (const { file: f, url } of imageFiles) {
      if (!url) continue
      contentBlocks.push({ type: 'image', source: { type: 'url', url } })
      contentBlocks.push({ type: 'text', text: `(file above is: ${formatKind(f.kind)} — ${f.name})` })
    }

    // If we had to truncate, prepend a note to the prompt so Sonnet doesn't
    // hallucinate facts that depend on pages it didn't see.
    if (budget.any_truncated) {
      contentBlocks.unshift({
        type: 'text',
        text: `[NOTE] The user uploaded ${budget.total_original_pages} PDF pages across ${pdfFiles.length} files, exceeding the 100-page request limit. The following files were sampled to fit budget — only the listed pages are attached, full forensics still ran on the original files separately:\n${truncatedFilesNote.map(s => '  - ' + s).join('\n')}\n\nDo NOT make claims that depend on pages you cannot see. If a flag is critical and only forensics covered the unseen pages, defer to the forensics block below.`,
      })
      console.log(`[screen-score] page budget: ${budget.total_original_pages} → ${budget.total_sent_pages}, truncated ${truncatedFilesNote.length} files`)
    }

    const nameForLookup = (screening.tenant_name || '').trim()

    // ---- Stage 2: Court records + Document Forensics (in parallel) ----
    // Court records (CanLII) and forensics (PDF metadata + text density +
    // paystub math + cross-doc) are independent, so run concurrently to
    // keep total latency under the AI call's anyway-blocking ~10-15s.
    // Try to extract applicant contact info from landlord notes / pasted_text
    // (e.g. "Applicant: Sheila Tremblay 514-555-1234 sheila@example.com").
    // The screenings schema doesn't have dedicated phone/email fields, but
    // landlords often paste this context into notes.
    const notesBlob = `${screening.notes || ''}\n${screening.pasted_text || ''}`
    const phoneMatch = notesBlob.match(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/)
    const emailMatch = notesBlob.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    const forensicsInput = {
      files: signedResults
        .filter(r => !!r.url)
        .map(r => ({
          name: r.file.name,
          kind: r.file.kind || 'other',
          mime: r.file.mime,
          signed_url: r.url!,
        })),
      applicant_name: nameForLookup || undefined,
      applicant_phone: phoneMatch ? `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}` : undefined,
      applicant_email: emailMatch ? emailMatch[0].toLowerCase() : undefined,
      applicant_address: undefined,
      anthropic_api_key: process.env.ANTHROPIC_API_KEY,
    }

    const [courtDetail, forensicsReport] = await Promise.all([
      runCourtRecordCheck(nameForLookup, plan),
      runForensics(forensicsInput).catch((e): ForensicsReport => ({
        per_file: [],
        cross_doc: { entities: { phones: [], emails: [], addresses: [], names: [], employers: [], deposit_amounts: [] }, unique_phones: 0, hr_phone_collision: false, deposit_paystub_perfect_match: false },
        cross_doc_flags: [],
        all_flags: [{ code: 'forensics_init_error', severity: 'low', evidence_en: `Forensics aborted: ${e?.message || e}`, evidence_zh: `取证模块启动失败：${e?.message || e}` }],
        hard_gates: [],
        severity: 'clean',
        elapsed_ms: 0,
        schema_version: 1,
      })),
    ])

    await supabase.from('screenings').update({
      court_records_detail: courtDetail,
      forensics_detail: forensicsReport,
      tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
      status: 'scoring',
    }).eq('id', screening_id)

    // ---- Stage 3: Build v3 Claude prompt ----
    const formText = `LANDLORD-PROVIDED CONTEXT:
Tenant name (from form): ${nameForLookup || 'unknown'}
IMPORTANT: If you see MULTIPLE ID documents for DIFFERENT people, extract ALL their full names into extracted_names[]. The backend will run court record searches for EACH name.
Monthly rent: $${monthlyRent || 'N/A'}
Self-reported income: $${monthlyIncome || 'N/A'}/mo${incomeRatio ? ` (ratio ${incomeRatio.toFixed(2)}x)` : ''}
Landlord notes: ${screening.notes || 'N/A'}

Uploaded: ${files.length === 0 ? 'NONE' : files.map(f => `${formatKind(f.kind)}(${f.name})`).join(', ')}
NOTE: When you see "bundle [A + B + C]" above, ONE PDF file contains MULTIPLE document kinds. Look inside that single attachment for ALL listed kinds — do NOT report them as missing just because they share a filename.

COURT RECORD LOOKUP — ALL ONTARIO SOURCES (${courtDetail.databases_searched} sources incl. CanLII DBs + Ontario Courts Portal):
${courtDetail.queries.filter(q => q.tier === 'free').map(q => `  - ${q.source}: ${q.status === 'ok' ? `${q.hits} hit(s)` : q.status}${q.note ? ` (${q.note})` : ''}`).join('\n')}
${courtDetail.records.length > 0 ? `\nCANLII MATCHED CASES (verify name collision is not a false positive — common names can false-match):\n${courtDetail.records.slice(0, 8).map(r => `  · [${r.databaseName || r.databaseId}] ${r.title} — ${r.citation}`).join('\n')}` : ''}
${(courtDetail.portal_records?.length || 0) > 0 ? `\nONTARIO COURTS PORTAL CASES (Civil & Small Claims Court — direct from courts.ontario.ca):\n${courtDetail.portal_records!.slice(0, 8).map(r => `  · [${r.courtAbbreviation}] ${r.caseTitle} — ${r.caseNumber} (${r.partyRole}, filed ${r.filedDate ? new Date(r.filedDate).toLocaleDateString('en-CA') : 'unknown'}, ${r.closedFlag ? 'Inactive' : 'Active'})`).join('\n')}` : ''}
${courtDetail.total_hits === 0 ? '\nNo hits in any Ontario court database or portal for this applicant name.' : ''}

SCORING GUIDANCE for rental_history.ltb_check and red flags:
- 0 hits across ALL Ontario DBs AND Ontario Courts Portal → high score (90+), ltb_check = "measured"
- 1 hit in onltb (LTB) → investigate (30-50), mark "action_pending" to verify identity, consider "ltb_eviction" gate IF case is an eviction order
- 2+ hits in onltb → strong negative, trigger "ltb_eviction" hard gate (caps at 40)
- Hits in onsc / onca / onscdc (civil courts) against this person as debtor/defendant → STRONG negative signal, rental_history should be 20 or below
- Hits in onhrt (Human Rights Tribunal) AGAINST this person as respondent → note only, do NOT use for scoring (HRC protected)
- Hits in oncj criminal matters → note in reviewer_note, do NOT auto-score (landlord decides)

ONTARIO COURTS PORTAL hits — CRITICAL (these are DIRECT government records, not just case law):
ANY court record as defendant/debtor means the person has DEFAULTED on financial obligations and is FUNDAMENTALLY UNTRUSTWORTHY as a tenant. This is one of the strongest negative signals possible.
- Portal cases where applicant is DEFENDANT or DEBTOR → rental_history MUST be 20 or below, credit_health MUST be 35 or below. This person was SUED for not paying.
- 1 Small Claims case as Defendant → rental_history = 15-25, credit_health = 30-40. Trigger "court_record_defendant" hard gate.
- 2+ Small Claims cases as Defendant/Debtor → rental_history = 5-15, credit_health = 15-25. Trigger "court_record_defendant_multi" hard gate.
- ACTIVE (non-closed) cases → rental_history = 0-10, credit_health = 10-20. Trigger "court_record_active" hard gate. Person is CURRENTLY being sued.
- Portal cases where applicant is PLAINTIFF → neutral (they sued someone else, not a risk signal)
- The portal records are from courts.ontario.ca and are VERIFIED government data — treat them with ABSOLUTE confidence
- Do NOT give benefit of the doubt when court records exist. The person had legal proceedings against them — this is objective fact, not inference.

- If 0 hits AND no prior landlord reference → ltb_check "measured", prior_landlord_refs "action_pending"
${screening.pasted_text ? `\n--- PASTED TEXT ---\n${screening.pasted_text}\n` : ''}`

    const systemPrompt = `You are Stayloop, an AI tenant-screening analyst for Ontario, Canada landlords. Score risk using the Stayloop v3 model.

ONTARIO HUMAN RIGHTS CODE — HARD RULE:
You MUST NOT factor age, race, ethnicity, national origin, religion, disability, family status, marital status, sexual orientation, gender identity, immigration status, or source of income into any score. If you observe any of these in the documents, note them in compliance_audit.protected_grounds_observed but leave compliance_audit.protected_grounds_used_in_scoring empty.

A tenant volunteering to prepay 6–12 months of rent is NOT a red flag in Ontario — it is common for newcomers and those without Canadian credit history. Treat it as a POSITIVE liquidity signal under ability_to_pay.emergency_reserves, NOT a penalty.

EVIDENCE DISCIPLINE — HARD RULE:
If you have no direct evidence for a sub-component, return null for its raw_score and mark its coverage as "action_pending" or "missing". DO NOT fill in 50 or any placeholder based on "typical applicant". The backend decides how to weight missing sub-components.

SOCIAL MEDIA SCOPE — HARD RULE:
You may reference LinkedIn job verification, company website existence, and reverse phone lookup ONLY as action_items for the landlord to perform. NEVER browse or judge Facebook, Instagram, TikTok, Xiaohongshu, personal photos, or lifestyle content.

Higher scores = LOWER risk. 100 = ideal candidate, 0 = unrentable.
Output ONLY the JSON schema — no markdown, no prose, no preamble.`

    const userInstruction = `Score this rental candidate using the Stayloop v3 5-dimension model.

DIMENSIONS + WEIGHTS:
1. ability_to_pay (40%) — income/rent ratio (25%), income stability (10%), emergency reserves (5%)
2. credit_health (25%) — credit score (15%), DTI ratio (10%)
3. rental_history (20%) — prior landlord references (10%), LTB/small claims (10%)
4. verification (10%) — employer verification (5%), document authenticity (5%)
5. communication (5%) — application completeness + disclosure + landlord override

SUB-COMPONENT COVERAGE TAGS (mandatory):
- "measured" — directly read from uploaded docs
- "inferred" — reasonable inference from adjacent evidence
- "action_pending" — cannot be determined from docs, needs landlord action (e.g. call prev landlord, verify LinkedIn)
- "missing" — no evidence and no realistic action item

HARD GATES (if any condition is met, set gate in hard_gates_triggered[]):
- "income_severe" — income/rent < 2.0x → caps overall at 65
- "ltb_eviction" — confirmed LTB eviction in past 3yrs → caps overall at 40
- "doc_tampering" — visible PS/overwrite/font anomalies → caps overall at 55
- "identity_mismatch" — same name, different DOB/addresses/IDs → caps overall at 50
- "employer_fraud" — company doesn't exist OR HR phone matches applicant's phone → caps overall at 45
- "self_issued_employment" — employment letter is self-issued (own company / family business) → caps overall at 50

RED FLAGS — additive penalties (return as array; backend will apply):
- "rush_move_in" (-4), "cross_doc_contradictions" (-8), "hr_phone_is_applicant" (-10),
  "no_linkedin_for_professional_role" (-3), "volunteered_sin" (-2),
  "self_issued_employment_letter" (-15)
- DO NOT penalize volunteer prepayment of 6–12 months rent. That is a POSITIVE signal.

SELF-ISSUED EMPLOYMENT LETTER DETECTION — CRITICAL:
Check if the employment letter or offer letter is self-issued (applicant works at their own company, or the signatory shares the same last name / is likely a family member). Signals include:
- Applicant name appears as company owner, director, sole proprietor, or signatory on the letter
- Signatory's last name matches the applicant's last name (family business)
- Company is a sole proprietorship or small numbered company (e.g. "1234567 Ontario Inc") and applicant is the only employee mentioned
- Employment letter is overly simple / lacks company letterhead / uses generic wording
- HR contact phone or email matches the applicant's own contact information
If detected: trigger "self_issued_employment_letter" red flag, set ability_to_pay income_stability sub-score to 20-35 (self-verified income is unreliable), and note it prominently in details_en/details_zh and flags. The income from a self-issued letter should NOT be treated as verified — mark income_evidence as "self-issued (unverified)" and recommend landlord verify via bank deposit history or CRA notice of assessment.

ACTION ITEMS (critical for L3 sub-components):
Generate 1-4 action_items the landlord must perform to close evidence gaps. Each item:
- id: short snake_case
- dimension: one of the 5 dim names
- title_en / title_zh
- details_en / details_zh: specific, cite filenames/phone numbers/names from docs
- impact_on_score: e.g. "+15 if positive, -25 if negative"
- status: "pending"

EXTRACT these fields too:
- extracted_names (string array — ALL unique person names from ALL uploaded ID documents. If 2 IDs are uploaded for 2 different people, return BOTH names. Each name should be "FIRSTNAME LASTNAME" format. This is CRITICAL for court record lookup.)
- detected_monthly_income (CAD/month, convert bi-weekly or annual, null if unknown)
- income_evidence (one short sentence citing source)
- detected_document_kinds (subset of [employment_letter, pay_stub, bank_statement, id_document, credit_report, offer_letter, reference, other])
- bank_min_balance (number or null) — if bank statements present, lowest closing balance seen
- identity_match_score (0-100) — cross-doc name/DOB/address consistency; if only 1 doc, return null

SPEED RULES — output length is the main latency driver. Stay extremely lean:
- details_en / details_zh: 5 entries each. ≤10 English words per entry. ≤15 Chinese chars per entry. Cite one specific piece of evidence.
- flags: 2-3 items, bilingual, text_en ≤8 words, text_zh ≤12 chars
- action_items: 1-2 items MAX. Each has title + details in BOTH languages. title ≤6 words / ≤10 chars, details ≤18 words / ≤30 chars.
- summary_en ≤15 words, summary_zh ≤30 chars (single sentence is fine)
- reviewer_note ≤15 English words
- sub_coverage: ONLY include keys whose value is "action_pending" or "missing". Omit all "measured" keys — backend defaults missing keys to measured.

EMIT ONLY this JSON — no markdown, no fences, no preamble.
{
 "extracted_names":["FULL NAME 1","FULL NAME 2"],
 "detected_monthly_income":<number or null>,
 "income_evidence":"... or null (≤10 words)",
 "detected_document_kinds":["..."],
 "bank_min_balance":<number or null>,
 "identity_match_score":<0-100 or null>,
 "scores":{"ability_to_pay":<0-100>,"credit_health":<0-100>,"rental_history":<0-100>,"verification":<0-100>,"communication":<0-100>},
 "sub_coverage":{"only_non_measured_keys":"action_pending|missing"},
 "details_en":{"ability_to_pay":"","credit_health":"","rental_history":"","verification":"","communication":""},
 "details_zh":{"ability_to_pay":"","credit_health":"","rental_history":"","verification":"","communication":""},
 "hard_gates_triggered":["..."],
 "red_flags":["..."],
 "flags":[{"type":"danger|warning|info|success","text_en":"","text_zh":""}],
 "action_items":[{"id":"...","dimension":"rental_history","title_en":"","title_zh":"","details_en":"","details_zh":"","impact_on_score":"","status":"pending"}],
 "compliance_audit":{"protected_grounds_observed":["..."],"protected_grounds_used_in_scoring":[],"hrc_compliant":true,"reviewer_note":"..."},
 "summary_en":"One short sentence ≤15 words",
 "summary_zh":"一句话 ≤30 字",
 "court_summary_en":"Court record risk assessment ≤20 words. Assess which databases matter most (LTB > courts > tribunals), name commonality risk, overall risk from records only.",
 "court_summary_zh":"法庭记录风险评估 ≤40 字。评估哪些库最相关（LTB > 法院 > 仲裁庭）、姓名常见度、仅从法庭记录角度的风险。"
}

JSON DISCIPLINE (avoid parse errors):
- NO unescaped newlines inside strings (use a space)
- NO commas inside numeric values (write 15090 not 15,090)
- Escape inner double quotes as \\"
- Close every string and bracket before ending`

    const userContent: any[] = [
      { type: 'text', text: userInstruction, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: '\n--- SCREENING CONTEXT ---\n' + formText },
    ]
    // Inject forensics findings as established fact BEFORE the documents
    // so Claude factors them into doc_authenticity / verification scoring.
    if (forensicsReport.per_file.length > 0 || forensicsReport.cross_doc_flags.length > 0) {
      userContent.push({
        type: 'text',
        text: '\n--- DOCUMENT FORENSICS (BACKEND-VERIFIED, TRUST THESE) ---\n' + forensicsToPromptBlock(forensicsReport) +
          '\n\nUSE THESE FORENSICS FINDINGS to set verification.document_authenticity sub-score. ' +
          'If severity is "fraud" or "likely_fraud", set verification < 30 and add "doc_tampering" to hard_gates_triggered. ' +
          'If forensics lists hard_gates (pdf_is_screenshot, paystub_math_impossible, cross_doc_collision, producer_consumer_tool), ' +
          'you MUST include "doc_tampering" or the matching v3 gate (employer_fraud for cross_doc_collision) in hard_gates_triggered.',
      })
    }
    if (contentBlocks.length > 0) {
      userContent.push({ type: 'text', text: '\n--- UPLOADED DOCUMENTS ---\n' })
      userContent.push(...contentBlocks)
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        // Temperature 0 = deterministic scoring. Same documents should
        // produce the same scores every time.
        temperature: 0,
        // With the lean v3 schema (sparse sub_coverage, tight length caps
        // on details/flags/action_items) the full output fits comfortably
        // under 2000 tokens. 3500 gives 75% headroom without wasting
        // decode time on excessive budget.
        max_tokens: 3500,
        system: [
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: '{' },  // prefill forces JSON start
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      await supabase.from('screenings').update({ status: 'error', error: errText.slice(0, 500) }).eq('id', screening_id)
      return NextResponse.json({ error: `Anthropic API error: ${errText}` }, { status: 500 })
    }

    const aiData = await response.json() as { content?: Array<{ text: string }>; stop_reason?: string }
    const rawText = '{' + (aiData.content?.[0]?.text || '')
    const stopReason = aiData.stop_reason || ''

    // Robust JSON extractor — survives four common Claude failure modes:
    // (1) markdown code fence wrapping, (2) trailing commas before ] or },
    // (3) truncation mid-string (unclosed quote at end of output),
    // (4) truncation mid-field (output ends right after a value with no
    //     closing bracket). For (3) and (4) we salvage by walking back to
    //     the last known-good field and closing the outer braces ourselves.
    function extractJson(input: string): string {
      let t = input.trim()
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      // Fix unescaped newlines inside JSON string values — a common LLM issue.
      // Walk char-by-char: inside a string, replace raw \n \r with a space.
      {
        let fixed = '', inStr = false, esc = false
        for (let i = 0; i < t.length; i++) {
          const ch = t[i]
          if (inStr) {
            if (esc) { esc = false; fixed += ch; continue }
            if (ch === '\\') { esc = true; fixed += ch; continue }
            if (ch === '"') { inStr = false; fixed += ch; continue }
            if (ch === '\n' || ch === '\r') { fixed += ' '; continue }
            fixed += ch
          } else {
            if (ch === '"') inStr = true
            fixed += ch
          }
        }
        t = fixed
      }
      try { JSON.parse(t); return t } catch {}

      const start = t.indexOf('{')
      if (start < 0) return t
      let body = t.slice(start)

      // First pass — if we find a balanced top-level object, use it verbatim.
      {
        let depth = 0, inStr = false, esc = false
        for (let i = 0; i < body.length; i++) {
          const ch = body[i]
          if (inStr) {
            if (esc) esc = false
            else if (ch === '\\') esc = true
            else if (ch === '"') inStr = false
          } else {
            if (ch === '"') inStr = true
            else if (ch === '{') depth++
            else if (ch === '}') { depth--; if (depth === 0) { body = body.slice(0, i + 1); break } }
          }
        }
      }

      const cleanup = (s: string) => s.replace(/,(\s*[}\]])/g, '$1').replace(/\uFEFF/g, '')

      const pass1 = cleanup(body)
      try { JSON.parse(pass1); return pass1 } catch {}

      // Second pass — salvage mode. The output is incomplete. Walk
      // forward tracking depth AND the byte offset of the last COMPLETE
      // top-level field (i.e. the last `,` we saw at depth 1 that is
      // NOT inside a string). Then chop to that offset and close all
      // still-open brackets.
      let depth = 0
      let inStr = false
      let esc = false
      let lastSafeCut = -1  // offset of the last comma at depth 1 outside a string
      const bracketStack: string[] = []  // track open brackets for later closing
      let cutBracketStack: string[] = []
      for (let i = 0; i < body.length; i++) {
        const ch = body[i]
        if (inStr) {
          if (esc) esc = false
          else if (ch === '\\') esc = true
          else if (ch === '"') inStr = false
          continue
        }
        if (ch === '"') { inStr = true; continue }
        if (ch === '{' || ch === '[') { bracketStack.push(ch); depth++; continue }
        if (ch === '}' || ch === ']') { bracketStack.pop(); depth--; continue }
        if (ch === ',' && depth === 1) {
          lastSafeCut = i
          cutBracketStack = [...bracketStack]
        }
      }

      if (lastSafeCut > 0) {
        // Chop off everything after the last clean field and close
        // whatever brackets were open at that point.
        let salvage = body.slice(0, lastSafeCut)
        // Close each open bracket in LIFO order
        for (let k = cutBracketStack.length - 1; k >= 0; k--) {
          salvage += cutBracketStack[k] === '{' ? '}' : ']'
        }
        salvage = cleanup(salvage)
        try { JSON.parse(salvage); return salvage } catch {}
      }

      // Last resort — return whatever we have after cleanup and let
      // the parser error naturally (the error snippet will be logged).
      return pass1
    }

    const text = extractJson(rawText)

    let parsed: any = {}
    try {
      parsed = JSON.parse(text)
    } catch (e: any) {
      const truncated = stopReason === 'max_tokens'
      const snippet = rawText.slice(0, 400).replace(/\s+/g, ' ')
      const tail = rawText.slice(-200).replace(/\s+/g, ' ')
      await supabase.from('screenings').update({
        status: 'error',
        error: (truncated ? 'AI output truncated: ' : 'AI parse error: ') + (e?.message || 'unknown').slice(0, 200),
      }).eq('id', screening_id)
      return NextResponse.json({
        error: truncated
          ? 'AI output was truncated — please retry (the model produced too much text).'
          : `AI parse error: ${(e?.message || 'unknown').slice(0, 150)} — head: "${snippet.slice(0, 120)}" — tail: "${tail.slice(0, 120)}"`,
        stop_reason: stopReason,
        raw: rawText.slice(0, 4000),
      }, { status: 500 })
    }

    const s: V3Scores = parsed.scores || {}
    if (typeof s.ability_to_pay !== 'number') {
      await supabase.from('screenings').update({ status: 'error', error: 'Missing v3 scores' }).eq('id', screening_id)
      return NextResponse.json({ error: 'Missing v3 scores', raw: text }, { status: 500 })
    }

    // ---- Stage 3.5: Forensics-driven dimension zeroing ----------------
    // If a critical/high forensics flag confirms a specific evidence file is
    // FORGED, zero the corresponding dimension score outright. Penalties and
    // hard gates alone are not enough: a fabricated credit report should
    // produce credit_health=0 with an explicit reason, not credit_health=70
    // softened by a penalty. The dimension's details_en/zh string is replaced
    // with a clear explanation that the underlying evidence was rejected.

    // Codes that, even at "high" (not "critical") severity, indicate the
    // file itself is a forgery (vs. just being suspicious / low-quality).
    // NOTE: pdf_pure_image is deliberately NOT here — an image-only PDF
    // could be a legitimate scan/photo. Only when combined with screenshot
    // tool metadata (pdf_producer_consumer_tool) does it become conclusive.
    const FORGERY_INDICATING_CODES = new Set([
      'pdf_title_indicates_image',         // title literally says PNG/screenshot
      'pdf_producer_consumer_tool',        // Photoshop / Word / Canva / Image2PDF
      'paystub_ytd_inflated',              // YTD math truly impossible (>2.5x)
      'paystub_period_math_error',         // hourly × hours ≠ stated gross
      'credit_report_no_bureau_markers',   // no Equifax AND no TransUnion markers
      'bank_producer_mismatch',            // bank text but wrong PDF Producer
    ])

    // file_kind → list of v3 dimensions to zero when that file is forged
    const KIND_TO_ZERO_DIMS: Record<string, Array<keyof V3Scores>> = {
      credit_report:     ['credit_health'],
      bank_statement:    ['ability_to_pay'],
      pay_stub:          ['ability_to_pay'],
      employment_letter: ['verification'],
      offer_letter:      ['ability_to_pay'],
      id_document:       ['verification'],
    }
    const KIND_LABEL_ZH: Record<string, string> = {
      credit_report:     '信用报告',
      bank_statement:    '银行流水',
      pay_stub:          '工资单',
      employment_letter: '雇主信',
      offer_letter:      'Offer / 录用信',
      id_document:       '身份证件',
    }
    const KIND_LABEL_EN: Record<string, string> = {
      credit_report:     'credit report',
      bank_statement:    'bank statement',
      pay_stub:          'pay stub',
      employment_letter: 'employment letter',
      offer_letter:      'offer letter',
      id_document:       'ID document',
    }

    type DimZeroReason = { en: string; zh: string }
    const dimZeroReasons: Partial<Record<keyof V3Scores, DimZeroReason>> = {}
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

    for (const pf of forensicsReport.per_file) {
      const isForged = pf.flags.some(f =>
        f.severity === 'critical' || (f.severity === 'high' && FORGERY_INDICATING_CODES.has(f.code))
      )
      if (!isForged) continue
      const dims = KIND_TO_ZERO_DIMS[pf.file_kind]
      if (!dims) continue
      // Pick the most severe flag as the explanation
      const top = [...pf.flags].sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9))[0]
      const kindEn = KIND_LABEL_EN[pf.file_kind] || pf.file_kind.replace('_', ' ')
      const kindZh = KIND_LABEL_ZH[pf.file_kind] || pf.file_kind
      const reason: DimZeroReason = {
        en: `Score forced to 0: the underlying ${kindEn} (${pf.file_name}) was determined to be forged. ${top.evidence_en}`,
        zh: `维度被置零：作为依据的${kindZh}文件（${pf.file_name}）被判定为伪造。${top.evidence_zh}`,
      }
      for (const dim of dims) {
        // First reason wins, but if multiple files of the same kind are forged,
        // append filenames so the user knows the full scope.
        if (!dimZeroReasons[dim]) {
          dimZeroReasons[dim] = reason
        } else {
          dimZeroReasons[dim] = {
            en: dimZeroReasons[dim]!.en + ` Additionally, ${pf.file_name} was also flagged.`,
            zh: dimZeroReasons[dim]!.zh + ` 此外 ${pf.file_name} 也被标记。`,
          }
        }
      }
    }

    // Apply the zeroing — mutate s and the parsed details so all downstream
    // logic (baseScore, legacy mapping, DB write, response) sees zeroed values.
    const detailsEn: Record<string, string> = (parsed.details_en && typeof parsed.details_en === 'object')
      ? { ...parsed.details_en } : {}
    const detailsZh: Record<string, string> = (parsed.details_zh && typeof parsed.details_zh === 'object')
      ? { ...parsed.details_zh } : {}
    const dimsZeroed: Array<keyof V3Scores> = []

    // If ANY document is forged, ALL uploaded documents become untrusted.
    // Zero out ALL dimensions that depend on uploaded evidence, not just
    // the specific dimension tied to the forged file type.
    if (Object.keys(dimZeroReasons).length > 0) {
      const forgedFileNames = Object.values(dimZeroReasons).map(r => r.en).join(' ')
      const ALL_DIMS: Array<keyof V3Scores> = ['ability_to_pay', 'credit_health', 'rental_history', 'verification', 'communication']
      for (const dim of ALL_DIMS) {
        if (!dimZeroReasons[dim]) {
          dimZeroReasons[dim] = {
            en: `Score forced to 0: another uploaded document was determined to be forged — ALL uploaded documents are now untrusted.`,
            zh: `维度被置零：检测到有文件伪造，所有上传文件均不可信。`,
          }
        }
      }
    }

    for (const [dim, reason] of Object.entries(dimZeroReasons) as Array<[keyof V3Scores, DimZeroReason]>) {
      s[dim] = 0
      detailsEn[dim] = reason.en
      detailsZh[dim] = reason.zh
      dimsZeroed.push(dim)
    }
    parsed.details_en = detailsEn
    parsed.details_zh = detailsZh

    // ---- Stage 4: Apply hard gates + red flag penalties + coverage ----
    const HARD_GATE_CAPS: Record<string, number> = {
      // Existing v3 gates
      income_severe: 65,
      ltb_eviction: 40,
      doc_tampering: 55,
      identity_mismatch: 50,
      employer_fraud: 45,
      // Forensics-derived gates (deterministic — backend-verified, not AI-inferred)
      // Lower caps reflect higher confidence: these are mathematical/file-format
      // proofs of forgery, not visual judgment.
      pdf_is_screenshot: 30,         // PDF is image-only OR title says "PNG/JPEG"
      paystub_math_impossible: 35,   // YTD inflated >2.5x or hourly×hours ≠ stated (medium "above_pro_rata" 1.5–2.5x does NOT trigger this gate — it's a verification flag, not a forgery proof)
      cross_doc_collision: 40,       // applicant phone == employer/HR phone
      producer_consumer_tool: 50,    // PDF Producer is Preview/Word/Skia for strict kinds
      // Self-issued employment — own company / family business letter
      self_issued_employment: 50,    // self-verified income is unreliable → overall capped at 50
      // Affordability — rent > 40% of gross monthly income (income_to_rent < 2.5x).
      // Canadian landlord convention is the 3x rule; 2.5x is the last defensible
      // threshold before the applicant is obviously overextended.
      affordability_severe: 55,
      // Court record gates — ANY court record as defendant/debtor = fundamentally untrustworthy
      court_record_defendant: 35,    // 1 case as defendant/debtor → overall capped at 35
      court_record_defendant_multi: 25, // 2+ cases → overall capped at 25
      court_record_active: 20,       // active (non-closed) case as defendant → overall capped at 20
      // Business Number cross-check — critical forgery signal. Copy-paste of
      // a real BN onto a fabricated letterhead is a classic fraud pattern.
      bn_employer_mismatch: 35,
    }
    const RED_FLAG_PENALTIES: Record<string, number> = {
      rush_move_in: 4,
      cross_doc_contradictions: 8,
      hr_phone_is_applicant: 10,
      no_linkedin_for_professional_role: 3,
      volunteered_sin: 2,
      self_issued_employment_letter: 15,
      // Rent takes 35-40% of gross income — borderline affordability. Not a
      // hard gate (that's reserved for > 40%) but a material penalty.
      rent_ratio_high: 8,
      // Any ID that fails its intrinsic format / checksum check.
      id_format_invalid: 6,
    }

    let baseScore =
      s.ability_to_pay * V3_WEIGHTS.ability_to_pay +
      s.credit_health * V3_WEIGHTS.credit_health +
      s.rental_history * V3_WEIGHTS.rental_history +
      s.verification * V3_WEIGHTS.verification +
      s.communication * V3_WEIGHTS.communication

    const hardGates: string[] = Array.isArray(parsed.hard_gates_triggered) ? parsed.hard_gates_triggered : []
    const redFlags: string[] = Array.isArray(parsed.red_flags) ? parsed.red_flags : []

    // Enforce hard gates in backend (don't fully trust Claude)
    if (monthlyRent > 0 && incomeRatio > 0 && incomeRatio < 2.0 && !hardGates.includes('income_severe')) {
      hardGates.push('income_severe')
    }
    // Affordability gate: rent > 40% of gross income. Fires even when
    // income_severe is also set — the tighter cap (55) wins over (65).
    if (monthlyRent > 0 && incomeRatio > 0 && incomeRatio < 2.5 && !hardGates.includes('affordability_severe')) {
      hardGates.push('affordability_severe')
    }
    // Red flag: rent 35-40% of gross income — borderline. Skip if
    // affordability_severe already fires (double-counting would be unfair).
    if (monthlyRent > 0 && incomeRatio >= 2.5 && incomeRatio < 2.857 && !redFlags.includes('rent_ratio_high')) {
      redFlags.push('rent_ratio_high')
    }
    // Lift any ID-validation failures from the forensics layer into the red-flag
    // system so they contribute to the penalty score.
    const idFailureCodes = new Set([
      'id_sin_invalid_checksum',
      'id_dl_surname_mismatch',
      'id_ohip_invalid_format',
    ])
    const hasIdFailure = forensicsReport.all_flags.some(f => idFailureCodes.has(f.code))
    if (hasIdFailure && !redFlags.includes('id_format_invalid')) {
      redFlags.push('id_format_invalid')
    }

    // Merge forensics-derived hard gates (deterministic, computed by lib/forensics).
    // These take precedence over Claude's judgment because they're proof-based:
    // PDF metadata strings + math impossibility don't lie. We override even if
    // Claude didn't flag the docs.
    for (const fgate of forensicsReport.hard_gates) {
      if (!hardGates.includes(fgate)) hardGates.push(fgate)
    }
    // If forensics severity is fraud/likely_fraud and Claude didn't add doc_tampering
    // (e.g. because the visual check fooled the model), force it in.
    if ((forensicsReport.severity === 'fraud' || forensicsReport.severity === 'likely_fraud')
        && !hardGates.includes('doc_tampering')) {
      hardGates.push('doc_tampering')
    }
    // Critical forensics flags add to red_flags too (so penalty stacks)
    for (const f of forensicsReport.all_flags) {
      if (f.severity === 'critical' || f.severity === 'high') {
        if (!redFlags.includes('forensics_' + f.code)) redFlags.push('forensics_' + f.code)
      }
    }
    // ── Backend enforcement: court record penalties ──
    // The AI sometimes ignores portal/CanLII records when scoring rental_history.
    // We enforce minimum penalties here based on objective court data.
    //
    // Helper: when court records DO exist, the AI-emitted `details_zh.rental_history`
    // / `details_en.rental_history` text is often a stale "未发现记录 / no records"
    // string because the AI ran before the merged CanLII + portal results landed.
    // Rewrite that text so the UI card matches the record list shown below it.
    const COURT_DB_LABELS_ZH: Record<string, string> = {
      onltb: 'LTB', onscsm: '小额法庭', onsc: '高等法院',
      onscdc: '分庭法院', onca: '上诉法院', oncj: '安省法院',
    }
    const COURT_DB_LABELS_EN: Record<string, string> = {
      onltb: 'LTB', onscsm: 'Small Claims', onsc: 'Superior Court',
      onscdc: 'Divisional Court', onca: 'Court of Appeal', oncj: 'Ontario Court',
    }
    // Patterns that signal "AI thinks there are zero court records" even though
    // we DID find some. Needs to be broad — the AI uses many variants:
    //   "未发现LTB记录"  "无LTB/小额法庭记录"  "0条"  "0 个LTB"
    //   "0 LTB 记录"  "没有法庭记录"  "暂无..."
    const ZERO_COURT_REGEX_ZH = /(未?(发现|检出|查到|找到|命中|有)\s*[0-9]*\s*[条个项次]?\s*(LTB|法庭|记录|案件|小额|判决)|(无|没|暂无).{0,10}(LTB|法庭|记录|案件|小额|判决|命中)|0\s*[条个项次]?\s*(LTB|法庭|记录|案件|小额|判决)|^\s*0\s*[个条]?\s*LTB)/im
    const ZERO_COURT_REGEX_EN = /(no\s+(?:ltb|court|record|cases?|hits?|small\s*claims|judgment)|0\s+(?:ltb|court|record|cases?|hits?|small\s*claims)|not\s+found\s+in|clean\s+record|n[o']?\s+prior\s+(?:ltb|court))/i
    function patchRentalHistoryDetailsForCourt(
      parsedObj: any,
      canliiRecs: Array<{ databaseId?: string; nameInTitle?: boolean }>,
      portalRecs: Array<{ partyRole?: string; closedFlag?: boolean }>,
    ) {
      if (!parsedObj || typeof parsedObj !== 'object') return
      const dbCounts: Record<string, number> = {}
      for (const r of canliiRecs) {
        if (!r.nameInTitle) continue
        const id = (r.databaseId || '').toLowerCase()
        if (!id) continue
        dbCounts[id] = (dbCounts[id] || 0) + 1
      }
      const portalDefCount = portalRecs.filter(r => {
        const role = (r.partyRole || '').toLowerCase()
        return role.includes('defendant') || role.includes('debtor') || role.includes('respondent')
      }).length
      const activeDefCount = portalRecs.filter(r => {
        const role = (r.partyRole || '').toLowerCase()
        return (role.includes('defendant') || role.includes('debtor') || role.includes('respondent')) && !r.closedFlag
      }).length
      const partsZh: string[] = []
      const partsEn: string[] = []
      for (const [id, count] of Object.entries(dbCounts)) {
        if (count <= 0) continue
        partsZh.push(`${count}条${COURT_DB_LABELS_ZH[id] || id.toUpperCase()}`)
        partsEn.push(`${count} ${COURT_DB_LABELS_EN[id] || id.toUpperCase()}`)
      }
      if (portalDefCount > 0) {
        partsZh.push(`${portalDefCount}条法庭门户被告`)
        partsEn.push(`${portalDefCount} portal defendant`)
      }
      if (partsZh.length === 0) return
      const detailsZh = (parsedObj.details_zh && typeof parsedObj.details_zh === 'object')
        ? parsedObj.details_zh : {}
      const detailsEn = (parsedObj.details_en && typeof parsedObj.details_en === 'object')
        ? parsedObj.details_en : {}
      const existingZh = String(detailsZh.rental_history || '')
      const existingEn = String(detailsEn.rental_history || '')
      const activeSuffixZh = activeDefCount > 0 ? `，${activeDefCount}条仍在审` : ''
      const activeSuffixEn = activeDefCount > 0 ? `, ${activeDefCount} active` : ''
      // Rewrite the text unless it ALREADY acknowledges the finding with the
      // right hit language. "Acknowledge" means the text explicitly mentions
      // being a defendant/debtor/respondent (or 被告/欠方/当事人) AND uses at
      // least one court-system keyword. If either is missing, the AI was
      // incomplete and we overwrite with the deterministic summary.
      const acknowledgesHitZh = /(被告|欠方|当事人|门户|命中|查到|发现).{0,20}(LTB|法庭|小额|记录|案件|判决)/i.test(existingZh)
        || /\b\d+\s*(条|个).{0,10}(被告|案件|记录)/i.test(existingZh)
      const acknowledgesHitEn = /(defendant|debtor|respondent|portal\s+hit|cases?\s+found|judgment).{0,30}(ltb|court|small\s*claims|record|case)/i.test(existingEn)
        || /\b\d+\s+(cases?|records?|hits?)\b/i.test(existingEn)

      const shouldRewriteZh = !acknowledgesHitZh
        || ZERO_COURT_REGEX_ZH.test(existingZh)
        || !/\d/.test(existingZh)
      const shouldRewriteEn = !acknowledgesHitEn
        || ZERO_COURT_REGEX_EN.test(existingEn)
        || !/\d/.test(existingEn)

      if (shouldRewriteZh) {
        detailsZh.rental_history = `命中 ${partsZh.join('，')}${activeSuffixZh}（姓名一致）`
      }
      if (shouldRewriteEn) {
        detailsEn.rental_history = `Hits: ${partsEn.join(', ')}${activeSuffixEn} (name in title)`
      }
      parsedObj.details_zh = detailsZh
      parsedObj.details_en = detailsEn
    }

    const portalDefendantCases = (courtDetail.portal_records || []).filter(r => {
      const role = (r.partyRole || '').toLowerCase()
      return role.includes('defendant') || role.includes('debtor') || role.includes('respondent')
    })
    const canliiPartyHits = courtDetail.records.filter(r => r.nameInTitle).length
    const totalCourtHits = portalDefendantCases.length + canliiPartyHits

    if (totalCourtHits > 0) {
      // Court records as defendant/debtor = fundamentally untrustworthy.
      // 1 hit → rental_history capped at 25, 2+ hits → capped at 10
      const rhCap = totalCourtHits >= 2 ? 10 : 25
      s.rental_history = Math.min(s.rental_history, rhCap)
      // Also penalize credit_health — debt disputes imply credit issues
      const chCap = totalCourtHits >= 2 ? 20 : 40
      s.credit_health = Math.min(s.credit_health, chCap)
      // Trigger hard gate to cap OVERALL score
      if (totalCourtHits >= 2 && !hardGates.includes('court_record_defendant_multi')) {
        hardGates.push('court_record_defendant_multi')
      } else if (!hardGates.includes('court_record_defendant')) {
        hardGates.push('court_record_defendant')
      }
      // Force the details card text to match the actual hit count, so the
      // UI doesn't say "no LTB/court records" while 2 records sit below it.
      patchRentalHistoryDetailsForCourt(parsed, courtDetail.records, courtDetail.portal_records || [])
    }
    // Active (non-closed) cases are even worse — person is currently being sued
    const activeDefendantCases = portalDefendantCases.filter(r => !r.closedFlag)
    if (activeDefendantCases.length > 0) {
      s.rental_history = Math.min(s.rental_history, 5)
      s.credit_health = Math.min(s.credit_health, 15)
      if (!hardGates.includes('court_record_active')) {
        hardGates.push('court_record_active')
      }
    }
    // Recalculate base score after court record corrections
    if (totalCourtHits > 0) {
      baseScore = Math.round(
        s.ability_to_pay * 0.40 +
        s.credit_health * 0.25 +
        s.rental_history * 0.20 +
        s.verification * 0.10 +
        s.communication * 0.05
      )
    }

    // Apply forensics red-flag penalties (separate scale: critical=10, high=5)
    const forensicsPenalty = forensicsReport.all_flags.reduce((sum, f) => {
      if (f.severity === 'critical') return sum + 10
      if (f.severity === 'high') return sum + 5
      if (f.severity === 'medium') return sum + 2
      return sum
    }, 0)

    const claudeRedFlagPenalty = redFlags.reduce((sum, flag) => sum + (RED_FLAG_PENALTIES[flag] || 0), 0)
    const penalty = claudeRedFlagPenalty + forensicsPenalty
    let gateCap = hardGates.length > 0
      ? Math.min(...hardGates.map(g => HARD_GATE_CAPS[g] ?? 100))
      : 100

    let overall = Math.round(Math.max(0, Math.min(100, Math.min(baseScore - penalty, gateCap))))

    // Evidence coverage — weight each sub-coverage tag. The v3 prompt
    // now emits sub_coverage SPARSELY: only keys with action_pending or
    // missing status are included. Any sub-component NOT listed is
    // treated as "measured" (1.0). This cuts ~100-200 tokens off the
    // output on a typical happy-path screening.
    const coverageWeights: Record<string, number> = {
      measured: 1.0,
      inferred: 0.6,
      action_pending: 0.3,
      missing: 0.0,
    }
    const ALL_SUB_COMPONENTS = [
      'income_rent_ratio', 'income_stability', 'emergency_reserves',
      'credit_score', 'dti',
      'prior_landlord_refs', 'ltb_check',
      'employer_verify', 'doc_authenticity', 'identity_match',
    ]
    const rawSubCov = parsed.sub_coverage || {}
    // Materialize the full sub_coverage map: explicit entries win,
    // otherwise default to "measured". This gives us a consistent
    // 10-entry object to persist and a stable coverage denominator.
    const subCov: Record<string, string> = {}
    for (const k of ALL_SUB_COMPONENTS) {
      subCov[k] = rawSubCov[k] || 'measured'
    }
    const evidenceCoverage = ALL_SUB_COMPONENTS.reduce(
      (sum, k) => sum + (coverageWeights[subCov[k]] ?? 1.0), 0
    ) / ALL_SUB_COMPONENTS.length

    // Determine tier
    let tier: 'approve' | 'conditional' | 'decline'
    let tierReason = ''
    if (evidenceCoverage < 0.4) {
      tier = 'conditional'
      tierReason = 'insufficient_evidence'
    } else if (hardGates.length > 0) {
      tier = 'decline'
      tierReason = 'hard_gate_triggered'
    } else if (evidenceCoverage < 0.6) {
      tier = 'conditional'
      tierReason = 'low_confidence'
    } else if (overall >= 85) {
      tier = 'approve'
    } else if (overall >= 70) {
      tier = 'conditional'
    } else {
      tier = 'decline'
    }

    // ---- Stage 5: Map to legacy columns for backward compat ----
    const identityMatch = typeof parsed.identity_match_score === 'number' ? parsed.identity_match_score : 70
    const legacy = mapV3ToLegacy(s, redFlags.length, identityMatch)

    // ---- Stage 5.5: Supplemental court searches for AI-extracted names ----
    // The initial court search (Stage 2) only used the landlord-provided
    // tenant_name. If the AI extracted additional names from ID documents
    // (e.g. a second applicant), run court searches for those names now
    // and merge the results.
    const extractedNames: string[] = Array.isArray(parsed.extracted_names)
      ? parsed.extracted_names.map((n: any) => (typeof n === 'string' ? n.trim() : '')).filter((n: string) => n.length > 0)
      : (parsed.extracted_name ? [parsed.extracted_name.trim()] : [])
    const finalExtractedName = extractedNames[0] || parsed.extracted_name || null

    // Find names that weren't already searched (case-insensitive comparison)
    const alreadySearched = new Set([nameForLookup.toLowerCase()])
    const newNames = extractedNames.filter(n => !alreadySearched.has(n.toLowerCase()) && isValidFullName(n))

    if (newNames.length > 0) {
      // Insert a name separator for the primary name so the UI clearly
      // labels which group of queries belongs to which person.
      const primaryHits = courtDetail.total_hits
      courtDetail.queries.splice(1, 0, {
        source: `── ${nameForLookup} ──`,
        tier: 'free',
        status: 'ok',
        hits: primaryHits,
        note: 'Primary applicant name',
      })

      // Run court searches for each new name in parallel
      const supplementalResults = await Promise.allSettled(
        newNames.map(async (extraName) => {
          const result = await runCourtRecordCheck(extraName, plan)
          return { name: extraName, result }
        })
      )

      for (const sr of supplementalResults) {
        if (sr.status !== 'fulfilled') continue
        const { name: extraName, result: extraCourt } = sr.value

        // Merge queries: add a separator + all queries for this name
        courtDetail.queries.push({
          source: `── ${extraName} ──`,
          tier: 'free',
          status: 'ok',
          hits: extraCourt.total_hits,
          note: `Additional name extracted from ID documents`,
        })
        // Add all database-specific queries from the supplemental search
        // Skip the rollup row (index 0) and pro-tier rows to avoid duplicates
        for (const q of extraCourt.queries.slice(1)) {
          if (q.tier === 'pro') continue  // pro sources already shown once
          courtDetail.queries.push(q)
        }

        // Merge records
        courtDetail.records.push(...extraCourt.records)
        courtDetail.total_hits += extraCourt.total_hits
        if (extraCourt.portal_records) {
          courtDetail.portal_records = [
            ...(courtDetail.portal_records || []),
            ...extraCourt.portal_records,
          ]
        }
      }

      // Update court_records_detail in DB with merged results
      await supabase.from('screenings').update({
        court_records_detail: courtDetail,
      }).eq('id', screening_id)

      // Re-enforce court record penalties with merged supplemental results
      const allPortalDefendant = (courtDetail.portal_records || []).filter(r => {
        const role = (r.partyRole || '').toLowerCase()
        return role.includes('defendant') || role.includes('debtor') || role.includes('respondent')
      })
      const allCanliiPartyHits = courtDetail.records.filter(r => r.nameInTitle).length
      const allCourtHits = allPortalDefendant.length + allCanliiPartyHits
      if (allCourtHits > 0) {
        const rhCap = allCourtHits >= 2 ? 10 : 25
        s.rental_history = Math.min(s.rental_history, rhCap)
        const chCap = allCourtHits >= 2 ? 20 : 40
        s.credit_health = Math.min(s.credit_health, chCap)
        if (allCourtHits >= 2 && !hardGates.includes('court_record_defendant_multi')) {
          hardGates.push('court_record_defendant_multi')
        } else if (allCourtHits === 1 && !hardGates.includes('court_record_defendant')) {
          hardGates.push('court_record_defendant')
        }
        // Re-patch details text to reflect the post-merge record counts.
        patchRentalHistoryDetailsForCourt(parsed, courtDetail.records, courtDetail.portal_records || [])
      }
      const allActive = allPortalDefendant.filter(r => !r.closedFlag)
      if (allActive.length > 0) {
        s.rental_history = Math.min(s.rental_history, 5)
        s.credit_health = Math.min(s.credit_health, 15)
        if (!hardGates.includes('court_record_active')) {
          hardGates.push('court_record_active')
        }
      }
      // Recalculate overall with corrected scores and new gates
      baseScore = Math.round(
        s.ability_to_pay * 0.40 +
        s.credit_health * 0.25 +
        s.rental_history * 0.20 +
        s.verification * 0.10 +
        s.communication * 0.05
      )
      gateCap = hardGates.length > 0
        ? Math.min(...hardGates.map(g => HARD_GATE_CAPS[g] ?? 100))
        : 100
      overall = Math.round(Math.max(0, Math.min(100, Math.min(baseScore - penalty, gateCap))))
    }

    const detectedIncome = typeof parsed.detected_monthly_income === 'number' && parsed.detected_monthly_income > 0
      ? parsed.detected_monthly_income : null
    const effectiveIncome = detectedIncome ?? (monthlyIncome > 0 ? monthlyIncome : null)
    const computedRatio = (effectiveIncome && monthlyRent > 0) ? effectiveIncome / monthlyRent : null

    // Pack the full v3 payload into ai_dimension_notes._v3
    const mergedNotes: Record<string, any> = {
      _v3: {
        model_version: 'v3_2026',
        scores: s,
        sub_coverage: subCov,
        details_en: parsed.details_en || {},
        details_zh: parsed.details_zh || {},
        hard_gates_triggered: hardGates,
        red_flags: redFlags,
        red_flag_penalty: penalty,
        gate_cap: gateCap,
        evidence_coverage: Number(evidenceCoverage.toFixed(2)),
        tier,
        tier_reason: tierReason,
        action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
        compliance_audit: parsed.compliance_audit || null,
        bank_min_balance: typeof parsed.bank_min_balance === 'number' ? parsed.bank_min_balance : null,
        identity_match_score: identityMatch,
        // Snapshot of everything else needed to reconstruct the full report
        // view when the user re-opens a saved screening from history.
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        summary_en: parsed.summary_en || '',
        summary_zh: parsed.summary_zh || '',
        court_summary_en: parsed.court_summary_en || '',
        court_summary_zh: parsed.court_summary_zh || '',
        detected_document_kinds: Array.isArray(parsed.detected_document_kinds) ? parsed.detected_document_kinds : [],
        detected_monthly_income: detectedIncome,
        effective_monthly_income: effectiveIncome,
        income_evidence: parsed.income_evidence || null,
        monthly_rent: monthlyRent || null,
        income_rent_ratio: computedRatio,
        court_records_detail: courtDetail,
        forensics_detail: forensicsReport,
        forensics_penalty: forensicsPenalty,
        forensics_zeroed_dims: dimsZeroed,
        extracted_name: finalExtractedName,
        extracted_names: extractedNames,
        legacy_scores: legacy,
      },
      _details_en: parsed.details_en,
      _details_zh: parsed.details_zh,
      _income_evidence: parsed.income_evidence,
      _court_summary_en: parsed.court_summary_en,
      _court_summary_zh: parsed.court_summary_zh,
    }

    const { error: updateError } = await supabase.from('screenings').update({
      ai_score: overall,
      ai_summary: parsed.summary_en || '',
      ai_extracted_name: finalExtractedName,
      ai_dimension_notes: mergedNotes,
      forensics_detail: forensicsReport,
      // Legacy 6 columns — kept populated via v3→legacy mapping
      doc_authenticity_score: legacy.doc_authenticity,
      payment_ability_score: legacy.payment_ability,
      court_records_score: legacy.court_records,
      stability_score: legacy.stability,
      behavior_signals_score: legacy.behavior_signals,
      info_consistency_score: legacy.info_consistency,
      // v3 native columns
      model_version: 'v3_2026',
      ability_to_pay_score: s.ability_to_pay,
      credit_health_score: s.credit_health,
      rental_history_score: s.rental_history,
      verification_score: s.verification,
      communication_score: s.communication,
      evidence_coverage: Number(evidenceCoverage.toFixed(2)),
      v3_tier: tier,
      tier_reason: tierReason,
      hard_gates_triggered: hardGates,
      red_flags: redFlags,
      red_flag_penalty: penalty,
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      compliance_audit: parsed.compliance_audit || null,
      sub_coverage: subCov,
      bank_min_balance: typeof parsed.bank_min_balance === 'number' ? parsed.bank_min_balance : null,
      identity_match_score: identityMatch,
      status: 'scored',
      scored_at: new Date().toISOString(),
    }).eq('id', screening_id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      screening_id: screening_id,
      overall,
      model_version: 'v3_2026',
      scores_v3: s,
      scores: legacy,  // legacy shape for current UI
      // NOTE: 'tier' in the response is kept as 'free'|'pro' for backwards
      // compat with the existing frontend. The v3 model tier (approve /
      // conditional / decline) is returned under 'v3_tier'.
      tier: (plan === 'pro' || plan === 'enterprise') ? 'pro' : 'free',
      v3_tier: tier,
      tier_reason: tierReason,
      hard_gates_triggered: hardGates,
      red_flags: redFlags,
      red_flag_penalty: penalty,
      gate_cap: gateCap,
      evidence_coverage: Number(evidenceCoverage.toFixed(2)),
      sub_coverage: subCov,
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      compliance_audit: parsed.compliance_audit || null,
      details_en: parsed.details_en || null,
      details_zh: parsed.details_zh || null,
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      detected_document_kinds: Array.isArray(parsed.detected_document_kinds) ? parsed.detected_document_kinds : [],
      detected_monthly_income: detectedIncome,
      effective_monthly_income: effectiveIncome,
      income_evidence: parsed.income_evidence || null,
      bank_min_balance: typeof parsed.bank_min_balance === 'number' ? parsed.bank_min_balance : null,
      identity_match_score: identityMatch,
      monthly_rent: monthlyRent || null,
      income_rent_ratio: computedRatio,
      extracted_name: finalExtractedName,
      extracted_names: extractedNames,
      name_was_extracted: !screening.tenant_name && !!finalExtractedName,
      summary: parsed.summary_en || '',
      summary_en: parsed.summary_en || '',
      summary_zh: parsed.summary_zh || '',
      court_summary_en: parsed.court_summary_en || '',
      court_summary_zh: parsed.court_summary_zh || '',
      court_records_detail: courtDetail,
      forensics_detail: forensicsReport,
      forensics_penalty: forensicsPenalty,
      forensics_zeroed_dims: dimsZeroed,
    })
  } catch (e: any) {
    console.error('[screen-score] uncaught:', e)
    return NextResponse.json(
      {
        error: 'Screening failed: ' + (e?.message || String(e) || 'unknown error').slice(0, 300),
        name: e?.name || undefined,
      },
      { status: 500 }
    )
  }
}

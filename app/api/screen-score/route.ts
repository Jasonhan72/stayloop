// 2026-06-02 — Code review §6 P2 — Stop emitting CANLII_API_KEY in URLs.
//   CanLII's v1 API does NOT accept header-based auth (we tested
//   `Authorization: Token <key>` and the API responds 401 with
//   "missing api_key"). The supported auth path is `?api_key=...` only.
//   Since we can't move the key off the URL, we mitigate by:
//     (a) NEVER logging the raw URL — every console.* call below is
//         routed through sanitizeUrlForLog() which strips api_key.
//     (b) Setting `referrerPolicy: 'no-referrer'` on every CanLII fetch
//         so the key can't leak via the Referer header on any redirect.
//     (c) Centralising URL construction in buildCanLiiUrl() so future
//         additions can't reintroduce a leak by hand-rolling a fetch.
// 2026-06-02 — Code review §6 P1 — Aggregate 12s budget on CanLII fan-out (circuit breaker)
import { NextRequest, NextResponse } from 'next/server'
import { repairUnescapedQuotes } from '@/lib/screening/jsonRepair'
import { llmChatStream } from '@/lib/llmChat'
import { readJsonBody, INVALID_BODY } from '@/lib/api/body'
import { createClient } from '@supabase/supabase-js'
import { runForensics, forensicsToPromptBlock, type ForensicsReport } from '@/lib/forensics'
import { DEFAULT_MODELS, getModelDef, getModelDefAsync, getModelForUser } from '@/lib/modelConfig'
import { applyPageBudget } from '@/lib/anthropic/page-budget'
import { captureException } from '@/lib/observability/sentry'
import type { CourtQuery, CanLIIMatch, OntarioPortalMatch, V3Scores, CrossDocVerification, LtbCheck, CreditReport } from '@/lib/screening-types'
import { describeCodes, searchLtbOrders, summarizeLtb } from '@/lib/ltb/search'
import { checkTradelineAges } from '@/lib/screening/creditAge'
import { runCoherenceReview, coherenceToPromptBlock, coherenceToFlags, type CoherenceReview } from '@/lib/screening/coherenceReview'
import { courtDefendantHitsFromGates, scoreRubric, type RubricFacts, type RubricResult } from '@/lib/screening/rubric'
import { searchCanliiViaIndex } from '@/lib/screening/canliiIndex'
import { V3_WEIGHTS } from '@/lib/screening-types'

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

interface CanLIIDatabase {
  databaseId: string
  jurisdiction: string
  name: string
}

// ── Operational config (timeouts, model params, limits) ──
const DB_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CANLII_DB_LIST_TIMEOUT_MS = 5000
const CANLII_PER_REQ_TIMEOUT_MS = 6000
const CANLII_DECISION_TIMEOUT_MS = 4000
const CANLII_AGGREGATE_BUDGET_MS = 12_000
const ONTARIO_PORTAL_TIMEOUT_MS = 8000
const CLAUDE_MAX_TOKENS = 6000
const CLAUDE_TEMPERATURE = 0


// §6 P2 — CanLII URL helpers ------------------------------------------------
// buildCanLiiUrl appends api_key + caller-supplied query params, in that
// fixed order. Centralising URL construction is the only way to make sure
// every CanLII fetch in this file goes through the same hardening (referrer
// policy, log sanitization) — see fetchCanLii below.
//
// CANLII_LOG_REDACTION is the regex we strip from log strings. Kept here
// (rather than in observability/sentry) so the redaction lives next to the
// URL builder that knows the param name.
const CANLII_LOG_REDACTION = /([?&])api_key=[^&]*/g

function buildCanLiiUrl(path: string, apiKey: string, params?: Record<string, string | number>): string {
  // path is relative to https://api.canlii.org/v1/, e.g. 'caseBrowse/en/onltb/'
  const qs = new URLSearchParams()
  qs.set('api_key', apiKey)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      qs.set(k, String(v))
    }
  }
  return `https://api.canlii.org/v1/${path}${path.includes('?') ? '&' : '?'}${qs.toString()}`
}

/** Strip api_key=... from any string before logging. Safe to call on
 *  arbitrary strings (no-op if no api_key present). */
function sanitizeUrlForLog(s: string): string {
  return s.replace(CANLII_LOG_REDACTION, '$1api_key=REDACTED')
}

/** Wrapper around fetch() that sets the no-referrer policy so the api_key
 *  in the URL can't leak via Referer on any redirect. */
function fetchCanLii(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    referrerPolicy: 'no-referrer',
  })
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


// 2026-06-02 — §6 P1 — Minimal AbortSignal merger for runtimes that don't
// expose AbortSignal.any. Returns a signal that aborts as soon as ANY of
// its inputs abort. We deliberately don't propagate abort reasons through
// this fallback since the only consumer (searchCanLIIDb) only cares which
// of the two signals fired and reads aggregateSignal.aborted directly.
function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a
  if (b.aborted) return b
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })
  return ctrl.signal
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
      // 50, not 10: a common-name applicant can have >10 exact-name results
      // and the true record past the first page — which then reported
      // "No matches" unconditionally.
      'size': '50',
    })
    const url = `https://api1.courts.ontario.ca/courts/cms/parties?${params.toString()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(ONTARIO_PORTAL_TIMEOUT_MS) })
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

async function runCourtRecordCheck(name: string, plan: string): Promise<{ queries: CourtQuery[]; total_hits: number; queried_name: string; records: CanLIIMatch[]; databases_searched: number; portal_hits?: number; portal_records?: OntarioPortalMatch[]; court_summary_en?: string; court_summary_zh?: string; partial?: boolean }> {
  const queries: CourtQuery[] = []
  // NOTE: no CANLII_API_KEY gate here. The CanLII fan-out that needed the key
  // was deleted (its API has no name search); the web-index chain uses
  // GOOGLE_CSE_KEY/JINA_API_KEY and the Ontario Courts Portal needs no key at
  // all. The old gate meant a rotated-out key silently disabled the portal —
  // the only true party-name search — for every screening.
  const searchName = (name || '').trim()
  if (!isValidFullName(searchName)) {
    const reason = !searchName
      ? 'No applicant name provided'
      : 'Full name required (first + last name). Single names are too ambiguous for court record lookup.'
    queries.push({ source: 'CanLII — all Ontario databases', tier: 'free', status: 'skipped', hits: null, note: reason })
    return { queries, total_hits: 0, queried_name: searchName, records: [], databases_searched: 0 }
  }

  // ── CanLII: disclosed, not searched ────────────────────────────────────
  //
  // This used to fan out across ~78 Ontario databases with
  //     caseBrowse/en/<db>/?fullText="<applicant name>"
  // and filter the results by whether the name appeared in the case title.
  //
  // CanLII's API has no full-text or party-name search. `fullText` is not one
  // of its parameters and is silently ignored — the documented filters are
  // date and pagination only. Verified against the live API: the same request
  // with no fullText, with a real applicant's name, and with the nonsense
  // string "zzqqxx9988nonsense" returns byte-identical results. Every call was
  // fetching that database's N most recent decisions — the same ones for every
  // applicant — and asking whether the name happened to be in one of those
  // titles. It essentially never was.
  //
  // So this reported "✓ 无记录 / CLEAR" for every applicant who ever ran a
  // screening, next to copy stating that a clear result means the source was
  // actually searched. A tenant with a real, live LTB eviction came back clean.
  //
  // It is not fixable with better parameters (re-verified 2026-08-02, with the
  // configured API key: no fullText, a real name, and a nonsense string still
  // return byte-identical result sets), so it is never presented as a searched
  // source. What actually searches by name stays: the Ontario Courts Portal
  // (party search, below) and the LTB Order Catalogue (Ontario Open Data,
  // indexed by us — see Stage 3.7 in the POST handler).
  //
  // What we CAN honestly do instead, in order of preference:
  //
  //  1. Search the public WEB INDEX of canlii.org (lib/screening/canliiIndex.ts,
  //     provider chain: Google CSE → Jina search) — automated, no click, and it
  //     queries the search provider's API, never CanLII's servers. A hit there is a decision page
  //     that MENTIONS the name: the live search for "David Park" returns Crown
  //     counsel David Parke, arbitrator David Parkes, and the sentence
  //     "Mr. David parked his car". So index results are hitKind:'mention',
  //     display-only — never added to total_hits, never fed to
  //     countDebtRelevantHits(), never allowed to move a score. A human reads
  //     them; a scorer must not.
  //
  //  2. When that is unconfigured or fails: the pre-filled manual link. The
  //     canlii.org WEBSITE has real full-text search (only the API lacks it)
  //     and its results page is a plain shareable URL, run in the landlord's
  //     own browser (which also sidesteps CanLII's bot protection — it 403s
  //     server-side fetches, and CanLII's terms prohibit scraping the site).
  const canliiManualUrl = `https://www.canlii.org/en/#search/type=decision&jId=on&text=${encodeURIComponent(`"${searchName}"`)}`
  const idx = await searchCanliiViaIndex(searchName)
  if (idx.status === 'ok') {
    queries.push({
      source: 'CanLII (via public web index)',
      tier: 'free',
      status: 'ok',
      hits: idx.matches.length,
      hitKind: 'mention',
      // Severity stays 0 unconditionally: a mention colours nothing.
      note: idx.matches.length === 0
        ? 'Full-text search of canlii.org via its public web index: no page mentions this exact name.'
        : `${idx.matches.length} decision page(s) on canlii.org mention this exact name. A mention is NOT a party record — counsel, adjudicators and unrelated cases share names. Read each linked decision before drawing any conclusion; these results carry no weight in the score.`,
      url: canliiManualUrl,
      indexRecords: idx.matches,
    })
  } else {
    queries.push({
      source: 'CanLII',
      tier: 'free',
      status: 'unavailable',
      hits: null,
      note: 'CanLII\'s API has no name search (date filters only), so this source cannot be searched automatically. Its website can: use the link to run the pre-filled full-text search across all Ontario databases and read the matches yourself.',
      url: canliiManualUrl,
    })
  }

  const allRecords: CanLIIMatch[] = []
  let totalHits = 0
  const totalDbsSearched = 0
  const aggregatePartial = false


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
    // Red severity ONLY when a defendant/debtor/respondent-side match exists.
    // An applicant who sued a former landlord (plaintiff) is exercising their
    // rights — painting that red is the Small-Claims analogue of scoring
    // tenant-filed LTB applications.
    const portalDefendantSide = portalResult.matches.filter(m => {
      const role = (m.partyRole || '').toLowerCase()
      return role.includes('defendant') || role.includes('debtor') || role.includes('respondent')
    }).length
    queries.push({
      source: 'Ontario Courts Portal — Civil & Small Claims',
      tier: 'free',
      status: 'ok',
      hits: portalHits,
      severity: portalDefendantSide > 0 ? 2 : 0,
      note: portalHits === 0
        ? `No matches in Ontario Courts Portal${(portalResult.totalElements ?? 0) > 0 ? ` (${portalResult.totalElements} name-search results returned; none matched the applicant's exact name after verification)` : ''}`
        : `${portalHits} case(s) found (of ${portalResult.totalElements} total results; ${portalDefendantSide} on the defendant side). Name-only matches — the portal carries no DOB/address, so identity must be verified before drawing conclusions.`,
      portalRecords: portalHits > 0 ? portalResult.matches : undefined,
      url: 'https://courts.ontario.ca/portal/search/party',
    })
  }

  // Add portal hits to the total
  const combinedHits = totalHits + portalHits
  const totalSourcesSearched = totalDbsSearched + 1 // +1 for Ontario Courts Portal

  // Pro-tier sources still pending
  queries.push({ source: 'Stayloop Verified Network', tier: 'pro', status: 'coming_soon', hits: null, note: 'Pro feature — coming soon' })

  return { queries, total_hits: combinedHits, queried_name: name || '', records: allRecords, databases_searched: totalSourcesSearched, portal_hits: portalHits, portal_records: portalResult.matches, partial: aggregatePartial || undefined }
}

// Map v3's 5 dims → legacy 6 columns, so old dashboards keep working.
// This is deterministic and documented — nothing is invented.
// 2026-06-02 P1 + P2 — Two-part change:
//  1. behavior_signals now takes `behavioralRedFlagCount` (callers must
//     pre-filter out `forensics_*` entries which already affect overall
//     via hardGates + forensicsPenalty; counting them here too triple-
//     displays the same evidence in the legacy 6-column UI).
//  2. court_records is now derived from the actual CanLII/Portal hit
//     count rather than the bundled v3.rental_history score (which mixes
//     LTB hits with prior-landlord-reference signals — that bundling
//     left the legacy court_records column showing 50 for "clean LTB +
//     missing references" which a landlord can't act on).
function mapV3ToLegacy(
  v3: V3Scores,
  behavioralRedFlagCount: number,
  identityMatch: number,
  totalCourtHits: number,
): {
  doc_authenticity: number
  payment_ability: number
  court_records: number
  stability: number
  behavior_signals: number
  info_consistency: number
} {
  // Derive a clean court_records score from objective hit count.
  // Each tier reflects the same severity ranges already used downstream
  // for hard gates (defendant 35 / multi 25 / active 20).
  let courtRecords: number
  if (totalCourtHits === 0)      courtRecords = 95
  else if (totalCourtHits === 1) courtRecords = 50
  else if (totalCourtHits === 2) courtRecords = 25
  else                            courtRecords = 10
  return {
    doc_authenticity: v3.verification,                                                   // verification covers doc auth + identity
    payment_ability: v3.ability_to_pay,                                                  // direct mapping
    court_records: courtRecords,                                                         // derived from objective hit count
    stability: Math.round((v3.ability_to_pay + v3.verification) / 2),                    // stability derived
    behavior_signals: Math.max(0, 100 - behavioralRedFlagCount * 15),                    // more behavioral red flags → lower
    info_consistency: identityMatch,                                                     // identity cross-match score
  }
}

// Databases that legitimately signal tenant payment risk. Everything else —
// notably `onhrt` (Human Rights Tribunal), `oncj`, `oncicb`, `onorb` — must
// NEVER influence a score: those records turn on protected grounds under the
// Ontario Human Rights Code. Both the first and the supplemental court pass
// go through this function; the supplemental pass previously counted every
// name-in-title hit and silently re-admitted them.
const DEBT_RELEVANT_CANLII_DBS = new Set([
  'onltb',    // Landlord & Tenant Board
  'onsc',     // Ontario Superior Court (civil)
  'onscdc',   // Divisional Court (civil appeals)
  'onscsm',   // Small Claims Court
  'onca',     // Court of Appeal (civil)
])

/**
 * Count scoring-eligible court hits, deduped by case identity so the same case
 * found under two spellings of a name (or via two co-applicants) counts once —
 * double counting used to escalate a single case to the "multi" gate (cap 25).
 */
export function countDebtRelevantHits(
  records: { nameInTitle?: boolean; databaseId?: string; caseId?: string; citation?: string; title?: string }[],
): number {
  const seen = new Set<string>()
  for (const r of records || []) {
    if (!r?.nameInTitle) continue
    if (!DEBT_RELEVANT_CANLII_DBS.has((r.databaseId || '').toLowerCase())) continue
    const key = (r.caseId || r.citation || r.title || '').trim().toLowerCase()
    seen.add(key || `anon-${seen.size}`)
  }
  return seen.size
}

// ---------------------------------------------------------------------------
// Gateway-timeout shield (2026-08-22). Cloudflare returns HTTP 524 to the
// browser when the origin has not started its response within ~100 s — and a
// full screening (court lookups + forensics + the read-everything coherence
// review, then streamed scoring) can legitimately take longer than that. The
// backend kept running; the user saw "Scoring failed (HTTP 524)".
//
// Fix: the real handler is unchanged below; POST races it against an 8 s
// timer. Fast outcomes (validation / auth / not-found) keep their real status.
// Anything slower is answered IMMEDIATELY with a 200 whose body is a stream:
// whitespace heartbeats every 10 s (JSON.parse tolerates leading whitespace),
// then the handler's JSON body. A non-2xx handler result is carried inside
// the JSON as {error, __status} — the client checks `data.error` too.
// ---------------------------------------------------------------------------
const STREAM_AFTER_MS = 8_000
const HEARTBEAT_MS = 10_000

export async function POST(req: NextRequest) {
  const work = handleScreenScore(req)
  let timer: ReturnType<typeof setTimeout> | undefined
  const quick = await Promise.race([
    work.then((r) => ({ r })).catch((e) => ({ e })),
    new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), STREAM_AFTER_MS) }),
  ])
  if (quick) {
    if (timer) clearTimeout(timer)
    if ('r' in quick) return quick.r
    return NextResponse.json({ error: String((quick.e as Error)?.message || quick.e).slice(0, 300) }, { status: 500 })
  }
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const hb = setInterval(() => { writer.write(enc.encode(' ')).catch(() => {}) }, HEARTBEAT_MS)
  ;(async () => {
    let payload: string
    try {
      const r = await work
      const text = await r.text()
      if (r.ok) payload = text
      else {
        let j: Record<string, unknown> = {}
        try { j = JSON.parse(text) } catch { /* non-JSON error body */ }
        payload = JSON.stringify({ ...j, error: (typeof j.error === 'string' && j.error) || text.slice(0, 300) || `HTTP ${r.status}`, __status: r.status })
      }
    } catch (e) {
      payload = JSON.stringify({ error: String((e as Error)?.message || e).slice(0, 300), __status: 500 })
    }
    clearInterval(hb)
    try { await writer.write(enc.encode('\n' + payload)) } catch { /* client gone */ }
    try { await writer.close() } catch { /* already closed */ }
  })()
  return new Response(readable, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Stayloop-Stream': 'keepalive' },
  })
}

async function handleScreenScore(req: NextRequest): Promise<Response> {
  try {
    const body = await readJsonBody<{ screening_id?: string }>(req)
    if (!body) return NextResponse.json(INVALID_BODY, { status: 400 })
    const { screening_id } = body
    if (!screening_id || typeof screening_id !== 'string') {
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
    // Screening requires a REGISTERED account (product decision 2026-08-21:
    // the anonymous trial is retired — its gate was client-side only, and
    // anonymous screenings orphaned when the visitor registered). The UI
    // shows a register prompt; this is the server-side enforcement.
    if (userData.user.is_anonymous) {
      return NextResponse.json(
        { error: 'Registration required — create a free account to run a screening. / 筛查需要注册账号（免费）。' },
        { status: 403 },
      )
    }

    const { data: screening, error } = await supabase
      .from('screenings')
      .select('*')
      .eq('id', screening_id)
      .single()

    if (error || !screening) {
      return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
    }

    // Fetch landlord plan separately (landlord_id may be authId or profileId)
    let plan = 'free'
    // All UUIDs this landlord's screenings may be keyed under: legacy rows
    // store landlords.id (profileId), newer rows store auth.users.id (authId).
    let landlordIds: string[] = screening.landlord_id ? [screening.landlord_id] : []
    if (screening.landlord_id) {
      const { data: ll } = await supabase
        .from('landlords')
        .select('id, auth_id, plan')
        .or(`id.eq.${screening.landlord_id},auth_id.eq.${screening.landlord_id}`)
        .maybeSingle()
      if (ll?.plan) plan = ll.plan
      if (ll) {
        landlordIds = Array.from(new Set(
          [screening.landlord_id, ll.id, ll.auth_id].filter(Boolean) as string[]
        ))
      }
    }

    // ---- Quota enforcement for free plan ----
    if (plan === 'free') {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const { count } = await supabase
        .from('screenings')
        .select('id', { count: 'exact', head: true })
        .in('landlord_id', landlordIds)
        .gte('created_at', monthStart)
        .neq('status', 'pending')
        .neq('status', 'error') // failed runs don't consume the allowance — retries were locking users out
      if (count !== null && count >= 5) {
        return NextResponse.json(
          { error: 'Monthly screening limit reached (5/5). Upgrade to Pro for unlimited screenings.' },
          { status: 429 }
        )
      }
    }

    // ---- Live progress -------------------------------------------------
    // Written at each real stage boundary so the client renders ACTUAL
    // pipeline progress instead of a canned animation. Fire-and-forget:
    // progress writes must never block or fail the scoring pipeline.
    const writeProgress = (stage: string, pct: number, detailZh?: string, detailEn?: string) => {
      supabase.from('screenings')
        .update({ progress: { stage, pct, at: new Date().toISOString(), detail_zh: detailZh || null, detail_en: detailEn || null } })
        .eq('id', screening_id)
        .then(() => {}, () => {})
    }
    writeProgress('signing_files', 6)

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
    // Files whose signed URL failed are invisible to BOTH the AI pass and
    // forensics — without disclosure they read as "scanned clean" while
    // never being scanned at all. Surface them in the prompt so coverage
    // and action items reflect reality.
    const unreadableFiles = signedResults.filter(r => !r.url).map(r => r.file.name)

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

    writeProgress('court_and_forensics', 16,
      '并行运行：法院门户当事人检索 + CanLII 网页索引 × 逐文件取证扫描',
      'Running in parallel: court portal party search + CanLII web index × per-file forensics scan')
    // The two branches finish at different times — report each completion so
    // the bar keeps moving instead of sitting at 16% for the whole stage.
    // AWAITED (not fire-and-forget): an in-flight pct-25/34 write racing the
    // later pct-38 'ai_scoring' update could land after it and leave a stale
    // stage in the DB for the whole first-token wait.
    let cfCompleted = 0
    const cfBump = async (zh: string, en: string) => {
      cfCompleted++
      const pct = cfCompleted === 1 ? 25 : 34
      try {
        await supabase.from('screenings')
          .update({ progress: { stage: 'court_and_forensics', pct, at: new Date().toISOString(), detail_zh: zh, detail_en: en } })
          .eq('id', screening_id)
      } catch { /* progress writes must never fail the pipeline */ }
    }
    // ---- Stage 2b: AI document coherence review (concurrent) ----
    // Reads every document as a whole and lists contradictions with
    // verbatim evidence — the pass two human reviewers did by eye on case
    // 24 and the rules could not. Runs alongside court + forensics so it
    // adds no latency; its findings feed the scoring prompt below.
    const coherenceModel = await getModelForUser('screening', userData.user.id)
    const coherenceDef = (await getModelDefAsync(coherenceModel)) ?? getModelDef(DEFAULT_MODELS.screening)!
    const coherencePromise: Promise<CoherenceReview> = runCoherenceReview({
      contentBlocks,
      model: coherenceDef,
      applicant: {
        name: nameForLookup || null,
        phone: phoneMatch ? `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}` : null,
        email: emailMatch ? emailMatch[0].toLowerCase() : null,
      },
    }).catch((e): CoherenceReview => ({ status: 'failed', model: coherenceModel, anomalies: [], documents: [], error: String(e?.message || e).slice(0, 200), elapsed_ms: 0 }))

    const [courtDetail, forensicsReport, coherence] = await Promise.all([
      runCourtRecordCheck(nameForLookup, plan).then(async r => {
        await cfBump('法庭库检索完成 · 等待文件取证收尾', 'Court search done · finishing document forensics')
        return r
      }),
      runForensics(forensicsInput).then(async r => {
        await cfBump('文件取证完成：PDF 指纹 × 工资单数学 × 法定扣缴复算', 'Forensics done: PDF fingerprints × paystub math × statutory deductions')
        return r
      }).catch(async (e): Promise<ForensicsReport> => {
        // Failure still advances the progress counter — otherwise the bar
        // freezes at 25 with a "finishing forensics" message for a branch
        // that already died.
        await cfBump('文件取证异常 · 已使用降级结果继续', 'Forensics errored · continuing with fallback result')
        return {
          per_file: [],
          cross_doc: { entities: { phones: [], emails: [], addresses: [], names: [], employers: [], deposit_amounts: [] }, unique_phones: 0, hr_phone_collision: false, deposit_paystub_perfect_match: false },
          cross_doc_flags: [],
          all_flags: [{ code: 'forensics_init_error', severity: 'low', evidence_en: `Forensics aborted: ${e?.message || e}`, evidence_zh: `取证模块启动失败：${e?.message || e}` }],
          hard_gates: [],
          severity: 'clean',
          elapsed_ms: 0,
          schema_version: 1,
        }
      }),
      coherencePromise,
    ])

    // Employment start vs employer incorporation (2026-08-22, case 25): the
    // letter says "Start Date: September 3, 2024" while the federated registry
    // shows Cashew Corp. incorporated 2026-04-21 — employment cannot predate
    // the employer. Both facts were already on the report, on different pages;
    // nothing compared them. Deterministic: registry date × the coherence
    // review's extracted employment_start (employment letters / forms).
    const earlyRedFlags: string[] = []
    try {
      const reg = forensicsReport.employer_registry || []
      const starts = (coherence.status === 'ok' ? coherence.documents : [])
        .map(d => ({ file: d.file, kind: d.kind, start: d.key_facts.employment_start, employer: d.key_facts.employer || '' }))
        .filter(d => d.start && /^\d{4}-\d{2}-\d{2}$/.test(d.start))
      for (const r of reg) {
        if (!r.incorporation_date || !/^\d{4}-\d{2}-\d{2}/.test(r.incorporation_date)) continue
        const inc = Date.parse(r.incorporation_date.slice(0, 10))
        for (const d of starts) {
          const st = Date.parse(d.start as string)
          const sameEmployer = !d.employer || d.employer.toLowerCase().split(/\s+/)[0] === r.employer.toLowerCase().split(/\s+/)[0]
          if (!sameEmployer || !Number.isFinite(inc) || !Number.isFinite(st)) continue
          const daysBefore = Math.round((inc - st) / 86_400_000)
          if (daysBefore > 90) {
            forensicsReport.all_flags.push({
              code: 'employment_predates_incorporation',
              severity: 'high',
              file: d.file,
              evidence_en: `"${d.file}" states employment with ${r.employer} from ${d.start}, but the business registry shows ${r.matched_name} incorporated on ${r.incorporation_date.slice(0, 10)} — ${daysBefore} days later. A company cannot employ anyone before it exists (a predecessor sole proprietorship is possible — ask for proof: T4s, CRA NOA, or the predecessor's business registration).`,
              evidence_zh: `"${d.file}" 称自 ${d.start} 起受雇于 ${r.employer}，但企业登记显示 ${r.matched_name} 成立于 ${r.incorporation_date.slice(0, 10)}——晚了 ${daysBefore} 天。公司不可能在成立之前雇人（若有前身个体户需提供证明：T4、CRA NOA 或前身的商业登记）。`,
            })
          }
        }
      }
    } catch { /* never fatal */ }

    await supabase.from('screenings').update({
      court_records_detail: courtDetail,
      forensics_detail: forensicsReport,
      tier: (plan === 'pro' || plan === 'team') ? 'pro' : 'free',
      status: 'scoring',
      progress: { stage: 'ai_scoring', pct: 38, at: new Date().toISOString(), detail_zh: '文件 + 取证结果已送入 AI · 等待首个输出', detail_en: 'Documents + forensics sent to AI · awaiting first output' },
    }).eq('id', screening_id)

    // ---- Stage 3: Build v3 Claude prompt ----
    const formText = `LANDLORD-PROVIDED CONTEXT:
Tenant name (from form): ${nameForLookup || 'unknown'}
IMPORTANT: If you see MULTIPLE ID documents for DIFFERENT people, extract ALL their full names into extracted_names[]. The backend will run court record searches for EACH name.
Monthly rent: $${monthlyRent || 'N/A'}
Self-reported income: $${monthlyIncome || 'N/A'}/mo${incomeRatio ? ` (ratio ${incomeRatio.toFixed(2)}x)` : ''}
Landlord notes: ${screening.notes || 'N/A'}

Uploaded: ${files.length === 0 ? 'NONE' : files.map(f => `${formatKind(f.kind)}(${f.name})`).join(', ')}
${unreadableFiles.length > 0 ? `WARNING — ${unreadableFiles.length} file(s) could NOT be read (storage error): ${unreadableFiles.join(', ')}. These files were NOT analyzed and NOT scanned by forensics. Mark affected sub-components action_pending and add an action item to re-upload them. Do not describe them as verified or clean.` : ''}
NOTE: When you see "bundle [A + B + C]" above, ONE PDF file contains MULTIPLE document kinds. Look inside that single attachment for ALL listed kinds — do NOT report them as missing just because they share a filename.

COURT RECORD LOOKUP (Ontario Courts Portal party search + CanLII web-index mention scan; the LTB Order Catalogue runs deterministically after scoring):
${courtDetail.queries.filter(q => q.tier === 'free').map(q => `  - ${q.source}: ${q.status === 'ok' ? (q.hitKind === 'mention' ? `${q.hits} page mention(s) — NOT party records, display-only, never scored` : `${q.hits} hit(s)`) : q.status}${q.note ? ` (${q.note})` : ''}`).join('\n')}
${courtDetail.records.length > 0 ? `\nCANLII MATCHED CASES (verify name collision is not a false positive — common names can false-match):\n${courtDetail.records.slice(0, 8).map(r => `  · [${r.databaseName || r.databaseId}] ${r.title} — ${r.citation}`).join('\n')}` : ''}
${(courtDetail.portal_records?.length || 0) > 0 ? `\nONTARIO COURTS PORTAL CASES (Civil & Small Claims Court — direct from courts.ontario.ca):\n${courtDetail.portal_records!.slice(0, 8).map(r => `  · [${r.courtAbbreviation}] ${r.caseTitle} — ${r.caseNumber} (${r.partyRole}, filed ${r.filedDate ? new Date(r.filedDate).toLocaleDateString('en-CA') : 'unknown'}, ${r.closedFlag ? 'Inactive' : 'Active'})`).join('\n')}` : ''}
${courtDetail.total_hits === 0 ? '\nNo party-record hits in the Ontario Courts Portal for this applicant name (the sources listed above are what was actually searched).' : ''}

COURT RECORD RULES — READ CAREFULLY:
- CanLII web-index results are MENTIONS of the name on decision pages (counsel, adjudicators and strangers share names). They carry ZERO weight: never move any score, never trigger any gate, never cite them as tenant risk. At most, note them for the landlord to read.
- Ontario Courts Portal matches are NAME-ONLY: the portal carries no DOB or address, so a match may be a different person with the same name. Do NOT emit any court/LTB hard gate yourself — the backend derives court and LTB gates deterministically from corroborated records only. Describe portal matches in reviewer_note/action_items as "records matching the applicant's name — verify identity with the applicant", in allegation language.
- A court FILING has no outcome attached. NEVER state that the person defaulted, was evicted, owes money, or lost a case — a record proves only that a proceeding named someone with this name.
- Portal cases where the name appears as PLAINTIFF are the person exercising their own rights — neutral, never a risk signal. Human Rights Tribunal matters are protected — never scored.
- The LTB Order Catalogue search runs AFTER your scoring pass, deterministically. Do not mark ltb_check "measured" yourself; if portal defendant-side records exist, mark ltb_check "action_pending" with an identity-verification action item.
- If no prior landlord reference → prior_landlord_refs "action_pending"
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
2. credit_health (25%) — credit score (15%), non-rent DTI ratio (10%) — DTI here is NON-RENT monthly debt (credit cards, car loans, student loans, lines of credit) divided by gross monthly income. Do NOT include rent in this DTI; rent burden is already counted under ability_to_pay.income_rent_ratio.
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

CROSS-DOCUMENT EVIDENCE VERIFICATION — MANDATORY (fill "cross_doc_verification" in the output JSON):
1. BANK ACCOUNT OWNERSHIP — for EVERY bank statement, emit {holder_name, entity_type: personal|business, is_applicant, statement_period}. is_applicant=true ONLY when the account holder name matches the applicant's name. A BUSINESS account, or ANY account whose holder ≠ applicant, MUST NOT be treated as evidence of the applicant's personal income — and details_en/details_zh.ability_to_pay MUST name it explicitly (e.g. "submitted statement is a business account of NLMA AUTO INC., not the applicant's personal account" / "提交的流水为 NLMA AUTO INC. 企业账户，非申请人个人账户").
2. INCOME CORROBORATION — in PERSONAL accounts only, look for RECURRING payroll deposits within ±25% of the claimed monthly income. Emit {claimed_monthly, personal_payroll_seen, observed_pattern, verdict: corroborated|partial|uncorroborated, detail}. If no personal payroll trail exists, verdict=uncorroborated and detail states plainly what WAS observed (e.g. "only a business account receiving ~$18,194/mo from the employer, then transferring $2,000/mo to the applicant"). When verdict=uncorroborated: ability_to_pay MUST NOT exceed 60 and income_stability sub_coverage MUST be "action_pending" (backend enforces both).
3. RELATED-PARTY SIGNALS — compare (a) employment-letter signatory name/surname vs applicant name, (b) applicant email alias vs signatory/company name, (c) supervisor name on the application vs signatory, (d) employer address vs bank-statement entity address, (e) applicant listed as owner/director, (f) the credit report's Employment section vs the claimed employer — if the bureau lists the claimed employer as PREVIOUS (or lists a different current employer), that is an independent signal the employment claim is stale or false; name it explicitly in details. Emit {suspected, signals[]}. 2 or more signals → suspected=true, AND details_en/details_zh.verification MUST name the specific people and signals (e.g. "letter signed by Sia Allas (Director/Owner); applicant email alias 'allas' shares the surname; supervisor is Siavash Allas") and state that the income claim comes from a non-arm's-length party and requires independent proof (CRA NOA / T4 or personal-account payroll deposits).
4. APPLICATION SUMMARY — from the rental application form (OREA 410 or similar) extract {applying_rent, prev_residences: [{address, period, landlord_name, landlord_phone}], vacating_reason, vehicles[], blank_sections[]}. blank_sections lists form sections left EMPTY (e.g. bank information, financial obligations, personal references).
5. VERIFICATION CHECKLIST — 3-6 concrete steps the landlord can execute TODAY, each citing the exact names and phone numbers found in the documents (e.g. "Call current landlord Eithar Naman 647-563-9100 to verify the 2023-2026 tenancy and payment record", "Request CRA Notice of Assessment or 3 months of PERSONAL-account statements", "Call the employer's letterhead main line — not the letter signatory's cell — to confirm employment"). Include a phone number whenever one appears in the documents.
6. SUSPICIOUS FUND FLOWS — any transfer in the statements whose counterparty matches a person named on the application (current/previous landlord, the applicant) goes into suspicious_transfers[] with amount and match (e.g. "business account sent $4,000 e-Transfer to 'eithar' — matches current landlord's first name; rent apparently paid by the company: a positive stability signal but also evidence of commingled personal/business funds").
If a sub-object has no source document (no bank statement, no application form), emit null for that sub-object (or [] for arrays) — NEVER invent data. When rules 1-3 fire, the ability_to_pay and verification entries in details_en/details_zh MAY exceed the SPEED length caps (up to 30 English words / 45 Chinese chars) — naming the specific entities takes precedence over brevity.

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
- detected_document_kinds (subset of [lease, employment_letter, pay_stub, bank_statement, id_document, credit_report, offer_letter, reference, other])
- bank_min_balance (number or null) — if bank statements present, lowest closing balance seen
- identity_match_score (0-100) — cross-doc name/DOB/address consistency; if only 1 doc, return null
- credit_report: TRANSCRIBE (do not invent) the uploaded consumer credit report. Set present=false and leave all other fields null/empty if NO genuine credit report was uploaded or it is illegible. When present: read the score, bureau, and report date; list every tradeline (up to 20), every collection, every bankruptcy/insolvency, and recent inquiries (up to 12) EXACTLY as printed. Copy dollar amounts and dates verbatim; use null for any field not legible. NEVER fabricate accounts or a score. If the document is a fake/edited credit report, still transcribe what is shown but ALSO trigger the credit_report_ai_judged_fake flag.

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
 "credit_report":{"present":<true ONLY if a GENUINE consumer credit report (Equifax/TransUnion/SingleKey/FrontLobby/Borrowell) was uploaded; else false>,"bureau":"Equifax|TransUnion|Dual|other|null","credit_score":<300-900 integer or null>,"score_band":"Poor|Fair|Good|Very Good|Excellent|null","report_date":"YYYY-MM-DD or as shown or null","employment":{"current":"employer name as printed in the report's Employment section or null","previous":"or null"},"tradelines":[{"creditor":"","type":"Revolving|Installment|Open|Mortgage|Lease|other","date_opened":"","responsibility":"Individual|Joint|Authorized|null (the account responsibility/association column as printed)","balance":<number or null>,"credit_limit":<the ASSIGNED limit as printed, or null — distinct from high_credit>,"high_credit":<highest balance carried, or null>,"past_due":<number or null>,"payment_status":"","late_30_60_90":"0/0/0"}],"collections":[{"creditor":"","date_assigned":"","original_amount":<number or null>,"balance":<number or null>}],"bankruptcies":[{"date_filed":"","type":"","amount":<number or null>,"disposition":""}],"inquiries":[{"date":"","creditor":""}],"total_debt":<number or null>,"monthly_debt_payments":<number or null>},
 "cross_doc_verification":{"bank_accounts":[{"holder_name":"","entity_type":"personal|business","is_applicant":<bool — true ONLY if holder name matches applicant>,"statement_period":"as shown or null"}],"income_corroboration":{"claimed_monthly":<number or null>,"personal_payroll_seen":<bool>,"observed_pattern":"≤25 words — what deposits ACTUALLY recur","verdict":"corroborated|partial|uncorroborated","detail":"≤35 words, plain truth"},"related_party":{"suspected":<bool>,"signals":["one signal per entry, name the people"]},"employment_letter_signatory":{"name":"the person who SIGNED the employment/offer letter, exactly as signed, or null","title":"their printed title beside the signature (e.g. Director/Owner, HR Manager) or null"},"application_summary":{"applying_rent":<number or null>,"prev_residences":[{"address":"","period":"","landlord_name":"","landlord_phone":""}],"vacating_reason":"as stated or null","vehicles":["..."],"blank_sections":["form sections left empty"]},"suspicious_transfers":["amount + counterparty + which application name it matches"],"verification_checklist":["3-6 executable steps, include phone numbers found in docs"]},
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
- NEVER put an ASCII double quote (") inside a string value — not around names, titles or quoted phrases. Use 「」 / 『』 in Chinese and single quotes ' in English instead (e.g. 作者「Johnson Osei」, author 'Johnson Osei'). If you must, escape it as \\"
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
    userContent.push({
      type: 'text',
      text: '\n--- INDEPENDENT DOCUMENT COHERENCE REVIEW (AI, read-everything pass; verify-first) ---\n' +
        coherenceToPromptBlock(coherence) +
        '\n\nThese anomalies were found by a separate examiner reading all documents side by side. ' +
        'Treat CRITICAL/HIGH anomalies as unresolved contradictions: reflect them in the affected dimension\'s details, ' +
        'add a concrete action_item for each, and do NOT describe a document as genuine/verified/excellent while a critical anomaly about it stands. ' +
        'Do not restate them as settled fact — they are contradictions to resolve, not findings of fraud.',
    })
    if (contentBlocks.length > 0) {
      userContent.push({ type: 'text', text: '\n--- UPLOADED DOCUMENTS ---\n' })
      userContent.push(...contentBlocks)
    }

    // Admin-configurable model slot (60s edge cache) + per-user preference —
    // see lib/modelConfig.ts. Any vision-capable catalogue model may serve this
    // slot (2026-08-22); llmChatStream converts documents/images per provider
    // and streams text deltas so the progress bar reflects real generation.
    const scoringModel = await getModelForUser('screening', userData.user.id)
    const scoringDef = (await getModelDefAsync(scoringModel)) ?? getModelDef(DEFAULT_MODELS.screening)!

    // ---- Consume the SSE stream, reporting real generation progress ----
    // The v3 schema keys are emitted in a fixed order, so the most recent
    // key seen in the accumulated text tells us exactly which section the
    // model is generating right now — real reasoning progress, not canned.
    const SECTION_LABELS: Array<[string, string, string]> = [
      ['"court_summary', '评估法庭记录风险', 'Assessing court-record risk'],
      ['"summary_', '撰写总体评估结论', 'Writing the overall assessment'],
      ['"compliance_audit"', 'OHRC 合规审计（受保护特征零使用核查）', 'OHRC compliance audit (protected-grounds check)'],
      ['"action_items"', '生成待办核实清单', 'Building the verification to-do list'],
      ['"red_flags"', '汇总风险标记', 'Compiling risk flags'],
      ['"hard_gates_triggered"', '检查欺诈硬门槛', 'Checking fraud hard gates'],
      ['"details_', '撰写五维评分依据', 'Writing per-dimension evidence'],
      ['"scores"', '五维风险评分中', 'Scoring the five risk dimensions'],
      ['"cross_doc_verification"', '跨文档证据核验：户名 × 工资入账 × 利益相关方', 'Cross-doc verification: account holders × payroll trail × related parties'],
      ['"tradelines"', '逐条转录信用账户（tradelines）', 'Transcribing credit tradelines'],
      ['"credit_report"', '读取并转录信用报告', 'Reading & transcribing the credit report'],
      ['"detected_monthly_income"', '核算收入证据', 'Reconciling income evidence'],
      ['"extracted_names"', '提取申请人身份信息', 'Extracting applicant identities'],
    ]
    const sniffSection = (text: string): [string, string] => {
      let best: [string, string] = ['深度阅读全部文件', 'Deep-reading all documents']
      let bestIdx = -1
      for (const [key, zh, en] of SECTION_LABELS) {
        const i = text.lastIndexOf(key)
        if (i > bestIdx) { bestIdx = i; best = [zh, en] }
      }
      return best
    }

    // Expected output length: lean v3 is ~2k tokens (~8k chars); credit
    // transcription can push past that, so treat 9k chars as the 95% mark
    // and clamp — the bar can pause at ~71 but never runs backwards.
    const EXPECTED_CHARS = 9000
    let rawText = ''
    let stopReason = ''
    let streamError: string | null = null
    let sawMessageStop = false
    let lastProgressWrite = 0
    try {
      // One automatic retry when the stream ends without a clean stop (mid-
      // stream provider error / dropped connection) — seen 2026-08-22 as an
      // "AI parse error" on a JSON cut at ~8k chars with no max_tokens.
      let streamed!: Awaited<ReturnType<typeof llmChatStream>>
      for (let attempt = 1; attempt <= 2; attempt++) {
        streamed = await llmChatStream({
        model: scoringDef,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        // Temperature 0 = deterministic scoring. Same documents should
        // produce the same scores every time (omitted automatically on
        // models that reject sampling params).
        temperature: CLAUDE_TEMPERATURE,
        // Lean v3 output is ~2k tokens, but transcribing a full credit
        // report (tradelines + collections + inquiries) can add several k,
        // so give generous headroom to avoid mid-report truncation.
        maxTokens: CLAUDE_MAX_TOKENS,
        jsonMode: true,
        onText: (acc) => {
          const now = Date.now()
          if (now - lastProgressWrite > 1200 && acc.length > 0) {
            lastProgressWrite = now
            const pct = 38 + Math.round(Math.min(0.95, acc.length / EXPECTED_CHARS) * 35)
            const [zh, en] = sniffSection(acc)
            writeProgress('ai_scoring', pct, `${zh} · 已生成 ${acc.length.toLocaleString()} 字符`, `${en} · ${acc.length.toLocaleString()} chars generated`)
          }
        },
      })
        if (streamed.sawStop && !streamed.streamError) break
        console.warn(`[screen-score] scoring stream ended unclean (attempt ${attempt}): sawStop=${streamed.sawStop} streamError=${streamed.streamError} stop=${streamed.stopReason} chars=${streamed.text.length}`)
        if (attempt === 1) writeProgress('ai_scoring', 40, '模型流中断,自动重试一次…', 'Model stream interrupted — retrying once…')
      }
      rawText = streamed.text
      stopReason = streamed.stopReason
      streamError = streamed.streamError
      sawMessageStop = streamed.sawStop
    } catch (e) {
      const errText = e instanceof Error ? e.message : String(e)
      await supabase.from('screenings').update({ status: 'error', error: errText.slice(0, 500) }).eq('id', screening_id)
      return NextResponse.json({ error: `Model API error (${scoringDef.id}): ${errText.slice(0, 300)}` }, { status: 500 })
    }
    // A mid-stream error means the output is incomplete — fail the screening
    // loudly rather than salvage-parsing a partial report. (A message_stop
    // after the error would mean the stream actually completed; keep it.)
    if (streamError && !sawMessageStop) {
      const errMsg = `Model stream error after ${rawText.length} chars: ${streamError}`
      await supabase.from('screenings').update({ status: 'error', error: errMsg }).eq('id', screening_id)
      return NextResponse.json({ error: errMsg }, { status: 500 })
    }
    if (!rawText) rawText = '{}'
    writeProgress('post_processing', 72, '解析评分 · 应用硬门槛与扣分 · 复核合规', 'Parsing scores · applying hard gates & penalties · compliance review')

    // Robust JSON extractor — survives four common Claude failure modes:
    // (1) markdown code fence wrapping, (2) trailing commas before ] or },
    // (3) truncation mid-string (unclosed quote at end of output),
    // (4) truncation mid-field (output ends right after a value with no
    //     closing bracket). For (3) and (4) we salvage by walking back to
    //     the last known-good field and closing the outer braces ourselves.
    function extractJson(input: string): string {
      let t = input.trim()
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      // (0) Unescaped ASCII quotes inside string values (e.g. a person name
      // copied from forensics metadata: 由个人作者"Johnson Osei."用Excel制作)
      // broke every other scoring of case 24 on 2026-08-22 — repair first.
      try { JSON.parse(t); return t } catch {}
      t = repairUnescapedQuotes(t)
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
        stream_diag: { saw_stop: sawMessageStop, stream_error: streamError, chars: rawText.length, model: scoringDef.id },
        // Diagnostic (2026-08-22): the full raw model output, so a malformed /
        // cut stream can be inspected without server-log access. Own data only.
        raw_full: rawText,
        raw: rawText.slice(0, 4000),
      }, { status: 500 })
    }

    // A max_tokens stop means the JSON was cut off mid-stream. extractJson's
    // salvage pass can still hand back parseable JSON by closing the open
    // brackets — but every field the model had not emitted yet is simply
    // GONE, and the fields it emits last are the ones carrying negative
    // signal (flags, hard gates, the compliance audit). Accepting that
    // salvage produced a report that reads CLEAN because the model ran out of
    // room, and persisted it as a completed screening. Truncation is now
    // fatal unless every integrity-bearing section survived.
    if (stopReason === 'max_tokens') {
      const REQUIRED_ON_TRUNCATION = [
        'scores', 'flags', 'hard_gates_triggered', 'compliance_audit',
        'sub_coverage', 'action_items', 'summary_zh', 'summary_en',
      ] as const
      const missing = REQUIRED_ON_TRUNCATION.filter((k) => parsed[k] === undefined)
      if (missing.length > 0) {
        await supabase.from('screenings').update({
          status: 'error',
          error: `AI output truncated — missing: ${missing.join(', ')}`.slice(0, 200),
        }).eq('id', screening_id)
        return NextResponse.json({
          error: 'AI output was truncated — please retry (the model produced too much text).',
          stop_reason: stopReason,
          missing_sections: missing,
        }, { status: 500 })
      }
    }

    const s: V3Scores = parsed.scores || {}
    // 2026-06-02 P0 — Validate AND clamp all 5 dimensions. Previously only
    // ability_to_pay was checked; if Sonnet omitted another dim or returned
    // non-numeric (string / null / NaN / 150), baseScore arithmetic produced
    // NaN that propagated through the entire score, gate, and tier logic.
    // `communication` is deliberately NOT here. The rubric does not use it (see
    // lib/screening/rubric.ts — nothing in a pile of PDFs measures how a person
    // communicates, and it returned 52–55 on every run of every applicant), so
    // failing an entire screening because the model omitted it would be failing
    // on a field that changes no outcome. It is still clamped below if present.
    const ALL_V3_DIMS: Array<keyof V3Scores> = [
      'ability_to_pay', 'credit_health', 'rental_history', 'verification',
    ]
    for (const k of ALL_V3_DIMS) {
      const v = (s as any)[k]
      if (typeof v !== 'number' || !isFinite(v)) {
        await supabase.from('screenings').update({
          status: 'error',
          error: `Missing or invalid v3 score: ${k}`,
        }).eq('id', screening_id)
        return NextResponse.json({ error: `Missing or invalid v3 score: ${k}`, raw: text }, { status: 500 })
      }
      // Clamp to the legal 0-100 range. Sonnet occasionally emits values
      // outside this (e.g. 150 when a dimension is described as "well above
      // typical", or -20 when "negative signal"). The downstream weighted
      // sum + hard gates assume 0-100; out-of-range inputs corrupt them.
      ;(s as any)[k] = Math.max(0, Math.min(100, Math.round(v)))
    }
    // Non-fatal: normalise communication if the model sent it, default it if not.
    s.communication = typeof s.communication === 'number' && isFinite(s.communication)
      ? Math.max(0, Math.min(100, Math.round(s.communication)))
      : 0

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
      'paystub_deduction_exceeds_legal_max', // YTD CPP/EI above CRA annual max — impossible on a real stub
      // 2026-06-02 — When Claude Vision confirms the file is not actually a
      // bureau report, its verdict supersedes the cheap regex. The regex
      // flag is removed by forensics-index.ts in that path, so we treat
      // the AI flag as the canonical "credit report is fake" signal.
      'credit_report_ai_judged_fake',      // Claude Vision: not a genuine bureau report
      // Kept as a fallback for when the AI judge fails to run (e.g. API
      // outage). In normal operation the regex flag gets superseded by
      // the AI flag — either it's removed (AI says authentic) or it's
      // removed AND replaced by credit_report_ai_judged_fake (AI says fake).
      'credit_report_no_bureau_markers',   // no Equifax AND no TransUnion markers
      'bank_producer_mismatch',            // bank text but wrong PDF Producer
      // A file created months/years BEFORE the date it prints for itself is
      // a reused template with the figures changed (case 24: 2026 stubs
      // created in 2023, a 2026 letter created in 2024).
      'pdf_created_before_document_date',
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

    // Documents judged forged, counted before the dimension mapping. The rubric
    // used to be handed `dimsZeroed.length` for this, which counts DIMENSIONS —
    // so one forged credit report was reported to the landlord as "2
    // document(s)", and a forged file of a kind with no KIND_TO_ZERO_DIMS entry
    // counted as zero and never reached the rubric's decline rule at all.
    let forgedDocCount = 0

    for (const pf of forensicsReport.per_file) {
      const isForged = pf.flags.some(f =>
        f.severity === 'critical' || (f.severity === 'high' && FORGERY_INDICATING_CODES.has(f.code))
      )
      if (!isForged) continue
      forgedDocCount++
      // file_kind can be a comma-joined bundle ("employment_letter,pay_stub") —
      // exact-match lookup made bundled forgeries count without annotating any
      // dimension. First listed kind with a mapping wins.
      const dims = (pf.file_kind || '').split(',')
        .map(k => KIND_TO_ZERO_DIMS[k.trim()])
        .find(Boolean)
      if (!dims) continue
      // Pick the most severe flag as the explanation
      const top = [...pf.flags].sort((a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9))[0]
      const kindEn = KIND_LABEL_EN[pf.file_kind] || pf.file_kind.replace('_', ' ')
      const kindZh = KIND_LABEL_ZH[pf.file_kind] || pf.file_kind
      // Wording deliberately does NOT claim a number. Under the rubric the
      // dimension is not forced to 0 — forgery is priced by its own rules
      // (document_forged −50 on verification, decline band) — and a real
      // report shipped saying "维度被置零" beside a score of 30. The note
      // states the fact (the evidence is forged); the rules state the price.
      const reason: DimZeroReason = {
        en: `The underlying ${kindEn} (${pf.file_name}) was determined to be forged and cannot support this dimension. ${top.evidence_en}`,
        zh: `作为依据的${kindZh}文件（${pf.file_name}）被判定为伪造，不能作为本维度的证据。${top.evidence_zh}`,
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

    // 2026-06-02 — Forgery cascade removed.
    // Previously: if ANY document was forged, we zeroed every dimension that
    // depends on uploaded evidence ("all 5 dimensions = 0, banner: all files
    // untrusted"). Real-world feedback: that wipes out useful AI judgment on
    // dimensions whose evidence WASN'T forged (e.g. a clean CanLII rental
    // history doesn't get invalidated because a credit report was fabricated).
    //
    // New behavior: only the specific dimension whose underlying evidence
    // file was forged is zeroed (handled in the loop below via
    // KIND_TO_ZERO_DIMS). Other dimensions retain their AI scores. The fraud
    // is still surfaced loudly — `doc_tampering` is forced into hard_gates
    // a few lines below (which caps overall at 55), critical/high forensics
    // flags stack into red_flags / penalty, and `forensics_zeroed_dims` is
    // returned in the response so the UI can show a top-level
    // "⚠ 检测到文件造假" warning banner above the per-dimension breakdown.

    for (const [dim, reason] of Object.entries(dimZeroReasons) as Array<[keyof V3Scores, DimZeroReason]>) {
      s[dim] = 0
      detailsEn[dim] = reason.en
      detailsZh[dim] = reason.zh
      dimsZeroed.push(dim)
    }
    parsed.details_en = detailsEn
    parsed.details_zh = detailsZh

    // ---- Stage 3.6: Cross-document verification enforcement -----------
    // The prompt asks the model to fill cross_doc_verification (bank account
    // ownership, income corroboration, related-party signals, application
    // summary, verification checklist, suspicious fund flows). Sanitize the
    // block here — null-tolerant, never trust shape — then enforce the two
    // deterministic rules the prompt states the backend enforces:
    //   1. income_corroboration.verdict === 'uncorroborated' → ability_to_pay
    //      capped at 60 (a claimed income with NO personal-account payroll
    //      trail is not verified income).
    //   2. same verdict → income_stability sub-coverage downgraded to
    //      action_pending so evidence_coverage reflects the gap.
    const crossDocVerification: CrossDocVerification | null = (() => {
      const raw: any = (parsed as any).cross_doc_verification
      if (!raw || typeof raw !== 'object') return null
      const str = (v: any) => (typeof v === 'string' ? v : '')
      const strOrNull = (v: any) => (typeof v === 'string' && v.trim() ? v : null)
      const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null)
      const strArr = (a: any, max: number) =>
        (Array.isArray(a) ? a : []).filter((x: any) => typeof x === 'string' && x.trim()).slice(0, max)

      const bankAccounts = (Array.isArray(raw.bank_accounts) ? raw.bank_accounts : [])
        .slice(0, 10)
        .map((b: any) => ({
          holder_name: str(b?.holder_name),
          entity_type: (b?.entity_type === 'business' ? 'business' : 'personal') as 'personal' | 'business',
          is_applicant: b?.is_applicant === true,
          statement_period: strOrNull(b?.statement_period),
        }))
        .filter((b: { holder_name: string }) => b.holder_name)

      const ic = raw.income_corroboration
      const VERDICTS = new Set(['corroborated', 'partial', 'uncorroborated'])
      // Fail CLOSED on an unrecognized verdict. Previously any string outside
      // the enum ("unverified", "not corroborated", "none") nulled this block,
      // which silently dropped the ability_to_pay cap below — an off-enum word
      // from the model turned an UNVERIFIED income into an unpenalized one.
      const normVerdict = (v: unknown): 'corroborated' | 'partial' | 'uncorroborated' | null => {
        if (typeof v !== 'string') return null
        const k = v.trim().toLowerCase().replace(/[\s-]+/g, '_')
        if (VERDICTS.has(k)) return k as 'corroborated' | 'partial' | 'uncorroborated'
        if (/^(partial|partially)/.test(k)) return 'partial'
        return 'uncorroborated'
      }
      const icVerdict = ic && typeof ic === 'object' ? normVerdict(ic.verdict) : null
      const incomeCorroboration = (ic && typeof ic === 'object' && icVerdict)
        ? {
            claimed_monthly: num(ic.claimed_monthly),
            personal_payroll_seen: ic.personal_payroll_seen === true,
            observed_pattern: str(ic.observed_pattern),
            verdict: icVerdict,
            detail: str(ic.detail),
          }
        : null

      const rp = raw.related_party
      const relatedParty = (rp && typeof rp === 'object')
        ? { suspected: rp.suspected === true, signals: strArr(rp.signals, 8) }
        : null

      const ap = raw.application_summary
      const applicationSummary = (ap && typeof ap === 'object')
        ? {
            applying_rent: num(ap.applying_rent),
            prev_residences: (Array.isArray(ap.prev_residences) ? ap.prev_residences : [])
              .slice(0, 6)
              .map((p: any) => ({
                address: str(p?.address),
                period: str(p?.period),
                landlord_name: str(p?.landlord_name),
                landlord_phone: str(p?.landlord_phone),
              }))
              .filter((p: { address: string; landlord_name: string }) => p.address || p.landlord_name),
            vacating_reason: strOrNull(ap.vacating_reason),
            vehicles: strArr(ap.vehicles, 5),
            blank_sections: strArr(ap.blank_sections, 10),
          }
        : null

      const suspiciousTransfers = strArr(raw.suspicious_transfers, 10)
      const verificationChecklist = strArr(raw.verification_checklist, 8)

      // Empty across the board → treat as absent so old-report semantics hold.
      if (
        bankAccounts.length === 0 && !incomeCorroboration && !relatedParty &&
        !applicationSummary && suspiciousTransfers.length === 0 && verificationChecklist.length === 0
      ) return null

      // Who signed the employment letter — the input deep-check's arm's-length
      // verification was missing (see CrossDocVerification type doc).
      const rawSig = raw.employment_letter_signatory
      const signatory = rawSig && typeof rawSig === 'object'
        ? {
            name: typeof rawSig.name === 'string' && rawSig.name.trim() ? rawSig.name.trim().slice(0, 120) : null,
            title: typeof rawSig.title === 'string' && rawSig.title.trim() ? rawSig.title.trim().slice(0, 120) : null,
          }
        : null

      return {
        bank_accounts: bankAccounts,
        income_corroboration: incomeCorroboration,
        related_party: relatedParty,
        employment_letter_signatory: signatory,
        application_summary: applicationSummary,
        suspicious_transfers: suspiciousTransfers,
        verification_checklist: verificationChecklist,
      }
    })()

    // Deterministic backstop for the rule the prompt states but the model is
    // free to ignore: a business account is not a personal payroll trail. If
    // every account we saw belongs to a business (or to someone other than the
    // applicant) and no personal payroll was observed, the income claim is
    // uncorroborated no matter what verdict the model wrote.
    const cdvAccounts = crossDocVerification?.bank_accounts ?? []
    if (crossDocVerification?.income_corroboration && cdvAccounts.length > 0) {
      const hasPersonalApplicantAccount = cdvAccounts.some(
        (b) => b.entity_type === 'personal' && b.is_applicant,
      )
      if (!hasPersonalApplicantAccount && !crossDocVerification.income_corroboration.personal_payroll_seen) {
        crossDocVerification.income_corroboration.verdict = 'uncorroborated'
      }
    }

    if (crossDocVerification?.income_corroboration?.verdict === 'uncorroborated') {
      // Rule 1 — payment ability can't score above 60 on unverified income.
      s.ability_to_pay = Math.min(s.ability_to_pay, 60)
      // Rule 2 — the income_stability evidence grade drops to action_pending
      // (unless the model already marked it missing, which is stricter).
      const rawSubCovPre: Record<string, string> =
        (parsed.sub_coverage && typeof parsed.sub_coverage === 'object') ? parsed.sub_coverage : {}
      if (rawSubCovPre.income_stability !== 'missing') {
        rawSubCovPre.income_stability = 'action_pending'
      }
      parsed.sub_coverage = rawSubCovPre
    }

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
      // Forensics conjunction gate: fabrication-tool producer on a financial
      // doc + batch-created cluster. Deterministic proof → tighter than the
      // visual doc_tampering (55).
      pdf_fabrication_tool: 45,
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

    // Model-supplied. An unrecognised gate name caps nothing (HARD_GATE_CAPS
    // lookup falls back to 100) but still forces tier='decline', so a single
    // hallucinated string would auto-decline an applicant. Only gates we
    // actually define may influence the verdict.
    // Court/LTB gates may ONLY be derived by the backend from corroborated
    // records (Stage 3.7 + the portal logic below). The model sees name-only
    // matches and web-index mentions — letting it emit these gates turned a
    // namesake mention into an auto-decline.
    const MODEL_BANNED_GATES = new Set(['ltb_eviction', 'court_record_defendant', 'court_record_defendant_multi', 'court_record_active'])
    const hardGates: string[] = (Array.isArray(parsed.hard_gates_triggered) ? parsed.hard_gates_triggered : [])
      .filter((g: unknown): g is string => typeof g === 'string' && g in HARD_GATE_CAPS && !MODEL_BANNED_GATES.has(g))
    const redFlags: string[] = Array.isArray(parsed.red_flags) ? parsed.red_flags : []
    for (const f of earlyRedFlags) if (!redFlags.includes(f)) redFlags.push(f)

    // ---- Stage 3.7: LTB Order Catalogue -------------------------------
    // Ontario Open Data (data.ontario.ca/dataset/ltb-order-catalogue), published
    // 2026-07-24 under the Open Government Licence – Ontario.
    //
    // It runs HERE, after the model has parsed the application, because
    // corroboration is measured against the addresses the applicant declared
    // themselves — and those only exist once cross_doc_verification is built.
    //
    // Three limits, in order of how badly getting them wrong would hurt someone:
    //  · Only the tenant side of a LANDLORD-filed application counts. A T1/T2/T6
    //    is the applicant asserting their own RTA rights, and scoring that down
    //    is retaliation by proxy — those are carried as context only.
    //  · A name match is a namesake until an address corroborates it. 143,869
    //    person-rows; common names collide. Only corroborated hits reach a gate.
    //  · The catalogue has no disposition field, so nothing may claim the person
    //    was evicted or owes money. We state that an order issued, and link it.
    let ltbCheck: LtbCheck | null = null
    try {
      const declaredAddresses = (crossDocVerification?.application_summary?.prev_residences ?? [])
        .map((r) => r.address)
        .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)

      // Prefer the ID-verified name over the self-typed one, same as the
      // existing court lookups.
      const ltbName = (typeof parsed.extracted_name === 'string' && parsed.extracted_name.trim())
        || nameForLookup

      const r = await searchLtbOrders(
        (fn, args) => supabase.rpc(fn, args) as never,
        ltbName,
        declaredAddresses,
      )
      ltbCheck = {
        status: r.status,
        queried_name: r.queried_name,
        as_respondent: r.as_respondent,
        as_applicant: r.as_applicant,
        corroborated: r.corroborated,
        summary_en: summarizeLtb(r, 'en'),
        summary_zh: summarizeLtb(r, 'zh'),
        coverage: r.coverage,
      }

      const codes = [...new Set(r.as_respondent.flatMap((m) => m.application_codes))]
      courtDetail.queries.push({
        source: 'LTB Order Catalogue — Ontario Open Data',
        tier: 'free',
        status: r.status === 'ok' || r.status === 'no_results' ? 'ok' : r.status === 'skipped' ? 'skipped' : 'unavailable',
        hits: r.status === 'ok' || r.status === 'no_results' ? r.as_respondent.length : null,
        // Severity is raised only by a corroborated hit: an uncorroborated name
        // match must not colour this source red for what may be another person.
        severity: r.corroborated.length > 0 ? 2 : 0,
        note: r.as_respondent.length === 0
          ? summarizeLtb(r, 'en')
          : `${r.as_respondent.length} order(s) name this person as a responding tenant (${describeCodes(codes, 'en')}); ${r.corroborated.length} corroborated by a declared address`,
        url: 'https://data.ontario.ca/dataset/ltb-order-catalogue',
      })

      // Reuses the existing court gates rather than adding new ones, so the same
      // underlying fact cannot cap an applicant twice via two sources.
      if (r.corroborated.length >= 2) {
        if (!hardGates.includes('court_record_defendant_multi')) hardGates.push('court_record_defendant_multi')
      } else if (r.corroborated.length === 1) {
        if (!hardGates.includes('court_record_defendant') && !hardGates.includes('court_record_defendant_multi')) {
          hardGates.push('court_record_defendant')
        }
      }
    } catch {
      // A catalogue outage must never fail a screening; the other sources stand.
      ltbCheck = null
    }

    // Enforce hard gates in backend (don't fully trust Claude).
    //
    // 2026-06-02 P0 — Use the document-derived income for the gate, not
    // the form-reported income. Previously the gate was evaluated against
    // `incomeRatio = formIncome / rent` which the applicant fully controls
    // (they can put $99,999 in the form). The detected income comes from
    // Sonnet's reading of paystubs / T4 / bank statements; that's what
    // we treat as ground truth for the affordability decision.
    //
    // We mirror the same null-tolerant precedence used at line ~1651 when
    // populating `effectiveIncome`: detected first, form-reported as fallback,
    // null when neither is available (in which case the gates DO NOT fire —
    // there's no evidence to fire on, the missing income gets reflected in
    // evidence_coverage instead).
    const detectedIncomeForGate: number | null =
      typeof parsed.detected_monthly_income === 'number' && parsed.detected_monthly_income > 0
        ? parsed.detected_monthly_income
        : null
    const effectiveIncomeForGate: number | null =
      detectedIncomeForGate ?? (monthlyIncome > 0 ? monthlyIncome : null)
    const verifiedRatio: number | null =
      (effectiveIncomeForGate !== null && monthlyRent > 0)
        ? effectiveIncomeForGate / monthlyRent
        : null

    if (monthlyRent > 0 && verifiedRatio !== null && verifiedRatio < 2.0 && !hardGates.includes('income_severe')) {
      hardGates.push('income_severe')
    }
    // Affordability gate: rent > 40% of verified gross income. Fires even
    // when income_severe is also set — the tighter cap (55) wins over (65).
    if (monthlyRent > 0 && verifiedRatio !== null && verifiedRatio < 2.5 && !hardGates.includes('affordability_severe')) {
      hardGates.push('affordability_severe')
    }
    // Red flag: rent 35-40% of gross income — borderline. Skip if
    // affordability_severe already fires (double-counting would be unfair).
    // Uses the verified ratio (detected income / rent), same precedence
    // as the affordability gate above.
    if (monthlyRent > 0 && verifiedRatio !== null && verifiedRatio >= 2.5 && verifiedRatio < 2.857 && !redFlags.includes('rent_ratio_high')) {
      redFlags.push('rent_ratio_high')
    }
    // Lift any ID-validation failures from the forensics layer into the red-flag
    // system so they contribute to the penalty score.
    const idFailureCodes = new Set([
      'id_sin_invalid_checksum',
      // OCR-sourced checksum failure: verify-first (no hard gate), but it
      // still earns the id_format_invalid red-flag penalty.
      'id_sin_checksum_unverified',
      'id_dl_surname_mismatch',
      'id_dl_dob_mismatch',
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
        detailsZh.rental_history = `发现 ${partsZh.join('，')}${activeSuffixZh}（仅姓名匹配——门户不含生日/地址，须先核实是否同一人，未计入评分）`
      }
      if (shouldRewriteEn) {
        detailsEn.rental_history = `Found: ${partsEn.join(', ')}${activeSuffixEn} (name-only matches — the portal carries no DOB/address; verify identity before drawing conclusions. Not scored.)`
      }
      parsedObj.details_zh = detailsZh
      parsedObj.details_en = detailsEn
    }

    const portalDefendantCases = (courtDetail.portal_records || []).filter(r => {
      const role = (r.partyRole || '').toLowerCase()
      return role.includes('defendant') || role.includes('debtor') || role.includes('respondent')
    })

    // Portal matches are NAME-ONLY: the portal payload carries no DOB and no
    // address, so there is nothing to corroborate against — the same rule the
    // LTB module lives by ("a name match is a namesake until an address
    // corroborates it") applies with full force. These records therefore
    // SURFACE prominently (red rows in the court section, details text below,
    // a verification red flag) but do NOT cap dimensions or trigger hard
    // gates. An exact-name Small Claims defendant who is a different person
    // with the same name used to auto-decline the applicant here.
    const totalCourtHits = portalDefendantCases.length + countDebtRelevantHits(courtDetail.records)
    if (totalCourtHits > 0) {
      if (!redFlags.includes('portal_name_match_unverified')) redFlags.push('portal_name_match_unverified')
      // Force the details card text to acknowledge the name matches, so the
      // UI doesn't say "no court records" while records sit below it.
      patchRentalHistoryDetailsForCourt(parsed, courtDetail.records, courtDetail.portal_records || [])
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

    // Hoisted above the rubric: it needs the sanitised credit report, and this
    // IIFE depends only on `parsed`. The guard inside it matters — a credit
    // report is only honoured when the model marked it present AND a
    // credit_report document was actually detected, so a hallucinated bureau
    // block cannot feed the score.
    const creditReport: (CreditReport & Record<string, any>) | null = (() => {
      const cr: any = (parsed as any).credit_report
      const hasCreditDoc = (Array.isArray(parsed.detected_document_kinds) ? parsed.detected_document_kinds : []).includes('credit_report')
      if (!cr || cr.present !== true || !hasCreditDoc) return null
      const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null)
      const arr = (a: any) => (Array.isArray(a) ? a : [])
      const str = (v: any) => (typeof v === 'string' ? v : '')
      return {
        bureau: typeof cr.bureau === 'string' ? cr.bureau : null,
        credit_score: num(cr.credit_score),
        score_band: typeof cr.score_band === 'string' ? cr.score_band : null,
        report_date: typeof cr.report_date === 'string' ? cr.report_date : null,
        // The bureau's Employment section — independent of the application's
        // own documents, which is what makes it evidence (see the type doc).
        employment: cr.employment && typeof cr.employment === 'object'
          ? {
              current: typeof cr.employment.current === 'string' ? cr.employment.current : null,
              previous: typeof cr.employment.previous === 'string' ? cr.employment.previous : null,
            }
          : null,
        tradelines: arr(cr.tradelines).slice(0, 25).map((t: any) => ({
          creditor: str(t?.creditor), type: str(t?.type), date_opened: str(t?.date_opened),
          responsibility: str(t?.responsibility) || null,
          balance: num(t?.balance), credit_limit: num(t?.credit_limit),
          high_credit: num(t?.high_credit), past_due: num(t?.past_due),
          payment_status: str(t?.payment_status), late_30_60_90: str(t?.late_30_60_90),
        })),
        collections: arr(cr.collections).slice(0, 15).map((c: any) => ({
          creditor: str(c?.creditor), date_assigned: str(c?.date_assigned),
          original_amount: num(c?.original_amount), balance: num(c?.balance),
        })),
        bankruptcies: arr(cr.bankruptcies).slice(0, 10).map((b: any) => ({
          date_filed: str(b?.date_filed), type: str(b?.type), amount: num(b?.amount), disposition: str(b?.disposition),
        })),
        inquiries: arr(cr.inquiries).slice(0, 15).map((i: any) => ({ date: str(i?.date), creditor: str(i?.creditor) })),
        total_debt: num(cr.total_debt),
        monthly_debt_payments: num(cr.monthly_debt_payments),
      }
    })()

    // ── Credit-report tradeline ages vs applicant DOB ─────────────────
    // A minor cannot open an individual credit account, so a tradeline
    // opened before the applicant was 16 means the report is not theirs,
    // is merged, or was edited. DOB: the bureau report prints it masked
    // ("2003-xx-27" — year is enough), the Ontario licence encodes it.
    const applicantDob: string | null = (() => {
      for (const pf of forensicsReport.per_file) {
        const t = pf.text_density?.text_sample || ''
        if ((pf.file_kind || '').split(',').map(k => k.trim()).includes('credit_report')) {
          const m = t.match(/Date\s+Of\s+Birth[\s\S]{0,300}?\b((?:19|20)\d{2})-(xx|\d{2})-(\d{2})\b/i)
          if (m) return m[2] === 'xx' ? m[1] : `${m[1]}-${m[2]}-${m[3]}`
        }
      }
      for (const pf of forensicsReport.per_file) {
        const t = pf.ocr?.text || ''
        const m = t.match(/(?:DOB|Date\s+of\s+Birth|Birth|NAISS|DDN)[^0-9]{0,20}((?:19|20)\d{2})[\/\-.](\d{2})[\/\-.](\d{2})/i)
        if (m) return `${m[1]}-${m[2]}-${m[3]}`
      }
      return null
    })()
    if (creditReport && applicantDob) {
      const ages = checkTradelineAges(creditReport.tradelines ?? [], applicantDob)
      if (ages.impossible.length > 0 || ages.underage.length >= 2) {
        const rows = [...ages.impossible, ...ages.underage]
        const listEn = rows.map(r => `${r.creditor} opened ${r.opened} (age ${r.age})`).join('; ')
        const listZh = rows.map(r => `${r.creditor} 开户 ${r.opened}（当时 ${r.age} 岁）`).join('；')
        const impossible = ages.impossible.length > 0
        forensicsReport.all_flags.push({
          code: 'credit_tradelines_predate_dob',
          severity: impossible ? 'critical' : 'high',
          evidence_en: `${rows.length} tradeline(s) on the credit report were opened when the applicant (born ${applicantDob.slice(0, 4)}) was ${impossible ? 'a child' : 'a minor'}: ${listEn}. A minor cannot hold an individual credit account — the report either belongs to someone else, is a merged file, or has been edited. It cannot be used as evidence of this applicant's credit history.`,
          evidence_zh: `信用报告中有 ${rows.length} 个账户在申请人（${applicantDob.slice(0, 4)} 年生）${impossible ? '尚是儿童' : '未成年'}时开立：${listZh}。未成年人无法持有个人信用账户——这份报告要么属于他人，要么是合并档案，要么被编辑过，不能作为该申请人信用历史的证据。`,
        })
        if (impossible) {
          if (!hardGates.includes('doc_tampering')) hardGates.push('doc_tampering')
          forgedDocCount += 1
          // The report cannot be this applicant's. Everything downstream must
          // say so: the rubric scores it as a hard negative (not as "808 —
          // Excellent"), the dimension text is rewritten, the credit section
          // gets a banner, and the finding sits on the credit file's own card.
          creditReport.unreliable = true
          creditReport.unreliable_reason_zh = `${rows.length} 个账户在申请人（${applicantDob.slice(0, 4)} 年生）未成年时开立：${listZh}。这份报告不能作为该申请人的信用历史。`
          creditReport.unreliable_reason_en = `${rows.length} account(s) were opened when the applicant (born ${applicantDob.slice(0, 4)}) was a minor: ${listEn}. This report cannot be treated as the applicant's credit history.`
          const dz = (parsed.details_zh && typeof parsed.details_zh === 'object') ? parsed.details_zh : (parsed.details_zh = {})
          const de = (parsed.details_en && typeof parsed.details_en === 'object') ? parsed.details_en : (parsed.details_en = {})
          dz.credit_health = `信用报告与申请人出生日期矛盾——${rows.length} 个账户在其未成年时开立（${listZh}）。报告不能作为该申请人的信用历史；表面的 ${creditReport.credit_score ?? '—'} 分不予采信。请由房东经申请人书面同意自行调取新报告。`
          de.credit_health = `The credit report contradicts the applicant's date of birth — ${rows.length} account(s) opened while they were a minor (${listEn}). It cannot be treated as this applicant's history; the apparent score of ${creditReport.credit_score ?? '—'} is not credited. Pull a fresh report with the applicant's written consent.`
          if (!Array.isArray(parsed.flags)) parsed.flags = []
          parsed.flags.unshift({ type: 'danger', text_zh: `信用报告账户开户年龄与出生日期矛盾（${rows.length} 个账户开立于未成年时）——报告不可采信`, text_en: `Credit report accounts predate the applicant's majority (${rows.length} opened as a minor) — report not credible` })
          parsed.flags = parsed.flags.filter((fl: any) => !(fl && fl.type === 'info' && /信用分|credit score/i.test(`${fl.text_zh || ''} ${fl.text_en || ''}`)))
          for (const pf of forensicsReport.per_file) {
            if ((pf.file_kind || '').split(',').map(k => k.trim()).includes('credit_report')) {
              pf.flags.push({ code: 'credit_tradelines_predate_dob', severity: 'critical', file: pf.file_name, evidence_en: creditReport.unreliable_reason_en!, evidence_zh: creditReport.unreliable_reason_zh! })
            }
          }
        }
        if (!redFlags.includes('credit_report_age_inconsistent')) redFlags.push('credit_report_age_inconsistent')
      }
    }

    // AI coherence anomalies → flags table (low weight; surfaced, not gating)
    forensicsReport.all_flags.push(...coherenceToFlags(coherence))
    if (coherence.status === 'ok' && coherence.anomalies.some(a => a.severity === 'critical' || a.severity === 'high')) {
      if (!redFlags.includes('coherence_anomaly')) redFlags.push('coherence_anomaly')
    }

    // ── Deterministic rubric ────────────────────────────────────────────
    // The model's dimension numbers no longer decide the score. Six runs of one
    // applicant's identical documents scored 19–28 because ability_to_pay came
    // back 38/42/48 and verification 32/35/38 — free-hand numbers with nothing
    // anchoring them, which temperature:0 (already set) cannot hold still. The
    // EXTRACTION was identical on all six, so the facts score deterministically.
    // See lib/screening/rubric.ts. The model's own numbers stay in scores_v3 for
    // comparison but drive nothing.
    let rubric: RubricResult | null = null
    let rubricFacts: RubricFacts | null = null
    try {
      const prev = crossDocVerification?.application_summary?.prev_residences ?? []
      rubricFacts = {
        monthly_rent: monthlyRent || crossDocVerification?.application_summary?.applying_rent || null,
        claimed_monthly_income: detectedIncomeForGate,
        // Only a corroborated figure counts. An employment letter the applicant
        // supplied about themselves is a claim, not a measurement.
        verified_monthly_income:
          crossDocVerification?.income_corroboration?.verdict === 'corroborated'
            ? detectedIncomeForGate
            : null,
        credit: creditReport ?? null,
        creditReportUnreliable: creditReport?.unreliable === true,
        crossDoc: crossDocVerification,
        ltbCorroborated: ltbCheck?.corroborated.length ?? 0,
        // 0, deliberately: the only court gates the backend derives now come
        // from corroborated LTB orders — which ltbCorroborated above already
        // prices. Deriving courtDefendantHits from those same gates charged
        // one order twice (−30 ltb_order_corroborated PLUS −22 court_defendant).
        // Portal name-only matches are namesakes until corroborated and are
        // never scored (see the portal block).
        courtDefendantHits: 0,
        landlordRefs: prev.filter((p) => p.landlord_name && p.landlord_phone).length,
        declaredAddresses: prev.length,
        documentKinds: Array.isArray(parsed.detected_document_kinds) ? parsed.detected_document_kinds : [],
        contradictions: redFlags.filter((r: string) => /contradict|mismatch|collision/i.test(r)),
        forgedDocuments: forgedDocCount,
        blankApplicationFields: crossDocVerification?.application_summary?.blank_sections?.length ?? 0,
        applicationSigned: null,
        // Deterministic staleness: days from the report's own date to now,
        // parsed as UTC (lib/dates.ts discipline — a local-getter read here
        // would drift the age by a day across midnight). Unparseable → null,
        // which the rubric treats as "age unknown", never as fresh.
        creditReportAgeDays: (() => {
          const d = creditReport?.report_date
          if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null
          const t = Date.parse(`${d.slice(0, 10)}T00:00:00Z`)
          if (!Number.isFinite(t)) return null
          const days = Math.floor((Date.now() - t) / 86_400_000)
          // A report "dated in the future" is a clock/extraction artifact;
          // clamp to 0 rather than rewarding it.
          return Math.max(0, days)
        })(),
      } as RubricFacts
      rubric = scoreRubric(rubricFacts)
      s.ability_to_pay = rubric.dimensions.ability_to_pay
      s.credit_health = rubric.dimensions.credit_health
      s.rental_history = rubric.dimensions.rental_history
      s.verification = rubric.dimensions.verification
      baseScore = rubric.overall
    } catch (err) {
      // Never fail a screening because the rubric threw — fall back to the
      // weighted sum, which is what shipped before this.
      console.error('[screen-score] rubric failed, using model dimensions', err)
      rubric = null
    }

    // The rubric prices every negative signal through its own rule hits, so the
    // model's separate penalty would charge the same facts twice.
    let overall = Math.round(Math.max(0, Math.min(100, Math.min((rubric ? baseScore : baseScore - penalty), gateCap))))

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
    // ltb_check is owned by the backend: the LTB Order Catalogue (Stage 3.7)
    // is the only real LTB source, and it runs after the model. Defaulting to
    // 'measured' claimed an LTB search that may never have run — the exact
    // "✓ searched when it wasn't" class this project keeps stamping out.
    subCov.ltb_check = (ltbCheck && (ltbCheck.status === 'ok' || ltbCheck.status === 'no_results'))
      ? 'measured'
      : 'action_pending'
    const evidenceCoverage = ALL_SUB_COMPONENTS.reduce(
      (sum, k) => sum + (coverageWeights[subCov[k]] ?? 1.0), 0
    ) / ALL_SUB_COMPONENTS.length

    // Determine tier. A triggered hard gate outranks sparse evidence — a proven
    // forgery or eviction must not be softened to "insufficient_evidence".
    let tier: 'approve' | 'conditional' | 'decline'
    let tierReason = ''
    // Affordability gates cap the score (55/65) but must not auto-refuse:
    // OHRC caselaw (Kearney v. Bramalea) bars rent-to-income ratios as the
    // sole ground for refusing a tenancy, and the ratio can rest on
    // self-typed form income. They resolve to 'conditional' with the cap.
    const AFFORDABILITY_ONLY_GATES = new Set(['income_severe', 'affordability_severe'])
    const nonAffordabilityGates = hardGates.filter(g => !AFFORDABILITY_ONLY_GATES.has(g))
    if (nonAffordabilityGates.length > 0) {
      tier = 'decline'
      tierReason = 'hard_gate_triggered'
    } else if (hardGates.length > 0) {
      tier = 'conditional'
      tierReason = 'affordability_gate'
    } else if (evidenceCoverage < 0.4) {
      tier = 'conditional'
      tierReason = 'insufficient_evidence'
    } else if (evidenceCoverage < 0.6) {
      tier = 'conditional'
      tierReason = 'low_confidence'
    } else if (rubric) {
      // One set of thresholds. Leaving the old 85/70 cutoffs here alongside the
      // rubric's 70/55/40 bands would let the report say "需补件" in the
      // breakdown and "拒绝" on the front page for the same applicant.
      // 'review' folds into conditional: both mean "there is a specific thing to
      // resolve before deciding", which is what the landlord acts on.
      tier = rubric.band === 'proceed' ? 'approve' : rubric.band === 'decline' ? 'decline' : 'conditional'
      tierReason = `rubric_${rubric.band}`
    } else if (overall >= 85) {
      tier = 'approve'
    } else if (overall >= 70) {
      tier = 'conditional'
    } else {
      tier = 'decline'
    }

    // ---- Stage 5: Map to legacy columns for backward compat ----
    const identityMatch = (typeof parsed.identity_match_score === 'number' && Number.isFinite(parsed.identity_match_score))
      ? Math.max(0, Math.min(100, parsed.identity_match_score))
      : 70
    // Behavioral red flags only — forensics_* entries are already counted
    // upstream via hardGates + forensicsPenalty; don't double-count them here.
    const behavioralRedFlagCount = redFlags.filter(f => !f.startsWith('forensics_')).length
    // 0 court hits into the legacy mapping: portal matches are name-only
    // namesakes until corroborated — the legacy court_records column must
    // not be depressed by them any more than the v3 dimensions are.
    let legacy = mapV3ToLegacy(s, behavioralRedFlagCount, identityMatch, 0)

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
      writeProgress('supplemental_courts', 86)
      // Insert a name separator for the primary name so the UI clearly
      // labels which group of queries belongs to which person.
      const primaryHits = courtDetail.total_hits
      courtDetail.queries.splice(0, 0, {
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

      // LTB Order Catalogue for each additional validated name. This is the
      // screening's strongest LTB source and previously ran only for the
      // primary name — a co-applicant's corroborable LTB history was never
      // checked while the per-name query list implied full coverage. Same
      // rules as the primary pass: corroborated hits reuse the court gates,
      // uncorroborated name matches stay namesakes.
      let supplementalLtbCorroborated = 0
      for (const extraName of newNames) {
        try {
          const declaredForExtra = (crossDocVerification?.application_summary?.prev_residences ?? [])
            .map((r) => r.address)
            .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
          const lr = await searchLtbOrders(
            (fn, args) => supabase.rpc(fn, args) as never,
            extraName,
            declaredForExtra,
          )
          const lrOk = lr.status === 'ok' || lr.status === 'no_results'
          const lrCodes = [...new Set(lr.as_respondent.flatMap((m) => m.application_codes))]
          courtDetail.queries.push({
            source: `LTB Order Catalogue — Ontario Open Data (${extraName})`,
            tier: 'free',
            status: lrOk ? 'ok' : lr.status === 'skipped' ? 'skipped' : 'unavailable',
            hits: lrOk ? lr.as_respondent.length : null,
            severity: lr.corroborated.length > 0 ? 2 : 0,
            note: lr.as_respondent.length === 0
              ? summarizeLtb(lr, 'en')
              : `${lr.as_respondent.length} order(s) name this person as a responding tenant (${describeCodes(lrCodes, 'en')}); ${lr.corroborated.length} corroborated by a declared address`,
            url: 'https://data.ontario.ca/dataset/ltb-order-catalogue',
          })
          if (lr.corroborated.length >= 2) {
            if (!hardGates.includes('court_record_defendant_multi')) hardGates.push('court_record_defendant_multi')
          } else if (lr.corroborated.length === 1) {
            if (!hardGates.includes('court_record_defendant') && !hardGates.includes('court_record_defendant_multi')) {
              hardGates.push('court_record_defendant')
            }
          }
          supplementalLtbCorroborated += lr.corroborated.length
        } catch {
          courtDetail.queries.push({
            source: `LTB Order Catalogue — Ontario Open Data (${extraName})`,
            tier: 'free',
            status: 'unavailable',
            hits: null,
            note: 'Catalogue query failed for this name — not searched.',
            url: 'https://data.ontario.ca/dataset/ltb-order-catalogue',
          })
        }
      }

      // Supplemental portal matches follow the same namesake rule as the
      // primary pass: name-only, so they surface (rows + details text + red
      // flag) but never cap or gate.
      const allPortalDefendant = (courtDetail.portal_records || []).filter(r => {
        const role = (r.partyRole || '').toLowerCase()
        return role.includes('defendant') || role.includes('debtor') || role.includes('respondent')
      })
      if (allPortalDefendant.length > 0) {
        if (!redFlags.includes('portal_name_match_unverified')) redFlags.push('portal_name_match_unverified')
        patchRentalHistoryDetailsForCourt(parsed, courtDetail.records, courtDetail.portal_records || [])
      }
      // Re-score after the supplemental court pass.
      //
      // This block used to recompute baseScore from the OLD five-dimension
      // weighted sum with the OLD weights, subtract the model's penalty on top,
      // and re-derive tier from the OLD 85/70 cutoffs — none of which the rubric
      // uses. The effect was that any applicant whose documents yielded a second
      // name (a co-applicant, or an ID spelling variant) silently fell back to
      // the non-deterministic scoring this cutover replaced, in exactly the
      // multi-party cases where the stakes are highest.
      //
      // Only one rubric input can change here: the supplemental pass may add
      // court gates. Re-score from the same facts with those gates applied.
      if (rubric && rubricFacts) {
        // courtDefendantHits stays 0 — same double-count reasoning as the
        // primary rubric feed. Corroborated LTB orders found for supplemental
        // names DO price in, through the same ltbCorroborated input.
        rubricFacts = { ...rubricFacts, ltbCorroborated: (rubricFacts.ltbCorroborated ?? 0) + supplementalLtbCorroborated }
        rubric = scoreRubric(rubricFacts)
        s.ability_to_pay = rubric.dimensions.ability_to_pay
        s.credit_health = rubric.dimensions.credit_health
        s.rental_history = rubric.dimensions.rental_history
        s.verification = rubric.dimensions.verification
        baseScore = rubric.overall
      } else {
        baseScore = Math.round(
          s.ability_to_pay * V3_WEIGHTS.ability_to_pay +
          s.credit_health * V3_WEIGHTS.credit_health +
          s.rental_history * V3_WEIGHTS.rental_history +
          s.verification * V3_WEIGHTS.verification +
          s.communication * V3_WEIGHTS.communication
        )
      }
      gateCap = hardGates.length > 0
        ? Math.min(...hardGates.map(g => HARD_GATE_CAPS[g] ?? 100))
        : 100
      overall = Math.round(Math.max(0, Math.min(100, Math.min(rubric ? baseScore : baseScore - penalty, gateCap))))

      // Re-derive the verdict from the post-merge state. Without this the
      // persisted tier/legacy still reflect the pre-supplemental scores.
      if (hardGates.some(g => !AFFORDABILITY_ONLY_GATES.has(g))) {
        tier = 'decline'
        tierReason = 'hard_gate_triggered'
      } else if (hardGates.length > 0) {
        tier = 'conditional'
        tierReason = 'affordability_gate'
      } else if (evidenceCoverage < 0.4) {
        tier = 'conditional'
        tierReason = 'insufficient_evidence'
      } else if (evidenceCoverage < 0.6) {
        tier = 'conditional'
        tierReason = 'low_confidence'
      } else if (rubric) {
        tier = rubric.band === 'proceed' ? 'approve' : rubric.band === 'decline' ? 'decline' : 'conditional'
        tierReason = `rubric_${rubric.band}`
      } else if (overall >= 85) {
        tier = 'approve'
        tierReason = ''
      } else if (overall >= 70) {
        tier = 'conditional'
        tierReason = ''
      } else {
        tier = 'decline'
        tierReason = ''
      }
      legacy = mapV3ToLegacy(s, behavioralRedFlagCount, identityMatch, 0)
    }

    const detectedIncome = typeof parsed.detected_monthly_income === 'number' && parsed.detected_monthly_income > 0
      ? parsed.detected_monthly_income : null
    const effectiveIncome = detectedIncome ?? (monthlyIncome > 0 ? monthlyIncome : null)
    const computedRatio = (effectiveIncome && monthlyRent > 0) ? effectiveIncome / monthlyRent : null

    // Structured credit-report data the AI transcribed from an uploaded
    // credit report. Retained ONLY when present===true AND a credit_report
    // document was actually detected — defense against hallucinated bureau
    // data when no real report was provided.

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
        red_flag_penalty: rubric ? 0 : penalty, // under the rubric the model penalty is not applied — showing it would display a deduction that had no effect
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
        credit_report: creditReport,
        cross_doc_verification: crossDocVerification,
        coherence_review: coherence,
        ltb_check: ltbCheck,
        rubric,
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
      red_flag_penalty: rubric ? 0 : penalty, // under the rubric the model penalty is not applied — showing it would display a deduction that had no effect
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
      compliance_audit: parsed.compliance_audit || null,
      sub_coverage: subCov,
      bank_min_balance: typeof parsed.bank_min_balance === 'number' ? parsed.bank_min_balance : null,
      identity_match_score: identityMatch,
      status: 'scored',
      scored_at: new Date().toISOString(),
      progress: { stage: 'done', pct: 100, at: new Date().toISOString() },
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
      tier: (plan === 'pro' || plan === 'team') ? 'pro' : 'free',
      v3_tier: tier,
      tier_reason: tierReason,
      hard_gates_triggered: hardGates,
      red_flags: redFlags,
      red_flag_penalty: rubric ? 0 : penalty, // under the rubric the model penalty is not applied — showing it would display a deduction that had no effect
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
      credit_report: creditReport,
      cross_doc_verification: crossDocVerification,
        coherence_review: coherence,
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
    // §6 P2 — sanitize before logging so any CanLII URL hidden inside
    // an upstream error message can't leak the api_key into CF Pages logs.
    const errMsg = sanitizeUrlForLog(e?.message ? String(e.message) : String(e))
    console.error('[screen-score] uncaught:', errMsg, e?.name)
    captureException(e, { route: 'screen-score', level: 'error' })
    return NextResponse.json(
      {
        error: 'Screening failed: ' + (errMsg || 'unknown error').slice(0, 300),
        name: e?.name || undefined,
      },
      { status: 500 }
    )
  }
}

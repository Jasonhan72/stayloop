// -----------------------------------------------------------------------------
// Tool: search_ontario_portal
// -----------------------------------------------------------------------------
// Search Ontario Courts Public Portal (courts.ontario.ca) for the named
// person as a party in Civil & Small Claims Court cases. Tiered search:
//   1. Exact match (searchType=10462) on canonical name order
//   2. Exact match on swapped (last-first reversed) order
//   3. Fuzzy fallback (searchType=300054) with local surname-position filter
//
// Surname-position filter prevents "XIONG YI" matching "ZHENG, YI XIONG"
// (the registered surname is ZHENG, not XIONG).
// -----------------------------------------------------------------------------

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'

const ONTARIO_PORTAL_CIVIL_COURT_ID = '68f021c4-6a44-4735-9a76-5360b2e8af13'

interface SearchInput {
  full_name: string
}

interface PortalMatch {
  caseNumber: string
  caseTitle: string
  caseCategory: string
  filedDate: string
  partyRole: string
  partyDisplayName: string
  closedFlag: boolean
  caseInstanceUUID?: string
  detailUrl?: string
  nameSwapped?: boolean
}

interface SearchOutput {
  matches: PortalMatch[]
  total_elements: number
  error?: string
}

function isValidFullName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  const cjkChars = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkChars >= 2) return true
  const words = trimmed.split(/\s+/).filter((w) => w.length >= 2)
  return words.length >= 2
}

function nameMatchesTitle(searchName: string, target: string): boolean {
  const targetLower = target.toLowerCase()
  const fullLower = searchName.toLowerCase().trim()
  const cjkChars = (fullLower.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  if (cjkChars >= 2) {
    return targetLower.includes(fullLower.replace(/\s/g, ''))
  }
  const parts = fullLower.split(/\s+/).filter((p) => p.length >= 2)
  if (parts.length < 2) return false
  return parts.every((p) => targetLower.includes(p))
}

function recordSurname(displayName: string, sortName: string): string | null {
  const sn = (sortName || '').trim()
  if (sn.includes(',')) {
    const last = sn.split(',')[0].trim().toLowerCase()
    if (last) return last
  }
  const tokens = (displayName || '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) return tokens[tokens.length - 1].toLowerCase()
  return null
}

async function portalQuery(displayName: string, searchType: '10462' | '300054') {
  try {
    const params = new URLSearchParams({
      'partyHeader.partyActorInstance.displayName': displayName,
      'partyHeader.partyActorInstance.displayNameSearchType': searchType,
      'caseHeader.courtID': ONTARIO_PORTAL_CIVIL_COURT_ID,
      page: '0',
      size: '10',
    })
    const url = `https://api1.courts.ontario.ca/courts/cms/parties?${params.toString()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { results: [], totalElements: 0, error: `HTTP ${res.status}` }
    const data = (await res.json()) as any
    return {
      results: data?._embedded?.results || [],
      totalElements: data?.page?.totalElements || 0,
    }
  } catch (e: any) {
    return { results: [], totalElements: 0, error: e?.message || 'fetch_failed' }
  }
}

function shapePortalMatch(r: any, nameSwapped: boolean): PortalMatch {
  const caseInstanceUUID =
    r.caseHeader?.caseInstanceUUID || r.caseHeader?.caseInstanceId || r.caseInstanceUUID
  const detailUrl = caseInstanceUUID
    ? `https://courts.ontario.ca/portal/court/${ONTARIO_PORTAL_CIVIL_COURT_ID}/case/${caseInstanceUUID}`
    : undefined
  return {
    caseNumber: r.caseHeader?.caseNumber || '',
    caseTitle: r.caseHeader?.caseTitle || '',
    caseCategory: r.caseHeader?.caseCategory || '',
    filedDate: r.caseHeader?.filedDate || '',
    partyRole: r.partyHeader?.partySubType || '',
    partyDisplayName: r.partyHeader?.partyActorInstance?.sortName || r.partyHeader?.partyActorInstance?.displayName || '',
    closedFlag: r.caseHeader?.closedFlag ?? false,
    caseInstanceUUID,
    detailUrl,
    nameSwapped: nameSwapped || undefined,
  }
}

const tool: CapabilityTool<SearchInput, SearchOutput> = {
  name: 'search_ontario_portal',
  version: '2.0.0',
  description:
    'Search Ontario Courts Public Portal (courts.ontario.ca) for the named person as a party in Civil and Small Claims Court cases. Tiered search: exact match on canonical name order → exact match on swapped order → fuzzy fallback with local surname-position filter (so "XIONG YI" does NOT match a person whose surname is "ZHENG"). Returns case detail with direct portal URL when caseInstanceUUID is available. ' +
    '在安省法院公开门户搜索某人作为当事人的 Civil/Small Claims 案件。三级搜索 + 姓氏位置过滤防止误匹配。',
  inputSchema: {
    type: 'object',
    properties: {
      full_name: { type: 'string' },
    },
    required: ['full_name'],
  },
  needsApproval: false,
  handler: async (input) => {
    const normalized = (input.full_name || '').replace(/\s+/g, ' ').trim()
    if (!isValidFullName(normalized)) {
      return { matches: [], total_elements: 0, error: 'invalid_name' }
    }

    const parts = normalized.split(' ').filter((p) => p.length >= 2)
    const tryOrders: string[] = [normalized]
    if (parts.length >= 2) {
      const swapped = [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ')
      if (swapped !== normalized) tryOrders.push(swapped)
      const reversed = [...parts].reverse().join(' ')
      if (reversed !== normalized && reversed !== swapped) tryOrders.push(reversed)
    }

    const queryTokens = normalized
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length >= 2)

    const applyFilter = (results: any[], queryName: string, nameSwapped: boolean): PortalMatch[] => {
      return results
        .filter((r) => {
          const dn = (r.partyHeader?.partyActorInstance?.displayName || '').toLowerCase()
          const sn = (r.partyHeader?.partyActorInstance?.sortName || '').toLowerCase()
          if (!nameMatchesTitle(queryName, dn + ' ' + sn)) return false
          // Surname-position rule
          const surname = recordSurname(dn, sn)
          if (surname && queryTokens.length > 0) {
            if (!queryTokens.some((t) => t === surname)) return false
          }
          return true
        })
        .map((r) => shapePortalMatch(r, nameSwapped))
    }

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
        return { matches, total_elements: q.totalElements }
      }
    }

    // Fuzzy fallback
    const fuzzy = await portalQuery(normalized, '300054')
    if (fuzzy.error && !lastError) lastError = fuzzy.error
    const fuzzyMatches = applyFilter(fuzzy.results, normalized, false)
    if (fuzzyMatches.length > 0) {
      return { matches: fuzzyMatches, total_elements: fuzzy.totalElements }
    }

    return {
      matches: [],
      total_elements: Math.max(totalSeen, fuzzy.totalElements),
      error: lastError,
    }
  },
}

registerTool(tool)
export default tool

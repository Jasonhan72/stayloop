// Ontario Courts Portal party search (Civil & Small Claims), shared by the
// screening route (applicant) and the deep check (employer). Direct fetch
// first; on the Azure gateway's regional 403 the caller-provided relay
// (portal_relay_get via the database) is tried once. No key, no cost.
export const ONTARIO_PORTAL_CIVIL_COURT_ID = '68f021c4-6a44-4735-9a76-5360b2e8af13'

export interface PortalPartyCase { title: string; role: string; filed: string; closed: boolean | null; party: string }

export async function portalPartySearch(
  displayName: string,
  searchType: '10462' | '300054',
  opts: { relay?: (url: string) => Promise<{ status: number; body: unknown } | null>; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ results: PortalPartyCase[]; total: number; error?: string }> {
  const params = new URLSearchParams({
    'partyHeader.partyActorInstance.displayName': displayName,
    'partyHeader.partyActorInstance.displayNameSearchType': searchType,
    'caseHeader.courtID': ONTARIO_PORTAL_CIVIL_COURT_ID,
    page: '0',
    size: '50',
  })
  const url = `https://api1.courts.ontario.ca/courts/cms/parties?${params.toString()}`
  const f = opts.fetchImpl ?? fetch
  let data: any = null
  try {
    const res = await f(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) })
    if (res.status === 403 && opts.relay) {
      const r = await opts.relay(url)
      if (!r) return { results: [], total: 0, error: 'HTTP 403 (relay unavailable)' }
      if (r.status !== 200) return { results: [], total: 0, error: `HTTP ${r.status} (via relay)` }
      data = r.body
    } else {
      if (!res.ok) return { results: [], total: 0, error: `HTTP ${res.status}` }
      data = await res.json()
    }
  } catch (e) {
    return { results: [], total: 0, error: (e as Error).message || 'fetch failed' }
  }
  const raw: any[] = data?._embedded?.results || []
  const results = raw.map(r => ({
    title: String(r.caseHeader?.caseTitle || ''),
    role: String(r.partyHeader?.partySubType || ''),
    filed: String(r.caseHeader?.filedDate || ''),
    closed: typeof r.caseHeader?.closedFlag === 'boolean' ? r.caseHeader.closedFlag : null,
    party: String(r.partyHeader?.partyActorInstance?.sortName || r.partyHeader?.partyActorInstance?.displayName || ''),
  }))
  return { results, total: Number(data?.page?.totalElements || results.length) }
}

/** Does the portal party string name this company? Token containment on the canonical words. */
export function partyNamesCompany(party: string, company: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\b(INC|LTD|LIMITED|CORP|CORPORATION|CO|COMPANY|INCORPORATED|LLC|LLP|THE)\b/g, ' ').split(/\s+/).filter(t => t.length > 1)
  const a = norm(party), b = norm(company)
  if (!a.length || !b.length) return false
  return b.every(t => a.includes(t))
}

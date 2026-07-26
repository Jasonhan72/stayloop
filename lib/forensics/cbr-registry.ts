// Canada's Business Registries (CBR / MRAS) lookup — the FREE official
// federated registry search run by ISED.
//
// Why this exists: our local ca_corp_registry table only holds Corporations
// Canada (federal) open data, so a provincially-incorporated employer —
// which is most small Ontario businesses — always came back "not found".
// The paid alternatives are steep (OpenCorporates API starts at GBP 2,250/yr)
// and their Ontario coverage is stale.
//
// CBR is the public JSON API behind https://ised-isde.canada.ca/cbr-rec/
// (endpoint taken from that app's own runtime config.js). No key, no quota
// gate, and it federates the participating registries. Verified 2026-07-26:
//   • jurisdictions: AB, BC, CC (federal), MB, NS, ON, QC, SK
//   • freshness (LastUpdated): ON 2026-07-06, most others same-day
//   • returns name, jurisdiction, registry id, BN, status, incorporation
//     date, registered-office city/province
// Officers/directors are NOT included (same as the federal open data), so
// the applicant_is_officer check degrades gracefully — surname/address/
// cross-document signals still apply.
import { pickBestCompanyMatch, type CompanyRegistryInfo } from './arm-length'

const SEARCH_API = 'https://ised-isde.canada.ca/cbr/srch/api/v1/search'

/** Raw shape of a CBR result doc (only the fields we consume). */
export interface CbrDoc {
  Company_Name?: string
  Jurisdiction?: string
  Registry_Source?: string
  Juri_ID?: string
  BN?: string
  Status_State?: string
  Status_Notes?: string
  Entity_Type?: string
  Date_Incorporated?: string
  Reg_office_city?: string
  Reg_office_province?: string
}

/** Jurisdiction code → human label. CC is Corporations Canada (federal). */
const JURIS_LABEL: Record<string, string> = {
  ON: 'Ontario', BC: 'British Columbia', AB: 'Alberta', QC: 'Quebec',
  MB: 'Manitoba', SK: 'Saskatchewan', NS: 'Nova Scotia', NB: 'New Brunswick',
  CC: 'Canada (federal)',
}

/**
 * Map a CBR doc to the shared CompanyRegistryInfo shape.
 * Pure — unit-tested directly.
 */
export function cbrDocToCompanyInfo(d: CbrDoc): CompanyRegistryInfo {
  const juri = (d.Jurisdiction || d.Registry_Source || '').toUpperCase()
  const addr = [d.Reg_office_city, d.Reg_office_province].filter(Boolean).join(', ')
  // Status_State is "Active"/"Inactive"; Status_Notes adds nuance
  // ("incorporated", "dissolved", …) — surface both when they differ.
  const status = [d.Status_State, d.Status_Notes && d.Status_Notes !== d.Status_State ? `(${d.Status_Notes})` : '']
    .filter(Boolean)
    .join(' ')
  return {
    name: d.Company_Name || '',
    company_number: d.Juri_ID || null,
    jurisdiction: JURIS_LABEL[juri] || juri || null,
    incorporation_date: d.Date_Incorporated || null,
    status: status || null,
    registered_address: addr || null,
    company_type: d.Entity_Type || null,
    // CBR does not expose directors/officers.
    officers: [],
    registry_url: d.Company_Name
      ? `https://ised-isde.canada.ca/cbr-rec/en/search/results?search=${encodeURIComponent(`{${d.Company_Name}}`)}`
      : null,
    source: juri === 'CC' ? 'cbr_federal' : `cbr_${juri.toLowerCase()}`,
  }
}

/**
 * Rank CBR candidates for the searched name and return the best one.
 * Active registrations beat inactive ones at equal name quality — an
 * employer who is currently paying the applicant should be a live entity,
 * and a dissolved same-name company in another province is a distractor
 * (the real case: "Northline Motors Ltd" AB, dissolved 1978, vs
 * "Northline Motors Inc." ON, active since 2012).
 * Pure — unit-tested directly.
 */
export function pickBestCbrDoc(companyName: string, docs: CbrDoc[]): CbrDoc | null {
  const named = (docs || []).filter((d) => !!d.Company_Name)
  if (named.length === 0) return null
  const active = named.filter((d) => (d.Status_State || '').toLowerCase() === 'active')
  return (
    pickBestCompanyMatch(companyName, active.map((d) => ({ ...d, name: d.Company_Name }))) ??
    pickBestCompanyMatch(companyName, named.map((d) => ({ ...d, name: d.Company_Name }))) ??
    null
  )
}

/**
 * Look up a company in Canada's Business Registries. Returns null on
 * no-match, network failure, or timeout — the caller renders the honest
 * "not found in registry" state, so a CBR outage never breaks screening.
 */
export async function searchCbrRegistry(companyName: string): Promise<CompanyRegistryInfo | null> {
  const name = (companyName || '').trim()
  if (name.length < 3) return null
  // The API is Solr-backed: the keyword field query needs the braces.
  const fq = encodeURIComponent(`keyword:{${name}}`)
  try {
    const res = await fetch(`${SEARCH_API}?fq=${fq}&lang=en&start=0&rows=20`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { docs?: CbrDoc[] }
    const best = pickBestCbrDoc(name, data?.docs || [])
    return best ? cbrDocToCompanyInfo(best) : null
  } catch {
    return null
  }
}

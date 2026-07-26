// Provincial corporate-registry lookup links.
//
// The federal Corporations Canada open data (seeded into ca_corp_registry)
// EXCLUDES provincially-incorporated companies — an Ontario corp legitimately
// isn't there. There is no free bulk dataset or free public API for the
// Ontario Business Registry (only paid $8 profile reports and a session-gated
// web search that 403s to bots), so we can't seed a provincial table the way
// we did for federal. Until a paid provincial data source is wired, the
// pragmatic path is a ONE-CLICK link that sends the landlord to an
// authoritative registry search pre-filled with the employer name.
//
// Two free destinations, in order of usefulness:
//   1. OpenCorporates website search — URL-fillable, covers every Canadian
//      jurisdiction, free to VIEW (the paywall is only their API). Good for a
//      fast federated look.
//   2. The province's OFFICIAL registry search — authoritative, but Ontario's
//      OBR is not URL-fillable, so we link the landing page and the caller
//      surfaces the name to paste.
//
// Pure + unit-tested.

export type ProvinceCode = 'ON' | 'BC' | 'AB' | 'QC' | 'MB' | 'SK' | 'NS' | 'NB' | 'PE' | 'NL'

export interface RegistryLinks {
  /** OpenCorporates website search, pre-filled with the name (one-click). */
  openCorporatesUrl: string
  /** The official provincial registry search landing (authoritative). */
  officialUrl: string
  /** Human label for the official registry, e.g. "安省企业注册局 (OBR)". */
  officialLabelZh: string
  officialLabelEn: string
}

const OC_JURIS: Record<ProvinceCode, string> = {
  ON: 'ca_on', BC: 'ca_bc', AB: 'ca_ab', QC: 'ca_qc', MB: 'ca_mb',
  SK: 'ca_sk', NS: 'ca_ns', NB: 'ca_nb', PE: 'ca_pe', NL: 'ca_nl',
}

// Official free search entry points per province.
const OFFICIAL: Record<ProvinceCode, { url: string; zh: string; en: string }> = {
  // ontario.ca landing, NOT the ONBIS app URL: appmybizaccount.gov.on.ca sits
  // behind a bot-protection challenge and 403s anything without a real browser
  // session, and its per-search URLs carry a session id that dies with the
  // session. The landing page carries the working "search" entry point.
  ON: { url: 'https://www.ontario.ca/page/ontario-business-registry', zh: '安省企业注册局 (OBR)', en: 'Ontario Business Registry (OBR)' },
  BC: { url: 'https://www.bcregistry.gov.bc.ca/', zh: 'BC 企业注册局', en: 'BC Registries' },
  AB: { url: 'https://www.alberta.ca/search-corporate-registration-information', zh: '阿省企业注册局', en: 'Alberta Corporate Registry' },
  QC: { url: 'https://www.registreentreprises.gouv.qc.ca/en/consulter/rechercher/', zh: '魁省企业登记处 (REQ)', en: 'Registraire des entreprises (REQ)' },
  MB: { url: 'https://companiesoffice.gov.mb.ca/', zh: '曼省公司办公室', en: 'Manitoba Companies Office' },
  SK: { url: 'https://corporateregistry.isc.ca/', zh: '萨省企业注册局', en: 'Saskatchewan Corporate Registry' },
  NS: { url: 'https://beta.novascotia.ca/programs-and-services/registry-joint-stock-companies', zh: '新斯科舍注册局', en: 'Nova Scotia Registry of Joint Stock' },
  NB: { url: 'https://www.pxw2.snb.ca/corporate_registry_e.asp', zh: '新不伦瑞克企业注册局', en: 'New Brunswick Corporate Registry' },
  PE: { url: 'https://www.princeedwardisland.ca/en/service/search-corporate-and-business-names-registry', zh: 'PEI 企业注册局', en: 'PEI Corporate Registry' },
  NL: { url: 'https://cado.eservices.gov.nl.ca/CADOInternet/Company/CompanySearch.aspx', zh: '纽芬兰企业注册局', en: 'Newfoundland Registry' },
}

/**
 * Build registry lookup links for a company name, scoped to a province
 * (defaults to Ontario — Stayloop's market). The name is trimmed and
 * URL-encoded; an empty/whitespace name yields a bare search page.
 */
export function registryLinks(companyName: string, province: ProvinceCode = 'ON'): RegistryLinks {
  const p = OFFICIAL[province] ? province : 'ON'
  const q = encodeURIComponent((companyName || '').trim())
  const off = OFFICIAL[p]
  return {
    openCorporatesUrl: `https://opencorporates.com/companies/${OC_JURIS[p]}?q=${q}`,
    officialUrl: off.url,
    officialLabelZh: off.zh,
    officialLabelEn: off.en,
  }
}

/** Best-effort province inference from a free-text address (postal code / name). */
export function inferProvince(address?: string | null): ProvinceCode | null {
  const t = (address || '').toUpperCase()
  if (!t) return null
  // Postal-code first letter → province is ambiguous, so match explicit tokens.
  if (/\bON\b|ONTARIO/.test(t)) return 'ON'
  if (/\bBC\b|BRITISH COLUMBIA/.test(t)) return 'BC'
  if (/\bAB\b|ALBERTA/.test(t)) return 'AB'
  if (/\bQC\b|QUEBEC|QUÉBEC/.test(t)) return 'QC'
  if (/\bMB\b|MANITOBA/.test(t)) return 'MB'
  if (/\bSK\b|SASKATCHEWAN/.test(t)) return 'SK'
  if (/\bNS\b|NOVA SCOTIA/.test(t)) return 'NS'
  if (/\bNB\b|NEW BRUNSWICK/.test(t)) return 'NB'
  if (/\bPE\b|PEI|PRINCE EDWARD/.test(t)) return 'PE'
  if (/\bNL\b|NEWFOUNDLAND/.test(t)) return 'NL'
  return null
}

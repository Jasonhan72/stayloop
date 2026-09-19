// LTB Order Catalogue lookup for screening.
//
// Source: Ontario Open Data, data.ontario.ca/dataset/ltb-order-catalogue.
// Contains information licensed under the Open Government Licence – Ontario.
//
// The classification here is the whole point of the module. Three rules, and
// each exists because getting it wrong harms a real applicant:
//
//  1. Only the TENANT SIDE of a LANDLORD-FILED (L) application is a risk signal.
//     A T1/T2/T6 is the tenant bringing a claim — illegal charges, tenant
//     rights, maintenance. Scoring someone down for having asserted their rights
//     under the RTA is retaliation by proxy and is exactly the "blacklist"
//     behaviour that makes tenant screening indefensible. Those matches are
//     surfaced as neutral context, never as a negative.
//
//  2. A match is a NAME match until an address corroborates it. The catalogue
//     holds 143,869 person-rows; common names collide. Only a hit whose rental
//     unit address lines up with an address the applicant themselves declared
//     is allowed to move the score.
//
//  3. A row proves an ORDER ISSUED, not an outcome. There is no disposition
//     field in the catalogue — Document Type is only Order / ExParte / Review /
//     Amended. "Evicted" and "owes rent" are not ours to say; we link the PDF.

import { addressParts, isSearchableName, nameKey, normalizeName } from './normalize'

/** Landlord-filed applications, by what they allege. */
const L_CODE_MEANING: Record<string, { en: string; zh: string }> = {
  L1: { en: 'Non-payment of rent', zh: '欠租' },
  L2: { en: 'Eviction (various grounds)', zh: '终止租约申请' },
  L3: { en: 'Tenant gave notice / agreed to end tenancy', zh: '租客已通知或同意终止' },
  L4: { en: 'Breach of a settlement or order', zh: '违反和解或命令' },
  L5: { en: 'Eviction — mobile home / land lease', zh: '流动房屋/土地租赁终止' },
  L9: { en: 'Rent arrears while tenancy continues', zh: '租约存续期间欠租' },
  L10: { en: 'Former tenant owes money', zh: '前租客欠款' },
}

/** Tenant-filed applications. Never a negative signal — see rule 1. */
const T_CODE_MEANING: Record<string, { en: string; zh: string }> = {
  T1: { en: 'Tenant claim — illegal charges', zh: '租客申诉：违法收费' },
  T2: { en: 'Tenant claim — tenant rights', zh: '租客申诉：租客权利' },
  T5: { en: 'Tenant claim — bad-faith notice', zh: '租客申诉：恶意通知' },
  T6: { en: 'Tenant claim — maintenance', zh: '租客申诉：维修' },
}

export interface LtbMatch {
  file_number: string
  document_id: string
  order_date: string
  application_codes: string[]
  application_type: string
  document_type: string | null
  party_side: 'respondent' | 'applicant' | 'coop'
  role: string
  person_name: string
  unit_address: string | null
  order_pdf_url: string | null
  match_kind: 'exact' | 'reordered' | 'subset' | 'fuzzy'
  similarity: number
  address_match: boolean
}

export interface LtbResult {
  status: 'ok' | 'skipped' | 'unavailable' | 'no_results'
  note?: string
  queried_name: string
  /** Landlord-filed applications naming the applicant as a tenant. */
  as_respondent: LtbMatch[]
  /** Applications the applicant themselves brought. Context only. */
  as_applicant: LtbMatch[]
  /**
   * Subset of as_respondent whose unit address matches an address the
   * applicant declared. Only these are allowed to affect the score.
   */
  corroborated: LtbMatch[]
  coverage: { from: string | null; to: string | null; orders: number | null }
  /** How many declared addresses corroboration was measured against — 0 means
   *  "nothing to compare", which the summary must state instead of implying a
   *  comparison ran and found nothing. */
  declared_count?: number
}

const TENANT_SIDE_ROLES = new Set(['tenant', 'former_tenant', 'sub_tenant', 'occupant'])

export function codeMeaning(code: string): { en: string; zh: string } | null {
  return L_CODE_MEANING[code] || T_CODE_MEANING[code] || null
}

/** Human-readable summary of what a set of codes alleges. */
export function describeCodes(codes: string[], lang: 'en' | 'zh'): string {
  const named = codes.map((c) => codeMeaning(c)?.[lang]).filter(Boolean) as string[]
  if (named.length) return `${codes.join('/')} — ${named.join('; ')}`
  return codes.join('/') || (lang === 'zh' ? '未标注申请类型' : 'application type not stated')
}

const addrTokens = (raw: string): string[] =>
  raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.'’`]/g, '')
    .replace(/\bSAINTE?\b/g, 'ST')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/**
 * The order's city as whole tokens — the first comma segment after the street
 * that is purely alphabetic once province / postal are removed ("UNIT 4, 25
 * KING ST, KITCHENER, ON" → KITCHENER, never "25 KING ST"). A city only counts
 * when it is ≥2 words or ≥4 letters: "ST", "YORK"-sized fragments prove nothing.
 */
export function orderCityTokens(unitAddress: string): string[] | null {
  const segs = unitAddress.split(',').slice(1)
  for (const seg of segs) {
    const toks = addrTokens(seg.replace(/[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/g, ' ')).filter((t) => !/^(ON|ONT|ONTARIO|CANADA|CA)$/.test(t))
    if (toks.length === 0) continue
    if (toks.some((t) => /\d/.test(t))) continue
    if (toks.length >= 2 || toks[0].length >= 4) return toks
    return null
  }
  return null
}

/** Tokens of a declared address AFTER its street part (after the first comma that follows the street key, or after the street word when there is no comma). */
export function declaredLocalityTokens(declared: string, key: string | null): string[] {
  const segs = declared.split(',')
  if (segs.length > 1) {
    // Skip leading segments up to and including the one holding the street.
    const streetWord = key ? key.split(' ')[1] : null
    let i = 0
    if (streetWord) {
      const at = segs.findIndex((x) => addrTokens(x).includes(streetWord))
      if (at >= 0) i = at
    }
    return addrTokens(segs.slice(i + 1).join(' '))
  }
  const toks = addrTokens(declared)
  const streetWord = key ? key.split(' ')[1] : null
  const at = streetWord ? toks.indexOf(streetWord) : -1
  return at >= 0 ? toks.slice(at + 1) : []
}

/**
 * The city must be the LAST place-name in the declared locality — province,
 * country and postal tokens aside — so YORK does not match "New York Mills"
 * and PORT does not match "Port Colborne".
 */
function localityEndsWith(locality: string[], city: string[]): boolean {
  if (city.length === 0) return false
  const place = locality.filter((t) => !/\d/.test(t) && !/^(ON|ONT|ONTARIO|CANADA|CA)$/.test(t))
  if (place.length < city.length) return false
  const tail = place.slice(place.length - city.length)
  return city.every((t, j) => tail[j] === t)
}

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>

/**
 * @param declaredAddresses addresses the applicant listed on their own
 *        application (screening parses these into
 *        cross_doc_verification.application_summary.prev_residences). The
 *        applied-for unit is deliberately NOT included — orders against that
 *        unit's previous tenants who share the name would corroborate falsely.
 *        These are what corroboration is measured against — never an address
 *        we inferred.
 */
export async function searchLtbOrders(
  rpc: Rpc,
  fullName: string,
  declaredAddresses: string[] = [],
): Promise<LtbResult> {
  const empty = { as_respondent: [], as_applicant: [], corroborated: [], coverage: { from: null, to: null, orders: null } }
  const norm = normalizeName(fullName)

  if (!isSearchableName(norm)) {
    return {
      status: 'skipped',
      note: norm
        ? 'Full name required (first + last). A single name matches too many people to report.'
        : 'No applicant name available',
      queried_name: norm,
      ...empty,
    }
  }

  const postals: string[] = []
  const streetKeys: string[] = []
  for (const a of declaredAddresses) {
    const p = addressParts(a)
    if (p.postal) postals.push(p.postal)
    if (p.key) streetKeys.push(p.key)
  }

  // Coverage is fetched alongside the search, not assumed. The catalogue only
  // holds 2026-01 → 2026-05 today and grows in phases, so a report that does not
  // state the window it searched is implying completeness it does not have —
  // "no LTB record" means nothing without "…in the five months we hold".
  const [{ data, error }, coverageRes] = await Promise.all([
    rpc('search_ltb_orders', {
      p_name: norm,
      p_key: nameKey(fullName),
      p_postals: postals,
      p_street_keys: streetKeys,
      p_limit: 25,
    }),
    // Supabase's .rpc() returns a thenable builder, not a Promise, so .catch is
    // not available on it until it has been awaited.
    Promise.resolve(rpc('ltb_coverage', {})).catch(() => ({ data: null, error: null })),
  ])

  const covRow = (Array.isArray(coverageRes?.data) ? coverageRes.data[0] : null) as
    | { coverage_from?: string; coverage_to?: string; order_count?: number }
    | null
  const coverage = {
    from: covRow?.coverage_from ?? null,
    to: covRow?.coverage_to ?? null,
    orders: typeof covRow?.order_count === 'number' ? covRow.order_count : Number(covRow?.order_count) || null,
  }

  if (error) {
    return { status: 'unavailable', note: 'LTB catalogue lookup failed', queried_name: norm, ...empty }
  }

  const rawRows = (Array.isArray(data) ? data : []) as LtbMatch[]

  // Rule 2¼ — the RPC's subset direction admits records whose tokens are a
  // subset of the query's ("DAVID MICHAEL PARK" query ⊇ record "DAVID
  // MICHAEL" — surname Michael, a different person). A subset match must
  // still carry the query's surname token; the other direction (record has
  // MORE tokens) contains it by construction and passes unchanged.
  //
  // Review 2026-09-19: the surname alone is not enough — record "MICHAEL PARK"
  // ⊆ query "DAVID MICHAEL PARK" kept the surname yet is a different person
  // (first name Michael). When the record has FEWER tokens than the query it
  // must also carry the query's first given name.
  const queryTokens = norm.split(' ').filter(Boolean)
  const querySurname = queryTokens[queryTokens.length - 1] || ''
  const queryGiven = queryTokens[0] || ''
  const rows = rawRows.filter((r) => {
    if (r.match_kind !== 'subset') return true
    const recTokens = normalizeName(r.person_name).split(' ').filter(Boolean)
    if (!recTokens.includes(querySurname)) return false
    if (recTokens.length < queryTokens.length && !recTokens.includes(queryGiven)) return false
    return true
  })

  // Rule 2½ — corroboration binding. The RPC's address_match accepts a bare
  // street-key equality ("25 KING") — but common street names exist in every
  // Ontario city, so "25 King St, Ottawa" must not corroborate an order at
  // "25 KING STREET W, KITCHENER". Recompute: a postal match corroborates on
  // its own (postals are city-unique, present on 98.6% of orders); a street
  // key only corroborates when the declared text also names the order's city.
  //
  // Review 2026-09-19: the city test used to be "first WORD of the order's
  // city is a substring of the declared text" — "ST" (ST CATHARINES) is inside
  // "25 King St W, Toronto", NORTH (NORTH YORK) inside "King St North,
  // Waterloo", likewise EAST / YORK / PORT. A corroborated hit is −30 /
  // decline, so the FULL city must appear as whole tokens in the part of the
  // declared address that follows the street.
  const strongAddressMatch = (unitAddress: string | null): boolean => {
    if (!unitAddress) return false
    const rp = addressParts(unitAddress)
    const rowCity = orderCityTokens(unitAddress)
    for (const d of declaredAddresses) {
      const dp = addressParts(d)
      if (rp.postal && dp.postal && rp.postal === dp.postal) return true
      if (rp.key && dp.key && rp.key === dp.key && rowCity && localityEndsWith(declaredLocalityTokens(d, dp.key), rowCity)) return true
    }
    return false
  }

  // Rule 1 — the landlord/agent rows in the catalogue share the same name space
  // as tenants. A landlord who happens to share the applicant's name is not a
  // signal about the applicant at all, so those rows are dropped outright.
  const tenantSide = rows
    .filter((r) => TENANT_SIDE_ROLES.has(r.role))
    // address_match is re-derived with the stronger binding so every display
    // surface ("ADDRESS CORROBORATED" badges) agrees with what actually gates.
    .map((r) => ({ ...r, address_match: strongAddressMatch(r.unit_address) }))

  const asRespondent = tenantSide.filter((r) => r.party_side === 'respondent')
  const asApplicant = tenantSide.filter((r) => r.party_side === 'applicant')
  const corroborated = asRespondent.filter((r) => r.address_match)

  return {
    status: rows.length === 0 ? 'no_results' : 'ok',
    queried_name: norm,
    as_respondent: asRespondent,
    as_applicant: asApplicant,
    corroborated,
    coverage,
    declared_count: declaredAddresses.length,
  }
}

/** " (catalogue covers 2026-01-02 to 2026-05-29, 40,838 orders)" — or '' if unknown. */
function coverageWindow(result: LtbResult, lang: 'en' | 'zh'): string {
  const { from, to, orders } = result.coverage
  if (!from || !to) return ''
  const n = orders ? orders.toLocaleString() : ''
  return lang === 'zh'
    ? `（目录当前收录 ${from} 至 ${to}${n ? ` 共 ${n} 份判令` : ''}）`
    : ` (catalogue currently covers ${from} to ${to}${n ? `, ${n} orders` : ''})`
}

/**
 * One line stating exactly what was found, at the strength the data supports.
 * Deliberately says "an order was issued" and never "was evicted" — see rule 3.
 */
export function summarizeLtb(result: LtbResult, lang: 'en' | 'zh'): string {
  const zh = lang === 'zh'
  if (result.status === 'skipped') {
    return zh
      ? '未提供完整姓名（需名 + 姓），单个姓名会匹配到过多同名者，不予检索。'
      : result.note || ''
  }
  if (result.status === 'unavailable') {
    return zh ? 'LTB 判令目录暂时无法查询。' : 'The LTB order catalogue could not be queried.'
  }
  if (result.as_respondent.length === 0) {
    const w = coverageWindow(result, lang)
    return zh
      ? `在已收录的 LTB 判令中，未发现以该姓名作为被申请租客的记录${w}。`
      : `No LTB order in the published catalogue names this person as a responding tenant${w}.`
  }

  const n = result.as_respondent.length
  const c = result.corroborated.length
  const codes = [...new Set(result.as_respondent.flatMap((r) => r.application_codes))]

  const noDeclared = (result.declared_count ?? 0) === 0
  if (zh) {
    const base = `已收录判令中有 ${n} 份以该姓名列为被申请租客（${describeCodes(codes, 'zh')}）。`
    if (c > 0) return `${base}其中 ${c} 份的房屋地址与申请人自报的居住地址吻合。判令目录不含判决结果，是否欠款/被终止租约需查看判令原件。`
    return noDeclared
      ? `${base}申请人未提供可比对的自报地址，无法进行地址佐证——姓名匹配可能是同名他人。判令目录不含判决结果，需查看原件核实。`
      : `${base}但没有一份的房屋地址与申请人自报地址吻合，可能是同名他人。判令目录不含判决结果，需查看原件核实。`
  }
  const base = `${n} published order(s) name this person as a responding tenant (${describeCodes(codes, 'en')}).`
  if (c > 0) return `${base} ${c} of them is at an address the applicant declared. The catalogue carries no outcome — read the order to see what was decided.`
  return noDeclared
    ? `${base} No declared addresses were available to compare against, so address corroboration could not run — a name match may be a namesake. The catalogue carries no outcome — read the order to see what was decided.`
    : `${base} None is at an address the applicant declared, so this may be a namesake. The catalogue carries no outcome — read the order to see what was decided.`
}

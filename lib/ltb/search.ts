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

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>

/**
 * @param declaredAddresses addresses the applicant listed on their own
 *        application (screening already parses these into
 *        cross_doc_verification.application_summary.prev_residences), plus the
 *        unit being applied for. These are what corroboration is measured
 *        against — never an address we inferred.
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

  const { data, error } = await rpc('search_ltb_orders', {
    p_name: norm,
    p_key: nameKey(fullName),
    p_postals: postals,
    p_street_keys: streetKeys,
    p_limit: 25,
  })

  if (error) {
    return { status: 'unavailable', note: 'LTB catalogue lookup failed', queried_name: norm, ...empty }
  }

  const rows = (Array.isArray(data) ? data : []) as LtbMatch[]

  // Rule 1 — the landlord/agent rows in the catalogue share the same name space
  // as tenants. A landlord who happens to share the applicant's name is not a
  // signal about the applicant at all, so those rows are dropped outright.
  const tenantSide = rows.filter((r) => TENANT_SIDE_ROLES.has(r.role))

  const asRespondent = tenantSide.filter((r) => r.party_side === 'respondent')
  const asApplicant = tenantSide.filter((r) => r.party_side === 'applicant')
  const corroborated = asRespondent.filter((r) => r.address_match)

  return {
    status: rows.length === 0 ? 'no_results' : 'ok',
    queried_name: norm,
    as_respondent: asRespondent,
    as_applicant: asApplicant,
    corroborated,
    coverage: { from: null, to: null, orders: null },
  }
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
    return zh
      ? '在已收录的 LTB 判令中，未发现以该姓名作为被申请租客的记录。'
      : 'No LTB order in the published catalogue names this person as a responding tenant.'
  }

  const n = result.as_respondent.length
  const c = result.corroborated.length
  const codes = [...new Set(result.as_respondent.flatMap((r) => r.application_codes))]

  if (zh) {
    const base = `已收录判令中有 ${n} 份以该姓名列为被申请租客（${describeCodes(codes, 'zh')}）。`
    return c > 0
      ? `${base}其中 ${c} 份的房屋地址与申请人自报的居住地址吻合。判令目录不含判决结果，是否欠款/被终止租约需查看判令原件。`
      : `${base}但没有一份的房屋地址与申请人自报地址吻合，可能是同名他人。判令目录不含判决结果，需查看原件核实。`
  }
  const base = `${n} published order(s) name this person as a responding tenant (${describeCodes(codes, 'en')}).`
  return c > 0
    ? `${base} ${c} of them is at an address the applicant declared. The catalogue carries no outcome — read the order to see what was decided.`
    : `${base} None is at an address the applicant declared, so this may be a namesake. The catalogue carries no outcome — read the order to see what was decided.`
}

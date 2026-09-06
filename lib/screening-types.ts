import type { CoherenceReview } from './screening/coherenceReview'
import type { ScreeningVerification } from './verify/types'
// Shared types for the screening module — single source of truth.
// Consumed by: app/screening/page.tsx, lib/generateReport.ts, app/api/screen-score/route.ts

export interface OntarioPortalMatch {
  caseNumber: string
  caseTitle: string
  caseCategory: string
  filedDate: string
  partyRole: string
  partyDisplayName: string
  courtAbbreviation: string
  closedFlag: boolean
  nameSwapped?: boolean
  caseInstanceUUID?: string
  courtID?: string
}

export interface CanLIIMatch {
  title: string
  citation: string
  url: string
  databaseId: string
  databaseName?: string
  caseId: string
  nameInTitle?: boolean
}

export interface CourtQuery {
  source: string
  tier: 'free' | 'pro'
  status: 'ok' | 'unavailable' | 'skipped' | 'coming_soon' | 'timeout'
  hits: number | null
  /**
   * What a hit on this row IS. 'party' (and legacy undefined) — a record naming
   * this person as a litigant; may reach gates/caps. 'mention' — a page that
   * merely contains the name (web-index search of canlii.org); display-only,
   * never counted into total_hits and never scored.
   */
  hitKind?: 'party' | 'mention'
  url?: string
  note?: string
  severity?: number
  records?: CanLIIMatch[]
  portalRecords?: OntarioPortalMatch[]
  indexRecords?: CanliiIndexMatch[]
}

/**
 * A canlii.org decision page that MENTIONS the applicant's name, found via a
 * public web-search index — not via CanLII's API (which cannot search by name)
 * and not by scraping canlii.org. A mention is NOT a party record: this type
 * deliberately carries none of the fields (`nameInTitle`, `databaseId`) that
 * countDebtRelevantHits() reads, so even a wiring mistake cannot score it.
 */
export interface CanliiIndexMatch {
  title: string
  url: string
  snippet: string
}

/**
 * A person named on a published LTB order (Ontario Open Data LTB Order
 * Catalogue). Note what this type does NOT carry: an outcome. The catalogue has
 * no disposition field, so nothing downstream may render "evicted" or "owes".
 */
export interface LtbOrderMatch {
  file_number: string
  document_id: string
  order_date: string
  application_codes: string[]
  application_type: string
  document_type: string | null
  /** respondent = a landlord filed against them; applicant = they filed. */
  party_side: 'respondent' | 'applicant' | 'coop'
  role: string
  person_name: string
  unit_address: string | null
  order_pdf_url: string | null
  match_kind: 'exact' | 'reordered' | 'subset' | 'fuzzy'
  similarity: number
  /** True when the order's unit address matches one the applicant declared. */
  address_match: boolean
}

export interface LtbCheck {
  status: 'ok' | 'skipped' | 'unavailable' | 'no_results'
  queried_name: string
  /** Landlord-filed applications naming the applicant as a tenant. */
  as_respondent: LtbOrderMatch[]
  /** Applications the applicant brought themselves — context, never a penalty. */
  as_applicant: LtbOrderMatch[]
  /** as_respondent entries corroborated by a declared address. Scoring-eligible. */
  corroborated: LtbOrderMatch[]
  summary_en: string
  summary_zh: string
  coverage: { from: string | null; to: string | null; orders: number | null }
}

export interface AiFlag {
  type: 'danger' | 'warning' | 'info' | 'success'
  text_en: string
  text_zh: string
}

export type V3DimKey = 'ability_to_pay' | 'credit_health' | 'rental_history' | 'verification' | 'communication'

export interface V3Scores {
  ability_to_pay: number
  credit_health: number
  rental_history: number
  verification: number
  communication: number
}

export const V3_WEIGHTS: Record<V3DimKey, number> = {
  ability_to_pay: 0.40,
  credit_health: 0.25,
  rental_history: 0.20,
  verification: 0.10,
  communication: 0.05,
}

export interface CreditReport {
  /** Set when a deterministic check proves the report cannot be this
   *  applicant's (e.g. accounts opened before they were 16). The report is
   *  still transcribed for the landlord to see, but it is not evidence. */
  unreliable?: boolean
  unreliable_reason_zh?: string
  unreliable_reason_en?: string
  bureau?: string | null
  credit_score?: number | null
  score_band?: string | null
  report_date?: string | null
  tradelines?: Array<{
    creditor: string; type: string; date_opened: string
    balance: number | null; high_credit: number | null
    /**
     * The assigned credit limit, distinct from high_credit (the highest
     * balance ever carried). The distinction is load-bearing: a real case had
     * a Visa at $10,470 against a $10,000 limit — 104.7% utilised, over
     * limit — that read as UNDER its $11,664 high_credit. Utilisation and
     * over-limit checks prefer this and fall back to high_credit only when
     * the report does not print a limit.
     */
    credit_limit?: number | null
    past_due?: number | null; payment_status: string; late_30_60_90: string
  }>
  collections?: Array<{ creditor: string; date_assigned: string; original_amount: number | null; balance: number | null }>
  bankruptcies?: Array<{ date_filed: string; type: string; amount: number | null; disposition: string }>
  inquiries?: Array<{ date: string; creditor: string }>
  total_debt?: number | null
  monthly_debt_payments?: number | null
  /**
   * Model-written analysis paragraph citing SPECIFIC accounts (2026-08-25,
   * SingleKey comparison). The arithmetic layer (utilisation, DTI,
   * delinquency roll-ups) is deterministic — lib/screening/creditAnalysis.ts;
   * this is only the reading a human analyst would add on top.
   */
  analysis_en?: string | null
  analysis_zh?: string | null
  /**
   * The bureau's Employment section (current/previous employer), transcribed
   * verbatim. Self-reported to lenders and often stale — but INDEPENDENT of
   * this application's documents, which is what makes it evidence: a real case
   * claimed a $12,500/mo manager role at one company while the bureau file
   * said that employer was PREVIOUS and the current one was a fast-food chain.
   */
  employment?: { current?: string | null; previous?: string | null } | null
}

// Cross-document evidence verification (2026-07 — v3 prompt addition).
// Emitted by the scoring model, sanitized server-side, persisted inside
// ai_dimension_notes._v3.cross_doc_verification. ALL fields optional so old
// reports (which predate this block) reconstruct cleanly with null.
export interface CrossDocVerification {
  bank_accounts?: Array<{
    holder_name: string
    entity_type: 'personal' | 'business'
    is_applicant: boolean
    statement_period?: string | null
  }>
  income_corroboration?: {
    claimed_monthly: number | null
    personal_payroll_seen: boolean
    observed_pattern: string
    verdict: 'corroborated' | 'partial' | 'uncorroborated'
    detail: string
  } | null
  related_party?: {
    suspected: boolean
    signals: string[]
  } | null
  /**
   * Who signed the employment letter, and the title printed beside the
   * signature. Feeds deep-check's arm's-length verification: a signer titled
   * "Director/Owner" whose surname is a family variant of the applicant's is
   * the non-arm's-length finding, straight from the letter — no registry
   * needed (CBR publishes no directors; OpenCorporates needs a paid token).
   */
  employment_letter_signatory?: { name?: string | null; title?: string | null } | null
  application_summary?: {
    applying_rent: number | null
    prev_residences: Array<{
      address: string
      period: string
      landlord_name: string
      landlord_phone: string
    }>
    vacating_reason: string | null
    vehicles: string[]
    blank_sections: string[]
  } | null
  suspicious_transfers?: string[]
  verification_checklist?: string[]
}

export interface ArmLengthCheck {
  employer_name: string
  company_info: {
    name: string
    company_number: string | null
    jurisdiction: string | null
    incorporation_date: string | null
    status: string | null
    registered_address: string | null
    company_type: string | null
    officers: Array<{ name: string; position: string }>
    registry_url: string | null
    source: string
  } | null
  is_numbered_company: boolean
  is_recently_incorporated: boolean
  applicant_is_officer: boolean
  applicant_lastname_match: boolean
  company_address_matches_applicant: boolean
  arm_length_risk: 'high' | 'medium' | 'low' | 'clean'
  flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string }>
}

export interface ForensicsDetail {
  severity: string
  hard_gates: string[]
  elapsed_ms?: number
  all_flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string; file?: string }>
  per_file: Array<{
    file_name: string
    file_kind: string
    mime?: string
    pdf_metadata?: {
      title?: string | null
      producer: string | null
      creator?: string | null
      creation_date?: string | null
      modification_date?: string | null
      page_count: number
      file_size_bytes: number
    } | null
    text_density?: {
      total_chars?: number
      page_count?: number
      chars_per_page: number
      is_likely_image_pdf: boolean
      text_sample?: string
    } | null
    ocr?: {
      text: string
      apparent_doc_type?: string
      apparent_name?: string | null
      visible_issuer?: string | null
    } | null
    paystub_math?: {
      extraction?: {
        annual_salary?: number | null
        ytd_gross?: number | null
        pay_date?: string | null
        employer_name?: string | null
      } | null
      expected_ytd_gross?: number | null
      ytd_ratio?: number | null
      period_math_error_pct?: number | null
    } | null
    source_specific?: {
      equifax_authentic_markers?: boolean | null
      bank_producer_whitelisted?: boolean | null
      matched_bank?: string | null
    } | null
    flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string; file?: string }>
  }>
  cross_doc_flags: Array<{ code: string; severity: string; evidence_en: string; evidence_zh: string; file?: string }>
  cross_doc?: {
    entities?: {
      names?: Array<{ value: string; from: string } | string>
      phones?: Array<{ value: string; from: string } | string>
      emails?: Array<{ value: string; from: string } | string>
      addresses?: Array<{ value: string; from: string } | string>
      employers?: Array<{ value: string; from: string } | string>
    }
    hr_phone_collision?: boolean
    deposit_paystub_perfect_match?: boolean
  } | null
}

export interface ScoreResult {
  overall: number
  scores: {
    doc_authenticity: number
    payment_ability: number
    court_records: number
    stability: number
    behavior_signals: number
    info_consistency: number
  }
  notes: Record<string, string>
  details_en?: Record<string, string> | null
  details_zh?: Record<string, string> | null
  flags?: AiFlag[]
  detected_document_kinds?: string[]
  detected_monthly_income?: number | null
  effective_monthly_income?: number | null
  income_evidence?: string | null
  monthly_rent?: number | null
  income_rent_ratio?: number | null
  extracted_name: string
  name_was_extracted: boolean
  summary: string
  summary_en?: string
  summary_zh?: string
  court_summary_en?: string
  court_summary_zh?: string
  court_records_detail: { queries: CourtQuery[]; total_hits: number; queried_name: string }
  /** LTB Order Catalogue result — null when the source was unavailable or the run predates it. */
  ltb_check?: LtbCheck | null
  /** Deterministic rubric result — the rules that produced the score. Null on runs predating it. */
  rubric?: unknown
  tier: 'free' | 'pro'
  model_version?: string
  scores_v3?: Record<string, number>
  v3_tier?: 'approve' | 'conditional' | 'decline'
  tier_reason?: string
  hard_gates_triggered?: string[]
  red_flags?: string[]
  red_flag_penalty?: number
  gate_cap?: number
  evidence_coverage?: number
  sub_coverage?: Record<string, string>
  identity_match_score?: number | null
  bank_min_balance?: number | null
  credit_report?: CreditReport | null
  action_items?: {
    id: string; dimension: string
    title_en: string; title_zh: string
    details_en: string; details_zh: string
    impact_on_score: string; status: string
  }[]
  compliance_audit?: {
    protected_grounds_observed?: string[]
    protected_grounds_used_in_scoring?: string[]
    hrc_compliant?: boolean
    reviewer_note?: string
  } | null
  forensics_detail?: ForensicsDetail | null
  /** AI document coherence review (lib/screening/coherenceReview.ts). */
  coherence_review?: CoherenceReview | null
  forensics_penalty?: number
  forensics_zeroed_dims?: string[]
  cross_doc_verification?: CrossDocVerification | null
  // Applicant-authorised third-party verification snapshot (2026-09) —
  // facts, not inference. Null on screenings without a completed link.
  verification?: ScreeningVerification | null
  screening_id?: string
  file_count?: number
  deep_check_result?: {
    checks: ArmLengthCheck[]
    overall_risk: 'high' | 'medium' | 'low' | 'clean'
    total_flags: number
    checked_at: string
  } | null
}

export function scoreColor(s: number): string {
  if (s >= 80) return '#16A34A'
  if (s >= 60) return '#65A30D'
  if (s >= 40) return '#A16207'
  if (s >= 20) return '#C2410C'
  return '#DC2626'
}

export function sevColor(sev: string): string {
  switch (sev) {
    case 'critical': return '#DC2626'
    case 'high': return '#EA580C'
    case 'medium': return '#D97706'
    case 'info': return '#047857'
    default: return '#9FBBD0'
  }
}

export const SCORE_BANDS = [
  { min: 0,  max: 29,  zh: '高危',   en: 'High Risk',   color: '#DC2626' },
  { min: 30, max: 49,  zh: '有风险', en: 'Risky',       color: '#C2410C' },
  { min: 50, max: 69,  zh: '需审查', en: 'Review',      color: '#A16207' },
  { min: 70, max: 84,  zh: '较安全', en: 'Mostly Safe', color: '#65A30D' },
  { min: 85, max: 100, zh: '优质',   en: 'Safe',        color: '#16A34A' },
] as const

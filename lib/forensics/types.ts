// -----------------------------------------------------------------------------
// Stayloop Document Forensics — shared types
//
// All forensics modules return ForensicFlag[] objects that the orchestrator
// (lib/forensics/index.ts) collects into a ForensicsReport. The report is then:
//   1. Persisted to screenings.forensics_detail (jsonb)
//   2. Injected into the Claude prompt as "hard evidence already verified"
//   3. Used by the route to apply forensics-derived hard gates
//   4. Rendered by the ForensicsCard component in the UI
// -----------------------------------------------------------------------------

/** 'info' = authenticity-POSITIVE corroboration (statutory deductions at legal
 *  max, LOE↔stub income agreement, payroll pre-generation rhythm). Weight 0 in
 *  severity scoring and score penalties — it documents evidence FOR the
 *  applicant, mirroring how a human forensic pass upgrades/downgrades warnings
 *  instead of only accumulating suspicion. */
export type FlagSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface ForensicFlag {
  /** snake_case flag code, e.g. "pdf_producer_preview" */
  code: string
  severity: FlagSeverity
  /** the file this flag applies to (basename); omit for cross-doc flags */
  file?: string
  /** human-readable evidence in English (cite specific values) */
  evidence_en: string
  /** human-readable evidence in Chinese */
  evidence_zh: string
}

export interface PdfMetadataResult {
  title: string | null
  author: string | null
  subject: string | null
  producer: string | null
  creator: string | null
  creation_date: string | null  // ISO 8601
  modification_date: string | null  // ISO 8601
  page_count: number
  file_size_bytes: number
  /** pdf-lib (the strict parser) could not parse the file; fields above
   *  were recovered by the tolerant deep scan. Typical of edited/re-saved
   *  files — disclosed as a flag, never silently swallowed. */
  parse_failed?: boolean
  /** The file is encrypted (standard security handler). Strings and
   *  streams were decrypted with the EMPTY user password when possible —
   *  bank/bureau/payroll exports are never password-protected, so this is
   *  a disclosure in its own right. */
  encrypted?: boolean
  /** Distinct /Encrypt dictionaries referenced by trailers: >1 means an
   *  incremental update RE-encrypted the file — i.e. it was edited and
   *  re-saved with protection on. */
  encrypt_dict_count?: number
  /** Distinct Info-dictionary revisions found in the byte stream (an
   *  incremental update appends a new Info; >1 = the file has a revision
   *  history). */
  info_revisions?: number
}

export interface TextDensityResult {
  total_chars: number
  page_count: number
  chars_per_page: number
  /** true when text density is below 50 chars/page — strong signal of image-only PDF */
  is_likely_image_pdf: boolean
  /** the first 200 chars of extracted text, used for source-specific fingerprinting */
  text_sample: string
}

export interface PaystubExtraction {
  annual_salary: number | null
  hourly_rate: number | null
  hours_worked: number | null
  pay_date: string | null  // ISO date
  pay_period_start: string | null
  pay_period_end: string | null
  period_gross: number | null
  period_net: number | null
  ytd_gross: number | null
  ytd_net: number | null
  employer_name: string | null
  employer_phone: string | null
  pay_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | null
  /** YTD employee CPP/QPP contribution as printed (statutory recomputation) */
  cpp_ytd: number | null
  /** YTD employee CPP2 (second additional CPP) contribution */
  cpp2_ytd: number | null
  /** YTD employee EI premium */
  ei_ytd: number | null
  /** this period's employee CPP/QPP contribution */
  cpp_period: number | null
  /** this period's employee EI premium */
  ei_period: number | null
}

export interface PaystubMathResult {
  extraction: PaystubExtraction
  /** expected YTD gross based on annual_salary × elapsed_year_fraction */
  expected_ytd_gross: number | null
  /** ratio of actual_ytd / expected_ytd; >1.5 or <0.5 is suspicious */
  ytd_ratio: number | null
  /** period_gross derived from hourly × hours; should ≈ stated period_gross */
  derived_period_gross: number | null
  /** percentage difference between derived and stated period_gross */
  period_math_error_pct: number | null
}

export interface CrossDocEntities {
  phones: Array<{ value: string; from: string }>
  emails: Array<{ value: string; from: string }>
  addresses: Array<{ value: string; from: string }>
  names: Array<{ value: string; from: string }>
  employers: Array<{ value: string; from: string }>
  deposit_amounts: Array<{ value: number; from: string }>
}

export interface CrossDocResult {
  entities: CrossDocEntities
  /** count of distinct phone numbers seen */
  unique_phones: number
  /** if employer letter phone matches application phone */
  hr_phone_collision: boolean
  /** if any deposit amount exactly matches paystub period_net */
  deposit_paystub_perfect_match: boolean
}

export interface SourceSpecificResult {
  /** if doc was claimed to be a credit_report, did it contain Equifax markers? */
  equifax_authentic_markers: boolean | null
  /** if doc was claimed to be a bank_statement, was Producer in known-bank whitelist? */
  bank_producer_whitelisted: boolean | null
  /** the known-bank whitelist match, if any */
  matched_bank: string | null
  /** payroll provider recognised from text/producer (ADP, Humi, …) */
  matched_payroll?: string | null
}

/**
 * Result of image-OCR pass (Haiku Vision) on image-only PDFs / images.
 * Used when text_density indicates is_likely_image_pdf=true so downstream
 * forensics (id-validation, cross-doc entity extraction) can still run.
 */
export interface OcrResult {
  /** All printed text, line-broken with \n. Cap at 5000 chars. */
  text: string
  /** Detected document type, e.g. "Ontario driver's licence" / "unknown" */
  apparent_doc_type: string
  /** Cardholder / applicant name as printed (best effort) */
  apparent_name: string | null
  /** Issuing authority — e.g. "Service Ontario", "Government of Canada" */
  visible_issuer: string | null
  /** True if anti-tamper watermarks / holograms / security patterns visible */
  has_watermark: boolean
  /** Any dates printed on the document, as printed */
  visible_dates: string[]
  /** ms spent on the OCR call */
  elapsed_ms: number
}

export interface PdfStructureResult {
  has_pdflib_marker: boolean
  pdflib_version: string | null
  eof_count: number
  has_incremental_updates: boolean
  embedded_font_names: string[]
  font_count: number
  has_mixed_font_families: boolean
  creation_tool_fingerprint: string | null
  enterprise_system: string | null
}

export interface BenfordResult {
  sample_size: number
  leading_digit_distribution: number[]
  chi_squared: number | null
  trailing_round_pct: number | null
  trailing_sample_size: number
}

export interface PerFileForensics {
  file_name: string
  file_kind: string
  mime: string
  pdf_metadata?: PdfMetadataResult
  text_density?: TextDensityResult
  pdf_structure?: PdfStructureResult
  benford?: BenfordResult
  paystub_math?: PaystubMathResult
  source_specific?: SourceSpecificResult
  /** Haiku image-OCR output for image-only PDFs / image documents. */
  ocr?: OcrResult
  flags: ForensicFlag[]
  /** ms spent on this file */
  elapsed_ms: number
}

export type ForensicsSeverity = 'clean' | 'suspicious' | 'likely_fraud' | 'fraud'

export interface ArmLengthCompanyInfo {
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
}

export interface ArmLengthCheckResult {
  employer_name: string
  company_info: ArmLengthCompanyInfo | null
  is_numbered_company: boolean
  is_recently_incorporated: boolean
  applicant_is_officer: boolean
  applicant_lastname_match: boolean
  company_address_matches_applicant: boolean
  arm_length_risk: 'high' | 'medium' | 'low' | 'clean'
  flags: ForensicFlag[]
}

export interface ForensicsReport {
  per_file: PerFileForensics[]
  cross_doc: CrossDocResult
  cross_doc_flags: ForensicFlag[]
  /** all flags from per_file and cross_doc, deduplicated */
  all_flags: ForensicFlag[]
  /** forensics-derived hard gates (deterministic, do not need AI confirmation) */
  hard_gates: string[]
  /** overall fraud severity */
  severity: ForensicsSeverity
  /** total ms across all files */
  elapsed_ms: number
  /** schema version for migration tracking */
  schema_version: 1
  /** arm's-length employment check results (populated by deep check) */
  arm_length?: ArmLengthCheckResult[]
  /** Base-pass registry lookups (name-only) — lets downstream checks compare
   *  claimed employment dates with the employer's incorporation date. */
  employer_registry?: Array<{ employer: string; matched_name: string; status: string | null; incorporation_date: string | null; jurisdiction: string | null }>
}

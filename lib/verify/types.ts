// Applicant-authorised verification — shared shapes (design/verification-flow-plan.md).
//
// One request = one invitation link for one screening. Three steps share one
// consent. Every step is independently skippable; a skipped step is simply an
// absent fact, never a negative one.

export type VerifyStepKey = 'id' | 'bank' | 'credit'

export type VerifyStepStatus =
  | 'not_configured' // provider env missing — shown as "未开通"
  | 'pending'        // available, not started
  | 'started'        // provider session created
  | 'submitted'      // applicant finished the provider flow; awaiting decision/data
  | 'verified'       // provider returned a usable, positive result
  | 'failed'         // provider returned a negative / unusable result
  | 'skipped'

export type IdResult = {
  decision: 'approved' | 'declined' | 'resubmission_requested' | 'expired' | 'abandoned' | 'review'
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null      // YYYY-MM-DD
  document_type?: string | null      // PASSPORT | DRIVERS_LICENSE | ID_CARD | RESIDENCE_PERMIT
  document_country?: string | null
  document_last4?: string | null     // never the full number
  reason?: string | null
}

export type BankAccountSummary = {
  title: string | null
  masked_number: string | null       // last 4 only
  category: string | null            // Operations | Credits | ...
  type: string | null
  currency: string | null
  holder_name: string | null
  balance_current: number | null
  balance_available: number | null
  transactions_count: number
  first_txn_date: string | null
  last_txn_date: string | null
}

export type RecurringDeposit = {
  label: string                      // normalised counterparty / description
  occurrences: number
  avg_amount: number
  avg_interval_days: number
  monthly_equivalent: number
  last_date: string
}

export type BankResult = {
  institution: string | null
  accounts: BankAccountSummary[]
  holder_names: string[]
  window_days: number
  total_credits: number
  total_debits: number
  recurring_deposits: RecurringDeposit[]
  payroll_monthly_estimate: number | null   // sum of monthly_equivalent over payroll-like deposits
  nsf_count: number
  closing_balance_total: number | null
}

export type CreditResult = {
  provider: string
  bureau: string | null
  score: number | null
  report_date: string | null
  summary: Record<string, unknown> | null
}

export type VerifyStep<R = unknown> = {
  status: VerifyStepStatus
  provider: string | null
  session_id?: string | null
  result?: R | null
  sandbox?: boolean
  error?: string | null
  updated_at: string
}

export type VerifySteps = {
  id?: VerifyStep<IdResult>
  bank?: VerifyStep<BankResult>
  credit?: VerifyStep<CreditResult>
}

export type VerifyRequestStatus = 'pending' | 'consented' | 'complete' | 'expired' | 'declined'

export type VerifyConsent = {
  version: string
  accepted_at: string
  typed_name: string
  ua?: string | null
}

export type VerificationRequestRow = {
  id: string
  token: string
  screening_id: string
  landlord_id: string
  landlord_name: string | null
  tenant_name: string | null
  tenant_email: string | null
  status: VerifyRequestStatus
  consent: VerifyConsent | null
  steps: VerifySteps
  expires_at: string
  created_at: string
  updated_at: string
}

// What the public /verify/<token> page is allowed to see. No landlord id, no
// screening id, no raw provider payloads — only enough to drive the UI.
export type VerifyPublicView = {
  ok: true
  status: VerifyRequestStatus
  landlord_name: string | null
  tenant_name: string | null
  consent_version: string
  consented: boolean
  expires_at: string
  steps: Record<VerifyStepKey, { status: VerifyStepStatus; provider: string | null; sandbox: boolean; summary: string | null }>
}

// Snapshot written to screenings.verification when a request completes (or
// whenever a step lands) — what scoring and the report read.
export type ScreeningVerification = {
  request_id: string
  consent_version: string
  consented_at: string
  updated_at: string
  sandbox: boolean
  id: (IdResult & { status: VerifyStepStatus }) | null
  bank: (BankResult & { status: VerifyStepStatus }) | null
  credit: (CreditResult & { status: VerifyStepStatus }) | null
}

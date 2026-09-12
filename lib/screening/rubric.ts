// Deterministic scoring rubric.
//
// WHY THIS EXISTS
// Six runs of the same applicant, same documents, scored 19, 22, 22, 24, 27, 28.
// The arithmetic was never the problem — it is
//     score = Σ(dimension × weight) − penalty
// and it reproduces exactly. The problem is that every number fed into it was a
// free-hand judgement the model emitted in the same JSON blob as its prose:
// ability_to_pay came back 38 / 42 / 48 across runs, verification 32 / 35 / 38,
// the red-flag list 2 or 3 entries. Nothing anchors 42 rather than 48, so
// nothing holds it still. temperature:0 does not help — it is already set, and
// it cannot pin a number the model has no rule for.
//
// Meanwhile the EXTRACTION was stable and good: credit score 669, every
// tradeline balance and limit, monthly_debt_payments 1159, collections settled
// at $0 — the same facts a careful human analyst works from, pulled out
// correctly on every single run.
//
// So the fix is not a better prompt. It is to stop asking the model to score.
// The model extracts facts; this module turns facts into numbers by published
// rule. Same documents → same facts → same score, every time.
//
// THREE RULES THIS ENCODES THAT THE OLD MODEL GOT WRONG
//  1. Unverified income is not income. The old report showed "6.0x 收入/租金比"
//     in its headline from a figure whose only source was the applicant's own
//     employment letter, while the body of the same report said there was no
//     personal-account trail for it. A ratio computed from an unverified number
//     is not a measurement, and it is not allowed to lift ability_to_pay here.
//  2. Missing evidence is not good evidence. The old model scored
//     rental_history 62–72 for an applicant with ZERO landlord references and no
//     verifiable address — absence of a bad record read as a good record. An
//     unknown is scored as unknown, and it caps the dimension.
//  3. Only facts that were actually measured may move a dimension. Every rule
//     below names the field it read, and a rule whose input is missing does not
//     fire — it records an unknown instead of quietly assuming a default.

import type { CreditReport, CrossDocVerification } from '../screening-types'

export type DimKey = 'ability_to_pay' | 'credit_health' | 'rental_history' | 'verification'

/**
 * `communication` is deliberately absent. It carried 5% weight and scored
 * 52–55 on every run of every applicant, because there is nothing in a pile of
 * PDFs that measures how someone communicates. It contributed noise with a
 * decimal point on it. Ability to pay carries its weight.
 */
export const RUBRIC_WEIGHTS: Record<DimKey, number> = {
  ability_to_pay: 0.42,
  credit_health: 0.26,
  rental_history: 0.20,
  verification: 0.12,
}

export interface RubricFacts {
  /** A deterministic check proved the bureau report cannot be this
   *  applicant's (accounts opened in childhood, etc.). Scored as a hard
   *  negative, not as unknown: the applicant submitted it as theirs. */
  creditReportUnreliable?: boolean
  monthly_rent: number | null
  /** What the applicant CLAIMS, from the form or an employment letter. */
  claimed_monthly_income: number | null
  /**
   * Corroborated by a personal-account payroll trail, T4 or NOA. Null means
   * "not established" — which is different from zero and is treated as such.
   */
  verified_monthly_income: number | null
  credit: CreditReport | null
  crossDoc: CrossDocVerification | null
  /** Landlord-filed LTB orders corroborated by a declared address. */
  ltbCorroborated: number
  /**
   * Court records where the applicant is the DEFENDANT/DEBTOR — not a raw hit
   * count. This distinction is load-bearing: `court_records_detail.total_hits`
   * counts every name match across every database, including cases where the
   * applicant is the plaintiff and including plain namesakes. Feeding that in
   * penalises people for sharing a name with a litigant, which is the same
   * mistake the LTB module exists to avoid.
   *
   * Derive it from the gates screen-score already computes by party role:
   *   court_record_defendant_multi → 2, court_record_defendant → 1, else 0.
   * See courtDefendantHitsFromGates().
   */
  courtDefendantHits: number
  /** Prior-landlord references with a contactable name AND phone. */
  landlordRefs: number
  /** Distinct prior addresses the applicant declared. */
  declaredAddresses: number
  /** Document kinds present, e.g. ['id','paystub','bank_statement']. */
  documentKinds: string[]
  /** Cross-document contradictions found by forensics, by code. */
  contradictions: string[]
  /** Forensics judged a document forged. */
  forgedDocuments: number
  /** Application form fields left blank. */
  blankApplicationFields: number
  /** The application form carries the applicant's signature. */
  applicationSigned: boolean | null
  /**
   * Days between the credit report's own report_date and the screening run.
   * Null when no report or no legible date. A report describes the person AS
   * OF its date and nothing after: a real case scored credit_health 95 from a
   * clean bureau pull that was 22 months old — and predated the applicant
   * becoming a defendant in an active court case. Staleness is measured here
   * deterministically, not left to the model to notice.
   */
  creditReportAgeDays: number | null

  // ── Measured facts added 2026-09-12 (deterministic; all optional so older
  //    callers and fixtures keep scoring) ──────────────────────────────────
  /** Backend-verified corroboration codes (payroll processor recognised,
   *  deposits equal stub net, employer registry active, statutory deductions
   *  at cap, bonus reconciled …). Only codes in CORROBORATION_CODES count. */
  corroborations?: string[]
  /** Deterministic cross-document contradictions with their severity — from
   *  lib/forensics, never from the model's free-hand red flags. When present
   *  this replaces `contradictions` for scoring. */
  contradictionDetails?: Array<{ code: string; severity: 'critical' | 'high' | 'medium' | 'low' }>
  /** ID-document name covers the applicant name (token match). Null = no ID. */
  identityConsistent?: boolean | null
  /** Liquidity read off running-balance statements. */
  liquidity?: { minBalance: number | null; nsfCount: number } | null
  /** A rent-shaped recurring payment observed on the statements. */
  currentRentPaid?: number | null
  rentPaymentMonths?: number | null
  /** Months since the employment start date a letter / form states. */
  employmentMonths?: number | null
  /** Sum of months across the declared residence periods. */
  declaredTenureMonths?: number | null
  /** Credit-file depth and payment behaviour (from lib/screening/creditAnalysis). */
  creditPastDue?: number | null
  creditLateAccounts?: number | null
  hardInquiries12mo?: number | null
  tradelineCount?: number | null
  creditHistoryMonths?: number | null
}

/** Corroboration codes that may lift the verification dimension. Every one is
 *  emitted by deterministic code on measured document facts. */
export const CORROBORATION_CODES = new Set([
  'payroll_processor_recognized',
  'deposits_match_paystub_net',
  'employer_registry_active',
  'paystub_deductions_at_legal_max',
  'cross_doc_bonus_corroborated',
  'bonus_deposit_reconciled',
  'cross_doc_income_corroborated',
  'employer_counterparty_on_statement',
  'paystub_ytd_one_off_reconciled',
])

/** Application blanks that a single applicant is not expected to fill. */
export function countMaterialBlanks(blankSections: string[]): number {
  return blankSections.filter(b => !/(second|2nd|co-?applicant|spouse|partner|guarantor|additional|other\s+occupant|emergency\s+contact)/i.test(b)).length
}

export interface RuleHit {
  dim: DimKey
  /** Stable identifier — safe to assert on in tests and to translate. */
  code: string
  /** Signed contribution actually applied. */
  delta: number
  /** The measured value this fired on, for the report to cite. */
  observed: string
}

export interface RubricResult {
  dimensions: Record<DimKey, number>
  /** Dimensions with no measurable input. Reported as unknown, not as a score. */
  unknown: DimKey[]
  hits: RuleHit[]
  overall: number
  band: 'decline' | 'conditional' | 'review' | 'proceed'
  /** Fraction of dimensions backed by measured facts. */
  evidenceCoverage: number
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

/**
 * Revolving utilisation across all open revolving tradelines.
 *
 * Denominator preference: the ASSIGNED credit limit when the extraction has
 * it, falling back to `high_credit` (the highest balance ever carried) only
 * when it does not. The two are different numbers and the difference decides
 * whether over-limit is even detectable: a real case had a Visa at $10,470
 * against a $10,000 limit — 104.7% utilised, over limit — that read as UNDER
 * its $11,664 high_credit, so the fallback can never fire the over-limit rule
 * (a balance above its own historical maximum is a near-contradiction). The
 * fallback only understates, so it cannot manufacture a penalty; it can only
 * be kind.
 */
export function revolvingUtilisation(credit: CreditReport | null): { used: number; limit: number; pct: number | null; overLimit: number } {
  const lines = (credit?.tradelines ?? []).filter((t) => /revolving/i.test(t.type || ''))
  let used = 0
  let limit = 0
  let overLimit = 0
  for (const t of lines) {
    const bal = Number(t.balance) || 0
    const cap = Number(t.credit_limit) || Number(t.high_credit) || 0
    // A line with a balance but NO usable denominator is excluded from BOTH
    // sides — adding its balance to `used` while adding 0 to `limit` would
    // overstate the pooled percentage (one $5,000 no-limit line against a
    // $10,000-limit card at $100 reads 51% instead of 1%). Excluding it
    // understates at worst, which is the kind direction.
    if (cap <= 0) continue
    used += bal
    limit += cap
    if (bal > cap) overLimit++
  }
  return { used, limit, pct: limit > 0 ? used / limit : null, overLimit }
}

/**
 * Income actually usable for an affordability ratio.
 *
 * Returns null when nothing corroborates the figure. The caller must not fall
 * back to the claimed number — that is the specific mistake this replaces.
 */
export function usableIncome(f: RubricFacts): { monthly: number | null; basis: 'verified' | 'unverified' } {
  if (f.verified_monthly_income && f.verified_monthly_income > 0) {
    return { monthly: f.verified_monthly_income, basis: 'verified' }
  }
  const ic = f.crossDoc?.income_corroboration
  if (ic?.verdict === 'corroborated' && f.claimed_monthly_income) {
    return { monthly: f.claimed_monthly_income, basis: 'verified' }
  }
  return { monthly: null, basis: 'unverified' }
}

/**
 * The only supported way to populate RubricFacts.courtDefendantHits.
 *
 * screen-score already classifies court records by party role and records the
 * outcome as a hard gate; that classification is what may move a score. A raw
 * hit count may not.
 */
export function courtDefendantHitsFromGates(hardGates: string[] | null | undefined): number {
  const g = hardGates ?? []
  if (g.includes('court_record_defendant_multi')) return 2
  if (g.includes('court_record_defendant') || g.includes('court_record_active')) return 1
  return 0
}

export function scoreRubric(f: RubricFacts): RubricResult {
  const hits: RuleHit[] = []
  const unknown: DimKey[] = []
  const add = (dim: DimKey, code: string, delta: number, observed: string) => {
    hits.push({ dim, code, delta, observed })
    return delta
  }

  // ── Ability to pay ──────────────────────────────────────────────────────
  // Anchored on a ratio only when the income behind it is corroborated.
  const income = usableIncome(f)
  let ability: number
  if (income.monthly && f.monthly_rent && f.monthly_rent > 0) {
    const ratio = income.monthly / f.monthly_rent
    // Bands follow the Canadian 3x convention; 2.5x is the last defensible
    // point before rent alone consumes 40% of gross.
    ability =
      ratio >= 4 ? 92 :
      ratio >= 3 ? 80 :
      ratio >= 2.5 ? 62 :
      ratio >= 2 ? 45 : 22
    add('ability_to_pay', 'income_rent_ratio', ability, `${ratio.toFixed(2)}x verified`)
  } else if (f.claimed_monthly_income && f.monthly_rent) {
    // A claim with no corroboration. Capped well below any verified band so it
    // can never outrank a documented lower earner.
    ability = 35
    add('ability_to_pay', 'income_unverified', 35,
      `claimed $${f.claimed_monthly_income.toLocaleString()}/mo, no personal-account trail`)
  } else {
    ability = 30
    unknown.push('ability_to_pay')
    add('ability_to_pay', 'income_unknown', 30, 'no income figure established')
  }

  // Total burden: the rent being applied for PLUS existing debt service, over
  // verified income (a GDS/TDS-style read). Rent alone is priced by the ratio
  // band above; this catches the applicant whose ratio clears 3x but whose
  // car lease and cards leave nothing after rent.
  const burden = income.monthly && f.monthly_rent && f.monthly_rent > 0
    ? (f.monthly_rent + (f.credit?.monthly_debt_payments || 0)) / income.monthly
    : null
  if (burden != null) {
    const d = burden >= 0.5 ? -20 : burden >= 0.4 ? -12 : burden >= 0.32 ? -5 : 0
    if (d) ability += add('ability_to_pay', 'total_debt_service', d, `rent + debt = ${(burden * 100).toFixed(0)}% of verified income`)
  }

  // Liquid reserves: the lowest balance the statements touched, in months of
  // the rent applied for. Read deterministically off running-balance rows.
  if (f.liquidity && f.liquidity.minBalance != null && f.monthly_rent && f.monthly_rent > 0) {
    const months = f.liquidity.minBalance / f.monthly_rent
    const d = months >= 6 ? 6 : months >= 3 ? 3 : months < 1 ? -6 : 0
    if (d) ability += add('ability_to_pay', 'liquid_reserves', d, `lowest balance $${Math.round(f.liquidity.minBalance).toLocaleString()} = ${months.toFixed(1)} months of rent`)
  }
  if (f.liquidity && f.liquidity.nsfCount > 0) {
    ability += add('ability_to_pay', 'nsf_events', f.liquidity.nsfCount >= 2 ? -12 : -6, `${f.liquidity.nsfCount} NSF / returned-item / overdraft row(s)`)
  }
  // Already paying this much: a recurring rent-shaped payment at or above the
  // target rent is the strongest affordability evidence a file can carry.
  if (f.currentRentPaid && f.monthly_rent && f.currentRentPaid >= f.monthly_rent * 0.95) {
    ability += add('ability_to_pay', 'current_rent_at_or_above_target', 4, `$${f.currentRentPaid.toLocaleString()} recurring vs $${f.monthly_rent.toLocaleString()} applied for`)
  }
  if (f.employmentMonths != null) {
    if (f.employmentMonths < 3) ability += add('ability_to_pay', 'employment_probation', -8, `${f.employmentMonths} month(s) in role`)
    else if (f.employmentMonths >= 24) ability += add('ability_to_pay', 'employment_tenure', 3, `${f.employmentMonths} months in role`)
  }

  // ── Credit health ───────────────────────────────────────────────────────
  let creditScore: number
  const sc = f.credit?.credit_score ?? null
  // A bureau report over a year old is treated as no report: it measures a
  // person who existed then, not the applicant in front of the landlord now.
  // Between 91 and 365 days it still scores but records a staleness hit for
  // the report to cite; over 365 the dimension is unknown.
  const stale = f.creditReportAgeDays != null && f.creditReportAgeDays > 365
  if (f.creditReportUnreliable) {
    // The report was submitted as the applicant's own and a deterministic
    // check proved it cannot be (e.g. accounts opened when they were a
    // child). Nothing on it — score, utilisation, collections — can be
    // read either way; and presenting it is itself the negative.
    creditScore = 20
    add('credit_health', 'credit_report_unreliable', 20,
      'bureau report contradicts the applicant\'s date of birth — not usable as their credit history')
  } else if (sc == null || stale) {
    creditScore = 45
    unknown.push('credit_health')
    if (stale) {
      add('credit_health', 'credit_report_stale', 45,
        `report dated ${Math.round(f.creditReportAgeDays! / 30)} months before this screening — treated as no current report`)
    } else {
      add('credit_health', 'no_credit_report', 45, 'no bureau report supplied')
    }
  } else {
    creditScore =
      sc >= 760 ? 95 :
      sc >= 700 ? 82 :
      sc >= 660 ? 68 :
      sc >= 600 ? 50 :
      sc >= 560 ? 34 : 20
    add('credit_health', 'bureau_score', creditScore, `${sc} (${f.credit?.bureau ?? 'bureau'})`)
    if (f.creditReportAgeDays != null && f.creditReportAgeDays > 90) {
      // Aging but not expired: scored, with the age on the record so the
      // landlord knows what vintage of person the number describes. Graded —
      // a three-month-old pull is what most applicants arrive with (a cliff
      // of −6 at day 91 cost a fully consistent file its band); six months
      // is when a fresh pull is genuinely due.
      creditScore += add('credit_health', 'credit_report_aging', f.creditReportAgeDays > 180 ? -6 : -2,
        `report is ${Math.round(f.creditReportAgeDays / 30)} months old — ${f.creditReportAgeDays > 180 ? 'request a current pull' : 'acceptable, a current pull is optional'}`)
    }
  }

  // Utilisation is a SNAPSHOT — meaningless from an expired report, so it is
  // skipped when stale. Collections and bankruptcies below are historical
  // facts that a stale report still proves, so they always count.
  const util = revolvingUtilisation(f.credit)
  if (!stale && !f.creditReportUnreliable && util.pct != null) {
    const d = util.pct >= 0.9 ? -22 : util.pct >= 0.75 ? -14 : util.pct >= 0.5 ? -6 : util.pct <= 0.1 ? +4 : 0
    if (d) creditScore += add('credit_health', 'revolving_utilisation', d,
      `${(util.pct * 100).toFixed(0)}% of $${util.limit.toLocaleString()} revolving`)
  }
  if (!stale && !f.creditReportUnreliable && util.overLimit > 0) {
    creditScore += add('credit_health', 'account_over_limit', -8, `${util.overLimit} account(s) above limit`)
  }
  const openCollections = f.creditReportUnreliable ? [] : (f.credit?.collections ?? []).filter((c) => (Number(c.balance) || 0) > 0)
  if (openCollections.length) {
    creditScore += add('credit_health', 'open_collections', -20, `${openCollections.length} unsettled`)
  }
  if (!f.creditReportUnreliable && (f.credit?.bankruptcies ?? []).length) {
    creditScore += add('credit_health', 'bankruptcy', -35, `${f.credit!.bankruptcies!.length} on file`)
  }
  // Payment behaviour — the bureau score already prices it, but a current
  // past-due balance is the single best predictor of a missed rent payment
  // and used to move nothing here (a 700 with $2,000 past due scored 82).
  if (!stale && !f.creditReportUnreliable && sc != null) {
    if ((f.creditPastDue ?? 0) > 0) {
      creditScore += add('credit_health', 'past_due_balance', (f.creditLateAccounts ?? 1) >= 2 ? -25 : -18, `$${Math.round(f.creditPastDue!).toLocaleString()} currently past due`)
    } else if ((f.creditLateAccounts ?? 0) > 0) {
      creditScore += add('credit_health', 'late_payment_history', -8, `${f.creditLateAccounts} account(s) with late payments`)
    }
    if ((f.hardInquiries12mo ?? 0) >= 5) {
      creditScore += add('credit_health', 'hard_inquiries', -6, `${f.hardInquiries12mo} hard inquiries in 12 months`)
    }
    // A thin file cannot support a high score: two accounts or under a year
    // of history is not a track record, whatever number sits on top of it.
    const thin = (f.tradelineCount != null && f.tradelineCount < 2) || (f.creditHistoryMonths != null && f.creditHistoryMonths < 12)
    if (thin && creditScore > 62) {
      creditScore += add('credit_health', 'thin_file', 62 - creditScore, `${f.tradelineCount ?? '?'} tradeline(s), ${f.creditHistoryMonths ?? '?'} months of history`)
    }
  }

  // ── Rental history ──────────────────────────────────────────────────────
  // The dimension the old model got backwards: with no references and no
  // records it scored 62–72, reading an absence of evidence as evidence of
  // good standing.
  let rental: number
  if (f.landlordRefs > 0) {
    rental = f.landlordRefs >= 2 ? 82 : 72
    add('rental_history', 'landlord_references', rental, `${f.landlordRefs} contactable reference(s)`)
  } else {
    rental = 50
    unknown.push('rental_history')
    add('rental_history', 'no_landlord_reference', 50,
      f.declaredAddresses > 0
        ? `${f.declaredAddresses} prior address(es) declared, none with a contactable landlord`
        : 'no prior address or landlord given')
  }
  // Measured rent behaviour beats a phone number nobody has called yet: a
  // rent-shaped payment recurring on the statements, and the length of the
  // declared tenancies.
  if (f.currentRentPaid && (f.rentPaymentMonths ?? 0) >= 2) {
    rental += add('rental_history', 'rent_payments_observed', f.rentPaymentMonths! >= 3 ? 8 : 5, `$${f.currentRentPaid.toLocaleString()} recurring in ${f.rentPaymentMonths} statement month(s)`)
  }
  if ((f.declaredTenureMonths ?? 0) >= 24) {
    rental += add('rental_history', 'declared_tenure', 4, `${f.declaredTenureMonths} months of declared tenancy`)
  }
  if (f.ltbCorroborated > 0) {
    rental += add('rental_history', 'ltb_order_corroborated', f.ltbCorroborated >= 2 ? -45 : -30,
      `${f.ltbCorroborated} landlord-filed LTB order(s) at a declared address`)
  }
  if (f.courtDefendantHits > 0) {
    rental += add('rental_history', 'court_defendant', f.courtDefendantHits >= 2 ? -35 : -22,
      `${f.courtDefendantHits} case(s) as defendant/debtor`)
  }

  // ── Verification ────────────────────────────────────────────────────────
  // The vocabulary here has to be the one the extractor actually emits
  // (screen-score's prompt: lease, employment_letter, pay_stub, bank_statement,
  // id_document, credit_report, offer_letter, reference, other). It previously
  // asked for 'income_proof', which no extractor has ever produced — so proof of
  // income could not be counted even when a pay stub AND an employment letter
  // were on file, capping every applicant at 3/4 and printing "3/4 required
  // kinds" underneath a complete document set. A rule that cannot fire is worse
  // than no rule: it looks like a measurement.
  const REQUIRED: Array<{ label: string; kinds: string[] }> = [
    { label: 'id', kinds: ['id_document'] },
    { label: 'income_proof', kinds: ['pay_stub', 'employment_letter', 'offer_letter'] },
    { label: 'bank_statement', kinds: ['bank_statement'] },
    { label: 'credit_report', kinds: ['credit_report'] },
  ]
  const present = REQUIRED.filter((r) => f.documentKinds.some((d) => r.kinds.includes(d))).length
  // Presence is a base, not verification: a complete set starts at 70 and
  // earns the rest through measured corroboration below (it used to start at
  // 90 with nothing left to gain, so a fully reconciled payroll trail scored
  // the same as an unchecked one and every "contradiction" only cut).
  let verification = Math.round((present / REQUIRED.length) * 48) + 22
  add('verification', 'documents_present', verification,
    `${present}/${REQUIRED.length} required kinds (${f.documentKinds.join(', ') || 'none detected'})`)

  const corroborated = Array.from(new Set((f.corroborations ?? []).filter((c) => CORROBORATION_CODES.has(c))))
  if (corroborated.length) {
    verification += add('verification', 'corroborations', Math.min(25, corroborated.length * 5), corroborated.join(', '))
  }
  if (f.identityConsistent === true) {
    verification += add('verification', 'identity_consistent', 5, 'ID-document name matches the applicant name')
  } else if (f.identityConsistent === false) {
    verification += add('verification', 'identity_inconsistent', -20, 'ID-document name does not match the applicant name')
  }

  if (f.contradictionDetails) {
    // Deterministic contradictions only, priced by severity; capped so three
    // medium notes cannot outweigh a forged document.
    const W: Record<string, number> = { critical: -20, high: -12, medium: -6, low: 0 }
    const total = Math.max(-36, f.contradictionDetails.reduce((sum, c) => sum + (W[c.severity] ?? 0), 0))
    if (total) verification += add('verification', 'cross_doc_contradiction', total,
      f.contradictionDetails.slice(0, 4).map((c) => `${c.code} (${c.severity})`).join(', '))
  } else if (f.contradictions.length) {
    verification += add('verification', 'cross_doc_contradiction', -12 * Math.min(f.contradictions.length, 3),
      f.contradictions.slice(0, 3).join(', '))
  }
  if (f.forgedDocuments > 0) {
    verification += add('verification', 'document_forged', -50, `${f.forgedDocuments} document(s)`)
  }
  if (f.applicationSigned === false) {
    verification += add('verification', 'application_unsigned', -15, 'form carries no signature')
  }
  if (f.blankApplicationFields >= 8) {
    verification += add('verification', 'application_mostly_blank', -15, `${f.blankApplicationFields} fields blank`)
  } else if (f.blankApplicationFields >= 4) {
    verification += add('verification', 'application_incomplete', -8, `${f.blankApplicationFields} fields blank`)
  }
  if (f.crossDoc?.related_party?.suspected) {
    verification += add('verification', 'related_party_income_source', -18,
      (f.crossDoc.related_party.signals ?? []).slice(0, 2).join('; ') || 'income source not arm’s length')
  }

  const dimensions: Record<DimKey, number> = {
    ability_to_pay: clamp(ability),
    credit_health: clamp(creditScore),
    rental_history: clamp(rental),
    verification: clamp(verification),
  }

  const overall = clamp(
    (Object.keys(RUBRIC_WEIGHTS) as DimKey[]).reduce((sum, k) => sum + dimensions[k] * RUBRIC_WEIGHTS[k], 0),
  )

  // Bands, not a false-precision integer. "24/100" implies a resolution this
  // does not have; what a landlord can act on is which side of a line it lands.
  const band: RubricResult['band'] =
    overall < 40 || f.forgedDocuments > 0 || f.ltbCorroborated >= 2 ? 'decline' :
    overall < 55 ? 'conditional' :
    overall < 70 ? 'review' : 'proceed'

  return {
    dimensions,
    unknown,
    hits,
    overall,
    band,
    evidenceCoverage: Number(((4 - unknown.length) / 4).toFixed(2)),
  }
}

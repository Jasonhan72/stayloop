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
 * CAVEAT worth knowing when reading the number: bureaus report `high_credit`
 * (the highest balance ever carried), not the assigned credit limit. On a card
 * that has been run near its limit the two converge, but where they differ this
 * UNDERSTATES utilisation — for this applicant it gives 96% against the 98% you
 * get from the limits printed elsewhere in the same report. It never overstates,
 * so it cannot manufacture a penalty; it can only be slightly kind.
 */
export function revolvingUtilisation(credit: CreditReport | null): { used: number; limit: number; pct: number | null; overLimit: number } {
  const lines = (credit?.tradelines ?? []).filter((t) => /revolving/i.test(t.type || ''))
  let used = 0
  let limit = 0
  let overLimit = 0
  for (const t of lines) {
    const bal = Number(t.balance) || 0
    const hi = Number(t.high_credit) || 0
    used += bal
    limit += hi
    if (hi > 0 && bal > hi) overLimit++
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

  // Existing debt service eats into the same income.
  const dsr = f.credit?.monthly_debt_payments && income.monthly
    ? f.credit.monthly_debt_payments / income.monthly
    : null
  if (dsr != null) {
    const d = dsr >= 0.4 ? -18 : dsr >= 0.25 ? -10 : dsr >= 0.15 ? -4 : 0
    if (d) ability += add('ability_to_pay', 'debt_service_ratio', d, `${(dsr * 100).toFixed(0)}% of income to existing debt`)
  }

  // ── Credit health ───────────────────────────────────────────────────────
  let creditScore: number
  const sc = f.credit?.credit_score ?? null
  if (sc == null) {
    creditScore = 45
    unknown.push('credit_health')
    add('credit_health', 'no_credit_report', 45, 'no bureau report supplied')
  } else {
    creditScore =
      sc >= 760 ? 95 :
      sc >= 700 ? 82 :
      sc >= 660 ? 68 :
      sc >= 600 ? 50 :
      sc >= 560 ? 34 : 20
    add('credit_health', 'bureau_score', creditScore, `${sc} (${f.credit?.bureau ?? 'bureau'})`)
  }

  const util = revolvingUtilisation(f.credit)
  if (util.pct != null) {
    const d = util.pct >= 0.9 ? -22 : util.pct >= 0.75 ? -14 : util.pct >= 0.5 ? -6 : util.pct <= 0.1 ? +4 : 0
    if (d) creditScore += add('credit_health', 'revolving_utilisation', d,
      `${(util.pct * 100).toFixed(0)}% of $${util.limit.toLocaleString()} revolving`)
  }
  if (util.overLimit > 0) {
    creditScore += add('credit_health', 'account_over_limit', -8, `${util.overLimit} account(s) above limit`)
  }
  const openCollections = (f.credit?.collections ?? []).filter((c) => (Number(c.balance) || 0) > 0)
  if (openCollections.length) {
    creditScore += add('credit_health', 'open_collections', -20, `${openCollections.length} unsettled`)
  }
  if ((f.credit?.bankruptcies ?? []).length) {
    creditScore += add('credit_health', 'bankruptcy', -35, `${f.credit!.bankruptcies!.length} on file`)
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
  if (f.ltbCorroborated > 0) {
    rental += add('rental_history', 'ltb_order_corroborated', f.ltbCorroborated >= 2 ? -45 : -30,
      `${f.ltbCorroborated} landlord-filed LTB order(s) at a declared address`)
  }
  if (f.courtDefendantHits > 0) {
    rental += add('rental_history', 'court_defendant', f.courtDefendantHits >= 2 ? -35 : -22,
      `${f.courtDefendantHits} case(s) as defendant/debtor`)
  }

  // ── Verification ────────────────────────────────────────────────────────
  const REQUIRED = ['id', 'income_proof', 'bank_statement', 'credit_report']
  const present = REQUIRED.filter((k) => f.documentKinds.some((d) => d.includes(k))).length
  let verification = Math.round((present / REQUIRED.length) * 70) + 20
  add('verification', 'documents_present', verification, `${present}/${REQUIRED.length} required kinds`)

  if (f.contradictions.length) {
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

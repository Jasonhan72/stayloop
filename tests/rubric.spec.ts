import { describe, expect, it } from 'vitest'
import { courtDefendantHitsFromGates, revolvingUtilisation, scoreRubric, usableIncome, type RubricFacts } from '../lib/screening/rubric'

// The applicant that exposed the problem: six runs of identical documents
// scored 19, 22, 22, 24, 27, 28. These facts are lifted from the stored
// extraction of those runs — which was itself identical every time.
const ALALEH: RubricFacts = {
  monthly_rent: 2100,
  claimed_monthly_income: 12500,
  verified_monthly_income: null, // every bank statement was a business account
  credit: {
    bureau: 'Equifax',
    credit_score: 669,
    monthly_debt_payments: 1159,
    total_debt: 70826,
    report_date: '2026-07-15',
    tradelines: [
      { type: 'Revolving', creditor: 'ROYAL BANK VISA', balance: 10470, high_credit: 11664, past_due: 0, payment_status: 'R1', date_opened: '2020-01-23', late_30_60_90: '0/0/0' },
      { type: 'Revolving', creditor: 'ROYAL BK', balance: 48472, high_credit: 48472, past_due: 0, payment_status: 'R1', date_opened: '2021-07-09', late_30_60_90: '0/0/0' },
      { type: 'Revolving', creditor: 'TD CREDIT CARDS', balance: 8643, high_credit: 9939, past_due: 0, payment_status: 'R1', date_opened: '2019-10-15', late_30_60_90: '0/0/0' },
      { type: 'Installment', creditor: 'CDA STUDENT LOANS', balance: 3711, high_credit: 9669, past_due: 0, payment_status: 'I1', date_opened: '2014-07-13', late_30_60_90: '0/0/0' },
    ],
    collections: [{ creditor: 'YORK', original_amount: 243, balance: 0, date_assigned: '2023-01-01' }],
    bankruptcies: [],
    inquiries: [],
  } as never,
  crossDoc: { income_corroboration: { verdict: 'uncorroborated', personal_payroll_seen: false, claimed_monthly: 12500, observed_pattern: '', detail: '' } } as never,
  ltbCorroborated: 0,
  courtDefendantHits: 0,
  landlordRefs: 1,
  declaredAddresses: 2,
  documentKinds: ['employment_letter', 'credit_report', 'bank_statement', 'id_document'],
  contradictions: ['cross_doc_contradictions'],
  forgedDocuments: 0,
  blankApplicationFields: 6,
  applicationSigned: null,
}

describe('the property that was missing: same facts, same score', () => {
  it('is byte-identical across repeated evaluation', () => {
    const runs = Array.from({ length: 25 }, () => scoreRubric(ALALEH))
    const scores = new Set(runs.map((r) => r.overall))
    const bands = new Set(runs.map((r) => r.band))
    expect(scores.size, `got ${[...scores].join(',')}`).toBe(1)
    expect(bands.size).toBe(1)
    expect(JSON.stringify(runs[0])).toBe(JSON.stringify(runs[24]))
  })

  it('does not depend on key order in the input object', () => {
    const shuffled = Object.fromEntries(Object.entries(ALALEH).reverse()) as RubricFacts
    expect(scoreRubric(shuffled).overall).toBe(scoreRubric(ALALEH).overall)
  })
})

describe('rule 1 — unverified income is not income', () => {
  it('refuses to compute an affordability ratio from an uncorroborated claim', () => {
    // The old report led with "6.0x 收入/租金比" from a figure whose only source
    // was the applicant's own employment letter.
    expect(usableIncome(ALALEH).monthly).toBeNull()
    expect(usableIncome(ALALEH).basis).toBe('unverified')
    const hit = scoreRubric(ALALEH).hits.find((h) => h.code === 'income_unverified')
    expect(hit).toBeTruthy()
  })

  it('never lets an unverified claim outrank a documented lower earner', () => {
    const documentedButPoorer = scoreRubric({
      ...ALALEH,
      claimed_monthly_income: 6800,
      verified_monthly_income: 6800, // 3.2x on payroll deposits
    })
    const unverifiedHighEarner = scoreRubric(ALALEH) // "12,500/mo", nothing behind it
    expect(documentedButPoorer.dimensions.ability_to_pay)
      .toBeGreaterThan(unverifiedHighEarner.dimensions.ability_to_pay)
  })

  it('scores the ratio once the income is corroborated', () => {
    const r = scoreRubric({ ...ALALEH, verified_monthly_income: 12500 })
    expect(r.hits.find((h) => h.code === 'income_rent_ratio')?.observed).toMatch(/5\.95x verified/)
  })
})

describe('rule 2 — missing evidence is not good evidence', () => {
  it('does not reward an applicant who supplied no landlord reference', () => {
    // The old model scored rental_history 62–72 for exactly this state.
    const noRefs = scoreRubric({ ...ALALEH, landlordRefs: 0, declaredAddresses: 0 })
    expect(noRefs.dimensions.rental_history).toBeLessThan(scoreRubric(ALALEH).dimensions.rental_history)
    expect(noRefs.unknown).toContain('rental_history')
    expect(noRefs.hits.find((h) => h.code === 'no_landlord_reference')).toBeTruthy()
  })

  it('reports a missing credit report as unknown rather than as a mid score', () => {
    const r = scoreRubric({ ...ALALEH, credit: null })
    expect(r.unknown).toContain('credit_health')
    expect(r.evidenceCoverage).toBeLessThan(1)
  })
})

describe('rule 3 — every rule cites the measurement it fired on', () => {
  it('attaches an observed value to every hit', () => {
    for (const h of scoreRubric(ALALEH).hits) {
      expect(h.observed, `${h.code} fired with no evidence`).toBeTruthy()
      expect(h.code).toMatch(/^[a-z0-9_]+$/)
    }
  })

  it('measures revolving utilisation from the tradelines, not from a judgement', () => {
    const u = revolvingUtilisation(ALALEH.credit)
    expect(u.used).toBe(67585) // 10470 + 48472 + 8643 — installment excluded
    expect(u.limit).toBe(70075) // 11664 + 48472 + 9939
    expect(Math.round(u.pct! * 100)).toBe(96)
  })
})

describe('signals that must move the verdict', () => {
  it('declines outright on a forged document', () => {
    expect(scoreRubric({ ...ALALEH, forgedDocuments: 1 }).band).toBe('decline')
  })

  it('declines on two corroborated landlord-filed LTB orders', () => {
    expect(scoreRubric({ ...ALALEH, ltbCorroborated: 2 }).band).toBe('decline')
  })

  it('rates a fully documented, low-debt applicant well above this one', () => {
    const strong = scoreRubric({
      ...ALALEH,
      verified_monthly_income: 8000,
      credit: {
        ...(ALALEH.credit as unknown as Record<string, unknown>),
        credit_score: 780,
        monthly_debt_payments: 300,
        tradelines: [{ type: 'Revolving', creditor: 'X', balance: 500, high_credit: 20000, past_due: 0, payment_status: 'R1', date_opened: '2018-01-01', late_30_60_90: '0/0/0' }],
        collections: [],
      } as never,
      landlordRefs: 2,
      contradictions: [],
      blankApplicationFields: 0,
    })
    expect(strong.band).toBe('proceed')
    expect(strong.overall).toBeGreaterThan(scoreRubric(ALALEH).overall + 25)
  })
})

describe('court records: only defendant classification may penalise', () => {
  it('ignores a raw hit count and reads the party-role gates instead', () => {
    // court_records_detail.total_hits counts every name match in every database,
    // including cases where the applicant is the plaintiff and including plain
    // namesakes. Penalising on it means penalising people for their surname.
    expect(courtDefendantHitsFromGates([])).toBe(0)
    expect(courtDefendantHitsFromGates(['income_severe'])).toBe(0)
    expect(courtDefendantHitsFromGates(['court_record_defendant'])).toBe(1)
    expect(courtDefendantHitsFromGates(['court_record_active'])).toBe(1)
    expect(courtDefendantHitsFromGates(['court_record_defendant_multi'])).toBe(2)
    expect(courtDefendantHitsFromGates(null)).toBe(0)
  })

  it('leaves rental_history untouched when there is no defendant classification', () => {
    const clean = scoreRubric({ ...ALALEH, courtDefendantHits: courtDefendantHitsFromGates(['self_issued_employment']) })
    expect(clean.hits.find((h) => h.code === 'court_defendant')).toBeUndefined()
  })
})

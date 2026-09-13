// 2026-09-12: the rubric only used a slice of what the pipeline measures.
// A 9.2x earner with $46k in the bank and a $4,000 rent cheque every month
// scored the same ability-to-pay as a 4x earner with nothing in reserve; a
// 700 with $2,000 past due kept 82 on credit; two uncalled phone numbers
// gave rental history 82 while three months of observed rent payments gave
// nothing; and verification started at 90 for "documents present" so every
// backend-verified corroboration was worth zero and every note only cut.
import { describe, expect, it } from 'vitest'
import { scoreRubric, countMaterialBlanks, type RubricFacts } from '../lib/screening/rubric'
import { parsePeriodMonths, monthsSince } from '../lib/screening/periods'
import { analyzeStatementLiquidity } from '../lib/forensics/payroll-deposits'

const CARLOS: RubricFacts = {
  monthly_rent: 2400,
  claimed_monthly_income: 21973.32,
  verified_monthly_income: 21973.32,
  credit: {
    bureau: 'Equifax', credit_score: 760, monthly_debt_payments: 514, report_date: '2026-06-10',
    tradelines: [
      { type: 'Revolving', creditor: 'SCOTIABANK VISA', balance: 9247, credit_limit: 20000, high_credit: null, past_due: 0, payment_status: 'R1', date_opened: '2021/07/19', late_30_60_90: '0/0/0' },
      { type: 'Installment', creditor: 'CDN DEALER LEASE SER', balance: 11261, credit_limit: null, high_credit: 39242, past_due: 0, payment_status: 'I1', date_opened: '2025/06/30', late_30_60_90: '0/0/0' },
    ],
    collections: [], bankruptcies: [], inquiries: [],
  } as never,
  crossDoc: { income_corroboration: { verdict: 'corroborated', personal_payroll_seen: true, claimed_monthly: 21973.32, observed_pattern: '', detail: '' } } as never,
  ltbCorroborated: 0, courtDefendantHits: 0, landlordRefs: 2, declaredAddresses: 2,
  documentKinds: ['lease', 'employment_letter', 'pay_stub', 'bank_statement', 'id_document', 'credit_report', 'offer_letter', 'other'],
  contradictions: ['cross_doc_contradictions'],
  contradictionDetails: [],
  forgedDocuments: 0,
  blankApplicationFields: countMaterialBlanks(['second applicant', 'spouse employment', 'second financial obligations', 'second vehicle', 'savings account number']),
  applicationSigned: null,
  creditReportAgeDays: 93,
  corroborations: ['payroll_processor_recognized', 'deposits_match_paystub_net', 'employer_registry_active', 'paystub_deductions_at_legal_max', 'cross_doc_bonus_corroborated', 'bonus_deposit_reconciled', 'employer_counterparty_on_statement', 'paystub_ytd_one_off_reconciled'],
  identityConsistent: true,
  liquidity: { minBalance: 46743.19, nsfCount: 0 },
  currentRentPaid: 4000, rentPaymentMonths: 3,
  employmentMonths: 53,
  declaredTenureMonths: 22 + 37,
  creditPastDue: 0, creditLateAccounts: 0, hardInquiries12mo: 1, tradelineCount: 6, creditHistoryMonths: 58,
}

describe('ability to pay reads reserves, current rent and tenure', () => {
  it('lifts a fully reserved applicant above the bare ratio band', () => {
    const r = scoreRubric(CARLOS)
    const codes = r.hits.filter(h => h.dim === 'ability_to_pay').map(h => h.code)
    expect(codes).toContain('liquid_reserves')
    expect(codes).toContain('current_rent_at_or_above_target')
    expect(codes).toContain('employment_tenure')
    expect(r.dimensions.ability_to_pay).toBeGreaterThan(92)
  })
  it('charges the total burden of rent plus debt, and NSF events', () => {
    const r = scoreRubric({ ...CARLOS, monthly_rent: 6000, credit: { ...(CARLOS.credit as object), monthly_debt_payments: 3200 } as never, liquidity: { minBalance: 900, nsfCount: 2 }, currentRentPaid: null })
    const codes = r.hits.filter(h => h.dim === 'ability_to_pay').map(h => h.code)
    expect(codes).toContain('total_debt_service')
    expect(codes).toContain('nsf_events')
    expect(r.hits.find(h => h.code === 'liquid_reserves')?.delta).toBe(-6)
  })
  it('flags probation-length employment', () => {
    expect(scoreRubric({ ...CARLOS, employmentMonths: 2 }).hits.some(h => h.code === 'employment_probation')).toBe(true)
  })
})

describe('credit health reads payment behaviour and file depth', () => {
  it('cuts a strong score that carries a past-due balance', () => {
    const clean = scoreRubric(CARLOS).dimensions.credit_health
    const pastDue = scoreRubric({ ...CARLOS, creditPastDue: 2000, creditLateAccounts: 1 }).dimensions.credit_health
    expect(pastDue).toBeLessThanOrEqual(clean - 18)
    expect(scoreRubric({ ...CARLOS, creditLateAccounts: 1 }).hits.some(h => h.code === 'late_payment_history')).toBe(true)
  })
  it('caps a thin file and prices hard-inquiry velocity', () => {
    expect(scoreRubric({ ...CARLOS, tradelineCount: 1, creditHistoryMonths: 8 }).dimensions.credit_health).toBeLessThanOrEqual(62)
    expect(scoreRubric({ ...CARLOS, hardInquiries12mo: 6 }).hits.some(h => h.code === 'hard_inquiries')).toBe(true)
  })
})

describe('rental history reads observed rent and declared tenure', () => {
  it('credits recurring rent payments and long tenancies', () => {
    const r = scoreRubric(CARLOS)
    expect(r.hits.some(h => h.code === 'rent_payments_observed' && h.delta === 8)).toBe(true)
    expect(r.hits.some(h => h.code === 'declared_tenure')).toBe(true)
    expect(r.dimensions.rental_history).toBeGreaterThan(82)
  })
})

describe('verification is earned by corroboration, cut only by measured contradictions', () => {
  it('starts a complete set at 60 and adds corroborations up to +25', () => {
    const r = scoreRubric(CARLOS)
    expect(r.hits.find(h => h.code === 'documents_present')?.delta).toBe(60)
    expect(r.hits.find(h => h.code === 'corroborations')?.delta).toBe(25)
    expect(r.hits.find(h => h.code === 'identity_consistent')?.delta).toBe(5)
    // the model's free-hand red flag does not cut when deterministic details are supplied
    expect(r.hits.some(h => h.code === 'cross_doc_contradiction')).toBe(false)
    // consistent on paper, nothing verified externally → 90, not 100
    expect(r.dimensions.verification).toBe(90)
    // and it cannot pass 90 without a third-party check, however many corroborations
    const over = scoreRubric({ ...CARLOS, contradictionDetails: [], corroborations: [...CARLOS.corroborations!, 'cross_doc_income_corroborated'] })
    expect(over.dimensions.verification).toBeLessThanOrEqual(90)
    const verified = scoreRubric({ ...CARLOS, externalVerifications: { identity: true, bank: true, references: false } })
    expect(verified.dimensions.verification).toBe(100)
    expect(verified.hits.find(h => h.code === 'external_verification')?.delta).toBe(10)
  })
  it('caps rental history while references are uncalled and holds a past-due file at review', () => {
    expect(scoreRubric(CARLOS).dimensions.rental_history).toBe(88)
    expect(scoreRubric({ ...CARLOS, externalVerifications: { references: true } }).dimensions.rental_history).toBeGreaterThan(88)
    expect(scoreRubric({ ...CARLOS, creditPastDue: 1500, creditLateAccounts: 1 }).band).toBe('review')
  })
  it('prices deterministic contradictions by severity, capped', () => {
    const r = scoreRubric({ ...CARLOS, contradictionDetails: [{ code: 'cross_doc_income_mismatch', severity: 'medium' }, { code: 'cross_doc_phone_collision', severity: 'critical' }, { code: 'bank_producer_mismatch', severity: 'high' }, { code: 'x_mismatch', severity: 'high' }] })
    expect(r.hits.find(h => h.code === 'cross_doc_contradiction')?.delta).toBe(-36)
  })
  it('ignores blanks a single applicant never fills', () => {
    expect(countMaterialBlanks(['second applicant', 'spouse employment', 'savings account number', 'employer phone'])).toBe(2)
    expect(scoreRubric(CARLOS).hits.some(h => h.code === 'application_incomplete')).toBe(false)
  })
  it('keeps scoring older fixtures that only carry the legacy contradiction list', () => {
    const legacy = { ...CARLOS, contradictionDetails: undefined, corroborations: undefined, identityConsistent: undefined }
    expect(scoreRubric(legacy).hits.find(h => h.code === 'cross_doc_contradiction')?.delta).toBe(-12)
  })
  it('scores the whole Carlos file in the proceed band, well above the old 88', () => {
    const r = scoreRubric(CARLOS)
    expect(r.band).toBe('proceed')
    expect(r.overall).toBeGreaterThanOrEqual(93)
  })
})

describe('period arithmetic', () => {
  const now = new Date('2026-09-12T00:00:00Z')
  it('reads declared residence periods', () => {
    expect(parsePeriodMonths('AUGUST 2021 to JUNE 2023', now)).toBe(22)
    expect(parsePeriodMonths('JUNE 2023 to JULY 2026', now)).toBe(37)
    expect(parsePeriodMonths('Jan 2024 - present', now)).toBe(32)
    expect(parsePeriodMonths('garbage', now)).toBeNull()
  })
  it('counts months since a start date', () => {
    expect(monthsSince('2022-04-04', now)).toBe(53)
    expect(monthsSince('2021/07/19', now)).toBe(62)
    expect(monthsSince(null, now)).toBeNull()
  })
})

describe('statement liquidity', () => {
  it('reads the lowest balance and NSF rows off flattened statement text', () => {
    const text = 'Opening Balance on May 1, 2026 $67,610.38 May 1 Cheque 058 2226004895 4,000.00 63,474.78 May 2 NSF fee 48.00 63,426.78 May 15 Payroll dep. 6,954.83 70,381.61 Osv-Payroll May 30 Closing Balance $70,381.61'
    const l = analyzeStatementLiquidity([text])
    expect(l.min_balance).toBe(63426.78)
    expect(l.nsf_count).toBe(1)
    expect(l.rows).toBe(3)
  })
})

// Review 2026-09-13.
describe('review follow-ups', () => {
  it('zero transcribed tradelines is unmeasured, not a thin file', () => {
    const base: RubricFacts = { ...CARLOS, tradelineCount: 0, creditHistoryMonths: null }
    const r = scoreRubric(base)
    expect(r.hits.some(t => t.code === 'thin_file')).toBe(false)
    expect(scoreRubric({ ...base, tradelineCount: 1 }).hits.some(t => t.code === 'thin_file')).toBe(true)
  })
  it('liquidity is the best account\'s floor, not the emptiest statement', () => {
    const chequing = 'Opening Balance on Jun 1, 2026 $7,500.00 Jun 1 Opening Balance 7,500.00 Jun 2 Cheque 100 2,400.00 5,100.00 Jun 30 Closing Balance $5,100.00'
    const savings = 'Opening Balance on Jun 1, 2026 $0.00 Jun 1 Opening Balance 0.00 Jun 30 Closing Balance $0.00'
    expect(analyzeStatementLiquidity([chequing, savings]).min_balance).toBe(5100)
  })
  it('"2019-2022" is thirty-six months', () => {
    expect(parsePeriodMonths('2019-2022')).toBe(36)
  })
})

describe('second-pass regressions (2026-09-13)', () => {
  it('three statements of ONE account keep the month it dipped; a second empty account is ignored', () => {
    const apr = 'Account Number 1234 5678 901 Opening Balance on Apr 1, 2026 $12,000.00 Apr 1 Opening Balance 12,000.00 Apr 3 Cheque 100 500.00 11,500.00'
    const may = 'Account Number 1234 5678 901 Opening Balance on May 1, 2026 $11,500.00 May 1 Opening Balance 11,500.00 May 3 Cheque 101 11,200.00 300.00'
    const jun = 'Account Number 1234 5678 901 Opening Balance on Jun 1, 2026 $3,900.00 Jun 1 Opening Balance 3,900.00 Jun 3 Cheque 102 100.00 3,800.00'
    const savings = 'Account Number 9999 0000 111 Opening Balance on Jun 1, 2026 $0.00 Jun 1 Opening Balance 0.00 Jun 30 Interest 0.01 0.01'
    expect(analyzeStatementLiquidity([apr, may, jun]).min_balance).toBe(300)
    expect(analyzeStatementLiquidity([apr, may, jun, savings]).min_balance).toBe(300)
  })
})

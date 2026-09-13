// Calibration for one applicant CLASS — the salaried professional with
// outsourced payroll, a joint personal account, strong bureau, two prior
// tenancies (the 2026-09-11 Carlos file, read by hand against the module).
//
// The hand read: identity consistent (PR card / application / bureau print
// the same name and birthday in three formats), income fully reconciled
// (stubs ↔ letter ↔ OSV payroll ↔ April bonus ↔ Acciona reimbursements),
// 16 months of rent in the lowest balance, $4,000 paid on the 1st of every
// month, 760 with no delinquencies and one hard inquiry, two landlords with
// phones. Open items: job title changed since the 2022 offer; references
// not yet called. Verdict: proceed, low-90s or better, no warnings.
//
// What the module got wrong before this file existed: the coherence pass
// reported the older application address as "current" (high), three DOB
// print formats as a conflict (high), a closed Kia loan as an undisclosed
// obligation, and a second bureau phone as an omission — which produced a
// "生日住址矛盾" warning, identity 72/100 and a checklist item to "confirm
// the DOB mismatch".
import { describe, expect, it } from 'vitest'
import { scoreRubric, type RubricFacts } from '../lib/screening/rubric'
import { sanitizeCoherenceOutput, isSameDobClaim, isAgreedAddressClaim, isClosedAccountOmission, isDeclaredObligationClaim, isExtraPhoneClaim } from '../lib/screening/coherenceReview'
import { parseDateLoose, datesAgree } from '../lib/screening/periods'
import { checkSourceSpecific } from '../lib/forensics/source-specific'

const CLASS_FIXTURE: RubricFacts = {
  monthly_rent: 2400, claimed_monthly_income: 21973.32, verified_monthly_income: 21973.32,
  credit: { bureau: 'Equifax', credit_score: 760, monthly_debt_payments: 581, report_date: '2026-06-10',
    tradelines: [
      { type: 'Revolving', creditor: 'SCOTIABANK VISA', balance: 9247, credit_limit: 20000, high_credit: null, past_due: 0, payment_status: 'R1', date_opened: '2021/07/19', late_30_60_90: '0/0/0' },
      { type: 'Installment', creditor: 'CDN DEALER LEASE SER', balance: 11261, credit_limit: null, high_credit: 20914, past_due: 0, payment_status: 'I1', date_opened: '2025/06/30', late_30_60_90: '0/0/0' },
    ], collections: [], bankruptcies: [], inquiries: [] } as never,
  crossDoc: { income_corroboration: { verdict: 'corroborated', personal_payroll_seen: true, claimed_monthly: 21973.32, observed_pattern: '', detail: '' } } as never,
  ltbCorroborated: 0, courtDefendantHits: 0, landlordRefs: 2, declaredAddresses: 2,
  documentKinds: ['lease', 'employment_letter', 'pay_stub', 'bank_statement', 'id_document', 'credit_report', 'offer_letter', 'other'],
  contradictions: [], contradictionDetails: [], forgedDocuments: 0, blankApplicationFields: 0, applicationSigned: true, creditReportAgeDays: 94,
  corroborations: ['payroll_processor_recognized', 'deposits_match_paystub_net', 'employer_registry_active', 'paystub_deductions_at_legal_max', 'cross_doc_bonus_corroborated', 'bonus_deposit_reconciled', 'employer_counterparty_on_statement', 'paystub_ytd_one_off_reconciled'],
  identityConsistent: true,
  liquidity: { minBalance: 39028.43, nsfCount: 0 }, currentRentPaid: 4000, rentPaymentMonths: 3,
  employmentMonths: 53, declaredTenureMonths: 59,
  creditPastDue: 0, creditLateAccounts: 0, hardInquiries12mo: 1, tradelineCount: 6, creditHistoryMonths: 58,
}

describe('class: salaried professional, outsourced payroll, joint account', () => {
  it('lands where the hand read lands', () => {
    const r = scoreRubric(CLASS_FIXTURE)
    expect(r.band).toBe('proceed')
    expect(r.overall).toBeGreaterThanOrEqual(93)
    expect(r.dimensions.ability_to_pay).toBeGreaterThanOrEqual(95)
    expect(r.dimensions.credit_health).toBeGreaterThanOrEqual(90)
    expect(r.dimensions.rental_history).toBeGreaterThanOrEqual(85)
    expect(r.dimensions.verification).toBeGreaterThanOrEqual(90)
    expect(r.unknown).toEqual([])
  })
  it('moves the right way when one fact in the class changes', () => {
    const base = scoreRubric(CLASS_FIXTURE).overall
    const variants: Array<[string, Partial<RubricFacts>, number]> = [
      ['past-due balance', { creditPastDue: 2000, creditLateAccounts: 1 }, -3],
      ['two NSF events and no reserve', { liquidity: { minBalance: 500, nsfCount: 2 } }, -5],
      ['payer unknown, nothing corroborated', { corroborations: [], crossDoc: { income_corroboration: { verdict: 'partial', personal_payroll_seen: true } } as never }, -3],
      ['income uncorroborated', { verified_monthly_income: null, crossDoc: { income_corroboration: { verdict: 'uncorroborated', personal_payroll_seen: false } } as never }, -20],
      ['a forged document', { forgedDocuments: 1 }, -5],
      ['thin file', { tradelineCount: 1, creditHistoryMonths: 6 }, -5],
      ['rent at 45% of income', { monthly_rent: 9800 }, -20],
    ]
    for (const [label, patch, atLeast] of variants) {
      const v = scoreRubric({ ...CLASS_FIXTURE, ...patch }).overall
      expect(v, `${label}: ${base} → ${v}`).toBeLessThanOrEqual(base + atLeast)
    }
    expect(scoreRubric({ ...CLASS_FIXTURE, forgedDocuments: 1 }).band).toBe('decline')
  })
})

describe('the false contradictions this class produced are filtered deterministically', () => {
  const dob = { claim_zh: '申请表生日与证件及征信生日不一致', claim_en: 'DOB differs across documents', evidence: ["'Date of birth MAY-14-1979'", "'Date of birth/Date de naissance 14 MAY / MAI 79'", "'Date Of Birth 1979-xx-14'"] }
  const addr = { claim_zh: '申请表住址与银行及征信现住址不一致', claim_en: 'application address differs from bank and bureau', evidence: ["'LAST TWO PLACES OF RESIDENCE Address... 51 YORK MILLS RD UNIT 308 TORONTO M2P1B6 ... from AUGUST 2021 to JUNE 2023'", "'Address... 32 OAKEN GATEWAY TORONTO M2P2A1 ... from JUNE 2023 To JULY 2026'", "'MR CARLOS RODRIGUEZ ... 32 OAKEN GATEWAY NORTH YORK ON M2P 2A1'", "'Current 2025/07/01 32 OAKEN GATEWAY NORTH YORK ON M2P 2A1'"] }
  const kia = { claim_zh: '申请表少报一项现有分期义务', claim_en: 'application omits an existing installment obligation', category: 'omission', evidence: ["'FINANCIAL OBLIGATIONS CANADIAN DEALER LEASE SE'", "'Accounts - Installment'", "'CDN DEALER LEASE SER ... Balance $11,261'", "'KIA MOTOR FINANCE ... Date Closed 2025/07/04'"] }
  const phone = { claim_zh: '现有电话号少报一组', claim_en: 'one phone number fewer than the bureau lists', evidence: ["'Telephone: +1 416-587-3402'", "'Other 647-225-5467'", "'Other 416-587-3402'"] }
  it('same birthday in three print formats', () => {
    expect(datesAgree([parseDateLoose('MAY-14-1979')!, parseDateLoose('14 MAY / MAI 79')!, parseDateLoose('1979-xx-14')!])).toBe(true)
    expect(isSameDobClaim(dob)).toBe(true)
    expect(isSameDobClaim({ ...dob, evidence: ["'Date of birth MAY-14-1979'", "'Date Of Birth 1981-xx-02'"] })).toBe(false)
  })
  it('an address that two documents share is not a mismatch', () => {
    expect(isAgreedAddressClaim(addr)).toBe(true)
    expect(isAgreedAddressClaim({ ...addr, evidence: ["'51 YORK MILLS RD UNIT 308'", "'Current 2025/07/01 12 KING ST W'"] })).toBe(false)
  })
  it('a lease the application already lists is not an omission; an extra bureau phone is not either', () => {
    // The dealer lease is still open ($11,261) — only the closed Kia line
    // carries a closed marker — so the "closed account" rule must NOT fire;
    // the claim falls because FINANCIAL OBLIGATIONS on the application
    // names the same dealer lease (review 2026-09-13).
    expect(isClosedAccountOmission(kia)).toBe(false)
    expect(isDeclaredObligationClaim(kia)).toBe(true)
    expect(isClosedAccountOmission({ ...kia, evidence: ["'Accounts - Installment'", "'KIA MOTOR FINANCE ... Date Closed 2025/07/04'"] })).toBe(true)
    expect(isExtraPhoneClaim(phone)).toBe(true)
  })
  it('all four vanish from the sanitised review', () => {
    const r = sanitizeCoherenceOutput({ anomalies: [dob, addr, kia, phone].map((a, i) => ({ id: `A${i}`, category: 'category' in a ? a.category : 'cross_document', severity: 'high', files: ['x'], ...a, confidence: 0.8 })) }, null, 0)
    expect(r.anomalies).toHaveLength(0)
  })
})

describe('Workday stubs are a known payroll system', () => {
  it('recognises Workday from the PDF producer even when the text only says Payslip', () => {
    const { result, flags } = checkSourceSpecific(
      { producer: 'iText® Core 9.3.0 (production version) ©2000-2025 Apryse Group NV, Workday, Inc.', creator: null, title: null, author: null, subject: null, creation_date: null, modification_date: null, page_count: 2, file_size_bytes: 1 } as never,
      { total_chars: 2000, page_count: 2, chars_per_page: 1000, is_likely_image_pdf: false, text_sample: 'Payslip: Carlos Regueiro Rodriguez: 2026-05-31 (CAN Regular) - Complete ACCIONA INFRASTRUCTURE CANADA INC. Current 86.67 10,986.66 ' + 'x'.repeat(200) },
      'Paystub#2.pdf', 'pay_stub',
    )
    expect(result.matched_payroll).toBe('Workday')
    expect(flags.some(f => f.code === 'paystub_unknown_payroll_system')).toBe(false)
  })
})

describe('second pass: a shared bank name is not a declaration', () => {
  it('an undeclared Scotiabank loan is not excused by a declared Scotiabank Visa', () => {
    expect(isDeclaredObligationClaim({ claim_zh: '申请表少报一项贷款', claim_en: 'application omits a loan', category: 'omission', evidence: ["'Application form FINANCIAL OBLIGATIONS: Scotiabank Visa $200/mo'", "'SCOTIABANK PERSONAL LOAN balance $30,000'"] })).toBe(false)
  })
})

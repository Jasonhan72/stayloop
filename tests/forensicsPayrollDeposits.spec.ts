// Regression guards from the 2026-09-11 Acciona / OSV case. The stubs named
// ACCIONA INFRASTRUCTURE CANADA INC., the Scotiabank statements named
// "Osv-Payroll" / "Osv Solutions Canada Inc" (OneSource Virtual, a Workday
// payroll outsourcer; the stubs were Workday-rendered), an April deposit of
// $21,035.39 was one net pay + the after-tax bonus the letter stated, Acciona
// itself paid reimbursements into the account, and a $4,000 cheque cleared on
// the 1st of every month. The model read "工资来源不符" and a spike.
import { describe, expect, it } from 'vitest'
import {
  detectPayrollProcessor, extractPayrollDeposits, extractStatedBonus, extractStubBonusYtd,
  findRecurringMonthlyPayment, reconcilePayrollDeposits,
} from '../lib/forensics/payroll-deposits'
import { analyzeCreditReport } from '../lib/screening/creditAnalysis'
import type { ForensicFlag } from '../lib/forensics/types'

const MAY = `MR CARLOS RODRIGUEZ
PATRICIA PEREIRA PEREZ
Your Ultimate Package account summary
Opening Balance on May 1, 2026 $67,610.38
May 1 Opening Balance 67,610.38
May 1 PC Bill payment 135.60 67,474.78
Rogers (9 Digit Acct Number)
May 1 Cheque 058 2226004895 4,000.00 63,474.78
May 15 Payroll dep. 6,954.83 69,363.62
Osv-Payroll
May 15 Misc. payment 93.03 69,456.65
Acciona Infrast
May 29 Payroll dep. 6,954.83 66,819.38
Osv Solutions Canada Inc
May 30 Closing Balance $66,819.38`

const APRIL = `Apr 1 Opening Balance 54,708.15
Apr 1 Cheque 056 2225511421 4,000.00 50,708.15
Apr 15 Payroll dep. 6,760.33 55,475.33
Osv-Payroll
Apr 16 Misc. payment 189.99 55,665.32
Acciona Infrast
Apr 30 Payroll dep. 21,035.39 67,610.38
Osv Solutions Canada Inc`

const MARCH = `Mar 1 Opening Balance 46,176.89
Mar 2 Cheque 055 2225040169 4,000.00 42,176.89
Mar 13 Payroll dep. 6,182.40 46,560.34
Osv-Payroll
Mar 31 Payroll dep. 7,904.38 54,708.15
Osv-Payroll`

const STUB = `Payslip: Carlos Regueiro Rodriguez: 2026-05-31 (CAN Regular) - Complete
ACCIONA INFRASTRUCTURE CANADA INC. 600 – 900 West Hastings Street
Current 86.67 10,986.66 0.00 4,031.83 0.00 6,954.83
YTD 866.70 144,597.69 0.00 64,075.94 0.00 80,521.75
Earnings
Description Dates Hours Rate Amount YTD
Bonus 30,418.41
Higher Duties 4,312.68
Regular 2026-05-16 - 2026-05-31 78.67 0.00 9,972.58 103,782.12`

const LETTER = `Your salary conditions for 2026 are outlined below:
Fixed Salary 2026: 263,679.63 CAD gross per year.
Regarding your variable retribution for 2025, I inform you it amounts to 30,418.41 CAD gross annually.
PLAN 1 BONUS PAY OUT: 26,980.00 CAD.
TOTAL BONUS PAYABLE: 30.418,41 CAD`

describe('payroll processors', () => {
  it('recognises OSV / OneSource Virtual and maps it to Workday', () => {
    expect(detectPayrollProcessor('Osv-Payroll')?.platform?.test('iText Core 9.3.0 Apryse Group NV, Workday, Inc.')).toBe(true)
    expect(detectPayrollProcessor('Osv Solutions Canada Inc')?.name).toMatch(/OneSource Virtual/)
    expect(detectPayrollProcessor('Costco Wholesale')).toBeNull()
  })
  it('reads payroll deposits with the payer printed on the next line (Scotiabank layout)', () => {
    const d = extractPayrollDeposits(MAY)
    expect(d.map(x => x.amount)).toEqual([6954.83, 6954.83])
    expect(d[0].payer).toBe('Osv-Payroll')
    expect(d[1].payer).toBe('Osv Solutions Canada Inc')
  })
  it('extracts the stated bonus in both number formats', () => {
    expect(extractStatedBonus(LETTER)).toBe(30418.41)
    expect(extractStatedBonus('TOTAL BONUS PAYABLE: 30.418,41 CAD')).toBe(30418.41)
    expect(extractStatedBonus('no bonus wording here')).toBeNull()
    expect(extractStubBonusYtd(STUB)).toBe(30418.41)
  })
  it('finds the rent-shaped recurring payment across statements', () => {
    const r = findRecurringMonthlyPayment([MARCH, APRIL, MAY])
    expect(r?.amount).toBe(4000)
    expect(r?.months).toBe(3)
  })
  it('reconciles the whole Acciona / OSV trail into corroboration flags', () => {
    const flags: ForensicFlag[] = []
    const stubMeta = { producer: 'iText® Core 9.3.0 (production version) ©2000-2025 Apryse Group NV, Workday, Inc.', creator: 'Workday' }
    reconcilePayrollDeposits([
      { file_name: 'MARCH 2026 CRR.pdf', file_kind: 'bank_statement', text_density: { text_sample: MARCH } },
      { file_name: 'APRIL 2026 CRR.pdf', file_kind: 'bank_statement', text_density: { text_sample: APRIL } },
      { file_name: 'MAY 2026 CRR.pdf', file_kind: 'bank_statement', text_density: { text_sample: MAY } },
      { file_name: 'Paystub#2.pdf', file_kind: 'pay_stub', text_density: { text_sample: STUB }, pdf_metadata: stubMeta, paystub_math: { extraction: { employer_name: 'ACCIONA INFRASTRUCTURE CANADA INC.', period_net: 6954.83, annual_salary: 263679.84 } } },
      { file_name: 'EmploymentLetter.pdf', file_kind: 'employment_letter', text_density: { text_sample: LETTER } },
    ], flags)
    const codes = flags.map(f => f.code)
    expect(codes).toContain('payroll_processor_recognized')
    expect(codes).toContain('employer_counterparty_on_statement')
    expect(codes).toContain('cross_doc_bonus_corroborated')
    expect(codes).toContain('bonus_deposit_reconciled')
    expect(codes).toContain('recurring_rent_like_payment')
    expect(flags.every(f => f.severity === 'info')).toBe(true)
    expect(flags.find(f => f.code === 'payroll_processor_recognized')!.evidence_en).toMatch(/same platform/)
  })
  it('stays silent when the payer is unknown', () => {
    const flags: ForensicFlag[] = []
    reconcilePayrollDeposits([
      { file_name: 'x.pdf', file_kind: 'bank_statement', text_density: { text_sample: 'Jun 15 Payroll dep. 2,100.00 5,000.00\nNumbered Co 123' } },
    ], flags)
    expect(flags.some(f => f.code === 'payroll_processor_recognized')).toBe(false)
  })
})

describe('credit inquiries: hard vs soft', () => {
  const base = { report_date: '2026/06/10', tradelines: [{ creditor: 'SCOTIABANK VISA', type: 'Revolving', date_opened: '2021/07/19', balance: 9247, credit_limit: 20000, high_credit: null, past_due: 0, payment_status: 'R1', late_30_60_90: '0/0/0' }] }
  it('counts only hard inquiries as credit seeking when the report says which are hard', () => {
    const a = analyzeCreditReport({
      ...base,
      inquiries: [
        { date: '2026/06/08', creditor: 'TRULIOO PAYPAL CANAD', hard: false },
        { date: '2026/05/17', creditor: 'TRULIOO PAYPAL CANAD', hard: false },
        { date: '2025/11/30', creditor: 'Bank of Nova Scotia', hard: false },
        { date: '2025/09/02', creditor: 'FREEDOM MOBILE', hard: true },
        { date: '2025/09/02', creditor: 'FREEDOM MOBILE', hard: false },
        { date: '2025/07/05', creditor: 'BANK OF NOVA SCOTIA', hard: false },
      ],
    })!
    expect(a.inquiries12mo).toBe(6)
    expect(a.hardInquiries12mo).toBe(1)
    expect(a.flags.some(f => f.severity === 'medium' && /inquir/i.test(f.en))).toBe(false)
    expect(a.flags.some(f => f.severity === 'info' && /only 1 hard/.test(f.en))).toBe(true)
  })
  it('falls back to the total when hard/soft is unknown', () => {
    const a = analyzeCreditReport({ ...base, inquiries: Array.from({ length: 5 }, (_, i) => ({ date: `2026/0${i + 1}/10`, creditor: `L${i}` })) })!
    expect(a.hardInquiries12mo).toBeNull()
    expect(a.flags.some(f => f.severity === 'medium' && /5 credit inquiries/.test(f.en))).toBe(true)
  })
})

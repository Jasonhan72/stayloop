// Per-document landlord reading (2026-09-12): the cards used to carry PDF
// producers and text density; a landlord wants who pays into the account,
// whether rent is already being paid, month-end money, NSFs, payday
// lenders, casinos, collections, take-home pay, past-due balances.
import { describe, expect, it } from 'vitest'
import { readBankStatement, readPayStub, readCreditReportFile, readEmploymentLetter, readTaxDocument, readApplicationForm, mergeModelReadings } from '../lib/forensics/landlord-reading'

const SCOTIA = 'MR CARLOS RODRIGUEZ PATRICIA PEREIRA PEREZ 32 OAKEN GATEWAY Your Ultimate Package account summary Opening Balance on May 1, 2026 $67,610.38 May 1 Opening Balance 67,610.38 May 1 PC Bill payment 135.60 67,474.78 Rogers May 1 Cheque 058 2226004895 4,000.00 63,474.78 May 4 Misc. payment 402.21 62,902.57 Cdlsi May 15 Payroll dep. 6,954.83 69,363.62 Osv-Payroll May 23 PC Transfer to Credit Card 5,000.00 63,909.25 May 29 Payroll dep. 6,954.83 66,819.38 Osv Solutions Canada Inc May 30 Closing Balance $66,819.38'
const STRESSED = 'Opening Balance on Jun 1, 2026 $412.10 Jun 1 Opening Balance 412.10 Jun 2 NSF fee 48.00 364.10 Jun 3 Money Mart loan 600.00 964.10 Jun 5 OLG online 120.00 844.10 Jun 6 Bet365 200.00 644.10 Jun 8 Payroll dep. 1,420.00 2,064.10 Numbered Co 123 Jun 9 Casino Niagara 300.00 1,764.10 Jun 12 CBV Collection 150.00 1,614.10 Jun 30 Closing Balance $1,614.10'

describe('bank statement reading', () => {
  it('reads payroll, rent, card payments, reserves and a clean NSF record from a strong statement', () => {
    const r = readBankStatement(SCOTIA, { monthlyRent: 2400, claimedMonthlyIncome: 21973 }, false)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/工资入账 2 笔/)
    expect(zh).toMatch(/工资代发商/)
    expect(zh).toMatch(/\$4,000/)
    expect(zh).toMatch(/信用卡还款/)
    expect(zh).toMatch(/最低余额/)
    expect(zh).toMatch(/没有 NSF/)
    expect(r.bullets.some(b => b.tone === 'bad')).toBe(false)
  })
  it('calls out NSF, payday lenders, gambling and collections on a stressed statement', () => {
    const r = readBankStatement(STRESSED, { monthlyRent: 1800, claimedMonthlyIncome: 3000 }, false)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/NSF/)
    expect(zh).toMatch(/发薪日贷款/)
    expect(zh).toMatch(/博彩/)
    expect(zh).toMatch(/催收/)
    expect(r.bullets.filter(b => b.tone === 'bad').length).toBeGreaterThanOrEqual(3)
    expect(r.asks.length).toBeGreaterThan(0)
  })
})

describe('other documents', () => {
  it('turns a pay stub into take-home language', () => {
    const r = readPayStub({ annual_salary: 263679.84, hourly_rate: null, hours_worked: 86.67, pay_date: '2026-05-29', pay_period_start: null, pay_period_end: null, period_gross: 10986.66, period_net: 6954.83, ytd_gross: 144597.69, ytd_net: null, employer_name: 'ACCIONA INFRASTRUCTURE CANADA INC.', employer_phone: null, pay_frequency: 'semimonthly', cpp_ytd: null, cpp2_ytd: null, ei_ytd: null, cpp_period: null, ei_period: null }, 'Employer Paid Health 281.86 LTD Taxable Benefit', 1.35, 34731.09)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/到手 \$6,955/)
    expect(zh).toMatch(/奖金/)
    expect(zh).toMatch(/福利/)
  })
  it('reads a credit report for a landlord', () => {
    const r = readCreditReportFile({ credit_score: 640, report_date: '2026-06-10', monthly_debt_payments: 900, tradelines: [{ creditor: 'VISA', type: 'Revolving', date_opened: '2022/01/01', balance: 8500, credit_limit: 10000, high_credit: null, past_due: 350, payment_status: 'R2', late_30_60_90: '1/0/0' }], collections: [{ creditor: 'ROGERS', date_assigned: '2025/01/01', original_amount: 400, balance: 400 }], bankruptcies: [], inquiries: [] } as never, 4000, 1800)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/当前逾期 \$350/)
    expect(zh).toMatch(/使用率 85%/)
    expect(zh).toMatch(/占毛收入 68%/)
    expect(zh).toMatch(/催收记录 1 条，有未结清/)
  })
  it('recognises a compensation notice that is not an employment letter, and a free mailbox', () => {
    const r = readEmploymentLetter('Your salary conditions for 2026 are outlined below: Fixed Salary 2026: 263,679.63 CAD. Regarding your variable retribution for 2025 ... contact hr.person@gmail.com')
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/薪酬通知/)
    expect(zh).toMatch(/免费邮箱/)
  })
  it('reads a NOA against the claimed income and the application form for callable landlords', () => {
    const r = readTaxDocument('Notice of assessment Tax year 2023 Total income 15000 58,420.00', 8000)
    expect(r.bullets[0].zh).toMatch(/\$58,420/)
    expect(r.bullets[0].tone).toBe('warn')
    const a = readApplicationForm({ prev_residences: [{ address: '1 A St', period: '2021 to 2023', landlord_name: 'J Zhou', landlord_phone: '431-887-8666' }], vacating_reason: 'BY REQUEST OF THE LANDLORD FOR PERSONAL USE', blank_sections: [] })
    expect(a.bullets[0].zh).toMatch(/1 处有房东姓名和电话/)
    expect(a.bullets[1].zh).toMatch(/房东方原因/)
    expect(a.asks[0].zh).toMatch(/431-887-8666/)
  })
  it('merges model bullets without duplicating measured ones', () => {
    const pf: any = { file_name: 'x.pdf', file_kind: 'bank_statement', flags: [], elapsed_ms: 0, landlord_reading: { bullets: [{ zh: '工资入账 2 笔，合计 $13,910', en: '', tone: 'good', source: 'measured' }], asks: [] } }
    mergeModelReadings([pf], [{ file: 'x.pdf', landlord_read_zh: ['工资入账 2 笔，合计 $13,910', '每月 1 日支票 $4,000 连续 3 个月'], landlord_read_en: ['2 payroll deposits', '$4,000 cheque monthly'], ask_zh: '现租多少？', ask_en: 'Current rent?' }])
    expect(pf.landlord_reading.bullets).toHaveLength(2)
    expect(pf.landlord_reading.bullets[1].source).toBe('model')
    expect(pf.landlord_reading.asks[0].zh).toBe('现租多少？')
  })
})

const TD_OCR = `TD Canada Trust
MISS NATHALIE CIPRIANI CAMPINS
NATHALIE CIPRIANI CAMPINS
Statement of Account
Statement From To
AUG 30/24 - SEP 27/24
Description Withdrawals Deposits Date Balance
STARTING BALANCE 23,136.23
E-TRANSFER 3,547.21 SEP03 26,683.44
SEND E-TFR ***yFa 45.00 SEP05
COSTCO WHOLESALE 216.59 SEP10 26,317.85
REMITLY *GO_V 68.23 SEP13 26,280.01
E-TRANSFER ***NNf 700.00 SEP18
MONTHLY ACCOUNT FEE 10.95 SEP27 25,919.86`

describe('TD-style statement (date at the end of the row, OCR)', () => {
  it('parses rows, reads salary arriving by e-Transfer, remittances and balances', () => {
    const r = readBankStatement(TD_OCR, { monthlyRent: 1800, claimedMonthlyIncome: 4500, stubNetPays: [3547.21] }, true)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/电子转账形式到账/)
    expect(zh).toMatch(/国际汇款/)
    expect(zh).toMatch(/最低余额 \$23,136/)
    expect(r.asks.some(a => /那笔入账是谁付的/.test(a.zh))).toBe(true)
  })
})

describe('TD vertical and piped OCR layouts', () => {
  const VERTICAL = `Description\nWithdrawals\nDeposits\nDate\nBalance\nSTARTING BALANCE\nCHEQUE 00008-11400009239\n3,547.21\nSEP30\n25,919.86\nREMITLY* *F5_V\n168.23\nOCT01\n29,467.07\nSEND E-TFR ***pTa\n25.00\nOCT02\nNON-TD ATM W/D\n403.50\nOCT02\n29,273.84\nE-TRANSFER ***Gxa\n100.00\nOCT22\n27,943.73`
  const PIPED = `Description | Withdrawals | Deposits | Date | Balance\nSTARTING BALANCE | | | JUL30 | 20,320.53\nSEND E-TFR ***hjp | | 3,547.21 | AUG01 | 23,867.76\nTD ATM DEP 008000 | | 400.00 | |\nSEND E-TFR ***GOy | 15.00 | | AUG10 |\nE-TRANSFER ***2gdt | | 1,500.00 | AUG16 | 23,740.99\nGC 1544-CASH WITHDRA | 1,400.00 | | AUG16 |`
  it('reads the vertical layout and spots pay arriving by cheque', () => {
    const r = readBankStatement(VERTICAL, { monthlyRent: 1800, claimedMonthlyIncome: 4500, stubNetPays: [3547.21] }, true)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/支票存入形式到账/)
    expect(zh).toMatch(/国际汇款/)
  })
  it('reads the piped layout with known direction and flags the e-Transfer salary', () => {
    const r = readBankStatement(PIPED, { monthlyRent: 1800, claimedMonthlyIncome: 4500, stubNetPays: [3547.21] }, true)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).toMatch(/电子转账形式到账/)
    expect(zh).toMatch(/最低余额/)
  })
})

// Review 2026-09-13 — ordinary statement lines must not read as lenders,
// collections, car loans or rent.
describe('bank statement reading — ordinary lines stay ordinary', () => {
  const ORDINARY = 'Opening Balance on Jun 1, 2026 $5,200.00 Jun 1 Opening Balance 5,200.00 Jun 1 Mortgage payment 1,900.00 3,300.00 Jun 2 INTERAC E-TRANSFER AUTODEPOSIT 300.00 3,600.00 Jun 3 VISA DEBIT RETAIL PURCHASE 42.10 3,557.90 Jun 4 WASTE COLLECTION CITY 60.00 3,497.90 Jun 5 E-TRANSFER BREE SMITH 80.00 3,417.90 Jun 6 E-TRANSFER JOHN NEWTON 50.00 3,367.90 Jun 15 Direct deposit 3,200.00 6,567.90 ACME CORP Jul 1 Mortgage payment 1,900.00 4,667.90 Jul 3 Direct deposit 3,200.00 7,867.90 ACME CORP'
  it('does not read a mortgage as rent, autodeposit as a car loan, or a person named Bree / Newton as a lender / exchange', () => {
    const r = readBankStatement(ORDINARY, { monthlyRent: 2000, claimedMonthlyIncome: 4500 }, false)
    const zh = r.bullets.map(b => b.zh).join('\n')
    expect(zh).not.toMatch(/形态像现租|像是当月房租/)
    expect(zh).not.toMatch(/发薪日|催收|加密|车贷/)
    expect(zh).not.toMatch(/大额非工资入账/)
    expect(r.bullets.some(b => b.tone === 'bad')).toBe(false)
  })
})

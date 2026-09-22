import { describe, expect, it } from 'vitest'
import { bureauCreditEventDates, bureauEmployerFromText, explainBureauEmployer } from '../lib/screening/bureauEmployer'
import { matchBankAct, parseBankActPage, bankNameKey, BANK_ACT_SNAPSHOT } from '../lib/forensics/bank-act'
import { mergeTradeNames, employerExtraChecks } from '../lib/forensics/employer-checks'
import { checkArmLength } from '../lib/forensics/arm-length'

// 2026-09-22 — deep-check review on case 28. The user's instruction: a bank
// that plainly exists must not read "not in any registry"; a bureau employer
// that differs from the letter needs its REASON found, not a verdict of
// "fake". Fixture values keep the shape of the case.

describe('bureau employer vs letter: the reason, not a verdict', () => {
  const yiText = 'Employment Type Employer Name Current GTS SERVICES Credit Report Request Date 2026/07/09 … Opened 2025/02/12 … Opened 2019/09/03 … DATE MEMBER NUMBER MEMBER NAME PHONE MAY AFFECT SCORES 2026/06/02 481FX01661 QUESTRADE INC. 888-783-7866 No 2026/03/10 651BB00085 TDCT 866-222-3456 No 2025/04/12 001UT02574 BELL CANADA 800-730-7121 Yes 2025/04/12 481UT02445 BELL MOBILITY 800-509-9904 Yes 2024/11/23 481UT02437 VIRGIN PLUS 800-509-9904 Yes'
  it('reads the employer line and only the HARD inquiries / account openings', () => {
    expect(bureauEmployerFromText(yiText)).toBe('GTS SERVICES')
    const ev = bureauCreditEventDates(yiText)
    expect(ev.hard_inquiries).toEqual(['2025-04-12', '2024-11-23'])
    expect(ev.opened).toEqual(['2025-02-12', '2019-09-03'])
  })
  it('a job that started after the last credit application is stale on the file by construction', () => {
    const v = explainBureauEmployer({ bureau_employer: 'GTS SERVICES', current_employer: 'David Health International', employment_start: '2025-09-29', hard_inquiry_dates: ['2025-04-12', '2024-11-23'], account_open_dates: ['2025-02-12'], application_employers: ['Hana Bank Canada', 'David Health International', 'GTS Services'] })
    expect(v.kind).toBe('stale_by_construction')
    expect(v.last_credit_event).toBe('2025-04-12')
    expect(v.explanation_zh).toContain('不是矛盾')
    expect(v.explanation_zh).toContain('前雇主')
  })
  it('credit activity after the start date with an employer the application never mentions stays a question', () => {
    const v = explainBureauEmployer({ bureau_employer: 'ACME WIDGETS', current_employer: 'David Health International', employment_start: '2025-09-29', hard_inquiry_dates: ['2026-03-01'], application_employers: ['David Health International'] })
    expect(v.kind).toBe('unexplained')
  })
  it('the same employer under a different spelling is "same"', () => {
    expect(explainBureauEmployer({ bureau_employer: 'KEB HANA BANK CANADA', current_employer: 'KEB Hana Bank Canada', employment_start: '2024-11-25' }).kind).toBe('same')
  })
})

describe('banks are Bank Act schedule listings, not registry filings', () => {
  it('matches statutory names, "(The)" forms and the trade name', () => {
    expect(matchBankAct('KEB Hana Bank Canada')?.schedule).toBe('II')
    expect(matchBankAct('Hana Bank Canada')?.name).toBe('KEB Hana Bank Canada')
    expect(matchBankAct('The Toronto-Dominion Bank')?.schedule).toBe('I')
    expect(matchBankAct('Royal Bank of Canada')?.schedule).toBe('I')
    expect(matchBankAct('Wells Fargo Bank, National Association, Canadian Branch')?.schedule).toBe('III')
    expect(matchBankAct('2201371 Ontario Inc.')).toBeNull()
    expect(matchBankAct('Bank Street Bakery')).toBeNull()
    expect(bankNameKey('Bank of Nova Scotia (The)')).toBe('bank of nova scotia')
  })
  it('parses the statute page as rendered and finds the snapshot names in it', () => {
    const page = '| Name of Bank | Head Office |\n| --- | --- |\n| Amex Bank of Canada | Ontario |\n| KEB Hana Bank Canada | Ontario |\n'
    const rows = parseBankActPage(page, 'II')
    expect(rows).toEqual([{ name: 'Amex Bank of Canada', schedule: 'II', head_office: 'Ontario' }, { name: 'KEB Hana Bank Canada', schedule: 'II', head_office: 'Ontario' }])
    expect(BANK_ACT_SNAPSHOT.filter(b => b.schedule === 'II').length).toBe(15)
  })
  it('checkArmLength: a bank gets a Bank Act card, no "not found", and a clean risk', async () => {
    const r = await checkArmLength('KEB Hana Bank Canada', 'Sunkyoung Kim', undefined, undefined, { companyLookup: async () => null })
    expect(r.regulated_bank?.schedule).toBe('II')
    expect(r.company_info?.source).toBe('bank_act')
    expect(r.company_info?.status).toMatch(/^Active/)
    expect(r.flags.map(f => f.code)).toContain('employer_bank_act_listed')
    expect(r.flags.map(f => f.code)).not.toContain('arm_length_company_not_found')
    expect(r.flags.map(f => f.code)).not.toContain('arm_length_officers_unavailable')
    expect(r.arm_length_risk).toBe('clean')
  })
  it('a lender in court is routine business, not an employer-stability warning', () => {
    const lit = { total: 12, cases: [{ title: 'X v. Y et al', role: 'Respondent / Defendant', filed: '2024-01-11', closed: false }, { title: 'KEB HANA BANK CANADA v. PENG', role: 'Applicant / Plaintiff', filed: '2023-08-02', closed: null }] }
    const bank = employerExtraChecks({ employer_name: 'KEB Hana Bank Canada', litigation: lit, regulated_lender: true })
    expect(bank.flags.map(f => `${f.code}:${f.severity}`)).toContain('employer_court_cases_lender_routine:info')
    expect(bank.flags.map(f => f.code)).not.toContain('employer_court_cases')
    const shop = employerExtraChecks({ employer_name: 'Acme Widgets Ltd', litigation: lit })
    expect(shop.flags.find(f => f.code === 'employer_court_cases')?.severity).toBe('medium')
  })
})

describe('trade names fold into the registered entity', () => {
  const doc = 'This is to certify that Mr. Huijun Yi has been a Full-time employee of David Health International (c/o 2201371 Ontario Inc.) since September 29, 2025.\n\n---\n\n2201371 Ontario Inc.(o/a David Health International) Warehouse Associate Pay Period: 07/01/26 - 07/31/26'
  it('c/o on the letter and o/a on the stub make one employer', () => {
    const m = mergeTradeNames(['KEB Hana Bank Canada', '2201371 ONTARIO INC.', 'David Health International'], doc)
    expect(m.names).toEqual(['KEB Hana Bank Canada', '2201371 ONTARIO INC.'])
    expect(m.trade_names).toEqual({ '2201371 ONTARIO INC.': ['David Health International'] })
  })
  it('unrelated employers are left alone', () => {
    const m = mergeTradeNames(['Acme Ltd', 'Beta Corp'], 'Acme Ltd letter … Beta Corp stub')
    expect(m.names).toEqual(['Acme Ltd', 'Beta Corp'])
    expect(m.trade_names).toEqual({})
  })
  it('an established numbered company trading under a name is a low note, not a medium shell warning', async () => {
    const r = await checkArmLength('2201371 ONTARIO INC.', 'Huijun Yi', undefined, undefined, {
      trade_names: ['David Health International'],
      companyLookup: async () => ({ name: '2201371 ONTARIO INC.', company_number: '2201371', jurisdiction: 'Ontario', incorporation_date: '2009-03-24', status: 'Active (incorporated)', registered_address: 'North York, Ontario', company_type: 'ONTARIO BUSINESS CORP.', officers: [], registry_url: 'x', source: 'cbr_on' }),
    })
    expect(r.trade_names).toEqual(['David Health International'])
    expect(r.flags.find(f => f.code === 'arm_length_numbered_company')?.severity).toBe('low')
    expect(r.flags.map(f => f.code)).toContain('employer_trade_name')
    const fresh = await checkArmLength('9999999 ONTARIO INC.', 'Huijun Yi', undefined, undefined, {
      companyLookup: async () => ({ name: '9999999 ONTARIO INC.', company_number: '9999999', jurisdiction: 'Ontario', incorporation_date: '2026-01-05', status: 'Active', registered_address: null, company_type: null, officers: [], registry_url: 'x', source: 'cbr_on' }),
    })
    expect(fresh.flags.find(f => f.code === 'arm_length_numbered_company')?.severity).toBe('medium')
  })
})

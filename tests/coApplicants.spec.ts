// Only the applicant and co-applicants are searched in the courts / LTB.
// 2026-09-11: the HR signatory, two prior landlords and the listing broker
// were all searched, and a landlord's 2017 small-claims case as PLAINTIFF
// showed on the applicant's summary as "1 record found".
import { describe, expect, it } from 'vitest'
import { selectCoApplicantNames, sameName, nameCovers } from '../lib/screening/coApplicants'
import { extractPhones, isDialableNanp } from '../lib/forensics/cross-doc'
import { applyStubAnnualFromPeriod, extractOneOffYtd, checkPaystubMath } from '../lib/forensics/paystub-math'
import { isPeriodReconciledPayClaim, isSameNameClaim, sanitizeCoherenceOutput } from '../lib/screening/coherenceReview'

describe('name equivalence', () => {
  it('treats surname-first and accented spellings as the same person', () => {
    expect(sameName('REGUEIRO RODRIGUEZ CARLOS', 'Carlos Regueiro Rodríguez')).toBe(true)
    expect(sameName('Carlos Rodriguez', 'Carlos Regueiro Rodriguez')).toBe(false)
    expect(nameCovers('Carlos Rodriguez', 'Carlos Regueiro Rodriguez')).toBe(true)
  })
})

describe('selectCoApplicantNames', () => {
  const ctx = {
    idDocNames: ['REGUEIRO RODRIGUEZ CARLOS'],
    thirdPartyNames: ['Esmeralda Bucosa Lopez', 'YUZHEN CIREN', 'JANPING ZHOU', 'Nestor Paez', 'Sheng Chu', 'He Xianda', 'Wu Shubo'],
  }
  it('drops the primary (in any order), third parties, and names on no ID', () => {
    const r = selectCoApplicantNames(
      ['Regueiro Rodriguez Carlos', 'Patricia Pereira Perez', 'He Xianda', 'Wu Shubo', 'Esmeralda Bucosa Lopez', 'Carlos Pianelles', 'Nestor Paez', 'Sheng Chu'],
      'Carlos Regueiro Rodriguez', ctx,
    )
    expect(r.searched).toEqual([])
    expect(r.dropped.find(d => d.name === 'Regueiro Rodriguez Carlos')?.reason).toBe('primary')
    expect(r.dropped.find(d => d.name === 'Nestor Paez')?.reason).toBe('third_party')
    expect(r.dropped.find(d => d.name === 'Patricia Pereira Perez')?.reason).toBe('not_on_id')
  })
  it('keeps a real co-applicant whose ID is in the file', () => {
    const r = selectCoApplicantNames(['Patricia Pereira Perez', 'Nestor Paez'], 'Carlos Regueiro Rodriguez', { ...ctx, idDocNames: [...ctx.idDocNames, 'PEREIRA PEREZ PATRICIA'] })
    expect(r.searched).toEqual(['Patricia Pereira Perez'])
  })
  it('without any ID-document names, still excludes known third parties', () => {
    const r = selectCoApplicantNames(['Patricia Pereira Perez', 'Nestor Paez'], 'Carlos Regueiro Rodriguez', { idDocNames: [], thirdPartyNames: ['Nestor Paez'] })
    expect(r.searched).toEqual(['Patricia Pereira Perez'])
  })
})

describe('phones must be dialable', () => {
  it('rejects statement reference numbers and toll-free lines', () => {
    expect(isDialableNanp('0438022026')).toBe(false)
    expect(isDialableNanp('8004726842')).toBe(false)
    expect(isDialableNanp('4162188800')).toBe(true)
    const found = extractPhones('Call 1 800 472-6842 · ref 0438022026 · landlord +1 416-218-8800 · SBSAV16000_3981686_019')
    expect(found).toEqual(['4162188800'])
  })
})

describe('pay stub arithmetic', () => {
  const stubText = 'Payslip Current 86.67 10,986.66 0.00 4,031.83 0.00 6,954.83 YTD 866.70 144,597.69 Earnings Description Dates Hours Rate Amount YTD Bonus 30,418.41 Higher Duties 4,312.68 Holiday 2026-05-16 - 2026-05-31 8.00 126.76 1,014.08 4,056.32 Regular 2026-05-16 - 2026-05-31 78.67 0.00 9,972.58 103,782.12 Vacation 2,028.16 Total: 10,986.66 144,597.69'
  it('derives the annual salary from period × frequency when the stub prints no annual rate', () => {
    const ext = { annual_salary: 287932, period_gross: 10986.66, pay_frequency: 'semimonthly' } as never
    applyStubAnnualFromPeriod(ext, stubText)
    expect((ext as { annual_salary: number }).annual_salary).toBeCloseTo(263679.84, 2)
    const stated = { annual_salary: 120000, period_gross: 5000, pay_frequency: 'semimonthly' } as never
    applyStubAnnualFromPeriod(stated, 'Annual Salary $120,000.00 per year')
    expect((stated as { annual_salary: number }).annual_salary).toBe(120000)
  })
  it('sums one-off YTD lines and reconciles YTD above pro-rata as corroboration', () => {
    expect(extractOneOffYtd(stubText)).toBeCloseTo(34731.09, 2)
    const { flags, result } = checkPaystubMath({
      annual_salary: 263679.84, hourly_rate: null, hours_worked: null, pay_date: '2026-05-29', pay_period_start: '2026-05-16', pay_period_end: '2026-05-31',
      period_gross: 10986.66, period_net: 6954.83, ytd_gross: 144597.69, ytd_net: null, employer_name: 'ACCIONA', employer_phone: null, pay_frequency: 'semimonthly',
      cpp_ytd: null, cpp2_ytd: null, ei_ytd: null, cpp_period: null, ei_period: null,
    }, 'Paystub#2.pdf', 34731.09)
    expect(result.ytd_ratio_ex_one_off).toBeGreaterThan(0.95)
    expect(result.ytd_ratio_ex_one_off).toBeLessThan(1.1)
    expect(flags.some(f => f.code === 'paystub_ytd_above_pro_rata')).toBe(false)
    expect(flags.find(f => f.code === 'paystub_ytd_one_off_reconciled')?.severity).toBe('info')
  })
})

describe('coherence backstops', () => {
  it('drops a pay "mismatch" whose figures are one salary in two periods', () => {
    const a = { claim_zh: '申请月薪2.2万与雇佣信年薪不一致', claim_en: 'monthly vs annual salary differ', evidence: ["'Current salary range: Monthly $ 22,000.00'", "'Fixed Salary 2026: 263,679.63 CAD gross per year.'"] }
    expect(isPeriodReconciledPayClaim(a)).toBe(true)
    const real = { claim_zh: '申请月薪与雇佣信年薪不一致', claim_en: 'salary differs', evidence: ["'Monthly $ 22,000.00'", "'Base Annual Salary of CAD $215,000.00'"] }
    expect(isPeriodReconciledPayClaim(real)).toBe(false)
  })
  it('drops a name "mismatch" that is the same tokens reordered or de-accented', () => {
    const a = { claim_zh: '姓名写法不一致：含重音/姓名前后顺序不同', claim_en: 'name spelling differs', evidence: ["'Name..CARLOS REGUEIRO RODRÍGUEZ'", "'Current Name CARLOS REGUEIRO RODRIGUEZ'", "'REGUEIRO RODRIGUEZ CARLOS'"] }
    expect(isSameNameClaim(a)).toBe(true)
    const b = { claim_zh: '姓名不一致', claim_en: 'name differs', evidence: ["'CARLOS RODRIGUEZ'", "'CARLOS REGUEIRO RODRIGUEZ'"] }
    expect(isSameNameClaim(b)).toBe(false)
    const r = sanitizeCoherenceOutput({ anomalies: [{ id: 'A1', category: 'cross_document', severity: 'medium', files: ['x'], claim_zh: a.claim_zh, claim_en: a.claim_en, evidence: a.evidence, confidence: 0.8 }] }, null, 0)
    expect(r.anomalies).toHaveLength(0)
  })
})

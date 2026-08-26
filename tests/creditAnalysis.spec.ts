import { describe, it, expect } from 'vitest'
import { analyzeCreditReport, SCORE_BANDS } from '../lib/screening/creditAnalysis'
import type { CreditReport } from '../lib/screening-types'

// 这层是把「转录」变成「分析」的确定性算术（对标 SingleKey 的 credit
// overview）。它的数字会被房东拿去和银行的放贷口径比对，所以每一条都要能
// 手算复核——这里用真实案例的形状钉住行为。

type Tradeline = NonNullable<CreditReport['tradelines']>[number]

function tl(over: Partial<Tradeline> = {}): Tradeline {
  return {
    creditor: 'TD VISA', type: 'Revolving', date_opened: '2024/01/01',
    balance: 0, high_credit: null, credit_limit: 10000,
    past_due: 0, payment_status: 'R1 Revolving - Paid as agreed and up to date', late_30_60_90: '0/0/0',
    ...over,
  }
}

describe('analyzeCreditReport', () => {
  it('空输入返回 null，不装成有分析', () => {
    expect(analyzeCreditReport(null)).toBeNull()
    expect(analyzeCreditReport({})).toBeNull()
  })

  it('分数落在正确的档位（760 = excellent 起点）', () => {
    const a = analyzeCreditReport({ credit_score: 761, tradelines: [tl()] })!
    expect(a.band?.key).toBe('excellent')
    expect(analyzeCreditReport({ credit_score: 493, tradelines: [tl()] })!.band?.key).toBe('low')
    // 档位表本身必须无缝覆盖 300-900
    for (let i = 1; i < SCORE_BANDS.length; i++) {
      expect(SCORE_BANDS[i].min).toBe(SCORE_BANDS[i - 1].max + 1)
    }
  })

  it('超额度的真实案例：$10,470 余额 / $10,000 额度 = 104.7%，必须报超限', () => {
    const a = analyzeCreditReport({
      tradelines: [tl({ balance: 10470, credit_limit: 10000, high_credit: 11664 })],
    })!
    expect(a.revolvingUtilization).toBeCloseTo(1.047, 3)
    expect(a.flags.some(f => /OVER LIMIT/i.test(f.en))).toBe(true)
  })

  it('utilization 用 credit_limit，缺失时才退回 high_credit', () => {
    const a = analyzeCreditReport({
      tradelines: [tl({ balance: 500, credit_limit: null, high_credit: 1000 })],
    })!
    expect(a.revolvingUtilization).toBeCloseTo(0.5)
  })

  it('按类别聚合：学生贷归 installment，逾期额进对应类别', () => {
    const a = analyzeCreditReport({
      tradelines: [
        tl(),
        tl({ creditor: 'CDA STUDENT LOANS', type: 'Installment', balance: 19780, credit_limit: null, high_credit: 19780, payment_status: 'I0 Installment - Too new to rate' }),
        tl({ creditor: 'TD MORTGAGE', type: 'Mortgage', balance: 153460, credit_limit: 185000, past_due: 10893, payment_status: 'M5 - At least 120 days past due', late_30_60_90: '3/2/12' }),
      ],
    })!
    const keys = a.categories.map(c => c.key)
    expect(keys).toContain('installment')
    expect(keys).toContain('mortgage')
    const mort = a.categories.find(c => c.key === 'mortgage')!
    expect(mort.pastDue).toBe(10893)
    expect(mort.delinquentCount).toBe(1)
    expect(a.totalPastDue).toBe(10893)
  })

  it('三种逾期信号任一命中都算 delinquent：past_due / late 计数 / 状态码', () => {
    const a = analyzeCreditReport({
      tradelines: [
        tl({ creditor: 'A', past_due: 100 }),
        tl({ creditor: 'B', late_30_60_90: '1/0/0' }),
        tl({ creditor: 'C', payment_status: 'R9 - Bad debt, collection account' }),
        tl({ creditor: 'D' }),
      ],
    })!
    expect(a.delinquent.map(d => d.creditor).sort()).toEqual(['A', 'B', 'C'])
  })

  it('DTI = 月还款 ÷ 月收入；缺任一边为 null', () => {
    const cr: CreditReport = { tradelines: [tl()], monthly_debt_payments: 1617 }
    expect(analyzeCreditReport(cr, { monthlyIncome: 11550 })!.dti).toBeCloseTo(0.14, 2)
    expect(analyzeCreditReport(cr)!.dti).toBeNull()
    expect(analyzeCreditReport({ tradelines: [tl()] }, { monthlyIncome: 5000 })!.dti).toBeNull()
  })

  it('查询次数以报告日期为锚，只数 12 个月内的', () => {
    const a = analyzeCreditReport({
      report_date: '2026/08/20',
      tradelines: [tl()],
      inquiries: [
        { date: '2026/08/09', creditor: 'X' },
        { date: '2026/01/20', creditor: 'Y' },
        { date: '2024/05/08', creditor: 'OLD' },
      ],
    })!
    expect(a.inquiries12mo).toBe(2)
  })

  it('干净档案给一条 info 而不是沉默——「没发现」也要说出来', () => {
    const a = analyzeCreditReport({ credit_score: 761, tradelines: [tl()] })!
    expect(a.flags).toHaveLength(1)
    expect(a.flags[0].severity).toBe('info')
  })
})

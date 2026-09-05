import { describe, it, expect } from 'vitest'
import { findRecurringDeposits, summarizeBank, normalizeCounterparty, isPayrollLike } from '../lib/verify/income'

// 银行直连的收入识别是确定性算术：房东要拿「月均工资入账」去对申请表上的收入，
// 这个数不能出自模型。用真实形状的流水钉住行为。

function biweekly(label: string, amount: number, n: number, start = '2026-06-05') {
  const out = []
  let d = new Date(start + 'T00:00:00Z')
  for (let i = 0; i < n; i++) {
    out.push({ date: d.toISOString().slice(0, 10), description: `${label} 00${i}`, credit: amount + (i % 2 ? 3.1 : -2.4), debit: null })
    d = new Date(d.getTime() + 14 * 86_400_000)
  }
  return out
}

describe('findRecurringDeposits', () => {
  it('finds a biweekly payroll and converts it to a monthly equivalent', () => {
    const r = findRecurringDeposits(biweekly('PAYROLL DEP ACME CORP', 2100, 6))
    expect(r).toHaveLength(1)
    expect(r[0].occurrences).toBe(6)
    expect(r[0].avg_interval_days).toBe(14)
    // 2100 × 30.4375 / 14 ≈ 4565
    expect(r[0].monthly_equivalent).toBeGreaterThan(4500)
    expect(r[0].monthly_equivalent).toBeLessThan(4650)
  })

  it('ignores one-off credits and wildly varying amounts', () => {
    const txns = [
      { date: '2026-06-01', description: 'E-TRANSFER FROM MOM', credit: 500, debit: null },
      { date: '2026-06-20', description: 'REFUND AMAZON', credit: 40, debit: null },
      { date: '2026-07-04', description: 'REFUND AMAZON', credit: 900, debit: null },
      { date: '2026-07-20', description: 'REFUND AMAZON', credit: 12, debit: null },
    ]
    expect(findRecurringDeposits(txns)).toHaveLength(0)
  })

  it('does not treat a fortnightly rent-sized debit or daily micro-credits as income', () => {
    const daily = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, '0')}`, description: 'INTEREST', credit: 0.11, debit: null,
    }))
    expect(findRecurringDeposits(daily)).toHaveLength(0)
  })
})

describe('isPayrollLike / normalizeCounterparty', () => {
  it('strips reference numbers so the same employer groups together', () => {
    expect(normalizeCounterparty('PAYROLL DEP ACME CORP 000123')).toBe(normalizeCounterparty('PAYROLL DEP ACME CORP 000987'))
  })
  it('accepts payroll-labelled deposits, and large regular unlabelled ones only with 3+ occurrences', () => {
    expect(isPayrollLike({ label: 'payroll acme', occurrences: 2, avg_amount: 400, avg_interval_days: 14, monthly_equivalent: 869, last_date: '2026-07-01' })).toBe(true)
    expect(isPayrollLike({ label: 'john smith', occurrences: 2, avg_amount: 1500, avg_interval_days: 30, monthly_equivalent: 1500, last_date: '2026-07-01' })).toBe(false)
    expect(isPayrollLike({ label: 'john smith', occurrences: 3, avg_amount: 1500, avg_interval_days: 30, monthly_equivalent: 1500, last_date: '2026-07-01' })).toBe(true)
  })
})

describe('summarizeBank', () => {
  it('masks account numbers, collects holders, counts NSF, sums payroll across accounts', () => {
    const r = summarizeBank([
      {
        title: 'Chequing', account_number: '1234567890', category: 'Operations', type: 'Chequing', currency: 'CAD',
        holder_name: 'Nathalie Cipriani', balance_current: 3120.5, balance_available: 3000,
        transactions: [
          ...biweekly('PAYROLL DEP ACME CORP', 2100, 6),
          { date: '2026-06-10', description: 'NSF FEE', credit: null, debit: 48 },
          { date: '2026-06-12', description: 'RENT E-TRANSFER TO LANDLORD', credit: null, debit: 2200 },
        ],
      },
      {
        title: 'Savings', account_number: '99887766', category: 'Operations', type: 'Savings', currency: 'CAD',
        holder_name: 'Nathalie Cipriani', balance_current: 500, balance_available: 500, transactions: [],
      },
    ], 'Flinks Capital')
    expect(r.accounts[0].masked_number).toBe('···· 7890')
    expect(r.accounts[0].masked_number).not.toContain('123456')
    expect(r.holder_names).toEqual(['Nathalie Cipriani'])
    expect(r.nsf_count).toBe(1)
    expect(r.closing_balance_total).toBe(3620.5)
    expect(r.payroll_monthly_estimate).toBeGreaterThan(4500)
    expect(r.total_debits).toBe(2248)
  })

  it('returns null payroll when nothing recurs', () => {
    const r = summarizeBank([{ transactions: [{ date: '2026-06-01', description: 'GIFT', credit: 200, debit: null }] }], null)
    expect(r.payroll_monthly_estimate).toBeNull()
    expect(r.recurring_deposits).toHaveLength(0)
  })
})

import { describe, it, expect } from 'vitest'
import { pullCredit, creditProvider } from '../lib/verify/providers/equifax'
import { analyzeCreditReport } from '../lib/screening/creditAnalysis'

// 征信直拉的结果必须落在 CreditReport 形状上，这样它直接进现有的确定性信用
// 分析层——这是「用局方数据替换模型转录」的全部意义。mock 供应商走完整链路。

const input = {
  first_name: 'Probe', last_name: 'Applicant', date_of_birth: '1990-04-12',
  address: { line1: '1 Yonge St', city: 'Toronto', province: 'ON', postal_code: 'M5E 1E5' },
}

describe('credit provider gating', () => {
  it('is unavailable unless CREDIT_PULL_PROVIDER names a configured provider', () => {
    const prev = process.env.CREDIT_PULL_PROVIDER
    delete process.env.CREDIT_PULL_PROVIDER
    expect(creditProvider()).toBeNull()
    process.env.CREDIT_PULL_PROVIDER = 'equifax' // without client id/secret → still null
    delete process.env.EQUIFAX_CLIENT_ID
    expect(creditProvider()).toBeNull()
    process.env.CREDIT_PULL_PROVIDER = 'mock'
    expect(creditProvider()).toBe('mock')
    if (prev === undefined) delete process.env.CREDIT_PULL_PROVIDER; else process.env.CREDIT_PULL_PROVIDER = prev
  })
})

describe('mock pull → CreditReport → analysis layer', () => {
  it('produces a report the deterministic analysis can consume', async () => {
    process.env.CREDIT_PULL_PROVIDER = 'mock'
    const r = await pullCredit(input)
    expect(r.provider).toBe('mock')
    expect(r.report?.tradelines?.length).toBeGreaterThan(2)
    expect(r.reference).toMatch(/^mock-/)
    const a = analyzeCreditReport(r.report!, { monthlyIncome: 5200 })
    // TD VISA 4820/5000 → revolving utilisation ≈ 96% (the line of credit is
    // typed Open and is deliberately not pooled into the revolving ratio)
    expect(a).not.toBeNull()
    expect(a!.revolvingUtilization).not.toBeNull()
    expect(a!.revolvingUtilization!).toBeGreaterThan(0.9)
    // one paid collection is still a collection
    expect((r.report!.collections || []).length).toBe(1)
    delete process.env.CREDIT_PULL_PROVIDER
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  RENT_GUIDELINE, guidelineFor, n1DeadlineFor, n4EarliestTermination, persistentLatePayment,
  checkLeaseTerms, ONTARIO_RULES, ruleById, GUIDELINE_TEXT,
} from '../lib/ontario/rules'
import { buildRenewalProposal } from '../lib/agent/renewalStages'
import { AGENT_LEASING_FACTS, BILL60_FACTS } from '../lib/agent/prompts'

// Ontario rules that took effect in 2026 (ontario.ca rent increase page;
// LTB operational updates 2026-06-30 and 2026-09-21; Toronto By-law 53-2025).
describe('rent increase guideline is per effective year (RTA s.120)', () => {
  it('2026 is 2.1% and 2027 is 1.9% — not the old 2.5%', () => {
    expect(RENT_GUIDELINE[2026]).toBe(2.1)
    expect(RENT_GUIDELINE[2027]).toBe(1.9)
    expect(guidelineFor('2026-11-01')).toEqual({ year: 2026, pct: 2.1, published: true })
    expect(guidelineFor('2027-01-01')).toEqual({ year: 2027, pct: 1.9, published: true })
  })
  it('unknown future years fall back to the latest published figure and say so', () => {
    const g = guidelineFor('2031-05-01')
    expect(g.published).toBe(false)
    expect(g.pct).toBe(RENT_GUIDELINE[Math.max(...Object.keys(RENT_GUIDELINE).map(Number))])
  })
  it('N1 for a Jan 1 2027 increase must be served by 2026-10-03', () => {
    expect(n1DeadlineFor('2027-01-01')).toBe('2026-10-03')
  })
  it('renewal proposal uses the guideline of the year the term ends', () => {
    const p = buildRenewalProposal('u', { id: 'l', tenant_name: 'T', tenant_email: 't@x.ca', unit_label: 'U', monthly_rent: 2000, end_date: '2026-12-19' }, new Date('2026-09-23T00:00:00Z'), null)
    expect(p.metadata.guideline_pct).toBe(2.1)
    expect(p.metadata.guideline_rent).toBe(2042)
    expect(p.summary).toContain('2026 年指导上限 +2.1%')
    const q = buildRenewalProposal('u', { id: 'l', tenant_name: 'T', tenant_email: 't@x.ca', unit_label: 'U', monthly_rent: 2000, end_date: '2027-03-01' }, new Date('2026-12-01T00:00:00Z'), null)
    expect(q.metadata.guideline_pct).toBe(1.9)
    expect(q.metadata.guideline_rent).toBe(2038)
  })
  it('no source still states a 2026 cap of 2.5%', () => {
    for (const f of ['app/landlord/leases/page.tsx', 'app/tenant/lease/page.tsx', 'app/tenant/payments/page.tsx', 'app/landlord/finance/page.tsx', 'lib/agent/prompts.ts', 'lib/agent/renewalStages.ts', 'app/api/agent/execute/route.ts', 'lib/ontario/rules.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/2026[^\n]{0,20}2\.5\s*%/)
      expect(src, f).not.toMatch(/1\.025/)
    }
    expect(GUIDELINE_TEXT.zh).toContain('2026 年 2.1%')
    expect(GUIDELINE_TEXT.zh).toContain('2027 年 1.9%')
  })
})

describe('Bill 60 / Bill 97 rules in force in 2026', () => {
  it('N4 termination date is 7 days after service, 12 by mail', () => {
    expect(n4EarliestTermination('2026-10-02')).toBe('2026-10-09')
    expect(n4EarliestTermination('2026-10-02', 'mail')).toBe('2026-10-14')
  })
  it('persistent late payment: >7 days late, three times within six months', () => {
    const rows = [
      { due_date: '2026-01-01', paid_at: '2026-01-12T00:00:00Z' }, // late
      { due_date: '2026-02-01', paid_at: '2026-02-03T00:00:00Z' }, // on time (within 7 days)
      { due_date: '2026-03-01', paid_at: '2026-03-20T00:00:00Z' }, // late
      { due_date: '2026-04-01', paid_at: '2026-04-08T00:00:00Z' }, // exactly 7 days → not late
      { due_date: '2026-05-01', paid_at: '2026-05-09T00:00:00Z' }, // late → 3 in 6 months
    ]
    const r = persistentLatePayment(rows, '2026-06-01')
    expect(r.late).toEqual(['2026-01-01', '2026-03-01', '2026-05-01'])
    expect(r.persistent).toBe(true)
    expect(r.window).toEqual(['2026-01-01', '2026-05-01'])
    const spread = persistentLatePayment([
      { due_date: '2026-01-01', paid_at: '2026-01-12T00:00:00Z' },
      { due_date: '2026-05-01', paid_at: '2026-05-12T00:00:00Z' },
      { due_date: '2026-08-01', paid_at: '2026-08-12T00:00:00Z' },
    ], '2026-09-01')
    expect(spread.late.length).toBe(3)
    expect(spread.persistent).toBe(false)
    const unpaid = persistentLatePayment([{ due_date: '2026-09-01', paid_at: null, status: 'due' }], '2026-09-05')
    expect(unpaid.late).toEqual([])
  })
  it('a lease clause banning air conditioners is blocked (RTA s.36.1)', () => {
    expect(checkLeaseTerms({ rent_amount: 2000, schedule_b: 'No air conditioners may be installed.' }).findings.map((f) => f.rule)).toContain('RTA-36-1-tenant-ac')
    expect(checkLeaseTerms({ rent_amount: 2000, schedule_b: '租客不得安装空调' }).passed).toBe(false)
    expect(checkLeaseTerms({ rent_amount: 2000, schedule_b: 'Air conditioner electricity is included.' }).findings).toEqual([])
  })
  it('the rule catalogue carries every 2026 change with the in-force date', () => {
    const expected: Record<string, string> = {
      'RTA-59-n4-7-days': '2026-09-21', 'RTA-58-persistent-late': '2026-09-21', 'RTA-82-half-arrears': '2026-09-21',
      'RTA-48-1-n12-120-days': '2026-09-21', 'RTA-53-n13-first-refusal': '2026-09-21', 'LTB-forms-2026-09': '2026-09-21',
      'RTA-209-review-15-days': '2026-07-01', 'RTA-206-payment-agreement-form': '2026-07-01', 'RTA-36-1-tenant-ac': '2026-07-01',
      'RTA-238-fines-doubled': '2026-07-01', 'TOR-53-2025-renovation-licence': '2025-07-31',
    }
    for (const [id, since] of Object.entries(expected)) expect(ruleById(id)?.since, id).toBe(since)
    expect(ONTARIO_RULES.filter((r) => r.area === 'tenancy').length).toBeGreaterThanOrEqual(11)
    // Month-to-month continuation was NOT repealed — the rule must stay and say so.
    expect(ruleById('RTA-38-month-to-month')?.summary.zh).toContain('仍然有效')
  })
  it('assistant fact packs carry the new rules and the per-year guideline', () => {
    expect(BILL60_FACTS).toMatch(/N4[^\n]*7 天/)
    expect(BILL60_FACTS).toContain('120 天')
    expect(BILL60_FACTS).toContain('Rental Renovation Licence')
    expect(AGENT_LEASING_FACTS).toContain('2026 年 2.1%')
    expect(AGENT_LEASING_FACTS).not.toMatch(/2026[^\n]{0,20}2\.5%/)
  })
})

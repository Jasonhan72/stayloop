// P2 of the lifecycle proposals (2026-09-23): 今日 view, bulk proposals,
// repayment plan draft, move-in checklist, applicant side-by-side, agent
// client table. Pure-function guards plus source checks.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildToday, MAX_ITEMS } from '@/lib/lifecycle/today'
import { landlordLifecycle, agentLifecycle } from '@/lib/lifecycle/stages'
import { buildPaymentPlan, paymentPlanText } from '@/lib/ontario/paymentPlan'
import { MOVE_IN_ITEMS, moveInProgress, moveInWindowOpen } from '@/lib/household/moveIn'
import { compareCells } from '@/components/landlord/ApplicantCompare'
import { bulkGroups } from '@/components/agent/BulkApproveBar'
import { daysQuiet, paperworkComplete } from '@/lib/agent/clientBook'

const TODAY = new Date('2026-09-23T12:00:00Z')
const base = { listings: [], showingsPending: 0, applications: [], screenings: [], rent: [], tickets: [], renewalCards: [] }

describe('今日 view', () => {
  it('approvals first, then close clocks, then current steps; capped and deduped', () => {
    const lc = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'signed_both', start_date: '2025-11-01', end_date: '2026-10-05', unit_label: 'Unit 7' }], households: [{ id: 'H1', current_lease_id: 'L1', verified: true, status: 'active', end_date: '2026-10-05' }], rent: [{ lease_id: 'L1', due_date: '2026-09-25', status: 'due', amount: 2000 }] }, TODAY)
    const items = buildToday(lc, [{ id: 'a', action_type: 'send_renewal_letter', title: '续约函 · Unit 7' }, { id: 'b', action_type: 'renewal_checkpoint', title: 'x' }], '/landlord/todo')
    expect(items[0].kind).toBe('approval')
    expect(items[0].text.zh).toContain('2 件事等你点头')
    expect(items[0].href).toBe('/landlord/todo')
    expect(items.some((i) => i.kind === 'clock' && i.text.zh.includes('下期租金'))).toBe(true)
    expect(items.some((i) => i.kind === 'clock' && i.text.zh.includes('最近到期'))).toBe(true)
    expect(items.length).toBeLessThanOrEqual(MAX_ITEMS)
    expect(new Set(items.map((i) => i.text.zh)).size).toBe(items.length)
  })
  it('a far-away clock (>14 days, ok tone) is not "today"', () => {
    const lc = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'signed_both', start_date: '2026-01-01', end_date: '2027-01-01', unit_label: 'U' }], households: [] }, TODAY)
    const items = buildToday(lc, [], '/landlord/todo')
    expect(items.some((i) => i.kind === 'clock')).toBe(false)
  })
  it('no lifecycle + no cards → empty', () => {
    expect(buildToday(null, [], '/tenant/todo')).toEqual([])
  })
})

describe('bulk proposals', () => {
  it('only renewal letters and acknowledge-only kinds are grouped; emails never', () => {
    const mk = (id: string, action_type: string) => ({ id, action_type, status: 'pending', user_id: 'u', role: 'landlord', title: id, summary: '', data_scope: [], excluded_data: [], risk_level: 'low', requires_approval: true } as never)
    const g = bulkGroups([mk('1', 'send_renewal_letter'), mk('2', 'send_renewal_letter'), mk('3', 'renewal_checkpoint'), mk('4', 'relist_prompt'), mk('5', 'send_message'), mk('6', 'send_decision')])
    expect(g.renewal.map((a) => a.id)).toEqual(['1', '2'])
    expect(g.acknowledge.map((a) => a.id)).toEqual(['3', '4'])
  })
})

describe('repayment plan (RTA s.206 / s.134)', () => {
  const input = { arrears: 4000, monthlyRent: 2000, installments: 3, firstDue: '2026-10-01', unit: 'Unit 7', tenantName: 'Mia', missed: ['2026-08-01', '2026-09-01'] }
  it('splits arrears evenly, adds the month rent, last instalment absorbs rounding', () => {
    const p = buildPaymentPlan(input)
    expect(p.ok).toBe(true)
    expect(p.schedule.map((s) => s.due)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
    expect(p.schedule.reduce((s, r) => s + r.arrearsPart, 0)).toBeCloseTo(4000, 2)
    expect(p.schedule[0].amount).toBeCloseTo(2000 + 1333.33, 2)
    expect(p.schedule[2].arrearsPart).toBeCloseTo(1333.34, 2)
  })
  it('refuses no arrears / out-of-range instalments / bad date', () => {
    expect(buildPaymentPlan({ ...input, arrears: 0 }).reason).toBe('no_arrears')
    expect(buildPaymentPlan({ ...input, installments: 7 }).reason).toBe('installments_out_of_range')
    expect(buildPaymentPlan({ ...input, firstDue: 'nope' }).reason).toBe('bad_date')
  })
  it('the text names the LTB form, no interest, and says it is not an N4', () => {
    const { subject, body } = paymentPlanText(input, buildPaymentPlan(input))
    expect(subject).toContain('Unit 7')
    expect(body).toContain('Payment Agreement Form')
    expect(body).toContain('s.134')
    expect(body).toMatch(/不是终止通知|not a notice of termination/)
    expect(body).not.toMatch(/利息 \d|interest of|late fee \$/)
  })
})

describe('move-in checklist', () => {
  it('has the Ontario paperwork items and counts progress by known keys only', () => {
    const keys = MOVE_IN_ITEMS.map((i) => i.key)
    expect(keys).toEqual(expect.arrayContaining(['lease_copy', 'deposit_receipt', 'insurance', 'photos_wear']))
    expect(MOVE_IN_ITEMS.find((i) => i.key === 'deposit_receipt')?.note?.zh).toContain('s.106')
    expect(MOVE_IN_ITEMS.find((i) => i.key === 'lease_copy')?.note?.zh).toContain('21 天')
    expect(moveInProgress([{ item_key: 'lease_copy', done: true }, { item_key: 'bogus', done: true }, { item_key: 'fobs', done: false }])).toEqual({ done: 1, total: MOVE_IN_ITEMS.length })
  })
  it('window opens 30 days before start and closes when complete', () => {
    const none = { done: 0, total: MOVE_IN_ITEMS.length }
    expect(moveInWindowOpen('2026-10-10', none, TODAY)).toBe(true)
    expect(moveInWindowOpen('2026-12-01', none, TODAY)).toBe(false)
    expect(moveInWindowOpen('2026-10-10', { done: MOVE_IN_ITEMS.length, total: MOVE_IN_ITEMS.length }, TODAY)).toBe(false)
  })
})

describe('applicant side by side — facts only', () => {
  it('cells carry stated facts, stamps, screening state and decision; no ratio, no rank', () => {
    const cells = compareCells({ id: 'a', name: 'Mia', unitLabel: 'Unit 7 · 100 Test Ave', created_at: '2026-09-20T00:00:00Z', move_in_date: '2026-11-01', monthly_income: 5200, employer_name: 'Acme', files: 5, verified_tier: 3, ai_score: 43, ltb_records_found: 0, status: 'approved' }, true)
    expect(cells).toEqual(['Unit 7 · 100 Test Ave', '2026-09-20', '2026-11-01', '$5,200', 'Acme', '5', '身份 · 银行', '已评分 43（参考）', '0', '已录取'])
    const src = readFileSync('components/landlord/ApplicantCompare.tsx', 'utf8')
    expect(src).not.toMatch(/monthly_rent\s*\*|\/ *rent|≥ *3|sort\(/)
  })
})

describe('agent client table', () => {
  it('TRESA paperwork needs both dates; quiet days from last contact', () => {
    expect(paperworkComplete({ representation_agreement_at: '2026-09-01', info_guide_given_at: null })).toBe(false)
    expect(paperworkComplete({ representation_agreement_at: '2026-09-01', info_guide_given_at: '2026-09-01' })).toBe(true)
    expect(daysQuiet({ last_contact_at: '2026-09-18T00:00:00Z', updated_at: '2026-09-23T00:00:00Z' }, TODAY)).toBe(5)
    expect(daysQuiet({ last_contact_at: null, updated_at: '2026-09-23T00:00:00Z' }, TODAY)).toBe(0)
  })
  it('the agent rail counts clients and flags missing paperwork', () => {
    const lc = agentLifecycle({ profileStatus: 'verified', pendingCards: 0, clients: [{ stage: 'searching', representation_agreement_at: '2026-09-01', info_guide_given_at: null }, { stage: 'closed', representation_agreement_at: null, info_guide_given_at: null }] })
    const step = lc.phases[0].steps.find((s) => s.key === 'client')!
    expect(step.state).toBe('current')
    expect(step.detail?.zh).toContain('1 位客户')
    expect(step.detail?.zh).toContain('1 位缺')
    expect(lc.phases[2].steps[0].state).toBe('done')
  })
  it('the clients page no longer prints a fabricated RECO number or rating', () => {
    const src = readFileSync('app/agent/clients/page.tsx', 'utf8')
    expect(src).not.toMatch(/#7892341|4\.9★/)
    expect(src).toContain('<ClientBook')
  })
})

describe('code review 2026-09-23 (lifecycle)', () => {
  it('instalment dates clamp to month ends', () => {
    const p = buildPaymentPlan({ arrears: 300, monthlyRent: 1000, installments: 3, firstDue: '2027-01-31', unit: 'U', tenantName: 'T', missed: ['2026-12-01'] })
    expect(p.schedule.map((s) => s.due)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })
  it('the tenancy clock counts calendar months', async () => {
    const { tenancyClock } = await import('@/lib/household/clock')
    expect(tenancyClock('2026-01-01', null, new Date('2026-03-01T12:00:00Z')).month).toBe(3)
    expect(tenancyClock('2026-01-01', null, new Date('2026-01-31T12:00:00Z')).month).toBe(1)
  })
  it('今日 lists only near clocks and counted steps', () => {
    const lc = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'signed_both', start_date: '2025-11-01', end_date: '2026-11-15', unit_label: 'Unit 7' }], households: [{ id: 'H1', current_lease_id: 'L1', verified: true, status: 'active', end_date: '2026-11-15' }] }, TODAY)
    const items = buildToday(lc, [], '/landlord/todo')
    expect(items.some((i) => i.kind === 'clock')).toBe(false) // 53 days out is not "today"
    expect(items.some((i) => i.text.zh.includes('租客意向：租客在 30 天'))).toBe(false)
  })
  it('a term that ended but continues month-to-month with a verified household is not a move-out; a superseded lease is not either', () => {
    const cont = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'signed_both', start_date: '2025-09-01', end_date: '2026-09-10', unit_label: 'U1' }], households: [{ id: 'H1', current_lease_id: 'L1', verified: true, status: 'active', end_date: '2026-09-10' }] }, TODAY)
    expect(cont.phases[2].steps.find((s) => s.key === 'turnover')?.state).toBe('todo')
    const sup = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'signed_both', start_date: '2025-09-01', end_date: '2026-09-10', unit_label: 'U1' }, { id: 'L2', status: 'signed_both', start_date: '2026-09-15', end_date: '2027-09-14', unit_label: 'U1' }], households: [] }, TODAY)
    expect(sup.phases[2].steps.find((s) => s.key === 'turnover')?.state).toBe('todo')
    const old = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'ended', start_date: '2023-01-01', end_date: '2024-01-01', unit_label: 'U1' }], households: [] }, TODAY)
    expect(old.current).not.toBe('post')
  })
  it('a pending renewal letter is not "sent"', () => {
    const lc = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'signed_both', start_date: '2025-11-01', end_date: '2026-11-15', unit_label: 'U' }], households: [], renewalCards: [{ action_type: 'send_renewal_letter', status: 'pending', lease_id: 'L1', stage: '90d' }] }, TODAY)
    const step = lc.phases[2].steps.find((s) => s.key === 'letter')!
    expect(step.state).toBe('current')
    expect(lc.phases[2].next?.label.zh).toBe('批准续约函')
  })
})

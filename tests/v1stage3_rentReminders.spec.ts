// V1.0 阶段 3 甲 #4 · G11 (2026-10-16): rent due / overdue touchpoints.
// The planner (lib/household/rentReminders) is pure and reads the same ledger
// the hub does: a tenant push a few days before a period falls due, one
// acknowledge-only `rent_overdue` card per lease + due once a period is past
// the s.58 grace, s.58 counts and N4 date arithmetic for Ontario only.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  RENT_DUE_PUSH_DAYS_BEFORE, RENT_OVERDUE_CARD_DAY, lateCountWithin, planRentReminders, rentDueKey, tenantDuePush,
  type ReminderHousehold, type ReminderLease, type ReminderMember, type ReminderRent, type RentReminderInput,
} from '../lib/household/rentReminders'
import { EXECUTABLE_ACTION_TYPES } from '../lib/agent/approval-engine'
import { isAcknowledgeOnly } from '../lib/agent/chatCopy'
import { PERSISTENT_LATE_GRACE_DAYS, n4EarliestTermination } from '../lib/ontario/rules'

const read = (p: string) => readFileSync(p, 'utf8')

const HH = '11111111-1111-4111-8111-111111111111'
const LEASE = '22222222-2222-4222-8222-222222222222'
const LL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const T1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const household = (over: Partial<ReminderHousehold> = {}): ReminderHousehold => ({
  id: HH, current_lease_id: LEASE, monthly_rent: 2800, rent_due_day: 1, start_date: '2026-01-01', verified: true, status: 'active', address: '1207 King St W', unit: '1207', city: 'Toronto', ...over,
})
const lease = (over: Partial<ReminderLease> = {}): ReminderLease => ({ id: LEASE, tenant_name: 'Mia Chen', unit_label: 'Unit 1207', monthly_rent: 2800, start_date: '2026-01-01', end_date: '2026-12-31', status: 'active', ...over })
const members: ReminderMember[] = [
  { household_id: HH, user_id: LL, role: 'landlord', status: 'active' },
  { household_id: HH, user_id: T1, role: 'tenant', status: 'active' },
  { household_id: HH, user_id: T2, role: 'tenant', status: 'active' },
]
const paid = (due: string, paidOn: string, amount = 2800): ReminderRent => ({ lease_id: LEASE, due_date: due, status: 'paid', paid_at: `${paidOn}T16:00:00Z`, amount })
/** Jan..<month> of 2026 recorded on the due day. */
const onTimeThrough = (month: number): ReminderRent[] => Array.from({ length: month }, (_, i) => { const mm = String(i + 1).padStart(2, '0'); return paid(`2026-${mm}-01`, `2026-${mm}-01`) })
// Toronto noon — the Toronto calendar day equals the UTC day.
const at = (iso: string) => new Date(`${iso}T16:00:00Z`)

// Default history: January through September paid on time; what a test adds or replaces is explicit.
function plan(over: Partial<RentReminderInput> & { today: Date }) {
  return planRentReminders({ households: [household()], leases: [lease()], rentRows: onTimeThrough(9), members, ...over })
}

describe('tenant push · 3 days before a period falls due', () => {
  it('pushes every tenant member when the next period is 3 days out and nothing is recorded', () => {
    const p = plan({ today: at('2026-09-28') })
    expect(p.tenantDue.map((t) => t.userId).sort()).toEqual([T1, T2].sort())
    const t = p.tenantDue[0]
    expect(t).toMatchObject({ householdId: HH, leaseId: LEASE, due: '2026-10-01', amount: 2800, daysUntil: RENT_DUE_PUSH_DAYS_BEFORE, key: rentDueKey(LEASE, '2026-10-01') })
    expect(p.landlordOverdue).toEqual([])
    const msg = tenantDuePush(t)
    expect(msg.url).toBe(`/h/${HH}?tab=rent`)
    expect(msg.title).toContain('3 天后到期')
    expect(msg.title).toContain('Rent due in 3 days')
  })
  it('is silent 5 days out, and silent once the key was already pushed', () => {
    expect(plan({ today: at('2026-09-26') }).tenantDue).toEqual([])
    expect(plan({ today: at('2026-09-29'), pushedKeys: [rentDueKey(LEASE, '2026-10-01')] }).tenantDue).toEqual([])
  })
  it('does not push a period someone already recorded (a placeholder row is not a record)', () => {
    expect(plan({ today: at('2026-09-28'), rentRows: [...onTimeThrough(9), paid('2026-10-01', '2026-09-27')] }).tenantDue).toEqual([])
    const placeholder: ReminderRent = { lease_id: LEASE, due_date: '2026-10-01', status: 'due', paid_at: null, amount: 2800 }
    expect(plan({ today: at('2026-09-28'), rentRows: [...onTimeThrough(9), placeholder] }).tenantDue).toHaveLength(2)
  })
})

describe('landlord card · the 8th day past due', () => {
  it('no card on day 7 (still within the s.58 grace), one card per landlord member on day 8', () => {
    expect(RENT_OVERDUE_CARD_DAY).toBe(PERSISTENT_LATE_GRACE_DAYS + 1)
    expect(plan({ today: at('2026-10-08') }).landlordOverdue).toEqual([])
    const p = plan({ today: at('2026-10-09') })
    expect(p.landlordOverdue).toHaveLength(1)
    const c = p.landlordOverdue[0]
    expect(c).toMatchObject({ user_id: LL, role: 'landlord', action_type: 'rent_overdue', risk_level: 'low', status: 'pending', requires_approval: true, recipient_label: null, data_scope: ['到期日', '金额'], excluded_data: [] })
    expect(c.metadata).toMatchObject({ lease_id: LEASE, household_id: HH, due_date: '2026-10-01', amount: 2800, days_late: 8, province: 'ON', stage: 'overdue', late_count_6m: 0, persistent: false })
    expect(c.metadata.n4_earliest_hand).toBe(n4EarliestTermination('2026-10-09', 'hand'))
    expect(c.metadata.n4_earliest_mail).toBe(n4EarliestTermination('2026-10-09', 'mail'))
    expect(c.title).toContain('租金逾期 8 天 · Unit 1207 · 2026-10-01')
    expect(c.title).toContain('Rent 8 days overdue')
    expect(c.summary).toContain('s.58')
    expect(c.summary).toContain('N4')
    expect(c.summary).toContain('由你决定')
    expect(c.summary).toContain('批准 = 知悉')
  })
  it('not when the period was recorded, and only once per lease + due (any existing status)', () => {
    expect(plan({ today: at('2026-10-09'), rentRows: [...onTimeThrough(9), paid('2026-10-01', '2026-10-03')] }).landlordOverdue).toEqual([])
    for (const status of ['pending', 'approved', 'rejected', 'expired']) {
      const p = plan({ today: at('2026-10-12'), existingCards: [{ id: 'card-1', status, metadata: { lease_id: LEASE, due_date: '2026-10-01' } }] })
      expect(p.landlordOverdue).toEqual([])
    }
  })
  it('cards only the latest overdue period, with the open count and arrears on it', () => {
    const p = plan({ today: at('2026-10-20'), rentRows: [] })
    expect(p.landlordOverdue).toHaveLength(1)
    expect(p.landlordOverdue[0].metadata).toMatchObject({ due_date: '2026-10-01', missed_count: 10, arrears_total: 28000 })
    expect(p.landlordOverdue[0].summary).toContain('共 10 期未记录')
  })
  it('expires a pending card whose period was recorded since', () => {
    const p = plan({ today: at('2026-10-20'), rentRows: [...onTimeThrough(9), paid('2026-10-01', '2026-10-15')], existingCards: [
      { id: 'card-paid', status: 'pending', metadata: { lease_id: LEASE, due_date: '2026-10-01' } },
      { id: 'card-done', status: 'expired', metadata: { lease_id: LEASE, due_date: '2026-10-01' } },
    ] })
    expect(p.expire).toEqual([{ id: 'card-paid', reason: 'period_paid' }])
  })
  it('skips unverified / inactive tenancies, ended leases and tenancies with no due day', () => {
    expect(plan({ today: at('2026-10-09'), households: [household({ verified: false })] }).skipped.not_active).toBe(1)
    expect(plan({ today: at('2026-10-09'), households: [household({ status: 'ended' })] }).skipped.not_active).toBe(1)
    expect(plan({ today: at('2026-10-09'), leases: [lease({ status: 'ended' })] }).skipped.lease_ended).toBe(1)
    expect(plan({ today: at('2026-10-09'), households: [household({ rent_due_day: null })] }).skipped.no_schedule).toBe(1)
    expect(plan({ today: at('2026-10-09'), households: [household({ current_lease_id: null })] }).skipped.no_lease).toBe(1)
  })
})

describe('s.58 count and the province line', () => {
  // Jan–Apr on time; May / Jun / Aug received 11 / 14 / 9 days late; Jul / Sep on time (2 and 1 days are within the grace).
  const lateRows = [...onTimeThrough(4), paid('2026-05-01', '2026-05-12'), paid('2026-06-01', '2026-06-15'), paid('2026-07-01', '2026-07-01'), paid('2026-08-01', '2026-08-10'), paid('2026-09-01', '2026-09-02')]
  it('counts late (>7 days) recorded payments in the last 6 months and flags persistent at 3', () => {
    const p = plan({ today: at('2026-10-09'), rentRows: lateRows })
    expect(p.landlordOverdue[0].metadata).toMatchObject({ late_count_6m: 3, persistent: true, missed_count: 1 })
    expect(p.landlordOverdue[0].summary).toContain('已有 3 次迟付')
    expect(p.landlordOverdue[0].summary).toContain('已构成持续迟付')
    expect(lateCountWithin(['2026-01-01', '2026-06-01', '2026-08-01'], '2026-10-09')).toBe(2)
  })
  it('two late payments are not persistent, and the open period itself is not counted', () => {
    const rows = lateRows.map((r) => (r.due_date === '2026-05-01' ? paid('2026-05-01', '2026-05-02') : r))
    const p = plan({ today: at('2026-10-09'), rentRows: rows })
    expect(p.landlordOverdue[0].metadata).toMatchObject({ late_count_6m: 2, persistent: false })
  })
  it('a lease outside Ontario carries no N4 dates, no s.58 count and no Ontario wording', () => {
    const p = plan({ today: at('2026-10-09'), leases: [lease({ province: 'QC', unit_label: 'App 4, 1569 rue St-Hubert' })], rentRows: lateRows })
    const c = p.landlordOverdue[0]
    expect(c.metadata.province).toBe('QC')
    expect(c.metadata).not.toHaveProperty('n4_earliest_hand')
    expect(c.metadata).not.toHaveProperty('n4_earliest_mail')
    expect(c.metadata).not.toHaveProperty('persistent')
    expect(c.metadata).not.toHaveProperty('late_count_6m')
    expect(c.summary).not.toMatch(/N4|s\.58|RTA|安省：/)
    expect(c.summary).toContain('不在安省')
  })
})

describe('wiring', () => {
  it('rent_overdue is an executable, acknowledge-only card', () => {
    expect(EXECUTABLE_ACTION_TYPES).toContain('rent_overdue')
    expect(isAcknowledgeOnly('rent_overdue')).toBe(true)
  })
  it('the executor re-checks the period, stamps executed_rent_overdue, and is not in the mail limiter', () => {
    const src = read('app/api/agent/execute/route.ts')
    expect(src).toContain("case 'rent_overdue':")
    expect(src).toContain("'executed_rent_overdue'")
    const exec = src.slice(src.indexOf('async function executeRentOverdue'), src.indexOf('// Executor: showing_request'))
    expect(exec).toContain("reason: 'period_paid'")
    expect(exec).toContain("kind: 'acknowledged'")
    expect(exec).not.toContain('sendEmail(')
    const limiter = src.match(/\[([^\]]*)\]\.includes\(action\.action_type\)\) \{\n\s+if \(!\(await underHourlyLimit/)
    expect(limiter?.[1]).not.toContain('rent_overdue')
  })
  it('the cron route runs the sweep and reports it', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).toContain('planRentReminders(')
    expect(src).toContain("'rent_due_pushed'".replace("'rent_due_pushed'", 'RENT_DUE_PUSH_ACTION'))
    expect(src).toMatch(/followups, rent \}/)
    expect(src).toContain(".eq('verified', true)")
    expect(src).toContain("reason: 'period_paid'")
    expect(src).toContain("kind: 'event'")
  })
  it('the card shows the facts and links to the ledger and the notice toolbox (lease preselected, no form)', () => {
    const src = read('components/agent/ApprovalActionCard.tsx')
    expect(src).toContain("action.action_type === 'rent_overdue'")
    expect(src).toContain('/landlord/notices?lease=')
    expect(src).not.toMatch(/\/landlord\/notices\?lease=\$\{[^}]+\}&form=/)
    expect(src).toContain('?tab=rent')
    expect(src).toContain('card-s58')
  })
})

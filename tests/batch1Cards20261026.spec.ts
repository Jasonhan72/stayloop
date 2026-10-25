// 报告对照方案 · 第一批 ④⑤ (2026-10-26): the landlord's monthly one-page brief
// (a `monthly_brief` routine), the day-after rent nudge (a push, no card — the
// s.58 card still waits for the grace period) and the vacancy-cost calculator
// on the renewal-letter card (the landlord's own numbers, no recommendation).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DAYS_PER_MONTH, vacancyCost } from '@/lib/landlord/vacancyMath'
import { ROUTINE_KINDS, routineDef } from '@/lib/agent/routines'
import {
  RENT_LATE_PUSH_ACTION, RENT_LATE_PUSH_FROM_DAY, RENT_OVERDUE_CARD_DAY, landlordLatePush, planRentReminders, rentLateKey,
  type ReminderHousehold, type ReminderLease, type ReminderMember, type ReminderRent,
} from '@/lib/household/rentReminders'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('vacancy cost arithmetic', () => {
  it('one day = rent ÷ 30.42; turnover = vacancy + costs; concession over 12 months by default', () => {
    expect(DAYS_PER_MONTH).toBeCloseTo(30.4167, 3)
    const o = vacancyCost({ monthlyRent: 3042, vacantDays: 30, turnoverCost: 500, concessionPerMonth: 100 })
    expect(o.perDay).toBeCloseTo(100.01, 1)
    expect(o.vacancy).toBeCloseTo(3000.3, 0)
    expect(o.turnoverTotal).toBeCloseTo(3500.3, 0)
    expect(o.concessionTotal).toBe(1200)
    expect(o.difference).toBeCloseTo(2300.3, 0)
    expect(o.breakEvenDays).toBeCloseTo(7, 0)
  })
  it('bad or empty inputs count as zero; zero rent has no break-even', () => {
    const o = vacancyCost({ monthlyRent: 0, vacantDays: -5, turnoverCost: NaN, concessionPerMonth: 50 })
    expect(o.perDay).toBe(0)
    expect(o.turnoverTotal).toBe(0)
    expect(o.concessionTotal).toBe(600)
    expect(o.breakEvenDays).toBeNull()
  })
  it('the card sits on the renewal-letter approval card only and never recommends', () => {
    const card = code('components/agent/ApprovalActionCard.tsx')
    expect(card).toContain('{isRenewal && <VacancyCostCard zh={zh} monthlyRent={m.current_rent} />}')
    const c = code('components/landlord/VacancyCostCard.tsx')
    expect(c).toContain('data-testid="vacancy-cost-card"')
    expect(c).toContain('这里不做建议')
    expect(c).not.toMatch(/建议续约|建议换租|should renew|recommend you/i)
    expect(c).not.toMatch(/llmChat|fetch\(/)
  })
})

describe('monthly brief routine', () => {
  it('is a landlord kind that reports to the person on the 1st, and the database allow-list has it', () => {
    const d = routineDef('landlord', 'monthly_brief')!
    expect(d).toBeTruthy()
    expect(d.reach).toBe('self')
    expect(d.defaultSchedule).toEqual({ every: 'monthly', day: 1, hour: 9 })
    expect(ROUTINE_KINDS.tenant.some((k) => k.kind === 'monthly_brief')).toBe(false)
    const sql = read('supabase/migrations/20261026_agent_routines_monthly_brief.sql')
    expect(sql).toContain("'monthly_brief'")
    expect(sql).toContain("(role = 'landlord' and kind in ('rent_reminder_cards','renewal_window_check','applications_digest','overdue_rent_check','monthly_brief'))")
  })
  it('the runner reads leases, rent rows, work orders and listings for last month and never invents a number', () => {
    const r = code('app/api/cron/agent-routines/route.ts')
    expect(r).toContain("if (r.kind === 'monthly_brief') {")
    for (const t of ["from('rent_payments')", "from('work_orders')", "from('listings')", "from('applications')"]) expect(r).toContain(t)
    expect(r).toContain('没有记录的，这里不猜。')
    expect(r).toContain('建议：上月没有需要动的地方。')
    expect(r).not.toMatch(/llmChat/)
  })
})

describe('day-after rent nudge', () => {
  const T = '2026-10-02'
  const H = 'hh-1', L = 'lease-1', LL = 'landlord-user', TT = 'tenant-user'
  const households: ReminderHousehold[] = [{ id: H, current_lease_id: L, monthly_rent: 2500, rent_due_day: 1, start_date: '2026-01-01', verified: true, status: 'active', address: '1 Main St', unit: '2' }]
  const leases: ReminderLease[] = [{ id: L, monthly_rent: 2500, start_date: '2026-01-01', status: 'active', unit_label: '1 Main St #2' }]
  const members: ReminderMember[] = [{ household_id: H, user_id: LL, role: 'landlord' }, { household_id: H, user_id: TT, role: 'tenant' }]
  const paidThrough = (m: number): ReminderRent[] => Array.from({ length: m }, (_, i) => ({ lease_id: L, due_date: `2026-${String(i + 1).padStart(2, '0')}-01`, status: 'paid', paid_at: `2026-${String(i + 1).padStart(2, '0')}-01T12:00:00Z`, amount: 2500 }))
  const at = (iso: string) => new Date(`${iso}T15:00:00Z`)
  const plan = (today: string, extra: Partial<Parameters<typeof planRentReminders>[0]> = {}) =>
    planRentReminders({ households, leases, members, rentRows: paidThrough(9), today: at(today), ...extra })

  it('the day after an unrecorded due date: one push to the landlord member, none to the tenant, no card yet', () => {
    const p = plan(T)
    expect(p.landlordLate).toHaveLength(1)
    expect(p.landlordLate[0]).toMatchObject({ userId: LL, leaseId: L, householdId: H, due: '2026-10-01', amount: 2500, daysLate: 1, key: rentLateKey(L, '2026-10-01'), unitLabel: '1 Main St #2' })
    expect(p.landlordOverdue).toEqual([])
    expect(RENT_LATE_PUSH_FROM_DAY).toBe(1)
  })
  it('once per lease + due (the audit key), and not once the period is recorded', () => {
    expect(plan(T, { pushedKeys: [rentLateKey(L, '2026-10-01')] }).landlordLate).toEqual([])
    expect(plan(T, { rentRows: paidThrough(10) }).landlordLate).toEqual([])
    expect(plan('2026-10-01').landlordLate).toEqual([])
  })
  it('after the grace period the s.58 card takes over and the nudge stops', () => {
    const p = plan(`2026-10-${String(RENT_OVERDUE_CARD_DAY + 1).padStart(2, '0')}`)
    expect(p.landlordLate).toEqual([])
    expect(p.landlordOverdue).toHaveLength(1)
  })
  it('the push names the amount and unit and links to the rent tab; the cron writes the audit key', () => {
    const msg = landlordLatePush(plan(T).landlordLate[0])
    expect(msg.title).toContain('昨天')
    expect(msg.title).toContain('$2,500')
    expect(msg.url).toBe(`/h/${H}?tab=rent`)
    const src = code('app/api/agent/proactive/route.ts')
    expect(src).toContain('for (const p of plan.landlordLate)')
    expect(src).toContain('action: RENT_LATE_PUSH_ACTION')
    expect(src).toContain('.in(\'action\', [RENT_DUE_PUSH_ACTION, RENT_LATE_PUSH_ACTION])')
    expect(src).toContain('late_pushed: latePushed')
    expect(RENT_LATE_PUSH_ACTION).toBe('rent_late_pushed')
    expect(read('lib/agent/ideas.ts')).toContain('rent_late_pushed')
  })
})

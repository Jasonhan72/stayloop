// Sweep 2026-10-01 · A6 tenancy UI — the household hub's rent ledger, the move-in
// checklist writes and the repayment-plan card.
//   #30  the e-sign 'due' placeholder showed LATE from day one and could never be marked paid
//   #31  the checklist wrote a full-row snapshot from stale page state
//   #10 / #32  the repayment-plan card froze the arrears, survived "mark paid" and duplicated on re-draft
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  rentLedger, isRecordedPayment, checkPaidOn, earliestPaidOn, latenessRows, ledgerStart, missedArrears, torontoDate,
} from '@/lib/household/ledger'
import { rentSchedule } from '@/lib/household/schedule'
import { persistentLatePayment } from '@/lib/ontario/rules'
import { checklistWrite, normalizeChecklistNote } from '@/lib/household/moveIn'
import {
  buildPaymentPlan, paymentPlanCardMetadata, planCardMatchesMissed, splitPlanCards, PAYMENT_PLAN_STAGE,
} from '@/lib/ontario/paymentPlan'

const read = (p: string) => readFileSync(p, 'utf8')
const row = (due_date: string, status: string, paid_at: string | null = null, amount: number | null = 2800) => ({ due_date, status, paid_at, amount })

describe('#30 rent ledger: a due placeholder is not a record', () => {
  const NOW = new Date('2026-10-12T12:00:00Z')
  const schedule = rentSchedule('2026-10-01', 1, NOW)

  it('the first-month placeholder renders as due with Mark paid, and counts as missed once past due', () => {
    const l = rentLedger(schedule, [row('2026-10-01', 'due')], NOW)
    const first = l.periods.find((p) => p.due === '2026-10-01')!
    expect(first.state).toBe('due')
    expect(first.canMarkPaid).toBe(true)
    expect(l.missed).toEqual(['2026-10-01'])
    expect(l.recordedRows).toEqual([])
    expect(l.recordedSoFar).toBe(0)
  })

  it('a placeholder before its due date can be recorded early (first month at signing); a plain future period cannot', () => {
    const signedEarly = new Date('2026-09-20T12:00:00Z')
    const l = rentLedger(rentSchedule('2026-10-01', 1, signedEarly), [row('2026-10-01', 'due')], signedEarly)
    const first = l.periods.find((p) => p.due === '2026-10-01')!
    expect(first.upcoming).toBe(true)
    expect(first.state).toBe('due')
    expect(first.canMarkPaid).toBe(true)
    expect(l.missed).toEqual([])
    const none = rentLedger(rentSchedule('2026-10-01', 1, signedEarly), [], signedEarly)
    expect(none.periods[0].state).toBe('upcoming')
    expect(none.periods[0].canMarkPaid).toBe(false)
  })

  it('recorded rows are paid / late; a recorded row wins over a duplicate placeholder', () => {
    const l = rentLedger(schedule, [row('2026-10-01', 'due'), row('2026-10-01', 'paid', '2026-10-01T15:00:00Z')], NOW)
    expect(l.periods.find((p) => p.due === '2026-10-01')!.state).toBe('paid')
    expect(l.missed).toEqual([])
    const late = rentLedger(schedule, [row('2026-10-01', 'late', '2026-10-04T15:00:00Z')], NOW)
    expect(late.periods.find((p) => p.due === '2026-10-01')!.state).toBe('late')
    expect(isRecordedPayment({ status: 'due' })).toBe(false)
    expect(isRecordedPayment({ status: 'failed' })).toBe(false)
  })

  it('a placeholder on a start date that is not the due day is still shown, but is not arrears', () => {
    const s = rentSchedule('2026-09-15', 1, NOW)
    const l = rentLedger(s, [row('2026-09-15', 'due')], NOW)
    expect(l.periods.map((p) => p.due)).toEqual(['2026-11-01', '2026-10-01', '2026-09-15'])
    const off = l.periods.find((p) => p.due === '2026-09-15')!
    expect(off.onSchedule).toBe(false)
    expect(off.canMarkPaid).toBe(true)
    // Review 2026-10-01: a full month on a mid-month start date overstated the plan's arrears.
    expect(l.missed).toEqual(['2026-10-01'])
    expect(l.dueSoFar).toBe(1)
    const recordedOff = rentLedger(s, [row('2026-09-15', 'paid', '2026-09-15T16:00:00Z')], NOW)
    expect(recordedOff.dueSoFar).toBe(2)
    expect(recordedOff.recordedSoFar).toBe(1)
  })

  it('an unpaid placeholder never feeds the s.58 late-payment count (rent *received* late)', () => {
    const rows = [row('2026-07-01', 'due'), row('2026-08-01', 'due'), row('2026-09-01', 'due')]
    expect(persistentLatePayment(rows, '2026-10-12').late.length).toBe(3)
    const l = rentLedger(rentSchedule('2026-07-01', 1, NOW), rows, NOW)
    expect(persistentLatePayment(l.recordedRows, '2026-10-12').late).toEqual([])
  })

  it('the hub records through mark_rent_paid and never inserts a second row', () => {
    const src = read('app/h/[id]/page.tsx')
    expect(src).toContain("async function markPaid(due: string, paidOnDate: string, leaseId: string | null = household?.current_lease_id ?? null)")
    expect(src).toContain("supabase.rpc('mark_rent_paid', { p_lease: leaseId, p_due: due, p_paid_on: paidOnDate })")
    expect(src).not.toMatch(/from\('rent_payments'\)\.insert/)
    expect(src).toContain('rentLedger(schedule, payments)')
    expect(src).toContain('persistentLatePayment(latenessRows(ledger.recordedRows))')
    expect(src).not.toContain('paidByDue')
    expect(src).toMatch(/待付/)
    expect(src).toMatch(/notifyPendingChanged\(\)/)
  })
})

describe('#30 / #10 migration: one row per period, server-recorded, stale plan cards expire', () => {
  const sql = read('supabase/migrations/20261001_A6_tenancy_ui_rent_ledger.sql')
  it('archives duplicates before the unique index, keeping a recorded row first', () => {
    expect(sql).toContain('create table if not exists public.rent_payments_dedupe_20261001')
    expect(sql).toMatch(/order by coalesce\(status in \('paid', 'late'\), false\) desc/)
    expect(sql).toMatch(/delete from public\.rent_payments rp[\s\S]*returning rp\.\*/)
    expect(sql.indexOf('rent_payments_dedupe_20261001\nselect moved.*')).toBeLessThan(sql.indexOf('create unique index if not exists rent_payments_lease_due_uniq'))
    expect(sql).toContain('on public.rent_payments (lease_id, due_date)')
    expect(sql).toContain('alter table public.rent_payments_dedupe_20261001 enable row level security')
  })
  it('mark_rent_paid is a locked definer function that fills a placeholder in place and never re-stamps a record', () => {
    expect(sql).toMatch(/create or replace function public\.mark_rent_paid\(p_lease uuid, p_due date, p_paid_on date default null\)[\s\S]*security definer\s+set search_path = public, pg_temp/)
    expect(sql).toContain('public.is_household_member(h.id)')
    expect(sql).toMatch(/on conflict \(lease_id, due_date\) do update[\s\S]*where rp\.status is distinct from 'paid' and rp\.status is distinct from 'late'/)
    expect(sql).toContain("revoke all on function public.mark_rent_paid(uuid, date, date) from public, anon;")
    expect(sql).toContain('grant execute on function public.mark_rent_paid(uuid, date, date) to authenticated, service_role;')
    expect(sql.indexOf('drop function if exists public.mark_rent_paid(uuid, date);')).toBeLessThan(sql.indexOf('create or replace function public.mark_rent_paid('))
  })
  it('recording a period expires pending payment-plan cards that listed it', () => {
    expect(sql).toMatch(/set status = 'expired'[\s\S]*'reason', 'arrears_changed'/)
    expect(sql).toContain("a.metadata->>'stage' = 'payment_plan'")
    expect(sql).toContain("a.metadata->>'lease_id' = p_lease::text")
    expect(sql).toContain("(a.metadata->'missed_due_dates') ? to_char(p_due, 'YYYY-MM-DD')")
  })
})

describe('#31 move-in checklist writes only what changed', () => {
  it('a note write carries no tick columns; a tick carries no note', () => {
    const note = checklistWrite('h1', 'insurance', { kind: 'note', note: '  Square One, exp 2027-09  ' })
    expect(Object.keys(note).sort()).toEqual(['household_id', 'item_key', 'note'])
    expect(note.note).toBe('Square One, exp 2027-09')
    const tick = checklistWrite('h1', 'insurance', { kind: 'tick', done: true, userId: 'u1', at: '2026-10-01T00:00:00Z' })
    expect(tick).toEqual({ household_id: 'h1', item_key: 'insurance', done: true, done_by: 'u1', done_at: '2026-10-01T00:00:00Z' })
    expect('note' in tick).toBe(false)
    expect(checklistWrite('h1', 'fobs', { kind: 'tick', done: false, userId: 'u1' })).toEqual({ household_id: 'h1', item_key: 'fobs', done: false, done_by: null, done_at: null })
    expect(normalizeChecklistNote('   ')).toBeNull()
    expect(normalizeChecklistNote('x'.repeat(600))?.length).toBe(500)
  })
  it('the component no longer snapshots the loaded row and clears the draft after a save', () => {
    const src = read('components/household/MoveInChecklist.tsx')
    expect(src).not.toMatch(/prev\.done_by|prev\.done_at|noteDraft\[key\] \?\? prev/)
    expect(src).toContain('checklistWrite(householdId, key, action)')
    expect(src).toMatch(/action\.kind === 'note'\) setNoteDraft\(\(d\) => \{ const n = \{ \.\.\.d \}; delete n\[key\]/)
    expect(src).toContain("addEventListener('visibilitychange'")
  })
  it('the DB stamps who ticked and keeps it on a note edit; policies only need membership', () => {
    const sql = read('supabase/migrations/20261001_A6_tenancy_ui_rent_ledger.sql')
    expect(sql).toMatch(/create trigger trg_guard_move_in_checklist\s+before insert or update on public\.move_in_checklist/)
    expect(sql).toMatch(/new\.done_by := old\.done_by; new\.done_at := old\.done_at;/)
    expect(sql).toContain('revoke all on function public.guard_move_in_checklist() from public, anon, authenticated;')
    const policies = sql.slice(sql.indexOf('drop policy if exists move_in_member_write'))
    expect(policies).not.toMatch(/done_by = auth\.uid\(\)/)
    expect(policies).toContain('with check (public.is_household_member(household_id))')
  })
})

describe('#10 / #32 repayment-plan card stores its inputs and is reused', () => {
  const input = { arrears: 5600, monthlyRent: 2800, installments: 3, firstDue: '2026-11-01', unit: 'Unit 7', tenantName: 'Mia', missed: ['2026-10-01', '2026-09-01'] }
  it('metadata carries the inputs the executor re-checks (contract C5)', () => {
    const m = paymentPlanCardMetadata({ leaseId: 'L1', householdId: 'H1', toEmail: 't@example.com', input, plan: buildPaymentPlan(input) })
    expect(m.stage).toBe(PAYMENT_PLAN_STAGE)
    expect(m).toMatchObject({ lease_id: 'L1', household_id: 'H1', missed_due_dates: ['2026-09-01', '2026-10-01'], installments: 3, first_due: '2026-11-01', arrears_total: 5600, to_email: 't@example.com' })
    expect(m.subject).toContain('Unit 7')
    expect(m.body).toContain('Payment Agreement Form')
  })
  it('a card drafted for other periods is recognised as stale', () => {
    expect(planCardMatchesMissed({ missed_due_dates: ['2026-09-01', '2026-10-01'] }, ['2026-10-01', '2026-09-01'])).toBe(true)
    expect(planCardMatchesMissed({ missed_due_dates: ['2026-09-01', '2026-10-01'] }, ['2026-10-01'])).toBe(false)
    expect(planCardMatchesMissed({ body: 'legacy card' }, ['2026-10-01'])).toBe(false)
    expect(planCardMatchesMissed(null, ['2026-10-01'])).toBe(false)
  })
  it('the newest pending card is reused and older duplicates are superseded', () => {
    const { reuse, supersede } = splitPlanCards([{ id: 'a', created_at: '2026-09-01T00:00:00Z' }, { id: 'c', created_at: '2026-09-03T00:00:00Z' }, { id: 'b', created_at: '2026-09-02T00:00:00Z' }])
    expect(reuse?.id).toBe('c')
    expect(supersede.map((c) => c.id)).toEqual(['b', 'a'])
    expect(splitPlanCards([])).toEqual({ reuse: null, supersede: [] })
  })
  it('the draft updates the pending card before ever inserting one', () => {
    const src = read('components/household/PaymentPlanDraft.tsx')
    expect(src).toContain('.contains(\'metadata\', { stage: PAYMENT_PLAN_STAGE, lease_id: leaseId })')
    expect(src).toMatch(/\.update\(fields\)\.eq\('id', reuse\.id\)\.eq\('status', 'pending'\)/)
    expect(src.indexOf('.update(fields)')).toBeLessThan(src.indexOf(".insert({"))
    expect(src).toContain('paymentPlanCardMetadata(')
    expect(src).not.toMatch(/metadata: \{ lease_id: leaseId, household_id: householdId, to_email/)
  })
})

describe('Review 2026-10-01 · #30 the day it was paid, not the day it was entered', () => {
  const sql = read('supabase/migrations/20261001_A6_tenancy_ui_rent_ledger.sql')
  it('mark_rent_paid stamps the payment date (noon Toronto) and derives paid / late from it', () => {
    expect(sql).toContain('v_paid := coalesce(p_paid_on, v_local);')
    expect(sql).toContain("(v_paid::timestamp + time '12:00') at time zone 'America/Toronto'")
    expect(sql).toContain("case when v_paid <= p_due then 'paid' else 'late' end")
    expect(sql).not.toMatch(/values \(p_lease, v_uid, p_due, v_amount, now\(\)/)
    expect(sql).toMatch(/if v_paid > v_local or v_paid < least\(p_due - 62, v_local\) then\s+raise exception 'bad_paid_date'/)
  })
  it('the client check mirrors the server bounds', () => {
    const today = '2026-10-12'
    expect(checkPaidOn('2026-10-01', '2026-10-01', today)).toEqual({ ok: true, late: false, daysLate: 0, countsTowardS58: false })
    expect(checkPaidOn('2026-10-01', '2026-10-08', today)).toEqual({ ok: true, late: true, daysLate: 7, countsTowardS58: false })
    expect(checkPaidOn('2026-10-01', '2026-10-09', today)).toMatchObject({ ok: true, countsTowardS58: true })
    expect(checkPaidOn('2026-10-01', '2026-10-13', today)).toEqual({ ok: false, reason: 'bad_paid_date' })
    expect(checkPaidOn('2026-10-01', '2026-07-30', today)).toEqual({ ok: false, reason: 'bad_paid_date' })
    expect(checkPaidOn('2026-10-01', '2026-07-31', today)).toMatchObject({ ok: true, late: false })
    expect(checkPaidOn('2026-10-01', 'not-a-date', today)).toEqual({ ok: false, reason: 'bad_paid_date' })
    // A placeholder recorded at signing, months before the first due date: today is allowed.
    expect(earliestPaidOn('2027-01-01', '2026-09-20')).toBe('2026-09-20')
    expect(earliestPaidOn('2026-10-01', '2026-10-12')).toBe('2026-07-31')
  })
  it('catching up three on-time months a week later produces no s.58 lateness', () => {
    const noonToronto = (d: string) => new Date(`${d}T12:00:00-04:00`).toISOString()
    const rows = ['2026-07-01', '2026-08-01', '2026-09-01'].map((d) => row(d, 'paid', noonToronto(d)))
    expect(persistentLatePayment(latenessRows(rows), '2026-10-12').late).toEqual([])
  })
  it('lateness counts calendar days paid in Toronto: day 7 is not "more than seven days late", day 8 is', () => {
    const day7 = row('2026-10-01', 'late', '2026-10-08T16:00:00Z')
    const day8 = row('2026-11-01', 'late', '2026-11-09T17:00:00Z')
    expect(persistentLatePayment([day7], '2026-12-01').late).toEqual(['2026-10-01'])
    expect(persistentLatePayment(latenessRows([day7, day8]), '2026-12-01').late).toEqual(['2026-11-01'])
    expect(latenessRows([row('2026-10-01', 'due')])).toEqual([])
    expect(torontoDate('2026-10-09T02:00:00Z')).toBe('2026-10-08')
  })
  it('the hub asks for the payment date and maps bad_paid_date', () => {
    const src = read('app/h/[id]/page.tsx')
    expect(src).toContain('data-testid="rent-paid-on"')
    expect(src).toContain('checkPaidOn(p.due, paidOnValue, today)')
    expect(src).toMatch(/max=\{today\}/)
    expect(src).toMatch(/bad_paid_date/)
    expect(src).toMatch(/不是这天付的请改成实际日期/)
  })
})

describe('Review 2026-10-01 · the ledger is the current lease term (renewals)', () => {
  const NOW = new Date('2027-10-20T12:00:00Z')
  it('schedules from the later of the household start and the current lease start', () => {
    expect(ledgerStart('2026-10-01', '2027-10-01')).toBe('2027-10-01')
    expect(ledgerStart('2026-10-01', null)).toBe('2026-10-01')
    expect(ledgerStart(null, '2027-10-01')).toBe('2027-10-01')
    expect(ledgerStart('2026-10-15', '2026-10-01')).toBe('2026-10-15')
    // Renewal: the previous term's 12 periods are not listed as unpaid against the new lease.
    const l = rentLedger(rentSchedule(ledgerStart('2026-10-01', '2027-10-01'), 1, NOW), [], NOW)
    expect(l.missed).toEqual(['2027-10-01'])
  })
  it('the hub reads the current lease start; the server checks before_lease against the same term', () => {
    const src = read('app/h/[id]/page.tsx')
    expect(src).toContain("supabase.from('lease_documents').select('start_date').eq('id', leaseId).maybeSingle()")
    expect(src).toContain('rentSchedule(termStart, household.rent_due_day)')
    expect(src).not.toContain('rentSchedule(household.start_date, household.rent_due_day)')
    const sql = read('supabase/migrations/20261001_A6_tenancy_ui_rent_ledger.sql')
    expect(sql).toContain('v_term_start := greatest(v_hh.start_date, (select ld.start_date from public.lease_documents ld where ld.id = p_lease));')
  })
})

describe('Review 2026-10-01 · repayment-plan arrears come from the periods themselves', () => {
  it('sums each missed period at its own amount and skips the off-schedule placeholder', () => {
    const NOW = new Date('2026-11-12T12:00:00Z')
    const l = rentLedger(rentSchedule('2026-09-15', 1, NOW), [row('2026-09-15', 'due', null, 2800), row('2026-10-01', 'due', null, 2750)], NOW)
    expect(l.missed).toEqual(['2026-11-01', '2026-10-01'])
    expect(missedArrears(l, 2800)).toBe(5550)
    expect(missedArrears({ periods: [], missed: [] }, 2800)).toBe(0)
  })
  it('the hub passes the computed arrears to the draft', () => {
    expect(read('app/h/[id]/page.tsx')).toContain('arrears={missedArrears(ledger, Number(household.monthly_rent) || 0)}')
    expect(read('components/household/PaymentPlanDraft.tsx')).toContain("typeof arrearsIn === 'number' && arrearsIn > 0 ? arrearsIn : missed.length * monthlyRent")
  })
})

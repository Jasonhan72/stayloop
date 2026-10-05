// 节点 3 · 可执行 (2026-09-26): the marketplace has an SLA, declines carry a
// reason, quotes are versioned, credentials remind on a ladder, the provider
// has a workbench and a history, and one admin rule (grace days) is enforced
// by the same pure function the pages display. Pure-function tests plus
// source guards.
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { arrivedOnTime, clampQuoteHours, declineText, dueReminder, expiryTone, quoteDueAt, slaState, validateDecline } from '@/lib/marketplace/sla'
import { clampGraceDays, coverageFor, coverageLabel, providerEligible, GRACE_ELIGIBLE_KINDS } from '@/lib/marketplace/trades'
import { normalizePolicy } from '@/lib/marketplace/dispatchPolicy'
import { providerMetrics, WORK_ORDER_COLUMNS } from '@/lib/marketplace/workOrders'
import { buildProviderTiles, settlementByMonth } from '@/lib/marketplace/providerView'

const read = (p: string) => readFileSync(p, 'utf8')
const NOW = new Date('2026-09-26T15:00:00Z')

describe('SLA: the contractor clock', () => {
  it('quote hours clamp to 24–72 with a 48 h default; the due date is offer + hours', () => {
    expect(clampQuoteHours(undefined)).toBe(48)
    expect(clampQuoteHours(10)).toBe(24)
    expect(clampQuoteHours(100)).toBe(72)
    expect(quoteDueAt('2026-09-26T15:00:00Z', 48)).toBe('2026-09-28T15:00:00.000Z')
    expect(normalizePolicy(null).quote_hours).toBe(48)
    expect(normalizePolicy({ quote_hours: 36 }).quote_hours).toBe(36)
    expect(normalizePolicy({ quote_hours: 999 }).quote_hours).toBe(72)
  })
  it('due → soon (≤12 h) → overdue, hours whole; no deadline = no state', () => {
    expect(slaState(null, NOW)).toBeNull()
    expect(slaState('2026-09-28T15:00:00Z', NOW)).toEqual({ kind: 'due', hours: 48, dueAt: '2026-09-28T15:00:00Z' })
    expect(slaState('2026-09-26T20:30:00Z', NOW)).toMatchObject({ kind: 'soon', hours: 6 })
    expect(slaState('2026-09-26T11:00:00Z', NOW)).toMatchObject({ kind: 'overdue', hours: 4 })
  })
  it('createWorkOrder stamps quote_due_at from the landlord policy and tells the contractor the deadline; the sweep stamps sla_overdue_at once', () => {
    const s = read('lib/marketplace/server.ts')
    expect(s).toContain('const dueAt = quoteDueAt(new Date(), policy.quote_hours)')
    expect(s).toContain('quote_due_at: dueAt,')
    expect(s).toContain('请在 ${policy.quote_hours} 小时内回应')
    const sw = read('lib/marketplace/sweep.ts')
    expect(sw).toContain(".eq('status', 'offered').is('sla_overdue_at', null).lt('quote_due_at', now.toISOString())")
    expect(sw).toContain("update({ sla_overdue_at: now.toISOString() }).eq('id', wo.id).eq('status', 'offered').is('sla_overdue_at', null)")
    expect(sw).toContain("action_type: 'work_order_overdue'")
    expect(sw).toContain("event: 'quote_overdue'")
  })
  it('the overdue executor withdraws only an unanswered offer and re-suggests without the silent contractor', () => {
    const ex = read('app/api/agent/execute/route.ts')
    expect(ex).toContain("case 'work_order_overdue':")
    expect(ex).toContain("if ((wo as { status: string }).status !== 'offered')")
    expect(ex).toContain("reason: 'work_order_already_answered'")
    expect(ex).toContain("action: 'cancel', by: 'landlord', actorId: userId")
    expect(ex).toContain("excludeProviderIds: row.provider_id ? [row.provider_id] : [], because: 'overdue'")
    const s = read('lib/marketplace/server.ts')
    expect(s).toContain('if (exclude.has(p.id)) { if (ok) excludedEligible++; continue }')
    expect(s).toContain("because: 'declined'")
  })
  it('the proactive cron runs the marketplace sweep beside the renewal sweep', () => {
    const p = read('app/api/agent/proactive/route.ts')
    expect(p).toContain("import { runMarketplaceSweep } from '@/lib/marketplace/sweep'")
    expect(p).toContain('const marketplace = await runMarketplaceSweep(admin).catch(')
    expect(p).toContain('async function runRenewalSweep(): Promise<NextResponse>')
  })
  it('the card and the token page show the countdown; the token route exposes the deadline', () => {
    expect(read('components/marketplace/WorkOrderCard.tsx')).toContain('data-testid="sla-countdown"')
    expect(read('app/w/[token]/page.tsx')).toContain('data-testid="sla-countdown"')
    expect(read('app/api/w/[token]/route.ts')).toContain('quote_due_at: w.quote_due_at, quote_version: w.quote_version')
  })
})

describe('declines carry a reason; quotes are versions', () => {
  it('validateDecline: a code is required, "other" needs a note', () => {
    expect(validateDecline({})).toEqual({ ok: false, reason: 'decline_reason_required' })
    expect(validateDecline({ code: 'nope' })).toEqual({ ok: false, reason: 'decline_reason_required' })
    expect(validateDecline({ code: 'other', reason: ' ' })).toEqual({ ok: false, reason: 'decline_reason_required' })
    expect(validateDecline({ code: 'no_capacity' })).toEqual({ ok: true, value: { code: 'no_capacity', note: null } })
    expect(validateDecline({ code: 'other', reason: 'On holiday until October' })).toEqual({ ok: true, value: { code: 'other', note: 'On holiday until October' } })
    expect(declineText('out_of_area', null, true)).toBe('不在服务范围')
    expect(declineText('other', 'busy', false)).toBe('Other (please say) · busy')
  })
  it('the server enforces it and counts versions; both decline forms have the code select', () => {
    const s = read('lib/marketplace/server.ts')
    expect(s).toContain('const d = validateDecline({ code: p.code, reason: p.reason })')
    expect(s).toContain("Object.assign(patch, { decline_code: d.value.code, cancel_reason: d.value.note })")
    expect(s).toContain('const version = (Number(wo.quote_version) || 0) + 1')
    for (const f of ['components/marketplace/WorkOrderCard.tsx', 'app/w/[token]/page.tsx']) {
      const src = read(f)
      expect(src).toContain('data-testid="decline-form"')
      expect(src).toContain('DECLINE_CODES.map((c) =>')
      expect(src).not.toMatch(/run\('decline'\)\}|act\('decline', \{ reason: form\.reason \}\)/)
    }
    expect(read('components/marketplace/WorkOrderCard.tsx')).toContain('data-testid="quote-version"')
  })
  it('a decline is not a dead end: the landlord is re-suggested at once, never the same contractor', () => {
    const s = read('lib/marketplace/server.ts')
    expect(s).toContain("await suggestDispatch(admin, wo.landlord_auth_id, wo.ticket_id, { excludeProviderIds: wo.provider_id ? [wo.provider_id] : [], because: 'declined' })")
  })
})

describe('credential rules and the reminder ladder', () => {
  const T = new Date('2026-09-26T12:00:00Z')
  it('one reminder per tier, the lowest due tier is sent, earlier tiers are marked so they never back-fill', () => {
    expect(dueReminder('2026-11-10', [], T)).toEqual({ daysLeft: 45, send: 60, mark: [90, 60] })
    expect(dueReminder('2026-11-10', [90, 60], T)).toEqual({ daysLeft: 45, send: null, mark: [] })
    expect(dueReminder('2026-10-01', [90, 60, 30], T)).toEqual({ daysLeft: 5, send: 7, mark: [7] })
    expect(dueReminder('2026-09-20', [90, 60, 30, 7], T)).toEqual({ daysLeft: -6, send: 0, mark: [0] })
    expect(dueReminder('2026-07-01', [], T).send).toBeNull() // >30 days expired: the ladder is over
    expect(expiryTone(-1)).toBe('expired'); expect(expiryTone(7)).toBe('critical'); expect(expiryTone(30)).toBe('warn'); expect(expiryTone(60)).toBe('notice'); expect(expiryTone(90)).toBe('info'); expect(expiryTone(91)).toBeNull()
  })
  it('grace applies only to paperwork credentials and only within the admin cap', () => {
    const creds = [
      { kind: 'sto_coq', expires_at: '2026-09-20', verified_at: '2026-01-01' },
      { kind: 'liability_insurance', expires_at: '2026-09-20', verified_at: '2026-01-01' },
      { kind: 'wsib_clearance', expires_at: '2026-12-31', verified_at: '2026-01-01' },
    ]
    expect(clampGraceDays(99)).toBe(14); expect(clampGraceDays(-3)).toBe(0); expect(clampGraceDays('x')).toBe(0)
    expect(GRACE_ELIGIBLE_KINDS).not.toContain('sto_coq')
    const strict = coverageFor('plumbing', creds, T, 0)
    expect(strict.ok).toBe(false); expect(strict.expired).toEqual(['sto_coq', 'liability_insurance'])
    const graced = coverageFor('plumbing', creds, T, 14)
    expect(graced.expired).toEqual(['sto_coq']) // the licence stays expired; the insurance is in grace
    expect(graced.inGrace).toEqual(['liability_insurance'])
    const handy = coverageFor('handyman', [{ kind: 'business_registration', expires_at: '2026-09-20', verified_at: '2026-01-01' }, { kind: 'liability_insurance', expires_at: null, verified_at: '2026-01-01' }], T, 7)
    expect(handy.ok).toBe(true); expect(handy.inGrace).toEqual(['business_registration'])
    expect(coverageFor('handyman', [{ kind: 'business_registration', expires_at: '2026-09-01', verified_at: '2026-01-01' }, { kind: 'liability_insurance', expires_at: null, verified_at: '2026-01-01' }], T, 14).ok).toBe(false) // 25 days > cap
    expect(providerEligible({ status: 'verified', trades: ['handyman'], service_cities: ['Toronto'] }, [{ kind: 'business_registration', expires_at: '2026-09-20', verified_at: '2026-01-01' }, { kind: 'liability_insurance', expires_at: null, verified_at: '2026-01-01' }], 'handyman', 'Toronto', T, 7).ok).toBe(true)
    expect(coverageLabel('plumbing', creds, true, T, 0).text).toContain('未覆盖 · 不会收到派单')
    expect(coverageLabel('handyman', [{ kind: 'business_registration', expires_at: null, verified_at: '2026-01-01' }, { kind: 'liability_insurance', expires_at: null, verified_at: '2026-01-01' }], true, T, 0)).toEqual({ ok: true, text: '已覆盖 · 可接派单' })
  })
  it('the server reads the grace rule from app_config for every eligibility check; the pages read the same value', () => {
    const s = read('lib/marketplace/server.ts')
    expect(s).toContain("from('app_config').select('value').eq('key', 'marketplace')")
    expect((s.match(/cfg\.credentialGraceDays/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(read('app/api/config/marketplace/route.ts')).toContain('credential_grace_days: clampGraceDays(v.credential_grace_days)')
    for (const f of ['components/marketplace/DispatchModal.tsx', 'app/landlord/providers/page.tsx', 'app/provider/onboard/page.tsx', 'app/provider/jobs/page.tsx']) expect(read(f)).toContain('useMarketplaceConfig()')
    expect(read('app/admin/providers/page.tsx')).toContain('data-testid="marketplace-rules"')
  })
  it('the sweep mails one ladder step per credential and records it; the guard trigger keeps the bookkeeping out of self-service reach', () => {
    const sw = read('lib/marketplace/sweep.ts')
    expect(sw).toContain("update({ reminders_sent: merged })")
    expect(sw).toContain("action: 'credential_expiry_reminder'")
    const mig = read('supabase/migrations/20260926_node3_execution.sql')
    expect(mig).toContain('add column if not exists reminders_sent integer[]')
    expect(mig).toContain("new.reminders_sent := '{}'")
    expect(mig).toContain('grant select (quote_due_at, sla_overdue_at, quote_version, decline_code) on public.work_orders to authenticated')
    expect(mig).toContain('check (quote_hours between 24 and 72)')
    expect(WORK_ORDER_COLUMNS).toContain('quote_due_at')
  })
  it('onboarding and the workbench label every trade covered / not covered', () => {
    for (const f of ['app/provider/onboard/page.tsx', 'app/provider/jobs/page.tsx']) expect(read(f)).toContain('data-testid="trade-coverage"')
    expect(read('app/provider/onboard/page.tsx')).toContain('data-testid="save-coverage-hint"')
  })
})

describe('the provider workbench and history', () => {
  const wo = (o: Record<string, unknown>) => ({ id: 'x', status: 'offered', trade: null, scope: 's', emergency: false, entry_permission: null, provider_id: 'p', external_email: null, external_name: null, quote_amount: null, quote_type: null, quote_note: null, quoted_at: null, approved_amount: null, approved_at: null, schedule_start: null, schedule_end: null, entry_notice_sent_at: null, arrived_at: null, completed_at: null, completion_note: null, invoice_amount: null, invoice_note: null, tenant_confirmed_at: null, accepted_at: null, paid_at: null, dispute_reason: null, resolution_note: null, cancel_reason: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ticket_id: 't', household_id: 'h', ...o }) as never
  it('six tiles from the rows: invitations (with the SLA warning), quoted, active, awaiting, settlement, paid + rating', () => {
    const rows = [
      wo({ status: 'offered', quote_due_at: '2026-09-26T11:00:00Z' }),
      wo({ status: 'offered', quote_due_at: '2026-09-30T00:00:00Z' }),
      wo({ status: 'quoted' }), wo({ status: 'scheduled' }), wo({ status: 'rework' }), wo({ status: 'completed' }),
      wo({ status: 'accepted', invoice_amount: 210 }),
      wo({ status: 'paid', paid_at: '2026-03-01T00:00:00Z', invoice_amount: 150 }), wo({ status: 'closed', paid_at: '2025-12-01T00:00:00Z', invoice_amount: 999 }),
    ]
    const t = buildProviderTiles(rows, [{ overall: 5 }, { overall: 4 }], NOW)
    expect(t).toMatchObject({ invites: 2, urgent: 1, quoted: 1, active: 2, awaiting: 1, settle: 1, settleSum: 210, paid: 1, paidSum: 150, avg: 4.5, reviews: 2 })
  })
  it('settlement groups paid jobs by month, newest first; metrics add response, punctuality and first-time fix', () => {
    expect(settlementByMonth([{ status: 'paid', paid_at: '2026-09-02T00:00:00Z', invoice_amount: 100 }, { status: 'closed', paid_at: '2026-09-20T00:00:00Z', invoice_amount: '50' }, { status: 'paid', paid_at: '2026-08-02T00:00:00Z', invoice_amount: 10 }, { status: 'accepted', paid_at: null, invoice_amount: 999 }]))
      .toEqual([{ month: '2026-09', count: 2, total: 150 }, { month: '2026-08', count: 1, total: 10 }])
    const m = providerMetrics([
      { status: 'paid', created_at: '2026-09-01T00:00:00Z', quoted_at: '2026-09-01T06:00:00Z', approved_amount: 100, invoice_amount: 100, schedule_start: '2026-09-03T10:00:00Z', arrived_at: '2026-09-03T10:10:00Z', accepted_at: '2026-09-03T12:00:00Z', emergency: false },
      { status: 'rework', created_at: '2026-09-05T00:00:00Z', quoted_at: '2026-09-06T00:00:00Z', approved_amount: 100, invoice_amount: 100, schedule_start: '2026-09-07T10:00:00Z', arrived_at: '2026-09-07T11:00:00Z', accepted_at: null, emergency: false },
    ])
    expect(m.responseHoursMedian).toBe(6)
    expect(m.onTimeRate).toBe(0.5)
    expect(m.firstTimeFixRate).toBe(0.5)
    expect(arrivedOnTime('2026-09-03T10:00:00Z', '2026-09-03T10:14:00Z')).toBe(true)
    expect(arrivedOnTime('2026-09-03T10:00:00Z', '2026-09-03T10:16:00Z')).toBe(false)
    expect(arrivedOnTime(null, '2026-09-03T10:16:00Z')).toBeNull()
  })
  it('the pages exist with their blocks and read columns explicitly (never *)', () => {
    expect(existsSync('app/provider/history/page.tsx')).toBe(true)
    const j = read('app/provider/jobs/page.tsx')
    for (const t of ['data-testid="provider-tiles"', 'data-testid="provider-empty-guide"', 'data-testid="provider-history-link"']) expect(j).toContain(t)
    const h = read('app/provider/history/page.tsx')
    for (const t of ['data-testid="provider-metrics"', 'data-testid="settlement-record"', 'data-testid="provider-reviews"', 'data-testid="history-list"']) expect(h).toContain(t)
    for (const f of [j, h]) { expect(f).toContain("from('work_orders').select(WORK_ORDER_COLUMNS)"); expect(f).not.toMatch(/from\('work_orders'\)\.select\('\*'\)/) }
    expect(read('components/marketplace/DispatchPolicyCard.tsx')).toContain('data-testid="quote-hours"')
  })
  it('the new codes have human labels everywhere they can appear', () => {
    const ideas = read('lib/agent/ideas.ts')
    for (const k of ['work_order_quote_overdue', 'executed_work_order_overdue', 'credential_expiry_reminder']) expect(ideas).toContain(`${k}:`)
    expect(read('components/marketplace/WorkOrderCard.tsx')).toContain('quote_overdue:')
  })
})

// Services marketplace Phase 0 + 1 (design/services-marketplace-plan-2026-09,
// user go-ahead 2026-09-23). Pure rules + source guards; the routes are edge.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canAct, entryNoticeText, invoiceWithinEstimate, providerMetrics, TICKET_STATUS_FOR, validateQuote } from '@/lib/marketplace/workOrders'
import { cityMatch, coverageFor, earliestExpiry, providerEligible, tradeForCategory, TRADES } from '@/lib/marketplace/trades'
import { ONTARIO_RULES } from '@/lib/ontario/rules'

const TODAY = new Date('2026-09-23T12:00:00Z')

describe('work-order state machine', () => {
  it('contractor accepts with a quote, landlord approves, contractor arrives and completes, landlord accepts', () => {
    expect(canAct('accept', 'offered', 'external')).toMatchObject({ ok: true, to: 'quoted' })
    expect(canAct('approve_quote', 'quoted', 'landlord')).toMatchObject({ ok: true, to: 'scheduled' })
    expect(canAct('arrive', 'scheduled', 'provider')).toMatchObject({ ok: true, to: 'in_progress' })
    expect(canAct('complete', 'in_progress', 'provider')).toMatchObject({ ok: true, to: 'completed' })
    expect(canAct('tenant_confirm', 'completed', 'tenant')).toMatchObject({ ok: true, to: 'completed' })
    expect(canAct('accept_completion', 'completed', 'landlord')).toMatchObject({ ok: true, to: 'accepted' })
    expect(canAct('mark_paid', 'accepted', 'landlord')).toMatchObject({ ok: true, to: 'paid' })
  })
  it('refuses the wrong actor or the wrong state', () => {
    expect(canAct('approve_quote', 'quoted', 'provider').ok).toBe(false)
    expect(canAct('approve_quote', 'quoted', 'tenant').ok).toBe(false)
    expect(canAct('accept_completion', 'in_progress', 'landlord').ok).toBe(false)
    expect(canAct('arrive', 'offered', 'provider').ok).toBe(false)
    expect(canAct('resolve_dispute', 'disputed', 'landlord').ok).toBe(false)
    expect(canAct('resolve_dispute', 'disputed', 'admin').ok).toBe(true)
    expect(canAct('mark_paid', 'completed', 'landlord').ok).toBe(false)
  })
  it('keeps the ticket in step with the work order', () => {
    expect(TICKET_STATUS_FOR.offered).toBe('assigned')
    expect(TICKET_STATUS_FOR.in_progress).toBe('in_progress')
    expect(TICKET_STATUS_FOR.completed).toBe('review')
    expect(TICKET_STATUS_FOR.accepted).toBe('done')
    expect(TICKET_STATUS_FOR.declined).toBe('new')
  })
  it('validates quotes and applies the CPA 10% rule to invoices', () => {
    expect(validateQuote({ amount: 250, type: 'fixed' }).ok).toBe(true)
    expect(validateQuote({ amount: -1, type: 'fixed' }).reason).toBe('amount')
    expect(validateQuote({ amount: 10, type: 'weird' as never }).reason).toBe('type')
    expect(validateQuote({ amount: 10, type: 'fixed', schedule_start: '2026-10-02T10:00:00Z', schedule_end: '2026-10-01T10:00:00Z' }).reason).toBe('schedule')
    expect(invoiceWithinEstimate(300, 330).ok).toBe(true)
    expect(invoiceWithinEstimate(300, 331)).toMatchObject({ ok: false, overBy: 10.3 })
    expect(invoiceWithinEstimate(null, 500).ok).toBe(true)
  })
  it('entry notice cites s.27 for normal work and s.26 for emergencies', () => {
    const n = entryNoticeText({ unit: '100 Test Ave #1', scheduleStart: '2026-10-02T14:00:00Z', scheduleEnd: '2026-10-02T16:00:00Z', provider: 'Maple Plumbing', scope: '厨房漏水', entryPermission: 'call_first', emergency: false })
    expect(n.subject).toContain('进入通知')
    expect(n.body).toContain('s.27')
    expect(n.body).toContain('24')
    const e = entryNoticeText({ unit: 'U', scheduleStart: null, scheduleEnd: null, provider: 'X', scope: '没暖气', entryPermission: 'anytime', emergency: true })
    expect(e.body).toContain('s.26')
  })
  it('pilot metrics from rows', () => {
    const m = providerMetrics([
      { status: 'accepted', created_at: 'x', quoted_at: 'y', approved_amount: 100, invoice_amount: 105, schedule_start: '2026-10-01T10:00:00Z', arrived_at: '2026-10-01T10:20:00Z', accepted_at: 'z', emergency: false },
      { status: 'declined', created_at: 'x', quoted_at: null, approved_amount: null, invoice_amount: null, schedule_start: null, arrived_at: null, accepted_at: null, emergency: false },
    ])
    expect(m.offered).toBe(2)
    expect(m.acceptRate).toBe(0.5)
    expect(m.arrivalMinutesMedian).toBe(20)
    expect(m.quoteVariance).toBe(0.05)
  })
})

describe('trades, credentials, eligibility', () => {
  it('maps ticket categories to trades and lists the Ontario-required credentials', () => {
    expect(tradeForCategory('plumbing')).toBe('plumbing')
    expect(tradeForCategory('heating_cooling')).toBe('heating_cooling')
    expect(tradeForCategory('other')).toBe('handyman')
    expect(TRADES.find((t) => t.key === 'electrical')?.required).toContain('esa_contractor')
    expect(TRADES.find((t) => t.key === 'heating_cooling')?.required).toContain('tssa_gas')
    expect(TRADES.find((t) => t.key === 'plumbing')?.required).toContain('sto_coq')
    expect(TRADES.find((t) => t.key === 'pest')?.required).toContain('mecp_exterminator')
  })
  it('coverage needs every required credential verified and unexpired', () => {
    const ok = [{ kind: 'sto_coq', expires_at: '2027-01-01', verified_at: 'x' }, { kind: 'liability_insurance', expires_at: '2027-01-01', verified_at: 'x' }, { kind: 'wsib_clearance', expires_at: '2026-12-01', verified_at: 'x' }]
    expect(coverageFor('plumbing', ok, TODAY).ok).toBe(true)
    expect(coverageFor('plumbing', ok.slice(0, 2), TODAY).missing).toEqual(['wsib_clearance'])
    expect(coverageFor('plumbing', [{ ...ok[0], expires_at: '2026-01-01' }, ok[1], ok[2]], TODAY).expired).toEqual(['sto_coq'])
    expect(coverageFor('plumbing', [{ ...ok[0], verified_at: null }, ok[1], ok[2]], TODAY).unverified).toEqual(['sto_coq'])
  })
  it('eligibility: verified + trade + credentials + city; Toronto covers its boroughs', () => {
    const creds = [{ kind: 'business_registration', expires_at: null, verified_at: 'x' }, { kind: 'liability_insurance', expires_at: '2027-01-01', verified_at: 'x' }]
    const p = { status: 'verified', trades: ['appliance'], service_cities: ['Toronto'] }
    expect(providerEligible(p, creds, 'appliance', 'Scarborough', TODAY).ok).toBe(true)
    expect(providerEligible(p, creds, 'appliance', 'Mississauga', TODAY).reason).toBe('city')
    expect(providerEligible(p, creds, 'plumbing', 'Toronto', TODAY).reason).toBe('trade_not_listed')
    expect(providerEligible({ ...p, status: 'pending' }, creds, 'appliance', 'Toronto', TODAY).reason).toBe('not_verified')
    expect(providerEligible(p, [], 'appliance', 'Toronto', TODAY).reason).toBe('credentials')
    expect(cityMatch('Toronto', 'North York')).toBe(true)
    expect(cityMatch('Mississauga', 'Toronto')).toBe(false)
  })
  it('earliest expiry drives the stop-dispatch reminder', () => {
    expect(earliestExpiry([{ kind: 'a', expires_at: '2026-10-03', verified_at: null }, { kind: 'b', expires_at: '2026-09-30', verified_at: null }], TODAY)).toEqual({ kind: 'b', days: 7 })
    expect(earliestExpiry([{ kind: 'a', expires_at: null, verified_at: null }], TODAY)).toBeNull()
  })
})

describe('rules and wiring', () => {
  it('the four maintenance rules exist with the right statutes', () => {
    const ids = ONTARIO_RULES.filter((r) => r.area === 'maintenance').map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['RTA-20-landlord-repairs', 'RTA-27-entry-notice', 'RTA-26-emergency-entry', 'CPA-10-estimate']))
    expect(ONTARIO_RULES.find((r) => r.id === 'CPA-10-estimate')?.summary.zh).toContain('10%')
  })
  it('executors: dispatch / approve_quote / accept_completion are dispatched and the ticket executor suggests a dispatch card', () => {
    const src = readFileSync('app/api/agent/execute/route.ts', 'utf8')
    for (const k of ["case 'dispatch_work_order':", "case 'approve_quote':", "case 'accept_completion':", 'suggestDispatch(admin, ll.auth_id, ticket.id)']) expect(src).toContain(k)
  })
  it('the hub no longer writes the illegal ticket status "resolved"', () => {
    const src = readFileSync('app/h/[id]/page.tsx', 'utf8')
    expect(src).not.toMatch(/status:\s*'resolved'|'resolved'\s*:\s*null/)
    expect(src).toContain('<MaintenancePanel')
  })
  it('the external token door never accepts landlord-side actions or photos', () => {
    const src = readFileSync('app/api/w/[token]/route.ts', 'utf8')
    expect(src).not.toMatch(/'approve_quote'|'accept_completion'|'mark_paid'/)
    expect(src).toContain('delete payload.photos')
  })
  it('the sample vendor table was parked, not reused', () => {
    const mig = readFileSync('supabase/migrations/20260923_services_marketplace.sql', 'utf8')
    expect(mig).toContain('rename to service_providers_v4_demo')
    expect(mig).toContain("grant select on public.work_orders to authenticated")
    expect(mig).not.toMatch(/grant (insert|update).*public\.work_orders to authenticated/)
  })
})

describe('review after the first production run (2026-09-23)', () => {
  it('the dispatch modal trade choice reaches the server, and hub decisions expire the matching card', () => {
    const server = readFileSync('lib/marketplace/server.ts', 'utf8')
    expect(server).toMatch(/i\.trade && TRADES\.some/)
    expect(server).toContain("eq('action_type', 'dispatch_work_order').contains('metadata', { ticket_id: i.ticketId })")
    expect(server).toContain("contains('metadata', { work_order_id: wo.id })")
    expect(readFileSync('components/marketplace/DispatchModal.tsx', 'utf8')).toMatch(/emergency, trade \}/)
  })
})

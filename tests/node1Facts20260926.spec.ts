// 节点 1 · 可信 (2026-09-26): one fact source, one state vocabulary, hard
// constraints before ranking. Pure-function tests for the derivations plus
// source guards that keep every surface on the shared facts.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { applicationDisplayState, isApplicationOpen, isLeaseInForce, leaseDisplayState, leaseStateDetail, isTicketOpen, listingDisplayState, yesNo } from '@/lib/matters/states'
import { landlordStats, tenantStats, agentStats } from '@/lib/facts/stats'
import { applyHardConstraints, bedsFromText, budgetFromMemories, budgetFromText, constraintsNote, petsFromText } from '@/lib/agent/hardConstraints'
import type { LandlordFactsRaw, TenantFactsRaw } from '@/lib/facts/useFacts'

const read = (p: string) => readFileSync(p, 'utf8')
const T = new Date('2026-09-26T15:00:00Z')

describe('lease display state is derived from status AND dates', () => {
  it('a signed lease whose start date is ahead is 已签待起租, never in force (L-46B5)', () => {
    const l = { status: 'signed_both', start_date: '2026-11-01', end_date: '2026-12-19' }
    expect(leaseDisplayState(l, T)).toBe('upcoming')
    expect(isLeaseInForce(l, T)).toBe(false)
    expect(leaseStateDetail(l, true, T)).toBe('已签 · 2026-11-01 起租')
  })
  it('in force between the dates, ended after the end date even if the column still says active', () => {
    expect(leaseDisplayState({ status: 'signed_both', start_date: '2026-09-01', end_date: '2027-08-31' }, T)).toBe('active')
    expect(leaseDisplayState({ status: 'active', start_date: '2025-09-01', end_date: '2026-08-31' }, T)).toBe('ended')
    expect(leaseDisplayState({ status: 'imported', start_date: '2026-01-01', end_date: null }, T)).toBe('active')
    expect(leaseDisplayState({ status: 'ended', start_date: '2025-01-01', end_date: '2025-12-31' }, T)).toBe('ended')
  })
  it('in-flight statuses keep their own words', () => {
    expect(leaseDisplayState({ status: 'sent' }, T)).toBe('sent')
    expect(leaseDisplayState({ status: 'signed_tenant' }, T)).toBe('awaiting_landlord')
    expect(leaseDisplayState({ status: 'draft' }, T)).toBe('draft')
    expect(leaseDisplayState({ status: null }, T)).toBe('draft')
  })
})

describe('other state tables', () => {
  it('applications: archived beats everything; decided; scored; to screen', () => {
    expect(applicationDisplayState({ status: 'new', archived_at: '2026-09-25' })).toBe('archived')
    expect(applicationDisplayState({ status: 'approved' })).toBe('decided')
    expect(applicationDisplayState({ status: 'new', decision_notified_at: '2026-09-25' })).toBe('decided')
    expect(applicationDisplayState({ status: 'new', screened_at: '2026-09-25' })).toBe('scored')
    expect(applicationDisplayState({ status: 'new' })).toBe('to_screen')
    expect(isApplicationOpen({ status: 'new' })).toBe(true)
    expect(isApplicationOpen({ status: 'declined' })).toBe(false)
  })
  it('tickets, listings and booleans', () => {
    expect(isTicketOpen({ status: 'review' })).toBe(true)
    expect(isTicketOpen({ status: 'done' })).toBe(false)
    expect(listingDisplayState({ is_active: true, verification_status: 'pending' })).toBe('pending')
    expect(listingDisplayState({ is_active: true, verification_status: null, source: 'realtor' })).toBe('live')
    expect(listingDisplayState({ is_active: false, verification_status: 'verified' })).toBe('inactive')
    expect(yesNo(true, true)).toBe('是')
    expect(yesNo('false', false)).toBe('No')
    expect(yesNo(null, true)).toBe('—')
  })
})

// The tenant-test account as the RPC returns it today (2026-09-26): one signed
// lease starting 11-01, one instalment due, three open tickets on the tenancy.
const TENANT: TenantFactsRaw = {
  tier: 1,
  applications: [
    { id: 'a1', status: 'approved', created_at: '2026-09-23', move_in_date: null, viewed_at: '2026-09-23', screened_at: '2026-09-23', decision_notified_at: '2026-09-23', listing_id: 'l', listing_slug: 's', listing_address: '100 Test Ave', listing_unit: '1', listing_active: false },
    { id: 'a2', status: 'new', created_at: '2026-09-25', move_in_date: null, viewed_at: null, screened_at: null, decision_notified_at: null, listing_id: 'l2', listing_slug: 's2', listing_address: '1001 Bay St', listing_unit: '1618', listing_active: true },
  ],
  leases: [{ id: '46b558d0', status: 'signed_both', start_date: '2026-11-01', end_date: '2026-12-19', unit_label: '100 Test Ave #1', application_id: 'a1' }],
  members: ['hh1'], member_roles: [{ household_id: 'hh1', role: 'tenant' }],
  households: [{ id: 'hh1', current_lease_id: '46b558d0', verified: true, status: 'active', end_date: '2026-12-19', address: '100 Test Ave', unit: '1', city: 'Toronto' }],
  invites: [], shares: 1, showings: [{ kind: 'showing', status: 'pending' }],
  rent: [{ lease_id: '46b558d0', due_date: '2026-11-01', status: 'due', amount: 2450 }],
  rent_all: [{ id: 'r1', lease_id: '46b558d0', due_date: '2026-11-01', status: 'due', amount: 2450, paid_at: null, method: null }],
  tickets: [{ household_id: 'hh1', status: 'done' }, { household_id: 'hh1', status: 'review' }, { household_id: 'hh1', status: 'new' }, { household_id: 'hh1', status: 'new' }, { household_id: 'hh1', status: 'cancelled' }],
  intent: null,
}

describe('status tiles come from the same facts as the rail', () => {
  it('tenant: lease upcoming (not 暂无租约), 3 open tickets, $2,450 due — the three numbers the review saw disagree', () => {
    const s = tenantStats(TENANT, T)
    expect(s.leaseState).toBe('upcoming')
    expect(s.openTickets).toBe(3)
    expect(s.nextRent).toEqual({ date: '2026-11-01', amount: 2450, late: false })
    expect(s.apps).toBe(1) // the approved one is decided; only a2 is in flight
    expect(s.passportTier).toBe(1)
  })
  it('landlord: an upcoming lease is not counted as in force and not in the renewal window', () => {
    const f: LandlordFactsRaw = {
      listings: [{ id: 'l', verification_status: 'verified', is_active: true }], cards: [],
      leases: [{ id: 'L1', status: 'signed_both', start_date: '2026-11-01', end_date: '2026-12-19', unit_label: '#1' }, { id: 'L2', status: 'active', start_date: '2026-01-01', end_date: '2026-12-31', unit_label: '#2' }],
      households: [{ id: 'hh1', current_lease_id: 'L1', verified: true, status: 'active', end_date: null }],
      applications: [{ id: 'a', listing_id: 'l', status: 'new', decision_notified_at: null }, { id: 'b', listing_id: 'l', status: 'new', decision_notified_at: null, archived_at: '2026-09-25' }],
      rent: [], rent_month: [{ lease_id: 'L2', due_date: '2026-09-01', status: 'paid', amount: 2000 }, { lease_id: 'L2', due_date: '2026-09-15', status: 'due', amount: 500 }],
      tickets: [{ household_id: 'hh1', status: 'new' }, { household_id: 'hh1', status: 'done' }], intents: [], screenings: [],
    }
    const s = landlordStats(f, T)
    expect(s.activeLeases).toBe(1)
    expect(s.upcomingLeases).toBe(1)
    expect(s.expiringLeases).toBe(1) // L2 ends 12-31: 96 days → 90d touchpoint; L1 (not started) excluded
    expect(s.renewal).toEqual({ d90: 1, d60: 0, d30: 0 })
    expect(s.pendingApps).toBe(1) // archived one excluded
    expect(s.openTickets).toBe(1)
    expect(s.rentMonth).toEqual({ expected: 2500, collected: 2000 })
  })
  it('agent: follow-ups = missing paperwork or quiet 7+ days; commission unsettled', () => {
    const s = agentStats({ profile: { status: 'verified', expires_at: null }, pending: 0, clients: [
      { id: '1', name: 'A', stage: 'searching', representation_agreement_at: '2026-09-01', info_guide_given_at: '2026-09-01', last_contact_at: '2026-09-25T00:00:00Z', updated_at: null },
      { id: '2', name: 'B', stage: 'showing', representation_agreement_at: null, info_guide_given_at: '2026-09-01', last_contact_at: '2026-09-25T00:00:00Z', updated_at: null },
      { id: '3', name: 'C', stage: 'applied', representation_agreement_at: '2026-09-01', info_guide_given_at: '2026-09-01', last_contact_at: '2026-09-01T00:00:00Z', updated_at: null },
      { id: '4', name: 'D', stage: 'closed', representation_agreement_at: null, info_guide_given_at: null, last_contact_at: null, updated_at: null },
    ], commission: [{ fee_amount: 100, stripe_transfer_id: null }, { fee_amount: 50, stripe_transfer_id: 'tr_1' }] }, T)
    expect(s.activeClients).toBe(3)
    expect(s.clientsToFollowUp).toBe(2)
    expect(s.unsettled).toEqual({ count: 1, amount: 100 })
  })
})

describe('every workspace surface reads the one facts source', () => {
  const NO_DIRECT = /from\('(lease_documents|maintenance_tickets|rent_payments|applications|applicant_applications|households|household_members|showing_intents|agent_clients|commission|tenants)'\)/
  for (const f of ['components/agent/StatusOverview.tsx', 'components/landlord/LiveMaintenanceBoard.tsx', 'components/tenant/MyRent.tsx', 'components/tenant/MyApplications.tsx', 'lib/lifecycle/useLifecycle.ts', 'lib/facts/toLifecycle.ts', 'lib/facts/stats.ts']) {
    it(`${f} has no direct table query`, () => {
      const s = read(f)
      expect(s).not.toMatch(NO_DIRECT)
      expect(s).toMatch(/useFacts|facts/)
    })
  }
  it('the RPCs return the fields those surfaces need and stay SECURITY INVOKER / no anon', () => {
    const sql = read('supabase/migrations/20260926_facts_v2.sql')
    expect(sql.match(/security invoker/g)?.length).toBe(3)
    expect(sql).not.toMatch(/security definer/)
    for (const fn of ['lifecycle_facts_landlord', 'lifecycle_facts_tenant', 'lifecycle_facts_agent']) expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon`))
    expect(sql).toContain("'rent_all'")
    expect(sql).toContain("'rent_month'")
    expect(sql).toContain("'member_roles'")
    expect(sql).toMatch(/or tenant_id in \(select id from t\)/) // tenant leases by e-mail OR tenants row
    expect(sql).toMatch(/role in \('landlord','property_manager'\)/) // the board's household route is part of the landlord facts
    expect(sql).not.toMatch(/ai_score/)
  })
  it('the lease page, the tiles and the proactive scans agree on "in force"', () => {
    expect(read('app/landlord/leases/page.tsx')).toContain('leaseDisplayState(row)')
    expect(read('app/landlord/leases/page.tsx')).toContain("upcoming: { tone: 'info', label: 'SIGNED · UPCOMING' }")
    const pro = read('app/api/agent/proactive/route.ts')
    expect(pro.match(/start_date\.is\.null,start_date\.lte\./g)?.length).toBe(3)
  })
})

describe('/listings: no stored "match", one count with an explanation', () => {
  const page = read('app/listings/page.tsx')
  it('the design-sample columns are neither selected nor rendered nor used for sorting', () => {
    expect(page).not.toMatch(/match_score,|luna_note|badge=\{l\.badge\}|PromoBadge/)
    expect(page).not.toMatch(/b\.match_score \?\? -1/)
    expect(read('app/listings/[slug]/page.tsx')).not.toMatch(/% 匹配|PromoBadge/)
  })
  it('the results bar says how the visible count relates to the total', () => {
    expect(page).toContain('data-testid="listing-count-note"')
    expect(page).toContain('只计地图范围内')
  })
})

describe('hard constraints: message > memory; the model can only tighten', () => {
  const mem = (key: string, value: unknown) => ({ key, label: key, value, confidence: 1, memory_type: 'preference' })
  it('parses budgets, bedrooms and pets from Chinese and English', () => {
    expect(budgetFromText('预算 2,800 左右，两居室')).toBe(2800)
    expect(budgetFromText('under $2,500 a month please')).toBe(2500)
    expect(budgetFromText('3000以内 两房')).toBe(3000)
    expect(budgetFromText('找个一居室')).toBeNull()
    expect(bedsFromText('两居室')).toBe(2)
    expect(bedsFromText('a 1 bedroom near TMU')).toBe(1)
    expect(bedsFromText('studio 就行')).toBe(0)
    expect(petsFromText('我养了一只猫')).toBe(true)
    expect(petsFromText('no pets')).toBe(false)
  })
  it('a remembered budget applies when the model left max_price empty', () => {
    const r = applyHardConstraints('TMU 附近再找几套', [mem('budget', 2800)], { max_price: null, min_beds: 2, pets: null })
    expect(r.search.max_price).toBe(2800)
    expect(r.constraints.from_memory).toEqual(['max_price'])
    expect(budgetFromMemories([mem('租金预算', '每月 $2,400 以内')])).toBe(2400)
  })
  it('this message wins over memory, and the model cannot loosen a stated cap', () => {
    expect(applyHardConstraints('预算改成 3500', [mem('budget', 2800)], { max_price: 5000 }).search.max_price).toBe(3500)
    expect(applyHardConstraints('预算 2800', [], { max_price: 2600 }).search.max_price).toBe(2600) // tighter model value stays
    expect(applyHardConstraints('预算不限，找 house', [mem('budget', 2800)], { max_price: null }).search.max_price).toBeNull()
    expect(applyHardConstraints('随便看看', [mem('bedrooms', 2)], { max_price: null }).search.min_beds).toBe(2)
  })
  it('the note names the filters, their origin and what the cap removed', () => {
    const { constraints } = applyHardConstraints('再找几套', [mem('budget', 2800)], { max_price: null, min_beds: 2 })
    const note = constraintsNote(constraints, true, 3)
    expect(note).toContain('预算 ≤ $2,800')
    expect(note).toContain('2 房以上')
    expect(note).toContain('预算来自你之前告诉我的')
    expect(note).toContain('另有 3 套超预算未列')
    expect(constraintsNote({ max_price: null, min_beds: null, pets: null, from_memory: [], no_budget_limit: true }, true, 0)).toBe('')
  })
  it('the turn route applies it for tenant residential searches and appends the note', () => {
    const r = read('app/api/agent/turn/route.ts')
    expect(r).toContain("applyHardConstraints(message, memories, {")
    expect(r).toContain('max_price: hc ? hc.search.max_price ?? null :')
    expect(r).toContain('constraintsNote(hc.constraints')
    expect(read('lib/agent/listingSearch.ts')).toContain('overBudget')
  })
})

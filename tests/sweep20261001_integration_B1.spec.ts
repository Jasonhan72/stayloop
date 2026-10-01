// Sweep 2026-10-01 · integration B1 — renewal leases across the planner, the
// executor, the e-sign route and the household hub.
//   1. The execute route's renewal blocker uses the planner's own rule
//      (renewalSkipReason → successorLease + latestIntentFor), so a card the
//      proactive sweep proposes is never refused for a different reason, and
//      the other way round. Imported leases are leases like any other.
//   2. A fully signed renewal that starts later waits in households.next_lease_id
//      (the running term keeps its lease, end date and rent periods);
//      promote_household_leases() switches it on its start date.
//   3. The first-month placeholder sits on the first scheduled due date on/after
//      the start; a unique violation from rent_payments (lease_id, due_date) is ignored.
//   4. The hub offers the importer 「更正导入信息」 on an unconfirmed import.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renewalSkipReason, SUCCESSOR_STATUSES, type LeaseSlot, type RenewalIntent } from '@/lib/agent/renewalStages'
import { leaseAttachSlot } from '@/lib/lease/householdMatch'
import { firstDueDate, rentDueDay, rentLedger } from '@/lib/household/ledger'
import { rentSchedule } from '@/lib/household/schedule'

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  user: { id: 'u-landlord', email: 'll@example.com', is_anonymous: false } as Row,
  authUsers: {} as Record<string, Row>,
  makeClient: null as null | (() => unknown),
  sendEmail: vi.fn(),
  rentInsertError: null as null | { code: string; message: string },
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.makeClient!() }))
vi.mock('@/lib/rateLimit', () => ({ underHourlyLimit: async () => true }))
vi.mock('@/lib/push/notify', () => ({ notifyUser: async () => undefined }))
vi.mock('@/lib/matters/server', () => ({ matterOfRef: async () => null }))
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: (...a: unknown[]) => h.sendEmail(...a) }))
vi.mock('@/lib/marketplace/server', () => ({ createWorkOrder: vi.fn(), actOnWorkOrder: vi.fn(), suggestDispatch: vi.fn() }))
vi.mock('@/lib/threads/server', () => ({
  ensureThread: async (_a: unknown, kind: string, ref: string) => ({ id: `th-${kind}-${ref}`, kind, ref_id: ref, household_id: null, title: null }),
  ensureListingThread: async () => ({ id: 'th-l', kind: 'listing_inquiry', ref_id: 'x', household_id: null, title: null }),
  postSystemMessage: async () => 101,
  notifyThreadParties: async () => ({ pushed: 0, emailed: 0 }),
  replyTokenFor: async () => 'tok',
  displayNameFor: async () => 'Sarah',
}))

// ── in-memory PostgREST-ish fake (same shape as the A1 harness) ─────────────
class Q {
  op: 'select' | 'update' | 'insert' = 'select'
  payload: any = null
  filters: ((r: Row) => boolean)[] = []
  ret = false
  cols = '*'
  orderBy: { col: string; asc: boolean } | null = null
  lim: number | null = null
  mode: 'many' | 'maybe' | 'single' = 'many'
  constructor(public t: string) {}
  select(cols = '*') { if (this.op === 'select') this.cols = cols; else this.ret = true; return this }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this }
  update(p: any) { this.op = 'update'; this.payload = p; return this }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this }
  in(c: string, arr: unknown[]) { this.filters.push((r) => arr.includes(r[c])); return this }
  is(c: string, v: unknown) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this }
  not(c: string, op: string) { if (op === 'is') this.filters.push((r) => r[c] != null); return this }
  or(expr: string) {
    const preds = expr.split(',').map((p) => { const [c, , ...rest] = p.split('.'); const v = rest.join('.'); return (r: Row) => String(r[c]) === v })
    this.filters.push((r) => preds.some((f) => f(r)))
    return this
  }
  contains(c: string, obj: Row) { this.filters.push((r) => Object.entries(obj).every(([k, v]) => JSON.stringify(r[c]?.[k]) === JSON.stringify(v))); return this }
  ilike(c: string, pat: string) { const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i'); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this }
  order(c: string, o?: { ascending?: boolean }) { this.orderBy = { col: c, asc: o?.ascending !== false }; return this }
  limit(n: number) { this.lim = n; return this }
  maybeSingle() { this.mode = 'maybe'; return this }
  single() { this.mode = 'single'; return this }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(this.run()).then(res, rej) }
  private table() { return (h.db[this.t] ??= []) }
  private shape(rows: Row[]) {
    if (this.mode === 'many') return { data: rows, error: null }
    if (this.mode === 'single' && !rows.length) return { data: null, error: { message: 'no rows' } }
    return { data: rows[0] ?? null, error: null }
  }
  run() {
    const t = this.table()
    if (this.op === 'insert') {
      if (this.t === 'rent_payments' && h.rentInsertError) return { data: null, error: h.rentInsertError }
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }))
      t.push(...list)
      return this.ret ? this.shape(list.map((r: Row) => ({ ...r }))) : { data: null, error: null }
    }
    let rows = t.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === 'update') {
      for (const r of rows) Object.assign(r, this.payload)
      return this.ret ? this.shape(rows.map((r) => ({ ...r }))) : { data: null, error: null }
    }
    if (this.orderBy) { const { col, asc } = this.orderBy; rows = [...rows].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : String(a[col] ?? '') > String(b[col] ?? '') ? 1 : 0) * (asc ? 1 : -1)) }
    if (this.lim != null) rows = rows.slice(0, this.lim)
    return this.shape(rows.map((r) => ({ ...r })))
  }
}
h.makeClient = () => ({
  from: (t: string) => new Q(t),
  rpc: async () => ({ data: null, error: null }),
  auth: {
    getUser: async () => ({ data: { user: h.user }, error: null }),
    admin: { getUserById: async (id: string) => ({ data: { user: h.authUsers[id] ?? null } }) },
  },
})

// ── fixtures ────────────────────────────────────────────────────────────────
const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'
const LST = '99999999-9999-4999-8999-999999999999'
const LST2 = '98999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-10-01T16:00:00Z') // 12:00 in Toronto
const TERMS = (extra: Row = {}) => ({ landlord_legal_name: 'Sarah Wang', rent: { amount: 2853.2, due_day: 1 }, premises: { street: '100 King St W', unit: '1207', city: 'Toronto' }, ...extra })

function seed() {
  h.db = {
    landlords: [{ id: 'llrow1', auth_id: 'u-landlord', email: 'll@example.com' }],
    tenants: [],
    lease_documents: [{ id: L1, landlord_id: 'llrow1', tenant_email: 'mia@example.com', tenant_name: 'Mia Chen', unit_label: 'Unit 1207', monthly_rent: 2800, start_date: '2025-12-01', end_date: '2026-11-30', status: 'active', listing_id: LST, created_at: '2025-11-01T00:00:00Z' }],
    households: [{ id: 'hh1', current_lease_id: L1, next_lease_id: null, verified: true, status: 'active', source: 'esign', address: '100 King St W', unit: '1207', city: 'Toronto', monthly_rent: 2800, rent_due_day: 1, start_date: '2025-12-01', end_date: '2026-11-30', created_by: 'u-landlord', created_at: '2025-12-01T00:00:00Z' }],
    household_members: [
      { household_id: 'hh1', user_id: 'u-tenant', role: 'tenant', status: 'active' },
      { household_id: 'hh1', user_id: 'u-landlord', role: 'landlord', status: 'active' },
    ],
    household_invites: [{ household_id: 'hh1', invited_email: 'mia@example.com', invited_role: 'tenant', accepted_at: '2025-12-02T00:00:00Z', expires_at: '2025-12-15T00:00:00Z', declined_at: null, revoked_at: null }],
    task_memories: [{ id: 'tm-l', user_id: 'u-landlord', role: 'landlord', status: 'active', completed_steps: [] }],
    agent_pending_actions: [],
    agent_audit_events: [],
    renewal_intents: [],
    rent_payments: [],
  }
  h.authUsers = { 'u-landlord': { id: 'u-landlord', email: 'll@example.com' }, 'u-tenant': { id: 'u-tenant', email: 'mia@example.com' } }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seed()
  h.user = { id: 'u-landlord', email: 'll@example.com', is_anonymous: false }
  h.rentInsertError = null
  h.sendEmail.mockReset().mockResolvedValue({ ok: true, id: 'em_1' })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

let seq = 0
function card(p: Row): Row {
  const row = { id: `bbbbbbbb-0000-4000-8000-${String(++seq).padStart(12, '0')}`, user_id: 'u-landlord', role: 'landlord', title: 't', summary: 's', recipient_label: null, status: 'approved', executed_at: null, execution_result: null, created_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(), decided_at: new Date(NOW.getTime() - 60_000).toISOString(), expires_at: null, metadata: {}, ...p }
  h.db.agent_pending_actions.push(row)
  return row
}
async function exec(actionId: string, extra: Row = {}) {
  const { POST } = await import('@/app/api/agent/execute/route')
  const res = await POST(new Request('http://x/api/agent/execute', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ action_id: actionId, ...extra }) }))
  return { status: res.status, json: (await res.json()) as Row }
}
async function sign(body: Row) {
  const { POST } = await import('@/app/api/lease/sign/route')
  const res = await POST(new Request('http://x/api/lease/sign', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) }))
  return { status: res.status, json: (await res.json()) as Row }
}

/** What the proactive planner decides for L1 from the same rows (its successor load: SUCCESSOR_STATUSES, not over). */
function plannerReason(): string | null {
  const today = '2026-10-01'
  const lease = h.db.lease_documents.find((l) => l.id === L1)!
  const later = h.db.lease_documents.filter((l) => l.id !== L1 && (SUCCESSOR_STATUSES as readonly string[]).includes(l.status) && (!l.end_date || l.end_date >= today)) as LeaseSlot[]
  return renewalSkipReason({ ...lease, household_id: 'hh1' } as never, { laterLeases: later, intents: h.db.renewal_intents as RenewalIntent[] })
}

// ─────────────────────────────────────────────────────────────────────────────
describe('1 · the executor and the planner agree on a moot renewal', () => {
  const letter = () => card({ action_type: 'send_renewal_letter', metadata: { lease_id: L1, stage: '90d' } })
  const successor = (p: Row) => h.db.lease_documents.push({ id: L2, landlord_id: 'llrow1', tenant_email: 'mia@example.com', unit_label: 'Unit 1207', listing_id: LST, start_date: '2026-12-01', end_date: '2027-11-30', status: 'signed_both', ...p })

  it('a signed successor on the same unit (any SUCCESSOR_STATUSES, incl. imported) → lease_superseded on both sides', async () => {
    for (const status of ['signed_tenant', 'signed_both', 'active', 'imported']) {
      seed(); successor({ status })
      expect(plannerReason()).toBe('lease_superseded')
      const c = letter()
      expect((await exec(c.id, { option: 'A' })).json).toMatchObject({ reason: 'lease_superseded', expired: true })
    }
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('a successor only sent for signing does not supersede — the planner proposes, the executor sends', async () => {
    successor({ status: 'sent' })
    expect(plannerReason()).toBeNull()
    const r = await exec(letter().id, { option: 'A' })
    expect(r.json.executed).toBe(true)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('a lease for the same tenant on another unit is not a renewal of this one', async () => {
    successor({ listing_id: LST2, unit_label: 'Unit 801' })
    expect(plannerReason()).toBeNull()
    expect((await exec(letter().id, { option: 'A' })).json.executed).toBe(true)
  })

  it('a successor already over is not loaded by either side', async () => {
    successor({ start_date: '2026-01-15', end_date: '2026-09-01' })
    expect(plannerReason()).toBeNull()
    expect((await exec(letter().id, { option: 'A' })).json.executed).toBe(true)
  })

  it('another landlord row’s lease on the "same" unit label is not this landlord’s successor', async () => {
    h.db.landlords.push({ id: 'llrow2', auth_id: 'u-other', email: 'o@example.com' })
    successor({ landlord_id: 'llrow2' })
    expect((await exec(letter().id, { option: 'A' })).json.executed).toBe(true)
  })

  it('a household-level "leave" (no lease id) counts for the lease the household runs on', async () => {
    h.db.renewal_intents.push({ household_id: 'hh1', lease_id: null, intent: 'renew', created_at: '2026-09-01T00:00:00Z' }, { household_id: 'hh1', lease_id: null, intent: 'leave', created_at: '2026-09-20T00:00:00Z' })
    expect((await exec(letter().id, { option: 'A' })).json).toMatchObject({ reason: 'tenant_leaving', expired: true })
    // A later "renew" on the lease itself wins (newest answer).
    seed()
    h.db.renewal_intents.push({ household_id: 'hh1', lease_id: null, intent: 'leave', created_at: '2026-09-01T00:00:00Z' }, { household_id: 'hh1', lease_id: L1, intent: 'renew', created_at: '2026-09-20T00:00:00Z' })
    expect((await exec(letter().id, { option: 'A' })).json.executed).toBe(true)
  })

  it('the 30-day intent ask uses the same blocker', async () => {
    successor({ status: 'signed_tenant' })
    const c = card({ action_type: 'send_message', metadata: { lease_id: L1, stage: '30d', subject: 'Renewal intent', body: 'Are you staying?' } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'lease_superseded', expired: true })
  })

  it('an imported lease gets its renewal letter like any other', async () => {
    h.db.lease_documents[0].status = 'imported'
    const r = await exec(letter().id, { option: 'A' })
    expect(r.json.executed).toBe(true)
    expect(h.sendEmail.mock.calls[0][0].to).toBe('mia@example.com')
  })

  it('wiring: the route imports the planner rule and no longer keeps its own', () => {
    const s = readFileSync('app/api/agent/execute/route.ts', 'utf8')
    expect(s).toContain("import { SUCCESSOR_STATUSES, latestIntentFor, renewalSkipReason, type LeaseSlot, type RenewalIntent } from '@/lib/agent/renewalStages'")
    expect(s).toContain('.in(\'status\', [...SUCCESSOR_STATUSES])')
    expect(s).toContain('blocked: renewalSkipReason(slot, { laterLeases, intents }), intent: latestIntentFor(slot, intents)')
    expect(s).not.toContain("['sent', 'signed_tenant', 'signed_both', 'active', 'imported']")
    expect(s).not.toMatch(/const sameText =/)
    // The tenant's landlord can be found through an imported lease too.
    expect(s).toContain("['signed_both', 'active', 'imported', 'sent', 'signed_tenant']")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('2/3 · e-sign: a renewal waits for its start date; the placeholder is on the schedule', () => {
  function renewal(p: Row = {}) {
    h.db.lease_documents.push({ id: L2, landlord_id: 'llrow1', tenant_email: 'mia@example.com', tenant_name: 'Mia Chen', unit_label: 'Unit 1207', listing_id: LST, monthly_rent: 2853.2, start_date: '2026-12-01', end_date: '2027-11-30', status: 'signed_tenant', terms: TERMS(), sign_token: 'tok2', tenant_signature: { name: 'Mia Chen' }, landlord_signature: null, signed_at: null, created_at: '2026-09-25T00:00:00Z', ...p })
  }
  const hh = () => h.db.households.find((x) => x.id === 'hh1')!
  const audit = (action: string) => h.db.agent_audit_events.find((e) => e.action === action)

  it('a renewal starting after today goes to next_lease_id; the running term keeps its lease, end date and rent', async () => {
    renewal()
    const r = await sign({ lease_id: L2, name: 'Sarah Wang' })
    expect(r.json).toMatchObject({ ok: true, fully_executed: true })
    expect(hh()).toMatchObject({ current_lease_id: L1, next_lease_id: L2, end_date: '2026-11-30', monthly_rent: 2800, verified: true })
    expect(h.db.households).toHaveLength(1)
    // Review 2026-10-01: the new term's first period is written when it is promoted, not at signing —
    // the hub does not show its ledger yet, so a 'due' row now only fed the facts / rail.
    expect(h.db.rent_payments).toEqual([])
    expect(audit('household_lease_attached_from_esign')!.metadata).toMatchObject({ lease_id: L2, previous_lease_id: L1, slot: 'next', starts_on: '2026-12-01' })
  })

  it('a lease starting today (Toronto) becomes current at once, as before', async () => {
    renewal({ start_date: '2026-10-01', end_date: '2027-09-30' })
    await sign({ lease_id: L2, name: 'Sarah Wang' })
    expect(hh()).toMatchObject({ current_lease_id: L2, end_date: '2027-09-30', monthly_rent: 2853.2, start_date: '2025-12-01' })
    // The term it replaced stays reachable for its unrecorded periods (review 2026-10-01).
    expect(hh().previous_lease_id).toBe(L1)
    expect(hh().next_lease_id).toBeNull()
    expect(audit('household_lease_attached_from_esign')!.metadata.slot).toBe('current')
  })

  it('"today" is the Toronto date: 02:00 UTC on Dec 1 is still Nov 30 in Toronto', async () => {
    vi.setSystemTime(new Date('2026-12-01T02:00:00Z'))
    renewal()
    await sign({ lease_id: L2, name: 'Sarah Wang' })
    expect(hh()).toMatchObject({ current_lease_id: L1, next_lease_id: L2 })
  })

  it('a lease already waiting in next_lease_id is not attached twice', async () => {
    renewal()
    hh().next_lease_id = L2
    await sign({ lease_id: L2, name: 'Sarah Wang' })
    expect(audit('household_lease_attached_from_esign')).toBeUndefined()
    expect(h.db.households).toHaveLength(1)
  })

  it('a new tenancy on a mid-month start: the placeholder is the first due date on/after the start', async () => {
    h.db.households = []
    h.db.household_members = []
    h.db.household_invites = []
    renewal({ start_date: '2026-11-15', end_date: '2027-11-14', terms: TERMS({ rent: { amount: 2853.2 } }) })
    await sign({ lease_id: L2, name: 'Sarah Wang' })
    const created = h.db.households[0]
    expect(created).toMatchObject({ current_lease_id: L2, rent_due_day: 1, source: 'esign' })
    expect(h.db.rent_payments.map((p) => p.due_date)).toEqual(['2026-12-01'])
    // …which is a real period on the hub's schedule (it used to sit off it, on 11-15).
    const ledger = rentLedger(rentSchedule('2026-11-15', 1, new Date('2026-12-05T12:00:00Z')), h.db.rent_payments as never, new Date('2026-12-05T12:00:00Z'))
    expect(ledger.periods.find((p) => p.due === '2026-12-01')).toMatchObject({ onSchedule: true, canMarkPaid: true })
  })

  it('the due day comes from the terms', async () => {
    h.db.households = []
    renewal({ start_date: '2026-11-15', end_date: '2027-11-14', terms: TERMS({ rent: { amount: 2853.2, due_day: 20 } }) })
    await sign({ lease_id: L2, name: 'Sarah Wang' })
    expect(h.db.households[0].rent_due_day).toBe(20)
    expect(h.db.rent_payments.map((p) => p.due_date)).toEqual(['2026-11-20'])
  })

  it('a unique violation on the placeholder (another writer first) is ignored quietly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    h.rentInsertError = { code: '23505', message: 'duplicate key value violates unique constraint "rent_payments_lease_due_uniq"' }
    // A term that starts today attaches as current and writes its placeholder at signing
    // (a 'next' renewal gets it from promote_household_leases instead).
    renewal({ start_date: '2026-10-01', end_date: '2027-09-30' })
    const r = await sign({ lease_id: L2, name: 'Sarah Wang' })
    expect(r.json.fully_executed).toBe(true)
    expect(hh().current_lease_id).toBe(L2)
    expect(warn).not.toHaveBeenCalled()
    // Any other insert error is still logged.
    seed()
    h.rentInsertError = { code: '42501', message: 'permission denied' }
    renewal({ start_date: '2026-10-01', end_date: '2027-09-30' })
    await sign({ lease_id: L2, name: 'Sarah Wang' })
    expect(warn).toHaveBeenCalledWith('[lease/sign] first rent period insert failed:', 'permission denied')
  })

  it('the running term stays recordable: its remaining periods are still the hub ledger', () => {
    // Before the fix the hub switched to L2 at signing: Oct/Nov of L1 vanished and
    // mark_rent_paid (current_lease_id = p_lease) refused them.
    const s = readFileSync('app/h/[id]/page.tsx', 'utf8')
    expect(s).toContain("async function markPaid(due: string, paidOnDate: string, leaseId: string | null = household?.current_lease_id ?? null)")
    expect(s).toContain("supabase.rpc('mark_rent_paid', { p_lease: leaseId, p_due: due, p_paid_on: paidOnDate })")
    expect(s).toContain("supabase.from('rent_payments').select('*').eq('lease_id', leaseId)")
    expect(s).toContain('data-testid="next-lease"')
    // Periods from the renewal's start belong to the next lease, not the running term's ledger.
    expect(s).toContain('const schedule = rentSchedule(termStart, household.rent_due_day).filter((p) => !nextTermFrom || p.due < nextTermFrom)')
    expect(s).toContain('data-testid="rent-next-term-note"')
    expect(s).toMatch(/续约租约已双方签署 · \$\{nextStart\} 起生效/)
    expect(s).toMatch(/Renewal signed by both · takes effect \$\{nextStart\}/)
  })
})

describe('pure helpers', () => {
  it('leaseAttachSlot: later than today → next; today, earlier or unknown → current', () => {
    expect(leaseAttachSlot('2026-12-01', '2026-10-01')).toBe('next')
    expect(leaseAttachSlot('2026-10-01', '2026-10-01')).toBe('current')
    expect(leaseAttachSlot('2026-09-01', '2026-10-01')).toBe('current')
    expect(leaseAttachSlot(null, '2026-10-01')).toBe('current')
    expect(leaseAttachSlot('soon', '2026-10-01')).toBe('current')
    expect(leaseAttachSlot('2026-12-01T00:00:00Z', '2026-10-01')).toBe('next')
  })
  it('firstDueDate: first scheduled due on/after the start, clamped to short months', () => {
    expect(firstDueDate('2026-12-01', 1)).toBe('2026-12-01')
    expect(firstDueDate('2026-11-15', 1)).toBe('2026-12-01')
    expect(firstDueDate('2026-11-15', 20)).toBe('2026-11-20')
    expect(firstDueDate('2026-11-25', 20)).toBe('2026-12-20')
    expect(firstDueDate('2027-01-31', 30)).toBe('2027-02-28')
    expect(firstDueDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(firstDueDate('2026-11-15', null)).toBe('2026-12-01')
    expect(firstDueDate(null, 1)).toBeNull()
  })
  it('rentDueDay accepts 1–31 whole days only', () => {
    expect(rentDueDay(15)).toBe(15)
    expect(rentDueDay('15')).toBe(15)
    expect(rentDueDay(0)).toBeNull()
    expect(rentDueDay(32)).toBeNull()
    expect(rentDueDay(1.5)).toBeNull()
    expect(rentDueDay('')).toBeNull()
    expect(rentDueDay(undefined)).toBeNull()
  })
})

describe('2 · migration: next_lease_id, the guard and the daily promotion', () => {
  const sql = readFileSync('supabase/migrations/20261001_B_household_next_lease.sql', 'utf8')
  it('adds next_lease_id with an FK that nulls on delete', () => {
    expect(sql).toMatch(/add column if not exists next_lease_id uuid references public\.lease_documents\(id\) on delete set null/)
  })
  it('the household guard freezes next_lease_id for direct client writes (and keeps the old freezes)', () => {
    const g = sql.slice(sql.indexOf('create or replace function public.guard_household_trust_fields()'))
    expect(g).toContain('security invoker')
    expect(g).toContain('if not public.is_direct_client_write() then return new; end if;')
    expect(g).toContain('new.next_lease_id := null;')
    expect(g).toContain('new.next_lease_id := old.next_lease_id;')
    for (const f of ['verified', 'current_lease_id', 'created_by', 'source']) expect(g).toContain(`new.${f} := old.${f};`)
  })
  it('promote_household_leases is a locked definer function on the Toronto date', () => {
    expect(sql).toMatch(/create or replace function public\.promote_household_leases\(\)[\s\S]*security definer\s+set search_path = public/)
    expect(sql).toContain("v_today date := (now() at time zone 'America/Toronto')::date;")
    expect(sql).toMatch(/if r\.start_date is null or r\.start_date > v_today then\s+continue;/)
    expect(sql).toMatch(/set current_lease_id = r\.lease_id,\s+next_lease_id = null,\s+end_date = r\.end_date,/)
    expect(sql).toContain("r.status not in ('signed_both', 'active', 'imported')")
    expect(sql).toContain("'household_lease_promoted'")
    // The due day is parsed in plpgsql, never cast inside the UPDATE.
    expect(sql).toMatch(/if r\.due_day_text ~ '\^\[0-9\]\{1,2\}\$' then\s+v_due := r\.due_day_text::integer;/)
    expect(sql).toContain('revoke all on function public.promote_household_leases() from public, anon, authenticated;')
    expect(sql).toContain('grant execute on function public.promote_household_leases() to service_role;')
  })
  it('a new-term period recorded under the old lease just before the switch moves with the term', () => {
    const body = sql.slice(sql.indexOf('if r.previous_lease_id is not null then'))
    expect(body).toMatch(/delete from public\.rent_payments np\s+using public\.rent_payments op[\s\S]*op\.status in \('paid', 'late'\)[\s\S]*np\.status is distinct from 'paid' and np\.status is distinct from 'late';/)
    expect(body).toMatch(/update public\.rent_payments op\s+set lease_id = r\.lease_id\s+where op\.lease_id = r\.previous_lease_id and op\.due_date >= r\.start_date/)
    expect(body.indexOf('delete from public.rent_payments np')).toBeLessThan(body.indexOf('update public.rent_payments op'))
  })
  it('the cron job is unscheduled before it is scheduled (re-running never duplicates it)', () => {
    const un = sql.indexOf("select cron.unschedule('household-lease-promote') where exists (select 1 from cron.job where jobname = 'household-lease-promote');")
    const sch = sql.indexOf("select cron.schedule('household-lease-promote', '5 5 * * *', 'select public.promote_household_leases()');")
    expect(un).toBeGreaterThan(0)
    expect(sch).toBeGreaterThan(un)
  })
  it('sorts after the A6 migration that creates the (lease_id, due_date) unique index', () => {
    expect('20261001_B_household_next_lease.sql' > '20261001_A6_tenancy_ui_rent_ledger.sql').toBe(true)
    expect(readFileSync('supabase/migrations/20261001_A6_tenancy_ui_rent_ledger.sql', 'utf8')).toContain('create unique index if not exists rent_payments_lease_due_uniq')
  })
})

describe('2 · the sign route reads next_lease_id where it reads current_lease_id', () => {
  const s = readFileSync('app/api/lease/sign/route.ts', 'utf8')
  it('existing-household check, candidate tenants and the attach slot', () => {
    expect(s).toContain(".or(`current_lease_id.eq.${full.id},next_lease_id.eq.${full.id}`)")
    expect(s).toContain("select('id, address, unit, status, current_lease_id, next_lease_id, start_date')")
    expect(s).toContain('const slot = leaseAttachSlot(full.start_date, torontoDate())')
    expect(s).toContain(": { next_lease_id: full.id, verified: true }")
    expect(s).toContain("if (error && error.code !== '23505')")
    expect(s).toContain('const due = firstDueDate(full.start_date, dueDay)')
    expect(s).not.toContain('due_date: full.start_date')
  })
})

describe('4 · the hub links the importer to correct an unconfirmed import', () => {
  const s = readFileSync('app/h/[id]/page.tsx', 'utf8')
  it('only for an unverified imported household, viewed by its creator who is still a member', () => {
    expect(s).toContain("const canCorrectImport = !household.verified && household.source === 'imported' && household.status === 'active' && !!myRole && !!user && household.created_by === user.id && !members.some((m) => m.user_id !== user.id)")
    expect(s).toContain('href={`/leases/import?edit=${household.id}`}')
    expect(s).toContain("{zh ? '更正导入信息' : 'Correct the imported details'}")
    expect(s).toContain('data-testid="hub-correct-import"')
    // The import page handles ?edit= with the same rule.
    const imp = readFileSync('app/leases/import/page.tsx', 'utf8')
    expect(imp).toContain("get('edit')")
    expect(imp).toMatch(/const correctable = \(h: MyHousehold\) => h\.relation === 'member' && h\.is_creator && !h\.verified && h\.source === 'imported' && h\.status === 'active' && !h\.others_joined/)
  })
})

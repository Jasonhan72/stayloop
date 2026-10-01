// Sweep 2026-10-01 · group A1 (execute route, showing-intent, tenant snapshot,
// lease send). The executors are driven end to end against an in-memory
// Supabase fake: every card is re-checked against the rows it is about, a
// spent card is expired with a reason (C2), and only a run that succeeded is
// recorded as a completed step (C1).
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  user: { id: 'u-landlord', email: 'll@example.com', is_anonymous: false } as Row,
  authUsers: {} as Record<string, Row>,
  makeClient: null as null | (() => unknown),
  sendEmail: vi.fn(),
  posted: [] as Row[],
  notified: [] as Row[],
  createWorkOrder: vi.fn(),
  actOnWorkOrder: vi.fn(),
  suggestDispatch: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.makeClient!() }))
vi.mock('@/lib/rateLimit', () => ({ underHourlyLimit: async () => true }))
vi.mock('@/lib/push/notify', () => ({ notifyUser: async () => undefined }))
vi.mock('@/lib/matters/server', () => ({ matterOfRef: async () => null }))
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: (...a: unknown[]) => h.sendEmail(...a) }))
vi.mock('@/lib/marketplace/server', () => ({
  createWorkOrder: (...a: unknown[]) => h.createWorkOrder(...a),
  actOnWorkOrder: (...a: unknown[]) => h.actOnWorkOrder(...a),
  suggestDispatch: (...a: unknown[]) => h.suggestDispatch(...a),
}))
vi.mock('@/lib/threads/server', () => ({
  ensureThread: async (_a: unknown, kind: string, ref: string, o: Row = {}) => ({ id: `th-${kind}-${ref}`, kind, ref_id: ref, household_id: o.householdId ?? null, title: null }),
  ensureListingThread: async (_a: unknown, l: Row, p: string) => ({ id: `th-listing-${l.id}-${p}`, kind: 'listing_inquiry', ref_id: 'x', household_id: null, title: null }),
  postSystemMessage: async (_a: unknown, threadId: string, m: Row) => { h.posted.push({ threadId, ...m }); return 101 },
  notifyThreadParties: async (_a: unknown, t: Row, o: Row) => { h.notified.push({ thread: t.id, ...o }); return { pushed: 1, emailed: 0 } },
  replyTokenFor: async () => 'tok',
  displayNameFor: async () => 'Mia',
}))

// ── in-memory PostgREST-ish fake ────────────────────────────────────────────
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
  not(c: string, op: string, v: unknown) {
    if (op === 'is') this.filters.push((r) => r[c] != null)
    else { const list = String(v).replace(/[()]/g, '').split(','); this.filters.push((r) => !list.includes(r[c])) }
    return this
  }
  or(expr: string) {
    const preds = expr.split(',').map((p) => { const [c, , ...rest] = p.split('.'); const v = rest.join('.'); return (r: Row) => String(r[c]) === v })
    this.filters.push((r) => preds.some((f) => f(r)))
    return this
  }
  contains(c: string, obj: Row) { this.filters.push((r) => Object.entries(obj).every(([k, v]) => JSON.stringify(r[c]?.[k]) === JSON.stringify(v))); return this }
  ilike(c: string, pat: string) { const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i'); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this }
  order(c: string, o?: { ascending?: boolean }) { this.orderBy = { col: c, asc: o?.ascending !== false }; return this }
  limit(n: number) { this.lim = n; return this }
  maybeSingle<T = unknown>() { this.mode = 'maybe'; return this as unknown as Q & PromiseLike<{ data: T }> }
  single() { this.mode = 'single'; return this }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(this.run()).then(res, rej) }
  private table() { return (h.db[this.t] ??= []) }
  private embed(r: Row): Row {
    const out = { ...r }
    for (const m of this.cols.matchAll(/(\w+):(\w+)\(/g)) out[m[1]] = (h.db[m[2]] ?? []).find((x) => x.id === r[`${m[1]}_id`]) ?? null
    return out
  }
  private shape(rows: Row[]) {
    if (this.mode === 'many') return { data: rows, error: null }
    if (this.mode === 'single' && !rows.length) return { data: null, error: { message: 'no rows' } }
    return { data: rows[0] ?? null, error: null }
  }
  run() {
    const t = this.table()
    if (this.op === 'insert') {
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
    return this.shape(rows.map((r) => this.embed(r)))
  }
}
h.makeClient = () => ({
  from: (t: string) => new Q(t),
  rpc: async (fn: string) => (fn === 'claim_tenant' ? { data: (h.db.tenants ?? []).find((t) => t.auth_id === h.user.id) ?? null, error: null } : { data: null, error: null }),
  auth: {
    getUser: async () => ({ data: { user: h.user }, error: null }),
    admin: { getUserById: async (id: string) => ({ data: { user: h.authUsers[id] ?? null } }) },
  },
})

// ── fixtures ────────────────────────────────────────────────────────────────
const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'
const APP = '33333333-3333-4333-8333-333333333333'
const Q1 = '44444444-4444-4444-8444-444444444444'
const V1 = '55555555-5555-4555-8555-555555555555'
const INV = '66666666-6666-4666-8666-666666666666'
const TK = '77777777-7777-4777-8777-777777777777'
const WO = '88888888-8888-4888-8888-888888888888'
const LST = '99999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-10-01T16:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const DAY = 86_400_000

function seed() {
  h.db = {
    landlords: [{ id: 'llrow1', auth_id: 'u-landlord', email: 'll@example.com' }],
    tenants: [{ id: 'ten1', auth_id: 'u-tenant', email: 'mia@example.com', full_name: 'Mia Chen' }],
    lease_documents: [{ id: L1, landlord_id: 'llrow1', tenant_email: 'mia@example.com', tenant_name: 'Mia Chen', unit_label: 'Unit 1207', monthly_rent: 2800, start_date: '2025-12-01', end_date: '2026-11-30', status: 'active', listing_id: LST, created_at: '2025-11-01T00:00:00Z' }],
    listings: [{ id: LST, landlord_id: 'llrow1', address: '100 King St W', unit: '1207', is_active: true, status: 'active' }],
    households: [{ id: 'hh1', current_lease_id: L1, verified: true, status: 'active', address: '100 King St W', unit: '1207', created_at: '2025-12-01T00:00:00Z' }],
    household_members: [
      { household_id: 'hh1', user_id: 'u-tenant', role: 'tenant', status: 'active' },
      { household_id: 'hh1', user_id: 'u-landlord', role: 'landlord', status: 'active' },
    ],
    task_memories: [
      { id: 'tm-l', user_id: 'u-landlord', role: 'landlord', status: 'active', completed_steps: ['intake'] },
      { id: 'tm-t', user_id: 'u-tenant', role: 'tenant', status: 'active', completed_steps: [] },
    ],
    agent_pending_actions: [],
    agent_audit_events: [],
    renewal_intents: [],
    rent_payments: [],
    maintenance_tickets: [],
    work_orders: [],
    threads: [],
    showing_intents: [],
    applications: [],
    household_invites: [],
    compliance_events: [],
  }
  h.authUsers = { 'u-landlord': { id: 'u-landlord', email: 'll@example.com' } }
}

let seq = 0
function card(p: Row): Row {
  const row = { id: `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, '0')}`, user_id: 'u-landlord', role: 'landlord', title: 't', summary: 's', recipient_label: null, status: 'approved', executed_at: null, execution_result: null, created_at: ago(5 * MIN), decided_at: ago(MIN), expires_at: null, metadata: {}, ...p }
  h.db.agent_pending_actions.push(row)
  return row
}
const cardRow = (id: string) => h.db.agent_pending_actions.find((r) => r.id === id)!

async function exec(actionId: string, extra: Row = {}) {
  const { POST } = await import('@/app/api/agent/execute/route')
  const res = await POST(new Request('http://x/api/agent/execute', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ action_id: actionId, ...extra }) }))
  return { status: res.status, json: (await res.json()) as Row }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seed()
  h.user = { id: 'u-landlord', email: 'll@example.com', is_anonymous: false }
  h.posted = []
  h.notified = []
  h.sendEmail.mockReset().mockResolvedValue({ ok: true, id: 'em_1' })
  h.createWorkOrder.mockReset()
  h.actOnWorkOrder.mockReset()
  h.suggestDispatch.mockReset()
})
afterEach(() => { vi.useRealTimers() })

// ─────────────────────────────────────────────────────────────────────────────
describe('C1/C2 · approval vs execution', () => {
  it('a type with no executor is expired on execution (never "approved" forever); preview stays 200 · #2', async () => {
    const c = card({ action_type: 'submit_application' })
    const r = await exec(c.id)
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ executed: false, reason: 'no_executor_for_type', expired: true })
    expect(cardRow(c.id).status).toBe('expired')
    const p = card({ action_type: 'reject_applicant', status: 'pending' })
    const pr = await exec(p.id, { preview: true })
    expect(pr.status).toBe(200)
    expect(pr.json).toEqual({ preview: null, reason: 'no_executor_for_type' })
    // an unrun approval never lands in the prompt's "已完成"
    expect(h.db.task_memories.find((t) => t.id === 'tm-l')!.completed_steps).toEqual(['intake'])
  })

  it('only a successful run appends the action type to completed_steps · #1/#2', async () => {
    const c = card({ action_type: 'renewal_checkpoint', metadata: { lease_id: L1, stage: '60d' } })
    const r = await exec(c.id)
    expect(r.json.executed).toBe(true)
    expect(h.db.task_memories.find((t) => t.id === 'tm-l')!.completed_steps).toEqual(['intake', 'renewal_checkpoint'])
    expect(h.db.task_memories.find((t) => t.id === 'tm-t')!.completed_steps).toEqual([])
  })

  it('an approval that never ran for a week is expired, not run · #1', async () => {
    const c = card({ action_type: 'renewal_checkpoint', decided_at: ago(8 * DAY), created_at: ago(9 * DAY) })
    const r = await exec(c.id)
    expect(r.json).toMatchObject({ reason: 'stale_approval', expired: true })
    expect(cardRow(c.id).status).toBe('expired')
  })

  it('an expired card answers with its stored reason; a failed attempt can be retried · #1', async () => {
    const e = card({ action_type: 'rent_reminder', status: 'expired', execution_result: { ok: false, reason: 'past_due_date' } })
    expect((await exec(e.id)).json).toMatchObject({ executed: false, reason: 'past_due_date', expired: true })
    const retry = card({ action_type: 'send_message', execution_result: { ok: false, reason: 'resend 5xx' }, metadata: { to_email: 'mia@example.com', subject: 'Hi', body: 'Hello' } })
    const r = await exec(retry.id)
    expect(r.json.executed).toBe(true)
    expect(cardRow(retry.id).execution_result.ok).toBe(true)
  })

  it('a refusal that leaves the card valid stamps the reason on the still-approved row', async () => {
    const c = card({ action_type: 'send_message', metadata: { to_email: 'mia@example.com', subject: 'Hi', body: '   ' } })
    const r = await exec(c.id)
    expect(r.status).toBe(422)
    expect(r.json.reason).toBe('message body is empty')
    expect(cardRow(c.id)).toMatchObject({ status: 'approved', executed_at: null, execution_result: { ok: false, reason: 'message body is empty' } })
    expect(h.sendEmail).not.toHaveBeenCalled()
  })
})

describe('#5 · renewal letter re-validates the lease', () => {
  const letter = () => card({ action_type: 'send_renewal_letter', metadata: { lease_id: L1, stage: '90d' } })
  it('lease already ended → expired lease_ended', async () => {
    h.db.lease_documents[0].end_date = '2026-09-15'
    const c = letter()
    expect((await exec(c.id, { option: 'A' })).json).toMatchObject({ reason: 'lease_ended', expired: true })
    expect(h.sendEmail).not.toHaveBeenCalled()
  })
  it('a newer signed lease on the same unit → expired lease_superseded', async () => {
    h.db.lease_documents.push({ id: L2, landlord_id: 'llrow1', unit_label: 'unit 1207', tenant_email: 'mia@example.com', status: 'signed_both', start_date: '2026-12-01', created_at: '2026-09-20T00:00:00Z' })
    const c = letter()
    expect((await exec(c.id, { option: 'A' })).json).toMatchObject({ reason: 'lease_superseded', expired: true })
  })
  it("the tenant's latest intent is to leave → expired tenant_leaving", async () => {
    h.db.renewal_intents.push({ household_id: 'hh1', lease_id: L1, intent: 'renew', created_at: '2026-09-01T00:00:00Z' }, { household_id: 'hh1', lease_id: L1, intent: 'leave', created_at: '2026-09-20T00:00:00Z' })
    const c = letter()
    expect((await exec(c.id, { option: 'A' })).json).toMatchObject({ reason: 'tenant_leaving', expired: true })
  })
  it('option B past the N1 deadline is refused but the card stays valid for option A', async () => {
    const c = letter()
    const b = await exec(c.id, { option: 'B' })
    expect(b.status).toBe(409)
    expect(b.json).toMatchObject({ executed: false, reason: 'past_n1_deadline', n1_deadline: '2026-09-02' })
    expect(b.json.expired).toBeUndefined()
    expect(cardRow(c.id).status).toBe('approved')
    const a = await exec(c.id, { option: 'A' })
    expect(a.json.executed).toBe(true)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
    expect(h.sendEmail.mock.calls[0][0].to).toBe('mia@example.com')
  })
  it('option B before the N1 deadline goes out; preview of a moot card is the preview shape', async () => {
    h.db.lease_documents[0].end_date = '2027-03-31'
    const c = letter()
    expect((await exec(c.id, { option: 'B' })).json.executed).toBe(true)
    h.db.lease_documents[0].status = 'ended'
    const p = card({ action_type: 'send_renewal_letter', status: 'pending', metadata: { lease_id: L1 } })
    const pr = await exec(p.id, { preview: true, option: 'A' })
    expect(pr.status).toBe(409)
    expect(pr.json).toEqual({ preview: null, reason: 'lease_ended', expired: true })
  })
})

describe('#6/#46/#48 · decision notices (C6)', () => {
  beforeEach(() => {
    h.db.applications.push({ id: APP, listing_id: LST, email: 'mia@example.com', first_name: 'Mia', last_name: 'Chen', status: 'new', decision_notified_at: null, decision_reason: null })
  })
  const app = () => h.db.applications[0]
  it('the executor records the decision when the notice goes out', async () => {
    const c = card({ action_type: 'send_decision', metadata: { application_id: APP, decision: 'approved' } })
    expect((await exec(c.id)).json.executed).toBe(true)
    expect(app().status).toBe('approved')
    expect(app().decision_notified_at).toBeTruthy()
  })
  it('a card older than the last notice is spent (already_notified)', async () => {
    app().status = 'declined'
    app().decision_notified_at = ago(MIN)
    const c = card({ action_type: 'send_decision', created_at: ago(10 * MIN), metadata: { application_id: APP, decision: 'approved' } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'already_notified', expired: true })
    expect(app().status).toBe('declined')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })
  it('a card contradicting a recorded decision is spent (decision_changed)', async () => {
    app().status = 'declined'
    const c = card({ action_type: 'send_decision', metadata: { application_id: APP, decision: 'approved' } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'decision_changed', expired: true })
    expect(app().status).toBe('declined')
  })
  it('needs_more never un-decides an application, and an undecided one moves to reviewing without decision_notified_at', async () => {
    app().status = 'approved'
    app().decision_reason = null
    const c = card({ action_type: 'send_decision', metadata: { application_id: APP, decision: 'needs_more', reason: 'void cheque' } })
    expect((await exec(c.id)).json.executed).toBe(true)
    expect(app()).toMatchObject({ status: 'approved', decision_reason: null, decision_notified_at: null })
    app().status = 'new'
    const d = card({ action_type: 'send_decision', metadata: { application_id: APP, decision: 'needs_more', reason: 'pay stub' } })
    expect((await exec(d.id)).json.executed).toBe(true)
    expect(app()).toMatchObject({ status: 'reviewing', decision_notified_at: null, decision_reason: null })
  })
})

describe('#8/#50/#69 · showing / inquiry cards (C7)', () => {
  beforeEach(() => {
    h.db.showing_intents.push(
      { id: Q1, tenant_id: 'ten1', listing_id: LST, kind: 'question', message: 'Are utilities included?', move_in_date: null, status: 'pending', created_at: ago(2 * DAY) },
      { id: V1, tenant_id: 'ten1', listing_id: LST, kind: 'showing', message: '', move_in_date: '2026-11-01', status: 'pending', created_at: ago(DAY) },
    )
  })
  const merged = (p: Row = {}) => card({ action_type: 'listing_inquiry', metadata: { intent_id: Q1, listing_id: LST, tenant_auth_id: 'u-tenant', messages: [{ kind: 'question', intent_id: Q1 }, { kind: 'showing', intent_id: V1 }] }, ...p })
  it('a merged card answers every request: viewing email, question quoted, all intents accepted', async () => {
    const c = merged()
    const r = await exec(c.id)
    expect(r.json.executed).toBe(true)
    const mail = h.sendEmail.mock.calls[0][0]
    expect(mail.subject).toContain('看房请求已确认')
    expect(mail.text).toContain('2026-11-01')
    expect(mail.text).toContain('Are utilities included?')
    expect(h.db.showing_intents.map((i) => i.status)).toEqual(['accepted', 'accepted'])
    expect(r.json.result.intent_ids).toEqual([Q1, V1])
  })
  it('an off-market listing expires the card (listing_inactive), in preview too', async () => {
    h.db.listings[0].is_active = false
    const p = merged({ status: 'pending' })
    const pr = await exec(p.id, { preview: true })
    expect(pr.status).toBe(409)
    expect(pr.json).toEqual({ preview: null, reason: 'listing_inactive', expired: true })
    expect(cardRow(p.id).status).toBe('expired')
    expect(h.db.showing_intents.every((i) => i.status === 'pending')).toBe(true)
  })
})

describe('#10/#32 · repayment-plan card (C5)', () => {
  const plan = () => card({ action_type: 'send_message', metadata: { stage: 'payment_plan', lease_id: L1, household_id: 'hh1', to_email: 'someone-else@example.com', missed_due_dates: ['2026-08-01', '2026-09-01'], installments: 3, first_due: '2026-11-01', arrears_total: 5600, subject: 'Plan', body: 'Arrears $5,600' } })
  it('refuses once a listed period is recorded paid', async () => {
    h.db.rent_payments.push({ lease_id: L1, due_date: '2026-09-01', status: 'late', paid_at: ago(DAY) })
    const c = plan()
    expect((await exec(c.id)).json).toMatchObject({ reason: 'arrears_changed', expired: true })
    expect(cardRow(c.id).execution_result.recorded_due_dates).toEqual(['2026-09-01'])
    expect(h.sendEmail).not.toHaveBeenCalled()
  })
  it('otherwise sends to the lease tenant, never the address on the card', async () => {
    h.db.rent_payments.push({ lease_id: L1, due_date: '2026-08-01', status: 'due', paid_at: null })
    const c = plan()
    expect((await exec(c.id)).json.executed).toBe(true)
    expect(h.sendEmail.mock.calls[0][0].to).toBe('mia@example.com')
  })
})

describe('#56 · invite reminder', () => {
  const reminder = () => card({ action_type: 'send_message', metadata: { stage: 'invite_reminder', invite_id: INV, to_email: 'mia@example.com', subject: 'Please confirm', body: 'Not accepted yet' } })
  it('expires once the invite was accepted, declined or revoked', async () => {
    h.db.household_invites.push({ id: INV, household_id: 'hh1', invited_by: 'u-landlord', invited_email: 'mia@example.com', accepted_at: ago(DAY), declined_at: null, revoked_at: null, expires_at: null })
    const c = reminder()
    expect((await exec(c.id)).json).toMatchObject({ reason: 'invite_closed', expired: true })
    expect(cardRow(c.id).execution_result.invite_state).toBe('accepted')
  })
  it('sends while the invite is open', async () => {
    h.db.household_invites.push({ id: INV, household_id: 'hh1', invited_by: 'u-landlord', invited_email: 'mia@example.com', accepted_at: null, declined_at: null, revoked_at: null, expires_at: new Date(NOW.getTime() + 5 * DAY).toISOString() })
    expect((await exec(reminder().id)).json.executed).toBe(true)
  })
})

describe('#58 · rent reminder', () => {
  const reminder = (due: string) => card({ action_type: 'rent_reminder', metadata: { lease_id: L1, due_date: due } })
  it('past the due date → past_due_date', async () => {
    expect((await exec(reminder('2026-09-01').id)).json).toMatchObject({ reason: 'past_due_date', expired: true })
  })
  it('the period already recorded paid → period_paid; otherwise it sends', async () => {
    h.db.rent_payments.push({ lease_id: L1, due_date: '2026-11-01', status: 'paid', paid_at: ago(DAY) })
    expect((await exec(reminder('2026-11-01').id)).json).toMatchObject({ reason: 'period_paid', expired: true })
    expect((await exec(reminder('2026-10-01').id)).json.executed).toBe(true)
  })
})

describe('#24/#57/#29 · repair requests', () => {
  beforeEach(() => {
    h.user = { id: 'u-tenant', email: 'mia@example.com', is_anonymous: false }
    h.db.maintenance_tickets.push({ id: TK, household_id: 'hh1', title: '厨房水槽漏水', description: null, category: 'plumbing', priority: 'medium', status: 'assigned', created_at: ago(DAY) })
  })
  const request = (meta: Row) => card({ user_id: 'u-tenant', role: 'tenant', action_type: 'maintenance_request', metadata: meta })
  it('the same problem again is added to the open ticket, not a second ticket', async () => {
    const c = request({ title: '厨房水槽还在漏', category: 'plumbing', location: '厨房', entry_permission: 'tenant_present' })
    const r = await exec(c.id)
    expect(r.json.executed).toBe(true)
    expect(r.json.result).toMatchObject({ kind: 'existing_ticket', ticket_id: TK })
    expect(h.db.maintenance_tickets).toHaveLength(1)
    expect(h.suggestDispatch).not.toHaveBeenCalled()
    expect(h.posted[0]).toMatchObject({ threadId: 'th-tenancy-hh1', senderKind: 'tenant' })
    expect(h.posted[0].body).toContain('厨房水槽还在漏')
  })
  it('a new problem becomes a ticket carrying the entry permission (C4)', async () => {
    const c = request({ title: '卫生间灯不亮', category: 'electrical', entry_permission: 'tenant_present' })
    const r = await exec(c.id)
    expect(r.json.result.kind).toBe('ticket')
    const created = h.db.maintenance_tickets.find((t) => t.id === r.json.result.ticket_id)!
    expect(created.entry_permission).toBe('tenant_present')
    expect(h.suggestDispatch).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Review 2026-10-01 · A1', () => {
  const tenant = () => { h.user = { id: 'u-tenant', email: 'mia@example.com', is_anonymous: false } }
  const request = (meta: Row) => card({ user_id: 'u-tenant', role: 'tenant', action_type: 'maintenance_request', metadata: meta })

  it('a flood in the bathroom is not merged into the clogged toilet there (location alone never merges)', async () => {
    const { findOpenDuplicate } = await import('@/lib/agent/userContext')
    const { isEmergencyMaintenance } = await import('@/lib/agent/maintenanceTriage')
    const toilet = [{ id: 't', title: '马桶堵塞', category: 'plumbing', status: 'new', priority: 'medium', description: '马桶冲不下去\n位置：卫生间' }]
    const flood = { title: '卫生间水管爆裂，地面淹水', category: 'plumbing', location: '卫生间' }
    expect(isEmergencyMaintenance(flood)).toBe(true)
    expect(findOpenDuplicate(flood, toilet)).toBeNull()
    expect(findOpenDuplicate({ ...flood, emergency: false }, toilet)).toBeNull()
    expect(findOpenDuplicate({ title: 'No hot water in shower', category: 'plumbing', location: 'Bathroom' }, [{ id: 'x', title: 'Toilet clogged', category: 'plumbing', status: 'new', description: 'Location: Bathroom' }])).toBeNull()
    // An emergency merges only into a near-identical title.
    const burst = [{ id: 'b', title: '卫生间漏水', category: 'plumbing', status: 'new', description: '位置：卫生间' }]
    expect(findOpenDuplicate({ title: '卫生间漏水，地面淹水了', category: 'plumbing', location: '卫生间' }, burst)).toBeNull()
    expect(findOpenDuplicate({ title: '卫生间漏水!', category: 'plumbing', location: '卫生间', emergency: true }, burst)?.id).toBe('b')
  })

  it('end to end: the flood becomes its own high-priority ticket and goes through dispatch', async () => {
    tenant()
    h.db.maintenance_tickets.push({ id: TK, household_id: 'hh1', title: '马桶堵塞', description: '位置：卫生间', category: 'plumbing', priority: 'medium', status: 'new', created_at: ago(DAY) })
    const r = await exec(request({ title: '卫生间水管爆裂，地面淹水', category: 'plumbing', location: '卫生间' }).id)
    expect(r.json.result.kind).toBe('ticket')
    const created = h.db.maintenance_tickets.find((t) => t.id === r.json.result.ticket_id)!
    expect(created.priority).toBe('high')
    expect(h.suggestDispatch).toHaveBeenCalledTimes(1)
    expect(h.db.maintenance_tickets.find((t) => t.id === TK)!.priority).toBe('medium')
  })

  it('an emergency repeat raises the open ticket and re-runs dispatch when nobody is on it yet', async () => {
    tenant()
    h.db.maintenance_tickets.push({ id: TK, household_id: 'hh1', title: '卫生间漏水', description: '位置：卫生间', category: 'plumbing', priority: 'medium', status: 'new', created_at: ago(DAY) })
    const old = card({ status: 'pending', action_type: 'dispatch_work_order', metadata: { ticket_id: TK, provider_id: 'p1' } })
    const r = await exec(request({ title: '卫生间漏水', description: '水漫出来了，地面淹水', category: 'plumbing', location: '卫生间' }).id)
    expect(r.json.result).toMatchObject({ kind: 'existing_ticket', ticket_id: TK, redispatched: true })
    expect(h.db.maintenance_tickets.find((t) => t.id === TK)!.priority).toBe('high')
    expect(cardRow(old.id)).toMatchObject({ status: 'expired', execution_result: { reason: 'superseded' } })
    expect(h.suggestDispatch).toHaveBeenCalledWith(expect.anything(), 'u-landlord', TK)
  })

  it('a repeat with a contractor on the ticket goes to the tenancy conversation (landlord + tenant only), not the work-order thread', async () => {
    tenant()
    h.db.maintenance_tickets.push({ id: TK, household_id: 'hh1', title: '厨房水槽漏水', description: '位置：厨房', category: 'plumbing', priority: 'medium', status: 'assigned', created_at: ago(DAY) })
    h.db.work_orders.push({ id: WO, ticket_id: TK, status: 'scheduled' })
    h.db.threads.push({ id: 'th-wo', kind: 'work_order', ref_id: WO, household_id: 'hh1' })
    const c = request({ title: '厨房水槽还在漏', category: 'plumbing', location: '厨房' })
    const pr = await exec(c.id, { preview: true })
    expect(pr.json.preview.to).toBeNull()
    const r = await exec(c.id)
    expect(r.json.result).toMatchObject({ kind: 'existing_ticket', sent_to: '房东', redispatched: false })
    expect(h.posted.map((p) => p.threadId)).toEqual(['th-tenancy-hh1'])
    expect(h.notified.map((n) => n.thread)).toEqual(['th-tenancy-hh1'])
    expect(h.suggestDispatch).not.toHaveBeenCalled()
  })

  it('a transient 409 from actOnWorkOrder keeps the quote / completion card approved for a retry', async () => {
    h.db.work_orders.push({ id: WO, status: 'quoted', ticket_id: TK, provider_id: 'p1', landlord_auth_id: 'u-landlord' })
    h.actOnWorkOrder.mockResolvedValueOnce({ ok: false, error: 'state changed, retry', status: 409 })
    const c = card({ action_type: 'approve_quote', metadata: { work_order_id: WO, expected_amount: 150 } })
    const r = await exec(c.id)
    expect(r.status).toBe(409)
    expect(r.json.expired).toBeUndefined()
    expect(cardRow(c.id)).toMatchObject({ status: 'approved', executed_at: null })
    h.actOnWorkOrder.mockResolvedValueOnce({ ok: true, wo: { id: WO, status: 'scheduled' } })
    expect((await exec(c.id)).json.executed).toBe(true)
  })

  it('a 409 after the work order moved on (or a gate refusal) expires the card', async () => {
    h.db.work_orders.push({ id: WO, status: 'scheduled', ticket_id: TK, provider_id: 'p1', landlord_auth_id: 'u-landlord' })
    h.actOnWorkOrder.mockResolvedValueOnce({ ok: false, error: 'state changed, retry', status: 409 })
    const c = card({ action_type: 'approve_quote', metadata: { work_order_id: WO } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'work_order_moved_on', expired: true })
    h.db.work_orders[0].status = 'completed'
    h.actOnWorkOrder.mockResolvedValueOnce({ ok: false, error: 'not_from_disputed', status: 409 })
    const d = card({ action_type: 'accept_completion', metadata: { work_order_id: WO } })
    expect((await exec(d.id)).json).toMatchObject({ reason: 'work_order_moved_on', expired: true })
  })

  it('an overdue card is kept on a transient 409 while the offer is still open', async () => {
    h.db.work_orders.push({ id: WO, status: 'offered', ticket_id: TK, provider_id: 'p1', landlord_auth_id: 'u-landlord' })
    h.actOnWorkOrder.mockResolvedValueOnce({ ok: false, error: 'connection reset', status: 409 })
    const c = card({ action_type: 'work_order_overdue', metadata: { work_order_id: WO } })
    const r = await exec(c.id)
    expect(r.json.expired).toBeUndefined()
    expect(cardRow(c.id).status).toBe('approved')
    expect(h.suggestDispatch).not.toHaveBeenCalled()
  })

  it("send_decision: legacy 'rejected' counts as declined, a withdrawn application gets no notice", async () => {
    h.db.applications.push({ id: APP, listing_id: LST, email: 'mia@example.com', first_name: 'Mia', last_name: 'Chen', status: 'rejected', decision_notified_at: null, decision_reason: null })
    const c = card({ action_type: 'send_decision', metadata: { application_id: APP, decision: 'approved' } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'decision_changed', expired: true })
    expect(h.db.applications[0].status).toBe('rejected')
    h.db.applications[0].status = 'withdrawn'
    for (const decision of ['approved', 'declined', 'needs_more']) {
      const d = card({ action_type: 'send_decision', metadata: { application_id: APP, decision } })
      expect((await exec(d.id)).json).toMatchObject({ reason: 'application_withdrawn', expired: true })
    }
    expect(h.db.applications[0].status).toBe('withdrawn')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('expireCard: a card another request already ran reports "already", not "expired"', async () => {
    h.db.applications.push({ id: APP, listing_id: LST, email: 'mia@example.com', first_name: 'Mia', last_name: 'Chen', status: 'approved', decision_notified_at: ago(MIN), decision_reason: null })
    // Request B loaded the row before request A claimed and sent it.
    const c = card({ action_type: 'send_decision', created_at: ago(10 * MIN), metadata: { application_id: APP, decision: 'approved' } })
    const snapshot = { ...cardRow(c.id) }
    Object.assign(cardRow(c.id), { executed_at: ago(MIN / 2), execution_result: { ok: true } })
    const real = h.makeClient!
    let reads = 0
    h.makeClient = () => {
      const cl = real() as { from: (t: string) => any }
      const from = cl.from
      return { ...cl, from: (t: string) => {
        const q = from(t)
        if (t !== 'agent_pending_actions') return q
        const ms = q.maybeSingle.bind(q)
        // The route's first read of the card sees the pre-claim snapshot; later reads see the live row.
        q.maybeSingle = () => (reads++ === 0 ? { then: (res: (v: unknown) => unknown) => Promise.resolve({ data: snapshot, error: null }).then(res) } : ms())
        return q
      } }
    }
    try {
      const r = await exec(c.id)
      expect(r.status).toBe(200)
      expect(r.json).toMatchObject({ executed: true, already: true })
      expect(cardRow(c.id).status).toBe('approved')
    } finally { h.makeClient = real }
  })

  it('preview keeps the executor\'s fields: a B-only N1 refusal says so', async () => {
    const p = card({ action_type: 'send_renewal_letter', status: 'pending', metadata: { lease_id: L1, stage: '90d' } })
    const pr = await exec(p.id, { preview: true, option: 'B' })
    expect(pr.status).toBe(409)
    expect(pr.json).toMatchObject({ preview: null, reason: 'past_n1_deadline', n1_deadline: '2026-09-02', blocks_option: 'B' })
    expect(pr.json.executed).toBeUndefined()
    expect(pr.json.expired).toBeUndefined()
    expect((await exec(p.id, { preview: true, option: 'A' })).json.preview.subject).toBeTruthy()
  })
})

describe('marketplace cards', () => {
  beforeEach(() => { h.db.maintenance_tickets.push({ id: TK, household_id: 'hh1', title: 'Leak', status: 'done', category: 'plumbing' }) })
  it('dispatch for a closed ticket, or with no candidate, is spent', async () => {
    const c = card({ action_type: 'dispatch_work_order', metadata: { ticket_id: TK, provider_id: 'p1' } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'ticket_closed', expired: true })
    const n = card({ action_type: 'dispatch_work_order', metadata: { ticket_id: TK } })
    expect((await exec(n.id)).json).toMatchObject({ reason: 'no_candidate', expired: true })
    expect(h.createWorkOrder).not.toHaveBeenCalled()
  })
  it('a quote card binds to the version it showed; a changed quote expires it', async () => {
    h.actOnWorkOrder.mockResolvedValue({ ok: false, error: 'quote_changed', status: 409 })
    const c = card({ action_type: 'approve_quote', metadata: { work_order_id: WO, expected_amount: 150, quote_version: 2, quoted_at: '2026-09-30T12:00:00Z' } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'quote_changed', expired: true })
    expect(h.actOnWorkOrder.mock.calls[0][1].payload).toEqual({ expected_amount: 150, expected_version: 2, expected_quoted_at: '2026-09-30T12:00:00Z' })
    expect(cardRow(c.id).status).toBe('expired')
  })
  it('an overdue card whose contractor answered is expired before anything is claimed', async () => {
    h.db.work_orders.push({ id: WO, status: 'quoted', ticket_id: TK, provider_id: 'p1', landlord_auth_id: 'u-landlord' })
    const c = card({ action_type: 'work_order_overdue', metadata: { work_order_id: WO } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'work_order_already_answered', expired: true })
    expect(cardRow(c.id).executed_at).toBeNull()
    expect(h.actOnWorkOrder).not.toHaveBeenCalled()
  })
})

describe('send_lease', () => {
  it('a lease sent from the lease page after the card was proposed is not re-sent', async () => {
    Object.assign(h.db.lease_documents[0], { status: 'sent', sent_at: ago(MIN), form_type: 'ontario_standard', terms: { landlord_legal_name: 'A', rent: { amount: 2800 } }, sign_token: 'tok', landlord_signature: null, tenant_signature: null })
    const c = card({ action_type: 'send_lease', created_at: ago(10 * MIN), metadata: { lease_id: L1 } })
    expect((await exec(c.id)).json).toMatchObject({ reason: 'already_notified', expired: true })
  })
  it('preflight refuses ended and non-signable leases', async () => {
    const { leaseSendPreflight } = await import('@/lib/lease/sendLease')
    const base = { id: 'l', landlord_id: 'x', form_type: 'ontario_standard', status: 'draft', terms: { landlord_legal_name: 'A', rent: { amount: 2000 } }, tenant_name: 'Mia', tenant_email: 'mia@example.com', unit_label: 'Unit 1', sign_token: null, landlord_signature: null, tenant_signature: null }
    expect(leaseSendPreflight(base)).toEqual({ ok: true })
    expect(leaseSendPreflight({ ...base, status: 'ended' })).toEqual({ ok: false, status: 409, error: 'lease_ended' })
    expect(leaseSendPreflight({ ...base, status: 'active' })).toEqual({ ok: false, status: 409, error: 'lease_not_sendable' })
    expect(leaseSendPreflight({ ...base, status: 'imported' }).ok).toBe(false)
  })
  it('a failed invitation email puts a draft back to draft', async () => {
    const { sendLeaseInvitation } = await import('@/lib/lease/sendLease')
    const lease = { id: L1, landlord_id: 'llrow1', form_type: 'ontario_standard', status: 'draft', terms: { landlord_legal_name: 'A', rent: { amount: 2800 } }, tenant_name: 'Mia', tenant_email: 'mia@example.com', unit_label: 'Unit 1207', sign_token: null, landlord_signature: null, tenant_signature: null }
    Object.assign(h.db.lease_documents[0], { status: 'draft', sent_at: null })
    h.sendEmail.mockResolvedValue({ ok: false, error: 'resend 503' })
    const r = await sendLeaseInvitation(h.makeClient!() as never, lease, 'u-landlord')
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(h.db.lease_documents[0]).toMatchObject({ status: 'draft', sent_at: null })
  })
})

describe('/api/showing-intent', () => {
  beforeEach(() => { h.user = { id: 'u-tenant', email: 'mia@example.com', is_anonymous: false } })
  async function post(body: Row) {
    const { POST } = await import('@/app/api/showing-intent/route')
    const res = await POST(new Request('http://x/api/showing-intent', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) }))
    return { status: res.status, json: (await res.json()) as Row }
  }
  it('a viewing joining a question card retires it and a fresh showing card carries every intent', async () => {
    const open = card({ status: 'pending', action_type: 'listing_inquiry', title: '房源提问：Mia Chen · 100 King St W #1207', summary: 'Mia Chen 提问：Are utilities included?。…', metadata: { intent_id: Q1, listing_id: LST, tenant_auth_id: 'u-tenant', kind: 'question', message: 'Are utilities included?', move_in_date: null } })
    const r = await post({ listing_id: LST, kind: 'showing', move_in_date: '2026-11-01' })
    expect(r.json).toMatchObject({ ok: true, delivered: true, merged: true })
    // Review 2026-10-01: the question card the landlord may be looking at is never rewritten into a viewing.
    const old = cardRow(open.id)
    expect(old).toMatchObject({ status: 'expired', action_type: 'listing_inquiry', execution_result: { reason: 'superseded' } })
    const row = h.db.agent_pending_actions.find((x) => x.id !== open.id && x.status === 'pending')!
    expect(row.action_type).toBe('showing_request')
    expect(row.metadata.supersedes).toBe(open.id)
    expect(row.metadata.intent_id).toBe(Q1)
    expect(row.title).toBe('看房请求：Mia Chen · 100 King St W #1207')
    expect(row.summary).toContain('批准 = 同意安排看房')
    expect(row.metadata.messages.map((x: Row) => x.kind)).toEqual(['question', 'showing'])
    expect(row.metadata.messages[0].intent_id).toBe(Q1)
    expect(row.metadata.messages[1].intent_id).toBe(r.json.intent_id)
  })
  it('an off-market listing records nothing', async () => {
    h.db.listings[0].is_active = false
    const r = await post({ listing_id: LST, kind: 'showing' })
    expect(r).toMatchObject({ status: 409, json: { error: 'listing_inactive' } })
    expect(h.db.showing_intents).toHaveLength(0)
    expect(h.db.agent_pending_actions).toHaveLength(0)
  })
})

describe('#24/#57 · tenant snapshot and the duplicate matcher', () => {
  it('the snapshot lists open tickets by household, not the dead tenant_id column', () => {
    const src = readFileSync('lib/agent/userContext.ts', 'utf8')
    expect(src).toContain(".from('household_members').select('household_id').eq('user_id', uid).eq('role', 'tenant').eq('status', 'active')")
    expect(src).toContain(".in('household_id', hhIds)")
    expect(src).toContain('不要再提新的报修卡')
  })
  it('findOpenDuplicate', async () => {
    const { findOpenDuplicate, nearIdenticalTitle, ticketLocation } = await import('@/lib/agent/userContext')
    const open = [
      { id: 'a', title: '厨房水槽漏水', category: 'plumbing', status: 'new', description: null },
      { id: 'b', title: 'Bedroom window will not close', category: 'structural', status: 'in_progress', description: '位置：卧室' },
      { id: 'c', title: 'Toilet clogged', category: 'plumbing', status: 'done', description: null },
    ]
    expect(findOpenDuplicate({ title: '厨房水槽漏水', category: 'other' }, open)?.id).toBe('a')
    expect(findOpenDuplicate({ title: '厨房水槽还在漏', category: 'plumbing', location: '厨房' }, open)?.id).toBe('a')
    // Review 2026-10-01: same category + same place is not enough on its own, and no location = near-identical titles only.
    expect(findOpenDuplicate({ title: '厨房水槽还在漏', category: 'plumbing' }, open)).toBeNull()
    expect(findOpenDuplicate({ title: '水龙头一直滴', category: 'plumbing', location: '厨房' }, open)).toBeNull()
    expect(findOpenDuplicate({ title: 'Bedroom window still will not close', category: 'structural', location: '卧室' }, open)?.id).toBe('b')
    expect(findOpenDuplicate({ title: '窗户关不上', category: 'structural', location: '卧室' }, open)).toBeNull()
    expect(findOpenDuplicate({ title: 'Toilet clogged', category: 'plumbing' }, open)).toBeNull()
    expect(findOpenDuplicate({ title: '卫生间灯不亮', category: 'electrical', location: '卫生间' }, open)).toBeNull()
    expect(findOpenDuplicate({ title: '冰箱不制冷', category: 'other' }, open)).toBeNull()
    expect(nearIdenticalTitle('Kitchen sink leaking', 'kitchen sink leaking!')).toBe(true)
    expect(ticketLocation('漏水\n位置：厨房\n进入许可：须租客在场')).toBe('厨房')
  })
})

describe('C1 migration', () => {
  const sql = readFileSync('supabase/migrations/20261001_A1_execute_pending_actions.sql', 'utf8')
  const fn = sql.slice(sql.indexOf('create or replace function public.decide_pending_action'), sql.indexOf('$function$;') + 11)
  it('decided_at, expiry instead of approval, no completed_steps on approval, locked down', () => {
    expect(sql).toContain('add column if not exists decided_at timestamptz')
    expect(fn).toContain("v_act.expires_at is not null and v_act.expires_at < now()")
    expect(fn).toContain("'reason', 'expired'")
    expect(fn).toContain('decided_at = now()')
    expect(fn).not.toContain('completed_steps')
    expect(sql).toContain('revoke all on function public.decide_pending_action(uuid, text, text) from public, anon;')
    expect(sql).toContain('grant execute on function public.decide_pending_action(uuid, text, text) to authenticated, service_role;')
  })
  it('expires cards with no executor and approvals that never ran', () => {
    expect(sql).toContain("'no_executor_for_type'")
    expect(sql).toContain("coalesce(decided_at, created_at) < now() - interval '7 days'")
    for (const t of ['send_renewal_letter', 'send_message', 'maintenance_request', 'rent_reminder', 'renewal_checkpoint', 'relist_prompt', 'dispatch_work_order', 'approve_quote', 'accept_completion', 'work_order_overdue', 'showing_request', 'listing_inquiry', 'send_decision', 'send_lease']) {
      expect(sql).toContain(`'${t}'`)
      expect(readFileSync('app/api/agent/execute/route.ts', 'utf8')).toContain(`case '${t}':`)
    }
  })
})

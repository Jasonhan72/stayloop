// Sweep 2026-10-01 · integration B3 — the follow-up review of the fix pass.
//   1. A lost execution claim is "already done" only when the other run stamped
//      success; otherwise in_flight / the card's new status (never a false ✅).
//   2. Receipts say what really went out: a repair ticket whose email failed, a
//      quote approved without an entry notice, an unnamed enquirer, a needs-more
//      request (not a decision).
//   3. Renewals: a clock-expired letter can be proposed again; a 30-day intent
//      ask is retired once the tenant answered; household-level answers reach
//      the planner; the hub shows the current term's answer only.
//   4. Rent ledger and households: members cannot insert rent rows directly, the
//      household's facts are frozen for direct writes, the replaced term stays
//      recordable, a waiting renewal gets its placeholder on promotion.
//   5. Emergency entry (RTA s.26) comes from the problem, not the priority.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executedText, executionReasonText, quoteApprovedNoNoticeText, tenantCardRecipient, ticketNotEmailedText } from '@/lib/agent/chatCopy'
import { auditActionLabel } from '@/lib/agent/ideas'
import { planRenewalActions, staleRenewalCards, type ExistingRenewalAction } from '@/lib/agent/renewalStages'
import { isDecidedStatus, noticeControls, noticeReasonText } from '@/app/landlord/applicants/noticeState'

type Row = Record<string, any>
const read = (p: string) => readFileSync(p, 'utf8')

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  user: { id: 'u-landlord', email: 'll@example.com', is_anonymous: false } as Row,
  authUsers: {} as Record<string, Row>,
  makeClient: null as null | (() => unknown),
  sendEmail: vi.fn(),
  actOnWorkOrder: vi.fn(),
  /** Return an error for an insert into this table whose payload has this key. */
  insertError: null as null | { table: string; key: string; message: string },
  /** Rows returned by the route's FIRST read of agent_pending_actions (the pre-claim snapshot). */
  snapshot: null as null | Row,
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.makeClient!() }))
vi.mock('@/lib/rateLimit', () => ({ underHourlyLimit: async () => true }))
vi.mock('@/lib/push/notify', () => ({ notifyUser: async () => 0 }))
vi.mock('@/lib/matters/server', () => ({ matterOfRef: async () => null }))
vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: (...a: unknown[]) => h.sendEmail(...a) }))
vi.mock('@/lib/marketplace/server', () => ({
  createWorkOrder: vi.fn(),
  actOnWorkOrder: (...a: unknown[]) => h.actOnWorkOrder(...a),
  suggestDispatch: vi.fn(async () => undefined),
}))
vi.mock('@/lib/threads/server', () => ({
  ensureThread: async (_a: unknown, kind: string, ref: string, o: Row = {}) => ({ id: `th-${kind}-${ref}`, kind, ref_id: ref, household_id: o.householdId ?? null, title: null }),
  ensureListingThread: async (_a: unknown, l: Row, p: string) => ({ id: `th-listing-${l.id}-${p}`, kind: 'listing_inquiry', ref_id: 'x', household_id: null, title: null }),
  postSystemMessage: async () => 101,
  notifyThreadParties: async () => ({ pushed: 1, emailed: 0 }),
  replyTokenFor: async () => 'tok',
  displayNameFor: async () => 'Mia',
}))

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
      const e = h.insertError
      if (e && e.table === this.t && this.payload && e.key in this.payload) return { data: null, error: { message: e.message, code: 'PGRST204' } }
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...p }))
      t.push(...list)
      return this.ret ? this.shape(list.map((r: Row) => ({ ...r }))) : { data: null, error: null }
    }
    if (this.t === 'agent_pending_actions' && this.op === 'select' && this.mode === 'maybe' && h.snapshot) {
      const s = h.snapshot
      h.snapshot = null
      return { data: { ...s }, error: null }
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

const L1 = '11111111-1111-4111-8111-111111111111'
const HH = '22222222-2222-4222-8222-222222222222'
const WO = '88888888-8888-4888-8888-888888888888'
const LST = '99999999-9999-4999-8999-999999999999'
const INT = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-10-01T16:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000

function seed() {
  h.db = {
    landlords: [{ id: 'llrow1', auth_id: 'u-landlord', email: 'll@example.com' }],
    tenants: [{ id: 'ten1', auth_id: 'u-tenant', email: 'mia@example.com', full_name: null }],
    lease_documents: [{ id: L1, landlord_id: 'llrow1', tenant_email: 'mia@example.com', tenant_name: 'Mia Chen', unit_label: 'Unit 1207', monthly_rent: 2800, start_date: '2025-12-01', end_date: '2026-10-30', status: 'active', listing_id: LST, created_at: '2025-11-01T00:00:00Z' }],
    listings: [{ id: LST, landlord_id: 'llrow1', address: '100 King St W', unit: '1207', is_active: true, status: 'active' }],
    households: [{ id: HH, current_lease_id: L1, previous_lease_id: null, verified: true, status: 'active', address: '100 King St W', unit: '1207', created_at: '2025-12-01T00:00:00Z' }],
    household_members: [
      { household_id: HH, user_id: 'u-tenant', role: 'tenant', status: 'active' },
      { household_id: HH, user_id: 'u-landlord', role: 'landlord', status: 'active' },
    ],
    task_memories: [], agent_pending_actions: [], agent_audit_events: [], renewal_intents: [], rent_payments: [],
    maintenance_tickets: [], work_orders: [], showing_intents: [], applications: [], household_invites: [], compliance_events: [],
  }
  h.authUsers = { 'u-landlord': { id: 'u-landlord', email: 'll@example.com' }, 'u-tenant': { id: 'u-tenant', email: 'mia@example.com' } }
}

let seq = 0
function card(p: Row): Row {
  const row = { id: `bbbbbbbb-0000-4000-8000-${String(++seq).padStart(12, '0')}`, user_id: 'u-landlord', role: 'landlord', title: 't', summary: 's', recipient_label: null, status: 'approved', executed_at: null, execution_result: null, created_at: ago(5 * MIN), decided_at: ago(MIN), expires_at: null, metadata: {}, ...p }
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
  h.sendEmail.mockReset().mockResolvedValue({ ok: true, id: 'em_1' })
  h.actOnWorkOrder.mockReset()
  h.insertError = null
  h.snapshot = null
})
afterEach(() => { vi.useRealTimers() })

// ─────────────────────────────────────────────────────────────────────────────
describe('1 · a lost claim is "already done" only when the other run succeeded', () => {
  const sendCard = () => card({ action_type: 'send_message', metadata: { to_email: 'mia@example.com', subject: 'Hi', body: 'Hello' } })

  it('claimed elsewhere and still running → 409 in_flight, nothing sent, the row is not re-stamped', async () => {
    const c = sendCard()
    h.snapshot = { ...cardRow(c.id) } // the route read the row before the other request claimed it
    Object.assign(cardRow(c.id), { executed_at: ago(MIN / 4), execution_result: null })
    const r = await exec(c.id)
    expect(r).toMatchObject({ status: 409, json: { executed: false, reason: 'in_flight' } })
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(cardRow(c.id).execution_result).toBeNull()
  })

  it('a failed earlier attempt left ok:false behind → still in_flight, never "already"', async () => {
    const c = sendCard()
    Object.assign(cardRow(c.id), { executed_at: ago(MIN / 4), execution_result: { ok: false, reason: 'resend 5xx' } })
    const r = await exec(c.id)
    expect(r.json).toMatchObject({ executed: false, reason: 'in_flight' })
  })

  it('the card was undone / dropped between the read and the claim → "action is <status>, not approved"', async () => {
    const c = sendCard()
    h.snapshot = { ...cardRow(c.id) }
    cardRow(c.id).status = 'rejected'
    const r = await exec(c.id)
    expect(r).toMatchObject({ status: 409, json: { executed: false, reason: 'action is rejected, not approved' } })
  })

  it('the other run stamped success → {executed:true, already:true}', async () => {
    const c = sendCard()
    Object.assign(cardRow(c.id), { executed_at: ago(MIN / 4), execution_result: { ok: true, kind: 'email' } })
    expect((await exec(c.id)).json).toMatchObject({ executed: true, already: true })
  })

  it('the client treats in_flight like not_run (drops the card, re-reads the to-dos); the reason has words', () => {
    const src = read('lib/agent/useAgentSession.ts')
    expect(src).toContain("if (/^action is \\w+, not approved$/.test(reason) || reason === 'in_flight') {")
    expect(executionReasonText('in_flight', true)).toContain('另一个页面正在执行')
    expect(executionReasonText('in_flight', false)).toContain('another page is running')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('2 · receipts say what actually went out', () => {
  it('a repair ticket whose email failed: the ticket exists, sent_to is null, the audit says emailed:false', async () => {
    h.user = { id: 'u-tenant', email: 'mia@example.com', is_anonymous: false }
    h.sendEmail.mockResolvedValue({ ok: false, error: 'resend 500' })
    const c = card({ user_id: 'u-tenant', role: 'tenant', action_type: 'maintenance_request', title: '浴室没有热水', metadata: { title: '浴室没有热水', description: '昨天开始', category: 'plumbing', priority: 'medium' } })
    const r = await exec(c.id)
    expect(r.json).toMatchObject({ executed: true, result: { kind: 'ticket', sent_to: null, email_error: 'resend 500' } })
    expect(h.db.maintenance_tickets).toHaveLength(1)
    expect(h.db.maintenance_tickets[0]).toMatchObject({ emergency: false })
    const ev = h.db.agent_audit_events.find((e) => e.action === 'executed_maintenance_request')!
    expect(ev.metadata).toMatchObject({ emailed: false, sent_to: null })
    expect(auditActionLabel('executed_maintenance_request', 'zh', ev.metadata)).toContain('邮件没有发出')
    expect(ticketNotEmailedText('浴室没有热水', 'resend 500', true)).toContain('通知邮件没有发出')
  })

  it('deployed before the A3 columns: the ticket insert retries without entry_permission / emergency', async () => {
    h.user = { id: 'u-tenant', email: 'mia@example.com', is_anonymous: false }
    h.insertError = { table: 'maintenance_tickets', key: 'entry_permission', message: "Could not find the 'entry_permission' column of 'maintenance_tickets'" }
    const c = card({ user_id: 'u-tenant', role: 'tenant', action_type: 'maintenance_request', metadata: { title: 'Leak', description: 'kitchen', category: 'plumbing', entry_permission: 'tenant_present' } })
    const r = await exec(c.id)
    expect(r.json.executed).toBe(true)
    expect(h.db.maintenance_tickets).toHaveLength(1)
    expect(h.db.maintenance_tickets[0].entry_permission).toBeUndefined()
  })

  it('an approved quote whose entry notice never went out says so', async () => {
    h.db.work_orders.push({ id: WO, status: 'scheduled', entry_notice_sent_at: null })
    h.actOnWorkOrder.mockResolvedValue({ ok: true, wo: { id: WO, status: 'scheduled' } })
    const c = card({ action_type: 'approve_quote', metadata: { work_order_id: WO, expected_amount: 150 } })
    const r = await exec(c.id)
    expect(r.json.result).toMatchObject({ kind: 'approve_quote', entry_notice_sent: false })
    const ev = h.db.agent_audit_events.find((e) => e.action === 'executed_approve_quote')!
    expect(auditActionLabel('executed_approve_quote', 'zh', ev.metadata)).toContain('进入通知没有发出')
    expect(auditActionLabel('executed_approve_quote', 'en', { entry_notice_sent: true })).toBe('Quote approved and the entry notice sent')
    expect(quoteApprovedNoNoticeText('报价', true)).toContain('RTA s.27')
    const server = read('lib/marketplace/server.ts')
    expect(server).toContain('metadata: { household_id: wo.household_id, notice_sent: r.ok } })')
    expect(server).toContain("notice_sent: false, reason: 'no_tenant_email'")
  })

  it('an unnamed enquirer is one role word, translated in English', async () => {
    h.db.showing_intents.push({ id: INT, tenant_id: 'ten1', listing_id: LST, kind: 'question', move_in_date: null, message: 'Parking?', status: 'pending', created_at: ago(MIN) })
    const c = card({ action_type: 'listing_inquiry', metadata: { intent_id: INT, listing_id: LST, tenant_auth_id: 'u-tenant' } })
    const r = await exec(c.id)
    expect(r.json.result.sent_to).toBe('咨询的租客')
    expect(executedText({ title: 't', actionType: 'listing_inquiry', sentTo: '咨询的租客', zh: false })).toContain('sent to the enquirer')
    expect(read('app/api/agent/execute/route.ts')).not.toContain('对方 / the prospect')
  })

  it('a needs-more notice is not called a decision; already_notified is generic', () => {
    expect(auditActionLabel('executed_send_decision', 'zh', { decision: 'needs_more' })).toContain('补材料')
    expect(auditActionLabel('executed_send_decision', 'en', { decision: 'declined' })).toBe('Decision notice sent')
    expect(executionReasonText('already_notified', true)).not.toContain('申请人')
    expect(executionReasonText('already_notified', false)).toContain('other side was already notified')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('3 · tenant cards name who really receives them', () => {
  it('a tenant send_message / repair card always shows the current landlord', () => {
    expect(tenantCardRecipient('tenant', 'send_message', {}, true)).toBe('你现在租住处的房东（在管租约对话）')
    expect(tenantCardRecipient('tenant', 'maintenance_request', {}, false)).toContain('your current landlord')
    expect(tenantCardRecipient('tenant', 'send_message', { to_email: 'x@example.com' }, true)).toBeNull()
    expect(tenantCardRecipient('landlord', 'send_message', {}, true)).toBeNull()
    expect(read('components/agent/ApprovalActionCard.tsx')).toContain('const recipientShown = fixedTo ?? (action.recipient_label')
    expect(read('app/api/agent/turn/route.ts')).toContain('if (fixed) out.proposedAction.recipient_label = fixed')
    expect(read('lib/agent/prompts.ts')).toContain('「发消息给房东」')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('4 · renewals', () => {
  const today = new Date('2026-10-01T12:00:00Z')
  const lease = { id: 'l1', household_id: 'h1', tenant_name: 'Mia', tenant_email: 'mia@example.com', unit_label: 'U1', monthly_rent: 2800, start_date: '2025-12-01', end_date: '2026-12-30' }
  const letter = (over: Partial<ExistingRenewalAction>): ExistingRenewalAction => ({ id: 'a', action_type: 'send_renewal_letter', status: 'expired', metadata: { lease_id: 'l1', stage: '90d' }, executed_at: null, ...over })

  it('a letter that expired on a clock is proposed again; a rejected one is not', () => {
    for (const reason of ['stale_approval', 'expired']) {
      const out = planRenewalActions('u', [lease], [letter({ execution_result: { ok: false, reason } })], today)
      expect(out.map((o) => o.action_type), reason).toEqual(['send_renewal_letter'])
    }
    expect(planRenewalActions('u', [lease], [letter({ status: 'rejected' })], today)).toHaveLength(0)
    expect(planRenewalActions('u', [lease], [letter({ execution_result: { ok: false, reason: 'lease_ended' } })], today)).toHaveLength(0)
  })

  it('a pending 30-day ask is retired once the tenant answered (any answer)', () => {
    const ask: ExistingRenewalAction = { id: 'q', action_type: 'send_message', status: 'pending', metadata: { lease_id: 'l1', stage: '30d' }, executed_at: null }
    const renew = [{ lease_id: 'l1', household_id: 'h1', intent: 'renew', created_at: '2026-09-28T00:00:00Z' }]
    expect(staleRenewalCards([lease], [ask], { intents: renew })).toEqual([{ id: 'q', reason: 'tenant_answered' }])
    // A household-level answer (lease_id null) counts for the lease the household is on.
    expect(staleRenewalCards([lease], [ask], { intents: [{ ...renew[0], lease_id: null }] })).toEqual([{ id: 'q', reason: 'tenant_answered' }])
    expect(staleRenewalCards([lease], [ask], {})).toEqual([])
  })

  it('the executor refuses a 30-day ask the tenant already answered', async () => {
    h.db.renewal_intents.push({ lease_id: null, household_id: HH, intent: 'negotiate', created_at: ago(MIN) })
    const c = card({ action_type: 'send_message', metadata: { lease_id: L1, stage: '30d', subject: 'Renewal', body: 'Are you renewing?' } })
    const r = await exec(c.id)
    expect(r.json).toMatchObject({ executed: false, reason: 'tenant_answered', expired: true })
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(executionReasonText('tenant_answered', true)).toContain('已经在共享中心回复')
  })

  it('the proactive sweep loads household-level answers too; the hub shows the current term only', () => {
    const pro = read('app/api/agent/proactive/route.ts')
    expect(pro).toContain(".in('household_id', hhIds).is('lease_id', null)")
    expect(pro).toContain("for (const reason of ['lease_superseded', 'tenant_leaving', 'tenant_answered'] as const)")
    const hub = read('app/h/[id]/page.tsx')
    expect(hub).toContain('const currentIntents = intents.filter((i) => !i.lease_id || i.lease_id === household.current_lease_id)')
    expect(hub).toContain('const latestIntent = currentIntents[0] ?? null')
    expect(hub).toContain('data-testid="renewal-intent-history"')
  })

  it('the lease list says "renewed" when a signed successor exists', () => {
    const src = read('app/landlord/leases/page.tsx')
    expect(src).toContain('successorLease(row as unknown as LeaseSlot, slots)')
    expect(src).toContain('已续约 · 新租约')
    expect(src).toContain("application_id, listing_id, landlord_id')")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('5 · payment plans on a tenant-imported tenancy', () => {
  it('the landlord member of the household can send it although the lease row has no landlord_id', async () => {
    Object.assign(h.db.lease_documents[0], { landlord_id: null, tenant_email: null })
    const c = card({ action_type: 'send_message', metadata: { stage: 'payment_plan', lease_id: L1, household_id: HH, missed_due_dates: ['2026-09-01'], subject: 'Plan', body: 'A plan' } })
    const r = await exec(c.id)
    expect(r.json).toMatchObject({ executed: true, result: { sent_to: 'mia@example.com' } })
    // A non-member landlord gets nothing.
    h.db.household_members = h.db.household_members.filter((m) => m.role !== 'landlord')
    const d = card({ action_type: 'send_message', metadata: { stage: 'payment_plan', lease_id: L1, household_id: HH, missed_due_dates: ['2026-09-01'], subject: 'Plan', body: 'A plan' } })
    expect((await exec(d.id)).status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('6 · decision notices', () => {
  it('legacy "rejected" is a decided decline; a same-decision redraft is "superseded"', () => {
    expect(isDecidedStatus('rejected')).toBe(true)
    const none = { pending: null, stuck: null }
    expect(noticeControls({ status: 'rejected', decision_notified_at: null }, none)).toMatchObject({ canApprove: false, canDecline: false, redraft: 'declined' })
    expect(noticeReasonText('superseded', true)).toContain('更新的同类通知')
    const page = read('app/landlord/applicants/[id]/page.tsx')
    expect(page).toContain("retire('superseded', { application_id: app.id, decision })")
    expect(executionReasonText('superseded', false)).toBe('a newer card replaced it')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('7 · client plumbing', () => {
  it('leaving the page aborts its countdowns; an undo before the A1 column still lands', () => {
    const src = read('lib/agent/useAgentSession.ts')
    expect(src).toContain('return () => { for (const c of Array.from(ctrls.values())) c.abort() }')
    expect(src).toMatch(/decided_at\|PGRST204\|42703/)
    expect(src).toContain(".update({ status: 'pending' }).eq('id', actionId).eq('status', 'approved').is('executed_at', null)")
  })
  it('the badge counts approved-but-not-run cards too', () => {
    expect(read('lib/agent/pendingCount.ts')).toContain(".or('status.eq.pending,and(status.eq.approved,executed_at.is.null)')")
    expect(read('lib/agent/threadCards.ts')).toContain("a.status === 'pending' || a.status === 'approved'")
    expect(read('components/agent/AgentWorkspacePage.tsx')).toContain('waitingCards(chatCards)')
  })
  it('a viewing never rewrites a question card in place', () => {
    const src = read('app/api/showing-intent/route.ts')
    expect(src).toContain("reason: 'superseded', superseded_by: 'showing_request'")
    expect(src).not.toContain("...(upgrade ? { action_type: 'showing_request'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('8 · emergency entry comes from the problem, not the priority', () => {
  it('ticketFlags: the recorded flag, else the words; never priority', async () => {
    const real = await vi.importActual<typeof import('@/lib/marketplace/server')>('@/lib/marketplace/server')
    const adminWith = (row: Row | null) => ({ from: () => { const b: Row = {}; for (const m of ['select', 'eq']) b[m] = () => b; b.maybeSingle = async () => ({ data: row, error: null }); return b } }) as never
    const t = { id: 't', title: '水龙头滴水', description: null, category: 'plumbing' }
    expect((await real.ticketFlags(adminWith({ entry_permission: 'anytime', emergency: null }), t)).emergency).toBe(false)
    expect((await real.ticketFlags(adminWith({ entry_permission: null, emergency: true }), t)).emergency).toBe(true)
    expect((await real.ticketFlags(adminWith(null), { ...t, title: '没有暖气' })).emergency).toBe(true)
    expect((await real.ticketFlags(adminWith({ entry_permission: 'tenant_present', emergency: false }), { ...t, title: '没有暖气' })).entryPermission).toBe('tenant_present')
    const server = read('lib/marketplace/server.ts')
    expect(server).not.toContain("priority === 'high'")
    expect(server).toContain('const emergency = i.emergency ?? flags.emergency')
  })
  it('the forms record it; the dispatch modal starts from it; the column exists', () => {
    expect(read('components/tenant/NewTicketModal.tsx')).toMatch(/\n\s+emergency,\n\s+\}/)
    expect(read('components/household/MaintenancePanel.tsx')).toContain('row.emergency = isEmergencyMaintenance(')
    expect(read('components/marketplace/DispatchModal.tsx')).toContain('const [emergency, setEmergency] = useState(false)')
    expect(read('supabase/migrations/20261001_A3_marketplace_entry_dispatch.sql')).toContain('alter table public.maintenance_tickets add column if not exists emergency boolean;')
  })
  it('a dispatch retires the suggestion card as "dispatched" before the ticket status changes', () => {
    const server = read('lib/marketplace/server.ts')
    const create = server.slice(server.indexOf('export async function createWorkOrder('), server.indexOf('export type ActInput'))
    expect(create.indexOf("reason: 'dispatched'")).toBeGreaterThan(0)
    expect(create.indexOf("reason: 'dispatched'")).toBeLessThan(create.indexOf("await setTicketStatus(admin, i.ticketId, 'offered')"))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('9 · migrations', () => {
  const a6 = read('supabase/migrations/20261001_A6_tenancy_ui_rent_ledger.sql')
  const b = read('supabase/migrations/20261001_B_household_next_lease.sql')
  const a4 = read('supabase/migrations/20261001_A4_listings_leases_sweep.sql')
  it('members write the rent ledger only through mark_rent_paid', () => {
    expect(a6).toContain('drop policy if exists rent_household_members_insert on public.rent_payments;')
    expect(a6.indexOf('drop policy if exists rent_household_members_insert')).toBeGreaterThan(a6.indexOf('create unique index if not exists rent_payments_lease_due_uniq'))
  })
  it('the household facts are frozen for direct writes and the creator update policy is gone', () => {
    const g = b.slice(b.indexOf('create or replace function public.guard_household_trust_fields()'), b.indexOf('drop policy if exists households_creator_update'))
    for (const f of ['address', 'unit', 'city', 'monthly_rent', 'rent_due_day', 'start_date', 'end_date', 'status', 'previous_lease_id']) expect(g, f).toContain(`new.${f} := old.${f};`)
    expect(b).toContain('drop policy if exists households_creator_update on public.households;')
  })
  it('an import cannot be corrected once anyone else joined', () => {
    expect(a4).toContain("raise exception 'counterparty_joined';")
    expect(a4).toContain('others_joined boolean')
    expect(read('app/leases/import/page.tsx')).toContain('&& !h.others_joined')
  })
  it('the replaced term stays readable and recordable; promotion writes the new placeholder', () => {
    expect(b).toContain('add column if not exists previous_lease_id uuid references public.lease_documents(id) on delete set null;')
    expect(b).toContain('where (h.current_lease_id = p_lease or h.previous_lease_id = p_lease) and public.is_household_member(h.id)')
    expect(b).toContain("raise exception 'after_lease' using errcode = '22023';")
    expect(b).toMatch(/previous_lease_id = coalesce\(r\.previous_lease_id, h\.previous_lease_id\)/)
    expect(b).toContain("values (r.lease_id, v_first, r.monthly_rent, 'due')")
    expect(b).toContain('on conflict (lease_id, due_date) do nothing;')
    expect(b).toContain('revoke all on function public.mark_rent_paid(uuid, date, date) from public, anon;')
    expect(b).toMatch(/create policy rent_household_members on public\.rent_payments[\s\S]*h\.previous_lease_id = rent_payments\.lease_id/)
    const sign = read('app/api/lease/sign/route.ts')
    expect(sign).toContain("if (slot === 'current') await insertFirstPeriod(admin, full, dueDay ?? 1, hh.current_lease_id)")
    expect(sign).toContain('{ previous_lease_id: hh.current_lease_id }')
    const hub = read('app/h/[id]/page.tsx')
    expect(hub).toContain('data-testid="rent-previous-term"')
    expect(hub).toContain('void markPaid(p.due, paidOnValue, prevLease.id)')
  })
})

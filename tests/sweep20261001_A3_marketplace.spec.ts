// Sweep 2026-10-01 · group A3 (services marketplace). Guards for the
// confirmed findings: closed tickets are never dispatched (#9/#25), approval
// is bound to the quote version (#23), revisions and re-completions keep the
// terms they do not resend (#26/#33), contractors who already passed on a
// ticket are not re-offered (#27), the landlord's quote window is read (#28),
// the tenant's entry permission travels (#29), a cancelled visit is
// announced (#34), no dead-end dispatch card (#35/#60), superseded
// credentials stop alarming (#61/#65), overdue cards retire (#62).
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent: { to: string | string[]; subject: string }[] = []
const pushes: { uid: string; title: string; url?: string; kind?: string }[] = []
const threadLines: { kind?: string; body: string; meta?: Record<string, unknown> }[] = []
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (a: { to: string; subject: string }) => { sent.push({ to: a.to, subject: a.subject }); return { ok: true, id: 'e1' } }),
  renderAgentMessageEmail: () => ({ html: '<p/>', text: '' }),
}))
vi.mock('@/lib/push/notify', () => ({ notifyUser: vi.fn(async (_a: unknown, uid: string, m: { title: string; url?: string; kind?: string }) => { pushes.push({ uid, title: m.title, url: m.url, kind: m.kind }) }) }))
vi.mock('@/lib/threads/server', () => ({
  ensureThread: vi.fn(async () => ({ id: 'th1' })),
  noteOnWorkOrder: vi.fn(async (_a: unknown, _w: unknown, line: string) => { threadLines.push({ body: line }) }),
  postSystemMessage: vi.fn(async (_a: unknown, _t: string, m: { kind?: string; body: string; meta?: Record<string, unknown> }) => { threadLines.push(m); return 1 }),
  replyTokenFor: vi.fn(async () => 'tok'),
}))
vi.mock('@/lib/matters/server', () => ({ ensureMatter: vi.fn(async () => null) }))
vi.mock('@/lib/billing/freeWindow', () => ({ inInternalTestWindow: () => true }))

import { entryCancelText, entryNoticeText, mergeCompletion, mergeQuote, quoteExpired, quoteStillAsSeen, resolveEntryPermission, torontoToday, validateQuote } from '@/lib/marketplace/workOrders'
import { deadProviderIds } from '@/lib/marketplace/dispatchPolicy'
import { earliestExpiry, isSuperseded, renewalStanding, renewHintText } from '@/lib/marketplace/trades'
import { actOnWorkOrder, createWorkOrder, loadDispatchPolicy, noCandidateMessage, suggestDispatch } from '@/lib/marketplace/server'
import { notifyUser } from '@/lib/push/notify'
import { sweepCredentialReminders } from '@/lib/marketplace/sweep'

const read = (f: string) => readFileSync(f, 'utf8')

// ── a tiny fake service-role client: records every call, answers per table ──
type Call = { table: string; op: 'select' | 'insert' | 'update' | 'delete'; cols?: string; payload?: unknown; filters: [string, ...unknown[]][]; single: boolean }
type Answer = { data: unknown; error?: { message: string } | null }
function fakeAdmin(answer: (c: Call) => Answer | undefined) {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [], single: false }
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => { call.filters.push([name, ...args]); return b }
    for (const m of ['eq', 'neq', 'in', 'is', 'not', 'lt', 'lte', 'gt', 'gte', 'contains', 'order', 'limit', 'or']) b[m] = chain(m)
    b.select = (cols?: string) => { if (call.op === 'select') call.cols = cols; return b }
    b.insert = (payload: unknown) => { call.op = 'insert'; call.payload = payload; return b }
    b.update = (payload: unknown) => { call.op = 'update'; call.payload = payload; return b }
    b.delete = () => { call.op = 'delete'; return b }
    b.maybeSingle = () => { call.single = true; return b }
    b.single = () => { call.single = true; return b }
    b.then = (ok: (v: Answer) => unknown, bad?: (e: unknown) => unknown) => {
      calls.push(call)
      const a = answer(call) ?? { data: call.single ? null : [], error: null }
      return Promise.resolve({ data: a.data, error: a.error ?? null }).then(ok, bad)
    }
    return b
  }
  const admin = {
    from,
    rpc: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.test` } } }) } },
  }
  return { admin: admin as never, calls }
}
const has = (c: Call, name: string, ...args: unknown[]) => c.filters.some((f) => f[0] === name && JSON.stringify(f.slice(1)) === JSON.stringify(args))

const TICKET = { id: '11111111-1111-1111-1111-111111111111', title: '水槽漏水', description: null, category: 'plumbing', priority: 'medium', household_id: 'hh1', status: 'new' }
const HH = { id: 'hh1', address: '100 Test Ave', unit: '1', city: 'Toronto' }
const MEMBERS = [{ user_id: 'll1', role: 'landlord' }, { user_id: 'tt1', role: 'tenant' }]
const ctxAnswer = (c: Call, ticket = TICKET): Answer | undefined => {
  if (c.table === 'maintenance_tickets' && c.op === 'select' && c.cols?.startsWith('id, title')) return { data: ticket }
  if (c.table === 'households' && c.op === 'select') return { data: HH }
  if (c.table === 'household_members' && c.op === 'select') return { data: MEMBERS }
  return undefined
}

beforeEach(() => { sent.length = 0; pushes.length = 0; threadLines.length = 0 })

describe('#9/#25 a closed ticket is never dispatched; its suggestion card retires', () => {
  it('createWorkOrder refuses done / cancelled with 409 ticket_closed and sends nothing', async () => {
    for (const status of ['done', 'cancelled']) {
      const { admin, calls } = fakeAdmin((c) => ctxAnswer(c, { ...TICKET, status }))
      const r = await createWorkOrder(admin, { ticketId: TICKET.id, landlordAuthId: 'll1', externalEmail: 'fix@example.test' })
      expect(r).toEqual({ ok: false, error: 'ticket_closed', status: 409 })
      expect(calls.some((c) => c.table === 'work_orders' && c.op === 'insert')).toBe(false)
      expect(sent).toHaveLength(0)
    }
  })
  it('suggestDispatch skips a ticket that left "new" (the landlord took it in hand)', async () => {
    const { admin, calls } = fakeAdmin((c) => ctxAnswer(c, { ...TICKET, status: 'in_progress' }))
    await suggestDispatch(admin, 'll1', TICKET.id)
    expect(calls.some((c) => c.table === 'agent_pending_actions' && c.op === 'insert')).toBe(false)
  })
  it('the migration expires pending dispatch cards when the ticket leaves "new" and adds entry_permission', () => {
    const sql = read('supabase/migrations/20261001_A3_marketplace_entry_dispatch.sql')
    expect(sql).toContain('add column if not exists entry_permission text')
    expect(sql).toMatch(/entry_permission in \('anytime', 'call_first', 'tenant_present'\)/)
    expect(sql).toMatch(/after update of status on public\.maintenance_tickets/)
    expect(sql).toMatch(/when \(new\.status is distinct from old\.status and new\.status is distinct from 'new'\)/)
    expect(sql).toMatch(/security definer set search_path = public/)
    expect(sql).toMatch(/revoke all on function public\.expire_dispatch_cards_on_ticket_status\(\) from public, anon, authenticated, service_role/)
    expect(sql).toContain("action_type = 'dispatch_work_order'")
  })
})

describe('#23 approval is bound to the version the landlord saw', () => {
  it('quoteStillAsSeen compares amount, version and quoted_at — any mismatch is a changed quote', () => {
    const row = { quote_amount: 180, quote_version: 2, quoted_at: '2026-10-01T10:00:00.000Z' }
    expect(quoteStillAsSeen(row, {})).toBe(true)
    expect(quoteStillAsSeen(row, { expected_amount: 180, expected_version: 2, expected_quoted_at: '2026-10-01T10:00:00Z' })).toBe(true)
    expect(quoteStillAsSeen(row, { expected_amount: 180, expected_version: 1 })).toBe(false) // same amount, new window
    expect(quoteStillAsSeen(row, { expected_amount: 900 })).toBe(false)
    expect(quoteStillAsSeen(row, { expected_quoted_at: '2026-10-01T09:00:00Z' })).toBe(false)
  })
  it('approving an older version is refused with quote_changed and nothing is written', async () => {
    const wo = { id: 'wo1', ticket_id: TICKET.id, household_id: 'hh1', landlord_auth_id: 'll1', status: 'quoted', emergency: true, quote_amount: 180, quote_version: 2, quoted_at: '2026-10-01T10:00:00Z', quote_valid_until: null, schedule_start: null, schedule_end: null }
    const { admin, calls } = fakeAdmin((c) => (c.table === 'work_orders' && c.op === 'select' ? { data: wo } : ctxAnswer(c)))
    const r = await actOnWorkOrder(admin, { woId: 'wo1', action: 'approve_quote', by: 'landlord', actorId: 'll1', payload: { expected_amount: 180, expected_version: 1 } })
    expect(r).toEqual({ ok: false, error: 'quote_changed', status: 409 })
    expect(calls.some((c) => c.table === 'work_orders' && c.op === 'update')).toBe(false)
  })
  it('a re-quote retires the old card and writes a new one that carries quote_version (never rewrites in place)', async () => {
    const before = { id: 'wo1', ticket_id: TICKET.id, household_id: 'hh1', landlord_auth_id: 'll1', provider_id: null, external_email: 'fix@example.test', external_name: 'Fix Co', token: 'x'.repeat(64), status: 'quoted', emergency: false, entry_permission: 'call_first', quote_amount: 180, quote_type: 'fixed', quote_note: 'parts extra', quote_valid_until: null, quoted_at: '2026-10-01T10:00:00Z', quote_version: 1, schedule_start: '2099-03-02T15:00:00.000Z', schedule_end: '2099-03-02T17:00:00.000Z', entry_notice_sent_at: null, completion_photos: [] }
    const after = { ...before, quote_amount: 160, quote_version: 2, quoted_at: '2026-10-02T10:00:00Z' }
    const { admin, calls } = fakeAdmin((c) => {
      if (c.table === 'work_orders' && c.op === 'select') return { data: before }
      if (c.table === 'work_orders' && c.op === 'update') return { data: after }
      return ctxAnswer(c)
    })
    const r = await actOnWorkOrder(admin, { woId: 'wo1', action: 'quote', by: 'external', actorId: null, payload: { amount: 160 } })
    expect(r.ok).toBe(true)
    const upd = calls.find((c) => c.table === 'work_orders' && c.op === 'update')!
    // #26: only the amount was resent — window, note and type survive the revision.
    expect(upd.payload).toMatchObject({ quote_amount: 160, quote_type: 'fixed', quote_note: 'parts extra', schedule_start: '2099-03-02T15:00:00.000Z', schedule_end: '2099-03-02T17:00:00.000Z', quote_version: 2 })
    const expire = calls.find((c) => c.table === 'agent_pending_actions' && c.op === 'update' && has(c, 'eq', 'action_type', 'approve_quote'))
    expect(expire?.payload).toMatchObject({ status: 'expired', execution_result: { ok: false, reason: 'quote_changed' } })
    const card = calls.find((c) => c.table === 'agent_pending_actions' && c.op === 'insert')
    expect((card?.payload as { action_type: string; metadata: Record<string, unknown> }).metadata).toMatchObject({ work_order_id: 'wo1', expected_amount: 160, quote_version: 2 })
    const order = calls.indexOf(expire!) < calls.indexOf(card!)
    expect(order).toBe(true)
  })
  it('a ticket status change from the hub refreshes the to-do badge (the DB retired the card)', () => {
    expect(read('components/household/MaintenancePanel.tsx')).toContain("else if (t.status === 'new') notifyPendingChanged()")
  })
  it('the hub button sends the version it shows', () => {
    const card = read('components/marketplace/WorkOrderCard.tsx')
    expect(card).toContain("run('approve_quote', { expected_amount: wo.quote_amount, expected_version: wo.quote_version ?? null, expected_quoted_at: wo.quoted_at })")
  })
})

describe('#26 a quote revision keeps what it does not resend', () => {
  const prev = { quote_amount: 180, quote_type: 'hourly_estimate', quote_note: 'parts extra', quote_valid_until: '2099-10-15', schedule_start: '2099-03-02T15:00:00.000Z', schedule_end: '2099-03-02T17:00:00.000Z' }
  it('absent keys keep the row; null / empty clears; the merged quote validates', () => {
    const m = mergeQuote(prev, { amount: 160 })
    expect(m).toEqual({ amount: 160, type: 'hourly_estimate', note: 'parts extra', valid_until: '2099-10-15', schedule_start: prev.schedule_start, schedule_end: prev.schedule_end })
    expect(validateQuote(m).ok).toBe(true)
    expect(mergeQuote(prev, { amount: 160, note: '', valid_until: null })).toMatchObject({ note: undefined, valid_until: undefined })
    const first = { quote_amount: null, quote_type: null, quote_note: null, quote_valid_until: null, schedule_start: null, schedule_end: null }
    expect(validateQuote(mergeQuote(first, {})).ok).toBe(false)
  })
  it('the revise form opens prefilled from the row and sends explicit nulls for cleared fields', () => {
    const card = read('components/marketplace/WorkOrderCard.tsx')
    expect(card).toContain('function openQuote()')
    expect(card).toContain("schedule_start: isoToLocalInput(wo.schedule_start)")
    expect(card).toMatch(/onClick=\{openQuote\}>\{zh \? '修改报价'/)
    expect(card).toContain("valid_until: form.valid_until || null")
  })
})

describe('review · an expired validity never comes back on a revision', () => {
  // 2026-10-01 02:00 UTC is still 2026-09-30 22:00 in Toronto.
  const now = new Date('2026-10-01T02:00:00Z')
  it('validity is a Toronto calendar day: today is fine, yesterday is refused', () => {
    expect(torontoToday(now)).toBe('2026-09-30')
    expect(quoteExpired('2026-09-30', now)).toBe(false)
    expect(quoteExpired('2026-09-29', now)).toBe(true)
    expect(validateQuote({ amount: 10, type: 'fixed', valid_until: '2026-09-30' }, now).ok).toBe(true)
    expect(validateQuote({ amount: 10, type: 'fixed', valid_until: '2026-09-29' }, now).reason).toBe('valid_until_past')
  })
  it('a price-only revision drops a kept validity that already lapsed; an explicit past date is refused', () => {
    const prev = { quote_amount: 180, quote_type: 'fixed', quote_note: null, quote_valid_until: '2026-09-20', schedule_start: '2099-03-02T15:00:00.000Z', schedule_end: '2099-03-02T17:00:00.000Z' }
    const m = mergeQuote(prev, { amount: 200 }, now)
    expect(m.valid_until).toBeUndefined()
    expect(validateQuote(m, now).ok).toBe(true)
    expect(validateQuote(mergeQuote(prev, { amount: 200, valid_until: '2026-09-20' }, now), now).reason).toBe('valid_until_past')
    expect(mergeQuote({ ...prev, quote_valid_until: '2026-10-15' }, { amount: 200 }, now).valid_until).toBe('2026-10-15')
  })
  it('server: the re-quote clears the lapsed date; a re-sent past date is a clear 400', async () => {
    const before = { id: 'wo1', ticket_id: TICKET.id, household_id: 'hh1', landlord_auth_id: 'll1', provider_id: null, external_email: 'fix@example.test', external_name: 'Fix Co', token: 'x'.repeat(64), status: 'quoted', emergency: false, entry_permission: 'call_first', quote_amount: 180, quote_type: 'fixed', quote_note: null, quote_valid_until: '2020-01-01', quoted_at: '2026-09-01T10:00:00Z', quote_version: 1, schedule_start: '2099-03-02T15:00:00.000Z', schedule_end: '2099-03-02T17:00:00.000Z', entry_notice_sent_at: null, completion_photos: [] }
    const { admin, calls } = fakeAdmin((c) => {
      if (c.table === 'work_orders' && c.op === 'select') return { data: before }
      if (c.table === 'work_orders' && c.op === 'update') return { data: { ...before, ...(c.payload as object) } }
      return ctxAnswer(c)
    })
    const ok = await actOnWorkOrder(admin, { woId: 'wo1', action: 'quote', by: 'external', actorId: null, payload: { amount: 200 } })
    expect(ok.ok).toBe(true)
    const upd = calls.find((c) => c.table === 'work_orders' && c.op === 'update')
    expect(upd?.payload).toMatchObject({ quote_amount: 200, quote_valid_until: null, quote_version: 2 })
    const bad = await actOnWorkOrder(admin, { woId: 'wo1', action: 'quote', by: 'external', actorId: null, payload: { amount: 200, valid_until: '2020-01-01' } })
    expect(bad).toMatchObject({ ok: false, error: 'quote_valid_until_past', status: 400 })
  })
  it('the revise form does not prefill a lapsed date, the date input has a floor, and both codes read in words', () => {
    const card = read('components/marketplace/WorkOrderCard.tsx')
    expect(card).toContain('valid_until: wo.quote_valid_until && !quoteExpired(wo.quote_valid_until) ? wo.quote_valid_until')
    expect(card).toContain('min={torontoToday()}')
    expect(card).toMatch(/quote_valid_until: \{ zh: '/)
    expect(card).toMatch(/quote_valid_until_past: \{ zh: '报价有效期已经过去了/)
    const page = read('app/w/[token]/page.tsx')
    expect(page).toContain('explain(j.error, zh)')
    expect(page).toContain('min={torontoToday()}')
    expect(read('lib/marketplace/server.ts')).toContain("if (quoteExpired(wo.quote_valid_until)) return { ok: false, error: 'quote_expired'")
  })
})

describe('#33 completing again after rework keeps the first invoice', () => {
  const prev = { invoice_amount: 210, invoice_note: null, completion_note: 'replaced P-trap', completion_photos: ['a.jpg'] }
  it('omitted invoice / note / photos are kept; a new invoice replaces; a bad one is refused', () => {
    expect(mergeCompletion(prev, { note: 'fixed the drip', invoice_amount: null })).toEqual({ ok: true, value: { invoice_amount: 210, invoice_note: null, completion_note: 'fixed the drip', completion_photos: ['a.jpg'] } })
    expect(mergeCompletion(prev, { invoice_amount: 195 })).toMatchObject({ ok: true, value: { invoice_amount: 195, completion_note: 'replaced P-trap' } })
    expect(mergeCompletion(prev, { invoice_amount: -1 })).toEqual({ ok: false, reason: 'invoice_amount' })
    expect(mergeCompletion({ invoice_amount: null, invoice_note: null, completion_note: null, completion_photos: null }, {})).toEqual({ ok: true, value: { invoice_amount: null, invoice_note: null, completion_note: null, completion_photos: [] } })
  })
  it('both completion forms open prefilled', () => {
    expect(read('components/marketplace/WorkOrderCard.tsx')).toContain('function openComplete()')
    expect(read('app/w/[token]/page.tsx')).toContain("invoice_amount: w.invoice_amount != null ? String(w.invoice_amount) : ''")
    expect(read('app/api/w/[token]/route.ts')).toContain('completion_note: w.completion_note')
  })
})

describe('#27 contractors who already passed on a ticket are not re-offered', () => {
  it('deadProviderIds: declined / expired / cancelled, deduped, open ones kept', () => {
    expect(deadProviderIds([{ provider_id: 'A', status: 'declined' }, { provider_id: 'B', status: 'declined' }, { provider_id: 'A', status: 'cancelled' }, { provider_id: 'C', status: 'quoted' }, { provider_id: null, status: 'expired' }, { provider_id: 'D', status: 'expired' }]).sort()).toEqual(['A', 'B', 'D'])
  })
  it('a second decline does not bounce the job back to the first decliner', async () => {
    const provs = [{ id: 'A', legal_name: 'A Plumbing', trade_name: null, status: 'verified', trades: ['plumbing'], service_cities: ['Toronto'] }, { id: 'B', legal_name: 'B Plumbing', trade_name: null, status: 'verified', trades: ['plumbing'], service_cities: ['Toronto'] }]
    const creds = [{ kind: 'sto_coq', expires_at: null, verified_at: 'x' }, { kind: 'liability_insurance', expires_at: null, verified_at: 'x' }, { kind: 'wsib_clearance', expires_at: null, verified_at: 'x' }]
    const { admin, calls } = fakeAdmin((c) => {
      if (c.table === 'work_orders' && c.op === 'select' && c.cols === 'id') return { data: [] }
      if (c.table === 'work_orders' && c.op === 'select' && c.cols === 'provider_id, status') return { data: [{ provider_id: 'A', status: 'declined' }, { provider_id: 'B', status: 'declined' }] }
      if (c.table === 'service_providers') return { data: provs }
      if (c.table === 'provider_credentials') return { data: creds }
      if (c.table === 'app_config' || c.table === 'dispatch_policies') return { data: null }
      return ctxAnswer(c)
    })
    await suggestDispatch(admin, 'll1', TICKET.id, { excludeProviderIds: ['B'], because: 'declined' })
    const card = calls.find((c) => c.table === 'agent_pending_actions' && c.op === 'insert')
    expect(card).toBeUndefined() // A is not offered again; nobody left → no card
  })
})

describe('#28 the landlord\'s quote window is read', () => {
  it('loadDispatchPolicy selects quote_hours and returns it', async () => {
    const { admin, calls } = fakeAdmin((c) => (c.table === 'dispatch_policies' ? { data: c.cols?.includes('quote_hours') ? { mode: 'suggest', quote_hours: 24 } : { mode: 'suggest' } } : undefined))
    const p = await loadDispatchPolicy(admin, 'll1')
    expect(p.quote_hours).toBe(24)
    expect(calls[0].cols).toContain('quote_hours')
  })
})

describe('#29 the tenant\'s entry permission travels with the ticket', () => {
  it('explicit choice > ticket > call_first; the default notice never says "enter while you are out"', () => {
    expect(resolveEntryPermission('anytime', 'tenant_present')).toBe('anytime')
    expect(resolveEntryPermission(null, 'tenant_present')).toBe('tenant_present')
    expect(resolveEntryPermission(undefined, 'bogus')).toBe('call_first')
    const n = entryNoticeText({ unit: '1', provider: 'X', scope: 's', entryPermission: resolveEntryPermission(null, null), emergency: false })
    expect(n.body).not.toContain('如您不在')
    expect(n.body).toContain('进入前会先电话联系您')
  })
  it('createWorkOrder from a card (no explicit choice) writes the ticket\'s permission into the work order and the email', async () => {
    const { admin, calls } = fakeAdmin((c) => {
      if (c.table === 'maintenance_tickets' && c.cols === 'entry_permission, emergency') return { data: { entry_permission: 'tenant_present', emergency: null } }
      if (c.table === 'work_orders' && c.op === 'select' && !c.single) return { data: [] }
      if (c.table === 'work_orders' && c.op === 'insert') return { data: { id: 'wo9', household_id: 'hh1', external_email: 'fix@example.test', ...(c.payload as object) } }
      if (c.table === 'dispatch_policies') return { data: { quote_hours: 24 } }
      return ctxAnswer(c)
    })
    const r = await createWorkOrder(admin, { ticketId: TICKET.id, landlordAuthId: 'll1', externalEmail: 'fix@example.test', entryPermission: null })
    expect(r.ok).toBe(true)
    const ins = calls.find((c) => c.table === 'work_orders' && c.op === 'insert')!
    expect(ins.payload).toMatchObject({ entry_permission: 'tenant_present' })
    // #28: the policy's 24 h, not the default 48.
    const due = new Date((ins.payload as { quote_due_at: string }).quote_due_at).getTime() - Date.now()
    expect(Math.round(due / 3_600_000)).toBe(24)
  })
  it('the tenant form asks and writes it; the dispatch modal starts from it', () => {
    const modal = read('components/tenant/NewTicketModal.tsx')
    expect(modal).toContain('entry_permission: entry,')
    expect(modal).toContain('data-testid="ticket-entry"')
    expect(read('components/marketplace/DispatchModal.tsx')).toContain(".select('entry_permission, emergency, title, description, category').eq('id', ticketId)")
    const panel = read('components/household/MaintenancePanel.tsx')
    expect(panel).toContain("if (myRole === 'tenant') row.entry_permission = form.entry")
    expect(panel).toContain('data-testid="ticket-entry-select"')
  })
})

describe('#34 cancelling after the entry notice tells the tenant', () => {
  it('entryCancelText names the window and says nobody will enter', () => {
    const t = entryCancelText({ unit: '100 Test Ave #1', scheduleStart: '2099-03-02T15:00:00Z', scheduleEnd: '2099-03-02T17:00:00Z', provider: 'Fix Co', scope: '水槽漏水', byContractor: true, reason: 'sick' })
    expect(t.subject).toContain('Entry cancelled')
    expect(t.body).toContain('届时不会有人进入')
    expect(t.body).toContain('服务商取消了这次上门')
    expect(t.body).toContain('nobody will enter')
  })
  it('a cancel from "scheduled" emails and pushes the tenant and leaves a formal copy', async () => {
    const before = { id: 'wo1', ticket_id: TICKET.id, household_id: 'hh1', landlord_auth_id: 'll1', provider_id: null, external_email: 'fix@example.test', external_name: 'Fix Co', token: 'x'.repeat(64), status: 'scheduled', emergency: false, entry_permission: 'tenant_present', quote_amount: 180, quoted_at: 'q', quote_version: 1, schedule_start: '2099-03-02T15:00:00Z', schedule_end: '2099-03-02T17:00:00Z', entry_notice_sent_at: '2099-03-01T10:00:00Z', completion_photos: [] }
    const { admin } = fakeAdmin((c) => {
      if (c.table === 'work_orders' && c.op === 'select') return { data: before }
      if (c.table === 'work_orders' && c.op === 'update') return { data: { ...before, status: 'cancelled', cancel_reason: 'sick', token: null } }
      return ctxAnswer(c)
    })
    const r = await actOnWorkOrder(admin, { woId: 'wo1', action: 'cancel', by: 'external', actorId: null, payload: { reason: 'sick' } })
    expect(r.ok).toBe(true)
    expect(sent.some((m) => m.to === 'tt1@example.test' && m.subject.includes('Entry cancelled'))).toBe(true)
    expect(pushes.some((p) => p.uid === 'tt1' && p.title.includes('Entry cancelled'))).toBe(true)
    expect(threadLines.some((l) => l.kind === 'formal_copy' && l.meta?.notice === 'entry_cancelled')).toBe(true)
  })
})

describe('#35/#60 no approvable card without a candidate', () => {
  it('nobody eligible → no dispatch card; a push to the ticket page and an audit row instead', async () => {
    const { admin, calls } = fakeAdmin((c) => {
      if (c.table === 'work_orders' && c.op === 'select') return { data: [] }
      if (c.table === 'service_providers') return { data: [] }
      if (c.table === 'app_config' || c.table === 'dispatch_policies') return { data: null }
      return ctxAnswer(c)
    })
    await suggestDispatch(admin, 'll1', TICKET.id)
    expect(calls.some((c) => c.table === 'agent_pending_actions' && c.op === 'insert')).toBe(false)
    expect(pushes.some((p) => p.uid === 'll1' && p.url === '/h/hh1?tab=maintenance' && p.title.includes('Dispatch needs you'))).toBe(true)
    const audit = calls.find((c) => c.table === 'agent_audit_events' && c.op === 'insert')
    expect((audit?.payload as { action: string }).action).toBe('work_order_dispatch_no_candidate')
  })
})

describe('#61/#65 a verified renewal supersedes the old credential row', () => {
  const OLD = { kind: 'wsib_clearance', expires_at: '2026-10-15', verified_at: 'x' }
  const NEW = { kind: 'wsib_clearance', expires_at: '2027-01-15', verified_at: 'y' }
  const STO = { kind: 'sto_coq', expires_at: '2027-06-01', verified_at: 'z' }
  it('earliestExpiry ignores the superseded row; an unverified renewal does not supersede', () => {
    const today = new Date('2026-10-08T12:00:00Z')
    expect(isSuperseded(OLD, [OLD, NEW])).toBe(true)
    expect(earliestExpiry([OLD, NEW, STO], today)).toEqual({ kind: 'wsib_clearance', days: 99 })
    const pending = { ...NEW, verified_at: null }
    expect(isSuperseded(OLD, [OLD, pending])).toBe(false)
    expect(earliestExpiry([OLD, pending], today)).toEqual({ kind: 'wsib_clearance', days: 7 })
  })
  it('the reminder sweep sends nothing for a superseded row', async () => {
    const rows = [{ id: 'c-old', provider_id: 'P', kind: 'wsib_clearance', expires_at: '2026-10-15', reminders_sent: [90, 60, 30] }]
    const all = [{ id: 'c-old', provider_id: 'P', ...OLD }, { id: 'c-new', provider_id: 'P', ...NEW }]
    const { admin, calls } = fakeAdmin((c) => {
      if (c.table === 'provider_credentials' && c.op === 'select' && c.cols?.includes('reminders_sent')) return { data: rows }
      if (c.table === 'provider_credentials' && c.op === 'select') return { data: all }
      if (c.table === 'service_providers') return { data: [{ id: 'P', auth_id: 'pa', legal_name: 'P Inc', trade_name: null, contact_email: 'p@example.test', status: 'verified' }] }
      return undefined
    })
    const r = await sweepCredentialReminders(admin, new Date('2026-10-08T12:00:00Z'))
    expect(r).toEqual({ providers: 0, credentials: 0 })
    expect(calls.some((c) => c.table === 'provider_credentials' && c.op === 'update')).toBe(false)
    expect(sent).toHaveLength(0)
  })
  it('the onboarding page edits a row in place and renews by adding one', () => {
    const page = read('app/provider/onboard/page.tsx')
    expect(page).toContain("supabase.from('provider_credentials').update({ number: ef.number.trim() || null")
    expect(page).toContain('data-testid="credential-edit"')
    expect(page).toContain('data-testid="credential-renew"')
    expect(page).toContain('isSuperseded(c, creds)')
  })
})

describe('#62 the overdue card retires once the offer is answered', () => {
  it('a quote on an overdue offer expires the pending work_order_overdue card', async () => {
    const before = { id: 'wo1', ticket_id: TICKET.id, household_id: 'hh1', landlord_auth_id: 'll1', provider_id: null, external_email: 'fix@example.test', external_name: 'Fix Co', token: 'x'.repeat(64), status: 'offered', emergency: false, entry_permission: 'call_first', quote_amount: null, quote_type: null, quote_note: null, quote_valid_until: null, quoted_at: null, quote_version: 0, schedule_start: null, schedule_end: null, entry_notice_sent_at: null, completion_photos: [] }
    const { admin, calls } = fakeAdmin((c) => {
      if (c.table === 'work_orders' && c.op === 'select') return { data: before }
      if (c.table === 'work_orders' && c.op === 'update') return { data: { ...before, status: 'quoted', quote_amount: 120, quote_type: 'fixed', quote_version: 1, quoted_at: 'now' } }
      return ctxAnswer(c)
    })
    const r = await actOnWorkOrder(admin, { woId: 'wo1', action: 'accept', by: 'external', actorId: null, payload: { amount: 120, type: 'fixed', schedule_start: '2099-03-02T15:00:00Z' } })
    expect(r.ok).toBe(true)
    const exp = calls.find((c) => c.table === 'agent_pending_actions' && c.op === 'update' && has(c, 'eq', 'action_type', 'work_order_overdue'))
    expect(exp?.payload).toMatchObject({ status: 'expired', execution_result: { reason: 'work_order_already_answered' } })
  })
})

describe('review · the no-candidate notice is true and reaches the landlord', () => {
  it('names the real reason: Pro gate / everyone already passed / nobody covers it', () => {
    expect(noCandidateMessage({ network: false, excludedEligible: 0, title: 't' }).bodyZh).toContain('Pro 功能')
    const passed = noCandidateMessage({ network: true, excludedEligible: 2, because: 'declined', title: 't' })
    expect(passed.bodyZh).toContain('能接这单的 2 家已核验服务商都已婉拒、逾期或被撤回过这张工单')
    expect(passed.bodyZh).not.toContain('暂时没有覆盖')
    expect(passed.bodyEn).toContain('All 2 verified providers who could take this job already declined it')
    expect(noCandidateMessage({ network: true, excludedEligible: 0, title: 't' }).bodyZh).toContain('暂时没有覆盖这个工种与区域')
  })
  const withDecliner = (c: Call): Answer | undefined => {
    if (c.table === 'work_orders' && c.op === 'select' && c.cols === 'provider_id, status') return { data: [{ provider_id: 'p1', status: 'declined' }] }
    if (c.table === 'work_orders' && c.op === 'select') return { data: [] }
    if (c.table === 'service_providers') return { data: [{ id: 'p1', legal_name: 'Maple Plumbing Inc.', trade_name: null, status: 'verified', trades: ['plumbing'], service_cities: ['Toronto'] }] }
    if (c.table === 'provider_credentials') return { data: [{ kind: 'sto_coq', expires_at: '2099-01-01', verified_at: 'x' }, { kind: 'liability_insurance', expires_at: '2099-01-01', verified_at: 'x' }, { kind: 'wsib_clearance', expires_at: '2099-01-01', verified_at: 'x' }] }
    if (c.table === 'app_config' || c.table === 'dispatch_policies') return { data: null }
    return ctxAnswer(c)
  }
  it('an eligible provider who already declined is counted, not described as "nobody covers it"; push is an approval; no device → email', async () => {
    const { admin, calls } = fakeAdmin(withDecliner)
    await suggestDispatch(admin, 'll1', TICKET.id, { because: 'declined' })
    expect(calls.some((c) => c.table === 'agent_pending_actions' && c.op === 'insert')).toBe(false)
    const push = pushes.find((p) => p.uid === 'll1')
    expect(push?.kind).toBe('approval')
    expect(sent.some((m) => m.to === 'll1@example.test' && m.subject.includes('Dispatch needs you'))).toBe(true)
    const audit = calls.find((c) => c.table === 'agent_audit_events' && c.op === 'insert')
    expect((audit?.payload as { metadata: Record<string, unknown> }).metadata).toMatchObject({ excluded_eligible: 1, pushed: 0, emailed: true })
  })
  it('a push that reached a device sends no email', async () => {
    vi.mocked(notifyUser).mockImplementationOnce(async () => 1)
    const { admin, calls } = fakeAdmin(withDecliner)
    await suggestDispatch(admin, 'll1', TICKET.id, { because: 'declined' })
    expect(sent).toHaveLength(0)
    const audit = calls.find((c) => c.table === 'agent_audit_events' && c.op === 'insert')
    expect((audit?.payload as { metadata: Record<string, unknown> }).metadata).toMatchObject({ pushed: 1, emailed: false })
  })
})

describe('review · the renewal hint only says "stays valid" when it does', () => {
  const today = new Date('2026-10-08T12:00:00Z')
  const LIVE = { kind: 'sto_coq', expires_at: '2026-10-20', verified_at: 'x' }
  const LAPSED = { kind: 'sto_coq', expires_at: '2026-10-01', verified_at: 'x' }
  it('live / lapsed / grace / unverified follow the coverage rule', () => {
    expect(renewalStanding(LIVE, [LIVE], today).state).toBe('live')
    expect(renewalStanding(LAPSED, [LAPSED], today, 7).state).toBe('lapsed') // statutory licence: no grace
    const wsib = { kind: 'wsib_clearance', expires_at: '2026-10-05', verified_at: 'x' }
    expect(renewalStanding(wsib, [wsib], today, 7)).toEqual({ state: 'grace', graceUntil: '2026-10-12' })
    expect(renewalStanding(wsib, [wsib], today, 0).state).toBe('lapsed')
    expect(renewalStanding({ kind: 'sto_coq', expires_at: '2027-01-01', verified_at: null }, [], today).state).toBe('unverified')
    const renewed = { kind: 'sto_coq', expires_at: '2027-10-01', verified_at: 'y' }
    expect(renewalStanding(LAPSED, [LAPSED, renewed], today).state).toBe('live')
  })
  it('an expired row is never told it "stays valid"', () => {
    const zh = renewHintText('sto_coq', renewalStanding(LAPSED, [LAPSED], today), true)
    expect(zh).not.toContain('继续有效')
    expect(zh).toContain('派单会跳过你')
    expect(renewHintText('sto_coq', renewalStanding(LAPSED, [LAPSED], today), false)).toContain('dispatch skips you')
    expect(renewHintText('sto_coq', renewalStanding(LIVE, [LIVE], today), true)).toContain('继续有效')
    const page = read('app/provider/onboard/page.tsx')
    expect(page).toContain('setRenewHint(c)')
    expect(page).toContain('renewHintText(renewHint.kind, renewalStanding(')
  })
})

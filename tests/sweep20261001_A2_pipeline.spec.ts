// Sweep 2026-10-01 · group A2 (agent pipeline): approval cards, execution
// outcomes, proposable action types, memories in session, hard constraints.
//   #1  approved-but-unexecuted cards are never orphaned (resume / 现在执行 / 放弃)
//   #2/#3/#21/#37/#49  a chat turn may only propose cards an executor can carry out
//   #12 a failed preview says why and blocks approve; "approval is the effect" only for no executor
//   #13 the owned-listing match never reads archived listings
//   #36/#41 panel memory writes reach the next turn; merges keyed by role · type · key
//   #39 hard constraints use only this hat's memories
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { readFileSync } from 'node:fs'

const h = vi.hoisted(() => {
  type Call = { table: string; op: string; payload: unknown; filters: unknown[] }
  const calls: Call[] = []
  const state = {
    approved: [] as Record<string, unknown>[],
    pending: [] as Record<string, unknown>[],
    loaderMemories: [] as Record<string, unknown>[],
    memRows: [] as Record<string, unknown>[],
    decideRow: null as Record<string, unknown> | null,
    turnWrites: [] as Record<string, unknown>[],
    // review 2026-10-01: failed / empty updates, the re-read row, failed list reads, RPC errors
    updateMode: 'ok' as 'ok' | 'fail' | 'none',
    rowState: null as Record<string, unknown> | null,
    readFail: false,
    rpcError: null as string | null,
  }
  function makeBuilder(table: string) {
    const st: { op?: string; payload?: unknown; filters: unknown[] } = { filters: [] }
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => {
      if (['select', 'update', 'insert', 'delete', 'upsert'].includes(name) && !st.op) { st.op = name; st.payload = args[0] } else st.filters.push([name, ...args])
      return b
    }
    for (const n of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'neq', 'in', 'or', 'order', 'limit', 'is', 'not']) b[n] = chain(n)
    const exec = async () => {
      calls.push({ table, op: st.op!, payload: st.payload, filters: st.filters })
      if (table === 'user_memories' && st.op === 'select') return { data: state.memRows, error: null }
      if (table === 'agent_threads' && st.op === 'insert') return { data: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, error: null }
      if (table === 'agent_pending_actions' && st.op === 'update') {
        if (state.updateMode === 'fail') return { data: null, error: { message: 'Failed to fetch' } }
        if (state.updateMode === 'none') return { data: null, error: null }
        const id = (st.filters.find((f) => Array.isArray(f) && f[0] === 'eq' && f[1] === 'id') as unknown[] | undefined)?.[2]
        return { data: { id, metadata: { thread_id: null } }, error: null }
      }
      if (table === 'agent_pending_actions' && st.op === 'select') {
        if (st.payload === 'status, executed_at') return { data: state.rowState, error: null }
        if (state.readFail) return { data: null, error: { message: 'Failed to fetch' } }
        return { data: [], error: null }
      }
      return { data: null, error: null }
    }
    b.maybeSingle = exec
    b.single = exec
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec().then(res, rej)
    return b
  }
  const fake = {
    from: makeBuilder,
    rpc: async (fn: string) => {
      calls.push({ table: `rpc:${fn}`, op: 'rpc', payload: null, filters: [] })
      if (state.rpcError) return { data: null, error: { message: state.rpcError } }
      return { data: state.decideRow, error: null }
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
  }
  const turn = vi.fn(async (args: { message: string; memories: unknown[] }) => ({
    result: { title: 'r', body: `reply-${args.message}` }, memoryWrites: state.turnWrites, proposedAction: null, nextStage: null,
  }))
  const fetchMock = vi.fn()
  return { calls, state, fake, turn, fetchMock }
})

vi.mock('@/lib/supabase', () => ({ supabase: h.fake, getSupabaseBrowser: () => h.fake }))
vi.mock('@/lib/useAuth', () => ({
  useAuth: () => ({ loading: false, user: { id: 'u1', email: 'u@x.test' }, session: null, role: 'tenant', fullName: null, email: 'u@x.test', setRole: () => {}, signOut: async () => {} }),
}))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: 'zh', t: (_k: string, f: string) => f }), useI18n: () => ({ lang: 'zh', t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/aiName', () => ({ getAIName: () => 'Luna', setAIName: () => {}, getStoredAIName: () => null, getDefaultName: () => 'AI Agent', clearCachedAiNames: () => {}, dropForeignAIName: () => {}, useAIName: () => 'Luna', GENERIC_AI_NAME: 'AI Agent' }))
vi.mock('@/lib/agent/session-loader', () => ({
  loadAgentSession: async (_c: unknown, role: string) => ({
    session: { id: 's1' },
    agent: { id: 'cfg1', user_id: 'u1', role, agent_name: 'Luna' },
    workflow: { workflow_type: `${role}_x`, workflow_id: null, current_stage: 'intake', completed_steps: [], status: 'active' },
    status: 'idle', memories: h.state.loaderMemories, pendingActions: h.state.pending, recommendations: [],
    approvedUnexecuted: h.state.approved,
  }),
}))
vi.mock('@/lib/agent/orchestrator', async (orig) => {
  const m = (await orig()) as Record<string, unknown>
  return { ...m, runAgentTurn: (args: { message: string; memories: unknown[] }) => h.turn(args) }
})

import { useAgentSession, type UseAgentSession } from '@/lib/agent/useAgentSession'
import { alreadyRanText, cardExpiredText, decidedRowFor, executionReasonText, notExecutedText } from '@/lib/agent/chatCopy'
import { droppedProposalNote, gateProposedAction, PROPOSABLE_ACTIONS } from '@/lib/agent/maintenanceTriage'
import { classifyApproved, EXECUTABLE_ACTION_TYPES, isExecutableAction, RESUME_WINDOW_MS, resumeDelayMs, UNDO_FAILED_KEY, type DecidedAction, type DecideOutcome } from '@/lib/agent/approval-engine'
import { applyHardConstraints, memoriesForHat } from '@/lib/agent/hardConstraints'
import { buildSystemPrompt, renewalPlaybook } from '@/lib/agent/prompts'
import type { MemoryItem } from '@/lib/agent/types'

const read = (p: string) => readFileSync(p, 'utf8')

// ---- minimal browser globals (window events, location, history, localStorage, fetch)
class MemStorage {
  m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  get length() { return this.m.size }
}
const win = new EventTarget() as EventTarget & Record<string, unknown>
win.location = { search: '', pathname: '/tenant/agent', hash: '' }
win.history = { replaceState: () => {} }
win.localStorage = new MemStorage()
;(globalThis as Record<string, unknown>).window = win
;(globalThis as Record<string, unknown>).localStorage = win.localStorage
;(globalThis as Record<string, unknown>).fetch = h.fetchMock

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let latest: UseAgentSession | null = null
function Probe() { latest = useAgentSession('tenant'); return null }
function ProbeNoResume() { latest = useAgentSession('tenant', { resumeApproved: false }); return null }
const respond = (status: number, body: unknown) => h.fetchMock.mockResolvedValueOnce({ status, ok: status >= 200 && status < 300, json: async () => body })
const card = (id: string, extra: Record<string, unknown> = {}) => ({
  id, user_id: 'u1', role: 'tenant', action_type: 'send_message', title: `card ${id}`, summary: '', recipient_label: null,
  data_scope: [], excluded_data: [], risk_level: 'low', status: 'approved', requires_approval: true, created_at: new Date().toISOString(),
  expires_at: null, metadata: {}, decided_at: null, executed_at: null, execution_result: null, approved_option: null, ...extra,
})
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const texts = () => latest!.messages.map((m) => m.text)
async function mount() {
  let r!: TestRenderer.ReactTestRenderer
  await act(async () => { r = TestRenderer.create(React.createElement(Probe)) })
  await act(async () => { await sleep(60) })
  return r
}

beforeEach(() => {
  h.calls.length = 0
  h.fetchMock.mockReset()
  h.turn.mockClear()
  Object.assign(h.state, { approved: [], pending: [], loaderMemories: [], memRows: [], decideRow: null, turnWrites: [], updateMode: 'ok', rowState: null, readFail: false, rpcError: null })
  ;(win.localStorage as MemStorage).clear()
  latest = null
})

describe('#1 approved cards that never ran are not orphaned (hook behaviour)', () => {
  it('a card approved a minute ago resumes and runs on load; the done line is posted', async () => {
    h.state.approved = [card('a1', { decided_at: ago(61_000) })]
    respond(200, { executed: true, result: { sent_to: '房东（在管租约对话）', kind: 'thread' } })
    const r = await mount()
    await act(async () => { await sleep(60) })
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(h.fetchMock.mock.calls[0][1].body).action_id).toBe('a1')
    expect(texts().some((t) => t.startsWith('✅ 已执行'))).toBe(true)
    expect(latest!.scheduled).toEqual({})
    expect(latest!.data!.pendingActions.find((a) => a.id === 'a1')).toBeUndefined()
    await act(async () => { r.unmount() })
  })

  it('an old one waits as 「已批准，尚未执行」; 现在执行 that fails keeps it with the reason; 放弃 withdraws it under RLS', async () => {
    h.state.approved = [card('a2', { decided_at: ago(20 * 60_000) })]
    const r = await mount()
    expect(h.fetchMock).not.toHaveBeenCalled()
    const row = latest!.data!.pendingActions.find((a) => a.id === 'a2') as DecidedAction
    expect(row.status).toBe('approved')
    expect(row.execution_result?.reason).toBe('interrupted')
    respond(422, { executed: false, reason: 'no_household_on_file' })
    await act(async () => { await latest!.decide('a2', 'approved') })
    const after = latest!.data!.pendingActions.find((a) => a.id === 'a2') as DecidedAction
    expect(after.status).toBe('approved')
    expect(after.execution_result?.reason).toBe('no_household_on_file')
    const last = texts().at(-1)!
    expect(last).toContain('现在执行')
    expect(last).toContain('/leases/import')
    expect(last).not.toContain('租客邮箱')
    expect(latest!.notice?.text).toBe(last) // the to-do page shows the same outcome
    await act(async () => { await latest!.decide('a2', 'rejected') })
    const upd = h.calls.find((c) => c.table === 'agent_pending_actions' && c.op === 'update')!
    expect(upd.payload).toEqual({ status: 'rejected' })
    expect(upd.filters).toContainEqual(['eq', 'status', 'approved'])
    expect(upd.filters).toContainEqual(['is', 'executed_at', null])
    expect(h.calls.some((c) => c.table === 'agent_audit_events' && (c.payload as { action?: string }).action === 'approval_abandoned')).toBe(true)
    expect(latest!.data!.pendingActions.find((a) => a.id === 'a2')).toBeUndefined()
    await act(async () => { r.unmount() })
  })

  it('expired:true removes the card and says why; no_executor_for_type is never a silent success', async () => {
    h.state.approved = [card('a3', { decided_at: ago(30 * 60_000) }), card('a4', { decided_at: ago(30 * 60_000), action_type: 'submit_application' })]
    const r = await mount()
    respond(409, { executed: false, reason: 'lease_ended', expired: true })
    await act(async () => { await latest!.decide('a3', 'approved') })
    expect(latest!.data!.pendingActions.find((a) => a.id === 'a3')).toBeUndefined()
    expect(texts().at(-1)).toContain('这份租约已经结束')
    expect(texts().at(-1)).toContain('什么也没有发出')
    respond(200, { executed: false, reason: 'no_executor_for_type' })
    await act(async () => { await latest!.decide('a4', 'approved') })
    expect(latest!.data!.pendingActions.find((a) => a.id === 'a4')).toBeUndefined()
    expect(texts().at(-1)).not.toMatch(/✅/)
    const retire = h.calls.find((c) => c.table === 'agent_pending_actions' && c.op === 'update' && (c.payload as { status?: string }).status === 'expired')
    expect(retire).toBeTruthy()
    await act(async () => { r.unmount() })
  })

  it('a fresh renewal letter without a recorded A/B is not sent on a guess', async () => {
    h.state.approved = [card('a5', { decided_at: ago(5_000), action_type: 'send_renewal_letter' })]
    const r = await mount()
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(latest!.data!.pendingActions.find((a) => a.id === 'a5')?.status).toBe('approved')
    await act(async () => { await latest!.decide('a5', 'approved') }) // no option → nothing runs
    expect(h.fetchMock).not.toHaveBeenCalled()
    await act(async () => { r.unmount() })
  })

  it('a card the decide RPC retired as expired (C1) is not scheduled', async () => {
    h.state.pending = [card('p1', { status: 'pending' })]
    h.state.decideRow = card('p1', { status: 'expired' })
    const r = await mount()
    await act(async () => { await latest!.decide('p1', 'approved') })
    expect(latest!.scheduled).toEqual({})
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(texts().at(-1)).toContain('已过期')
    await act(async () => { r.unmount() })
  })
})

describe('#36 #41 memories: panel writes reach the next turn; merge keyed by role · type · key', () => {
  it('a memory forgotten in the panel is not sent with the next turn', async () => {
    h.state.loaderMemories = [{ key: 'budget', label: '预算', value: { max: 2000 }, confidence: 1, memory_type: 'constraint', role: 'tenant' }]
    const r = await mount()
    h.state.memRows = [] // the panel deleted the row
    await act(async () => { win.dispatchEvent(new Event('sl-memories-changed')); await latest!.sendMessage('帮我在 Annex 找房') })
    expect(h.turn).toHaveBeenCalledTimes(1)
    expect(h.turn.mock.calls[0][0].memories).toEqual([])
    await act(async () => { r.unmount() })
  })

  it('rows as stored replace only the same role · type · key; another hat’s row with the same key stays', async () => {
    h.state.loaderMemories = [
      { key: 'budget', label: '客户预算', value: { max: 4000 }, confidence: 1, memory_type: 'preference', role: 'agent' },
      { key: 'budget', label: '预算', value: { max: 2000 }, confidence: 1, memory_type: 'constraint', role: 'tenant' },
    ]
    h.state.turnWrites = [{ key: 'budget', label: '预算', value: { max: 2600 }, confidence: 0.9, memory_type: 'constraint', role: 'tenant', source: 'agent_turn' }]
    const r = await mount()
    await act(async () => { await latest!.sendMessage('预算改成 2600') })
    const mems = latest!.data!.memories
    expect(mems.map((m) => `${m.role}:${JSON.stringify(m.value)}`)).toEqual(['tenant:{"max":2600}', 'agent:{"max":4000}'])
    await act(async () => { r.unmount() })
  })
})

describe('#2 #3 #21 #37 #49 only cards an executor can carry out are proposable', () => {
  const meta = (o: Record<string, string> = {}) => o
  it('tenant: maintenance_request and send_message with a body; nothing else', () => {
    expect(gateProposedAction('tenant', { action_type: 'maintenance_request', metadata: meta() }).action).not.toBeNull()
    expect(gateProposedAction('tenant', { action_type: 'send_message', metadata: meta({ body: '你好，水龙头坏了' }) }).action).not.toBeNull()
    expect(gateProposedAction('tenant', { action_type: 'send_message', metadata: meta({ subject: 'x' }) }).dropped).toEqual({ type: 'send_message', why: 'no_body' })
    for (const t of ['submit_application', 'payment_authorization', 'sign_lease', 'share_passport_summary', 'tier_upgrade', 'send_renewal_letter', 'renewal_note']) {
      expect(gateProposedAction('tenant', { action_type: t, metadata: meta() }).dropped?.why, t).toBe('not_proposable')
    }
  })
  it('landlord and agent: no card at all (decisions, leases and messages live on their pages)', () => {
    for (const t of ['approve_applicant', 'reject_applicant', 'send_lease', 'send_message', 'dispatch_agent', 'send_decision']) {
      expect(gateProposedAction('landlord', { action_type: t, metadata: meta({ body: 'x' }) }).action, t).toBeNull()
    }
    for (const t of ['accept_showing', 'schedule_viewing', 'send_feedback', 'request_payout', 'send_message']) {
      expect(gateProposedAction('agent', { action_type: t, metadata: meta({ body: 'x' }) }).action, t).toBeNull()
    }
  })
  it('every proposable type has an executor', () => {
    for (const types of Object.values(PROPOSABLE_ACTIONS)) for (const t of types) expect(isExecutableAction(t), t).toBe(true)
    expect(EXECUTABLE_ACTION_TYPES).not.toContain('renewal_note')
  })
  it('the dropped note says nothing ran and points to the page that does it', () => {
    const reject = droppedProposalNote('landlord', { type: 'reject_applicant', why: 'not_proposable' }, true)
    expect(reject).toContain('/landlord/applicants')
    expect(reject).toContain('没有发出任何通知')
    expect(droppedProposalNote('landlord', { type: 'send_lease', why: 'not_proposable' }, true)).toContain('/landlord/leases')
    expect(droppedProposalNote('agent', { type: 'send_message', why: 'not_proposable' }, true)).toContain('/agent/clients')
    expect(droppedProposalNote('tenant', { type: 'send_message', why: 'no_body' }, false)).toContain('nothing was sent')
  })
  it('the turn route gates after the guardrail and no longer renames renewals', () => {
    const r = read('app/api/agent/turn/route.ts')
    expect(r).not.toContain('renewal_note')
    expect(r.indexOf('const gate = gateProposedAction(role, out.proposedAction)')).toBeGreaterThan(r.indexOf('applyGuardrail(role, normalized, uiLang)'))
    expect(r).toContain('out.reply += droppedProposalNote(role, gate.dropped,')
  })
  it('prompts no longer invite cards without an executor, and route the work to real pages', () => {
    const wf = { workflow_type: 'general', workflow_id: null, current_stage: 'idle', completed_steps: [], status: 'active' as const }
    const dead = ['submit_application', 'approve_applicant', 'reject_applicant', 'request_payout', 'dispatch_agent', 'schedule_viewing', 'accept_showing', 'payment_authorization', 'share_passport_summary', 'tier_upgrade', 'Stripe 预授权', '结算分成）']
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      const p = buildSystemPrompt(role, 'Atlas', [], wf)
      for (const d of dead) expect(p, `${role}: ${d}`).not.toContain(d)
    }
    const landlord = buildSystemPrompt('landlord', 'Atlas', [], wf)
    expect(landlord).toContain('不产出任何 proposed_action')
    expect(landlord).toContain('/landlord/applicants 打开那位申请人')
    expect(landlord).toContain('/landlord/leases 打开那份租约')
    expect(landlord).not.toContain('"action_type"')
    const agent = buildSystemPrompt('agent', 'Atlas', [], wf)
    expect(agent).toContain('不产出任何 proposed_action')
    expect(agent).toContain('/agent/clients 那一行的「发消息」')
    const tenant = buildSystemPrompt('tenant', 'Atlas', [], wf)
    expect(tenant).toContain('metadata.body')
    expect(tenant).toContain('"body": "send_message 要发出的完整正文(必填)"')
    expect(renewalPlaybook('x')).toContain('metadata.body 写回信全文')
  })
})

describe('#1 #12 execution outcomes are told honestly', () => {
  it('reason codes map to plain words; unknown codes are shown, never guessed', () => {
    expect(executionReasonText('no_executor_for_type', true)).toContain('不会发送或改变任何东西')
    expect(executionReasonText('past_n1_deadline', true)).toContain('N1')
    expect(executionReasonText('hourly send limit reached', false)).toContain('send limit')
    expect(executionReasonText('action is pending, not approved', true)).toContain('待批准')
    expect(executionReasonText('provider_not_eligible:city', true)).toContain('资质')
    expect(executionReasonText('weird_code_x', true)).toContain('weird_code_x')
    for (const c of ['pro_required', 'provider_not_eligible:trade', 'work_order_already_answered', 'lease_id missing']) {
      expect(executionReasonText(c, true), c).not.toContain('租客邮箱')
    }
  })
  it('a not-run card offers 现在执行 / 放弃; an expired one says nothing was sent', () => {
    expect(notExecutedText('send failed', true)).toMatch(/现在执行[\s\S]*放弃/)
    expect(cardExpiredText('续约函', 'lease_superseded', true)).toContain('什么也没有发出')
    expect(alreadyRanText('续约函', true)).toContain('没有重复发送')
  })
  it('classify: fresh → resume; old, failed, or an option-less renewal → stalled', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    const at = (ms: number) => new Date(now - ms).toISOString()
    const c = (o: Partial<DecidedAction>) => card('x', o as Record<string, unknown>) as unknown as DecidedAction
    expect(classifyApproved(c({ decided_at: at(30_000) }), now)).toBe('resume')
    expect(classifyApproved(c({ decided_at: at(RESUME_WINDOW_MS + 1) }), now)).toBe('stalled')
    expect(classifyApproved(c({ decided_at: null }), now)).toBe('stalled')
    expect(classifyApproved(c({ decided_at: at(30_000), execution_result: { ok: false, reason: 'send failed' } }), now)).toBe('stalled')
    expect(classifyApproved(c({ decided_at: at(30_000), action_type: 'send_renewal_letter' }), now)).toBe('stalled')
    expect(classifyApproved(c({ decided_at: at(30_000), action_type: 'send_renewal_letter', approved_option: 'B' }), now)).toBe('resume')
    expect(resumeDelayMs(c({ decided_at: at(20_000) }), now, 60_000)).toBe(40_000)
    expect(resumeDelayMs(c({ decided_at: at(90_000) }), now, 60_000)).toBe(0)
  })
  it('the hook no longer treats no_executor_for_type as success nor promises a retry that does not exist', () => {
    const s = read('lib/agent/useAgentSession.ts')
    expect(s).not.toContain('Approval-only action type — the approval itself was the effect')
    expect(s).not.toContain('或让我检查租客邮箱是否有误')
    expect(s).toContain("if (decided?.status === 'expired') {")
    expect(s).toContain('resumeRef.current(session.approvedUnexecuted ?? [])')
    expect(s).toContain("if (!note && option) note = optionNote(option)")
    expect(read('lib/agent/session-loader.ts')).toContain('const approvedP = getApprovedUnexecuted(client, role)')
  })
  it('preview failures show the reason and block approve; "nothing to preview" only for no executor', () => {
    const c = read('components/agent/ApprovalActionCard.tsx')
    expect(c).not.toContain('批准即记录')
    expect(c).not.toContain('approval is the effect')
    expect(c).toContain("if (res.ok && j.reason === 'no_executor_for_type') { setPreviewErr(null); setPreview('none'); return }")
    expect(c).toContain('disabled={busy !== null || approveBlocked}')
    expect(c).toContain('export function StalledActionRow(')
  })
  it('the chat shows the countdown, the not-run cards, and never claims a decided card was handed off', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).not.toContain('已交给 AI 助理执行')
    expect(chat).toContain('<StalledActionRow')
    expect(chat).toContain('{scheduledIds.map((id) => (')
    const todo = read('components/mobile/RolePages.tsx')
    expect(todo).toContain('<StalledActionRow key={a.id} action={a} onDecide={decide} />')
    expect(todo).toContain('data-testid="todo-notice"')
  })
})

describe('#13 the owned-listing match never reads archived listings', () => {
  it('both landlord listing queries in the turn route exclude status=archived', () => {
    const r = read('app/api/agent/turn/route.ts')
    expect(r).toContain(".from('listings').select('*').in('landlord_id', ids).or('status.is.null,status.neq.archived')")
    expect((r.match(/\.or\('status\.is\.null,status\.neq\.archived'\)/g) || []).length).toBe(2)
  })
})

describe('#39 hard constraints use only this hat’s memories', () => {
  const m = (key: string, value: unknown, role?: string, label = key): MemoryItem => ({ key, label, value, confidence: 1, memory_type: 'preference', role })
  const mems = [m('client_budget', { max: 4000 }, 'agent', '客户 Mia 的预算'), m('unit_bedrooms', 3, 'landlord'), m('budget', 2800, 'tenant')]
  it('another hat’s budget or bedrooms never cap the tenant search', () => {
    const r = applyHardConstraints('帮我在 Annex 找房', mems, {}, { role: 'tenant' })
    expect(r.constraints.max_price).toBe(2800)
    expect(r.constraints.min_beds).toBeNull()
    const none = applyHardConstraints('帮我在 Annex 找房', mems.slice(0, 2), {}, { role: 'tenant' })
    expect(none.constraints.max_price).toBeNull()
    expect(none.constraints.from_memory).toEqual([])
  })
  it('this turn’s fresh writes count; role-less memories (legacy callers) still count', () => {
    const r = applyHardConstraints('找房', mems.slice(0, 2), {}, { role: 'tenant', fresh: [m('budget', { max: 2500 })] })
    expect(r.constraints.max_price).toBe(2500)
    expect(memoriesForHat([m('budget', 1, undefined), m('budget', 2, 'agent')], 'tenant').map((x) => x.value)).toEqual([1])
    expect(read('app/api/agent/turn/route.ts')).toContain('}, { role, fresh: out.memoryWrites })')
  })
})

describe('#41 the turn returns memory rows as stored', () => {
  it('orchestrator hands the session what upsertMemories stored, never the model’s raw items', () => {
    const o = read('lib/agent/orchestrator.ts')
    expect(o).toContain('memoryWrites = await upsertMemories(client, userId, role, modelWrites)')
    expect(o).not.toContain('const memoryWrites = anonymous ? [] : (turn.memory_writes ?? [])')
    const s = read('lib/agent/useAgentSession.ts')
    expect(s).toContain('const memKey = (m: MemoryItem, role: AgentRole) => `${m.role ?? role}|${m.memory_type}|${m.key}`')
    expect(s).toContain("window.addEventListener(MEMORIES_CHANGED_EVENT, h)")
    expect(s).toContain('memories: memoriesRef.current,')
  })
})

describe('review 2026-10-01: undo, 放弃 and refresh never misreport; resume only where it is visible', () => {
  const pendingCard = (id: string) => card(id, { status: 'pending' })
  async function approveThenUndo(id: string) {
    h.state.pending = [pendingCard(id)]
    h.state.decideRow = card(id, { status: 'approved', decided_at: new Date().toISOString() })
    const r = await mount()
    let p!: Promise<DecideOutcome>
    await act(async () => { p = latest!.decide(id, 'approved'); await sleep(20) })
    expect(Object.keys(latest!.scheduled)).toEqual([id])
    return { r, done: () => p }
  }

  it('a failed undo holds the card (「已批准，尚未执行」), says so, never runs, and a reload does not resume it', async () => {
    const { r, done } = await approveThenUndo('u1')
    h.state.updateMode = 'fail'
    h.state.rowState = { status: 'approved', executed_at: null }
    await act(async () => { await latest!.undo('u1') })
    let outcome: DecideOutcome | undefined
    await act(async () => { outcome = await done() })
    expect(outcome).toBe('undone')
    expect(h.fetchMock).not.toHaveBeenCalled()
    const held = latest!.data!.pendingActions.find((a) => a.id === 'u1') as DecidedAction
    expect(held.status).toBe('approved')
    expect(held.execution_result?.reason).toBe('undo_failed')
    expect(texts().at(-1)).toContain('撤销没有成功')
    expect(texts().at(-1)).toContain('不会再自动执行')
    expect(JSON.parse((win.localStorage as MemStorage).getItem(UNDO_FAILED_KEY)!)).toHaveProperty('u1')
    expect(h.calls.some((c) => c.table === 'agent_pending_actions' && c.op === 'update' && (c.payload as { execution_result?: { reason?: string } }).execution_result?.reason === 'undo_failed')).toBe(true)
    expect(executionReasonText('undo_failed', true)).toContain('撤销没有成功')
    await act(async () => { r.unmount() })
    // Next load, 5 s after the approval: the countdown the person took back is not resumed.
    h.state.updateMode = 'ok'
    h.state.approved = [card('u1', { decided_at: ago(5_000) })]
    const r2 = await mount()
    await act(async () => { await sleep(30) })
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(latest!.scheduled).toEqual({})
    expect((latest!.data!.pendingActions.find((a) => a.id === 'u1') as DecidedAction).execution_result?.reason).toBe('undo_failed')
    await act(async () => { r2.unmount() })
  })

  it('an undo that arrives after another tab ran it says it could not be taken back', async () => {
    const { r, done } = await approveThenUndo('u2')
    h.state.updateMode = 'none'
    h.state.rowState = { status: 'approved', executed_at: new Date().toISOString() }
    await act(async () => { await latest!.undo('u2'); await done() })
    expect(texts().at(-1)).toContain('撤回没有生效')
    expect(latest!.data!.pendingActions.find((a) => a.id === 'u2')).toBeUndefined()
    expect((win.localStorage as MemStorage).getItem(UNDO_FAILED_KEY)).toBeNull()
    await act(async () => { r.unmount() })
  })

  it('放弃 reports what happened: abandoned only when it landed, already_ran when it had run', async () => {
    h.state.approved = [card('d1', { decided_at: ago(20 * 60_000) }), card('d2', { decided_at: ago(20 * 60_000) })]
    const r = await mount()
    let o1: DecideOutcome | undefined
    await act(async () => { o1 = await latest!.decide('d1', 'rejected') })
    expect(o1).toBe('abandoned')
    h.state.updateMode = 'none'
    h.state.rowState = { status: 'approved', executed_at: new Date().toISOString() }
    let o2: DecideOutcome | undefined
    await act(async () => { o2 = await latest!.decide('d2', 'rejected') })
    expect(o2).toBe('already_ran')
    expect(texts().at(-1)).toContain('撤回没有生效')
    expect(h.calls.filter((c) => c.table === 'agent_audit_events' && (c.payload as { action?: string }).action === 'approval_abandoned')).toHaveLength(1)
    // A failed write keeps the card and reports an error, never "dropped".
    h.state.approved = []
    await act(async () => { r.unmount() })
    h.state.approved = [card('d3', { decided_at: ago(20 * 60_000) })]
    h.state.updateMode = 'fail'
    const r2 = await mount()
    let o3: DecideOutcome | undefined
    await act(async () => { o3 = await latest!.decide('d3', 'rejected') })
    expect(o3).toBe('error')
    expect(latest!.data!.pendingActions.find((a) => a.id === 'd3')?.status).toBe('approved')
    await act(async () => { r2.unmount() })
  })

  it('an RPC refusal is not_run, an expired card is expired — and a read error keeps the other cards', async () => {
    h.state.pending = [pendingCard('p1'), pendingCard('p2')]
    const r = await mount()
    h.state.rpcError = 'action is not pending'
    h.state.readFail = true
    let o: DecideOutcome | undefined
    await act(async () => { o = await latest!.decide('p1', 'approved'); await sleep(20) })
    expect(o).toBe('not_run')
    expect(latest!.data!.pendingActions.map((a) => a.id)).toEqual(['p2'])
    h.state.rpcError = null
    h.state.readFail = false
    h.state.decideRow = card('p2', { status: 'expired' })
    await act(async () => { o = await latest!.decide('p2', 'approved') })
    expect(o).toBe('expired')
    await act(async () => { r.unmount() })
  })

  it('a resumed card that comes back 409 really re-reads the to-dos (live read through a ref)', async () => {
    h.state.approved = [card('r1', { decided_at: ago(61_000) })]
    respond(409, { executed: false, reason: 'action is rejected, not approved' })
    const r = await mount()
    await act(async () => { await sleep(60) })
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
    expect(texts().at(-1)).toContain('我重新读取了待办')
    expect(h.calls.some((c) => c.table === 'agent_pending_actions' && c.op === 'select' && c.payload === '*')).toBe(true)
    await act(async () => { r.unmount() })
  })

  it('pages that cannot show a countdown never resume one', async () => {
    h.state.approved = [card('n1', { decided_at: ago(61_000) })]
    let r!: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(React.createElement(ProbeNoResume)) })
    await act(async () => { await sleep(80) })
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(latest!.scheduled).toEqual({})
    await act(async () => { r.unmount() })
    const pages = read('components/mobile/RolePages.tsx')
    expect((pages.match(/useAgentSession\(role, \{ resumeApproved: false \}\)/g) || []).length).toBe(2)
    expect(pages).toContain('const { loading, live, data, decide, scheduled, undo, notice, dismissNotice } = useAgentSession(role)')
  })

  it('the collapsed line follows the outcome, not the button', () => {
    expect(decidedRowFor('expired', 'approved')).toBe('expired')
    expect(decidedRowFor('not_run', 'approved')).toBe('not_run')
    expect(decidedRowFor('undone', 'approved')).toBeNull()
    expect(decidedRowFor('error', 'rejected', true)).toBeNull()
    expect(decidedRowFor('already_ran', 'rejected', true)).toBe('approved')
    expect(decidedRowFor('abandoned', 'rejected', true)).toBe('abandoned')
    expect(decidedRowFor(undefined, 'approved')).toBe('approved') // the homepage film reports no outcome
    expect(decidedRowFor(undefined, 'rejected', true)).toBe('abandoned')
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('recordDecided(id, a.title, outcome, decision, true)')
    expect(chat).toContain('recordDecided(id, a.title, outcome, decision, false)')
    expect(chat).toContain("'已失效 · 没有执行'")
    expect(chat).not.toContain("decision: decision === 'approved' ? 'approved' : 'abandoned'")
  })

  it('classify holds an undo that failed; a blocking preview error can be re-checked', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    const fresh = card('x1', { decided_at: new Date(now - 5_000).toISOString() }) as unknown as DecidedAction
    expect(classifyApproved(fresh, now)).toBe('resume')
    expect(classifyApproved(fresh, now, new Set(['x1']))).toBe('stalled')
    expect(classifyApproved({ ...fresh, execution_result: { reason: 'undo_failed' } }, now)).toBe('stalled')
    const c = read('components/agent/ApprovalActionCard.tsx')
    expect(c).toContain('onClick={() => loadPreview(previewOpt)} data-recheck')
    expect(c).toContain("zh ? '重新检查' : 'Check again'")
  })

  it('the tenant prompt promises the real channel; the no-body note does not contradict a letter in the reply', () => {
    const wf = { workflow_type: 'general', workflow_id: null, current_stage: 'idle', completed_steps: [], status: 'active' as const }
    const tenant = buildSystemPrompt('tenant', 'Atlas', [], wf)
    expect(tenant).toContain('否则由 Stayloop 发一封邮件给房东')
    expect(tenant).not.toContain('确认后发到你和房东的在管租约对话')
    expect(renewalPlaybook('x')).not.toContain('才会发到他和房东的在管租约对话')
    expect(renewalPlaybook('x')).toContain('否则由 Stayloop 发一封邮件给房东')
    const zhNote = droppedProposalNote('tenant', { type: 'send_message', why: 'no_body' }, true)
    expect(zhNote).not.toContain('我还没写好')
    expect(zhNote).toContain('没有放进待确认卡片')
    expect(zhNote).toContain('没有发出任何消息')
  })
})

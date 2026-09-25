// Behavioural regression test for lib/agent/useAgentSession.ts thread handling
// (review 2026-09-25). The reviewer reproduced four timing bugs by rendering the
// hook for real; this file keeps those scenarios and asserts the FIXED behaviour:
//   A. opening a page does not rewrite the thread row (loading ≠ a change);
//   B. a message sent while the thread is still resolving waits for it — no
//      orphan row, the user's line stays on screen, the reply lands in it;
//   C. "+" while the initial resolve is in flight wins over the late resolve;
//   D. a reply that arrives after the user opened another conversation is
//      written to the thread it was asked in, not the one on screen.
// Supabase / auth / the session loader / the model turn are mocked — nothing
// touches the network. react-test-renderer drives the hook.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const h = vi.hoisted(() => {
  type Call = { table: string; op: string; payload: unknown; filters: unknown[] }
  const calls: Call[] = []
  const gate = { select: null as Promise<void> | null, turn: null as Promise<void> | null }
  let threadRow: Record<string, unknown> | null = null
  const setThreadRow = (r: Record<string, unknown> | null) => { threadRow = r }
  function makeBuilder(table: string) {
    const st: { op?: string; payload?: unknown; filters: unknown[] } = { filters: [] }
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => {
      if (['select', 'update', 'insert', 'delete', 'upsert'].includes(name) && !st.op) { st.op = name; st.payload = args[0] } else st.filters.push([name, ...args])
      return b
    }
    for (const n of ['select', 'update', 'insert', 'delete', 'upsert', 'eq', 'order', 'limit', 'is', 'not']) b[n] = chain(n)
    const exec = async () => {
      if (table === 'agent_threads' && st.op === 'select' && gate.select) await gate.select
      calls.push({ table, op: st.op!, payload: st.payload, filters: st.filters })
      if (table === 'agent_threads' && st.op === 'select') return { data: threadRow, error: null }
      if (table === 'agent_threads' && st.op === 'insert') return { data: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, error: null }
      return { data: null, error: null }
    }
    b.maybeSingle = exec
    b.single = exec
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec().then(res, rej)
    return b
  }
  const fake = { from: makeBuilder, auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }
  const turn = vi.fn(async (args: { message: string; threadId?: string | null }) => {
    if (gate.turn) await gate.turn
    return { result: { title: 'r', body: `reply-${args.message}` }, memoryWrites: [], proposedAction: null, nextStage: null }
  })
  return { calls, gate, fake, turn, setThreadRow }
})

vi.mock('@/lib/supabase', () => ({ supabase: h.fake, getSupabaseBrowser: () => h.fake }))
vi.mock('@/lib/useAuth', () => ({
  useAuth: () => ({ loading: false, user: { id: 'u1', email: 'u@x.test' }, session: null, role: 'tenant', fullName: null, email: 'u@x.test', setRole: () => {}, signOut: async () => {} }),
}))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: 'zh', t: (_k: string, f: string) => f }), useI18n: () => ({ lang: 'zh', t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/aiName', () => ({ getAIName: () => 'Luna', setAIName: () => {}, getStoredAIName: () => null, getDefaultName: () => 'AI Agent', clearCachedAiNames: () => {}, useAIName: () => 'Luna', GENERIC_AI_NAME: 'AI Agent' }))
vi.mock('@/lib/agent/session-loader', () => ({
  loadAgentSession: async (_c: unknown, role: string) => ({
    session: { id: 's1' },
    agent: { id: 'cfg1', user_id: 'u1', role, agent_name: 'Luna' },
    workflow: { workflow_type: `${role}_x`, workflow_id: null, current_stage: 'intake', completed_steps: [], status: 'active' },
    status: 'idle', memories: [], pendingActions: [], recommendations: [],
  }),
}))
vi.mock('@/lib/agent/orchestrator', async (orig) => {
  const m = (await orig()) as Record<string, unknown>
  return { ...m, runAgentTurn: (args: { message: string; threadId?: string | null }) => h.turn(args) }
})

import { useAgentSession, type UseAgentSession } from '@/lib/agent/useAgentSession'

// ---- minimal browser globals (the hook only needs window events, location, history, localStorage)
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

// Real ids: loadThread / appendToThread only accept UUIDs (as every agent_threads row has).
const ID1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID9 = '11111111-1111-4111-8111-111111111111'
let latest: UseAgentSession | null = null
function Probe() { latest = useAgentSession('tenant'); return null }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const T1 = {
  id: ID1, title: '找房', created_at: '2026-09-24T10:00:00Z', updated_at: '2026-09-24T10:05:00Z',
  messages: [{ id: 'm1', role: 'agent', text: 'hi' }, { id: 'm2', role: 'user', text: '找房' }, { id: 'm3', role: 'agent', text: '好的' }],
}
const updatesTo = (id: string) => h.calls.filter((c) => c.table === 'agent_threads' && c.op === 'update' && c.filters.some((f) => Array.isArray(f) && f[0] === 'eq' && f[2] === id))
const inserts = () => h.calls.filter((c) => c.table === 'agent_threads' && c.op === 'insert')
const texts = () => latest!.messages.map((m) => m.text)

beforeEach(() => {
  h.calls.length = 0; h.gate.select = null; h.gate.turn = null; h.turn.mockClear(); latest = null
  ;(win.localStorage as MemStorage).clear()
  h.setThreadRow(T1)
})

describe('useAgentSession — conversation threads (fixed behaviour, review 2026-09-25)', () => {
  it('A. opening the page loads the thread without rewriting its row; a real message still persists', async () => {
    let r: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(<Probe />) })
    await act(async () => { await sleep(50) })   // settle + resolveThread
    expect(latest!.threadId).toBe(ID1)
    expect(texts()).toEqual(['hi', '找房', '好的'])
    await act(async () => { await sleep(1000) }) // past the 800 ms debounce
    expect(updatesTo(ID1)).toHaveLength(0)      // loading is not a change
    // …but a message the user sends is saved, with the timestamps bumped.
    await act(async () => { await latest!.sendMessage('再找几个') })
    await act(async () => { await sleep(1000) })
    const ups = updatesTo(ID1)
    expect(ups.length).toBeGreaterThanOrEqual(1)
    const patch = ups[ups.length - 1].payload as { messages: { text: string }[]; last_message_at: string }
    expect(patch.messages.map((m) => m.text)).toEqual(['hi', '找房', '好的', '再找几个', 'reply-再找几个'])
    expect(patch.last_message_at > '2026-09-24T10:05:00Z').toBe(true)
    await act(async () => { r!.unmount() })
  })

  it('B. a message sent while the thread is still resolving waits for it: no orphan row, the line stays, the reply lands in the resolved thread', async () => {
    let release!: () => void
    h.gate.select = new Promise<void>((res) => { release = res })
    let releaseTurn!: () => void
    h.gate.turn = new Promise<void>((res) => { releaseTurn = res })
    let r: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(<Probe />) })
    await act(async () => { await sleep(30) })
    expect(latest!.threadLoading).toBe(true)
    expect(latest!.threadId).toBeNull()
    // usePromptDeepLink fires here in the real page (loading is already false)
    const p = act(async () => { await latest!.sendMessage('hello from deep link') })
    await act(async () => { await sleep(30) })
    expect(inserts()).toHaveLength(0)            // nothing created for a thread we do not know yet
    expect(h.turn).not.toHaveBeenCalled()        // the turn waits for the thread
    await act(async () => { release(); await sleep(30) })
    expect(latest!.threadId).toBe(ID1)
    expect(texts()).toEqual(['hi', '找房', '好的', 'hello from deep link']) // the user's line survives the load
    expect(h.turn).toHaveBeenCalledTimes(1)
    expect(h.turn.mock.calls[0][0].threadId).toBe(ID1)
    await act(async () => { releaseTurn(); await p; await sleep(30) })
    expect(texts()).toEqual(['hi', '找房', '好的', 'hello from deep link', 'reply-hello from deep link'])
    await act(async () => { await sleep(1000) })
    expect(inserts()).toHaveLength(0)
    const saved = (updatesTo(ID1).at(-1)!.payload as { messages: { text: string }[] }).messages.map((m) => m.text)
    expect(saved).toContain('reply-hello from deep link')
    await act(async () => { r!.unmount() })
  })

  it('C. "+" while the initial resolve is in flight starts a new conversation and the late resolve is discarded', async () => {
    let release!: () => void
    h.gate.select = new Promise<void>((res) => { release = res })
    let r: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(<Probe />) })
    await act(async () => { await sleep(30) })
    await act(async () => { latest!.newThread() })
    expect(latest!.threadId).toBeNull()
    expect(latest!.messages).toHaveLength(1) // greeting of the new conversation
    await act(async () => { release(); await sleep(30) })
    expect(latest!.threadId).toBeNull()      // the "+" stands
    expect(latest!.messages).toHaveLength(1)
    await act(async () => { r!.unmount() })
  })

  it('D. openThread while a turn is in flight: the reply goes to the thread it was asked in, not the one on screen', async () => {
    let releaseTurn!: () => void
    h.gate.turn = new Promise<void>((res) => { releaseTurn = res })
    let r: TestRenderer.ReactTestRenderer
    await act(async () => { r = TestRenderer.create(<Probe />) })
    await act(async () => { await sleep(50) })
    expect(latest!.threadId).toBe(ID1)
    const p = act(async () => { await latest!.sendMessage('question in T1') })
    await act(async () => { await sleep(20) })
    expect(latest!.status).toBe('working')
    // the user clicks another conversation in the activity panel
    h.setThreadRow({ id: ID9, title: 'other', created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z', messages: [{ id: 'm1', role: 'agent', text: 'hey' }, { id: 'm2', role: 'user', text: 'other topic' }] })
    await act(async () => { await latest!.openThread(ID9) })
    expect(latest!.threadId).toBe(ID9)
    await act(async () => { releaseTurn(); await p; await sleep(50) })
    expect(texts()).toEqual(['hey', 'other topic']) // nothing foreign appended on screen
    const t1Saves = updatesTo(ID1).map((u) => (u.payload as { messages: { text: string }[] }).messages.map((m) => m.text))
    expect(t1Saves.some((s) => s.includes('reply-question in T1'))).toBe(true) // written back to T1
    await act(async () => { await sleep(1000) })
    const t9Saves = updatesTo(ID9).map((u) => (u.payload as { messages: { text: string }[] }).messages.map((m) => m.text))
    expect(t9Saves.some((s) => s.includes('reply-question in T1'))).toBe(false)
    await act(async () => { r!.unmount() })
  })
})

// @vitest-environment jsdom
// V0.9 (2026-11-27, user: 「把我们 agent 的控制页面也改成和这个类似，尤其是功能上」, with four
// screenshots of the Muse panel: scheduled tasks + today · approvals history · identity with its
// SOUL / MEMORY cards · inbox). The AI Agent panel is four tabs now — 任务 · 批准 · 身份 · 收件 —
// over what the product already had: nothing new is stored, no new table, no new capability.
//
// What this file pins:
//   · the outcome of an approval card is read from the row alone, in the chat's own words;
//   · 今天 is today only (today's conversations of this hat + today's outcomes), newest first;
//   · the panel never decides, writes a card or sends a message — every tab is a view (the only
//     writes are the ones that were already there: a routine, the name, 风格 / 人设, a memory);
//   · the Muse inbox is the assistant's own mailbox; this assistant has none, and the tab says
//     what it shows instead — messages people wrote to the person — and that it never replies;
//   · the old ?panel= names keep working.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'
import { agoLabel, approvalAt, approvalFamily, approvalHistory, approvalOutcome, approvalOutcomeLabel, APPROVAL_HISTORY_COLUMNS, type ApprovalRow } from '@/lib/agent/approvalHistory'
import { beforeToday, todayItems } from '@/lib/agent/todayTimeline'
import { nextRunLabel } from '@/lib/agent/routines'
import { PANEL_TABS, panelRequest, tabOfRequest } from '@/lib/agent/panelTabs'
import type { MemoryItem, PendingAction } from '@/lib/agent/types'

const read = (p: string) => readFileSync(p, 'utf8')
type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  user: { id: 'u1' } as null | { id: string },
  tables: {} as Record<string, Row[]>,
  threads: [] as Row[],
  reads: [] as string[],
  writes: [] as string[],
  rpc: [] as string[],
  unread: 0,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: db.user, role: null }) }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => db.unread, MESSAGES_CHANGED_EVENT: 'sl-messages-changed' }))
vi.mock('@/components/mobile/PushSettingsCard', () => ({ default: () => React.createElement('div', { 'data-testid': 'push-card' }) }))
vi.mock('@/lib/agent/modelCatalog', () => ({ loadTurnModels: async () => ({ selected: '', defaultLabel: 'Default model', options: [] }), saveTurnModel: async () => true }))
vi.mock('@/lib/aiName', () => ({ setAIName: () => {}, invalidateAiName: () => {} }))
vi.mock('@/lib/agent/threads', () => ({ listThreads: async () => db.threads }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    db.reads.push(table)
    const q: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'in', 'or', 'not', 'gte', 'order', 'limit']) q[k] = () => q
    for (const k of ['insert', 'update', 'delete', 'upsert']) q[k] = () => { db.writes.push(`${table}.${k}`); return q }
    q.maybeSingle = async () => ({ data: (db.tables[table] ?? [])[0] ?? null, error: null })
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: db.tables[table] ?? [], error: null }).then(res, rej)
    return q
  }
  const supabase = {
    from,
    rpc: (name: string) => { db.rpc.push(name); return Promise.resolve({ data: name === 'my_threads' ? db.tables.my_threads ?? [] : null, error: null }) },
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: db.user } }) },
  }
  return { supabase, getSupabaseBrowser: () => supabase }
})

import AssistantPanel from '@/components/agent/AssistantPanel'
import PanelFold from '@/components/agent/PanelFold'

const NOW = new Date(2026, 10, 27, 15, 0, 0) // 27 Nov 2026, 15:00 on the test machine's clock
const at = (h: number, dayOffset = 0) => new Date(2026, 10, 27 + dayOffset, h, 0, 0).toISOString()

const card = (o: Partial<ApprovalRow>): ApprovalRow => ({
  id: 'c', action_type: 'send_message', title: 't', summary: null, recipient_label: null, status: 'pending',
  created_at: at(9, -3), decided_at: null, executed_at: null, execution_result: null, metadata: null, ...o,
})

beforeEach(() => {
  db.user = { id: 'u1' }
  db.tables = {}
  db.threads = []
  db.reads = []
  db.writes = []
  db.rpc = []
  db.unread = 0
  localStorage.clear()
})
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear() })

describe('批准记录: what became of a card, from the row alone', () => {
  it('waiting / ran / failed / declined / refused / lapsed', () => {
    expect(approvalOutcome(card({ status: 'pending' }))).toBe('waiting')
    expect(approvalOutcome(card({ status: 'approved' }))).toBe('waiting') // approved, not run yet: still on the person's plate
    expect(approvalOutcome(card({ status: 'approved', executed_at: at(10), execution_result: { ok: true } }))).toBe('ran')
    expect(approvalOutcome(card({ status: 'approved', executed_at: at(10), execution_result: null }))).toBe('ran')
    expect(approvalOutcome(card({ status: 'approved', executed_at: at(10), execution_result: { ok: false, reason: 'send failed' } }))).toBe('failed')
    expect(approvalOutcome(card({ status: 'rejected' }))).toBe('declined')
    expect(approvalOutcome(card({ status: 'rejected', execution_result: { ok: false, reason: 'no_landlord_on_file' } }))).toBe('refused')
    expect(approvalOutcome(card({ status: 'expired', execution_result: { ok: false, reason: 'quote_changed' } }))).toBe('lapsed')
    expect(approvalOutcome(card({ status: 'expired' }))).toBe('lapsed')
  })
  it('the line says it in the words the chat uses, and never shows a bare reason code for a known reason', () => {
    expect(approvalOutcomeLabel(card({ status: 'approved', executed_at: at(10) }), true)).toBe('已批准，已执行')
    expect(approvalOutcomeLabel(card({ status: 'rejected' }), true)).toBe('你没有批准')
    expect(approvalOutcomeLabel(card({ status: 'expired' }), true)).toBe('已过期，没有处理')
    expect(approvalOutcomeLabel(card({ status: 'expired', execution_result: { ok: false, reason: 'quote_changed' } }), true)).toBe('已失效：报价在你批准之后变了，请先看新的报价')
    expect(approvalOutcomeLabel(card({ status: 'expired', execution_result: { ok: false, reason: 'period_paid' } }), true)).toBe('已失效：这期租金已记录付款')
    expect(approvalOutcomeLabel(card({ status: 'approved', executed_at: at(10), execution_result: { ok: false, reason: 'send failed' } }), true)).toBe('已批准，没有执行成：发送服务暂时出错')
    expect(approvalOutcomeLabel(card({ status: 'approved' }), true)).toBe('已批准，尚未执行')
    expect(approvalOutcomeLabel(card({ status: 'approved', executed_at: at(10) }), false)).toBe('Approved and done')
    expect(approvalOutcomeLabel(card({ status: 'expired', execution_result: { ok: false, reason: 'withdrawn' } }), false)).toBe('No longer applies: you withdrew this card, so it did not run')
    for (const r of ['quote_changed', 'period_paid', 'stale_approval', 'listing_inactive', 'dispatched', 'withdrawn', 'superseded']) {
      expect(approvalOutcomeLabel(card({ status: 'expired', execution_result: { ok: false, reason: r } }), true), r).not.toContain(r)
    }
  })
  it('the time is when it ran, else when it was decided; a card that lapsed undecided only has the day it was proposed, and says so', () => {
    expect(approvalAt(card({ executed_at: at(11), decided_at: at(10) }))).toEqual({ at: at(11), basis: 'ran' })
    expect(approvalAt(card({ decided_at: at(10) }))).toEqual({ at: at(10), basis: 'decided' })
    expect(approvalAt(card({}))).toEqual({ at: at(9, -3), basis: 'proposed' })
  })
  it('history = everything but the waiting cards, newest outcome first, capped', () => {
    const rows = [
      card({ id: 'w', status: 'pending' }),
      card({ id: 'old', status: 'rejected', decided_at: at(9, -5) }),
      card({ id: 'new', status: 'approved', decided_at: at(8), executed_at: at(9) }),
      card({ id: 'mid', status: 'expired', created_at: at(9, -2) }),
      card({ id: 'stalled', status: 'approved', decided_at: at(12) }),
    ]
    expect(approvalHistory(rows).map((r) => r.id)).toEqual(['new', 'mid', 'old'])
    expect(approvalHistory(rows, 2).map((r) => r.id)).toEqual(['new', 'mid'])
  })
  it('explicit columns, never *; each kind of card carries a plain icon', () => {
    expect(APPROVAL_HISTORY_COLUMNS).not.toContain('*')
    for (const c of ['id', 'status', 'executed_at', 'execution_result', 'decided_at', 'recipient_label']) expect(APPROVAL_HISTORY_COLUMNS.split(', ')).toContain(c)
    expect(approvalFamily('rent_reminder')).toBe('message')
    expect(approvalFamily('approve_quote')).toBe('repair')
    expect(approvalFamily('send_lease')).toBe('lease')
    expect(approvalFamily('something_new')).toBe('other')
  })
  it('「3 小时前」: minutes, hours, days, then a date', () => {
    const ago = (ms: number) => agoLabel(new Date(NOW.getTime() - ms).toISOString(), true, NOW)
    expect(ago(20_000)).toBe('刚刚')
    expect(ago(5 * 60_000)).toBe('5 分钟前')
    expect(ago(3 * 3_600_000)).toBe('3 小时前')
    expect(ago(2 * 86_400_000)).toBe('2 天前')
    expect(ago(45 * 86_400_000)).toMatch(/^2026\/10\/13$/)
    expect(agoLabel(new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), false, NOW)).toBe('3h ago')
    expect(agoLabel('not a date', true, NOW)).toBe('')
  })
})

describe('今天: today only, this hat only, newest first', () => {
  const thread = (o: Row) => ({ id: 't', role: 'landlord', title: '问涨租', custom_title: null, summary: '读了你的数据：租约 2', turn_count: 1, message_count: 2, created_at: at(8), updated_at: at(8), last_message_at: at(8), ...o })
  const done = (o: Row) => ({ id: 'e', action: 'executed_send_message', created_at: at(9), metadata: null, acting_role: 'landlord', ...o })
  it('conversations that moved today under this hat, plus what it finished today; older ones and other hats stay out', () => {
    const items = todayItems([
      thread({ id: 'a', last_message_at: at(14), title: '问涨租' }),
      thread({ id: 'yesterday', last_message_at: at(14, -1), updated_at: at(14, -1) }),
      thread({ id: 'tenant-hat', role: 'tenant', last_message_at: at(13) }),
      thread({ id: 'greeting-only', turn_count: 0, last_message_at: at(12) }),
    ] as never, [
      done({ id: 'x', created_at: at(11), metadata: { thread_id: 'a' } }),
      done({ id: 'y', created_at: at(11, -1) }),
      done({ id: 'z', created_at: at(10), action: 'routine_ran', metadata: { ok: false, reason: 'no_tenant_email' } }),
    ] as never, 'landlord', 'zh', NOW)
    expect(items.map((i) => i.id)).toEqual(['chat:a', 'done:x', 'done:z'])
    expect(items[0]).toMatchObject({ kind: 'chat', title: '问涨租', note: '读了你的数据：租约 2', threadId: 'a' })
    expect(items[1]).toMatchObject({ kind: 'done', failed: false, threadId: 'a' })
    expect(items[2]).toMatchObject({ kind: 'done', failed: true, note: 'no_tenant_email', threadId: null }) // a failed run keeps its reason
    for (const i of items) expect(i.title).toMatch(/[一-龥]/)
  })
  it('what came before today goes to the fold below', () => {
    expect(beforeToday([{ created_at: at(9) }, { created_at: at(9, -1) }, { created_at: at(23, -7) }], NOW).length).toBe(2)
  })
  it('a routine row says which day it runs next — a bare 09:00 does not', () => {
    expect(nextRunLabel(at(18), 'zh', NOW)).toBe('今天 18:00')
    expect(nextRunLabel(at(9, 1), 'zh', NOW)).toBe('明天 09:00')
    expect(nextRunLabel(at(9, 1), 'en', NOW)).toBe('Tomorrow 09:00')
    expect(nextRunLabel(at(9, 4), 'zh', NOW)).toMatch(/12月1日 09:00/)
    expect(nextRunLabel('nope', 'zh', NOW)).toBe('')
  })
})

describe('?panel= — the four tabs, and the three names the panel had before', () => {
  it('each tab by its name; todo → 批准, memory → 身份 › 记忆, settings → 身份; anything else is ignored', () => {
    expect([...PANEL_TABS]).toEqual(['tasks', 'approvals', 'identity', 'inbox'])
    for (const t of PANEL_TABS) expect(panelRequest(t)).toBe(t)
    expect(panelRequest('todo')).toBe('approvals')
    expect(panelRequest('memory')).toBe('memory')
    expect(tabOfRequest('memory')).toBe('identity')
    expect(panelRequest('settings')).toBe('identity')
    expect(panelRequest('nope')).toBeNull()
    expect(panelRequest(null)).toBeNull()
  })
})

const WAITING: PendingAction = {
  id: 'p1', user_id: 'u1', role: 'landlord', action_type: 'rent_reminder', title: '租金提醒：Test Tenant / Rent reminder', summary: '批准后发一封提醒。 / A reminder is emailed after your approval.',
  data_scope: [], excluded_data: [], risk_level: 'low', status: 'pending', requires_approval: true, created_at: at(9), metadata: {},
}
const MEMORIES: MemoryItem[] = [{ key: 'area', label: '区域', value: 'North York', confidence: 1, memory_type: 'preference', role: 'tenant' }]

function mount(props: Partial<React.ComponentProps<typeof AssistantPanel>> = {}) {
  return render(
    <AssistantPanel
      role="landlord" agentName="Ashley" pendingActions={[WAITING]} memories={MEMORIES} live avatar={null}
      onAvatarChange={() => {}} currentThreadId={null} onOpenThread={() => {}} onClose={() => {}} {...props}
    />,
  )
}
const tab = (root: ParentNode, k: string) => only<HTMLButtonElement>(root, `[data-testid="panel-tab-${k}"]`)

describe('the panel, rendered', () => {
  it('four tabs in order, names written out, 任务 first; the badges are the waiting cards and the unread messages', async () => {
    db.unread = 3
    const { container } = mount()
    expect(all(container, '[role="tab"]').map((t) => t.dataset.testid)).toEqual(['panel-tab-tasks', 'panel-tab-approvals', 'panel-tab-identity', 'panel-tab-inbox'])
    expect(all(container, '[role="tab"] > span:not([data-testid])').map(textOf)).toEqual(['任务', '批准', '身份', '收件'])
    expect(tab(container, 'tasks').getAttribute('aria-selected')).toBe('true')
    expect(textOf(only(container, '[data-testid="panel-badge-approvals"]'))).toBe('1')
    expect(textOf(only(container, '[data-testid="panel-badge-inbox"]'))).toBe('3')
    expect(all(container, '[data-testid="panel-badge-tasks"], [data-testid="panel-badge-identity"]').length).toBe(0)
    await waitFor(() => expect(only(container, '[data-testid="panel-today"]')).toBeTruthy())
  })

  it('任务: the routines with when each runs next, then today', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db.tables.agent_routines = [
      { id: 'r1', role: 'landlord', kind: 'monthly_brief', title: '每月一页纸简报', params: {}, schedule: { every: 'monthly', day: 1, hour: 9 }, next_run_at: at(9, 4), last_run_at: null, last_result: null, enabled: true, created_at: at(9, -30) },
      { id: 'r2', role: 'landlord', kind: 'renewal_window_check', title: '检查续约窗口', params: {}, schedule: { every: 'weekly', weekday: 1, hour: 9 }, next_run_at: at(9, 1), last_run_at: at(9, -6), last_result: { ok: true, count: 2 }, enabled: false, created_at: at(9, -30) },
    ]
    db.threads = [{ id: 'a', role: 'landlord', title: '问涨租', custom_title: null, summary: '读了你的数据：租约 2', turn_count: 1, message_count: 2, created_at: at(14), updated_at: at(14), last_message_at: at(14) }]
    const { container } = mount()
    await waitFor(() => expect(all(container, '[data-testid="routine-row"]').length).toBe(2))
    const routines = only(container, '[data-testid="panel-routines"]')
    expect(textOf(routines)).toContain('2 个例行任务')
    expect(textOf(all(container, '[data-testid="routine-row"]')[0])).toContain('每月一页纸简报')
    expect(textOf(all(container, '[data-testid="routine-row"]')[0])).toMatch(/12月1日 09:00/)
    expect(textOf(all(container, '[data-testid="routine-row"]')[1])).toContain('已停用')
    // the controls sit behind the row: nothing to run or delete until it is opened
    expect(all(container, '[data-testid="routine-detail"]').length).toBe(0)
    fireEvent.click(only(all(container, '[data-testid="routine-row"]')[1], 'button'))
    const detail = only(container, '[data-testid="routine-detail"]')
    expect(textOf(detail)).toContain('每周一 09:00')
    expect(textOf(detail)).toContain('现在运行')
    await waitFor(() => expect(all(container, '[data-testid="panel-today-list"] li').length).toBe(1))
    const today = only(container, '[data-testid="panel-today-list"] li')
    expect(today.dataset.kind).toBe('chat')
    expect(textOf(today)).toContain('问涨租')
    expect(textOf(today)).toContain('读了你的数据：租约 2')
    expect(db.writes).toEqual([])
  })

  it('批准: the waiting card in one language, then the record — outcome, time, details on demand — and nothing to press that decides', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db.tables.agent_pending_actions = [
      { id: 'h1', action_type: 'rent_reminder', title: '租金提醒：十月 / Rent reminder: October', summary: '已发给租客。 / Sent to the tenant.', recipient_label: 'Test Tenant', status: 'approved', created_at: at(9, -3), decided_at: at(10, -3), executed_at: at(10, -3), execution_result: { ok: true }, metadata: { thread_id: 'th-9' } },
      { id: 'h2', action_type: 'approve_quote', title: '批准报价', summary: null, recipient_label: null, status: 'expired', created_at: at(9, -5), decided_at: null, executed_at: null, execution_result: { ok: false, reason: 'quote_changed' }, metadata: {} },
      { id: 'w', action_type: 'send_message', title: '还在等', summary: null, recipient_label: null, status: 'pending', created_at: at(9), decided_at: null, executed_at: null, execution_result: null, metadata: {} },
    ]
    const opened: string[] = []
    const { container } = mount({ onOpenThread: (id) => { opened.push(id) } })
    fireEvent.click(tab(container, 'approvals'))
    const waiting = only(container, '[data-testid="panel-waiting"]')
    expect(textOf(waiting)).toContain('租金提醒：Test Tenant')
    expect(textOf(waiting)).not.toContain('Rent reminder') // stored 「中文 / English」: only the reader's half
    await waitFor(() => expect(all(container, '[data-testid="panel-approvals-list"] li').length).toBe(2))
    const rows = all(container, '[data-testid="panel-approvals-list"] li')
    expect(rows.map((r) => r.dataset.outcome)).toEqual(['ran', 'lapsed'])
    expect(textOf(rows[0])).toContain('租金提醒：十月')
    expect(textOf(rows[0])).not.toContain('October')
    expect(textOf(rows[0])).toContain('已批准，已执行 · 3 天前')
    expect(textOf(rows[1])).toContain('已失效：报价在你批准之后变了，请先看新的报价 · 5 天前提出')
    expect(all(container, '[data-testid="approval-detail"]').length).toBe(0)
    fireEvent.click(only(rows[0], 'button'))
    const detail = only(container, '[data-testid="approval-detail"]')
    expect(textOf(detail)).toContain('对方：Test Tenant')
    expect(textOf(detail)).toContain('提出：')
    expect(textOf(detail)).toContain('执行：')
    fireEvent.click(only(detail, 'button'))
    expect(opened).toEqual(['th-9'])
    // a record: no approve / decline / run control anywhere in the tab, and nothing was written
    const body = only(container, '[role="tabpanel"]')
    for (const b of all(body, 'button')) expect(textOf(b)).not.toMatch(/^(批准|拒绝|同意|现在执行|撤销|放弃)$/)
    expect(textOf(body)).toContain('这里只是记录：批准和拒绝都在对话里的卡片上做。')
    expect(db.writes).toEqual([])
  })

  it('身份: the card with the name and 风格, then 人设 and 记忆 each open a page and come back; tapping the tab returns to the first page', async () => {
    db.tables.assistant_profiles = [{ name: 'Ashley', avatar: null, vibe: '温柔亲切', persona: '你是一位务实的租房助理。' }]
    db.tables.user_memories = [{ updated_at: at(9, -3), value: {} }]
    const { container } = mount()
    fireEvent.click(tab(container, 'identity'))
    const idCard = only(container, '[data-testid="assistant-identity"]')
    expect(textOf(idCard)).toContain('Ashley')
    await waitFor(() => expect(textOf(only(container, '[data-testid="assistant-identity-line"]'))).toBe('温柔亲切'))
    const persona = only<HTMLButtonElement>(container, '[data-testid="identity-card-persona"]')
    const memory = only<HTMLButtonElement>(container, '[data-testid="identity-card-memory"]')
    await waitFor(() => expect(textOf(persona)).toContain('已写 12 字'))
    expect(textOf(memory)).toContain('1 条')
    expect(textOf(memory)).toContain('11/24 更新')
    expect(only(container, '[data-testid="push-card"]')).toBeTruthy() // model · push stay in the panel, under the cards

    fireEvent.click(persona)
    expect(only(container, '[data-testid="identity-persona"]')).toBeTruthy()
    await waitFor(() => expect(textOf(only(container, '[data-testid="assistant-persona"]'))).toContain('你是一位务实的租房助理。'))
    fireEvent.click(only(container, '[data-testid="identity-back"]'))
    expect(only(container, '[data-testid="identity-home"]')).toBeTruthy()

    fireEvent.click(only(container, '[data-testid="identity-card-memory"]'))
    const mem = only(container, '[data-testid="identity-memory"]')
    expect(only(mem, '[data-testid="assistant-profile"]')).toBeTruthy()
    expect(textOf(mem)).toContain('它记住的事')
    expect(textOf(mem)).toContain('North York')
    fireEvent.click(tab(container, 'identity'))
    expect(only(container, '[data-testid="identity-home"]')).toBeTruthy()
    expect(db.writes).toEqual([])
  })

  it('a ?panel=memory link lands on 身份 › 记忆 and hands the request back', async () => {
    const used = vi.fn()
    const { container } = mount({ initialTab: 'memory', onTabRequestUsed: used })
    expect(tab(container, 'identity').getAttribute('aria-selected')).toBe('true')
    expect(only(container, '[data-testid="identity-memory"]')).toBeTruthy()
    expect(used).toHaveBeenCalledTimes(1)
  })

  it('收件: the message centre’s threads, unread first, one language, each a link into Messages — and the note that it never replies', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    db.tables.my_threads = [
      { id: 'm1', kind: 'tenancy', party: 'landlord', last_at: at(13), last_body: '好的，周六见。', last_sender_id: 'u1', unread: 0, counterpart_names: ['Test Tenant'], counterpart_roles: ['tenant'] },
      { id: 'm2', kind: 'tenancy', party: 'landlord', last_at: at(9, -20), last_body: '水龙头又漏了', last_sender_id: 'u2', unread: 2, counterpart_names: ['Old Tenant'], counterpart_roles: ['tenant'] },
      { id: 'm3', kind: 'work_order', party: 'landlord', last_at: at(9, -1), last_body: '工单已取消 / Cancelled', last_sender_id: null, unread: 0, counterpart_names: ['Maple Plumbing'], counterpart_roles: ['provider'] },
    ]
    const { container } = mount()
    fireEvent.click(tab(container, 'inbox'))
    await waitFor(() => expect(all(container, '[data-testid="panel-inbox-list"] li').length).toBe(3))
    expect(db.rpc).toContain('my_threads')
    const rows = all(container, '[data-testid="panel-inbox-list"] li')
    expect(rows.map((r) => only<HTMLAnchorElement>(r, 'a').getAttribute('href'))).toEqual(['/messages?t=m2', '/messages?t=m1', '/messages?t=m3']) // the unread one from weeks ago comes first
    expect(textOf(rows[0])).toContain('Old Tenant')
    expect(textOf(rows[0])).toContain('水龙头又漏了')
    expect(textOf(rows[1])).toContain('你：好的，周六见。')
    expect(textOf(rows[2])).toContain('工单已取消')
    expect(textOf(rows[2])).not.toContain('Cancelled')
    expect(textOf(only(container, '[data-testid="panel-inbox-unread"]'))).toBe('1 段有未读')
    const inbox = only(container, '[data-testid="panel-inbox"]')
    expect(textOf(inbox)).toContain('AI 助理每次对话会读其中没读的几条来提醒你，不会替你回复')
    // nothing to type into and nothing to send
    expect(all(inbox, 'textarea, input, button').length).toBe(0)
    expect(db.writes).toEqual([])
  })

  it('under the name: what it is doing while a reply is on its way, else what it is connected to', () => {
    const idle = mount({ status: 'idle' })
    expect(textOf(only(idle.container, '[data-testid="assistant-status"]'))).toBe('已连接 · 读取你的申请、租约与房源')
    expect(only(idle.container, '[data-testid="assistant-status"]').dataset.busy).toBeUndefined()
    idle.unmount()
    const busy = mount({ status: 'working' })
    expect(textOf(only(busy.container, '[data-testid="assistant-status"]'))).toBe('正在处理你的请求…')
    expect(only(busy.container, '[data-testid="assistant-status"]').dataset.busy).toBe('true')
    busy.unmount()
    const reading = mount({ status: 'understanding' })
    expect(textOf(only(reading.container, '[data-testid="assistant-status"]'))).toBe('正在读你的消息…')
  })

  it('preview (not signed in): every tab says what it would hold, and reads nothing', async () => {
    db.user = null
    const { container } = mount({ live: false })
    expect(textOf(only(container, '[data-testid="assistant-status"]'))).toBe('预览 · 未登录，只看不记')
    expect(textOf(only(container, '[data-testid="panel-routines"]'))).toContain('登录后，可以让它每天、每周或每月替你做一件事')
    expect(textOf(only(container, '[data-testid="panel-today"]'))).toContain('预览模式不留记录')
    fireEvent.click(tab(container, 'approvals'))
    expect(textOf(only(container, '[data-testid="panel-approvals"]'))).toContain('预览模式不留记录')
    fireEvent.click(tab(container, 'identity'))
    expect(textOf(only(container, '[data-testid="assistant-identity-line"]'))).toBe('预览 · 登录后可以改')
    expect(textOf(only(container, '[data-testid="identity-card-persona"]'))).toContain('登录后可以写')
    fireEvent.click(tab(container, 'inbox'))
    expect(textOf(only(container, '[data-testid="panel-inbox"]'))).toContain('预览模式没有消息')
    await act(async () => { await Promise.resolve() })
    expect(db.reads).toEqual([])
    expect(db.rpc).toEqual([])
  })

  it('the column reopens on the tab last used; a name it no longer has (待办 · 记忆 · 设置) falls back to 任务', async () => {
    localStorage.setItem('sl-assistant-panel-tab', 'inbox')
    const a = mount()
    await waitFor(() => expect(tab(a.container, 'inbox').getAttribute('aria-selected')).toBe('true'))
    fireEvent.click(tab(a.container, 'approvals'))
    expect(localStorage.getItem('sl-assistant-panel-tab')).toBe('approvals')
    a.unmount()
    localStorage.setItem('sl-assistant-panel-tab', 'memory')
    const b = mount()
    await act(async () => { await Promise.resolve() })
    expect(tab(b.container, 'tasks').getAttribute('aria-selected')).toBe('true')
  })

  it('a fold keeps its body mounted while closed', () => {
    const { container } = render(<PanelFold title="今天" testid="f"><input data-testid="kept" defaultValue="" /></PanelFold>)
    const btn = only<HTMLButtonElement>(container, 'button')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.change(only<HTMLInputElement>(container, '[data-testid="kept"]'), { target: { value: 'half typed' } })
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(only<HTMLInputElement>(container, '[data-testid="kept"]').value).toBe('half typed')
    expect(only(container, `#${CSS.escape(btn.getAttribute('aria-controls') as string)}`).hasAttribute('hidden')).toBe(true)
  })
})

describe('the rules, in the source', () => {
  const panel = read('components/agent/AssistantPanel.tsx')
  const tasks = read('components/agent/PanelTasksTab.tsx')
  const approvals = read('components/agent/PanelApprovalsTab.tsx')
  const identity = read('components/agent/PanelIdentityTab.tsx')
  const inbox = read('components/agent/PanelInboxTab.tsx')
  it('批准 reads the person’s own rows for this hat with explicit columns, and writes nothing', () => {
    expect(approvals).toContain("supabase.from('agent_pending_actions').select(APPROVAL_HISTORY_COLUMNS).eq('role', role).order('created_at', { ascending: false }).limit(60)")
    expect(approvals).not.toMatch(/select\('\*'\)/)
    expect(approvals).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/)
    expect(approvals).not.toContain('fetch(')
    expect(approvals).toContain("const one = (t: string | null | undefined) => pickCardLang(t, zh ? 'zh' : 'en')")
  })
  it('收件 is the message centre’s own read; it sends nothing and gives the assistant no mailbox', () => {
    expect(inbox).toContain("supabase.rpc('my_threads')")
    expect(inbox).toContain('href={`/messages?t=${r.id}`}')
    expect(inbox).not.toMatch(/\.(insert|update|delete|upsert)\(/)
    expect(inbox).not.toContain('fetch(')
    expect(inbox).not.toMatch(/textarea|<input/)
    // no promise of an address for the assistant, no 「即将上线」
    for (const f of [inbox, panel]) expect(f).not.toMatch(/即将上线|coming soon|Create an email|创建邮箱|@agent\.stayloop/i)
    // what the note claims is what the turn route does: it folds in unread messages from people
    expect(read('lib/agent/foldedSources.ts')).toContain("timeout(sb.rpc('my_threads'), 2500)")
    expect(read('lib/agent/foldedSources.ts')).toContain('.filter((t) => (t.unread ?? 0) > 0 && t.last_sender_kind !== \'system\')')
  })
  it('任务: today is built by todayItems (today only); the list of all conversations stays on the left', () => {
    expect(tasks).toContain('const today = ready ? todayItems(threads, outcomes, role, lang) : []')
    expect(tasks).toContain('<RoutinesSection role={role} live={live} />')
    expect(tasks).not.toMatch(/<ThreadList\b|groupThreads/) // the type ThreadListRow is fine; the list component is not here
    expect(read('lib/agent/todayTimeline.ts')).toContain("if (threadGroupKey(at, now) !== 'today') continue")
  })
  it('身份 changes nothing about what is stored: the same four records, the same editors', () => {
    for (const s of ['view="vibe" name={name}', 'view="persona"', 'view="profile"', 'view="runtime"', '<PrivateMemorySnapshot agentName={name} memories={memories} role={role} editable={live} />']) expect(identity, s).toContain(s)
    expect(identity).not.toMatch(/\.(insert|update|delete|upsert)\(/)
    // the two cards are buttons with their names written on them, and white text that passes on both gradients
    expect(identity).toContain("{zh ? '人设' : 'Persona'}")
    expect(identity).toContain("{zh ? '记忆' : 'Memory'}")
    expect(identity).toContain("background: 'linear-gradient(135deg, #1B1B3C 0%, #3A3484 100%)'")
    expect(identity).toContain("background: 'linear-gradient(135deg, #0B4F8F 0%, #0C7CC0 100%)'")
  })
  it('the panel: a tab or a page of 身份 starts at its top; the tabs share the row by what each name needs', () => {
    expect(panel).toContain("const el = variant === 'sheet' ? rootRef.current : bodyRef.current\n    if (el) el.scrollTop = 0\n  }, [tab, identityPage, variant])")
    expect(panel).toContain('flex h-10 flex-auto items-center justify-center gap-1 whitespace-nowrap')
    expect(panel).toContain('[&>svg]:flex-none')
    expect(panel).toContain("if (t === 'identity') setIdentityPage('home')")
    // the page hands the conversation's status to both surfaces
    expect((read('components/agent/AgentWorkspacePage.tsx').match(/ status=\{status\} initialTab=\{requestedTab \?\? undefined\}/g) || []).length).toBe(2)
  })
  it('wording elsewhere names the tabs as they are now', () => {
    expect(read('lib/agent/prompts.ts')).toContain('在右侧 AI 助理面板的「任务」标签里「例行任务」一节设定')
    expect(read('lib/agent/prompts.ts')).not.toContain('面板的「待办」里「例行」')
    expect(read('components/mobile/PushSettingsCard.tsx')).toContain('在 AI 助理的「任务 · 今天」和审计页看')
    expect(read('components/mobile/RolePages.tsx')).toContain('在 AI 助理的「身份 › 记忆」里查看和修改')
    expect(read('app/settings/page.tsx')).toContain('（AI 助理面板的「身份」里也能改）')
  })
})

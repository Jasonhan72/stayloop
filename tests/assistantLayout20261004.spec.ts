// The assistant page regrouped (user 2026-10-04: 「重新布置…更系统化、更友好」;
// choices: keep the rail icon-only, drop the 活动 tab, fold other hats' chats).
// Left = where to go + what you talked about, middle = this chat, right = the
// AI Agent itself. Each thing appears once.
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { isOutcomeAction } from '@/lib/agent/activityLog'
import { cleanTitle, isEmptyThread, partitionByHat } from '@/lib/agent/threadList'
import { waitingCards } from '@/lib/agent/threadCards'

vi.mock('@/lib/supabase', () => ({ supabase: {}, getSupabaseBrowser: () => ({}) }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => 0 }))
vi.mock('@/lib/agent/pendingCount', () => ({ fetchPendingCount: async () => 0, PENDING_CHANGED_EVENT: 'x' }))

const read = (p: string) => readFileSync(p, 'utf8')

describe('one new-chat control at a time', () => {
  it('the rail has ＋ 新对话; the AI chats column has none; the drawer (which covers the rail) has its own', () => {
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain("aria-label={en ? 'New chat' : '新对话'}")
    const list = read('components/agent/ThreadList.tsx')
    expect(list).toMatch(/\{variant === 'drawer' && \(\s*<button[\s\S]*?data-testid="thread-list-new"/)
    for (const f of ['components/WorkspaceShell.tsx', 'components/agent/ThreadList.tsx', 'components/agent/AgentWorkspacePage.tsx']) expect(read(f), f).not.toContain('新会话')
  })
})

describe('icon rail: grouped, one definition, no repeats', () => {
  const rail = read('components/workspace/rail.tsx')
  const shell = read('components/WorkspaceShell.tsx')
  it('the four AI Agent pages are defined once (assistantItems) for the rail, the phone bar and page titles', () => {
    expect(rail).toContain('export function assistantItems(role: WorkspaceRole): RailItem[]')
    expect(shell).toContain('const assistant = assistantItems(role)')
    expect(shell).toContain('...assistantItems(role),')
    expect(rail).toContain('assistantItems(role).map((it) => ({')
    expect(rail).not.toContain("key: 'home'")
  })
  it('groups: 消息 (with the unread badge) · the hat’s pages · 审计 and 账号设置 at the bottom; still icon-only', () => {
    expect(shell).toContain("{inbox.map((it) => link(it, it.key === 'msgs' ? unreadMessages : 0))}")
    expect(shell).toContain('{records.map((it) => link(it))}')
    expect(shell).toContain('{...tipHandlers(label, desc)}') // the name (and what the page is for) on hover / focus only
    expect(shell).not.toMatch(/text-\[10\.5px\][^\n]*\{en \? it\.label\.en : it\.label\.zh\}<\/span>\s*<\/Link>/) // no always-on label under the icon
    expect((rail.match(/href: '\/messages'/g) || []).length).toBe(3)
  })
  it('landlords get 房源; agents get 审计 (and it stays open before RECO verification); no icon repeats within a hat', async () => {
    const { RAIL_BY_ROLE } = await import('@/components/workspace/rail')
    expect(RAIL_BY_ROLE.landlord.find((it) => it.key === 'listings')?.href).toBe('/dashboard')
    expect(RAIL_BY_ROLE.agent.find((it) => it.key === 'audit')?.href).toBe('/agent/audit')
    expect(shell).toMatch(/\(agent\|verify\|todo\|ideas\|progress\|audit\)/)
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      const items = RAIL_BY_ROLE[role]
      for (const it of items) expect(it.group, `${role}/${it.key}`).toMatch(/^(inbox|pages|records)$/)
      const icons = items.filter((it) => it.key !== 'pay' && it.key !== 'fin' && it.key !== 'earn').map((it) => (it.icon as { type: { name: string } }).type.name)
      expect(new Set(icons).size, `${role} icons repeat: ${icons}`).toBe(icons.length)
      expect(items.find((it) => it.key === 'passport')?.label.zh ?? '护照').toBe('护照')
    }
  })
})

describe('AI chats list: this hat first, others folded, clean names', () => {
  it('partitions by hat (tenant · landlord · agent order), never tags rows', () => {
    const rows = [{ role: 'tenant', id: 'a' }, { role: 'landlord', id: 'b' }, { role: 'agent', id: 'c' }, { role: 'tenant', id: 'd' }]
    const p = partitionByHat(rows, 'landlord')
    expect(p.mine.map((r) => r.id)).toEqual(['b'])
    expect(p.others.map((g) => [g.hat, g.rows.map((r) => r.id)])).toEqual([['tenant', ['a', 'd']], ['agent', ['c']]])
    const list = read('components/agent/ThreadList.tsx')
    expect(list).not.toMatch(/ROLE_TAG|HAT_LABEL/)
    expect(list).toContain('`其他身份的对话 · ${othersCount}`')
    expect(list).toContain('const othersShown = othersOpen || !!q.trim()')
  })
  it('unfilled intake templates and greeting-only leftovers do not show as rows', () => {
    expect(cleanTitle('我要报修：【哪里，如厨房 / 卫生间】【什么问题】')).toBe('我要报修')
    expect(cleanTitle('  帮我找TMU  ')).toBe('帮我找TMU')
    expect(isEmptyThread({ id: 'x', turn_count: 0, title: null }, null)).toBe(true)
    expect(isEmptyThread({ id: 'x', turn_count: 0, title: null }, 'x')).toBe(false) // the open one always shows
    expect(isEmptyThread({ id: 'x', turn_count: 2, title: null }, null)).toBe(false)
  })
  it('listThreads cuts in the order the list shows (last message first)', () => {
    expect(read('lib/agent/threads.ts')).toContain(".order('last_message_at', { ascending: false, nullsFirst: false })")
  })
})

describe('the AI Agent panel: 待办 · 记忆 · 设置, no 活动', () => {
  const panel = read('components/agent/AssistantPanel.tsx')
  it('three labelled tabs; the activity log and its sheet are gone', () => {
    expect(panel).toContain("type PanelTab = 'todo' | 'memory' | 'settings'")
    expect(panel).not.toMatch(/useActivityLog\(|buildActivity|openItem/)
    expect(existsSync('components/mobile/ActivitySheet.tsx')).toBe(false)
  })
  it('待办 says where each waiting card is handled; approvals stay on the cards', () => {
    expect(panel).toContain("{zh ? '在这段对话里 ↓' : 'In this chat ↓'}")
    expect(panel).toContain('`在对话「${t}」里 →`')
    expect(panel).toContain("{zh ? '已批准，尚未执行 · 去待办页处理 →' : 'Approved, not run yet · open To-do →'}")
    expect(panel).not.toMatch(/onDecide/)
    expect(waitingCards([{ status: 'pending' }, { status: 'approved' }, { status: 'executed' }, { status: 'rejected' }]).length).toBe(2)
  })
  it('「最近替你办完」 lists outcomes only — not avatars, views, exports, memory edits, acknowledgements or non-events', () => {
    for (const a of ['executed_send_message', 'executed_send_decision', 'executed_maintenance_request', 'work_order_auto_dispatched', 'household_created_from_esign']) expect(isOutcomeAction(a), a).toBe(true)
    for (const a of ['assistant_avatar_generated', 'memory_edited', 'application_file_viewed', 'thread_export_generated', 'work_order_dispatch_no_candidate', 'executed_claim_in_reply', 'executed_renewal_checkpoint', 'approval_abandoned', 'tenant_agent_turn']) expect(isOutcomeAction(a), a).toBe(false)
  })
  it('记忆 = 画像 + what it remembers; 设置 = persona · style · model · push', () => {
    expect(panel).toContain('<AssistantSettings role={role} live={live} view="profile" />')
    expect(panel).toContain('<PrivateMemorySnapshot agentName={name} memories={memories} role={role} editable={live} />')
    expect(panel).toContain('<AssistantSettings role={role} live={live} view="settings" />')
  })
})

describe('the page: hidden things never mount or fetch; sheets are accessible', () => {
  const page = read('components/agent/AgentWorkspacePage.tsx')
  it('list column only from xl, panel fetches only from lg, the phone sheet only below lg', () => {
    expect(page).toContain('const xlUp = useMinWidth(1280)')
    expect(page).toContain('{live && xlUp && listPref === \'open\' && (')
    expect(page).toContain('visible={lgUp}')
    expect(page).toContain('{sheetOpen && !lgUp && (')
  })
  it('drawer and sheet: Esc, focus trap, focus back to the opener', () => {
    expect(page).toContain('useModalA11y(listDrawer, closeDrawer, drawerRef)')
    const a11y = read('lib/ui/useModalA11y.ts')
    expect(a11y).toContain("if (e.key === 'Escape')")
    expect(a11y).toContain("if (e.key !== 'Tab' || !ref.current) return")
    expect(a11y).toContain('opener.focus?.()')
  })
  it('「在这段对话里 ↓」 scrolls the chat’s own thread to the card (never the page)', () => {
    expect(page).toContain("thread?.querySelector<HTMLElement>(`[data-card-id=\"${CSS.escape(id)}\"]`)")
    expect(page).toContain('thread.scrollTo({ top, behavior: \'smooth\' })')
    expect(page).not.toContain('scrollIntoView')
    expect(read('components/agent/ApprovalActionCard.tsx')).toContain('data-card-id={action.id} tabIndex={-1}')
  })
  it('nothing above the conversation; the chat head opens the sheet', () => {
    expect(page).toContain('onOpenAssistant={() => setSheetOpen(true)}')
    const chatAt = page.indexOf('<AgentChat')
    for (const gone of ['<TodayCard', '<LifecycleRail', 'StatusOverview']) expect(page.slice(0, chatAt)).not.toContain(gone)
  })
})

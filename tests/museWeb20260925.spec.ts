// Web assistant pages after the Muse web reference (design/muse-web-blueprint-2026-09.html,
// user 2026-09-25 "按蓝本改，三点都按你建议的来"): a 64px icon rail on every
// workbench page, the conversation as the page, the assistant's own panel
// beside it (default open, closable, remembered), approvals in the thread,
// and the three role pages built the same way.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { assistantStatusLine } from '@/lib/agent/statusLine'
import { fmtRowTime, isOutcomeAction, outcomeHat } from '@/lib/agent/activityLog'

const read = (p: string) => readFileSync(p, 'utf8')
// Since 2026-09-25 the three routes are thin wrappers around one shared component.
const shared = 'components/agent/AgentWorkspacePage.tsx'
const pages = [shared]
const routes = ['app/tenant/agent/page.tsx', 'app/landlord/agent/page.tsx', 'app/agent/agent/page.tsx']

describe('icon rail (WorkspaceShell, md+)', () => {
  const shell = read('components/WorkspaceShell.tsx')
  it('is a 64px icon column with hover labels; the labelled 220px sidebar is gone', () => {
    // 2026-10-04: sticky under the header and scrollable on short screens; the hover name is drawn position:fixed so it is not clipped
    expect(shell).toContain('hidden md:sticky md:top-[66px] md:flex md:h-[calc(100vh-66px)] md:w-16 md:flex-none md:flex-col md:items-center')
    expect(shell).not.toContain('md:w-[220px]')
    expect(shell).toContain('role="tooltip" className="pointer-events-none fixed')
    // Light, like the rest of the screen (user 2026-09-25): surface rail with a hairline, white pill for the active page, navy only on "+"
    expect(shell).toContain("md:border-r md:border-line-divider md:px-2 md:py-3\"\n      style={{ background: '#F3F8FC', scrollbarWidth: 'none' }}")
    expect(shell).toContain("style={on ? { background: '#FFFFFF', color: '#1B1B3C', boxShadow: '0 1px 2px rgba(27,27,60,0.10)' } : { color: '#6E6E8A' }}")
    const rail = read('components/workspace/rail.tsx')
    expect(rail).toContain("border-t border-line-divider md:hidden\" style={{ background: '#FFFFFF', paddingBottom: 'env(safe-area-inset-bottom)' }}")
    expect(shell + rail).not.toContain("'#c7d2e3'")
  })
  it('carries the four assistant pages (the phone tabs) plus the role pages and settings', () => {
    // One definition since 2026-10-04 (assistantItems in rail.tsx), shared by the rail, the phone bar and page titles.
    const rail = read('components/workspace/rail.tsx')
    for (const k of ['`/${role}/agent`', '`/${role}/todo`', '`/${role}/ideas`', '`/${role}/progress`']) expect(rail).toContain(k)
    expect(shell).toContain('const assistant = assistantItems(role)')
    expect(shell).toMatch(/it\.key === 'todo' \? pendingCount : 0/)
    expect(shell).toContain("const pages = items.filter((it) => it.group === 'pages')")
  })
  it('assistant pages get no content padding on md+ (the chat is the page)', () => {
    expect(shell).toContain("phoneApp ? 'sl-phone-pb min-w-0 flex-1 p-0 md:p-0'")
  })
})

describe('the conversation is the page', () => {
  const chat = read('components/agent/AgentChat.tsx')
  it('hero mode: no card chrome, 760px column, identity header hidden from lg, approvals in the thread, pill composer', () => {
    expect(chat).toMatch(/hero \? 'h-full' : fill \?/)
    expect(chat).toContain("hero ? 'mx-auto w-full max-w-[760px] space-y-4' : 'space-y-4'")
    expect(chat).toContain("${hero && !device ? 'lg:hidden' : ''}") // a device frame keeps its header
    expect(chat).toContain("space-y-3 ${hero ? '' : 'lg:hidden'}")
    expect(chat).toContain('pill={hero}')
    expect(chat).not.toMatch(/export const ORB/) // dead export removed in the 2026-09-25 review
  })
  it('composer pill: one row at every width, 28px radius, model picker under the bar', () => {
    const bar = read('components/agent/AgentInputBar.tsx')
    expect(bar).toContain("pill ? 'rounded-[28px]' : 'rounded-2xl'")
    expect(bar).toContain("pill ? 'order-1 contents' :")
    expect(bar).toContain('{pill && models && (')
  })
})

describe('assistant panel', () => {
  const panel = read('components/agent/AssistantPanel.tsx')
  it('avatar · name, then 待办 / 记忆 / 设置; closable; rename writes the account’s assistant profile (one assistant, 2026-09-25)', () => {
    // 2026-10-04: three tabs with their names written out; the 活动 tab is gone (conversations live in the AI chats list)
    expect(panel).toContain("{ key: 'todo', label: zh ? '待办' : 'To-do', icon: <TodoTabIcon />, badge: waiting.length }")
    expect(panel).toContain("{ key: 'memory', label: zh ? '记忆' : 'Memory', icon: <MemoryIcon />, badge: 0 }")
    expect(panel).toContain("{ key: 'settings', label: zh ? '设置' : 'Settings', icon: <SlidersIcon />, badge: 0 }")
    expect(panel).not.toContain("key: 'activity'")
    expect(panel).toContain('useRecentOutcomes(live, role, visible)')
    expect(panel).toContain('await saveAssistantName(supabase, auth.user.id, next)')
    expect(panel).not.toContain("from('agent_configs')")
    expect(panel).toContain('onClick={onClose}')
    expect(panel).toContain('<PrivateMemorySnapshot agentName={name} memories={memories} role={role} editable={live} />')
  })
  it('default open, remembered per browser, never decided on the server render', () => {
    const hook = read('lib/agent/useAssistantPanel.ts')
    expect(hook).toContain('useState(true)')
    expect(hook).toContain("localStorage.getItem(KEY) === 'closed'")
    expect(hook).toContain("const KEY = 'sl-assistant-panel'")
  })
  it('「最近替你办完」 lists only outcomes, labels every production action, and /agent/audit exists for the link', async () => {
    const log = read('lib/agent/useActivityLog.ts')
    expect(log).toContain('if (!isOutcomeAction(r.action)) return false')
    expect(log).toContain('.or(`action.like.executed_%,action.in.(${OUTCOME_EVENTS.join(\',\')})`)') // in SQL, before the limit
    const { auditActionLabel } = await import('@/lib/agent/ideas')
    for (const a of ['tenant_agent_turn', 'pending_action_approved', 'work_order_auto_dispatched', 'application_file_viewed', 'lease_signed_tenant', 'executed_send_decision']) expect(auditActionLabel(a, 'zh'), a).toMatch(/[一-龥]/)
    expect(read('app/agent/audit/page.tsx')).toContain('<AuditLog role="agent" />')
  })
  it('the phone sheet IS the web panel (2026-10-04): the old activity sheet is gone', () => {
    expect(existsSync('components/mobile/ActivitySheet.tsx')).toBe(false)
    const sheet = read('components/mobile/AssistantSheet.tsx')
    expect(sheet).toContain('<AssistantPanel {...props} variant="sheet" visible />')
    expect(sheet).toContain('useModalA11y(true, props.onClose, box)')
  })
})

describe('three role pages, one layout', () => {
  it('each mounts the hero chat + the panel and nothing from the old controls column', () => {
    for (const p of pages) {
      const s = read(p)
      expect(s, p).toMatch(/<AgentChat\s+hero\s+phoneFill/)
      expect(s, p).toContain('<AssistantPanel role=')
      expect(s, p).toContain('hidden lg:flex lg:w-[320px] lg:flex-none lg:flex-col lg:border-l lg:border-line-divider 2xl:w-[360px]')
      expect(s, p).toContain('useAssistantPanel()')
      for (const gone of ['<TodayCard', '<LifecycleRail', 'StatusOverview', 'RecommendationDeck', 'RelatedPagesCard', 'PendingActionsPanel', 'WorkflowStatusPanel']) expect(s, `${p} still has ${gone}`).not.toContain(gone)
    }
  })
  it('the three routes are thin wrappers around the shared page (user 2026-09-25: 把三个助手页抽成共享组件)', () => {
    for (const [i, r] of routes.entries()) {
      const s = read(r)
      const role = ['tenant', 'landlord', 'agent'][i]
      expect(s, r).toContain("import AgentWorkspacePage from '@/components/agent/AgentWorkspacePage'")
      expect(s, r).toContain(`<AgentWorkspacePage role="${role}" />`)
      expect(s.split('\n').length, `${r} should stay a wrapper`).toBeLessThan(15)
      expect(s, r).not.toContain('useAgentSession(')
    }
    const s = read(shared)
    expect(s).toContain('export default function AgentWorkspacePage({ role }: { role: AgentRole })')
    expect(s).toContain("const PREVIEW_READS: Record<AgentRole, { zh: string; en: string }>")
    expect(s).toContain('todoHref={`/${role}/todo`}')
    expect(s).toContain('<WorkspaceShell role={role} hideAside phoneApp>')
  })
  it('recommendations moved to /x/ideas', () => {
    expect(read('components/mobile/RolePages.tsx')).toContain('<RecommendationDeck items={data.recommendations} />')
  })
})

describe('pure helpers', () => {
  it('status line', () => {
    expect(assistantStatusLine({ status: 'working', pendingCount: 0, hasApprovals: true, stageLabel: '租前', memoryCount: 3, zh: true })).toBe('正在：租前')
    expect(assistantStatusLine({ status: 'result', pendingCount: 4, hasApprovals: true, stageLabel: '', memoryCount: 0, zh: true })).toBe('等你点头：4 件')
    expect(assistantStatusLine({ status: 'result', pendingCount: 0, hasApprovals: true, stageLabel: '租前', memoryCount: 60, zh: true })).toBe('空闲 · 当前阶段 租前 · 记得 60 条')
    expect(assistantStatusLine({ status: 'result', pendingCount: 0, hasApprovals: false, stageLabel: '', memoryCount: 0, zh: false })).toBe('ONLINE · READING YOUR MEMORY')
  })
  it('row helpers: row time; outcomes only, each under its own hat (2026-10-04, the mixed activity log retired)', () => {
    const now = new Date('2026-09-25T15:00:00-04:00')
    expect(isOutcomeAction('executed_send_message')).toBe(true)
    expect(isOutcomeAction('tenant_agent_turn')).toBe(false)
    expect(isOutcomeAction('delegation_confirmed')).toBe(false) // the person's own action, not something done for them
    expect(outcomeHat('executed_send_decision', null)).toBe('landlord')
    expect(outcomeHat('executed_maintenance_request', null)).toBe('tenant')
    expect(outcomeHat('executed_send_message', null)).toBeNull()
    expect(outcomeHat('executed_send_message', 'agent')).toBe('agent')
    expect(fmtRowTime('2026-09-25T14:02:00-04:00', 'zh', now)).toBe('14:02')
    expect(fmtRowTime('2026-09-24T22:20:00-04:00', 'zh', now)).toBe('22:20')
    expect(fmtRowTime('2026-09-20T09:05:00-04:00', 'zh', now)).toMatch(/9月20日 09:05/)
  })
})

describe('follow-ups (user 2026-09-25: rail "+", jump-to-latest, 3D avatars, activity rows reopen their conversation)', () => {
  it('the rail has no avatar; "+" starts a new conversation in place on the assistant page, via ?new=1 elsewhere', () => {
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).not.toContain("localStorage.getItem('stayloop-avatar')")
    expect(shell).toContain("href={`/${role}/agent?new=1`}")
    expect(shell).toContain("window.dispatchEvent(new Event('sl-new-thread'))")
    expect(read('lib/agent/useAgentSession.ts')).toContain("window.addEventListener('sl-new-thread', h)")
  })
  it('no role marker anywhere around the assistant — rail, panel head, chat header, reopen pill, homepage card (user 2026-09-25, final round); hats switch in the Header menu only', () => {
    const shell = read('components/WorkspaceShell.tsx')
    const rail = shell.slice(shell.indexOf('aria-label={en ? \'New chat\' : \'新对话\'}'), shell.indexOf('{assistant.map((it) => link(it'))
    expect(rail).not.toContain('ROLE_LABEL[role]')
    expect(shell).not.toContain('RoleBadge')
    expect(shell).toContain('<div className="mt-auto" />\n      {records.map((it) => link(it))}\n      {link(settingsItem)}')
    expect(existsSync('components/agent/HatChip.tsx')).toBe(false)
    for (const f of ['components/agent/AssistantPanel.tsx', 'components/agent/AgentChat.tsx', 'components/agent/AgentWorkspacePage.tsx', 'components/home/HomeNext.tsx']) {
      expect(read(f), f).not.toMatch(/HatChip|hatChip|HAT_LABEL|onHatSwitch/)
    }
    expect(read('components/agent/AgentWorkspacePage.tsx')).toContain("{shownName}{pendingCount > 0 ? (zh ? ` · 等你点头 ${pendingCount} 件` : ` · ${pendingCount} waiting`) : ''}")
    expect(read('components/Header.tsx')).toContain('handleRoleSwitch')
  })
  it('a ↓ button appears once the thread is scrolled up and jumps to the newest message', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('el.scrollHeight - el.scrollTop - el.clientHeight > 120')
    expect(chat).toContain("aria-label={zh ? '回到最新消息' : 'Jump to the latest message'}")
    expect(chat).toContain('<div ref={threadRef} onScroll={onThreadScroll}')
  })
  it('3D avatar presets render in code, are picked in the panel, and show everywhere the assistant appears', async () => {
    const { AVATAR_PRESETS, isAvatarPreset } = await import('@/lib/agent/avatars')
    expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(8)
    expect(isAvatarPreset('panda')).toBe(true) // pets since 2026-09-25 evening; the old shapes map onto them
    expect(isAvatarPreset('nope')).toBe(false)
    const panel = read('components/agent/AssistantPanel.tsx')
    expect(panel).toContain('<AvatarPicker ')
    expect(read('components/agent/AvatarPicker.tsx')).toContain('data-testid="avatar-picker"')
    expect(panel).toContain("saveAssistantAvatar(supabase, auth.user.id, key)")
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).not.toContain('style={{ background: ORB[role] }}')
    expect((chat.match(/<AssistantAvatar /g) || []).length).toBeGreaterThanOrEqual(3)
    for (const p of pages) expect(read(p)).toContain('<AssistantAvatar avatar={avatar}')
    expect(read('supabase/migrations/20260925_agent_threads.sql')).toContain('add column if not exists avatar text')
  })
  it('threads: one row per conversation under self RLS; turns carry thread_id; rows reopen it', async () => {
    const sql = read('supabase/migrations/20260925_agent_threads.sql')
    expect(sql).toContain('create table if not exists public.agent_threads')
    expect(sql).toContain('for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())')
    expect(sql).toContain('revoke all on public.agent_threads from anon')
    expect(read('lib/agent/orchestrator.ts')).toContain('thread_id: args.threadId ?? null')
    const hook = read('lib/agent/useAgentSession.ts')
    expect(hook).toContain('threadId: tid,')
    expect(hook).toContain('const created = await createThread(client, uid, role, legacy)') // one-time migration of the localStorage history
    expect(hook).toMatch(/return \{ [^}]*threadId, threadLoading, newThread, openThread \}/)
    // Since 2026-10-04 the AI chats list (ThreadList) is the one place conversations are listed:
    // title · time · one short note, a row reopens the conversation.
    const list = read('components/agent/ThreadList.tsx')
    expect(list).toContain('onClick={() => open(t)}')
    expect(list).toContain('{fmtRowTime(threadAt(t), lang)}')
    expect(list).toContain('{note && <span className="mt-0.5 block truncate text-[12px] leading-snug text-body-3">{note}</span>}')
    const threads = read('lib/agent/threads.ts')
    expect(threads).toContain('summary: threadSummary(messages), turn_count: userTurns(messages)')
    expect(threads).not.toContain('export async function threadAt')
    expect(read('lib/agent/orchestrator.ts')).toContain("metadata: { origin: 'agent_turn', ...(pa.metadata ?? {}), thread_id: args.threadId ?? null }")
    expect(read('app/api/agent/execute/route.ts')).toContain("thread_id: (action.metadata as Record<string, unknown> | null)?.thread_id ?? null")
    expect(hook).toContain("action: 'approval_undone', target_type: 'agent_pending_action', target_id: actionId, metadata: { thread_id:")
    const rpc = read('supabase/migrations/20260925_agent_threads_summary.sql')
    expect(rpc).toContain("'thread_id', v_act.metadata->'thread_id'")
    expect(rpc).toContain('add column if not exists summary text')
    for (const p of pages) expect(read(p)).toContain('currentThreadId={threadId} onOpenThread={openThread}')
    const { threadSummary, userTurns } = await import('@/lib/agent/threads')
    const msgs = [{ id: 'a', role: 'agent', text: '你好' }, { id: 'b', role: 'user', text: '找房' }, { id: 'c', role: 'agent', text: '### 好的\n**两居室**，我先查   一下。' }] as never
    expect(threadSummary(msgs)).toBe('好的 两居室，我先查 一下。')
    expect(userTurns(msgs)).toBe(1)
    const { threadTitle, stripForStorage, MAX_STORED_MESSAGES } = await import('@/lib/agent/threads')
    expect(threadTitle([{ id: 'm1', role: 'agent', text: 'hi' }, { id: 'm2', role: 'user', text: '  帮我找   两居室  ' }] as never)).toBe('帮我找 两居室')
    const many = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => ({ id: `m${i}`, role: 'user', text: 'x', attachments: [{ name: 'a', dataUrl: 'data:1', isImage: true }] }))
    const stored = stripForStorage(many as never)
    expect(stored.length).toBe(MAX_STORED_MESSAGES)
    expect(stored[0].attachments?.[0].dataUrl).toBe('')
  })
})

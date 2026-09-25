// Web assistant pages after the Muse web reference (design/muse-web-blueprint-2026-09.html,
// user 2026-09-25 "按蓝本改，三点都按你建议的来"): a 64px icon rail on every
// workbench page, the conversation as the page, the assistant's own panel
// beside it (default open, closable, remembered), approvals in the thread,
// and the three role pages built the same way.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { assistantStatusLine } from '@/lib/agent/statusLine'
import { activityGroups, activityIcon } from '@/lib/agent/activityLog'

const read = (p: string) => readFileSync(p, 'utf8')
const pages = ['app/tenant/agent/page.tsx', 'app/landlord/agent/page.tsx', 'app/agent/agent/page.tsx']

describe('icon rail (WorkspaceShell, md+)', () => {
  const shell = read('components/WorkspaceShell.tsx')
  it('is a 64px icon column with hover labels; the labelled 220px sidebar is gone', () => {
    expect(shell).toContain('hidden md:flex md:w-16 md:flex-none md:flex-col md:items-center')
    expect(shell).not.toContain('md:w-[220px]')
    expect(shell).toContain('group-hover:block')
  })
  it('carries the four assistant pages (the phone tabs) plus the role pages and settings', () => {
    for (const k of ['`/${role}/agent`', '`/${role}/todo`', '`/${role}/ideas`', '`/${role}/progress`']) expect(shell).toContain(k)
    expect(shell).toMatch(/it\.key === 'todo' \? pendingCount : 0/)
    expect(shell).toContain("const pages = items.filter((it) => it.key !== 'home')")
  })
  it('assistant pages get no content padding on md+ (the chat is the page)', () => {
    expect(shell).toContain("phoneApp ? 'min-w-0 flex-1 p-0 pb-16 md:p-0'")
  })
})

describe('the conversation is the page', () => {
  const chat = read('components/agent/AgentChat.tsx')
  it('hero mode: no card chrome, 760px column, identity header hidden from lg, approvals in the thread, pill composer', () => {
    expect(chat).toMatch(/hero \? 'h-full' : fill \?/)
    expect(chat).toContain("hero ? 'mx-auto w-full max-w-[760px] space-y-4' : 'space-y-4'")
    expect(chat).toContain("${hero ? 'lg:hidden' : ''}")
    expect(chat).toContain("space-y-3 ${hero ? '' : 'lg:hidden'}")
    expect(chat).toContain('pill={hero}')
    expect(chat).toMatch(/export const ORB/)
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
  it('avatar · name · status, then 活动 / 待办 / 记忆; closable; rename writes the user’s own agent_configs row', () => {
    expect(panel).toContain("['activity', zh ? '活动' : 'Activity'")
    expect(panel).toContain("['todo', zh ? '待办' : 'To-do'")
    expect(panel).toContain("['memory', zh ? '记忆' : 'Memory'")
    expect(panel).toContain('useActivityLog(live)')
    expect(panel).toContain("from('agent_configs').update({ agent_name: next }).eq('user_id', auth.user.id).eq('role', role)")
    expect(panel).toContain('onClick={onClose}')
    expect(panel).toContain('<PrivateMemorySnapshot agentName={name} memories={memories} role={role} editable={live} />')
  })
  it('default open, remembered per browser, never decided on the server render', () => {
    const hook = read('lib/agent/useAssistantPanel.ts')
    expect(hook).toContain('useState(true)')
    expect(hook).toContain("localStorage.getItem(KEY) === 'closed'")
    expect(hook).toContain("const KEY = 'sl-assistant-panel'")
  })
  it('the log skips session bookkeeping, labels every production action, and /agent/audit exists for the link', async () => {
    expect(read('lib/agent/useActivityLog.ts')).toContain(".not('action', 'ilike', '%session%')")
    const { auditActionLabel } = await import('@/lib/agent/ideas')
    for (const a of ['tenant_agent_turn', 'pending_action_approved', 'work_order_auto_dispatched', 'application_file_viewed', 'lease_signed_tenant', 'executed_send_decision']) expect(auditActionLabel(a, 'zh'), a).toMatch(/[一-龥]/)
    expect(read('app/agent/audit/page.tsx')).toContain('<AuditLog role="agent" />')
  })
  it('the phone sheet and the web panel read the same log', () => {
    const sheet = read('components/mobile/ActivitySheet.tsx')
    expect(sheet).toContain('useActivityLog(live, 20)')
    expect(sheet).not.toContain("from('agent_audit_events')")
  })
})

describe('three role pages, one layout', () => {
  it('each mounts the hero chat + the panel and nothing from the old controls column', () => {
    for (const p of pages) {
      const s = read(p)
      expect(s, p).toMatch(/<AgentChat\s+hero\s+phoneFill/)
      expect(s, p).toContain('<AssistantPanel role=')
      expect(s, p).toContain('hidden lg:flex lg:w-[360px] lg:flex-none lg:flex-col lg:border-l lg:border-line-divider')
      expect(s, p).toContain('useAssistantPanel()')
      for (const gone of ['<TodayCard', '<LifecycleRail', 'StatusOverview', 'RecommendationDeck', 'RelatedPagesCard', 'PendingActionsPanel', 'WorkflowStatusPanel']) expect(s, `${p} still has ${gone}`).not.toContain(gone)
    }
  })
  it('the layout block is identical across the three roles once the role is normalised', () => {
    const norm = (p: string) => {
      const s = read(p)
      // the loading state has its own </WorkspaceShell> earlier in the file — take the last one
      const block = s.slice(s.indexOf('{!panelOpen && ('), s.lastIndexOf('</WorkspaceShell>'))
      return block.replace(/ROLE_THEME\.(tenant|landlord|agent)/g, 'ROLE_THEME.X').replace(/role="(tenant|landlord|agent)"/g, 'role="X"')
    }
    const [a, b, c] = pages.map(norm)
    expect(a.length).toBeGreaterThan(500)
    expect(b).toBe(a)
    expect(c).toBe(a)
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
  it('activity log groups by today / yesterday / earlier and picks a glyph per action family', () => {
    const now = new Date('2026-09-25T15:00:00-04:00')
    const row = (id: string, iso: string, action = 'turn') => ({ id, action, actor_type: 'agent', created_at: iso, metadata: null })
    const g = activityGroups([row('a', '2026-09-25T14:02:00-04:00'), row('b', '2026-09-24T22:20:00-04:00'), row('c', '2026-09-20T09:00:00-04:00'), row('d', '2026-09-25T09:00:00-04:00')], 'zh', now)
    expect(g.map((x) => [x.label, x.rows.map((r) => r.id)])).toEqual([['今天', ['a', 'd']], ['昨天', ['b']], ['更早', ['c']]])
    expect(activityIcon('executed_send_message')).toBe('✓')
    expect(activityIcon('memory_forgotten')).toBe('🧠')
    expect(activityIcon('approval_undone')).toBe('↩')
    expect(activityIcon('turn')).toBe('💬')
    expect(activityIcon('tenant_agent_turn')).toBe('💬')
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
  it('the role sits above 设置 as a chip that opens the hat switcher, not as a text label under "+" (user 2026-09-25)', () => {
    const shell = read('components/WorkspaceShell.tsx')
    // no text label between "+" and the assistant icons
    const rail = shell.slice(shell.indexOf('aria-label={en ? \'New conversation\' : \'新会话\'}'), shell.indexOf('{assistant.map((it) => link(it'))
    expect(rail).not.toContain('ROLE_LABEL[role]')
    // the chip is the last thing before settings
    expect(shell).toContain('<div className="mt-auto" />\n      <RoleBadge role={role} />\n      {link(settingsItem)}')
    // same rules as the header: held hats switch in place, missing ones link to their door
    expect(shell).toContain("const held = (r: WorkspaceRole) => (r === 'tenant' ? true : r === 'landlord' ? hats.landlord : hats.agent !== null)")
    expect(shell).toContain("href={r === 'landlord' ? '/onboarding/name?role=landlord' : '/agent/verify'}")
    expect(shell).toContain('aria-haspopup="menu"')
  })
  it('a ↓ button appears once the thread is scrolled up and jumps to the newest message', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('el.scrollHeight - el.scrollTop - el.clientHeight > 160')
    expect(chat).toContain("aria-label={zh ? '回到最新消息' : 'Jump to the latest message'}")
    expect(chat).toContain('<div ref={threadRef} onScroll={onThreadScroll}')
  })
  it('3D avatar presets render in code, are picked in the panel, and show everywhere the assistant appears', async () => {
    const { AVATAR_PRESETS, isAvatarPreset } = await import('@/lib/agent/avatars')
    expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(8)
    expect(isAvatarPreset('cube')).toBe(true)
    expect(isAvatarPreset('nope')).toBe(false)
    const panel = read('components/agent/AssistantPanel.tsx')
    expect(panel).toContain('data-testid="avatar-picker"')
    expect(panel).toContain("update({ avatar: key })")
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
    const panel = read('components/agent/AssistantPanel.tsx')
    expect(panel).toContain('await threadAt(supabase, role, r.created_at)')
    expect(panel).toContain('onClick={() => void openRow(r)}')
    const { threadTitle, stripForStorage, MAX_STORED_MESSAGES } = await import('@/lib/agent/threads')
    expect(threadTitle([{ id: 'm1', role: 'agent', text: 'hi' }, { id: 'm2', role: 'user', text: '  帮我找   两居室  ' }] as never)).toBe('帮我找 两居室')
    const many = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => ({ id: `m${i}`, role: 'user', text: 'x', attachments: [{ name: 'a', dataUrl: 'data:1', isImage: true }] }))
    const stored = stripForStorage(many as never)
    expect(stored.length).toBe(MAX_STORED_MESSAGES)
    expect(stored[0].attachments?.[0].dataUrl).toBe('')
  })
})

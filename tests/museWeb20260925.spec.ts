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

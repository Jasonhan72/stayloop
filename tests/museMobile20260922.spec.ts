import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { buildIdeas, auditActionLabel } from '../lib/agent/ideas'
import type { MemoryItem, PendingAction } from '../lib/agent/types'

// Muse mobile benchmark 2026-09-22 (design/muse-mobile-benchmark-2026-09.md,
// user: "按照你的蓝本来改"). Guards for the phone workspace: five tabs, ideas
// planner, approvals in the thread, activity sheet, PWA files.

const mem = (key: string, value: unknown, memory_type = 'preference', label = key): MemoryItem => ({ key, label, value, confidence: 1, memory_type })
const pending: PendingAction = {
  id: 'a1', user_id: 'u', role: 'tenant', action_type: 'send_message', title: '给房东发看房请求', summary: '', data_scope: [], excluded_data: [],
  risk_level: 'low', status: 'pending', requires_approval: true, created_at: '2026-09-22T00:00:00Z', metadata: {},
}

describe('ideas planner (item D) — deterministic, with a reason each', () => {
  it('pending approvals come first and link to the todo tab', () => {
    const out = buildIdeas({ role: 'tenant', lang: 'zh', agentName: 'Luna', memories: [], workflow: null, pendingActions: [pending], recommendations: [] })
    expect(out[0].kind).toBe('pending')
    expect(out[0].href).toBe('/tenant/todo')
    expect(out[0].why).toContain('批准')
  })
  it('reads the reflection profile and concrete memories into prompts', () => {
    const memories = [
      mem('user_model', { current_focus: '11 月前搬到 King West', goals: ['找到能养猫的一居'] }, 'system'),
      mem('budget', '2800', 'constraint', '预算'),
      mem('area', 'King West', 'preference', '区域'),
    ]
    const out = buildIdeas({ role: 'tenant', lang: 'zh', agentName: 'Luna', memories, workflow: { current_stage: 'preference_collection', completed_steps: [] } as never, pendingActions: [], recommendations: [] })
    const kinds = out.map((i) => i.kind)
    expect(kinds).toContain('profile')
    expect(kinds).toContain('stage')
    expect(kinds).toContain('memory')
    const market = out.find((i) => i.id === 'market')!
    expect(market.prompt).toContain('King West')
    expect(market.why).toContain('2800')
    for (const i of out) { expect(i.why.length).toBeGreaterThan(0); expect(i.prompt || i.href).toBeTruthy() }
  })
  it('never exceeds eight and de-duplicates', () => {
    const recos = Array.from({ length: 10 }, (_, k) => ({ id: `r${k}`, title: `T${k}`, description: 'd', href: '/tenant/passport' }))
    const out = buildIdeas({ role: 'tenant', lang: 'en', agentName: 'Luna', memories: [], workflow: null, pendingActions: [], recommendations: recos })
    expect(out.length).toBeLessThanOrEqual(8)
    expect(out.filter((i) => i.href === '/tenant/passport').length).toBe(1)
  })
  it('audit labels are human and never leak raw codes for known actions', () => {
    expect(auditActionLabel('executed_showing_request', 'zh', { sent_to: 'a@b.c' })).toContain('看房')
    expect(auditActionLabel('memory_forgotten', 'en')).toMatch(/forgot/i)
    expect(auditActionLabel('some_new_thing', 'en')).toBe('some new thing')
  })
})

describe('phone workspace wiring', () => {
  const shell = readFileSync('components/WorkspaceShell.tsx', 'utf8')
  const chat = readFileSync('components/agent/AgentChat.tsx', 'utf8')
  it('five phone tabs (助手 · 待办 · 想法 · 进度 · 更多) with a pending badge; desktop rail unchanged', () => {
    expect(shell).toMatch(/function PhoneTabs/)
    for (const k of ["key: 'agent'", "key: 'todo'", "key: 'ideas'", "key: 'progress'"]) expect(shell).toContain(k)
    expect(shell).toMatch(/badge: pendingCount/)
    expect(shell).toMatch(/className="hidden md:static md:flex/)
    // agent tabs stay open before RECO verification
    expect(shell).toMatch(/\(agent\|verify\|todo\|ideas\|progress\)/)
  })
  it('routes exist for all three roles', () => {
    for (const r of ['tenant', 'landlord', 'agent']) for (const p of ['todo', 'ideas', 'progress']) expect(existsSync(`app/${r}/${p}/page.tsx`), `${r}/${p}`).toBe(true)
  })
  it('approvals render inside the thread below lg and the status line is real', () => {
    expect(chat).toMatch(/pendingActions\?: PendingAction\[\]/)
    expect(chat).toMatch(/<div className="space-y-3 lg:hidden">/)
    expect(chat).toMatch(/ActivitySheet/)
    expect(chat).toMatch(/Waiting on you/)
    // legacy decorative line only when the chat is used without a session (homepage)
    expect(chat).toMatch(/if \(!pendingActions\) return zh \? '在线 · 读取你的记忆'/)
  })
  it('agent pages hide the controls column on phones and the duplicate approvals below lg', () => {
    for (const r of ['tenant', 'landlord', 'agent']) {
      const s = readFileSync(`app/${r}/agent/page.tsx`, 'utf8')
      expect(s, r).toMatch(/hidden min-w-0 space-y-6 md:block/)
      expect(s, r).toMatch(/hidden (scroll-mt-24 )?lg:block/)
      expect(s, r).toMatch(/pendingActions=\{pendingActions\}/)
    }
  })
  it('memories are editable only for live sessions and leave audit events', () => {
    const m = readFileSync('components/agent/PrivateMemorySnapshot.tsx', 'utf8')
    expect(m).toMatch(/action: 'memory_forgotten'/)
    expect(m).toMatch(/action: 'memory_edited'/)
    expect(m).toMatch(/const canEdit = editable && !!role/)
  })
})

describe('PWA (item F)', () => {
  it('manifest + icons + a service worker with NO fetch handler (no stale cache)', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'))
    expect(manifest.display).toBe('standalone')
    for (const i of manifest.icons) expect(existsSync(`public${i.src}`), i.src).toBe(true)
    const sw = readFileSync('public/sw.js', 'utf8')
    expect(sw).not.toMatch(/addEventListener\('fetch'/)
    expect(sw).not.toMatch(/caches\./)
    const layout = readFileSync('app/layout.tsx', 'utf8')
    expect(layout).toMatch(/rel="manifest" href="\/manifest.json"/)
    expect(layout).toMatch(/apple-touch-icon/)
  })
})

// 2026-09-22 (user): once signed in the homepage's three role pills duplicate
// the header menu — hide them and pin the hero to the active hat; the menu
// shows the current hat, names workspaces after the assistant, and lists
// every hat with its state.
describe('signed-in homepage + identity menu', () => {
  const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
  const header = readFileSync('components/Header.tsx', 'utf8')
  it('homepage hides the pills for signed-in users and mirrors auth.role', () => {
    expect(home).toMatch(/\{signedIn \? \(/)
    expect(home).toMatch(/const r = auth\.role \|\| 'tenant'/)
    expect(home).toMatch(/换身份在右上角菜单/)
  })
  it('menu: identity row, assistant-named workspace (no quick chips — user 2026-09-22), three hats with 当前 / 待认证 / 开通, red dot only when something waits', () => {
    expect(header).toMatch(/当前：\$\{ROLE_META\[currentRole\]\.label\} · \$\{aiNames\[currentRole\]\}/)
    expect(header).not.toMatch(/\/\$\{currentRole\}\/\$\{k\}/)
    expect(header).toMatch(/\$\{aiNames\[currentRole\]\} 的工作台/)
    expect(header).toMatch(/\(\['tenant', 'landlord', 'agent'\] as const\)\.map\(\(r\) => \{\s*const held = heldRoles\.includes\(r\)/)
    expect(header).toMatch(/auth\.user && pendingCount > 0 && \(/)
    expect(header).not.toMatch(/otherRoles|missingRoles/)
  })
})

// Site test 2026-10-02 (design/test-plan-2026-09-22.md against a1fab56), group G1 · hats.
//  · L6-authed D1 (P1): a signed-in account without the landlord hat on /landlord/* or
//    /dashboard fired thousands of /landlord/become requests and never left the "…" —
//    the guard effect depended on fresh `auth` / `hats` objects and called setRole(),
//    whose event re-armed useAuth's route effect. It must redirect exactly once.
//  · L6-authed D5 / L7-signed-in D6: a provider-only account landed in the tenant chat
//    after sign-in (a 'tenant' agent_configs row outranked the held provider hat), and
//    hat-less /landlord visits bootstrapped landlord agent sessions.
//  · L6-public D3: the preview banner's "Sign in →" split across two lines at 390.
//  · L6-public D7 / L6-authed D8: workspace pages without an h1.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const nav = vi.hoisted(() => ({ path: '/landlord/agent', replace: vi.fn(), push: vi.fn() }))
const router = vi.hoisted(() => ({ replace: (...a: unknown[]) => nav.replace(...a), push: (...a: unknown[]) => nav.push(...a), refresh: () => {}, prefetch: () => {} }))
const st = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authLoading: false,
  hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: null as string | null, admin: false },
  setRole: vi.fn(),
  sessionCalls: [] as string[],
  realAuth: false,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
const sbAuth = vi.hoisted(() => ({
  getSession: async () => ({ data: { session: st.user ? { user: st.user, access_token: 'tok' } : null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
}))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: sbAuth, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }), rpc: vi.fn() }, getSupabaseBrowser: () => ({ auth: sbAuth }) }))
// Fresh objects on every call — exactly what the real hooks return, and what kept the old guard's effect re-running.
// `st.realAuth` switches to the real hook, whose route effect remembers "landlord" on /landlord/* — the other half of the old ping-pong.
vi.mock('@/lib/useAuth', async () => {
  const actual = await vi.importActual<typeof import('../lib/useAuth')>('../lib/useAuth')
  return {
    ...actual,
    useAuth: () => (st.realAuth ? actual.useAuth() : { loading: st.authLoading, user: st.user, session: null, role: null, fullName: null, email: null, setRole: st.setRole, signOut: async () => {} }),
  }
})
vi.mock('@/lib/useHats', async () => {
  const actual = await vi.importActual<typeof import('../lib/useHats')>('../lib/useHats')
  return { ...actual, useHats: () => ({ ...st.hats, refresh: async () => {} }) }
})
vi.mock('@/lib/agent/pendingCount', () => ({ fetchPendingCount: async () => 0, PENDING_CHANGED_EVENT: 'x' }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => 0 }))
vi.mock('@/components/mobile/AssistantSheet', () => ({ default: () => null }))
vi.mock('@/components/agent/ThreadList', () => ({ default: () => null, SidebarIcon: () => null }))
vi.mock('@/components/Header', () => ({ default: () => null }))
vi.mock('@/components/delegations/RepresentingStrip', () => ({ default: () => null }))
vi.mock('../components/workspace/rail', async () => {
  const actual = await vi.importActual<typeof import('../components/workspace/rail')>('../components/workspace/rail')
  return { ...actual, PhoneTabs: () => null }
})
// AgentWorkspacePage's heavy children
vi.mock('@/lib/agent/useAgentSession', () => ({
  useAgentSession: (role: string) => { st.sessionCalls.push(role); return { loading: true, live: false, data: null, status: 'idle', messages: [], decide: () => {}, sendMessage: () => {}, markListingsShown: () => {}, scheduled: {}, undo: () => {}, threadId: null, threadLoading: false, openThread: () => {} } },
}))
vi.mock('@/lib/lifecycle/useLifecycle', () => ({ useLifecycle: () => ({ lifecycle: null }) }))
vi.mock('@/lib/agent/useAssistantPanel', () => ({ useAssistantPanel: () => [false, () => {}] }))
vi.mock('@/lib/agent/usePromptDeepLink', () => ({ usePromptDeepLink: () => {} }))
vi.mock('@/components/agent/AgentChat', () => ({ default: () => null }))
vi.mock('@/components/agent/AssistantPanel', () => ({ default: () => null }))
vi.mock('@/components/mobile/ContextStrip', () => ({ default: () => null }))

import WorkspaceShell, { shellPageTitle } from '../components/WorkspaceShell'
import AgentWorkspacePage from '../components/agent/AgentWorkspacePage'
import { homeForHats, landingAfterSignIn } from '../lib/landlordHat'

const read = (p: string) => readFileSync(p, 'utf8')

// Minimal browser globals (vitest runs in node): storage, rAF, a document whose h1 list we control.
let otherH1: { hasAttribute: (n: string) => boolean; getClientRects: () => unknown[] }[] = []
const storage = new Map<string, string>()
beforeEach(() => {
  storage.clear()
  otherH1 = []
  nav.replace.mockClear()
  st.setRole.mockClear()
  st.sessionCalls = []
  const g = globalThis as unknown as Record<string, unknown>
  g.window = Object.assign(globalThis, {
    location: { search: '', pathname: nav.path },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v) }, removeItem: (k: string) => { storage.delete(k) } },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    requestAnimationFrame: (cb: () => void) => { cb(); return 1 },
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  })
  g.document = { querySelectorAll: (sel: string) => (sel === 'h1' ? otherH1 : []), body: {}, documentElement: {} }
  g.MutationObserver = class { observe() {} disconnect() {} }
})
afterEach(() => { st.realAuth = false; st.user = null; st.authLoading = false; st.hats = { ...st.hats, loading: false, landlord: false, agent: null, provider: null } })

const kid = () => <p data-testid="landlord-tool">landlord tool</p>
function renderShell(role: 'tenant' | 'landlord' | 'agent' = 'landlord') {
  let r!: TestRenderer.ReactTestRenderer
  act(() => { r = TestRenderer.create(<WorkspaceShell role={role}>{kid()}</WorkspaceShell>) })
  return r
}
const hasTool = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props['data-testid'] === 'landlord-tool').length > 0
const shellH1 = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === 'h1')

describe('L6 D1 · the landlord-hat guard redirects exactly once', () => {
  it('a signed-in tenant on /landlord/agent: one router.replace, no setRole event, nothing rendered — even across many re-renders', () => {
    nav.path = '/landlord/agent'
    st.user = { id: 'u-tenant' }
    const r = renderShell()
    for (let i = 0; i < 8; i++) act(() => { r.update(<WorkspaceShell role="landlord">{kid()}</WorkspaceShell>) })
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(nav.replace).toHaveBeenCalledWith('/landlord/become?next=%2Flandlord%2Fagent')
    expect(st.setRole).not.toHaveBeenCalled() // its sl-role-changed event re-armed useAuth's route effect
    expect(storage.get('sl-active-role:u-tenant')).toBe('tenant') // the remembered hat is put back to one the account holds
    expect(hasTool(r)).toBe(false)
  })
  it('an agent account is remembered as agent; a new landlord path redirects again (once)', () => {
    nav.path = '/landlord/leases'
    st.user = { id: 'u-agent' }
    st.hats = { ...st.hats, agent: 'verified' }
    const r = renderShell()
    act(() => { r.update(<WorkspaceShell role="landlord">{kid()}</WorkspaceShell>) })
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(storage.get('sl-active-role:u-agent')).toBe('agent')
    nav.path = '/landlord/finance'
    act(() => { r.update(<WorkspaceShell role="landlord">{kid()}</WorkspaceShell>) })
    act(() => { r.update(<WorkspaceShell role="landlord">{kid()}</WorkspaceShell>) })
    expect(nav.replace).toHaveBeenCalledTimes(2)
  })
  it('with the real useAuth (route effect remembers "landlord"): still one redirect, and once the page is left the account is remembered as tenant', async () => {
    nav.path = '/landlord/agent'
    st.realAuth = true
    st.user = { id: 'u-real' }
    const r = renderShell()
    await act(async () => { await new Promise((res) => setTimeout(res, 0)) })
    for (let i = 0; i < 5; i++) act(() => { r.update(<WorkspaceShell role="landlord">{kid()}</WorkspaceShell>) })
    expect(nav.replace).toHaveBeenCalledTimes(1)
    expect(hasTool(r)).toBe(false)
    act(() => { r.unmount() }) // the redirect leaves the page
    expect(storage.get('sl-active-role:u-real')).toBe('tenant')
  })
  it('hats still loading: nothing renders and nothing redirects yet', () => {
    nav.path = '/landlord/agent'
    st.user = { id: 'u-x' }
    st.hats = { ...st.hats, loading: true }
    const r = renderShell()
    expect(hasTool(r)).toBe(false)
    expect(nav.replace).not.toHaveBeenCalled()
  })
  it('a real landlord: the page mounts exactly once as auth, then hats, resolve (review 2026-10-02: no mount → unmount → mount)', () => {
    nav.path = '/landlord/agent'
    let mounts = 0
    function Tool() { React.useEffect(() => { mounts++ }, []); return <p data-testid="landlord-tool">tool</p> }
    const el = <WorkspaceShell role="landlord"><Tool /></WorkspaceShell>
    st.authLoading = true
    st.user = null
    st.hats = { ...st.hats, loading: true, landlord: false }
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(el) })
    expect(mounts).toBe(0) // auth unresolved: the server HTML and the first client render both show the placeholder
    st.authLoading = false
    st.user = { id: 'u-ll2' }
    act(() => { r.update(<WorkspaceShell role="landlord"><Tool /></WorkspaceShell>) })
    expect(mounts).toBe(0) // signed in, hats loading
    st.hats = { ...st.hats, loading: false, landlord: true }
    act(() => { r.update(<WorkspaceShell role="landlord"><Tool /></WorkspaceShell>) })
    expect(mounts).toBe(1)
    expect(nav.replace).not.toHaveBeenCalled()
  })
  it('a landlord and an anonymous visitor see the page; tenant shells are untouched', () => {
    nav.path = '/landlord/agent'
    st.user = { id: 'u-ll' }
    st.hats = { ...st.hats, landlord: true }
    expect(hasTool(renderShell())).toBe(true)
    st.user = null
    st.hats = { ...st.hats, landlord: false }
    expect(hasTool(renderShell())).toBe(true)
    nav.path = '/tenant/agent'
    st.user = { id: 'u-t' }
    expect(hasTool(renderShell('tenant'))).toBe(true)
    expect(nav.replace).not.toHaveBeenCalled()
  })
  it('useLandlord redirects at most once per page instance', () => {
    const s = read('lib/useLandlord.ts')
    expect(s).toContain('!becomeSent.current && !window.location.pathname.startsWith')
    expect(s).toContain('becomeSent.current = true')
  })
})

describe('L6 D5 · hat-less /landlord visits never start a landlord agent session', () => {
  const renderPage = (role: 'tenant' | 'landlord' | 'agent') => { act(() => { TestRenderer.create(<AgentWorkspacePage role={role} />) }) }
  it('signed in without the hat, or hats unknown, or auth still loading → useAgentSession is not mounted', () => {
    nav.path = '/landlord/agent'
    st.user = { id: 'u-p' }
    st.hats = { ...st.hats, provider: 'verified' }
    renderPage('landlord')
    st.hats = { ...st.hats, loading: true }
    renderPage('landlord')
    st.user = null; st.authLoading = true
    renderPage('landlord')
    expect(st.sessionCalls).toEqual([])
  })
  it('a landlord, an anonymous preview and the other hats still get their session', () => {
    nav.path = '/landlord/agent'
    st.user = { id: 'u-ll' }
    st.hats = { ...st.hats, landlord: true }
    renderPage('landlord')
    st.user = null; st.hats = { ...st.hats, landlord: false }
    renderPage('landlord')
    nav.path = '/tenant/agent'
    st.user = { id: 'u-t' }
    renderPage('tenant')
    expect(st.sessionCalls).toEqual(['landlord', 'landlord', 'tenant'])
  })
})

describe('L6 D5 · /landlord/todo|ideas|progress gate the session too (review 2026-10-02)', () => {
  it('each page renders the shell skeleton until the landlord hat is known, and only then mounts the session', () => {
    const s = read('components/mobile/RolePages.tsx')
    expect(s).toContain("if (role !== 'landlord') return true")
    expect(s).toContain('return !signedIn || (!hats.loading && hats.landlord)')
    for (const [page, inner] of [['TodoPage', 'TodoInner'], ['IdeasPage', 'IdeasInner'], ['ProgressPage', 'ProgressInner']]) {
      expect(s).toContain(`export function ${page}({ role }: { role: AgentRole }) {\n  return useLandlordSessionAllowed(role) ? <${inner} role={role} /> : <Skeleton role={role} />`)
      expect(s).toContain(`function ${inner}({ role }: { role: AgentRole }) {`)
    }
  })
})

describe('L7 D6 / L6 D5 · a provider-only account lands on its jobs after sign-in', () => {
  const provider = { provider: 'verified' }
  it("a 'tenant' hint from agent_configs does not outrank a held provider hat", () => {
    expect(landingAfterSignIn(null, 'tenant', provider)).toBe('/provider/jobs')
    // the homepage (stored = null) already agreed
    expect(homeForHats(null, provider)).toBe('/provider/jobs')
  })
  it('a hat remembered in this browser is still the person’s choice', () => {
    expect(landingAfterSignIn('tenant', null, provider)).toBe('/tenant/agent')
    expect(landingAfterSignIn('provider', null, provider)).toBe('/provider/jobs')
  })
  it('other accounts land as before', () => {
    expect(landingAfterSignIn(null, 'tenant', {})).toBe('/tenant/agent')
    expect(landingAfterSignIn(null, 'tenant', { landlord: true })).toBe('/tenant/agent')
    expect(landingAfterSignIn(null, 'tenant', { landlord: true, provider: 'verified' })).toBe('/tenant/agent')
    expect(landingAfterSignIn(null, 'landlord', { landlord: true })).toBe('/landlord/agent')
    expect(landingAfterSignIn(null, 'landlord', {})).toBe('/tenant/agent') // a config role is never a landing on its own
    expect(landingAfterSignIn(null, 'landlord', provider)).toBe('/provider/jobs')
  })
  it('the callback passes the remembered hat and the config hint separately', () => {
    const cb = read('app/auth/callback/page.tsx')
    expect(cb).toContain('const fromStored = !!stored && candidate === stored')
    expect(cb).toContain('landingAfterSignIn(fromStored ? candidate : null, fromStored ? null : candidate, hats as HatsLite)')
  })
})

describe('L6 D3 · the preview banner keeps "Sign in →" whole', () => {
  it('the link does not wrap', () => {
    expect(read('components/agent/AgentWorkspacePage.tsx')).toContain(`<a href="/login" className="whitespace-nowrap font-bold text-brand">{zh ? '登录 →' : 'Sign in →'}</a>`)
  })
})

describe('L6 D7 / D8 · every workspace page has exactly one h1', () => {
  it('names the page from the rail (full English names, assistant, fallback)', () => {
    expect(shellPageTitle('landlord', '/landlord/agent', true)).toBe('AI 助理')
    expect(shellPageTitle('tenant', '/tenant/agent', false)).toBe('AI Agent')
    expect(shellPageTitle('landlord', '/landlord/maintenance', false)).toBe('Maintenance')
    expect(shellPageTitle('landlord', '/screening/app', true)).toBe('筛查')
    expect(shellPageTitle('tenant', '/tenant/passport/sharing', false)).toBe('Passport')
    expect(shellPageTitle('agent', '/agent/showings/abc', true)).toBe('经纪工作台')
    expect(shellPageTitle('tenant', '/messages', false)).toBe('Messages')
  })
  it('adds a visually hidden h1 when the page has none', () => {
    nav.path = '/tenant/agent'
    st.user = null
    const r = renderShell('tenant')
    const h1 = shellH1(r)
    expect(h1).toHaveLength(1)
    expect(h1[0].props.className).toBe('sr-only')
    expect(h1[0].props['data-shell-h1']).toBe('')
  })
  it('never adds a second one when the page shows its own (visible) h1', () => {
    nav.path = '/tenant/todo'
    otherH1 = [{ hasAttribute: () => false, getClientRects: () => [{}] }]
    expect(shellH1(renderShell('tenant'))).toHaveLength(0)
  })
  it('an h1 hidden at this width (display:none) does not count', () => {
    nav.path = '/messages'
    otherH1 = [{ hasAttribute: () => false, getClientRects: () => [] }]
    expect(shellH1(renderShell('tenant'))).toHaveLength(1)
  })
})


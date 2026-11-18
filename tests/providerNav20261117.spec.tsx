// @vitest-environment jsdom
// 2026-11-17 · the service provider's own navigation (product report §4.7). Three hats had a workspace
// rail; a provider had none, and on a phone a provider-only account saw the tenant workspace's tabs
// (AI 助理 · 待办 · 想法 · 进度) with its jobs under 更多. Now: a rail on desktop and a five-tab bar on
// phones — 工单 · 历史 · 资料与资质 · 消息 · 找人 — on the provider's pages and wherever the header says
// 「我是服务商」 (/messages, /settings, the public pages).
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')
const state = vi.hoisted(() => ({
  path: '/provider/jobs',
  lang: 'zh' as 'zh' | 'en',
  auth: { user: { id: 'u1' } as null | { id: string }, loading: false, role: null as string | null },
  hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: 'verified' as string | null, admin: false },
  onProvider: true,
  unread: 0,
  invites: 0,
  providerRow: { id: 'p1' } as null | { id: string },
  asked: [] as string[],
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => state.auth, roleStorageKey: (uid: string) => `sl-active-role:${uid}`, roleFromPath: () => null }))
vi.mock('@/lib/useHats', () => ({ useHats: () => state.hats, activeHat: () => 'tenant', bestHat: () => 'tenant' }))
vi.mock('@/lib/useHomeHref', () => ({ useHomeHref: () => ({ href: '/', onProvider: state.onProvider, signedIn: !!state.auth.user }) }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => state.unread }))
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    state.asked.push(table)
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) q[m] = () => q
    q.maybeSingle = async () => ({ data: state.providerRow })
    q.then = (ok: (v: { count: number }) => unknown) => Promise.resolve({ count: state.invites }).then(ok)
    return q
  }
  return { supabase: { from }, getSupabaseBrowser: () => ({ from }) }
})
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header', { 'data-testid': 'site-header' }) }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))
// The workspace phone bar is a heavy component of its own; here it only needs to be recognisable.
vi.mock('@/components/workspace/rail', async (importOriginal) => {
  const real = await importOriginal<typeof import('../components/workspace/rail')>()
  return { ...real, PhoneTabs: ({ role }: { role: string }) => React.createElement('nav', { 'data-testid': 'workspace-tabs', 'data-role': role }) }
})

import { PROVIDER_ITEMS, ProviderRail, ProviderTabs } from '../components/provider/ProviderNav'
import ProviderShell from '../components/provider/ProviderShell'
import MobileBottomNav from '../components/MobileBottomNav'

afterEach(() => {
  cleanup()
  Object.assign(state, { path: '/provider/jobs', lang: 'zh', onProvider: true, unread: 0, invites: 0, providerRow: { id: 'p1' }, asked: [] })
  state.auth = { user: { id: 'u1' }, loading: false, role: null }
  state.hats = { loading: false, tenant: true, landlord: false, agent: null, provider: 'verified', admin: false }
})
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

describe('the provider’s five places', () => {
  it('工单 · 历史 · 资料与资质 · 消息 · 找人, each with its own icon and a line saying what it is for', () => {
    expect(PROVIDER_ITEMS.map((x) => [x.key, x.href, x.label.zh])).toEqual([
      ['jobs', '/provider/jobs', '工单'],
      ['history', '/provider/history', '历史'],
      ['profile', '/provider/onboard', '资料与资质'],
      ['msgs', '/messages', '消息'],
      ['find', '/agents', '找人'],
    ])
    const icons = PROVIDER_ITEMS.map((x) => (x.icon as { type: { name: string } }).type.name)
    expect(new Set(icons).size).toBe(icons.length)
    for (const x of PROVIDER_ITEMS) expect(x.desc.zh.length, x.key).toBeGreaterThan(4)
    // no AI Agent pages: a provider has no assistant workspace
    expect(PROVIDER_ITEMS.some((x) => /\/(agent|todo|ideas|progress)$/.test(x.href))).toBe(false)
  })
})

describe('phone: a five-tab bar', () => {
  it('five links, the current one marked, short labels that fit', async () => {
    const { container } = render(<ProviderTabs />)
    await settle()
    const nav = only(container, '[data-testid="provider-tabs"]')
    expect(nav.className).toContain('md:hidden')
    const links = all<HTMLAnchorElement>(nav, 'a')
    expect(links.map((a) => [a.getAttribute('href'), textOf(a)])).toEqual([
      ['/provider/jobs', '工单'], ['/provider/history', '历史'], ['/provider/onboard', '资料'], ['/messages', '消息'], ['/agents', '找人'],
    ])
    expect(links.map((a) => a.getAttribute('aria-current'))).toEqual(['page', null, null, null, null])
  })
  it('工单 carries the invitations waiting for an answer, 消息 the unread count', async () => {
    state.invites = 2
    state.unread = 12
    const { container } = render(<ProviderTabs />)
    await settle()
    const [jobs, , , msgs] = all<HTMLAnchorElement>(container, '[data-testid="provider-tabs"] a')
    expect(textOf(jobs)).toBe('2工单')
    expect(textOf(msgs)).toBe('9+消息')
    expect(state.asked).toEqual(['service_providers', 'work_orders'])
  })
  it('an account with no provider record asks for no work orders', async () => {
    state.providerRow = null
    render(<ProviderTabs />)
    await settle()
    expect(state.asked).toEqual(['service_providers'])
  })
  it('English shows no Chinese', async () => {
    state.lang = 'en'
    const { container } = render(<ProviderTabs />)
    await settle()
    expect(container.textContent).not.toMatch(/[一-鿿]/)
  })
})

describe('desktop: the icon rail', () => {
  it('the five places plus account settings, named for screen readers; the phone bar only when asked', async () => {
    state.path = '/provider/history'
    state.invites = 3
    const { container } = render(<ProviderRail />)
    await settle()
    const rail = only(container, '[data-testid="provider-rail"]')
    expect(rail.className).toContain('hidden md:sticky')
    const links = all<HTMLAnchorElement>(rail, 'a')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/provider/jobs', '/provider/history', '/provider/onboard', '/messages', '/agents', '/settings'])
    expect(links[0].getAttribute('aria-label')).toBe('工单，3 条新的')
    expect(links[1].getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('[data-testid="provider-tabs"]')).toBeNull()
    cleanup()
    const withPhone = render(<ProviderRail phone />)
    await settle()
    only(withPhone.container, '[data-testid="provider-tabs"]')
    only(withPhone.container, '[data-testid="provider-rail"]')
  })
})

describe('where it shows', () => {
  it('the provider pages share one frame; the rail appears once the account has a provider record', async () => {
    let r = render(<ProviderShell><p data-testid="kid">x</p></ProviderShell>)
    await settle()
    only(r.container, '[data-testid="provider-rail"]')
    only(r.container, '[data-testid="site-header"]')
    only(r.container, '[data-testid="kid"]')
    cleanup()
    // an applicant who has not submitted yet, and a signed-out visitor: the plain page
    state.hats = { ...state.hats, provider: null }
    r = render(<ProviderShell narrow><p>x</p></ProviderShell>)
    await settle()
    expect(r.container.querySelector('[data-testid="provider-rail"]')).toBeNull()
    expect(only(r.container, 'main').className).toContain('max-w-[760px]')
    for (const f of ['app/provider/jobs/page.tsx', 'app/provider/history/page.tsx', 'app/provider/onboard/page.tsx']) {
      expect(read(f), f).toContain("import ProviderShell from '@/components/provider/ProviderShell'")
      expect(read(f), f).not.toMatch(/<Header \/><main className="mx-auto w-full max-w-/)
    }
  })
  it('the public phone bar is the provider’s when the header says 服务商, the workspace’s otherwise', async () => {
    state.path = '/agents'
    let r = render(<MobileBottomNav />)
    await settle()
    only(r.container, '[data-testid="provider-tabs"]')
    expect(r.container.querySelector('[data-testid="workspace-tabs"]')).toBeNull()
    cleanup()
    // same account, acting as a tenant (not on a provider page, provider not remembered, has another reason to be a tenant)
    state.onProvider = false
    state.hats = { ...state.hats, landlord: true }
    r = render(<MobileBottomNav />)
    await settle()
    only(r.container, '[data-testid="workspace-tabs"]')
    expect(r.container.querySelector('[data-testid="provider-tabs"]')).toBeNull()
    cleanup()
    // no provider record at all → never the provider bar, even on /provider/onboard
    state.onProvider = true
    state.path = '/provider/onboard'
    state.hats = { ...state.hats, landlord: false, provider: null }
    r = render(<MobileBottomNav />)
    await settle()
    only(r.container, '[data-testid="workspace-tabs"]')
  })
  it('shared pages: /messages puts the rail beside the message centre; the workspace shell swaps rails by identity', () => {
    const m = read('app/messages/page.tsx')
    expect(m).toMatch(/<ProviderRail \/>\s*\n\s*<div className="min-w-0 flex-1"><MessageCenter hat="provider" \/><\/div>/)
    const shell = read('components/WorkspaceShell.tsx')
    expect(shell).toContain("const providerNav = !!shellHats.provider && displayIdentity(shellPath, shellHome.onProvider, role, shellHats) === 'provider'")
    expect(shell).toContain('{providerNav ? <ProviderRail phone /> : <Rail role={role} />}')
    const nav = read('components/MobileBottomNav.tsx')
    expect(nav).toContain("if (hats.provider && displayIdentity(path, home.onProvider, role, hats) === 'provider') return <ProviderTabs />")
  })
})

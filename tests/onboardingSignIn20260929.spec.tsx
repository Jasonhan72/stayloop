// 2026-09-29 ·「从我是菜单下面的这几个页面，点击唤醒你的 AI 助理按钮，是不是应该先有登录？
// 才能到设置助理这个步骤？」— yes. The naming step (/onboarding/name) let a signed-out
// visitor name an assistant that was kept only in that browser, then dropped them in a
// preview that remembers nothing. Now the page asks them to sign in first and brings
// them back — with the identity they came for — to name the assistant on their account.
// The no-account preview stays one link away.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn(), replace: vi.fn() }))
const auth = vi.hoisted(() => ({ state: { user: null as null | { id: string }, loading: false, role: null as string | null, setRole: () => {} } }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseBrowser: () => ({ auth: {} }), supabase: { auth: {}, rpc: vi.fn() } }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => auth.state }))
vi.mock('@/lib/useHats', () => ({ invalidateHats: () => {} }))
vi.mock('@/lib/useOnboarding', async () => {
  const actual = await vi.importActual<typeof import('../lib/useOnboarding')>('../lib/useOnboarding')
  return { ...actual, useOnboarded: () => ({ ready: true, onboarded: false, home: '/tenant/agent' }) }
})

import OnboardingNamePage from '../app/onboarding/name/page'
import LoginCard from '../components/home/LoginCard'
import { callbackUrl } from '../lib/auth/useLoginForm'

const read = (p: string) => readFileSync(p, 'utf8')
const textOf = (n: TestRenderer.ReactTestInstance): string =>
  n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')

function render(query: string, user: { id: string } | null, loading = false) {
  nav.params = new URLSearchParams(query)
  auth.state = { user, loading, role: null, setRole: () => {} }
  let r!: TestRenderer.ReactTestRenderer
  act(() => { r = TestRenderer.create(<OnboardingNamePage />) })
  return r
}
const logins = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(LoginCard)
const preview = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props['data-testid'] === 'onboarding-preview')[0]

describe('/onboarding/name: sign in before setting up the AI Agent', () => {
  afterEach(() => { auth.state = { user: null, loading: false, role: null, setRole: () => {} } })

  it('signed out, arriving with an identity → the sign-in step, which returns here with that identity', () => {
    const r = render('role=landlord', null)
    const card = logins(r)
    expect(card).toHaveLength(1)
    expect(card[0].props.next).toBe('/onboarding/name?role=landlord')
    const text = textOf(r.root)
    expect(text).toContain('先登录，再设置你的 AI 助理')
    expect(text).toContain('身份：房东 · 登录后接着给 AI 助理起名')
    expect(text).toContain('STEP 01 / 02') // sign in → name
    expect(text).not.toContain('为你的 AI 助理起名') // no naming while signed out
    expect(preview(r).props.href).toBe('/landlord/agent')
    expect(text).toContain('预览不用账户，但不会记住你，也不能替你办事。')
  })

  it('signed out, no identity yet → sign-in is step 1 of 3 and comes back to the chooser', () => {
    const r = render('', null)
    expect(logins(r)[0].props.next).toBe('/onboarding/name')
    const text = textOf(r.root)
    expect(text).toContain('登录后选身份，再给 AI 助理起名')
    expect(text).toContain('STEP 01 / 03')
    expect(text).not.toContain('你现在主要是哪种身份？')
    expect(preview(r).props.href).toBe('/tenant/agent')
  })

  it('while the session is still loading nothing is shown — no sign-in flash for a signed-in visitor', () => {
    const r = render('role=tenant', null, true)
    expect(logins(r)).toHaveLength(0)
    expect(textOf(r.root)).not.toContain('为你的 AI 助理起名')
    expect(r.root.findAll((n) => n.props['aria-busy'] === 'true')).toHaveLength(1)
  })

  it('signed in, no identity → the chooser as step 2 of 3', () => {
    const r = render('', { id: 'u1' })
    expect(logins(r)).toHaveLength(0)
    const text = textOf(r.root)
    expect(text).toContain('你现在主要是哪种身份？')
    expect(text).toContain('STEP 02 / 03')
  })

  it('signed in with an identity → straight to naming, the last of two steps', () => {
    const r = render('role=tenant', { id: 'u1' })
    expect(logins(r)).toHaveLength(0)
    const text = textOf(r.root)
    expect(text).toContain('为你的 AI 助理起名')
    expect(text).toContain('STEP 02 / 02')
  })
})

describe('the return path survives every sign-in method', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('callbackUrl takes an explicit next and keeps the same safety check', () => {
    vi.stubGlobal('window', { location: { origin: 'https://www.stayloop.ai', search: '' } })
    expect(callbackUrl('/onboarding/name?role=agent')).toBe('https://www.stayloop.ai/auth/callback?next=%2Fonboarding%2Fname%3Frole%3Dagent')
    expect(callbackUrl('//evil.com')).toBe('https://www.stayloop.ai/auth/callback')
    expect(callbackUrl('/\\evil.com')).toBe('https://www.stayloop.ai/auth/callback')
    expect(callbackUrl()).toBe('https://www.stayloop.ai/auth/callback')
  })

  it('password sign-in, the sign-up email link, resend and Google all use it', () => {
    const hook = read('lib/auth/useLoginForm.ts')
    expect(hook).toContain("export function useLoginForm(initialTab: LoginTab = 'signin', opts: { next?: string } = {}) {")
    expect(hook).toContain('const returnUrl = () => callbackUrl(opts.next)')
    expect((hook.match(/returnUrl\(\)/g) || []).length).toBe(5)
    expect(hook.slice(hook.indexOf('export function useLoginForm'))).not.toContain('callbackUrl()')
    const card = read('components/home/LoginCard.tsx')
    expect(card).toContain("const f = useLoginForm('signin', { next })")
    // the sign-up email's link signs the visitor in and carries on — it does not ask them to come back and sign in
    expect(card).not.toContain('再回来登录')
  })
})

describe('the pages under「我是」send people through the sign-in step', () => {
  it('each role page’s main button goes to the naming step with its own identity', () => {
    expect(read('app/tenant/page.tsx')).toContain("href: '/onboarding/name?role=tenant'")
    expect(read('app/landlord/page.tsx')).toContain("href: '/onboarding/name?role=landlord'")
    expect(read('app/agent/page.tsx')).toContain("href: '/onboarding/name?role=agent'")
  })
  it('the gate sits before the chooser and the naming step, after every hook', () => {
    const page = read('app/onboarding/name/page.tsx')
    const gate = page.indexOf('if (!user) {')
    expect(gate).toBeGreaterThan(0)
    expect(page.indexOf('if (authLoading) {')).toBeLessThan(gate)
    expect(page.indexOf('if (!role) {')).toBeGreaterThan(gate)
    expect(page.lastIndexOf('useState(')).toBeLessThan(page.indexOf('if (authLoading) {'))
    expect(page).toContain("const next = role ? `/onboarding/name?role=${role}` : '/onboarding/name'")
    expect(page).toContain('<LoginCard next={next}')
  })
})

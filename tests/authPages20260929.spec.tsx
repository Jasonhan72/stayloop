// 2026-09-29 ·「把汉堡菜单里的登录，注册页面也统一成刚修改过的登录，注册页面一样的」
//
// /login and /register (the hamburger menu's 登录 / 注册) now render the same page as
// the naming step's sign-in gate: the onboarding card frame + SignInBlock, whose
// LoginCard is the homepage's email-first block (the email-status lookup sends an
// existing account to its password and a new email to create-account; Google below).
// The two routes differ only in the heading and in the step a FAILED lookup falls
// back to (create-account on /register, the password on /login). The old「欢迎回来」
// form and the separate three-field register form are gone.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
const auth = vi.hoisted(() => ({ state: { user: null as null | { id: string; is_anonymous?: boolean }, loading: false, role: null as string | null } }))
const hats = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: { landlord: false, agent: null, provider: null } })) }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace, push: nav.push }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseBrowser: () => ({ auth: {}, rpc: hats.rpc }), supabase: { auth: {} } }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => auth.state, roleStorageKey: (uid: string) => `sl-active-role:${uid}` }))
// The site header stays on these pages (user 2026-09-27: the menu is always there); stubbed — it has data hooks of its own.
vi.mock('@/components/Header', () => ({ default: () => React.createElement('header', { 'data-testid': 'site-header' }) }))
vi.mock('@/components/Footer', () => ({ default: () => React.createElement('footer') }))

import LoginPage from '../app/login/page'
import RegisterPage from '../app/register/page'
import LoginCard from '../components/home/LoginCard'

const read = (p: string) => readFileSync(p, 'utf8')
const textOf = (n: TestRenderer.ReactTestInstance): string =>
  n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')
function render(el: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer
  act(() => { r = TestRenderer.create(el) })
  return r
}

describe('/login and /register are the naming step’s sign-in page', () => {
  afterEach(() => { auth.state = { user: null, loading: false, role: null }; nav.replace.mockClear(); vi.unstubAllGlobals() })

  it('/login: SIGN IN · 登录, the email-first card falling back to the password, and the preview link', () => {
    const r = render(<LoginPage />)
    const text = textOf(r.root)
    expect(text).toContain('SIGN IN · 登录')
    expect(text).toContain('登录 Stayloop')
    expect(text).toContain('登录或创建账户') // the LoginCard's first step
    expect(text).toContain('使用 Google 继续')
    const cards = r.root.findAllByType(LoginCard)
    expect(cards).toHaveLength(1)
    expect(cards[0].props.intent).toBe('signin')
    expect(cards[0].props.next).toBeUndefined() // the page's own ?next= / ?redirect= applies
    expect(r.root.findAll((n) => n.props['data-testid'] === 'signin-preview')[0].props.href).toBe('/tenant/agent')
    for (const gone of ['欢迎回来', '或用邮箱 + 密码', '免费注册 →']) expect(text, gone).not.toContain(gone)
    // the header menu stays on top; the stage renders without its own logo / step bar
    expect(r.root.findAll((n) => n.props['data-testid'] === 'site-header')).toHaveLength(1)
    expect(text).not.toContain('STEP 0')
  })

  it('/register: CREATE ACCOUNT · 注册, the same card falling back to create-account', () => {
    const r = render(<RegisterPage />)
    const text = textOf(r.root)
    expect(text).toContain('CREATE ACCOUNT · 注册')
    expect(text).toContain('创建你的 Stayloop 账户')
    expect(text).toContain('登录或创建账户')
    expect(r.root.findAllByType(LoginCard)[0].props.intent).toBe('register')
    for (const gone of ['使用 Google 注册', '或用邮箱注册', '30 秒完成注册']) expect(text, gone).not.toContain(gone)
  })

  it('signed in: no form; a safe ?next= wins', () => {
    vi.stubGlobal('window', { location: { search: '?next=%2Fjoin%2Fabc', origin: 'https://www.stayloop.ai' }, localStorage: { getItem: () => null } })
    auth.state = { user: { id: 'u1' }, loading: false, role: null }
    const r = render(<LoginPage />)
    expect(r.root.findAllByType(LoginCard)).toHaveLength(0)
    expect(r.root.findAll((n) => n.props['aria-busy'] === 'true')).toHaveLength(1)
    expect(nav.replace).toHaveBeenCalledWith('/join/abc')
  })

  it('signed in, unsafe ?redirect= → the hat the account holds', async () => {
    vi.stubGlobal('window', { location: { search: '?redirect=%2F%2Fevil.com', origin: 'https://www.stayloop.ai' }, localStorage: { getItem: () => null } })
    auth.state = { user: { id: 'u1' }, loading: false, role: null }
    render(<RegisterPage />)
    await act(async () => { await Promise.resolve() })
    expect(nav.replace).not.toHaveBeenCalledWith('//evil.com')
    expect(nav.replace).toHaveBeenCalledWith('/tenant/agent')
  })

  it('an anonymous session still sees the form', () => {
    auth.state = { user: { id: 'anon', is_anonymous: true }, loading: false, role: null }
    const r = render(<LoginPage />)
    expect(r.root.findAllByType(LoginCard)).toHaveLength(1)
  })
})

describe('the register fallback', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('a failed email lookup on /register opens create-account, with the way back to the password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const r = render(<LoginCard intent="register" />)
    act(() => { r.root.findByType('input').props.onChange({ target: { value: 'new@example.com' } }) })
    await act(async () => { r.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
    const inputs = r.root.findAll((n) => n.type === 'input')
    expect(inputs).toHaveLength(2)
    expect(inputs.every((i) => i.props.autoComplete === 'new-password')).toBe(true)
    expect(textOf(r.root)).toContain('已有账户？输入密码登录')
  })
})

describe('the routes are thin wrappers over one page', () => {
  it('both render AuthPage; the block is shared with the naming step', () => {
    expect(read('app/login/page.tsx')).toContain('<AuthPage mode="signin" />')
    expect(read('app/register/page.tsx')).toContain('<AuthPage mode="register" />')
    for (const f of ['app/login/page.tsx', 'app/register/page.tsx']) expect(read(f).split('\n').length, f).toBeLessThan(15)
    expect(read('components/auth/AuthPage.tsx')).toContain('<SignInBlock')
    expect(read('app/onboarding/name/page.tsx')).toContain('<SignInBlock')
    expect(read('components/auth/SignInBlock.tsx')).toContain('<LoginCard next={next} intent={intent}')
  })
})

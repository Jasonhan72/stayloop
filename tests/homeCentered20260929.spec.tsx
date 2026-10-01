// 2026-09-29 · 「首页这里的登录模块要尽可能的简化，参考 muse 的，另外，要把首页的标题都放到居中。」
//
// The hero is now one centered column — headline, lead, the sign-in block, the
// no-account door — and every section heading on the homepage is centered.
// The sign-in block takes Muse's shape: no card or tabs, one field first
// (「登录或创建账户」 · email · 继续, Google below). Since the same day
// (「当然要加上这个判断」) 继续 looks the email up and routes: an account with a
// password → the password step; a new email → create-account; an account
// without a password → Google (or an email to set one). A failed lookup opens
// the password step with「第一次来？创建账户」 as before. Same methods as before,
// all from useLoginForm.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/supabase', () => ({ getSupabaseBrowser: () => ({ auth: {} }), supabase: { auth: {} } }))

import LoginCard from '../components/home/LoginCard'

const read = (p: string) => readFileSync(p, 'utf8')
const home = read('components/home/HomeNext.tsx')
const card = read('components/home/LoginCard.tsx')

const textOf = (n: TestRenderer.ReactTestInstance): string =>
  n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')

describe('the homepage is centered', () => {
  it('the hero is one centered column; the two-column layouts are gone', () => {
    const hero = home.slice(home.indexOf('HERO: message + ask box'), home.indexOf('{/* ================= HOW IT WORKS'))
    expect(hero).toContain('text-center')
    expect(hero).toContain('<HeroComposer zh={zh} className="mt-10 w-full sm:mt-12" />')
    for (const gone of ['lg:grid-cols-[1.15fr_0.85fr]', 'lg:grid-cols-[5fr_7fr]', 'lg:grid-cols-[4fr_7fr]', 'flex flex-wrap items-end justify-between gap-4']) expect(hero, gone).not.toContain(gone)
  })
  it('section headings are centered; the picture-and-words panels and the FAQ read left to right (2026-10-01, after muse.ai)', () => {
    for (const title of ['Stayloop 是怎么工作的', '不给形容词，给可以验证的东西', '从一句话开始']) {
      const at = home.indexOf(`'${title}'`)
      expect(at, title).toBeGreaterThan(0)
      const before = home.slice(Math.max(0, at - 420), at)
      expect(before, title).toMatch(/text-center/)
    }
    expect(home).toContain('<ul className="divide-y divide-line-divider" data-testid="home-rules">')
  })
})

describe('the sign-in block is Muse-simple', () => {
  it('no card, no tabs; small steps; the lookup goes through lib/auth/emailStatus', () => {
    expect(card).toContain("type Step = 'email' | 'password' | 'create' | 'nopassword'")
    expect(card).not.toMatch(/role="tablist"|shadow-\[|欢迎回来|或用邮箱/)
    expect(card).toContain("import { EMAIL_RE, lookupEmailStatus, routeForEmail } from '@/lib/auth/emailStatus'")
    expect(card).not.toMatch(/fetch\(/) // the card never builds its own request
    expect(card).toContain("{zh ? '登录或创建账户' : 'Sign in or create an account'}")
    expect(card).toContain("{zh ? '使用 Google 继续' : 'Continue with Google'}")
  })

  it('when the lookup cannot answer: email first, then the password; a first-timer switches to create-account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(<LoginCard />) })
    const inputs = () => r.root.findAll((n) => n.type === 'input')
    // step 1: one field and 继续, Google below
    expect(inputs()).toHaveLength(1)
    expect(inputs()[0].props.type).toBe('email')
    expect(textOf(r.root)).toContain('登录或创建账户')
    expect(textOf(r.root)).toContain('使用 Google 继续')
    // an invalid address stays on step 1
    act(() => { inputs()[0].props.onChange({ target: { value: 'not-an-email' } }) })
    act(() => { r.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
    expect(textOf(r.root)).toContain('请输入有效的邮箱')
    expect(inputs()[0].props.type).toBe('email')
    // a valid address moves on to the password
    act(() => { inputs()[0].props.onChange({ target: { value: ' mia@example.com ' } }) })
    await act(async () => { r.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
    expect(inputs()).toHaveLength(1)
    expect(inputs()[0].props.type).toBe('password')
    expect(inputs()[0].props.autoComplete).toBe('current-password')
    expect(textOf(r.root)).toContain('mia@example.com')
    expect(textOf(r.root)).toContain('忘记密码？')
    // first time here → the same step asks for a new password twice
    const create = r.root.findAll((n) => n.type === 'button' && textOf(n) === '第一次来？创建账户')[0]
    act(() => { create.props.onClick() })
    expect(inputs()).toHaveLength(2)
    expect(inputs().every((i) => i.props.autoComplete === 'new-password')).toBe(true)
    expect(textOf(r.root)).toContain('创建账户 · 免费')
    // and back to change the email
    const change = r.root.findAll((n) => n.type === 'button' && textOf(n) === '更改')[0]
    act(() => { change.props.onClick() })
    expect(inputs()).toHaveLength(1)
    expect(inputs()[0].props.type).toBe('email')
    vi.unstubAllGlobals()
  })
})

// Answers from /api/auth/email-status, stubbed; each test drives the real card.
function answer(status: { exists: boolean; password: boolean; google: boolean }) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(status), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
async function continueWith(email: string) {
  let r!: TestRenderer.ReactTestRenderer
  act(() => { r = TestRenderer.create(<LoginCard />) })
  act(() => { r.root.findByType('input').props.onChange({ target: { value: email } }) })
  await act(async () => { r.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
  return r
}
const buttons = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.type === 'button').map(textOf)

describe('继续 looks the email up and routes (2026-09-29「当然要加上这个判断」)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('asks the route once, by POST, with the trimmed email', async () => {
    const fetchMock = answer({ exists: true, password: true, google: false })
    await continueWith('  Mia@Example.com ')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/email-status')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'Mia@Example.com' })
  })

  it('an account with a password → the password step, without「第一次来？创建账户」', async () => {
    answer({ exists: true, password: true, google: false })
    const r = await continueWith('mia@example.com')
    const inputs = r.root.findAll((n) => n.type === 'input')
    expect(inputs).toHaveLength(1)
    expect(inputs[0].props.autoComplete).toBe('current-password')
    expect(buttons(r)).toContain('忘记密码？')
    expect(buttons(r)).not.toContain('第一次来？创建账户')
    expect(buttons(r)).not.toContain('改用 Google 登录')
  })

  it('an account with a password and Google → the password step also offers Google', async () => {
    answer({ exists: true, password: true, google: true })
    const r = await continueWith('mia@example.com')
    expect(r.root.findAll((n) => n.type === 'input')[0].props.autoComplete).toBe('current-password')
    expect(buttons(r)).toContain('改用 Google 登录')
  })

  it('a new email → create-account straight away, without「已有账户？」', async () => {
    answer({ exists: false, password: false, google: false })
    const r = await continueWith('new@example.com')
    const inputs = r.root.findAll((n) => n.type === 'input')
    expect(inputs).toHaveLength(2)
    expect(inputs.every((i) => i.props.autoComplete === 'new-password')).toBe(true)
    expect(textOf(r.root)).toContain('这个邮箱还没有注册 · 免费创建账户')
    expect(buttons(r)).not.toContain('已有账户？输入密码登录')
  })

  it('a Google-only account → Google, with a way to set a password; no password field', async () => {
    answer({ exists: true, password: false, google: true })
    const r = await continueWith('g@example.com')
    expect(r.root.findAll((n) => n.type === 'input')).toHaveLength(0)
    expect(textOf(r.root)).toContain('这个邮箱是用 Google 注册的')
    expect(buttons(r)).toContain('使用 Google 继续')
    expect(buttons(r)).toContain('想用密码登录？发一封设置密码的邮件')
  })

  it('an account with neither → an email to set a password', async () => {
    answer({ exists: true, password: false, google: false })
    const r = await continueWith('old@example.com')
    expect(r.root.findAll((n) => n.type === 'input')).toHaveLength(0)
    expect(textOf(r.root)).toContain('这个账户还没有设置密码')
    expect(buttons(r)).toContain('发送设置密码的邮件')
    expect(buttons(r)).not.toContain('使用 Google 继续')
  })

  it('a rate-limited or failed lookup falls back to the manual path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })))
    const r = await continueWith('mia@example.com')
    expect(r.root.findAll((n) => n.type === 'input')[0].props.autoComplete).toBe('current-password')
    expect(buttons(r)).toContain('第一次来？创建账户')
  })

  it('「更改」 goes back to the email and forgets the answer', async () => {
    answer({ exists: true, password: true, google: false })
    const r = await continueWith('mia@example.com')
    act(() => { r.root.findAll((n) => n.type === 'button' && textOf(n) === '更改')[0].props.onClick() })
    const inputs = r.root.findAll((n) => n.type === 'input')
    expect(inputs).toHaveLength(1)
    expect(inputs[0].props.type).toBe('email')
  })
})

// 2026-09-29 · 「首页这里的登录模块要尽可能的简化，参考 muse 的，另外，要把首页的标题都放到居中。」
//
// The hero is now one centered column — headline, lead, the sign-in block, the
// no-account door — and every section heading on the homepage is centered.
// The sign-in block takes Muse's shape: no card or tabs, one field first
// (「登录或创建账户」 · email · 继续, Google below), then the password, with a
// first-time visitor switching that step to「创建账户」. Same methods as before,
// all from useLoginForm; no lookup that would reveal whether an email has an
// account.
import { describe, expect, it, vi } from 'vitest'
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
    const hero = home.slice(home.indexOf('HERO: message + login card'), home.indexOf('{/* ================= HOW IT WORKS'))
    expect(hero).toContain('text-center')
    expect(hero).toContain('<LoginCard className="mx-auto mt-8 w-full max-w-[400px] scroll-mt-24 sm:mt-10" />')
    expect(hero).toContain('先免登录试一试 →')
    for (const gone of ['lg:grid-cols-[1.15fr_0.85fr]', 'lg:grid-cols-[5fr_7fr]', 'lg:grid-cols-[4fr_7fr]', 'flex flex-wrap items-end justify-between gap-4']) expect(home, gone).not.toContain(gone)
  })
  it('every section heading sits in a centered block', () => {
    for (const title of ['Stayloop 是怎么工作的', '四种身份，各自的入口', '安省规则内置，每条有编号。', '不给形容词，给可以验证的东西', '你可能想问', '三步开始']) {
      const at = home.indexOf(`'${title}'`)
      expect(at, title).toBeGreaterThan(0)
      const before = home.slice(Math.max(0, at - 420), at)
      expect(before, title).toMatch(/text-center/)
    }
    expect(home).toContain('className="relative flex flex-wrap justify-center gap-2"') // the role tabs under the centered heading
    expect(home).toContain('className="mt-8 flex flex-wrap justify-center gap-2.5" data-testid="home-rules"')
  })
})

describe('the sign-in block is Muse-simple', () => {
  it('no card, no tabs; three small steps; no account-existence lookup', () => {
    expect(card).toContain("type Step = 'email' | 'password' | 'create'")
    expect(card).not.toMatch(/role="tablist"|shadow-\[|欢迎回来|或用邮箱/)
    expect(card).not.toMatch(/fetch\(|\/api\/auth|email_has_account/)
    expect(card).toContain("{zh ? '登录或创建账户' : 'Sign in or create an account'}")
    expect(card).toContain("{zh ? '使用 Google 继续' : 'Continue with Google'}")
  })

  it('email first, then the password; a first-timer switches to create-account', () => {
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
    act(() => { r.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
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
  })
})

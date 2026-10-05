// 2026-10-01 · 「是否这个登录的改为 America.gov 这样的对话框 + 底图，样式和大小就按照这个 america 来做，
// 对话框先就一行，输入了以后就掉到全屏的这个助手页面，继续可以对话」 → 「按照你的建议来修改」.
//
// The hero's sign-in block became America.gov's ask box: a one-line composer laid on a photo card
// (the three-role film's 3D scenes), ten examples cycling in the placeholder with prev / pause / next,
// a role chip (租客 / 房东 / 经纪). Submitting goes to that role's full-screen AI Agent page with the
// question sent on arrival; an empty submit tries the example on show. No account to ask.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))

import HeroComposer, { HERO_EXAMPLES, examplePlaceholder, heroSubmit } from '../components/home/HeroComposer'
import { assistantPromptHref } from '../lib/homeDeepLink'
import { ANON_TURNS_PER_HOUR, ANON_TURNS_SITE_PER_HOUR } from '../lib/agent/anonLimits'
import { RENEWAL_INTENT_RE, landlordRenewalFacts } from '../lib/agent/prompts'
import { applyGuardrail } from '../lib/agent/guardrail'

const read = (p: string) => readFileSync(p, 'utf8')
const home = read('components/home/HomeNext.tsx')
const box = read('components/home/HeroComposer.tsx')

afterEach(() => { push.mockReset(); vi.useRealTimers() })

const byTestId = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.find((n) => n.props['data-testid'] === id)

describe('the homepage hero is an ask box', () => {
  it('replaces the sign-in block; sign-in / sign-up are one line under it', () => {
    expect(home).toContain('<HeroComposer zh={zh} className="mt-10 w-full sm:mt-12"')
    expect(home).not.toContain('LoginCard')
    expect(box).toContain('href="/login"')
    expect(box).toContain('href="/register"')
  })
  it('America.gov sizes: card up to 688px, radius 40, composer 96px tall with 21px text on desktop, 56px round controls', () => {
    expect(box).toContain('max-w-[688px]')
    expect(box).toContain('sm:rounded-[40px]')
    expect(box).toContain('sm:h-[96px]')
    expect(box).toContain('sm:text-[21px]')
    expect(box).toContain('sm:h-14 sm:w-14')
  })
  it('ten examples, each with a real film scene and both languages', () => {
    expect(HERO_EXAMPLES).toHaveLength(10)
    for (const x of HERO_EXAMPLES) {
      expect(existsSync(`public${x.img}`), x.img).toBe(true)
      expect(x.ask.zh && x.ask.en && x.alt.zh && x.alt.en).toBeTruthy()
      expect(x.ask.zh).not.toMatch(/【/)
    }
    expect(new Set(HERO_EXAMPLES.map((x) => x.role))).toEqual(new Set(['tenant', 'landlord', 'agent']))
  })
})

describe('submitting', () => {
  it('typed text goes to the chosen role’s AI Agent page, sent on arrival', () => {
    expect(heroSubmit('  帮我找房  ', 'landlord', HERO_EXAMPLES[0], true)).toBe(assistantPromptHref('landlord', '帮我找房'))
    expect(assistantPromptHref('tenant', 'x')).toContain('&send=1')
  })
  it('an empty box tries the example on show, as its own role', () => {
    const ex = HERO_EXAMPLES[1]
    expect(heroSubmit('', 'tenant', ex, true)).toBe(assistantPromptHref(ex.role, ex.ask.zh))
    expect(heroSubmit('   ', 'tenant', ex, false)).toBe(assistantPromptHref(ex.role, ex.ask.en))
  })
  it('renders, types, picks a role and submits', () => {
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(React.createElement(HeroComposer, { zh: true })) })
    const input = byTestId(r, 'home-ask-input')
    expect(String(input.props.placeholder)).toBe(`试试「${HERO_EXAMPLES[0].ask.zh}」`)
    act(() => { byTestId(r, 'home-ask-role').props.onChange({ target: { value: 'agent' } }) })
    act(() => { input.props.onChange({ target: { value: '押金最多收多少' } }) })
    act(() => { r.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
    expect(push).toHaveBeenCalledWith(assistantPromptHref('agent', '押金最多收多少'))
  })
  it('rotating examples never change the role chip (a tenant question typed during a landlord example went to the landlord, 2026-10-01)', () => {
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(React.createElement(HeroComposer, { zh: false })) })
    const next = r.root.find((n) => n.type === 'button' && n.props['aria-label'] === 'Next example')
    expect(byTestId(r, 'home-ask-role').props.value).toBe('tenant')
    act(() => { next.props.onClick() })
    expect(HERO_EXAMPLES[1].role).toBe('landlord')
    expect(byTestId(r, 'home-ask-role').props.value).toBe('tenant')
    expect(String(byTestId(r, 'home-ask-input').props.placeholder)).toBe(`Try (landlord) ‘${HERO_EXAMPLES[1].ask.en}’`)
    act(() => { byTestId(r, 'home-ask-input').props.onChange({ target: { value: 'One bedroom near U of T' } }) })
    act(() => { r.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
    expect(push).toHaveBeenCalledWith(assistantPromptHref('tenant', 'One bedroom near U of T'))
  })
  it('the placeholder names the example’s role only when it differs from the chip', () => {
    const t = HERO_EXAMPLES.find((x) => x.role === 'tenant')!
    const l = HERO_EXAMPLES.find((x) => x.role === 'landlord')!
    expect(examplePlaceholder(t, 'tenant', true)).toBe(`试试「${t.ask.zh}」`)
    expect(examplePlaceholder(l, 'tenant', true)).toBe(`试试（房东）「${l.ask.zh}」`)
  })
})

describe('the anonymous preview is the front door now', () => {
  it('the hourly anonymous limits went up (8 → 15 per IP, 400 → 600 site-wide), one constant for route and copy', () => {
    expect(ANON_TURNS_PER_HOUR).toBe(15)
    expect(ANON_TURNS_SITE_PER_HOUR).toBe(600)
    const turn = read('app/api/agent/turn/route.ts')
    expect(turn).toContain('const ANON_RATE_LIMIT_PER_HOUR = ANON_TURNS_PER_HOUR')
    const session = read('lib/agent/useAgentSession.ts')
    expect(session).not.toMatch(/每小时限 8 |allows 8 messages/)
    expect(session).toContain('/retry-after=600/') // the site-wide cap reads as "busy", not "your quota"
    expect(read('lib/agent/orchestrator.ts')).toContain('retry-after=')
  })
})

describe('arriving from the ask box', () => {
  it('the preview stops showing demo approval cards once the visitor has asked their own question', () => {
    const page = read('components/agent/AgentWorkspacePage.tsx')
    expect(page).toContain("const chatCards = live || !messages.some((m) => m.role === 'user') ? pendingActions : []")
    expect(page).toContain("const pending = waitingCards(chatCards)")
    expect((page.match(/pendingActions=\{chatCards\}/g) ?? []).length).toBe(3) // chat + panel column + phone sheet
  })
})

describe('the examples are answerable by that role’s preview (review 2026-10-01)', () => {
  it('renewal examples trigger the RTA facts in both languages; landlords get them too', () => {
    for (const x of HERO_EXAMPLES.filter((e) => /涨|续约/.test(e.ask.zh))) {
      expect(RENEWAL_INTENT_RE.test(x.ask.zh), x.ask.zh).toBe(true)
      expect(RENEWAL_INTENT_RE.test(x.ask.en), x.ask.en).toBe(true)
      expect(x.ask.zh).toMatch(/20\d\d/) // absolute year: the prompt carries no date
    }
    expect(landlordRenewalFacts()).toContain('N1')
    expect(read('app/api/agent/turn/route.ts')).toContain("(landlordRenewalCtx ? landlordRenewalFacts() : '')")
  })
  it('no landlord example asks for a market price (the landlord preview has no market pipeline)', () => {
    for (const x of HERO_EXAMPLES.filter((e) => e.role === 'landlord')) expect(x.ask.zh, x.ask.zh).not.toMatch(/挂多少|定价|挂牌价|多少合适/)
  })
  it('a reply that already says a no-pets clause is void gets no extra 「我不会写进租约」 note', () => {
    const out = applyGuardrail('tenant', { reply: '租约里的「禁止养宠」条款在安省是无效的（RTA s.14）。', memory_writes: [], proposed_action: null } as never, 'zh')
    expect(JSON.stringify(out)).not.toContain('我不会写进租约')
    const drafted = applyGuardrail('landlord', { reply: '附表 B：禁止养宠。', memory_writes: [], proposed_action: null } as never, 'zh')
    expect(JSON.stringify(drafted)).toContain('我不会写进租约')
  })
})

describe('accessibility and phones (review 2026-10-01)', () => {
  it('only visitor-driven changes are announced; rotation pauses on hover / focus / off screen', () => {
    expect(box).toContain('aria-live="polite" data-testid="home-ask-said">{said}</p>')
    expect(box).toContain('const idle = playing && visible && !inside.hover && !inside.focus && !text')
    expect(box).toContain('IntersectionObserver')
  })
  it('phones get a short placeholder and the example as a tappable caption; only current + next photos load', () => {
    expect(box).toContain("narrow ? (zh ? '问 AI 助理…' : 'Ask the AI Agent…')")
    expect(box).toContain('data-testid="home-ask-caption"')
    expect(box).toContain('src={seen.has(k) ? x.img : undefined}')
  })
})

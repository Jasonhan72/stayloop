// @vitest-environment jsdom
// V0.9 (2026-11-23, user, looking at the agents tab of 「找经纪和服务商」: 「这个板块是否需要加一个功能，让用户
// 可以申请加入 stayloop，成为服务商」). The forms were all there — /agent/verify, /provider/onboard,
// /provider/onboard/professional — but the section showed the way to them as one grey line at the
// very bottom of two tabs, and not at all on the agents tab while it had anyone listed. The shared
// header now carries one door on every tab. Later the same day (「需要利用 AI 来辅助输入这些表格」) the
// door stopped opening a panel of three kinds to choose from: it goes to /onboard, where the AI
// Agent works out the kind and fills the form (tests/onboardAssist*.spec). It is an entrance only.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({ lang: 'zh' as 'zh' | 'en' }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
// the card imports an icon from the composer, which reaches the browser client; nothing here reads data
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => { throw new Error('no data is read in this spec') }, auth: { getSession: () => { throw new Error('no session is read in this spec') } } } }))

import FindHeader, { FIND_TABS, type FindTab } from '../components/directory/FindHeader'
import { JOIN_WAYS } from '../components/directory/JoinEntry'

afterEach(() => { cleanup(); state.lang = 'zh' })

describe('one door in the header of every tab', () => {
  it('each tab shows the same card, and it goes to the entrance page', () => {
    for (const t of FIND_TABS) {
      const { container: c } = render(<FindHeader active={t.key} />)
      const card = only<HTMLAnchorElement>(c, '[data-testid="find-join"]')
      expect(card.tagName, t.key).toBe('A')
      expect(card.getAttribute('href'), t.key).toBe('/onboard')
      expect(textOf(card), t.key).toBe('你是经纪或服务商？申请加入把资料交给 AI 助理，申请表它来填→')
      cleanup()
    }
  })
  it('it is a link, not a menu: nothing opens, nothing to choose here', () => {
    const { container: c } = render(<FindHeader active="agents" />)
    expect(all(c, '[data-testid="find-join-toggle"], [data-testid="find-join-panel"], [aria-expanded]').length).toBe(0)
    expect(all(c, '[data-testid="find-join"] a, [data-testid="find-join"] button').length).toBe(0)
  })
  it('English carries no Chinese, and both languages call it the AI Agent / AI 助理', () => {
    state.lang = 'en'
    const { container: c } = render(<FindHeader active="repairs" />)
    const card = only(c, '[data-testid="find-join"]')
    expect(textOf(card)).toBe('An agent or a provider? Apply to joinHand your details to the AI Agent; it fills in the form→')
    expect(c.textContent).not.toMatch(/[一-鿿]/)
    expect(read('components/directory/JoinEntry.tsx')).not.toMatch(/助手|管家|AI assistant/)
  })
})

describe('an entrance, and nothing more', () => {
  it('every tab has a kind and a form of its own, and the forms are the three that already exist', () => {
    expect(Object.keys(JOIN_WAYS).sort()).toEqual(FIND_TABS.map((t) => t.key).sort())
    const ways = Object.fromEntries((Object.keys(JOIN_WAYS) as FindTab[]).map((k) => [k, [JOIN_WAYS[k].kind, JOIN_WAYS[k].href]]))
    expect(ways).toEqual({ agents: ['agent', '/agent/verify'], repairs: ['repair', '/provider/onboard'], professional: ['professional', '/provider/onboard/professional'] })
    for (const p of ['app/agent/verify/page.tsx', 'app/provider/onboard/page.tsx', 'app/provider/onboard/professional/page.tsx', 'app/onboard/page.tsx']) expect(() => read(p), p).not.toThrow()
  })
  it('the card reads no table, sends nothing, and opens no native dialog', () => {
    const s = read('components/directory/JoinEntry.tsx')
    expect(s).not.toMatch(/supabase|fetch\(|window\.confirm\(|\balert\(|useState|useEffect/)
    // the header guard keeps Ontario statute and regulator names out of this section's shared parts
    expect(s).not.toMatch(/\b(RTA|LTB|OHRC|RECO|TRESA)\b/)
    // no price, no promise of placement: the directory's order is fixed and nothing is charged for position
    expect(s).not.toMatch(/免费|free\b|推荐|优先|featured|\$\d/i)
  })
  it('the header puts it beside the title from `sm` up and under the note on a phone; the tabs follow', () => {
    const s = read('components/directory/FindHeader.tsx')
    expect(s).toContain('<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">')
    expect(s).toContain('<JoinEntry zh={zh} />')
    expect(s.indexOf('<JoinEntry')).toBeLessThan(s.indexOf('data-testid="find-tabs"'))
    expect(s.indexOf('data-testid="find-note"')).toBeLessThan(s.indexOf('<JoinEntry'))
  })
  it('the quieter lines at the foot of the two provider tabs are still there', () => {
    expect(read('app/providers/page.tsx')).toContain("<Link href=\"/provider/onboard\" className=\"underline\">{zh ? '申请入驻' : 'Apply to join'}</Link>")
    expect(read('app/providers/professional/page.tsx')).toContain('data-testid="professional-join"')
  })
})

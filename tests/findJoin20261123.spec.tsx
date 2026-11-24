// @vitest-environment jsdom
// V0.9 (2026-11-23, user, looking at the agents tab of 「找经纪和服务商」: 「这个板块是否需要加一个功能，让用户
// 可以申请加入 stayloop，成为服务商」). The forms were all there — /agent/verify, /provider/onboard,
// /provider/onboard/professional — but the section showed the way to them as one grey line at the
// very bottom of two tabs, and not at all on the agents tab while it had anyone listed. Now the
// shared header carries one door on every tab: 「申请加入」 opens the three kinds, each going to its
// own form. It is an entrance only: nothing is submitted from here, and staff verification stays
// where it was.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({
  lang: 'zh' as 'zh' | 'en',
  hats: { loading: false, tenant: true, landlord: false, agent: null as string | null, provider: null as string | null, admin: false },
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useHats', () => ({ useHats: () => state.hats }))

import FindHeader, { FIND_TABS, type FindTab } from '../components/directory/FindHeader'
import { JOIN_WAYS } from '../components/directory/JoinEntry'

afterEach(() => {
  cleanup()
  state.lang = 'zh'
  state.hats = { loading: false, tenant: true, landlord: false, agent: null, provider: null, admin: false }
})

const open = (c: ParentNode) => act(() => { fireEvent.click(only(c, '[data-testid="find-join-toggle"]')) })
const rows = (c: ParentNode) => all<HTMLAnchorElement>(c, '[data-testid="find-join-panel"] a').map((a): [string | null, string] => [a.getAttribute('href'), textOf(a)])

describe('one door in the header of every tab', () => {
  it('each tab shows the question and the button; the panel is closed until asked for', () => {
    for (const t of FIND_TABS) {
      const { container: c } = render(<FindHeader active={t.key} />)
      const box = only(c, '[data-testid="find-join"]')
      expect(textOf(box), t.key).toBe('你是经纪或服务商？申请加入')
      const btn = only<HTMLButtonElement>(box, '[data-testid="find-join-toggle"]')
      expect(btn.getAttribute('aria-expanded'), t.key).toBe('false')
      expect(btn.className, t.key).toContain('min-h-[44px]')
      expect(all(c, '[data-testid="find-join-panel"]').length, t.key).toBe(0)
      cleanup()
    }
  })
  it('the button opens the three kinds — named as the tabs are — each going to its own form', () => {
    const { container: c } = render(<FindHeader active="agents" />)
    open(c)
    const btn = only<HTMLButtonElement>(c, '[data-testid="find-join-toggle"]')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(only(c, '[data-testid="find-join-panel"]').id).toBe(btn.getAttribute('aria-controls'))
    expect(rows(c)).toEqual([
      ['/agent/verify', '经纪持牌的租赁经纪：提交注册信息，核验后可以开公开主页去认证 →'],
      ['/provider/onboard', '物业管理服务水管、电气、供暖、门锁、清洁等会接派单的工种申请入驻 →'],
      ['/provider/onboard/professional', '专业服务Paralegal、律师、保险经纪、房源摄影申请入驻 →'],
    ])
    expect(textOf(only(c, '[data-testid="find-join-panel"] p'))).toBe('选你的类别，到对应的页面填资料。提交后由 Stayloop 工作人员人工核验，通过后出现在目录里。')
    for (const a of all<HTMLAnchorElement>(c, '[data-testid="find-join-panel"] a')) expect(a.className).toContain('min-h-[44px]')
  })
  it('closes on the button again, on Escape, and on a press anywhere else', () => {
    const { container: c } = render(<div><FindHeader active="repairs" /><p data-testid="elsewhere">x</p></div>)
    const shut = () => all(c, '[data-testid="find-join-panel"]').length === 0
    open(c); open(c)
    expect(shut()).toBe(true)
    open(c)
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(shut()).toBe(true)
    open(c)
    // a press inside the panel is not "elsewhere"
    act(() => { fireEvent.mouseDown(only(c, '[data-testid="find-join-panel"] p')) })
    expect(shut()).toBe(false)
    act(() => { fireEvent.mouseDown(only(c, '[data-testid="elsewhere"]')) })
    expect(shut()).toBe(true)
  })
  it('someone who already has a record is shown their own page by another name, not asked to apply again', () => {
    state.hats = { ...state.hats, agent: 'verified' }
    let r = render(<FindHeader active="agents" />)
    open(r.container)
    const first = rows(r.container)
    expect(first.map((x) => x[0])).toEqual(['/agent/verify', '/provider/onboard', '/provider/onboard/professional'])
    expect(first[0][1].endsWith('管理认证与主页 →')).toBe(true)
    expect(first[1][1].endsWith('申请入驻 →')).toBe(true)
    expect(first[2][1].endsWith('申请入驻 →')).toBe(true)
    cleanup()
    // one provider record per account covers both provider kinds
    state.hats = { ...state.hats, agent: null, provider: 'pending' }
    r = render(<FindHeader active="professional" />)
    open(r.container)
    const last = rows(r.container).map((x) => x[1])
    expect(last[0].endsWith('去认证 →')).toBe(true)
    expect(last[1].endsWith('打开我的资料 →')).toBe(true)
    expect(last[2].endsWith('打开我的资料 →')).toBe(true)
  })
  it('English carries no Chinese, open or closed', () => {
    state.lang = 'en'
    const { container: c } = render(<FindHeader active="agents" />)
    expect(textOf(only(c, '[data-testid="find-join"]'))).toBe('Are you an agent or a provider?Apply to join')
    open(c)
    expect(rows(c).map((x) => x[1].split(/(?=[A-Z])/)[0])).toEqual(['Agents', 'Property maintenance', 'Professionals'])
    expect(c.textContent).not.toMatch(/[一-鿿]/)
  })
})

describe('an entrance, and nothing more', () => {
  it('every tab has a way in, and the ways are the three forms that already exist', () => {
    expect(Object.keys(JOIN_WAYS).sort()).toEqual(FIND_TABS.map((t) => t.key).sort())
    const hrefs = Object.fromEntries((Object.keys(JOIN_WAYS) as FindTab[]).map((k) => [k, JOIN_WAYS[k].href]))
    expect(hrefs).toEqual({ agents: '/agent/verify', repairs: '/provider/onboard', professional: '/provider/onboard/professional' })
    for (const p of ['app/agent/verify/page.tsx', 'app/provider/onboard/page.tsx', 'app/provider/onboard/professional/page.tsx']) expect(() => read(p), p).not.toThrow()
  })
  it('the component reads no table, sends nothing, and opens no native dialog', () => {
    const s = read('components/directory/JoinEntry.tsx')
    expect(s).not.toMatch(/supabase|fetch\(|window\.confirm\(|\balert\(/)
    // the header guard keeps Ontario statute and regulator names out of this section's shared parts
    expect(s).not.toMatch(/\b(RTA|LTB|OHRC|RECO|TRESA)\b/)
    // no price, no promise of placement: the directory's order is fixed and nothing is charged for position
    expect(s).not.toMatch(/免费|free\b|推荐|优先|featured|\$\d/i)
  })
  it('the header puts it beside the title from `sm` up and under the note on a phone; the tabs follow', () => {
    const s = read('components/directory/FindHeader.tsx')
    expect(s).toContain('<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">')
    expect(s).toContain('<JoinEntry zh={zh} tabs={FIND_TABS} />')
    expect(s.indexOf('<JoinEntry')).toBeLessThan(s.indexOf('data-testid="find-tabs"'))
    expect(s.indexOf('data-testid="find-note"')).toBeLessThan(s.indexOf('<JoinEntry'))
  })
  it('the quieter lines at the foot of the two provider tabs are still there', () => {
    expect(read('app/providers/page.tsx')).toContain("<Link href=\"/provider/onboard\" className=\"underline\">{zh ? '申请入驻' : 'Apply to join'}</Link>")
    expect(read('app/providers/professional/page.tsx')).toContain('data-testid="professional-join"')
  })
})

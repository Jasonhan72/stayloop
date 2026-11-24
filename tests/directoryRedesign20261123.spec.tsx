// @vitest-environment jsdom
// V0.9 (2026-11-23, user: 「这个模块需要重新设计 UI/UX，要有专业设计的感觉，并符合整体风格」, then 「接着改」 for
// the browsing pages). The three tabs of 「找经纪和服务商」 keep everything they said and did — the
// same headings, filters, cards, facts, links and test ids — and change how they look:
//   · the tabs are one segmented control instead of a row of underlined links;
//   · the filters are one bar instead of three or four separate boxes;
//   · the cards share one set of classes: a quiet meta line, chips in two weights, a hairline foot,
//     and 看主页 / 发消息 as two pills of the same shape, compact and to the right on a desktop;
//   · the section sits on a tinted ground so the white bar and the white cards read as surfaces.
// What a card shows is pinned by the older specs (findDirectory, agentPagesRedesign, providerProfile…).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({ lang: 'zh' as 'zh' | 'en' }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => { throw new Error('no data is read in this spec') }, auth: { getSession: () => { throw new Error('no session is read in this spec') } } } }))

import FindHeader, { FIND_GROUND } from '../components/directory/FindHeader'
import { FilterBar, FilterIcon, FilterSelect, FilterText } from '../components/directory/FilterBar'
import ProviderCard from '../components/directory/ProviderCard'
import { CARD, CARD_MESSAGE, CARD_VIEW } from '../components/directory/cardStyle'

afterEach(() => { cleanup(); state.lang = 'zh' })
const has = (el: Element, ...tokens: string[]) => { const k = ` ${el.className} `; for (const t of tokens) expect(k, t).toContain(` ${t} `) }

describe('the tabs are one segmented control', () => {
  it('a rounded track holding three pills; the current one is the white one', () => {
    const { container: c } = render(<FindHeader active="repairs" />)
    const nav = only(c, '[data-testid="find-tabs"]')
    has(nav, 'inline-flex', 'max-w-full', 'rounded-2xl', 'p-1')
    expect(nav.className).not.toMatch(/border-b|overflow-x-auto/)
    const tabs = all<HTMLAnchorElement>(nav, 'a')
    expect(tabs.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null])
    for (const a of tabs) has(a, 'rounded-xl', 'min-h-[44px]', 'justify-center')
    has(tabs[1], 'bg-white', 'text-ink')
    expect(tabs[0].className).not.toContain(' bg-white ')
    expect(tabs[1].className).not.toMatch(/border-b-2/)
  })
  it('the section and the three pages share one tinted ground', () => {
    expect(FIND_GROUND).toBe('#F6F9FC')
    expect(read('components/directory/FindHeader.tsx')).toContain('background: `linear-gradient(180deg,#E8F1FD 0%,${FIND_GROUND} 100%)`')
    for (const f of ['app/agents/page.tsx', 'app/providers/page.tsx', 'app/providers/professional/page.tsx']) expect(read(f), f).toContain('<div style={{ background: FIND_GROUND }} className="text-body">')
  })
})

describe('the filters are one bar', () => {
  it('each field is a labelled cell of one grid; a select loses the native chrome and gets the bar’s chevron', () => {
    const seen: string[] = []
    const { container: c } = render(
      <FilterBar cols="sm:grid-cols-2" testid="bar">
        <FilterText icon={FilterIcon.search} value="" onChange={(e) => seen.push(e.target.value)} placeholder="姓名" aria-label="姓名" data-testid="q" />
        <FilterSelect icon={FilterIcon.globe} value="" onChange={(e) => seen.push(e.target.value)} aria-label="语言"><option value="">所有语言</option><option value="zh">普通话</option></FilterSelect>
      </FilterBar>,
    )
    const bar = only(c, '[data-testid="bar"]')
    has(bar, 'grid', 'gap-px', 'overflow-hidden', 'rounded-2xl', 'bg-line-divider', 'sm:grid-cols-2')
    const cells = all(bar, ':scope > label')
    expect(cells.length).toBe(2)
    for (const cell of cells) has(cell, 'bg-white', 'min-w-0')
    const input = only<HTMLInputElement>(bar, 'input')
    expect(input.getAttribute('aria-label')).toBe('姓名')
    expect(input.getAttribute('data-testid')).toBe('q')
    has(input, 'h-12', 'bg-transparent', 'outline-none')
    const select = only<HTMLSelectElement>(bar, 'select')
    has(select, 'appearance-none', 'h-12')
    expect(select.getAttribute('aria-label')).toBe('语言')
    expect(all(cells[1], 'svg').length).toBe(2) // its icon and the chevron
    fireEvent.change(input, { target: { value: 'amy' } })
    fireEvent.change(select, { target: { value: 'zh' } })
    expect(seen).toEqual(['amy', 'zh'])
  })
  it('both listing tabs use it, with the fields and labels they had', () => {
    const agents = read('app/agents/page.tsx')
    expect(agents).toContain('<FilterBar cols="sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]" testid="agents-filters">')
    for (const l of ["aria-label={zh ? '区域' : 'Area'}", "aria-label={zh ? '姓名或经纪公司' : 'Name or brokerage'} data-testid=\"agents-q\"", "aria-label={zh ? '语言' : 'Language'}", "aria-label={zh ? '专长' : 'Focus'}"]) expect(agents, l).toContain(l)
    const repair = read('app/providers/page.tsx')
    expect(repair).toContain('<FilterBar cols="sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]" testid="providers-filters">')
    for (const l of ["aria-label={zh ? '服务商名称' : 'Provider name'} data-testid=\"providers-q\"", "aria-label={zh ? '工种' : 'Trade'}", "aria-label={zh ? '城市' : 'City'}"]) expect(repair, l).toContain(l)
    // the separate boxes, and the explicit heights Safari needed for them, are gone
    for (const s of [agents, repair]) expect(s).not.toMatch(/const sel = |h-\[42px\]|lg:h-\[39px\]/)
  })
  it('the professional tab’s categories are pills, the chosen one filled, each a full tap target', () => {
    const s = read('app/providers/professional/page.tsx')
    expect(s).toContain("const PILL = 'flex min-h-[44px] items-center rounded-full border px-4 text-[13.5px] font-semibold transition sm:min-h-[40px]'")
    expect(s).toContain("const PILL_ON = 'border-ink bg-ink text-white'")
    expect(s).toContain("className={`${PILL} ${trade === 'all' ? PILL_ON : PILL_OFF}`}")
    expect(s).toContain('data-testid="professional-group-count"')
  })
})

describe('the cards share one look', () => {
  it('看主页 and 发消息 are two pills of the same shape: side by side on a phone, compact and to the right from `sm` up', () => {
    for (const k of [CARD_VIEW, CARD_MESSAGE]) {
      const c = ` ${k} `
      for (const t of ['min-h-[44px]', 'sm:min-h-[40px]', 'flex-1', 'sm:flex-none']) expect(c, t).toContain(` ${t} `)
    }
    expect(` ${CARD_VIEW} `).toContain(' rounded-full ')
    expect(CARD_VIEW).not.toMatch(/rounded-xl/)
    expect(` ${CARD_MESSAGE} `).toContain(' sl-btn-primary ') // the site's pill
    for (const t of ['flex-col', 'rounded-2xl', 'bg-white', 'transition']) expect(` ${CARD} `, t).toContain(` ${t} `)
    expect(CARD).toMatch(/hover:shadow-\[/)
  })
  it('both the agent card and the provider card are built from those classes', () => {
    const agents = read('app/agents/page.tsx')
    expect(agents).toContain('<article key={`p-${a.slug}`} className={CARD} data-testid="agent-card">')
    expect(agents).toContain('<article key={`b-${a.reco_number}`} className={CARD} data-testid="agent-basic-card">')
    expect(agents).toContain('<Link href={href} className={CARD_VIEW} data-testid="agent-card-view">')
    expect(agents).toContain('<Link href={`${href}#contact`} className={CARD_MESSAGE} data-testid="agent-card-message">')
    const card = read('components/directory/ProviderCard.tsx')
    expect(card).toContain('<article className={CARD} data-testid={testid}>')
    expect(card).toContain('<Link href={href} className={CARD_VIEW} data-testid="provider-card-view">')
    expect(card).toContain('<Link href={`${href}#contact`} className={CARD_MESSAGE} data-testid="provider-card-message">')
    for (const s of [agents, card]) expect(s).not.toMatch(/min-h-\[42px\] flex-1 items-center justify-center rounded-xl/)
  })
  it('a provider card rendered: name, badge with the rating beside it, chips, where they work, and a foot with the contact details and the two actions', () => {
    const { container: c } = render(
      <ProviderCard id="55555555-5555-4555-8555-555555555555" name="Northline Home Services" legalName="Northline Home Services Inc." zh badge={{ ok: true, label: '资质已核 · 2026-11-16' }} rating="★ 4.5 (2)"
        chips={[{ key: 'plumbing', label: '水管', ok: true }, { key: 'electrical', label: '电气', ok: false }]} cities={['Toronto', 'Mississauga']} detail="$110/h · 上门费 $75" email="hi@northline.example" phone="416-555-0200" languages={['en', 'zh']} />,
    )
    const card = only(c, '[data-testid="provider-card"]')
    expect(card.className).toBe(CARD)
    expect(textOf(only(card, '[data-testid="provider-card-name"]'))).toBe('Northline Home Services')
    // the rating sits on the badge's line now, not on a line of its own
    expect(only(card, '[data-testid="provider-rating"]').parentElement).toBe(only(card, '[data-testid="provider-card-badge"]').parentElement)
    expect(all(card, '[data-testid="provider-card-chips"] span').map(textOf)).toEqual(['水管', '电气 · 资质待补', '英语', '普通话'])
    expect(textOf(only(card, '[data-testid="provider-card-cities"]'))).toBe('服务城市：Toronto · Mississauga')
    const contact = only(card, '[data-testid="provider-card-contact"]')
    expect(all<HTMLAnchorElement>(contact, 'a').map((a) => a.getAttribute('href'))).toEqual(['mailto:hi@northline.example', 'tel:4165550200'])
    const view = only<HTMLAnchorElement>(card, '[data-testid="provider-card-view"]')
    const msg = only<HTMLAnchorElement>(card, '[data-testid="provider-card-message"]')
    expect([view.getAttribute('href'), msg.getAttribute('href')]).toEqual(['/providers/55555555-5555-4555-8555-555555555555', '/providers/55555555-5555-4555-8555-555555555555#contact'])
    // the contact details and the actions share the card's foot
    expect(contact.parentElement).toBe(view.parentElement?.parentElement)
    expect(view.parentElement).toBe(msg.parentElement)
  })
  it('a card without contact details keeps its actions to the right', () => {
    const { container: c } = render(<ProviderCard id="55555555-5555-4555-8555-555555555555" name="X" zh badge={{ ok: false, label: '牌照待核或已过期' }} chips={[]} cities={[]} />)
    expect(all(c, '[data-testid="provider-card-contact"]').length).toBe(0)
    const foot = only(c, '[data-testid="provider-card-view"]').parentElement!.parentElement!
    expect(foot.className).toContain('sm:justify-between')
    expect(foot.children.length).toBe(2) // an empty spacer, then the actions
  })
})

describe('the two profile pages wear the same surfaces as the list they are opened from', () => {
  const agent = read('app/agents/[slug]/page.tsx')
  const provider = read('app/providers/[id]/page.tsx')
  it('the tinted ground, the card surface for every section, and one heading style', () => {
    for (const [name, s] of [['agent', agent], ['provider', provider]] as const) {
      expect(s, name).toContain('<div style={{ background: FIND_GROUND }} className="text-body">')
      expect(s, name).not.toMatch(/className="rounded-2xl border border-line-divider bg-white p-6"/)
      expect(s, name).not.toMatch(/<h2 className="text-\[16px\] font-bold">/)
      expect(s.match(/<h2 className=\{PANEL_TITLE\}>/g)?.length ?? 0, name).toBeGreaterThanOrEqual(4)
      expect(s, name).toContain('className={`scroll-mt-24 ${PANEL} lg:sticky lg:top-24`}')
    }
    expect(agent.match(/<section className=\{PANEL\} data-testid=/g)?.length).toBe(6)
    expect(provider).toContain('const card = PANEL')
  })
  it('the name, the chips and 分享 come from the shared classes; 分享 is a pill like 发消息', () => {
    expect(agent).toContain('<h1 className={PROFILE_NAME}>{agent.name}</h1>')
    expect(provider).toContain('<h1 className={PROFILE_NAME}>{name}</h1>')
    expect(agent).toContain('className={PROFILE_SECOND} data-testid="agent-profile-share"')
    expect(provider).toContain('className={PROFILE_SECOND} data-testid="provider-profile-share"')
    for (const s of [agent, provider]) expect(s).not.toMatch(/rounded-xl border border-line-strong px-5/)
    expect(agent).toContain('className={CHIP_LG_QUIET}>{focusLabel(c, L)}</span>')
    expect(provider).toContain('<span key={c} className={CHIP_LG_QUIET}>{c}</span>')
  })
  it('the brokerage keeps a line of its own, in bold on the page and in the name’s colour on the card', () => {
    // O. Reg. 567/05 s.12.1: the brokerage is named clearly and prominently wherever the agent is shown.
    expect(agent).toMatch(/font-bold" data-testid="agent-profile-brokerage">\{agent\.brokerage_name\}<\/div>/)
    const list = read('app/agents/page.tsx')
    expect(list.match(/<div className="break-words text-\[14px\] font-semibold leading-snug text-ink" data-testid="agent-card-brokerage">\{a\.brokerage_name\}<\/div>/g)?.length).toBe(2)
    expect(list).not.toMatch(/<span className="[^"]*" data-testid="agent-card-brokerage">/)
  })
  it('an anonymous visitor to a provider’s page still gets the sign-in panel and nothing else', () => {
    expect(provider).toContain('<div className={`mt-5 max-w-[640px] ${PANEL}`} data-testid="provider-profile-signin">')
  })
})

// @vitest-environment jsdom
// V0.9 (2026-11-23, user: 「接着做」 after the onboarding page was split by kind). The provider's own
// workspace follows the same split. A provider who lists professional services only — paralegal,
// lawyer, insurance broker, photography — is never dispatched a work order, yet their navigation
// listed 工单 and 历史 (permanently empty, with no word of why) and their expiry reminders said
// 「派单会跳过你」. Now: three places in the navigation, an explanation where the two pages used to
// be blank, and reminders that speak of the directory.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

const state = vi.hoisted(() => ({
  path: '/messages',
  lang: 'zh' as 'zh' | 'en',
  auth: { user: { id: 'u-pro' } as null | { id: string }, loading: false, role: null as string | null },
  unread: 0,
  invites: 3,
  providerRow: { id: 'p1', trades: ['paralegal'] } as null | { id: string; trades?: string[] | null },
  asked: [] as string[],
}))

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('next/navigation', () => ({ usePathname: () => state.path, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => state.auth }))
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
  return { supabase: { from } }
})

import { PROVIDER_ITEMS, ProviderRail, ProviderTabs, providerItemsFor } from '../components/provider/ProviderNav'
import NoDispatchNotice from '../components/provider/NoDispatchNotice'
import { credentialReminderText } from '../lib/marketplace/reminderText'
import { renewHintText } from '../lib/marketplace/trades'

let uid = 0
afterEach(() => {
  cleanup()
  state.path = '/messages'
  state.lang = 'zh'
  // a fresh account each time: the navigation remembers what it last read per account
  state.auth = { user: { id: `u-${++uid}` }, loading: false, role: null }
  state.unread = 0
  state.invites = 3
  state.providerRow = { id: 'p1', trades: ['paralegal'] }
  state.asked = []
})
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })
const links = (c: ParentNode, sel: string) => all<HTMLAnchorElement>(c, `${sel} a`).map((a) => [a.getAttribute('href'), textOf(a)])

// ───────────────────────────────────────────────────────────── the navigation

describe('a professional-only provider’s navigation has no 工单 / 历史', () => {
  it('three places — 资料与牌照 (its own onboarding page) · 消息 · 找人; everyone else keeps the five', () => {
    expect(providerItemsFor(true).map((x) => [x.key, x.href, x.label.zh])).toEqual([
      ['profile', '/provider/onboard/professional', '资料与牌照'],
      ['msgs', '/messages', '消息'],
      ['find', '/agents', '找人'],
    ])
    expect(providerItemsFor(false)).toBe(PROVIDER_ITEMS)
    expect(PROVIDER_ITEMS.map((x) => x.key)).toEqual(['jobs', 'history', 'profile', 'msgs', 'find'])
    for (const x of providerItemsFor(true)) expect(x.desc.zh.length, x.key).toBeGreaterThan(4)
  })
  it('phone bar: three tabs, no invitation badge, and no work orders are counted', async () => {
    const { container: c } = render(<ProviderTabs />)
    await settle()
    expect(links(c, '[data-testid="provider-tabs"]')).toEqual([['/provider/onboard/professional', '资料'], ['/messages', '消息'], ['/agents', '找人']])
    expect(state.asked).toEqual(['service_providers'])
    expect(c.textContent).not.toContain('工单')
  })
  it('desktop rail: the same three (plus settings), and 资料与牌照 is current on its page', async () => {
    state.path = '/provider/onboard/professional'
    const { container: c } = render(<ProviderRail />)
    await settle()
    const rail = only(c, '[data-testid="provider-rail"]')
    expect(all<HTMLAnchorElement>(rail, 'a').map((a) => a.getAttribute('href'))).toEqual(['/provider/onboard/professional', '/messages', '/agents', '/settings'])
    expect(all<HTMLAnchorElement>(rail, 'a[aria-current="page"]').map((a) => a.getAttribute('href'))).toEqual(['/provider/onboard/professional'])
  })
  it('a record with a repair trade — alone or beside a professional one — keeps all five and its invitations', async () => {
    for (const trades of [['plumbing'], ['handyman', 'photographer_floorplan']]) {
      state.providerRow = { id: 'p1', trades }
      state.asked = []
      const { container: c } = render(<ProviderTabs />)
      await settle()
      expect(links(c, '[data-testid="provider-tabs"]').map((l) => l[0]), trades.join()).toEqual(['/provider/jobs', '/provider/history', '/provider/onboard', '/messages', '/agents'])
      expect(textOf(all(c, '[data-testid="provider-tabs"] a')[0])).toBe('3工单')
      expect(state.asked).toEqual(['service_providers', 'work_orders'])
      cleanup()
      state.auth = { user: { id: `u-${++uid}` }, loading: false, role: null }
    }
  })
  it('no record yet, or a record with no trades yet: the full five — a newcomer is not a professional', async () => {
    for (const row of [null, { id: 'p1', trades: [] }, { id: 'p1' }]) {
      state.providerRow = row
      const { container: c } = render(<ProviderTabs />)
      await settle()
      expect(all(c, '[data-testid="provider-tabs"] a').length, JSON.stringify(row)).toBe(5)
      cleanup()
      state.auth = { user: { id: `u-${++uid}` }, loading: false, role: null }
    }
  })
  it('English shows no Chinese', async () => {
    state.lang = 'en'
    const { container: c } = render(<ProviderTabs />)
    await settle()
    expect(links(c, '[data-testid="provider-tabs"]').map((l) => l[1])).toEqual(['Profile', 'Messages', 'Find'])
    expect(c.textContent).not.toMatch(/[一-鿿]/)
  })
})

// ───────────────────────────────────────────────────────────── 工单 / 历史

describe('工单 and 历史 say why they are empty for a professional-only provider', () => {
  it('the notice: nothing is dispatched, inquiries are in 消息, and the way to add a dispatched trade', () => {
    const { container: c } = render(<NoDispatchNotice zh providerId="55555555-5555-4555-8555-555555555555" verified />)
    const box = only(c, '[data-testid="provider-no-dispatch"]')
    expect(textOf(only(box, 'h1'))).toBe('专业服务不派单，这里没有工单')
    expect(textOf(box)).toContain('咨询都在「消息」里')
    expect(only<HTMLAnchorElement>(box, '[data-testid="no-dispatch-messages"]').getAttribute('href')).toBe('/messages')
    expect(only<HTMLAnchorElement>(box, '[data-testid="no-dispatch-profile"]').getAttribute('href')).toBe('/provider/onboard/professional')
    expect(only<HTMLAnchorElement>(box, '[data-testid="no-dispatch-page"]').getAttribute('href')).toBe('/providers/55555555-5555-4555-8555-555555555555')
    expect(all<HTMLAnchorElement>(box, 'a').map((a) => a.getAttribute('href'))).toContain('/provider/onboard?type=repair')
    expect(textOf(box)).toContain('物业管理服务')
  })
  it('no link to a page that does not exist yet for an unverified record; English carries no Chinese', () => {
    let r = render(<NoDispatchNotice zh providerId="x" verified={false} />)
    expect(all(r.container, '[data-testid="no-dispatch-page"]').length).toBe(0)
    cleanup()
    r = render(<NoDispatchNotice zh={false} providerId="x" verified />)
    expect(r.container.textContent).not.toMatch(/[一-鿿]/)
  })
  it('both pages show it instead of their lists, and read no work orders for such a record', () => {
    for (const f of ['app/provider/jobs/page.tsx', 'app/provider/history/page.tsx']) {
      const s = read(f)
      expect(s, f).toContain("if (isProfessionalOnly(prov.trades)) return <Shell><NoDispatchNotice zh={zh} providerId={prov.id} verified={prov.status === 'verified'} /></Shell>")
      // the early return in the loader sits before the work-order query
      const stop = s.indexOf('if (isProfessionalOnly((p as')
      expect(stop, f).toBeGreaterThan(-1)
      expect(stop, f).toBeLessThan(s.indexOf("supabase.from('work_orders')"))
    }
    expect(read('app/provider/history/page.tsx')).toContain(".select('id, legal_name, trade_name, trades, status')")
  })
})

// ───────────────────────────────────────────────────────────── reminders

describe('expiry reminders speak of what actually lapses', () => {
  const base = { name: 'Avery Legal', zhLines: '  • LSO 持牌 Paralegal（P1） · 到期 2026-12-01（还有 7 天）', enLines: '  • LSO licensed paralegal · expires 2026-12-01 (7 day(s) left)', site: 'https://www.stayloop.ai' }
  it('a professional-only record: the directory mark, its own page, and no word of dispatch', () => {
    const soon = credentialReminderText({ ...base, professionalOnly: true, worst: 7 })
    expect(soon.subject).toBe('牌照 7 天后到期 / Licence expires in 7 day(s)')
    expect(soon.url).toBe('/provider/onboard/professional')
    expect(soon.body).toContain('目录里会显示「牌照待核或已过期」')
    expect(soon.body).toContain('更新：https://www.stayloop.ai/provider/onboard/professional')
    expect(soon.body).toContain('Update: https://www.stayloop.ai/provider/onboard/professional')
    expect(soon.body).not.toMatch(/派单|dispatch|工种/)
    const gone = credentialReminderText({ ...base, professionalOnly: true, worst: -3 })
    expect(gone.subject).toBe('牌照已过期 · 目录不再显示「已核」 / Licence expired · no longer shown as verified')
    expect(gone.subject).not.toMatch(/派单|dispatch/)
  })
  it('everyone else gets the wording they had, word for word', () => {
    const soon = credentialReminderText({ ...base, professionalOnly: false, worst: 30 })
    expect(soon.subject).toBe('资质 30 天后到期 / Credential expires in 30 day(s)')
    expect(soon.url).toBe('/provider/onboard')
    expect(soon.body).toBe(
      `您好，Avery Legal，\n\n${base.zhLines}\n\n到期的资质不再计入工种覆盖，派单会跳过你，直到你在入驻页更新编号与到期日并由 Stayloop 重新核验。更新：https://www.stayloop.ai/provider/onboard\n\n` +
      `Hi Avery Legal,\n\n${base.enLines}\n\nAn expired credential no longer counts toward trade coverage and dispatch skips you until you update the number and expiry on the onboarding page and Stayloop re-verifies it. Update: https://www.stayloop.ai/provider/onboard`,
    )
    expect(credentialReminderText({ ...base, professionalOnly: false, worst: -1 }).subject).toBe('资质已过期 · 派单已跳过你 / Credential expired · dispatch paused')
  })
  it('the sweep reads the trades and takes its words and its link from there', () => {
    const s = read('lib/marketplace/sweep.ts')
    expect(s).toContain(".select('id, auth_id, legal_name, trade_name, contact_email, status, trades')")
    expect(s).toContain('credentialReminderText({ professionalOnly: isProfessionalOnly(prov.trades), name, zhLines, enLines, worst, site: SITE() })')
    expect(s).toContain("body: items.map((i) => CREDENTIAL_LABEL[i.kind]?.zh ?? i.kind).join(' · '), url })")
    expect(s).not.toContain('派单已跳过你')
  })
  it('renewing a professional’s own licence is about the directory; trade credentials keep the dispatch wording', () => {
    const lapsed = { state: 'lapsed' } as Parameters<typeof renewHintText>[1]
    for (const k of ['lso_paralegal', 'lso_lawyer', 'ribo_licence'] as const) {
      const zh = renewHintText(k, lapsed, true)
      expect(zh, k).toContain('目录里显示「牌照待核或已过期」')
      expect(zh, k).not.toContain('派单')
      expect(renewHintText(k, lapsed, false), k).not.toMatch(/dispatch|[一-鿿]/)
      expect(renewHintText(k, { state: 'live' } as Parameters<typeof renewHintText>[1], true), k).toContain('继续有效')
    }
    expect(renewHintText('sto_coq', lapsed, true)).toContain('派单会跳过你')
    // the paperwork a photographer shares with the trades keeps the trade wording
    expect(renewHintText('liability_insurance', lapsed, false)).toContain('dispatch skips you')
  })
})

// @vitest-environment jsdom
// V0.9 (2026-11-23). The user renamed the dispatched kind of provider 物业管理服务 on the onboarding
// page (「上门维修可以改为物业管理服务」), and then, asked whether the directory tab should follow:
// 「也改」. So the kind has one name wherever it is named as a kind — the tab of 「找经纪和服务商」, the
// page behind it, the crumb on a provider's page, the rail's hover text, the line beside 报修, and
// what the assistant calls the entrance. Repairing as an activity keeps its word: 报修, 维修工单, and
// the rail's 「维修」 pages are untouched.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { all, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')
/** The file without its `//` comment lines: comments may say what the tab used to be called. */
const code = (p: string) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

const state = vi.hoisted(() => ({ lang: 'zh' as 'zh' | 'en' }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/i18n', () => ({ useT: () => ({ lang: state.lang, t: (_k: string, f: string) => f }), useI18n: () => ({ lang: state.lang, t: (_k: string, f: string) => f }) }))
// the rail module reaches the browser client through its unread counter; nothing here reads data
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => { throw new Error('no data is read in this spec') } } }))

import FindHeader, { FIND_TABS } from '../components/directory/FindHeader'
import { ONBOARD_COPY } from '../lib/marketplace/onboardKind'
import { FIND_ITEM, RAIL_BY_ROLE } from '../components/workspace/rail'
import { directoryGuide } from '../lib/agent/prompts'
import { metadata } from '../app/providers/layout'

afterEach(() => { cleanup(); state.lang = 'zh' })

describe('the directory tab carries the name the onboarding page uses', () => {
  it('物业管理服务 / Property maintenance — the same words as the onboarding kind; address and key unchanged', () => {
    const tab = FIND_TABS[1]
    expect(tab).toEqual({ key: 'repairs', href: '/providers', zh: '物业管理服务', en: 'Property maintenance' })
    expect([tab.zh, tab.en]).toEqual([ONBOARD_COPY.repair.choice.zh, ONBOARD_COPY.repair.choice.en])
  })
  it('rendered: 经纪 · 物业管理服务 · 专业服务; English shows no Chinese', () => {
    let r = render(<FindHeader active="repairs" />)
    expect(all(r.container, '[data-testid="find-tabs"] a').map(textOf)).toEqual(['经纪', '物业管理服务', '专业服务'])
    cleanup()
    state.lang = 'en'
    r = render(<FindHeader active="repairs" />)
    expect(all(r.container, '[data-testid="find-tabs"] a').map(textOf)).toEqual(['Agents', 'Property maintenance', 'Professionals'])
    expect(r.container.textContent).not.toMatch(/[一-鿿]/)
  })
  it('the longer English name may fold onto two lines on a phone; the Chinese tabs never wrap', () => {
    // measured 2026-11-23: with nowrap the three English tabs ran 81px past a 360px screen and hid 「Professionals」
    const cls = (c: ParentNode) => all<HTMLAnchorElement>(c, '[data-testid="find-tabs"] a').map((a) => ` ${a.className} `)
    for (const k of cls(render(<FindHeader active="repairs" />).container)) {
      expect(k).toContain(' flex-none ')
      expect(k).toContain(' whitespace-nowrap ')
    }
    cleanup()
    state.lang = 'en'
    for (const k of cls(render(<FindHeader active="repairs" />).container)) {
      expect(k).not.toContain(' whitespace-nowrap ')
      expect(k).not.toContain(' flex-none ')
      expect(k).toContain(' sm:whitespace-nowrap ')
      expect(k).toContain(' sm:flex-none ')
      expect(k).toContain(' min-h-[44px] ')
    }
  })
  it('the page behind it: browser title, heading and intro', () => {
    expect(metadata.title).toBe('物业管理服务 · Stayloop')
    const s = code('app/providers/page.tsx')
    expect(s).toContain("{zh ? '物业管理服务商' : 'Property maintenance providers'}")
    expect(s).toContain('这类物业管理服务。')
  })
  it('a provider’s page takes its crumb from the tab list, so the two cannot drift', () => {
    const s = code('app/providers/[id]/page.tsx')
    expect(s).toContain("const tab = FIND_TABS.find((t) => t.key === (professionalOnly ? 'professional' : 'repairs'))!")
    expect(s).toContain('const back = { href: tab.href, label: zh ? tab.zh : tab.en }')
  })
})

describe('nowhere is the kind still called 维修服务 or 上门维修', () => {
  it('the screens and the assistant’s guide', () => {
    for (const f of [
      'components/directory/FindHeader.tsx', 'app/providers/page.tsx', 'app/providers/layout.tsx', 'app/providers/[id]/page.tsx',
      'app/providers/professional/page.tsx', 'components/workspace/rail.tsx', 'app/tenant/maintenance/page.tsx', 'app/admin/page.tsx',
      'components/provider/NoDispatchNotice.tsx', 'lib/marketplace/onboardKind.ts',
    ]) expect(code(f), f).not.toMatch(/维修服务|上门维修|Repair providers|repair providers/)
    expect(FIND_ITEM.desc).toEqual({ zh: '找经纪、物业管理服务和专业服务', en: 'Find agents, property maintenance and professional services' })
    for (const role of ['tenant', 'landlord', 'agent'] as const) {
      const g = directoryGuide(role)
      expect(g, role).toContain('- 物业管理服务(水管、电气、供暖空调、电器、虫害、门窗、门锁、杂工清洁这些上门的工种)→ /providers(')
      expect(g, role).not.toMatch(/维修服务|上门维修/)
    }
  })
  it('repairing as an activity keeps its word: the 维修 pages in the rail, and a tenant’s 报修 comes first', () => {
    for (const role of ['tenant', 'landlord'] as const) {
      const maint = RAIL_BY_ROLE[role].find((x) => x.key === 'maint')!
      expect(maint.label, role).toEqual({ zh: '维修', en: 'Repairs' })
    }
    expect(directoryGuide('tenant')).toContain('维修由房东负责安排')
    expect(code('app/providers/page.tsx')).toContain("'派单在维修页；这里只是浏览。'")
  })
})

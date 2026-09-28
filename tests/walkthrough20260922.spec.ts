import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { flattenMarkdown } from '../lib/agent/turnHelpers'
import { buildSystemPrompt } from '../lib/agent/prompts'
import { buildListingRow } from '../lib/listingPublish'

// 2026-09-22 — an external anonymous walkthrough of the public site.
// Verified before fixing: (1) "进入 Logic 工作台" dropped a signed-out
// landlord on the screening page's account wall; (2) the listing chat
// generated a draft from address + rent alone and never asked the fields
// tenants filter on, so published listings showed "—" for area and nothing
// for pets / smoking / lease term / utilities; (3) the chat bubble showed
// raw "###" / "**" markdown.

describe('onboarding: the workspace button leads to the workspace when signed out', () => {
  const src = readFileSync('app/onboarding/name/page.tsx', 'utf8')
  it('routes anonymous landlords to /landlord/agent and signed-in first-timers to the screening aha moment', () => {
    // 2026-09-24: signed-in landlords are granted the hat explicitly, then sent to the screening page.
    expect(src).toMatch(/role === 'landlord' && signedIn\) \{[\s\S]*?router\.push\('\/screening\/app'\)[\s\S]*?\}\s*router\.push\(AGENT_HOME\[role\]\)/)
  })
})

describe('listing draft: ask what tenants filter on, and carry it to the row', () => {
  it('the landlord prompt lists the follow-up fields and the schema carries smoking / utilities', () => {
    const p = buildSystemPrompt('landlord', 'Logic', [], { workflow_type: 'general', workflow_id: null, current_stage: 'idle', completed_steps: [], status: 'active' as const })
    expect(p).toContain('smoking_policy')
    expect(p).toContain('utilities_included')
    for (const w of ['面积', '宠物', '吸烟', '租期', '车位', '家具', '洗衣']) expect(p).toContain(w)
  })
  it('buildListingRow writes smoking_policy and utilities_included', () => {
    const row = buildListingRow({ address: '28 Avondale Ave', monthly_rent: 2450, smoking_policy: 'no', utilities_included: ['hydro', 'water'], lease_term: '12 个月' } as never, { slug: 'x', landlordId: 'l' })
    expect(row.smoking_policy).toBe('no')
    expect(row.utilities_included).toEqual(['hydro', 'water'])
    expect(row.lease_term).toBe('12 个月')
  })
})

describe('chat replies are plain text', () => {
  it('flattens headings, bold, bullets and inline code; keeps link text and URL', () => {
    expect(flattenMarkdown('### 1. What the report checks\n* **Document forensics:** metadata\n- `/screening/app` to start')).toBe('1. What the report checks\n· Document forensics: metadata\n· /screening/app to start')
    expect(flattenMarkdown('see [the report](https://www.stayloop.ai/screening)')).toBe('see the report https://www.stayloop.ai/screening')
    expect(flattenMarkdown('plain text with 2 * 3 = 6')).toBe('plain text with 2 * 3 = 6')
    expect(flattenMarkdown('')).toBe('')
  })
})

// EliseAI benchmark 2026-09-22 — the two additive items shipped without a redesign:
// the homepage deep link that feeds a role page's example question into the hero
// conversation, and the deterministic move-in cost card on listing pages.
describe('EliseAI benchmark 2026-09-22 (additive items)', () => {
  const home = readFileSync('components/home/HomeNext.tsx', 'utf8')
  const listing = readFileSync('app/listings/[slug]/page.tsx', 'utf8')

  it('the /?role=&ask= deep link lands in the role’s assistant page (V0.7, 2026-09-27): middleware 308 through one pure helper, nothing read on the homepage', async () => {
    const { homeAskRedirect } = await import('../lib/homeDeepLink')
    const t = homeAskRedirect(new URL('https://www.stayloop.ai/?role=landlord&ask=%E6%88%91%E7%9A%84%E6%88%BF%E6%BA%90'))
    expect(t?.pathname).toBe('/landlord/agent')
    expect(t?.searchParams.get('prompt')).toBe('我的房源')
    expect(t?.searchParams.get('send')).toBe('1')
    expect(readFileSync('middleware.ts', 'utf8')).toContain('const ask = homeAskRedirect(url)')
    expect(home).not.toMatch(/sp\.get\('ask'\)/)
  })

  it('listing page shows the RTA move-in cost card with the banned-fee list and a deposit-over-cap warning', () => {
    expect(listing).toMatch(/function MoveInCosts/)
    expect(listing).toMatch(/<MoveInCosts zh=\{zh\} rent=\{listing\.monthly_rent\} deposit=\{listing\.deposit\} \/>/)
    expect(listing).toMatch(/dep > rent \+ 0\.5/)
    for (const w of ['申请费', '信用检查费', '宠物押金', '清洁押金']) expect(listing).toContain(w)
    expect(listing).toMatch(/RTA s\.106/)
  })
})

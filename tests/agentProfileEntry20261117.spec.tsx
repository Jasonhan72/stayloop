// @vitest-environment jsdom
// 2026-11-17 · user: 「关于经纪的设置，找不到进去了以后设置为公开页面的按钮」. A verified agent saw
// their name under 「已核验 · 还没有公开主页」 in the directory and could not find where to change it:
// the switch was a checkbox mid-form at the bottom of /agent/verify (a page titled 「提交你的 RECO
// 注册信息」), and the agent workspace had no entry to that page. Now: one button in a status bar at
// the top of the profile section, the section above the form once verified, a rail entry, and a
// line on /agents for the agent whose own profile is hidden.
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')
const db = vi.hoisted(() => ({
  row: { public_profile: false, profile_slug: 'pat-example', bio: null, languages: ['zh'], service_areas: [], focus: [], show_activity: false, photo_key: null } as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  error: null as null | { code: string },
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => { db.updates.push(patch); return { error: db.error } } }),
    }),
  },
}))
vi.mock('@/components/agent/AgentPhotoControl', () => ({ default: () => React.createElement('div', { 'data-testid': 'photo' }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))

import PublicProfileEditor from '../components/agent/PublicProfileEditor'
import { RAIL_BY_ROLE } from '../components/workspace/rail'

afterEach(() => {
  cleanup()
  db.row = { public_profile: false, profile_slug: 'pat-example', bio: null, languages: ['zh'], service_areas: [], focus: [], show_activity: false, photo_key: null }
  db.updates = []
  db.error = null
})

async function mount(status: 'pending' | 'verified', lang: 'zh' | 'en' = 'zh') {
  const { container } = render(<PublicProfileEditor authId="00000000-0000-4000-8000-000000000001" legalName="Pat Example" status={status} lang={lang} />)
  await waitFor(() => only(container, '[data-testid="agent-public-profile-toggle"]'))
  return container
}
const click = async (el: HTMLElement) => { await act(async () => { el.click(); await Promise.resolve(); await Promise.resolve() }) }

describe('the publish button at the top of the profile section', () => {
  it('verified and not public: says so and one click publishes with the form as it stands', async () => {
    const c = await mount('verified')
    const bar = only(c, '[data-testid="agent-public-profile-status"]')
    expect(textOf(bar)).toContain('你的主页现在没有公开')
    const btn = only<HTMLButtonElement>(c, '[data-testid="agent-public-profile-publish"]')
    expect(textOf(btn)).toBe('公开我的主页')
    await click(btn)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0]).toMatchObject({ public_profile: true, profile_slug: 'pat-example', languages: ['zh'] })
    // the bar flips, the checkbox follows, and the profile link appears
    await waitFor(() => only(c, '[data-testid="agent-public-profile-unpublish"]'))
    expect(textOf(only(c, '[data-testid="agent-public-profile-status"]'))).toContain('主页已公开')
    expect(only<HTMLInputElement>(c, '[data-testid="agent-public-profile-toggle"]').checked).toBe(true)
    expect(only<HTMLAnchorElement>(c, '[data-testid="agent-public-profile-view"]').getAttribute('href')).toBe('/agents/pat-example')
    expect(c.querySelector('[data-testid="agent-public-profile-publish"]')).toBeNull()
  })
  it('already public: 取消公开 turns it off', async () => {
    db.row = { ...db.row, public_profile: true }
    const c = await mount('verified')
    await click(only<HTMLButtonElement>(c, '[data-testid="agent-public-profile-unpublish"]'))
    expect(db.updates[0]).toMatchObject({ public_profile: false })
    await waitFor(() => only(c, '[data-testid="agent-public-profile-publish"]'))
    expect(only<HTMLInputElement>(c, '[data-testid="agent-public-profile-toggle"]').checked).toBe(false)
  })
  it('a save that fails leaves it unpublished and says why beside the button', async () => {
    db.error = { code: '23505' }
    const c = await mount('verified')
    await click(only<HTMLButtonElement>(c, '[data-testid="agent-public-profile-publish"]'))
    expect(textOf(only(c, '[data-testid="agent-public-profile-status-error"]'))).toContain('这个主页地址已经被别人用了')
    only(c, '[data-testid="agent-public-profile-publish"]')
    expect(c.querySelector('[data-testid="agent-public-profile-view"]')).toBeNull()
  })
  it('not verified: no publish button at all (the locked notice explains), and nothing can be saved as public', async () => {
    const c = await mount('pending')
    expect(c.querySelector('[data-testid="agent-public-profile-status"]')).toBeNull()
    expect(c.querySelector('[data-testid="agent-public-profile-publish"]')).toBeNull()
    only(c, '[data-testid="agent-public-profile-locked"]')
    await click(only<HTMLButtonElement>(c, '[data-testid="agent-public-profile-save"]'))
    expect(db.updates[0]).toMatchObject({ public_profile: false })
  })
  it('the ordinary save button still saves the checkbox, not a click event', async () => {
    const c = await mount('verified')
    await click(only<HTMLInputElement>(c, '[data-testid="agent-public-profile-toggle"]'))
    await click(only<HTMLButtonElement>(c, '[data-testid="agent-public-profile-save"]'))
    expect(db.updates[0].public_profile).toBe(true)
    expect(read('components/agent/PublicProfileEditor.tsx')).not.toContain('onClick={save}')
  })
  it('English has no Chinese in the status bar', async () => {
    const c = await mount('verified', 'en')
    expect(/[一-鿿]/.test(textOf(only(c, '[data-testid="agent-public-profile-status"]')))).toBe(false)
  })
})

describe('finding the page', () => {
  it('the agent rail has 认证与主页 → /agent/verify with its own icon; other hats do not', () => {
    const it_ = RAIL_BY_ROLE.agent.find((x) => x.key === 'profile')
    expect(it_).toMatchObject({ href: '/agent/verify', group: 'pages', label: { zh: '认证与主页', en: 'Verification & profile' } })
    const icons = RAIL_BY_ROLE.agent.map((x) => (x.icon as { type: { name: string } }).type.name)
    expect(new Set(icons).size).toBe(icons.length)
    expect(RAIL_BY_ROLE.tenant.some((x) => x.key === 'profile')).toBe(false)
    expect(RAIL_BY_ROLE.landlord.some((x) => x.key === 'profile')).toBe(false)
  })
  it('once verified, the profile section sits above the registration form and the page is titled for it', () => {
    const src = read('app/agent/verify/page.tsx')
    const above = src.indexOf('isRegistrationLive(row.status) && (\n          <PublicProfileEditor')
    const form = src.indexOf("法定姓名（与 RECO 注册一致）")
    const below = src.indexOf('!isRegistrationLive(row.status) && (\n          <PublicProfileEditor')
    expect(above).toBeGreaterThan(0)
    expect(above).toBeLessThan(form)
    expect(below).toBeGreaterThan(form)
    expect(src).toContain("'认证与公开主页'")
    expect(src).toContain("'提交你的 RECO 注册信息'")
    expect(src).toContain('data-testid="agent-verify-form-heading"')
  })
  it('/agents tells a verified agent whose own profile is hidden where to publish it', () => {
    const src = read('app/agents/page.tsx')
    expect(src).toContain('data-testid="agents-own-hidden"')
    expect(src).toContain("from('agent_profiles').select('public_profile').eq('auth_id', auth.user.id)")
    expect(src).toContain('if (!auth.user || !agentLive) { setOwnHidden(false); return }')
    expect(src).toMatch(/agents-own-hidden[\s\S]{0,700}href="\/agent\/verify"/)
  })
})

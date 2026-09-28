// First sign-in asks which identity (V0.7 homepage, step 2 · 2026-09-27).
//
// The homepage's「三步开始」says「选身份，给助手起个名字」. An account created from
// the homepage login card carries no ?role=, and /onboarding/name used to
// default it to tenant without asking. Now the page asks with the four
// identities of the homepage (tenant / landlord / agent / provider), the
// role pages' ?role= still skips the question, the provider goes to its
// onboarding form, and the naming copy only promises what ships.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { ROLE_CHOICES, PROVIDER_ONBOARD, isAgentRole, isOnboardingRole } from '../lib/onboarding/roleChoices'
import RoleChooser from '../components/onboarding/RoleChooser'

const read = (p: string) => readFileSync(p, 'utf8')
const page = read('app/onboarding/name/page.tsx')

describe('the identity choice matches the homepage promise', () => {
  it('four identities, same order as the homepage steps and tiles', () => {
    expect(ROLE_CHOICES.map((c) => c.key)).toEqual(['tenant', 'landlord', 'agent', 'provider'])
    const home = read('components/home/HomeNext.tsx')
    expect(home).toContain('租客 / 房东 / 经纪 / 服务商')
    expect(home).toContain('选身份，给助手起个名字')
    expect(ROLE_CHOICES.find((c) => c.key === 'provider')?.pilot).toBe(true)
  })
  it('every blurb names only what ships', () => {
    const banned = ['佣金', '在线收租', '路线', '保险', '短信', '评分', 'Plaid', 'Persona', '即将', 'coming soon', '%']
    for (const c of ROLE_CHOICES) {
      const s = [c.blurb.zh, c.blurb.en, c.lands.zh, c.lands.en].join(' ')
      for (const w of banned) expect(s, `${c.key} · ${w}`).not.toContain(w)
      expect(c.blurb.zh.length).toBeGreaterThan(10)
      expect(c.blurb.en.length).toBeGreaterThan(10)
    }
    expect(isAgentRole('provider')).toBe(false)
    expect(isOnboardingRole('provider')).toBe(true)
    expect(isOnboardingRole('admin')).toBe(false)
  })
})

describe('/onboarding/name asks only when nothing chose for the visitor', () => {
  it('resolves ?role= → this tab’s earlier pick → none (chooser); no silent tenant default', () => {
    expect(page).toContain('<RoleChooser zh={zh} onPick={pick} />')
    expect(page).toContain('const role: AgentRole | null = picked ?? (cleared ? null : fromParam ?? fromStored)')
    expect(page).toContain("const fromParam: AgentRole | null = isAgentRole(roleParam) ? roleParam : null")
    expect(page).not.toMatch(/\?\s*storedRole\s*:\s*'tenant'/) // the old fallback
    expect(page).toContain('if (!role) {')
  })
  it('provider → onboarding form; the naming step can reopen the chooser', () => {
    expect(PROVIDER_ONBOARD).toBe('/provider/onboard')
    expect(page).toMatch(/if \(r === 'provider'\) \{[\s\S]*?router\.push\(PROVIDER_ONBOARD\)/)
    expect(page).toContain('data-testid="change-role"')
    expect(page).toMatch(/const changeRole = \(\) => \{[\s\S]*?sessionStorage\.removeItem\(ONBOARDING_ROLE_KEY\)[\s\S]*?setPicked\(null\)[\s\S]*?setCleared\(true\)/)
  })
  it('keeps the explicit landlord opt-in (claim_landlord → screening) and the agent RECO landing', () => {
    expect(page).toMatch(/role === 'landlord' && signedIn\) \{\s*void Promise\.resolve\(supabase\.rpc\('claim_landlord'\)\)/)
    expect(page).toContain("agent: '/agent/verify'")
    // the onboarded check still uses the remembered hat when no identity is being onboarded
    expect(page).toContain("useOnboarded(role ?? rememberedRole ?? 'tenant')")
  })
  it('the naming copy promises only what ships and speaks of one assistant', () => {
    for (const w of ['佣金拆分', '8 Engine', '看房 Live', '她会', 'Persona', 'Plaid', '调性格', 'Commission splits']) expect(page, w).not.toContain(w)
    expect(page).toContain('唯一的助理')
    // two stage steps: choose, then name
    expect(page).toContain('<OnboardingStage step={1} totalSteps={2}')
    expect(page).toMatch(/<OnboardingStage\s+step=\{2\}\s+totalSteps=\{2\}/)
  })
})

describe('RoleChooser (react-test-renderer)', () => {
  it('renders the four tiles in order and reports the clicked identity', () => {
    const onPick = vi.fn()
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(React.createElement(RoleChooser, { zh: true, onPick })) })
    const tiles = r.root.findAll((n) => n.type === 'button' && typeof n.props['data-role'] === 'string')
    expect(tiles.map((t) => t.props['data-role'])).toEqual(['tenant', 'landlord', 'agent', 'provider'])
    for (const t of tiles) act(() => { t.props.onClick() })
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(['tenant', 'landlord', 'agent', 'provider'])
    const text = JSON.stringify(r.toJSON())
    for (const w of ['租客', '房东', '经纪', '服务商', '试点']) expect(text).toContain(w)
  })
  it('english copy renders too', () => {
    let r!: TestRenderer.ReactTestRenderer
    act(() => { r = TestRenderer.create(React.createElement(RoleChooser, { zh: false, onPick: () => {} })) })
    const text = JSON.stringify(r.toJSON())
    for (const w of ['Tenant', 'Landlord', 'Agent', 'Provider', 'PILOT']) expect(text).toContain(w)
  })
})

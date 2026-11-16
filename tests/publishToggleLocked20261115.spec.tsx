// @vitest-environment jsdom
// 2026-11-15 · user: 「这个公开我的主页不能点击」. The account's RECO registration was still pending, so
// the publish box was locked by design — but the only explanation was a notice further up, and
// the label beside the greyed box looked like a live control. The reason now sits on the control.
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { only, textOf } from './helpers/dom'

const row = { public_profile: false, profile_slug: 'pat-example', bio: null, languages: ['zh'], service_areas: [], focus: [], show_activity: false, photo_key: null }
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }) },
}))
vi.mock('@/components/agent/AgentPhotoControl', () => ({ default: () => React.createElement('div', { 'data-testid': 'photo' }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))

import PublicProfileEditor from '../components/agent/PublicProfileEditor'

afterEach(cleanup)

async function mount(status: 'pending' | 'verified' | 'renewal_due' | 'rejected', lang: 'zh' | 'en' = 'zh') {
  const { container } = render(<PublicProfileEditor authId="00000000-0000-4000-8000-000000000001" legalName="Pat Example" status={status} lang={lang} />)
  await waitFor(() => only(container, '[data-testid="agent-public-profile-toggle"]'))
  return container
}

describe('the publish checkbox on /agent/verify', () => {
  it('pending registration: locked, and the control itself says why', async () => {
    const c = await mount('pending')
    const box = only<HTMLInputElement>(c, '[data-testid="agent-public-profile-toggle"]')
    expect(box.disabled).toBe(true)
    expect(box.checked).toBe(false)
    expect(box.closest('label')!.className).toContain('cursor-not-allowed')
    expect(textOf(only(c, '[data-testid="agent-public-profile-toggle-why"]'))).toBe('（现在还不能勾选：等 RECO 核验通过）')
    only(c, '[data-testid="agent-public-profile-locked"]')
  })

  it('rejected is locked too; the English hint has no Chinese in it', async () => {
    const c = await mount('rejected', 'en')
    expect(only<HTMLInputElement>(c, '[data-testid="agent-public-profile-toggle"]').disabled).toBe(true)
    const why = textOf(only(c, '[data-testid="agent-public-profile-toggle-why"]'))
    expect(why).toBe('(Not available yet — waiting for RECO verification)')
    expect(/[一-鿿]/.test(why)).toBe(false)
  })

  it('verified or renewal-due: the box works and there is no hint', async () => {
    for (const s of ['verified', 'renewal_due'] as const) {
      const c = await mount(s)
      const box = only<HTMLInputElement>(c, '[data-testid="agent-public-profile-toggle"]')
      expect(box.disabled).toBe(false)
      expect(box.closest('label')!.className).not.toContain('cursor-not-allowed')
      expect(c.querySelector('[data-testid="agent-public-profile-toggle-why"]')).toBeNull()
      expect(c.querySelector('[data-testid="agent-public-profile-locked"]')).toBeNull()
      box.click()
      expect(box.checked).toBe(true)
      cleanup()
    }
  })
})

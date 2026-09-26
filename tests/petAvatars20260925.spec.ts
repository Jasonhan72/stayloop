// Twenty cute cartoon pets replace the glossy shapes as the assistant's face
// (user 2026-09-25, after Muse's plush creature), and the name under the avatar
// is set like Muse's: plain, medium weight, larger. Each pet is rendered for
// real with react-test-renderer — an SVG face on a coloured disc.
import { describe, expect, it } from 'vitest'
import React from 'react'
import TestRenderer from 'react-test-renderer'
import { readFileSync } from 'node:fs'
import { AVATAR_PRESETS, AssistantAvatar, DEFAULT_ASSISTANT_AVATAR, LEGACY_AVATARS, isAvatarPreset, resolveAvatarKey } from '@/lib/agent/avatars'

const read = (p: string) => readFileSync(p, 'utf8')

describe('pet avatars', () => {
  it('twenty distinct pets, each with a bilingual name; the default is one of them', () => {
    expect(AVATAR_PRESETS).toHaveLength(20)
    expect(new Set(AVATAR_PRESETS.map((p) => p.key)).size).toBe(20)
    for (const p of AVATAR_PRESETS) {
      expect(p.zh, p.key).toMatch(/\S/)
      expect(p.en, p.key).toMatch(/\S/)
    }
    expect(isAvatarPreset(DEFAULT_ASSISTANT_AVATAR)).toBe(true)
  })
  it('every pet renders as an SVG face on a disc — at least the disc, two eyes and their highlights', () => {
    for (const p of AVATAR_PRESETS) {
      const r = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: p.key, role: 'tenant' }))
      const svg = r.root.findByType('svg')
      expect(svg.props['data-avatar'], p.key).toBe(p.key)
      expect(svg.props.viewBox).toBe('0 0 100 100')
      expect(r.root.findAllByType('circle').length, p.key).toBeGreaterThanOrEqual(5)
      r.unmount()
    }
  })
  it('the eleven shapes saved before map onto pets (code and DB); unknown keys fall back to the role orb, or the default pet for a signed-in account', () => {
    const old = ['sphere-violet', 'sphere-blue', 'sphere-mint', 'sphere-sunset', 'sphere-rose', 'cube', 'ring', 'gem', 'pill', 'blob', 'star']
    for (const k of old) {
      expect(LEGACY_AVATARS[k], k).toBeDefined()
      expect(isAvatarPreset(resolveAvatarKey(k)), k).toBe(true)
    }
    expect(resolveAvatarKey('nope')).toBeNull()
    expect(resolveAvatarKey(null)).toBeNull()
    const orb = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: 'nope', role: 'landlord' }))
    expect(orb.root.findAllByType('svg')).toHaveLength(0)
    const brand = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: 'nope', role: 'landlord', fallback: 'brand' }))
    expect(brand.root.findByType('svg').props['data-avatar']).toBe(DEFAULT_ASSISTANT_AVATAR)
    const legacy = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: 'ring', role: 'landlord' }))
    expect(legacy.root.findByType('svg').props['data-avatar']).toBe('panda')
    const sql = read('supabase/migrations/20260925_avatar_pets.sql')
    for (const k of old) expect(sql, k).toContain(`when '${k}' then '${LEGACY_AVATARS[k]}'`)
  })
  it('the name under the avatar is plain, medium weight and larger — no pill; the picker shows five pets to a row', () => {
    const panel = read('components/agent/AssistantPanel.tsx')
    expect(panel).toContain('mt-3 text-[26px] font-medium leading-tight tracking-tight text-ink')
    expect(panel).toContain('grid grid-cols-5 gap-1.5')
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain('max-w-full truncate text-[17px] font-medium leading-tight tracking-tight text-ink md:text-[19px]')
    expect(chat).not.toContain('rounded-full border border-line-divider bg-white px-3 py-[2px] text-[13px] font-bold')
    expect(read('components/agent/AssistantSettings.tsx')).toContain('text-[19px] font-medium tracking-tight text-ink')
  })
})

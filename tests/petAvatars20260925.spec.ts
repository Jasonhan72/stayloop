// Twenty plush-toy pets replace the glossy shapes as the assistant's face (user
// 2026-09-25, after Muse's fluffy creature: "3D 的头像，毛绒玩具的样子"), joined the
// same evening by twenty young people in different 3D styles ("再做 10 个男，10
// 个女的卡通头像"); the name under the avatar is set like Muse's: plain, medium
// weight, larger. Each preset is a generated render shipped under
// public/avatars/{pets,people} and rendered for real with react-test-renderer:
// an <img> on a pastel disc.
import { describe, expect, it } from 'vitest'
import React from 'react'
import TestRenderer from 'react-test-renderer'
import { readFileSync, statSync } from 'node:fs'
import { AVATAR_PRESETS, AssistantAvatar, DEFAULT_ASSISTANT_AVATAR, LEGACY_AVATARS, avatarImageSrc, isAvatarPreset, resolveAvatarKey } from '@/lib/agent/avatars'

const read = (p: string) => readFileSync(p, 'utf8')

describe('pet avatars', () => {
  it('twenty pets + twenty young people (ten men, ten women), each with a bilingual name and a disc colour; the default is a pet', () => {
    expect(AVATAR_PRESETS).toHaveLength(40)
    expect(new Set(AVATAR_PRESETS.map((p) => p.key)).size).toBe(40)
    expect(AVATAR_PRESETS.filter((p) => p.group === 'pet')).toHaveLength(20)
    const people = AVATAR_PRESETS.filter((p) => p.group === 'person')
    expect(people).toHaveLength(20)
    expect(people.filter((p) => p.key.startsWith('m-'))).toHaveLength(10)
    expect(people.filter((p) => p.key.startsWith('f-'))).toHaveLength(10)
    for (const p of AVATAR_PRESETS) {
      expect(p.zh, p.key).toMatch(/\S/)
      expect(p.en, p.key).toMatch(/\S/)
      expect(p.disc, p.key).toMatch(/^#[0-9A-F]{6}$/i)
    }
    expect(isAvatarPreset(DEFAULT_ASSISTANT_AVATAR)).toBe(true)
    expect(AVATAR_PRESETS.find((p) => p.key === DEFAULT_ASSISTANT_AVATAR)?.group).toBe('pet')
    expect(avatarImageSrc('bunny')).toBe('/avatars/pets/bunny.webp')
    expect(avatarImageSrc('f-mia')).toBe('/avatars/people/f-mia.webp')
    // the picker shows both groups, labelled
    expect(read('components/agent/AssistantPanel.tsx')).toContain('{AVATAR_GROUPS.map((g) => (')
    expect(read('components/agent/AssistantPanel.tsx')).toContain("{AVATAR_PRESETS.filter((p) => p.group === g.key).map((p) => (")
  })
  it('every preset ships as a WebP render under public/avatars/{pets,people} (≤ 160 KB) and renders as an <img> on its disc', () => {
    for (const p of AVATAR_PRESETS) {
      const file = `public${avatarImageSrc(p.key)}`
      const size = statSync(file).size
      expect(size, file).toBeGreaterThan(5_000)
      expect(size, file).toBeLessThanOrEqual(160_000)
      const r = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: p.key, role: 'tenant' }))
      const disc = r.root.findByType('span')
      expect(disc.props['data-avatar'], p.key).toBe(p.key)
      expect(disc.props.style.background).toBe(p.disc)
      expect(r.root.findByType('img').props.src).toBe(avatarImageSrc(p.key))
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
    expect(orb.root.findAllByType('img')).toHaveLength(0)
    const brand = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: 'nope', role: 'landlord', fallback: 'brand' }))
    expect(brand.root.findByType('span').props['data-avatar']).toBe(DEFAULT_ASSISTANT_AVATAR)
    const legacy = TestRenderer.create(React.createElement(AssistantAvatar, { avatar: 'ring', role: 'landlord' }))
    expect(legacy.root.findByType('span').props['data-avatar']).toBe('panda')
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

'use client'

// The assistant's face: twenty plush-toy pets (user 2026-09-25, after Muse's
// fluffy creature: "设计 20 个类似的可爱卡通宠物的形象的头像…要做成 3D 的头像，毛绒
// 玩具的样子的"). Each is a generated 3D render — soft fur, bead eyes, blush,
// front-facing bust on a transparent background — stored as a 512px WebP under
// public/avatars/pets/<key>.webp and shown on a pastel disc, so it reads from
// the 28px message orb to the 72px panel avatar. The choice is stored on
// assistant_profiles.avatar (cross-device) and mirrored in localStorage for the
// first paint. The eleven glossy shapes that came before (spheres, cube, ring,
// gem, capsule, blob, star) map onto pets (LEGACY) so no saved choice goes
// blank; `null` / unknown keys fall back to the role's gradient orb for the demo
// personas, or to the default pet for a signed-in account.
import type { CSSProperties } from 'react'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole } from './types'

export type AvatarGroup = 'pet' | 'person'
export type AvatarPreset = { key: string; zh: string; en: string; disc: string; group: AvatarGroup }

/** Twenty plush-toy pets (2026-09-25). */
const PETS: Omit<AvatarPreset, 'group'>[] = [

  { key: 'bunny', zh: '兔子', en: 'Bunny', disc: '#EEF3FF' },
  { key: 'cat', zh: '小猫', en: 'Cat', disc: '#FFE6D2' },
  { key: 'dog', zh: '小狗', en: 'Puppy', disc: '#E6F0FF' },
  { key: 'bear', zh: '小熊', en: 'Bear', disc: '#FFF0DC' },
  { key: 'panda', zh: '熊猫', en: 'Panda', disc: '#F0F4F8' },
  { key: 'fox', zh: '狐狸', en: 'Fox', disc: '#FFE9DC' },
  { key: 'koala', zh: '考拉', en: 'Koala', disc: '#E8F4EF' },
  { key: 'penguin', zh: '企鹅', en: 'Penguin', disc: '#E4ECFA' },
  { key: 'owl', zh: '猫头鹰', en: 'Owl', disc: '#F3EBDD' },
  { key: 'frog', zh: '青蛙', en: 'Frog', disc: '#E6F7E9' },
  { key: 'hamster', zh: '仓鼠', en: 'Hamster', disc: '#FFF3D6' },
  { key: 'pig', zh: '小猪', en: 'Piglet', disc: '#FFE4EC' },
  { key: 'cow', zh: '奶牛', en: 'Cow', disc: '#F1F4F1' },
  { key: 'chick', zh: '小鸡', en: 'Chick', disc: '#FFF6CC' },
  { key: 'sheep', zh: '绵羊', en: 'Sheep', disc: '#F3F1EC' },
  { key: 'tiger', zh: '老虎', en: 'Tiger', disc: '#FFE7CF' },
  { key: 'lion', zh: '狮子', en: 'Lion', disc: '#FFF0D2' },
  { key: 'monkey', zh: '猴子', en: 'Monkey', disc: '#F0E6DD' },
  { key: 'seal', zh: '海豹', en: 'Seal', disc: '#E3EEF8' },
  { key: 'mouse', zh: '老鼠', en: 'Mouse', disc: '#EEF0F3' },
]

/** Twenty young people — ten men, ten women, each in a different 3D style (user 2026-09-25 evening:
 *  "再做 10 个男，10 个女的卡通头像，年轻人的，不同风格，也是 3D 的"). */
const PEOPLE: Omit<AvatarPreset, 'group'>[] = [
  { key: 'm-ace', zh: '阿哲', en: 'Ace', disc: '#E6F0FF' },
  { key: 'm-leo', zh: '里奥', en: 'Leo', disc: '#FFF0DC' },
  { key: 'm-kai', zh: '凯', en: 'Kai', disc: '#E4ECFA' },
  { key: 'm-noah', zh: '诺亚', en: 'Noah', disc: '#E6F7E9' },
  { key: 'm-sam', zh: '小森', en: 'Sam', disc: '#F3F1EC' },
  { key: 'm-jay', zh: '杰', en: 'Jay', disc: '#FFF6CC' },
  { key: 'm-milo', zh: '米洛', en: 'Milo', disc: '#FFE9DC' },
  { key: 'm-ryan', zh: '瑞恩', en: 'Ryan', disc: '#E8F4EF' },
  { key: 'm-omar', zh: '奥马尔', en: 'Omar', disc: '#EEF3FF' },
  { key: 'm-eli', zh: '伊莱', en: 'Eli', disc: '#F0E6DD' },
  { key: 'f-mia', zh: '米娅', en: 'Mia', disc: '#FFE4EC' },
  { key: 'f-luna', zh: '露娜', en: 'Luna', disc: '#FFF3D6' },
  { key: 'f-yuki', zh: '小雪', en: 'Yuki', disc: '#F0EAFF' },
  { key: 'f-zoe', zh: '佐伊', en: 'Zoe', disc: '#E6F7E9' },
  { key: 'f-nina', zh: '妮娜', en: 'Nina', disc: '#FFE6D2' },
  { key: 'f-ava', zh: '艾娃', en: 'Ava', disc: '#FFF6CC' },
  { key: 'f-rin', zh: '小凛', en: 'Rin', disc: '#FFE4EC' },
  { key: 'f-jade', zh: '洁德', en: 'Jade', disc: '#E3EEF8' },
  { key: 'f-lily', zh: '莉莉', en: 'Lily', disc: '#FBE9F1' },
  { key: 'f-emma', zh: '艾玛', en: 'Emma', disc: '#EEF0F3' },
]

export const AVATAR_PRESETS: AvatarPreset[] = [
  ...PETS.map((p) => ({ ...p, group: 'pet' as const })),
  ...PEOPLE.map((p) => ({ ...p, group: 'person' as const })),
]
export const AVATAR_GROUPS: { key: AvatarGroup; zh: string; en: string }[] = [
  { key: 'pet', zh: '宠物', en: 'Pets' },
  { key: 'person', zh: '人物', en: 'People' },
]

/** Pre-pet keys (2026-09-25 morning) → the pet a saved choice becomes. */
export const LEGACY_AVATARS: Record<string, string> = {
  'sphere-violet': 'bunny',
  'sphere-blue': 'seal',
  'sphere-mint': 'frog',
  'sphere-sunset': 'fox',
  'sphere-rose': 'pig',
  cube: 'bear',
  ring: 'panda',
  gem: 'cat',
  pill: 'hamster',
  blob: 'penguin',
  star: 'chick',
}

export function isAvatarPreset(key: string | null | undefined): key is string {
  return !!key && AVATAR_PRESETS.some((p) => p.key === key)
}

/** A preset key as stored anywhere (current or legacy) → the pet to show, or null. */
export function resolveAvatarKey(key: string | null | undefined): string | null {
  if (!key) return null
  if (isAvatarPreset(key)) return key
  return LEGACY_AVATARS[key] ?? null
}

/** Where a preset's render lives: public/avatars/pets or public/avatars/people. */
export function avatarImageSrc(key: string): string {
  const group = AVATAR_PRESETS.find((p) => p.key === key)?.group ?? 'pet'
  return `/avatars/${group === 'person' ? 'people' : 'pets'}/${key}.webp`
}

// One assistant per account (2026-09-25): one stored choice, not one per hat.
const STORE_KEY = 'sl-avatar'
/** The personal assistant's face when no preset is chosen; the role orbs stay for the demo personas. */
export const DEFAULT_ASSISTANT_AVATAR = 'bunny'
export function getStoredAvatar(): string | null {
  try {
    const v = localStorage.getItem(STORE_KEY)
    return resolveAvatarKey(v) ?? (v === 'default' ? 'default' : null)
  } catch { return null }
}
/** Sign-out: the cached face belongs to the account that just left (2026-09-26). */
export function clearStoredAvatar(): void {
  try { localStorage.removeItem(STORE_KEY) } catch { /* private mode */ }
}
export function setStoredAvatar(key: string | null): void {
  try { if (key) localStorage.setItem(STORE_KEY, key); else localStorage.removeItem(STORE_KEY) } catch { /* private mode */ }
}

/** Renders the chosen pet on its disc (or the role orb) inside a circle; size comes from className. */
export function AssistantAvatar({ avatar, role, className = '', style, fallback = 'role' }: { avatar?: string | null; role: AgentRole; className?: string; style?: CSSProperties; fallback?: 'role' | 'brand' }) {
  // 'brand' = the signed-in user's one assistant (same face under every hat); 'role' = a demo persona's orb.
  const key = resolveAvatarKey(avatar) ?? (fallback === 'brand' ? DEFAULT_ASSISTANT_AVATAR : null)
  const pet = key ? AVATAR_PRESETS.find((p) => p.key === key) : undefined
  if (!pet) {
    return <span aria-hidden className={`inline-block rounded-full ${className}`} style={{ background: ROLE_THEME[role].avatarGradient, ...style }} />
  }
  return (
    <span aria-hidden data-avatar={pet.key} className={`relative inline-block overflow-hidden rounded-full align-middle ${className}`} style={{ background: pet.disc, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarImageSrc(pet.key)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain p-[3%]" />
    </span>
  )
}

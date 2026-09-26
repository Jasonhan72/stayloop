'use client'

// The assistant's face: twenty cute cartoon pets drawn in code (user
// 2026-09-25, after Muse's plush creature: "设计 20 个类似的可爱卡通宠物的形象
// 的头像给用户选择，替换掉现在的这些选项"). Each is a flat kawaii head — round
// face, dot eyes with a highlight, blush, a small mouth — on a pastel disc, so
// it reads from the 28px message orb to the 72px panel avatar without any
// image files. The choice is stored on assistant_profiles.avatar (cross-device)
// and mirrored in localStorage for the first paint. The eleven glossy shapes
// that came before (spheres, cube, ring, gem, capsule, blob, star) map onto
// pets (LEGACY) so no saved choice goes blank; `null` / unknown keys fall back
// to the role's gradient orb for the demo personas, or to the default pet for
// a signed-in account.
import type { CSSProperties, ReactNode } from 'react'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole } from './types'

export type AvatarPreset = { key: string; zh: string; en: string }

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: 'bunny', zh: '兔子', en: 'Bunny' },
  { key: 'cat', zh: '小猫', en: 'Cat' },
  { key: 'dog', zh: '小狗', en: 'Puppy' },
  { key: 'bear', zh: '小熊', en: 'Bear' },
  { key: 'panda', zh: '熊猫', en: 'Panda' },
  { key: 'fox', zh: '狐狸', en: 'Fox' },
  { key: 'koala', zh: '考拉', en: 'Koala' },
  { key: 'penguin', zh: '企鹅', en: 'Penguin' },
  { key: 'owl', zh: '猫头鹰', en: 'Owl' },
  { key: 'frog', zh: '青蛙', en: 'Frog' },
  { key: 'hamster', zh: '仓鼠', en: 'Hamster' },
  { key: 'pig', zh: '小猪', en: 'Piglet' },
  { key: 'cow', zh: '奶牛', en: 'Cow' },
  { key: 'chick', zh: '小鸡', en: 'Chick' },
  { key: 'sheep', zh: '绵羊', en: 'Sheep' },
  { key: 'tiger', zh: '老虎', en: 'Tiger' },
  { key: 'lion', zh: '狮子', en: 'Lion' },
  { key: 'monkey', zh: '猴子', en: 'Monkey' },
  { key: 'seal', zh: '海豹', en: 'Seal' },
  { key: 'mouse', zh: '老鼠', en: 'Mouse' },
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

/** A preset key as stored anywhere (current or legacy) → the pet to draw, or null. */
export function resolveAvatarKey(key: string | null | undefined): string | null {
  if (!key) return null
  if (isAvatarPreset(key)) return key
  return LEGACY_AVATARS[key] ?? null
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
export function setStoredAvatar(key: string | null): void {
  try { if (key) localStorage.setItem(STORE_KEY, key); else localStorage.removeItem(STORE_KEY) } catch { /* private mode */ }
}

/* ---------- drawing kit (viewBox 0 0 100 100) ---------- */
const INK = '#2B2B2B'
const S = { fill: 'none', stroke: INK, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function Eyes({ y = 52, dx = 10, r = 3.3 }: { y?: number; dx?: number; r?: number }) {
  return (
    <>
      <circle cx={50 - dx} cy={y} r={r} fill={INK} />
      <circle cx={50 + dx} cy={y} r={r} fill={INK} />
      <circle cx={50 - dx - r * 0.35} cy={y - r * 0.35} r={r * 0.34} fill="#fff" />
      <circle cx={50 + dx - r * 0.35} cy={y - r * 0.35} r={r * 0.34} fill="#fff" />
    </>
  )
}
function Blush({ y = 59, dx = 18, rx = 5, ry = 3 }: { y?: number; dx?: number; rx?: number; ry?: number }) {
  return (
    <>
      <ellipse cx={50 - dx} cy={y} rx={rx} ry={ry} fill="#F48FA0" opacity="0.55" />
      <ellipse cx={50 + dx} cy={y} rx={rx} ry={ry} fill="#F48FA0" opacity="0.55" />
    </>
  )
}
function Smile({ y = 62, w = 4 }: { y?: number; w?: number }) {
  return <path d={`M${50 - w} ${y} q${w} ${w * 0.9} ${2 * w} 0`} {...S} />
}
function CatMouth({ y = 61 }: { y?: number }) {
  return <path d={`M46 ${y} q2 2.6 4 0 q2 2.6 4 0`} {...S} />
}
function NoseTri({ y = 59, color = INK }: { y?: number; color?: string }) {
  return <polygon points={`${47.4},${y} ${52.6},${y} 50,${y + 3.2}`} fill={color} />
}
function Shine({ cx = 39, cy = 40, rx = 9, ry = 5 }: { cx?: number; cy?: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity="0.28" />
}
function Whiskers({ y = 60, color = INK }: { y?: number; color?: string }) {
  return (
    <g stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6">
      <path d={`M26 ${y - 2} l10 -1 M26 ${y + 3} l10 -1 M74 ${y - 2} l-10 -1 M74 ${y + 3} l-10 -1`} />
    </g>
  )
}

/* ---------- the twenty pets: [disc colour, drawing] ---------- */
const PETS: Record<string, [string, () => ReactNode]> = {
  bunny: ['#EEF3FF', () => (
    <>
      <ellipse cx="38" cy="27" rx="7" ry="17" fill="#F7F3EE" />
      <ellipse cx="38" cy="28" rx="3.4" ry="12" fill="#F9C1CF" />
      <ellipse cx="62" cy="27" rx="7" ry="17" fill="#F7F3EE" />
      <ellipse cx="62" cy="28" rx="3.4" ry="12" fill="#F9C1CF" />
      <circle cx="50" cy="56" r="28" fill="#F7F3EE" />
      <Shine cx={40} cy={43} />
      <Eyes y={54} dx={10} />
      <Blush y={61} dx={18} />
      <ellipse cx="50" cy="60.5" rx="2.2" ry="1.6" fill="#F48FA0" />
      <Smile y={63} w={3} />
    </>
  )],
  cat: ['#FFE6D2', () => (
    <>
      <polygon points="25,42 31,16 47,33" fill="#F4C58C" />
      <polygon points="30,38 33,24 42,33" fill="#F9B4C1" />
      <polygon points="75,42 69,16 53,33" fill="#F4C58C" />
      <polygon points="70,38 67,24 58,33" fill="#F9B4C1" />
      <circle cx="50" cy="55" r="28" fill="#F4C58C" />
      <path d="M45 34 v6 M50 32 v7 M55 34 v6" stroke="#D98A3A" strokeWidth="2.2" strokeLinecap="round" />
      <Shine cx={39} cy={42} />
      <Eyes y={53} dx={11} />
      <Blush y={60} dx={19} />
      <NoseTri y={58.5} color="#E88A9A" />
      <CatMouth y={62} />
      <Whiskers y={60} />
    </>
  )],
  dog: ['#E6F0FF', () => (
    <>
      <ellipse cx="25" cy="52" rx="8.5" ry="18" fill="#A9702F" />
      <ellipse cx="75" cy="52" rx="8.5" ry="18" fill="#A9702F" />
      <circle cx="50" cy="55" r="28" fill="#D9A066" />
      <ellipse cx="50" cy="67" rx="12" ry="9" fill="#F2D9B8" />
      <Shine cx={39} cy={42} />
      <Eyes y={52} dx={10} />
      <ellipse cx="50" cy="62.5" rx="4" ry="3" fill={INK} />
      <Smile y={67} w={3} />
      <Blush y={60} dx={19} />
    </>
  )],
  bear: ['#FFF0DC', () => (
    <>
      <circle cx="29" cy="33" r="9.5" fill="#A9754A" />
      <circle cx="29" cy="33" r="4.5" fill="#E3B48E" />
      <circle cx="71" cy="33" r="9.5" fill="#A9754A" />
      <circle cx="71" cy="33" r="4.5" fill="#E3B48E" />
      <circle cx="50" cy="55" r="28" fill="#B9834F" />
      <ellipse cx="50" cy="66" rx="11" ry="8" fill="#E3B48E" />
      <Shine cx={39} cy={42} />
      <Eyes y={52} dx={10} />
      <ellipse cx="50" cy="62" rx="3.8" ry="2.8" fill={INK} />
      <Smile y={67} w={3} />
      <Blush y={60} dx={19} />
    </>
  )],
  panda: ['#F0F4F8', () => (
    <>
      <circle cx="29" cy="33" r="9.5" fill={INK} />
      <circle cx="71" cy="33" r="9.5" fill={INK} />
      <circle cx="50" cy="55" r="28" fill="#FAFAFA" />
      <ellipse cx="39" cy="53" rx="7.5" ry="9" fill={INK} />
      <ellipse cx="61" cy="53" rx="7.5" ry="9" fill={INK} />
      <circle cx="40" cy="54" r="3" fill="#fff" />
      <circle cx="60" cy="54" r="3" fill="#fff" />
      <circle cx="40.5" cy="54.5" r="1.6" fill={INK} />
      <circle cx="60.5" cy="54.5" r="1.6" fill={INK} />
      <ellipse cx="50" cy="64" rx="3.6" ry="2.6" fill={INK} />
      <Smile y={68} w={3} />
      <Blush y={63} dx={20} />
    </>
  )],
  fox: ['#FFE9DC', () => (
    <>
      <polygon points="25,45 29,14 48,34" fill="#F08A3E" />
      <polygon points="30,41 32,22 44,33" fill="#FFF1E6" />
      <polygon points="75,45 71,14 52,34" fill="#F08A3E" />
      <polygon points="70,41 68,22 56,33" fill="#FFF1E6" />
      <circle cx="50" cy="55" r="28" fill="#F08A3E" />
      <ellipse cx="50" cy="69" rx="20" ry="13" fill="#FFF6EE" />
      <Shine cx={39} cy={42} />
      <Eyes y={52} dx={11} />
      <NoseTri y={60} />
      <Smile y={65} w={3} />
      <Blush y={59} dx={20} />
    </>
  )],
  koala: ['#E8F4EF', () => (
    <>
      <circle cx="24" cy="46" r="14" fill="#9AA3AD" />
      <circle cx="24" cy="46" r="8" fill="#D9C3CF" />
      <circle cx="76" cy="46" r="14" fill="#9AA3AD" />
      <circle cx="76" cy="46" r="8" fill="#D9C3CF" />
      <circle cx="50" cy="55" r="28" fill="#B4BCC4" />
      <Shine cx={39} cy={42} />
      <Eyes y={50} dx={11} />
      <ellipse cx="50" cy="62" rx="6" ry="8" fill={INK} />
      <Smile y={73} w={3} />
      <Blush y={59} dx={20} />
    </>
  )],
  penguin: ['#E4ECFA', () => (
    <>
      <ellipse cx="50" cy="60" rx="30" ry="34" fill="#2B3A55" />
      <ellipse cx="50" cy="79" rx="16" ry="13" fill="#FFFFFF" />
      <ellipse cx="50" cy="54" rx="19" ry="16" fill="#FFFFFF" />
      <Eyes y={52} dx={8} />
      <polygon points="45,58.5 55,58.5 50,64.5" fill="#F5A623" />
      <Blush y={60} dx={15} rx={4} ry={2.5} />
    </>
  )],
  owl: ['#F3EBDD', () => (
    <>
      <polygon points="28,40 32,18 45,34" fill="#8E5E3C" />
      <polygon points="72,40 68,18 55,34" fill="#8E5E3C" />
      <circle cx="50" cy="55" r="28" fill="#A8734A" />
      <circle cx="38" cy="52" r="10" fill="#F5E6D0" />
      <circle cx="62" cy="52" r="10" fill="#F5E6D0" />
      <Eyes y={52} dx={12} r={4.5} />
      <polygon points="47,60 53,60 50,66.5" fill="#F5A623" />
      <path d="M40 70 q5 4 10 0 M50 70 q5 4 10 0" stroke="#F5E6D0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </>
  )],
  frog: ['#E6F7E9', () => (
    <>
      <circle cx="36" cy="35" r="9.5" fill="#6CC07A" />
      <circle cx="64" cy="35" r="9.5" fill="#6CC07A" />
      <ellipse cx="50" cy="58" rx="30" ry="26" fill="#6CC07A" />
      <Shine cx={38} cy={48} />
      <circle cx="36" cy="35" r="5.5" fill="#fff" />
      <circle cx="64" cy="35" r="5.5" fill="#fff" />
      <circle cx="36.5" cy="35.5" r="3" fill={INK} />
      <circle cx="64.5" cy="35.5" r="3" fill={INK} />
      <circle cx="35.5" cy="34.5" r="1" fill="#fff" />
      <circle cx="63.5" cy="34.5" r="1" fill="#fff" />
      <circle cx="46" cy="55" r="1.1" fill={INK} />
      <circle cx="54" cy="55" r="1.1" fill={INK} />
      <path d="M36 62 q14 12 28 0" {...S} />
      <Blush y={63} dx={20} />
    </>
  )],
  hamster: ['#FFF3D6', () => (
    <>
      <circle cx="31" cy="34" r="7.5" fill="#E7B36A" />
      <circle cx="31" cy="34" r="3.6" fill="#F7D9B0" />
      <circle cx="69" cy="34" r="7.5" fill="#E7B36A" />
      <circle cx="69" cy="34" r="3.6" fill="#F7D9B0" />
      <circle cx="50" cy="55" r="28" fill="#F1C27E" />
      <circle cx="32" cy="63" r="9.5" fill="#FBE9CE" />
      <circle cx="68" cy="63" r="9.5" fill="#FBE9CE" />
      <Shine cx={39} cy={42} />
      <Eyes y={52} dx={10} />
      <ellipse cx="50" cy="59.5" rx="2.2" ry="1.6" fill="#F48FA0" />
      <CatMouth y={62} />
      <Blush y={64} dx={19} rx={4} ry={2.5} />
    </>
  )],
  pig: ['#FFE4EC', () => (
    <>
      <polygon points="27,44 30,25 45,35" fill="#F4A6B8" stroke="#F4A6B8" strokeWidth="4" strokeLinejoin="round" />
      <polygon points="73,44 70,25 55,35" fill="#F4A6B8" stroke="#F4A6B8" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="50" cy="55" r="28" fill="#F7B8C6" />
      <Shine cx={39} cy={42} />
      <Eyes y={52} dx={11} />
      <ellipse cx="50" cy="63.5" rx="9" ry="6.5" fill="#EF8FA6" />
      <ellipse cx="46.5" cy="63.5" rx="1.6" ry="2.1" fill="#C9506F" />
      <ellipse cx="53.5" cy="63.5" rx="1.6" ry="2.1" fill="#C9506F" />
      <Blush y={59} dx={20} />
    </>
  )],
  cow: ['#F1F4F1', () => (
    <>
      <polygon points="36,31 33,19 43,27" fill="#E6C38B" />
      <polygon points="64,31 67,19 57,27" fill="#E6C38B" />
      <ellipse cx="23" cy="49" rx="8" ry="5" fill="#F7F7F7" />
      <ellipse cx="77" cy="49" rx="8" ry="5" fill="#F7F7F7" />
      <circle cx="50" cy="55" r="28" fill="#F7F7F7" />
      <ellipse cx="36" cy="40" rx="9" ry="7" fill={INK} opacity="0.9" />
      <ellipse cx="67" cy="61" rx="6" ry="5" fill={INK} opacity="0.9" />
      <Eyes y={53} dx={11} />
      <ellipse cx="50" cy="67" rx="12" ry="7.5" fill="#F5B7C4" />
      <ellipse cx="46" cy="67" rx="1.6" ry="2" fill="#C9506F" />
      <ellipse cx="54" cy="67" rx="1.6" ry="2" fill="#C9506F" />
    </>
  )],
  chick: ['#FFF6CC', () => (
    <>
      <g fill="#F7C948">
        <circle cx="44.5" cy="27" r="4" /><circle cx="50" cy="23.5" r="4.6" /><circle cx="55.5" cy="27" r="4" />
      </g>
      <circle cx="50" cy="55" r="28" fill="#FFD54A" />
      <Shine cx={39} cy={42} />
      <Eyes y={53} dx={10} />
      <polygon points="45,59 55,59 50,65" fill="#F5A623" />
      <Blush y={60} dx={18} />
    </>
  )],
  sheep: ['#F3F1EC', () => (
    <>
      <g fill="#FBFAF7">
        <circle cx="34" cy="36" r="10" /><circle cx="50" cy="30" r="10" /><circle cx="66" cy="36" r="10" />
        <circle cx="28" cy="52" r="10" /><circle cx="72" cy="52" r="10" />
        <circle cx="36" cy="70" r="10" /><circle cx="64" cy="70" r="10" /><circle cx="50" cy="74" r="10" />
        <circle cx="50" cy="52" r="20" />
      </g>
      <ellipse cx="28" cy="58" rx="8" ry="4" fill="#F1D9C4" />
      <ellipse cx="72" cy="58" rx="8" ry="4" fill="#F1D9C4" />
      <ellipse cx="50" cy="57" rx="17" ry="19" fill="#F1D9C4" />
      <Eyes y={55} dx={8} r={3} />
      <ellipse cx="50" cy="62" rx="2" ry="1.5" fill="#F48FA0" />
      <Smile y={65} w={2.5} />
      <Blush y={62} dx={12} rx={4} ry={2.4} />
    </>
  )],
  tiger: ['#FFE7CF', () => (
    <>
      <circle cx="29" cy="33" r="9.5" fill="#F39A3C" />
      <circle cx="29" cy="33" r="4.5" fill="#FDD9B5" />
      <circle cx="71" cy="33" r="9.5" fill="#F39A3C" />
      <circle cx="71" cy="33" r="4.5" fill="#FDD9B5" />
      <circle cx="50" cy="55" r="28" fill="#F39A3C" />
      <path d="M44 32 l3 8 M50 30 v8 M56 32 l-3 8 M24 52 l8 2 M24 60 l8 -1 M76 52 l-8 2 M76 60 l-8 -1" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <ellipse cx="50" cy="66" rx="11" ry="8" fill="#FFF3E6" />
      <Eyes y={52} dx={11} />
      <NoseTri y={60.5} />
      <CatMouth y={64} />
      <Blush y={59} dx={20} />
    </>
  )],
  lion: ['#FFF0D2', () => (
    <>
      <g fill="#D98A2B">
        <circle cx="50" cy="55" r="36" />
        <circle cx="83" cy="55" r="8" /><circle cx="73.3" cy="78.3" r="8" /><circle cx="50" cy="88" r="8" /><circle cx="26.7" cy="78.3" r="8" />
        <circle cx="17" cy="55" r="8" /><circle cx="26.7" cy="31.7" r="8" /><circle cx="50" cy="22" r="8" /><circle cx="73.3" cy="31.7" r="8" />
      </g>
      <circle cx="32" cy="36" r="7" fill="#F2C063" />
      <circle cx="32" cy="36" r="3.5" fill="#F8DFA8" />
      <circle cx="68" cy="36" r="7" fill="#F2C063" />
      <circle cx="68" cy="36" r="3.5" fill="#F8DFA8" />
      <circle cx="50" cy="55" r="27" fill="#F2C063" />
      <ellipse cx="50" cy="66" rx="11" ry="8" fill="#FBE8C4" />
      <Shine cx={39} cy={43} />
      <Eyes y={52} dx={11} />
      <NoseTri y={60.5} />
      <CatMouth y={64} />
      <Blush y={59} dx={20} />
    </>
  )],
  monkey: ['#F0E6DD', () => (
    <>
      <circle cx="22" cy="52" r="11" fill="#9C6B3F" />
      <circle cx="22" cy="52" r="6" fill="#E9C9A8" />
      <circle cx="78" cy="52" r="11" fill="#9C6B3F" />
      <circle cx="78" cy="52" r="6" fill="#E9C9A8" />
      <circle cx="50" cy="55" r="28" fill="#9C6B3F" />
      <g fill="#E9C9A8">
        <circle cx="40" cy="49" r="10" /><circle cx="60" cy="49" r="10" />
        <ellipse cx="50" cy="61" rx="19" ry="15" />
      </g>
      <Eyes y={52} dx={10} />
      <circle cx="47" cy="61.5" r="1.3" fill={INK} />
      <circle cx="53" cy="61.5" r="1.3" fill={INK} />
      <Smile y={66} w={4} />
      <Blush y={60} dx={19} />
    </>
  )],
  seal: ['#E3EEF8', () => (
    <>
      <ellipse cx="50" cy="56" rx="30" ry="27" fill="#C5D3E0" />
      <ellipse cx="50" cy="67" rx="12" ry="8" fill="#EAF0F6" />
      <Shine cx={38} cy={42} />
      <Eyes y={50} dx={11} r={4} />
      <ellipse cx="50" cy="62.5" rx="3.5" ry="2.6" fill={INK} />
      <g fill={INK} opacity="0.55">
        <circle cx="42" cy="66.5" r="1" /><circle cx="40" cy="70" r="1" /><circle cx="58" cy="66.5" r="1" /><circle cx="60" cy="70" r="1" />
      </g>
      <Smile y={69} w={3} />
      <Blush y={58} dx={21} />
    </>
  )],
  mouse: ['#EEF0F3', () => (
    <>
      <circle cx="26" cy="35" r="13" fill="#B8BEC8" />
      <circle cx="26" cy="35" r="8" fill="#F4C1CD" />
      <circle cx="74" cy="35" r="13" fill="#B8BEC8" />
      <circle cx="74" cy="35" r="8" fill="#F4C1CD" />
      <circle cx="50" cy="55" r="28" fill="#C9CED6" />
      <ellipse cx="50" cy="65" rx="10" ry="7" fill="#DCE0E6" />
      <Shine cx={39} cy={42} />
      <Eyes y={51} dx={10} />
      <ellipse cx="50" cy="61.5" rx="3" ry="2.2" fill="#F48FA0" />
      <Smile y={67} w={2.5} />
      <Whiskers y={65} />
      <Blush y={59} dx={19} />
    </>
  )],
}

/** Renders the chosen pet (or the role orb) inside a circle; size comes from className. */
export function AssistantAvatar({ avatar, role, className = '', style, fallback = 'role' }: { avatar?: string | null; role: AgentRole; className?: string; style?: CSSProperties; fallback?: 'role' | 'brand' }) {
  // 'brand' = the signed-in user's one assistant (same face under every hat); 'role' = a demo persona's orb.
  const key = resolveAvatarKey(avatar) ?? (fallback === 'brand' ? DEFAULT_ASSISTANT_AVATAR : null)
  const pet = key ? PETS[key] : undefined
  if (!pet) {
    return <span aria-hidden className={`inline-block rounded-full ${className}`} style={{ background: ROLE_THEME[role].avatarGradient, ...style }} />
  }
  const [disc, draw] = pet
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={`overflow-hidden rounded-full ${className}`} style={style} data-avatar={key}>
      <circle cx="50" cy="50" r="50" fill={disc} />
      {draw()}
    </svg>
  )
}

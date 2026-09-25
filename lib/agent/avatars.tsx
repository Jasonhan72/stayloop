'use client'

// The assistant's face. Presets are glossy "3D" SVG shapes (user 2026-09-25:
// "右侧边栏 avatar 可以预设一些 3D 的头像可以选择替换") drawn with radial
// shading, a specular highlight and a ground shadow — no image files, so they
// scale from the 28px message orb to the 72px panel avatar. `null` / unknown
// keys fall back to the role's gradient orb, which is what every account had
// before. The choice is stored on agent_configs.avatar (cross-device) and
// mirrored in localStorage for the first paint.
import { useId, type CSSProperties } from 'react'
import { ROLE_THEME } from '@/lib/roleTheme'
import type { AgentRole } from './types'

export type AvatarPreset = { key: string; zh: string; en: string }

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: 'sphere-violet', zh: '紫球', en: 'Violet sphere' },
  { key: 'sphere-blue', zh: '蓝球', en: 'Blue sphere' },
  { key: 'sphere-mint', zh: '薄荷球', en: 'Mint sphere' },
  { key: 'sphere-sunset', zh: '橙球', en: 'Sunset sphere' },
  { key: 'sphere-rose', zh: '粉球', en: 'Rose sphere' },
  { key: 'cube', zh: '方块', en: 'Cube' },
  { key: 'ring', zh: '圆环', en: 'Ring' },
  { key: 'gem', zh: '宝石', en: 'Gem' },
  { key: 'pill', zh: '胶囊', en: 'Capsule' },
  { key: 'blob', zh: '水滴', en: 'Blob' },
  { key: 'star', zh: '星星', en: 'Star' },
]

const SPHERES: Record<string, [string, string, string]> = {
  'sphere-violet': ['#EDE0FF', '#8B5CF6', '#2E1065'],
  'sphere-blue': ['#D6F3FF', '#00ACE4', '#0B3B6B'],
  'sphere-mint': ['#D7FBEC', '#34D399', '#064E3B'],
  'sphere-sunset': ['#FFE8CC', '#F59E0B', '#7C2D12'],
  'sphere-rose': ['#FFDDEB', '#EC4899', '#701A75'],
}

export function isAvatarPreset(key: string | null | undefined): key is string {
  return !!key && AVATAR_PRESETS.some((p) => p.key === key)
}

const storeKey = (role: AgentRole) => `sl-avatar-${role}`
export function getStoredAvatar(role: AgentRole): string | null {
  try { const v = localStorage.getItem(storeKey(role)); return isAvatarPreset(v) ? v : v === 'default' ? 'default' : null } catch { return null }
}
export function setStoredAvatar(role: AgentRole, key: string | null): void {
  try { if (key) localStorage.setItem(storeKey(role), key); else localStorage.removeItem(storeKey(role)) } catch { /* private mode */ }
}

/** Renders the chosen preset (or the role orb) inside a circle; size comes from className. */
export function AssistantAvatar({ avatar, role, className = '', style }: { avatar?: string | null; role: AgentRole; className?: string; style?: CSSProperties }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const key = isAvatarPreset(avatar) ? avatar : null
  if (!key) {
    return <span aria-hidden className={`inline-block rounded-full ${className}`} style={{ background: ROLE_THEME[role].avatarGradient, ...style }} />
  }
  const g = `g${uid}`
  const sphere = SPHERES[key]
  let shape: React.ReactNode
  if (sphere) {
    shape = (
      <>
        <defs>
          <radialGradient id={g} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor={sphere[0]} /><stop offset="0.45" stopColor={sphere[1]} /><stop offset="1" stopColor={sphere[2]} /></radialGradient>
        </defs>
        <ellipse cx="50" cy="88" rx="26" ry="5" fill="#000" opacity="0.14" />
        <circle cx="50" cy="48" r="38" fill={`url(#${g})`} />
        <ellipse cx="38" cy="30" rx="13" ry="8" fill="#fff" opacity="0.55" />
      </>
    )
  } else if (key === 'cube') {
    shape = (
      <>
        <ellipse cx="50" cy="90" rx="28" ry="5" fill="#000" opacity="0.14" />
        <polygon points="50,14 82,30 50,46 18,30" fill="#C4B5FD" stroke="#C4B5FD" strokeWidth="3" strokeLinejoin="round" />
        <polygon points="18,30 50,46 50,84 18,68" fill="#7C3AED" stroke="#7C3AED" strokeWidth="3" strokeLinejoin="round" />
        <polygon points="50,46 82,30 82,68 50,84" fill="#4C1D95" stroke="#4C1D95" strokeWidth="3" strokeLinejoin="round" />
        <polygon points="50,20 70,30 50,40 30,30" fill="#fff" opacity="0.25" />
      </>
    )
  } else if (key === 'ring') {
    shape = (
      <>
        <defs>
          <radialGradient id={g} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#D6F3FF" /><stop offset="0.5" stopColor="#00ACE4" /><stop offset="1" stopColor="#1B1B3C" /></radialGradient>
        </defs>
        <ellipse cx="50" cy="88" rx="30" ry="5" fill="#000" opacity="0.14" />
        <circle cx="50" cy="48" r="38" fill={`url(#${g})`} />
        <circle cx="50" cy="48" r="16" fill="#EEF5FA" />
        <circle cx="50" cy="48" r="16" fill="none" stroke="#000" strokeWidth="6" opacity="0.18" />
        <ellipse cx="36" cy="26" rx="12" ry="6" fill="#fff" opacity="0.5" />
      </>
    )
  } else if (key === 'gem') {
    shape = (
      <>
        <ellipse cx="50" cy="90" rx="24" ry="5" fill="#000" opacity="0.14" />
        <polygon points="50,12 78,38 50,88 22,38" fill="#0B3B6B" />
        <polygon points="50,12 78,38 50,40" fill="#7DD3FC" />
        <polygon points="50,12 22,38 50,40" fill="#BAE6FD" />
        <polygon points="22,38 50,40 50,88" fill="#0284C7" />
        <polygon points="78,38 50,40 50,88" fill="#075985" />
        <polygon points="50,16 62,30 50,34 38,30" fill="#fff" opacity="0.45" />
      </>
    )
  } else if (key === 'pill') {
    shape = (
      <>
        <defs>
          <linearGradient id={g} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D7FBEC" /><stop offset="0.5" stopColor="#34D399" /><stop offset="1" stopColor="#065F46" /></linearGradient>
        </defs>
        <ellipse cx="50" cy="88" rx="28" ry="5" fill="#000" opacity="0.14" />
        <g transform="rotate(-30 50 48)">
          <rect x="16" y="32" width="68" height="32" rx="16" fill={`url(#${g})`} />
          <rect x="24" y="36" width="52" height="8" rx="4" fill="#fff" opacity="0.45" />
        </g>
      </>
    )
  } else if (key === 'blob') {
    shape = (
      <>
        <defs>
          <radialGradient id={g} cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#EDE0FF" /><stop offset="0.5" stopColor="#A78BFA" /><stop offset="1" stopColor="#4C1D95" /></radialGradient>
        </defs>
        <ellipse cx="50" cy="90" rx="26" ry="5" fill="#000" opacity="0.14" />
        <path d="M54 12c15 0 30 12 32 28 2 17-9 36-24 42S30 86 20 70 16 40 30 26s12-14 24-14z" fill={`url(#${g})`} />
        <ellipse cx="40" cy="30" rx="12" ry="7" fill="#fff" opacity="0.5" />
      </>
    )
  } else {
    shape = (
      <>
        <defs>
          <radialGradient id={g} cx="40%" cy="30%" r="75%"><stop offset="0" stopColor="#FFF1C2" /><stop offset="0.5" stopColor="#F59E0B" /><stop offset="1" stopColor="#92400E" /></radialGradient>
        </defs>
        <ellipse cx="50" cy="90" rx="26" ry="5" fill="#000" opacity="0.14" />
        <polygon points="50,10 62,36 90,38 68,56 75,84 50,69 25,84 32,56 10,38 38,36" fill={`url(#${g})`} stroke="#F59E0B" strokeWidth="6" strokeLinejoin="round" />
        <ellipse cx="44" cy="32" rx="9" ry="5" fill="#fff" opacity="0.5" />
      </>
    )
  }
  return (
    <span aria-hidden className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-surface-chip ${className}`} style={style}>
      <svg viewBox="0 0 100 100" className="h-[92%] w-[92%]">{shape}</svg>
    </span>
  )
}

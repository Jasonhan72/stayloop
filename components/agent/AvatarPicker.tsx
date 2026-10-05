'use client'

// The assistant's face picker (2026-09-27): one grid for the web panel's pencil,
// the phone AI Agent sheet and /settings — twenty plush pets + twenty young
// people (2026-09-25), five to a row, the two groups labelled, the grid
// scrolling inside its box. The caller persists the choice
// (assistant_profiles.avatar + localStorage); this only shows and picks.
import { useState } from 'react'
import { AVATAR_GROUPS, AVATAR_PRESETS, AssistantAvatar, isCustomAvatarKey } from '@/lib/agent/avatars'
import type { AgentRole } from '@/lib/agent/types'
import AvatarMaker from './AvatarMaker'

export default function AvatarPicker({ role, avatar, live, zh, onPick, className = '' }: {
  role: AgentRole
  avatar: string | null
  /** signed-in account: the default face is the brand pet; demo personas keep their role orb */
  live: boolean
  zh: boolean
  onPick: (key: string | null) => void
  className?: string
}) {
  // 「自己做一个」(2026-09-28): the maker replaces the grid while it is open — the
  // box is ~300px wide and the grid already scrolls. Signed-in accounts only
  // (a generation costs money and the result is stored on the account).
  const [making, setMaking] = useState(false)
  if (making) {
    return (
      <div data-testid="avatar-picker" className={`rounded-xl border border-line-divider bg-white p-2.5 shadow-lg ${className}`}>
        <AvatarMaker role={role} zh={zh} onDone={(k) => { setMaking(false); onPick(k) }} onCancel={() => setMaking(false)} />
      </div>
    )
  }
  return (
    <div data-testid="avatar-picker" className={`rounded-xl border border-line-divider bg-white p-2.5 shadow-lg ${className}`}>
      <div className="mb-1.5 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '选一个头像' : 'Pick an avatar'}</div>
      <div className="max-h-[340px] overflow-y-auto pr-1">
        {live && (
          <div className="mb-2">
            <div className="mb-1 text-left text-[11px] font-bold text-body-3">{zh ? '自己做的' : 'Your own'}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {isCustomAvatarKey(avatar) && (
                <button type="button" onClick={() => onPick(avatar)} title={zh ? '当前的自制头像' : 'Your current made face'} aria-label={zh ? '当前的自制头像' : 'Your current made face'} className="flex h-12 w-12 items-center justify-center rounded-full ring-2 ring-brand ring-offset-1">
                  <AssistantAvatar avatar={avatar} role={role} className="h-10 w-10" />
                </button>
              )}
              <button type="button" onClick={() => setMaking(true)} data-testid="avatar-make" title={zh ? '用照片或一句描述生成' : 'Generate from a photo or a description'} aria-label={zh ? '自己做一个头像' : 'Make your own avatar'} className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-line-strong text-[20px] leading-none text-body-3 transition hover:border-brand hover:text-brand">＋</button>
            </div>
          </div>
        )}
        {AVATAR_GROUPS.map((g) => (
          <div key={g.key} className="mb-2">
            <div className="mb-1 text-left text-[11px] font-bold text-body-3">{zh ? g.zh : g.en}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {g.key === 'pet' && (
                <button type="button" onClick={() => onPick(null)} title={zh ? '默认' : 'Default'} aria-label={zh ? '默认头像' : 'Default avatar'} className={`flex h-12 w-12 items-center justify-center rounded-full transition hover:bg-surface-chip ${!avatar || avatar === 'default' ? 'ring-2 ring-brand ring-offset-1' : ''}`}>
                  <AssistantAvatar avatar={null} role={role} className="h-10 w-10" fallback={live ? 'brand' : 'role'} />
                </button>
              )}
              {AVATAR_PRESETS.filter((p) => p.group === g.key).map((p) => (
                <button key={p.key} type="button" onClick={() => onPick(p.key)} title={zh ? p.zh : p.en} aria-label={zh ? p.zh : p.en} className={`flex h-12 w-12 items-center justify-center rounded-full transition hover:bg-surface-chip ${avatar === p.key ? 'ring-2 ring-brand ring-offset-1' : ''}`}>
                  <AssistantAvatar avatar={p.key} role={role} className="h-10 w-10" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

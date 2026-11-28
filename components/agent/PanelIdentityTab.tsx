'use client'

// 身份 — the panel's third tab (2026-11-27, after the Muse panel's 「Identity」): who this
// assistant is. One card with its name and 风格 (edited in place), then two cards that open a
// page each —
//   人设  who it is and how it works: the text it reads before every reply;
//   记忆  what it has learned about the person (画像) and what it remembers, every item editable —
// and under them what it runs with (对话模型 · 推送). Everything here was already in the panel
// (the old 记忆 and 设置 tabs); this is the same record under one roof. Name and face stay on the
// pencil beside the avatar.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { readAssistantProfile } from '@/lib/agent/assistantProfile'
import { MEMORIES_CHANGED_EVENT } from '@/lib/agent/memory'
import type { AgentRole, MemoryItem } from '@/lib/agent/types'
import AssistantSettings from './AssistantSettings'
import PrivateMemorySnapshot from './PrivateMemorySnapshot'
import { BackIcon } from './panelIcons'

export type IdentityPage = 'home' | 'persona' | 'memory'

function shortDate(iso: string | null, zh: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { month: '2-digit', day: '2-digit' })
}

export default function PanelIdentityTab({ role, live, name, memories, visible, page, onPage }: {
  role: AgentRole
  live: boolean
  /** The assistant's name as the panel head shows it. */
  name: string
  memories: MemoryItem[]
  visible: boolean
  /** Which page of the tab is open — the panel owns it, so a ?panel=memory link can land on 记忆. */
  page: IdentityPage
  onPage: (p: IdentityPage) => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const uid = live ? auth.user?.id ?? null : null

  // What the two cards say: how much 人设 is written, how many things it remembers and when that last moved.
  const [personaLen, setPersonaLen] = useState<number | null>(null)
  const [memoryAt, setMemoryAt] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(MEMORIES_CHANGED_EVENT, h)
    return () => window.removeEventListener(MEMORIES_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!uid || !visible || page !== 'home') { if (!uid) { setPersonaLen(null); setMemoryAt(null) } return }
    let cancelled = false
    readAssistantProfile(supabase).then((p) => { if (!cancelled) setPersonaLen((p?.persona ?? '').length) })
    supabase.from('user_memories').select('updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (!cancelled) setMemoryAt(((data ?? []) as { updated_at: string | null }[])[0]?.updated_at ?? null) }, () => {})
    return () => { cancelled = true }
  }, [uid, visible, page, tick])

  const back = (
    <button type="button" onClick={() => onPage('home')} data-testid="identity-back" className="-ml-1.5 mb-1 inline-flex min-h-10 items-center gap-1 rounded-lg px-1.5 text-[13px] font-semibold text-body-2 transition hover:text-ink">
      <BackIcon /> {zh ? '身份' : 'Identity'}
    </button>
  )

  if (page === 'persona') {
    return (
      <div data-testid="identity-persona">
        {back}
        <AssistantSettings role={role} live={live} view="persona" />
      </div>
    )
  }

  if (page === 'memory') {
    return (
      <div className="space-y-3" data-testid="identity-memory">
        <div>{back}</div>
        <AssistantSettings role={role} live={live} view="profile" />
        <div className="rounded-2xl border border-line-divider bg-white p-4">
          <div className="mb-1 text-[13.5px] font-semibold text-ink">{zh ? '它记住的事' : 'What it remembers'}</div>
          <PrivateMemorySnapshot agentName={name} memories={memories} role={role} editable={live} />
        </div>
        <p className="px-1 text-[11.5px] text-body-3">{zh ? '画像和记忆跨身份共用一份，只有你能看到。' : 'One profile and one memory across your roles — only you can see them.'}</p>
      </div>
    )
  }

  const card = 'relative flex h-[116px] flex-col justify-between overflow-hidden rounded-2xl p-3.5 text-left text-white shadow-[0_6px_18px_rgba(27,27,60,.16)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(27,27,60,.22)]'
  const personaLine = !live
    ? (zh ? '登录后可以写' : 'Sign in to write it')
    : personaLen === null ? '…' : personaLen > 0 ? (zh ? `已写 ${personaLen} 字` : `${personaLen} characters`) : (zh ? '还没写' : 'Not written yet')
  const memoryLine = memories.length > 0
    ? (zh ? `${memories.length} 条` : `${memories.length} item${memories.length === 1 ? '' : 's'}`)
    : (zh ? '还没有记住什么' : 'Nothing remembered yet')
  // When the memory last moved — its own line: a 150px card cut 「5 条 · 11/24 更新」 short.
  const memoryDate = memories.length > 0 && memoryAt ? (zh ? `${shortDate(memoryAt, zh)} 更新` : `updated ${shortDate(memoryAt, zh)}`) : ''

  return (
    <div className="space-y-3" data-testid="identity-home">
      <AssistantSettings role={role} live={live} view="vibe" name={name} />

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onPage('persona')} data-testid="identity-card-persona" className={card} style={{ background: 'linear-gradient(135deg, #1B1B3C 0%, #3A3484 100%)' }}>
          <span>
            <span className="block text-[16px] font-bold tracking-wide">{zh ? '人设' : 'Persona'}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-white/80">{zh ? '它是谁、怎么做事' : 'Who it is, how it works'}</span>
          </span>
          <span className="flex items-end justify-between gap-2 font-mono text-[11px] text-white/90"><span className="min-w-0 truncate">{personaLine}</span><span aria-hidden className="text-[15px] leading-none">›</span></span>
        </button>
        <button type="button" onClick={() => onPage('memory')} data-testid="identity-card-memory" className={card} style={{ background: 'linear-gradient(135deg, #0B4F8F 0%, #0C7CC0 100%)' }}>
          <span>
            <span className="block text-[16px] font-bold tracking-wide">{zh ? '记忆' : 'Memory'}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-white/80">{zh ? '它对你的了解' : 'What it knows about you'}</span>
          </span>
          <span className="flex items-end justify-between gap-2 font-mono text-[11px] text-white/90">
            <span className="min-w-0"><span className="block truncate">{memoryLine}</span>{memoryDate && <span className="block truncate text-white/75">{memoryDate}</span>}</span>
            <span aria-hidden className="text-[15px] leading-none">›</span>
          </span>
        </button>
      </div>

      <AssistantSettings role={role} live={live} view="runtime" />
    </div>
  )
}

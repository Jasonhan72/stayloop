'use client'

// The assistant's own settings — Muse's fourth (fingerprint) tab (user
// 2026-09-25: "AI Agent 的设置要加上"): speaking style ("vibe") · which model
// answers · notifications (name and avatar are edited from the pencil beside
// the avatar, so they have no rows here), then two cards the way Muse shows
// SOUL / MEMORY: 画像 (what it has learned about the person — the reflection
// profile, lib/agent/reflection.ts) and 记忆 (what it remembers). Everything
// here is the signed-in person's own row (RLS self); preview sessions only look.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { readAssistantProfile, sanitizeVibe, saveAssistantVibe, VIBE_MAX } from '@/lib/agent/assistantProfile'
import { writeAuditEvent } from '@/lib/agent/audit'
import { PencilIcon } from './panelIcons'
import type { AgentRole } from '@/lib/agent/types'

/** The row lib/agent/reflection.ts writes (USER_MODEL_KEY there — that module is server-only, so the key is repeated here and pinned by a test). */
const USER_MODEL_KEY = 'user_model'

type Profile = {
  goals?: string[]; preferences?: string[]; constraints?: string[]; communication_style?: string
  current_focus?: string; worked_well?: string[]; avoid?: string[]; updated_at?: string; turns_analyzed?: number
}

function fmtDate(iso: string | null | undefined, zh: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function AssistantSettings({ role, name, live, memoryCount, onOpenMemory }: {
  role: AgentRole
  name: string
  live: boolean
  memoryCount: number
  onOpenMemory: () => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const uid = live ? auth.user?.id ?? null : null

  // Speaking style — assistant_profiles.vibe (loaded once the tab opens).
  const [vibe, setVibe] = useState<string | null>(null)
  const [vibeReady, setVibeReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!uid) { setVibe(null); setVibeReady(true); return }
    let cancelled = false
    readAssistantProfile(supabase).then((p) => { if (!cancelled) { setVibe(p?.vibe ?? null); setVibeReady(true) } })
    return () => { cancelled = true }
  }, [uid])
  async function saveVibe() {
    if (!uid) return
    const next = sanitizeVibe(draft)
    setSaving(true)
    const ok = await saveAssistantVibe(supabase, uid, next)
    setSaving(false)
    if (ok) { setVibe(next); setEditing(false) }
  }

  // 画像 — the reflection profile (user_memories · role self · key user_model).
  const [profile, setProfile] = useState<{ value: Profile; updated_at: string | null } | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  useEffect(() => {
    if (!uid) { setProfile(null); setProfileReady(true); return }
    let cancelled = false
    supabase
      .from('user_memories')
      .select('value, updated_at')
      .eq('user_id', uid)
      .eq('role', 'self')
      .eq('memory_type', 'system')
      .eq('key', USER_MODEL_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const row = data as { value?: unknown; updated_at?: string | null } | null
        setProfile(row ? { value: (row.value && typeof row.value === 'object' ? (row.value as Profile) : {}), updated_at: row.updated_at ?? null } : null)
        setProfileReady(true)
      })
    return () => { cancelled = true }
  }, [uid])
  async function forgetProfile() {
    if (!uid || !profile) return
    if (!window.confirm(zh ? '忘掉它对你的画像？下一轮对话后它会重新学习。' : 'Forget its profile of you? It relearns after the next conversation.')) return
    const { error } = await supabase.from('user_memories').delete().eq('user_id', uid).eq('role', 'self').eq('memory_type', 'system').eq('key', USER_MODEL_KEY)
    if (error) return
    setProfile(null)
    setProfileOpen(false)
    void writeAuditEvent(supabase, { actorId: uid, action: 'memory_forgotten', targetType: 'user_memory', metadata: { key: USER_MODEL_KEY, memory_type: 'system', role: 'self' } })
  }

  const p = profile?.value
  const sec = (label: string, items?: string[]) => (items && items.length ? (
    <div>
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{label}</div>
      <ul className="mt-0.5 space-y-0.5 text-[13px] leading-snug text-body">{items.map((s, i) => <li key={i}>· {s}</li>)}</ul>
    </div>
  ) : null)
  const row = 'flex items-center justify-between gap-3 py-2.5 text-[13px]'
  const action = 'flex-none rounded-full border border-line-divider bg-white px-2.5 py-1 text-[12px] font-bold text-body-2 transition hover:border-line-strong disabled:opacity-40'

  return (
    <div className="space-y-3" data-testid="assistant-settings">
      {!live && (
        <div className="rounded-xl bg-surface-chip px-3 py-2 text-[12px] leading-relaxed text-body-3">
          {zh ? '预览模式 · 登录后可以给你的助手起名、换头像、设定说话风格。' : 'Preview mode · sign in to name your assistant, pick its face and set how it speaks.'}
        </div>
      )}

      <section className="rounded-2xl bg-surface-chip p-4">
        <div className="text-[19px] font-medium tracking-tight text-ink">{name}</div>
        <div className="mt-0.5 text-[12.5px] text-body-3">{vibe || (zh ? '还没有设定风格' : 'No style set yet')}</div>

        <div className="mt-3.5 font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '风格' : 'Vibe'}</div>
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); void saveVibe() }} className="mt-1.5">
            <textarea
              autoFocus
              value={draft}
              maxLength={VIBE_MAX}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={zh ? '例如：直接、先给结论、少客套' : 'e.g. direct, conclusion first, no small talk'}
              aria-label={zh ? '说话风格' : 'Speaking style'}
              className="w-full resize-none rounded-lg border border-line-strong bg-white px-2.5 py-2 text-[14px] leading-snug outline-none focus:border-brand"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button type="submit" disabled={saving} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: '#1B1B3C' }}>{saving ? '…' : zh ? '保存' : 'Save'}</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-body-3">{zh ? '取消' : 'Cancel'}</button>
              <span className="ml-auto font-mono text-[10.5px] text-body-3">{draft.length}/{VIBE_MAX}</span>
            </div>
          </form>
        ) : (
          <>
            <div className="mt-1 text-[14px] leading-snug text-body">{vibeReady ? (vibe || (zh ? '例如：直接、先给结论、少客套' : 'e.g. direct, conclusion first, no small talk')) : (zh ? '读取中…' : 'Loading…')}</div>
            <button
              type="button"
              onClick={() => { setDraft(vibe ?? ''); setEditing(true) }}
              disabled={!uid}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-2 text-[13px] font-bold text-body shadow-[0_1px_2px_rgba(27,27,60,.08)] transition hover:shadow-[0_2px_6px_rgba(27,27,60,.12)] disabled:opacity-40"
            >
              <PencilIcon /> {zh ? '编辑' : 'Edit'}
            </button>
          </>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-body-3">{zh ? '只影响语气与措辞，不改变它遵守的规则和能做的事。' : 'Tone and wording only — never the rules it follows or what it may do.'}</p>

        {/* Name and avatar are edited from the pencil beside the avatar (user 2026-09-25: "这里不用设置名字和头像的修改的条了"). */}
        <div className="mt-3 divide-y divide-line-soft border-t border-line-soft">
          <div className={row}>
            <span className="text-body-2">{zh ? '对话模型' : 'Model'}</span>
            <Link href="/settings/models" className={action}>{zh ? '在设置里选择 →' : 'Choose in settings →'}</Link>
          </div>
          <div className={row}>
            <span className="text-body-2">{zh ? '通知' : 'Notifications'}</span>
            <Link href="/settings" className={action}>{zh ? '推送与提醒 →' : 'Push and reminders →'}</Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          aria-expanded={profileOpen}
          className="rounded-2xl p-4 text-left text-white transition hover:brightness-105"
          style={{ background: 'linear-gradient(135deg,#B84A44 0%,#8E3A36 100%)' }}
        >
          <div className="text-[17px] font-extrabold tracking-tight">{zh ? '画像' : 'Profile'}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-eyebrow text-white/75">{zh ? '只有你能看到' : 'Only you can see this'}</div>
          <div className="mt-6 text-[12px] text-white/90">{zh ? '它对你的理解' : 'What it has learned about you'}</div>
          <div className="mt-0.5 font-mono text-[11px] text-white/75">{!profileReady ? '…' : profile ? fmtDate(profile.updated_at ?? profile.value.updated_at, zh) || (zh ? '已生成' : 'ready') : (zh ? '尚未生成' : 'not yet')}</div>
        </button>
        <button
          type="button"
          onClick={onOpenMemory}
          className="rounded-2xl p-4 text-left text-white transition hover:brightness-105"
          style={{ background: 'linear-gradient(135deg,#4F5BD5 0%,#3B45A8 100%)' }}
        >
          <div className="text-[17px] font-extrabold tracking-tight">{zh ? '记忆' : 'Memory'}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-eyebrow text-white/75">{zh ? '只有你能看到' : 'Only you can see this'}</div>
          <div className="mt-6 text-[12px] text-white/90">{zh ? '它记住的事' : 'What it remembers'}</div>
          <div className="mt-0.5 font-mono text-[11px] text-white/75">{zh ? `${memoryCount} 条 · 查看 →` : `${memoryCount} items · view →`}</div>
        </button>
      </div>

      {profileOpen && (
        <section className="rounded-2xl border border-line-divider bg-white p-4" data-testid="assistant-profile">
          {!profile || !p ? (
            <p className="text-[13px] leading-relaxed text-body-3">
              {live
                ? (zh ? '还没有画像。和它多聊几次，它会自动学习你的目标、偏好和硬性约束——你随时可以在这里看到并忘掉。' : 'No profile yet. Talk with it a few times and it learns your goals, preferences and hard constraints — you can always read and forget them here.')
                : (zh ? '预览模式没有画像。' : 'Preview mode has no profile.')}
            </p>
          ) : (
            <div className="space-y-2.5">
              {p.current_focus && <div><div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '当前重点' : 'Current focus'}</div><div className="mt-0.5 text-[13px] leading-snug text-body">{p.current_focus}</div></div>}
              {sec(zh ? '目标' : 'Goals', p.goals)}
              {sec(zh ? '偏好' : 'Preferences', p.preferences)}
              {sec(zh ? '硬性约束' : 'Hard constraints', p.constraints)}
              {p.communication_style && <div><div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">{zh ? '沟通风格' : 'Communication style'}</div><div className="mt-0.5 text-[13px] leading-snug text-body">{p.communication_style}</div></div>}
              {sec(zh ? '有效的做法' : 'What worked', p.worked_well)}
              {sec(zh ? '避免' : 'Avoid', p.avoid)}
              <div className="flex items-center justify-between pt-1">
                <span className="font-mono text-[10.5px] text-body-3">{zh ? `系统自动学习 · ${fmtDate(profile.updated_at ?? p.updated_at, zh)}` : `Learned automatically · ${fmtDate(profile.updated_at ?? p.updated_at, zh)}`}</span>
                <button type="button" onClick={() => void forgetProfile()} className="text-[12px] font-bold text-danger">{zh ? '忘掉画像' : 'Forget'}</button>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-body-3">{zh ? `画像跨三种身份合成，只在你（${role === 'landlord' ? '房东' : role === 'agent' ? '经纪' : '租客'}或其他身份）与它对话时使用。` : 'One profile across your hats, used only when you talk with it.'}</p>
        </section>
      )}
    </div>
  )
}

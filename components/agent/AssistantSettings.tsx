'use client'

// The assistant's own settings — Muse's fourth (fingerprint) tab. Everything
// here DEFINES the person's one assistant and is its long-term record (user
// 2026-09-25: "这里的内容都是定义这个 Agent 的，需要专门和长期的保存，每一项也是需要
// 可以修改的"): name · avatar · speaking style live on assistant_profiles (one
// row per account), the answering model on user_model_preferences, push on
// push_subscriptions, and the 画像 (what it has learned) on the user_memories
// row role=self · key=user_model — where the person's own edits are kept as
// user_overrides and outrank every later reflection. Every item is edited in
// place; preview sessions only look.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { PERSONA_MAX, readAssistantProfile, sanitizePersona, sanitizeVibe, saveAssistantPersona, saveAssistantVibe, VIBE_MAX } from '@/lib/agent/assistantProfile'
import { loadTurnModels, saveTurnModel, type TurnModelState } from '@/lib/agent/modelCatalog'
import { writeAuditEvent } from '@/lib/agent/audit'
import PushSettingsCard from '@/components/mobile/PushSettingsCard'
import { PencilIcon } from './panelIcons'
import type { AgentRole } from '@/lib/agent/types'

/** The row lib/agent/reflection.ts writes (USER_MODEL_KEY there — that module is server-only, so the key and field lists are repeated here and pinned by a test). */
const USER_MODEL_KEY = 'user_model'
const LIST_FIELDS = ['goals', 'preferences', 'constraints', 'worked_well', 'avoid'] as const
const TEXT_FIELDS = ['current_focus', 'communication_style'] as const
type ListField = (typeof LIST_FIELDS)[number]
type TextField = (typeof TEXT_FIELDS)[number]
type Field = ListField | TextField
const FIELD_ORDER: Field[] = ['current_focus', 'goals', 'preferences', 'constraints', 'communication_style', 'worked_well', 'avoid']
const FIELD_LABEL: Record<Field, { zh: string; en: string; hint: { zh: string; en: string } }> = {
  current_focus: { zh: '当前重点', en: 'Current focus', hint: { zh: '一句话', en: 'one line' } },
  goals: { zh: '目标', en: 'Goals', hint: { zh: '每行一条', en: 'one per line' } },
  preferences: { zh: '偏好', en: 'Preferences', hint: { zh: '每行一条', en: 'one per line' } },
  constraints: { zh: '硬性约束', en: 'Hard constraints', hint: { zh: '每行一条', en: 'one per line' } },
  communication_style: { zh: '沟通风格', en: 'Communication style', hint: { zh: '一句话', en: 'one line' } },
  worked_well: { zh: '有效的做法', en: 'What worked', hint: { zh: '每行一条', en: 'one per line' } },
  avoid: { zh: '避免', en: 'Avoid', hint: { zh: '每行一条', en: 'one per line' } },
}

type Profile = Partial<Record<ListField, string[]>> & Partial<Record<TextField, string>> & {
  updated_at?: string
  turns_analyzed?: number
  user_overrides?: Partial<Record<ListField, string[]> & Record<TextField, string>>
}

function fmtDate(iso: string | null | undefined, zh: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString(zh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function AssistantSettings({ role, name, live, memoryCount, onRename, onOpenMemory }: {
  role: AgentRole
  name: string
  live: boolean
  memoryCount: number
  /** The name is edited from the pencil beside the avatar; the card's name line opens the same editor. */
  onRename: () => void
  onOpenMemory: () => void
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const uid = live ? auth.user?.id ?? null : null

  // Speaking style + persona — assistant_profiles (loaded once the tab opens). Both go into every turn's prompt.
  const [vibe, setVibe] = useState<string | null>(null)
  const [vibeReady, setVibeReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [persona, setPersona] = useState<string | null>(null)
  const [personaEditing, setPersonaEditing] = useState(false)
  const [personaDraft, setPersonaDraft] = useState('')
  const [personaSaving, setPersonaSaving] = useState(false)
  useEffect(() => {
    if (!uid) { setVibe(null); setPersona(null); setVibeReady(true); return }
    let cancelled = false
    readAssistantProfile(supabase).then((p) => { if (!cancelled) { setVibe(p?.vibe ?? null); setPersona(p?.persona ?? null); setVibeReady(true) } })
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
  async function savePersona() {
    if (!uid) return
    const next = sanitizePersona(personaDraft)
    setPersonaSaving(true)
    const ok = await saveAssistantPersona(supabase, uid, next)
    setPersonaSaving(false)
    if (ok) { setPersona(next); setPersonaEditing(false) }
  }

  // Answering model — user_model_preferences (same store as the input bar and /settings/models).
  const [models, setModels] = useState<TurnModelState | null>(null)
  const [modelSaved, setModelSaved] = useState(false)
  useEffect(() => {
    if (!uid) { setModels(null); return }
    let cancelled = false
    loadTurnModels(uid).then((m) => { if (!cancelled) setModels(m) })
    return () => { cancelled = true }
  }, [uid])
  async function chooseModel(id: string) {
    if (!uid || !models) return
    setModels({ ...models, selected: id })
    const ok = await saveTurnModel(uid, id)
    if (ok) { setModelSaved(true); setTimeout(() => setModelSaved(false), 1500) }
  }

  // 画像 — the reflection profile (user_memories · role self · key user_model), editable field by field.
  const [profile, setProfile] = useState<{ value: Profile; updated_at: string | null } | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [fieldEditing, setFieldEditing] = useState<Field | null>(null)
  const [fieldDraft, setFieldDraft] = useState('')
  const [fieldBusy, setFieldBusy] = useState(false)
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
  const isList = (f: Field): f is ListField => (LIST_FIELDS as readonly string[]).includes(f)
  function startField(f: Field) {
    const v = profile?.value[f]
    setFieldDraft(isList(f) ? ((v as string[] | undefined) ?? []).join('\n') : ((v as string | undefined) ?? ''))
    setFieldEditing(f)
  }
  async function writeProfile(next: Profile, field: Field, cleared: boolean) {
    if (!uid) return
    setFieldBusy(true)
    try {
      const now = new Date().toISOString()
      const value = { ...next, updated_at: now.slice(0, 10) }
      if (profile) {
        const { error } = await supabase.from('user_memories').update({ value, source: 'user_edit', updated_at: now }).eq('user_id', uid).eq('role', 'self').eq('memory_type', 'system').eq('key', USER_MODEL_KEY)
        if (error) { alert(error.message); return }
      } else {
        const { error } = await supabase.from('user_memories').insert({ user_id: uid, role: 'self', memory_type: 'system', key: USER_MODEL_KEY, label: '用户画像', value, confidence: 1, source: 'user_edit', updated_at: now })
        if (error) { alert(error.message); return }
      }
      setProfile({ value, updated_at: now })
      setFieldEditing(null)
      void writeAuditEvent(supabase, { actorId: uid, action: 'memory_edited', targetType: 'user_memory', metadata: { key: USER_MODEL_KEY, memory_type: 'system', role: 'self', field, cleared } })
    } finally {
      setFieldBusy(false)
    }
  }
  /** Save the person's own wording for a field — it outranks reflection from now on (user_overrides). */
  async function saveField(f: Field) {
    const prev = profile?.value ?? {}
    const val = isList(f)
      ? fieldDraft.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 80))
      : fieldDraft.trim().slice(0, 160)
    const overrides = { ...(prev.user_overrides ?? {}), [f]: val }
    await writeProfile({ ...prev, [f]: val, user_overrides: overrides }, f, false)
  }
  /** Drop the person's wording for a field: the next reflection fills it in again. */
  async function releaseField(f: Field) {
    const prev = profile?.value ?? {}
    const overrides = { ...(prev.user_overrides ?? {}) }
    delete overrides[f]
    await writeProfile({ ...prev, user_overrides: overrides }, f, true)
  }
  async function forgetProfile() {
    if (!uid || !profile) return
    if (!window.confirm(zh ? '忘掉它对你的画像（包括你自己写的项）？下一轮对话后它会重新学习。' : 'Forget its profile of you, including what you wrote? It relearns after the next conversation.')) return
    const { error } = await supabase.from('user_memories').delete().eq('user_id', uid).eq('role', 'self').eq('memory_type', 'system').eq('key', USER_MODEL_KEY)
    if (error) return
    setProfile(null)
    setFieldEditing(null)
    void writeAuditEvent(supabase, { actorId: uid, action: 'memory_forgotten', targetType: 'user_memory', metadata: { key: USER_MODEL_KEY, memory_type: 'system', role: 'self' } })
  }

  const p = profile?.value
  const row = 'flex items-center justify-between gap-3 py-2.5 text-[13px]'
  const action = 'flex-none rounded-full border border-line-divider bg-white px-2.5 py-1 text-[12px] font-bold text-body-2 transition hover:border-line-strong disabled:opacity-40'
  const eyebrow = 'font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3'

  return (
    <div className="space-y-3" data-testid="assistant-settings">
      {!live ? (
        <div className="rounded-xl bg-surface-chip px-3 py-2 text-[12px] leading-relaxed text-body-3">
          {zh ? '预览模式 · 登录后这里是你助理的长期档案：名字、头像、风格、模型、通知、画像，每一项都能改。' : 'Preview mode · sign in and this is your assistant’s long-term record: name, face, style, model, notifications, profile — every item editable.'}
        </div>
      ) : (
        <div className="px-1 font-mono text-[10.5px] leading-relaxed text-body-3">{zh ? '长期档案 · 存在你的账号里，跨设备同步 · 这里的每一项都会进入它的每一次思考，每一项都可以改' : 'Long-term record · stored on your account, synced across devices · every item shapes every reply, every item editable'}</div>
      )}

      <section className="rounded-2xl bg-surface-chip p-4">
        {/* Name: the pencil beside the avatar edits it; the name line here opens the same editor. */}
        <button type="button" onClick={onRename} disabled={!live} title={zh ? '改名' : 'Edit name'} className="group flex items-center gap-1.5 text-left text-[19px] font-medium tracking-tight text-ink disabled:cursor-default">
          {name}
          {live && <span className="text-body-3 opacity-0 transition group-hover:opacity-100"><PencilIcon /></span>}
        </button>
        <div className="mt-0.5 text-[12.5px] text-body-3">{vibe || (zh ? '还没有设定风格' : 'No style set yet')}</div>

        {/* Persona: who it is and how it works — read before every turn, inside the rules. */}
        <div className={`mt-3.5 ${eyebrow}`}>{zh ? '人设' : 'Persona'}</div>
        {personaEditing ? (
          <form onSubmit={(e) => { e.preventDefault(); void savePersona() }} className="mt-1.5">
            <textarea
              autoFocus
              value={personaDraft}
              maxLength={PERSONA_MAX}
              rows={4}
              onChange={(e) => setPersonaDraft(e.target.value)}
              placeholder={zh ? '例如：你是一位务实的租房助理，先给结论再给依据；涉及法规时引用条款；拿不准的事先问我，不替我做决定。' : 'e.g. You are a practical rental assistant: conclusion first, then the evidence; cite the rule when law is involved; ask me before deciding anything unclear.'}
              aria-label={zh ? '人设' : 'Persona'}
              className="w-full resize-none rounded-lg border border-line-strong bg-white px-2.5 py-2 text-[13.5px] leading-snug outline-none focus:border-brand"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button type="submit" disabled={personaSaving} className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50" style={{ background: '#1B1B3C' }}>{personaSaving ? '…' : zh ? '保存' : 'Save'}</button>
              <button type="button" onClick={() => setPersonaEditing(false)} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-body-3">{zh ? '取消' : 'Cancel'}</button>
              <span className="ml-auto font-mono text-[10.5px] text-body-3">{personaDraft.length}/{PERSONA_MAX}</span>
            </div>
          </form>
        ) : (
          <>
            <div className="mt-1 whitespace-pre-line text-[13.5px] leading-snug text-body">{vibeReady ? (persona || (zh ? '还没有写人设——写几句它是谁、怎么做事、优先什么。' : 'No persona yet — a few lines on who it is, how it works, what it prioritises.')) : (zh ? '读取中…' : 'Loading…')}</div>
            <button
              type="button"
              onClick={() => { setPersonaDraft(persona ?? ''); setPersonaEditing(true) }}
              disabled={!uid}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-2 text-[13px] font-bold text-body shadow-[0_1px_2px_rgba(27,27,60,.08)] transition hover:shadow-[0_2px_6px_rgba(27,27,60,.12)] disabled:opacity-40"
            >
              <PencilIcon /> {zh ? '编辑人设' : 'Edit persona'}
            </button>
          </>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-body-3">{zh ? '它每次思考前都会先读这段话；规则、事实与能做的事不受影响。' : 'Read before every reply; the rules, the facts and what it may do are unaffected.'}</p>

        <div className={`mt-3.5 ${eyebrow}`}>{zh ? '风格' : 'Vibe'}</div>
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

        <div className="mt-3 border-t border-line-soft">
          {/* Answering model: the same pick as the input bar's selector and /settings/models. */}
          <div className={row}>
            <span className="text-body-2">{zh ? '对话模型' : 'Model'}</span>
            {models ? (
              <span className="flex min-w-0 items-center gap-1.5">
                {modelSaved && <span className="text-[11px] font-bold text-success">{zh ? '已保存' : 'Saved'}</span>}
                <select
                  value={models.selected}
                  onChange={(e) => void chooseModel(e.target.value)}
                  aria-label={zh ? '对话模型' : 'Answering model'}
                  className="max-w-[190px] rounded-full border border-line-divider bg-white px-2.5 py-1 text-[12px] font-bold text-body-2 outline-none focus:border-brand"
                >
                  <option value="">{zh ? `默认 · ${models.defaultLabel}` : `Default · ${models.defaultLabel}`}</option>
                  {models.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </span>
            ) : (
              <span className="text-[12px] text-body-3">{live ? (zh ? '读取中…' : 'Loading…') : (zh ? '系统默认' : 'System default')}</span>
            )}
          </div>
        </div>
      </section>

      {/* Notifications: the same per-device push setting as /settings and the progress page. */}
      <section className="rounded-2xl bg-surface-chip p-4">
        <PushSettingsCard live={live} frameless />
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
          <div className="mt-6 text-[12px] text-white/90">{zh ? '它对你的理解 · 可改' : 'What it has learned about you · editable'}</div>
          <div className="mt-0.5 font-mono text-[11px] text-white/75">{!profileReady ? '…' : profile ? fmtDate(profile.updated_at ?? profile.value.updated_at, zh) || (zh ? '已生成' : 'ready') : (zh ? '尚未生成 · 可自己写' : 'not yet · write your own')}</div>
        </button>
        <button
          type="button"
          onClick={onOpenMemory}
          className="rounded-2xl p-4 text-left text-white transition hover:brightness-105"
          style={{ background: 'linear-gradient(135deg,#4F5BD5 0%,#3B45A8 100%)' }}
        >
          <div className="text-[17px] font-extrabold tracking-tight">{zh ? '记忆' : 'Memory'}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-eyebrow text-white/75">{zh ? '只有你能看到' : 'Only you can see this'}</div>
          <div className="mt-6 text-[12px] text-white/90">{zh ? '它记住的事 · 可改可加' : 'What it remembers · edit or add'}</div>
          <div className="mt-0.5 font-mono text-[11px] text-white/75">{zh ? `${memoryCount} 条 · 查看 →` : `${memoryCount} items · view →`}</div>
        </button>
      </div>

      {profileOpen && (
        <section className="rounded-2xl border border-line-divider bg-white p-4" data-testid="assistant-profile">
          {!live ? (
            <p className="text-[13px] leading-relaxed text-body-3">{zh ? '预览模式没有画像。' : 'Preview mode has no profile.'}</p>
          ) : (
            <>
              <p className="text-[12px] leading-relaxed text-body-3">
                {profile
                  ? (zh ? '它从对话里自动学到的；你改过的项以你写的为准，之后的自动学习不会覆盖。' : 'Learned from your conversations; anything you edit is kept as written and never overwritten by later learning.')
                  : (zh ? '还没有自动生成的画像（和它多聊几次就会有）。你也可以现在直接写。' : 'No learned profile yet (a few conversations and it appears). You can also write it yourself now.')}
              </p>
              <div className="mt-3 space-y-3">
                {FIELD_ORDER.map((f) => {
                  const v = p?.[f]
                  const list = isList(f)
                  const items = list ? ((v as string[] | undefined) ?? []) : []
                  const text = list ? '' : ((v as string | undefined) ?? '')
                  const owned = !!p?.user_overrides && f in p.user_overrides
                  const empty = list ? items.length === 0 : !text
                  return (
                    <div key={f} data-field={f}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={eyebrow}>{zh ? FIELD_LABEL[f].zh : FIELD_LABEL[f].en}{owned && <span className="ml-1.5 normal-case tracking-normal text-brand-strong">{zh ? '· 你写的' : '· yours'}</span>}</span>
                        {fieldEditing !== f && (
                          <span className="flex gap-1">
                            {owned && <button type="button" disabled={fieldBusy} onClick={() => void releaseField(f)} className="rounded px-1.5 py-[2px] text-[11px] text-body-3 hover:bg-surface-chip hover:text-body">{zh ? '交回自动' : 'Let it learn'}</button>}
                            <button type="button" disabled={fieldBusy} onClick={() => startField(f)} className="rounded px-1.5 py-[2px] text-[11px] text-body-3 hover:bg-surface-chip hover:text-body">{zh ? '改' : 'Edit'}</button>
                          </span>
                        )}
                      </div>
                      {fieldEditing === f ? (
                        <form onSubmit={(e) => { e.preventDefault(); void saveField(f) }} className="mt-1">
                          <textarea
                            autoFocus
                            value={fieldDraft}
                            rows={list ? 3 : 2}
                            maxLength={list ? 700 : 160}
                            onChange={(e) => setFieldDraft(e.target.value)}
                            placeholder={zh ? FIELD_LABEL[f].hint.zh : FIELD_LABEL[f].hint.en}
                            aria-label={zh ? FIELD_LABEL[f].zh : FIELD_LABEL[f].en}
                            className="w-full resize-none rounded-lg border border-line-strong bg-white px-2.5 py-1.5 text-[13px] leading-snug outline-none focus:border-brand"
                          />
                          <div className="mt-1 flex gap-1.5">
                            <button type="submit" disabled={fieldBusy} className="rounded-full px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: '#1B1B3C' }}>{fieldBusy ? '…' : zh ? '保存' : 'Save'}</button>
                            <button type="button" onClick={() => setFieldEditing(null)} className="rounded-full px-2.5 py-1 text-[12px] font-bold text-body-3">{zh ? '取消' : 'Cancel'}</button>
                          </div>
                        </form>
                      ) : empty ? (
                        <div className="mt-0.5 text-[12.5px] text-body-3">{zh ? '（空）' : '(empty)'}</div>
                      ) : list ? (
                        <ul className="mt-0.5 space-y-0.5 text-[13px] leading-snug text-body">{items.map((s, i) => <li key={i}>· {s}</li>)}</ul>
                      ) : (
                        <div className="mt-0.5 text-[13px] leading-snug text-body">{text}</div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2">
                <span className="font-mono text-[10.5px] text-body-3">
                  {profile
                    ? (zh ? `更新于 ${fmtDate(profile.updated_at ?? p?.updated_at, zh)}` : `Updated ${fmtDate(profile.updated_at ?? p?.updated_at, zh)}`)
                    : (zh ? '尚未生成' : 'Not yet')}
                </span>
                {profile && <button type="button" onClick={() => void forgetProfile()} className="text-[12px] font-bold text-danger">{zh ? '忘掉画像' : 'Forget'}</button>}
              </div>
              <p className="mt-2 text-[11px] text-body-3">{zh ? `画像跨三种身份合成，只在你（${role === 'landlord' ? '房东' : role === 'agent' ? '经纪' : '租客'}或其他身份）与它对话时使用。` : 'One profile across your hats, used only when you talk with it.'}</p>
            </>
          )}
        </section>
      )}
    </div>
  )
}

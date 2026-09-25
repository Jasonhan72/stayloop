'use client'

// Human-readable memory panel. Preferences / profile / constraints show as
// typed, colored rows; machine-state memories (workflow flags, raw URLs,
// pending_* markers) are folded away behind a count so the rail never reads
// like a database dump.
import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n'
import type { AgentRole, MemoryItem } from '@/lib/agent/types'
import { formatMemoryValue } from '@/lib/agent/memory'
import { supabase } from '@/lib/supabase'
import { writeAuditEvent } from '@/lib/agent/audit'

const TYPE_META: Record<string, { zh: string; en: string; color: string }> = {
  preference: { zh: '偏好', en: 'PREF', color: '#00ACE4' },
  profile: { zh: '档案', en: 'PROFILE', color: '#2563EB' },
  constraint: { zh: '约束', en: 'LIMIT', color: '#B45309' },
  semantic: { zh: '事实', en: 'FACT', color: '#047857' },
  system: { zh: '系统', en: 'SYS', color: '#71717A' },
}

const MACHINE_VALUE = /pending_[a-z_]+|draft_ready|_confirmation|^(true|false)$/i
const MACHINE_KEY = /_status$|_confirmation$|_url$|_source$|_state$/i
const URL_RE = /https?:\/\/[^\s,;，、]+/g

function isMachine(m: MemoryItem): boolean {
  if (m.memory_type === 'system') return true
  const v = formatMemoryValue(m)
  return MACHINE_KEY.test(m.key) || MACHINE_VALUE.test(v) || (v.match(URL_RE)?.join('').length || 0) > v.length * 0.5
}

// Raw URLs read as noise — collapse each to its host.
function humanize(v: string): string {
  const cleaned = v.replace(URL_RE, (u) => {
    try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
  }).replace(/\s*[·,;，、]\s*(?=[·,;，、]|$)/g, '').trim()
  return cleaned.length > 110 ? cleaned.slice(0, 110) + '…' : cleaned
}

const VISIBLE_CAP = 6
// One assistant per account (2026-09-25): facts learned under another hat are shown with that hat.
const HAT_TAG: Record<string, { zh: string; en: string }> = { tenant: { zh: '租客', en: 'tenant' }, landlord: { zh: '房东', en: 'landlord' }, agent: { zh: '经纪', en: 'agent' } }

export default function PrivateMemorySnapshot({
  agentName,
  memories: memoriesProp,
  role,
  editable = false,
}: {
  agentName: string
  memories: MemoryItem[]
  // Muse benchmark item G (2026-09-22): memories are the user's own rows
  // (user_memories RLS = self), so they can edit a value or tell the
  // assistant to forget it. Both leave an audit event. Only for live
  // sessions with a role (the demo fallback has nothing to write to).
  role?: AgentRole
  editable?: boolean
}) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const [expanded, setExpanded] = useState(false)
  const [memories, setMemories] = useState(memoriesProp)
  useEffect(() => { setMemories(memoriesProp) }, [memoriesProp])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const canEdit = editable && !!role

  async function forget(m: MemoryItem) {
    if (!role) return
    if (!confirm(zh ? `让 ${agentName} 忘掉「${m.label}」？` : `Tell ${agentName} to forget "${m.label}"?`)) return
    setBusy(m.key)
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      if (!uid) return
      const { error } = await supabase.from('user_memories').delete().eq('user_id', uid).eq('role', m.role ?? role).eq('memory_type', m.memory_type).eq('key', m.key)
      if (error) { alert(error.message); return }
      setMemories((prev) => prev.filter((x) => !(x.key === m.key && x.memory_type === m.memory_type)))
      void writeAuditEvent(supabase, { actorId: uid, action: 'memory_forgotten', targetType: 'user_memory', metadata: { key: m.key, memory_type: m.memory_type, role: m.role ?? role } })
    } finally { setBusy(null) }
  }
  async function saveEdit(m: MemoryItem) {
    if (!role) return
    const v = draft.trim().slice(0, 500)
    if (!v) return
    setBusy(m.key)
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      if (!uid) return
      const { error } = await supabase.from('user_memories').update({ value: v, source: 'user_edit', updated_at: new Date().toISOString() }).eq('user_id', uid).eq('role', m.role ?? role).eq('memory_type', m.memory_type).eq('key', m.key)
      if (error) { alert(error.message); return }
      setMemories((prev) => prev.map((x) => (x.key === m.key && x.memory_type === m.memory_type ? { ...x, value: v } : x)))
      setEditing(null)
      void writeAuditEvent(supabase, { actorId: uid, action: 'memory_edited', targetType: 'user_memory', metadata: { key: m.key, memory_type: m.memory_type, role: m.role ?? role } })
    } finally { setBusy(null) }
  }

  const human = memories.filter((m) => !isMachine(m))
  const machine = memories.length - human.length
  const shown = expanded ? human : human.slice(0, VISIBLE_CAP)
  const hidden = human.length - shown.length

  return (
    <div className="sl-card p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {zh ? `${agentName} 记得 · 关于你` : `${agentName} REMEMBERS`}
        </h4>
        {human.length > 0 && (
          <span className="rounded-full px-2 py-[2px] font-mono text-[10px] font-bold" style={{ background: 'rgba(0,172,228,0.08)', color: '#00ACE4' }}>
            {human.length}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2.5">
        {human.length === 0 && (
          <p className="text-[12.5px] leading-relaxed text-body-3">
            {zh
              ? `还没有记忆。直接开聊 —— 预算、区域、偏好,${agentName} 说一次就记住。`
              : `No memories yet. Just start talking — budget, area, preferences: say it once and ${agentName} remembers.`}
          </p>
        )}
        {shown.map((m) => {
          const meta = TYPE_META[m.memory_type] || TYPE_META.semantic
          return (
            <div key={`${m.role ?? ''}:${m.memory_type}:${m.key}`} className="flex items-start gap-2.5">
              <span
                className="mt-[3px] flex-none rounded px-1.5 py-[2px] font-mono text-[9px] font-bold"
                style={{ background: `${meta.color}14`, color: meta.color }}
              >
                {zh ? meta.zh : meta.en}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[12.5px] font-bold leading-snug">{m.label}</span>
                {m.role && m.role !== role && m.role !== 'self' && HAT_TAG[m.role] && <span className="ml-1.5 rounded-full bg-surface-chip px-1.5 py-[1px] text-[10px] font-bold text-body-3">{zh ? HAT_TAG[m.role].zh : HAT_TAG[m.role].en}</span>}
                {editing === m.key ? (
                  <div className="mt-1 flex gap-1.5">
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} className="sl-input !py-1 !text-[13px] min-w-0 flex-1" autoFocus />
                    <button type="button" disabled={busy === m.key} onClick={() => saveEdit(m)} className="rounded-md px-2 text-[12px] font-bold text-white" style={{ background: '#00ACE4' }}>{zh ? '存' : 'Save'}</button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-line-divider px-2 text-[12px] text-body-2">{zh ? '取消' : 'Cancel'}</button>
                  </div>
                ) : (
                  <span className="ml-1.5 text-[12.5px] leading-snug text-body-2">{humanize(formatMemoryValue(m, lang))}</span>
                )}
              </div>
              {canEdit && editing !== m.key && (
                <span className="flex flex-none gap-1 text-[11px]">
                  <button type="button" onClick={() => { setEditing(m.key); setDraft(formatMemoryValue(m, lang)) }} className="rounded px-1.5 py-[2px] text-body-3 hover:bg-surface-chip hover:text-body">{zh ? '改' : 'Edit'}</button>
                  <button type="button" disabled={busy === m.key} onClick={() => forget(m)} className="rounded px-1.5 py-[2px] text-body-3 hover:bg-danger/10 hover:text-danger">{zh ? '忘掉' : 'Forget'}</button>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {(hidden > 0 || expanded) && human.length > VISIBLE_CAP && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-[12px] font-semibold text-brand hover:underline"
        >
          {expanded ? (zh ? '收起' : 'Show less') : zh ? `展开全部 ${human.length} 条 →` : `Show all ${human.length} →`}
        </button>
      )}

      <p className="mt-3 border-t border-dashed border-line-divider pt-3 font-mono text-[10px] leading-relaxed text-body-4">
        {machine > 0 && (zh ? `另有 ${machine} 条工作状态记忆(系统用) · ` : `${machine} working-state memories (system) · `)}
        {zh ? '仅你可见 · 锁定到你的账户' : 'Visible only to you · locked to your account'}
        {canEdit && (zh ? ' · 可以改、可以让它忘掉' : ' · you can edit or make it forget')}
      </p>
    </div>
  )
}

'use client'

// Chat input bar, claude.ai-style (2026-08-24): one rounded container — the
// message field on top, and a bottom rail with 「+」 attach on the left and,
// on the right, the turn-model selector (writes user_model_preferences, the
// same store as /settings/models), the mic, and a square accent send key (↑).
// Enter sends, Shift+Enter inserts a newline.
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { AgentRole, ChatAttachment } from '@/lib/agent/types'
import { ROLE_THEME } from '@/lib/roleTheme'

const MAX_FILES = 3
const MAX_BYTES = 4 * 1024 * 1024 // 4MB

type TurnModelState = {
  options: { id: string; label: string }[]
  /** '' = follow the system default */
  selected: string
  defaultLabel: string
}

export default function AgentInputBar({
  agentName,
  role,
  disabled,
  onSend,
}: {
  agentName: string
  role?: AgentRole
  disabled?: boolean
  onSend: (message: string, attachments?: ChatAttachment[]) => void | Promise<void>
}) {
  const { lang } = useI18n()
  const auth = useAuth()
  const accent = role ? ROLE_THEME[role].accent : ROLE_THEME.tenant.accent
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [atts, setAtts] = useState<ChatAttachment[]>([])
  const [recording, setRecording] = useState(false)
  const [voiceOk, setVoiceOk] = useState(false)
  const [models, setModels] = useState<TurnModelState | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceOk(!!SR)
  }, [])

  // Turn-model selector data: the SAME catalogue + preference store as
  // /settings/models — picking here is picking there. Signed-in users only.
  useEffect(() => {
    if (!auth.user || auth.user.is_anonymous) return
    let dead = false
    ;(async () => {
      try {
        const sb = getSupabaseBrowser()
        const { data: sess } = await sb.auth.getSession()
        const token = sess.session?.access_token
        if (!token) return
        const res = await fetch('/api/models/catalog', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const j = (await res.json()) as {
          defaults: Record<string, string>
          models: { id: string; label: string; slots: string[] }[]
          prefs: Record<string, string>
        }
        const options = j.models.filter((m) => m.slots.includes('turn')).map((m) => ({ id: m.id, label: m.label }))
        const def = options.find((o) => o.id === j.defaults.turn)
        if (!dead && options.length) {
          setModels({ options, selected: j.prefs.turn || '', defaultLabel: def?.label || j.defaults.turn || 'Auto' })
        }
      } catch { /* selector is optional chrome — never break the input bar */ }
    })()
    return () => { dead = true }
  }, [auth.user])

  const chooseModel = async (id: string) => {
    if (!models || !auth.user) return
    setModels({ ...models, selected: id })
    try {
      const sb = getSupabaseBrowser()
      if (id) {
        await sb.from('user_model_preferences').upsert(
          { user_id: auth.user.id, slot: 'turn', model_id: id, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,slot' },
        )
      } else {
        await sb.from('user_model_preferences').delete().eq('user_id', auth.user.id).eq('slot', 'turn')
      }
    } catch { /* best-effort; the server falls back to the default anyway */ }
  }

  const submit = async () => {
    const msg = value.trim()
    if ((!msg && atts.length === 0) || sending) return
    setSending(true)
    const payload = atts
    setValue('')
    setAtts([])
    recRef.current?.stop?.()
    try {
      await onSend(msg, payload.length ? payload : undefined)
    } finally {
      setSending(false)
    }
  }

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    // Read every accepted file to completion, then commit once — reading them
    // in parallel and calling setAtts per-callback raced and dropped files.
    const accepted = Array.from(files).filter((f) => f.size <= MAX_BYTES)
    const read = await Promise.all(
      accepted.map(
        (f) =>
          new Promise<{ name: string; mediaType: string; dataUrl: string; isImage: boolean }>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () =>
              resolve({
                name: f.name,
                mediaType: f.type || 'application/octet-stream',
                dataUrl: String(reader.result),
                isImage: f.type.startsWith('image/'),
              })
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(f)
          })
      )
    ).catch(() => [])
    if (read.length) setAtts((prev) => [...prev, ...read].slice(0, MAX_FILES))
  }

  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    if (recording) {
      recRef.current?.stop?.()
      return
    }
    const rec = new SR()
    rec.lang = lang === 'en' ? 'en-US' : 'zh-CN'
    rec.interimResults = true
    rec.continuous = false
    const base = value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setValue((base ? base + ' ' : '') + t)
    }
    rec.onend = () => setRecording(false)
    rec.onerror = () => setRecording(false)
    recRef.current = rec
    setRecording(true)
    rec.start()
  }

  // Auto-grow like claude.ai: one quiet line at rest, expands with content.
  const autoGrow = () => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px'
  }
  useEffect(autoGrow, [value])

  const canSend = !disabled && !sending && (!!value.trim() || atts.length > 0)

  return (
    <div className="rounded-2xl border border-line-strong bg-white shadow-sm transition focus-within:border-brand focus-within:shadow-md">
      {atts.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {atts.map((a, i) => (
            <div key={a.dataUrl.slice(0, 48) + a.name} className="flex items-center gap-2 rounded-lg border border-line-divider bg-surface-chip py-1 pl-1 pr-2">
              {a.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.dataUrl} alt={a.name} className="h-9 w-9 rounded object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded bg-white text-[15px]">📄</span>
              )}
              <span className="max-w-[120px] truncate text-[11.5px] text-body-2">{a.name}</span>
              <button
                type="button"
                onClick={() => setAtts((p) => p.filter((_, j) => j !== i))}
                className="text-[14px] leading-none text-body-3 transition hover:text-danger"
                aria-label={lang === 'zh' ? '移除附件' : 'Remove attachment'}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        rows={1}
        value={value}
        disabled={disabled || sending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // claude.ai convention: Enter sends, Shift+Enter breaks the line.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        aria-label={`Message ${agentName}`}
        placeholder={lang === 'zh' ? '写点什么…' : 'Write a message…'}
        className="block max-h-60 min-h-[52px] w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed text-body outline-none placeholder:text-body-4"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || sending}
            title={lang === 'zh' ? '上传图片 / PDF' : 'Upload image / PDF'}
            aria-label={lang === 'zh' ? '上传文件' : 'Upload file'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[20px] leading-none text-body-3 transition hover:bg-surface-chip hover:text-body disabled:opacity-50"
          >
            +
          </button>
          {recording && (
            <span className="ml-1 font-mono text-[11px] text-danger">
              {lang === 'zh' ? '● 录音中… 再点停止' : '● Recording… tap to stop'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {models && (
            <label className="relative flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] text-body-2 transition hover:bg-surface-chip" title={lang === 'zh' ? '本对话使用的 AI 模型（与设置 → AI 模型同步）' : 'Model for your conversations (synced with Settings → AI models)'}>
              <span className="max-w-[140px] truncate font-medium">
                {models.selected
                  ? models.options.find((o) => o.id === models.selected)?.label || models.selected
                  : models.defaultLabel}
              </span>
              <ChevronIcon />
              <select
                aria-label={lang === 'zh' ? '选择 AI 模型' : 'Choose AI model'}
                value={models.selected}
                onChange={(e) => chooseModel(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">{lang === 'zh' ? `默认 · ${models.defaultLabel}` : `Default · ${models.defaultLabel}`}</option>
                {models.options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
          {voiceOk && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={disabled || sending}
              title={lang === 'zh' ? '语音输入' : 'Voice input'}
              aria-label={lang === 'zh' ? '语音输入' : 'Voice input'}
              className={
                'flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-50 ' +
                (recording ? 'bg-danger/10 text-danger' : 'text-body-3 hover:bg-surface-chip hover:text-body')
              }
            >
              <MicIcon recording={recording} />
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            title={lang === 'zh' ? '发送（Enter）' : 'Send (Enter)'}
            aria-label={lang === 'zh' ? '发送' : 'Send'}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-white transition disabled:opacity-35"
            style={{ background: accent }}
          >
            {sending ? <span className="text-[13px]">…</span> : <ArrowUpIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}

function ArrowUpIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-body-3">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function MicIcon({ recording }: { recording: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={recording ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3" fill="none" />
    </svg>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { ChatAttachment } from '@/lib/agent/types'

const MAX_FILES = 3
const MAX_BYTES = 4 * 1024 * 1024 // 4MB

export default function AgentInputBar({
  agentName,
  disabled,
  onSend,
}: {
  agentName: string
  disabled?: boolean
  onSend: (message: string, attachments?: ChatAttachment[]) => void | Promise<void>
}) {
  const { lang } = useI18n()
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [atts, setAtts] = useState<ChatAttachment[]>([])
  const [recording, setRecording] = useState(false)
  const [voiceOk, setVoiceOk] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceOk(!!SR)
  }, [])

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
                aria-label="移除附件"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        rows={3}
        value={value}
        disabled={disabled || sending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        aria-label={`Message ${agentName}`}
        placeholder={`告诉 ${agentName} 你想做什么 —— 文字、语音或上传文件都行`}
        className="block max-h-60 min-h-[80px] w-full resize-none bg-transparent px-4 pt-3.5 text-[14.5px] leading-relaxed text-body outline-none placeholder:text-body-4"
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

      <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || sending}
            title="上传图片 / PDF"
            aria-label="上传文件"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-body-3 transition hover:bg-surface-chip hover:text-body disabled:opacity-50"
          >
            <ClipIcon />
          </button>
          {voiceOk && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={disabled || sending}
              title="语音输入"
              aria-label="语音输入"
              className={
                'flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-50 ' +
                (recording ? 'bg-danger/10 text-danger' : 'text-body-3 hover:bg-surface-chip hover:text-body')
              }
            >
              <MicIcon recording={recording} />
            </button>
          )}
          <span className="ml-1 font-mono text-[11px] text-body-4">
            {recording ? '● 录音中… 再点停止' : '↵ 发送 · Shift + ↵ 换行'}
          </span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || sending || (!value.trim() && atts.length === 0)}
          className="sl-btn-primary !px-4 !py-[9px] !text-[13.5px] disabled:opacity-50"
        >
          {sending ? '…' : '发送 →'}
        </button>
      </div>
    </div>
  )
}

function ClipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
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

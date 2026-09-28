'use client'

// Make the assistant's face (2026-09-28): from a photo (downscaled on the
// device, sent to the model once, never stored) or from a description, in one
// of four 3D styles. Lives inside the AvatarPicker, so it fits the 300px panel
// column, the phone sheet and /settings alike. On「用这个」the picker receives
// the short key (`custom:<uid>/<id>`) and persists it like any preset.
import { useEffect, useRef, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase'
import { AssistantAvatar } from '@/lib/agent/avatars'
import { AVATAR_PROMPT_MAX, AVATAR_STYLE_LABEL, AVATAR_STYLES, downscalePhoto, type AvatarStyle } from '@/lib/agent/avatarImage'
import type { AgentRole } from '@/lib/agent/types'

type Mode = 'photo' | 'prompt'

const ERR: Record<string, { zh: string; en: string }> = {
  sign_in_required: { zh: '请先登录。', en: 'Please sign in first.' },
  rate_limited: { zh: '这一小时的 6 次已用完，稍后再试。', en: 'This hour’s six tries are used up — try again later.' },
  busy: { zh: '生成服务正忙，过一会儿再试。', en: 'The image service is busy — try again in a moment.' },
  blocked: { zh: '这张照片或这段描述不能用来生成，换一个试试。', en: 'That photo or description can’t be used — try another.' },
  not_configured: { zh: '图像生成暂未开通。', en: 'Image generation is not available right now.' },
  photo_too_large: { zh: '照片太大了（12 MB 以内）。', en: 'That photo is too large (12 MB max).' },
  photo_unreadable: { zh: '读不了这张照片，换一张试试（HEIC 请先转成 JPG）。', en: 'Couldn’t read that photo — try another (convert HEIC to JPG first).' },
  prompt_required: { zh: '先写一句描述。', en: 'Write a short description first.' },
  generation_failed: { zh: '生成失败了，再试一次。', en: 'Generation failed — try once more.' },
}

export default function AvatarMaker({ role, zh, onDone, onCancel }: { role: AgentRole; zh: boolean; onDone: (key: string) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<Mode>('photo')
  const [style, setStyle] = useState<AvatarStyle>('plush')
  const [file, setFile] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ key: string; url: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pickFile = async (f: File | null) => {
    setError(null); setResult(null)
    if (!f) return
    try {
      const small = await downscalePhoto(f)
      setFile(small)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(small))
    } catch (e) {
      setFile(null); setPreview(null)
      setError((e as Error).message === 'photo_too_large' ? 'photo_too_large' : 'photo_unreadable')
    }
  }
  const canGenerate = mode === 'photo' ? !!file : text.trim().length >= 2
  const generate = async () => {
    if (!canGenerate || busy) return
    setBusy(true); setError(null); setResult(null)
    try {
      const { data: sess } = await getSupabaseBrowser().auth.getSession()
      const token = sess.session?.access_token
      if (!token) { setError('sign_in_required'); return }
      let res: Response
      if (mode === 'photo' && file) {
        const fd = new FormData()
        fd.append('mode', 'photo'); fd.append('style', style); fd.append('prompt', text.trim()); fd.append('image', file, 'photo.jpg')
        res = await fetch('/api/assistant/avatar', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      } else {
        res = await fetch('/api/assistant/avatar', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'prompt', style, prompt: text.trim() }) })
      }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; key?: string; url?: string; error?: string }
      if (!res.ok || !j.ok || !j.key || !j.url) { setError(j.error || 'generation_failed'); return }
      setResult({ key: j.key, url: j.url })
    } catch {
      setError('generation_failed')
    } finally {
      setBusy(false)
    }
  }
  const seg = (m: Mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); setResult(null) }} className={`flex-1 rounded-full py-1.5 text-[12px] font-bold transition ${mode === m ? 'bg-white text-body shadow-[0_1px_3px_rgba(27,27,60,.1)]' : 'text-body-3'}`}>{label}</button>
  )

  return (
    <div data-testid="avatar-maker" className="text-left">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-ink">{zh ? '自己做一个' : 'Make your own'}</div>
        <button type="button" onClick={onCancel} aria-label={zh ? '返回' : 'Back'} className="rounded-full px-2 py-0.5 text-[12px] font-semibold text-body-3 hover:bg-surface-chip hover:text-body">{zh ? '← 预设' : '← Presets'}</button>
      </div>
      <div className="mt-2 flex rounded-full bg-surface-chip p-[3px]" role="tablist">
        {seg('photo', zh ? '用照片' : 'From a photo')}
        {seg('prompt', zh ? '用文字' : 'From words')}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={zh ? '风格' : 'Style'}>
        {AVATAR_STYLES.map((s) => (
          <button key={s} type="button" aria-pressed={style === s} onClick={() => { setStyle(s); setResult(null) }} className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${style === s ? 'border-transparent text-white' : 'border-line-strong bg-white text-body'}`} style={style === s ? { background: '#1B1B3C' } : undefined}>
            {zh ? AVATAR_STYLE_LABEL[s].zh : AVATAR_STYLE_LABEL[s].en}
          </button>
        ))}
      </div>
      {mode === 'photo' ? (
        <div className="mt-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} aria-label={zh ? '选择照片' : 'Choose a photo'} />
          <div className="flex items-center gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-14 w-14 flex-none rounded-full object-cover" />
            ) : (
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-dashed border-line-strong text-[20px] text-body-3">＋</span>
            )}
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => fileRef.current?.click()} data-testid="avatar-photo-pick" className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12px] font-semibold text-body hover:border-brand hover:text-brand">{preview ? (zh ? '换一张' : 'Change photo') : (zh ? '选一张照片' : 'Choose a photo')}</button>
              <p className="mt-1 text-[10.5px] leading-snug text-body-3">{zh ? '正脸清楚即可。照片只用于这一次生成，不会保存。' : 'A clear front-facing shot works best. The photo is used once and never stored.'}</p>
            </div>
          </div>
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, AVATAR_PROMPT_MAX))} maxLength={AVATAR_PROMPT_MAX} placeholder={zh ? '补充要求（可选），如：戴上棒球帽' : 'Extra wishes (optional), e.g. add a baseball cap'} className="sl-input mt-2 w-full !py-1.5 text-[13px]" aria-label={zh ? '补充要求' : 'Extra wishes'} />
        </div>
      ) : (
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, AVATAR_PROMPT_MAX))} maxLength={AVATAR_PROMPT_MAX} rows={3} placeholder={zh ? '例如：戴圆眼镜的橘猫，穿深蓝西装' : 'e.g. an orange cat with round glasses in a navy suit'} className="sl-input mt-2 w-full resize-none text-[13px]" aria-label={zh ? '描述' : 'Description'} data-testid="avatar-prompt" />
      )}
      {error && <p className="mt-2 text-[12px] text-danger" data-testid="avatar-maker-error">{zh ? (ERR[error]?.zh ?? ERR.generation_failed.zh) : (ERR[error]?.en ?? ERR.generation_failed.en)}</p>}
      {result ? (
        <div className="mt-3 flex items-center gap-3" data-testid="avatar-result">
          <AssistantAvatar avatar={result.key} role={role} className="h-16 w-16 flex-none" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <button type="button" onClick={() => onDone(result.key)} data-testid="avatar-use" className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white" style={{ background: '#00ACE4' }}>{zh ? '用这个' : 'Use this one'}</button>
            <button type="button" onClick={() => void generate()} disabled={busy} className="rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[12px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50">{busy ? '…' : (zh ? '再来一次' : 'Try again')}</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => void generate()} disabled={!canGenerate || busy} data-testid="avatar-generate" className="mt-3 w-full rounded-full py-2 text-[13px] font-bold text-white transition disabled:opacity-40" style={{ background: '#00ACE4' }}>
          {busy ? (zh ? '生成中 · 约 15 秒…' : 'Generating · about 15 s…') : (zh ? '生成头像' : 'Generate')}
        </button>
      )}
      <p className="mt-2 text-[10.5px] leading-snug text-body-3">{zh ? '由 OpenAI 图像模型生成（服务器在美国）· 每小时最多 6 次 · 生成的头像存在你的账号里' : 'Made by OpenAI’s image model (US servers) · up to 6 an hour · the result is stored on your account'}</p>
    </div>
  )
}

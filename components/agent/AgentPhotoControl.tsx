'use client'
// The agent's profile photo on /agent/verify (2026-10-23): pick a file → the browser crops
// a 512px square → POST /api/agents/photo (the only writer of agent_profiles.photo_key).
// Remove is a two-step in page. The photo shows on /agents, /agents/<slug> and the picker.
import { useRef, useState } from 'react'
import AgentAvatar from '@/components/agent/AgentAvatar'
import { squarePhoto } from '@/lib/agent/avatarImage'
import { AGENT_PHOTO_SIDE } from '@/lib/agentPhotoKeys'
import { supabase } from '@/lib/supabase'

const ERR: Record<string, { zh: string; en: string }> = {
  photo_too_large: { zh: '照片太大了，请换一张 12 MB 以内的。', en: 'That photo is too large; use one under 12 MB.' },
  photo_unreadable: { zh: '读不了这张照片，请换一张 JPG / PNG / WebP。', en: 'Could not read that photo; try a JPG, PNG or WebP.' },
  photo_type: { zh: '只接受 JPG / PNG / WebP 照片。', en: 'Only JPG, PNG or WebP photos.' },
  rate_limited: { zh: '上传太频繁，请稍后再试。', en: 'Too many uploads; try again later.' },
  agent_profile_required: { zh: '请先提交经纪资料。', en: 'Submit your agent details first.' },
  sign_in_required: { zh: '请先登录。', en: 'Please sign in.' },
}

export default function AgentPhotoControl({ zh, name, photoUrl, onChange }: { zh: boolean; name: string; photoUrl: string | null; onChange: (url: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const say = (k: string) => (ERR[k] ? (zh ? ERR[k].zh : ERR[k].en) : zh ? '没成功，请稍后再试。' : 'That did not go through; try again.')
  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? null

  const pick = async (f: File | null) => {
    if (!f) return
    setBusy(true); setErr(null)
    try {
      const blob = await squarePhoto(f, AGENT_PHOTO_SIDE)
      const fd = new FormData()
      fd.append('image', blob, blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg')
      const tk = await token()
      const r = await fetch('/api/agents/photo', { method: 'POST', headers: { Authorization: `Bearer ${tk ?? ''}` }, body: fd })
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!r.ok || !j.url) { setErr(say(j.error || '')); return }
      onChange(j.url)
    } catch (e) {
      setErr(say((e as Error).message))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const remove = async () => {
    setBusy(true); setErr(null)
    const tk = await token()
    const r = await fetch('/api/agents/photo', { method: 'DELETE', headers: { Authorization: `Bearer ${tk ?? ''}` } })
    setBusy(false); setConfirm(false)
    if (!r.ok) { setErr(say('')); return }
    onChange(null)
  }

  return (
    <div data-testid="agent-photo-control" className="flex flex-wrap items-center gap-4">
      <AgentAvatar name={name} size={72} photoUrl={photoUrl} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-body-2">{zh ? '主页照片' : 'Profile photo'}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-body-3">
          {zh ? '你本人的正面照片，会裁成正方形；不要用公司 logo 或别人的照片。没有照片时显示姓名首字母。' : 'A photo of yourself, cropped square; not a company logo or someone else. Without one, your initials show.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" data-testid="agent-photo-file" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50" data-testid="agent-photo-pick">
            {busy ? '…' : photoUrl ? (zh ? '换一张' : 'Replace') : (zh ? '上传照片' : 'Upload a photo')}
          </button>
          {photoUrl && !confirm && (
            <button type="button" disabled={busy} onClick={() => setConfirm(true)} className="text-[12.5px] text-body-3 underline-offset-2 hover:underline" data-testid="agent-photo-remove">{zh ? '移除' : 'Remove'}</button>
          )}
          {confirm && (
            <span data-testid="agent-photo-remove-confirm" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px]">
              {zh ? '移除照片，改回首字母？' : 'Remove the photo and show initials?'}
              <button type="button" disabled={busy} onClick={remove} className="rounded-full bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-60">{zh ? '确认' : 'Confirm'}</button>
              <button type="button" onClick={() => setConfirm(false)} className="underline-offset-2 hover:underline">{zh ? '取消' : 'Cancel'}</button>
            </span>
          )}
        </div>
        {err && <div className="mt-1 text-[12px] font-semibold text-red-700" data-testid="agent-photo-error">⚠ {err}</div>}
      </div>
    </div>
  )
}

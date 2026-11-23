'use client'
// The photo or logo on a provider's record, on /provider/onboard (2026-11-23): pick a file → the
// browser crops a 512px square → POST /api/providers/photo (the only writer of
// service_providers.photo_key). Remove is a two-step in page. It shows on the directory cards and
// on /providers/<id>. The agent's control (components/agent/AgentPhotoControl.tsx) is the model.
import { useRef, useState } from 'react'
import ProviderAvatar from '@/components/directory/ProviderAvatar'
import { squarePhoto } from '@/lib/agent/avatarImage'
import { PROVIDER_PHOTO_SIDE } from '@/lib/providerPhotoKeys'
import { supabase } from '@/lib/supabase'

const ERR: Record<string, { zh: string; en: string }> = {
  photo_too_large: { zh: '图片太大了，请换一张 12 MB 以内的。', en: 'That image is too large; use one under 12 MB.' },
  photo_unreadable: { zh: '读不了这张图片，请换一张 JPG / PNG / WebP。', en: 'Could not read that image; try a JPG, PNG or WebP.' },
  photo_type: { zh: '只接受 JPG / PNG / WebP 图片。', en: 'Only JPG, PNG or WebP images.' },
  rate_limited: { zh: '上传太频繁，请稍后再试。', en: 'Too many uploads; try again later.' },
  provider_record_required: { zh: '请先提交入驻资料。', en: 'Submit your details first.' },
  sign_in_required: { zh: '请先登录。', en: 'Please sign in.' },
}

export default function ProviderPhotoControl({ zh, name, photoUrl, onChange }: { zh: boolean; name: string; photoUrl: string | null; onChange: (url: string | null) => void }) {
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
      const blob = await squarePhoto(f, PROVIDER_PHOTO_SIDE)
      const fd = new FormData()
      fd.append('image', blob, blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg')
      const tk = await token()
      const r = await fetch('/api/providers/photo', { method: 'POST', headers: { Authorization: `Bearer ${tk ?? ''}` }, body: fd })
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
    const r = await fetch('/api/providers/photo', { method: 'DELETE', headers: { Authorization: `Bearer ${tk ?? ''}` } })
    setBusy(false); setConfirm(false)
    if (!r.ok) { setErr(say('')); return }
    onChange(null)
  }

  return (
    <div data-testid="provider-photo-control" className="flex flex-wrap items-center gap-4">
      <ProviderAvatar name={name} size={72} photoUrl={photoUrl} />
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="text-[12.5px] font-semibold text-body-2">{zh ? '头像或标志' : 'Photo or logo'}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-body-3">
          {zh ? '你本人的照片或公司的标志，会裁成正方形，显示在目录卡片和你的主页上。没有时显示名称首字母。' : 'A photo of yourself or your company logo, cropped square; it shows on the directory card and on your page. Without one, your initial shows.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" data-testid="provider-photo-file" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-full border border-line-strong px-3.5 py-1.5 text-[12.5px] font-semibold text-body hover:border-brand hover:text-brand disabled:opacity-50" data-testid="provider-photo-upload">
            {busy ? '…' : photoUrl ? (zh ? '换一张' : 'Replace') : (zh ? '上传图片' : 'Upload an image')}
          </button>
          {photoUrl && !confirm && (
            <button type="button" disabled={busy} onClick={() => setConfirm(true)} className="text-[12.5px] text-body-3 underline-offset-2 hover:underline" data-testid="provider-photo-remove">{zh ? '移除' : 'Remove'}</button>
          )}
          {confirm && (
            <span data-testid="provider-photo-remove-confirm" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px]">
              {zh ? '移除图片，改回首字母？' : 'Remove the image and show the initial?'}
              <button type="button" disabled={busy} onClick={remove} className="rounded-full bg-amber-600 px-3 py-1 font-semibold text-white disabled:opacity-60">{zh ? '确认' : 'Confirm'}</button>
              <button type="button" onClick={() => setConfirm(false)} className="underline-offset-2 hover:underline">{zh ? '取消' : 'Cancel'}</button>
            </span>
          )}
        </div>
        {err && <div className="mt-1 text-[12px] font-semibold text-red-700" data-testid="provider-photo-error">⚠ {err}</div>}
      </div>
    </div>
  )
}

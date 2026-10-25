'use client'
// Move-in / move-out condition photos on a household (2026-10-27). Either
// member uploads; each photo is hashed on this device, stored in the tenancy's
// private bucket and recorded with the server's time; rows are append-only.
// The view is the rooms of the checklist, move-in on the left, move-out on the
// right — for people to compare. No AI grading of damage.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { downscalePhoto } from '@/lib/agent/avatarImage'
import {
  CONDITION_PHASES, CONDITION_PHOTO_MAX_SIDE, MAX_CONDITION_PHOTO_BYTES, MAX_CONDITION_PHOTOS_PER_ITEM,
  conditionPhotoPath, pairByItem, photoItemsFor, roomFor, sha256HexOf, type ConditionPhase, type ConditionPhotoRow,
} from '@/lib/household/conditionPhotos'

const COLS = 'id, household_id, phase, item_key, path, sha256, bytes, content_type, note, taken_by, created_at'

export default function ConditionPhotos({ householdId, zh, province = 'ON' }: { householdId: string; zh: boolean; province?: string | null }) {
  const { user } = useAuth()
  const items = photoItemsFor(province)
  const [rows, setRows] = useState<ConditionPhotoRow[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [phase, setPhase] = useState<ConditionPhase>('move_in')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('condition_photos').select(COLS).eq('household_id', householdId).order('created_at')
    const list = (data ?? []) as ConditionPhotoRow[]
    setRows(list)
    if (list.length) {
      const { data: signed } = await supabase.storage.from('tenancy-files').createSignedUrls(list.map((r) => r.path), 600)
      const map: Record<string, string> = {}
      for (const s of signed ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl
      setUrls(map)
    }
  }, [householdId])
  useEffect(() => { void load() }, [load])

  if (!rows) return null
  const pairs = pairByItem(rows, items)
  const total = rows.length

  async function add(itemKey: string, files: FileList) {
    if (!user) return
    setErr(null)
    const room = roomFor(rows ?? [], phase, itemKey)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)).slice(0, room)
    if (!list.length) { setErr(zh ? `这一处的${phase === 'move_in' ? '入住' : '退租'}照片已满 ${MAX_CONDITION_PHOTOS_PER_ITEM} 张，或者选的不是图片。` : `This item already has ${MAX_CONDITION_PHOTOS_PER_ITEM} ${phase === 'move_in' ? 'move-in' : 'move-out'} photos, or the files are not images.`); return }
    setBusy(itemKey)
    try {
      for (const f of list) {
        const blob = await downscalePhoto(f, CONDITION_PHOTO_MAX_SIDE, 0.85)
        if (blob.size > MAX_CONDITION_PHOTO_BYTES) { setErr(zh ? '有一张照片太大，没有上传。' : 'One photo was too large and was skipped.'); continue }
        const sha256 = await sha256HexOf(blob)
        const id = crypto.randomUUID()
        const path = conditionPhotoPath(householdId, phase, itemKey, id, 'jpg')
        const up = await supabase.storage.from('tenancy-files').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
        if (up.error) { setErr(zh ? `上传没成功：${up.error.message}` : `Upload failed: ${up.error.message}`); continue }
        const { error } = await supabase.from('condition_photos').insert({ id, household_id: householdId, phase, item_key: itemKey, path, sha256, bytes: blob.size, content_type: 'image/jpeg', taken_by: user.id })
        if (error) setErr(error.code === '42501' || /row-level security/i.test(error.message) ? (zh ? '没有记录成功：只有这份租约的成员可以上传。' : 'Not recorded: only members of this tenancy can upload.') : error.message)
      }
      await load()
    } finally { setBusy(null) }
  }

  const thumb = (r: ConditionPhotoRow) => (
    <a key={r.id} href={urls[r.path] || '#'} target="_blank" rel="noreferrer" className="block w-[88px] flex-none" title={`SHA-256 ${r.sha256}`}>
      {urls[r.path] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urls[r.path]} alt="" className="h-[66px] w-[88px] rounded-md border border-line-divider object-cover" />
      ) : <div className="h-[66px] w-[88px] rounded-md border border-line-divider bg-surface-chip" />}
      <div className="mt-0.5 truncate font-mono text-[9.5px] text-body-3">{r.created_at.slice(0, 10)}{r.taken_by === user?.id ? (zh ? ' · 我' : ' · me') : ''}</div>
    </a>
  )

  return (
    <section className="rounded-xl border border-line-divider bg-white p-5" data-testid="condition-photos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-extrabold">{zh ? '入住 / 退租状态照片' : 'Move-in / move-out condition photos'}</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-body-3">{total}</span>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline">{open ? (zh ? '收起' : 'Hide') : (zh ? '展开' : 'Show')}</button>
        </div>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-body-3">{zh ? '照片上传时在你的设备上算好 SHA-256，连同服务器时间记录在租约档案里，记录只追加、不能删；退租时拍同一处放右栏，双方对照。证据包里列出每张的哈希与时间。' : 'Each photo is hashed (SHA-256) on your device and recorded with the server time in the tenancy record; records are append-only. At move-out, photograph the same spots into the right column so both sides can compare. The evidence pack lists every hash and time.'}</p>
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      {open && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold" data-testid="condition-phase">
            <span className="text-body-3">{zh ? '现在上传的是：' : 'Uploading as:'}</span>
            {CONDITION_PHASES.map((p) => (
              <button key={p.key} type="button" onClick={() => setPhase(p.key)} aria-pressed={phase === p.key} className={`rounded-full px-3 py-1 ${phase === p.key ? 'bg-ink text-white' : 'border border-line-divider text-body-2'}`}>{zh ? p.label.zh : p.label.en}</button>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-body-3"><th className="py-1 pr-2">{zh ? '位置' : 'Item'}</th><th className="py-1 pr-2">{zh ? '入住' : 'Move-in'}</th><th className="py-1">{zh ? '退租' : 'Move-out'}</th></tr></thead>
              <tbody>
                {pairs.map(({ item, move_in, move_out }) => (
                  <tr key={item.key} className="border-t border-line-divider align-top" data-testid={`condition-row-${item.key}`}>
                    <td className="py-2 pr-2 font-semibold">{zh ? item.label.zh : item.label.en}</td>
                    {(['move_in', 'move_out'] as const).map((ph) => {
                      const list = ph === 'move_in' ? move_in : move_out
                      return (
                        <td key={ph} className="py-2 pr-2">
                          <div className="flex flex-wrap gap-2">
                            {list.map(thumb)}
                            {ph === phase && user && roomFor(rows, ph, item.key) > 0 && (
                              <label className={`flex h-[66px] w-[88px] cursor-pointer items-center justify-center rounded-md border border-dashed border-line-strong text-[11px] text-body-2 hover:border-brand hover:text-brand ${busy === item.key ? 'opacity-50' : ''}`}>
                                {busy === item.key ? '…' : (zh ? '+ 照片' : '+ photo')}
                                <input type="file" accept="image/*,.heic,.heif" multiple className="hidden" disabled={busy === item.key} onChange={(e) => { if (e.target.files) void add(item.key, e.target.files); e.target.value = '' }} data-testid={`condition-add-${item.key}`} />
                              </label>
                            )}
                            {!list.length && ph !== phase && <span className="text-[11px] text-body-3">—</span>}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

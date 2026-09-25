'use client'

// Tenant "new maintenance request" modal (app/tenant/maintenance).
// 2026-09-23: the photo tiles were decorative and Submit only closed the
// modal ("点击照片不能上传"). Now: real file picker with previews, photos go
// to the private tenancy-files bucket under <household_id>/tickets/<id>/,
// and the ticket is a real maintenance_tickets row on the tenant's managed
// tenancy (same table the /h/[id] hub and the landlord board read).
// Without a confirmed tenancy there is nobody to send it to, so the modal
// says so instead of pretending.
import { notifyTicket } from '@/lib/household/notifyTicket'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'
import { prepareUploads } from '@/lib/screening/prepareUpload'
import { isEmergencyMaintenance } from '@/lib/agent/maintenanceTriage'
import { acceptTicketPhotos, MAX_TICKET_PHOTOS, MAX_TICKET_PHOTO_BYTES, ticketCategoryFor, ticketPhotoPath, ticketTitleFrom } from '@/lib/household/ticketPhotos'

export const CATEGORIES = [
  { id: 'plumbing', icon: '🔧', label: { zh: '水管 / 漏水', en: 'Plumbing / leak' } },
  { id: 'electrical', icon: '⚡', label: { zh: '电器 / 电路', en: 'Appliance / wiring' } },
  { id: 'hvac', icon: '❄️', label: { zh: '暖气 / 空调', en: 'Heating / AC' } },
  { id: 'lock', icon: '🔑', label: { zh: '钥匙 / 锁', en: 'Keys / lock' } },
]

export const URGENCY = [
  { id: 'low', label: { zh: '不急 · 7 天内', en: 'Low · within 7 days' } },
  { id: 'medium', label: { zh: '普通 · 48 小时内', en: 'Normal · within 48 hrs' } },
  { id: 'high', label: { zh: '紧急 · 24 小时', en: 'Urgent · 24 hrs' } },
]

type Household = { id: string; address: string; unit: string | null }
type Photo = { file: File; url: string }

export default function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (ticketId: string, householdId: string) => void }) {
  const name = useAIName()
  const { lang } = useT()
  const zh = lang === 'zh'
  const auth = useAuth()
  const [cat, setCat] = useState('')
  const [urg, setUrg] = useState('medium')
  const [desc, setDesc] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [hh, setHh] = useState<Household | null | 'loading'>('loading')
  const [busy, setBusy] = useState<false | 'preparing' | 'uploading' | 'saving'>(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ ticketId: string; householdId: string; failedPhotos: number; notified: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // The tenant's most recent active tenancy (household membership as tenant).
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setHh(null); return }
    let cancelled = false
    ;(async () => {
      const { data: mem } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).eq('role', 'tenant').eq('status', 'active').limit(10)
      const ids = ((mem ?? []) as { household_id: string }[]).map((m) => m.household_id)
      if (!ids.length) { if (!cancelled) setHh(null); return }
      const { data } = await supabase.from('households').select('id, address, unit, start_date').in('id', ids).order('start_date', { ascending: false }).limit(1)
      const row = ((data ?? []) as { id: string; address: string; unit: string | null }[])[0]
      if (!row) { if (!cancelled) setHh(null); return }
      if (!cancelled) setHh({ id: row.id, address: row.address, unit: row.unit })
    })()
    return () => { cancelled = true }
  }, [auth.loading, auth.user])

  // Object URLs are revoked when the modal unmounts.
  useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.url)) }, [photos])

  function pick(list: FileList | null) {
    if (!list) return
    const files = Array.from(list)
    const { accepted, rejected } = acceptTicketPhotos(files, photos.length)
    setPhotos((cur) => [...cur, ...accepted.map((i) => ({ file: files[i], url: URL.createObjectURL(files[i]) }))])
    if (rejected.length) {
      const tooMany = rejected.filter((r) => r.reason === 'too_many').length
      const notImg = rejected.filter((r) => r.reason === 'not_image').length
      setNotice([
        tooMany ? (zh ? `最多 ${MAX_TICKET_PHOTOS} 张，多出的 ${tooMany} 张没有加入` : `Up to ${MAX_TICKET_PHOTOS} photos; ${tooMany} extra skipped`) : null,
        notImg ? (zh ? `${notImg} 个文件不是图片，已跳过` : `${notImg} file(s) are not images; skipped`) : null,
      ].filter(Boolean).join(' · '))
    } else setNotice(null)
    if (inputRef.current) inputRef.current.value = ''
  }
  function remove(i: number) {
    setPhotos((cur) => { URL.revokeObjectURL(cur[i].url); return cur.filter((_, k) => k !== i) })
  }

  const emergency = isEmergencyMaintenance({ description: desc, category: ticketCategoryFor(cat) })
  const canSubmit = !!hh && hh !== 'loading' && !busy && desc.trim().length > 0
  const catLabel = CATEGORIES.find((c) => c.id === cat)?.label[lang] || (zh ? '维修请求' : 'Maintenance request')

  async function submit() {
    if (!hh || hh === 'loading' || !auth.user) return
    setErr(null)
    const ticketId = crypto.randomUUID()
    const priority = emergency ? 'high' : urg
    setBusy('saving')
    // Ticket first, photos second: a request must reach the landlord even
    // when one upload fails; the paths are attached once they exist.
    const { error: insErr } = await supabase.from('maintenance_tickets').insert({
      id: ticketId,
      household_id: hh.id,
      opened_by: auth.user.id,
      title: ticketTitleFrom(desc, catLabel),
      description: desc.trim().slice(0, 2000),
      category: ticketCategoryFor(cat),
      priority,
      status: 'new',
      photos: [],
    })
    if (insErr) { setErr(insErr.message); setBusy(false); return }
    let failed = 0
    const paths: string[] = []
    if (photos.length) {
      setBusy('preparing')
      const prepared = await prepareUploads(photos.map((p) => p.file))
      failed += prepared.rejected.length
      setBusy('uploading')
      let i = 0
      for (const p of prepared.accepted) {
        if (p.file.size > MAX_TICKET_PHOTO_BYTES) { failed += 1; continue }
        const path = ticketPhotoPath(hh.id, ticketId, i, p.file.name)
        const { error } = await supabase.storage.from('tenancy-files').upload(path, p.file, { contentType: p.file.type || 'image/jpeg', upsert: false })
        if (error) { failed += 1; continue }
        paths.push(path); i += 1
      }
      if (paths.length) {
        const { error } = await supabase.from('maintenance_tickets').update({ photos: paths }).eq('id', ticketId)
        if (error) failed += paths.length
      }
    }
    // Photos are attached first so the landlord's email links to a complete ticket.
    const notified = await notifyTicket(ticketId)
    setBusy(false)
    setDone({ ticketId, householdId: hh.id, failedPhotos: failed, notified })
    onCreated?.(ticketId, hh.id)
  }

  const eyebrow = hh && hh !== 'loading'
    ? `${hh.address}${hh.unit ? ` #${hh.unit}` : ''} · ${zh ? '维修 · 发给房东' : 'MAINTENANCE · TO THE LANDLORD'}`
    : hh === 'loading' ? '…' : (zh ? '维修 · 尚未加入在管租约' : 'MAINTENANCE · NO MANAGED TENANCY YET')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur sm:items-center" role="dialog" aria-modal="true">
      <div className="sl-card max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto p-5 sm:p-9">
        {done ? (
          <div data-testid="ticket-created">
            <div className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3">{eyebrow}</div>
            <h3 className="mt-2 text-[24px] font-bold tracking-tight">{zh ? '已提交' : 'Submitted'}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
              {zh
                ? `工单已记录在你的在管租约上${done.notified ? '，并已通过邮件和推送通知房东' : '，房东在工作台就能看到'}。${photos.length ? `照片 ${photos.length - done.failedPhotos}/${photos.length} 张已附上。` : ''}`
                : `The ticket is on your managed tenancy${done.notified ? ' and your landlord has been emailed' : '; the landlord sees it in their workspace'}. ${photos.length ? `${photos.length - done.failedPhotos}/${photos.length} photos attached.` : ''}`}
            </p>
            {done.failedPhotos > 0 && <p className="mt-2 text-[12.5px] text-amber-800">{zh ? `${done.failedPhotos} 张照片未能上传，可在租约页的报修标签里补传。` : `${done.failedPhotos} photo(s) failed to upload; you can add them from the tenancy page.`}</p>}
            <div className="mt-6 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-[10px] border border-line-strong bg-white py-[12px] text-[14px] font-semibold text-body">{zh ? '关闭' : 'Close'}</button>
              <Link href={`/h/${done.householdId}?tab=maintenance`} className="sl-btn-primary flex-1 !py-[12px] text-center">{zh ? '查看工单 →' : 'View ticket →'}</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="font-mono text-[10.5px] uppercase tracking-eyebrowLg text-body-3">{eyebrow}</div>
            <h3 className="mt-2 text-[24px] font-bold tracking-tight">{zh ? '什么情况?' : "What's going on?"}</h3>
            <p className="mt-1 text-[13px] text-body-2">
              {zh
                ? `${name} 会按你描述的紧急程度给房东一个建议响应时间。`
                : `${name} will suggest a response time to the landlord based on the urgency you describe.`}
            </p>

            {hh === null && (
              <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900" data-testid="no-household">
                {zh
                  ? '你还没有已确认的在管租约，工单没有可发送的房东。先'
                  : 'You have no confirmed managed tenancy yet, so there is no landlord to send this to. First '}
                <Link href="/leases/import" className="font-bold underline">{zh ? '导入已签租约' : 'import your signed lease'}</Link>
                {zh ? '或接受房东的邀请；也可以直接对助手描述问题。' : ' or accept your landlord’s invite; you can also describe the issue to the assistant.'}
              </div>
            )}

            {/* Category pills */}
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  className={
                    'flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-4 text-center transition ' +
                    (cat === c.id ? 'border-brand bg-brand/5 text-brand' : 'border-line-strong bg-white text-body hover:border-brand/40')
                  }
                >
                  <span className="text-[20px]">{c.icon}</span>
                  <span className="text-[12px] font-semibold">{c.label[lang]}</span>
                </button>
              ))}
            </div>

            {/* Description */}
            <div className="mt-5">
              <div className="sl-eyebrow">{zh ? '详细描述' : 'Details'}</div>
              <textarea
                className="sl-input mt-1.5 h-24 py-2"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={2000}
                placeholder={zh
                  ? '例如：厨房洗碗机不通电。今早开机没反应，电源指示灯也不亮。其他电器正常。'
                  : "e.g. The kitchen dishwasher has no power. It didn't respond this morning and the power light is off. Other appliances work fine."}
              />
              {emergency && <p className="mt-1.5 text-[12px] font-semibold text-red-700">{zh ? '这听起来是紧急情况（RTA s.20）：会按「紧急」提交，房东收到的邮件主题会标【紧急】。' : 'This sounds like an emergency (RTA s.20): it will be filed as urgent and the landlord’s email is marked as such.'}</p>}
            </div>

            {/* Urgency pills */}
            <div className="mt-5">
              <div className="sl-eyebrow">{zh ? '紧急程度' : 'Urgency'}</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {URGENCY.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUrg(u.id)}
                    className={
                      'rounded-xl border-2 px-3 py-3 text-center text-[12.5px] font-semibold transition ' +
                      ((emergency ? 'high' : urg) === u.id ? 'border-brand bg-brand/5 text-brand' : 'border-line-strong bg-white text-body hover:border-brand/40')
                    }
                  >
                    {u.label[lang]}
                  </button>
                ))}
              </div>
            </div>

            {/* Photos */}
            <div className="mt-5">
              <div className="sl-eyebrow">{zh ? `照片（可选 · 最多 ${MAX_TICKET_PHOTOS} 张）` : `Photos (optional · up to ${MAX_TICKET_PHOTOS})`}</div>
              <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => pick(e.target.files)} data-testid="ticket-photo-input" />
              <div className="mt-1.5 grid grid-cols-5 gap-2">
                {photos.map((p, i) => (
                  <div key={p.url} className="relative aspect-square overflow-hidden rounded-xl border border-line-divider bg-surface-chip">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.file.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={zh ? '移除照片' : 'Remove photo'}
                      className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-[14px] leading-none text-white"
                    >×</button>
                  </div>
                ))}
                {photos.length < MAX_TICKET_PHOTOS && Array.from({ length: MAX_TICKET_PHOTOS - photos.length }).map((_, i) => (
                  <button
                    key={`slot-${i}`}
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    aria-label={zh ? '添加照片' : 'Add photo'}
                    className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-line-strong bg-surface-chip text-[18px] text-body-4 transition hover:border-brand/40 hover:text-brand"
                  >
                    {i === 0 ? '📷' : '+'}
                  </button>
                ))}
              </div>
              {notice && <p className="mt-1.5 text-[12px] text-amber-800">{notice}</p>}
              <p className="mt-1.5 text-[11px] text-body-3">{zh ? '大照片会自动压缩；只有你和房东（及房东指派的服务商）能看到。' : 'Large photos are compressed; only you, the landlord and any provider they dispatch can see them.'}</p>
            </div>

            {/* What happens next */}
            <div className="mt-6 rounded-xl border border-tenant/22 bg-tenant/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, #C4B5FD, #00ACE4 70%)' }} />
                <span className="text-[12px] font-bold text-tenant-deep">{zh ? `${name} · 你提交后会发生什么：` : `${name} · what happens after you submit:`}</span>
              </div>
              <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-tenant-deep">
                {zh ? (
                  <>
                    <li>· 工单立刻出现在房东的维修看板与在管租约页，房东可自己处理或派给服务商</li>
                    <li>· 类别与紧急程度会被记录；RTA s.20 要求房东保持房屋处于良好维修状态</li>
                    <li>· 状态变化、派单与完工都留痕，争议时可溯</li>
                  </>
                ) : (
                  <>
                    <li>· The ticket appears at once on the landlord’s maintenance board and the tenancy page; they can handle it or dispatch a provider</li>
                    <li>· Category and urgency are recorded; RTA s.20 requires the landlord to keep the unit in good repair</li>
                    <li>· Every status change, dispatch and completion is logged, traceable if a dispute arises</li>
                  </>
                )}
              </ul>
            </div>

            {err && <p className="mt-3 text-[12.5px] text-danger" role="alert">{err}</p>}
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={onClose} disabled={!!busy} className="flex-1 rounded-[10px] border border-line-strong bg-white py-[12px] text-[14px] font-semibold text-body disabled:opacity-50">
                {zh ? '取消' : 'Cancel'}
              </button>
              <button type="button" onClick={() => void submit()} disabled={!canSubmit} className="sl-btn-primary flex-1 !py-[12px] disabled:opacity-50" data-testid="ticket-submit">
                {busy === 'preparing' ? (zh ? '压缩照片…' : 'Compressing…') : busy === 'uploading' ? (zh ? '上传照片…' : 'Uploading…') : busy === 'saving' ? (zh ? '提交中…' : 'Saving…') : (zh ? '提交' : 'Submit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

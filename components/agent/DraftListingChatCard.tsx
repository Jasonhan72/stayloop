'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { DraftListing } from '@/lib/agent/types'
import { LISTING_EDIT_DRAFT_PREFIX, LISTING_PUBLISH_MSG, buildListingPatch, buildListingRow, computeListingSource, draftCardKey, draftDoneKey, draftSlotKey, makeListingSlug, markDraftDone, publishListing, readDraftDone, readDraftSlot, resolveLandlordId, saveDraftSlot, updateListing, type DraftDone, type ExistingListing, type UpdatedListingRow } from '@/lib/listingPublish'

type Props = {
  draft: DraftListing
  onPublished?: (slug: string) => void
}

export default function DraftListingChatCard({ draft, onPublished }: Props) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState<DraftListing>({ ...draft })
  const [photos, setPhotos] = useState<string[]>(draft.images ?? [])
  const [photoIdx, setPhotoIdx] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 2026-09-30: a rewrite of a listing the landlord already owns — 更新房源 writes only what the AI
  // changed (plus photos the landlord changed here), 编辑 opens that listing's own editor.
  const isUpdate = !!form.listing_id
  const changedFields = form.changed_fields ?? []
  const photosChanged = JSON.stringify(photos) !== JSON.stringify(draft.images ?? [])
  const nothingToUpdate = isUpdate && changedFields.length === 0 && !photosChanged
  const [updatedRow, setUpdatedRow] = useState<UpdatedListingRow | null>(null)
  const [done, setDone] = useState<DraftDone | null>(null)
  const [existing, setExisting] = useState<ExistingListing | null>(null)
  // This card's own slot (user × card), not one global slot shared by every card in the
  // thread and every account on the browser (sweep 2026-10-01). The key comes from the
  // card's original draft, which the chat thread stores unchanged.
  const cardKey = useMemo(() => draftCardKey(draft), [draft])
  const uid = user?.id ?? null

  const reloadFromStorage = useCallback(() => {
    if (!uid) return
    let store: Storage
    try { store = window.localStorage } catch { return }
    // Published or updated already (here, or from the editor page): render as done after a reload.
    const d = readDraftDone(store, uid, cardKey)
    if (d) {
      setDone(d)
      if (d.row) setUpdatedRow(d.row)
      setPublished(true)
      return
    }
    // An edit saved in the draft editor (new drafts only — a rewrite edits the listing itself).
    if (draft.listing_id) return
    const saved = readDraftSlot(store, uid, cardKey)
    if (saved) {
      setForm(saved)
      setPhotos(saved.images ?? [])
      setPhotoIdx(0)
    }
  }, [uid, cardKey, draft.listing_id])

  useEffect(() => {
    reloadFromStorage()
    const onVisible = () => { if (document.visibilityState === 'visible') reloadFromStorage() }
    const onStorage = (e: StorageEvent) => { if (uid && (e.key === draftSlotKey(uid, cardKey) || e.key === draftDoneKey(uid, cardKey))) reloadFromStorage() }
    window.addEventListener('focus', reloadFromStorage)
    window.addEventListener('pageshow', reloadFromStorage)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', reloadFromStorage)
      window.removeEventListener('pageshow', reloadFromStorage)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reloadFromStorage, uid, cardKey])

  const recordDone = (d: Omit<DraftDone, 'at'>) => {
    if (!uid) return
    try { markDraftDone(window.localStorage, uid, cardKey, d) } catch {}
  }

  const openEditPage = () => {
    if (isUpdate && form.listing_id) {
      // The listing's own editor, pre-filled with ONLY the AI's changes (the editor loads everything else
      // from the database; photos travel only if changed here). Nothing is saved until the landlord saves there.
      // base_updated_at: the editor refuses to apply a card older than the listing without asking.
      const stash: Record<string, unknown> = { changed_fields: changedFields, base_updated_at: form.base_updated_at ?? null }
      for (const k of changedFields) stash[k] = (form as Record<string, unknown>)[k]
      if (photosChanged) { stash.images = photos; stash.changed_fields = [...changedFields.filter((k) => k !== 'images'), 'images'] }
      try { localStorage.setItem(LISTING_EDIT_DRAFT_PREFIX + form.listing_id, JSON.stringify(stash)) }
      catch { setError(zh ? '修改内容太大，没能带到编辑页（通常是照片太多）。可以先点「更新房源」，再去编辑页调整照片。' : 'The changes are too large to carry to the editor (usually photos). Press Update first, then adjust photos in the editor.'); return }
      router.push(`/dashboard/listings/${form.listing_id}/edit?from=agent`)
      return
    }
    if (!uid) { setError(zh ? '请先登录再编辑草稿。' : 'Sign in to edit the draft.'); return }
    let ok = false
    try { ok = saveDraftSlot(window.localStorage, uid, cardKey, { ...form, images: photos }) } catch {}
    if (!ok) { setError(zh ? '草稿太大，没能带到编辑页（通常是照片太多）。可以直接在卡片上发布，发布后再到房源编辑页调整照片。' : 'The draft is too large to carry to the editor (usually photos). Publish from the card, then adjust the photos in the listing editor.'); return }
    router.push(`/dashboard/listings/edit?card=${encodeURIComponent(cardKey)}`)
  }

  const den = !!form.has_den
  const specs = [
    form.bedrooms ? `${form.bedrooms}B${den ? ' + den' : ''}` : null,
    form.bathrooms ? `${form.bathrooms} ${zh ? '浴' : 'bath'}` : null,
    form.sqft ? `${form.sqft} sqft` : null,
  ].filter(Boolean) as string[]
  const amenities = (form.amenities || []).slice(0, 3)

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((f) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setPhotos((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const handlePublish = async () => {
    if (!user || !form.address || !form.monthly_rent) return
    setPublishing(true)
    setError(null)
    setExisting(null)
    try {
      const client = getSupabaseBrowser()
      if (isUpdate && form.listing_id) {
        const res = await updateListing(client, form.listing_id, buildListingPatch(form, photosChanged ? photos : null, changedFields), { zh, expectedUpdatedAt: form.base_updated_at ?? null })
        if (res.error !== null || !res.row) throw new Error(res.error ?? 'update failed')
        setUpdatedRow(res.row)
        setPublished(true)
        recordDone({ kind: 'updated', slug: res.row.slug, address: form.address, unit: form.unit ?? null, listing_id: form.listing_id, row: res.row })
        onPublished?.(res.row.slug || form.listing_slug || '')
        return
      }
      // Dual-ID: RLS requires landlords.id (profileId), not auth.uid()
      const landlordId = await resolveLandlordId(client, user.id)
      if (!landlordId) throw new Error(zh ? LISTING_PUBLISH_MSG.landlordNotFound.zh : LISTING_PUBLISH_MSG.landlordNotFound.en)
      const slug = makeListingSlug(form.address)
      const row = buildListingRow(form, { landlordId, slug, photos })
      const { error: publishErr, existing: dup } = await publishListing(client, row, { zh })
      if (dup) setExisting(dup)
      if (publishErr) throw new Error(publishErr)
      setPublished(true)
      recordDone({ kind: 'published', slug, address: form.address, unit: form.unit ?? null, source: computeListingSource(form) })
      onPublished?.(slug)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  if (published) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border-2 border-success/30 bg-white">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <div className="text-[15px] font-bold text-success" data-testid="draft-card-done">{isUpdate ? (zh ? '房源已更新' : 'Listing updated') : (zh ? '房源已发布' : 'Published!')}</div>
          <div className="text-[12px] text-body-3">{done?.address ?? form.address}{(done ? done.unit : form.unit) ? ` · ${done ? done.unit : form.unit}` : ''}</div>
          <div className="mt-1 text-[11.5px] text-body-3">
            {isUpdate && updatedRow
              ? (() => {
                  // Say what is actually true after the write (the DB may have sent it back to review).
                  const live = updatedRow.is_active && (updatedRow.verification_status === 'verified' || updatedRow.source === 'realtor')
                  const text = !updatedRow.is_active
                    ? (zh ? '修改已保存；这套房源目前是下架状态，可在编辑页重新上架。' : 'Saved. The listing is currently off market; you can relist it in the editor.')
                    : live
                      ? (zh ? '修改已保存并已在房源页生效。' : 'Saved and live on the listing page.')
                      : (zh ? '修改已保存；因为改了租金或户型等信息，房源已回到待审核，通过后重新公开。' : 'Saved. Because rent or layout changed, the listing went back to review and reappears once approved.')
                  return (<>
                    {text}
                    {live && updatedRow.slug && <> <a href={`/listings/${updatedRow.slug}`} className="font-semibold text-brand">{zh ? '查看房源 →' : 'View listing →'}</a></>}
                    {!live && form.listing_id && <> <a href={`/dashboard/listings/${form.listing_id}/edit`} className="font-semibold text-brand">{zh ? '去编辑页 →' : 'Open the editor →'}</a></>}
                  </>)
                })()
              : (done?.source ?? computeListingSource(form)) === 'realtor'
              ? (zh ? '已提交审核 · 通过后上线并标注 Realtor.ca 来源' : 'Submitted for review · goes live with a Realtor.ca source badge once approved')
              : (zh ? '待 Stayloop 验证,通过后公开展示并打上 VERIFIED 标' : 'Pending Stayloop verification — goes public with a VERIFIED badge once approved')}
          </div>
        </div>
      </div>
    )
  }

  const hasPhotos = photos.length > 0

  // ── Preview mode: identical structure to ListingChatCard ──
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line-divider bg-white transition hover:shadow-md">
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />

      {/* image — same aspect as ListingChatCard */}
      <div
        className="relative aspect-[1.5/1] w-full cursor-pointer bg-surface-chip"
        style={hasPhotos ? { backgroundImage: `url(${photos[photoIdx]})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        onClick={() => !hasPhotos && fileRef.current?.click()}
      >
        {!hasPhotos && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span className="font-mono text-[10px] text-body-3">{zh ? '点击添加照片' : 'ADD PHOTOS'}</span>
          </div>
        )}
        {/* badge — same position as ListingChatCard */}
        <span className="absolute left-3 top-3 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: '#B45309' }}>
          {isUpdate ? (zh ? '修改稿' : 'REVISION') : (zh ? '草稿' : 'DRAFT')}
        </span>
        {/* + button / heart position */}
        <button
          type="button"
          aria-label={hasPhotos ? (zh ? '再添加照片' : 'Add more photos') : (zh ? '添加照片' : 'Add photos')}
          title={hasPhotos ? (zh ? '再添加照片' : 'Add more photos') : (zh ? '添加照片' : 'Add photos')}
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60"
        >
          {hasPhotos ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          ) : (
            <HeartIcon />
          )}
        </button>
        {/* photo nav */}
        {photos.length > 1 && (
          <>
            <button type="button" aria-label={zh ? '上一张照片' : 'Previous photo'} onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => (i - 1 + photos.length) % photos.length) }} className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">‹</button>
            <button type="button" aria-label={zh ? '下一张照片' : 'Next photo'} onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => (i + 1) % photos.length) }} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">›</button>
          </>
        )}
        {/* photo counter — same position as real listing */}
        {photos.length > 0 && (
          <span className="absolute bottom-3 right-3 rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur">
            {photoIdx + 1} / {photos.length}
          </span>
        )}
      </div>

      {/* body — identical to ListingChatCard */}
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[20px] font-bold tracking-tight">
          ${form.monthly_rent.toLocaleString()}
          <span className="ml-1 text-[12px] font-medium text-body-3">{zh ? '/月' : '/mo'}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px] font-bold text-body">
          {specs.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="h-[3px] w-[3px] rounded-full bg-line-strong" />}
              {s}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[14px] font-bold leading-snug">{form.address}{form.unit ? ` · ${form.unit}` : ''}</div>
        {(form.neighborhood || form.city) && (
          <div className="text-[12.5px] text-body-3">{[form.neighborhood, form.city || 'Toronto'].filter(Boolean).join(' · ')}</div>
        )}
        {(amenities.length > 0 || den) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {amenities.map((t) => (
              <span key={t} className="rounded-md px-2 py-1 font-mono text-[10.5px] text-success" style={{ background: 'rgba(4,120,87,0.08)' }}>
                {t}
              </span>
            ))}
            {den && (
              <span className="rounded-md px-2 py-1 font-mono text-[10.5px] text-success" style={{ background: 'rgba(4,120,87,0.08)' }}>den</span>
            )}
          </div>
        )}
      </div>

      {/* note bar — same as ListingChatCard */}
      {form.description && (
        <div className="border-t border-line-divider px-4 py-2.5 text-[11.5px] leading-snug" style={{ background: 'rgba(0,172,228,0.05)', color: '#5B21B6' }}>
          ◑ {form.description.length > 60 ? form.description.slice(0, 60) + '…' : form.description}
        </div>
      )}

      {isUpdate && (
        <div className="border-t border-line-divider px-4 py-2 text-[11.5px] leading-snug text-body-2" data-testid="draft-card-changes">
          {nothingToUpdate
            ? (zh ? '和现在的房源相比没有改动。' : 'No changes against the current listing.')
            : (zh ? `将更新：${[...changedFields, ...(photosChanged && !changedFields.includes('images') ? ['images'] : [])].map((k) => FIELD_ZH[k] ?? k).join('、')}；其余保持不变。` : `Will update: ${[...changedFields, ...(photosChanged && !changedFields.includes('images') ? ['images'] : [])].map((k) => FIELD_EN[k] ?? k).join(', ')}; everything else stays as it is.`)}
          {form.listing_active === false && (zh ? ' 这套房源目前已下架。' : ' This listing is currently off market.')}
        </div>
      )}
      {/* action bar — edit + publish */}
      <div className="flex border-t border-line-divider">
        <button onClick={openEditPage} className="flex flex-1 items-center justify-center gap-1.5 border-r border-line-divider py-3 text-[12.5px] font-semibold text-body transition hover:bg-surface-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          {zh ? '编辑' : 'Edit'}
        </button>
        <button
          onClick={handlePublish} disabled={publishing || photos.length === 0 || !form.address || !form.monthly_rent || nothingToUpdate} title={photos.length === 0 ? (zh ? '请先添加至少 1 张照片' : 'Add at least one photo first') : nothingToUpdate ? (zh ? '和现在的房源相比没有改动' : 'No changes against the current listing') : undefined}
          className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: '#047857' }}
        >
          {publishing ? '…' : isUpdate ? (zh ? '更新房源' : 'Update listing') : zh ? '发布房源' : 'Publish'}
        </button>
      </div>
      {error && (
        <div className="bg-danger/5 px-4 py-2 text-[11px] text-danger">
          {error}
          {existing && <> <a href={`/dashboard/listings/${existing.id}/edit${existing.is_active ? '' : '?relist=1'}`} className="font-semibold text-brand underline underline-offset-2">{zh ? '打开原房源 →' : 'Open the existing listing →'}</a></>}
        </div>
      )}
    </div>
  )
}

const FIELD_ZH: Record<string, string> = { title: '标题', description: '描述', amenities: '设施', monthly_rent: '月租', bedrooms: '卧室数', bathrooms: '浴室数', sqft: '面积', deposit: '押金', pets_allowed: '宠物', pet_policy: '宠物说明', smoking_policy: '吸烟', lease_term: '租期', utilities_included: '租金包含', furnished: '家具', parking: '车位', parking_spaces: '车位数', available_date: '入住日期', has_den: 'den', images: '照片' }
const FIELD_EN: Record<string, string> = { title: 'title', description: 'description', amenities: 'amenities', monthly_rent: 'rent', bedrooms: 'bedrooms', bathrooms: 'bathrooms', sqft: 'size', deposit: 'deposit', pets_allowed: 'pets', pet_policy: 'pet notes', smoking_policy: 'smoking', lease_term: 'lease term', utilities_included: 'utilities', furnished: 'furnished', parking: 'parking', parking_spaces: 'parking spaces', available_date: 'available date', has_den: 'den', images: 'photos' }

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { DraftListing } from '@/lib/agent/types'
import { LISTING_PUBLISH_MSG, buildListingRow, computeListingSource, makeListingSlug, publishListing, resolveLandlordId } from '@/lib/listingPublish'

const DRAFT_KEY = 'stayloop-draft-listing'

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

  const reloadFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw) as DraftListing
        setForm(d)
        setPhotos(d.images ?? [])
        setPhotoIdx(0)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const onFocus = () => reloadFromStorage()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reloadFromStorage])

  const openEditPage = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...form, images: photos }))
    router.push('/dashboard/listings/edit')
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
    try {
      const client = getSupabaseBrowser()
      // Dual-ID: RLS requires landlords.id (profileId), not auth.uid()
      const landlordId = await resolveLandlordId(client, user.id)
      if (!landlordId) throw new Error(zh ? LISTING_PUBLISH_MSG.landlordNotFound.zh : LISTING_PUBLISH_MSG.landlordNotFound.en)
      const slug = makeListingSlug(form.address)
      const row = buildListingRow(form, { landlordId, slug, photos })
      const { error: publishErr } = await publishListing(client, row, { zh })
      if (publishErr) throw new Error(publishErr)
      setPublished(true)
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
          <div className="text-[15px] font-bold text-success">{zh ? '房源已发布' : 'Published!'}</div>
          <div className="text-[12px] text-body-3">{form.address}</div>
          <div className="mt-1 text-[11.5px] text-body-3">
            {computeListingSource(form) === 'realtor'
              ? (zh ? 'Realtor.ca 来源 · 已直接上线并标注来源' : 'Realtor.ca-sourced · live now with a source badge')
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
          {zh ? '草稿' : 'DRAFT'}
        </span>
        {/* + button / heart position */}
        <button
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
            <button onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => (i - 1 + photos.length) % photos.length) }} className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">‹</button>
            <button onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => (i + 1) % photos.length) }} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">›</button>
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

      {/* action bar — edit + publish */}
      <div className="flex border-t border-line-divider">
        <button onClick={openEditPage} className="flex flex-1 items-center justify-center gap-1.5 border-r border-line-divider py-3 text-[12.5px] font-semibold text-body transition hover:bg-surface-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
          {zh ? '编辑' : 'Edit'}
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing || !form.address || !form.monthly_rent}
          className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: '#047857' }}
        >
          {publishing ? '…' : zh ? '发布房源' : 'Publish'}
        </button>
      </div>
      {error && <div className="bg-danger/5 px-4 py-2 text-[11px] text-danger">{error}</div>}
    </div>
  )
}

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

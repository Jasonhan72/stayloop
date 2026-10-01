'use client'

export const runtime = 'edge'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase'
import { hasUsablePhotos } from '@/lib/listingVisibility'
import { LISTING_EDIT_DRAFT_PREFIX, LISTING_PUBLISH_MSG, changedKeys, isStaleBase, listingSaveOutcomeText, listingStateAfterSave, updateListing } from '@/lib/listingPublish'
import type { DraftListing } from '@/lib/agent/types'
import { prepareUploads } from '@/lib/screening/prepareUpload'

const AMENITY_OPTIONS: { id: string; zh: string; en: string }[] = [
  { id: 'central_ac', zh: '中央空调', en: 'Central A/C' },
  { id: 'heat_incl', zh: '包暖', en: 'Heat included' },
  { id: 'water_incl', zh: '包水', en: 'Water included' },
  { id: 'pool', zh: '游泳池', en: 'Swimming Pool' },
  { id: 'gym', zh: '健身房', en: 'Fitness Centre' },
  { id: 'dishwasher', zh: '洗碗机', en: 'Dishwasher' },
  { id: 'in_unit_laundry', zh: 'in-unit 洗衣', en: 'In-unit laundry' },
  { id: 'concierge', zh: '24h 前台', en: '24h Concierge' },
  { id: 'parking_spot', zh: '1 车位', en: '1 parking spot' },
  { id: 'storage', zh: '储物间', en: 'Storage locker' },
  { id: 'balcony', zh: '阳台', en: 'Balcony' },
  { id: 'rooftop', zh: '天台', en: 'Rooftop' },
]

type Form = {
  title: string
  address: string
  unit: string
  city: string
  neighborhood: string
  monthly_rent: number
  deposit: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  available_date: string
  description: string
  parking: string
  pet_policy: string
  amenities: string[]
  has_den: boolean
  is_active: boolean
  // Lease terms — the draft editor had these since 2026-09-22; the published
  // editor did not, so pets / smoking / utilities could not be changed after
  // publishing (walk-through 2026-09-25).
  lease_term: string
  pets_allowed: string
  smoking_policy: string
  furnished: '' | 'yes' | 'no'
  utilities_included: string[]
}

const UTILITY_OPTIONS: { id: string; zh: string; en: string }[] = [
  { id: 'hydro', zh: '电', en: 'Hydro' },
  { id: 'water', zh: '水', en: 'Water' },
  { id: 'heat', zh: '暖气', en: 'Heat' },
  { id: 'gas', zh: '燃气', en: 'Gas' },
  { id: 'internet', zh: '网络', en: 'Internet' },
  { id: 'cable', zh: '有线电视', en: 'Cable' },
]

const AGENT_FIELD_ZH: Record<string, string> = { title: '标题', description: '描述', amenities: '设施', monthly_rent: '月租', bedrooms: '卧室数', bathrooms: '浴室数', sqft: '面积', deposit: '押金', pets_allowed: '宠物', pet_policy: '宠物说明', smoking_policy: '吸烟', lease_term: '租期', utilities_included: '租金包含', furnished: '家具', parking: '车位', available_date: '入住日期', has_den: 'den', images: '照片' }
const AGENT_FIELD_EN: Record<string, string> = { title: 'title', description: 'description', amenities: 'amenities', monthly_rent: 'rent', bedrooms: 'bedrooms', bathrooms: 'bathrooms', sqft: 'size', deposit: 'deposit', pets_allowed: 'pets', pet_policy: 'pet notes', smoking_policy: 'smoking', lease_term: 'lease term', utilities_included: 'utilities', furnished: 'furnished', parking: 'parking', available_date: 'available date', has_den: 'den', images: 'photos' }

type AgentStash = Partial<DraftListing> & { changed_fields?: string[]; base_updated_at?: string | null }

// The AI's changes (only the fields it changed), stashed by the chat card, over the stored values.
function applyAgentStash(f: Form, d: AgentStash): Form {
  const ch = d.changed_fields ?? []
  const has = (k: string) => ch.includes(k) && (d as Record<string, unknown>)[k] !== undefined && (d as Record<string, unknown>)[k] !== null
  return {
    ...f,
    ...(has('title') ? { title: String(d.title) } : {}),
    ...(has('description') ? { description: String(d.description) } : {}),
    ...(has('monthly_rent') && typeof d.monthly_rent === 'number' ? { monthly_rent: d.monthly_rent } : {}),
    ...(has('deposit') && typeof d.deposit === 'number' ? { deposit: d.deposit } : {}),
    ...(has('bedrooms') && typeof d.bedrooms === 'number' ? { bedrooms: d.bedrooms } : {}),
    ...(has('bathrooms') && typeof d.bathrooms === 'number' ? { bathrooms: d.bathrooms } : {}),
    ...(has('sqft') && typeof d.sqft === 'number' ? { sqft: d.sqft } : {}),
    ...(has('available_date') ? { available_date: String(d.available_date) } : {}),
    ...(has('parking') ? { parking: String(d.parking) } : {}),
    ...(has('pet_policy') ? { pet_policy: String(d.pet_policy) } : {}),
    ...(has('amenities') && Array.isArray(d.amenities) ? { amenities: d.amenities.map(String) } : {}),
    ...(has('has_den') && typeof d.has_den === 'boolean' ? { has_den: d.has_den } : {}),
    ...(has('lease_term') ? { lease_term: String(d.lease_term) } : {}),
    ...(has('pets_allowed') ? { pets_allowed: String(d.pets_allowed) } : {}),
    ...(has('smoking_policy') ? { smoking_policy: String(d.smoking_policy) } : {}),
    ...(has('furnished') && typeof d.furnished === 'boolean' ? { furnished: d.furnished ? 'yes' : 'no' } : {}),
    ...(has('utilities_included') && Array.isArray(d.utilities_included) ? { utilities_included: d.utilities_included.map(String) } : {}),
  }
}

// The landlord-editable content as it is written to the row (is_active is handled
// on its own: going back on the market also restores an archived row).
function listingRowFromForm(form: Form, photos: string[]): Record<string, unknown> {
  return {
    title: form.title || form.address,
    address: form.address,
    unit: form.unit || null,
    city: form.city || 'Toronto',
    neighborhood: form.neighborhood || null,
    monthly_rent: form.monthly_rent,
    deposit: form.deposit,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    sqft: form.sqft,
    available_date: form.available_date || null,
    description: form.description || null,
    parking: form.parking || null,
    pet_policy: form.pet_policy || null,
    amenities: form.amenities,
    has_den: form.has_den,
    lease_term: form.lease_term || null,
    pets_allowed: form.pets_allowed || null,
    smoking_policy: form.smoking_policy || null,
    furnished: form.furnished === '' ? null : form.furnished === 'yes',
    utilities_included: form.utilities_included,
    images: photos,
    photo_count: photos.length,
  }
}

export default function EditPublishedListingPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Form | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  // Opened from the AI's rewrite card (2026-09-30): its changes are pre-filled here; nothing is saved until 保存.
  const [fromAgent, setFromAgent] = useState<string[] | null>(null)
  // A card older than the listing (sweep 2026-10-01): its changes are NOT applied silently —
  // the landlord sees that the listing changed since and decides.
  const [staleStash, setStaleStash] = useState<AgentStash | null>(null)
  // What the row was when this page loaded: the save writes only what differs from it, and only
  // if the row is still at that version (another tab or an AI card may have saved since).
  const [original, setOriginal] = useState<{ form: Form; photos: string[] } | null>(null)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null)
  const [rowStatus, setRowStatus] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [relistMode, setRelistMode] = useState(false)
  // Read (and clear) the AI's stash once, before loading — StrictMode runs the load effect twice.
  const agentStash = useRef<AgentStash | null | undefined>(undefined)
  if (agentStash.current === undefined && typeof window !== 'undefined' && id) {
    try {
      const raw = localStorage.getItem(LISTING_EDIT_DRAFT_PREFIX + id)
      localStorage.removeItem(LISTING_EDIT_DRAFT_PREFIX + id)
      agentStash.current = raw ? JSON.parse(raw) : null
    } catch { agentStash.current = null }
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const client = getSupabaseBrowser()
    client
      .from('listings')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (!data) {
          setLoading(false)
          return
        }
        setSlug(data.slug || '')
        setBaseUpdatedAt((data.updated_at as string | null) ?? null)
        setRowStatus((data.status as string | null) ?? null)
        const loaded: Form = {
          title: data.title || '',
          address: data.address || '',
          unit: data.unit || '',
          city: data.city || 'Toronto',
          neighborhood: data.neighborhood || '',
          monthly_rent: data.monthly_rent || 0,
          deposit: data.deposit ?? null,
          bedrooms: data.bedrooms ?? null,
          bathrooms: data.bathrooms ?? null,
          sqft: data.sqft ?? null,
          available_date: data.available_date || '',
          description: data.description || '',
          parking: data.parking || '',
          pet_policy: data.pet_policy || '',
          amenities: Array.isArray(data.amenities) ? data.amenities : [],
          has_den: !!data.has_den,
          is_active: data.is_active !== false,
          lease_term: data.lease_term || '',
          pets_allowed: data.pets_allowed || '',
          smoking_policy: data.smoking_policy || '',
          furnished: data.furnished == null ? '' : data.furnished ? 'yes' : 'no',
          utilities_included: Array.isArray(data.utilities_included) ? data.utilities_included : [],
        }
        const loadedPhotos: string[] = Array.isArray(data.images) ? data.images : []
        setOriginal({ form: loaded, photos: loadedPhotos })
        // ?relist=1 (the move-out → re-list step): pre-tick 已上架 on an off-market or deleted listing; nothing is saved until 保存.
        const wantsRelist = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('relist') === '1'
        const offMarket = data.is_active === false || data.status === 'archived'
        if (wantsRelist && offMarket) setRelistMode(true)
        setForm(wantsRelist && offMarket ? { ...loaded, is_active: true } : loaded)
        setPhotos(loadedPhotos)
        const d = agentStash.current
        if (d && Array.isArray(d.changed_fields) && d.changed_fields.length) {
          if (isStaleBase(d.base_updated_at, (data.updated_at as string | null) ?? null)) {
            setStaleStash(d)
          } else {
            setForm((f) => (f ? applyAgentStash(f, d) : f))
            if (d.changed_fields.includes('images') && Array.isArray(d.images) && d.images.length) setPhotos(d.images.map(String))
            setFromAgent(d.changed_fields)
          }
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </div>
      </WorkspaceShell>
    )
  }

  if (!form) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center text-body-3">
          {zh ? '未找到该房源' : 'Listing not found'}
        </div>
      </WorkspaceShell>
    )
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))

  const toggleAmenity = (aid: string) => {
    const cur = form.amenities
    const next = cur.includes(aid) ? cur.filter((a) => a !== aid) : [...cur, aid]
    set('amenities', next)
  }

  const handlePhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const picked = Array.from(files)
    e.target.value = ''
    // Same downscaling as the screening upload (long edge 2600px) — the photos are stored as data URLs on the row.
    const prep = await prepareUploads(picked)
    for (const { file } of prep.accepted) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setPhotos((prev) => (prev.length >= 12 ? prev : [...prev, reader.result as string]))
      }
      reader.readAsDataURL(file)
    }
    if (prep.rejected.length) setError(zh ? `${prep.rejected.length} 张照片超过 25 MB，未加入。` : `${prep.rejected.length} photo(s) over 25 MB were skipped.`)
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const applyStaleStash = () => {
    if (!staleStash) return
    setForm((f) => (f ? applyAgentStash(f, staleStash) : f))
    if ((staleStash.changed_fields ?? []).includes('images') && Array.isArray(staleStash.images) && staleStash.images.length) setPhotos(staleStash.images.map(String))
    setFromAgent(staleStash.changed_fields ?? [])
    setStaleStash(null)
  }

  const handleSave = async () => {
    if (!user || !form.address || !original) return
    // A live listing without photos would vanish from /listings yet keep answering on its own URL (review 2026-09-25) — same rule as publishing.
    if (form.is_active && !hasUsablePhotos(photos)) { setError(zh ? LISTING_PUBLISH_MSG.noPhotos.zh : LISTING_PUBLISH_MSG.noPhotos.en); return }
    setSaving(true)
    setError(null)
    setSaved(false)
    setOutcome(null)
    try {
      // Only what changed since this page loaded (sweep 2026-10-01): the old full-snapshot
      // write silently reverted anything another tab or an AI card had saved in between.
      const before = listingRowFromForm(original.form, original.photos)
      const after = listingRowFromForm(form, photos)
      const patch: Record<string, unknown> = Object.fromEntries(changedKeys(before, after).map((k) => [k, after[k]]))
      const archived = rowStatus === 'archived'
      if (form.is_active !== original.form.is_active || (form.is_active && archived)) {
        patch.is_active = form.is_active
        if (form.is_active) {
          // Back on the market: the dashboard lists it again (a deleted row stays hidden otherwise),
          // and days-on-market restart.
          if (archived) patch.status = 'active'
          if (!original.form.is_active) patch.published_at = new Date().toISOString()
        }
      }
      const res = await updateListing(getSupabaseBrowser(), id, patch, { zh, expectedUpdatedAt: baseUpdatedAt, context: 'editor' })
      if (res.error !== null || !res.row) {
        if (res.stale) setStale(true)
        setError(res.error ?? 'save failed')
        return
      }
      setOriginal({ form, photos })
      setBaseUpdatedAt(res.row.updated_at ?? null)
      setRowStatus(res.row.status ?? rowStatus)
      if (res.row.slug) setSlug(res.row.slug)
      setFromAgent(null)
      setRelistMode(false)
      setOutcome(listingSaveOutcomeText(listingStateAfterSave(res.row), zh))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <WorkspaceShell role="landlord" hideAside>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
      <div className="mx-auto max-w-[760px]">
        <Link href="/dashboard" className="font-mono text-[12px] text-body-3 hover:text-body">
          {zh ? '← 返回工作台' : '← Back to workspace'}
        </Link>

        {staleStash && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900" data-testid="agent-edit-stale">
            {zh
              ? `这张 AI 助理卡片生成之后，房源又被改过，所以它的修改（${(staleStash.changed_fields ?? []).map((k) => AGENT_FIELD_ZH[k] ?? k).join('、')}）没有自动带入——下面是房源现在的内容。`
              : `The listing changed after this AI Agent card was made, so its changes (${(staleStash.changed_fields ?? []).map((k) => AGENT_FIELD_EN[k] ?? k).join(', ')}) were not filled in — below is the listing as it is now.`}
            <div className="mt-2 flex flex-wrap gap-3">
              <button onClick={applyStaleStash} className="font-semibold text-brand underline underline-offset-2">{zh ? '仍然带入卡片的修改（保存前可再改）' : 'Fill in the card’s changes anyway (you can still edit before saving)'}</button>
              <button onClick={() => setStaleStash(null)} className="text-body-3 underline underline-offset-2">{zh ? '不用了' : 'Dismiss'}</button>
            </div>
          </div>
        )}
        {(rowStatus === 'archived' || relistMode || (original && !original.form.is_active)) && !outcome && (
          <div className="mt-4 rounded-xl border border-line-strong bg-white px-4 py-3 text-[13px] text-body" data-testid="relist-banner">
            {rowStatus === 'archived'
              ? (zh ? '这套房源之前被删除了（工作台不显示）。照片和价格记录都还在：核对租金、入住日期和照片，勾选「已上架」并保存，就会重新上架并回到工作台。' : 'This listing was deleted earlier (the workspace hides it). Its photos and price history are still here: check the rent, available date and photos, tick “Active” and save to put it back on the market and back in your workspace.')
              : relistMode
                ? (zh ? '重新挂牌：已为你勾选「已上架」（还没保存）。核对租金、入住日期和照片后点「保存修改」。' : 'Relisting: “Active” is ticked for you (not saved yet). Check the rent, available date and photos, then press “Save changes”.')
                : (zh ? '这套房源目前下架。要重新挂牌，核对内容后勾选「已上架」并保存。' : 'This listing is off market. To relist it, check the details, tick “Active” and save.')}
          </div>
        )}
        {fromAgent && (
          <div className="mt-4 rounded-xl border border-brand/30 bg-[#F0FAFE] px-4 py-3 text-[13px] text-body" data-testid="agent-edit-banner">
            {zh
              ? `已带入 AI 助理的修改：${fromAgent.map((k) => AGENT_FIELD_ZH[k] ?? k).join('、')}。检查后点「保存修改」才会生效；不想要可以直接返回。`
              : `Your AI Agent’s changes are filled in: ${fromAgent.map((k) => AGENT_FIELD_EN[k] ?? k).join(', ')}. Nothing is saved until you press “Save changes”; go back to discard them.`}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-4">
          <h1 className="text-[28px] font-bold tracking-tight">
            {zh ? '编辑房源' : 'Edit Listing'}
          </h1>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12px] font-medium">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
              {form.is_active ? (zh ? '已上架' : 'Active') : (zh ? '已下架' : 'Inactive')}
            </label>
            {slug && (
              <a href={`/listings/${slug}`} target="_blank" rel="noreferrer" className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12px] font-medium text-brand hover:border-brand">
                {zh ? '查看 ↗' : 'View ↗'}
              </a>
            )}
          </div>
        </div>

        {/* Photos */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '照片' : 'Photos'}</h2>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5">
            {photos.map((p, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-line-divider">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" />
                <button onClick={() => removePhoto(i)} className="absolute inset-0 flex items-center justify-center bg-black/50 text-[18px] text-white opacity-0 transition group-hover:opacity-100">✕</button>
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                    {zh ? '封面' : 'COVER'}
                  </span>
                )}
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-line-strong text-[28px] text-body-3 hover:border-brand hover:text-brand">+</button>
          </div>
        </section>

        {/* Basic info */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '基本信息' : 'Basic Info'}</h2>
          <div className="mt-4 space-y-4">
            <LabelField label={zh ? '标题' : 'Title'}>
              <input className="sl-input" value={form.title} onChange={(e) => set('title', e.target.value)} />
            </LabelField>
            <LabelField label={zh ? '地址 *' : 'Address *'}>
              <input className="sl-input" value={form.address} onChange={(e) => set('address', e.target.value)} required />
            </LabelField>
            <div className="grid gap-4 sm:grid-cols-3">
              <LabelField label={zh ? '单元号' : 'Unit'}>
                <input className="sl-input" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
              </LabelField>
              <LabelField label={zh ? '社区' : 'Neighborhood'}>
                <input className="sl-input" value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
              </LabelField>
              <LabelField label={zh ? '城市' : 'City'}>
                <input className="sl-input" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </LabelField>
            </div>
          </div>
        </section>

        {/* Layout + price */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '户型 + 价格' : 'Layout + Price'}</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <LabelField label={zh ? '月租 (CAD) *' : 'Rent (CAD) *'}>
                <input className="sl-input" type="number" value={form.monthly_rent} onChange={(e) => set('monthly_rent', Number(e.target.value) || 0)} required />
              </LabelField>
              <LabelField label={zh ? '租金押金 (CAD)' : 'Rent deposit (CAD)'}>
                <input className="sl-input" type="number" value={form.deposit ?? ''} onChange={(e) => set('deposit', e.target.value ? Number(e.target.value) : null)} />
                {form.deposit != null && form.monthly_rent > 0 && form.deposit > form.monthly_rent && (
                  <p className="mt-1 text-[11.5px] text-red-700">{zh ? '安省租金押金最多一个月租金，且只能抵最后一个月租金（RTA s.106）。' : 'Ontario caps the rent deposit at one month and it may only cover the last month (RTA s.106).'}</p>
                )}
              </LabelField>
              <LabelField label={zh ? '卧室' : 'Bedrooms'}>
                <input className="sl-input" type="number" value={form.bedrooms ?? ''} onChange={(e) => set('bedrooms', e.target.value ? Number(e.target.value) : null)} />
              </LabelField>
              <LabelField label={zh ? '浴室' : 'Bathrooms'}>
                <input className="sl-input" type="number" value={form.bathrooms ?? ''} onChange={(e) => set('bathrooms', e.target.value ? Number(e.target.value) : null)} />
              </LabelField>
              <LabelField label={zh ? '面积 (sqft)' : 'Area (sqft)'}>
                <input className="sl-input" type="number" value={form.sqft ?? ''} onChange={(e) => set('sqft', e.target.value ? Number(e.target.value) : null)} />
              </LabelField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <LabelField label={zh ? '入住日期' : 'Available date'}>
                <input className="sl-input" type="date" value={form.available_date} onChange={(e) => set('available_date', e.target.value)} />
              </LabelField>
              <LabelField label={zh ? '停车' : 'Parking'}>
                <input className="sl-input" value={form.parking} onChange={(e) => set('parking', e.target.value)} />
              </LabelField>
              <LabelField label={zh ? '宠物政策' : 'Pet policy'}>
                <input className="sl-input" value={form.pet_policy} onChange={(e) => set('pet_policy', e.target.value)} />
              </LabelField>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.has_den} onChange={(e) => set('has_den', e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-brand" />
              {zh ? '有 Den' : 'Has den'}
            </label>
          </div>
        </section>

        {/* Lease terms — same fields as the draft editor */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '租赁条件' : 'Lease terms'}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <LabelField label={zh ? '租期' : 'Lease term'}>
              <input className="sl-input" value={form.lease_term} onChange={(e) => set('lease_term', e.target.value)} placeholder={zh ? '如：12 个月 / 可短租' : 'e.g. 12 months / short-term OK'} />
            </LabelField>
            <LabelField label={zh ? '宠物' : 'Pets'}>
              <select className="sl-input" value={form.pets_allowed} onChange={(e) => set('pets_allowed', e.target.value)}>
                <option value="">{zh ? '未说明' : 'Not stated'}</option>
                <option value="yes">{zh ? '允许' : 'Allowed'}</option>
                <option value="restricted">{zh ? '有限制' : 'With restrictions'}</option>
              </select>
            </LabelField>
            <LabelField label={zh ? '吸烟' : 'Smoking'}>
              <select className="sl-input" value={form.smoking_policy} onChange={(e) => set('smoking_policy', e.target.value)}>
                <option value="">{zh ? '未说明' : 'Not stated'}</option>
                <option value="no">{zh ? '禁止' : 'No smoking'}</option>
                <option value="outdoor_only">{zh ? '仅室外' : 'Outdoors only'}</option>
                <option value="yes">{zh ? '允许' : 'Allowed'}</option>
              </select>
            </LabelField>
            <LabelField label={zh ? '家具' : 'Furnished'}>
              <select className="sl-input" value={form.furnished} onChange={(e) => set('furnished', e.target.value as '' | 'yes' | 'no')}>
                <option value="">{zh ? '未说明' : 'Not stated'}</option>
                <option value="yes">{zh ? '带家具' : 'Furnished'}</option>
                <option value="no">{zh ? '不带家具' : 'Unfurnished'}</option>
              </select>
            </LabelField>
          </div>
          <div className="mt-4">
            <div className="text-[12.5px] font-medium text-body-2">{zh ? '租金包含' : 'Included in rent'}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {UTILITY_OPTIONS.map((u) => {
                const on = form.utilities_included.includes(u.id)
                return (
                  <button key={u.id} type="button" onClick={() => set('utilities_included', on ? form.utilities_included.filter((x) => x !== u.id) : [...form.utilities_included, u.id])}
                    className={'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ' + (on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong bg-white text-body hover:border-brand')}>
                    {on ? '✓ ' : ''}{u[zh ? 'zh' : 'en']}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[12px] text-body-3">{zh ? '安省 RTA 下「禁止养宠」条款无效，所以宠物只能写「允许 / 有限制」；吸烟政策可以由房东设定。' : '"No pets" clauses are void under the Ontario RTA, so pets can only be "allowed / with restrictions"; a smoking policy is the landlord\'s to set.'}</p>
          </div>
        </section>

        {/* Amenities */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '配套设施' : 'Amenities'}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Amenities outside the fixed options (the AI and imports write free text): shown so they can be reviewed and removed. */}
            {form.amenities.filter((x) => !AMENITY_OPTIONS.some((o) => o.id === x)).map((x) => (
              <button key={`free-${x}`} type="button" onClick={() => toggleAmenity(x)} data-testid="free-amenity"
                className="rounded-full border border-brand bg-brand/10 px-3.5 py-1.5 text-[12.5px] font-medium text-brand" title={zh ? '点击移除' : 'Click to remove'}>
                ✓ {x} <span aria-hidden="true">×</span>
              </button>
            ))}
            {AMENITY_OPTIONS.map((a) => {
              const on = form.amenities.includes(a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAmenity(a.id)}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ' +
                    (on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong bg-white text-body hover:border-brand')
                  }
                >
                  {on ? '✓ ' : ''}{a[zh ? 'zh' : 'en']}
                </button>
              )
            })}
          </div>
        </section>

        {/* Description */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '描述' : 'Description'}</h2>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={5}
            className="mt-3 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-[14px] leading-relaxed outline-none focus:border-brand"
          />
        </section>

        {/* Action bar */}
        {error && (
          <div className="mt-6 rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
            {stale && <button onClick={() => window.location.reload()} className="ml-2 font-semibold underline underline-offset-2">{zh ? '重新载入' : 'Reload'}</button>}
          </div>
        )}
        {outcome && <div className="mt-6 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-[13px] text-green-800" data-testid="listing-save-outcome">✓ {outcome}</div>}
        <div className="sticky bottom-0 mt-8 flex items-center gap-3 border-t border-line-divider bg-surface py-4">
          <button onClick={() => router.push('/dashboard')} className="sl-btn-secondary flex-1 !py-3">
            {zh ? '取消' : 'Cancel'}
          </button>
          <button onClick={handleSave} disabled={saving} className="sl-btn-primary flex-1 !py-3 disabled:opacity-40">
            {saving ? '…' : saved ? '✓' : zh ? '保存修改' : 'Save changes'}
          </button>
        </div>
        <div className="h-4" />
      </div>
    </WorkspaceShell>
  )
}

function LabelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[11px] font-bold uppercase tracking-wider text-body-3">{label}</span>
      {children}
    </label>
  )
}

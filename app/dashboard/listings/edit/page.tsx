'use client'

export const runtime = 'edge'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { DraftListing } from '@/lib/agent/types'

const DRAFT_KEY = 'stayloop-draft-listing'

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

export default function EditDraftListingPage() {
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<DraftListing | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw) as DraftListing
        setForm(d)
        setPhotos(d.images ?? [])
      }
    } catch {}
  }, [])

  if (!form) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center text-body-3">
          {zh ? '没有找到草稿数据' : 'No draft found'}
        </div>
      </WorkspaceShell>
    )
  }

  const set = <K extends keyof DraftListing>(k: K, v: DraftListing[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))

  const toggleAmenity = (id: string) => {
    const cur = form.amenities || []
    const next = cur.includes(id) ? cur.filter((a) => a !== id) : [...cur, id]
    set('amenities', next)
  }

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

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    const updated = { ...form, images: photos }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(updated))
    router.back()
  }

  const handlePublish = async () => {
    if (!user || !form.address || !form.monthly_rent) return
    setPublishing(true)
    setError(null)
    try {
      const client = getSupabaseBrowser()
      const { data: landlord } = await client
        .from('landlords')
        .select('id')
        .eq('auth_id', user.id)
        .maybeSingle()
      if (!landlord) throw new Error(zh ? '未找到房东档案，请先完成注册' : 'Landlord profile not found')
      let dupQ = client.from('listings').select('id', { count: 'exact', head: true }).eq('landlord_id', landlord.id).ilike('address', form.address)
      if (form.unit) dupQ = dupQ.eq('unit', form.unit)
      else dupQ = dupQ.is('unit', null)
      const { count: dupCount } = await dupQ
      if (dupCount && dupCount > 0) throw new Error(zh ? '该地址已有相同房源，请勿重复发布' : 'A listing at this address already exists')
      const slug = form.address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)
      const { error: insertErr } = await client.from('listings').insert({
        landlord_id: landlord.id,
        address: form.address,
        unit: form.unit || null,
        city: form.city || 'Toronto',
        province: 'ON',
        monthly_rent: form.monthly_rent,
        bedrooms: form.bedrooms ?? null,
        bathrooms: form.bathrooms ?? null,
        sqft: form.sqft ?? null,
        available_date: form.available_date || null,
        title: form.title || form.address,
        description: form.description || null,
        parking: form.parking || null,
        pet_policy: form.pet_policy || null,
        amenities: form.amenities || [],
        has_den: form.has_den ?? false,
        property_type: form.property_type || 'condo',
        ownership_title: form.ownership_title ?? null,
        year_built: form.year_built ?? null,
        storeys: form.storeys ?? null,
        sqft_max: form.sqft_max ?? null,
        bedrooms_above_grade: form.bedrooms_above_grade ?? null,
        bedrooms_below_grade: form.bedrooms_below_grade ?? null,
        bathrooms_half: form.bathrooms_half ?? null,
        furnished: form.furnished ?? null,
        pets_allowed: form.pets_allowed ?? null,
        heating_type: form.heating_type ?? null,
        heating_fuel: form.heating_fuel ?? null,
        cooling: form.cooling ?? null,
        basement_type: form.basement_type ?? null,
        exterior_finish: form.exterior_finish ?? null,
        land_size: form.land_size ?? null,
        appliances: form.appliances ?? null,
        building_features: form.building_features ?? null,
        parking_spaces: form.parking_spaces ?? null,
        maintenance_fee: form.maintenance_fee ?? null,
        management_company: form.management_company ?? null,
        cross_streets: form.cross_streets ?? null,
        deposit: form.deposit ?? null,
        lease_term: form.lease_term ?? null,
        virtual_tour_url: form.virtual_tour_url ?? null,
        mls_number: form.mls_number ?? null,
        source_url: form.source_url ?? null,
        neighborhood: form.neighborhood || null,
        slug,
        status: 'active',
        is_active: true,
        published_at: new Date().toISOString(),
        images: photos.length ? photos : [],
        photo_count: photos.length || 0,
      })
      if (insertErr) throw new Error(insertErr.message)
      localStorage.removeItem(DRAFT_KEY)
      setPublished(true)
      setTimeout(() => router.push('/listings/' + slug), 1500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  if (published) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <div className="text-[18px] font-bold text-success">{zh ? '房源已发布！' : 'Listing published!'}</div>
          <div className="text-[13px] text-body-3">{zh ? '正在跳转...' : 'Redirecting...'}</div>
        </div>
      </WorkspaceShell>
    )
  }

  const hasPhotos = photos.length > 0

  return (
    <WorkspaceShell role="landlord" hideAside>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
      <div className="mx-auto max-w-[760px]">
        <button onClick={() => router.back()} className="font-mono text-[12px] text-body-3 hover:text-body">
          {zh ? '← 返回对话' : '← Back to chat'}
        </button>

        <h1 className="mt-4 text-[28px] font-bold tracking-tight">
          {zh ? '编辑房源草稿' : 'Edit Draft Listing'}
        </h1>
        <p className="mt-1 text-[13px] text-body-2">
          {zh ? '修改房源信息后可保存回草稿或直接发布。' : 'Edit the listing details, then save as draft or publish directly.'}
        </p>

        {/* Photos section */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '照片' : 'Photos'}</h2>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5">
            {photos.map((p, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-line-divider">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 text-[18px] text-white opacity-0 transition group-hover:opacity-100"
                >
                  ✕
                </button>
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                    {zh ? '封面' : 'COVER'}
                  </span>
                )}
              </div>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-line-strong text-[28px] text-body-3 hover:border-brand hover:text-brand"
            >
              +
            </button>
          </div>
          {!hasPhotos && (
            <p className="mt-2 text-[12px] text-body-3">{zh ? '点击 + 添加照片，至少 1 张才能发布。' : 'Click + to add photos. At least 1 required to publish.'}</p>
          )}
        </section>

        {/* Basic info */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '基本信息' : 'Basic Info'}</h2>
          <div className="mt-4 space-y-4">
            <LabelField label={zh ? '标题' : 'Title'}>
              <input className="sl-input" value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder={zh ? '如：精装湖景两居' : 'e.g. Modern Lakefront 2BR'} />
            </LabelField>
            <LabelField label={zh ? '地址 *' : 'Address *'}>
              <input className="sl-input" value={form.address} onChange={(e) => set('address', e.target.value)} required />
            </LabelField>
            <div className="grid gap-4 sm:grid-cols-3">
              <LabelField label={zh ? '单元号' : 'Unit'}>
                <input className="sl-input" value={form.unit || ''} onChange={(e) => set('unit', e.target.value)} />
              </LabelField>
              <LabelField label={zh ? '社区' : 'Neighborhood'}>
                <input className="sl-input" value={form.neighborhood || ''} onChange={(e) => set('neighborhood', e.target.value)} />
              </LabelField>
              <LabelField label={zh ? '城市' : 'City'}>
                <input className="sl-input" value={form.city || 'Toronto'} onChange={(e) => set('city', e.target.value)} />
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
              <LabelField label={zh ? '卧室' : 'Bedrooms'}>
                <input className="sl-input" type="number" value={form.bedrooms ?? ''} onChange={(e) => set('bedrooms', e.target.value ? Number(e.target.value) : undefined)} />
              </LabelField>
              <LabelField label={zh ? '浴室' : 'Bathrooms'}>
                <input className="sl-input" type="number" value={form.bathrooms ?? ''} onChange={(e) => set('bathrooms', e.target.value ? Number(e.target.value) : undefined)} />
              </LabelField>
              <LabelField label={zh ? '面积 (sqft)' : 'Area (sqft)'}>
                <input className="sl-input" type="number" value={form.sqft ?? ''} onChange={(e) => set('sqft', e.target.value ? Number(e.target.value) : undefined)} />
              </LabelField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <LabelField label={zh ? '入住日期' : 'Available date'}>
                <input className="sl-input" type="date" value={form.available_date || ''} onChange={(e) => set('available_date', e.target.value)} />
              </LabelField>
              <LabelField label={zh ? '停车' : 'Parking'}>
                <input className="sl-input" value={form.parking || ''} onChange={(e) => set('parking', e.target.value)} placeholder={zh ? '如：1 车位' : 'e.g. 1 spot'} />
              </LabelField>
              <LabelField label={zh ? '宠物政策' : 'Pet policy'}>
                <input className="sl-input" value={form.pet_policy || ''} onChange={(e) => set('pet_policy', e.target.value)} placeholder={zh ? '如：允许猫' : 'e.g. cats allowed'} />
              </LabelField>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={!!form.has_den} onChange={(e) => set('has_den', e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-brand" />
              {zh ? '有 Den' : 'Has den'}
            </label>
          </div>
        </section>

        {/* Amenities */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '配套设施' : 'Amenities'}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {AMENITY_OPTIONS.map((a) => {
              const on = (form.amenities || []).includes(a.id) || (form.amenities || []).some((x) => x.toLowerCase().includes(a.en.toLowerCase()))
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAmenity(a.id)}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ' +
                    (on
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line-strong bg-white text-body hover:border-brand')
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
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
            rows={5}
            className="mt-3 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-[14px] leading-relaxed outline-none focus:border-brand"
            placeholder={zh ? '房源详细描述（AI Agent 已帮你生成了初稿）' : 'Detailed listing description (AI Agent drafted this for you)'}
          />
        </section>

        {/* Action bar */}
        {error && <div className="mt-6 rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
        <div className="sticky bottom-0 mt-8 flex gap-3 border-t border-line-divider bg-surface py-4">
          <button onClick={handleSave} className="sl-btn-secondary flex-1 !py-3">
            {zh ? '✓ 保存草稿' : '✓ Save draft'}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !form.address || !form.monthly_rent}
            className="sl-btn-primary flex-1 !py-3 disabled:opacity-40"
          >
            {publishing ? '…' : zh ? '发布房源' : 'Publish listing'}
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

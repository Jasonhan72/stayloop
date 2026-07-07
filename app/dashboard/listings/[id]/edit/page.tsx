'use client'

export const runtime = 'edge'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase'

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

  useEffect(() => {
    if (!id) return
    const client = getSupabaseBrowser()
    client
      .from('listings')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setLoading(false)
          return
        }
        setSlug(data.slug || '')
        setForm({
          title: data.title || '',
          address: data.address || '',
          unit: data.unit || '',
          city: data.city || 'Toronto',
          neighborhood: data.neighborhood || '',
          monthly_rent: data.monthly_rent || 0,
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
        })
        setPhotos(Array.isArray(data.images) ? data.images : [])
        setLoading(false)
      })
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

  const handleSave = async () => {
    if (!user || !form.address) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const client = getSupabaseBrowser()
      const { error: updateErr } = await client.from('listings').update({
        title: form.title || form.address,
        address: form.address,
        unit: form.unit || null,
        city: form.city || 'Toronto',
        neighborhood: form.neighborhood || null,
        monthly_rent: form.monthly_rent,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        sqft: form.sqft,
        available_date: form.available_date || null,
        description: form.description || null,
        parking: form.parking || null,
        pet_policy: form.pet_policy || null,
        amenities: form.amenities,
        has_den: form.has_den,
        is_active: form.is_active,
        images: photos,
        photo_count: photos.length,
      }).eq('id', id)
      if (updateErr) throw new Error(updateErr.message)
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

        {/* Amenities */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '配套设施' : 'Amenities'}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
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
        {error && <div className="mt-6 rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
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

'use client'

export const runtime = 'edge'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import WorkspaceShell from '@/components/WorkspaceShell'
import { useAuth } from '@/lib/useAuth'
import { useT } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { DraftListing } from '@/lib/agent/types'
import {
  LEGACY_DRAFT_KEY, LISTING_PUBLISH_MSG, addressProvinceEvidence, buildListingRow, cityFromAddress, computeListingSource, depositGuidanceFor, detectListingProvince,
  listingFormProvince, makeListingSlug, markDraftDone, petGuidanceFor, provinceOptions, publishListing, readDraftSlot, resolveLandlordId, saveDraftSlot, type ExistingListing,
} from '@/lib/listingPublish'
import { normalizeProvince, petBanAllowed, provinceName, type ProvinceCode } from '@/lib/provinces'

// The draft carries the province the landlord confirmed here (2026-10-02); it rides along in the
// draft slot, so the chat card publishes with it too (buildListingRow reads form.province).
type DraftForm = DraftListing & { province?: ProvinceCode }

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

const UTILITY_OPTIONS: { id: string; zh: string; en: string }[] = [
  { id: 'hydro', zh: '电', en: 'Hydro' },
  { id: 'water', zh: '水', en: 'Water' },
  { id: 'heat', zh: '暖气', en: 'Heat' },
  { id: 'gas', zh: '燃气', en: 'Gas' },
  { id: 'internet', zh: '网络', en: 'Internet' },
  { id: 'cable', zh: '有线电视', en: 'Cable' },
]

export default function EditDraftListingPage() {
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const { user, loading: authLoading } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<DraftForm | null>(null)
  // The province follows the address until the landlord picks one.
  const [provinceManual, setProvinceManual] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<ExistingListing | null>(null)
  // The chat card that opened this page (sweep 2026-10-01): its own slot, keyed by user × card.
  const [cardKey, setCardKey] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (authLoading) return
    // Signed out: drafts are per account, so there is nothing to show — say so instead of '…' forever.
    if (!user) { setResolved(true); return }
    try {
      // The old single shared slot leaked one card's draft into every other card and account.
      localStorage.removeItem(LEGACY_DRAFT_KEY)
      const key = new URLSearchParams(window.location.search).get('card')
      if (key) {
        setCardKey(key)
        const d = readDraftSlot(localStorage, user.id, key) as DraftForm | null
        if (d) {
          if (normalizeProvince(d.province)) setProvinceManual(true)
          setForm({ ...d, province: listingFormProvince(d) })
          setPhotos(d.images ?? [])
        }
      }
    } catch {}
    setResolved(true)
  }, [user, authLoading])

  if (!form) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center text-body-3" data-testid="draft-edit-empty">
          {!resolved
            ? '…'
            : !user
              ? (zh ? '请先登录：房源草稿保存在你自己的账号下。登录后回到对话，在草稿卡片上点「编辑」。' : 'Sign in first: listing drafts are kept under your own account. Then go back to the chat and press “Edit” on the draft card.')
              : zh ? '没有找到草稿数据——请回到对话，在草稿卡片上点「编辑」。' : 'No draft found — go back to the chat and press “Edit” on the draft card.'}
        </div>
      </WorkspaceShell>
    )
  }

  const set = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) =>
    setForm((f) => {
      if (!f) return f
      const next: DraftForm = { ...f, [k]: v }
      if ((k === 'address' || k === 'city') && !provinceManual) next.province = detectListingProvince(next.address, next.city)
      // A province without a lawful pet ban drops 「不允许」.
      if (next.province !== f.province && next.pets_allowed === 'no' && petBanAllowed(next.province) !== true) next.pets_allowed = undefined
      return next
    })
  const pickProvince = (raw: string) => {
    const p = normalizeProvince(raw)
    if (!p) return
    setProvinceManual(true)
    set('province', p)
  }
  const province: ProvinceCode = form.province ?? listingFormProvince(form)
  const lang2 = zh ? 'zh' : 'en'
  const provinceEvidence = addressProvinceEvidence(form.address, form.city)
  const provinceMismatch = provinceEvidence && provinceEvidence !== province ? provinceEvidence : null
  const deposit = depositGuidanceFor(province, form.monthly_rent, form.deposit, lang2)
  const petNote = petGuidanceFor(province, lang2)?.note ?? null
  // The Toronto default is Ontario's; elsewhere the city falls back to the address (as buildListingRow does).
  const cityShown = form.city || (province === 'ON' ? 'Toronto' : cityFromAddress(form.address) ?? '')

  const toggleUtility = (id: string) => {
    setForm((f) => {
      if (!f) return f
      const cur = f.utilities_included || []
      return { ...f, utilities_included: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
    })
  }
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
    if (!user || !cardKey) { setError(zh ? '没能保存草稿：请回到对话，在草稿卡片上重新点「编辑」。' : 'Could not save the draft: go back to the chat and press “Edit” on the card again.'); return }
    let ok = false
    try { ok = saveDraftSlot(localStorage, user.id, cardKey, { ...form, images: photos }) } catch {}
    if (!ok) { setError(zh ? '草稿太大，这台设备存不下（通常是照片太多）。可以删掉几张照片再保存，或直接发布。' : 'The draft is too large to keep on this device (usually photos). Remove a few photos and save again, or publish directly.'); return }
    // The card reloads its own slot when the chat page shows again.
    router.back()
  }

  const handlePublish = async () => {
    if (!user || !form.address || !form.monthly_rent) return
    setPublishing(true)
    setError(null)
    setExisting(null)
    try {
      const client = getSupabaseBrowser()
      const landlordId = await resolveLandlordId(client, user.id)
      if (!landlordId) throw new Error(zh ? LISTING_PUBLISH_MSG.landlordNotFound.zh : LISTING_PUBLISH_MSG.landlordNotFound.en)
      const slug = makeListingSlug(form.address)
      const row = buildListingRow(form, { landlordId, slug, photos })
      const { error: publishErr, existing: dup } = await publishListing(client, row, { zh })
      if (dup) setExisting(dup)
      if (publishErr) throw new Error(publishErr)
      // The chat card that opened this page renders as published from now on (and its slot is cleared),
      // so it cannot publish the pre-edit version a second time.
      if (cardKey) markDraftDone(localStorage, user.id, cardKey, { kind: 'published', slug, address: form.address, unit: form.unit ?? null, source: computeListingSource(form) })
      setPublished(true)
      // A new listing waits for Stayloop review — its public page is not live yet.
      setTimeout(() => router.push('/dashboard'), 1500)
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
          <div className="text-[18px] font-bold text-success">{zh ? '房源已提交' : 'Listing submitted'}</div>
          <div className="text-[13px] text-body-3">{zh ? '待 Stayloop 审核，通过后公开展示。正在回到工作台…' : 'Waiting for Stayloop review; it goes public once approved. Returning to your workspace…'}</div>
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
                <input className="sl-input" value={cityShown} onChange={(e) => set('city', e.target.value)} />
              </LabelField>
            </div>
            <LabelField label={zh ? '省份 / 地区' : 'Province / territory'}>
              <select className="sl-input" value={province} onChange={(e) => pickProvince(e.target.value)} data-testid="listing-province">
                {provinceOptions(lang2).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </LabelField>
            {provinceMismatch && (
              <p className="-mt-2 text-[12px] text-amber-800" data-testid="listing-province-note">
                {zh ? `地址里的邮编或省份是${provinceName(provinceMismatch, 'zh')}，房源页按地址判断省份。` : `The address’s postal code or province says ${provinceName(provinceMismatch, 'en')}; the listing page goes by the address.`}
                <button type="button" onClick={() => { setProvinceManual(false); set('province', provinceMismatch) }} className="ml-1 font-semibold underline underline-offset-2">
                  {zh ? `改为${provinceName(provinceMismatch, 'zh')}` : `Use ${provinceName(provinceMismatch, 'en')}`}
                </button>
              </p>
            )}
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
              {/* The AI's draft can carry a deposit; it is published with the listing, so it is shown and editable here. */}
              <LabelField label={deposit ? (zh ? '押金 (CAD)' : 'Deposit (CAD)') : zh ? '租金押金 (CAD)' : 'Rent deposit (CAD)'}>
                <input className="sl-input" type="number" value={form.deposit ?? ''} onChange={(e) => set('deposit', e.target.value ? Number(e.target.value) : undefined)} />
                {!deposit && form.deposit != null && form.monthly_rent > 0 && form.deposit > form.monthly_rent && (
                  <p className="mt-1 text-[11.5px] text-red-700">{zh ? '安省租金押金最多一个月租金，且只能抵最后一个月租金（RTA s.106）。' : 'Ontario caps the rent deposit at one month and it may only cover the last month (RTA s.106).'}</p>
                )}
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
            {/* Outside Ontario: that province's verified deposit rule and what is wrong with the amount (lib/provinces/rules.ts). */}
            {deposit && (
              <div className="space-y-1.5" data-testid="province-deposit-rule">
                {deposit.problems.map((m) => <p key={m} className="text-[11.5px] text-red-700">{m}</p>)}
                <p className="text-[12px] text-body-3">{deposit.rule}</p>
              </div>
            )}
          </div>
        </section>

        {/* Lease terms — what tenants filter on (external walkthrough 2026-09-22: none of these were asked) */}
        <section className="mt-8">
          <h2 className="text-[18px] font-bold">{zh ? '租赁条件' : 'Lease terms'}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <LabelField label={zh ? '租期' : 'Lease term'}>
              <input className="sl-input" value={form.lease_term || ''} onChange={(e) => set('lease_term', e.target.value)} placeholder={zh ? '如：12 个月 / 可短租' : 'e.g. 12 months / short-term OK'} />
            </LabelField>
            <LabelField label={zh ? '宠物' : 'Pets'}>
              <select className="sl-input" value={form.pets_allowed || ''} onChange={(e) => set('pets_allowed', e.target.value || undefined)}>
                <option value="">{zh ? '未说明' : 'Not stated'}</option>
                <option value="yes">{zh ? '允许' : 'Allowed'}</option>
                <option value="restricted">{zh ? '有限制' : 'With restrictions'}</option>
                {petBanAllowed(province) === true && <option value="no">{zh ? '不允许' : 'Not allowed'}</option>}
              </select>
            </LabelField>
            <LabelField label={zh ? '吸烟' : 'Smoking'}>
              <select className="sl-input" value={form.smoking_policy || ''} onChange={(e) => set('smoking_policy', e.target.value || undefined)}>
                <option value="">{zh ? '未说明' : 'Not stated'}</option>
                <option value="no">{zh ? '禁止' : 'No smoking'}</option>
                <option value="outdoor_only">{zh ? '仅室外' : 'Outdoors only'}</option>
                <option value="yes">{zh ? '允许' : 'Allowed'}</option>
              </select>
            </LabelField>
            <LabelField label={zh ? '家具' : 'Furnished'}>
              <select className="sl-input" value={form.furnished == null ? '' : form.furnished ? 'yes' : 'no'} onChange={(e) => set('furnished', e.target.value === '' ? undefined : e.target.value === 'yes')}>
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
                const on = (form.utilities_included || []).includes(u.id)
                return (
                  <button key={u.id} type="button" onClick={() => toggleUtility(u.id)}
                    className={'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ' + (on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong bg-white text-body hover:border-brand')}>
                    {on ? '✓ ' : ''}{u[zh ? 'zh' : 'en']}
                  </button>
                )
              })}
            </div>
            {province === 'ON'
              ? <p className="mt-2 text-[12px] text-body-3">{zh ? '安省 RTA 下「禁止养宠」条款无效，所以宠物只能写「允许 / 有限制」；吸烟政策可以由房东设定。' : '"No pets" clauses are void under the Ontario RTA, so pets can only be "allowed / with restrictions"; a smoking policy is the landlord\'s to set.'}</p>
              : petNote && <p className="mt-2 text-[12px] text-body-3" data-testid="province-pet-rule">{petNote}</p>}
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
            placeholder={zh ? '房源详细描述（AI 助理已帮你生成了初稿）' : 'Detailed listing description (AI Agent drafted this for you)'}
          />
        </section>

        {/* Action bar */}
        {error && (
          <div className="mt-6 rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
            {existing && <> <a href={`/dashboard/listings/${existing.id}/edit${existing.is_active ? '' : '?relist=1'}`} className="font-semibold text-brand underline underline-offset-2">{zh ? '打开原房源 →' : 'Open the existing listing →'}</a></>}
          </div>
        )}
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

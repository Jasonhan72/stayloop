'use client'

// Quick publish (2026-10-13): three inputs — address, rent, photos — then the
// vision model reads the photos for layout / furniture / amenities, the landlord
// confirms, answers the policy questions a photo cannot (pets / smoking / term /
// utilities / deposit) and publishes. Same row builder, same publish gate, same
// TRESA disclosure and same verification queue as the 5-step wizard.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { supabase } from '@/lib/supabase'
import {
  buildListingRow, cityFromAddress, depositGuidanceFor, detectListingProvince, existingListingMessage, findExistingListing,
  listingSaveOutcomeText, listingStateAfterSave, petGuidanceFor, provinceOptions, publishListing, relistExisting, type ExistingListing,
} from '@/lib/listingPublish'
import { draftListingCopy } from '@/lib/listingCopy'
import { AMENITY_VOCAB, PROPERTY_TYPES, QUICK_PHOTO_MAX, QUICK_VISION_PHOTOS, type QuickDraftGuess } from '@/lib/listings/quickDraft'
import { downscalePhoto } from '@/lib/agent/avatarImage'
import { useLandlord } from '@/lib/useLandlord'
import { invalidateHats } from '@/lib/useHats'
import { RegistrantDisclosureModal, useRegistrantProfile } from '@/components/RegistrantDisclosure'
import { useAIName } from '@/lib/aiName'
import { useT } from '@/lib/i18n'
import { checkListingComplianceFor, type ProvinceCode } from '@/lib/provinces'

const TYPE_LABEL: Record<string, { zh: string; en: string }> = {
  condo: { zh: '公寓（共管）', en: 'Condo' }, apartment: { zh: '公寓（出租楼）', en: 'Apartment' }, house: { zh: '独立屋', en: 'House' },
  townhouse: { zh: '联排', en: 'Townhouse' }, basement: { zh: '地下室单元', en: 'Basement unit' }, room: { zh: '单间', en: 'Room' },
}
const UTILITIES: { id: string; zh: string; en: string }[] = [
  { id: 'hydro', zh: '电', en: 'Hydro' }, { id: 'water', zh: '水', en: 'Water' }, { id: 'heat', zh: '暖气', en: 'Heat' },
  { id: 'gas', zh: '燃气', en: 'Gas' }, { id: 'internet', zh: '网络', en: 'Internet' }, { id: 'cable', zh: '有线电视', en: 'Cable' },
]
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b) })

export default function QuickListingPage() {
  const router = useRouter()
  const { lang } = useT()
  const zh = lang === 'zh'
  const { landlord, loading: authLoading } = useLandlord()
  const aiName = useAIName()
  const registrant = useRegistrantProfile()

  const [stage, setStage] = useState<'input' | 'review'>('input')
  const [address, setAddress] = useState('')
  const [unit, setUnit] = useState('')
  const [rent, setRent] = useState('')
  const [province, setProvince] = useState<ProvinceCode>('ON')
  const [provincePicked, setProvincePicked] = useState(false)
  // Stored photos (≤1600px) and the smaller copies the model reads (≤1024px).
  const [photos, setPhotos] = useState<{ store: string; vision: string }[]>([])
  const [reading, setReading] = useState(false)
  const [guess, setGuess] = useState<QuickDraftGuess | null>(null)
  const [error, setError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  // Review-stage form (strings, like the wizard).
  const [form, setForm] = useState({
    property_type: 'condo', bedrooms: '1', bathrooms: '1', has_den: false, furnished: '' as '' | 'yes' | 'no', sqft: '',
    amenities: [] as string[], pets_allowed: '' as '' | 'yes' | 'restricted' | 'no', smoking_policy: '' as '' | 'no' | 'outdoor_only' | 'yes',
    lease_term: '', utilities_included: [] as string[], available_date: '', deposit: '', title: '', description: '',
  })
  const [copyEdited, setCopyEdited] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [existing, setExisting] = useState<ExistingListing | null>(null)
  const [relistDone, setRelistDone] = useState<string | null>(null)
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const disclosedRef = useRef(false)
  const needsDisclosure = () => !!registrant.profile && province === 'ON' && !disclosedRef.current

  useEffect(() => { if (!provincePicked) setProvince(detectListingProvince(address, cityFromAddress(address))) }, [address, provincePicked])
  const city = useMemo(() => cityFromAddress(address) || 'Toronto', [address])

  // C-S3-6: look for a listing at the same address + unit as soon as they are filled in (debounced),
  // so a duplicate is flagged before the landlord spends a photo-reading call.
  useEffect(() => {
    if (!landlord || stage !== 'input' || address.trim().length < 6) { return }
    const timer = setTimeout(() => {
      findExistingListing(supabase, landlord.landlordId, address, unit).then((e) => setExisting(e)).catch(() => { /* checked again at publish */ })
    }, 600)
    return () => clearTimeout(timer)
  }, [landlord, stage, address, unit])

  async function addPhotos(files: FileList | File[]) {
    const list = Array.from(files).slice(0, QUICK_PHOTO_MAX - photos.length)
    const out: { store: string; vision: string }[] = []
    for (const f of list) {
      try {
        const [store, vision] = await Promise.all([downscalePhoto(f, 1600, 0.85).then(blobToDataUrl), downscalePhoto(f, 1024, 0.8).then(blobToDataUrl)])
        out.push({ store, vision })
      } catch { /* skip unreadable file */ }
    }
    setPhotos((p) => [...p, ...out].slice(0, QUICK_PHOTO_MAX))
  }

  async function readPhotos() {
    setError(null)
    if (!address.trim() || !rent.trim() || !photos.length) { setError(zh ? '地址、月租和至少 1 张照片都要有。' : 'Address, rent and at least one photo are required.'); return }
    setReading(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s.session?.access_token
      const r = await fetch('/api/listings/quick-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ address: address.trim(), unit: unit.trim() || null, city, province, monthly_rent: parseInt(rent) || null, photos: photos.slice(0, QUICK_VISION_PHOTOS).map((p) => p.vision) }),
      })
      const j = (await r.json().catch(() => ({}))) as { guess?: QuickDraftGuess; error?: string; message?: string }
      if (!r.ok || !j.guess) {
        setError(r.status === 429 ? (zh ? '这小时的识别次数用完了，稍后再试，或直接手动填写。' : 'Hourly limit reached — try later or fill the fields by hand.')
          : (zh ? `AI 没能读取照片（${j.error || r.status}），你可以直接手动填写。` : `The photos could not be read (${j.error || r.status}); you can fill the fields by hand.`))
        setGuess(null)
      } else {
        setGuess(j.guess)
        setForm((f) => ({
          ...f,
          property_type: j.guess!.property_type || f.property_type,
          bedrooms: j.guess!.bedrooms != null ? String(j.guess!.bedrooms) : f.bedrooms,
          bathrooms: j.guess!.bathrooms != null ? String(j.guess!.bathrooms) : f.bathrooms,
          has_den: j.guess!.has_den ?? f.has_den,
          furnished: j.guess!.furnished ?? f.furnished,
          amenities: j.guess!.amenities,
        }))
        if (j.guess.cover_index != null && j.guess.cover_index > 0) {
          setPhotos((p) => { const c = p[j.guess!.cover_index!]; return c ? [c, ...p.filter((_, i) => i !== j.guess!.cover_index)] : p })
        }
      }
      if (landlord) { try { setExisting(await findExistingListing(supabase, landlord.landlordId, address, unit)) } catch { /* checked again at publish */ } }
      setStage('review')
    } finally { setReading(false) }
  }

  // Deterministic copy from the confirmed facts, until the landlord edits it.
  const generatedCopy = useMemo(() => draftListingCopy({
    address: address.trim(), unit: unit.trim() || undefined, city, property_type: form.property_type,
    bedrooms: parseInt(form.bedrooms) || null, bathrooms: parseFloat(form.bathrooms) || null, sqft: parseInt(form.sqft) || null, monthly_rent: parseInt(rent) || null,
    lease_term: form.lease_term || undefined, pets_allowed: form.pets_allowed === 'no' ? '' : form.pets_allowed, smoking_policy: form.smoking_policy, furnished: form.furnished,
    amenities: AMENITY_VOCAB.filter((a) => form.amenities.includes(a.id)).map((a) => ({ zh: a.zh, en: a.en })),
    utilities: UTILITIES.filter((u) => form.utilities_included.includes(u.id)).map((u) => ({ zh: u.zh, en: u.en })),
  }), [address, unit, city, rent, form.property_type, form.bedrooms, form.bathrooms, form.sqft, form.lease_term, form.pets_allowed, form.smoking_policy, form.furnished, form.amenities, form.utilities_included])
  useEffect(() => { if (!copyEdited) setForm((f) => ({ ...f, title: generatedCopy.title, description: generatedCopy.description })) }, [generatedCopy, copyEdited])

  const petGuide = petGuidanceFor(province, lang)
  const depositGuide = depositGuidanceFor(province, parseInt(rent) || null, parseInt(form.deposit) || null, lang)
  const compliance = checkListingComplianceFor(province, { monthly_rent: parseInt(rent) || null, deposit: parseInt(form.deposit) || null, description: form.description, pets_allowed: form.pets_allowed || null })

  function row(slug: string) {
    return buildListingRow({
      address: address.trim(), unit: unit.trim(), city, province, monthly_rent: parseInt(rent) || null,
      bedrooms: parseInt(form.bedrooms) || 0, bathrooms: parseFloat(form.bathrooms) || 0, property_type: form.property_type, has_den: form.has_den,
      sqft: parseInt(form.sqft) || null, deposit: parseInt(form.deposit) || null, amenities: form.amenities,
      lease_term: form.lease_term.trim() || undefined, pets_allowed: form.pets_allowed || undefined, smoking_policy: form.smoking_policy || undefined,
      furnished: form.furnished === '' ? undefined : form.furnished === 'yes', utilities_included: form.utilities_included,
      available_date: form.available_date || undefined, title: form.title.trim() || undefined, description: form.description.trim() || undefined,
    }, { landlordId: landlord!.landlordId, slug, slim: true, photos: photos.map((p) => p.store) })
  }

  async function publish() {
    if (!landlord) return
    setError(null)
    if (needsDisclosure()) { setDisclosureOpen(true); return }
    setSubmitting(true)
    const slug = address.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '-' + Math.random().toString(36).slice(2, 6)
    const res = await publishListing(supabase, row(slug), { zh, selectSlug: true })
    setSubmitting(false)
    if (res.error) { if (res.existing) setExisting(res.existing); setError(res.error); return }
    invalidateHats()
    router.replace('/dashboard?new=' + res.slug)
  }
  async function relist() {
    if (!landlord || !existing) return
    if (needsDisclosure()) { setDisclosureOpen(true); return }
    setSubmitting(true)
    const res = await relistExisting(supabase, existing, row(existing.slug || ''), { zh })
    setSubmitting(false)
    if (res.error !== null || !res.row) { setError(res.error ?? 'relist failed'); return }
    invalidateHats()
    setRelistDone(listingSaveOutcomeText(listingStateAfterSave(res.row), zh))
  }

  if (authLoading || !landlord) {
    return <WorkspaceShell role="landlord" hideAside><div className="flex min-h-[60vh] items-center justify-center"><span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} /></div></WorkspaceShell>
  }
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] ${on ? 'border-brand bg-brand text-white' : 'border-line-divider bg-white text-body'}`
  const aiTag = <span className="ml-1 rounded bg-surface-chip px-1.5 py-0.5 font-mono text-[9.5px] text-body-3">{zh ? 'AI 识别' : 'AI'}</span>

  return (
    <WorkspaceShell role="landlord" hideAside>
      {disclosureOpen && registrant.profile && (
        <RegistrantDisclosureModal profile={registrant.profile} context="listing_publish" zh={zh}
          onDone={() => { setDisclosureOpen(false); disclosedRef.current = true; void publish() }} onCancel={() => setDisclosureOpen(false)} />
      )}
      <div className="mx-auto max-w-[720px]" data-testid="quick-publish">
        <Link href="/dashboard" className="font-mono text-[12px] text-body-3 hover:text-body">← {zh ? '房源管理' : 'Listings'}</Link>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight">{zh ? '快速发布' : 'Quick publish'}</h1>
        <p className="mt-1 text-[14px] text-body-2">
          {zh ? `只填地址、月租、照片。${aiName} 看照片填户型、家具与设施，你核对一遍再发布。想逐项填写就用` : `Address, rent, photos. ${aiName} reads the photos for layout, furniture and amenities; you confirm and publish. Prefer the step-by-step form? Use the`}
          {' '}<Link href="/dashboard/listings/new" className="text-brand underline">{zh ? '五步向导' : '5-step wizard'}</Link>。
        </p>

        {stage === 'input' && (
          <div className="sl-card mt-6 space-y-5 p-6">
            <label className="block">
              <span className="text-[13px] font-semibold">{zh ? '地址' : 'Address'}</span>
              <input className="sl-input mt-1 w-full" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={zh ? '例：28 Avondale Ave, North York' : 'e.g. 28 Avondale Ave, North York'} data-testid="quick-address" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block"><span className="text-[13px] font-semibold">{zh ? '单元号' : 'Unit'}</span><input className="sl-input mt-1 w-full" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="605" /></label>
              <label className="block"><span className="text-[13px] font-semibold">{zh ? '月租（$）' : 'Rent ($/mo)'}</span><input className="sl-input mt-1 w-full" inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value.replace(/[^0-9]/g, ''))} placeholder="2800" data-testid="quick-rent" /></label>
              <label className="block"><span className="text-[13px] font-semibold">{zh ? '省份' : 'Province'}</span>
                <select className="sl-input mt-1 w-full" value={province} onChange={(e) => { setProvince(e.target.value as ProvinceCode); setProvincePicked(true) }}>
                  {provinceOptions(lang).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className="text-[13px] font-semibold">{zh ? `照片（最多 ${QUICK_PHOTO_MAX} 张，第一张是封面）` : `Photos (up to ${QUICK_PHOTO_MAX}; first is the cover)`}</span>
              <input ref={photoRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => { if (e.target.files) void addPhotos(e.target.files); e.target.value = '' }} />
              <div className="mt-2 grid grid-cols-4 gap-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addPhotos(e.dataTransfer.files) }}>
                {photos.map((p, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-surface-chip">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.store} alt="" className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white">{zh ? '封面' : 'COVER'}</span>}
                    <button type="button" aria-label={zh ? '移除' : 'Remove'} onClick={() => setPhotos((prev) => prev.filter((_, k) => k !== i))} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">×</button>
                  </div>
                ))}
                {photos.length < QUICK_PHOTO_MAX && (
                  <button type="button" onClick={() => photoRef.current?.click()} className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-[28px] text-body-3" data-testid="quick-add-photo">+</button>
                )}
              </div>
              <p className="mt-1 text-[12px] text-body-3">{zh ? '拖进来或点 +。AI 只读前 8 张；照片存 1600px。' : 'Drop here or click +. The AI reads the first 8; photos are stored at 1600px.'}</p>
            </div>
            {existing && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900" data-testid="quick-existing-early">
                {existingListingMessage(existing, zh, unit)}
              </div>
            )}
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
            <button onClick={readPhotos} disabled={reading} className="sl-btn-primary w-full !py-[12px]" data-testid="quick-read">
              {reading ? (zh ? `${aiName} 正在看照片…` : `${aiName} is reading the photos…`) : (zh ? `让 ${aiName} 看照片填其余 →` : `Let ${aiName} fill in the rest →`)}
            </button>
          </div>
        )}

        {stage === 'review' && (
          <div className="mt-6 space-y-5">
            {existing && !relistDone && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-900" data-testid="quick-existing">
                <div>{existingListingMessage(existing, zh, unit)}</div>
                <button onClick={relist} disabled={submitting} className="sl-btn-secondary mt-2 !py-[8px] !text-[13px]">{zh ? '用这些内容重新上架' : 'Relist with these details'}</button>
              </div>
            )}
            {relistDone && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-[13px] text-emerald-900">{relistDone} <Link href="/dashboard" className="underline">{zh ? '去房源管理' : 'Go to listings'}</Link></div>}

            <div className="sl-card p-6">
              <h2 className="text-[16px] font-bold">{zh ? `${aiName} 从照片里看到的` : `What ${aiName} saw in the photos`}</h2>
              {guess?.notes_zh || guess?.notes_en ? <p className="mt-1 text-[13px] text-body-2">{zh ? guess.notes_zh || guess.notes_en : guess.notes_en || guess.notes_zh}</p> : null}
              <p className="mt-1 text-[12px] text-body-3">{zh ? '每一项都可以改；AI 看不出的留空。' : 'Change anything; what the AI could not see is left blank.'}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="block"><span className="text-[12px] font-semibold">{zh ? '类型' : 'Type'}{guess?.property_type && aiTag}</span>
                  <select className="sl-input mt-1 w-full" value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })}>
                    {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{zh ? TYPE_LABEL[t].zh : TYPE_LABEL[t].en}</option>)}
                  </select></label>
                <label className="block"><span className="text-[12px] font-semibold">{zh ? '卧室' : 'Beds'}{guess?.bedrooms != null && aiTag}</span><input className="sl-input mt-1 w-full" inputMode="numeric" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></label>
                <label className="block"><span className="text-[12px] font-semibold">{zh ? '卫生间' : 'Baths'}{guess?.bathrooms != null && aiTag}</span><input className="sl-input mt-1 w-full" inputMode="decimal" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} /></label>
                <label className="block"><span className="text-[12px] font-semibold">{zh ? '面积 sqft' : 'Size sqft'}</span><input className="sl-input mt-1 w-full" inputMode="numeric" value={form.sqft} onChange={(e) => setForm({ ...form, sqft: e.target.value })} placeholder={guess?.sqft_estimate ? `${zh ? '约' : '~'} ${guess.sqft_estimate}` : ''} />
                  {guess?.sqft_estimate && !form.sqft && (
                    <button type="button" className="mt-1 text-[11.5px] text-brand underline" onClick={() => setForm({ ...form, sqft: String(guess.sqft_estimate) })} data-testid="quick-use-sqft">
                      {zh ? `用 AI 估值 ${guess.sqft_estimate}（估）` : `Use the AI estimate ${guess.sqft_estimate} (approx.)`}
                    </button>
                  )}
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={chip(form.has_den)} onClick={() => setForm({ ...form, has_den: !form.has_den })}>{zh ? '+ 书房 / den' : '+ den'}</button>
                <button type="button" className={chip(form.furnished === 'yes')} onClick={() => setForm({ ...form, furnished: form.furnished === 'yes' ? '' : 'yes' })}>{zh ? '带家具' : 'Furnished'}</button>
                <button type="button" className={chip(form.furnished === 'no')} onClick={() => setForm({ ...form, furnished: form.furnished === 'no' ? '' : 'no' })}>{zh ? '不带家具' : 'Unfurnished'}</button>
              </div>
              <div className="mt-4 text-[12px] font-semibold">{zh ? '设施' : 'Amenities'}{guess?.amenities.length ? aiTag : null}</div>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="quick-amenities">
                {AMENITY_VOCAB.map((a) => (
                  <button key={a.id} type="button" className={chip(form.amenities.includes(a.id))} onClick={() => setForm({ ...form, amenities: form.amenities.includes(a.id) ? form.amenities.filter((x) => x !== a.id) : [...form.amenities, a.id] })}>{zh ? a.zh : a.en}</button>
                ))}
              </div>
            </div>

            <div className="sl-card p-6">
              <h2 className="text-[16px] font-bold">{zh ? '照片里看不出的（请你填）' : 'What a photo cannot show (you answer)'}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-[12px] font-semibold">{zh ? '宠物' : 'Pets'}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button type="button" className={chip(form.pets_allowed === 'yes')} onClick={() => setForm({ ...form, pets_allowed: 'yes' })}>{zh ? '允许' : 'Allowed'}</button>
                    <button type="button" className={chip(form.pets_allowed === 'restricted')} onClick={() => setForm({ ...form, pets_allowed: 'restricted' })}>{zh ? '有限制' : 'Restricted'}</button>
                    {petGuide?.banOption && <button type="button" className={chip(form.pets_allowed === 'no')} onClick={() => setForm({ ...form, pets_allowed: 'no' })}>{zh ? '不允许' : 'Not allowed'}</button>}
                  </div>
                  {petGuide?.note && <p className="mt-1 text-[11.5px] text-body-3">{petGuide.note}</p>}
                </div>
                <div>
                  <div className="text-[12px] font-semibold">{zh ? '吸烟' : 'Smoking'}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(['no', 'outdoor_only', 'yes'] as const).map((v) => <button key={v} type="button" className={chip(form.smoking_policy === v)} onClick={() => setForm({ ...form, smoking_policy: v })}>{v === 'no' ? (zh ? '禁烟' : 'No') : v === 'outdoor_only' ? (zh ? '仅室外' : 'Outdoor only') : (zh ? '允许' : 'Yes')}</button>)}
                  </div>
                </div>
                <label className="block"><span className="text-[12px] font-semibold">{zh ? '租期' : 'Lease term'}</span>
                  <select className="sl-input mt-1 w-full" value={form.lease_term} onChange={(e) => setForm({ ...form, lease_term: e.target.value })}>
                    <option value="">{zh ? '未说明' : 'Not stated'}</option><option value="12 months">{zh ? '12 个月' : '12 months'}</option><option value="month-to-month">{zh ? '月租' : 'Month-to-month'}</option><option value="short-term ok">{zh ? '可短租' : 'Short-term OK'}</option>
                  </select></label>
                <label className="block"><span className="text-[12px] font-semibold">{zh ? '可入住日' : 'Available from'}</span><input type="date" className="sl-input mt-1 w-full" value={form.available_date} onChange={(e) => setForm({ ...form, available_date: e.target.value })} /></label>
                <div className="sm:col-span-2">
                  <div className="text-[12px] font-semibold">{zh ? '租金包含' : 'Rent includes'}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {UTILITIES.map((u) => <button key={u.id} type="button" className={chip(form.utilities_included.includes(u.id))} onClick={() => setForm({ ...form, utilities_included: form.utilities_included.includes(u.id) ? form.utilities_included.filter((x) => x !== u.id) : [...form.utilities_included, u.id] })}>{zh ? u.zh : u.en}</button>)}
                  </div>
                </div>
                <label className="block sm:col-span-2"><span className="text-[12px] font-semibold">{zh ? '租金押金（$，可留空）' : 'Rent deposit ($, optional)'}</span><input className="sl-input mt-1 w-full" inputMode="numeric" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value.replace(/[^0-9]/g, '') })} />
                  {depositGuide && <p className="mt-1 text-[11.5px] text-body-3">{depositGuide.rule}</p>}
                  {depositGuide?.problems.map((p, i) => <p key={i} className="mt-1 text-[11.5px] text-red-700">⚠ {p}</p>)}
                </label>
              </div>
            </div>

            <div className="sl-card p-6">
              <h2 className="text-[16px] font-bold">{zh ? '标题与描述' : 'Title and description'}</h2>
              <p className="mt-1 text-[12px] text-body-3">{zh ? '按你确认的字段生成，只写填过的事；随便改。' : 'Generated from the facts you confirmed, nothing else; edit freely.'}</p>
              <input className="sl-input mt-3 w-full" value={form.title} onChange={(e) => { setCopyEdited(true); setForm({ ...form, title: e.target.value }) }} />
              <textarea className="sl-input mt-2 w-full" rows={6} value={form.description} onChange={(e) => { setCopyEdited(true); setForm({ ...form, description: e.target.value }) }} />
              {copyEdited && <button type="button" className="mt-1 text-[11.5px] text-brand underline" onClick={() => setCopyEdited(false)}>{zh ? '重新按字段生成' : 'Regenerate from the fields'}</button>}
            </div>

            {compliance.findings.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-800" data-testid="quick-compliance">
                {compliance.findings.map((f, i) => <div key={i}>⚠ {f.message[lang]}</div>)}
              </div>
            )}
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
            <div className="flex gap-3">
              <button onClick={() => setStage('input')} className="sl-btn-secondary">{zh ? '← 改地址 / 照片' : '← Address / photos'}</button>
              <button onClick={publish} disabled={submitting || !photos.length} className="sl-btn-primary flex-1 !py-[12px]" data-testid="quick-publish-btn">
                {submitting ? (zh ? '发布中…' : 'Publishing…') : (zh ? '发布（管理员核验后公开）' : 'Publish (public after review)')}
              </button>
            </div>
          </div>
        )}
      </div>
    </WorkspaceShell>
  )
}

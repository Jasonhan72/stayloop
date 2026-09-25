'use client'

import { draftListingCopy } from '@/lib/listingCopy'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { supabase } from '@/lib/supabase'
import { buildListingRow, publishListing } from '@/lib/listingPublish'
import { useLandlord } from '@/lib/useLandlord'
import { invalidateHats } from '@/lib/useHats'
import { RegistrantDisclosureModal, useRegistrantProfile } from '@/components/RegistrantDisclosure'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import { checkListingCompliance } from '@/lib/ontario/rules'

const STEPS = (aiName: string) => [
  { n: 1, nm: { zh: '基本信息', en: 'Basics' }, desc: { zh: '地址 + 户型 + 面积', en: 'Address + layout + size' } },
  { n: 2, nm: { zh: '照片', en: 'Photos' }, desc: { zh: '第一张是封面', en: 'First photo is the cover' } },
  { n: 3, nm: { zh: '价格 + 条件', en: 'Price + terms' }, desc: { zh: '租金 · 押金 · 租期 · 宠物 · 水电', en: 'Rent · deposit · term · pets · utilities' } },
  { n: 4, nm: { zh: '护照章', en: 'Passport stamps' }, desc: { zh: '申请人可分享哪些核验', en: 'What applicants can share' } },
  { n: 5, nm: { zh: '核对 + 发布', en: 'Review + publish' }, desc: { zh: '只发布你填过的事实', en: 'Only the facts you entered' } },
]

const AMENITIES: { id: string; zh: string; en: string }[] = [
  { id: 'central_ac', zh: '中央空调', en: 'Central A/C' },
  { id: 'heat_incl', zh: '包暖', en: 'Heat included' },
  { id: 'water_incl', zh: '包水', en: 'Water included' },
  { id: 'pool', zh: '泳池', en: 'Pool' },
  { id: 'gym', zh: '健身房', en: 'Gym' },
  { id: 'dishwasher', zh: '洗碗机', en: 'Dishwasher' },
  { id: 'in_unit_laundry', zh: 'in-unit 洗衣', en: 'In-unit laundry' },
  { id: 'ss_appliances', zh: '不锈钢厨电', en: 'Stainless-steel appliances' },
  { id: 'parking', zh: '1 车位', en: '1 parking spot' },
  { id: 'storage', zh: '储物间', en: 'Storage locker' },
]

const IMPORT_SOURCES = ['Realtor.ca', 'MLS#', 'Kijiji', 'Zumper']
const UTILITY_OPTIONS: { id: string; zh: string; en: string }[] = [
  { id: 'hydro', zh: '电', en: 'Hydro' }, { id: 'water', zh: '水', en: 'Water' }, { id: 'heat', zh: '暖气', en: 'Heat' },
  { id: 'gas', zh: '燃气', en: 'Gas' }, { id: 'internet', zh: '网络', en: 'Internet' }, { id: 'cable', zh: '有线电视', en: 'Cable' },
]
const MAX_PHOTOS = 12
const NOT_PROVIDED = { zh: '未提供', en: 'not provided' }

export default function NewListingPage() {
  const router = useRouter()
  const { lang } = useT()
  const { landlord, loading: authLoading } = useLandlord()
  const aiName = useAIName('landlord')
  const [step, setStep] = useState(1)
  const [importQuery, setImportQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // This wizard publishes a REAL, publicly-visible listing (is_active:true).
  // Fields start EMPTY — the design's demo values (Unit 1207, $2,850…) were
  // previously pre-filled here, and a landlord clicking straight through
  // would publish a live listing at a demo address. Demo values may appear
  // only as input placeholders.
  const [form, setForm] = useState({
    address: '',
    unit: '',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: '',
    deposit: '',
    bedrooms: '1',
    bathrooms: '1',
    sqft: '',
    facing: '',
    floor: '',
    age: '',
    property_type: 'condo',
    // Every optional fact starts EMPTY / unconfirmed (fix list 2026-09-22,
    // SL-LL-002): nothing is pre-selected, and nothing the landlord did not
    // enter reaches the listing. "Not stated" is a valid published value.
    amenities: [] as string[],
    lease_term: '',
    pets_allowed: '' as '' | 'yes' | 'restricted',
    smoking_policy: '' as '' | 'no' | 'outdoor_only' | 'yes',
    furnished: '' as '' | 'yes' | 'no',
    utilities_included: [] as string[],
    // Title / description (SL-L-03): written by the landlord, or drafted from
    // the fields above by lib/listingCopy.ts (no model) — reviewed before publishing.
    title: '',
    description: '',
  })
  const [photos, setPhotos] = useState<string[]>([])
  const photoRef = useRef<HTMLInputElement>(null)
  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).slice(0, MAX_PHOTOS).forEach((f) => {
      const reader = new FileReader()
      reader.onload = () => { if (typeof reader.result === 'string') setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, reader.result as string])) }
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }
  const toggleUtility = (id: string) => setForm((f) => ({ ...f, utilities_included: f.utilities_included.includes(id) ? f.utilities_included.filter((x) => x !== id) : [...f.utilities_included, id] }))

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const toggleAmenity = (a: string) =>
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a)
        ? f.amenities.filter((x) => x !== a)
        : [...f.amenities, a],
    }))

  // TRESA s.32: an account with an agent profile leasing out its own unit
  // discloses its registrant status before the listing goes live.
  const registrant = useRegistrantProfile()
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const [disclosed, setDisclosed] = useState(false)

  async function submit() {
    if (!landlord) return
    if (!form.address.trim() || !form.monthly_rent.trim()) {
      setError(lang === 'zh' ? '请先填写地址和月租金' : 'Address and monthly rent are required')
      return
    }
    setError(null)
    if (registrant.profile && !disclosed) { setDisclosureOpen(true); return }
    setSubmitting(true)
    const slug =
      form.address
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) +
      '-' +
      Math.random().toString(36).slice(2, 6)
    const row = buildListingRow(
      {
        address: form.address,
        unit: form.unit,
        city: form.city,
        monthly_rent: parseInt(form.monthly_rent) || null,
        bedrooms: parseInt(form.bedrooms),
        bathrooms: parseInt(form.bathrooms),
        property_type: form.property_type,
        sqft: parseInt(form.sqft) || null,
        deposit: parseInt(form.deposit) || null,
        year_built: parseInt(form.age) ? new Date().getFullYear() - parseInt(form.age) : null,
        amenities: form.amenities,
        lease_term: form.lease_term.trim() || undefined,
        pets_allowed: form.pets_allowed || undefined,
        smoking_policy: form.smoking_policy || undefined,
        furnished: form.furnished === '' ? undefined : form.furnished === 'yes',
        utilities_included: form.utilities_included,
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
      },
      { landlordId: landlord.landlordId, slug, slim: true, photos },
    )
    const { slug: newSlug, error: e } = await publishListing(supabase, row, { zh: lang === 'zh', selectSlug: true })
    setSubmitting(false)
    if (e) {
      setError(e)
      return
    }
    invalidateHats()
    router.replace('/dashboard?new=' + newSlug)
  }

  if (authLoading || !landlord) {
    return (
      <WorkspaceShell role="landlord" hideAside>
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </div>
      </WorkspaceShell>
    )
  }

  const steps = STEPS(aiName)
  const cur = steps.find((s) => s.n === step)!

  return (
    <WorkspaceShell role="landlord" hideAside>
      {disclosureOpen && registrant.profile && (
        <RegistrantDisclosureModal
          profile={registrant.profile}
          context="listing_publish"
          zh={lang === 'zh'}
          onDone={() => { setDisclosureOpen(false); setDisclosed(true); setTimeout(() => { void submit() }, 0) }}
          onCancel={() => setDisclosureOpen(false)}
        />
      )}
      <div className="mx-auto max-w-[760px]">
          <Link
            href="/dashboard"
            className="font-mono text-[12px] text-body-3 hover:text-body"
          >
            {lang === 'zh' ? '← 返回工作台' : '← Back to workspace'}
          </Link>

          {/* ART34 · one-click import / migrate block */}
          <div className="mt-3 rounded-2xl border-2 border-brand bg-gradient-to-b from-brand/[0.06] to-white p-6 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="orb landlord mt-0.5 h-9 w-9 shrink-0" style={{ color: '#047857' }} />
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-brand">
                  {lang === 'zh' ? `◐ ${aiName.toUpperCase()} · 主动发现 + 三源导入` : `◐ ${aiName.toUpperCase()} · Proactive discovery + 3-source import`}
                </div>
                <h2 className="mt-1 text-[18px] font-bold leading-snug">
                  {lang === 'zh' ? '把房源搬进 Stayloop' : 'Move your listing into Stayloop'}
                </h2>
                <p className="mt-1 text-[13px] text-body-2">
                  {lang === 'zh'
                    ? `把 Realtor.ca 链接 / MLS® 编号 / 公开房源页交给 ${aiName}：它读页面、整理成挂牌草稿并带回照片，你逐项确认后再发布。`
                    : `Hand ${aiName} a Realtor.ca link, an MLS® number or a public listing page: it reads the page, drafts the listing and brings the photos along; you confirm field by field before publishing.`}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {IMPORT_SOURCES.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-body"
                >
                  {s}
                </span>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 rounded-xl border-2 border-brand bg-white p-1.5">
              <input
                className="sl-input !border-none !bg-transparent font-mono text-[14px]"
                placeholder={lang === 'zh' ? '贴链接 / 输 MLS#（如 C7845921）' : 'Paste link / enter MLS# (e.g. C7845921)'}
                value={importQuery}
                onChange={(e) => setImportQuery(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  const q = importQuery.trim()
                  if (!q) return
                  router.push(
                    `/landlord/agent?prompt=${encodeURIComponent(lang === 'zh' ? `帮我导入这个房源并整理成 Stayloop 挂牌草稿：${q}` : `Import this listing and draft it for Stayloop: ${q}`)}`,
                  )
                }}
                className="sl-btn-primary !py-[10px]"
              >
                {lang === 'zh' ? '解析 →' : 'Parse →'}
              </button>
            </div>

            <p className="mt-3 text-[11.5px] leading-relaxed text-body-3">
              {lang === 'zh'
                ? <>支持：Realtor.ca 房源链接、MLS® 编号、其他公开房源页链接（需登录才能看的页面读不到）。PDF / 截图请到 <Link href="/landlord/agent" className="text-brand underline underline-offset-2">{aiName} 对话</Link>里用「+」附件上传。解析结果先生成草稿卡片，你逐项确认后才发布——{aiName} 不会补写你没提供的事实。暂不支持 CSV / Excel 批量导入。</>
                : <>Supported: Realtor.ca listing links, MLS® numbers and other public listing pages (login-walled pages cannot be read). For a PDF or screenshot, use the "+" attachment in <Link href="/landlord/agent" className="text-brand underline underline-offset-2">the {aiName} chat</Link>. Parsing produces a draft card you confirm field by field before publishing — {aiName} never fills in facts you did not provide. CSV / Excel bulk import is not available yet.</>}
            </p>
          </div>

          <div className="my-7 text-center font-mono text-[12px] tracking-[0.04em] text-body-3">
            {lang === 'zh' ? '— 或者，手动填写新房源 —' : '— Or fill in a new listing manually —'}
          </div>

          <div className="mb-8">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              LISTING WIZARD · STEP {step} / 5 · {cur.nm[lang]}
            </div>
            <h1 className="mt-2 text-[24px] font-bold tracking-tight sm:text-[32px]">
              {form.address ? `${form.unit ? 'UNIT ' + form.unit + ' · ' : ''}${lang === 'zh' ? `让 ${aiName} 帮你整理这些字段` : `Let ${aiName} organize these fields`}` : (lang === 'zh' ? `填写房源信息 · 让 ${aiName} 帮你整理` : `Enter your listing · ${aiName} organizes the fields`)}
            </h1>
            <p className="mt-2 text-[13px] text-body-2">
              {lang === 'zh'
                ? '填关键字段。只有你填过的内容会发布；最后一步可以按已填字段生成中英文标题和描述草稿，发布前逐字核对。'
                : 'Fill in the key fields. Only what you enter is published; the last step can draft a bilingual title and description from those fields for you to review word by word.'}
            </p>
          </div>

          {/* Step rail */}
          <div className="mb-6 grid gap-2 sm:grid-cols-5">
            {steps.map((s) => {
              const done = s.n < step
              const active = s.n === step
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => setStep(s.n)}
                  className={
                    'rounded-xl border px-3 py-3 text-left transition ' +
                    (active
                      ? 'border-brand bg-brand/5 shadow-[0_0_0_1px_rgba(4,120,87,0.22)]'
                      : done
                        ? 'border-brand/40 bg-white'
                        : 'border-line-divider bg-white hover:border-line-strong')
                  }
                >
                  <div className="text-[13px] font-bold">
                    {done ? '✓' : s.n} · {s.nm[lang]}
                  </div>
                  <div className="mt-0.5 text-[11px] text-body-3">{s.desc[lang]}</div>
                </button>
              )
            })}
          </div>

          <div className="sl-card p-7 sm:p-8">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '1 · 基本信息' : '1 · Basics'}</h2>
                <Field label={lang === 'zh' ? '地址 *' : 'Address *'}>
                  <input className="sl-input" required value={form.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
                <Field label={lang === 'zh' ? '物业类型' : 'Property type'}>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['condo', lang === 'zh' ? '公寓 Condo' : 'Condo'],
                      ['apartment', lang === 'zh' ? '出租公寓 Apartment' : 'Apartment'],
                      ['house', lang === 'zh' ? '独立屋 House' : 'House'],
                      ['townhouse', lang === 'zh' ? '联排 Townhouse' : 'Townhouse'],
                      ['basement', lang === 'zh' ? '地下室 Basement' : 'Basement'],
                      ['duplex', 'Duplex'],
                    ] as const).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => set('property_type', v)}
                        className={`rounded-full border px-4 py-2 text-[13px] transition ${
                          form.property_type === v
                            ? 'border-emerald-700 bg-emerald-700 text-white'
                            : 'border-black/15 bg-white hover:border-black/40'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={lang === 'zh' ? '户型' : 'Layout'}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <input className="sl-input" placeholder={lang === 'zh' ? '卧室' : 'Bedrooms'} value={form.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} />
                    <input className="sl-input" placeholder={lang === 'zh' ? '卫生间' : 'Bathrooms'} value={form.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} />
                    <input className="sl-input" placeholder={lang === 'zh' ? '面积 sqft' : 'Area sqft'} value={form.sqft} onChange={(e) => set('sqft', e.target.value)} />
                  </div>
                </Field>
                <Field label={lang === 'zh' ? '朝向 / 楼层 / 房龄' : 'Exposure / floor / age'}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <input className="sl-input" placeholder={lang === 'zh' ? '朝向' : 'Exposure'} value={form.facing} onChange={(e) => set('facing', e.target.value)} />
                    <input className="sl-input" placeholder={lang === 'zh' ? '楼层' : 'Floor'} value={form.floor} onChange={(e) => set('floor', e.target.value)} />
                    <input className="sl-input" placeholder={lang === 'zh' ? '房龄' : 'Age'} value={form.age} onChange={(e) => set('age', e.target.value)} />
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={lang === 'zh' ? '单元号' : 'Unit number'}><input className="sl-input" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
                  <Field label={lang === 'zh' ? '城市' : 'City'}><input className="sl-input" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
                </div>

                <Field label={lang === 'zh' ? `配套（点选 · ${aiName} 自动整理）` : `Amenities (tap · ${aiName} auto-organizes)`}>
                  <div className="flex flex-wrap gap-2">
                    {AMENITIES.map((a) => {
                      const on = form.amenities.includes(a.id)
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAmenity(a.id)}
                          className={
                            'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ' +
                            (on
                              ? 'border-brand bg-brand/10 text-brand'
                              : 'border-line-strong bg-white text-body hover:border-brand')
                          }
                        >
                          {on ? '✓ ' : ''}{a[lang]}
                        </button>
                      )
                    })}
                  </div>
                </Field>

                <p className="text-[12px] text-body-3">
                  {lang === 'zh'
                    ? '配套只有你点选的才会发布；没点的不会被当成「没有」，详情页只是不显示。'
                    : 'Only the amenities you tap are published; untapped ones are not shown as absent — they simply do not appear.'}
                </p>

                <button onClick={() => setStep(2)} className="sl-btn-primary w-full !py-[12px]">{lang === 'zh' ? '下一步 · 照片' : 'Next · Photos'}</button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '2 · 照片' : '2 · Photos'}</h2>
                <p className="text-[13px] text-body-2">
                  {lang === 'zh'
                    ? `最多 ${MAX_PHOTOS} 张，第一张是封面。至少 1 张才能发布。`
                    : `Up to ${MAX_PHOTOS} photos; the first one is the cover. At least 1 is required to publish.`}
                </p>
                <input ref={photoRef} type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                <div className="grid grid-cols-4 gap-3">
                  {photos.map((p, i) => (
                    <div key={i} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-chip">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt="" className="h-full w-full object-cover" />
                      {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-white">{lang === 'zh' ? '封面' : 'COVER'}</span>}
                      <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, k) => k !== i))} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-[14px] text-white" aria-label={lang === 'zh' ? '移除' : 'Remove'}>×</button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button type="button" onClick={() => photoRef.current?.click()} className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-[28px] text-body-3 hover:border-brand hover:text-brand">
                      +
                    </button>
                  )}
                </div>
                <p className="text-[12px] text-body-3">
                  {lang === 'zh' ? `已选 ${photos.length} 张。照片随房源一起保存；发布后可在房源管理里增删。` : `${photos.length} selected. Photos are saved with the listing; add or remove them later under Manage listings.`}
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={() => setStep(3)} className="sl-btn-primary flex-1 !py-[12px]">{lang === 'zh' ? '下一步 · 价格 + 条件' : 'Next · Price + terms'}</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '3 · 价格 + 条件' : '3 · Price + terms'}</h2>
                <p className="text-[13px] text-body-2">
                  {lang === 'zh'
                    ? <>不确定该挂多少？发布后在 <Link href="/landlord/agent" className="text-brand underline underline-offset-2">{aiName} 对话</Link>里问「这套该挂多少」，会拉同区域真实挂牌与 TRREB 官方数据——这里不预填任何价格。</>
                    : <>Not sure about the price? After publishing, ask {aiName} in <Link href="/landlord/agent" className="text-brand underline underline-offset-2">the chat</Link> — it pulls live comparables and TRREB data. Nothing is pre-filled here.</>}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={lang === 'zh' ? '月租 (CAD) *' : 'Monthly rent (CAD) *'}><input className="sl-input" type="number" required value={form.monthly_rent} onChange={(e) => set('monthly_rent', e.target.value)} /></Field>
                  <Field label={lang === 'zh' ? '押金 (CAD)' : 'Deposit (CAD)'}><input className="sl-input" type="number" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} /></Field>
                </div>
                {parseInt(form.deposit) > parseInt(form.monthly_rent) && parseInt(form.monthly_rent) > 0 && (
                  <div className="rounded-md bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
                    {lang === 'zh' ? '押金超过一个月租金。安省 RTA s.106 只允许收最多一个月租金作为末月租押金（钥匙押金除外，且只能是可退还的成本价）。' : "The deposit exceeds one month's rent. Ontario RTA s.106 allows at most one month's rent as a last-month deposit (plus a refundable key deposit at cost)."}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-4">
                  <Field label={lang === 'zh' ? '租期' : 'Lease term'}><input className="sl-input" value={form.lease_term} onChange={(e) => set('lease_term', e.target.value)} placeholder={lang === 'zh' ? '如：12 个月 / 可短租' : 'e.g. 12 months / short-term OK'} /></Field>
                  <Field label={lang === 'zh' ? '宠物' : 'Pets'}>
                    <select className="sl-input" value={form.pets_allowed} onChange={(e) => set('pets_allowed', e.target.value)}>
                      <option value="">{lang === 'zh' ? '未说明' : 'Not stated'}</option>
                      <option value="yes">{lang === 'zh' ? '允许' : 'Allowed'}</option>
                      <option value="restricted">{lang === 'zh' ? '有限制' : 'With restrictions'}</option>
                    </select>
                  </Field>
                  <Field label={lang === 'zh' ? '吸烟' : 'Smoking'}>
                    <select className="sl-input" value={form.smoking_policy} onChange={(e) => set('smoking_policy', e.target.value)}>
                      <option value="">{lang === 'zh' ? '未说明' : 'Not stated'}</option>
                      <option value="no">{lang === 'zh' ? '禁止' : 'No smoking'}</option>
                      <option value="outdoor_only">{lang === 'zh' ? '仅室外' : 'Outdoors only'}</option>
                      <option value="yes">{lang === 'zh' ? '允许' : 'Allowed'}</option>
                    </select>
                  </Field>
                  <Field label={lang === 'zh' ? '家具' : 'Furnished'}>
                    <select className="sl-input" value={form.furnished} onChange={(e) => set('furnished', e.target.value)}>
                      <option value="">{lang === 'zh' ? '未说明' : 'Not stated'}</option>
                      <option value="yes">{lang === 'zh' ? '带家具' : 'Furnished'}</option>
                      <option value="no">{lang === 'zh' ? '不带家具' : 'Unfurnished'}</option>
                    </select>
                  </Field>
                </div>
                <Field label={lang === 'zh' ? '租金包含（点选）' : 'Included in rent (tap)'}>
                  <div className="flex flex-wrap gap-2">
                    {UTILITY_OPTIONS.map((u) => {
                      const on = form.utilities_included.includes(u.id)
                      return (
                        <button key={u.id} type="button" onClick={() => toggleUtility(u.id)} className={'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ' + (on ? 'border-brand bg-brand/10 text-brand' : 'border-line-strong bg-white text-body hover:border-brand')}>
                          {on ? '✓ ' : ''}{u[lang]}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <p className="text-[12px] text-body-3">
                  {lang === 'zh' ? '安省 RTA 下「禁止养宠」条款无效，所以宠物只能写「允许 / 有限制」；吸烟政策可由房东设定。' : '"No pets" clauses are void under the Ontario RTA, so pets can only be "allowed / with restrictions"; a smoking policy is yours to set.'}
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={() => setStep(4)} className="sl-btn-primary flex-1 !py-[12px]">{lang === 'zh' ? '下一步 · 护照章' : 'Next · Passport stamps'}</button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '4 · 申请人护照章' : '4 · Applicant passport stamps'}</h2>
                <p className="mt-2 text-[13px] text-body-2">
                  {lang === 'zh'
                    ? '仅供了解，这一步不需要设置任何内容。申请人可以把自己的 Stayloop 护照分享给你，上面带有身份章（Veriff）和银行章（Flinks）等已完成的核验。是否录取由你本人决定——系统不会替你自动过滤或拒绝任何申请人。'
                    : 'For your information — there is nothing to set on this step. Applicants can share their Stayloop passport with you, carrying the checks they have completed, such as the identity stamp (Veriff) and the bank stamp (Flinks). You make the decision — the system never filters out or rejects an applicant for you.'}
                </p>
                <div className="mt-5 space-y-3">
                  {(lang === 'zh'
                    ? [
                        { n: 1, name: '身份章 🪪', desc: '申请人通过 Veriff 完成证件 + 活体核验。' },
                        { n: 2, name: '收入章 💼', desc: '工资单等收入文件，或银行直连识别出的工资入账。' },
                        { n: 3, name: '银行章 🏦', desc: '申请人本人授权 Flinks 银行直连，只分享摘要，不分享原始流水。' },
                        { n: 4, name: '信用 + 法庭章 ⚖️', desc: '申请人提供或授权的信用报告，加安省公开记录检索。' },
                      ]
                    : [
                        { n: 1, name: 'Identity stamp 🪪', desc: 'The applicant completes an ID + liveness check through Veriff.' },
                        { n: 2, name: 'Income stamp 💼', desc: 'Income documents such as pay stubs, or payroll deposits identified through a bank connection.' },
                        { n: 3, name: 'Bank stamp 🏦', desc: 'The applicant authorises a Flinks bank connection; only a summary is shared, never raw transactions.' },
                        { n: 4, name: 'Credit + court stamp ⚖️', desc: 'A credit report the applicant provides or authorises, plus a search of Ontario public records.' },
                      ]
                  ).map((t) => (
                    <div
                      key={t.n}
                      className="w-full rounded-xl border border-line-divider bg-white px-4 py-4 text-left"
                    >
                      <div className="text-[14px] font-bold">{t.name}</div>
                      <div className="text-[12.5px] text-body-2">{t.desc}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => setStep(3)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={() => setStep(5)} className="sl-btn-primary flex-1 !py-[12px]">{lang === 'zh' ? '下一步 · 最后审 + 发布' : 'Next · Review + publish'}</button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '5 · 核对 + 发布' : '5 · Review + publish'}</h2>
                <p className="text-[13px] text-body-2">
                  {lang === 'zh'
                    ? '下面就是会发布的全部内容——只有你填过的字段。标「未提供」的项不会出现在房源页上，也不会被写成任何说法。'
                    : 'This is everything that will be published — only the fields you entered. Items marked "not provided" do not appear on the listing and are never turned into a claim.'}
                </p>

                <div className="rounded-xl border border-line-divider bg-white p-4">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                    {lang === 'zh' ? '房源摘要' : 'Listing summary'}
                  </div>
                  <dl className="mt-3 space-y-2 text-[13px]">
                    <Row k={lang === 'zh' ? '地址' : 'Address'} v={form.address} />
                    <Row k={lang === 'zh' ? '户型' : 'Layout'} v={lang === 'zh' ? `${form.bedrooms} 卧 · ${form.bathrooms} 卫 · ${form.sqft.trim() ? `${form.sqft} sqft` : `面积${NOT_PROVIDED.zh}`}` : `${form.bedrooms} bd · ${form.bathrooms} ba · ${form.sqft.trim() ? `${form.sqft} sqft` : `area ${NOT_PROVIDED.en}`}`} />
                    <Row k={lang === 'zh' ? '月租 / 押金' : 'Rent / deposit'} v={`${form.monthly_rent.trim() ? `$${form.monthly_rent}` : NOT_PROVIDED[lang]} / ${form.deposit.trim() ? `$${form.deposit}` : NOT_PROVIDED[lang]}`} />
                    <Row k={lang === 'zh' ? '配套' : 'Amenities'} v={form.amenities.map((id) => AMENITIES.find((a) => a.id === id)?.[lang] ?? id).join(' · ') || NOT_PROVIDED[lang]} />
                    <Row k={lang === 'zh' ? '照片' : 'Photos'} v={photos.length ? (lang === 'zh' ? `${photos.length} 张` : `${photos.length}`) : NOT_PROVIDED[lang]} />
                    <Row k={lang === 'zh' ? '租期' : 'Lease term'} v={form.lease_term.trim() || NOT_PROVIDED[lang]} />
                    <Row k={lang === 'zh' ? '宠物' : 'Pets'} v={form.pets_allowed === 'yes' ? (lang === 'zh' ? '允许' : 'Allowed') : form.pets_allowed === 'restricted' ? (lang === 'zh' ? '有限制' : 'With restrictions') : NOT_PROVIDED[lang]} />
                    <Row k={lang === 'zh' ? '吸烟' : 'Smoking'} v={form.smoking_policy === 'no' ? (lang === 'zh' ? '禁止' : 'No smoking') : form.smoking_policy === 'outdoor_only' ? (lang === 'zh' ? '仅室外' : 'Outdoors only') : form.smoking_policy === 'yes' ? (lang === 'zh' ? '允许' : 'Allowed') : NOT_PROVIDED[lang]} />
                    <Row k={lang === 'zh' ? '家具' : 'Furnished'} v={form.furnished === 'yes' ? (lang === 'zh' ? '带家具' : 'Furnished') : form.furnished === 'no' ? (lang === 'zh' ? '不带家具' : 'Unfurnished') : NOT_PROVIDED[lang]} />
                    <Row k={lang === 'zh' ? '租金包含' : 'Included'} v={form.utilities_included.map((id) => UTILITY_OPTIONS.find((u) => u.id === id)?.[lang] ?? id).join(' · ') || NOT_PROVIDED[lang]} />
                  </dl>
                </div>

                <div data-testid="listing-copy" className="rounded-xl border border-line-divider bg-white p-4 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">{lang === 'zh' ? '标题与描述 · 房源页原样显示' : 'Title & description · shown as-is on the listing'}</div>
                    <button type="button" onClick={() => {
                      const d = draftListingCopy({
                        address: form.address, unit: form.unit, city: form.city, property_type: form.property_type,
                        bedrooms: parseInt(form.bedrooms), bathrooms: parseInt(form.bathrooms), sqft: parseInt(form.sqft) || null, monthly_rent: parseInt(form.monthly_rent) || null,
                        lease_term: form.lease_term, pets_allowed: form.pets_allowed, smoking_policy: form.smoking_policy, furnished: form.furnished,
                        amenities: form.amenities.map((id) => AMENITIES.find((a) => a.id === id)).filter(Boolean) as { zh: string; en: string }[],
                        utilities: form.utilities_included.map((id) => UTILITY_OPTIONS.find((u) => u.id === id)).filter(Boolean) as { zh: string; en: string }[],
                      })
                      setForm((f) => ({ ...f, title: d.title, description: d.description }))
                    }} className="rounded-lg border border-line-divider px-2.5 py-1 text-[12px] font-semibold">{lang === 'zh' ? '按已填字段生成中英文草稿' : 'Draft from my fields (中文 + English)'}</button>
                  </div>
                  <label className="mt-3 block text-[12px] text-body-3">{lang === 'zh' ? '标题' : 'Title'}</label>
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, 160) }))} placeholder={lang === 'zh' ? `留空则用地址：${form.address || '—'}` : `Blank = the address: ${form.address || '—'}`} className="mt-1 w-full rounded-lg border border-line-divider px-3 py-2 text-[16px] md:text-[13px]" />
                  <label className="mt-3 block text-[12px] text-body-3">{lang === 'zh' ? '描述（中文与英文都会显示）' : 'Description (both languages are shown)'}</label>
                  <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value.slice(0, 4000) }))} rows={7} placeholder={lang === 'zh' ? '留空则房源页不显示描述。' : 'Blank = no description on the listing page.'} className="mt-1 w-full rounded-lg border border-line-divider px-3 py-2 text-[16px] leading-relaxed md:text-[13px]" />
                  <p className="mt-1 text-[11.5px] text-body-3">{lang === 'zh' ? '草稿只用你在前几步填过的字段，不会补写任何没提供的信息（宠物、水电、面积等）。' : 'The draft only uses fields you entered in the earlier steps; nothing you did not provide (pets, utilities, size…) is added.'}</p>
                </div>

                <div className="rounded-xl border border-line-divider bg-white p-4 text-[13px]">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                    {lang === 'zh' ? '发布前检查' : 'Pre-publish checks'}
                  </div>
                  <ul className="mt-2 space-y-1 text-[12.5px] text-body-2">
                    {(() => {
                      // Single source of Ontario rules (lib/ontario/rules.ts); the
                      // same checks back /api/v1/listings/compliance.
                      const { findings } = checkListingCompliance({ monthly_rent: parseInt(form.monthly_rent) || null, deposit: parseInt(form.deposit) || null, pets_allowed: form.pets_allowed || null })
                      const hit = (id: string) => findings.find((f) => f.rule === id)
                      return (
                        <>
                          <li>{hit('RTA-106-deposit-cap') ? '✗ ' : '✓ '}{lang === 'zh' ? '押金不超过一个月租金（RTA s.106）' : "Deposit within one month's rent (RTA s.106)"}</li>
                          <li>{hit('RTA-14-no-pet-clause') ? '✗ ' : '✓ '}{lang === 'zh' ? '没有「禁止养宠」类无效条款（RTA s.14）' : 'No void "no pets" clause (RTA s.14)'}</li>
                          <li>{hit('RTA-134-no-fees') ? '✗ ' : '✓ '}{lang === 'zh' ? '文案里没有申请费 / 宠物押金 / 清洁押金（RTA s.134）' : 'No application fee / pet or cleaning deposit in the copy (RTA s.134)'}</li>
                        </>
                      )
                    })()}
                    <li>✓ {lang === 'zh' ? '没有 AI 补写的事实：标题与描述只来自你填的字段或你自己写的文字' : 'No AI-filled facts: title and description come only from your fields or your own words'}</li>
                    <li>{photos.length ? '✓ ' : '✗ '}{lang === 'zh' ? (photos.length ? '有照片' : '没有照片——至少 1 张才能发布（没有照片的房源不会出现在任何公开页面）') : (photos.length ? 'Photos attached' : 'No photos — at least one is required to publish (listings without photos are never shown publicly)')}</li>
                  </ul>
                </div>

                {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
                <div className="flex gap-3">
                  <button onClick={() => setStep(4)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={submit} disabled={submitting || photos.length === 0} title={photos.length === 0 ? (lang === 'zh' ? '请先在第 2 步添加照片' : 'Add a photo in step 2 first') : undefined} className="sl-btn-primary flex-1 !py-[12px] disabled:opacity-50">
                    {submitting ? (lang === 'zh' ? '发布中…' : 'Publishing…') : (lang === 'zh' ? '✓ 用这版发布' : '✓ Publish this version')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
    </WorkspaceShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="sl-eyebrow">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-line-divider pb-2 last:border-0">
      <dt className="shrink-0 text-body-3">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  )
}

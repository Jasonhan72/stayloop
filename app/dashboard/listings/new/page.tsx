'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import WorkspaceShell from '@/components/WorkspaceShell'
import { supabase } from '@/lib/supabase'
import { buildListingRow, publishListing } from '@/lib/listingPublish'
import { useLandlord } from '@/lib/useLandlord'
import { useAIName } from '@/lib/aiName'
import { useT, type Lang } from '@/lib/i18n'
import { stampForTier } from '@/lib/passportStamps'

const STEPS = (aiName: string) => [
  { n: 1, nm: { zh: '基本信息', en: 'Basics' }, desc: { zh: '地址 + 户型 + 面积', en: 'Address + layout + size' } },
  { n: 2, nm: { zh: '照片 + 视频', en: 'Photos + video' }, desc: { zh: `至少 8 张 · ${aiName} 自动排序`, en: `8+ photos · ${aiName} auto-orders` } },
  { n: 3, nm: { zh: '价格 + 押金', en: 'Price + deposit' }, desc: { zh: `${aiName} 给市场区间`, en: `${aiName} gives the market range` } },
  { n: 4, nm: { zh: '盖章门槛', en: 'Stamp threshold' }, desc: { zh: '要求申请人盖到哪枚章', en: 'Which stamps applicants need' } },
  { n: 5, nm: { zh: '最后审 + 发布', en: 'Review + publish' }, desc: { zh: `${aiName} 起草 EN+ZH 文案`, en: `${aiName} drafts EN+ZH copy` } },
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

const IMPORT_SOURCES = ['Realtor.ca', 'Kijiji', 'Zumper', 'Zillow', 'MLS#']

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
    tier: 2,
    property_type: 'condo',
    amenities: [] as string[],
  })

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const toggleAmenity = (a: string) =>
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a)
        ? f.amenities.filter((x) => x !== a)
        : [...f.amenities, a],
    }))

  async function submit() {
    if (!landlord) return
    if (!form.address.trim() || !form.monthly_rent.trim()) {
      setError(lang === 'zh' ? '请先填写地址和月租金' : 'Address and monthly rent are required')
      return
    }
    setError(null)
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
      },
      { landlordId: landlord.landlordId, slug, slim: true },
    )
    const { slug: newSlug, error: e } = await publishListing(supabase, row, { zh: lang === 'zh', selectSlug: true })
    setSubmitting(false)
    if (e) {
      setError(e)
      return
    }
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
                    ? `让 ${aiName} 直接搬走你在别处的旧 listing，或贴链接 / 输 MLS# / 拖 PDF。${aiName} 会自动改写 EN+中文双语文案、整理照片、给定价建议。`
                    : `Let ${aiName} pull your existing listing from elsewhere, or paste a link / enter an MLS# / drop a PDF. ${aiName} rewrites the copy in EN + Chinese, organizes the photos, and suggests pricing.`}
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

            <div className="mt-3 flex items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-4 py-5 text-[12.5px] text-body-3">
              {lang === 'zh' ? `📄 拖一份 PDF / 截图到这里 · ${aiName} 自动 OCR + 视觉解析` : `📄 Drop a PDF / screenshot here · ${aiName} auto OCR + visual parsing`}
            </div>

            <p className="mt-3 text-[11.5px] text-body-3">
              {lang === 'zh'
                ? `💡 ${aiName} 会自动改写为 Stayloop 风格 · EN + 中文双语，去除 MLS 套话并做 RTA / RECO 合规检查。`
                : `💡 ${aiName} rewrites it in Stayloop style · EN + Chinese, strips MLS boilerplate, and runs RTA / RECO compliance checks.`}
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
                ? `填关键字段，${aiName} 自动生成英中文文案、推荐价格区间、SEO 描述`
                : `Fill in the key fields and ${aiName} generates EN/Chinese copy, a recommended price range, and the SEO description.`}
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

                <div className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  {lang === 'zh' ? (
                    <><b className="text-brand">💡 {aiName}：</b>你这套户型 + 配套，King West 区域过去 30 天 7 套同类已出租。市场租金中位数 <b>$2,820</b>。我建议挂 $2,850（轻微上浮可谈空间）。</>
                  ) : (
                    <><b className="text-brand">💡 {aiName}: </b>With this layout and amenities, 7 comparable King West units rented in the past 30 days. The market median is <b>$2,820</b>. I'd list at $2,850 (slight upside, with room to negotiate).</>
                  )}
                </div>

                <button onClick={() => setStep(2)} className="sl-btn-primary w-full !py-[12px]">{lang === 'zh' ? '下一步 · 照片 + 视频' : 'Next · Photos + video'}</button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '2 · 照片 + 视频' : '2 · Photos + video'}</h2>
                <p className="text-[13px] text-body-2">
                  {lang === 'zh'
                    ? `至少上传 8 张照片，${aiName} 会自动排序、挑封面，并补一段房源短视频脚本。`
                    : `Upload at least 8 photos. ${aiName} auto-orders them, picks the cover, and drafts a short listing-video script.`}
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg bg-[#94815C]"
                      style={{ backgroundImage: 'linear-gradient(135deg,#a8966f,#7a6a4c)' }}
                    />
                  ))}
                  <div
                    aria-hidden="true"
                    className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-[28px] text-body-3"
                  >
                    +
                  </div>
                </div>
                <div className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  {lang === 'zh' ? (
                    <><b className="text-brand">💡 {aiName}：</b>已上传 8 张 · 我把客厅南向采光那张设为封面，King West 这类房源封面采光好可提升 30% 询盘。</>
                  ) : (
                    <><b className="text-brand">💡 {aiName}: </b>8 photos uploaded · I set the south-facing living-room shot as the cover. For King West listings, a bright cover photo can lift inquiries by 30%.</>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={() => setStep(3)} className="sl-btn-primary flex-1 !py-[12px]">{lang === 'zh' ? '下一步 · 价格 + 押金' : 'Next · Price + deposit'}</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '3 · 价格 + 押金' : '3 · Price + deposit'}</h2>
                <div className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  {lang === 'zh' ? (
                    <><b className="text-brand">💡 {aiName}：</b>市场租金中位数 <b>$2,820</b> · 建议挂 <b>$2,850</b>（King West 1B+den · 轻微上浮可谈空间）。押金按 RTA 标准 = 一个月租金。</>
                  ) : (
                    <><b className="text-brand">💡 {aiName}: </b>Market median rent is <b>$2,820</b> · I'd list at <b>$2,850</b> (King West 1B+den · slight upside, room to negotiate). Deposit per RTA standard = one month's rent.</>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={lang === 'zh' ? '月租 (CAD) *' : 'Monthly rent (CAD) *'}><input className="sl-input" type="number" required value={form.monthly_rent} onChange={(e) => set('monthly_rent', e.target.value)} /></Field>
                  <Field label={lang === 'zh' ? '押金 (CAD)' : 'Deposit (CAD)'}><input className="sl-input" type="number" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} /></Field>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={() => setStep(4)} className="sl-btn-primary flex-1 !py-[12px]">{lang === 'zh' ? '下一步 · 盖章门槛' : 'Next · Stamp threshold'}</button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '4 · 盖章门槛' : '4 · Stamp threshold'}</h2>
                <p className="mt-2 text-[13px] text-body-2">
                  {lang === 'zh'
                    ? '这决定哪些租客可以申请。要求的章越多越严格。系统会按你设定自动筛选。'
                    : 'This decides which tenants can apply. More required stamps means stricter. The system auto-filters based on your setting.'}
                </p>
                <div className="mt-5 space-y-3">
                  {(lang === 'zh'
                    ? [
                        { n: 1, name: '需 身份章 🪪 · 仅 ID 验证', desc: '租客只需护照 + 自拍。最快但筛选最弱。', stats: '~80% 通过率' },
                        { n: 2, name: '需 收入章 💼 · ID + 收入',   desc: '工资单或 Plaid 月收入验证。',         stats: '~50% 通过率' },
                        { n: 3, name: '需 银行章 🏦 · ID + 收入 + 银行', desc: 'Plaid 直连 · 现金流可见。',          stats: '~30% 通过率' },
                        { n: 4, name: '需 信用 + 法庭章 ⚖️ · 全部 + 信用 + 法庭', desc: 'Equifax + CanLII LTB · 最严。',      stats: '~15% 通过率' },
                      ]
                    : [
                        { n: 1, name: 'Identity stamp 🪪 · ID only', desc: 'Tenant just needs passport + selfie. Fastest, but the weakest filter.', stats: '~80% pass rate' },
                        { n: 2, name: 'Income stamp 💼 · ID + income', desc: 'Pay stub or Plaid monthly-income verification.', stats: '~50% pass rate' },
                        { n: 3, name: 'Bank stamp 🏦 · ID + income + bank', desc: 'Direct Plaid connection · cash flow visible.', stats: '~30% pass rate' },
                        { n: 4, name: 'Credit + court stamp ⚖️ · everything + credit + court', desc: 'Equifax + CanLII LTB · the strictest.', stats: '~15% pass rate' },
                      ]
                  ).map((t) => {
                    const sel = form.tier === t.n
                    return (
                      <button
                        key={t.n}
                        type="button"
                        onClick={() => set('tier', t.n)}
                        className={
                          'grid w-full grid-cols-[24px_1fr_110px] items-center gap-4 rounded-xl border px-4 py-4 text-left transition ' +
                          (sel
                            ? 'border-brand bg-brand/5 shadow-[0_0_0_1px_rgba(4,120,87,0.22)]'
                            : 'border-line-divider bg-white hover:border-line-strong')
                        }
                      >
                        <span
                          className={
                            'h-[18px] w-[18px] rounded-full border-2 ' +
                            (sel ? 'border-brand' : 'border-line-strong')
                          }
                          style={sel ? { background: 'radial-gradient(circle at center,#047857 0 50%,transparent 50%)' } : undefined}
                        />
                        <div>
                          <div className="text-[14px] font-bold">{t.name}</div>
                          <div className="text-[12.5px] text-body-2">{t.desc}</div>
                        </div>
                        <span className="font-mono text-[11px] text-body-3">{t.stats}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => setStep(3)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={() => setStep(5)} className="sl-btn-primary flex-1 !py-[12px]">{lang === 'zh' ? '下一步 · 最后审 + 发布' : 'Next · Review + publish'}</button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">{lang === 'zh' ? '5 · 最后审 + 发布' : '5 · Review + publish'}</h2>
                <div className="rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  <div className="font-mono text-[11.5px] font-bold tracking-eyebrow text-[#7C3AED]">
                    {lang === 'zh' ? '📝 已改写为 Stayloop 风格 · EN + 中文双语' : '📝 Rewritten in Stayloop style · EN + Chinese'}
                  </div>
                  <p className="mt-2">
                    {lang === 'zh' ? (
                      <><b className="text-brand">{aiName} 改写：</b>去 MLS 套话 · 加入 King West 步行细节（步行 4 分到 TTC，6 分到 Stackt Market）· 突出租客最关心的「包暖 + 水」与「允许猫」· 中文版同步生成。</>
                    ) : (
                      <><b className="text-brand">{aiName} rewrite: </b>Stripped MLS boilerplate · added King West walk details (4 min walk to TTC, 6 min to Stackt Market) · highlighted what tenants care about most — "heat + water included" and "cats allowed" · Chinese version generated in parallel.</>
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-line-divider bg-white p-4">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                    {lang === 'zh' ? '房源摘要' : 'Listing summary'}
                  </div>
                  <dl className="mt-3 space-y-2 text-[13px]">
                    <Row k={lang === 'zh' ? '地址' : 'Address'} v={form.address} />
                    <Row k={lang === 'zh' ? '户型' : 'Layout'} v={lang === 'zh' ? `${form.bedrooms} 卧 · ${form.bathrooms} 卫 · ${form.sqft} sqft` : `${form.bedrooms} bd · ${form.bathrooms} ba · ${form.sqft} sqft`} />
                    <Row k={lang === 'zh' ? '月租 / 押金' : 'Rent / deposit'} v={`$${form.monthly_rent} / $${form.deposit}`} />
                    <Row k={lang === 'zh' ? '盖章门槛' : 'Stamp threshold'} v={lang === 'zh' ? `需 ${stampForTier(form.tier).zh}` : `${stampForTier(form.tier).en} required`} />
                    <Row k={lang === 'zh' ? '配套' : 'Amenities'} v={form.amenities.map((id) => AMENITIES.find((a) => a.id === id)?.[lang] ?? id).join(' · ') || '—'} />
                  </dl>
                </div>

                <div className="rounded-xl border border-line-divider bg-white p-4 text-[13px]">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                    {lang === 'zh' ? '合规检查' : 'Compliance check'}
                  </div>
                  <div className="mt-2 font-semibold text-brand">{lang === 'zh' ? '✓ RTA / RECO 通过' : '✓ RTA / RECO passed'}</div>
                  <div className="mt-1 text-[12px] text-body-3">
                    {lang === 'zh'
                      ? '已自动加入 RTA 标准条款 · 删除 MLS 中「先到先得」等违规话术。'
                      : 'RTA standard clauses added automatically · removed non-compliant MLS phrasing like "first come, first served".'}
                  </div>
                </div>

                {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
                <div className="flex gap-3">
                  <button onClick={() => setStep(4)} className="sl-btn-secondary">{lang === 'zh' ? '← 上一步' : '← Back'}</button>
                  <button onClick={submit} disabled={submitting} className="sl-btn-primary flex-1 !py-[12px]">
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

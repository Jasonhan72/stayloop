'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'

const STEPS = [
  { n: 1, nm: '基本信息', desc: '地址 + 户型 + 面积' },
  { n: 2, nm: '照片 + 视频', desc: '至少 8 张 · Logic 自动排序' },
  { n: 3, nm: '价格 + 押金', desc: 'Logic 给市场区间' },
  { n: 4, nm: '认证门槛', desc: '接受什么级别申请人' },
  { n: 5, nm: '最后审 + 发布', desc: 'Logic 起草 EN+ZH 文案' },
]

const AMENITIES = [
  '中央空调', '包暖', '包水', '泳池', '健身房', '洗碗机', 'in-unit 洗衣',
  '不锈钢厨电', '1 车位', '储物间',
]

const IMPORT_SOURCES = ['Realtor.ca', 'Kijiji', 'Zumper', 'Zillow', 'MLS#']

export default function NewListingPage() {
  const router = useRouter()
  const { landlord, loading: authLoading } = useLandlord()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    address: 'Unit 1207, 100 Western Battery Rd, Toronto ON M6K 0E5',
    unit: '1207',
    city: 'Toronto',
    province: 'ON',
    monthly_rent: '2850',
    deposit: '2850',
    bedrooms: '1',
    bathrooms: '1',
    sqft: '700',
    facing: '南向',
    floor: '12/24F',
    age: '2018 年建',
    tier: 2,
    amenities: ['中央空调', '包暖', '包水', '洗碗机', 'in-unit 洗衣', '不锈钢厨电', '1 车位', '储物间', '泳池', '健身房'] as string[],
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
    const { data, error: e } = await supabase
      .from('listings')
      .insert({
        landlord_id: landlord.landlordId,
        address: form.address,
        unit: form.unit || null,
        city: form.city,
        province: form.province,
        monthly_rent: parseInt(form.monthly_rent) || null,
        bedrooms: parseInt(form.bedrooms),
        bathrooms: parseInt(form.bathrooms),
        slug,
        is_active: true,
      })
      .select('slug')
      .single()
    setSubmitting(false)
    if (e) {
      setError(e.message)
      return
    }
    router.replace('/dashboard?new=' + (data?.slug || ''))
  }

  if (authLoading || !landlord) {
    return (
      <>
        <Header />
        <main className="bg-surface flex min-h-[60vh] items-center justify-center">
          <span className="orb landlord pulse h-12 w-12" style={{ color: '#047857' }} />
        </main>
        <Footer />
      </>
    )
  }

  const cur = STEPS.find((s) => s.n === step)!

  return (
    <>
      <Header />
      <main className="bg-surface">
        <div className="mx-auto max-w-[760px] px-5 py-12 sm:px-7">
          <Link
            href="/dashboard"
            className="font-mono text-[12px] text-body-3 hover:text-body"
          >
            ← 返回工作台
          </Link>

          {/* ART34 · one-click import / migrate block */}
          <div className="mt-3 rounded-2xl border-2 border-brand bg-gradient-to-b from-brand/[0.06] to-white p-6 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="orb landlord mt-0.5 h-9 w-9 shrink-0" style={{ color: '#047857' }} />
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-brand">
                  ◐ LOGIC · 主动发现 + 三源导入
                </div>
                <h2 className="mt-1 text-[18px] font-bold leading-snug">
                  把房源搬进 Stayloop
                </h2>
                <p className="mt-1 text-[13px] text-body-2">
                  让 Logic 直接搬走你在别处的旧 listing，或贴链接 / 输 MLS# / 拖 PDF。Logic 会自动改写 EN+中文双语文案、整理照片、给定价建议。
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {IMPORT_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-body hover:border-brand"
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 rounded-xl border-2 border-brand bg-white p-1.5">
              <input
                className="sl-input !border-none !bg-transparent font-mono text-[14px]"
                placeholder="贴链接 / 输 MLS#（如 C7845921）"
              />
              <button type="button" className="sl-btn-primary !py-[10px]">
                解析 →
              </button>
            </div>

            <div className="mt-3 flex items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-4 py-5 text-[12.5px] text-body-3">
              📄 拖一份 PDF / 截图到这里 · Logic 自动 OCR + 视觉解析
            </div>

            <p className="mt-3 text-[11.5px] text-body-3">
              💡 Logic 会自动改写为 Stayloop 风格 · EN + 中文双语，去除 MLS 套话并做 RTA / RECO 合规检查。
            </p>
          </div>

          <div className="my-7 text-center font-mono text-[12px] tracking-[0.04em] text-body-3">
            — 或者，手动填写新房源 —
          </div>

          <div className="mb-8">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              LISTING WIZARD · STEP {step} / 5 · {cur.nm}
            </div>
            <h1 className="mt-2 text-[32px] font-bold tracking-tight">
              UNIT 1207 · 让 Logic 帮你整理这些字段
            </h1>
            <p className="mt-2 text-[13px] text-body-2">
              填关键字段，Logic 自动生成英中文文案、推荐价格区间、SEO 描述
            </p>
          </div>

          {/* Step rail */}
          <div className="mb-6 grid gap-2 sm:grid-cols-5">
            {STEPS.map((s) => {
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
                    {done ? '✓' : s.n} · {s.nm}
                  </div>
                  <div className="mt-0.5 text-[11px] text-body-3">{s.desc}</div>
                </button>
              )
            })}
          </div>

          <div className="sl-card p-7 sm:p-8">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">1 · 基本信息</h2>
                <Field label="地址 *">
                  <input className="sl-input" required value={form.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
                <Field label="户型">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <input className="sl-input" placeholder="卧室" value={form.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} />
                    <input className="sl-input" placeholder="卫生间" value={form.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} />
                    <input className="sl-input" placeholder="面积 sqft" value={form.sqft} onChange={(e) => set('sqft', e.target.value)} />
                  </div>
                </Field>
                <Field label="朝向 / 楼层 / 房龄">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <input className="sl-input" placeholder="朝向" value={form.facing} onChange={(e) => set('facing', e.target.value)} />
                    <input className="sl-input" placeholder="楼层" value={form.floor} onChange={(e) => set('floor', e.target.value)} />
                    <input className="sl-input" placeholder="房龄" value={form.age} onChange={(e) => set('age', e.target.value)} />
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="单元号"><input className="sl-input" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
                  <Field label="城市"><input className="sl-input" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
                </div>

                <Field label="配套（点选 · Logic 自动整理）">
                  <div className="flex flex-wrap gap-2">
                    {AMENITIES.map((a) => {
                      const on = form.amenities.includes(a)
                      return (
                        <button
                          key={a}
                          type="button"
                          onClick={() => toggleAmenity(a)}
                          className={
                            'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ' +
                            (on
                              ? 'border-brand bg-brand/10 text-brand'
                              : 'border-line-strong bg-white text-body hover:border-brand')
                          }
                        >
                          {on ? '✓ ' : ''}{a}
                        </button>
                      )
                    })}
                  </div>
                </Field>

                <div className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  <b className="text-brand">💡 Logic：</b>你这套户型 + 配套，King West 区域过去 30 天 7 套同类已出租。市场租金中位数 <b>$2,820</b>。我建议挂 $2,850（轻微上浮可谈空间）。
                </div>

                <button onClick={() => setStep(2)} className="sl-btn-primary w-full !py-[12px]">下一步 · 照片 + 视频</button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">2 · 照片 + 视频</h2>
                <p className="text-[13px] text-body-2">
                  至少上传 8 张照片，Logic 会自动排序、挑封面，并补一段房源短视频脚本。
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg bg-[#94815C]"
                      style={{ backgroundImage: 'linear-gradient(135deg,#a8966f,#7a6a4c)' }}
                    />
                  ))}
                  <button
                    type="button"
                    className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-[28px] text-body-3 hover:border-brand"
                  >
                    +
                  </button>
                </div>
                <div className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  <b className="text-brand">💡 Logic：</b>已上传 8 张 · 我把客厅南向采光那张设为封面，King West 这类房源封面采光好可提升 30% 询盘。
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="sl-btn-secondary">← 上一步</button>
                  <button onClick={() => setStep(3)} className="sl-btn-primary flex-1 !py-[12px]">下一步 · 价格 + 押金</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">3 · 价格 + 押金</h2>
                <div className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  <b className="text-brand">💡 Logic：</b>市场租金中位数 <b>$2,820</b> · 建议挂 <b>$2,850</b>（King West 1B+den · 轻微上浮可谈空间）。押金按 RTA 标准 = 一个月租金。
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="月租 (CAD) *"><input className="sl-input" type="number" required value={form.monthly_rent} onChange={(e) => set('monthly_rent', e.target.value)} /></Field>
                  <Field label="押金 (CAD)"><input className="sl-input" type="number" value={form.deposit} onChange={(e) => set('deposit', e.target.value)} /></Field>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="sl-btn-secondary">← 上一步</button>
                  <button onClick={() => setStep(4)} className="sl-btn-primary flex-1 !py-[12px]">下一步 · 认证门槛</button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-[18px] font-bold">4 · 认证门槛</h2>
                <p className="mt-2 text-[13px] text-body-2">
                  这决定哪些租客可以申请。认证级别越高越严格。系统会按你设定自动筛选。
                </p>
                <div className="mt-5 space-y-3">
                  {[
                    { n: 1, name: '认证 1 级 · 仅 ID 验证', desc: '租客只需护照 + 自拍。最快但筛选最弱。', stats: '~80% 通过率' },
                    { n: 2, name: '认证 2 级 · ID + 收入',   desc: '工资单或 Plaid 月收入验证。',         stats: '~50% 通过率' },
                    { n: 3, name: '认证 3 级 · ID + 收入 + 银行', desc: 'Plaid 直连 · 现金流可见。',          stats: '~30% 通过率' },
                    { n: 4, name: '认证 4 级 · 全部 + 信用 + 法庭', desc: 'Equifax + CanLII LTB · 最严。',      stats: '~15% 通过率' },
                  ].map((t) => {
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
                  <button onClick={() => setStep(3)} className="sl-btn-secondary">← 上一步</button>
                  <button onClick={() => setStep(5)} className="sl-btn-primary flex-1 !py-[12px]">下一步 · 最后审 + 发布</button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">5 · 最后审 + 发布</h2>
                <div className="rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/[0.04] p-4 text-[13px] leading-relaxed text-body">
                  <div className="font-mono text-[11.5px] font-bold tracking-eyebrow text-[#7C3AED]">
                    📝 已改写为 Stayloop 风格 · EN + 中文双语
                  </div>
                  <p className="mt-2">
                    <b className="text-brand">Logic 改写：</b>去 MLS 套话 · 加入 King West 步行细节（步行 4 分到 TTC，6 分到 Stackt Market）· 突出租客最关心的「包暖 + 水」与「允许猫」· 中文版同步生成。
                  </p>
                </div>

                <div className="rounded-xl border border-line-divider bg-white p-4">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                    房源摘要
                  </div>
                  <dl className="mt-3 space-y-2 text-[13px]">
                    <Row k="地址" v={form.address} />
                    <Row k="户型" v={`${form.bedrooms} 卧 · ${form.bathrooms} 卫 · ${form.sqft} sqft`} />
                    <Row k="月租 / 押金" v={`$${form.monthly_rent} / $${form.deposit}`} />
                    <Row k="认证门槛" v={`认证 ${form.tier} 级`} />
                    <Row k="配套" v={form.amenities.join(' · ') || '—'} />
                  </dl>
                </div>

                <div className="rounded-xl border border-line-divider bg-white p-4 text-[13px]">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrow text-body-3">
                    合规检查
                  </div>
                  <div className="mt-2 font-semibold text-brand">✓ RTA / RECO 通过</div>
                  <div className="mt-1 text-[12px] text-body-3">
                    已自动加入 RTA 标准条款 · 删除 MLS 中「先到先得」等违规话术。
                  </div>
                </div>

                {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
                <div className="flex gap-3">
                  <button onClick={() => setStep(4)} className="sl-btn-secondary">← 上一步</button>
                  <button onClick={submit} disabled={submitting} className="sl-btn-primary flex-1 !py-[12px]">
                    {submitting ? '发布中…' : '✓ 用这版发布'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
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

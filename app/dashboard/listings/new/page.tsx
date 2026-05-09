'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useLandlord } from '@/lib/useLandlord'

export default function NewListingPage() {
  const router = useRouter()
  const { landlord, loading: authLoading } = useLandlord()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    address: '', unit: '', city: 'Toronto', province: 'ON',
    monthly_rent: '', bedrooms: '1', bathrooms: '1',
    tier: 2,
  })

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

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
          <div className="mb-8 mt-3">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg text-brand">
              LISTING WIZARD · STEP {step} / 2
            </div>
            <h1 className="mt-2 text-[32px] font-bold tracking-tight">发布新房源</h1>
          </div>

          <div className="sl-card p-7 sm:p-8">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-[18px] font-bold">1 · 基本信息</h2>
                <Field label="地址 *">
                  <input className="sl-input" required value={form.address} onChange={(e) => set('address', e.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="单元号"><input className="sl-input" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
                  <Field label="城市"><input className="sl-input" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="月租 (CAD) *"><input className="sl-input" type="number" required value={form.monthly_rent} onChange={(e) => set('monthly_rent', e.target.value)} /></Field>
                  <Field label="卧室"><input className="sl-input" type="number" min="0" value={form.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} /></Field>
                  <Field label="卫生间"><input className="sl-input" type="number" min="1" value={form.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} /></Field>
                </div>
                <button onClick={() => setStep(2)} className="sl-btn-primary w-full !py-[12px]">下一步</button>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-[18px] font-bold">2 · 设定 Trust Tier 要求</h2>
                <p className="mt-2 text-[13px] text-body-2">
                  这决定哪些租客可以申请。Tier 越高越严格。系统会按你设定自动筛选。
                </p>
                <div className="mt-5 space-y-3">
                  {[
                    { n: 1, name: 'Tier 1 · 仅 ID 验证', desc: '租客只需护照 + 自拍。最快但筛选最弱。', stats: '~80% 通过率' },
                    { n: 2, name: 'Tier 2 · ID + 收入',   desc: '工资单或 Plaid 月收入验证。',         stats: '~50% 通过率' },
                    { n: 3, name: 'Tier 3 · ID + 收入 + 银行', desc: 'Plaid 直连 · 现金流可见。',          stats: '~30% 通过率' },
                    { n: 4, name: 'Tier 4 · 全部 + 信用 + 法庭', desc: 'Equifax + CanLII LTB · 最严。',      stats: '~15% 通过率' },
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
                {error && <div className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</div>}
                <div className="mt-6 flex gap-3">
                  <button onClick={() => setStep(1)} className="sl-btn-secondary">← 上一步</button>
                  <button onClick={submit} disabled={submitting} className="sl-btn-primary flex-1 !py-[12px]">
                    {submitting ? '发布中…' : '发布房源'}
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

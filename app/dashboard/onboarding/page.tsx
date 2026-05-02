'use client'
// /dashboard/onboarding — Landlord Onboarding (V3 section 23)
import { useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

const STEPS = [
  { en: 'Account', zh: '账户基础', done: true },
  { en: 'Identity', zh: '身份核验', done: true },
  { en: 'Add property', zh: '添加房产', active: true },
  { en: 'Activate', zh: '激活上线' },
]

const INSURANCE_CARRIERS = [
  'Northbridge',
  'Square One',
  'TD',
  'Apollo',
  'Other',
]

export default function LandlordOnboardingPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [selectedInsurer, setSelectedInsurer] = useState<string | null>(null)
  const [idvComplete, setIdvComplete] = useState({
    governmentId: false,
    recoVerification: false,
    bankAccount: false,
  })

  const allIdvDone = Object.values(idvComplete).every(Boolean)
  return (
    <PageShell role="landlord">
      <div style={{ maxWidth: size.content.default, margin: '0 auto', display: 'grid', gridTemplateColumns: '220px 1fr 320px', gap: 24 }} className="lo-grid">
        <style jsx>{`
          @media (max-width: 1023px) {
            :global(.lo-grid) {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 767px) {
            :global(.lo-grid) {
              grid-template-columns: 1fr !important;
            }
            :global(.lo-grid > aside:last-child) {
              display: none !important;
            }
          }
        `}</style>
        {/* Steps */}
        <aside style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STEPS.map((s, i) => (
              <div key={s.en} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: s.active ? v3.brandSoft : 'transparent', color: s.done || s.active ? v3.brandStrong : v3.textMuted }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: s.done ? v3.brand : s.active ? v3.brand : v3.divider, color: s.done || s.active ? '#fff' : v3.textMuted, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
                  {s.done ? '✓' : i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{isZh ? s.zh : s.en}</div>
                  <div style={{ fontSize: 10, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui' }}>{isZh ? s.en : s.zh}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Form */}
        <section style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          <SecHead
            eyebrow="STEP 3"
            title={isZh ? '你的第一套房产' : 'Your First Property'}
          />

          {/* Insurance carrier selector */}
          <div style={{ marginBottom: 20, padding: 16, background: v3.surfaceMuted, borderRadius: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
              {isZh ? '保险供应商 / Insurance Carrier' : 'Insurance Carrier · 保险供应商'}
            </label>
            <select
              value={selectedInsurer || ''}
              onChange={(e) => setSelectedInsurer(e.target.value || null)}
              style={{
                width: '100%',
                padding: '11px 14px',
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 10,
                fontSize: 14,
                color: '#0B1736',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="">{isZh ? '选择保险商...' : 'Select an insurer...'}</option>
              {INSURANCE_CARRIERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
            {isZh ? '告诉我们你要出租的单元' : 'Tell us about the unit you want to rent.'}
          </h1>
          <p style={{ fontSize: 13, color: v3.textMuted, marginBottom: 18 }}>
            {isZh ? 'Nova 会从 MLS / 政府记录自动补全大部分字段' : 'Nova auto-fills 14 fields from MLS + ON Land Registry.'}
          </p>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
            {isZh ? '地址' : 'Address'}
          </label>
          <input
            defaultValue="2350 King Street West, Unit 1208, Toronto, ON M6K 0H4"
            style={{ width: '100%', padding: '12px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 14, color: v3.textPrimary, fontFamily: 'inherit' }}
          />
          <div style={{ marginTop: 8, padding: '8px 12px', background: v3.brandSoft, borderRadius: 8, fontSize: 12, color: v3.brandStrong, fontWeight: 500 }}>
            ✓ {isZh ? 'Nova 在 MLS + 房产记录里找到了这套房 · 已自动填充 14 个字段。' : 'Nova found this in MLS + property records. 14 fields auto-filled.'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 18 }}>
            {[
              { label_en: 'Bedrooms', label_zh: '卧室', value: '1' },
              { label_en: 'Bathrooms', label_zh: '卫浴', value: '1' },
              { label_en: 'Square footage', label_zh: '面积', value: '612' },
              { label_en: 'Year built', label_zh: '建成年份', value: '2019' },
              { label_en: 'Property tax', label_zh: '物业税', value: '$3,840/yr' },
              { label_en: 'Suggested rent', label_zh: '建议租金', value: '$2,350' },
            ].map((f) => (
              <div key={f.label_en}>
                <label style={{ fontSize: 11, fontWeight: 600, color: v3.textMuted, display: 'block', marginBottom: 4 }}>{isZh ? f.label_zh : f.label_en}</label>
                <input defaultValue={f.value} style={{ width: '100%', padding: '10px 12px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 13, color: v3.textPrimary }} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, padding: 14, background: v3.brandSoft, border: `1px solid ${v3.brand}`, borderLeft: `3px solid ${v3.brand}`, borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              ✓ {isZh ? 'ON 土地注册局核实通过' : 'ON Land Registry — Match found'}
            </div>
            <div style={{ fontSize: 12, color: v3.textPrimary, fontFamily: 'var(--font-mono)' }}>
              ON-LR record · Parcel ID 21349-0823 · Owner: Sarah K. Doyle ✓
            </div>
          </div>

          {/* IDV Section */}
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${v3.divider}` }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px', color: v3.textPrimary }}>
              {isZh ? '身份核验 · Identity Verification' : 'Identity Verification · 身份核验'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                {
                  en: 'Upload government ID',
                  zh: '上传政府 ID',
                  key: 'governmentId',
                  placeholder: isZh ? '选择文件...' : 'Choose file...',
                },
                {
                  en: 'RECO verification',
                  zh: 'RECO 验证',
                  key: 'recoVerification',
                  placeholder: isZh ? '输入 RECO #' : 'Enter RECO #',
                  isNumber: true,
                },
                {
                  en: 'Bank account',
                  zh: '银行账户',
                  key: 'bankAccount',
                  placeholder: isZh ? '连接 Flinks' : 'Connect via Flinks',
                },
              ].map((card) => (
                <div
                  key={card.key}
                  onClick={() => setIdvComplete((prev) => ({ ...prev, [card.key]: !prev[card.key as keyof typeof idvComplete] }))}
                  style={{
                    background: idvComplete[card.key as keyof typeof idvComplete] ? v3.successSoft : v3.surface,
                    border: `1px solid ${idvComplete[card.key as keyof typeof idvComplete] ? v3.success : v3.border}`,
                    borderRadius: 12,
                    padding: 14,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: idvComplete[card.key as keyof typeof idvComplete] ? v3.success : v3.divider,
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {idvComplete[card.key as keyof typeof idvComplete] && '✓'}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: v3.textSecondary }}>
                      {isZh ? card.zh : card.en}
                    </span>
                  </div>
                  <input
                    type={card.isNumber ? 'number' : 'text'}
                    placeholder={card.placeholder}
                    disabled={true}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: v3.surfaceMuted,
                      border: `1px solid ${v3.border}`,
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#0B1736',
                      opacity: 0.7,
                      cursor: 'not-allowed',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <button style={{ padding: '10px 18px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: v3.textSecondary }}>
              ← {isZh ? '返回' : 'Back'}
            </button>
            <button
              disabled={!allIdvDone}
              style={{
                padding: '10px 22px',
                background: allIdvDone
                  ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)'
                  : '#C5BDAA',
                color: allIdvDone ? '#fff' : '#71717A',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: allIdvDone ? 'pointer' : 'not-allowed',
                boxShadow: allIdvDone ? '0 8px 22px -10px rgba(52, 211, 153, 0.45)' : 'none',
              }}
            >
              {isZh ? '继续激活' : 'Continue to activation'} →
            </button>
          </div>
        </section>

        {/* Live preview */}
        <aside style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', alignSelf: 'start', position: 'sticky', top: 24 }}>
          <div style={{ padding: 14, borderBottom: `1px solid ${v3.divider}`, fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {isZh ? '实时预览 · LISTING PREVIEW' : 'LISTING PREVIEW · 实时预览'}
          </div>
          <div style={{ height: 120, background: 'linear-gradient(135deg, #134e4a, #0f766e)', position: 'relative' }}>
            <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: '#fff', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.08em' }}>NEW</span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>The Hudson #1208</div>
            <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 8 }}>2350 King W · Liberty Village</div>
            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: v3.textSecondary, marginBottom: 12 }}>
              <span>1 bed</span><span>·</span><span>1 bath</span><span>·</span><span>612 ft²</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: v3.brandStrong, letterSpacing: '-0.025em' }}>$2,350/mo</div>
            <p style={{ fontSize: 11, color: v3.textMuted, marginTop: 10, lineHeight: 1.5 }}>
              {isZh ? '激活后，Nova 会生成照片角度建议、双语文案，以及 Stayloop Index 的合理租金区间。' : 'Once activated, Nova will draft photos, copy, and a Stayloop Index price band.'}
            </p>
          </div>
        </aside>
      </div>

    </PageShell>
  )
}

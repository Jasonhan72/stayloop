'use client'
// /insurance — Renter insurance bind (V3 section 18)
import { useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'
import PageShell from '@/components/v4/PageShell'

interface Quote {
  carrier: string
  price: number
  badge?: string
  cover: string
  annual: number
  color: string
}

const QUOTES: Quote[] = [
  { carrier: 'Northbridge', price: 18, badge: 'BEST PRICE', cover: '$2M liability · $50k contents', annual: 216, color: '#0EA5E9' },
  { carrier: 'Square One', price: 22, cover: '$2M liability · $60k contents', annual: 264, color: '#3B82F6' },
  { carrier: 'Apollo', price: 24, badge: 'PREMIUM', cover: '$3M liability · $50k contents', annual: 288, color: '#A855F7' },
]

export default function InsurancePage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [bound, setBound] = useState<Quote | null>(null)
  return (
    <PageShell role="tenant">
      <Phone time="14:42">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: v3.textMuted }}>‹</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isZh ? '租客险' : 'Tenant Insurance'}</span>
          <span style={{ fontSize: 12, color: v3.textMuted }}>Skip</span>
        </div>

        <div style={{ padding: 16 }}>
          {bound ? (
            // Certificate view
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
                {isZh ? '保险已生效' : 'Policy bound'}
              </h1>
              <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 20 }}>
                {isZh ? '您的保险现已生效' : 'Your coverage is now active'}
              </div>

              {/* Certificate card */}
              <div style={{
                background: 'linear-gradient(135deg, #EAE5D9 0%, #E8F0E8 100%)',
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 24,
                marginBottom: 20,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{bound.carrier}</div>
                <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 14, fontFamily: 'var(--font-mono)' }}>
                  Policy #SL-{Math.random().toString(36).substr(2, 8).toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: v3.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
                  {bound.cover}
                </div>
                <div style={{ fontSize: 11, color: v3.textMuted }}>
                  {isZh ? '生效日期' : 'Effective'} · {new Date().toLocaleDateString(isZh ? 'zh-CN' : 'en-US')}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <button
                  style={{
                    width: '100%',
                    background: v3.brand,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '发送给房东' : 'Send to landlord'}
                </button>
                <button
                  style={{
                    width: '100%',
                    background: v3.surface,
                    color: v3.textPrimary,
                    border: `1px solid ${v3.border}`,
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '下载 PDF' : 'Download PDF'}
                </button>
              </div>

              {/* Renewal reminder */}
              <div style={{ padding: 12, background: v3.surfaceTint, border: `1px solid ${v3.brandSoft}`, borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}>🔔</span>
                <span style={{ fontSize: 12, color: v3.textSecondary, lineHeight: 1.4 }}>
                  {isZh
                    ? '续保时我们会提前30天通知您'
                    : "We'll remind you 30 days before renewal"}
                </span>
              </div>
            </>
          ) : (
            // Quote view
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
                {isZh ? '租约要求购买租客险' : 'Required by your lease'}
              </h1>
              <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 14, fontFamily: 'var(--font-cn), system-ui' }}>
                {isZh ? '合同条款 8.3' : 'Clause 8.3 · Tenant insurance'}
              </div>
              <p style={{ fontSize: 13, color: v3.textSecondary, lineHeight: 1.6, margin: '0 0 16px' }}>
                {isZh
                  ? '你的 Passport 数据已自动填入申请表。3 家承保方实时竞价，最低价一键绑定。'
                  : 'Your Passport data prefilled the application. 3 carriers competed live for your business.'}
              </p>

              {/* Pre-fill form summary */}
              <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                  {isZh ? '您的信息' : 'YOUR DETAILS'}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: v3.textMuted }}>Name</span>
                    <span style={{ fontWeight: 600 }}>Wei Chen</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: v3.textMuted }}>Email</span>
                    <span style={{ fontWeight: 600 }}>wei@example.com</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: v3.textMuted }}>Address</span>
                    <span style={{ fontWeight: 600, textAlign: 'right' }}>456 Spadina Ave</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 8, borderTop: `1px solid ${v3.divider}` }}>
                    <span style={{ color: v3.textMuted }}>Income</span>
                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      $6,500/mo
                      <span style={{ fontSize: 10, fontWeight: 700, color: v3.success, background: v3.successSoft, padding: '2px 6px', borderRadius: 4 }}>✓ Verified</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Quotes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {QUOTES.map((q, i) => (
                  <div key={q.carrier} style={{
                    background: v3.surface,
                    border: `1px solid ${i === 0 ? v3.brand : v3.border}`,
                    borderRadius: 14,
                    padding: 14,
                    position: 'relative',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: q.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>
                        {q.carrier[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{q.carrier}</span>
                          {q.badge && (
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: i === 0 ? v3.brandStrong : v3.trust, background: i === 0 ? v3.brandSoft : v3.trustSoft, padding: '2px 8px', borderRadius: 999 }}>
                              {q.badge}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>{q.cover}</div>
                        <div style={{ fontSize: 10.5, color: v3.textFaint, marginTop: 2, fontFamily: 'var(--font-mono)' }}>${q.annual}/yr · cancel anytime</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em', lineHeight: 1 }}>${q.price}</div>
                        <div style={{ fontSize: 10, color: v3.textMuted }}>/mo</div>
                      </div>
                    </div>
                    {i === 0 && (
                      <button
                        onClick={() => setBound(q)}
                        style={{ width: '100%', background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, marginTop: 8, cursor: 'pointer' }}>
                        {isZh ? `绑定 ${q.carrier} · $${q.price}/mo` : `Bind ${q.carrier} · $${q.price}/mo`}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: 12, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 11, color: v3.textMuted, lineHeight: 1.5 }}>
                {isZh
                  ? '承保后自动向房东发送保单证明 · Passport 数据不外传，只发送保单证明文件。'
                  : 'Carrier auto-shares proof-of-insurance with your landlord. Passport stays sealed — only the policy certificate is transmitted.'}
              </div>
            </>
          )}
        </div>
      </Phone>
    </PageShell>
  )
}

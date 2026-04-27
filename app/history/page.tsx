'use client'
// /history — Tenant Rental History (V3 section 24)
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'

const TENANCIES = [
  { years: '2024 — Now', addr: '2350 King W #1208', city: 'Toronto', months: 23, rent: 2350, landlord: 'Sarah Doyle', stars: 5, note: '', verified: true, active: true },
  { years: '2022 — 2024', addr: '88 Spadina #710', city: 'Toronto', months: 24, rent: 1950, landlord: 'M. Tanaka', stars: 5, note: 'Outstanding tenant. Quiet, respectful, always paid early.' },
  { years: '2021 — 2022', addr: '15 Iceboat Terrace', city: 'Toronto', months: 13, rent: 1720, landlord: 'Pearl Property Mgmt', stars: 5, note: 'Highly recommend. Left unit cleaner than move-in.' },
]

export default function HistoryPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <Phone time="14:55">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: v3.textMuted }}>‹</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isZh ? '租房记录' : 'Rental History'}</span>
          <span style={{ fontSize: 12, color: v3.brandStrong, fontWeight: 600 }}>{isZh ? '分享' : 'Share'}</span>
        </div>

        <div style={{ padding: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            {isZh ? '5 年 · 3 段租约' : '5 years · 3 tenancies'}
          </h1>
          <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 16, fontFamily: 'var(--font-cn), system-ui' }}>
            {isZh ? '全部按时支付 · 全部好评' : '60 / 60 on-time payments · 0 disputes'}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <div style={{ flex: 1, padding: 14, background: v3.brandSoft, border: `1px solid ${v3.brand}`, borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: v3.brandStrong, letterSpacing: '-0.025em' }}>60 / 60</div>
              <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>{isZh ? '准时缴租次数' : 'on-time rent payments'}</div>
            </div>
            <div style={{ flex: 1, padding: 14, background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em' }}>0</div>
              <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>{isZh ? '纠纷' : 'disputes'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TENANCIES.map((t, i) => (
              <div key={i} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, position: 'relative' }}>
                <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{t.years}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, marginBottom: 2 }}>{t.addr}</div>
                <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 10 }}>
                  {t.city} · {t.months} {isZh ? '个月' : 'mo'} · ${t.rent}/mo
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: v3.surfaceMuted, borderRadius: 8 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>
                    {t.landlord.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: v3.textPrimary }}>{t.landlord}</div>
                    {t.active ? (
                      <div style={{ fontSize: 10, color: v3.brandStrong, fontWeight: 600 }}>{isZh ? '当前 · Stayloop 已核签' : 'Active · Verified by Stayloop'}</div>
                    ) : t.note ? (
                      <div style={{ fontSize: 10.5, color: v3.textMuted, lineHeight: 1.4, marginTop: 2 }}>"{t.note}"</div>
                    ) : null}
                  </div>
                  <div style={{ color: v3.warning, fontSize: 11, letterSpacing: '-0.05em', flexShrink: 0 }}>
                    {'★'.repeat(t.stars)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Phone>
    </main>
  )
}

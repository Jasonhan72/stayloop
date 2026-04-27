'use client'
// /agent/mls — MLS Ready Pack (V3 section 09, mobile)
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'

export default function MlsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <Phone time="14:37">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: v3.textMuted }}>‹</span>
          <span style={{ fontSize: 13, color: v3.brandStrong, fontWeight: 700 }}>{isZh ? '23 分钟后开始' : 'Tour in 23 min'}</span>
          <span style={{ fontSize: 16, color: v3.textMuted }}>⋯</span>
        </div>
        <div style={{ padding: '14px 16px 8px' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>The Hudson · #1208</div>
          <div style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui' }}>{isZh ? '带看 · 陈伟 (Wei Chen) · 15:00' : 'Tour · Wei Chen · 15:00'}</div>
        </div>
        <div style={{ padding: '8px 16px', display: 'flex', gap: 4 }}>
          {[
            { en: 'MLS Pack', active: true },
            { en: 'Tenant' },
            { en: 'Talking' },
            { en: 'Comps' },
          ].map((t) => (
            <span key={t.en} style={{ flex: 1, padding: '8px', textAlign: 'center', fontSize: 11.5, fontWeight: t.active ? 700 : 500, color: t.active ? v3.brandStrong : v3.textMuted, background: t.active ? v3.brandSoft : 'transparent', borderRadius: 8, border: t.active ? `1px solid ${v3.brand}` : `1px solid ${v3.border}` }}>
              {t.en}
            </span>
          ))}
        </div>

        <div style={{ padding: '8px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>MLS READY · TRREB FORMAT</span>
            <span style={{ color: v3.brandStrong }}>{isZh ? '点击复制' : 'Tap to copy'}</span>
          </div>
          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.55, color: v3.textPrimary, fontFamily: 'var(--font-mono)' }}>
            Bright south-facing 1BR steps to King W. 612 sqft + 280 sqft balcony, in-suite W/D, chef\u2019s kitchen, gym + co-work + rooftop. Min to Shopify HQ, Stackt, TTC. May 1. $2,350/mo · 12-mo · pet-friendly.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: v3.textMuted, marginTop: 6 }}>
            <span>1,140 chars</span>
            <span style={{ color: v3.brandStrong, fontWeight: 600 }}>SEO 94</span>
            <span>双语 ready</span>
          </div>
        </div>

        <div style={{ padding: '14px 16px 8px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>{isZh ? '拍摄清单 · Nova 推荐角度' : 'Capture list · Nova picked'}</span>
            <span style={{ color: v3.brandStrong, fontFamily: 'var(--font-mono)' }}>9/12</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Hero · balcony', done: true },
              { label: 'Living room', done: true },
              { label: 'Kitchen wide', done: true },
              { label: 'Bedroom', done: false },
            ].map((s) => (
              <div key={s.label} style={{ aspectRatio: '4/3', background: s.done ? `linear-gradient(135deg, #134e4a, #0f766e)` : v3.surfaceMuted, border: s.done ? 'none' : `1px dashed ${v3.borderStrong}`, borderRadius: 10, padding: 8, color: s.done ? '#fff' : v3.textMuted, fontSize: 10, display: 'flex', alignItems: 'flex-end' }}>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderTop: `1px solid ${v3.divider}`, marginTop: 8 }}>
          <button style={{ flex: 1, padding: '12px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600 }}>📍 {isZh ? '导航' : 'Navigate'}</button>
          <button style={{ flex: 1, padding: '12px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>✓ {isZh ? '完成带看' : 'Mark complete'}</button>
        </div>
      </Phone>
    </main>
  )
}

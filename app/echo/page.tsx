'use client'
// /echo — Tenant Echo concierge (V3 section 01)
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'

export default function EchoPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh', padding: '24px 12px' }}>
      <Phone>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${v3.brand}, ${v3.brandStrong})`, display: 'grid', placeItems: 'center', boxShadow: `0 4px 12px ${v3.brandSoft}` }}>
                <span style={{ fontSize: 16, color: '#fff' }}>✦</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Echo</div>
                <div style={{ fontSize: 10.5, color: v3.brand, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: v3.brand }} />
                  Online · 中英双语
                </div>
              </div>
            </div>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>WC</div>
          </div>

          {/* Conversation */}
          <div style={{ flex: 1, padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            <div style={{ textAlign: 'center', fontSize: 10, color: v3.textFaint, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Today · 14:22
            </div>

            {/* User */}
            <div style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
              <div style={{ background: v3.textPrimary, color: v3.surface, padding: '9px 13px', borderRadius: '16px 16px 4px 16px', fontSize: 13, lineHeight: 1.45, fontWeight: 500 }}>
                {isZh
                  ? '找一个 King West 附近、走路 15 分钟到 Shopify 总部的 1B1B，预算 $2400，月底前要入住'
                  : 'Find a 1B1B near King West, 15 min walk to Shopify HQ, budget $2400, move-in by end of month'}
              </div>
            </div>

            {/* Reasoning */}
            <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
              <div style={{ border: `1px solid ${v3.border}`, borderRadius: 14, padding: '10px 12px', background: v3.surfaceMuted, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, color: v3.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: v3.brand }}>⚡</span>
                  Echo · {isZh ? '推理中' : 'reasoning'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: v3.textSecondary, fontFamily: 'var(--font-mono), ui-monospace, monospace' }}>
                  <div><span style={{ color: v3.brand }}>✓</span> parsed: budget $2400 · 1B1B · move-in Apr 30</div>
                  <div><span style={{ color: v3.brand }}>✓</span> commute target: 620 King St W · 15 min walk</div>
                  <div><span style={{ color: v3.brand }}>✓</span> matched 47 listings · ranked top 3</div>
                </div>
              </div>
            </div>

            {/* Reply bubble */}
            <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
              <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: '16px 16px 16px 4px', padding: '11px 13px', fontSize: 13, lineHeight: 1.5, color: v3.textPrimary }}>
                <div>King West {isZh ? '找到 ' : 'matched '}<b style={{ color: v3.brand }}>3 套</b>{isZh ? '满足条件的房源。第二个评分最高 — ' : ' units. #2 ranked highest — '}
                  <i style={{ color: v3.textMuted }}>{isZh ? '房东 30 天没回复，所以加急了。' : 'landlord hasn\u2019t responded in 30 days, so I\u2019m prioritising it.'}</i>
                </div>
              </div>
            </div>

            {/* Listing card */}
            <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', alignSelf: 'flex-start', width: '88%', maxWidth: 280 }}>
              <div style={{ height: 96, background: 'linear-gradient(135deg, #1e3a8a 0%, #0f766e 60%, #134e4a 100%)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(16, 185, 129, 0.85)', padding: '3px 8px', borderRadius: 999 }}>
                  ✦ 97% match
                </div>
                <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 7px', fontSize: 10, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                  12 min walk · 620 King W
                </div>
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>The Hudson · #1208</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: v3.brand, fontWeight: 600 }}>$2,350</div>
                </div>
                <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 8 }}>1 Bed · 1 Bath · 612 sqft · {isZh ? '5 月 1 日' : 'May 1'}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {['South-facing', 'In-suite W/D', 'Verified Landlord'].map((t, i) => (
                    <span key={i} style={{ fontSize: 9.5, color: v3.textSecondary, background: v3.divider, padding: '2px 8px', borderRadius: 999 }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              {[
                { label: isZh ? '📅 预约看房' : '📅 Book showing', primary: true },
                { label: isZh ? '💬 联系房东' : '💬 Ask landlord' },
                { label: isZh ? '+2 套' : '+2 more' },
              ].map((a, i) => (
                <span key={i} style={{ padding: '6px 10px', borderRadius: 999, background: a.primary ? v3.brandSoft : v3.surface, border: `1px solid ${a.primary ? v3.brand : v3.border}`, fontSize: 11.5, color: a.primary ? v3.brandStrong : v3.textSecondary, fontWeight: 500, cursor: 'pointer' }}>
                  {a.label}
                </span>
              ))}
            </div>
          </div>

          {/* Composer */}
          <div style={{ padding: '8px 14px 14px', borderTop: `1px solid ${v3.divider}`, display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 999, padding: '9px 14px', fontSize: 13, color: v3.textMuted }}>
              {isZh ? '用任何语言问我…' : 'Ask in any language…'}
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 999, background: v3.brand, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 16, boxShadow: `0 4px 14px ${v3.brandSoft}` }}>
              →
            </div>
          </div>
        </div>
      </Phone>
    </main>
  )
}

'use client'
// /agent/showings/[id] — Showing Detail (V3 section 08)
export const runtime = 'edge'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

const COMPS = [
  { addr: '456 King W · 1208', rent: 2395, dom: '11d' },
  { addr: '25 Stafford · 502', rent: 2300, dom: '5d' },
  { addr: '170 Bathurst · 808', rent: 2400, dom: '14d' },
]

const QA = [
  { q: 'Pet policy?', a: 'No pet' },
  { q: 'Move-in date?', a: 'Apr 30 firm' },
  { q: 'Parking?', a: 'Not needed' },
  { q: 'Length?', a: '12mo, possibly 24mo' },
]

export default function ShowingDetailPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <header style={{ background: v3.surface, borderBottom: `1px solid ${v3.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/agent/day" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: v3.textPrimary }}>
          <span style={{ fontSize: 16 }}>‹</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{isZh ? '看房简报' : 'Showing brief'}</span>
        </Link>
        <span style={{ fontSize: 12, color: v3.brand, fontWeight: 700 }}>15:00 · {isZh ? '今天' : 'today'}</span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {isZh ? '看房 #2104 · 还有 45 分钟' : 'SHOWING #2104 · 45 MIN FROM NOW'}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', margin: '4px 0 0' }}>The Hudson · #1208</h1>
            <div style={{ fontSize: 12, color: v3.textMuted }}>620 King St W · {isZh ? '为 Sarah Park 代理' : 'for Sarah Park'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '8px 14px', background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600 }}>📍 {isZh ? '导航' : 'Navigate'}</button>
            <button style={{ padding: '8px 14px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>🔑 Lockbox: 4827</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 18 }} className="sd-grid">
          {/* Tenant brief */}
          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ width: 48, height: 48, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700 }}>WC</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>Wei Chen</span>
                  <span style={{ fontSize: 11, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>✓ Verified</span>
                </div>
                <div style={{ fontSize: 12, color: v3.textMuted }}>Sr. Engineer @ Shopify · 4 yrs · arrived 🇨🇳 2022</div>
                <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>EN · 中文 · Lease Apr 30 · 3.6× rent</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: v3.brandStrong, letterSpacing: '-0.025em', lineHeight: 1 }}>92</div>
                <div style={{ fontSize: 9, color: v3.textMuted, fontWeight: 600, letterSpacing: '0.08em' }}>SCORE</div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${v3.divider}`, paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {isZh ? '六维拆解' : 'SIX-AXIS BREAKDOWN'}
              </div>
              {[
                { en: 'Identity', val: 'Persona + GovID' },
                { en: 'Income', val: '$8,420/mo · Flinks' },
                { en: 'Credit', val: '748 · Equifax' },
                { en: 'History', val: '0 LTB · 2 prior leases' },
                { en: 'Stability', val: '4 yrs same employer' },
              ].map((r) => (
                <div key={r.en} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${v3.divider}` }}>
                  <span style={{ color: v3.textSecondary }}>{r.en}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: v3.textPrimary }}>{r.val}</span>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                ✦ {isZh ? 'Echo · Wei 问过的问题' : 'ECHO · WHAT WEI ASKED'}
              </div>
              {QA.map((row) => (
                <div key={row.q} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${v3.divider}` }}>
                  <span style={{ color: v3.textSecondary, fontStyle: 'italic' }}>"{row.q}"</span>
                  <span style={{ color: v3.brandStrong, fontWeight: 600 }}>→ {row.a}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                {isZh ? '快捷操作' : 'QUICK ACTIONS'}
              </div>
              <div style={{ fontSize: 12.5, color: v3.textPrimary, lineHeight: 1.6, marginBottom: 12 }}>
                {isZh
                  ? 'Drive to 620 King St W, arrive 14:55 to unlock. Beacon 会发送 5 分钟 ETA 提醒给 Wei。'
                  : 'Drive to 620 King St W, arrive 14:55 to unlock. I\u2019ll text Wei a 5-min ETA reminder via Beacon.'}
              </div>
              <div style={{ borderTop: `1px solid ${v3.divider}`, paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {isZh ? '看完后 · 1 键反馈' : 'After tour · 1-click feedback'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {['🟢 Will apply', '🟡 Thinking', '🔴 Not for me', '✏️ Note'].map((b) => (
                    <button key={b} style={{ padding: '8px 12px', background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: v3.textPrimary, textAlign: 'left' }}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                {isZh ? '议价可比 · 由 Logic 提供' : 'NEGOTIATION COMPS · via Logic'}
              </div>
              {COMPS.map((c) => (
                <div key={c.addr} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${v3.divider}` }}>
                  <span style={{ color: v3.textPrimary }}>{c.addr}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>${c.rent.toLocaleString()} · {c.dom}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`@media (max-width: 880px){:global(.sd-grid){grid-template-columns:1fr !important;}}`}</style>
    </main>
  )
}

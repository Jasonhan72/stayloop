'use client'
// /dashboard/portfolio — Landlord Portfolio Analytics (V3 section 20)
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'

const PROPS = [
  { addr: '2350 King W #1208', rent: 2350, status: 'Occupied', dom: '0d', score: 872, health: 96 },
  { addr: '88 Front St #2204', rent: 2800, status: 'Occupied', dom: '0d', score: 815, health: 88 },
  { addr: '32 Trolley Cres', rent: 3100, status: 'Vacant', dom: '11d', score: null, health: 64 },
  { addr: '171 East Liberty', rent: 2200, status: 'Occupied', dom: '0d', score: 791, health: 92 },
]

export default function PortfolioPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <header style={{ background: v3.surface, borderBottom: `1px solid ${v3.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: v3.textPrimary }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: v3.brand, color: '#fff', fontWeight: 800, fontSize: 14 }}>S</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>stayloop</span>
          </Link>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{isZh ? '组合 · 6 套房产' : 'Portfolio · 6 properties'}</span>
        </div>
        <span style={{ fontSize: 12, color: v3.textMuted }}>Sarah Doyle · Toronto West GTA · Q2 2026</span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { en: 'Monthly cash flow', zh: '月度现金流', val: '$9,950', delta: '+4.2%', positive: true },
            { en: 'Occupancy', zh: '出租率', val: '67%', delta: '−16%', positive: false },
            { en: 'Avg tenant score', zh: '租客均分', val: '834', delta: '+12', positive: true },
            { en: 'Days on market avg', zh: '上架平均', val: '7.5', delta: '−3 d', positive: true },
          ].map((s) => (
            <div key={s.en} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                {isZh ? `${s.zh} · ${s.en}` : s.en}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em' }}>{s.val}</span>
                <span style={{ fontSize: 12, color: s.positive ? v3.brandStrong : v3.danger, fontWeight: 600 }}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Cash flow chart */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{isZh ? '近 12 月净现金流' : 'Net cash flow · 12 months'}</div>
              <div style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui' }}>{isZh ? '近 12 月净现金流' : '近 12 月净现金流'}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '4px 10px', borderRadius: 999 }}>+$2,940 vs forecast</span>
          </div>
          <svg viewBox="0 0 800 160" width="100%" height={160}>
            <defs>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={v3.brand} stopOpacity="0.18" />
                <stop offset="100%" stopColor={v3.brand} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0,120 L80,118 L160,114 L240,112 L320,108 L400,100 L480,90 L560,80 L640,70 L720,60 L800,55 L800,160 L0,160 Z" fill="url(#g2)" />
            <path d="M0,120 L80,118 L160,114 L240,112 L320,108 L400,100 L480,90 L560,80 L640,70 L720,60 L800,55" fill="none" stroke={v3.brand} strokeWidth={2.5} />
            <path d="M0,124 L800,80" fill="none" stroke={v3.borderStrong} strokeWidth={1} strokeDasharray="3 4" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: v3.textMuted, marginTop: 6 }}>
            {['May \u201925', 'Aug', 'Nov', 'Feb \u201926', 'Apr'].map((m) => <span key={m}>{m}</span>)}
          </div>
        </div>

        {/* Property table */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 0.4fr', padding: '12px 16px', fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${v3.border}` }}>
            <span>{isZh ? '房产' : 'Property'}</span>
            <span>{isZh ? '租金' : 'Rent'}</span>
            <span>{isZh ? '状态' : 'Status'}</span>
            <span>DOM</span>
            <span>{isZh ? '租客分' : 'Tenant'}</span>
            <span>{isZh ? '健康' : 'Health'}</span>
            <span></span>
          </div>
          {PROPS.map((p) => (
            <div key={p.addr} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 0.4fr', padding: '14px 16px', alignItems: 'center', fontSize: 13, color: v3.textPrimary, borderBottom: `1px solid ${v3.divider}` }}>
              <span style={{ fontWeight: 600 }}>{p.addr}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>${p.rent.toLocaleString()}</span>
              <span>
                <span style={{ fontSize: 11, fontWeight: 600, color: p.status === 'Vacant' ? v3.warning : v3.brandStrong, background: p.status === 'Vacant' ? v3.warningSoft : v3.brandSoft, padding: '3px 9px', borderRadius: 999 }}>
                  {p.status}
                </span>
              </span>
              <span style={{ color: v3.textSecondary }}>{p.dom}</span>
              <span style={{ fontWeight: 600 }}>{p.score ?? '—'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, height: 4, background: v3.divider, borderRadius: 2, maxWidth: 60 }}>
                  <span style={{ display: 'block', width: `${p.health}%`, height: '100%', background: p.health >= 85 ? v3.brand : p.health >= 70 ? v3.warning : v3.danger, borderRadius: 2 }} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p.health}</span>
              </span>
              <span style={{ color: v3.textMuted, fontSize: 14 }}>›</span>
            </div>
          ))}
        </div>

        {/* Nova insight */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.brandSoft}`, borderLeft: `4px solid ${v3.brand}`, borderRadius: 14, padding: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>✦</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              Nova · {isZh ? '组合洞察' : 'Portfolio Insight'}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: v3.textPrimary }}>
              <strong>32 Trolley Cres</strong>{' '}
              {isZh ? '已空置 11 天 — 同栋楼可比 6 天就出租。建议降价 $50 至 $3,050。预计净收益 +$2,440。' : 'has been vacant 11 days — comps in same building leased in 6. Lower asking $50 to $3,050? Projected $2,440 net gain.'}
            </div>
          </div>
          <button style={{ padding: '8px 16px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            {isZh ? '应用' : 'Apply'}
          </button>
        </div>
      </div>
    </main>
  )
}

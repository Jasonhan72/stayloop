'use client'
// /index — Stayloop Index (V3 section 06) Analyst dashboard
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import AppHeader from '@/components/AppHeader'

export default function IndexPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader
        title="Stayloop Index"
        titleZh="Stayloop 指数"
        right={
          <span style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '4px 10px', borderRadius: 999, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {isZh ? '由 Analyst 提供' : 'Powered by Analyst'}
          </span>
        }
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        {/* Hero metric */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: v3.textMuted, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            {isZh ? 'GTA · 一室公寓中位数' : 'GTA · 1 BEDROOM · MEDIAN ASKING'}
          </div>
          <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 18 }}>{isZh ? '大多伦多 · 一室公寓中位数' : '大多伦多 · 一室公寓中位数'}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.035em', color: v3.textPrimary, lineHeight: 1 }}>$2,350</span>
            <span style={{ fontSize: 14, color: v3.brandStrong, fontWeight: 600 }}>↑ 7.8% YoY</span>
            <span style={{ fontSize: 14, color: v3.success, fontWeight: 600 }}>↓ 14% DoM</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {['7d', '30d', '90d', '1y', 'all'].map((p, i) => (
                <span key={p} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: i === 2 ? '#fff' : v3.textMuted, background: i === 2 ? v3.textPrimary : v3.surface, border: `1px solid ${i === 2 ? v3.textPrimary : v3.border}` }}>{p}</span>
              ))}
            </div>
          </div>
          {/* Trend chart */}
          <svg viewBox="0 0 800 180" width="100%" height={180}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={v3.brand} stopOpacity="0.25" />
                <stop offset="100%" stopColor={v3.brand} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* gridlines */}
            {[40, 80, 120, 160].map((y) => (
              <line key={y} x1={0} y1={y} x2={800} y2={y} stroke={v3.divider} strokeDasharray="2 4" />
            ))}
            {/* polyline area */}
            <path
              d="M0,140 L100,135 L200,128 L300,124 L400,118 L500,108 L600,98 L700,90 L800,82 L800,180 L0,180 Z"
              fill="url(#g1)"
            />
            <path
              d="M0,140 L100,135 L200,128 L300,124 L400,118 L500,108 L600,98 L700,90 L800,82"
              fill="none"
              stroke={v3.brand}
              strokeWidth={2.5}
            />
            <circle cx={800} cy={82} r={5} fill={v3.brand} stroke="#fff" strokeWidth={2} />
            <text x={780} y={70} textAnchor="end" fontSize={12} fontWeight={700} fill={v3.brandStrong}>$2,350</text>
            {/* x-axis labels */}
            {['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'].map((m, i) => (
              <text key={m} x={i * 160} y={175} fontSize={10} fill={v3.textMuted}>{m}</text>
            ))}
          </svg>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label_en: 'Verified Passports', label_zh: '已验证护照', value: '20,142', delta: '+12% MoM' },
            { label_en: 'Median DOM', label_zh: '挂牌成交天数', value: '8 days', delta: '-2 days' },
            { label_en: 'Score 80+ tenants', label_zh: '高分租客占比', value: '38%', delta: '+4 pts' },
            { label_en: 'New listings (7d)', label_zh: '新挂牌 (7天)', value: '482', delta: '+18%' },
          ].map((s) => (
            <div key={s.label_en} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                {isZh ? `${s.label_zh} · ${s.label_en}` : s.label_en}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>{s.value}</span>
                <span style={{ fontSize: 12, color: v3.brandStrong, fontWeight: 600 }}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Analyst insight */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderLeft: `4px solid ${v3.brand}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? 'Analyst 洞察 · INSIGHT' : 'ANALYST · INSIGHT'}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textPrimary, margin: 0 }}>
            {isZh
              ? 'King West 仍是 GTA 一季度最热的子市场。同期 1B1B 中位价上涨 7.8%，挂牌天数下降至 8 天。建议房东在 4 月底前把空置 7 天以上的房源降价 1-2%，或上线 Nova 重写文案。'
              : 'King West remains the hottest GTA submarket in Q1. 1B1B median asking is up 7.8% YoY while DOM dropped to 8 days. For listings vacant 7+ days, lower asking 1–2% before end of April, or rerun Nova on the copy.'}
          </p>
        </div>
      </div>
    </main>
  )
}

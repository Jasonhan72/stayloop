'use client'
// /market — Stayloop Index (V3 section 06) Analyst dashboard
import { useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import AppHeader from '@/components/AppHeader'

type TimePeriod = '7d' | '30d' | '90d' | '12mo' | 'all'

export default function IndexPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [activePeriod, setActivePeriod] = useState<TimePeriod>('12mo')

  // Hardcoded 12-month trend data (GTA 1BR median rent)
  const monthlyData = [
    { month: 'May', rent: 2150 },
    { month: 'Jun', rent: 2165 },
    { month: 'Jul', rent: 2180 },
    { month: 'Aug', rent: 2210 },
    { month: 'Sep', rent: 2225 },
    { month: 'Oct', rent: 2240 },
    { month: 'Nov', rent: 2255 },
    { month: 'Dec', rent: 2270 },
    { month: 'Jan', rent: 2285 },
    { month: 'Feb', rent: 2310 },
    { month: 'Mar', rent: 2330 },
    { month: 'Apr', rent: 2350 },
  ]

  // SVG line chart data: normalize to 0-180 pixel range (160px height)
  const minRent = 2150
  const maxRent = 2350
  const chartHeight = 160
  const chartWidth = 800
  const pointSpacing = chartWidth / (monthlyData.length - 1)

  const points = monthlyData.map((d, i) => {
    const y = chartHeight - ((d.rent - minRent) / (maxRent - minRent)) * chartHeight
    return { x: i * pointSpacing, y, rent: d.rent }
  })

  // Generate smooth cubic bezier path
  const pathD = points
    .map((p, i) => {
      if (i === 0) return `M${p.x},${p.y}`
      const prev = points[i - 1]
      const cp1x = prev.x + pointSpacing / 3
      const cp1y = prev.y
      const cp2x = p.x - pointSpacing / 3
      const cp2y = p.y
      return `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p.x},${p.y}`
    })
    .join(' ')

  const areaPathD = `${pathD} L${chartWidth},${chartHeight} L0,${chartHeight} Z`

  const periodPills: Array<{ value: TimePeriod; label_en: string; label_zh: string }> = [
    { value: '7d', label_en: '7d', label_zh: '7天' },
    { value: '30d', label_en: '30d', label_zh: '30天' },
    { value: '90d', label_en: '90d', label_zh: '90天' },
    { value: '12mo', label_en: '12mo', label_zh: '12 个月' },
    { value: 'all', label_en: 'All', label_zh: '所有' },
  ]

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
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.035em', color: v3.textPrimary, lineHeight: 1 }}>$2,350</span>
            <span style={{ fontSize: 14, color: v3.brandStrong, fontWeight: 600 }}>↑ 7.8% YoY</span>
            <span style={{ fontSize: 14, color: v3.success, fontWeight: 600 }}>↓ 14% DoM</span>
          </div>

          {/* Time-period filter pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {periodPills.map((pill) => (
              <button
                key={pill.value}
                onClick={() => setActivePeriod(pill.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${activePeriod === pill.value ? v3.brand : v3.border}`,
                  background: activePeriod === pill.value ? v3.brand : 'transparent',
                  color: activePeriod === pill.value ? v3.textOnBrand : v3.textSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {isZh ? pill.label_zh : pill.label_en}
              </button>
            ))}
          </div>

          {/* Trend chart with gridlines and axis labels */}
          <svg viewBox="0 0 800 200" width="100%" height={200} style={{ marginBottom: 16 }}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={v3.brand} stopOpacity="0.25" />
                <stop offset="100%" stopColor={v3.brand} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* horizontal gridlines */}
            {[40, 80, 120].map((y) => (
              <line key={`grid-${y}`} x1={0} y1={y} x2={800} y2={y} stroke={v3.divider} strokeDasharray="2 4" strokeWidth={0.8} />
            ))}
            {/* area fill */}
            <path d={areaPathD} fill="url(#g1)" />
            {/* smooth curve line */}
            <path d={pathD} fill="none" stroke={v3.brand} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {/* endpoint marker */}
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill={v3.brand} stroke="#fff" strokeWidth={2} />
            {/* endpoint value label */}
            <text x={points[points.length - 1].x - 20} y={points[points.length - 1].y - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill={v3.brandStrong}>
              $2,350
            </text>
            {/* x-axis month labels */}
            {monthlyData.map((m, i) => (
              <text key={`month-${i}`} x={i * pointSpacing} y={180} textAnchor="middle" fontSize={10} fill={v3.textMuted}>
                {m.month}
              </text>
            ))}
            {/* y-axis rent labels */}
            {[2150, 2200, 2250, 2300, 2350].map((rent) => {
              const y = chartHeight - ((rent - minRent) / (maxRent - minRent)) * chartHeight
              return (
                <text key={`rent-${rent}`} x={-8} y={y + 4} textAnchor="end" fontSize={9} fill={v3.textMuted}>
                  ${rent}
                </text>
              )
            })}
          </svg>

          {/* Updated timestamp */}
          <div style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)', marginTop: 12, borderTop: `1px solid ${v3.divider}`, paddingTop: 12 }}>
            {isZh ? '更新于 4 月 28 日 · 数据源: Stayloop Index (25 万+ 房源)' : 'Updated April 28, 2026 · Source: Stayloop Index (250k+ listings)'}
          </div>
        </div>

        {/* Neighborhood breakdown cards */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: v3.textPrimary }}>
            {isZh ? '社区租金分布' : 'Neighborhood Breakdown'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {[
              { name_en: 'Liberty Village', name_zh: 'Liberty Village', rent: 2420, yoy: 7.8 },
              { name_en: 'Etobicoke', name_zh: 'Etobicoke', rent: 2180, yoy: 5.2 },
              { name_en: 'North York', name_zh: 'North York', rent: 2100, yoy: 3.1 },
              { name_en: 'Scarborough', name_zh: 'Scarborough', rent: 1950, yoy: 2.4 },
            ].map((nb) => (
              <div key={nb.name_en} style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
                  {isZh ? nb.name_zh : nb.name_en}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: v3.brandStrong, letterSpacing: '-0.025em' }}>
                    ${nb.rent}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: v3.brandStrong }}>↑ {nb.yoy}% YoY</span>
                </div>
              </div>
            ))}
          </div>
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

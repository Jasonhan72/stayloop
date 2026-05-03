'use client'
// /tenant/listings — Stayloop-enabled listings with Passport fit
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface Listing {
  id: string
  address: string
  city?: string
  monthly_rent?: number
  bedrooms?: number
  available_date?: string
}

function Tag({ tone = 'default', children }: { tone?: string; children: React.ReactNode }) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    ai: { bg: '#F3E8FF', fg: '#7C3AED' },
    gold: { bg: '#FEF3C7', fg: '#D97706' },
    pri: { bg: 'rgba(4,120,87,0.10)', fg: '#047857' },
    info: { bg: '#DBEAFE', fg: '#2563EB' },
    ok: { bg: '#DCFCE7', fg: '#16A34A' },
    default: { bg: v3.divider, fg: v3.textMuted },
  }
  const t = toneMap[tone] || toneMap.default
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 9px',
        borderRadius: 999,
        border: `1px solid ${t.bg}`,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export default function TenantListingsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: items } = await supabase
        .from('listings')
        .select('id, address, city, monthly_rent, bedrooms, available_date')
        .eq('status', 'published')
        .limit(12)

      setListings((items || []) as Listing[])
    } catch (err) {
      console.error('Failed to load listings:', err)
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <PageShell role="tenant">
        <div style={{ color: v3.textMuted, fontSize: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
          {isZh ? '加载列表…' : 'Loading listings…'}
        </div>
      </PageShell>
    )
  }

  // Sample data for demo
  const demoListings = [
    {
      addr: '128 Bathurst St · 4B',
      city: 'Trinity-Bellwoods',
      rent: 2750,
      beds: '1+den',
      avail: 'Sep 1',
      fit: 96,
      gaps: [] as string[],
    },
    {
      addr: '52 Wellesley E · 1207',
      city: 'Church-Wellesley',
      rent: 2400,
      beds: 'Studio',
      avail: 'Aug 28',
      fit: 88,
      gaps: [isZh ? '就业信函' : 'Employment letter'],
    },
    {
      addr: '14 York St · 802',
      city: 'Harbourfront',
      rent: 3100,
      beds: '2 br',
      avail: 'Sep 15',
      fit: 74,
      gaps: [isZh ? '验证收入' : 'Verified income', isZh ? '第二个推荐信' : '2nd reference'],
    },
    {
      addr: '905 King W · PH3',
      city: 'Liberty Village',
      rent: 3450,
      beds: '2 br',
      avail: 'Oct 1',
      fit: 69,
      gaps: [isZh ? '验证收入' : 'Verified income'],
    },
    {
      addr: '80 Mill St · 312',
      city: 'Distillery',
      rent: 2680,
      beds: '1 br',
      avail: 'Sep 1',
      fit: 92,
      gaps: [],
    },
    {
      addr: '318 Richmond W · 504',
      city: 'Entertainment',
      rent: 2950,
      beds: '1+den',
      avail: 'Sep 1',
      fit: 84,
      gaps: [isZh ? '就业信函' : 'Employment letter'],
    },
  ]

  return (
    <PageShell role="tenant">
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        <SecHead
          eyebrow={isZh ? 'Stayloop 启用列表 · 142' : 'Stayloop-enabled listings · 142'}
          title={isZh ? '列表' : 'Listings'}
          sub={isZh ? '按护照适配排序' : 'Sorted by Passport fit'}
          right={
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder={isZh ? '按区域或楼宇筛选…' : 'Filter by area or building…'}
                style={{
                  background: '#FFFFFF',
                  border: `1px solid ${v3.border}`,
                  borderRadius: 10,
                  color: v3.textPrimary,
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 14,
                  padding: '11px 14px',
                  height: 44,
                  outline: 'none',
                  width: 240,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#047857')}
                onBlur={(e) => (e.currentTarget.style.borderColor = v3.border)}
              />
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  background: '#FFFFFF',
                  color: v3.textPrimary,
                  border: `1px solid ${v3.borderStrong}`,
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '筛选' : 'Filters'}
              </button>
            </div>
          }
        />

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {[
            'Toronto',
            '$2k–3k',
            isZh ? '1–2 间卧室' : '1–2 br',
            isZh ? '可在 9 月' : 'Available Sep',
            isZh ? '允许宠物' : 'Pets ok',
            isZh ? '家具齐全' : 'Furnished',
            isZh ? '停车位' : 'Parking',
          ].map((c, i) => (
            <Tag key={c} tone={i === 0 || i === 1 ? 'pri' : 'default'}>
              {c}
            </Tag>
          ))}
        </div>

        {/* Listings grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }} className="t-listings-3col">
          {demoListings.map((it, i) => (
            <div
              key={i}
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 0,
                overflow: 'hidden',
              }}
            >
              {/* Image placeholder */}
              <div
                style={{
                  height: 140,
                  background: `linear-gradient(135deg, ${v3.surfaceMuted} 0%, ${v3.surfaceCard} 100%)`,
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    padding: '4px 8px',
                    background: '#fff',
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    color: v3.textMuted,
                    border: `1px solid ${v3.border}`,
                  }}
                >
                  STAYLOOP
                </span>
                <span
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    background:
                      it.fit >= 90 ? '#16A34A' : it.fit >= 80 ? '#D97706' : '#DC2626',
                    color: '#fff',
                  }}
                >
                  {it.fit}% fit
                </span>
              </div>

              {/* Content */}
              <div style={{ padding: '14px 16px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary }}>
                  {it.addr}
                </div>
                <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 2 }}>
                  {it.city} · {it.beds} · Avail {it.avail}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: v3.textPrimary,
                      fontFamily: '"JetBrains Mono", monospace',
                    }}
                  >
                    ${it.rent.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 11, color: v3.textMuted }}>/mo</span>
                </div>

                {/* AI Boost or Apply */}
                {it.gaps.length > 0 ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 8,
                      background: '#F3E8FF',
                      border: `1px solid #D7C5FA`,
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#7C3AED',
                        fontFamily: '"JetBrains Mono", monospace',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        marginBottom: 3,
                      }}
                    >
                      AI · {isZh ? '提升适配度' : 'Boost fit'}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textSecondary }}>
                      {isZh ? '添加' : 'Add'} {it.gaps.join(' + ')}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 8,
                      background: 'rgba(4,120,87,0.10)',
                      border: `1px solid rgba(16,185,129,0.32)`,
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#047857',
                      fontWeight: 600,
                    }}
                  >
                    ✓ {isZh ? '使用护照申请 — 1 次点击' : 'Apply with Passport — 1 click'}
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      background: '#FFFFFF',
                      color: v3.textPrimary,
                      border: `1px solid ${v3.borderStrong}`,
                      borderRadius: 10,
                      padding: '10px 18px',
                      fontFamily: '"Inter Tight", sans-serif',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isZh ? '查看' : 'View'}
                  </button>
                  <button
                    style={{
                      flex: 1,
                      justifyContent: 'center',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 10,
                      padding: '11px 20px',
                      fontFamily: '"Inter Tight", sans-serif',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45)',
                    }}
                  >
                    {isZh ? '申请' : 'Apply'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.t-listings-3col) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 600px) {
          :global(.t-listings-3col) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </PageShell>
  )
}

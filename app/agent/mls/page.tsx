'use client'
// /agent/mls — MLS Ready Pack (V3 section 09, mobile)
import { useEffect, useState } from 'react'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { Phone } from '@/components/v3/Frame'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'

interface Listing {
  id: string
  address: string
  unit: string | null
  monthly_rent: number | null
  beds: number | null
  baths: number | null
  sqft: number | null
  mls_number: string | null
  parking: number | null
}

interface Showing {
  id: string
  scheduled_at: string
  listing_id: string | null
}

const TALKING_POINTS_EN = [
  'Highlight south-facing balcony with city views',
  'Mention 5-min walk to George Brown campus',
  'Confirm move-in flexibility — available May 1st',
]

const TALKING_POINTS_ZH = [
  '重点突出朝南的阳台和城市景观',
  '强调距离乔治布朗学院 5 分钟步行距离',
  '确认搬家灵活性 — 5 月 1 日可入住',
]

export default function MlsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [listing, setListing] = useState<Listing | null>(null)
  const [showing, setShowing] = useState<Showing | null>(null)
  const [loading, setLoading] = useState(true)
  const [markedComplete, setMarkedComplete] = useState(false)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Get the most recent active listing
      const { data: listingData } = await supabase
        .from('listings')
        .select('id, address, unit, monthly_rent, beds, baths, sqft, mls_number, parking')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (listingData) {
        setListing(listingData as Listing)

        // Get a showing for this listing
        const { data: showingData } = await supabase
          .from('showings')
          .select('id, scheduled_at, listing_id')
          .eq('listing_id', listingData.id)
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (showingData) {
          setShowing(showingData as Showing)
        }
      }
    } catch (error) {
      console.error('Failed to load listing:', error)
    }
    setLoading(false)
  }

  async function markShowingComplete() {
    if (!showing) return
    try {
      await supabase.from('showings').update({ status: 'completed' }).eq('id', showing.id)
      setMarkedComplete(true)
    } catch (error) {
      console.error('Failed to mark complete:', error)
    }
  }

  function formatTime(isoString: string): string {
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  function timeUntilShowing(): string {
    if (!showing) return '—'
    const now = new Date()
    const showTime = new Date(showing.scheduled_at)
    const diffMs = showTime.getTime() - now.getTime()
    const diffMins = Math.round(diffMs / 60000)
    return diffMins > 0 ? `${diffMins} min` : 'now'
  }

  if (loading || !listing) {
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
        <AppHeader title="MLS Ready Pack" titleZh="看房资料" />
        <Phone time={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}>
          <div style={{ padding: 32, textAlign: 'center', color: v3.textMuted, fontSize: 13 }}>
            {isZh ? '加载中…' : 'Loading…'}
          </div>
        </Phone>
      </main>
    )
  }

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader title="MLS Ready Pack" titleZh="看房资料" />
      <Phone time={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}>
        {/* Header with time to showing */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${v3.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, color: v3.textMuted }}>‹</span>
          <span style={{ fontSize: 13, color: v3.brandStrong, fontWeight: 700 }}>
            {isZh ? `${timeUntilShowing()}后开始` : `Tour in ${timeUntilShowing()}`}
          </span>
          <span style={{ fontSize: 16, color: v3.textMuted }}>⋯</span>
        </div>

        {/* Property hero section */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: v3.textPrimary }}>{listing.address}</div>
          {listing.unit && <div style={{ fontSize: 12, color: v3.textMuted }}>Unit {listing.unit}</div>}
          {listing.mls_number && (
            <div style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              MLS #{listing.mls_number}
            </div>
          )}
        </div>

        {/* Listing photo placeholder */}
        <div style={{ padding: '0 16px 12px' }}>
          <div
            style={{
              aspectRatio: '16/9',
              background: `linear-gradient(135deg, ${v3.brand}, ${v3.brandBright2})`,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: v3.textOnBrand,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {isZh ? '看房照片' : 'Listing photo'}
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { icon: '🛏️', label: isZh ? '卧室' : 'Beds', value: listing.beds ?? '—' },
            { icon: '🛁', label: isZh ? '浴室' : 'Baths', value: listing.baths ?? '—' },
            { icon: '📐', label: isZh ? '面积' : 'Sqft', value: listing.sqft ? `${listing.sqft}` : '—' },
            { icon: '🅿️', label: isZh ? '停车' : 'Parking', value: listing.parking ?? '—' },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{stat.icon}</div>
              <div style={{ fontSize: 10, color: v3.textMuted, marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Rent */}
        {listing.monthly_rent && (
          <div style={{ padding: '8px 16px' }}>
            <div style={{ fontSize: 10, color: v3.textMuted, marginBottom: 4, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {isZh ? '月租金' : 'Monthly rent'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: v3.brand, fontFamily: 'var(--font-mono)' }}>
              ${listing.monthly_rent.toLocaleString()}
            </div>
          </div>
        )}

        {/* Today's showings */}
        {showing && (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 10, color: v3.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {isZh ? '今日带看' : 'Today\'s showings'}
            </div>
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary, marginBottom: 4 }}>
                {formatTime(showing.scheduled_at)}
              </div>
              <div style={{ fontSize: 11, color: v3.textMuted }}>
                {isZh ? '申请人带看' : 'Applicant showing'}
              </div>
            </div>
          </div>
        )}

        {/* Talking points */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: v3.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {isZh ? '关键要点' : 'Talking points'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(isZh ? TALKING_POINTS_ZH : TALKING_POINTS_EN).map((point, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 12,
                  color: v3.textPrimary,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: v3.brand, fontWeight: 700, minWidth: 16 }}>•</span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact card */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: v3.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {isZh ? '房东联系方式' : 'Landlord contact'}
          </div>
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 8 }}>
              {isZh ? '(416) 555-1234' : '(416) 555-1234'}
            </div>
            <div style={{ fontSize: 11, color: v3.textMuted }}>landlord@example.com</div>
          </div>
          <div style={{ fontSize: 9, color: v3.textMuted, paddingTop: 8, borderTop: `1px solid ${v3.divider}`, marginTop: 8 }}>
            {isZh ? 'RECO 许可证 #12345 · 经纪人委任' : 'RECO License #12345 · Agent authorized'}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderTop: `1px solid ${v3.divider}`, marginTop: 8 }}>
          <button
            onClick={() => window.location.href = `https://maps.apple.com/?address=${encodeURIComponent(listing.address)}`}
            style={{
              flex: 1,
              padding: '12px',
              background: v3.surface,
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: v3.textPrimary,
              cursor: 'pointer',
            }}
          >
            📍 {isZh ? '导航' : 'Navigate'}
          </button>
          <button
            onClick={() => {
              window.location.href = 'tel:(416)555-1234'
            }}
            style={{
              flex: 1,
              padding: '12px',
              background: v3.brandSoft,
              border: `1px solid ${v3.brand}`,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: v3.brand,
              cursor: 'pointer',
            }}
          >
            ☎️ {isZh ? '电话' : 'Call'}
          </button>
          <button
            onClick={markShowingComplete}
            disabled={markedComplete}
            style={{
              flex: 1,
              padding: '12px',
              background: markedComplete ? v3.divider : `linear-gradient(135deg, ${v3.brandBright}, ${v3.brandBright2})`,
              color: markedComplete ? v3.textMuted : v3.textOnBrand,
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: markedComplete ? 'default' : 'pointer',
            }}
          >
            {markedComplete ? (isZh ? '已完成' : 'Completed') : `✓ ${isZh ? '完成带看' : 'Mark complete'}`}
          </button>
        </div>
      </Phone>
    </main>
  )
}

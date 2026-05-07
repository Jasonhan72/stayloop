'use client'
// -----------------------------------------------------------------------------
// /listings/[slug] — public listing detail (StreetEasy-inspired layout)
// -----------------------------------------------------------------------------
// Pulls a listing by slug via the anon Supabase client (RLS gates SELECT to
// is_active=true). Layout matches the conventions tenants are used to from
// StreetEasy / Realtor.ca: image gallery on the left, sticky "fact card +
// Apply CTA" on the right, About / Policies / Listed-by stacked below.
//
// Photos aren't part of the schema yet — we render a placeholder image rail
// so the visual hierarchy is established for when real images land.
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

// Cloudflare Pages requires every dynamic ([param]) route to declare edge.
export const runtime = 'edge'

interface Listing {
  id: string
  slug: string
  title: string | null
  description: string | null
  address: string
  unit: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  monthly_rent: number | null
  bedrooms: number | null
  bathrooms: number | null
  available_date: string | null
  is_active: boolean
  status: string | null
  created_at: string
}

export default function ListingDetailPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const params = useParams<{ slug: string }>()
  const slug = params?.slug

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('listings')
        .select('id, slug, title, description, address, unit, city, province, postal_code, monthly_rent, bedrooms, bathrooms, available_date, is_active, status, created_at')
        .eq('slug', slug)
        .maybeSingle()
      if (cancelled) return
      if (!data) setNotFound(true)
      else setListing(data as Listing)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [slug])

  if (loading) return <Shell><Centered>{isZh ? '加载中…' : 'Loading…'}</Centered></Shell>

  if (notFound || !listing) {
    return (
      <Shell>
        <NotFoundCard isZh={isZh} />
      </Shell>
    )
  }

  if (!listing.is_active) {
    return (
      <Shell>
        <DraftCard isZh={isZh} />
      </Shell>
    )
  }

  const title = listing.title || `${listing.address}${listing.unit ? ` · ${listing.unit}` : ''}`
  const cityProv = [listing.city, listing.province].filter(Boolean).join(', ')
  const daysOn = Math.max(0, Math.floor((Date.now() - new Date(listing.created_at).getTime()) / 86400000))

  return (
    <Shell>
      {/* Breadcrumb strip — light tertiary nav above the hero */}
      <nav style={{ padding: '12px 24px', borderBottom: `1px solid ${v3.divider}`, background: v3.surface }}>
        <div
          style={{
            maxWidth: size.content.wide,
            margin: '0 auto',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 12,
            color: v3.textMuted,
            flexWrap: 'wrap',
          }}
        >
          <Link href="/listings" style={{ color: v3.textMuted, textDecoration: 'none' }}>
            {isZh ? '所有房源' : 'All listings'}
          </Link>
          <span aria-hidden>›</span>
          {listing.city && (
            <>
              <span style={{ color: v3.textMuted }}>{listing.city}</span>
              <span aria-hidden>›</span>
            </>
          )}
          <span style={{ color: v3.textPrimary, fontWeight: 600 }}>
            {listing.address}{listing.unit ? ` · ${listing.unit}` : ''}
          </span>
        </div>
      </nav>

      {/* Main grid: gallery / facts → description */}
      <section style={{ padding: '24px 24px 64px' }}>
        <div
          style={{
            maxWidth: size.content.wide,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr',
            gap: 28,
          }}
          className="listing-detail-grid"
        >
          {/* Left column */}
          <div>
            <ImageGallery />

            {/* Headline below the gallery */}
            <div style={{ marginTop: 18 }}>
              <h1
                style={{
                  fontSize: 'clamp(24px, 3vw, 32px)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  margin: '0 0 6px',
                  lineHeight: 1.2,
                  color: v3.textPrimary,
                }}
              >
                {title}
              </h1>
              <div style={{ fontSize: 13.5, color: v3.textSecondary, marginBottom: 18 }}>
                {listing.address}{listing.unit ? `, ${listing.unit}` : ''}{cityProv ? ` · ${cityProv}` : ''}{listing.postal_code ? ` ${listing.postal_code}` : ''}
              </div>

              {/* Quick facts strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 0,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 12,
                  background: v3.surfaceCard,
                  overflow: 'hidden',
                  marginBottom: 24,
                }}
                className="listing-facts-grid"
              >
                <Fact label={isZh ? '月租' : 'Monthly rent'} value={listing.monthly_rent && listing.monthly_rent > 0 ? `$${listing.monthly_rent.toLocaleString()}` : '—'} highlight />
                <Fact label={isZh ? '卧室' : 'Bedrooms'} value={listing.bedrooms == null ? '—' : listing.bedrooms === 0 ? (isZh ? '开间' : 'Studio') : String(listing.bedrooms)} />
                <Fact label={isZh ? '卫浴' : 'Bathrooms'} value={listing.bathrooms == null ? '—' : String(listing.bathrooms)} />
                <Fact
                  label={isZh ? '入住日期' : 'Available'}
                  value={listing.available_date
                    ? new Date(listing.available_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
                    : (isZh ? '随时' : 'Now')}
                />
                <Fact label={isZh ? '上线天数' : 'Days on Stayloop'} value={daysOn === 0 ? (isZh ? '今日' : 'Today') : `${daysOn}`} />
              </div>

              {/* About */}
              <Section title={isZh ? '房源介绍' : 'About this place'}>
                {listing.description ? (
                  <p style={{ fontSize: 14.5, lineHeight: 1.7, color: v3.textSecondary, whiteSpace: 'pre-wrap', margin: 0 }}>
                    {listing.description}
                  </p>
                ) : (
                  <p style={{ fontSize: 13, color: v3.textMuted, fontStyle: 'italic', margin: 0 }}>
                    {isZh ? '房东尚未填写详细介绍。' : 'The landlord hasn’t added a description yet.'}
                  </p>
                )}
              </Section>

              {/* Policies (placeholder — schema doesn't carry these yet) */}
              <Section title={isZh ? '政策' : 'Policies'}>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 8,
                  }}
                >
                  <PolicyDot label={isZh ? '欢迎宠物（与房东确认）' : 'Pets welcome (confirm with landlord)'} />
                  <PolicyDot label={isZh ? '禁烟' : 'Smoke-free'} />
                  <PolicyDot label={isZh ? '电子签约' : 'E-sign ready'} />
                </ul>
              </Section>

              {/* Listed-by card */}
              <Section title={isZh ? '房源发布方' : 'Listed by'}>
                <div
                  style={{
                    background: v3.surfaceCard,
                    border: `1px solid ${v3.border}`,
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    gap: 14,
                    alignItems: 'center',
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${v3.brand}, ${v3.brandStrong})`,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    SL
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
                      {isZh ? '通过 Stayloop 发布' : 'Listed on Stayloop'}
                    </div>
                    <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 2 }}>
                      {isZh ? '所有申请由 AI 辅助筛查，最终决定权在房东' : 'AI-assisted screening · Decision stays with the landlord'}
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          </div>

          {/* Right column — sticky info + Apply card */}
          <aside style={{ position: 'sticky', top: 80, alignSelf: 'start' }}>
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 16,
                padding: 22,
                boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -10px rgba(31,25,11,0.10)',
              }}
            >
              {listing.monthly_rent != null && listing.monthly_rent > 0 ? (
                <>
                  <div style={{ fontSize: 32, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    ${listing.monthly_rent.toLocaleString()}
                    <span style={{ fontSize: 13, color: v3.textMuted, fontWeight: 500, marginLeft: 6 }}>
                      {isZh ? '/月' : 'for rent'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 6, lineHeight: 1.45 }}>
                    {isZh
                      ? '此为基础月租。具体费用请与房东确认。'
                      : 'Base rent only. Confirm any additional fees with the landlord.'}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: v3.textMuted }}>
                  {isZh ? '租金待定' : 'Rent: contact landlord'}
                </div>
              )}

              {/* Inline beds/baths chip row */}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${v3.divider}`,
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                  fontSize: 12.5,
                  color: v3.textSecondary,
                  fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: '0.02em',
                }}
              >
                {listing.bedrooms != null && (
                  <span>◇ {listing.bedrooms === 0 ? (isZh ? '开间' : 'Studio') : `${listing.bedrooms} ${isZh ? '卧' : 'bd'}`}</span>
                )}
                {listing.bathrooms != null && (
                  <span>◇ {listing.bathrooms} {isZh ? '卫' : 'ba'}</span>
                )}
                <span>◇ {isZh ? '租赁单元' : 'Rental unit'}</span>
                {listing.city && <span>◇ {listing.city}</span>}
              </div>

              {/* Primary CTA */}
              <Link
                href={`/apply/${listing.slug}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  marginTop: 18,
                  padding: '13px 20px',
                  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 650,
                  textDecoration: 'none',
                  boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
                }}
              >
                {isZh ? '提交租赁申请 →' : 'Apply to rent →'}
              </Link>

              {/* Secondary action */}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && navigator.share) {
                    navigator.share({ title, url: window.location.href }).catch(() => {})
                  } else if (typeof navigator !== 'undefined') {
                    navigator.clipboard?.writeText(window.location.href)
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  marginTop: 8,
                  padding: '11px 18px',
                  background: v3.surface,
                  color: v3.textPrimary,
                  border: `1px solid ${v3.borderStrong}`,
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '分享链接' : 'Share listing'}
              </button>

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px dashed ${v3.borderStrong}`,
                  fontSize: 11.5,
                  color: v3.textMuted,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: v3.brand, fontFamily: 'JetBrains Mono, monospace', marginRight: 6 }}>◆</span>
                {isZh
                  ? '资料只对该房源的房东可见。'
                  : 'Documents only shared with this listing’s landlord.'}{' '}
                <Link href="/legal/privacy" style={{ color: v3.brand, textDecoration: 'underline' }}>
                  {isZh ? '隐私声明' : 'Privacy notice'}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </Shell>
  )
}

// ─── Pieces ─────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />
      {children}
      <MarketingFooter />
      <style jsx global>{`
        @media (max-width: 900px) {
          .listing-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 560px) {
          .listing-facts-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </main>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ padding: '64px 24px' }}>
      <div style={{ maxWidth: size.content.default, margin: '0 auto', color: v3.textMuted, fontSize: 14, textAlign: 'center' }}>
        {children}
      </div>
    </section>
  )
}

function ImageGallery() {
  // Placeholder gallery: 1 large hero + 4 thumbnails. Real photo support is
  // a follow-up; the layout reserves the slot now so it doesn't shift later.
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr repeat(2, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: 6,
        height: 380,
        borderRadius: 14,
        overflow: 'hidden',
        background: v3.surface,
        border: `1px solid ${v3.border}`,
      }}
      className="listing-gallery"
    >
      <div style={{
        gridColumn: '1 / 2',
        gridRow: '1 / 3',
        background: `linear-gradient(135deg, ${v3.surfaceMuted} 0%, ${v3.brandWash} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: v3.textFaint,
        fontSize: 64,
      }}>🏙</div>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            background: `linear-gradient(${135 + i * 20}deg, ${v3.surfaceMuted} 0%, ${v3.surfaceCard} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: v3.textFaint,
            fontSize: 28,
          }}
        >
          {['🛏', '🛁', '🍳', '🌆'][i]}
        </div>
      ))}
      <style jsx>{`
        @media (max-width: 700px) {
          .listing-gallery {
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: 200px 100px !important;
            height: auto !important;
          }
          .listing-gallery > :first-child {
            grid-column: 1 / 3 !important;
            grid-row: 1 / 2 !important;
          }
        }
      `}</style>
    </div>
  )
}

function Fact({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRight: `1px solid ${v3.border}`,
        borderBottom: `1px solid ${v3.border}`,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: v3.textMuted,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: highlight ? 22 : 15,
          fontWeight: 700,
          color: highlight ? v3.brand : v3.textPrimary,
          marginTop: 4,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          margin: '0 0 12px',
          color: v3.textPrimary,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function PolicyDot({ label }: { label: string }) {
  return (
    <li
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        fontSize: 13,
        color: v3.textSecondary,
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 8,
        padding: '8px 12px',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: v3.success, flexShrink: 0 }} />
      {label}
    </li>
  )
}

function NotFoundCard({ isZh }: { isZh: boolean }) {
  return (
    <section style={{ padding: '64px 24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '40px 20px', background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
          {isZh ? '房源未找到' : 'Listing not found'}
        </h1>
        <p style={{ fontSize: 14, color: v3.textSecondary, margin: 0, lineHeight: 1.55 }}>
          {isZh ? '这套房源可能已被房东下架，或链接已变更。' : 'This listing may have been removed by the landlord, or the link has changed.'}
        </p>
        <Link
          href="/listings"
          style={{ display: 'inline-block', marginTop: 18, padding: '10px 20px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          {isZh ? '浏览所有房源' : 'Browse all listings'}
        </Link>
      </div>
    </section>
  )
}

function DraftCard({ isZh }: { isZh: boolean }) {
  return (
    <section style={{ padding: '64px 24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '40px 20px', background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14 }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 700,
            color: v3.warning,
            background: v3.warningSoft,
            padding: '3px 10px',
            borderRadius: 999,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          {isZh ? '草稿' : 'Draft'}
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
          {isZh ? '此房源还未上线' : 'This listing isn’t live yet'}
        </h1>
        <p style={{ fontSize: 14, color: v3.textSecondary, margin: 0, lineHeight: 1.55 }}>
          {isZh ? '房东仍在准备这套房源。等他们发布后链接就能正常打开。' : 'The landlord is still preparing this listing. The link will work once they publish it.'}
        </p>
      </div>
    </section>
  )
}

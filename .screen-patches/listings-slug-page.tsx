'use client'
// 2026-06-02 — Audit §11 P2 — Swap the gallery's raw <img> tags for
// next/image so we serve AVIF/WebP variants sized to the gallery box
// (hero ~1200px wide, thumbnails 90×64) instead of shipping each source
// CDN's full-resolution JPEG. The hero is `priority` because it's
// above-the-fold on the listing detail page; thumbnails get the default
// lazy behaviour with a tight `sizes` hint.
//
// Companion changes:
//   - app/listings/page.tsx swaps its CSS-background card hero for
//     <Image fill> + sizes
//   - next.config.js opens images.remotePatterns to the long tail of
//     third-party CDNs the import-listing agent ingests from.
// -----------------------------------------------------------------------------
// /listings/[slug] — public listing detail (StreetEasy fidelity)
// -----------------------------------------------------------------------------
// Layout matches StreetEasy listing pages:
//   - photo carousel (1 of N) with thumbnails + Floor Plan / Map buttons
//   - title + price + rooms/beds/baths
//   - Available / Days on market / Last price change row
//   - About description
//   - Amenities list (large bulleted)
//   - Policies (Pets allowed, Smoke-free)
//   - Listed by panel (broker name + brokerage + Show phone)
//   - Right rail: Request a tour + Ask a question + Apply CTAs
//   - Save / Share / Hide button row above Listed-by
//
// Anon Supabase reads are gated to is_active=true via RLS.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

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
  sqft: number | null
  parking: string | null
  pet_policy: string | null
  utilities_included: string[] | null
  amenities: string[] | null
  images: string[] | null
  available_date: string | null
  is_active: boolean
  status: string | null
  created_at: string
  published_at: string | null
  broker_name: string | null
  broker_phone: string | null
  brokerage: string | null
  year_built: number | null
  mls_number: string | null
  source_url: string | null
}

export default function ListingDetailPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const params = useParams<{ slug: string }>()
  const slug = params?.slug

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [showPhone, setShowPhone] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('listings')
        .select('id, slug, title, description, address, unit, city, province, postal_code, monthly_rent, bedrooms, bathrooms, sqft, parking, pet_policy, utilities_included, amenities, images, available_date, is_active, status, created_at, published_at, broker_name, broker_phone, brokerage, year_built, mls_number, source_url')
        .eq('slug', slug)
        .maybeSingle()
      if (cancelled) return
      if (!data) setNotFound(true)
      else setListing(data as Listing)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [slug])

  const facts = useMemo(() => {
    if (!listing) return null
    const since = listing.published_at || listing.created_at
    const daysOn = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000))
    return {
      daysOn,
      title: listing.title || `${listing.address}${listing.unit ? ` · ${listing.unit}` : ''}`,
      cityProv: [listing.city, listing.province].filter(Boolean).join(', '),
      images: (listing.images && listing.images.length > 0)
        ? listing.images
        : [],
    }
  }, [listing])

  if (loading) return <Shell><Centered>{isZh ? '加载中…' : 'Loading…'}</Centered></Shell>
  if (notFound || !listing) return <Shell><NotFoundCard isZh={isZh} /></Shell>
  if (!listing.is_active) return <Shell><DraftCard isZh={isZh} /></Shell>

  const rooms = (listing.bedrooms ?? 0) + (listing.bathrooms ?? 0) + 1 // approximation: bedrooms + bathrooms + living area
  const hasPhotos = (facts?.images?.length || 0) > 0

  return (
    <Shell>
      {/* Breadcrumbs */}
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
            {isZh ? '所有房源' : 'Rentals'}
          </Link>
          <span aria-hidden>›</span>
          {listing.city && (
            <>
              <span>{listing.city}</span>
              <span aria-hidden>›</span>
            </>
          )}
          <span style={{ color: v3.textPrimary, fontWeight: 600 }}>
            {listing.address}{listing.unit ? ` ${listing.unit}` : ''}
          </span>
        </div>
      </nav>

      {/* StreetEasy-faithful structure:
          1) Photo gallery — FULL content width, above the fold
          2) Header strip — full width: title, price, beds/baths/sqft, days-on-market chips
          3) 2-column body — LEFT description+amenities+building, RIGHT sticky CTA card
          4) Map — full content width

          The previous layout had the gallery nested inside the left column
          of a 2-column grid, which made the gallery and the right rail
          compete for vertical space and pushed the Apply CTA off-screen
          on wide displays. */}

      {/* 1) Gallery — full width */}
      <section style={{ padding: '16px 24px 0' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <PhotoGallery
            images={facts?.images || []}
            activeIndex={activeImage}
            onChange={setActiveImage}
            isZh={isZh}
            showPlaceholder={!hasPhotos}
          />

          {/* Photo counter + floor-plan / map pills */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: v3.textMuted }}>
            <div>
              {hasPhotos
                ? `${activeImage + 1} ${isZh ? '/' : 'of'} ${facts!.images.length}`
                : (isZh ? '暂无照片' : 'No photos uploaded')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => alert(isZh ? '楼层平面图：暂未提供' : 'Floor plan: not yet provided')}
                style={pillBtn}
              >
                ⌂ {isZh ? '户型图' : 'Floor plan'}
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${listing.address} ${listing.city || ''}`)}`}
                target="_blank"
                rel="noreferrer"
                style={pillBtn}
              >
                ◌ {isZh ? '地图' : 'Map'}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2) Header strip — full width: title row + price + facts + stats grid */}
      <section style={{ padding: '20px 24px 8px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: 'clamp(26px, 3vw, 34px)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: '0 0 4px',
                lineHeight: 1.2,
                color: v3.textPrimary,
                flex: '1 1 auto',
              }}
            >
              {facts!.title}
            </h1>
            <div style={{ display: 'flex', gap: 18, flexShrink: 0, paddingTop: 6 }}>
              <ActionLink icon="♡" label={isZh ? '收藏' : 'Save'} />
              <ActionLink icon="↗" label={isZh ? '分享' : 'Share'} onClick={() => {
                if (typeof window === 'undefined') return
                if (navigator.share) navigator.share({ title: facts!.title, url: window.location.href }).catch(() => {})
                else navigator.clipboard?.writeText(window.location.href)
              }} />
              <ActionLink icon="◯" label={isZh ? '隐藏' : 'Hide'} />
            </div>
          </div>

          {listing.monthly_rent != null && listing.monthly_rent > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
                ${listing.monthly_rent.toLocaleString()}
              </span>
              <span style={{ fontSize: 12, color: v3.textMuted, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {isZh ? '月租' : 'For rent'}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 13.5, color: v3.textSecondary }}>
            <FactInline value={listing.sqft != null ? `${listing.sqft} ft²` : '— ft²'} />
            <Sep />
            <FactInline value={`${rooms} ${isZh ? '间' : 'rooms'}`} />
            <Sep />
            <FactInline value={listing.bedrooms == null ? '— bd' : listing.bedrooms === 0 ? (isZh ? '开间' : 'Studio') : `${listing.bedrooms} ${isZh ? '卧' : 'beds'}`} />
            <Sep />
            <FactInline value={listing.bathrooms == null ? '— ba' : `${listing.bathrooms} ${isZh ? '卫' : 'baths'}`} />
          </div>
          <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 6 }}>
            {isZh ? '租赁单元' : 'Rental unit'}
            {listing.city && (
              <>
                <span style={{ margin: '0 6px' }}>·</span>
                <Link href={`/listings?q=${encodeURIComponent(listing.city)}`} style={{ color: v3.brand, textDecoration: 'underline' }}>
                  {listing.city}
                </Link>
              </>
            )}
          </div>

          {/* StreetEasy stats strip — Available / Days on market / Last price change */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 0,
              borderTop: `1px solid ${v3.border}`,
              borderBottom: `1px solid ${v3.border}`,
              marginTop: 18,
              background: v3.surface,
            }}
            className="listing-stats-row"
          >
            <StatBlock
              label={isZh ? '可入住' : 'Available'}
              value={listing.available_date
                ? new Date(listing.available_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
                : (isZh ? '随时' : 'Available now')}
            />
            <StatBlock
              label={isZh ? '上线天数' : 'Days on market'}
              value={facts!.daysOn === 0 ? (isZh ? '今日' : 'Today') : `${facts!.daysOn} ${isZh ? '天' : 'days'}`}
            />
            <StatBlock
              label={isZh ? '价格变动' : 'Last price change'}
              value={isZh ? '无变动' : 'No changes'}
            />
          </div>
        </div>
      </section>

      {/* 3) 2-column body — LEFT content, RIGHT sticky CTA card */}
      <section style={{ padding: '8px 24px 24px' }}>
        <div
          style={{
            maxWidth: size.content.wide,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr',
            gap: 36,
          }}
          className="listing-detail-grid"
        >
          {/* Left column — body content */}
          <div>
            {/* About */}
            <Section title={isZh ? '介绍' : 'About'}>
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

              {/* Amenities */}
              {listing.amenities && listing.amenities.length > 0 && (
                <Section title={isZh ? '设施' : 'Amenities'}>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '8px 18px',
                    }}
                  >
                    {listing.amenities.map((a, i) => (
                      <li
                        key={i}
                        style={{
                          fontSize: 13.5,
                          color: v3.textPrimary,
                          display: 'flex',
                          gap: 8,
                          alignItems: 'flex-start',
                        }}
                      >
                        <span aria-hidden style={{ color: v3.success, marginTop: 2, flexShrink: 0 }}>•</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Policies */}
              <Section title={isZh ? '政策' : 'Policies'}>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    gap: 28,
                    flexWrap: 'wrap',
                  }}
                >
                  <PolicyDot label={listing.pet_policy || (isZh ? '宠物：与房东确认' : 'Pets: confirm with landlord')} />
                  <PolicyDot label={isZh ? '禁烟' : 'Smoke-free'} />
                  {listing.parking && <PolicyDot label={`${isZh ? '停车' : 'Parking'}: ${listing.parking}`} />}
                  {listing.utilities_included && listing.utilities_included.length > 0 && (
                    <PolicyDot label={`${isZh ? '含' : 'Includes'}: ${listing.utilities_included.join(', ')}`} />
                  )}
                </ul>
              </Section>

              {/* Building info */}
              {(listing.year_built || listing.mls_number) && (
                <Section title={isZh ? '楼盘信息' : 'Building info'}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, color: v3.textSecondary }}>
                    {listing.year_built && <li>{isZh ? '建造年代' : 'Year built'}: {listing.year_built}</li>}
                    {listing.mls_number && <li>MLS #: {listing.mls_number}</li>}
                  </ul>
                </Section>
              )}

              {/* Listed by */}
              <Section title={isZh ? '发布方' : 'Listed by'}>
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
                    {(listing.broker_name || listing.brokerage || 'SL').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
                      {listing.broker_name || listing.brokerage || (isZh ? '通过 Stayloop 发布' : 'Listed on Stayloop')}
                    </div>
                    {listing.brokerage && listing.broker_name && (
                      <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 2 }}>
                        {listing.brokerage}
                      </div>
                    )}
                    {listing.broker_phone && (
                      <button
                        type="button"
                        onClick={() => setShowPhone(true)}
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: v3.brand,
                          textDecoration: 'underline',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        {showPhone ? listing.broker_phone : (isZh ? '显示电话' : 'Show phone number')}
                      </button>
                    )}
                  </div>
                </div>
              </Section>
          </div>

          {/* Right column — sticky info + 3 CTAs */}
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
                <div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    ${listing.monthly_rent.toLocaleString()}
                    <span style={{ fontSize: 12, color: v3.textMuted, fontWeight: 600, marginLeft: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {isZh ? '月租' : 'For rent'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 6, lineHeight: 1.45 }}>
                    {isZh
                      ? '此为基础月租。具体费用请与房东确认。'
                      : 'Base rent only. Confirm any additional fees with the landlord.'}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: v3.textMuted }}>
                  {isZh ? '租金待定' : 'Rent: contact landlord'}
                </div>
              )}

              {/* Three CTAs stacked */}
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
              <button
                type="button"
                onClick={() => setShowPhone(true)}
                style={ctaSecondary}
              >
                {isZh ? '预约看房' : 'Request a tour'}
              </button>
              <a
                href={listing.broker_phone ? `tel:${listing.broker_phone.replace(/[^+\d]/g, '')}` : '#'}
                onClick={(e) => { if (!listing.broker_phone) { e.preventDefault(); setShowPhone(true) } }}
                style={ctaTertiary}
              >
                {isZh ? '咨询房东' : 'Ask a question'}
              </a>

              {listing.source_url && (
                <a
                  href={listing.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    marginTop: 12,
                    fontSize: 12,
                    color: v3.textMuted,
                    textAlign: 'center',
                    textDecoration: 'underline',
                  }}
                >
                  {isZh ? '查看原始房源 ↗' : 'View original listing ↗'}
                </a>
              )}

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

      {/* Embedded Google Map. We use the keyless `maps.google.com?output=embed`
          URL so we don't need a Google Maps Platform API key — the iframe
          renders the same default map UI you'd see on google.com/maps.
          The address-footer below the map keeps the "Open in Google Maps"
          deep-link CTA for users who want directions / Streetview. */}
      <section style={{ padding: '0 24px 56px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Section title={isZh ? '位置' : 'Location'}>
            {(() => {
              const addressLine = [
                listing.address,
                listing.unit ? `Unit ${listing.unit}` : null,
                listing.city,
                listing.province,
                listing.postal_code,
              ]
                .filter(Boolean)
                .join(', ')
              const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(addressLine)}&hl=${isZh ? 'zh-CN' : 'en'}&z=16&output=embed`
              const openUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`
              return (
                <div
                  style={{
                    border: `1px solid ${v3.border}`,
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: '#FFFFFF',
                  }}
                >
                  <iframe
                    title={isZh ? '房源地图' : 'Listing map'}
                    src={embedUrl}
                    width="100%"
                    height={360}
                    style={{ border: 0, display: 'block' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 16px',
                      borderTop: `1px solid ${v3.divider}`,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: v3.textPrimary }}>
                        {listing.address}{listing.unit ? `, ${listing.unit}` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 2 }}>
                        {[listing.city, listing.province, listing.postal_code].filter(Boolean).join(', ')}
                      </div>
                    </div>
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: v3.brand,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isZh ? '在 Google 地图打开 ↗' : 'Open in Google Maps ↗'}
                    </a>
                  </div>
                </div>
              )
            })()}
          </Section>
        </div>
      </section>
    </Shell>
  )
}

// ─── Pieces ─────────────────────────────────────────────────────────────

const pillBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: v3.textPrimary,
  background: v3.surfaceCard,
  border: `1px solid ${v3.borderStrong}`,
  borderRadius: 8,
  textDecoration: 'none',
  cursor: 'pointer',
}

const ctaSecondary: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 8,
  padding: '12px 18px',
  background: '#1F2937',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
}

const ctaTertiary: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 8,
  padding: '12px 18px',
  background: v3.surface,
  color: v3.textPrimary,
  border: `1px solid ${v3.borderStrong}`,
  borderRadius: 10,
  fontSize: 13.5,
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
}

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
          .listing-stats-row {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        @media (max-width: 560px) {
          .listing-stats-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}

function PhotoGallery({
  images,
  activeIndex,
  onChange,
  isZh,
  showPlaceholder,
}: {
  images: string[]
  activeIndex: number
  onChange: (i: number) => void
  isZh: boolean
  showPlaceholder: boolean
}) {
  if (showPlaceholder || images.length === 0) {
    return (
      <div
        style={{
          height: 380,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${v3.surfaceMuted} 0%, ${v3.brandWash} 100%)`,
          color: v3.textFaint,
          fontSize: 64,
          borderRadius: 14,
          border: `1px solid ${v3.border}`,
        }}
      >
        🏙
      </div>
    )
  }

  const safeIdx = Math.max(0, Math.min(activeIndex, images.length - 1))
  const goPrev = () => onChange((safeIdx - 1 + images.length) % images.length)
  const goNext = () => onChange((safeIdx + 1) % images.length)

  return (
    <div>
      {/* Hero photo with prev/next */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 420,
          background: '#000',
          borderRadius: 14,
          overflow: 'hidden',
          border: `1px solid ${v3.border}`,
        }}
      >
        {/* §11 P2 — next/image for the hero. `priority` is correct here
            because this is the first above-the-fold image on the page;
            `sizes` lets next/image pick a width bucket sized for the
            gallery box (which caps at the wide-content container). */}
        <Image
          key={images[safeIdx]}
          src={images[safeIdx]}
          alt={isZh ? `房源照片 ${safeIdx + 1}` : `Listing photo ${safeIdx + 1}`}
          fill
          priority
          sizes="(max-width: 900px) 100vw, 1200px"
          style={{
            objectFit: 'cover',
            display: 'block',
          }}
          onError={(e) => {
            // Hide broken images so the gallery doesn't render an "X" icon.
            (e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={isZh ? '上一张' : 'Previous'}
              style={navArrow('left')}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={isZh ? '下一张' : 'Next'}
              style={navArrow('right')}
            >
              ›
            </button>
          </>
        )}
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            background: 'rgba(15,23,42,0.85)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11.5,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.04em',
          }}
        >
          {safeIdx + 1} {isZh ? '/' : 'of'} {images.length}
        </div>
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 8,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => onChange(i)}
              style={{
                flexShrink: 0,
                width: 90,
                height: 64,
                borderRadius: 6,
                overflow: 'hidden',
                border: i === safeIdx ? `2px solid ${v3.brand}` : `1px solid ${v3.border}`,
                padding: 0,
                cursor: 'pointer',
                background: '#000',
              }}
              aria-label={`Photo ${i + 1}`}
            >
              {/* §11 P2 — thumbnails are tiny (90×64 fixed). Use explicit
                  width/height (matches the parent button) so next/image
                  serves a 90-wide variant from cache. Lazy by default. */}
              <Image
                src={src}
                alt=""
                width={90}
                height={64}
                sizes="90px"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function navArrow(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute',
    [side]: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.95)',
    border: 'none',
    fontSize: 22,
    fontWeight: 700,
    color: v3.textPrimary,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    display: 'grid',
    placeItems: 'center',
  } as React.CSSProperties
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

function FactInline({ value }: { value: string }) {
  return <span>{value}</span>
}

function Sep() {
  return <span aria-hidden style={{ color: v3.textFaint }}>|</span>
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '14px 16px', borderRight: `1px solid ${v3.border}` }}>
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
      <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary, marginTop: 4 }}>
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
    <li style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: v3.textPrimary }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: '#67E8F9', flexShrink: 0 }} />
      {label}
    </li>
  )
}

function ActionLink({ icon, label, onClick }: { icon: string; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 600,
        color: v3.textSecondary,
      }}
    >
      <span aria-hidden style={{ fontSize: 16, color: v3.textMuted }}>{icon}</span>
      {label}
    </button>
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

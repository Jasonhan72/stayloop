'use client'
// -----------------------------------------------------------------------------
// /listings/[slug] — public listing detail page
// -----------------------------------------------------------------------------
// What a tenant sees when they land on a Stayloop listing URL. Pulls the
// active listing by slug from Supabase (anon key + RLS lets only is_active=true
// rows leak through), and renders address / rent / beds / description / 'Apply'
// CTA. Drafts (is_active=false) return a friendly "not available" message
// rather than 404, since slugs are stable across draft → published transitions.
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

interface Listing {
  id: string
  slug: string
  title: string | null
  description: string | null
  address: string
  unit: string | null
  city: string | null
  province: string | null
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
        .select('id, slug, title, description, address, unit, city, province, monthly_rent, bedrooms, bathrooms, available_date, is_active, status, created_at')
        .eq('slug', slug)
        .maybeSingle()
      if (cancelled) return
      if (!data) {
        setNotFound(true)
      } else {
        setListing(data as Listing)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh' }}>
        <MarketingNav />
        <section style={{ padding: '64px 24px' }}>
          <div style={{ maxWidth: size.content.default, margin: '0 auto', color: v3.textMuted, fontSize: 14 }}>
            {isZh ? '加载中…' : 'Loading…'}
          </div>
        </section>
        <MarketingFooter />
      </main>
    )
  }

  if (notFound || !listing) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh' }}>
        <MarketingNav />
        <section style={{ padding: '64px 24px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center', padding: '40px 20px', background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
              {isZh ? '房源未找到' : 'Listing not found'}
            </h1>
            <p style={{ fontSize: 14, color: v3.textSecondary, margin: 0, lineHeight: 1.55 }}>
              {isZh
                ? '这套房源可能已被房东下架，或链接已变更。'
                : 'This listing may have been removed by the landlord, or the link has changed.'}
            </p>
            <Link
              href="/"
              style={{ display: 'inline-block', marginTop: 18, padding: '10px 20px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              {isZh ? '返回首页' : 'Back to homepage'}
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    )
  }

  // Draft / inactive listings: don't expose details, just a friendly "not yet" page.
  if (!listing.is_active) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh' }}>
        <MarketingNav />
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
              {isZh
                ? '房东仍在准备这套房源。等他们发布后链接就能正常打开。'
                : 'The landlord is still preparing this listing. The link will work once they publish it.'}
            </p>
          </div>
        </section>
        <MarketingFooter />
      </main>
    )
  }

  const title = listing.title || `${listing.address}${listing.unit ? ` · ${listing.unit}` : ''}`
  const cityProv = [listing.city, listing.province].filter(Boolean).join(', ')

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* Hero — title + address + key facts strip */}
      <section
        style={{
          background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surface} 100%)`,
          padding: '48px 24px 36px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.default, margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              color: v3.brandStrong,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 10,
            }}
          >
            {isZh ? '房源详情' : 'Listing details'}
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 38px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              lineHeight: 1.15,
              color: v3.textPrimary,
            }}
          >
            {title}
          </h1>
          {cityProv && (
            <div style={{ fontSize: 14, color: v3.textSecondary, marginBottom: 18 }}>
              {listing.address}{listing.unit ? `, ${listing.unit}` : ''}{cityProv ? ` · ${cityProv}` : ''}
            </div>
          )}

          {/* Key facts strip */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14 }}>
            {listing.monthly_rent != null && listing.monthly_rent > 0 && (
              <Fact label={isZh ? '月租' : 'Monthly rent'} value={`$${listing.monthly_rent.toLocaleString()}`} highlight />
            )}
            {listing.bedrooms != null && (
              <Fact label={isZh ? '卧室' : 'Bedrooms'} value={String(listing.bedrooms)} />
            )}
            {listing.bathrooms != null && (
              <Fact label={isZh ? '卫浴' : 'Bathrooms'} value={String(listing.bathrooms)} />
            )}
            {listing.available_date && (
              <Fact
                label={isZh ? '入住日期' : 'Available'}
                value={new Date(listing.available_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA', {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              />
            )}
          </div>
        </div>
      </section>

      {/* Body — description + apply CTA */}
      <section style={{ padding: '36px 24px 64px' }}>
        <div style={{ maxWidth: size.content.default, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }} className="listing-detail-grid">
          {/* Description column */}
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 16,
              padding: 'clamp(20px, 3vw, 28px)',
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px', color: v3.textPrimary }}>
              {isZh ? '房源介绍' : 'About this place'}
            </h2>
            {listing.description ? (
              <p style={{ fontSize: 14.5, lineHeight: 1.7, color: v3.textSecondary, whiteSpace: 'pre-wrap', margin: 0 }}>
                {listing.description}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: v3.textMuted, fontStyle: 'italic', margin: 0 }}>
                {isZh ? '房东尚未填写详细介绍。' : 'The landlord hasn’t added a description yet.'}
              </p>
            )}
          </div>

          {/* Apply CTA + screening note column */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 16,
                padding: 22,
              }}
            >
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 8 }}>
                {isZh ? '感兴趣？' : 'Interested?'}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: v3.textPrimary, margin: '0 0 10px' }}>
                {isZh ? '提交租赁申请' : 'Apply to rent'}
              </h3>
              <p style={{ fontSize: 13, color: v3.textSecondary, lineHeight: 1.55, margin: '0 0 16px' }}>
                {isZh
                  ? '上传 ID、收入证明、雇佣信。Stayloop 会替房东做 AI 辅助筛查，给你一份结构化的申请档案。'
                  : 'Upload your ID, proof of income, and employment letter. Stayloop runs AI-assisted screening for the landlord and produces a structured applicant profile.'}
              </p>
              <Link
                href={`/apply/${listing.slug}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
                }}
              >
                {isZh ? '开始申请 →' : 'Start application →'}
              </Link>
            </div>

            {/* Trust note */}
            <div
              style={{
                fontSize: 11.5,
                color: v3.textMuted,
                lineHeight: 1.5,
                padding: '10px 14px',
                background: v3.surface,
                border: `1px dashed ${v3.borderStrong}`,
                borderRadius: 10,
              }}
            >
              <span style={{ color: v3.brand, fontFamily: 'JetBrains Mono, monospace', marginRight: 6 }}>◆</span>
              {isZh
                ? '你的资料只对该房源的房东可见。详情见 '
                : 'Your documents are only shared with this listing’s landlord. See '}
              <Link href="/legal/privacy" style={{ color: v3.brand, textDecoration: 'underline' }}>
                {isZh ? '隐私声明' : 'Privacy notice'}
              </Link>
              {isZh ? '。' : '.'}
            </div>
          </aside>
        </div>
      </section>

      <MarketingFooter />

      <style jsx global>{`
        @media (max-width: 760px) {
          .listing-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}

function Fact({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
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
          fontSize: highlight ? 26 : 18,
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

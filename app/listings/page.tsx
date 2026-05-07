'use client'
// -----------------------------------------------------------------------------
// /listings — public listings index
// -----------------------------------------------------------------------------
// Anyone (no login required) can browse all active listings here. Pulls from
// Supabase with the anon client; RLS gates the SELECT to is_active=true rows
// (see migration 202605060001). Each card links to /listings/[slug].
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

interface Listing {
  id: string
  slug: string
  title: string | null
  address: string
  unit: string | null
  city: string | null
  monthly_rent: number | null
  bedrooms: number | null
  bathrooms: number | null
  available_date: string | null
}

export default function ListingsIndexPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [bedFilter, setBedFilter] = useState<'any' | '0' | '1' | '2' | '3+'>('any')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('listings')
        .select('id, slug, title, address, unit, city, monthly_rent, bedrooms, bathrooms, available_date')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(60)
      if (cancelled) return
      setListings((data as Listing[]) || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return listings.filter(l => {
      if (bedFilter !== 'any') {
        const b = l.bedrooms ?? 0
        if (bedFilter === '3+' ? b < 3 : Number(bedFilter) !== b) return false
      }
      if (!q) return true
      return (
        (l.address || '').toLowerCase().includes(q) ||
        (l.city || '').toLowerCase().includes(q) ||
        (l.title || '').toLowerCase().includes(q)
      )
    })
  }, [listings, query, bedFilter])

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surface} 100%)`,
          padding: '40px 24px 24px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
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
            {isZh ? '房源列表' : 'Listings'}
          </span>
          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 40px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              lineHeight: 1.15,
              color: v3.textPrimary,
            }}
          >
            {isZh ? '所有正在出租的房源' : 'Browse listings on Stayloop'}
          </h1>
          <p style={{ fontSize: 15, color: v3.textSecondary, margin: '0 0 18px', maxWidth: 640, lineHeight: 1.55 }}>
            {isZh
              ? '由房东或经纪在 Stayloop 上发布的实时房源。点开任何一套，看详情后可以直接走结构化申请。'
              : 'Live listings posted by landlords and rental agents on Stayloop. Open any one to view details and apply.'}
          </p>

          {/* Filter row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isZh ? '按地址、城市、楼宇搜索…' : 'Search by address, city, building…'}
              style={{
                flex: '1 1 280px',
                maxWidth: 420,
                background: '#FFFFFF',
                border: `1px solid ${v3.border}`,
                borderRadius: 10,
                fontSize: 14,
                padding: '10px 14px',
                outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = v3.brand)}
              onBlur={e => (e.currentTarget.style.borderColor = v3.border)}
            />
            <div style={{ display: 'flex', gap: 4, background: '#FFFFFF', border: `1px solid ${v3.border}`, borderRadius: 10, padding: 3 }}>
              {(['any', '0', '1', '2', '3+'] as const).map(b => (
                <button
                  key={b}
                  onClick={() => setBedFilter(b)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: 'none',
                    background: bedFilter === b ? v3.brand : 'transparent',
                    color: bedFilter === b ? '#fff' : v3.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  {b === 'any' ? (isZh ? '全部' : 'Any') : b === '0' ? (isZh ? '开间' : 'Studio') : `${b} ${isZh ? '卧' : 'bd'}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Listings grid */}
      <section style={{ padding: '32px 24px 64px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: v3.textMuted, fontSize: 14 }}>
              {isZh ? '加载房源…' : 'Loading listings…'}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState lang={lang} totalCount={listings.length} />
          ) : (
            <>
              <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 14, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em' }}>
                {isZh
                  ? `${filtered.length} 套房源 · 共 ${listings.length}`
                  : `${filtered.length} listing${filtered.length === 1 ? '' : 's'} · ${listings.length} total`}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 16,
                }}
              >
                {filtered.map(l => (
                  <ListingCard key={l.id} listing={l} isZh={isZh} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <MarketingFooter />
    </main>
  )
}

function EmptyState({ lang, totalCount }: { lang: 'en' | 'zh'; totalCount: number }) {
  const isZh = lang === 'zh'
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏠</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: v3.textPrimary, margin: '0 0 6px' }}>
        {totalCount === 0
          ? (isZh ? '暂无在线房源' : 'No active listings yet')
          : (isZh ? '没有符合条件的房源' : 'No listings match these filters')}
      </h2>
      <p style={{ fontSize: 13.5, color: v3.textSecondary, margin: '0 auto', maxWidth: 460, lineHeight: 1.55 }}>
        {totalCount === 0
          ? (isZh
              ? 'Stayloop 上还没有公开发布的房源。如果你是房东，可以先把房源加进来。'
              : 'No published listings on Stayloop yet. If you’re a landlord, get yours up first.')
          : (isZh
              ? '清掉搜索词或重设卧室数量，能看到更多。'
              : 'Clear the search term or reset the bedroom filter to see more.')}
      </p>
      {totalCount === 0 && (
        <Link
          href="/listings/new"
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
            color: '#fff',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {isZh ? '发布房源 →' : 'Post a listing →'}
        </Link>
      )}
    </div>
  )
}

function ListingCard({ listing, isZh }: { listing: Listing; isZh: boolean }) {
  const title = listing.title || `${listing.address}${listing.unit ? ` · ${listing.unit}` : ''}`
  const beds = listing.bedrooms == null ? null : listing.bedrooms === 0 ? (isZh ? '开间' : 'Studio') : `${listing.bedrooms} ${isZh ? '卧' : 'bd'}`
  const baths = listing.bathrooms == null ? null : `${listing.bathrooms} ${isZh ? '卫' : 'ba'}`

  return (
    <Link
      href={`/listings/${listing.slug}`}
      style={{
        display: 'block',
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 14,
        padding: 0,
        textDecoration: 'none',
        color: 'inherit',
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        transition: 'border-color .15s, transform .15s, box-shadow .15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = v3.brand
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 12px 32px -8px rgba(15, 23, 42, 0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = v3.border
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.04)'
      }}
    >
      {/* Image placeholder — real photos can land here later */}
      <div
        style={{
          height: 140,
          background: `linear-gradient(135deg, ${v3.surfaceMuted} 0%, ${v3.brandWash} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: v3.textFaint,
          fontSize: 36,
        }}
      >
        🏙
      </div>

      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, letterSpacing: '-0.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
        </div>
        {listing.city && (
          <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 8 }}>
            {listing.city}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          {listing.monthly_rent != null && listing.monthly_rent > 0 && (
            <span style={{ fontSize: 18, fontWeight: 700, color: v3.brand, letterSpacing: '-0.01em' }}>
              ${listing.monthly_rent.toLocaleString()}
              <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 500, marginLeft: 2 }}>
                {isZh ? '/月' : '/mo'}
              </span>
            </span>
          )}
        </div>
        {(beds || baths || listing.available_date) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11.5, color: v3.textSecondary, fontFamily: 'JetBrains Mono, monospace' }}>
            {beds && <span>◇ {beds}</span>}
            {baths && <span>◇ {baths}</span>}
            {listing.available_date && (
              <span>
                ◇ {new Date(listing.available_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

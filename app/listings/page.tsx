'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import Header from '@/components/Header'
import ListingsMap from '@/components/ListingsMap'
import { supabase } from '@/lib/supabase'

/**
 * V5 ART · Listings Browse (StreetEasy-inspired split view)
 *
 * Layout (spec):
 *   .se-search   — 14px 32px padding, dark-bordered input + black button
 *   .se-filters  — pill filters w/ Luna pill on the right (margin-left: auto)
 *   .se-results-bar — count + sort
 *   .se-body     — grid-template-columns: 1fr 480px (cards | map)
 *   .se-grid     — 2-column card grid
 *   .se-map      — sticky map with absolute price pins, drawn legend
 */

interface DBListing {
  id: string
  slug: string
  address: string
  unit: string | null
  city: string
  province: string
  monthly_rent: number
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  neighborhood: string | null
  trust_tier: number | null
  pet_policy: string | null
  amenities: string[] | null
  match_score: number | null
  pin_x: number | null
  pin_y: number | null
  lat: number | null
  lng: number | null
  thumb_a: string | null
  thumb_b: string | null
  luna_note: string | null
  badge: string | null
  photo_count: number | null
  is_active: boolean
  created_at: string
  images: string[] | null
}

export default function ListingsPage() {
  const [items, setItems] = useState<DBListing[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('多伦多 King West, Liberty Village, Queen West')

  useEffect(() => {
    supabase
      .from('listings')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setItems((data || []) as DBListing[])
        if (data && data.length > 0) setActive((data[1] || data[0]).id)
        setLoading(false)
      })
  }, [])

  const count = items.length

  return (
    <div className="bg-white" style={{ minHeight: '100vh' }}>
      <Header />

      {/* Search row */}
      <section
        className="bg-white"
        style={{ padding: '14px 32px 8px', borderBottom: '1px solid #F0EBE0' }}
      >
        <div className="mx-auto flex w-full items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
            style={{
              padding: '12px 16px',
              border: '1.5px solid #171717',
              borderRight: 0,
              borderRadius: '10px 0 0 10px',
              fontSize: 14,
              minWidth: 280,
              outline: 'none',
            }}
          />
          <button
            style={{
              padding: '12px 20px',
              background: '#171717',
              color: '#fff',
              border: '1.5px solid #171717',
              borderRadius: '0 10px 10px 0',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            搜索 →
          </button>
        </div>
      </section>

      {/* Filters */}
      <section
        className="bg-white"
        style={{ padding: '12px 32px', borderBottom: '1px solid #E0DACE' }}
      >
        <div className="mx-auto flex w-full flex-wrap items-center gap-[10px]">
          <Filt label="出租" on />
          <Filt label="$ 0 – 2,900" />
          <Filt label="1 卧 + den" />
          <Filt label="入住日期" />
          <Filt label="允许猫" />
          <Filt label="更多过滤" />
          <span
            style={{
              marginLeft: 'auto',
              padding: '8px 14px',
              background:
                'linear-gradient(135deg,rgba(124,58,237,0.10),rgba(37,99,235,0.10))',
              border: '1px solid rgba(124,58,237,0.40)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: '#5B21B6',
              cursor: 'pointer',
            }}
          >
            ◐ Luna 帮我筛 (匹配我的 Profile)
          </span>
        </div>
      </section>

      {/* Results bar */}
      <section
        className="bg-white"
        style={{ padding: '12px 32px', borderBottom: '1px solid #F0EBE0' }}
      >
        <div className="mx-auto flex w-full items-baseline justify-between">
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            <b style={{ color: '#047857' }}>{count}</b> 套房源 · King West + Liberty Village
          </div>
          <div style={{ fontSize: 13, color: '#3F3F46' }}>
            排序：<b style={{ color: '#171717', textDecoration: 'underline' }}>Luna 推荐 ▾</b>
          </div>
        </div>
      </section>

      {/* Body: split view — match Hi-Fi spec (~50/50 cards | map) */}
      <section
        className="w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(540px, 1fr) minmax(420px, 1fr)',
        }}
      >
        {/* Card grid */}
        <div
          style={{
            padding: '18px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
            alignContent: 'start',
          }}
        >
          {loading && (
            <div className="col-span-full p-10 text-center font-mono text-[12px] text-body-3">
              加载中…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="col-span-full p-10 text-center text-body-3">
              没有匹配的房源 · 调整筛选条件试试
            </div>
          )}
          {items.map((l) => (
            <ListingCard
              key={l.id}
              l={l}
              isActive={active === l.id}
              onHover={() => setActive(l.id)}
            />
          ))}
        </div>

        {/* Map (sticky, Google Maps) */}
        <ListingsMap
          listings={items.map((l) => ({
            id: l.id,
            slug: l.slug,
            lat: l.lat,
            lng: l.lng,
            monthly_rent: l.monthly_rent,
            match_score: l.match_score,
          }))}
          active={active}
          onPick={setActive}
        />
      </section>
    </div>
  )
}

function Filt({ label, on, luna }: { label: string; on?: boolean; luna?: boolean }) {
  return (
    <span
      style={{
        padding: '8px 14px',
        background: on ? '#171717' : luna ? 'linear-gradient(135deg,rgba(124,58,237,0.10),rgba(37,99,235,0.10))' : '#fff',
        border: on ? '1px solid #171717' : '1px solid #C5BDAA',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: on ? '#fff' : '#171717',
        cursor: 'pointer',
        display: 'inline-flex',
        gap: 6,
        alignItems: 'center',
      }}
    >
      {label} <span style={{ fontSize: 9, color: on ? '#fff' : '#71717A' }}>▾</span>
    </span>
  )
}

function ListingCard({
  l,
  isActive,
  onHover,
}: {
  l: DBListing
  isActive: boolean
  onHover: () => void
}) {
  const a = l.thumb_a || '#D4C4A8'
  const b = l.thumb_b || '#94815C'
  const tierClass = (l.trust_tier || 2) >= 3 ? 't3' : 't2'
  const heroImage = l.images && l.images.length > 0 ? l.images[0] : null
  return (
    <Link
      href={`/listings/${l.slug}`}
      onMouseEnter={onHover}
      className="block bg-white transition"
      style={{
        border: '1px solid #E8E2D2',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: isActive ? '0 12px 28px rgba(0,0,0,0.10)' : 'none',
        transform: isActive ? 'translateY(-1px)' : 'none',
      }}
    >
      <div
        style={{
          aspectRatio: '1.5',
          background: heroImage
            ? `url(${heroImage}) center/cover no-repeat, linear-gradient(135deg,${a},${b})`
            : `linear-gradient(135deg,${a},${b})`,
          position: 'relative',
        }}
      >
        {l.badge && (
          <span
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background:
                l.badge.startsWith('LUNA')
                  ? '#7C3AED'
                  : l.badge.startsWith('NEW')
                    ? '#DC2626'
                    : '#047857',
              color: '#fff',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 8px',
              borderRadius: 4,
              letterSpacing: '0.10em',
            }}
          >
            {l.badge}
          </span>
        )}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 30,
            height: 30,
            background: 'rgba(0,0,0,0.50)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
          }}
        >
          ♡
        </div>
        {l.photo_count && (
          <span
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              background: 'rgba(0,0,0,0.65)',
              color: '#fff',
              padding: '3px 8px',
              borderRadius: 4,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
            }}
          >
            1 / {l.photo_count}
          </span>
        )}
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
          ${l.monthly_rent.toLocaleString()}
          <small style={{ fontSize: 12, fontWeight: 500, color: '#71717A' }}>/月</small>
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#3F3F46',
            margin: '4px 0 6px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {l.bedrooms != null && (
            <b style={{ color: '#171717' }}>
              {l.bedrooms === 0 ? 'Studio' : `${l.bedrooms}B${(l as any).has_den ? ' + den' : ''}`}
            </b>
          )}
          <span style={{ width: 3, height: 3, background: '#C5BDAA', borderRadius: '50%' }} />
          <b style={{ color: '#171717' }}>{l.bathrooms} 浴</b>
          {l.sqft && (
            <>
              <span style={{ width: 3, height: 3, background: '#C5BDAA', borderRadius: '50%' }} />
              <b style={{ color: '#171717' }}>{l.sqft} sqft</b>
            </>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {l.address}
          {l.unit && ` · Unit ${l.unit}`}
        </div>
        <div style={{ fontSize: 12, color: '#71717A', marginTop: 1 }}>
          {l.neighborhood} · {l.city}
        </div>
        {l.amenities && l.amenities.length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {l.amenities.slice(0, 3).map((a) => (
              <span
                key={a}
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 3,
                  letterSpacing: '0.06em',
                  background: 'rgba(4,120,87,0.10)',
                  color: '#047857',
                }}
              >
                {a}
              </span>
            ))}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9.5,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 3,
                letterSpacing: '0.06em',
                background:
                  tierClass === 't3' ? 'rgba(217,119,6,0.10)' : 'rgba(4,120,87,0.10)',
                color: tierClass === 't3' ? '#B45309' : '#047857',
              }}
            >
              需 Tier {l.trust_tier || 2}
            </span>
          </div>
        )}
      </div>
      {l.luna_note && (
        <div
          style={{
            background: 'rgba(124,58,237,0.06)',
            borderTop: '1px solid rgba(124,58,237,0.15)',
            padding: '8px 16px',
            fontSize: 11.5,
            color: '#5B21B6',
            lineHeight: 1.45,
          }}
        >
          ◐ {l.luna_note}
        </div>
      )}
    </Link>
  )
}

// Old fake-SVG Map removed; ListingsMap (Google Maps) is used instead.

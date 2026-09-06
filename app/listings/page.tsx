'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useRef } from 'react'
import Header from '@/components/Header'
import FavHeart from '@/components/FavHeart'
import { PromoBadge, VerificationBadge } from '@/components/ListingBadges'
import ListingsMap from '@/components/ListingsMap'
import { favKey, useFavorites, type FavListing } from '@/lib/favorites'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useAIName } from '@/lib/aiName'
import { stampForTier } from '@/lib/passportStamps'
import { LISTING_VISIBILITY_OR } from '@/lib/listingVisibility'

/**
 * V5 ART · Listings Browse (StreetEasy/Airbnb-inspired split view)
 * All filters are REAL: query, price range, beds, move-in date, pets,
 * baths/sqft, sort. "◐ {AI} 帮我筛" applies the signed-in tenant's saved
 * memories (budget / beds / pets) as filters. The assistant name follows
 * the user's own chosen AI name; anonymous visitors see the generic "AI".
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
  available_date?: string | null
  has_den?: boolean | null
  source?: string | null
  verification_status?: string | null
}

type SortKey = 'ai' | 'price_asc' | 'price_desc' | 'newest'

// Same identity inputs as the agent-chat listing cards (lib/agent/listingSearch
// builds url=/listings/{slug} and source), so favorites match across surfaces.
const dbFavKey = (l: DBListing) =>
  favKey({ source: l.source, id: l.id, url: `/listings/${l.slug}`, address: l.address })

const dbFavSnapshot = (l: DBListing): Omit<FavListing, 'savedAt'> => ({
  key: dbFavKey(l),
  source: l.source === 'realtor' ? 'realtor' : 'stayloop',
  title: l.address + (l.unit ? ` · Unit ${l.unit}` : ''),
  address: l.address,
  neighborhood: l.neighborhood || undefined,
  city: l.city,
  price: l.monthly_rent,
  beds: l.bedrooms,
  baths: l.bathrooms,
  sqft: l.sqft,
  image: l.images && l.images.length > 0 ? l.images[0] : null,
  href: `/listings/${l.slug}`,
})
const NEGATIVE_PETS = /(no\s*pets?|pets?\s+not|禁止|不允许|不可养)/i

export default function ListingsPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const router = useRouter()
  const { user } = useAuth()
  const storedAiName = useAIName('tenant')
  const aiName = user ? storedAiName : 'AI'

  const [all, setAll] = useState<DBListing[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Filter state (all functional) ─────────────────────────────────────────
  const [queryInput, setQueryInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [priceMin, setPriceMin] = useState<number | null>(null)
  const [priceMax, setPriceMax] = useState<number | null>(null)
  const [minBeds, setMinBeds] = useState<number | null>(null)
  const [moveIn, setMoveIn] = useState('')
  const [pets, setPets] = useState(false)
  const [minBaths, setMinBaths] = useState<number | null>(null)
  const [minSqft, setMinSqft] = useState<number | null>(null)
  const [sort, setSort] = useState<SortKey>('ai')
  const [openChip, setOpenChip] = useState<string | null>(null)
  const [aiFilterNote, setAiFilterNote] = useState<string | null>(null)
  const [favOnly, setFavOnly] = useState(false)
  const { favs, isFav, toggle, count: favCount } = useFavorites()

  useEffect(() => {
    supabase
      .from('listings')
      // Only the columns the browse cards + map + client filters read — not
      // select('*') (which shipped every image URL, description, price_history
      // and broker fields on the highest-traffic public page).
      .select('id,slug,address,unit,city,province,monthly_rent,bedrooms,bathrooms,sqft,neighborhood,trust_tier,pet_policy,amenities,match_score,pin_x,pin_y,lat,lng,thumb_a,thumb_b,luna_note,badge,photo_count,is_active,created_at,images,available_date,has_den,source,verification_status')
      .eq('is_active', true)
      // Public list shows verified listings; Realtor.ca-sourced ones show
      // without verification (they carry a source badge instead).
      .or(LISTING_VISIBILITY_OR)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        setAll((data || []) as DBListing[])
        if (data && data.length > 0) setActive((data[1] || data[0]).id)
        setLoading(false)
      })
  }, [])

  const items = useMemo(() => {
    let out = all.slice()
    if (favOnly) {
      const keys = new Set(favs.map((f) => f.key))
      out = out.filter((l) => keys.has(dbFavKey(l)))
    }
    // Query: a listing passes when ANY meaningful token hits any field —
    // multi-neighborhood queries ("King West, Liberty Village") are OR.
    const tokens = appliedQuery
      .split(/[\s,，·]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2 && !['多伦多', 'toronto'].includes(t))
    if (tokens.length) {
      out = out.filter((l) => {
        const hay = `${l.address} ${l.unit || ''} ${l.city} ${l.neighborhood || ''}`.toLowerCase()
        return tokens.some((t) => hay.includes(t))
      })
    }
    if (priceMin != null) out = out.filter((l) => l.monthly_rent >= priceMin)
    if (priceMax != null) out = out.filter((l) => l.monthly_rent <= priceMax)
    if (minBeds != null) out = out.filter((l) => (l.bedrooms ?? 0) >= minBeds)
    if (moveIn) out = out.filter((l) => !l.available_date || l.available_date <= moveIn)
    if (pets) out = out.filter((l) => !!l.pet_policy && !NEGATIVE_PETS.test(l.pet_policy))
    if (minBaths != null) out = out.filter((l) => (l.bathrooms ?? 0) >= minBaths)
    if (minSqft != null) out = out.filter((l) => (l.sqft ?? 0) >= minSqft)
    switch (sort) {
      case 'price_asc': out.sort((a, b) => a.monthly_rent - b.monthly_rent); break
      case 'price_desc': out.sort((a, b) => b.monthly_rent - a.monthly_rent); break
      case 'newest': out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')); break
      default: out.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1))
    }
    return out
  }, [all, appliedQuery, priceMin, priceMax, minBeds, moveIn, pets, minBaths, minSqft, sort, favOnly, favs])

  // Favorited listings that aren't in the current dataset at all (e.g. external
  // Realtor.ca cards saved from the agent chat) — rendered from their stored
  // snapshot so the favorites view can always show them.
  const extraFavs = useMemo(() => {
    if (!favOnly) return [] as FavListing[]
    const known = new Set(all.map(dbFavKey))
    return favs.filter((f) => !known.has(f.key))
  }, [favOnly, favs, all])

  const count = items.length + extraFavs.length

  // "◐ {AI} 帮我筛" — pull the signed-in tenant's saved memories and turn the
  // parseable ones (budget / beds / pets) into live filters.
  const applyProfileFilters = async () => {
    if (!user) {
      router.push('/login?redirect=/listings')
      return
    }
    const { data } = await supabase
      .from('user_memories')
      .select('key,label,value')
      .eq('role', 'tenant')
      .limit(60)
    const memories = (data || []) as { key: string; label: string | null; value: string }[]
    const applied: string[] = []
    for (const m of memories) {
      const blob = `${m.key} ${m.label || ''} ${m.value}`.toLowerCase()
      const num = String(m.value).replace(/,/g, '').match(/\d{3,6}/)?.[0]
      if (/budget|预算|price|租金/.test(blob) && num) {
        setPriceMax(Number(num))
        applied.push(zh ? `预算 ≤ $${Number(num).toLocaleString()}` : `budget ≤ $${Number(num).toLocaleString()}`)
      } else if (/(bed|卧|房型)/.test(blob)) {
        const b = String(m.value).match(/(\d)\s*(b|bed|卧)/i)?.[1]
        if (b) { setMinBeds(Number(b)); applied.push(zh ? `${b} 卧+` : `${b}+ beds`) }
      } else if (/(pet|宠|猫|狗)/.test(blob) && !NEGATIVE_PETS.test(blob)) {
        setPets(true)
        applied.push(zh ? '宠物友好' : 'pet-friendly')
      }
    }
    setAiFilterNote(
      applied.length
        ? (zh ? `已按你的档案套用：${applied.join(' · ')}` : `Applied from your profile: ${applied.join(' · ')}`)
        : (zh ? `你的档案里还没有可用的偏好 —— 先去和 ${aiName} 聊聊预算和需求吧` : `No usable preferences in your profile yet — chat with ${aiName} about your budget first`),
    )
  }

  const clearAll = () => {
    setAppliedQuery(''); setQueryInput(''); setPriceMin(null); setPriceMax(null)
    setMinBeds(null); setMoveIn(''); setPets(false); setMinBaths(null); setMinSqft(null)
    setAiFilterNote(null)
  }
  const anyFilter = appliedQuery || priceMin != null || priceMax != null || minBeds != null || moveIn || pets || minBaths != null || minSqft != null

  const priceLabel = priceMin != null || priceMax != null
    ? `$${(priceMin ?? 0).toLocaleString()} – ${priceMax != null ? priceMax.toLocaleString() : (zh ? '不限' : 'any')}`
    : (zh ? '价格' : 'Price')
  const bedsLabel = minBeds != null
    ? (minBeds === 0 ? 'Studio+' : `${minBeds} ${zh ? '卧+' : 'bed+'}`)
    : (zh ? '卧室' : 'Beds')
  const moveInLabel = moveIn || (zh ? '入住日期' : 'Move-in date')
  const moreOn = minBaths != null || minSqft != null

  return (
    <div className="bg-white" style={{ minHeight: '100vh' }}>
      <Header />

      {/* Search row */}
      <section
        className="bg-white px-5 sm:px-8"
        style={{ paddingTop: 14, paddingBottom: 8, borderBottom: '1px solid #F0EBE0' }}
      >
        <div className="mx-auto flex w-full max-w-[720px] items-center">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setAppliedQuery(queryInput) }}
            placeholder={zh ? '搜索地址 / 社区，例如 King West, Liberty Village' : 'Search address / neighborhood, e.g. King West, Liberty Village'}
            className="min-w-0 flex-1"
            style={{
              padding: '12px 16px',
              border: '1.5px solid #171717',
              borderRight: 0,
              borderRadius: '10px 0 0 10px',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button
            onClick={() => setAppliedQuery(queryInput)}
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
            {zh ? '搜索 →' : 'Search →'}
          </button>
        </div>
      </section>

      {/* Filters — every chip is functional */}
      <section
        className="bg-white px-5 sm:px-8"
        style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid #E2E8F0' }}
      >
        <div className="relative mx-auto flex w-full max-w-[1080px] flex-wrap items-center justify-center gap-[10px]">
          {/* Mode (only rentals live today) */}
          <Chip label={zh ? '出租' : 'For rent'} on open={openChip === 'mode'} onToggle={() => setOpenChip(openChip === 'mode' ? null : 'mode')}>
            <div style={{ fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{zh ? '出租 ✓' : 'For rent ✓'}</div>
              <div style={{ color: '#A1A1AA', marginTop: 4 }}>{zh ? '出售 · 即将上线' : 'For sale · coming soon'}</div>
            </div>
          </Chip>

          {/* Price */}
          <Chip label={priceLabel} on={priceMin != null || priceMax != null} open={openChip === 'price'} onToggle={() => setOpenChip(openChip === 'price' ? null : 'price')}>
            <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" inputMode="numeric" placeholder={zh ? '$ 最低' : '$ Min'} value={priceMin ?? ''}
                  onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setPriceMin(n ? Number(n) : null) }}
                  style={{ width: '50%', padding: '9px 10px', border: '1px solid #94A3B8', borderRadius: 8, fontSize: 13.5 }} />
                <input type="text" inputMode="numeric" placeholder={zh ? '$ 最高' : '$ Max'} value={priceMax ?? ''}
                  onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setPriceMax(n ? Number(n) : null) }}
                  style={{ width: '50%', padding: '9px 10px', border: '1px solid #94A3B8', borderRadius: 8, fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[[null, 2000], [2000, 3000], [3000, 4500], [4500, null]].map(([a, b], i) => {
                  const isOn = priceMin === a && priceMax === b
                  return (
                    <button key={i} onClick={() => { setPriceMin(a as number | null); setPriceMax(b as number | null) }}
                      style={{
                        padding: '7px 10px', border: isOn ? '1px solid #171717' : '1px solid #94A3B8', borderRadius: 999,
                        fontSize: 12.5, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                        background: isOn ? '#171717' : '#fff', color: isOn ? '#fff' : '#171717',
                      }}>
                      {a == null ? `< $${(b as number).toLocaleString()}` : b == null ? `$${(a as number).toLocaleString()}+` : `$${(a as number / 1000)}k – $${(b as number / 1000)}k`}
                    </button>
                  )
                })}
              </div>
              <button onClick={() => { setPriceMin(null); setPriceMax(null) }} style={{ fontSize: 12, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                {zh ? '清除' : 'Clear'}
              </button>
            </div>
          </Chip>

          {/* Beds */}
          <Chip label={bedsLabel} on={minBeds != null} open={openChip === 'beds'} onToggle={() => setOpenChip(openChip === 'beds' ? null : 'beds')}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[[null, zh ? '不限' : 'Any'], [0, 'Studio+'], [1, '1+'], [2, '2+'], [3, '3+']].map(([v, label]) => (
                <button key={String(label)} onClick={() => setMinBeds(v as number | null)}
                  style={{
                    padding: '7px 14px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
                    whiteSpace: 'nowrap', userSelect: 'none', flexShrink: 0,
                    border: minBeds === v ? '1px solid #171717' : '1px solid #94A3B8',
                    background: minBeds === v ? '#171717' : '#fff',
                    color: minBeds === v ? '#fff' : '#171717',
                  }}>
                  {label as string}
                </button>
              ))}
            </div>
          </Chip>

          {/* Move-in date */}
          <Chip label={moveInLabel} on={!!moveIn} open={openChip === 'movein'} onToggle={() => setOpenChip(openChip === 'movein' ? null : 'movein')}>
            <div style={{ display: 'grid', gap: 8 }}>
              <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #94A3B8', borderRadius: 8, fontSize: 13 }} />
              <div style={{ fontSize: 11.5, color: '#71717A' }}>
                {zh ? '显示该日期前可入住（或随时可入住）的房源' : 'Shows homes available by this date (or anytime)'}
              </div>
              {moveIn && (
                <button onClick={() => setMoveIn('')} style={{ fontSize: 12, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  {zh ? '清除' : 'Clear'}
                </button>
              )}
            </div>
          </Chip>

          {/* Pets — simple toggle */}
          <button
            onClick={() => setPets((v) => !v)}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: pets ? '1px solid #171717' : '1px solid #94A3B8',
              background: pets ? '#171717' : '#fff',
              color: pets ? '#fff' : '#171717',
            }}
          >
            {zh ? '宠物友好' : 'Pets OK'}{pets ? ' ✓' : ''}
          </button>

          {/* More filters */}
          <Chip label={zh ? '更多过滤' : 'More filters'} on={moreOn} open={openChip === 'more'} onToggle={() => setOpenChip(openChip === 'more' ? null : 'more')}>
            <div style={{ display: 'grid', gap: 10, minWidth: 220 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{zh ? '浴室' : 'Bathrooms'}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[[null, zh ? '不限' : 'Any'], [1, '1+'], [2, '2+'], [3, '3+']].map(([v, label]) => (
                    <button key={String(label)} onClick={() => setMinBaths(v as number | null)}
                      style={{
                        padding: '6px 12px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer',
                        whiteSpace: 'nowrap', userSelect: 'none', flexShrink: 0,
                        border: minBaths === v ? '1px solid #171717' : '1px solid #94A3B8',
                        background: minBaths === v ? '#171717' : '#fff',
                        color: minBaths === v ? '#fff' : '#171717',
                      }}>
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{zh ? '最小面积 (sqft)' : 'Min size (sqft)'}</div>
                <input type="number" placeholder="600" value={minSqft ?? ''} onChange={(e) => setMinSqft(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #94A3B8', borderRadius: 8, fontSize: 13 }} />
              </div>
            </div>
          </Chip>

          {/* My favorites — local-only filter */}
          <button
            onClick={() => setFavOnly((v) => !v)}
            aria-pressed={favOnly}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: favOnly ? '1px solid #171717' : '1px solid #94A3B8',
              background: favOnly ? '#171717' : '#fff',
              color: favOnly ? '#fff' : '#171717',
            }}
          >
            <span aria-hidden style={{ color: favOnly ? '#FB7185' : '#A1A1AA', fontSize: 14, lineHeight: 1 }}>
              {favOnly ? '♥' : '♡'}
            </span>
            {zh ? `我的收藏 ${favCount}` : `Saved ${favCount}`}
          </button>

          {/* AI profile filter */}
          <button
            onClick={applyProfileFilters}
            style={{
              marginLeft: 12,
              padding: '8px 14px',
              background: 'linear-gradient(135deg,rgba(124,58,237,0.10),rgba(37,99,235,0.10))',
              border: '1px solid rgba(124,58,237,0.40)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: '#5B21B6',
              cursor: 'pointer',
            }}
          >
            {zh ? `◐ ${aiName} 帮我筛 (匹配我的 Profile)` : `◐ Let ${aiName} filter (match my profile)`}
          </button>

          {anyFilter && (
            <button onClick={clearAll} style={{ fontSize: 12.5, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {zh ? '清除全部' : 'Clear all'}
            </button>
          )}
        </div>
        {aiFilterNote && (
          <div className="mx-auto mt-2 max-w-[1080px] text-center" style={{ fontSize: 12.5, color: '#5B21B6' }}>
            ◐ {aiFilterNote}
          </div>
        )}
      </section>

      {/* Results bar */}
      <section
        className="bg-white px-5 sm:px-8"
        style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid #F0EBE0' }}
      >
        <div className="mx-auto flex w-full items-baseline justify-between">
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            <b style={{ color: '#047857' }}>{count}</b>
            {zh ? ' 套房源' : ' listings'}
            {appliedQuery && <span style={{ fontWeight: 500, color: '#3F3F46' }}> · {appliedQuery}</span>}
          </div>
          <label style={{ fontSize: 13, color: '#3F3F46' }}>
            {zh ? '排序：' : 'Sort: '}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              style={{ fontWeight: 700, color: '#171717', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
            >
              <option value="ai">{zh ? `${aiName} 推荐` : `${aiName} picks`}</option>
              <option value="price_asc">{zh ? '价格 从低到高' : 'Price · low to high'}</option>
              <option value="price_desc">{zh ? '价格 从高到低' : 'Price · high to low'}</option>
              <option value="newest">{zh ? '最新发布' : 'Newest'}</option>
            </select>
          </label>
        </div>
      </section>

      {/* Body: split view — cards | map. On very wide viewports the card
          pane gets more share and flows to 3 columns (Airbnb-style density). */}
      <section className="grid w-full grid-cols-1 lg:grid-cols-[minmax(540px,1fr)_minmax(420px,1fr)] 2xl:grid-cols-[minmax(760px,1.3fr)_minmax(420px,1fr)]">
        {/* Card grid */}
        <div
          className="grid grid-cols-1 px-5 py-[18px] sm:grid-cols-2 sm:px-6 2xl:grid-cols-3"
          style={{
            gap: 16,
            alignContent: 'start',
          }}
        >
          {loading && (
            <div className="col-span-full p-10 text-center font-mono text-[12px] text-body-3">
              {zh ? '加载中…' : 'Loading…'}
            </div>
          )}
          {!loading && items.length === 0 && extraFavs.length === 0 && (
            <div className="col-span-full p-10 text-center text-body-3">
              {favOnly
                ? (zh ? '还没有收藏的房源 · 点房源卡右上角的 ♡ 收藏' : 'No saved homes yet · tap the ♡ on any listing card')
                : (zh ? '没有匹配的房源 · 调整筛选条件试试' : 'No matching listings · try adjusting your filters')}
            </div>
          )}
          {items.map((l) => (
            <ListingCard
              key={l.id}
              l={l}
              zh={zh}
              isActive={active === l.id}
              onHover={() => setActive(l.id)}
              fav={isFav(dbFavKey(l))}
              onToggleFav={() => toggle(dbFavSnapshot(l))}
            />
          ))}
          {extraFavs.map((f) => (
            <FavSnapshotCard key={f.key} f={f} zh={zh} onToggleFav={() => toggle(f)} />
          ))}
        </div>

        {/* Map (sticky, Google Maps) — hidden on mobile, shown in split view on lg+ */}
        <div className="hidden lg:block">
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
        </div>
      </section>
    </div>
  )
}

/** Filter chip with a click-outside-closing popover. */
function Chip({ label, on, open, onToggle, children }: {
  label: string
  on?: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, onToggle])
  // Clamp the centered popover inside the viewport — a chip near the screen
  // edge would otherwise push it off-screen (seen on mobile widths).
  useEffect(() => {
    if (!open || !popRef.current) return
    const el = popRef.current
    el.style.transform = 'translateX(-50%)'
    const r = el.getBoundingClientRect()
    let shift = 0
    if (r.left < 8) shift = 8 - r.left
    else if (r.right > window.innerWidth - 8) shift = window.innerWidth - 8 - r.right
    if (shift) el.style.transform = `translateX(calc(-50% + ${shift}px))`
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={onToggle}
        style={{
          padding: '8px 14px',
          background: on ? '#171717' : '#fff',
          border: on ? '1px solid #171717' : '1px solid #94A3B8',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          color: on ? '#fff' : '#171717',
          cursor: 'pointer',
          display: 'inline-flex',
          gap: 6,
          alignItems: 'center',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label} <span style={{ fontSize: 9, color: on ? '#fff' : '#71717A' }}>▾</span>
      </button>
      {open && (
        <div
          ref={popRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 250,
            maxWidth: 'min(92vw, 400px)',
            zIndex: 50,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            padding: 14,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function ListingCard({
  l,
  zh,
  isActive,
  onHover,
  fav,
  onToggleFav,
}: {
  l: DBListing
  zh: boolean
  isActive: boolean
  onHover: () => void
  fav: boolean
  onToggleFav: () => void
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
        <PromoBadge badge={l.badge} variant="card" />
        <VerificationBadge listing={l} variant="public-card" />
        <FavHeart
          fav={fav}
          onToggle={onToggleFav}
          zh={zh}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 30,
            height: 30,
            background: 'rgba(0,0,0,0.50)',
            border: 'none',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        />
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
          <small style={{ fontSize: 12, fontWeight: 500, color: '#71717A' }}>{zh ? '/月' : '/mo'}</small>
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
              {l.bedrooms === 0 ? 'Studio' : `${l.bedrooms}B${l.has_den ? ' + den' : ''}`}
            </b>
          )}
          <span style={{ width: 3, height: 3, background: '#94A3B8', borderRadius: '50%' }} />
          <b style={{ color: '#171717' }}>{l.bathrooms} {zh ? '浴' : 'ba'}</b>
          {l.sqft && (
            <>
              <span style={{ width: 3, height: 3, background: '#94A3B8', borderRadius: '50%' }} />
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
              {zh ? `需 ${stampForTier(l.trust_tier || 2).zh}` : `${stampForTier(l.trust_tier || 2).en} required`}
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
          <span dangerouslySetInnerHTML={{ __html: `◐ ${l.luna_note}` }} />
        </div>
      )}
    </Link>
  )
}

/**
 * A favorited listing that isn't in the current /listings dataset (e.g. an
 * external Realtor.ca card saved from the agent chat) — rendered from the
 * snapshot stored at save time.
 */
function FavSnapshotCard({ f, zh, onToggleFav }: {
  f: FavListing
  zh: boolean
  onToggleFav: () => void
}) {
  const external = f.href.startsWith('http')
  const inner = (
    <>
      <div
        style={{
          aspectRatio: '1.5',
          background: f.image
            ? `url(${f.image}) center/cover no-repeat, linear-gradient(135deg,#D4C4A8,#94815C)`
            : 'linear-gradient(135deg,#D4C4A8,#94815C)',
          position: 'relative',
        }}
      >
        {f.source === 'realtor' && (
          <span
            style={{
              position: 'absolute', top: 10, left: 10, background: '#B45309', color: '#fff',
              padding: '3px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            }}
          >
            REALTOR.CA
          </span>
        )}
        <FavHeart
          fav
          onToggle={onToggleFav}
          zh={zh}
          style={{
            position: 'absolute', top: 10, right: 10, width: 30, height: 30,
            background: 'rgba(0,0,0,0.50)', border: 'none', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}
        />
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
          ${f.price.toLocaleString()}
          <small style={{ fontSize: 12, fontWeight: 500, color: '#71717A' }}>{zh ? '/月' : '/mo'}</small>
        </div>
        <div style={{ fontSize: 13, color: '#3F3F46', margin: '4px 0 6px', display: 'flex', gap: 8, alignItems: 'center' }}>
          {f.beds != null && <b style={{ color: '#171717' }}>{f.beds === 0 ? 'Studio' : `${f.beds}B`}</b>}
          {f.baths != null && (
            <>
              <span style={{ width: 3, height: 3, background: '#94A3B8', borderRadius: '50%' }} />
              <b style={{ color: '#171717' }}>{f.baths} {zh ? '浴' : 'ba'}</b>
            </>
          )}
          {f.sqft != null && (
            <>
              <span style={{ width: 3, height: 3, background: '#94A3B8', borderRadius: '50%' }} />
              <b style={{ color: '#171717' }}>{f.sqft} sqft</b>
            </>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</div>
        {(f.neighborhood || f.city) && (
          <div style={{ fontSize: 12, color: '#71717A', marginTop: 1 }}>
            {[f.neighborhood, f.city].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </>
  )
  const cardStyle: React.CSSProperties = { border: '1px solid #E8E2D2', borderRadius: 12, overflow: 'hidden' }
  if (external) {
    return (
      <a href={f.href} target="_blank" rel="noopener noreferrer" className="block bg-white transition" style={cardStyle}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={f.href} className="block bg-white transition" style={cardStyle}>
      {inner}
    </Link>
  )
}

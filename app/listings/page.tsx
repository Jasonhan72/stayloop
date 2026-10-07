'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import FavHeart from '@/components/FavHeart'
import { VerificationBadge } from '@/components/ListingBadges'
import ListingsMap from '@/components/ListingsMap'
import { favKey, useFavorites, type FavListing } from '@/lib/favorites'
import { supabase } from '@/lib/supabase'
import { renderNote } from '@/lib/safeNote'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useAIName } from '@/lib/aiName'
import { stampForTier } from '@/lib/passportStamps'
import { hasUsablePhotos, LISTING_VISIBILITY_OR } from '@/lib/listingVisibility'

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
  pin_x: number | null
  pin_y: number | null
  lat: number | null
  lng: number | null
  thumb_a: string | null
  thumb_b: string | null
  photo_count: number | null
  is_active: boolean
  created_at: string
  images: string[] | null
  available_date?: string | null
  has_den?: boolean | null
  source?: string | null
  verification_status?: string | null
}

type SortKey = 'price_asc' | 'price_desc' | 'newest'

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
  const storedAiName = useAIName()
  const aiName = user ? storedAiName : 'AI'

  const [all, setAll] = useState<DBListing[]>([])
  const [active, setActive] = useState<string | null>(null)
  // Phone map mode (RealMaster-style): full-screen map with red price tags;
  // tapping a tag shows that listing's card at the bottom.
  const [mapOpen, setMapOpen] = useState(false)
  // Desktop split view: the listing whose tag was clicked (popup over the map).
  const [peek, setPeek] = useState<string | null>(null)
  // Cluster disc tapped: the group's ids, shown as a horizontal strip.
  const [group, setGroup] = useState<string[] | null>(null)
  // Desktop: ids inside the map viewport — the list follows the map.
  const [viewportIds, setViewportIds] = useState<Set<string> | null>(null)
  const onViewport = useCallback((ids: string[] | null) => setViewportIds(ids ? new Set(ids) : null), [])
  useEffect(() => {
    if (!mapOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMapOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [mapOpen])
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
  const [sort, setSort] = useState<SortKey>('newest')
  const [openChip, setOpenChip] = useState<string | null>(null)
  // Filter chips live in a collapsible panel (2026-09-07) so they cost no
  // height until wanted; the toolbar shows how many are active.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [aiFilterNote, setAiFilterNote] = useState<string | null>(null)
  const [favOnly, setFavOnly] = useState(false)
  // Search filters as you type (debounced so the map does not refit on every keystroke); Enter applies at once.
  useEffect(() => {
    const t = setTimeout(() => setAppliedQuery(queryInput.trim()), 300)
    return () => clearTimeout(t)
  }, [queryInput])
  const { favs, isFav, toggle, count: favCount } = useFavorites()

  useEffect(() => {
    supabase
      .from('listings')
      // Only the columns the browse cards + map + client filters read — not
      // select('*') (which shipped every image URL, description, price_history
      // and broker fields on the highest-traffic public page).
      .select('id,slug,address,unit,city,province,monthly_rent,bedrooms,bathrooms,sqft,neighborhood,trust_tier,pet_policy,amenities,pin_x,pin_y,lat,lng,thumb_a,thumb_b,photo_count,is_active,created_at,images,available_date,has_den,source,verification_status')
      .eq('is_active', true)
      // Public list shows verified listings; Realtor.ca-sourced ones show
      // without verification (they carry a source badge instead).
      .or(LISTING_VISIBILITY_OR)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data: raw }) => {
        // No photo, no card (lib/listingVisibility hasUsablePhotos).
        const data = ((raw || []) as DBListing[]).filter((l) => hasUsablePhotos(l.images))
        setAll(data)
        if (data.length > 0) setActive((data[1] || data[0]).id)
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
      // No stored "match" exists (the column was a design-sample leftover, cleared 2026-09-26): default = newest.
      default: out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
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

  const mapListings = useMemo(
    () => items.map((l) => ({ id: l.id, slug: l.slug, lat: l.lat, lng: l.lng, monthly_rent: l.monthly_rent, match_score: null })),
    [items],
  )
  const shown = useMemo(
    () => (viewportIds ? items.filter((l) => l.lat == null || l.lng == null || viewportIds.has(l.id)) : items),
    [items, viewportIds],
  )
  const count = shown.length + extraFavs.length

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
  const activeChipCount = [priceMin != null || priceMax != null, minBeds != null, !!moveIn, pets, moreOn].filter(Boolean).length
  const clearChips = () => { setPriceMin(null); setPriceMax(null); setMinBeds(null); setMoveIn(''); setPets(false); setMinBaths(null); setMinSqft(null); setOpenChip(null) }

  return (
    // Desktop (lg+) is an app-style split view (2026-10-03, user: "现在看不到下面的了，地图里的小房源卡片需要滚动才能看到"):
    // the page itself does not scroll — the toolbar rows keep their height, the cards | map body fills the rest of the
    // viewport, the card list scrolls on its own and the map (with its peek card at the bottom) is always fully on screen.
    // Phones and tablets keep the normal page scroll.
    <div className="bg-white lg:flex lg:h-[100dvh] lg:flex-col lg:overflow-hidden" style={{ minHeight: '100vh' }}>
      <Header />
      {/* The "demo stage · TRREB not connected" bar was removed 2026-10-03 (user: drop the sample-data bars
          for space) — every listing shown here is real (verified landlord listings + Realtor.ca imports). */}

      {/* The page had no h1 element (site test 2026-10-02 · L7 D-08 / L6 D7). Visually
          hidden so the designed search-first layout does not change. */}
      <h1 className="sr-only" data-testid="listings-h1">{zh ? '出租房源' : 'Rental listings'}</h1>

      {/* Toolbar — one line (2026-10-03, user: "把这些内容压缩到一行的空间里，有些可以合并或者取消的").
          Was four rows (demo bar · search · filter toolbar · results bar). Now: search (filters as you type, no
          button) · Filters (panel unfolds beneath on demand, with the AI-preferences preset) · Saved · count ·
          sort. Dropped: the "For rent" chip (rentals are all there is), the "AI picks" sort (no stored match —
          it was "newest" under another name), the separate results bar. Below lg the count + sort wrap to a
          second line. */}
      <section
        className="bg-white px-5 sm:px-8 lg:shrink-0"
        style={{ paddingTop: 10, paddingBottom: 10, borderBottom: '1px solid #E4EEF6' }}
        data-testid="listings-toolbar"
      >
        <div className="flex w-full flex-wrap items-center gap-2 lg:flex-nowrap">
          <div className="relative flex min-w-0 flex-1 items-center lg:max-w-[360px]">
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6E6E8A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 11, pointerEvents: 'none' }}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input
              type="text"
              enterKeyHint="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setAppliedQuery(queryInput.trim())
                if (e.key === 'Escape' && queryInput) { setQueryInput(''); setAppliedQuery('') }
              }}
              aria-label={zh ? '搜索地址或社区' : 'Search address or neighbourhood'}
              title={zh ? '例如 King West、Liberty Village' : 'e.g. King West, Liberty Village'}
              placeholder={zh ? '搜索地址 / 社区' : 'Search address / neighbourhood'}
              className={`h-9 w-full min-w-0 rounded-lg border border-[#9FBBD0] bg-white pl-[34px] text-[13.5px] outline-none focus:border-[#1B1B3C] ${queryInput ? 'pr-8' : 'pr-3'}`}
              data-testid="listings-search"
            />
            {queryInput && (
              <button
                type="button"
                onClick={() => { setQueryInput(''); setAppliedQuery('') }}
                aria-label={zh ? '清空搜索' : 'Clear search'}
                className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[15px] text-body-3 hover:bg-[#EEF5FA]"
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="h-9"
            style={{
              padding: '0 13px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
              border: '1px solid ' + (filtersOpen || activeChipCount ? '#171717' : '#9FBBD0'),
              background: filtersOpen ? '#171717' : '#fff',
              color: filtersOpen ? '#fff' : '#171717',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>
            {zh ? '筛选' : 'Filters'}
            {activeChipCount > 0 && (
              <span style={{ background: filtersOpen ? '#fff' : '#00ACE4', color: filtersOpen ? '#171717' : '#fff', borderRadius: 999, fontSize: 11, fontWeight: 800, padding: '1px 7px' }}>{activeChipCount}</span>
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {activeChipCount > 0 && !filtersOpen && (
            <button type="button" onClick={clearChips} style={{ fontSize: 12.5, fontWeight: 600, color: '#6E6E8A', whiteSpace: 'nowrap', flexShrink: 0, background: 'none', border: 0, cursor: 'pointer', padding: '0 2px' }}>
              {zh ? '清除' : 'Clear'}
            </button>
          )}

          {/* My favorites — local-only filter */}
          <button
            type="button"
            onClick={() => setFavOnly((v) => !v)}
            aria-pressed={favOnly}
            title={zh ? '只看收藏的房源' : 'Show saved homes only'}
            className="h-9"
            style={{
              padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0,
              border: favOnly ? '1px solid #171717' : '1px solid #9FBBD0',
              background: favOnly ? '#171717' : '#fff',
              color: favOnly ? '#fff' : '#171717',
            }}
          >
            <span aria-hidden style={{ color: favOnly ? '#FB7185' : '#A1A1AA', fontSize: 14, lineHeight: 1 }}>
              {favOnly ? '♥' : '♡'}
            </span>
            {/* phones: "♡ 3" — the word costs the search box its width */}
            <span className="max-sm:sr-only">{zh ? '收藏' : 'Saved'}</span>
            {favCount}
          </button>

          {/* Count + sort — the old results bar, now the right end of the same line */}
          <div className="flex basis-full items-center justify-between gap-3 lg:ml-auto lg:basis-auto lg:justify-end">
            <div className="whitespace-nowrap text-[14px]" style={{ color: '#3F3F46' }} aria-live="polite">
              {viewportIds && shown.length !== items.length && !favOnly && (zh ? '地图范围内 ' : '')}
              <b style={{ color: '#047857', fontSize: 15 }}>{count}</b>
              {zh ? ' 套' : (viewportIds && shown.length !== items.length && !favOnly ? ' in map area' : ' listings')}
              {count !== all.length && (
                <span style={{ color: '#6E6E8A' }} data-testid="listing-count-note">
                  {zh
                    ? ` · 共 ${all.length}${items.length !== all.length ? ' · 已筛选' : ''}`
                    : ` · ${all.length} total${items.length !== all.length ? ' · filtered' : ''}`}
                </span>
              )}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label={zh ? '排序' : 'Sort'}
              className="h-9 cursor-pointer rounded-lg border border-[#9FBBD0] bg-white px-2 text-[13px] font-semibold text-[#171717]"
              data-testid="listings-sort"
            >
              <option value="newest">{zh ? '最新发布' : 'Newest'}</option>
              <option value="price_asc">{zh ? '价格从低到高' : 'Price · low to high'}</option>
              <option value="price_desc">{zh ? '价格从高到低' : 'Price · high to low'}</option>
            </select>
          </div>
        </div>

        {filtersOpen && (
        <div className="relative mt-2.5 flex w-full flex-wrap items-center gap-2" data-testid="listings-filter-panel">
          {/* Preferences the AI Agent remembers (budget / beds / pets) → live filters. Was a long
              long "AI filters by my profile" button on the toolbar; it is a filter preset, so it lives here. */}
          <button
            type="button"
            onClick={applyProfileFilters}
            title={zh ? `用 ${aiName} 记得的预算、户型和宠物偏好来筛选` : `Filter by the budget, bedrooms and pets ${aiName} remembers`}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              background: 'rgba(0,172,228,0.08)', border: '1px solid rgba(0,172,228,0.40)', color: '#1B1B3C',
            }}
          >
            {zh ? '◐ 套用我的偏好' : '◐ Use my preferences'}
          </button>
          {/* Price */}
          <Chip label={priceLabel} on={priceMin != null || priceMax != null} open={openChip === 'price'} onToggle={() => setOpenChip(openChip === 'price' ? null : 'price')}>
            <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" inputMode="numeric" placeholder={zh ? '$ 最低' : '$ Min'} value={priceMin ?? ''}
                  onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setPriceMin(n ? Number(n) : null) }}
                  style={{ width: '50%', padding: '9px 10px', border: '1px solid #9FBBD0', borderRadius: 8, fontSize: 13.5 }} />
                <input type="text" inputMode="numeric" placeholder={zh ? '$ 最高' : '$ Max'} value={priceMax ?? ''}
                  onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setPriceMax(n ? Number(n) : null) }}
                  style={{ width: '50%', padding: '9px 10px', border: '1px solid #9FBBD0', borderRadius: 8, fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[[null, 2000], [2000, 3000], [3000, 4500], [4500, null]].map(([a, b], i) => {
                  const isOn = priceMin === a && priceMax === b
                  return (
                    <button key={i} onClick={() => { setPriceMin(a as number | null); setPriceMax(b as number | null) }}
                      style={{
                        padding: '7px 10px', border: isOn ? '1px solid #171717' : '1px solid #9FBBD0', borderRadius: 999,
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
                    border: minBeds === v ? '1px solid #171717' : '1px solid #9FBBD0',
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
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #9FBBD0', borderRadius: 8, fontSize: 13 }} />
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
              border: pets ? '1px solid #171717' : '1px solid #9FBBD0',
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
                        border: minBaths === v ? '1px solid #171717' : '1px solid #9FBBD0',
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
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #9FBBD0', borderRadius: 8, fontSize: 13 }} />
              </div>
            </div>
          </Chip>



          {anyFilter && (
            <button type="button" onClick={clearAll} style={{ fontSize: 12.5, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {zh ? '清除全部' : 'Clear all'}
            </button>
          )}
        </div>
        )}
        {filtersOpen && aiFilterNote && (
          <div className="mt-2 text-[12.5px]" style={{ color: '#1B1B3C' }}>
            ◐ {aiFilterNote}
          </div>
        )}
      </section>

      {/* Body: split view — cards | map. On very wide viewports the card
          pane gets more share and flows to 3 columns (Airbnb-style density). */}
      <section className="grid w-full grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(540px,1fr)_minmax(420px,1fr)] lg:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[minmax(760px,1.3fr)_minmax(420px,1fr)]" data-testid="listings-split">
        {/* Card grid — on lg+ it scrolls inside its own pane */}
        <div
          className="grid auto-rows-max grid-cols-1 px-5 py-[18px] sm:grid-cols-2 sm:px-6 lg:h-full lg:overflow-y-auto lg:overscroll-contain 2xl:grid-cols-3"
          data-testid="listings-cards"
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
          {shown.map((l) => (
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
        <div className="hidden lg:block lg:h-full lg:min-h-0">
          <ListingsMap
            listings={mapListings}
            active={active}
            onPick={setActive}
            onOpen={(id) => { setGroup(null); setPeek(id) }}
            onOpenGroup={(ids) => { setPeek(null); setGroup(ids) }}
            onViewport={onViewport}
            onToggleFull={() => { setPeek(null); setGroup(null); setMapOpen(true) }}
            fullLabel={zh ? '全屏' : 'Fullscreen'}
          >
            {group && group.length > 0 && (
              <MapGroupStrip items={items.filter((l) => group.includes(l.id))} zh={zh} onClose={() => setGroup(null)} />
            )}
            {!group && peek && items.find((l) => l.id === peek) && (
              <MapPeekCard l={items.find((l) => l.id === peek)!} zh={zh} onClose={() => setPeek(null)} />
            )}
          </ListingsMap>
        </div>
      </section>

      {/* Phone: floating "map" button → full-screen map mode */}
      {!mapOpen && items.some((l) => l.lat != null && l.lng != null) && (
        <button
          type="button"
          onClick={() => { setActive(null); setGroup(null); setMapOpen(true) }}
          className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold text-white shadow-lg md:bottom-6 lg:hidden"
          style={{ background: '#1B1B3C' }}
          aria-label={zh ? '打开地图' : 'Open map'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16M16 6v16"/></svg>
          {zh ? '地图' : 'Map'}
        </button>
      )}
      {mapOpen && (
        <div className="fixed inset-0 z-[60]" style={{ background: '#E5E3DC' }}>
          <ListingsMap
            mode="full"
            bottomInset={active ? 180 : 0}
            listings={mapListings}
            active={active}
            onPick={(id) => { setGroup(null); setActive(id) }}
            onOpenGroup={(ids) => { setActive(null); setGroup(ids) }}
          />
          {/* top bar */}
          <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMapOpen(false)}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13.5px] font-bold shadow-md"
              style={{ color: '#1B1B3C' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              <span className="lg:hidden">{zh ? '列表' : 'List'}</span>
              <span className="hidden lg:inline">{zh ? '退出全屏' : 'Exit fullscreen'}</span>
            </button>
            <span className="rounded-full bg-white px-3 py-2 font-mono text-[11px] font-bold shadow-md" style={{ color: '#1B1B3C' }}>
              {count} {zh ? '套' : 'listings'}
            </span>
          </div>
          {/* tapped cluster: every listing in it, scrollable sideways */}
          {group && group.length > 0 && (
            <MapGroupStrip items={items.filter((l) => group.includes(l.id))} zh={zh} onClose={() => setGroup(null)} />
          )}
          {/* peek card for the tapped tag */}
          {!group && active && items.find((l) => l.id === active) && (
            <MapPeekCard l={items.find((l) => l.id === active)!} zh={zh} onClose={() => setActive(null)} />
          )}
        </div>
      )}
    </div>
  )
}

/** Every listing of a tapped cluster, side by side; scrolls sideways when
 *  they do not fit. Same card body as the single-tag peek. */
function MapGroupStrip({ items, zh, onClose }: { items: DBListing[]; zh: boolean; onClose: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10">
      <div className="flex items-center justify-between px-3 pb-1.5">
        <span className="rounded-full bg-white px-3 py-1 font-mono text-[11px] font-bold shadow-md" style={{ color: '#1B1B3C' }}>
          {items.length} {zh ? '套 · 左右滑动' : 'listings · swipe'}
        </span>
        <button type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-4" style={{ scrollbarWidth: 'thin' }}>
        {items.map((l) => (
          <div key={l.id} className="w-[min(88vw,360px)] flex-none snap-start">
            <PeekBody l={l} zh={zh} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Compact card shown over the map for the tapped price tag. */
function MapPeekCard({ l, zh, onClose }: { l: DBListing; zh: boolean; onClose: () => void }) {
  return (
    <div className="absolute inset-x-3 bottom-4 z-10 lg:inset-x-auto lg:bottom-5 lg:left-5 lg:w-[400px]">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label={zh ? '关闭' : 'Close'}
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <PeekBody l={l} zh={zh} />
      </div>
    </div>
  )
}

function PeekBody({ l, zh }: { l: DBListing; zh: boolean }) {
  const img = l.images && l.images.length > 0 ? l.images[0] : null
  const a = l.thumb_a || '#D4C4A8'
  const b = l.thumb_b || '#94815C'
  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-white shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
        <Link href={`/listings/${l.slug}`} className="flex gap-3 p-3">
          <div
            className="h-[104px] w-[124px] flex-none rounded-xl"
            style={{ background: img ? `url(${img}) center/cover no-repeat, linear-gradient(135deg,${a},${b})` : `linear-gradient(135deg,${a},${b})` }}
          />
          <div className="min-w-0 flex-1 py-0.5">
            <div className="text-[20px] font-extrabold leading-none tracking-tight" style={{ color: '#1B1B3C' }}>
              ${l.monthly_rent.toLocaleString()}<span className="ml-1 text-[12px] font-medium text-body-3">{zh ? '/月' : '/mo'}</span>
            </div>
            <div className="mt-1.5 text-[12.5px] font-semibold text-body-2">
              {l.bedrooms}B{l.has_den ? '+1' : ''} · {l.bathrooms ?? '–'} {zh ? '浴' : 'ba'}{l.sqft ? ` · ${l.sqft} sqft` : ''}
            </div>
            <div className="mt-1.5 truncate text-[13.5px] font-bold" style={{ color: '#1B1B3C' }}>{l.address}{l.unit && !l.address.includes(l.unit) ? ` · ${l.unit}` : ''}</div>
            <div className="truncate text-[12px] text-body-3">{[l.neighborhood, l.city].filter(Boolean).join(' · ')}</div>
            <div className="mt-1.5 text-[12px] font-bold" style={{ color: '#00ACE4' }}>{zh ? '查看详情 →' : 'View details →'}</div>
          </div>
        </Link>
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
          border: on ? '1px solid #171717' : '1px solid #9FBBD0',
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
            border: '1px solid #E4EEF6',
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
  // Nothing writes trust_tier today — the stamp pill shows only when a row carries one.
  const tierClass = (l.trust_tier ?? 0) >= 3 ? 't3' : 't2'
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
          <span style={{ width: 3, height: 3, background: '#9FBBD0', borderRadius: '50%' }} />
          <b style={{ color: '#171717' }}>{l.bathrooms} {zh ? '浴' : 'ba'}</b>
          {l.sqft && (
            <>
              <span style={{ width: 3, height: 3, background: '#9FBBD0', borderRadius: '50%' }} />
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
            {l.trust_tier != null && (
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
                {zh ? `需 ${stampForTier(l.trust_tier).zh}` : `${stampForTier(l.trust_tier).en} required`}
              </span>
            )}
          </div>
        )}
      </div>
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
              <span style={{ width: 3, height: 3, background: '#9FBBD0', borderRadius: '50%' }} />
              <b style={{ color: '#171717' }}>{f.baths} {zh ? '浴' : 'ba'}</b>
            </>
          )}
          {f.sqft != null && (
            <>
              <span style={{ width: 3, height: 3, background: '#9FBBD0', borderRadius: '50%' }} />
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

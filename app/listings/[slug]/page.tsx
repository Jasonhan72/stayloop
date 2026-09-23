'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { PromoBadge, VerificationBadge } from '@/components/ListingBadges'
import { AgentPicker } from '@/components/AgentPicker'
import { ShowingRequestModal, type ShowingKind } from '@/components/ShowingRequestModal'
import { supabase } from '@/lib/supabase'
import { useT, type Lang } from '@/lib/i18n'
import { LISTING_VISIBILITY_OR } from '@/lib/listingVisibility'
import { stampForTier } from '@/lib/passportStamps'
import { favKey, useFavorites, type FavListing } from '@/lib/favorites'

/**
 * V5 ART · Listing Detail (L2)
 *
 * Layout (spec):
 *   - Hero photo gallery (1 lead + 4 small thumbs grid)
 *   - Main column: title block + stat strip + 5 sections
 *       1. 关于这套房源
 *       2. 生活配套
 *       3. 建筑信息（building / year / unit count）
 *       4. Walk Score / Transit / Bike
 *       5. Trust Tier 要求
 *   - Right aside (sticky):
 *       1. Submit-intent CTA card
 *       2. Landlord / agent contact card
 *       3. Similar listings (3 mini cards)
 *
 * Data: Supabase `listings` (V5 schema).
 */

interface DBListing {
  id: string
  /** landlords.id or (all current rows) the landlord's auth id — see lib/listingPublish.ts */
  landlord_id: string | null
  slug: string
  address: string
  unit: string | null
  city: string
  province: string
  postal_code: string | null
  monthly_rent: number
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  parking: string | null
  pet_policy: string | null
  amenities: string[] | null
  utilities_included: string[] | null
  description: string | null
  title: string | null
  neighborhood: string | null
  trust_tier: number | null
  has_den: boolean | null
  match_score: number | null
  thumb_a: string | null
  thumb_b: string | null
  luna_note: string | null
  badge: string | null
  photo_count: number | null
  year_built: number | null
  available_date: string | null
  broker_name: string | null
  brokerage: string | null
  is_active: boolean
  created_at: string
  images: string[] | null
  // Realtor.ca / CREA DDF-aligned fields
  property_type: string | null
  ownership_title: string | null
  bedrooms_above_grade: number | null
  bedrooms_below_grade: number | null
  bathrooms_half: number | null
  sqft_max: number | null
  storeys: number | null
  land_size: string | null
  heating_type: string | null
  heating_fuel: string | null
  cooling: string | null
  basement_type: string | null
  exterior_finish: string | null
  appliances: string[] | null
  building_features: string[] | null
  pets_allowed: string | null
  parking_spaces: number | null
  maintenance_fee: number | null
  management_company: string | null
  cross_streets: string | null
  furnished: boolean | null
  deposit: number | null
  lease_term: string | null
  smoking_policy: string | null
  virtual_tour_url: string | null
  mls_number: string | null
  source: string | null
  verification_status: string | null
}

const tierLabel: Record<number, { name: { zh: string; en: string }; reqs: { zh: string; en: string }[] }> = {
  1: {
    name: { zh: '需 身份章', en: 'Identity stamp required' },
    reqs: [{ zh: 'ID 验证', en: 'ID verification' }],
  },
  2: {
    name: { zh: '需 收入章', en: 'Income stamp required' },
    reqs: [
      { zh: 'ID 验证', en: 'ID verification' },
    ],
  },
  3: {
    name: { zh: '需 银行章', en: 'Bank stamp required' },
    reqs: [
      { zh: 'ID 验证', en: 'ID verification' },
      { zh: '银行透明度 90 天', en: '90-day bank transparency' },
      { zh: '现住址确认', en: 'Current address confirmed' },
    ],
  },
  4: {
    name: { zh: '需 信用 + 法庭章', en: 'Credit + court stamp required' },
    reqs: [
      { zh: 'ID 验证', en: 'ID verification' },
      { zh: '银行透明度 90 天', en: '90-day bank transparency' },
    ],
  },
}

// Same identity inputs + snapshot shape as the /listings browse cards and the
// agent-chat listing cards (lib/favorites.ts), so a favorite saved here reads
// as favorited on every other surface.
const favSnapshot = (l: DBListing): Omit<FavListing, 'savedAt'> => ({
  key: favKey({ source: l.source, id: l.id, url: `/listings/${l.slug}`, address: l.address }),
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

const UTILITY_ZH: Record<string, string> = { hydro: '电', water: '水', heat: '暖气', gas: '燃气', internet: '网络', cable: '有线电视' }

export default function ListingDetailPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const [listing, setListing] = useState<DBListing | null>(null)
  const [similar, setSimilar] = useState<DBListing[]>([])
  const [loading, setLoading] = useState(true)
  const [fieldAgentOpen, setFieldAgentOpen] = useState(false)
  // Showing request / question to the landlord → /api/showing-intent →
  // one card on the landlord's agent (2026-09-22). Realtor.ca imports have
  // no Stayloop landlord, so those keep the brokerage contact only.
  const [intentKind, setIntentKind] = useState<ShowingKind | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIdx, setGalleryIdx] = useState(0)
  const { isFav, toggle } = useFavorites()
  const [copied, setCopied] = useState(false)
  // Cross-hat rules (design/multi-role-accounts-2026-09.md §3): the viewer
  // cannot apply to, request a showing of, or pick an agent for their own
  // listing; a listing whose landlord is a verified RECO registrant is
  // labelled as such (TRESA s.32 — the landlord discloses, we label).
  const auth = useAuth()
  const [ownIds, setOwnIds] = useState<string[]>([])
  const [landlordIsRegistrant, setLandlordIsRegistrant] = useState(false)
  const [landlordAuthId, setLandlordAuthId] = useState<string | null>(null)
  useEffect(() => {
    if (auth.loading || !auth.user) { setOwnIds([]); return }
    const uid = auth.user.id
    supabase.from('landlords').select('id').or(`id.eq.${uid},auth_id.eq.${uid}`)
      .then(({ data }) => setOwnIds([uid, ...((data || []) as { id: string }[]).map(r => r.id)]))
  }, [auth.loading, auth.user])
  useEffect(() => {
    if (!listing?.landlord_id) { setLandlordIsRegistrant(false); setLandlordAuthId(null); return }
    // listings.landlord_id is landlords.id for every row published through
    // claim_landlord (review 2026-09-14) — resolve the auth id through the
    // public directory view, which carries both.
    ;(async () => {
      const { data } = await supabase.from('agent_directory').select('auth_id').or(`auth_id.eq.${listing.landlord_id},landlord_id.eq.${listing.landlord_id}`).maybeSingle()
      setLandlordIsRegistrant(!!data)
      setLandlordAuthId((data as { auth_id?: string } | null)?.auth_id ?? null)
    })()
  }, [listing?.landlord_id])
  const isOwnListing = !!listing?.landlord_id && ownIds.includes(listing.landlord_id)

  const onShare = useCallback(async () => {
    const url = window.location.href
    const title = listing
      ? `${listing.address}${listing.unit ? `, Unit ${listing.unit}` : ''} · $${listing.monthly_rent.toLocaleString()}/mo · Stayloop`
      : 'Stayloop'
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
      } catch {
        // User dismissed the native share sheet — nothing else to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (permissions / insecure context) — no-op.
    }
  }, [listing])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        // No app-layer visibility filter here: RLS already returns this row
        // only to the public when verified/realtor, and to the owning landlord
        // for their own (possibly pending) listing preview. Filtering here would
        // break the owner's own-listing preview.
        .from('listings')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()
      if (cancelled) return
      setListing((data || null) as DBListing | null)
      setLoading(false)

      if (data) {
        const { data: rest } = await supabase
          .from('listings')
          .select('*')
          .eq('is_active', true)
          .or(LISTING_VISIBILITY_OR)
          .neq('id', (data as any).id)
          .limit(3)
        if (!cancelled) setSimilar((rest || []) as DBListing[])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <>
        <Header />
        <main className="bg-surface">
          <div className="mx-auto max-w-[1320px] px-6 py-32 text-center font-mono text-[12px] text-body-3">
            {zh ? '加载房源信息中…' : 'Loading listing…'}
          </div>
        </main>
        <Footer />
      </>
    )
  }

  if (!listing) {
    return (
      <>
        <Header />
        <main className="bg-surface">
          <div className="mx-auto max-w-[1320px] px-6 py-32 text-center">
            <h1 className="text-[28px] font-bold tracking-tight">{zh ? '房源未找到' : 'Listing not found'}</h1>
            <p className="mt-3 text-[14px] text-body-2">{zh ? '这套房源可能已下架。' : 'This listing may have been taken down.'}</p>
            <Link href="/listings" className="sl-btn-primary mt-6 inline-flex !px-6 !py-[12px]">
              {zh ? '返回房源列表 →' : 'Back to listings →'}
            </Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  const a = listing.thumb_a || '#D4C4A8'
  const b = listing.thumb_b || '#94815C'
  // Nothing writes listings.trust_tier today, so the stamp badge and the
  // "criteria" section render only when a row actually carries a value.
  const tier = listing.trust_tier != null && tierLabel[listing.trust_tier] ? (listing.trust_tier as 1 | 2 | 3 | 4) : null
  const tierInfo = tier != null ? tierLabel[tier] : null
  const snap = favSnapshot(listing)
  const fav = isFav(snap.key)

  return (
    <>
      <Header />
      <main className="bg-surface">
        {/* Breadcrumb + back */}
        <div className="mx-auto max-w-[1320px] px-6 pt-5 sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/listings"
              className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3 transition hover:text-brand"
            >
              {zh ? '← 返回房源列表 / LISTINGS' : '← Back to listings / LISTINGS'}
            </Link>
          {/* Share + Save — Airbnb-style light actions, top-right of the title row */}
          <div className="relative flex shrink-0 items-center gap-1 pt-2">
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[14px] font-semibold text-body-2 transition hover:bg-surface-2 hover:text-body hover:underline underline-offset-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V3" />
                <path d="M8 7l4-4 4 4" />
                <path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
              </svg>
              {zh ? '分享' : 'Share'}
            </button>
            <button
              type="button"
              aria-pressed={fav}
              onClick={() => toggle(snap)}
              className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[14px] font-semibold text-body-2 transition hover:bg-surface-2 hover:text-body hover:underline underline-offset-2"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={fav ? '#FB7185' : 'none'}
                stroke={fav ? '#FB7185' : 'currentColor'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {fav ? (zh ? '取消收藏' : 'Saved') : (zh ? '收藏' : 'Save')}
            </button>
            {copied && (
              <span className="absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-[8px] bg-ink px-3 py-1.5 text-[12px] font-medium text-white shadow-lg">
                {zh ? '链接已复制' : 'Link copied'}
              </span>
            )}
          </div>
          </div>
        </div>

        {/* Photo gallery — 1 lead + 4 thumbs */}
        <section className="mx-auto mt-3 max-w-[1320px] px-6 sm:px-8 lg:px-12">
          {(() => {
            const imgs = listing.images || []
            const lead = imgs[0]
            const thumbs = [imgs[1], imgs[2], imgs[3], imgs[4]]
            return (
              <div
                className="grid grid-cols-2 gap-2 overflow-hidden rounded-[16px] sm:[grid-template-columns:1.5fr_1fr_1fr] sm:[grid-template-rows:210px_210px]"
                style={{ gridAutoRows: '140px' }}
              >
                <div
                  className="relative col-span-2 cursor-pointer sm:col-span-1 sm:row-span-2"
                  style={{
                    background: lead
                      ? `url(${lead}) center/cover no-repeat, linear-gradient(135deg,${a},${b})`
                      : `linear-gradient(135deg,${a},${b})`,
                  }}
                  onClick={() => { if (imgs.length) { setGalleryIdx(0); setGalleryOpen(true) } }}
                >
                  {!lead && <div className="absolute inset-0 bg-black/10" />}
                  <PromoBadge badge={listing.badge} variant="hero" />
                  <div className="absolute bottom-4 left-4 rounded-md bg-black/55 px-2.5 py-1 font-mono text-[11px] text-white">
                    1 / {listing.photo_count || imgs.length || 1}
                  </div>
                </div>
                {thumbs.map((url, i) => (
                  <div
                    key={i}
                    className="relative cursor-pointer"
                    style={{
                      background: url
                        ? `url(${url}) center/cover no-repeat, linear-gradient(${135 + i * 22}deg,${a},${b})`
                        : `linear-gradient(${135 + i * 22}deg,${a},${b})`,
                    }}
                    onClick={() => { if (imgs.length) { setGalleryIdx(i + 1); setGalleryOpen(true) } }}
                  >
                    {i === 3 && (
                      <button
                        type="button"
                        className="absolute inset-0 flex items-center justify-center bg-black/35 font-mono text-[12px] font-semibold text-white"
                        onClick={(e) => { e.stopPropagation(); setGalleryIdx(0); setGalleryOpen(true) }}
                      >
                        {zh ? `+ 看全部 ${listing.photo_count || imgs.length || 24} 张 →` : `+ View all ${listing.photo_count || imgs.length || 24} →`}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
            <span>📷 {listing.photo_count || 24} {zh ? '张照片' : 'photos'}</span>
            <span>·</span>
            <span>{zh ? 'VR 看房' : 'VR tour'}</span>
            <span>·</span>
            <span>{zh ? '平面图' : 'Floor plan'}</span>
          </div>
        </section>

        {/* Two-column body */}
        <section
          className="mx-auto mt-8 grid max-w-[1320px] gap-10 px-6 pb-24 sm:px-8 lg:grid-cols-[1.6fr_1fr] lg:px-12"
        >
          {/* Main column */}
          <div className="min-w-0">
            {/* Title block */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {tier != null && tierInfo && <span className={`tier-badge t${tier}`}>{tierInfo.name[lang]}</span>}
                {listing.match_score && listing.match_score >= 85 && (
                  <span
                    className="font-mono"
                    style={{
                      background: 'linear-gradient(135deg,rgba(0,172,228,0.10),rgba(37,99,235,0.10))',
                      color: '#5B21B6',
                      border: '1px solid rgba(0,172,228,0.40)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {zh ? `AI · ${listing.match_score}% 匹配` : `AI · ${listing.match_score}% match`}
                  </span>
                )}
                <VerificationBadge listing={listing} variant="detail" zh={zh} />
              </div>

              <div className="mt-3">
                <h1 className="text-[36px] font-extrabold tracking-tight sm:text-[44px]">
                  ${listing.monthly_rent.toLocaleString()}
                  <span className="ml-2 text-[18px] font-medium text-body-3">{zh ? '/ 月' : '/ month'}</span>
                </h1>
              </div>
              <div className="mt-2 text-[15px] text-body-2">
                {listing.address}
                {listing.unit && `, Unit ${listing.unit}`} · {listing.neighborhood ?? ''}
                {listing.neighborhood && ' · '}
                {listing.city}, {listing.province}
              </div>

              {/* Stat strip */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label={zh ? '卧室' : 'Bedrooms'}
                  value={
                    listing.bedrooms === 0
                      ? 'Studio'
                      : listing.bedrooms_below_grade
                        ? `${listing.bedrooms_above_grade ?? listing.bedrooms} + ${listing.bedrooms_below_grade}`
                        : `${listing.bedrooms}${listing.has_den ? ' + den' : ''}`
                  }
                />
                <Stat
                  label={zh ? '卫生间' : 'Bathrooms'}
                  value={
                    listing.bathrooms != null
                      ? `${listing.bathrooms}${listing.bathrooms_half ? ` + ${listing.bathrooms_half} ${zh ? '半卫' : 'half'}` : ''}`
                      : '—'
                  }
                />
                <Stat
                  label={zh ? '面积' : 'Area'}
                  value={
                    listing.sqft
                      ? listing.sqft_max
                        ? `${listing.sqft}–${listing.sqft_max} ft²`
                        : `${listing.sqft} ft²`
                      : (zh ? '未提供' : 'Not provided')
                  }
                />
                <Stat
                  label={zh ? '车位' : 'Parking'}
                  value={
                    listing.parking_spaces
                      ? `${listing.parking_spaces}${zh ? ' 个' : ''}`
                      : listing.parking ? (zh ? '有' : 'Yes') : (zh ? '无' : 'No')
                  }
                />
              </div>
            </div>

            {/* Section 1 — 关于这套房源 */}
            <Section title={zh ? '关于这套房源' : 'About this listing'} eyebrow="ABOUT">
              <p className="text-[14.5px] leading-relaxed text-body-2">
                {listing.description ||
                  (zh
                    ? `${listing.neighborhood ?? listing.city} 的整套${
                        listing.bedrooms === 0
                          ? 'Studio'
                          : `${listing.bedrooms} 室${listing.bathrooms ?? ''} 卫`
                      }房源。${listing.year_built ? `${listing.year_built} 年建。` : ''}`
                    : `A full ${
                        listing.bedrooms === 0
                          ? 'studio'
                          : `${listing.bedrooms}-bed ${listing.bathrooms ?? ''}-bath`
                      } unit in ${listing.neighborhood ?? listing.city}.${
                        listing.year_built ? ` Built ${listing.year_built}.` : ''
                      }`)}
              </p>
              {listing.utilities_included && listing.utilities_included.length > 0 && (
                <div className="mt-4 inline-flex flex-wrap gap-2">
                  {listing.utilities_included.map((u) => (
                    <span key={u} className="sl-chip fit">
                      {zh ? `${UTILITY_ZH[u.toLowerCase()] ?? u} 包在租金内` : `${u} included`}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {/* Section 2 — 生活配套 */}
            {(() => {
              const petLabel =
                listing.pets_allowed === 'yes' ? (zh ? '允许宠物' : 'Pets allowed')
                : listing.pets_allowed === 'restricted' ? (zh ? '宠物有限制' : 'Pets with restrictions')
                : listing.pets_allowed === 'no' ? (zh ? '不允许宠物' : 'No pets')
                : null
              const items: { label: string; ok: boolean }[] = [
                ...(listing.amenities || []).map((a) => ({ label: a, ok: true })),
                ...(listing.building_features || []).map((a) => ({ label: a, ok: true })),
                ...(listing.appliances || []).map((a) => ({
                  label: zh ? `电器: ${a}` : `Appliance: ${a}`,
                  ok: true,
                })),
                ...(listing.furnished != null
                  ? [{ label: listing.furnished ? (zh ? '带家具' : 'Furnished') : (zh ? '不带家具' : 'Unfurnished'), ok: true }]
                  : []),
                ...(listing.parking
                  ? [{ label: zh ? `停车: ${listing.parking}` : `Parking: ${listing.parking}`, ok: true }]
                  : []),
                ...(listing.smoking_policy
                  ? [{
                      label: listing.smoking_policy === 'no' ? (zh ? '禁止吸烟' : 'No smoking')
                        : listing.smoking_policy === 'outdoor_only' ? (zh ? '仅限室外吸烟' : 'Smoking outdoors only')
                        : (zh ? '允许吸烟' : 'Smoking allowed'),
                      ok: true,
                    }]
                  : []),
                ...(listing.lease_term
                  ? [{ label: zh ? `租期: ${listing.lease_term}` : `Lease term: ${listing.lease_term}`, ok: true }]
                  : []),
                ...(petLabel
                  ? [{ label: petLabel, ok: listing.pets_allowed !== 'no' }]
                  : listing.pet_policy
                    ? [{
                        label: zh ? `宠物: ${listing.pet_policy}` : `Pets: ${listing.pet_policy}`,
                        ok: listing.pet_policy !== 'no-pets',
                      }]
                    : []),
              ]
              return items.length > 0 ? (
                <Section title={zh ? '生活配套' : 'Amenities'} eyebrow="AMENITIES">
                  <ul className="grid grid-cols-1 gap-y-2 text-[14px] text-body-2 sm:grid-cols-2">
                    {items.map((item) => (
                      <Li key={item.label} ok={item.ok}>{item.label}</Li>
                    ))}
                  </ul>
                </Section>
              ) : null
            })()}

            {/* 入住前费用一览 — Ontario fixes the legal move-in charges (RTA s.105–106),
                so this is a deterministic card from rent + deposit, no new columns
                (2026-09-22, EliseAI benchmark item E). */}
            <MoveInCosts zh={zh} rent={listing.monthly_rent} deposit={listing.deposit} />

            {/* Section 3 — 建筑信息 */}
            <Section title={zh ? '建筑信息' : 'Building'} eyebrow="BUILDING">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-4">
                {listing.property_type && (
                  <BuildingFact
                    label={zh ? '物业类型' : 'Building type'}
                    value={
                      { apartment: zh ? '出租公寓' : 'Apartment', condo: 'Condo', house: zh ? '独立屋' : 'House', townhouse: zh ? '联排' : 'Townhouse', basement: zh ? '地下室' : 'Basement', duplex: 'Duplex' }[listing.property_type] || listing.property_type
                    }
                  />
                )}
                {listing.ownership_title && (
                  <BuildingFact label={zh ? '产权' : 'Title'} value={listing.ownership_title === 'condominium' ? (zh ? '共管产权 (Condominium)' : 'Condominium/Strata') : (zh ? '永久产权 (Freehold)' : 'Freehold')} />
                )}
                {listing.year_built && (
                  <BuildingFact label={zh ? '建造年份' : 'Year built'} value={listing.year_built} />
                )}
                {listing.storeys && <BuildingFact label={zh ? '层数' : 'Storeys'} value={listing.storeys} />}
                {listing.heating_type && (
                  <BuildingFact
                    label={zh ? '供暖' : 'Heating'}
                    value={listing.heating_fuel ? `${listing.heating_type} (${listing.heating_fuel})` : listing.heating_type}
                  />
                )}
                {listing.cooling && <BuildingFact label={zh ? '制冷' : 'Cooling'} value={listing.cooling} />}
                {listing.basement_type && <BuildingFact label={zh ? '地下室' : 'Basement'} value={listing.basement_type} />}
                {listing.exterior_finish && <BuildingFact label={zh ? '外墙' : 'Exterior'} value={listing.exterior_finish} />}
                {listing.land_size && <BuildingFact label={zh ? '占地' : 'Land size'} value={listing.land_size} />}
                {listing.maintenance_fee != null && (
                  <BuildingFact label={zh ? '物业费' : 'Maintenance fee'} value={`$${listing.maintenance_fee}/${zh ? '月' : 'mo'}`} />
                )}
                {listing.management_company && (
                  <BuildingFact label={zh ? '物业公司' : 'Management'} value={listing.management_company} />
                )}
                {listing.cross_streets && (
                  <BuildingFact label={zh ? '十字路口' : 'Cross streets'} value={listing.cross_streets} />
                )}
                {listing.deposit != null && (
                  <BuildingFact label={zh ? '押金' : 'Deposit'} value={`$${listing.deposit.toLocaleString()}`} />
                )}
                {listing.lease_term && <BuildingFact label={zh ? '租期' : 'Lease term'} value={listing.lease_term} />}
                {listing.mls_number && <BuildingFact label="MLS®" value={listing.mls_number} />}
                <BuildingFact
                  label={zh ? '入住' : 'Available'}
                  value={listing.available_date ? listing.available_date.slice(0, 10) : (zh ? '即可' : 'Now')}
                />
                {listing.brokerage && (
                  <BuildingFact label={zh ? '挂牌机构' : 'Brokerage'} value={listing.brokerage} />
                )}
                <BuildingFact
                  label={zh ? '邮编' : 'Postal code'}
                  value={listing.postal_code || `${listing.city.slice(0, 3).toUpperCase()} ···`}
                />
              </div>
              {listing.virtual_tour_url && /^https?:\/\//i.test(listing.virtual_tour_url) && (
                <a
                  href={listing.virtual_tour_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block text-[13.5px] font-semibold text-purple-700 underline underline-offset-2"
                >
                  {zh ? '虚拟看房 / VR Tour →' : 'Virtual tour →'}
                </a>
              )}
            </Section>

            {/* Section 4 — Walk Score — only show when real data exists */}

            {/* Section 5 — 房客信用门槛 · 房东设置 */}
            {tier != null && tierInfo && (
            <Section title={zh ? '房客信用门槛 · 房东设置' : 'Tenant criteria · set by landlord'} eyebrow="LANDLORD CRITERIA">
              <div className="rounded-[12px] border border-line-divider bg-white p-5">
                <div className="text-[14px] font-semibold">
                  {zh
                    ? `${listing.broker_name || '房东'} 接受已盖「${stampForTier(tier).zh}」的申请人`
                    : `${listing.broker_name || 'Landlord'} accepts applicants with the ${stampForTier(tier).en.toLowerCase()}`}
                </div>
                <p className="mt-1 text-[12.5px] text-body-2">
                  {zh ? (
                    <>
                      房东设定:此房源 <b className="text-body">需 {stampForTier(tier).zh}</b>。以下是这枚章对应的核验项，是否录取由房东本人决定：
                    </>
                  ) : (
                    <>
                      Set by landlord: this listing asks for the <b className="text-body">{stampForTier(tier).en.toLowerCase()}</b>. These are the checks behind that stamp; the landlord makes the decision:
                    </>
                  )}
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {tierInfo.reqs.map((req) => (
                    <li
                      key={req.en}
                      className="flex items-center gap-2 text-[13px] text-body-2"
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                        style={{ background: 'rgba(4,120,87,0.12)', color: '#047857' }}
                      >
                        ✓
                      </span>
                      {req[lang]}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href="/onboarding/tier1"
                    className="sl-btn-primary !px-5 !py-[10px] !text-[13px]"
                  >
                    {zh ? '去盖章 →' : 'Earn the stamp →'}
                  </Link>
                  <Link
                    href="/pricing"
                    className="text-[13px] font-semibold text-brand transition hover:underline"
                  >
                    {zh ? '了解 盖章体系' : 'Learn about stamps'}
                  </Link>
                </div>
              </div>
            </Section>
            )}
          </div>

          {/* Right aside */}
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
            {/* Submit intent */}
            <div className="sl-card p-6">
              <span className="sl-eyebrow">SUBMIT INTENT</span>
              <h3 className="mt-2 text-[20px] font-bold tracking-tight">{zh ? '想看这套？' : 'Want to see it?'}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-body-2">
                {zh
                  ? '从 Stayloop 认证（RECO 注册已核）的经纪中自选一位帮你约看，或直接提交完整申请。Stayloop 不派单、不参与交易、不收费。'
                  : 'Pick a Stayloop-verified (RECO-checked) agent to arrange a viewing, or submit a full application directly. Stayloop does not dispatch agents, takes no part in the trade and charges nothing.'}
              </p>
              {isOwnListing ? (
                <div className="mt-4 rounded-[10px] border border-line-divider bg-surface-chip px-4 py-3 text-[12.5px] leading-relaxed text-body-2">
                  {zh ? '这是你自己发布的房源：不能向自己的房源提交看房意向或申请。' : 'This is your own listing: you cannot request a showing of or apply to your own unit.'}{' '}
                  <Link href="/dashboard" className="font-semibold underline">{zh ? '去房东工作台' : 'Open the landlord workspace'}</Link>
                </div>
              ) : (<>
              {/* The tenant chooses a RECO-verified agent from Stayloop's
                  directory and contacts them directly. Stayloop does not
                  dispatch, is not a brokerage and charges nothing (decision
                  2026-09-13; design/roles-and-agent-verification-2026-09.md). */}
              {listing.source !== 'realtor' ? (
                <button
                  onClick={() => setIntentKind('showing')}
                  className="sl-btn-primary mt-4 w-full !py-[12px]"
                >
                  {zh ? '预约看房' : 'Request a viewing'}
                </button>
              ) : (
                <button
                  onClick={() => setFieldAgentOpen(true)}
                  className="sl-btn-primary mt-4 w-full !py-[12px]"
                >
                  {zh ? '找认证经纪约看房' : 'Find a verified agent for a viewing'}
                </button>
              )}
              <Link
                href={`/apply/${listing.slug}`}
                className="mt-3 block rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-center text-[13.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                {zh ? '直接提交完整申请 →' : 'Submit a full application →'}
              </Link>
              {listing.source !== 'realtor' ? (
                <button
                  onClick={() => setIntentKind('question')}
                  className="mt-2 block w-full rounded-[10px] border border-tenant/30 bg-tenant/5 px-4 py-[10px] text-center text-[13.5px] font-semibold text-tenant transition hover:bg-tenant/10"
                >
                  {zh ? '向房东提问' : 'Ask the landlord'}
                </button>
              ) : (
                <button
                  onClick={() => setFieldAgentOpen(true)}
                  className="mt-2 block w-full rounded-[10px] border border-tenant/30 bg-tenant/5 px-4 py-[10px] text-center text-[13.5px] font-semibold text-tenant transition hover:bg-tenant/10"
                >
                  {zh ? '找认证经纪帮我问' : 'Ask through a verified agent'}
                </button>
              )}
              <div className="mt-2 text-center text-[11px] leading-relaxed text-body-3">
                {listing.source !== 'realtor'
                  ? (zh
                      ? <>请求会进入房东助手的待办；房东批准后你会收到带联系方式的邮件。也可以<button type="button" onClick={() => setFieldAgentOpen(true)} className="underline">找认证经纪</button>陪同看房。Stayloop 不参与交易、不收费。</>
                      : <>Your request lands in the landlord&apos;s agent inbox; once approved you get an email with their contact. You can also <button type="button" onClick={() => setFieldAgentOpen(true)} className="underline">bring a verified agent</button>. Stayloop takes no part in the trade and charges nothing.</>)
                  : (zh
                      ? '从 Stayloop 认证（RECO 注册已核）的经纪中自选并直接联系；Stayloop 不参与交易、不收费。'
                      : 'Pick a Stayloop-verified (RECO-checked) agent and contact them directly; Stayloop takes no part in the trade and charges nothing.')}
              </div>
              </>)}
            </div>

            {/* Landlord / agent card */}
            <div className="sl-card p-5">
              <span className="sl-eyebrow">{zh ? '联系人' : 'Contact'}</span>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className="orb"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background:
                      'linear-gradient(135deg,rgba(0,172,228,0.20),rgba(37,99,235,0.25))',
                    border: '1px solid rgba(0,172,228,0.30)',
                  }}
                />
                <div>
                  <div className="text-[14px] font-bold">
                    {listing.broker_name || 'AI Agent'}
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                    {listing.brokerage
                      ? (zh ? `${listing.brokerage} · 经纪` : `${listing.brokerage} · Agent`)
                      : landlordIsRegistrant
                        ? (zh ? '房东直租 · 房东为持牌经纪' : 'Direct from landlord · landlord is a registered agent')
                        : (zh ? '房东直租' : 'Direct from landlord')}
                  </div>

                </div>
              </div>
              <Link
                href={`/tenant/agent?prompt=${encodeURIComponent(zh ? `我想咨询 ${listing.address} 这个房源，帮我联系${listing.broker_name ? `经纪 ${listing.broker_name}` : '房东'}` : `I'd like to ask about the listing at ${listing.address} — connect me with ${listing.broker_name ? `agent ${listing.broker_name}` : 'the landlord'}`)}&send=1`}
                className="mt-4 block w-full rounded-[10px] border border-line-strong bg-white py-[10px] text-center text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                {zh ? '和 AI Agent 对话' : 'Chat with AI Agent'}
              </Link>
            </div>

            {/* Similar listings */}
            {similar.length > 0 && (
              <div className="sl-card p-5">
                <span className="sl-eyebrow">{zh ? '类似房源' : 'Similar listings'}</span>
                <div className="mt-3 space-y-3">
                  {similar.map((s) => (
                    <Link
                      key={s.id}
                      href={`/listings/${s.slug}`}
                      className="flex items-center gap-3 rounded-[10px] border border-transparent p-1 transition hover:border-line-divider hover:bg-surface"
                    >
                      <span
                        style={{
                          width: 64,
                          height: 48,
                          borderRadius: 6,
                          background:
                            s.images && s.images.length > 0
                              ? `url(${s.images[0]}) center/cover no-repeat`
                              : `linear-gradient(135deg,${s.thumb_a || '#D4C4A8'},${
                                  s.thumb_b || '#94815C'
                                })`,
                          flexShrink: 0,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold">
                          ${s.monthly_rent.toLocaleString()}
                          <span className="ml-1 text-[11px] font-medium text-body-3">
                            {zh ? '/月' : '/mo'}
                          </span>
                        </div>
                        <div className="truncate text-[11.5px] text-body-2">
                          {s.bedrooms === 0 ? 'Studio' : `${s.bedrooms}B`} · {s.neighborhood}
                        </div>
                        {s.trust_tier != null && (
                          <div className="font-mono text-[9.5px] uppercase tracking-eyebrowLg text-body-3">
                            {zh ? `需 ${stampForTier(s.trust_tier).zh}` : `${stampForTier(s.trust_tier).en} required`}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </section>

        {intentKind && (
          <ShowingRequestModal
            zh={zh}
            kind={intentKind}
            listingId={listing.id}
            listingAddress={`${listing.address}${listing.unit ? ` #${listing.unit}` : ''}`}
            signedIn={!auth.loading && !!auth.user}
            onClose={() => setIntentKind(null)}
          />
        )}
        {fieldAgentOpen && (
          <AgentPicker zh={zh} listingAddress={`${listing.address}${listing.unit ? ` #${listing.unit}` : ''}`} onClose={() => setFieldAgentOpen(false)} excludeAuthIds={[auth.user?.id, listing.landlord_id, landlordAuthId]} />
        )}
      </main>
      <Footer />
      {galleryOpen && listing?.images && listing.images.length > 0 && (
        <PhotoGallery
          images={listing.images}
          startIdx={galleryIdx}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  )
}

function PhotoGallery({ images, startIdx, onClose }: { images: string[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx)
  const prev = useCallback(() => setIdx((i) => (i - 1 + images.length) % images.length), [images.length])
  const next = useCallback(() => setIdx((i) => (i + 1) % images.length), [images.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, prev, next])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90" onClick={onClose}>
      <div className="relative flex h-full w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {/* Close */}
        <button onClick={onClose} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        {/* Counter */}
        <div className="absolute left-4 top-4 z-10 rounded-md bg-white/10 px-3 py-1.5 font-mono text-[13px] font-semibold text-white backdrop-blur">
          {idx + 1} / {images.length}
        </div>
        {/* Prev */}
        {images.length > 1 && (
          <button onClick={prev} className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        {/* Next */}
        {images.length > 1 && (
          <button onClick={next} className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[idx]}
          alt={`Photo ${idx + 1}`}
          className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sl-card p-4">
      <div className="sl-eyebrow">{label}</div>
      <div className="mt-1 text-[20px] font-bold tracking-tight">{value}</div>
    </div>
  )
}

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow?: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-10">
      {eyebrow && (
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">
          {eyebrow}
        </div>
      )}
      <h2 className="mt-1 border-b border-line-divider pb-2 text-[20px] font-bold tracking-tight">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Li({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] ' +
          (ok ? 'bg-brand/15 text-brand' : 'bg-line-divider text-body-3')
        }
      >
        {ok ? '✓' : '–'}
      </span>
      {children}
    </li>
  )
}

function MoveInCosts({ zh, rent, deposit }: { zh: boolean; rent: number; deposit: number | null }) {
  if (!rent || rent <= 0) return null
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  const dep = deposit != null && deposit > 0 ? deposit : null
  const overCap = dep != null && dep > rent + 0.5
  const total = rent + (dep ?? 0)
  const banned = zh
    ? ['申请费', '信用检查费', '宠物押金', '清洁押金', '最后一月以外的预付租金']
    : ['application fee', 'credit-check fee', 'pet deposit', 'cleaning deposit', 'prepaid rent beyond the last month']
  return (
    <Section title={zh ? '入住前费用一览' : 'Move-in costs'} eyebrow="MOVE-IN COSTS">
      <div className="overflow-hidden rounded-xl border border-line-divider">
        <dl className="text-[13.5px]">
          <Row k={zh ? '首月租金' : 'First month’s rent'} v={fmt(rent)} />
          <Row
            k={zh ? '租金押金（不超过一个月，只抵最后一月租金）' : 'Rent deposit (max one month, applied to the last month only)'}
            v={dep != null ? fmt(dep) : (zh ? '房东未设置' : 'Not set by landlord')}
            warn={overCap}
          />
          <Row k={zh ? '钥匙押金（不超过更换成本，退租时退还）' : 'Key deposit (no more than replacement cost, refundable)'} v={zh ? '以租约为准' : 'Per lease'} muted />
          <Row k={zh ? '第一笔款合计' : 'First payment total'} v={fmt(total)} strong />
        </dl>
        {overCap && (
          <div className="border-t border-line-divider bg-red-50 px-4 py-2.5 text-[12.5px] text-red-800">
            {zh
              ? '此房源标注的押金高于一个月租金。安省 RTA s.106 规定租金押金不得超过一个月租金，请与房东确认。'
              : 'The listed deposit exceeds one month’s rent. Under RTA s.106 a rent deposit cannot exceed one month’s rent — confirm with the landlord.'}
          </div>
        )}
        <div className="border-t border-line-divider bg-surface-chip px-4 py-2.5 text-[12px] leading-relaxed text-body-3">
          {zh ? '安省不允许收取：' : 'Not permitted in Ontario: '}
          {banned.map((b, i) => (
            <span key={b}>
              <s className="decoration-red-700/70">{b}</s>
              {i < banned.length - 1 ? ' · ' : ''}
            </span>
          ))}
          {zh ? '。押金每年按指导比例付息（RTA s.105–106）。' : '. Deposits earn annual interest at the guideline rate (RTA s.105–106).'}
        </div>
      </div>
    </Section>
  )
}

function Row({ k, v, strong, muted, warn }: { k: string; v: string; strong?: boolean; muted?: boolean; warn?: boolean }) {
  return (
    <div className={'flex items-baseline justify-between gap-4 px-4 py-2.5 [&+&]:border-t [&+&]:border-line-divider ' + (strong ? 'bg-surface font-bold text-body' : '')}>
      <dt className={'min-w-0 ' + (strong ? '' : 'text-body-2')}>{k}</dt>
      <dd className={'flex-none ' + (warn ? 'font-semibold text-red-700' : muted ? 'text-body-3' : strong ? '' : 'font-semibold text-body')}>{v}</dd>
    </div>
  )
}

function BuildingFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-eyebrowLg text-body-3">
        {label}
      </div>
      <div className="mt-0.5 text-[14px] font-semibold text-body">{value}</div>
    </div>
  )
}

function ScoreCard({
  label,
  value,
  note,
}: {
  label: string
  value: number
  note: string
}) {
  const color = value >= 90 ? '#047857' : value >= 70 ? '#B45309' : '#DC2626'
  return (
    <div className="rounded-[12px] border border-line-divider bg-white p-4">
      <div className="font-mono text-[10px] font-bold uppercase tracking-eyebrowLg text-body-3">
        {label}
      </div>
      <div
        className="mt-1 text-[28px] font-extrabold leading-none tracking-tight"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1 text-[11.5px] text-body-2">{note}</div>
    </div>
  )
}

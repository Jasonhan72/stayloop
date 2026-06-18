'use client'

export const runtime = 'edge'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'
import { useT, type Lang } from '@/lib/i18n'

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
 *       3. Heat card (views / intents / similar rented in last 30d)
 *       4. Similar listings (3 mini cards)
 *
 * Data: Supabase `listings` (V5 schema).
 */

interface DBListing {
  id: string
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
}

const tierLabel: Record<number, { name: { zh: string; en: string }; reqs: { zh: string; en: string }[] }> = {
  1: {
    name: { zh: '入门 · 认证 1 级', en: 'Entry · Tier 1' },
    reqs: [{ zh: 'ID 验证', en: 'ID verification' }],
  },
  2: {
    name: { zh: '基础 · 认证 2 级', en: 'Basic · Tier 2' },
    reqs: [
      { zh: 'ID 验证', en: 'ID verification' },
      { zh: '收入 ≥ 房租 × 2.5', en: 'Income ≥ rent × 2.5' },
    ],
  },
  3: {
    name: { zh: '标准 · 认证 3 级', en: 'Standard · Tier 3' },
    reqs: [
      { zh: 'ID 验证', en: 'ID verification' },
      { zh: '收入 ≥ 房租 × 3', en: 'Income ≥ rent × 3' },
      { zh: '银行透明度 90 天', en: '90-day bank transparency' },
      { zh: '现住址确认', en: 'Current address confirmed' },
    ],
  },
  4: {
    name: { zh: '严选 · 认证 4 级', en: 'Premium · Tier 4' },
    reqs: [
      { zh: 'ID 验证', en: 'ID verification' },
      { zh: '收入 ≥ 房租 × 3', en: 'Income ≥ rent × 3' },
      { zh: '银行透明度 90 天', en: '90-day bank transparency' },
      { zh: '信用报告 ≥ 700', en: 'Credit report ≥ 700' },
      { zh: 'LTB 法庭记录清白', en: 'Clean LTB court record' },
    ],
  },
}

export default function ListingDetailPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const [listing, setListing] = useState<DBListing | null>(null)
  const [similar, setSimilar] = useState<DBListing[]>([])
  const [loading, setLoading] = useState(true)
  const [intentOpen, setIntentOpen] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
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
  const tier = (listing.trust_tier ?? 2) as 1 | 2 | 3 | 4
  const tierInfo = tierLabel[tier]

  return (
    <>
      <Header />
      <main className="bg-surface">
        {/* Breadcrumb + back */}
        <div className="mx-auto max-w-[1320px] px-6 pt-5 sm:px-8 lg:px-12">
          <Link
            href="/listings"
            className="font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3 transition hover:text-brand"
          >
            {zh ? '← 返回房源列表 / LISTINGS' : '← Back to listings / LISTINGS'}
          </Link>
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
                  className="relative col-span-2 sm:col-span-1 sm:row-span-2"
                  style={{
                    background: lead
                      ? `url(${lead}) center/cover no-repeat, linear-gradient(135deg,${a},${b})`
                      : `linear-gradient(135deg,${a},${b})`,
                  }}
                >
                  {!lead && <div className="absolute inset-0 bg-black/10" />}
                  {listing.badge && (
                    <span
                      className="absolute left-4 top-4 font-mono"
                      style={{
                        background: listing.badge.startsWith('LUNA')
                          ? '#7C3AED'
                          : listing.badge.startsWith('NEW')
                            ? '#DC2626'
                            : '#047857',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '5px 10px',
                        borderRadius: 4,
                        letterSpacing: '0.10em',
                      }}
                    >
                      {listing.badge}
                    </span>
                  )}
                  <div className="absolute bottom-4 left-4 rounded-md bg-black/55 px-2.5 py-1 font-mono text-[11px] text-white">
                    1 / {listing.photo_count || imgs.length || 1}
                  </div>
                </div>
                {thumbs.map((url, i) => (
                  <div
                    key={i}
                    className="relative"
                    style={{
                      background: url
                        ? `url(${url}) center/cover no-repeat, linear-gradient(${135 + i * 22}deg,${a},${b})`
                        : `linear-gradient(${135 + i * 22}deg,${a},${b})`,
                    }}
                  >
                    {i === 3 && (
                      <button
                        type="button"
                        className="absolute inset-0 flex items-center justify-center bg-black/35 font-mono text-[12px] font-semibold text-white"
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
          <div>
            {/* Title block */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`tier-badge t${tier}`}>{tierInfo.name[lang]}</span>
                {listing.match_score && listing.match_score >= 85 && (
                  <span
                    className="font-mono"
                    style={{
                      background: 'linear-gradient(135deg,rgba(124,58,237,0.10),rgba(37,99,235,0.10))',
                      color: '#5B21B6',
                      border: '1px solid rgba(124,58,237,0.40)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {zh ? `LUNA · ${listing.match_score}% 匹配` : `LUNA · ${listing.match_score}% match`}
                  </span>
                )}
                <span className="sl-chip fit">VERIFIED</span>
              </div>

              <h1 className="mt-3 text-[36px] font-extrabold tracking-tight sm:text-[44px]">
                ${listing.monthly_rent.toLocaleString()}
                <span className="ml-2 text-[18px] font-medium text-body-3">{zh ? '/ 月' : '/ month'}</span>
              </h1>
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
                      : `${listing.bedrooms}${listing.has_den ? ' + den' : ''}`
                  }
                />
                <Stat label={zh ? '卫生间' : 'Bathrooms'} value={listing.bathrooms ?? '—'} />
                <Stat label={zh ? '面积' : 'Area'} value={listing.sqft ? `${listing.sqft} ft²` : '—'} />
                <Stat label={zh ? '车位' : 'Parking'} value={listing.parking ? (zh ? '有' : 'Yes') : (zh ? '无' : 'No')} />
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
                      {zh ? `${u} 包租金` : `${u} included`}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {/* Section 2 — 生活配套 */}
            <Section title={zh ? '生活配套' : 'Amenities'} eyebrow="AMENITIES">
              <ul className="grid grid-cols-1 gap-y-2 text-[14px] text-body-2 sm:grid-cols-2">
                <Li ok>{zh ? '洗衣机/烘干机 · in-unit' : 'Washer / dryer · in-unit'}</Li>
                <Li ok>{zh ? '暖气、热水包水电' : 'Heat & hot water included'}</Li>
                <Li ok>{zh ? '自行车存放' : 'Bike storage'}</Li>
                <Li ok={listing.pet_policy !== 'no-pets' && listing.pet_policy !== null}>
                  {zh
                    ? `宠物友好（${listing.pet_policy || '可商议'}）`
                    : `Pet-friendly (${listing.pet_policy || 'negotiable'})`}
                </Li>
                <Li ok>{zh ? '距 TTC 地铁 5 min' : '5 min to TTC subway'}</Li>
                <Li ok>{zh ? '24h concierge' : '24h concierge'}</Li>
                <Li ok={!!listing.parking}>{listing.parking ? (zh ? '室内车位' : 'Indoor parking') : (zh ? '街道停车' : 'Street parking')}</Li>
                <Li ok>{zh ? '智能门锁' : 'Smart lock'}</Li>
              </ul>
            </Section>

            {/* Section 3 — 建筑信息 */}
            <Section title={zh ? '建筑信息' : 'Building'} eyebrow="BUILDING">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-4">
                <BuildingFact label={zh ? '建造年份' : 'Year built'} value={listing.year_built ?? '1998'} />
                <BuildingFact
                  label={zh ? '物业类型' : 'Property type'}
                  value={(listing.bedrooms ?? 0) >= 3 ? 'Detached' : 'Condo / Apartment'}
                />
                <BuildingFact
                  label={zh ? '入住' : 'Available'}
                  value={listing.available_date ? listing.available_date.slice(0, 10) : (zh ? '即可' : 'Now')}
                />
                <BuildingFact label={zh ? '租期' : 'Lease term'} value={zh ? '12 个月' : '12 months'} />
                {listing.brokerage && (
                  <BuildingFact label={zh ? '挂牌机构' : 'Brokerage'} value={listing.brokerage} />
                )}
                <BuildingFact
                  label={zh ? '邮编' : 'Postal code'}
                  value={listing.postal_code || `${listing.city.slice(0, 3).toUpperCase()} ···`}
                />
              </div>
            </Section>

            {/* Section 4 — Walk Score */}
            <Section title={zh ? '出行评分' : 'Getting around'} eyebrow="WALK · TRANSIT · BIKE">
              <div className="grid grid-cols-3 gap-3">
                <ScoreCard label="WALK SCORE" value={94} note="Walker's Paradise" />
                <ScoreCard label="TRANSIT" value={97} note="Rider's Paradise" />
                <ScoreCard label="BIKE" value={89} note="Very Bikeable" />
              </div>
              <p className="mt-3 text-[12.5px] text-body-3">
                {zh
                  ? '数据来自 walkscore.com · 仅供参考，实际请以现场为准'
                  : 'Data from walkscore.com · for reference only, verify on-site'}
              </p>
            </Section>

            {/* Section 5 — 房客信用门槛 · 房东设置 */}
            <Section title={zh ? '房客信用门槛 · 房东设置' : 'Tenant criteria · set by landlord'} eyebrow="LANDLORD CRITERIA">
              <div className="rounded-[12px] border border-line-divider bg-white p-5">
                <div className="text-[14px] font-semibold">
                  {zh
                    ? `${listing.broker_name || 'Sarah'} 接受 ${tierInfo.name.zh}（Banking-verified）`
                    : `${listing.broker_name || 'Sarah'} accepts ${tierInfo.name.en} (Banking-verified)`}
                </div>
                <p className="mt-1 text-[12.5px] text-body-2">
                  {zh ? (
                    <>
                      房东设定:此房源最低 <b className="text-body">认证 {tier} 级</b> · 月收入 ≥ 房租 × 2.5。
                      你需要完成以下验证才能提交看房意向：
                    </>
                  ) : (
                    <>
                      Set by landlord: this listing requires at least <b className="text-body">Tier {tier}</b> · monthly income ≥ rent × 2.5.
                      Complete the verifications below to submit a showing request:
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
                    {zh ? '开始 认证验证 →' : 'Start verification →'}
                  </Link>
                  <Link
                    href="/screening"
                    className="text-[13px] font-semibold text-brand transition hover:underline"
                  >
                    {zh ? '了解 认证体系' : 'Learn about Tiers'}
                  </Link>
                </div>
              </div>
            </Section>
          </div>

          {/* Right aside */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {/* Submit intent */}
            <div className="sl-card p-6">
              <span className="sl-eyebrow">SUBMIT INTENT</span>
              <h3 className="mt-2 text-[20px] font-bold tracking-tight">{zh ? '想看这套？提交看房意向' : 'Want to see it? Submit a showing request'}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-body-2">
                {zh
                  ? 'Stayloop 不要你立刻申请。先告诉房东 / 经纪你的匿名 Tier 等级 + 入住时间，对方决定是否邀请你看房。'
                  : 'Stayloop doesn’t make you apply right away. First share your anonymous Tier and move-in date with the landlord / agent — they decide whether to invite you for a showing.'}
              </p>
              <button
                onClick={() => setIntentOpen(true)}
                className="sl-btn-primary mt-4 w-full !py-[12px]"
              >
                {zh ? '提交看房意向' : 'Submit showing request'}
              </button>
              <Link
                href={`/apply/${listing.slug}`}
                className="mt-3 block rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-center text-[13.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                {zh ? '直接提交完整申请 →' : 'Submit a full application →'}
              </Link>
              <Link
                href="/tenant/agent"
                className="mt-2 block rounded-[10px] border border-tenant/30 bg-tenant/5 px-4 py-[10px] text-center text-[13.5px] font-semibold text-tenant transition hover:bg-tenant/10"
              >
                {zh ? `让 Luna 替我问 ${listing.broker_name || 'Sarah'}` : `Have Luna ask ${listing.broker_name || 'Sarah'}`}
              </Link>
              <Link
                href="/screening"
                className="mt-2 block rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-center text-[13.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                {zh ? '派 Field Agent 看房 ($80)' : 'Send a Field Agent to view ($80)'}
              </Link>
              <div className="mt-3 text-center font-mono text-[10px] uppercase tracking-eyebrowLg text-body-3">
                {zh ? '通常 4 小时内回复' : 'Usually replies within 4 hours'}
              </div>
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
                      'linear-gradient(135deg,rgba(124,58,237,0.20),rgba(37,99,235,0.25))',
                    border: '1px solid rgba(124,58,237,0.30)',
                  }}
                />
                <div>
                  <div className="text-[14px] font-bold">
                    {listing.broker_name || (zh ? 'Logic · 代理团队' : 'Logic · Agent team')}
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                    {listing.brokerage ? (zh ? `${listing.brokerage} · 经纪` : `${listing.brokerage} · Agent`) : (zh ? '房东直租' : 'Direct from landlord')}
                  </div>
                  <div className="mt-1 text-[12px] text-body-2">★ 4.8 · 27 transactions</div>
                </div>
              </div>
              <button
                type="button"
                className="mt-4 w-full rounded-[10px] border border-line-strong bg-white py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                {zh ? '和 Brief Agent 对话' : 'Chat with Brief Agent'}
              </button>
            </div>

            {/* Heat card */}
            <div
              className="sl-card p-5"
              style={{
                background:
                  'linear-gradient(180deg,rgba(217,119,6,0.06),rgba(255,255,255,1))',
                borderColor: 'rgba(217,119,6,0.25)',
              }}
            >
              <span className="sl-eyebrow" style={{ color: '#B45309' }}>
                LIVE HEAT
              </span>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Heat n="142" label={zh ? '近 7 天浏览' : 'Views · 7 days'} />
                <Heat n="9" label={zh ? '意向已提' : 'Intents submitted'} />
                <Heat n="2.6×" label={zh ? '同类型紧俏' : 'Demand vs. type'} />
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-body-2">
                {zh ? (
                  <>同 Tier 同片区的房源平均 <b>4.2 天</b> 收第一份意向，这套已挂 <b>1 天</b>。</>
                ) : (
                  <>Comparable listings in this Tier and area get their first intent in <b>4.2 days</b> on average; this one has been live for <b>1 day</b>.</>
                )}
              </p>
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
                        <div className="font-mono text-[9.5px] uppercase tracking-eyebrowLg text-body-3">
                          {zh ? `认证 ${s.trust_tier ?? 2} 级` : `Tier ${s.trust_tier ?? 2}`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </section>

        {intentOpen && (
          <IntentModal listing={listing} zh={zh} onClose={() => setIntentOpen(false)} />
        )}
      </main>
      <Footer />
    </>
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

function Heat({ n, label }: { n: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-[20px] font-extrabold tracking-tight" style={{ color: '#B45309' }}>
        {n}
      </div>
      <div className="font-mono text-[9.5px] uppercase tracking-eyebrowLg text-body-3">
        {label}
      </div>
    </div>
  )
}

function IntentModal({
  listing,
  zh,
  onClose,
}: {
  listing: DBListing
  zh: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur sm:items-center">
      <div className="sl-card w-full max-w-md p-7">
        <h3 className="text-[20px] font-bold tracking-tight">{zh ? '提交看房意向' : 'Submit showing request'}</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          {zh
            ? '房东只看到匿名信息：Tier 等级、收入区间、入住意向时间。你的姓名 / 联系方式只在对方邀请你看房后才解锁。'
            : 'The landlord only sees anonymous info: your Tier, income band, and desired move-in date. Your name and contact details unlock only after they invite you for a showing.'}
        </p>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="sl-eyebrow">{zh ? '入住时间' : 'Move-in date'}</span>
            <input className="sl-input mt-1" type="date" />
          </label>
          <label className="block">
            <span className="sl-eyebrow">{zh ? '租期' : 'Lease term'}</span>
            <select className="sl-input mt-1" defaultValue="12">
              <option value="12">{zh ? '12 个月' : '12 months'}</option>
              <option value="6">{zh ? '6 个月' : '6 months'}</option>
              <option value="month">{zh ? '月租' : 'Month-to-month'}</option>
            </select>
          </label>
          <label className="block">
            <span className="sl-eyebrow">{zh ? '给房东的一句话（可选）' : 'A note to the landlord (optional)'}</span>
            <textarea
              className="sl-input mt-1 h-20 py-2"
              placeholder={
                zh
                  ? `一直在 ${listing.neighborhood ?? listing.city} 工作 · 工作两年 · 安静`
                  : `I work in ${listing.neighborhood ?? listing.city} · two years employed · quiet`
              }
            />
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-[10px] border border-line-strong bg-white py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            {zh ? '取消' : 'Cancel'}
          </button>
          <button onClick={onClose} className="sl-btn-primary flex-1 !py-[12px]">
            {zh ? '提交意向' : 'Submit intent'}
          </button>
        </div>
      </div>
    </div>
  )
}

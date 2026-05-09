'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { supabase } from '@/lib/supabase'

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
}

const tierLabel: Record<number, { name: string; reqs: string[] }> = {
  1: { name: '入门 · Tier 1', reqs: ['ID 验证'] },
  2: { name: '基础 · Tier 2', reqs: ['ID 验证', '收入 ≥ 房租 × 2.5'] },
  3: {
    name: '标准 · Tier 3',
    reqs: ['ID 验证', '收入 ≥ 房租 × 3', '银行透明度 90 天', '现住址确认'],
  },
  4: {
    name: '严选 · Tier 4',
    reqs: [
      'ID 验证',
      '收入 ≥ 房租 × 3',
      '银行透明度 90 天',
      '信用报告 ≥ 700',
      'LTB 法庭记录清白',
    ],
  },
}

export default function ListingDetailPage() {
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
            加载房源信息中…
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
            <h1 className="text-[28px] font-bold tracking-tight">房源未找到</h1>
            <p className="mt-3 text-[14px] text-body-2">这套房源可能已下架。</p>
            <Link href="/listings" className="sl-btn-primary mt-6 inline-flex !px-6 !py-[12px]">
              返回房源列表 →
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
            ← 返回房源列表 / LISTINGS
          </Link>
        </div>

        {/* Photo gallery — 1 lead + 4 thumbs */}
        <section className="mx-auto mt-3 max-w-[1320px] px-6 sm:px-8 lg:px-12">
          <div
            className="grid gap-2 overflow-hidden rounded-[16px]"
            style={{ gridTemplateColumns: '1.5fr 1fr 1fr', gridTemplateRows: '210px 210px' }}
          >
            <div
              className="relative row-span-2"
              style={{
                background: `linear-gradient(135deg,${a},${b})`,
              }}
            >
              <div className="absolute inset-0 bg-black/10" />
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
                1 / {listing.photo_count || 1}
              </div>
            </div>
            {[0.85, 0.7, 0.55, 0.4].map((alpha, i) => (
              <div
                key={i}
                className="relative"
                style={{
                  background: `linear-gradient(${135 + i * 22}deg,${a},${b})`,
                  opacity: alpha,
                }}
              >
                {i === 3 && (
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center bg-black/35 font-mono text-[12px] font-semibold text-white"
                  >
                    + 看全部 {listing.photo_count || 24} 张 →
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-eyebrowLg text-body-3">
            <span>📷 {listing.photo_count || 24} 张照片</span>
            <span>·</span>
            <span>VR 看房</span>
            <span>·</span>
            <span>平面图</span>
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
                <span className={`tier-badge t${tier}`}>{tierInfo.name}</span>
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
                    LUNA · {listing.match_score}% 匹配
                  </span>
                )}
                <span className="sl-chip fit">VERIFIED</span>
              </div>

              <h1 className="mt-3 text-[36px] font-extrabold tracking-tight sm:text-[44px]">
                ${listing.monthly_rent.toLocaleString()}
                <span className="ml-2 text-[18px] font-medium text-body-3">/ month</span>
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
                  label="卧室"
                  value={
                    listing.bedrooms === 0
                      ? 'Studio'
                      : `${listing.bedrooms}${listing.has_den ? ' + den' : ''}`
                  }
                />
                <Stat label="卫生间" value={listing.bathrooms ?? '—'} />
                <Stat label="面积" value={listing.sqft ? `${listing.sqft} ft²` : '—'} />
                <Stat label="车位" value={listing.parking ? '有' : '无'} />
              </div>
            </div>

            {/* Section 1 — 关于这套房源 */}
            <Section title="关于这套房源" eyebrow="ABOUT">
              <p className="text-[14.5px] leading-relaxed text-body-2">
                {listing.description ||
                  `${listing.neighborhood ?? listing.city} 的整套${
                    listing.bedrooms === 0
                      ? 'Studio'
                      : `${listing.bedrooms} 室${listing.bathrooms ?? ''} 卫`
                  }房源。${listing.year_built ? `${listing.year_built} 年建。` : ''}`}
              </p>
              {listing.utilities_included && listing.utilities_included.length > 0 && (
                <div className="mt-4 inline-flex flex-wrap gap-2">
                  {listing.utilities_included.map((u) => (
                    <span key={u} className="sl-chip fit">
                      {u} 包租金
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {/* Section 2 — 生活配套 */}
            <Section title="生活配套" eyebrow="AMENITIES">
              <ul className="grid grid-cols-1 gap-y-2 text-[14px] text-body-2 sm:grid-cols-2">
                <Li ok>洗衣机/烘干机 · in-unit</Li>
                <Li ok>暖气、热水包水电</Li>
                <Li ok>自行车存放</Li>
                <Li ok={listing.pet_policy !== 'no-pets' && listing.pet_policy !== null}>
                  宠物友好（{listing.pet_policy || '可商议'}）
                </Li>
                <Li ok>距 TTC 地铁 5 min</Li>
                <Li ok>24h concierge</Li>
                <Li ok={!!listing.parking}>{listing.parking ? '室内车位' : '街道停车'}</Li>
                <Li ok>智能门锁</Li>
              </ul>
            </Section>

            {/* Section 3 — 建筑信息 */}
            <Section title="建筑信息" eyebrow="BUILDING">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-4">
                <BuildingFact label="建造年份" value={listing.year_built ?? '1998'} />
                <BuildingFact
                  label="物业类型"
                  value={(listing.bedrooms ?? 0) >= 3 ? 'Detached' : 'Condo / Apartment'}
                />
                <BuildingFact
                  label="入住"
                  value={listing.available_date ? listing.available_date.slice(0, 10) : '即可'}
                />
                <BuildingFact label="租期" value="12 个月" />
                {listing.brokerage && (
                  <BuildingFact label="挂牌机构" value={listing.brokerage} />
                )}
                <BuildingFact
                  label="邮编"
                  value={listing.postal_code || `${listing.city.slice(0, 3).toUpperCase()} ···`}
                />
              </div>
            </Section>

            {/* Section 4 — Walk Score */}
            <Section title="出行评分" eyebrow="WALK · TRANSIT · BIKE">
              <div className="grid grid-cols-3 gap-3">
                <ScoreCard label="WALK SCORE" value={94} note="Walker's Paradise" />
                <ScoreCard label="TRANSIT" value={97} note="Rider's Paradise" />
                <ScoreCard label="BIKE" value={89} note="Very Bikeable" />
              </div>
              <p className="mt-3 text-[12.5px] text-body-3">
                数据来自 walkscore.com · 仅供参考，实际请以现场为准
              </p>
            </Section>

            {/* Section 5 — Tier 要求 */}
            <Section title={`Trust Tier ${tier} 门槛`} eyebrow="TIER REQUIREMENTS">
              <div className="rounded-[12px] border border-line-divider bg-white p-5">
                <div className="text-[14px] font-semibold">{tierInfo.name}</div>
                <p className="mt-1 text-[12.5px] text-body-2">
                  此房源最低需要 <b className="text-body">Tier {tier}</b>。 你需要完成以下验证才能提交看房意向：
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {tierInfo.reqs.map((req) => (
                    <li
                      key={req}
                      className="flex items-center gap-2 text-[13px] text-body-2"
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                        style={{ background: 'rgba(4,120,87,0.12)', color: '#047857' }}
                      >
                        ✓
                      </span>
                      {req}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href="/onboarding/tier1"
                    className="sl-btn-primary !px-5 !py-[10px] !text-[13px]"
                  >
                    开始 Tier 验证 →
                  </Link>
                  <Link
                    href="/screening"
                    className="text-[13px] font-semibold text-brand transition hover:underline"
                  >
                    了解 Trust Tier 体系
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
              <h3 className="mt-2 text-[20px] font-bold tracking-tight">想看这套？提交看房意向</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-body-2">
                Stayloop 不要你立刻申请。先告诉房东 / 经纪你的匿名 Tier 等级 + 入住时间，对方决定是否邀请你看房。
              </p>
              <button
                onClick={() => setIntentOpen(true)}
                className="sl-btn-primary mt-4 w-full !py-[12px]"
              >
                提交看房意向
              </button>
              <Link
                href={`/apply/${listing.slug}`}
                className="mt-3 block rounded-[10px] border border-line-strong bg-white px-4 py-[10px] text-center text-[13.5px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                直接提交完整申请 →
              </Link>
              <div className="mt-3 text-center font-mono text-[10px] uppercase tracking-eyebrowLg text-body-3">
                通常 4 小时内回复
              </div>
            </div>

            {/* Landlord / agent card */}
            <div className="sl-card p-5">
              <span className="sl-eyebrow">联系人</span>
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
                    {listing.broker_name || 'Logic · 代理团队'}
                  </div>
                  <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">
                    {listing.brokerage ? `${listing.brokerage} · 经纪` : '房东直租'}
                  </div>
                  <div className="mt-1 text-[12px] text-body-2">★ 4.8 · 27 transactions</div>
                </div>
              </div>
              <button
                type="button"
                className="mt-4 w-full rounded-[10px] border border-line-strong bg-white py-[10px] text-[13px] font-semibold text-body transition hover:border-brand hover:text-brand"
              >
                和 Brief Agent 对话
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
                <Heat n="142" label="近 7 天浏览" />
                <Heat n="9" label="意向已提" />
                <Heat n="2.6×" label="同类型紧俏" />
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-body-2">
                同 Tier 同片区的房源平均 <b>4.2 天</b> 收第一份意向，这套已挂 <b>1 天</b>。
              </p>
            </div>

            {/* Similar listings */}
            {similar.length > 0 && (
              <div className="sl-card p-5">
                <span className="sl-eyebrow">类似房源</span>
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
                          background: `linear-gradient(135deg,${s.thumb_a || '#D4C4A8'},${
                            s.thumb_b || '#94815C'
                          })`,
                          flexShrink: 0,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold">
                          ${s.monthly_rent.toLocaleString()}
                          <span className="ml-1 text-[11px] font-medium text-body-3">
                            /月
                          </span>
                        </div>
                        <div className="truncate text-[11.5px] text-body-2">
                          {s.bedrooms === 0 ? 'Studio' : `${s.bedrooms}B`} · {s.neighborhood}
                        </div>
                        <div className="font-mono text-[9.5px] uppercase tracking-eyebrowLg text-body-3">
                          TIER {s.trust_tier ?? 2}
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
          <IntentModal listing={listing} onClose={() => setIntentOpen(false)} />
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
  onClose,
}: {
  listing: DBListing
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur sm:items-center">
      <div className="sl-card w-full max-w-md p-7">
        <h3 className="text-[20px] font-bold tracking-tight">提交看房意向</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">
          房东只看到匿名信息：Tier 等级、收入区间、入住意向时间。你的姓名 / 联系方式只在对方邀请你看房后才解锁。
        </p>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="sl-eyebrow">入住时间</span>
            <input className="sl-input mt-1" type="date" />
          </label>
          <label className="block">
            <span className="sl-eyebrow">租期</span>
            <select className="sl-input mt-1" defaultValue="12">
              <option value="12">12 个月</option>
              <option value="6">6 个月</option>
              <option value="month">月租</option>
            </select>
          </label>
          <label className="block">
            <span className="sl-eyebrow">给房东的一句话（可选）</span>
            <textarea
              className="sl-input mt-1 h-20 py-2"
              placeholder={`一直在 ${listing.neighborhood ?? listing.city} 工作 · 工作两年 · 安静`}
            />
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-[10px] border border-line-strong bg-white py-[12px] text-[14px] font-semibold text-body transition hover:border-brand hover:text-brand"
          >
            取消
          </button>
          <button onClick={onClose} className="sl-btn-primary flex-1 !py-[12px]">
            提交意向
          </button>
        </div>
      </div>
    </div>
  )
}

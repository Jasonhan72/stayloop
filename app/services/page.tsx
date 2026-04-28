'use client'
// /services — Services Marketplace (V3 section 11)
// Production: reads service_providers + service_bookings.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

interface Provider {
  id: string
  name: string
  category: string
  service_label_en: string | null
  service_label_zh: string | null
  emoji: string | null
  rating: number | null
  jobs_completed: number | null
  starting_price_cad: number | null
  badge: string | null
}

interface Booking {
  id: string
  status: string
  scheduled_at: string | null
  provider: { name: string } | null
}

const CATEGORY_META: Record<string, { en: string; zh: string; emoji: string }> = {
  repair: { en: 'Repair', zh: '维修', emoji: '🔧' },
  cleaning: { en: 'Cleaning', zh: '清洁', emoji: '🧹' },
  legal: { en: 'Legal', zh: '法律', emoji: '⚖️' },
  pest: { en: 'Pest', zh: '害虫', emoji: '🐛' },
  moving: { en: 'Moving', zh: '搬家', emoji: '📦' },
  locksmith: { en: 'Locksmith', zh: '锁匠', emoji: '🔑' },
}

const BADGE_META: Record<string, { en: string; zh: string }> = {
  echo_pick: { en: 'Echo Pick', zh: 'Echo 推荐' },
  same_day: { en: 'Same-day', zh: '当天' },
  best_price: { en: 'Best price', zh: '最优价格' },
}

export default function ServicesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user } = useUser({ redirectIfMissing: false })
  const [providers, setProviders] = useState<Provider[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [user?.authId])

  async function load() {
    setLoading(true)
    const [{ data: pData }, { data: bData }] = await Promise.all([
      supabase
        .from('service_providers')
        .select('id, name, category, service_label_en, service_label_zh, emoji, rating, jobs_completed, starting_price_cad, badge')
        .eq('status', 'active')
        .order('rating', { ascending: false }),
      user
        ? supabase
            .from('service_bookings')
            .select('id, status, scheduled_at, provider:service_providers(name)')
            .order('scheduled_at', { ascending: true })
            .limit(5)
        : Promise.resolve({ data: [] as any[] }),
    ])
    setProviders((pData as Provider[]) || [])
    setBookings((bData as any[]) || [])
    setLoading(false)
  }

  const counts: Record<string, number> = {}
  providers.forEach((p) => {
    counts[p.category] = (counts[p.category] || 0) + 1
  })
  const categories = Object.keys(CATEGORY_META).filter((k) => counts[k] > 0)

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader
        title="Services"
        titleZh="服务市场"
        right={
          <span style={{ fontSize: 11, color: v3.textMuted, whiteSpace: 'nowrap' }}>
            {isZh ? `${providers.length} 家认证服务商` : `${providers.length} vetted providers`}
          </span>
        }
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24 }}>
        {/* Echo trigger */}
        <div style={{ background: v3.surface, border: `1px solid ${v3.brandSoft}`, borderLeft: `4px solid ${v3.brand}`, borderRadius: 14, padding: 18, marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>✦</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.brandStrong, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              Echo · {isZh ? '智能推荐' : 'Smart match'}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: v3.textPrimary }}>
              {isZh
                ? '告诉我你需要什么服务，我会从认证服务商里筛出最合适的。'
                : 'Tell me what you need — I\u2019ll match you with the highest-rated vetted provider for the job.'}
            </div>
          </div>
          <Link href="/echo" style={{ padding: '8px 16px', background: v3.brand, color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            {isZh ? '问 Echo' : 'Ask Echo'} →
          </Link>
        </div>

        {/* Categories */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          {categories.map((cat) => {
            const m = CATEGORY_META[cat]
            return (
              <div key={cat} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{m.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{m.en}</div>
                <div style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui', marginTop: 2 }}>{m.zh}</div>
                <div style={{ fontSize: 11, color: v3.brandStrong, marginTop: 6, fontWeight: 600 }}>
                  {counts[cat]} {isZh ? '家服务商' : 'providers'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Providers */}
        <div style={{ fontSize: 12, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          {isZh ? '推荐服务商 · TOP-RATED' : 'TOP-RATED · 推荐服务商'}
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: v3.textMuted, fontSize: 13 }}>
            {isZh ? '加载中…' : 'Loading…'}
          </div>
        ) : providers.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: v3.textMuted, fontSize: 13, background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 14 }}>
            {isZh ? '暂无服务商。' : 'No providers yet.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 18 }}>
            {providers.slice(0, 9).map((p) => {
              const badgeMeta = p.badge ? BADGE_META[p.badge] : null
              const serviceLabel = isZh ? p.service_label_zh : p.service_label_en
              return (
                <div key={p.id} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 24 }}>{p.emoji || '✦'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                        {badgeMeta && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.06em' }}>
                            {isZh ? badgeMeta.zh : badgeMeta.en}
                          </span>
                        )}
                      </div>
                      {serviceLabel && (
                        <div style={{ fontSize: 12, color: v3.textPrimary, marginTop: 2 }}>{serviceLabel}</div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: v3.textMuted, marginBottom: 12 }}>
                    <span>★ {p.rating ?? '—'} · {p.jobs_completed ?? 0} jobs</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
                      ${p.starting_price_cad ?? '—'}
                    </span>
                    <button
                      style={{ padding: '7px 14px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onClick={async () => {
                        if (!user) {
                          alert(isZh ? '请先登录' : 'Please sign in first')
                          return
                        }
                        await supabase.from('service_bookings').insert({
                          user_id: user?.authId,
                          provider_id: p.id,
                          status: 'pending_vendor',
                          total_cad: p.starting_price_cad,
                        })
                        void load()
                      }}
                    >
                      {isZh ? '预约' : 'Book'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Active bookings */}
        {bookings.length > 0 && (
          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              {isZh ? '进行中订单' : 'YOUR ACTIVE ORDERS'}
            </div>
            {bookings.map((b) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${v3.divider}` }}>
                <span style={{ fontSize: 13, color: v3.textPrimary, fontWeight: 500 }}>
                  {b.provider?.name || '—'}
                  {b.scheduled_at ? ` · ${new Date(b.scheduled_at).toLocaleDateString()}` : ''}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: b.status === 'confirmed' ? v3.brandStrong : v3.warning,
                    background: b.status === 'confirmed' ? v3.brandSoft : v3.warningSoft,
                    padding: '4px 10px',
                    borderRadius: 999,
                  }}
                >
                  {b.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

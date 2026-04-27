'use client'
// /dashboard/find-agent — Find a Field Agent (V3 section 13)
// Production: reads field_agents, scores with 6-factor weighted match.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

interface Agent {
  id: string
  display_name: string
  initials: string | null
  reco_number: string | null
  brokerage: string | null
  languages: string | null
  service_areas: string | null
  property_types: string | null
  signed_last_12mo: number
  avg_dom_days: number | null
  response_minutes_p50: number | null
  active_load: number
}

interface Listing {
  id: string
  address: string
  unit: string | null
  city: string
  monthly_rent: number | null
}

const WEIGHTS = [
  { key: 'area', label: 'Area', pct: 25 },
  { key: 'lang', label: 'Lang', pct: 20 },
  { key: 'perf', label: 'Perf', pct: 20 },
  { key: 'load', label: 'Load', pct: 15 },
  { key: 'type', label: 'Type', pct: 10 },
  { key: 'speed', label: 'Speed', pct: 10 },
] as const

function scoreAgent(a: Agent, listing: Listing | null): { fit: number; rationale: string } {
  // Area: any service area string in listing.city
  const areaTokens = (a.service_areas || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
  const cityLower = (listing?.city || '').toLowerCase()
  const areaScore = areaTokens.some((t) => cityLower.includes(t) || t.includes(cityLower)) ? 1 : 0.4
  // Lang: assume EN baseline, bonus for ZH
  const langs = (a.languages || 'en').toLowerCase()
  const langScore = langs.includes('zh') ? 1 : langs.includes('en') ? 0.85 : 0.5
  // Perf: signed_last_12mo (cap at 50)
  const perfScore = Math.min(1, a.signed_last_12mo / 50)
  // Load: active_load (lower better, cap at 10)
  const loadScore = 1 - Math.min(1, a.active_load / 10)
  // Type: condo + house assumed for most listings
  const typeScore = (a.property_types || '').toLowerCase().includes('condo') ? 1 : 0.7
  // Speed: response_minutes_p50 (lower better)
  const speedScore = a.response_minutes_p50 ? Math.max(0, 1 - a.response_minutes_p50 / 60) : 0.6

  const fit = Math.round(
    areaScore * WEIGHTS[0].pct +
    langScore * WEIGHTS[1].pct +
    perfScore * WEIGHTS[2].pct +
    loadScore * WEIGHTS[3].pct +
    typeScore * WEIGHTS[4].pct +
    speedScore * WEIGHTS[5].pct,
  )
  const rationale = `area ${Math.round(areaScore * 100)} · lang ${Math.round(langScore * 100)} · perf ${Math.round(perfScore * 100)} · load ${Math.round(loadScore * 100)}`
  return { fit, rationale }
}

export default function FindAgentPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [agents, setAgents] = useState<Agent[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [activeListingId, setActiveListingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function load() {
    setLoading(true)
    const [{ data: ag }, { data: ll }] = await Promise.all([
      supabase
        .from('field_agents')
        .select('id, display_name, initials, reco_number, brokerage, languages, service_areas, property_types, signed_last_12mo, avg_dom_days, response_minutes_p50, active_load')
        .eq('is_active', true)
        .order('signed_last_12mo', { ascending: false }),
      supabase
        .from('listings')
        .select('id, address, unit, city, monthly_rent')
        .eq('landlord_id', user!.profileId)
        .order('created_at', { ascending: false }),
    ])
    setAgents((ag as Agent[]) || [])
    setListings((ll as Listing[]) || [])
    if ((ll as any[])?.length > 0) setActiveListingId((ll as any[])[0].id)
    setLoading(false)
  }

  const activeListing = listings.find((l) => l.id === activeListingId) || null
  const ranked = agents.map((a) => ({ ...a, ...scoreAgent(a, activeListing) })).sort((x, y) => y.fit - x.fit).slice(0, 6)
  const commission = activeListing?.monthly_rent || 0

  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <header style={{ background: v3.surface, borderBottom: `1px solid ${v3.border}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: v3.textPrimary }}>
            <span style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: v3.brand, color: '#fff', fontWeight: 800, fontSize: 14 }}>S</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>stayloop</span>
          </Link>
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            {isZh ? '找经纪 · Find a Field Agent' : 'Find a Field Agent · 找经纪'}
          </span>
        </div>
        <span style={{ fontSize: 11, color: v3.textMuted }}>
          {isZh ? '6 因子匹配' : '6-factor matching'}
        </span>
      </header>

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }} className="fa-grid">
        <section>
          <div style={{ marginBottom: 14 }}>
            {listings.length > 0 ? (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
                  {isZh
                    ? `为 ${activeListing?.address || '...'} 推荐 ${ranked.length} 位经纪`
                    : `${ranked.length} agents matched for ${activeListing?.address || '...'}`}
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {listings.slice(0, 5).map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setActiveListingId(l.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 999,
                        border: `1px solid ${l.id === activeListingId ? v3.brand : v3.border}`,
                        background: l.id === activeListingId ? v3.brandSoft : v3.surface,
                        color: l.id === activeListingId ? v3.brandStrong : v3.textSecondary,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {l.address}
                      {l.unit ? ` · ${l.unit}` : ''}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: 16, background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 12, fontSize: 13, color: v3.textMuted }}>
                {isZh ? '先创建一个房源再来找经纪。' : 'Create a listing first, then come back to find an agent.'}
              </div>
            )}
          </div>

          <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              {isZh ? '匹配权重 · MATCHING WEIGHTS' : 'MATCHING WEIGHTS'}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {WEIGHTS.map((w) => (
                <div key={w.key} style={{ flex: 1, minWidth: 80, padding: '8px 10px', background: v3.surfaceMuted, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: v3.textPrimary }}>{w.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: v3.brand, letterSpacing: '-0.02em' }}>{w.pct}</div>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: v3.textMuted, fontSize: 13 }}>
              {isZh ? '加载…' : 'Loading…'}
            </div>
          ) : ranked.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: v3.textMuted, fontSize: 13, background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 14 }}>
              {isZh ? '网络中暂无活跃经纪。' : 'No active agents in the network yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ranked.map((a, idx) => (
                <div key={a.id} style={{ background: v3.surface, border: `1px solid ${idx === 0 ? v3.brand : v3.border}`, borderRadius: 14, padding: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ width: 48, height: 48, borderRadius: 999, background: v3.brand, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {a.initials || a.display_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{a.display_name}</span>
                      {idx === 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: v3.brandStrong, background: v3.brandSoft, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.08em' }}>
                          TOP MATCH
                        </span>
                      )}
                      {a.reco_number && (
                        <span style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>
                          RECO #{a.reco_number}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: v3.textSecondary, marginBottom: 4 }}>
                      {a.service_areas} · {a.signed_last_12mo} signed last 12mo · {a.avg_dom_days || '—'}d avg DoM
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted }}>
                      {(a.languages || 'en').split(',').map((l) => l.trim().toUpperCase()).join(' · ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em', lineHeight: 1 }}>{a.fit}</div>
                    <div style={{ fontSize: 10, color: v3.textMuted, marginTop: 2 }}>FIT</div>
                  </div>
                  <button style={{ padding: '8px 16px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {isZh ? '邀请' : 'Invite'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, alignSelf: 'start', position: 'sticky', top: 24 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            {isZh ? '佣金预览 · COMMISSION' : 'COMMISSION PREVIEW'}
          </div>
          <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>
            {isZh ? '总额 · 1 个月租金' : 'Total · 1 month rent'}
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.025em', marginBottom: 14 }}>
            ${commission.toLocaleString()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {[
              { label: isZh ? '挂牌经纪' : 'Listing Agent', val: Math.round(commission * 0.8), pct: 80 },
              { label: 'Stayloop', val: Math.round(commission * 0.15), pct: 15 },
              { label: isZh ? '平台费' : 'Platform fee', val: 0, dash: true },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: v3.textSecondary }}>{row.label}</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  ${row.val.toLocaleString()}
                  {row.pct ? <span style={{ fontSize: 10, color: v3.textMuted, marginLeft: 4 }}>{row.pct}%</span> : null}
                </span>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: v3.brandSoft, borderRadius: 10, fontSize: 12, color: v3.textPrimary, lineHeight: 1.5 }}>
            {isZh
              ? '用经纪不增加成本 — 总价相同。佣金对房东永远透明。'
              : 'You pay nothing extra — same total as without an agent.'}
          </div>
        </aside>
      </div>
      <style jsx>{`@media (max-width: 880px){:global(.fa-grid){grid-template-columns:1fr !important;}}`}</style>
    </main>
  )
}

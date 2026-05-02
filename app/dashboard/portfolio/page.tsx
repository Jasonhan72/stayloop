'use client'
// /dashboard/portfolio — Landlord Portfolio Analytics (V3 section 20)
// Production: aggregates current landlord's listings + applications.
import { useEffect, useState } from 'react'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface Property {
  id: string
  address: string
  unit: string | null
  monthly_rent: number | null
  is_active: boolean
  status: 'draft' | 'active' | string | null
  created_at: string
  topAiScore: number | null
  applicantCount: number
  daysOnMarket: number
}

function dom(createdAt: string, leased: boolean): number {
  if (leased) return 0
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

export default function ListingsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [props, setProps] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'draft' | 'closed'>('all')

  async function publish(id: string) {
    if (publishingId) return
    setPublishingId(id)
    try {
      const { error } = await supabase
        .from('listings')
        .update({ status: 'active', is_active: true })
        .eq('id', id)
      if (error) {
        alert((isZh ? '发布失败：' : 'Publish failed: ') + error.message)
        return
      }
      // Optimistic local update — avoids a full reload.
      setProps((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'active', is_active: true } : p)),
      )
    } finally {
      setPublishingId(null)
    }
  }

  useEffect(() => {
    if (!user) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function load() {
    setLoading(true)
    if (!user?.profileId) return
    const [{ data: listings }, { data: apps }] = await Promise.all([
      supabase
        .from('listings')
        .select('id, address, unit, monthly_rent, is_active, status, created_at')
        .eq('landlord_id', user.profileId)
        .order('created_at', { ascending: false }),
      supabase
        .from('applications')
        .select('listing_id, ai_score, status, listing:listings!inner(landlord_id)')
        .eq('listing.landlord_id', user.profileId),
    ])
    const appsByListing: Record<string, any[]> = {}
    for (const a of (apps as any[]) || []) {
      if (!appsByListing[a.listing_id]) appsByListing[a.listing_id] = []
      appsByListing[a.listing_id].push(a)
    }
    const enriched: Property[] = ((listings as any[]) || []).map((l) => {
      const list = appsByListing[l.id] || []
      const topAi = list.reduce((m, a) => (a.ai_score ? Math.max(m, a.ai_score) : m), 0) || null
      const leased = list.some((a) => a.status === 'approved')
      return {
        ...l,
        topAiScore: topAi,
        applicantCount: list.length,
        daysOnMarket: dom(l.created_at, leased),
      }
    })
    setProps(enriched)
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <PageShell role="landlord">
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
        </div>
      </PageShell>
    )
  }

  const tabCounts = {
    all: props.length,
    live: props.filter(p => p.is_active && p.status === 'active').length,
    draft: props.filter(p => p.status === 'draft').length,
    closed: props.filter(p => p.status === 'closed' || (!p.is_active && p.status !== 'draft')).length,
  }

  const filteredProps = props.filter(p => {
    if (activeTab === 'live') return p.is_active && p.status === 'active'
    if (activeTab === 'draft') return p.status === 'draft'
    if (activeTab === 'closed') return p.status === 'closed' || (!p.is_active && p.status !== 'draft')
    return true
  })

  return (
    <PageShell role="landlord">
      <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
        <SecHead
          eyebrow={isZh ? `房源 · ${props.length} 套` : `Properties · ${props.length} total`}
          title={isZh ? '房源' : 'Listings'}
          right={<div style={{ display: 'flex', gap: 8 }}>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: v3.surfaceCard, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: v3.textPrimary, cursor: 'pointer' }}>
              {isZh ? '从 URL 导入' : 'Import from URL'}
            </button>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer', boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset', letterSpacing: '-0.01em' }}>
              + {isZh ? '新房源' : 'New listing'}
            </button>
          </div>}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${v3.border}`, marginBottom: 20 }}>
          {[
            { id: 'all', label: isZh ? '全部' : 'All', count: tabCounts.all, tone: 'default' },
            { id: 'live', label: isZh ? '已上线' : 'Live', count: tabCounts.live, tone: 'ok' },
            { id: 'draft', label: isZh ? '草稿' : 'Drafts', count: tabCounts.draft, tone: 'gold' },
            { id: 'closed', label: isZh ? '已关闭' : 'Closed', count: tabCounts.closed, tone: 'default' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 500,
                color: activeTab === tab.id ? v3.textPrimary : v3.textMuted,
                borderBottom: activeTab === tab.id ? `2px solid ${v3.brand}` : '2px solid transparent',
                marginBottom: -1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: '1px solid transparent', color: tab.tone === 'ok' ? '#16A34A' : tab.tone === 'gold' ? v3.brand : v3.textSecondary, background: tab.tone === 'ok' ? '#DCFCE7' : tab.tone === 'gold' ? 'rgba(16,185,129,0.1)' : 'rgba(113,113,122,0.1)' }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {/* Listings table - V4 style */}
        <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '56px 1.6fr 100px 90px 110px 100px 100px 80px', padding: '12px 18px', background: v3.surfaceMuted, borderBottom: `1px solid ${v3.border}`, fontSize: 10, color: v3.textMuted, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            <span></span><span>Address</span><span>Rent</span><span>Status</span><span>Apps</span><span>Days live</span><span>AI flags</span><span></span>
          </div>
          {filteredProps.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: v3.textMuted }}>
              <div style={{ fontSize: 14 }}>
                {isZh ? '此分类中没有房源' : 'No listings in this category'}
              </div>
            </div>
          ) : (
            filteredProps.map((l, i) => (
              <div
                key={l.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '56px 1.6fr 100px 90px 110px 100px 100px 80px',
                  gap: 12,
                  padding: '12px 18px',
                  borderTop: `1px solid ${v3.border}`,
                  fontSize: 13,
                  alignItems: 'center',
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 6, background: v3.surfaceMuted, border: `1px solid ${v3.border}` }} />
                <div>
                  <div style={{ fontWeight: 600, color: v3.textPrimary }}>
                    {l.address}{l.unit ? ` · ${l.unit}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                    {l.monthly_rent ? `Near downtown` : 'TBD'}
                  </div>
                </div>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: v3.textPrimary }}>
                  ${l.monthly_rent?.toLocaleString()}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${l.is_active ? '#BBF7D0' : '#FDE68A'}`, color: l.is_active ? v3.success : v3.warning, background: l.is_active ? v3.successSoft : v3.warningSoft }}>
                  {l.is_active ? (isZh ? '已上线' : 'Live') : (isZh ? '草稿' : 'Draft')}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: l.applicantCount > 0 ? v3.warning : v3.textFaint }}>
                    {l.applicantCount}
                  </span>
                  <span style={{ fontSize: 11, color: v3.textMuted }}>
                    {l.applicantCount === 1 ? (isZh ? '份' : 'app') : (isZh ? '份' : 'apps')}
                  </span>
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: v3.textMuted, fontSize: 12 }}>
                  {l.daysOnMarket || '—'}
                </span>
                <span>
                  {0 > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: '1px solid #FDE68A', color: v3.warning, background: v3.warningSoft }}>
                      1 flag
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: v3.textFaint }}>—</span>
                  )}
                </span>
                <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, justifySelf: 'end' }}>
                  {isZh ? '管理' : 'Manage'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </PageShell>
  )
}

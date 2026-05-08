'use client'
// /dashboard/portfolio — Landlord listings overview (V4 PgLandlordListings)
// Production: aggregates current landlord's listings + applications.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { pickHeroImage } from '@/lib/listing-images'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface Property {
  id: string
  address: string
  unit: string | null
  city: string | null
  monthly_rent: number | null
  is_active: boolean
  status: 'draft' | 'active' | string | null
  slug: string | null
  created_at: string
  /** Photo URLs in display order. First entry is the hero. */
  images: string[] | null
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
        .update({ status: 'active', is_active: true, published_at: new Date().toISOString() })
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

  // Take a live listing offline. Stays in DB as a draft so the landlord
  // can re-publish later without re-typing anything.
  async function unpublish(id: string) {
    if (publishingId) return
    setPublishingId(id)
    try {
      const { error } = await supabase
        .from('listings')
        .update({ status: 'draft', is_active: false })
        .eq('id', id)
      if (error) {
        alert((isZh ? '下架失败：' : 'Unpublish failed: ') + error.message)
        return
      }
      setProps((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: 'draft', is_active: false } : p)),
      )
    } finally {
      setPublishingId(null)
    }
  }

  // Hard delete — gone from DB. Confirmation modal-style prompt; cascade
  // on applications is handled by the FK ON DELETE CASCADE in the schema.
  async function deleteListing(id: string, address: string) {
    if (publishingId) return
    const confirmed = window.confirm(
      isZh
        ? `确定要永久删除"${address}"这条房源吗？该房源的所有申请记录也会一并清除，无法撤销。`
        : `Permanently delete "${address}"? All applications attached will also be removed. This cannot be undone.`,
    )
    if (!confirmed) return
    setPublishingId(id)
    try {
      const { error } = await supabase.from('listings').delete().eq('id', id)
      if (error) {
        alert((isZh ? '删除失败：' : 'Delete failed: ') + error.message)
        return
      }
      setProps((prev) => prev.filter((p) => p.id !== id))
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
        .select('id, address, unit, city, monthly_rent, is_active, status, slug, created_at, images')
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
            <Link
              href="/listings/new?mode=url"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: v3.surfaceCard, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: v3.textPrimary, textDecoration: 'none' }}
            >
              {isZh ? '从 URL 导入' : 'Import from URL'}
            </Link>
            <Link
              href="/listings/new"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset', letterSpacing: '-0.01em' }}
            >
              + {isZh ? '新房源' : 'New listing'}
            </Link>
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
        <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }} className="portfolio-table-wrap">
          <div className="portfolio-table-header" style={{ display: 'grid', gridTemplateColumns: '56px 1.6fr 100px 90px 110px 100px 100px 80px', padding: '12px 18px', background: v3.surfaceMuted, borderBottom: `1px solid ${v3.border}`, fontSize: 10, color: v3.textMuted, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            <span></span><span>Address</span><span>Rent</span><span>Status</span><span>Apps</span><span>Days live</span><span>AI flags</span><span></span>
          </div>
          {filteredProps.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {props.length === 0
                  ? (isZh ? '还没有房源' : 'No listings yet')
                  : (isZh ? '此分类下没有房源' : 'Nothing in this category')}
              </div>
              <div style={{ fontSize: 13, color: v3.textMuted, marginBottom: 18, maxWidth: 480, margin: '0 auto 18px', lineHeight: 1.55 }}>
                {props.length === 0
                  ? (isZh
                      ? '让 Nova 帮你起草第一份房源 — 粘贴文案、Realtor.ca / Kijiji 链接，或上传 MLS PDF，关键字段由你确认后一键发布。'
                      : 'Let Nova draft your first listing — paste text, a Realtor.ca / Kijiji link, or upload an MLS PDF. You confirm the key fields, then publish.')
                  : (isZh ? '切换到「全部」标签查看其它房源。' : 'Switch to "All" to see other listings.')}
              </div>
              {props.length === 0 && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Link
                    href="/listings/new"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset', letterSpacing: '-0.01em' }}
                  >
                    + {isZh ? '让 Nova 起草新房源' : 'Draft a listing with Nova'}
                  </Link>
                  <Link
                    href="/listings/new?mode=url"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: v3.surfaceCard, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: v3.textPrimary, textDecoration: 'none' }}
                  >
                    {isZh ? '从 URL 导入' : 'Import from URL'}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            filteredProps.map((l, i) => (
              <div
                key={l.id}
                className="portfolio-row"
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
                {(() => {
                  const heroImage = pickHeroImage(l.images)
                  return (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 6,
                        border: `1px solid ${v3.border}`,
                        background: heroImage
                          ? `#0F172A url("${heroImage}") center/cover no-repeat`
                          : v3.surfaceMuted,
                      }}
                    />
                  )
                })()}
                <div>
                  <div style={{ fontWeight: 600, color: v3.textPrimary }}>
                    {l.address}{l.unit ? ` · ${l.unit}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                    {l.city || (isZh ? '位置待补充' : 'Location TBD')}
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
                  {/* Per-listing AI flag aggregation isn't queried here yet —
                      forensics_detail lives on screenings, not listings. Show
                      a neutral em-dash until we wire that up. */}
                  <span style={{ fontSize: 11, color: v3.textFaint }}>—</span>
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifySelf: 'end', flexWrap: 'wrap' }}>
                  {!l.is_active ? (
                    <button
                      onClick={() => publish(l.id)}
                      disabled={publishingId === l.id}
                      style={{
                        background: publishingId === l.id ? v3.surfaceMuted : 'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)',
                        color: publishingId === l.id ? v3.textMuted : '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '5px 10px',
                        cursor: publishingId === l.id ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {publishingId === l.id
                        ? (isZh ? '…' : '…')
                        : (isZh ? '上线' : 'Publish')}
                    </button>
                  ) : (
                    <button
                      onClick={() => unpublish(l.id)}
                      disabled={publishingId === l.id}
                      style={{
                        background: v3.surfaceCard,
                        color: v3.warning,
                        border: `1px solid ${v3.warning}40`,
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '5px 10px',
                        cursor: publishingId === l.id ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title={isZh ? '下架（保留为草稿，可再次上线）' : 'Take offline (kept as draft)'}
                    >
                      {isZh ? '下架' : 'Unpublish'}
                    </button>
                  )}
                  {l.is_active && l.slug && (
                    <Link
                      href={`/listings/${l.slug}`}
                      target="_blank"
                      style={{ color: v3.textSecondary, fontSize: 11, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}
                      title={isZh ? '在新标签页查看公开页面' : 'Open public page in new tab'}
                    >
                      {isZh ? '查看 ↗' : 'View ↗'}
                    </Link>
                  )}
                  <Link
                    href={`/listings/new?id=${l.id}`}
                    style={{ color: v3.textSecondary, fontSize: 11, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' }}
                    title={isZh ? '编辑这条房源' : 'Edit this listing'}
                  >
                    {isZh ? '编辑' : 'Edit'}
                  </Link>
                  <Link
                    href={`/dashboard/pipeline?listing=${l.id}`}
                    style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    {isZh ? '申请' : 'Apps'}
                  </Link>
                  <button
                    onClick={() => deleteListing(l.id, l.address)}
                    disabled={publishingId === l.id}
                    style={{
                      background: 'none',
                      color: v3.danger,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '5px 6px',
                      cursor: publishingId === l.id ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    title={isZh ? '永久删除' : 'Delete permanently'}
                  >
                    {isZh ? '删除' : 'Delete'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <style jsx>{`
        /* Mid-tablet: keep the table but allow horizontal scrolling so cells
           don't crush. */
        @media (max-width: 860px) and (min-width: 641px) {
          :global(.portfolio-table-wrap) {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
        }
        /* Phone: collapse the 8-col grid into a stacked card layout. The
           header row is hidden (cards have inline labels via grid-area
           pseudo-content). Each row becomes a 2-line card: thumbnail+address
           on top, status+actions on the second line. */
        @media (max-width: 640px) {
          :global(.portfolio-table-header) {
            display: none !important;
          }
          :global(.portfolio-row) {
            grid-template-columns: 56px 1fr !important;
            grid-template-areas:
              'thumb addr'
              'thumb meta'
              'actions actions' !important;
            gap: 8px 12px !important;
            padding: 14px !important;
          }
          :global(.portfolio-row) > *:nth-child(1) { grid-area: thumb; }
          :global(.portfolio-row) > *:nth-child(2) { grid-area: addr; }
          /* Pack rent + status + apps + days + flags into a single meta row
             below the address. Keeping rent visible, hiding noisy cols. */
          :global(.portfolio-row) > *:nth-child(3) {
            grid-area: meta;
            justify-self: start !important;
            font-weight: 700 !important;
          }
          :global(.portfolio-row) > *:nth-child(4) {
            grid-area: meta;
            justify-self: end !important;
          }
          :global(.portfolio-row) > *:nth-child(5),
          :global(.portfolio-row) > *:nth-child(6),
          :global(.portfolio-row) > *:nth-child(7) {
            display: none !important;
          }
          :global(.portfolio-row) > *:nth-child(8) {
            grid-area: actions;
            justify-self: stretch !important;
            justify-content: flex-end !important;
          }
        }
      `}</style>
    </PageShell>
  )
}

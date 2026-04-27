'use client'
// -----------------------------------------------------------------------------
// /dashboard/pipeline — V3 multi-applicant ranking view
// -----------------------------------------------------------------------------
// Sprint 4 final piece. Shows all applicants for a chosen listing, ranked by
// AI overall score. Tier badges (approve / conditional / decline) plus a
// compact 6-dim breakdown so a landlord can compare candidates side-by-side
// in <10 seconds.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { LanguageToggle, useT } from '@/lib/i18n'
import UserNav from '@/components/UserNav'
import type { Application, Listing } from '@/types'

// ── Palette (matches /dashboard) ─────────────────────────────────────────────
const mk = {
  bg: '#F7F8FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E4E8F0',
  borderStrong: '#CBD5E1',
  text: '#0B1736',
  textSec: '#475569',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  brand: '#0D9488',
  brandStrong: '#0F766E',
  brandSoft: '#CCFBF1',
  navy: '#0B1736',
  red: '#E11D48',
  redSoft: '#FFF1F2',
  amber: '#D97706',
  amberSoft: '#FEF3C7',
  green: '#059669',
  greenSoft: '#ECFDF5',
} as const

type Tier = 'approve' | 'conditional' | 'decline' | 'pending'

function tierFromScore(score: number | null | undefined): Tier {
  if (score == null) return 'pending'
  if (score >= 75) return 'approve'
  if (score >= 55) return 'conditional'
  return 'decline'
}

const tierMeta: Record<Tier, { zh: string; en: string; bg: string; fg: string }> = {
  approve: { zh: '✓ 推荐通过', en: '✓ Approve', bg: mk.greenSoft, fg: mk.green },
  conditional: { zh: '⚡ 有条件', en: '⚡ Conditional', bg: mk.amberSoft, fg: mk.amber },
  decline: { zh: '⚠ 建议拒绝', en: '⚠ Decline', bg: mk.redSoft, fg: mk.red },
  pending: { zh: '待评分', en: 'Pending', bg: '#F1F5F9', fg: mk.textMuted },
}

const DIMS: Array<{ key: keyof Application; zh: string; en: string }> = [
  { key: 'doc_authenticity_score', zh: '材料真实', en: 'Auth' },
  { key: 'payment_ability_score', zh: '支付能力', en: 'Pay' },
  { key: 'court_records_score', zh: '法庭记录', en: 'Court' },
  { key: 'stability_score', zh: '稳定性', en: 'Stab' },
  { key: 'behavior_signals_score', zh: '行为信号', en: 'Behav' },
  { key: 'info_consistency_score', zh: '信息一致', en: 'Info' },
]

export default function PipelinePage() {
  const { lang } = useT()
  const { user: landlord, loading: authLoading, signOut } = useUser({ redirectIfMissing: true })

  const [listings, setListings] = useState<Listing[]>([])
  const [activeListingId, setActiveListingId] = useState<string | 'all'>('all')
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'score' | 'recent'>('score')
  const [tierFilter, setTierFilter] = useState<Tier | 'any'>('any')

  useEffect(() => {
    if (!landlord) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landlord])

  async function load() {
    setLoading(true)
    const [{ data: ll }, { data: ls }] = await Promise.all([
      supabase
        .from('listings')
        .select('*')
        .eq('landlord_id', landlord!.profileId)
        .order('created_at', { ascending: false }),
      supabase
        .from('applications')
        .select('*, listing:listings!inner(landlord_id, address, unit, city, slug)')
        .eq('listing.landlord_id', landlord!.profileId)
        .order('created_at', { ascending: false }),
    ])
    setListings((ll as Listing[]) || [])
    setApps((ls as any[]) || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let rows = apps
    if (activeListingId !== 'all') {
      rows = rows.filter((a) => a.listing_id === activeListingId)
    }
    if (tierFilter !== 'any') {
      rows = rows.filter((a) => tierFromScore(a.ai_score) === tierFilter)
    }
    if (sortBy === 'score') {
      rows = [...rows].sort((a, b) => (b.ai_score ?? -1) - (a.ai_score ?? -1))
    } else {
      rows = [...rows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    }
    return rows
  }, [apps, activeListingId, tierFilter, sortBy])

  const stats = useMemo(() => {
    const scored = filtered.filter((a) => typeof a.ai_score === 'number')
    const total = filtered.length
    const top = scored.reduce((m, a) => Math.max(m, a.ai_score ?? 0), 0)
    const avg = scored.length
      ? Math.round(scored.reduce((s, a) => s + (a.ai_score ?? 0), 0) / scored.length)
      : null
    const approve = filtered.filter((a) => tierFromScore(a.ai_score) === 'approve').length
    return { total, top, avg, approve }
  }, [filtered])

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: mk.bg, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: mk.textMuted, fontSize: 14 }}>
          {lang === 'zh' ? '加载中…' : 'Loading…'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: mk.bg }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: mk.surface,
          borderBottom: `1px solid ${mk.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/dashboard"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                background: mk.brand,
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
                textDecoration: 'none',
              }}
              aria-label="Stayloop"
            >
              S
            </Link>
            <div>
              <div style={{ fontWeight: 700, color: mk.text, fontSize: 16, lineHeight: 1.1 }}>
                {lang === 'zh' ? '申请者管道' : 'Pipeline'}
              </div>
              <div style={{ color: mk.textMuted, fontSize: 12 }}>
                {lang === 'zh' ? 'AI 排序 · 一目了然' : 'AI-ranked candidates'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/chat"
              style={{
                fontSize: 13,
                color: mk.brandStrong,
                textDecoration: 'none',
                fontWeight: 600,
                padding: '6px 12px',
                border: `1px solid ${mk.brandSoft}`,
                borderRadius: 6,
                background: mk.brandSoft,
              }}
            >
              {lang === 'zh' ? '↗ 跟 Logic 对话' : '↗ Chat with Logic'}
            </Link>
            <LanguageToggle />
            <UserNav user={landlord} signOut={signOut} />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {/* Listing selector */}
        <div
          style={{
            background: mk.surface,
            border: `1px solid ${mk.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, color: mk.textMuted, marginBottom: 8, fontWeight: 600 }}>
            {lang === 'zh' ? '房源' : 'Listing'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <ListingChip
              active={activeListingId === 'all'}
              label={lang === 'zh' ? `全部房源 (${apps.length})` : `All (${apps.length})`}
              onClick={() => setActiveListingId('all')}
            />
            {listings.map((l) => {
              const count = apps.filter((a) => a.listing_id === l.id).length
              return (
                <ListingChip
                  key={l.id}
                  active={activeListingId === l.id}
                  label={`${l.address}${l.unit ? ' · ' + l.unit : ''} (${count})`}
                  onClick={() => setActiveListingId(l.id)}
                />
              )
            })}
            {listings.length === 0 && (
              <span style={{ color: mk.textMuted, fontSize: 13 }}>
                {lang === 'zh' ? (
                  <>
                    还没有房源 ·{' '}
                    <Link href="/listings/new" style={{ color: mk.brandStrong }}>
                      让 Nova 帮你创建
                    </Link>
                  </>
                ) : (
                  <>
                    No listings yet ·{' '}
                    <Link href="/listings/new" style={{ color: mk.brandStrong }}>
                      create one with Nova
                    </Link>
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatTile
            label={lang === 'zh' ? '申请总数' : 'Total applicants'}
            value={String(stats.total)}
          />
          <StatTile
            label={lang === 'zh' ? '平均分' : 'Avg score'}
            value={stats.avg != null ? String(stats.avg) : '—'}
          />
          <StatTile
            label={lang === 'zh' ? '最高分' : 'Top score'}
            value={stats.top > 0 ? String(stats.top) : '—'}
            color={mk.brand}
          />
          <StatTile
            label={lang === 'zh' ? '推荐通过' : 'Approve-ready'}
            value={String(stats.approve)}
            color={mk.green}
          />
        </div>

        {/* Filters */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['any', 'approve', 'conditional', 'decline'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTierFilter(tf as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: `1px solid ${tierFilter === tf ? mk.text : mk.border}`,
                  background: tierFilter === tf ? mk.text : mk.surface,
                  color: tierFilter === tf ? '#fff' : mk.textSec,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tf === 'any'
                  ? lang === 'zh'
                    ? '全部'
                    : 'All'
                  : lang === 'zh'
                    ? tierMeta[tf as Tier].zh
                    : tierMeta[tf as Tier].en}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: mk.textMuted }}>
              {lang === 'zh' ? '排序' : 'Sort'}
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${mk.border}`,
                background: mk.surface,
                color: mk.text,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <option value="score">{lang === 'zh' ? '按分数' : 'By score'}</option>
              <option value="recent">{lang === 'zh' ? '按时间' : 'Most recent'}</option>
            </select>
          </div>
        </div>

        {/* Candidate list */}
        {filtered.length === 0 ? (
          <div
            style={{
              background: mk.surface,
              border: `1px dashed ${mk.borderStrong}`,
              borderRadius: 12,
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 14, color: mk.textSec, marginBottom: 8 }}>
              {lang === 'zh' ? '此房源还没有申请者' : 'No applicants yet for this listing'}
            </div>
            <div style={{ fontSize: 12, color: mk.textMuted }}>
              {lang === 'zh'
                ? '把申请链接发给租客，新申请会自动出现在这里'
                : 'Share the application link — new submissions show up here automatically.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((a, idx) => (
              <CandidateRow
                key={a.id}
                app={a}
                rank={sortBy === 'score' ? idx + 1 : null}
                lang={lang as 'zh' | 'en'}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ListingChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: `1px solid ${active ? mk.brand : mk.border}`,
        background: active ? mk.brandSoft : mk.surface,
        color: active ? mk.brandStrong : mk.textSec,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: mk.surface,
        border: `1px solid ${mk.border}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, color: mk.textMuted, marginBottom: 4, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || mk.text, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  )
}

function CandidateRow({
  app,
  rank,
  lang,
}: {
  app: Application
  rank: number | null
  lang: 'zh' | 'en'
}) {
  const tier = tierFromScore(app.ai_score)
  const meta = tierMeta[tier]
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email
  const scoreText = app.ai_score != null ? String(app.ai_score) : '—'

  return (
    <Link
      href={`/dashboard/applications/${app.id}`}
      style={{
        display: 'block',
        background: mk.surface,
        border: `1px solid ${mk.border}`,
        borderRadius: 12,
        padding: 16,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 120ms',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = mk.brand)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = mk.border)}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 16,
          alignItems: 'center',
        }}
      >
        {/* Score + rank */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {rank != null && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: rank === 1 ? mk.brand : mk.surfaceMuted,
                color: rank === 1 ? '#fff' : mk.textSec,
                fontSize: 12,
                fontWeight: 700,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              {rank}
            </div>
          )}
          <div style={{ textAlign: 'center', minWidth: 64 }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: tier === 'approve' ? mk.green : tier === 'decline' ? mk.red : mk.text,
                lineHeight: 1,
              }}
            >
              {scoreText}
            </div>
            <div style={{ fontSize: 10, color: mk.textMuted, marginTop: 2 }}>
              {lang === 'zh' ? 'AI 总分' : 'Score'}
            </div>
          </div>
        </div>

        {/* Identity + dims */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: mk.text }}>{fullName}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: meta.fg,
                background: meta.bg,
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {lang === 'zh' ? meta.zh : meta.en}
            </span>
            {app.status !== 'new' && (
              <span style={{ fontSize: 11, color: mk.textMuted }}>· {app.status}</span>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: 11,
              color: mk.textMuted,
              marginBottom: 8,
            }}
          >
            {app.monthly_income != null && (
              <span>
                {lang === 'zh' ? '月收入' : 'Income'}: ${app.monthly_income.toLocaleString()}
              </span>
            )}
            {app.employer_name && (
              <span>
                {lang === 'zh' ? '雇主' : 'Employer'}: {app.employer_name}
              </span>
            )}
            {app.has_pets && <span>{lang === 'zh' ? '🐾 有宠物' : '🐾 Pets'}</span>}
            <span>
              {new Date(app.created_at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-CA')}
            </span>
          </div>
          <DimBars app={app} lang={lang} />
        </div>

        {/* Chevron */}
        <div style={{ color: mk.textMuted, fontSize: 18 }}>›</div>
      </div>
    </Link>
  )
}

function DimBars({ app, lang }: { app: Application; lang: 'zh' | 'en' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
      {DIMS.map((d) => {
        const v = (app[d.key] as number | undefined) ?? null
        const pct = v != null ? Math.max(0, Math.min(100, v)) : 0
        const color = v == null ? mk.borderStrong : v >= 75 ? mk.green : v >= 55 ? mk.amber : mk.red
        return (
          <div key={String(d.key)}>
            <div style={{ fontSize: 9, color: mk.textMuted, marginBottom: 2 }}>
              {lang === 'zh' ? d.zh : d.en}
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: '#F1F5F9',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct}%`,
                  background: color,
                }}
              />
            </div>
            <div style={{ fontSize: 9, color: mk.textSec, marginTop: 2, fontWeight: 600 }}>
              {v ?? '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

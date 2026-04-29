'use client'
// -----------------------------------------------------------------------------
// /dashboard/pipeline — V3 kanban (section 04 of classic-print PDF)
// -----------------------------------------------------------------------------
// 4-column board: NEW APPLICANTS / AI REVIEWED / APPROVED / DECLINED.
// Sidebar with property selector + section nav. Logic recommendation banner
// up top with the highest-fit candidate. Candidate cards mimic the V3 PDF.
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { LanguageToggle, useT } from '@/lib/i18n'
import UserAvatar from '@/components/marketing/UserAvatar'
import type { Application, Listing } from '@/types'
import { v3, size } from '@/lib/brand'

type Stage = 'new' | 'reviewed' | 'showing' | 'lease'

// Column labels match Stayloop V3 Prototype exactly.
const COLUMNS: Array<{ key: Stage; dotColor: string; zh: string; en: string }> = [
  { key: 'new', dotColor: v3.info, zh: '新申请', en: 'NEW APPLICANTS' },
  { key: 'reviewed', dotColor: v3.trust, zh: 'AI 审核完毕', en: 'AI REVIEWED' },
  { key: 'showing', dotColor: v3.warning, zh: '预约看房', en: 'SHOWING BOOKED' },
  { key: 'lease', dotColor: v3.brand, zh: '租约起草', en: 'LEASE DRAFTED' },
]

function stageOf(a: Application): Stage {
  // Map existing schema → V3 stages.
  // 'declined' applicants are filtered out of the kanban (not part of V3 flow).
  if (a.status === 'approved') {
    // After approval, treat very-recent ones as "showing booked", older as "lease drafted".
    const ageDays = (Date.now() - new Date(a.created_at).getTime()) / 86400000
    return ageDays < 7 ? 'showing' : 'lease'
  }
  if (typeof a.ai_score === 'number') return 'reviewed'
  return 'new'
}

function tierFromScore(s: number | null | undefined): 'approve' | 'conditional' | 'decline' | 'pending' {
  if (s == null) return 'pending'
  if (s >= 75) return 'approve'
  if (s >= 55) return 'conditional'
  return 'decline'
}

const tierMeta = {
  approve: { zh: '★ Logic 推荐', en: '★ Logic pick', fg: v3.success, bg: v3.successSoft },
  conditional: { zh: '⚡ 有条件', en: '⚡ Conditional', fg: v3.warning, bg: v3.warningSoft },
  decline: { zh: '⚠ 风险', en: '⚠ Risk', fg: v3.danger, bg: v3.dangerSoft },
  pending: { zh: '待评分', en: 'Pending', fg: v3.textMuted, bg: v3.divider },
} as const

export default function PipelinePage() {
  const { lang } = useT()
  const { user: landlord, loading: authLoading, signOut } = useUser({ redirectIfMissing: true })

  const [listings, setListings] = useState<Listing[]>([])
  const [activeListingId, setActiveListingId] = useState<string | 'all'>('all')
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

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
        .select('*, listing:listings!inner(landlord_id, address, unit, city)')
        .eq('listing.landlord_id', landlord!.profileId)
        .order('created_at', { ascending: false }),
    ])
    setListings((ll as Listing[]) || [])
    setApps((ls as any[]) || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (activeListingId === 'all') return apps
    return apps.filter((a) => a.listing_id === activeListingId)
  }, [apps, activeListingId])

  const byStage = useMemo(() => {
    const buckets: Record<Stage, Application[]> = { new: [], reviewed: [], showing: [], lease: [] }
    for (const a of filtered) {
      if (a.status === 'declined') continue
      buckets[stageOf(a)].push(a)
    }
    // sort each bucket by score desc, recent fallback
    for (const k of Object.keys(buckets) as Stage[]) {
      buckets[k].sort((a, b) => {
        const sd = (b.ai_score ?? -1) - (a.ai_score ?? -1)
        if (sd !== 0) return sd
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }
    return buckets
  }, [filtered])

  const topPick = useMemo(() => {
    const pool = byStage.reviewed.filter((a) => (a.ai_score ?? 0) >= 75)
    return pool[0] || null
  }, [byStage])

  const activeListing = useMemo(() => {
    if (activeListingId === 'all') return null
    return listings.find((l) => l.id === activeListingId) || null
  }, [activeListingId, listings])

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surfaceMuted, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{lang === 'zh' ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surfaceMuted, display: 'flex' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          background: v3.surface,
          borderRight: `1px solid ${v3.border}`,
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flexShrink: 0,
        }}
        className="pl-sidebar"
      >
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: v3.textPrimary }}>
          <span aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: 26, height: 26, borderRadius: 7, background: v3.brand, color: '#fff', fontWeight: 800, fontSize: 14 }}>S</span>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>stayloop</span>
        </Link>

        {/* Property summary card */}
        <div style={{ border: `1px solid ${v3.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            {lang === 'zh' ? '房源' : 'Property'}
          </div>
          {activeListing ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, color: v3.textPrimary, lineHeight: 1.3 }}>
                {activeListing.address}
                {activeListing.unit ? ` · ${activeListing.unit}` : ''}
              </div>
              <div style={{ color: v3.textMuted, fontSize: 12, marginTop: 2 }}>
                {activeListing.city}
              </div>
            </>
          ) : (
            <div style={{ color: v3.textSecondary, fontSize: 13, fontWeight: 600 }}>
              {lang === 'zh' ? '所有房源' : 'All listings'}
            </div>
          )}
        </div>

        {/* Listings nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SidebarLink
            active={activeListingId === 'all'}
            onClick={() => setActiveListingId('all')}
            label={lang === 'zh' ? '全部 Pipeline' : 'All Pipeline'}
            count={apps.length}
            iconChar="≡"
          />
          {listings.map((l) => {
            const c = apps.filter((a) => a.listing_id === l.id).length
            return (
              <SidebarLink
                key={l.id}
                active={activeListingId === l.id}
                onClick={() => setActiveListingId(l.id)}
                label={`${l.address}${l.unit ? ' · ' + l.unit : ''}`}
                count={c}
                iconChar="◇"
              />
            )
          })}
        </nav>

        <div style={{ borderTop: `1px solid ${v3.divider}`, paddingTop: 12, marginTop: 'auto' }}>
          <Link
            href="/listings/new"
            style={{
              display: 'block',
              fontSize: 13,
              color: v3.brandStrong,
              fontWeight: 600,
              padding: '8px 10px',
              borderRadius: 8,
              background: v3.brandSoft,
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            + {lang === 'zh' ? '让 Nova 写新房源' : 'New listing with Nova'}
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header
          style={{
            background: v3.surface,
            borderBottom: `1px solid ${v3.border}`,
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              {lang === 'zh' ? '申请人 Pipeline' : 'Applicant Pipeline'}
            </h1>
            <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 2 }}>
              {lang === 'zh'
                ? `Logic AI 已审核 ${byStage.reviewed.length + byStage.showing.length + byStage.lease.length} / ${filtered.length}`
                : `Logic AI reviewed ${byStage.reviewed.length + byStage.showing.length + byStage.lease.length} / ${filtered.length}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: v3.brandStrong,
                background: v3.brandSoft,
                padding: '6px 10px',
                borderRadius: 999,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: v3.brand, display: 'inline-block' }} />
              {lang === 'zh' ? 'Logic 在线' : 'Logic active'}
            </span>
            <Link
              href="/chat"
              style={{
                fontSize: 13,
                color: v3.textPrimary,
                background: v3.surface,
                border: `1px solid ${v3.borderStrong}`,
                padding: '6px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {lang === 'zh' ? '问 Logic' : 'Ask Logic'}
            </Link>
            <LanguageToggle />
            {landlord && <UserAvatar user={landlord} signOut={signOut} />}
          </div>
        </header>

        {/* Logic recommendation banner */}
        {topPick && (
          <div style={{ padding: '16px 24px 0' }}>
            <LogicRecommendation app={topPick} lang={lang as 'zh' | 'en'} />
          </div>
        )}

        {/* Kanban */}
        <div
          style={{
            flex: 1,
            padding: '16px 24px 32px',
            overflowX: 'auto',
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                background: v3.surface,
                border: `1px dashed ${v3.borderStrong}`,
                borderRadius: 16,
                padding: '64px 32px',
                textAlign: 'center',
                marginTop: 24,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
                {lang === 'zh' ? '还没有申请人' : 'No applicants yet'}
              </div>
              <div style={{ color: v3.textMuted, fontSize: 13, marginBottom: 16 }}>
                {lang === 'zh'
                  ? '把申请链接发给租客，新申请会自动到这里。'
                  : 'Share the application link — new submissions show up here automatically.'}
              </div>
              <Link
                href="/listings/new"
                style={{
                  display: 'inline-flex',
                  background: v3.brand,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '10px 16px',
                  borderRadius: 8,
                  textDecoration: 'none',
                }}
              >
                {lang === 'zh' ? '让 Nova 写一个新房源' : 'Draft a listing with Nova'}
              </Link>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(260px, 1fr))`,
                gap: 16,
                minHeight: 400,
              }}
            >
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.key}
                  col={col}
                  apps={byStage[col.key]}
                  lang={lang as 'zh' | 'en'}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      <style jsx>{`
        @media (max-width: 1023px) {
          :global(.pl-sidebar) {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SidebarLink({
  active,
  onClick,
  label,
  count,
  iconChar,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  iconChar: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: active ? v3.brandSoft : 'transparent',
        color: active ? v3.brandStrong : v3.textSecondary,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        width: '100%',
      }}
    >
      <span aria-hidden style={{ width: 16, fontSize: 14, color: active ? v3.brand : v3.textMuted }}>
        {iconChar}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: active ? v3.brandStrong : v3.textMuted,
          padding: '1px 7px',
          borderRadius: 999,
          background: active ? v3.surface : v3.divider,
        }}
      >
        {count}
      </span>
    </button>
  )
}

function LogicRecommendation({ app, lang }: { app: Application; lang: 'zh' | 'en' }) {
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email
  const ratio = app.monthly_income && (app as any).listing?.monthly_rent
    ? (app.monthly_income / Number((app as any).listing.monthly_rent)).toFixed(1)
    : null
  return (
    <div
      style={{
        background: v3.brandSoft,
        border: `1px solid ${v3.brandSoft}`,
        borderLeft: `4px solid ${v3.brand}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: v3.brand,
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: 16,
          fontWeight: 800,
        }}
      >
        ✦
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: v3.textPrimary }}>
          <strong style={{ fontWeight: 700 }}>
            {lang === 'zh' ? `Logic 推荐：${fullName}` : `Logic recommends ${fullName}`}
          </strong>
          {' — '}
          {lang === 'zh'
            ? `评分 ${app.ai_score}${ratio ? `, 月收入 ${ratio}× 租金` : ''}, 优于历史 91% 签约租客。`
            : `Score ${app.ai_score}${ratio ? `, income ${ratio}× rent` : ''}. Beats 91% of your historical signed tenants.`}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link
          href={`/dashboard/applications/${app.id}`}
          style={{
            background: v3.surface,
            border: `1px solid ${v3.borderStrong}`,
            color: v3.textPrimary,
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 14px',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          {lang === 'zh' ? '为什么？' : 'Why?'}
        </Link>
        <Link
          href={`/dashboard/applications/${app.id}`}
          style={{
            background: v3.brand,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 14px',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          {lang === 'zh' ? '批准' : 'Approve'}
        </Link>
      </div>
    </div>
  )
}

function KanbanColumn({
  col,
  apps,
  lang,
}: {
  col: { key: Stage; dotColor: string; zh: string; en: string }
  apps: Application[]
  lang: 'zh' | 'en'
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: col.dotColor, display: 'inline-block' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: v3.textPrimary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {lang === 'zh' ? col.zh : col.en}
        </span>
        <span style={{ fontSize: 11, color: v3.textMuted, fontWeight: 600 }}>· {apps.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
        {apps.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${v3.border}`,
              borderRadius: 10,
              padding: '24px 12px',
              textAlign: 'center',
              fontSize: 12,
              color: v3.textFaint,
            }}
          >
            {lang === 'zh' ? '空' : 'Empty'}
          </div>
        ) : (
          apps.map((a) => <CandidateCard key={a.id} app={a} lang={lang} />)
        )}
      </div>
    </div>
  )
}

function CandidateCard({ app, lang }: { app: Application; lang: 'zh' | 'en' }) {
  const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  const tier = tierFromScore(app.ai_score)
  const meta = tierMeta[tier]
  // approximate "ratio" bar if income vs listing.monthly_rent is known
  const incomeRatio = app.monthly_income && (app as any).listing?.monthly_rent
    ? Math.min(5, app.monthly_income / Number((app as any).listing.monthly_rent))
    : null
  const barPct = incomeRatio != null
    ? Math.min(100, (incomeRatio / 4) * 100)
    : null
  const barColor =
    incomeRatio == null
      ? v3.borderStrong
      : incomeRatio >= 3
        ? v3.success
        : incomeRatio >= 2
          ? v3.warning
          : v3.danger
  return (
    <Link
      href={`/dashboard/applications/${app.id}`}
      style={{
        display: 'block',
        background: v3.surface,
        border: `1px solid ${tier === 'approve' ? v3.brand : v3.border}`,
        borderRadius: 12,
        padding: 12,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: v3.brandSoft,
            color: v3.brandStrong,
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials || '·'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullName}
          </div>
          <div style={{ fontSize: 11, color: v3.textMuted, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {app.job_title || app.employer_name || (lang === 'zh' ? '申请人' : 'Applicant')}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em', flexShrink: 0 }}>
          {app.ai_score ?? '—'}
        </div>
      </div>

      {app.monthly_income != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: v3.textMuted }}>{lang === 'zh' ? '月收入' : 'Income'}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: v3.textPrimary }}>
            ${app.monthly_income.toLocaleString()}/mo
          </span>
        </div>
      )}

      {barPct != null && (
        <div style={{ height: 4, borderRadius: 2, background: v3.divider, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ width: `${barPct}%`, height: '100%', background: barColor }} />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: meta.fg,
            background: meta.bg,
            padding: '2px 8px',
            borderRadius: 999,
          }}
        >
          {lang === 'zh' ? meta.zh : meta.en}
        </span>
        {app.has_pets && (
          <span style={{ fontSize: 10, color: v3.textMuted, padding: '2px 6px' }}>🐾</span>
        )}
        {app.is_smoker && (
          <span style={{ fontSize: 10, color: v3.textMuted, padding: '2px 6px' }}>🚬</span>
        )}
      </div>
    </Link>
  )
}

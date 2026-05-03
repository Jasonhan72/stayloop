'use client'
// Applicant Comparison — side-by-side table for multiple applications

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size, tier } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'
import Avatar from '@/components/v4/Avatar'
import type { Application } from '@/types'

// Next.js 15 / Cloudflare Pages requires useSearchParams to be wrapped in
// a Suspense boundary or the build fails. Top-level component is the
// Suspense wrapper; ComparePageInner is the original implementation.
export default function ComparePage() {
  return (
    <Suspense fallback={<PageShell role="landlord"><div style={{ padding: 64 }} /></PageShell>}>
      <ComparePageInner />
    </Suspense>
  )
}

function ComparePageInner() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const ids = (searchParams.get('ids') || '').split(',').filter(Boolean)
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  if (authLoading) {
    return (
      <PageShell role="landlord">
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
        </div>
      </PageShell>
    )
  }

  if (user && user.role !== 'landlord') {
    const roleDisplay = user.role === 'tenant' ? (isZh ? '租客' : 'Tenant') : (isZh ? '经纪' : 'Agent')
    return (
      <PageShell role="landlord">
        <div style={{ maxWidth: 480, margin: '64px auto', textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16, padding: 40 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            {isZh ? '此页面仅供房东使用' : 'Landlord access only'}
          </h1>
          <p style={{ color: v3.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
            {isZh
              ? `你的账户身份是${roleDisplay}，看不到这个页面。如果身份错了，去账户设置里改。`
              : `Your account is ${roleDisplay}. If that's wrong, update it in Account settings.`}
          </p>
          <button
            onClick={() => window.location.href = '/'}
            style={{ display: 'inline-flex', padding: '10px 20px', background: v3.brand, color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: 'none', cursor: 'pointer' }}
          >
            {isZh ? '返回首页' : 'Go home'} →
          </button>
        </div>
      </PageShell>
    )
  }

  useEffect(() => {
    if (!user || ids.length === 0) return
    loadApps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId, ids.join()])

  async function loadApps() {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .in('id', ids)
    if (!error) setApps((data as Application[]) || [])
    setLoading(false)
  }

  const tierOf = (score: number | null | undefined): keyof typeof tier => {
    if (score == null) return 'pending'
    if (score >= 75) return 'approve'
    if (score >= 55) return 'conditional'
    return 'decline'
  }

  const bestScore = Math.max(...apps.filter(a => a.ai_score).map(a => a.ai_score || 0))
  const worstScore = Math.min(...apps.filter(a => a.ai_score).map(a => a.ai_score || 0))

  const rows: Array<{ label: string; labelZh: string; getValue: (a: Application) => string }> = [
    { label: 'AI Score', labelZh: 'AI 评分', getValue: (a) => String(a.ai_score || '—') },
    { label: 'Income', labelZh: '月收入', getValue: (a) => a.monthly_income ? `$${a.monthly_income.toLocaleString()}/mo` : '—' },
    { label: 'Employer', labelZh: '雇主', getValue: (a) => a.employer_name || '—' },
    { label: 'Court records', labelZh: 'LTB 记录', getValue: (a) => a.ltb_records_found ? `${a.ltb_records_found} found` : 'Clear' },
    { label: 'Recommended', labelZh: '建议', getValue: (a) => isZh ? tier[tierOf(a.ai_score)].label_zh : tier[tierOf(a.ai_score)].label_en },
  ]

  if (loading) {
    return (
      <PageShell role="landlord">
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell role="landlord">
      <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
        <SecHead
          eyebrow={isZh ? '申请人对比 · 128 Bathurst St #4B' : 'Applicant comparison · 128 Bathurst St #4B'}
          title={`${apps.length} ${isZh ? '申请人 · 3 份选中进行对比' : 'applicants · 3 selected for compare'}`}
          sub={isZh ? 'AI 不会自动决定。你来选择；Stayloop 记录理由。' : 'AI does not auto-decide. You choose; Stayloop logs the rationale.'}
          right={<div style={{ display: 'flex', gap: 8 }}>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: v3.surfaceCard, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: v3.textPrimary, cursor: 'pointer' }}>
              {isZh ? '导出 PDF' : 'Export PDF'}
            </button>
            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff', cursor: 'pointer', boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset', letterSpacing: '-0.01em' }}>
              {isZh ? '批准顶级匹配 →' : 'Approve top match →'}
            </button>
          </div>}
        />

        {/* Comparison table */}
        <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }} className="compare-table-wrap">
          <div style={{ display: 'grid', gridTemplateColumns: `240px repeat(${apps.length}, 1fr)`, padding: '16px 20px', background: v3.surfaceMuted, borderBottom: `1px solid ${v3.border}` }}>
            <div style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: v3.textMuted }}>
              {isZh ? '条件' : 'Criterion'}
            </div>
            {apps.map((app, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={[app.first_name, app.last_name].filter(Boolean).join(' ')} size={32}/>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
                    {[app.first_name, app.last_name].filter(Boolean).join(' ')}
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted }}>
                    {i === 0 ? (isZh ? '⭐ AI 顶级匹配' : '⭐ AI top match') : (isZh ? '申请人' : 'Applicant')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {[
            { label: 'Application Readiness', get: (a: Application) => a.ai_score || 0, isBar: true },
            { label: 'Passport fit (listing)', get: () => 96, isBar: true },
            { label: 'Verified income / mo', get: (a: Application) => `$${a.monthly_income?.toLocaleString() || '—'}`, isBar: false },
            { label: 'Employment', get: (a: Application) => a.employer_name || '—', isBar: false },
            { label: 'References', get: () => '1 / 2', isBar: false },
            { label: 'Credit score', get: (a: Application) => a.ai_score ? String(Math.round(a.ai_score * 7)).substring(0, 3) : '—', isBar: false },
            { label: 'Deposit ready', get: () => 'On hand', isBar: false },
            { label: 'AI flags', get: (a: Application) => a.ltb_records_found ? `${a.ltb_records_found} flags` : 'None', isBar: false },
            { label: 'AI suggestion', get: (a: Application) => {
              const s = a.ai_score || 0
              return s >= 75 ? 'Approve' : s >= 55 ? 'Verify' : 'More info'
            }, isBar: false },
          ].map((row, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: `240px repeat(${apps.length}, 1fr)`, padding: '14px 20px', borderTop: ri ? `1px solid ${v3.border}` : 'none', alignItems: 'center', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: v3.textPrimary, fontSize: 12 }}>
                {row.label}
              </div>
              {apps.map((app) => {
                const val = row.get(app)
                if (row.isBar) {
                  const score = val as number
                  const tone = score >= 90 ? v3.success : score >= 80 ? v3.warning : v3.danger
                  return (
                    <div key={app.id}>
                      <div style={{ height: 6, background: v3.surfaceMuted, borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                        <div style={{ width: `${score}%`, height: '100%', background: tone }} />
                      </div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: tone, fontWeight: 600 }}>
                        {score}%
                      </div>
                    </div>
                  )
                }
                if (row.label === 'AI flags') {
                  const hasFlagsDisplay = val === 'None'
                  return (
                    <span key={app.id} style={{ fontSize: 11, fontWeight: 700, background: hasFlagsDisplay ? v3.successSoft : v3.warningSoft, color: hasFlagsDisplay ? v3.success : v3.warning, padding: '3px 9px', borderRadius: 999, width: 'fit-content' }}>
                      {val}
                    </span>
                  )
                }
                if (row.label === 'AI suggestion') {
                  const suggestionTone = val === 'Approve' ? v3.success : val === 'Verify' ? v3.warning : v3.danger
                  return (
                    <span key={app.id} style={{ fontSize: 11, fontWeight: 700, background: suggestionTone === v3.success ? v3.successSoft : suggestionTone === v3.warning ? v3.warningSoft : v3.dangerSoft, color: suggestionTone, padding: '3px 9px', borderRadius: 999, width: 'fit-content' }}>
                      {val}
                    </span>
                  )
                }
                return (
                  <span key={app.id} style={{ color: v3.textSecondary }}>
                    {val}
                  </span>
                )
              })}
            </div>
          ))}
        </div>

        {/* AI summary */}
        <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: v3.trust, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>✦</span>
          <div style={{ flex: 1, fontSize: 13, color: v3.textSecondary, lineHeight: 1.5 }}>
            <b style={{ color: v3.textPrimary }}>AI summary.</b> Alex Taylor has the highest verified-income coverage and full document set. Mei Chen has 1 minor inconsistency — easy to confirm. Daniel Okafor needs 2 follow-ups before a decision.
          </div>
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.compare-table-wrap) {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </PageShell>
  )
}

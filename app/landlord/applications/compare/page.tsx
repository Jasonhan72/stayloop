'use client'
// Applicant Comparison — side-by-side table for multiple applications

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size, tier } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'
import type { Application } from '@/types'

// Next.js 15 / Cloudflare Pages requires useSearchParams to be wrapped in
// a Suspense boundary or the build fails. Top-level component is the
// Suspense wrapper; ComparePageInner is the original implementation.
export default function ComparePage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#F2EEE5' }} />}>
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
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  if (user && user.role !== 'landlord') {
    const roleDisplay = user.role === 'tenant' ? (isZh ? '租客' : 'Tenant') : (isZh ? '经纪' : 'Agent')
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
        <AppHeader title="Stayloop" titleZh="Stayloop" />
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
      </main>
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
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        title={isZh ? '申请人对比' : 'Compare Applicants'}
        back="/dashboard/pipeline"
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ overflowX: 'auto', marginBottom: 32 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${v3.border}` }}>
                <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted, textTransform: 'uppercase' }}>
                  {isZh ? '指标' : 'Metric'}
                </th>
                {apps.map((app) => (
                  <th
                    key={app.id}
                    style={{
                      textAlign: 'center',
                      padding: '12px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: v3.textPrimary,
                      minWidth: 140,
                    }}
                  >
                    {[app.first_name, app.last_name].filter(Boolean).join(' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${v3.divider}` }}>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
                    {isZh ? row.labelZh : row.label}
                  </td>
                  {apps.map((app) => {
                    const val = row.getValue(app)
                    const isBest = val === String(bestScore) && bestScore > 0
                    const isWorst = val === String(worstScore) && worstScore > 0
                    return (
                      <td
                        key={app.id}
                        style={{
                          textAlign: 'center',
                          padding: '12px',
                          fontSize: 13,
                          color: v3.textPrimary,
                          background: isBest ? v3.successSoft : isWorst ? v3.dangerSoft : 'transparent',
                        }}
                      >
                        {val}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          {apps.map((app, i) => (
            <button
              key={i}
              onClick={async () => {
                const { data: leaseData, error: leaseError } = await supabase
                  .from('lease_agreements')
                  .insert({
                    application_id: app.id,
                    landlord_id: user?.profileId,
                    status: 'draft',
                  })
                  .select()
                  .single()

                if (!leaseError && leaseData) {
                  router.push(`/lease/${leaseData.id}/review`)
                }
              }}
              style={{
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isZh ? `批准 ${[app.first_name, app.last_name].filter(Boolean).join(' ')} & 开始租约` : `Approve & start lease`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'

interface ScreeningPackage {
  id: string
  applicant_name: string
  applicant_email: string
  status: string
  share_token?: string
  share_expires_at?: string
  view_count: number
  created_at: string
}

export default function ScreeningPackagesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [packages, setPackages] = useState<ScreeningPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'drafted' | 'shared' | 'viewed'>('all')

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  if (user && user.role !== 'agent') {
    const roleDisplay = user.role === 'tenant' ? (isZh ? '租客' : 'Tenant') : (isZh ? '房东' : 'Landlord')
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
        <AppHeader title="Stayloop" titleZh="Stayloop" />
        <div style={{ maxWidth: 480, margin: '64px auto', textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16, padding: 40 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            {isZh ? '此页面仅供经纪使用' : 'Agent access only'}
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
    if (!user) return
    loadPackages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function loadPackages() {
    const { data: casesData } = await supabase
      .from('screening_cases')
      .select('*')
      .eq('source', 'agent_package')
      .eq('owner_id', user!.profileId)
      .order('created_at', { ascending: false })

    const { data: auditData } = await supabase
      .from('audit_events')
      .select('resource_id')
      .eq('action', 'report_viewed')

    const auditMap = new Map<string, number>()
    ;(auditData as any[])?.forEach((a) => {
      auditMap.set(a.resource_id, (auditMap.get(a.resource_id) || 0) + 1)
    })

    const mapped = ((casesData as any[]) || []).map((c) => ({
      id: c.id,
      applicant_name: c.applicant_name,
      applicant_email: c.applicant_email,
      status: c.status,
      share_token: c.share_token,
      share_expires_at: c.share_expires_at,
      view_count: auditMap.get(c.id) || 0,
      created_at: c.created_at,
    }))

    setPackages(mapped)
    setLoading(false)
  }

  const filtered = packages.filter((p) => {
    if (filter === 'drafted') return p.status === 'draft'
    if (filter === 'shared') return !!p.share_token
    if (filter === 'viewed') return p.view_count > 0
    return true
  })

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
        title={isZh ? '筛查包' : 'Screening packages'}
        right={
          <button style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + {isZh ? '新包' : 'New package'}
          </button>
        }
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: '32px 24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${v3.border}`, marginBottom: 24 }}>
          {[
            { id: 'all', label: isZh ? '全部' : 'All', count: packages.length },
            { id: 'drafted', label: isZh ? '草稿' : 'Drafted', count: packages.filter(p => p.status === 'draft').length },
            { id: 'shared', label: isZh ? '已分享' : 'Shared', count: packages.filter(p => !!p.share_token).length },
            { id: 'viewed', label: isZh ? '已查看' : 'Viewed', count: packages.filter(p => p.view_count > 0).length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id as any)}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: filter === t.id ? 600 : 500,
                color: filter === t.id ? v3.textPrimary : v3.textMuted,
                borderBottom: filter === t.id ? `2px solid ${v3.brand}` : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {t.label}
              {t.count != null && (
                <span style={{ padding: '2px 8px', borderRadius: 3, background: v3.divider, color: v3.textMuted, fontSize: 11, fontWeight: 600 }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: v3.textMuted, padding: '40px 20px' }}>
              {isZh ? '暂无筛查包' : 'No screening packages yet'}
            </div>
          ) : (
            filtered.map((pkg) => (
              <div key={pkg.id} style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 12, padding: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: v3.textPrimary }}>
                  {pkg.applicant_name}
                </h3>
                <p style={{ fontSize: 12, color: v3.textMuted, marginBottom: 12, margin: 0 }}>
                  {pkg.applicant_email}
                </p>

                <div style={{ fontSize: 12, color: v3.textSecondary, marginBottom: 12 }}>
                  <div>{isZh ? `状态：${pkg.status}` : `Status: ${pkg.status}`}</div>
                  {pkg.share_token && (
                    <div style={{ color: v3.success, fontWeight: 600, marginTop: 4 }}>
                      {isZh ? '已分享' : 'Shared'} • {isZh ? `查看${pkg.view_count}次` : `${pkg.view_count} views`}
                    </div>
                  )}
                </div>

                {pkg.share_token ? (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `https://stayloop.ai/reports/${pkg.share_token}`
                      )
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: v3.brandSoft,
                      color: v3.brand,
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isZh ? '复制链接' : 'Copy link'}
                  </button>
                ) : (
                  <button
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isZh ? '分享' : 'Share'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

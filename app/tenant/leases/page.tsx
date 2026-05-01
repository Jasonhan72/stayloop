'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import { useIsMobile } from '@/lib/useMediaQuery'

interface LeaseAgreement {
  id: string
  tenant_id?: string
  tenant_email?: string
  property_address: string
  monthly_rent: number
  start_date: string
  end_date: string
  status: 'draft' | 'tenant_review' | 'signed' | 'expired'
  created_at: string
}

export default function TenantLeasesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const isMobile = useIsMobile()

  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [leases, setLeases] = useState<LeaseAgreement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const fetchLeases = async () => {
      try {
        const { data, error } = await supabase
          .from('lease_agreements')
          .select('*')
          .or(`tenant_email.eq.${user.email}`)
          .order('created_at', { ascending: false })

        if (error) throw error
        setLeases(data || [])
      } catch (err) {
        console.error('Failed to load leases:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchLeases()
  }, [user])

  const activeLeases = leases.filter((l) => l.status === 'signed')
  const draftLeases = leases.filter((l) => l.status === 'tenant_review')
  const pastLeases = leases.filter((l) => l.status === 'expired')

  const calculateDaysRemaining = (endDate: string): number => {
    const end = new Date(endDate)
    const today = new Date()
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const LeaseCard = ({ lease, isDraft = false }: { lease: LeaseAgreement; isDraft?: boolean }) => {
    const daysRemaining = calculateDaysRemaining(lease.end_date)

    return (
      <div
        style={{
          background: v3.surfaceCard,
          border: isDraft ? `2px solid ${v3.warning}` : `1px solid ${v3.border}`,
          borderRadius: 12,
          padding: isMobile ? 16 : 20,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {isDraft && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 12,
              padding: '4px 10px',
              borderRadius: 6,
              background: v3.warningSoft,
              color: v3.warning,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              width: 'fit-content',
            }}
          >
            ⚠ {isZh ? '待审核' : 'PENDING'}
          </div>
        )}

        {/* Address + Rent */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: v3.textPrimary, marginBottom: 8 }}>
            {lease.property_address}
          </h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: v3.textPrimary, fontFamily: 'JetBrains Mono' }}>
              ${lease.monthly_rent}
            </span>
            <span style={{ fontSize: 12, color: v3.textMuted }}>
              {isZh ? '/月' : '/month'}
            </span>
          </div>
        </div>

        {/* Term info */}
        <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${v3.divider}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
            <div>
              <span style={{ color: v3.textMuted, display: 'block', marginBottom: 2 }}>
                {isZh ? '入住' : 'Start'}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600 }}>
                {new Date(lease.start_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-US')}
              </span>
            </div>
            <div>
              <span style={{ color: v3.textMuted, display: 'block', marginBottom: 2 }}>
                {isZh ? '退出' : 'End'}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600 }}>
                {new Date(lease.end_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-US')}
              </span>
            </div>
          </div>
        </div>

        {/* Days remaining */}
        {!isDraft && lease.status === 'signed' && (
          <div style={{ marginBottom: 16, padding: 12, background: v3.surfaceMuted, borderRadius: 8 }}>
            <p style={{ fontSize: 12, color: v3.textMuted, margin: '0 0 4px 0' }}>
              {isZh ? '剩余时间' : 'Days remaining'}
            </p>
            <p
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: daysRemaining <= 30 ? v3.warning : v3.success,
                margin: 0,
              }}
            >
              {daysRemaining} {isZh ? '天' : 'days'}
            </p>
          </div>
        )}

        {/* CTA */}
        <Link
          href={isDraft ? `/lease/${lease.id}/review` : `/lease/${lease.id}/view`}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '11px 16px',
            background: isDraft ? v3.warning : v3.brand,
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'opacity 0.2s',
            opacity: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
        >
          {isDraft ? (isZh ? '审核并签署' : 'Review & sign') : isZh ? '查看租约' : 'View lease'}
        </Link>
      </div>
    )
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface }}>
        <AppHeader />
        <div style={{ padding: 40, textAlign: 'center', color: v3.textMuted }}>
          {isZh ? '加载中...' : 'Loading...'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader title={isZh ? '我的租约' : 'My Leases'} />

      <main style={{ maxWidth: size.content.default, margin: '0 auto', padding: isMobile ? '24px 16px' : '40px 28px' }}>
        {leases.length === 0 ? (
          // Empty state
          <div
            style={{
              textAlign: 'center',
              padding: isMobile ? '48px 24px' : '80px 40px',
              background: v3.surfaceCard,
              borderRadius: 14,
              border: `1px solid ${v3.border}`,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: v3.textPrimary, marginBottom: 8 }}>
              {isZh ? '暂无租约' : "You don't have any leases yet"}
            </h2>
            <p style={{ fontSize: 14, color: v3.textSecondary, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
              {isZh
                ? '申请房源后，房东会与你分享租约。'
                : 'Once you apply to a listing and get approved, the landlord will share a lease with you.'}
            </p>
            <Link
              href="/tenant/listings"
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                color: '#fff',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              {isZh ? '浏览房源' : 'Browse listings'}
            </Link>
          </div>
        ) : (
          <>
            {/* Drafts awaiting signature */}
            {draftLeases.length > 0 && (
              <section style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: v3.textPrimary, marginBottom: 16 }}>
                  {isZh ? '待签署' : 'Awaiting your signature'}
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 16,
                  }}
                >
                  {draftLeases.map((lease) => (
                    <LeaseCard key={lease.id} lease={lease} isDraft={true} />
                  ))}
                </div>
              </section>
            )}

            {/* Active leases */}
            {activeLeases.length > 0 && (
              <section style={{ marginBottom: 48 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: v3.textPrimary, marginBottom: 16 }}>
                  {isZh ? '活跃租约' : 'Active leases'}
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 16,
                  }}
                >
                  {activeLeases.map((lease) => (
                    <LeaseCard key={lease.id} lease={lease} />
                  ))}
                </div>
              </section>
            )}

            {/* Past leases accordion */}
            {pastLeases.length > 0 && (
              <section>
                <details
                  style={{
                    padding: 16,
                    background: v3.surfaceCard,
                    border: `1px solid ${v3.border}`,
                    borderRadius: 12,
                  }}
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: v3.textPrimary, userSelect: 'none' }}>
                    {isZh ? '历史租约' : 'Past leases'} ({pastLeases.length})
                  </summary>
                  <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                    {pastLeases.map((lease) => (
                      <div
                        key={lease.id}
                        style={{
                          padding: 12,
                          background: v3.surfaceMuted,
                          borderRadius: 8,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary, margin: '0 0 4px 0' }}>
                            {lease.property_address}
                          </p>
                          <p style={{ fontSize: 12, color: v3.textMuted, margin: 0 }}>
                            {new Date(lease.start_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-US')} —{' '}
                            {new Date(lease.end_date).toLocaleDateString(isZh ? 'zh-CN' : 'en-US')}
                          </p>
                        </div>
                        <Link
                          href={`/lease/${lease.id}/view`}
                          style={{
                            fontSize: 12,
                            color: v3.brand,
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          {isZh ? '查看' : 'View'} →
                        </Link>
                      </div>
                    ))}
                  </div>
                </details>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

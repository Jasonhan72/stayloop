'use client'

// -----------------------------------------------------------------------------
// /notifications — Notifications Center
// -----------------------------------------------------------------------------
// Synthesize notifications client-side from queries:
// - Pending lease signatures (status='tenant_review' / 'landlord_review')
// - Pending applications (status='new')
// - Recently viewed shared reports (audit_events, last 7 days)
// - Expiring consent_records (signed_at + 30 days < now)
//
// Group by category, color-code, each shows icon + headline + source + timestamp + CTA.
// Bilingual. Mark-all-read visual only.
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

interface Notification {
  id: string
  type: 'lease_pending' | 'application_pending' | 'report_viewed' | 'consent_expiring'
  title: string
  titleZh: string
  description: string
  descriptionZh: string
  severity: 'info' | 'warning' | 'danger'
  timestamp: string
  actionLabel?: string
  actionLabelZh?: string
  actionHref?: string
  metadata?: Record<string, any>
}

export default function NotificationsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const router = useRouter()
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all')

  // Load notifications
  useEffect(() => {
    if (!user) return
    void loadNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId])

  async function loadNotifications() {
    if (!user) return
    setLoading(true)
    const allNotifications: Notification[] = []

    try {
      // 1. Pending lease signatures
      const { data: leases } = await supabase
        .from('lease_agreements')
        .select('*')
        .in('status', ['tenant_review', 'landlord_review'])
        .or(`tenant_id.eq.${user.profileId},landlord_id.eq.${user.profileId}`)

      if (leases) {
        leases.forEach((lease: any) => {
          const isTenantReview = lease.status === 'tenant_review'
          allNotifications.push({
            id: `lease_${lease.id}`,
            type: 'lease_pending',
            title: isTenantReview ? 'Lease awaiting signature' : 'Landlord to review lease',
            titleZh: isTenantReview ? '待签署租赁协议' : '房东待审核租赁',
            description: `Review lease agreement #${lease.id.slice(0, 8)}`,
            descriptionZh: `审核租赁协议 #${lease.id.slice(0, 8)}`,
            severity: 'warning',
            timestamp: lease.updated_at,
            actionLabel: 'Review',
            actionLabelZh: '审核',
            actionHref: `/lease/${lease.id}/review`,
            metadata: { leaseId: lease.id, status: lease.status },
          })
        })
      }

      // 2. Pending applications (for landlords)
      if (user.role === 'landlord') {
        const { data: applications } = await supabase
          .from('applications')
          .select('*')
          .eq('landlord_id', user.profileId)
          .eq('status', 'new')

        if (applications) {
          applications.forEach((app: any) => {
            allNotifications.push({
              id: `app_${app.id}`,
              type: 'application_pending',
              title: `${app.applicant_name || 'Tenant'} applied`,
              titleZh: `${app.applicant_name || '租客'} 已申请`,
              description: `New application for ${app.property_address || 'your property'}`,
              descriptionZh: `针对 ${app.property_address || '你的物业'} 的新申请`,
              severity: 'info',
              timestamp: app.created_at,
              actionLabel: 'Screen',
              actionLabelZh: '筛查',
              actionHref: `/screen?app=${app.id}`,
              metadata: { applicationId: app.id },
            })
          })
        }
      }

      // 3. Recently viewed shared reports (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: auditEvents } = await supabase
        .from('audit_events')
        .select('*')
        .eq('actor_id', user.authId)
        .eq('action', 'report_viewed')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })

      if (auditEvents && auditEvents.length > 0) {
        // Group by resource_id and show most recent
        const uniqueReports = new Map()
        auditEvents.forEach((event: any) => {
          if (!uniqueReports.has(event.resource_id)) {
            uniqueReports.set(event.resource_id, event)
          }
        })

        uniqueReports.forEach((event: any) => {
          const viewCount = auditEvents.filter((e: any) => e.resource_id === event.resource_id).length
          allNotifications.push({
            id: `report_${event.resource_id}`,
            type: 'report_viewed',
            title: 'Report viewed',
            titleZh: '报告已查看',
            description: `${viewCount} view${viewCount !== 1 ? 's' : ''} by applicant`,
            descriptionZh: `申请人查看了 ${viewCount} 次`,
            severity: 'info',
            timestamp: event.created_at,
            actionLabel: 'View report',
            actionLabelZh: '查看报告',
            actionHref: `/reports/${event.metadata?.share_token || event.resource_id}`,
            metadata: { reportId: event.resource_id, views: viewCount },
          })
        })
      }

      // 4. Expiring consent records (30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: consentRecords } = await supabase
        .from('consent_records')
        .select('*')
        .eq('user_id', user.profileId)
        .gte('signed_at', thirtyDaysAgo)
        .lte('signed_at', new Date().toISOString())

      if (consentRecords) {
        consentRecords.forEach((consent: any) => {
          const expiresAt = new Date(new Date(consent.signed_at).getTime() + 30 * 24 * 60 * 60 * 1000)
          const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))

          if (daysLeft <= 7 && daysLeft > 0) {
            allNotifications.push({
              id: `consent_${consent.id}`,
              type: 'consent_expiring',
              title: 'Consent expiring soon',
              titleZh: '同意书即将过期',
              description: `${consent.consent_type || 'Consent'} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
              descriptionZh: `${consent.consent_type || '同意'} 在 ${daysLeft} 天后过期`,
              severity: daysLeft <= 3 ? 'danger' : 'warning',
              timestamp: consent.signed_at,
              metadata: { consentId: consent.id, expiresAt: expiresAt.toISOString() },
            })
          }
        })
      }

      // Sort by timestamp descending
      allNotifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setNotifications(allNotifications)
    } catch (e) {
      console.error('Error loading notifications:', e)
    }
    setLoading(false)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'danger':
        return { bg: v3.dangerSoft, fg: v3.danger, icon: '⚠' }
      case 'warning':
        return { bg: v3.warningSoft, fg: v3.warning, icon: '⚡' }
      default:
        return { bg: v3.infoSoft, fg: v3.info, icon: 'ℹ' }
    }
  }

  const getCategoryLabel = (type: string) => {
    const labels: Record<string, { en: string; zh: string }> = {
      lease_pending: { en: 'Lease', zh: '租赁' },
      application_pending: { en: 'Application', zh: '申请' },
      report_viewed: { en: 'Sharing', zh: '共享' },
      consent_expiring: { en: 'Consent', zh: '同意' },
    }
    return labels[type] || { en: 'Other', zh: '其他' }
  }

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
      </main>
    )
  }

  const displayNotifications = notifications

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        title={isZh ? '通知' : 'Notifications'}
        titleZh="通知"
      />

      <main
        style={{
          maxWidth: size.content.default,
          margin: '0 auto',
          padding: '24px 16px',
        }}
      >
        {/* Header with mark-all-read button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? '你的通知' : 'Your notifications'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: v3.textSecondary }}>
              {displayNotifications.length} {isZh ? '条未读' : 'unread'}
            </p>
          </div>
          <button
            onClick={() => {
              // Visual only — no DB update
              setNotifications([])
            }}
            style={{
              padding: '8px 14px',
              background: v3.surfaceCard,
              color: v3.textSecondary,
              border: `1px solid ${v3.border}`,
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = v3.surfaceMuted)}
            onMouseLeave={(e) => (e.currentTarget.style.background = v3.surfaceCard)}
          >
            {isZh ? '全部标记已读' : 'Mark all as read'}
          </button>
        </div>

        {displayNotifications.length === 0 ? (
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: size.radius.xl,
              padding: 60,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? '所有通知已读' : 'All caught up'}
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: v3.textSecondary }}>
              {isZh ? '没有新的通知。继续你的工作！' : 'No new notifications. Keep going!'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {displayNotifications.map((notif) => {
              const colors = getSeverityColor(notif.severity)
              const category = getCategoryLabel(notif.type)
              const icon = colors.icon

              return (
                <div
                  key={notif.id}
                  style={{
                    background: v3.surfaceCard,
                    border: `1px solid ${v3.border}`,
                    borderRadius: size.radius.xl,
                    padding: 16,
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 16,
                    alignItems: 'start',
                  }}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Icon */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 40,
                        height: 40,
                        borderRadius: size.radius.lg,
                        background: colors.bg,
                        color: colors.fg,
                        fontSize: 18,
                        flexShrink: 0,
                      }}
                    >
                      {icon}
                    </div>

                    {/* Content */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 14,
                            fontWeight: 700,
                            color: v3.textPrimary,
                          }}
                        >
                          {isZh ? notif.titleZh : notif.title}
                        </h3>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            background: colors.bg,
                            color: colors.fg,
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {isZh ? category.zh : category.en}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 6px', fontSize: 13, color: v3.textSecondary }}>
                        {isZh ? notif.descriptionZh : notif.description}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: v3.textMuted, fontFamily: 'var(--font-mono)' }}>
                        {new Date(notif.timestamp).toLocaleString(isZh ? 'zh-CN' : 'en-CA')}
                      </p>
                    </div>
                  </div>

                  {/* CTA */}
                  {notif.actionHref && (
                    <button
                      onClick={() => router.push(notif.actionHref || '/')}
                      style={{
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: size.radius.lg,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 12px -4px rgba(52, 211, 153, 0.45)',
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    >
                      {isZh ? notif.actionLabelZh : notif.actionLabel}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

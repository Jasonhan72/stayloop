'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'

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
              title: 'New application',
              titleZh: '新申请',
              description: `${app.applicant_name || 'New applicant'} applied for listing`,
              descriptionZh: `${app.applicant_name || '申请人'} 已提交申请`,
              severity: 'info',
              timestamp: app.created_at,
              actionLabel: 'Review',
              actionLabelZh: '查看',
              actionHref: `/applications/${app.id}`,
              metadata: { appId: app.id },
            })
          })
        }
      }

      setNotifications(allNotifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()))
    } catch (e) {
      console.error('Error loading notifications:', e)
    }
    setLoading(false)
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F2EEE5', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <PageShell>
      {/* Header */}
      <div style={{ background: v3.surface, borderBottom: `1px solid ${v3.border}`, padding: '32px 28px', marginLeft: -32, marginRight: -32, marginTop: -32 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#71717A',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {isZh ? '通知' : 'Notifications'}
          </div>
          <h1
            style={{
              fontFamily: 'var(--f-serif)',
              fontSize: 28,
              fontWeight: 600,
              color: '#171717',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? 'Stayloop 要告诉你什么' : 'What you\'d like Stayloop to tell you about'}
          </h1>
        </div>
      </div>

      <div style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
          {/* Main card */}
          <div
            style={{
              background: '#fff',
              border: `1px solid #D8D2C2`,
              borderRadius: 8,
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 22px',
                borderBottom: `1px solid #D8D2C2`,
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 80px',
                gap: 12,
                fontSize: 10,
                color: '#71717A',
                fontFamily: 'JetBrains Mono, monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              <span>{isZh ? '事件' : 'Event'}</span>
              <span>{isZh ? '邮件' : 'Email'}</span>
              <span>SMS</span>
              <span>{isZh ? '应用内' : 'In-app'}</span>
            </div>
            {[
              [isZh ? '新申请列表' : 'New application on a listing', true, false, true, 'gold'],
              [isZh ? 'AI 筛选报告就绪' : 'AI Screening report ready', true, false, true, 'ai'],
              [isZh ? '不一致或合规标记' : 'Inconsistency or compliance flag', true, true, true, 'warn'],
              [isZh ? '租客上传缺失文件' : 'Tenant uploaded missing documents', true, false, true, 'info'],
              [isZh ? '租赁准备好发送给租客' : 'Lease ready to send to tenant', true, false, true, 'pri'],
              [isZh ? '租客签署租赁' : 'Lease signed by tenant', true, true, true, 'ok'],
              [isZh ? '同意在 24h 内过期' : 'Consent expiring in 24h', true, true, true, 'warn'],
              [isZh ? 'Stripe 支付失败' : 'Stripe payment failed', true, true, true, 'err'],
              [isZh ? '每周投资组合摘要' : 'Weekly portfolio digest', true, false, false, 'mute'],
            ].map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px 80px',
                  padding: '12px 22px',
                  borderTop: `1px solid #D8D2C2`,
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background:
                        r[5] === 'ok'
                          ? '#16A34A'
                          : r[5] === 'warn'
                            ? '#D97706'
                            : r[5] === 'err'
                              ? '#DC2626'
                              : r[5] === 'info'
                                ? '#2563EB'
                                : r[5] === 'ai'
                                  ? '#7C3AED'
                                  : r[5] === 'pri'
                                    ? '#047857'
                                    : '#A1A1AA',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#171717' }}>{r[0]}</span>
                </div>
                {[r[1], r[2], r[3]].map((on, j) => (
                  <div
                    key={j}
                    style={{
                      width: 32,
                      height: 18,
                      borderRadius: 9,
                      background: on ? '#047857' : '#C5BDAA',
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: on ? 16 : 2,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#fff',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        transition: 'left 0.15s',
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div
            style={{
              background: '#fff',
              border: `1px solid #D8D2C2`,
              borderRadius: 8,
              padding: 18,
            }}
          >
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: '#71717A',
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {isZh ? '安静时间' : 'Quiet hours'}
            </div>
            <div style={{ fontSize: 12, color: '#3F3F46', marginBottom: 14, lineHeight: 1.55 }}>
              {isZh
                ? 'Stayloop 不会在安静时间内发送 SMS 或推送，除非是合规和支付失败。'
                : "Stayloop won't send SMS or push during your quiet hours, except for compliance and payment failures."}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#71717A', display: 'block', marginBottom: 4 }}>
                  {isZh ? '从' : 'From'}
                </label>
                <input
                  type="time"
                  defaultValue="22:00"
                  style={{
                    width: '100%',
                    background: '#FFFFFF',
                    border: `1px solid #D8D2C2`,
                    borderRadius: 6,
                    color: '#0B1736',
                    fontFamily: 'var(--f-sans)',
                    fontSize: 14,
                    padding: '11px 14px',
                    height: 44,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#71717A', display: 'block', marginBottom: 4 }}>
                  {isZh ? '至' : 'To'}
                </label>
                <input
                  type="time"
                  defaultValue="07:30"
                  style={{
                    width: '100%',
                    background: '#FFFFFF',
                    border: `1px solid #D8D2C2`,
                    borderRadius: 6,
                    color: '#0B1736',
                    fontFamily: 'var(--f-sans)',
                    fontSize: 14,
                    padding: '11px 14px',
                    height: 44,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: '#71717A',
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {isZh ? 'AI 摘要' : 'AI digests'}
              </div>
              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 13,
                  color: '#171717',
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 18,
                    borderRadius: 9,
                    background: '#047857',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: 16,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#fff',
                    }}
                  />
                </span>
                {isZh ? '早上 8 点摘要 · 管道 + 下一步最佳行动' : 'Morning summary at 8am · pipeline + next-best-actions'}
              </label>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

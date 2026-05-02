'use client'
export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/v4/PageShell'
import { useIsMobile } from '@/lib/useMediaQuery'
import { Application, Listing } from '@/types'

interface TimelineStep {
  status: string
  status_zh: string
  timestamp?: string
  description_en: string
  description_zh: string
  completed: boolean
}

export default function ApplicationDetailPage() {
  const { lang, t } = useT()
  const isZh = lang === 'zh'
  const isMobile = useIsMobile()
  const params = useParams()
  const applicationId = params.id as string

  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [application, setApplication] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !applicationId) return

    const fetchApplication = async () => {
      try {
        const { data, error: dbError } = await supabase
          .from('applications')
          .select('*, listing:listings(*)')
          .eq('id', applicationId)
          .single()

        if (dbError) throw dbError
        if (!data) {
          setError(isZh ? '未找到申请' : 'Application not found')
          return
        }

        // Verify user owns this application
        if (data.email !== user.email) {
          setError(isZh ? '无权访问' : 'Access denied')
          return
        }

        setApplication(data)
      } catch (err: any) {
        setError(err.message || (isZh ? '加载失败' : 'Failed to load'))
      } finally {
        setLoading(false)
      }
    }

    fetchApplication()
  }, [user, applicationId, isZh])

  if (authLoading || loading) {
    return (
      <PageShell role="tenant">
        <div style={{ padding: 40, textAlign: 'center', color: v3.textMuted }}>
          {isZh ? '加载中...' : 'Loading...'}
        </div>
      </PageShell>
    )
  }

  if (error || !application) {
    return (
      <PageShell role="tenant">
        <div style={{ padding: 40, textAlign: 'center', color: v3.danger }}>
          {error || (isZh ? '未找到申请' : 'Application not found')}
        </div>
      </PageShell>
    )
  }

  const listing = application.listing as unknown as Listing

  // Build timeline
  const statusMap: Record<string, TimelineStep> = {
    new: {
      status: 'Submitted',
      status_zh: '已提交',
      timestamp: application.created_at,
      description_en: 'Your application has been submitted successfully.',
      description_zh: '你的申请已成功提交。',
      completed: true,
    },
    reviewing: {
      status: 'Under Review',
      status_zh: '审核中',
      description_en: 'The landlord is reviewing your application.',
      description_zh: '房东正在审核你的申请。',
      completed: true,
    },
    approved: {
      status: 'Approved',
      status_zh: '已通过',
      description_en: 'Congratulations! Your application has been approved.',
      description_zh: '恭喜！你的申请已获批准。',
      completed: true,
    },
    declined: {
      status: 'Declined',
      status_zh: '已拒绝',
      description_en: 'Unfortunately, your application was not approved.',
      description_zh: '很遗憾，你的申请未获批准。',
      completed: true,
    },
  }

  const currentStatus = application.status || 'new'
  const statuses = ['new', 'reviewing', 'approved', 'declined']
  const statusIndex = statuses.indexOf(currentStatus)

  const statusColors: Record<string, { fg: string; bg: string }> = {
    new: { fg: v3.textSecondary, bg: v3.divider },
    reviewing: { fg: v3.warning, bg: v3.warningSoft },
    approved: { fg: v3.success, bg: v3.successSoft },
    declined: { fg: v3.danger, bg: v3.dangerSoft },
  }

  const currentColor = statusColors[currentStatus] || statusColors.new

  return (
    <PageShell role="tenant">
      <main style={{ maxWidth: size.content.default, margin: '0 auto' }}>
        {/* Two-column layout: desktop, stacked: mobile */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
            gap: isMobile ? 24 : 32,
          }}
        >
          {/* Left: Timeline */}
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: v3.textPrimary, marginBottom: 32 }}>
              {isZh ? '申请进展' : 'Application Timeline'}
            </h2>

            {/* Timeline vertical */}
            <div style={{ position: 'relative', paddingLeft: 32 }}>
              {/* Vertical line */}
              <div
                style={{
                  position: 'absolute',
                  left: 11,
                  top: 24,
                  bottom: 0,
                  width: 2,
                  background: v3.divider,
                }}
              />

              {statuses.map((status, idx) => {
                const step = statusMap[status]
                const isCompleted = idx <= statusIndex
                const isCurrent = idx === statusIndex

                return (
                  <div
                    key={status}
                    style={{
                      marginBottom: idx < statuses.length - 1 ? 32 : 0,
                      position: 'relative',
                    }}
                  >
                    {/* Timeline dot */}
                    <div
                      style={{
                        position: 'absolute',
                        left: -24,
                        top: 0,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: isCurrent ? currentColor.bg : isCompleted ? v3.successSoft : v3.divider,
                        border: `2px solid ${isCurrent ? currentColor.fg : isCompleted ? v3.success : v3.divider}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2,
                      }}
                    >
                      {isCompleted && (
                        <span
                          style={{
                            color: v3.success,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </div>

                    {/* Step content */}
                    <div
                      style={{
                        padding: 16,
                        border: `1px solid ${isCurrent ? currentColor.fg : v3.border}`,
                        borderRadius: 10,
                        background: isCurrent ? currentColor.bg : v3.surfaceCard,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: v3.textPrimary, margin: 0 }}>
                          {isZh ? step.status_zh : step.status}
                        </h3>
                        {step.timestamp && (
                          <span style={{ fontSize: 12, color: v3.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                            {new Date(step.timestamp).toLocaleDateString(isZh ? 'zh-CN' : 'en-US')}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 14, color: v3.textSecondary, lineHeight: 1.5, margin: 0 }}>
                        {isZh ? step.description_zh : step.description_en}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* More info requested panel */}
            {currentStatus === 'reviewing' && (
              <div
                style={{
                  marginTop: 32,
                  padding: 16,
                  background: v3.warningSoft,
                  border: `1px solid rgba(217, 119, 6, 0.3)`,
                  borderRadius: 10,
                }}
              >
                <h4 style={{ fontSize: 14, fontWeight: 700, color: v3.warning, marginBottom: 8 }}>
                  {isZh ? '需要更多信息' : 'More Info Requested'}
                </h4>
                <p style={{ fontSize: 13, color: v3.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>
                  {isZh
                    ? '房东要求提供以下文件以继续审核。'
                    : 'The landlord needs the following documents to continue reviewing your application.'}
                </p>
                <button
                  style={{
                    padding: '10px 16px',
                    background: v3.warning,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '上传文件' : 'Upload documents'}
                </button>
              </div>
            )}

            {/* Withdraw button */}
            {['new', 'reviewing'].includes(currentStatus) && (
              <div style={{ marginTop: 32 }}>
                <button
                  style={{
                    padding: '10px 16px',
                    background: v3.dangerSoft,
                    color: v3.danger,
                    border: `1px solid ${v3.danger}`,
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '撤回申请' : 'Withdraw application'}
                </button>
              </div>
            )}
          </div>

          {/* Right: Listing card + info */}
          <div>
            {/* Listing card */}
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 12,
                overflow: 'hidden',
                marginBottom: 24,
              }}
            >
              {/* Photo placeholder */}
              <div
                style={{
                  width: '100%',
                  height: 160,
                  background: v3.surfaceMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: v3.textMuted,
                  fontSize: 36,
                }}
              >
                🏠
              </div>

              {/* Info */}
              <div style={{ padding: 16 }}>
                {listing && (
                  <>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: v3.textPrimary, marginBottom: 8 }}>
                      {listing.address}
                      {listing.unit && ` #${listing.unit}`}
                    </h3>
                    <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: v3.textSecondary }}>
                          {isZh ? '租金' : 'Rent'}
                        </span>
                        <span style={{ fontWeight: 600, color: v3.textPrimary, fontFamily: 'JetBrains Mono' }}>
                          ${listing.monthly_rent}
                        </span>
                      </div>
                      {listing.bedrooms && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: v3.textSecondary }}>
                            {isZh ? '卧室' : 'Bedrooms'}
                          </span>
                          <span style={{ fontWeight: 600, color: v3.textPrimary }}>
                            {listing.bedrooms}
                          </span>
                        </div>
                      )}
                      {listing.bathrooms && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: v3.textSecondary }}>
                            {isZh ? '浴室' : 'Bathrooms'}
                          </span>
                          <span style={{ fontWeight: 600, color: v3.textPrimary }}>
                            {listing.bathrooms}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Request more info history */}
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h4 style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isZh ? '交流历史' : 'Message History'}
              </h4>
              <p style={{ fontSize: 12, color: v3.textMuted, margin: 0 }}>
                {isZh ? '暂无交流' : 'No messages yet'}
              </p>
            </div>
          </div>
        </div>
      </main>
    </PageShell>
  )
}

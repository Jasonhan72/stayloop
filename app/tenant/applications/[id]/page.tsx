'use client'
export const runtime = 'edge'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/v4/PageShell'
import { Application, Listing } from '@/types'

function Tag({ tone = 'default', children }: { tone?: string; children: React.ReactNode }) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    gold: { bg: '#FEF3C7', fg: '#D97706' },
    pri: { bg: 'rgba(4,120,87,0.10)', fg: '#047857' },
    info: { bg: '#DBEAFE', fg: '#2563EB' },
    ok: { bg: '#DCFCE7', fg: '#16A34A' },
    default: { bg: v3.divider, fg: v3.textMuted },
  }
  const t = toneMap[tone] || toneMap.default
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 9px',
        borderRadius: 999,
        border: `1px solid ${t.bg}`,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Steps({ steps, current = 0 }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: done ? '#047857' : active ? '#fff' : v3.surfaceMuted,
                border: `1.5px solid ${done || active ? '#047857' : v3.borderStrong}`,
                color: done ? '#fff' : active ? '#047857' : v3.textFaint,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {done ? '✓' : i + 1}
            </div>
            <div
              style={{
                fontSize: 11,
                color: active || done ? v3.textPrimary : v3.textMuted,
                fontWeight: active ? 600 : 500,
                textAlign: 'center',
                maxWidth: 96,
                lineHeight: 1.3,
              }}
            >
              {s}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AuditRow({
  when,
  actor,
  action,
  target,
}: {
  when: string
  actor: string
  action: string
  target: string
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 140px 1fr 100px',
        gap: 14,
        padding: '10px 0',
        borderBottom: `1px dashed ${v3.border}`,
        fontSize: 12,
        alignItems: 'baseline',
      }}
    >
      <span style={{ fontFamily: '"JetBrains Mono", monospace', color: v3.textFaint }}>{when}</span>
      <span style={{ color: v3.textPrimary, fontWeight: 500 }}>{actor}</span>
      <span style={{ color: v3.textSecondary }}>
        {action} <b style={{ color: v3.textPrimary }}>{target}</b>
      </span>
    </div>
  )
}

export default function ApplicationDetailPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
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

  return (
    <PageShell role="tenant">
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        {/* SecHead */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: '10.5px',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: v3.textMuted,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            {isZh ? `申请 · ${listing?.address || 'Application'}` : `Application · ${listing?.address || 'Application'}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: '"Inter Tight", sans-serif',
                fontSize: 24,
                fontWeight: 600,
                color: v3.textPrimary,
                letterSpacing: '-0.02em',
              }}
            >
              {isZh ? '准备好签署 — 审查并电子签署' : 'Lease ready — review and e-sign'}
            </h2>
            <div style={{ flex: 1 }} />
            <Tag tone="pri">{isZh ? '准备好签署' : 'Lease ready'}</Tag>
          </div>
          <p style={{ fontSize: 13, color: v3.textMuted, margin: '6px 0 0' }}>
            {isZh ? '已提交 8 月 18 日 · 已批准 8 月 22 日' : 'Submitted Aug 18 · Approved Aug 22'}
          </p>
          <hr
            style={{
              marginTop: 14,
              height: 1,
              background: `linear-gradient(90deg, #047857, rgba(16,185,129,0.32) 60%, transparent)`,
              border: 0,
            }}
          />
        </div>

        {/* Steps timeline */}
        <div
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 14,
            padding: '22px 26px',
            marginBottom: 20,
          }}
        >
          <Steps
            steps={[
              isZh ? '已申请' : 'Applied',
              isZh ? '审核中' : 'Under review',
              isZh ? '需要更多信息' : 'More info',
              isZh ? '已批准' : 'Approved',
              isZh ? '租约草案' : 'Lease draft',
              isZh ? '电子签署' : 'E-signed',
            ]}
            current={4}
          />
        </div>

        {/* Two-column: left (main) + right (sidebar) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            {/* Application summary */}
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 22,
              }}
            >
              <h3
                style={{
                  margin: '0 0 12px',
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {isZh ? '申请摘要' : 'Application summary'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 18px', fontSize: 13 }}>
                {[
                  [isZh ? '列表' : 'Listing', listing?.address ? `${listing.address}${listing.unit ? ` · Unit ${listing.unit}` : ''} · Toronto, ON` : '—'],
                  [isZh ? '房东' : 'Landlord', 'J. Park · jpark@hudsonliving.ca'],
                  [isZh ? '租金' : 'Rent', '$2,750 / mo · Last-month deposit only'],
                  [isZh ? '期限' : 'Term', '12 months · Sep 1, 2026 → Aug 31, 2027'],
                  [isZh ? '住户' : 'Occupants', '1 occupant · no pets'],
                  [isZh ? '护照版本' : 'Passport version', 'v3 · 78% readiness · shared with landlord'],
                ].map((r, i) => (
                  <React.Fragment key={i}>
                    <div
                      style={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 10,
                        color: v3.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        fontWeight: 700,
                      }}
                    >
                      {r[0]}
                    </div>
                    <div style={{ color: v3.textPrimary }}>{r[1]}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Communication */}
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 22,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: '"Inter Tight", sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  {isZh ? '交流' : 'Communication'}
                </h3>
                <Tag tone="info">3 {isZh ? '条消息' : 'messages'}</Tag>
              </div>
              {[
                {
                  who: 'J. Park',
                  when: isZh ? '8 月 22 日 · 14:08' : 'Aug 22 · 14:08',
                  body: isZh
                    ? '已批准！Stayloop 将起草租约 — 请审查。'
                    : 'Approved! Stayloop will draft the lease — please review.',
                },
                {
                  who: isZh ? '你' : 'You',
                  when: isZh ? '8 月 20 日 · 09:31' : 'Aug 20 · 09:31',
                  body: isZh
                    ? '与包含就业信函的护照重新共享。'
                    : 'Re-shared Passport with employment letter included.',
                },
                {
                  who: 'J. Park',
                  when: isZh ? '8 月 19 日 · 18:44' : 'Aug 19 · 18:44',
                  body: isZh
                    ? '你能上传就业信函来确认收入吗？'
                    : 'Could you upload an employment letter to confirm income?',
                },
              ].map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i ? `1px dashed ${v3.border}` : 'none' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: v3.brand,
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {m.who.split(' ').map((n) => n[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>{m.who}</span>
                      <span
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: 11,
                          color: v3.textFaint,
                        }}
                      >
                        {m.when}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: v3.textSecondary, marginTop: 3 }}>{m.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right sidebar */}
          <div style={{ display: 'grid', gap: 18 }}>
            {/* Lease ready card */}
            <div
              style={{
                background: '#EFEADC',
                border: `1px solid ${v3.borderStrong}`,
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 10,
                  color: '#D97706',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {isZh ? '准备好签署' : 'Lease ready'}
              </div>
              <h3
                style={{
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#064E3B',
                  margin: '8px 0 12px',
                }}
              >
                {isZh ? '审查并电子签署' : 'Review and e-sign'}
              </h3>
              <div
                style={{
                  fontSize: 13,
                  color: '#6B7F76',
                  marginBottom: 14,
                  lineHeight: 1.55,
                }}
              >
                {isZh
                  ? 'Stayloop AI 根据你的申请草拟了安大略省标准租约。两个条款需要你的确认。'
                  : 'Stayloop AI drafted the Ontario standard lease from your application. Two clauses need your confirmation.'}
              </div>
              <button
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  background: v3.brand,
                  color: '#fff',
                  border: `1px solid #065F46`,
                  borderRadius: 10,
                  padding: '11px 20px',
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '打开租约审查 →' : 'Open Lease Review →'}
              </button>
            </div>

            {/* AI Panel */}
            <div
              style={{
                background: 'linear-gradient(180deg, #F3EEFF 0%, #fff 100%)',
                border: `1px solid #D7C5FA`,
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: '#7C3AED',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  ✦
                </span>
                <span
                  style={{
                    fontFamily: '"Inter Tight", sans-serif',
                    fontSize: 13,
                    fontWeight: 600,
                    color: v3.textPrimary,
                  }}
                >
                  {isZh ? '接下来呢' : "What's next"}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[
                  {
                    body: isZh
                      ? '审查 AI 租约摘要 — 6 个日期、2 个条款已标记。'
                      : 'Review the AI lease summary — 6 dates, 2 clauses flagged.',
                    cta: isZh ? '打开' : 'Open',
                  },
                  {
                    body: isZh
                      ? '通过 Stripe 链接确认最后一个月的押金支付。'
                      : 'Confirm last-month deposit payment via Stripe link.',
                    cta: isZh ? '支付' : 'Pay',
                  },
                  {
                    body: isZh ? '邀请担保人（可选）。' : 'Invite a guarantor (optional).',
                    cta: isZh ? '邀请' : 'Invite',
                  },
                ].map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                    <span
                      style={{
                        color: '#7C3AED',
                        fontFamily: '"JetBrains Mono", monospace',
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      ›
                    </span>
                    <span style={{ flex: 1 }}>
                      <div style={{ color: v3.textSecondary, fontSize: 13 }}>{it.body}</div>
                    </span>
                    <button
                      style={{
                        fontSize: 12,
                        color: '#7C3AED',
                        padding: 0,
                        whiteSpace: 'nowrap',
                        background: 'none',
                        border: 'none',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {it.cta}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit trail */}
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontSize: '10.5px',
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                {isZh ? '审计线索' : 'Audit trail'}
              </div>
              <AuditRow
                when="Aug 22"
                actor="J. Park"
                action={isZh ? '批准' : 'approved'}
                target={isZh ? '申请' : 'application'}
              />
              <AuditRow
                when="Aug 20"
                actor={isZh ? '你' : 'You'}
                action={isZh ? '上传' : 'uploaded'}
                target={isZh ? '就业信函' : 'Employment letter'}
              />
              <AuditRow
                when="Aug 18"
                actor={isZh ? '你' : 'You'}
                action={isZh ? '提交' : 'submitted'}
                target={isZh ? '申请' : 'application'}
              />
              <AuditRow
                when="Aug 18"
                actor="Stayloop"
                action={isZh ? '生成' : 'generated'}
                target={isZh ? '筛选报告 v1' : 'Screening report v1'}
              />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

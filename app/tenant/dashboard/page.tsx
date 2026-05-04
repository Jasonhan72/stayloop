'use client'
// /tenant/dashboard — Tenant workspace, stats, readiness, recent applications
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'

interface Application {
  id: string
  listing_address?: string
  listing_city?: string
  monthly_rent?: number
  status?: string
  created_at: string
}

interface TenantStats {
  passportReadiness: number
  activeApplications: number
  leaseDrafts: number
  recentApplications: Application[]
}

function Tag({ tone = 'default', children }: { tone?: string; children: React.ReactNode }) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    ai: { bg: '#F3E8FF', fg: '#7C3AED' },
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

function KPI({ label, value, sub, tone = 'pri' }: { label: string; value: string; sub?: string; tone?: string }) {
  const toneMap: Record<string, string> = {
    ai: '#7C3AED',
    gold: '#D97706',
    pri: v3.textPrimary,
    ok: '#16A34A',
  }
  const color = toneMap[tone] || toneMap.pri
  return (
    <div
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 8,
        padding: '18px 20px',
      }}
    >
      <div
        style={{
          fontSize: '10.5px',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: v3.textMuted,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 500,
          color,
          marginTop: 6,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 6,
            fontSize: 11,
            color: v3.textMuted,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

function Progress({ value = 0, label, tone = 'pri' }: { value: number; label?: string; tone?: string }) {
  const toneMap: Record<string, string> = {
    pri: '#047857',
    gold: '#D97706',
    ok: '#16A34A',
    ai: '#7C3AED',
  }
  const color = toneMap[tone] || toneMap.pri
  return (
    <div>
      {label && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: v3.textMuted,
            marginBottom: 5,
          }}
        >
          <span>{label}</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', color, fontWeight: 600 }}>
            {value}%
          </span>
        </div>
      )}
      <div
        style={{
          height: 6,
          background: v3.surfaceMuted,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
          }}
        />
      </div>
    </div>
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

export default function TenantDashboardPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [stats, setStats] = useState<TenantStats>({
    passportReadiness: 78,
    activeApplications: 3,
    leaseDrafts: 1,
    recentApplications: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    void load()
  }, [user?.authId])

  async function load() {
    setLoading(true)
    try {
      const email = user?.email
      if (email) {
        const { data: apps } = await supabase
          .from('applications')
          .select('id, listing_address, listing_city, monthly_rent, status, created_at')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(3)

        setStats((prev) => ({
          ...prev,
          recentApplications: (apps || []) as Application[],
        }))
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <PageShell role="tenant">
        <div style={{ color: v3.textMuted, fontSize: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
          {isZh ? '加载仪表盘…' : 'Loading dashboard…'}
        </div>
      </PageShell>
    )
  }

  const firstName = user?.email?.split('@')[0] || 'Alex'

  return (
    <PageShell role="tenant">
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        {/* Eyebrow */}
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
          {isZh ? '租客 · 正在为你处理租房' : 'Tenant · Renting in progress'}
        </div>
        {/* Headline */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: '"Inter Tight", sans-serif',
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? `你好 ${firstName} — 你的 Passport 已 78% 准备好。` : `Hi ${firstName} — your Passport is 78% ready.`}
          </h1>
          <Tag tone="ai">AI</Tag>
        </div>
        <p style={{ color: v3.textSecondary, fontSize: 14, margin: '6px 0 24px' }}>
          {isZh
            ? '关键步骤由你确认，其余由系统协助完成。再补 2 个文件就能在更严格的房源上自信申请。'
            : 'You confirm the key steps; the system handles the rest. Add 2 more documents to apply with confidence on stricter listings.'}
        </p>

        {/* Grid: left = stats + applications + timeline, right = AI panel + activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }} className="t-twopane-dashboard">
          <div style={{ display: 'grid', gap: 18 }}>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }} className="t-kpis-3col">
              <KPI label="Passport readiness" value="78%" sub="2 items missing" tone="ai" />
              <KPI label="Active applications" value="3" sub="1 needs response" tone="gold" />
              <KPI label="Lease drafts" value="1" sub="Awaiting your e-sign" tone="pri" />
            </div>

            {/* Your applications */}
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 14,
                padding: 22,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: '"Inter Tight", sans-serif',
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  {isZh ? '你的申请' : 'Your applications'}
                </h3>
                <span style={{ fontSize: 12, color: v3.textMuted }}>
                  {isZh ? '3 个激活' : '3 active'}
                </span>
                <div style={{ flex: 1 }} />
                <Link
                  href="/tenant/applications"
                  style={{
                    padding: 0,
                    color: '#047857',
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'none',
                  }}
                >
                  {isZh ? '查看全部 →' : 'View all →'}
                </Link>
              </div>

              {[
                {
                  addr: '128 Bathurst St · Unit 4B',
                  city: 'Toronto, ON · M5V',
                  rent: '$2,750',
                  status: isZh ? '准备好签署' : 'Lease ready',
                  tone: 'pri',
                },
                {
                  addr: '52 Wellesley E · Unit 1207',
                  city: 'Toronto, ON · M4Y',
                  rent: '$2,400',
                  status: isZh ? '需要更多信息' : 'More info requested',
                  tone: 'gold',
                },
                {
                  addr: '14 York St · Unit 802',
                  city: 'Toronto, ON · M5J',
                  rent: '$3,100',
                  status: isZh ? '审核中' : 'Under review',
                  tone: 'info',
                },
              ].map((a, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr auto auto',
                    gap: 14,
                    padding: '14px 0',
                    borderTop: i ? `1px dashed ${v3.border}` : 'none',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 8,
                      background: v3.surfaceMuted,
                      border: `1px solid ${v3.border}`,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary }}>{a.addr}</div>
                    <div style={{ fontSize: 12, color: v3.textMuted }}>{a.city}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: v3.textPrimary,
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      {a.rent}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textFaint }}>{isZh ? '每月' : 'per month'}</div>
                  </div>
                  <Tag tone={a.tone}>{a.status}</Tag>
                </div>
              ))}
            </div>

            {/* Timeline */}
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
                  margin: '0 0 10px',
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {isZh ? '申请时间线 · 128 Bathurst St' : 'Application timeline · 128 Bathurst St'}
              </h3>
              <Steps
                steps={[
                  isZh ? '已申请' : 'Applied',
                  isZh ? '审核中' : 'Under review',
                  isZh ? '需要更多信息' : 'More info',
                  isZh ? '已批准' : 'Approved',
                  isZh ? '准备好签署' : 'Lease ready',
                ]}
                current={4}
              />
            </div>
          </div>

          {/* Right sidebar: AI Panel + Activity */}
          <div style={{ display: 'grid', gap: 18 }}>
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
                  {isZh ? '接下来的最佳行动' : 'Next-best-actions'}
                </span>
                <span style={{ fontSize: 11, color: v3.textMuted }}>
                  {isZh ? '为你的激活申请个性化' : 'Personalized for your active applications'}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[
                  {
                    title: isZh ? '上传就业信函' : 'Upload employment letter',
                    body: isZh
                      ? '52 Wellesley 房东 4 小时前请求了。需要时使用模板。'
                      : '52 Wellesley landlord requested it 4h ago. Use template if needed.',
                    cta: isZh ? '上传' : 'Upload',
                  },
                  {
                    title: isZh ? '与 14 York 重新共享护照' : 'Re-share Passport with 14 York',
                    body: isZh ? '你的共享链接将在 2 天内过期。' : 'Your share link expires in 2 days.',
                    cta: isZh ? '更新' : 'Renew',
                  },
                  {
                    title: isZh ? '审查 128 Bathurst 的租赁' : 'Review lease for 128 Bathurst',
                    body: isZh
                      ? 'AI 摘要已准备好 — 6 个关键日期、2 个条款需要确认。'
                      : 'AI summary ready — 6 key dates, 2 clauses to confirm.',
                    cta: isZh ? '审查' : 'Review',
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
                      <div style={{ fontWeight: 600, color: v3.textPrimary }}>{it.title}</div>
                      <div style={{ color: v3.textSecondary, fontSize: 13, marginTop: 2 }}>{it.body}</div>
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
              <button
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  background: '#FFFFFF',
                  color: v3.textPrimary,
                  border: `1px solid ${v3.borderStrong}`,
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontFamily: '"Inter Tight", sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '打开 Stayloop AI' : 'Open Stayloop AI'}
              </button>
            </div>

            {/* Recent activity */}
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
                {isZh ? '最近的活动' : 'Recent activity'}
              </div>
              <AuditRow
                when={isZh ? '今天 14:02' : 'Today 14:02'}
                actor={isZh ? '房东 J. Park' : 'Landlord J. Park'}
                action={isZh ? '请求' : 'requested'}
                target={isZh ? '就业信函' : 'Employment letter'}
              />
              <AuditRow
                when={isZh ? '今天 09:31' : 'Today 09:31'}
                actor={isZh ? '你' : 'You'}
                action={isZh ? '与以下共享护照' : 'shared Passport with'}
                target={isZh ? 'Stayloop · 128 Bathurst' : 'Stayloop · 128 Bathurst'}
              />
              <AuditRow
                when={isZh ? '昨天' : 'Yesterday'}
                actor={isZh ? 'Stayloop AI' : 'Stayloop AI'}
                action={isZh ? '为以下生成租赁草案' : 'generated lease draft for'}
                target={isZh ? '128 Bathurst · v0.1' : '128 Bathurst · v0.1'}
              />
              <AuditRow
                when="Aug 22"
                actor={isZh ? '房东 J. Park' : 'Landlord J. Park'}
                action={isZh ? '批准您的申请' : 'approved your application for'}
                target={isZh ? '128 Bathurst' : '128 Bathurst'}
              />
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.t-twopane-dashboard) {
            grid-template-columns: 1fr !important;
          }
          :global(.t-kpis-3col) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 600px) {
          :global(.t-kpis-3col) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </PageShell>
  )
}

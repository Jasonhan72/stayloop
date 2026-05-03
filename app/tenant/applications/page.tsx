'use client'
// /tenant/applications — List of tenant applications
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

interface Application {
  id: string
  listing_address?: string
  listing_city?: string
  monthly_rent?: number
  status?: string
  created_at: string
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

export default function TenantApplicationsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [applications, setApplications] = useState<Application[]>([])
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

        setApplications((apps || []) as Application[])
      }
    } catch (err) {
      console.error('Failed to load applications:', err)
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <PageShell role="tenant">
        <div style={{ color: v3.textMuted, fontSize: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
          {isZh ? '加载申请…' : 'Loading applications…'}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell role="tenant">
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        <SecHead
          eyebrow={isZh ? '申请' : 'Applications'}
          title={isZh ? '你的申请' : 'Your Applications'}
          sub={isZh ? `${applications.length} 个活跃` : `${applications.length} active`}
        />

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {[
            isZh ? '所有状态' : 'All statuses',
            isZh ? '待审核' : 'Pending',
            isZh ? '已批准' : 'Approved',
            isZh ? '已拒绝' : 'Declined',
          ].map((c, i) => (
            <Tag key={c} tone={i === 0 ? 'pri' : 'default'}>
              {c}
            </Tag>
          ))}
        </div>

        {/* Applications list */}
        <div
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 14,
            padding: 0,
            overflow: 'hidden',
          }}
          className="t-apps-table-wrap"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 100px 130px 130px 110px 80px',
              padding: '12px 18px',
              background: v3.surfaceMuted,
              borderBottom: `1px solid ${v3.border}`,
              fontSize: 11,
              color: v3.textMuted,
              fontFamily: '"JetBrains Mono", monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}
          >
            <span>{isZh ? '物业' : 'Property'}</span>
            <span>{isZh ? '租金' : 'Rent'}</span>
            <span>{isZh ? '可用' : 'Available'}</span>
            <span>{isZh ? '状态' : 'Status'}</span>
            <span>{isZh ? '更新' : 'Updated'}</span>
            <span></span>
          </div>

          {applications.length > 0 ? (
            applications.map((app, i) => {
              const statusMap: Record<string, { tone: string; label: string }> = {
                pending: { tone: 'gold', label: isZh ? '待审核' : 'Pending' },
                approved: { tone: 'ok', label: isZh ? '已批准' : 'Approved' },
                declined: { tone: 'err', label: isZh ? '已拒绝' : 'Declined' },
                under_review: { tone: 'info', label: isZh ? '审核中' : 'Under review' },
              }
              const s = statusMap[app.status || ''] || { tone: 'default', label: app.status || '—' }
              const date = new Date(app.created_at)
              const dateStr = date.toLocaleDateString(isZh ? 'zh-CN' : 'en-US')
              return (
                <Link
                  key={app.id}
                  href={`/tenant/applications/${app.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 100px 130px 130px 110px 80px',
                    padding: '14px 18px',
                    borderTop: i ? `1px solid ${v3.border}` : 'none',
                    fontSize: 13,
                    alignItems: 'center',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = v3.surfaceMuted)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>
                      {app.listing_address || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: v3.textMuted }}>
                      {app.listing_city || '—'}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      color: v3.textSecondary,
                    }}
                  >
                    {app.monthly_rent ? `$${app.monthly_rent.toLocaleString()}` : '—'}
                  </span>
                  <span style={{ color: v3.textSecondary }}>—</span>
                  <Tag tone={s.tone}>{s.label}</Tag>
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 11,
                      color: v3.textFaint,
                    }}
                  >
                    {dateStr}
                  </span>
                  <button
                    style={{
                      padding: 0,
                      color: '#047857',
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      justifySelf: 'end',
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                    }}
                  >
                    {isZh ? '打开' : 'Open'}
                  </button>
                </Link>
              )
            })
          ) : (
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                color: v3.textMuted,
              }}
            >
              {isZh ? '还没有申请' : 'No applications yet'}
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.t-apps-table-wrap) {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </PageShell>
  )
}

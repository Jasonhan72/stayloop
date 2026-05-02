'use client'
// /tenant/leases — Lease workspace with status pills
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import { supabase } from '@/lib/supabase'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

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

function Tag({ tone = 'default', children }: { tone?: string; children: React.ReactNode }) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    gold: { bg: '#FEF3C7', fg: '#D97706' },
    info: { bg: '#DBEAFE', fg: '#2563EB' },
    ok: { bg: '#DCFCE7', fg: '#16A34A' },
    mute: { bg: v3.divider, fg: v3.textMuted },
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

export default function TenantLeasesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'

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

  if (authLoading || loading) {
    return (
      <PageShell role="tenant">
        <div style={{ color: v3.textMuted, fontSize: 14, display: 'grid', placeItems: 'center', minHeight: 400 }}>
          {isZh ? '加载租约…' : 'Loading leases…'}
        </div>
      </PageShell>
    )
  }

  // Sample data for demo
  const sampleLeases = [
    {
      p: '128 Bathurst St · 4B',
      term: '12 mo',
      mi: 'Sep 1',
      status: isZh ? '等待你的电子签名' : 'Awaiting your e-sign',
      tone: 'gold',
      upd: isZh ? '今天' : 'Today',
    },
    {
      p: '52 Wellesley E · 1207',
      term: '12 mo',
      mi: 'Aug 28',
      status: isZh ? '草稿待审' : 'Draft pending',
      tone: 'info',
      upd: isZh ? '昨天' : 'Yesterday',
    },
    {
      p: '48 Camden St (prev)',
      term: '24 mo',
      mi: 'Sep 1, 2024',
      status: isZh ? '激活' : 'Active',
      tone: 'ok',
      upd: 'Aug 1',
    },
    {
      p: '112 Brock Ave (prev)',
      term: '12 mo',
      mi: 'Mar 1, 2023',
      status: isZh ? '已存档' : 'Archived',
      tone: 'mute',
      upd: 'Aug 31, 2024',
    },
  ]

  return (
    <PageShell role="tenant">
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        <SecHead
          eyebrow={isZh ? '租约工作区' : 'Lease workspace'}
          title={isZh ? '你的租约' : 'Your leases'}
        />

        {/* Leases table */}
        <div
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 14,
            padding: 0,
            overflow: 'hidden',
          }}
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
            <span>{isZh ? '条款' : 'Term'}</span>
            <span>{isZh ? '入住' : 'Move-in'}</span>
            <span>{isZh ? '状态' : 'Status'}</span>
            <span>{isZh ? '更新' : 'Updated'}</span>
            <span></span>
          </div>

          {sampleLeases.map((l, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 100px 130px 130px 110px 80px',
                padding: '14px 18px',
                borderTop: `1px solid ${v3.border}`,
                fontSize: 13,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 6,
                    height: 32,
                    borderRadius: 3,
                    background:
                      l.tone === 'gold'
                        ? '#D97706'
                        : l.tone === 'ok'
                          ? '#16A34A'
                          : l.tone === 'info'
                            ? '#2563EB'
                            : v3.textFaint,
                  }}
                />
                <span style={{ fontWeight: 600, color: v3.textPrimary }}>{l.p}</span>
              </div>
              <span
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  color: v3.textSecondary,
                }}
              >
                {l.term}
              </span>
              <span style={{ color: v3.textSecondary }}>{l.mi}</span>
              <Tag tone={l.tone}>{l.status}</Tag>
              <span
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  color: v3.textFaint,
                }}
              >
                {l.upd}
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
              >
                {isZh ? '打开' : 'Open'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}

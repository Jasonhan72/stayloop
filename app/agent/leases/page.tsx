'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'

interface LeaseCard {
  id: string
  tenant_name: string
  landlord_name: string
  property: string
  status: string
  updated_at: string
}

export default function AgentLeasesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const router = useRouter()
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [leases, setLeases] = useState<LeaseCard[]>([])
  const [loading, setLoading] = useState(true)

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
      <PageShell role="agent">
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
      </PageShell>
    )
  }

  useEffect(() => {
    if (!user) return
    loadLeases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function loadLeases() {
    const { data } = await supabase
      .from('lease_agreements')
      .select('*')
      .order('updated_at', { ascending: false })

    setLeases(((data as any[]) || []).map((l) => ({
      id: l.id,
      tenant_name: l.tenant_name || '—',
      landlord_name: l.landlord_name || '—',
      property: l.property || '—',
      status: l.status,
      updated_at: l.updated_at,
    })))

    setLoading(false)
  }

  const columns = {
    consent: leases.filter((l) => l.status === 'consent'),
    draft: leases.filter((l) => l.status === 'draft'),
    tenant_review: leases.filter((l) => l.status === 'tenant_review'),
    tenant_signed: leases.filter((l) => l.status === 'tenant_signed'),
    landlord_signed: leases.filter((l) => l.status === 'landlord_signed'),
    archived: leases.filter((l) => l.status === 'archived'),
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  const leaseTableData = [
    { c: 'D. Robinson', l: '80 Mill St · 312', step: 5, next: 'Lease archived' },
    { c: 'Mei Chen', l: '14 York St · 802', step: 3, next: 'Awaiting countersign · J. Park' },
    { c: 'Jamie Liu', l: '52 Wellesley E · 1207', step: 1, next: 'Approval pending — nudge landlord' },
    { c: 'R. Patel', l: '905 King W · PH3', step: 0, next: 'Consent expiring · resend' },
  ]

  const getToneForStep = (step: number) => {
    if (step === 5) return 'ok'
    if (step >= 3) return 'pri'
    if (step >= 1) return 'gold'
    return 'warn'
  }

  const getToneColor = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.success
      case 'gold': return v3.brandBright
      case 'warn': return v3.warning
      case 'pri': return v3.brand
      default: return v3.textMuted
    }
  }

  const getToneBackground = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.successSoft
      case 'gold': return v3.brandSoft
      case 'warn': return v3.warningSoft
      case 'pri': return v3.brandSoft
      default: return v3.divider
    }
  }

  return (
    <PageShell role="agent">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 10 }}>
          {isZh ? '租约协助' : 'Lease assistance'}
        </div>
        <h1 style={{ margin: 0, fontFamily: 'var(--f-serif)', fontSize: 24, fontWeight: 600, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
          {isZh ? '活跃租约工作流' : 'Active lease workflows'}
        </h1>
        <p style={{ fontSize: 13, color: v3.textMuted, marginTop: 6, marginBottom: 0 }}>
          {isZh ? '跟踪您客户的签名进度' : 'Tracking signature progress for your clients'}
        </p>
      </div>

      <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 0, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }} className="a-leases-table-wrap">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1.2fr 100px', padding: '12px 18px', background: v3.surfaceMuted, borderBottom: `1px solid ${v3.border}`, fontSize: 10, color: v3.textMuted, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          <span>Client</span>
          <span>Listing</span>
          <span>Lease stage</span>
          <span>Next action</span>
          <span />
        </div>
        {leaseTableData.map((r, i) => {
          const tone = getToneForStep(r.step)
          return (
            <div key={i} style={{ padding: '18px', borderTop: `1px solid ${v3.border}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1.2fr 100px', alignItems: 'center', fontSize: 13, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: v3.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 10 }}>
                    {r.c.split(' ').map(w => w[0]).join('').toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, color: v3.textPrimary }}>{r.c}</span>
                </div>
                <span style={{ color: v3.textSecondary }}>{r.l}</span>
                <span style={{ padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${getToneBackground(tone).replace(/rgba\(([^)]+)\)/, 'transparent').match(/^\w+/) ? 'transparent' : 'rgb(209,209,210)'}`, color: getToneColor(tone), background: getToneBackground(tone), display: 'inline-block' }}>
                  {['Awaiting consent', 'Draft', 'Tenant review', 'Tenant signed', 'Landlord signed', 'Archived'][r.step]}
                </span>
                <span style={{ color: v3.textSecondary }}>{r.next}</span>
                <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, justifySelf: 'end' }}>
                  Open →
                </button>
              </div>
              {/* Steps indicator - V4 style */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {['Consent', 'Draft', 'Review', 'T-sign', 'L-sign', 'Archive'].map((step, si) => {
                  const done = si < r.step
                  const active = si === r.step
                  return (
                    <div key={si} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 90, flex: 1 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: done ? v3.brand : active ? '#fff' : v3.divider,
                        border: `1.5px solid ${done || active ? v3.brand : v3.borderStrong}`,
                        color: done ? '#fff' : active ? v3.brand : v3.textFaint,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700,
                      }}>
                        {done ? '✓' : si + 1}
                      </div>
                      <div style={{ fontSize: 11, color: active || done ? v3.textPrimary : v3.textMuted, fontWeight: active ? 600 : 500, textAlign: 'center', maxWidth: 96, lineHeight: 1.3 }}>
                        {step}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.a-leases-table-wrap) {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </PageShell>
  )
}

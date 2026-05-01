'use client'
// Agent Lease Pipeline — kanban-style 3 columns for tenant/landlord/signed

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'

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
    tenant_review: leases.filter((l) => l.status === 'tenant_review'),
    landlord_review: leases.filter((l) => l.status === 'landlord_review'),
    signed: leases.filter((l) => ['signed', 'active'].includes(l.status)),
  }

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader title={isZh ? '租约管道' : 'Lease Pipeline'} />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: '32px 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {/* Awaiting tenant */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: v3.info }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: v3.textMuted, letterSpacing: '0.05em' }}>
                {isZh ? '待租客' : 'Awaiting tenant'}
              </h2>
              <span style={{ fontSize: 11, fontWeight: 600, color: v3.textMuted }}>
                {columns.tenant_review.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {columns.tenant_review.length === 0 ? (
                <div style={{
                  border: `1px dashed ${v3.border}`,
                  borderRadius: 10,
                  padding: '24px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: v3.textFaint,
                }}>
                  {isZh ? '空' : 'Empty'}
                </div>
              ) : (
                columns.tenant_review.map((lease) => (
                  <button
                    key={lease.id}
                    onClick={() => router.push(`/lease/${lease.id}/review`)}
                    style={{
                      textAlign: 'left',
                      background: v3.surfaceCard,
                      border: `1px solid ${v3.border}`,
                      borderRadius: 10,
                      padding: 12,
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, marginBottom: 4 }}>
                      {lease.tenant_name}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 6 }}>
                      {lease.property}
                    </div>
                    <div style={{ fontSize: 10, color: v3.textFaint }}>
                      {isZh ? '房东：' : 'Landlord: '}{lease.landlord_name}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Awaiting landlord */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: v3.warning }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: v3.textMuted, letterSpacing: '0.05em' }}>
                {isZh ? '待房东' : 'Awaiting landlord'}
              </h2>
              <span style={{ fontSize: 11, fontWeight: 600, color: v3.textMuted }}>
                {columns.landlord_review.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {columns.landlord_review.length === 0 ? (
                <div style={{
                  border: `1px dashed ${v3.border}`,
                  borderRadius: 10,
                  padding: '24px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: v3.textFaint,
                }}>
                  {isZh ? '空' : 'Empty'}
                </div>
              ) : (
                columns.landlord_review.map((lease) => (
                  <button
                    key={lease.id}
                    onClick={() => router.push(`/lease/${lease.id}/review`)}
                    style={{
                      textAlign: 'left',
                      background: v3.surfaceCard,
                      border: `1px solid ${v3.border}`,
                      borderRadius: 10,
                      padding: 12,
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, marginBottom: 4 }}>
                      {lease.tenant_name}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 6 }}>
                      {lease.property}
                    </div>
                    <div style={{ fontSize: 10, color: v3.textFaint }}>
                      {isZh ? '房东：' : 'Landlord: '}{lease.landlord_name}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Signed */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: v3.success }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: v3.textMuted, letterSpacing: '0.05em' }}>
                {isZh ? '已签署' : 'Signed'}
              </h2>
              <span style={{ fontSize: 11, fontWeight: 600, color: v3.textMuted }}>
                {columns.signed.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {columns.signed.length === 0 ? (
                <div style={{
                  border: `1px dashed ${v3.border}`,
                  borderRadius: 10,
                  padding: '24px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: v3.textFaint,
                }}>
                  {isZh ? '空' : 'Empty'}
                </div>
              ) : (
                columns.signed.map((lease) => (
                  <button
                    key={lease.id}
                    onClick={() => router.push(`/lease/${lease.id}/review`)}
                    style={{
                      textAlign: 'left',
                      background: v3.successSoft,
                      border: `1px solid ${v3.success}`,
                      borderRadius: 10,
                      padding: 12,
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, marginBottom: 4 }}>
                      {lease.tenant_name}
                    </div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 6 }}>
                      {lease.property}
                    </div>
                    <div style={{ fontSize: 10, color: v3.textFaint }}>
                      {isZh ? '房东：' : 'Landlord: '}{lease.landlord_name}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

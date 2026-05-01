'use client'
// Landlord Lease Builder Workspace — drafts, active leases, and create new

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import AppHeader from '@/components/AppHeader'

interface LeaseAgreement {
  id: string
  application_id: string
  landlord_id: string
  status: 'draft' | 'tenant_review' | 'landlord_review' | 'signed' | 'active'
  created_at: string
  updated_at: string
  tenant_name?: string
  property?: string
}

export default function LeasesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const router = useRouter()
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [leases, setLeases] = useState<LeaseAgreement[]>([])
  const [approvedApps, setApprovedApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedAppId, setSelectedAppId] = useState('')

  useEffect(() => {
    if (!user) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function loadData() {
    const [leaseRes, appRes] = await Promise.all([
      supabase
        .from('lease_agreements')
        .select('*')
        .eq('landlord_id', user!.profileId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('applications')
        .select('*')
        .eq('landlord_id', user!.profileId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),
    ])

    setLeases((leaseRes.data as LeaseAgreement[]) || [])
    setApprovedApps((appRes.data as any[]) || [])
    setLoading(false)
  }

  async function createLease() {
    if (!selectedAppId) return
    const { data, error } = await supabase
      .from('lease_agreements')
      .insert({
        application_id: selectedAppId,
        landlord_id: user!.profileId,
        status: 'draft',
      })
      .select()
      .single()

    if (!error && data) {
      setShowCreateModal(false)
      setSelectedAppId('')
      await loadData()
    }
  }

  const draftLeases = leases.filter((l) => ['draft', 'tenant_review', 'landlord_review'].includes(l.status))
  const activeLeases = leases.filter((l) => ['signed', 'active'].includes(l.status))

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: v3.surface, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        title={isZh ? '租约管理' : 'Leases'}
        right={
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '8px 14px',
              background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isZh ? '+ 新租约' : '+ New lease'}
          </button>
        }
      />

      <div style={{ maxWidth: size.content.wide, margin: '0 auto', padding: '32px 24px' }}>
        {/* Drafts section */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
            {isZh ? '草稿' : 'Drafts'}
          </h2>
          {draftLeases.length === 0 ? (
            <div style={{ fontSize: 13, color: v3.textMuted, padding: '20px', background: v3.surfaceCard, borderRadius: 12 }}>
              {isZh ? '暂无草稿' : 'No drafts yet'}
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${v3.border}` }}>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '物业' : 'Property'}
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '租客' : 'Tenant'}
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '状态' : 'Status'}
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '操作' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draftLeases.map((lease) => (
                    <tr key={lease.id} style={{ borderBottom: `1px solid ${v3.divider}` }}>
                      <td style={{ padding: '12px', fontSize: 13, color: v3.textPrimary }}>
                        {lease.property || '—'}
                      </td>
                      <td style={{ padding: '12px', fontSize: 13, color: v3.textPrimary }}>
                        {lease.tenant_name || '—'}
                      </td>
                      <td style={{ padding: '12px', fontSize: 12, color: v3.textMuted }}>
                        {lease.status}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={() => router.push(`/lease/${lease.id}/review`)}
                          style={{
                            padding: '6px 12px',
                            background: v3.brand,
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {isZh ? '编辑' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Active leases section */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
            {isZh ? '活跃租约' : 'Active Leases'}
          </h2>
          {activeLeases.length === 0 ? (
            <div style={{ fontSize: 13, color: v3.textMuted, padding: '20px', background: v3.surfaceCard, borderRadius: 12 }}>
              {isZh ? '暂无活跃租约' : 'No active leases'}
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${v3.border}` }}>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '物业' : 'Property'}
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '租客' : 'Tenant'}
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '状态' : 'Status'}
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: 12, fontWeight: 700, color: v3.textMuted }}>
                      {isZh ? '已进行天数' : 'Days in term'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeLeases.map((lease) => {
                    const daysIn = Math.floor(
                      (Date.now() - new Date(lease.created_at).getTime()) / 86400000
                    )
                    return (
                      <tr key={lease.id} style={{ borderBottom: `1px solid ${v3.divider}` }}>
                        <td style={{ padding: '12px', fontSize: 13, color: v3.textPrimary }}>
                          {lease.property || '—'}
                        </td>
                        <td style={{ padding: '12px', fontSize: 13, color: v3.textPrimary }}>
                          {lease.tenant_name || '—'}
                        </td>
                        <td style={{ padding: '12px', fontSize: 12, color: v3.success }}>
                          {lease.status === 'active' ? '◉ Active' : '✓ Signed'}
                        </td>
                        <td style={{ padding: '12px', fontSize: 13, color: v3.textPrimary }}>
                          {daysIn} d
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div style={{
            background: v3.surfaceCard,
            borderRadius: 14,
            padding: 24,
            maxWidth: 400,
            width: '90%',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
              {isZh ? '新建租约' : 'Create new lease'}
            </h3>

            <select
              value={selectedAppId}
              onChange={(e) => setSelectedAppId(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: 16,
                border: `1px solid ${v3.border}`,
                borderRadius: 8,
                fontSize: 14,
                color: v3.textPrimary,
              }}
            >
              <option value="">{isZh ? '选择已批准的申请' : 'Select approved application'}</option>
              {approvedApps.map((app) => (
                <option key={app.id} value={app.id}>
                  {[app.first_name, app.last_name].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '8px 16px',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  color: v3.textPrimary,
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={createLease}
                disabled={!selectedAppId}
                style={{
                  padding: '8px 16px',
                  background: selectedAppId ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' : v3.borderStrong,
                  color: selectedAppId ? '#fff' : v3.textMuted,
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: selectedAppId ? 'pointer' : 'not-allowed',
                }}
              >
                {isZh ? '创建' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

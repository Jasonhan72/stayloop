'use client'
// Landlord Lease Builder Workspace — drafts, active leases, and create new

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'
import SecHead from '@/components/v4/SecHead'

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

interface ApplicationWithListing {
  id: string
  first_name: string
  last_name: string
  email: string
  listing_id: string
  created_at: string
  ai_score?: number
  listings?: Array<{
    address: string
    city: string
    monthly_rent: number
  }> | {
    address: string
    city: string
    monthly_rent: number
  }
}

export default function LeasesPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const router = useRouter()
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [leases, setLeases] = useState<LeaseAgreement[]>([])
  const [approvedApps, setApprovedApps] = useState<ApplicationWithListing[]>([])
  const [loading, setLoading] = useState(true)

  if (authLoading) {
    return (
      <PageShell role="landlord">
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
        </div>
      </PageShell>
    )
  }

  if (user && user.role !== 'landlord') {
    const roleDisplay = user.role === 'tenant' ? (isZh ? '租客' : 'Tenant') : (isZh ? '经纪' : 'Agent')
    return (
      <PageShell role="landlord">
        <div style={{ maxWidth: 480, margin: '64px auto', textAlign: 'center', background: v3.surface, border: `1px dashed ${v3.borderStrong}`, borderRadius: 16, padding: 40 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            {isZh ? '此页面仅供房东使用' : 'Landlord access only'}
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
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedAppId, setSelectedAppId] = useState('')
  const [creatingLease, setCreatingLease] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    if (!user) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profileId])

  async function loadData() {
    setLoading(true)
    // Fetch all leases
    const { data: leaseData } = await supabase
      .from('lease_agreements')
      .select('*')
      .eq('landlord_id', user!.profileId)
      .order('updated_at', { ascending: false })

    // Fetch approved applications with their listings
    const { data: appData } = await supabase
      .from('applications')
      .select(`
        id,
        first_name,
        last_name,
        email,
        listing_id,
        created_at,
        ai_score,
        listings(address, city, monthly_rent)
      `)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    // Filter out applications that already have leases
    const existingAppIds = new Set(
      (leaseData || []).map((lease: any) => lease.application_id)
    )
    const filteredApps = (appData || []).filter(
      (app: any) => !existingAppIds.has(app.id)
    )

    setLeases((leaseData as LeaseAgreement[]) || [])
    setApprovedApps((filteredApps as any) || [])
    setLoading(false)
  }

  async function createLease() {
    if (!selectedAppId) return
    setCreatingLease(true)
    setCreateError('')

    try {
      const selectedApp = approvedApps.find((a) => a.id === selectedAppId)
      if (!selectedApp) {
        setCreateError(isZh ? '应用未找到' : 'Application not found')
        setCreatingLease(false)
        return
      }

      let listing = selectedApp.listings
      // Handle both array and single object returns from Supabase join
      if (Array.isArray(listing)) {
        listing = listing[0]
      }
      if (!listing) {
        setCreateError(isZh ? '房源未找到' : 'Listing not found')
        setCreatingLease(false)
        return
      }

      // Calculate start_date as today + 30 days
      const today = new Date()
      const startDate = new Date(today)
      startDate.setDate(startDate.getDate() + 30)
      const startDateStr = startDate.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('lease_agreements')
        .insert({
          application_id: selectedAppId,
          listing_id: selectedApp.listing_id,
          landlord_id: user!.profileId,
          tenant_email: selectedApp.email,
          rent_monthly: listing.monthly_rent,
          start_date: startDateStr,
          term_months: 12,
          status: 'draft',
          version: 1,
        })
        .select()
        .single()

      if (error) {
        setCreateError((error as any).message)
        setCreatingLease(false)
        return
      }

      if (data) {
        setShowCreateModal(false)
        setSelectedAppId('')
        await loadData()
        // Redirect to lease review page
        router.push(`/lease/${data.id}/review`)
      }
    } catch (err: any) {
      setCreateError(err?.message || (isZh ? '创建失败' : 'Creation failed'))
      setCreatingLease(false)
    }
  }

  const draftLeases = leases.filter((l) => ['draft', 'tenant_review', 'landlord_review'].includes(l.status))
  const activeLeases = leases.filter((l) => ['signed', 'active'].includes(l.status))

  if (loading) {
    return (
      <PageShell role="landlord">
        <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
          <div style={{ color: v3.textMuted }}>{isZh ? '加载中…' : 'Loading…'}</div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell role="landlord">
      <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
        <SecHead
          eyebrow={isZh ? 'AI 租约生成器 · Ontario 标准格式' : 'AI Lease Builder · Ontario standard form'}
          title={isZh ? '128 Bathurst St #4B — Alex Taylor' : '128 Bathurst St #4B — Alex Taylor'}
          sub={isZh ? '从房源 + 申请 + Passport 自动起草 · v0.3' : 'Auto-drafted from listing + application + Passport · v0.3'}
        />

        {/* Drafts section */}
        <div style={{ marginBottom: 48 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
            {isZh ? '草稿' : 'Drafts'}
          </h3>
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

      {/* Create modal button */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50 }}>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(52, 211, 153, 0.3)',
          }}
        >
          {isZh ? '+ 新租约' : '+ New lease'}
        </button>
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
            maxWidth: 500,
            width: '90%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: v3.textPrimary }}>
              {isZh ? '新建租约' : 'Create new lease'}
            </h3>

            {approvedApps.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px 16px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 14, color: v3.textMuted, marginBottom: 16 }}>
                  {isZh ? '暂无已批准的申请' : 'No approved applications available'}
                </div>
                <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
                  {isZh ? '请先在筛选页批准申请后再创建租约' : 'Approve an application in your pipeline first'}
                </div>
                <a
                  href="/dashboard/pipeline"
                  style={{
                    padding: '8px 16px',
                    background: v3.brand,
                    color: '#fff',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {isZh ? '前往筛选 →' : 'Go to pipeline →'}
                </a>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {approvedApps.map((app) => (
                      <div
                        key={app.id}
                        onClick={() => setSelectedAppId(app.id)}
                        style={{
                          padding: 12,
                          border: selectedAppId === app.id ? `2px solid ${v3.brand}` : `1px solid ${v3.border}`,
                          borderRadius: 10,
                          background: selectedAppId === app.id ? 'rgba(107, 114, 128, 0.05)' : v3.surface,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary }}>
                            {[app.first_name, app.last_name].filter(Boolean).join(' ')}
                          </div>
                          {app.ai_score !== undefined && (
                            <div style={{
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(59, 130, 246, 0.1)',
                              color: '#1E40AF',
                            }}>
                              {app.ai_score}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 6 }}>
                          {(() => {
                            let listing = app.listings
                            if (Array.isArray(listing)) listing = listing[0]
                            return listing?.address ? (
                              <div>{listing.address}, {listing.city}</div>
                            ) : null
                          })()}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: v3.textMuted }}>
                          {(() => {
                            let listing = app.listings
                            if (Array.isArray(listing)) listing = listing[0]
                            return listing?.monthly_rent ? (
                              <span>${listing.monthly_rent}/mo</span>
                            ) : null
                          })()}
                          <span>
                            {isZh ? '申请于 ' : 'Applied '}
                            {new Date(app.created_at).toLocaleDateString(isZh ? 'zh-CN' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {createError && (
                  <div style={{
                    padding: 12,
                    background: 'rgba(220, 38, 38, 0.1)',
                    color: '#DC2626',
                    borderRadius: 8,
                    fontSize: 12,
                    marginBottom: 16,
                  }}>
                    {createError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setShowCreateModal(false)
                      setSelectedAppId('')
                      setCreateError('')
                    }}
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
                    disabled={!selectedAppId || creatingLease}
                    style={{
                      padding: '8px 16px',
                      background: selectedAppId && !creatingLease ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' : v3.borderStrong,
                      color: selectedAppId && !creatingLease ? '#fff' : v3.textMuted,
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: selectedAppId && !creatingLease ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {creatingLease ? (isZh ? '创建中…' : 'Creating…') : (isZh ? '创建' : 'Create')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}

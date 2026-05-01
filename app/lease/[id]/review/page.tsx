'use client'

// -----------------------------------------------------------------------------
// /lease/[id]/review — V4 Lease Review + E-Sign
// -----------------------------------------------------------------------------
// Two-pane layout: left = lease body (Markdown), right = AI summary + signature.
// Sign flow: modal → canvas signature pad → insert into lease_signatures.
// Updates lease status to 'signed' when both parties complete.
// Bilingual with soft-mint gradient primary CTA.
// -----------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

interface LeaseAgreement {
  id: string
  landlord_id: string
  tenant_id: string
  body_md: string
  monthly_rent: number
  lease_start: string
  lease_end: string
  status: 'draft' | 'tenant_review' | 'landlord_review' | 'signed'
  created_at: string
  updated_at: string
}

interface LeaseSignature {
  id: string
  lease_id: string
  signer_email: string
  signer_role: 'tenant' | 'landlord'
  signed_at: string
  ip_address: string
  user_agent: string
  signature_data: string
}

export default function LeaseReviewPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const router = useRouter()
  const params = useParams()
  const leaseId = params?.id as string

  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })
  const [lease, setLease] = useState<LeaseAgreement | null>(null)
  const [signatures, setSignatures] = useState<LeaseSignature[]>([])
  const [loading, setLoading] = useState(true)
  const [signingModalOpen, setSigningModalOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [scrollPosition, setScrollPosition] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const leaseScrollRef = useRef<HTMLDivElement>(null)

  // Load auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthToken(session?.access_token ?? null)
    })
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null)
    })
    return () => {
      sub.data.subscription.unsubscribe()
    }
  }, [])

  // Load lease by ID
  useEffect(() => {
    if (!user || !leaseId) return
    void loadLease()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.authId, leaseId])

  async function loadLease() {
    if (!leaseId) return
    setLoading(true)
    try {
      const { data: leaseData } = await supabase
        .from('lease_agreements')
        .select('*')
        .eq('id', leaseId)
        .single()

      if (leaseData) {
        setLease(leaseData as LeaseAgreement)
      }

      const { data: sigData } = await supabase
        .from('lease_signatures')
        .select('*')
        .eq('lease_id', leaseId)

      if (sigData) {
        setSignatures(sigData as LeaseSignature[])
      }
    } catch (e) {
      console.error('Error loading lease:', e)
    }
    setLoading(false)
  }

  // Simple Markdown-like rendering (basic formatting)
  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) return <h1 key={idx} style={{ fontSize: 24, fontWeight: 800, marginBottom: 16, marginTop: 20 }}>{line.slice(2)}</h1>
      if (line.startsWith('## ')) return <h2 key={idx} style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, marginTop: 16 }}>{line.slice(3)}</h2>
      if (line.startsWith('### ')) return <h3 key={idx} style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, marginTop: 14 }}>{line.slice(4)}</h3>
      if (line.trim() === '') return <div key={idx} style={{ height: 8 }} />
      return <p key={idx} style={{ marginBottom: 12 }}>{line}</p>
    })
  }

  // Track scroll position for resuming
  const handleLeaseScroll = () => {
    if (leaseScrollRef.current) {
      setScrollPosition(leaseScrollRef.current.scrollTop)
    }
  }

  // Canvas signature drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    ctx.beginPath()
    ctx.moveTo(x, y)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const moveX = moveEvent.clientX - rect.left
      const moveY = moveEvent.clientY - rect.top
      ctx.lineTo(moveX, moveY)
      ctx.strokeStyle = v3.textPrimary
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      ctx.closePath()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const clearSignature = () => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }

  const submitSignature = async () => {
    if (!canvasRef.current || !user || !lease) return

    setSigning(true)
    try {
      const signatureData = canvasRef.current.toDataURL('image/png')

      // Get IP and user agent (client-side approximation)
      const userAgent = navigator.userAgent
      const ipAddress = 'client' // Will be replaced by server if needed

      // Insert signature
      const { error } = await supabase.from('lease_signatures').insert({
        lease_id: leaseId,
        signer_email: user.email,
        signer_role: user.role === 'landlord' ? 'landlord' : 'tenant',
        signed_at: new Date().toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
        signature_data: signatureData,
      })

      if (error) throw error

      // Check if both parties have signed
      const { data: allSigs } = await supabase
        .from('lease_signatures')
        .select('*')
        .eq('lease_id', leaseId)

      const hasLandlordSig = allSigs?.some((s) => s.signer_role === 'landlord')
      const hasTenantSig = allSigs?.some((s) => s.signer_role === 'tenant')

      if (hasLandlordSig && hasTenantSig) {
        // Both signed, update lease status and create audit event
        await supabase
          .from('lease_agreements')
          .update({ status: 'signed', updated_at: new Date().toISOString() })
          .eq('id', leaseId)

        await supabase.from('audit_events').insert({
          action: 'lease_signed',
          resource_type: 'lease',
          resource_id: leaseId,
          actor_id: user.authId,
          metadata: { signer_role: user.role === 'landlord' ? 'landlord' : 'tenant' },
        })
      }

      setSigningModalOpen(false)
      clearSignature()
      await loadLease()
    } catch (e) {
      console.error('Error signing lease:', e)
    } finally {
      setSigning(false)
    }
  }

  // Calculate key terms
  const startDate = lease ? new Date(lease.lease_start).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA') : '–'
  const endDate = lease ? new Date(lease.lease_end).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA') : '–'

  if (authLoading || loading) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
      </main>
    )
  }

  if (!lease) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
            {isZh ? '租赁协议未找到' : 'Lease not found'}
          </h1>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ marginTop: 16, padding: '10px 18px', background: v3.brand, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {isZh ? '返回仪表盘' : 'Back to dashboard'}
          </button>
        </div>
      </main>
    )
  }

  const userRole = user?.role
  const hasSigned = signatures.some((s) => s.signer_email === user?.email)
  const bothSigned = signatures.some((s) => s.signer_role === 'tenant') && signatures.some((s) => s.signer_role === 'landlord')

  const statusColors: Record<string, { bg: string; fg: string }> = {
    draft: { bg: v3.divider, fg: v3.textMuted },
    tenant_review: { bg: v3.infoSoft, fg: v3.info },
    landlord_review: { bg: v3.infoSoft, fg: v3.info },
    signed: { bg: v3.successSoft, fg: v3.success },
  }

  const statusLabels: Record<string, { en: string; zh: string }> = {
    draft: { en: 'Draft', zh: '草稿' },
    tenant_review: { en: 'Awaiting tenant', zh: '等待租客' },
    landlord_review: { en: 'Awaiting landlord', zh: '等待房东' },
    signed: { en: 'Signed', zh: '已签署' },
  }

  const currentStatus = statusLabels[lease.status]
  const currentColor = statusColors[lease.status]

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <AppHeader
        back="/dashboard"
        title={isZh ? '审查租赁协议' : 'Review Lease'}
        titleZh="审查租赁协议"
      />

      <main
        style={{
          maxWidth: size.content.wide,
          margin: '0 auto',
          padding: '24px 16px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 0.6fr) minmax(0, 0.4fr)',
          gap: 24,
        }}
        className="lease-review-grid"
      >
        {/* Left pane: lease body */}
        <section
          ref={leaseScrollRef}
          onScroll={handleLeaseScroll}
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: size.radius.xl,
            padding: 24,
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 120px)',
            scrollBehavior: 'smooth',
          }}
        >
          <div style={{ fontSize: 13, lineHeight: 1.7, color: v3.textPrimary }}>
            {renderMarkdown(lease.body_md)}
          </div>
        </section>

        {/* Right pane: summary + signature */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Status pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: currentColor.bg,
              color: currentColor.fg,
              padding: '8px 14px',
              borderRadius: size.radius.pill,
              fontSize: 12,
              fontWeight: 700,
              width: 'fit-content',
            }}
          >
            <span style={{ fontSize: 14 }}>●</span>
            {isZh ? currentStatus.zh : currentStatus.en}
          </div>

          {/* AI Summary Card */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? 'AI 摘要' : 'AI Summary'}
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: v3.textSecondary }}>
              {isZh
                ? '本租赁协议规定租赁期限、月租、物业设施、租客义务和房东责任。仔细阅读并提出任何疑问。'
                : 'This lease sets out the term, monthly rent, facilities, and mutual obligations. Review carefully and raise questions below.'}
            </p>
          </div>

          {/* Key Terms */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? '关键条款' : 'Key Terms'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: v3.textSecondary }}>{isZh ? '月租' : 'Monthly rent'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: v3.textPrimary }}>
                  ${lease.monthly_rent.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: `1px solid ${v3.divider}`, paddingTop: 12 }}>
                <span style={{ color: v3.textSecondary }}>{isZh ? '开始' : 'Start'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: v3.textPrimary }}>{startDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: v3.textSecondary }}>{isZh ? '结束' : 'End'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: v3.textPrimary }}>{endDate}</span>
              </div>
            </div>
          </div>

          {/* Tenant Questions */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? '提问' : 'Questions'}
            </h3>
            <textarea
              placeholder={isZh ? '向房东或 Mediator 提出任何疑问…' : 'Ask landlord or Mediator anything…'}
              style={{
                width: '100%',
                minHeight: 80,
                border: `1px solid ${v3.border}`,
                borderRadius: size.radius.lg,
                padding: 12,
                fontSize: 13,
                color: '#0B1736',
                WebkitTextFillColor: '#0B1736',
                caretColor: '#0B1736',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Signature Section */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? '签署状态' : 'Signature Status'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {['tenant', 'landlord'].map((role) => {
                const signed = signatures.some((s) => s.signer_role === role)
                return (
                  <div
                    key={role}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      background: signed ? v3.successSoft : v3.divider,
                      borderRadius: size.radius.lg,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: signed ? v3.success : v3.border,
                        color: signed ? '#fff' : v3.textMuted,
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {signed ? '✓' : '○'}
                    </span>
                    <span style={{ color: signed ? v3.success : v3.textMuted }}>
                      {role === 'tenant' ? (isZh ? '租客' : 'Tenant') : isZh ? '房东' : 'Landlord'}
                    </span>
                  </div>
                )
              })}
            </div>

            {!hasSigned && (
              <button
                onClick={() => setSigningModalOpen(true)}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: size.radius.lg,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45)',
                  transition: 'opacity 0.15s',
                }}
              >
                {isZh ? '✓ 同意并签署' : '✓ Agree & Sign'}
              </button>
            )}

            {hasSigned && (
              <div
                style={{
                  padding: 12,
                  background: v3.successSoft,
                  borderRadius: size.radius.lg,
                  fontSize: 13,
                  color: v3.success,
                  textAlign: 'center',
                }}
              >
                {isZh ? '✓ 你已签署' : '✓ You have signed'}
              </div>
            )}
          </div>

          {bothSigned && (
            <div
              style={{
                padding: 14,
                background: v3.successSoft,
                border: `1px solid ${v3.success}`,
                borderRadius: size.radius.lg,
                fontSize: 13,
                color: v3.success,
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              {isZh ? '✓ 租赁已完全签署' : '✓ Lease fully signed'}
            </div>
          )}
        </section>
      </main>

      {/* Signature Modal */}
      {signingModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
          }}
          onClick={() => setSigningModalOpen(false)}
        >
          <div
            style={{
              background: v3.surfaceCard,
              borderRadius: size.radius.xl,
              padding: 24,
              maxWidth: 500,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: v3.textPrimary }}>
              {isZh ? '签署租赁协议' : 'Sign Lease'}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: v3.textSecondary, lineHeight: 1.6 }}>
              {isZh
                ? '通过在下方画布上签署，你确认你已阅读并同意租赁条款。'
                : 'By signing below, you confirm you have read and agree to the lease terms.'}
            </p>

            {/* Consent text */}
            <div
              style={{
                background: v3.surfaceMuted,
                border: `1px solid ${v3.divider}`,
                borderRadius: size.radius.lg,
                padding: 14,
                marginBottom: 16,
                fontSize: 12,
                lineHeight: 1.6,
                color: v3.textSecondary,
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {isZh
                ? '本协议由双方签署。你的签名表示法律同意。所有数据按PIPEDA隐私法保护。'
                : 'This agreement is legally binding when signed by both parties. Your signature is collected under PIPEDA privacy regulations.'}
            </div>

            {/* Canvas for signature */}
            <canvas
              ref={canvasRef}
              width={450}
              height={150}
              onMouseDown={startDrawing}
              style={{
                border: `2px solid ${v3.border}`,
                borderRadius: size.radius.lg,
                display: 'block',
                width: '100%',
                height: 150,
                cursor: 'crosshair',
                background: '#FFFFFF',
                marginBottom: 16,
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={clearSignature}
                style={{
                  flex: 1,
                  padding: '12px 18px',
                  background: v3.surfaceCard,
                  color: v3.textPrimary,
                  border: `1px solid ${v3.borderStrong}`,
                  borderRadius: size.radius.lg,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '清除' : 'Clear'}
              </button>
              <button
                onClick={() => setSigningModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px 18px',
                  background: v3.surfaceCard,
                  color: v3.textPrimary,
                  border: `1px solid ${v3.borderStrong}`,
                  borderRadius: size.radius.lg,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={submitSignature}
                disabled={signing}
                style={{
                  flex: 1,
                  padding: '12px 18px',
                  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: size.radius.lg,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: signing ? 'wait' : 'pointer',
                  opacity: signing ? 0.7 : 1,
                }}
              >
                {signing ? (isZh ? '签署中…' : 'Signing…') : isZh ? '签署' : 'Sign'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 1023px) {
          :global(.lease-review-grid) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

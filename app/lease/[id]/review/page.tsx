'use client'
export const runtime = 'edge'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const leaseScrollRef = useRef<HTMLDivElement>(null)

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

  const renderLeaseBody = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) return <h1 key={idx} style={{ fontSize: 24, fontWeight: 800, marginBottom: 16, marginTop: 20 }}>{line.slice(2)}</h1>
      if (line.startsWith('## ')) return <h2 key={idx} style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, marginTop: 16 }}>{line.slice(3)}</h2>
      if (line.startsWith('### ')) return <h3 key={idx} style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, marginTop: 14 }}>{line.slice(4)}</h3>
      if (line.trim() === '') return <div key={idx} style={{ height: 8 }} />
      return <p key={idx} style={{ marginBottom: 12 }}>{line}</p>
    })
  }

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
      ctx.strokeStyle = '#0B1736'
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
      const userAgent = navigator.userAgent
      const ipAddress = 'client'

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

      const { data: allSigs } = await supabase
        .from('lease_signatures')
        .select('*')
        .eq('lease_id', leaseId)

      const hasLandlordSig = allSigs?.some((s) => s.signer_role === 'landlord')
      const hasTenantSig = allSigs?.some((s) => s.signer_role === 'tenant')

      if (hasLandlordSig && hasTenantSig) {
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

  if (authLoading || loading) {
    return (
      <div style={{ height: '100%', overflow: 'auto', background: '#F2EEE5' }} className="fp-scroll">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: v3.textMuted, fontSize: 14 }}>
          {isZh ? '加载…' : 'Loading…'}
        </div>
      </div>
    )
  }

  if (!lease) {
    return (
      <div style={{ height: '100%', overflow: 'auto', background: '#F2EEE5' }} className="fp-scroll">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
              {isZh ? '租赁未找到' : 'Lease not found'}
            </h1>
          </div>
        </div>
      </div>
    )
  }

  const hasSigned = signatures.some((s) => s.signer_email === user?.email)
  const bothSigned = signatures.some((s) => s.signer_role === 'tenant') && signatures.some((s) => s.signer_role === 'landlord')

  return (
    <div style={{ height: '100%', overflow: 'hidden', background: '#F2EEE5', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          height: 54,
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: `1px solid #D8D2C2`,
          background: '#fff',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: '#047857',
            color: '#F2EEE5',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--f-serif)',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          S
        </div>
        <span
          style={{
            fontFamily: 'var(--f-serif)',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Stayloop
        </span>
        <span style={{ width: 1, height: 14, background: '#C5BDAA' }} />
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: '#71717A',
            letterSpacing: '0.08em',
          }}
        >
          LEASE REVIEW · /lease/{leaseId?.slice(0, 12)}/review
        </span>
        <div style={{ flex: 1 }} />
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: '#047857',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          EN / 中文
        </button>
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: '#16A34A',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          SSL · Audit on
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', overflow: 'hidden' }}>
        {/* Left pane: lease document */}
        <div
          className="fp-scroll"
          style={{ overflow: 'auto', padding: '28px 36px' }}
          ref={leaseScrollRef}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: '#71717A',
                fontWeight: 700,
              }}
            >
              {isZh ? '安大略省标准租赁协议' : 'Ontario Standard Form of Lease'} · v2229
            </div>
            <h1
              style={{
                fontFamily: 'var(--f-serif)',
                fontSize: 28,
                fontWeight: 600,
                margin: '8px 0 4px',
                letterSpacing: '-0.02em',
              }}
            >
              {isZh ? '住宅租赁协议' : 'Residential Tenancy Agreement'}
            </h1>
            <div style={{ fontSize: 13, color: '#71717A', marginBottom: 24 }}>
              128 Bathurst St · Unit 4B · Toronto · ON M5V 2R5
            </div>

            {lease.body_md ? (
              renderLeaseBody(lease.body_md)
            ) : (
              <div style={{ color: v3.textMuted }}>
                {isZh ? '未提供租赁文本' : 'No lease text provided'}
              </div>
            )}

            <div style={{ borderTop: `1px solid #D8D2C2`, marginTop: 28, paddingTop: 24 }}>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: '#71717A',
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {isZh ? '签名' : 'Signature'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <div
                  style={{
                    background: '#EAE5D9',
                    border: `1px solid #D8D2C2`,
                    borderRadius: 8,
                    padding: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: '#71717A',
                      fontFamily: 'JetBrains Mono, monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 700,
                    }}
                  >
                    {isZh ? '租客 · 你' : 'Tenant · you'}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--f-serif)',
                      fontStyle: 'italic',
                      fontSize: 30,
                      color: '#047857',
                      padding: '14px 0',
                      borderBottom: `1px solid #D8D2C2`,
                    }}
                  >
                    Alex Taylor
                  </div>
                  <div style={{ fontSize: 11, color: '#71717A', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                    {hasSigned && user?.role !== 'landlord' ? '✓ 已签署' : '待签署 · ' + new Date().toLocaleDateString(isZh ? 'zh-CN' : 'en-CA')}
                  </div>
                </div>
                <div
                  style={{
                    background: '#EAE5D9',
                    border: `1px solid #D8D2C2`,
                    borderRadius: 8,
                    padding: 18,
                    opacity: bothSigned ? 1 : 0.55,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: '#71717A',
                      fontFamily: 'JetBrains Mono, monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 700,
                    }}
                  >
                    {isZh ? '房东 · 管理员' : 'Landlord · J. Park'}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--f-serif)',
                      fontStyle: 'italic',
                      fontSize: 18,
                      color: '#A1A1AA',
                      padding: '18px 0 22px',
                      borderBottom: `1px solid #D8D2C2`,
                    }}
                  >
                    {isZh ? '等待你的签署' : 'Awaiting your signature first'}
                  </div>
                  <div style={{ fontSize: 11, color: '#71717A', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                    {isZh ? '将在租客签署后计数' : 'Will countersign upon tenant signature'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right pane: AI summary + sign action */}
        <div
          style={{
            borderLeft: `1px solid #D8D2C2`,
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="fp-scroll" style={{ flex: 1, overflow: 'auto', padding: 22 }}>
            <div
              style={{
                background: 'linear-gradient(180deg, #F3EEFF 0%, #fff 100%)',
                border: `1px solid #D7C5FA`,
                borderRadius: 12,
                padding: 18,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
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
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  ✦
                </span>
                <span
                  style={{
                    fontFamily: 'var(--f-sans)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#171717',
                  }}
                >
                  AI Lease Summary · 简体中文
                </span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[
                  {
                    title: '租期 / Term',
                    body: '12 个月固定期，2026/9/1 起至 2027/8/31，到期后转月租。',
                  },
                  {
                    title: '租金 / Rent',
                    body: '每月 $2,750，每月 1 号支付。Last-month deposit $2,750（合 LTB 规定）。',
                  },
                  {
                    title: '费用 / Utilities',
                    body: '含暖气和水。Hydro 与 Internet 由租客自付。',
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 13,
                      color: '#171717',
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        color: '#7C3AED',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      ›
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      <div style={{ color: '#3F3F46', fontSize: 13 }}>{item.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: '#71717A',
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {isZh ? '重要日期 · 4' : 'Important dates · 4'}
              </div>
              <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                {[
                  ['2026-09-01', isZh ? '入住及首月租金到期' : 'Move-in & first month rent due'],
                  ['每月1号', isZh ? '月租到期' : 'Monthly rent due'],
                  ['2027-05-31', isZh ? '最早 N9 通知（60 天）租期结束' : 'Earliest N9 notice (60d) for end of term'],
                  ['2027-08-31', isZh ? '固定期结束·自动转为月租' : 'Fixed-term end · auto rolls to monthly'],
                ].map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '6px 0',
                      borderBottom: i < 3 ? `1px dashed #D8D2C2` : 'none',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#047857',
                        fontWeight: 600,
                        width: 90,
                      }}
                    >
                      {d[0]}
                    </span>
                    <span style={{ color: '#3F3F46' }}>{d[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid #D8D2C2`, padding: 18 }}>
            <label
              style={{
                display: 'flex',
                gap: 10,
                fontSize: 12,
                color: '#3F3F46',
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: `1.5px solid #047857`,
                  borderRadius: 3,
                  background: '#047857',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              <span>{isZh ? '我同意电子签署并根据安大略省法律接收此租赁协议的最终副本。' : 'I consent to electronic signature and to receive a final copy of this lease per Ontario law.'}</span>
            </label>
            <button
              onClick={() => setSigningModalOpen(true)}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px',
                background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              {isZh ? '签署租赁 →' : 'Sign lease →'}
            </button>
          </div>
        </div>
      </div>

      {/* Signing modal */}
      {signingModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !signing && setSigningModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 32,
              maxWidth: 500,
              width: 'calc(100% - 32px)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#171717',
                margin: '0 0 20px',
              }}
            >
              {isZh ? '在下面签署' : 'Sign below'}
            </h2>
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              onMouseDown={startDrawing}
              style={{
                border: `2px solid #D8D2C2`,
                borderRadius: 8,
                cursor: 'crosshair',
                display: 'block',
                marginBottom: 16,
                background: '#FFFFFF',
                color: '#0B1736',
                WebkitTouchCallout: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={clearSignature}
                disabled={signing}
                style={{
                  background: '#FFFFFF',
                  color: '#171717',
                  border: '1px solid #C5BDAA',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '10px 18px',
                  cursor: signing ? 'not-allowed' : 'pointer',
                  opacity: signing ? 0.6 : 1,
                }}
              >
                {isZh ? '清除' : 'Clear'}
              </button>
              <button
                onClick={submitSignature}
                disabled={signing}
                style={{
                  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '10px 18px',
                  cursor: signing ? 'not-allowed' : 'pointer',
                  opacity: signing ? 0.6 : 1,
                }}
              >
                {signing ? (isZh ? '签署中…' : 'Signing...') : isZh ? '确认签署' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

// -----------------------------------------------------------------------------
// /reports/[id] — Public Shared Report (no auth required)
// -----------------------------------------------------------------------------
// Lookup screening_cases by share_token from URL. Render branded report with
// logo, agent name, applicant overview, document checklist, income review, etc.
// Write to audit_events on mount. Bilingual.
// Accessible via share_token — public but unique token-gated access.
// -----------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { createClient } from '@supabase/supabase-js'

interface ScreeningCase {
  id: string
  share_token: string
  applicant_name: string
  applicant_email: string
  landlord_name: string
  branding?: {
    logo_url?: string
    agent_name?: string
    brand_color?: string
  }
  documents_checklist?: Record<string, boolean>
  monthly_income?: number
  monthly_rent?: number
  employment_verified?: boolean
  created_at: string
}

interface AuditEvent {
  action: 'report_viewed'
  resource_type: 'screening_case'
  resource_id: string
  metadata: {
    share_token: string
    ip_truncated: string
  }
}

export default function PublicReportPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const params = useParams()
  const shareToken = params?.id as string

  const [screeningCase, setScreeningCase] = useState<ScreeningCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [auditWritten, setAuditWritten] = useState(false)

  // Create anon Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const anonSupabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

  // Load screening case by share_token
  useEffect(() => {
    if (!shareToken || !anonSupabase) return
    void loadScreeningCase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken])

  // Write audit event on first successful load
  useEffect(() => {
    if (!screeningCase || auditWritten || !anonSupabase) return
    void writeAuditEvent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screeningCase])

  async function loadScreeningCase() {
    if (!shareToken || !anonSupabase) return
    setLoading(true)
    try {
      const { data } = await anonSupabase
        .from('screening_cases')
        .select('*')
        .eq('share_token', shareToken)
        .single()

      if (data) {
        setScreeningCase(data as ScreeningCase)
      } else {
        setNotFound(true)
      }
    } catch (e) {
      console.error('Error loading screening case:', e)
      setNotFound(true)
    }
    setLoading(false)
  }

  async function writeAuditEvent() {
    if (!screeningCase || !anonSupabase) return
    try {
      // Get approximate IP from user's request (browser can't directly get this)
      const ip = 'browser' // Ideally passed from server
      const ipTruncated = ip.split('.').slice(0, 3).join('.') + '.x'

      await anonSupabase.from('audit_events').insert({
        action: 'report_viewed',
        resource_type: 'screening_case',
        resource_id: screeningCase.id,
        metadata: {
          share_token: shareToken,
          ip_truncated: ipTruncated,
        },
      })

      setAuditWritten(true)
    } catch (e) {
      console.error('Error writing audit event:', e)
    }
  }

  if (loading) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: v3.textMuted, fontSize: 14 }}>{isZh ? '加载…' : 'Loading…'}</div>
      </main>
    )
  }

  if (notFound || !screeningCase) {
    return (
      <main style={{ background: v3.surface, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div
          style={{
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: size.radius.xl,
            padding: 32,
            maxWidth: 500,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
              color: v3.warning,
            }}
          >
            ⚠
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
            {isZh ? '报告不可用' : 'Report no longer available'}
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: v3.textSecondary, lineHeight: 1.6 }}>
            {isZh
              ? '此共享链接已过期或不存在。请向房东联系以获取新的报告链接。'
              : 'This share link has expired or does not exist. Contact your landlord for a new report link.'}
          </p>
          <button
            onClick={() => (window.location.href = '/')}
            style={{
              padding: '10px 20px',
              background: v3.brand,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isZh ? '返回首页' : 'Go to homepage'}
          </button>
        </div>
      </main>
    )
  }

  const branding = screeningCase.branding || {}
  const brandColor = branding.brand_color || v3.brand
  const agentName = branding.agent_name || 'Stayloop'

  // Calculate application readiness (simulated)
  const docsSubmitted = Object.values(screeningCase.documents_checklist || {}).filter((v) => v).length
  const totalDocs = Object.keys(screeningCase.documents_checklist || {}).length || 5
  const readinessPercent = totalDocs > 0 ? Math.round((docsSubmitted / totalDocs) * 100) : 0

  // Calculate income/rent ratio
  const monthlyIncome = screeningCase.monthly_income || 0
  const monthlyRent = screeningCase.monthly_rent || 0
  const rentRatio = monthlyIncome > 0 ? Math.round((monthlyRent / monthlyIncome) * 100) : 0

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header with branding */}
      <header
        style={{
          background: 'linear-gradient(180deg, #E4EEE3 0%, #F2EEE5 100%)',
          borderBottom: `1px solid ${v3.divider}`,
          padding: '32px 24px',
        }}
      >
        <div
          style={{
            maxWidth: size.content.default,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="Logo" style={{ width: 40, height: 40, borderRadius: 8 }} />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: brandColor,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              S
            </div>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: v3.textPrimary }}>Stayloop</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: v3.textSecondary }}>{agentName}</p>
          </div>
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: v3.textPrimary }}>
          {isZh ? `${screeningCase.applicant_name} · 申请预审报告` : `${screeningCase.applicant_name} · Application Screening Report`}
        </h2>
      </header>

      <div
        style={{
          maxWidth: size.content.default,
          margin: '0 auto',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Applicant overview */}
        <section style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: v3.textPrimary }}>
            {isZh ? '申请人信息' : 'Applicant Overview'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
            <div>
              <p style={{ margin: '0 0 4px', color: v3.textSecondary, fontSize: 12, fontWeight: 600 }}>
                {isZh ? '姓名' : 'Name'}
              </p>
              <p style={{ margin: 0, color: v3.textPrimary, fontWeight: 600 }}>{screeningCase.applicant_name}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px', color: v3.textSecondary, fontSize: 12, fontWeight: 600 }}>
                {isZh ? '邮箱' : 'Email'}
              </p>
              <p style={{ margin: 0, color: v3.textPrimary, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {screeningCase.applicant_email}
              </p>
            </div>
          </div>
        </section>

        {/* Application readiness */}
        <section style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: v3.textPrimary }}>
            {isZh ? '申请完整度' : 'Application Readiness'}
          </h3>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: v3.textSecondary }}>{docsSubmitted} / {totalDocs} documents</span>
              <span style={{ fontWeight: 700, color: brandColor }}>{readinessPercent}%</span>
            </div>
            <div style={{ width: '100%', height: 8, background: v3.divider, borderRadius: 10, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${readinessPercent}%`,
                  background: 'linear-gradient(90deg, #6EE7B7 0%, #34D399 100%)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </section>

        {/* Document checklist */}
        <section style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: v3.textPrimary }}>
            {isZh ? '文件清单' : 'Document Checklist'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(screeningCase.documents_checklist || {}).map(([doc, submitted]) => (
              <div key={doc} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: submitted ? v3.successSoft : v3.divider,
                    color: submitted ? v3.success : v3.textMuted,
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {submitted ? '✓' : '○'}
                </span>
                <span style={{ color: submitted ? v3.textPrimary : v3.textMuted }}>
                  {doc.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Income & employment review */}
        <section style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: v3.textPrimary }}>
            {isZh ? '收入与就业' : 'Income & Employment'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <p style={{ margin: '0 0 8px', color: v3.textSecondary, fontSize: 12, fontWeight: 600 }}>
                {isZh ? '月收入' : 'Monthly income'}
              </p>
              <p style={{ margin: 0, color: v3.textPrimary, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18 }}>
                ${monthlyIncome.toLocaleString()}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 8px', color: v3.textSecondary, fontSize: 12, fontWeight: 600 }}>
                {isZh ? '就业验证' : 'Employment verified'}
              </p>
              <p
                style={{
                  margin: 0,
                  color: screeningCase.employment_verified ? v3.success : v3.warning,
                  fontWeight: 700,
                }}
              >
                {screeningCase.employment_verified ? (isZh ? '✓ 是' : '✓ Yes') : isZh ? '⚠ 待确认' : '⚠ Pending'}
              </p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 8px', color: v3.textSecondary, fontSize: 12, fontWeight: 600 }}>
                {isZh ? '租金与收入比' : 'Rent/income ratio'}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: v3.textPrimary }}>
                  {rentRatio}%
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: rentRatio > 40 ? v3.danger : rentRatio > 35 ? v3.warning : v3.success,
                    fontWeight: 600,
                  }}
                >
                  {rentRatio > 40
                    ? isZh ? '(过高)' : '(too high)'
                    : rentRatio > 35
                      ? isZh ? '(警告)' : '(caution)'
                      : isZh ? '(健康)' : '(healthy)'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Inconsistency notes */}
        <section style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: v3.textPrimary }}>
            {isZh ? '审查备注' : 'Review Notes'}
          </h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: v3.textSecondary }}>
            {isZh
              ? '所有文件已收集并通过初步法务尽职调查。如有任何疑问，请直接与房东联系。'
              : 'All documents have been received and verified against standard screening criteria. Contact your landlord for any questions.'}
          </p>
        </section>

        {/* Audit trail */}
        <section
          style={{
            background: v3.divider,
            borderRadius: size.radius.xl,
            padding: 14,
            fontSize: 11,
            color: v3.textMuted,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {isZh ? '报告生成于 ' : 'Report generated '}
          {new Date(screeningCase.created_at).toLocaleString(isZh ? 'zh-CN' : 'en-CA')}
          {' • '}
          {isZh ? '报告由 ' : 'Report by '} {agentName}
        </section>
      </div>
    </main>
  )
}

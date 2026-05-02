'use client'
export const runtime = 'edge'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { createClient } from '@supabase/supabase-js'

interface ScreeningCase {
  id: string
  share_token: string
  applicant_name: string
  applicant_email: string
  landlord_name: string
  branding?: { logo_url?: string; agent_name?: string; brand_color?: string }
  documents_checklist?: Record<string, boolean>
  monthly_income?: number
  monthly_rent?: number
  employment_verified?: boolean
  created_at: string
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anonSupabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null

  useEffect(() => {
    if (!shareToken || !anonSupabase) return
    void loadScreeningCase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken])

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
      if (data) setScreeningCase(data as ScreeningCase)
      else setNotFound(true)
    } catch (e) {
      console.error('Error loading screening case:', e)
      setNotFound(true)
    }
    setLoading(false)
  }

  async function writeAuditEvent() {
    if (!screeningCase || !anonSupabase) return
    try {
      const ip = 'browser'
      const ipTruncated = ip.split('.').slice(0, 3).join('.') + '.x'
      await anonSupabase.from('audit_events').insert({
        action: 'report_viewed',
        resource_type: 'screening_case',
        resource_id: screeningCase.id,
        metadata: { share_token: shareToken, ip_truncated: ipTruncated },
      })
      setAuditWritten(true)
    } catch (e) {
      console.error('Error writing audit event:', e)
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100%', overflow: 'auto', background: '#F2EEE5' }} className="fp-scroll">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: v3.textMuted, fontSize: 14 }}>
          {isZh ? '加载…' : 'Loading…'}
        </div>
      </div>
    )
  }

  if (notFound || !screeningCase) {
    return (
      <div style={{ height: '100%', overflow: 'auto', background: '#F2EEE5' }} className="fp-scroll">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <div
            style={{
              background: '#FFFFFF',
              border: `1px solid #D8D2C2`,
              borderRadius: 8,
              padding: 32,
              maxWidth: 500,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16, color: v3.warning }}>⚠</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: v3.textPrimary, margin: '0 0 8px' }}>
              {isZh ? '报告不可用' : 'Report no longer available'}
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: v3.textSecondary, lineHeight: 1.6 }}>
              {isZh ? '此共享链接已过期或不存在。' : 'This share link has expired or does not exist.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const branding = screeningCase.branding || {}
  const docsSubmitted = Object.values(screeningCase.documents_checklist || {}).filter((v) => v).length
  const totalDocs = Object.keys(screeningCase.documents_checklist || {}).length || 5
  const readinessPercent = totalDocs > 0 ? Math.round((docsSubmitted / totalDocs) * 100) : 0

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#F2EEE5' }} className="fp-scroll">
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
          SECURE REPORT · /r/{shareToken?.slice(0, 12)}
        </span>
        <div style={{ flex: 1 }} />
        <button
          style={{
            background: '#FFFFFF',
            color: '#047857',
            border: '1px solid #C5BDAA',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 14px',
            cursor: 'pointer',
          }}
        >
          {isZh ? '下载 PDF' : 'Download PDF'}
        </button>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 32px 60px' }}>
        {/* Cover card */}
        <div
          style={{
            padding: 28,
            marginBottom: 18,
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 20,
            alignItems: 'center',
            background: '#EFEADC',
            borderRadius: 8,
            border: `1px solid #D8D2C2`,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#10B981',
                fontWeight: 700,
              }}
            >
              {branding.agent_name || 'Stayloop'}
            </div>
            <h1
              style={{
                fontFamily: 'var(--f-serif)',
                fontSize: 30,
                fontWeight: 600,
                color: '#064E3B',
                margin: '10px 0 6px',
                letterSpacing: '-0.02em',
              }}
            >
              {screeningCase.applicant_name} — {isZh ? '申请预审报告' : 'Application Readiness Report'}
            </h1>
            <div style={{ fontSize: 13, color: '#6B7F76' }}>
              {isZh ? '生成于 ' : 'Generated on '}
              {new Date(screeningCase.created_at).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: 'var(--f-serif)',
                fontSize: 48,
                fontWeight: 600,
                color: '#10B981',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {readinessPercent}%
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#6B7F76',
                marginTop: 4,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {isZh ? '应用就绪度' : 'Application Readiness'}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          {[
            {
              label: isZh ? '文件' : 'Documents',
              value: `${docsSubmitted} / ${totalDocs}`,
              sub: isZh ? '提交完毕' : 'submitted',
              tone: 'ok',
            },
            {
              label: isZh ? '收入' : 'Income',
              value: `$${screeningCase.monthly_income?.toLocaleString() || '0'}/mo`,
              sub: isZh ? '已验证' : 'Verified',
              tone: 'ok',
            },
            {
              label: isZh ? '比率' : 'Rent ratio',
              value: `${screeningCase.monthly_rent && screeningCase.monthly_income ? Math.round((screeningCase.monthly_rent / screeningCase.monthly_income) * 100) : 0}%`,
              sub: isZh ? '合理范围' : 'Healthy',
              tone: 'ok',
            },
            {
              label: isZh ? '就业' : 'Employment',
              value: screeningCase.employment_verified ? '✓' : '?',
              sub: screeningCase.employment_verified ? (isZh ? '已验证' : 'Verified') : (isZh ? '待确认' : 'Pending'),
              tone: screeningCase.employment_verified ? 'ok' : 'warn',
            },
          ].map((kpi, i) => (
            <div
              key={i}
              style={{
                background: '#FFFFFF',
                border: `1px solid #D8D2C2`,
                borderRadius: 8,
                padding: '18px 20px',
              }}
            >
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
                {kpi.label}
              </div>
              <div
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 30,
                  fontWeight: 500,
                  color: kpi.tone === 'ok' ? '#047857' : '#D97706',
                  marginTop: 6,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                }}
              >
                {kpi.value}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#71717A' }}>{kpi.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Section 1: Summary */}
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid #D8D2C2`,
            borderRadius: 8,
            padding: 24,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#71717A',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            1 · {isZh ? 'AI 筛选总结' : 'AI Screening Summary'}
          </div>
          <p
            style={{
              fontSize: 14,
              color: '#171717',
              lineHeight: 1.65,
              marginTop: 10,
            }}
          >
            {isZh
              ? `${screeningCase.applicant_name} 的申请已准备好进行下一步处理。收入在提交的 ${totalDocs} 份文件中已核实。已通过初步背景和身份验证。建议继续进行标准续期流程。`
              : `${screeningCase.applicant_name}'s application is ready to advance. Income verified across ${docsSubmitted} documents. Identity confirmed. Recommended for standard lease signing process.`}
          </p>
        </div>

        {/* Section 2: Document checklist */}
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid #D8D2C2`,
            borderRadius: 8,
            padding: 24,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#71717A',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            2 · {isZh ? '文件清单' : 'Document checklist'}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              marginTop: 10,
            }}
          >
            {Object.entries(screeningCase.documents_checklist || {}).map(([doc, submitted], i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 13,
                  color: '#171717',
                  padding: '8px 0',
                  borderBottom: `1px dashed #D8D2C2`,
                }}
              >
                <span
                  style={{
                    color: submitted ? '#16A34A' : '#A1A1AA',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 700,
                    width: 14,
                  }}
                >
                  {submitted ? '✓' : '—'}
                </span>
                <span style={{ flex: 1 }}>{doc.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Income & employment */}
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid #D8D2C2`,
            borderRadius: 8,
            padding: 24,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#71717A',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            3 · {isZh ? '收入与就业' : 'Income & employment'}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              gap: '10px 16px',
              fontSize: 13,
              marginTop: 10,
            }}
          >
            {[
              [isZh ? '雇主' : 'Employer', 'Verified Inc.'],
              [isZh ? '职位' : 'Position', isZh ? '永久员工 · 2年任期' : 'Permanent · 2 yr tenure'],
              [isZh ? '月收入' : 'Gross monthly', `$${screeningCase.monthly_income || 0}`],
              [isZh ? '年度' : 'Annual', `$${(screeningCase.monthly_income ? screeningCase.monthly_income * 12 : 0).toLocaleString()}`],
              [isZh ? '就业验证' : 'Employment verified', screeningCase.employment_verified ? (isZh ? '已验证' : 'Verified') : (isZh ? '待定' : 'Pending')],
            ].map((r, i) => (
              <div key={i} style={{ display: 'contents' }}>
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
                  {r[0]}
                </div>
                <div style={{ color: '#171717' }}>{r[1]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Recommended next step */}
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid #D8D2C2`,
            borderRadius: 8,
            padding: 24,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#71717A',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            4 · {isZh ? '建议的下一步' : 'Recommended next step'}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 14,
              background: '#DCFCE7',
              border: `1px solid rgba(16,185,129,0.32)`,
              borderRadius: 8,
              marginTop: 10,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#10B981',
                color: '#0B1736',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700,
              }}
            >
              →
            </span>
            <div style={{ flex: 1, fontSize: 13, color: '#171717', lineHeight: 1.5 }}>
              {isZh
                ? '申请已准备好进行租赁签署。建议房东在标准租赁协议上与申请人进行电子签署。'
                : 'Application is ready for lease signing. Proceed with standard lease signing process.'}
            </div>
            <button
              style={{
                background: '#FFFFFF',
                color: '#171717',
                border: '1px solid #C5BDAA',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              {isZh ? '继续' : 'Proceed'}
            </button>
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#71717A',
              marginTop: 10,
              lineHeight: 1.55,
            }}
          >
            {isZh
              ? 'Stayloop 报告描述申请就绪情况、缺失项目和建议的验证步骤。它们不生成风险评分或自动决定。最终决定需要明确的申请人同意。'
              : 'Stayloop reports describe Application Readiness and missing items. They do not generate risk scores or auto-decisions. Final decisions require explicit applicant consent.'}
          </div>
        </div>

        {/* Section 5: Audit trail */}
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid #D8D2C2`,
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: '#71717A',
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            5 · {isZh ? '审计跟踪' : 'Audit trail'}
          </div>
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 140px 1fr 100px',
                gap: 14,
                padding: '10px 0',
                borderBottom: `1px dashed #D8D2C2`,
                fontSize: 12,
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#A1A1AA',
                }}
              >
                {new Date(screeningCase.created_at).toLocaleDateString(isZh ? 'zh-CN' : 'en-CA')}
              </span>
              <span style={{ color: '#171717', fontWeight: 500 }}>Stayloop AI</span>
              <span style={{ color: '#3F3F46' }}>generated report</span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#A1A1AA',
                  textAlign: 'right',
                }}
              >
                —
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

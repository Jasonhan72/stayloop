'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { useT } from '@/lib/i18n'
import { v3, size } from '@/lib/brand'
import PageShell from '@/components/v4/PageShell'

interface ScreeningResult {
  screening_id: string
  applicant_name: string
  applicant_email: string
  ai_score?: number
  status: string
  created_at: string
}

export default function ManualScreeningPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user, loading: authLoading } = useUser({ redirectIfMissing: true })

  const [applicantName, setApplicantName] = useState('')
  const [applicantEmail, setApplicantEmail] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ScreeningResult | null>(null)
  const [progress, setProgress] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)

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

  async function handleSubmit() {
    if (!user || !applicantName || !applicantEmail || files.length === 0) return
    setSubmitting(true)
    setProgress(isZh ? '创建筛查案例...' : 'Creating screening case...')

    try {
      const { data: caseData, error: caseError } = await supabase
        .from('screening_cases')
        .insert({
          source: 'landlord_manual',
          owner_id: user.profileId,
          applicant_email: applicantEmail,
          applicant_name: applicantName,
          status: 'in_progress',
        })
        .select()
        .single()

      if (caseError) throw caseError

      setProgress(isZh ? '上传文件...' : 'Uploading files...')

      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      formData.append('screening_id', caseData.id)

      const response = await fetch('/api/screen-score', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Screening failed')

      setProgress(isZh ? '评分完毕' : 'Scoring complete')
      setResult({
        screening_id: caseData.id,
        applicant_name: applicantName,
        applicant_email: applicantEmail,
        status: 'completed',
        created_at: new Date().toISOString(),
      })

      setApplicantName('')
      setApplicantEmail('')
      setFiles([])
    } catch (err) {
      setProgress(isZh ? '错误：' + String(err) : 'Error: ' + String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const documentData = [
    { name: 'paystub_jul.pdf', cls: 'Pay stub', confidence: 98, fields: ['Employer: Shopify', 'Gross: $7,100/mo', 'Pay date: Jul 31'], tone: 'ok' },
    { name: 'paystub_jun.pdf', cls: 'Pay stub', confidence: 97, fields: ['Gross: $7,100/mo', 'Net: $5,260'], tone: 'ok' },
    { name: 'employment_letter.docx', cls: 'Employment letter', confidence: 95, fields: ['Senior Designer · Permanent', 'Annual: $85,200'], tone: 'ok' },
    { name: 'driver_license.jpg', cls: 'Government ID', confidence: 99, fields: ['Mei Chen · DOB 1992-04', 'ON · Class G'], tone: 'ok' },
    { name: 'credit_report.pdf', cls: 'Credit report', confidence: 92, fields: ['Equifax · 718 · Pulled Aug 12'], tone: 'ok' },
    { name: 'reference_chen.pdf', cls: 'Landlord reference', confidence: 84, fields: ['Past landlord: K. Wong · 2 years'], tone: 'info' },
    { name: 'wechat_screenshot1.jpg', cls: 'Unclear · review', confidence: 46, fields: ['Possible bank balance screenshot'], tone: 'warn' },
    { name: 'untitled_2.png', cls: 'Unclassified', confidence: 18, fields: ['Low resolution · re-upload'], tone: 'warn' },
  ]

  const getToneColor = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.success
      case 'warn': return v3.danger
      case 'info': return v3.info
      default: return v3.textMuted
    }
  }

  const getToneBackground = (tone: string) => {
    switch (tone) {
      case 'ok': return v3.successSoft
      case 'warn': return v3.dangerSoft
      case 'info': return v3.infoSoft
      default: return v3.divider
    }
  }

  return (
    <PageShell role="landlord">
      <div style={{ maxWidth: size.content.wide, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Step strip */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {['Upload', 'Classify', 'Extract', 'Verify', 'Generate report'].map((step, i) => {
                const done = i < 3
                const active = i === 3
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 100, flex: 1 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: done ? v3.brand : active ? '#fff' : v3.divider,
                      border: `1.5px solid ${done || active ? v3.brand : v3.borderStrong}`,
                      color: done ? '#fff' : active ? v3.brand : v3.textMuted,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                    }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <div style={{ fontSize: 11, color: active || done ? v3.textPrimary : v3.textMuted, fontWeight: active ? 600 : 500, textAlign: 'center', maxWidth: 96, lineHeight: 1.3 }}>
                      {step}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Document upload section */}
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 0, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div style={{ padding: '14px 22px', borderBottom: `1px solid ${v3.border}`, display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: v3.textPrimary }}>
                {isZh ? '文件' : 'Documents'}
              </h3>
              <span style={{ fontSize: 12, color: v3.textMuted, marginLeft: 10 }}>
                11 uploaded · 9 classified
              </span>
              <div style={{ flex: 1 }} />
              <button style={{ background: 'none', border: 'none', color: v3.brand, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                + {isZh ? '添加文件' : 'Add files'}
              </button>
            </div>
            {documentData.map((d, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 140px 60px 1fr', gap: 12, padding: '12px 22px', borderTop: i === 0 ? 'none' : `1px dashed ${v3.border}`, fontSize: 13, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: v3.textPrimary, fontFamily: 'monospace', fontSize: 12 }}>
                    {d.name}
                  </div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${d.tone === 'ok' ? '#BBF7D0' : d.tone === 'warn' ? '#FECACA' : d.tone === 'info' ? '#BFDBFE' : '#D8D2C2'}`, color: getToneColor(d.tone), background: getToneBackground(d.tone) }}>
                  {d.cls}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: d.confidence >= 80 ? v3.success : d.confidence >= 50 ? v3.brandBright : v3.danger, fontWeight: 600 }}>
                  {d.confidence}%
                </span>
                <div style={{ fontSize: 11, color: v3.textMuted, lineHeight: 1.6 }}>
                  {d.fields.join(' · ')}
                </div>
              </div>
            ))}
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${v3.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: v3.surfaceCard, color: v3.textPrimary, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {isZh ? '保存草稿' : 'Save draft'}
              </button>
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'linear-gradient(135deg,#6EE7B7 0%,#34D399 100%)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset', letterSpacing: '-0.01em' }}>
                {isZh ? '生成AI报告 →' : 'Generate AI report →'}
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: v3.textMuted, fontWeight: 700, marginBottom: 8 }}>
              {isZh ? '案例信息' : 'Case info'}
            </div>
            <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
              <div>
                <span style={{ color: v3.textMuted, fontSize: 11 }}>Applicant</span>
                <div style={{ color: v3.textPrimary, fontWeight: 600, marginTop: 2 }}>Mei Chen</div>
              </div>
              <div>
                <span style={{ color: v3.textMuted, fontSize: 11 }}>Source</span>
                <div style={{ color: v3.textPrimary, marginTop: 2 }}>Email · forwarded from agent.kim@remax.com</div>
              </div>
              <div>
                <span style={{ color: v3.textMuted, fontSize: 11 }}>Listing</span>
                <div style={{ color: v3.textPrimary, marginTop: 2 }}>52 Wellesley E · 1207</div>
              </div>
              <div>
                <span style={{ color: v3.textMuted, fontSize: 11 }}>Consent</span>
                <div style={{ marginTop: 2 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: v3.warningSoft, color: v3.warning, fontSize: 11, fontWeight: 600 }}>
                    Not yet collected
                  </span>
                </div>
              </div>
            </div>
            <button style={{ width: '100%', marginTop: 14, padding: '10px 18px', background: v3.surfaceCard, color: v3.textPrimary, border: `1px solid ${v3.borderStrong}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
              {isZh ? '发送同意请求 →' : 'Send consent request →'}
            </button>
          </div>

          <div style={{ background: `linear-gradient(180deg, ${v3.trustSoft} 0%, #fff 100%)`, border: `1px solid #D7C5FA`, borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: v3.trust, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 11 }}>
                ✦
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
                {isZh ? 'AI 标记 · 3' : 'AI flags · 3'}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { title: isZh ? '不一致 · 雇主名称' : 'Inconsistency · employer name', body: isZh ? '工资单说"Shopify Inc."；信函说"Shopify Canada Inc."。可能是同一个——确认。' : 'Pay stub says "Shopify Inc."; letter says "Shopify Canada Inc.". Likely same — confirm.', cta: 'Resolve' },
                { title: isZh ? '缺少 · 第二个推荐人' : 'Missing · 2nd reference', body: isZh ? '建议新租户在当前雇主工作少于1年。' : 'Recommended for first-time tenants under 1 yr at current employer.', cta: 'Request' },
                { title: isZh ? '合规 · 信用同意' : 'Compliance · credit consent', body: isZh ? '用明确的同意拉取新的Equifax（19美元验证附加组件）。' : 'Pull a fresh Equifax with explicit consent ($19 verified add-on).', cta: 'Add' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: v3.textPrimary }}>
                  <span style={{ color: v3.trust, fontFamily: 'monospace', fontWeight: 600, marginTop: 2 }}>›</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{item.title}</div>
                    <div style={{ color: v3.textSecondary, fontSize: 12 }}>{item.body}</div>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: v3.trust, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
                    {item.cta}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: v3.surfaceMuted, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 14, fontSize: 11, color: v3.textSecondary, lineHeight: 1.55, boxShadow: '0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -8px rgba(31,25,11,0.06)' }}>
            <b style={{ color: v3.textPrimary }}>Language guardrail.</b> Stayloop reports never include "high risk" / "reject". They list <i>Application Readiness</i>, missing items and suggested next steps.
          </div>
        </div>
      </div>
    </PageShell>
  )
}

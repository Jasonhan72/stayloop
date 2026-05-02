'use client'

import { useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT, LanguageToggle } from '@/lib/i18n'
import MarketingNav from '@/components/marketing/MarketingNav'
import SecHead from '@/components/v4/SecHead'

type Section = 'overview' | 'auth' | 'screen' | 'passport' | 'compliance' | 'mediate' | 'webhooks' | 'sdks' | 'rate-limits' | 'errors'

const sections: { id: Section; label_en: string; label_zh: string }[] = [
  { id: 'overview', label_en: 'Overview', label_zh: '概览' },
  { id: 'auth', label_en: 'Authentication', label_zh: '身份认证' },
  { id: 'screen', label_en: 'POST /v1/screen', label_zh: 'POST /v1/screen' },
  { id: 'passport', label_en: 'POST /v1/passport/verify', label_zh: 'POST /v1/passport/verify' },
  { id: 'compliance', label_en: 'GET /v1/listings/{id}/compliance', label_zh: 'GET /v1/listings/{id}/compliance' },
  { id: 'mediate', label_en: 'POST /v1/disputes/mediate', label_zh: 'POST /v1/disputes/mediate' },
  { id: 'webhooks', label_en: 'Webhooks', label_zh: 'Webhooks' },
  { id: 'sdks', label_en: 'SDKs', label_zh: 'SDKs' },
  { id: 'rate-limits', label_en: 'Rate limits', label_zh: '速率限制' },
  { id: 'errors', label_en: 'Errors', label_zh: '错误处理' },
]

export default function TrustApiDocsPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [activeSection, setActiveSection] = useState<Section>('overview')
  const [authToken, setAuthToken] = useState('')
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('POST /v1/screen')

  const handleSectionClick = (id: Section) => {
    setActiveSection(id)
    const elem = document.getElementById(`section-${id}`)
    if (elem) {
      setTimeout(() => elem.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  const label = (en: string, zh: string) => (isZh ? zh : en)

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <MarketingNav />
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '220px 1fr 260px',
          gap: 24,
          padding: '32px 24px',
          minHeight: 'calc(100vh - 60px)',
        }}
      >
        {/* LEFT SIDEBAR — Navigation */}
        <nav
          style={{
            position: 'sticky',
            top: 80,
            height: 'fit-content',
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 100px)',
          }}
        >
          {sections.map((sec) => (
            <button
              key={sec.id}
              onClick={() => handleSectionClick(sec.id)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                marginBottom: 4,
                background: activeSection === sec.id ? v3.brandSoft : 'transparent',
                border: 'none',
                borderLeft: activeSection === sec.id ? `3px solid ${v3.brand}` : '3px solid transparent',
                color: activeSection === sec.id ? v3.brand : v3.textSecondary,
                fontSize: 13,
                fontWeight: 500,
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 4,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (activeSection !== sec.id) {
                  e.currentTarget.style.background = `rgba(4, 120, 87, 0.05)`
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== sec.id) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {isZh ? sec.label_zh : sec.label_en}
            </button>
          ))}
        </nav>

        {/* CENTER — Documentation Content */}
        <main
          style={{
            maxWidth: 720,
            background: v3.surfaceCard,
            borderRadius: 12,
            padding: '48px',
            boxShadow: size.shadow.sm,
          }}
        >
          {/* Hero */}
          <SecHead
            eyebrow="TRUST API"
            title={label('Stayloop Trust API', 'Stayloop Trust API')}
            sub="v1 · build-2026-04-28"
          />
          <div style={{ marginBottom: 56 }}>
            {/* Moved hero details below header */}
            <div
              style={{
                display: 'inline-block',
                background: v3.ink,
                color: v3.textOnBrand,
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                marginBottom: 24,
              }}
            >
            </div>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                color: v3.textSecondary,
              }}
            >
              {label(
                'Developer documentation for the Stayloop Trust API. Verify tenant identity, income, credit, and eviction history in a single API call.',
                '开发者文档。在一次 API 调用中验证租客身份、收入、信用和驱逐历史。'
              )}
            </p>
          </div>

          {/* OVERVIEW */}
          <section id="section-overview" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 16,
              }}
            >
              {label('Overview', '概览')}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'The Stayloop Trust API provides a unified interface to verify tenant credentials across multiple data sources. All requests require authentication via an API key.',
                'Stayloop Trust API 提供统一接口来验证租客凭证。所有请求需使用 API 密钥进行身份认证。'
              )}
            </p>
            <div
              style={{
                background: v3.surfaceMuted,
                border: `1px solid ${v3.border}`,
                borderRadius: 8,
                padding: '16px',
                fontSize: 13,
                color: v3.textSecondary,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {label(
                'Base URL: https://api.stayloop.ai/v1',
                '基础 URL: https://api.stayloop.ai/v1'
              )}
            </div>
          </section>

          {/* AUTHENTICATION */}
          <section id="section-auth" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 16,
              }}
            >
              {label('Authentication', '身份认证')}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'All API requests require a Bearer token in the Authorization header. You can generate API keys from your Stayloop dashboard.',
                '所有 API 请求都需在 Authorization 标头中使用 Bearer 令牌。你可从 Stayloop 仪表盘生成 API 密钥。'
              )}
            </p>
            <CodeBlock
              code={`curl -X POST https://api.stayloop.ai/v1/screen \\
  -H "Authorization: Bearer sk_test_abcd1234..." \\
  -H "Content-Type: application/json" \\
  -d '{...}'`}
            />
            <p style={{ fontSize: 13, color: v3.textMuted, marginTop: 12 }}>
              {label(
                'Test keys start with sk_test_; production keys start with sk_live_.',
                '测试密钥以 sk_test_ 开头；生产密钥以 sk_live_ 开头。'
              )}
            </p>
          </section>

          {/* POST /v1/screen */}
          <section id="section-screen" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 12,
              }}
            >
              POST /v1/screen
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'Screen a tenant applicant by submitting applicant details, listing info, and supporting documents. Returns a composite risk score (0–100) with forensics, court records, and AI assessment.',
                '通过提交申请人详情、房源信息和支持文件来筛查租户申请人。返回综合风险评分（0–100）、取证、法院记录和 AI 评估。'
              )}
            </p>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Request', '请求')}
              </div>
              <CodeBlock code={JSON.stringify({
                applicant: {
                  name: 'John Smith',
                  email: 'john@example.com',
                  monthly_income: 4500
                },
                listing: {
                  rent: 1800,
                  address: '123 King St W, Toronto, ON M5H 2R2'
                },
                documents: [
                  { path: 'path/to/id.pdf', type: 'government_id' },
                  { path: 'path/to/paystub.pdf', type: 'pay_stub' }
                ]
              }, null, 2)} isJson />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Response', '响应')}
              </div>
              <CodeBlock code={JSON.stringify({
                score: 87,
                tier: 'approve',
                reason: 'Strong income-to-rent ratio (2.5×), clear rental history, no court records.',
                forensics: {
                  document_authenticity: 0.98,
                  payment_ability: 0.95,
                  court_records: 0,
                  stability: 0.92,
                  behavior_signals: 0.88,
                  info_consistency: 0.91
                },
                court_records: []
              }, null, 2)} isJson />
            </div>

            <StatusCodesTable
              codes={[
                { code: '200', desc: isZh ? '成功' : 'Success' },
                { code: '400', desc: isZh ? '缺少必需字段' : 'Missing required fields' },
                { code: '401', desc: isZh ? '无效 API 密钥' : 'Invalid API key' },
                { code: '429', desc: isZh ? '超过速率限制' : 'Rate limit exceeded' },
                { code: '500', desc: isZh ? '服务器错误' : 'Server error' },
              ]}
            />
          </section>

          {/* POST /v1/passport/verify */}
          <section id="section-passport" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 12,
              }}
            >
              POST /v1/passport/verify
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'Verify a Verified Passport token. Passports are issued once a tenant completes screening and remain valid for 12 months across all landlords in the network.',
                '验证已验证的 Passport 令牌。护照在租客完成筛查后签发，在网络中所有房东间有效期为 12 个月。'
              )}
            </p>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Request', '请求')}
              </div>
              <CodeBlock code={JSON.stringify({
                passport_id: 'SL-2026-XXXXX-XXX'
              }, null, 2)} isJson />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Response', '响应')}
              </div>
              <CodeBlock code={JSON.stringify({
                verified: true,
                tenant_id: 'tnr_abc123',
                claims: {
                  income_3x: true,
                  no_evictions: true,
                  credit_approved: true,
                  identity_verified: true
                },
                expires_at: '2027-04-28T00:00:00Z',
                issued_at: '2026-04-28T00:00:00Z'
              }, null, 2)} isJson />
            </div>

            <StatusCodesTable
              codes={[
                { code: '200', desc: isZh ? '护照有效' : 'Passport valid' },
                { code: '401', desc: isZh ? '护照已过期或无效' : 'Passport expired or invalid' },
                { code: '429', desc: isZh ? '超过速率限制' : 'Rate limit exceeded' },
              ]}
            />
          </section>

          {/* GET /v1/listings/{id}/compliance */}
          <section id="section-compliance" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 12,
              }}
            >
              GET /v1/listings/{'{id}'}/compliance
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'Check a listing for OHRC (Ontario Human Rights Code) compliance. Returns pass/fail plus warnings for protected grounds (family status, religion, source of income, etc.).',
                '检查房源是否符合 OHRC（安省人权法）。返回通过/失败状态，以及对保护基础（家庭状况、宗教、收入来源等）的警告。'
              )}
            </p>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Request', '请求')}
              </div>
              <CodeBlock code={`curl -X GET https://api.stayloop.ai/v1/listings/lst_abc123/compliance \\
  -H "Authorization: Bearer sk_test_abcd1234..."`}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Response', '响应')}
              </div>
              <CodeBlock code={JSON.stringify({
                passes: true,
                warnings: [
                  {
                    code: 'pet_policy_note',
                    severity: 'low',
                    field: 'description',
                    matched_text: 'no pets',
                    rationale_en: 'Pet restrictions may conflict with assistance animal rights',
                    rationale_zh: '宠物限制可能与辅助动物权利冲突'
                  }
                ]
              }, null, 2)} isJson />
            </div>

            <StatusCodesTable
              codes={[
                { code: '200', desc: isZh ? '检查完成' : 'Check completed' },
                { code: '404', desc: isZh ? '房源未找到' : 'Listing not found' },
                { code: '401', desc: isZh ? '无效 API 密钥' : 'Invalid API key' },
              ]}
            />
          </section>

          {/* POST /v1/disputes/mediate */}
          <section id="section-mediate" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 12,
              }}
            >
              POST /v1/disputes/mediate
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'Submit a dispute for AI-powered mediation. Mediator agent provides neutral proposals grounded in Ontario RTA (Residential Tenancies Act). 14-day resolution window.',
                '提交纠纷以进行 AI 驱动的调解。调解员代理提供基于安省《住宅租赁法》的中立建议。14 天解决期限。'
              )}
            </p>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Request', '请求')}
              </div>
              <CodeBlock code={JSON.stringify({
                dispute_id: 'dsp_abc123',
                party: 'tenant',
                message: 'Landlord has not returned my damage deposit after 30 days.'
              }, null, 2)} isJson />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: v3.textMuted,
                  marginBottom: 8,
                }}
              >
                {label('Response', '响应')}
              </div>
              <CodeBlock code={JSON.stringify({
                mediator_response: 'Under RTA §106, landlord must return deposit within 30 days + interest, or provide written itemization.',
                suggested_settlement: 'Landlord returns deposit + interest within 5 business days.',
                days_remaining: 10,
                rta_citations: ['§106', '§104']
              }, null, 2)} isJson />
            </div>

            <StatusCodesTable
              codes={[
                { code: '200', desc: isZh ? '调解已开始' : 'Mediation started' },
                { code: '400', desc: isZh ? '纠纷 ID 无效' : 'Invalid dispute ID' },
                { code: '429', desc: isZh ? '超过速率限制' : 'Rate limit exceeded' },
              ]}
            />
          </section>

          {/* WEBHOOKS */}
          <section id="section-webhooks" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 16,
              }}
            >
              {label('Webhooks', 'Webhooks')}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'Stayloop sends webhook events for key lifecycle events. All webhooks are signed with HMAC-SHA256.',
                'Stayloop 会针对关键生命周期事件发送 webhook 事件。所有 webhook 使用 HMAC-SHA256 签名。'
              )}
            </p>

            <div
              style={{
                background: v3.surfaceMuted,
                border: `1px solid ${v3.border}`,
                padding: '16px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
                color: v3.textSecondary,
              }}
            >
              <strong style={{ color: v3.textPrimary }}>Webhook events:</strong>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>application.scored</li>
                <li>passport.verified</li>
                <li>compliance.warning</li>
                <li>dispute.settled</li>
              </ul>
            </div>

            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary }}>
              {label(
                'Configure your webhook endpoint in the API dashboard. Stayloop retries failed deliveries up to 5 times with exponential backoff.',
                '在 API 仪表盘中配置 webhook 端点。Stayloop 会使用指数退避重试失败的交付，最多重试 5 次。'
              )}
            </p>
          </section>

          {/* SDKS */}
          <section id="section-sdks" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 16,
              }}
            >
              {label('SDKs', 'SDKs')}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'Official Stayloop SDKs are available for JavaScript, Python, and Go.',
                '官方 Stayloop SDK 可用于 JavaScript、Python 和 Go。'
              )}
            </p>

            <CodeBlock code={`npm install @stayloop/trust-api

import { TrustAPI } from '@stayloop/trust-api'

const client = new TrustAPI({ apiKey: 'sk_test_...' })
const result = await client.screen({...})`}
            />
          </section>

          {/* RATE LIMITS */}
          <section id="section-rate-limits" style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 16,
              }}
            >
              {label('Rate limits', '速率限制')}
            </h2>
            <div
              style={{
                overflowX: 'auto',
                marginBottom: 16,
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: `1px solid ${v3.border}` }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, color: v3.textPrimary }}>
                      {label('Tier', '等级')}
                    </th>
                    <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, color: v3.textPrimary }}>
                      {label('Requests/min', '请求/分钟')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${v3.divider}` }}>
                    <td style={{ padding: '8px 0', color: v3.textSecondary }}>Free</td>
                    <td style={{ padding: '8px 0', color: v3.textSecondary }}>60</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${v3.divider}` }}>
                    <td style={{ padding: '8px 0', color: v3.textSecondary }}>Pro</td>
                    <td style={{ padding: '8px 0', color: v3.textSecondary }}>600</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: v3.textSecondary }}>Enterprise</td>
                    <td style={{ padding: '8px 0', color: v3.textSecondary }}>{label('Custom', '自定义')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 13, color: v3.textMuted }}>
              {label(
                'Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset (Unix timestamp).',
                '速率限制标头：X-RateLimit-Limit、X-RateLimit-Remaining、X-RateLimit-Reset（Unix 时间戳）。'
              )}
            </p>
          </section>

          {/* ERRORS */}
          <section id="section-errors" style={{ marginBottom: 0 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: v3.textPrimary,
                marginBottom: 16,
              }}
            >
              {label('Error handling', '错误处理')}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, marginBottom: 16 }}>
              {label(
                'All API errors return a consistent JSON structure with an error code and message.',
                '所有 API 错误都返回一致的 JSON 结构，包含错误代码和消息。'
              )}
            </p>

            <CodeBlock code={JSON.stringify({
              error: {
                code: 'invalid_api_key',
                message: 'The provided API key is invalid or expired.',
                type: 'authentication_error'
              }
            }, null, 2)} isJson />
          </section>
        </main>

        {/* RIGHT RAIL — Try-it panel */}
        <aside
          style={{
            position: 'sticky',
            top: 80,
            height: 'fit-content',
            background: v3.surfaceCard,
            border: `1px solid ${v3.border}`,
            borderRadius: 12,
            padding: '24px',
            boxShadow: size.shadow.sm,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: v3.textMuted,
              marginBottom: 12,
            }}
          >
            {label('Try it', '试试看')}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: v3.textPrimary,
                marginBottom: 6,
              }}
            >
              {label('API Key', 'API 密钥')}
            </label>
            <input
              type="password"
              placeholder={label('sk_test_...', 'sk_test_...')}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${v3.border}`,
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: v3.textPrimary,
                marginBottom: 6,
              }}
            >
              {label('Endpoint', '端点')}
            </label>
            <select
              value={selectedEndpoint}
              onChange={(e) => setSelectedEndpoint(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${v3.border}`,
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                boxSizing: 'border-box',
              }}
            >
              <option>POST /v1/screen</option>
              <option>POST /v1/passport/verify</option>
              <option>GET /v1/listings/{'{id}'}/compliance</option>
              <option>POST /v1/disputes/mediate</option>
            </select>
          </div>

          <button
            disabled={!authToken}
            style={{
              width: '100%',
              padding: '10px',
              background: authToken
                ? `linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)`
                : v3.borderStrong,
              color: authToken ? '#fff' : v3.textMuted,
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: authToken ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (authToken) {
                e.currentTarget.style.filter = 'brightness(1.05)'
              }
            }}
            onMouseLeave={(e) => {
              if (authToken) {
                e.currentTarget.style.filter = 'brightness(1)'
              }
            }}
          >
            {label('Send request', '发送请求')}
          </button>

          <p
            style={{
              fontSize: 11,
              color: v3.textMuted,
              marginTop: 12,
              textAlign: 'center',
            }}
          >
            {label(
              '(Prototype — requests disabled)',
              '（原型 — 请求已禁用）'
            )}
          </p>
        </aside>
      </div>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────

function CodeBlock({ code, isJson }: { code: string; isJson?: boolean }) {
  return (
    <div
      style={{
        background: v3.ink,
        color: '#fff',
        borderRadius: 8,
        padding: '16px',
        overflow: 'auto',
        marginBottom: 16,
      }}
    >
      <pre
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
          margin: 0,
          color: '#fff',
        }}
      >
        {isJson ? (
          <code>{highlightJson(code)}</code>
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  )
}

function highlightJson(json: string): string {
  return json
}

function StatusCodesTable({
  codes,
}: {
  codes: Array<{ code: string; desc: string }>
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        <thead>
          <tr style={{ borderBottom: `1px solid ${v3.border}` }}>
            <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, color: v3.textPrimary }}>
              Code
            </th>
            <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, color: v3.textPrimary }}>
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {codes.map((row) => (
            <tr key={row.code} style={{ borderBottom: `1px solid ${v3.divider}` }}>
              <td
                style={{
                  padding: '8px 0',
                  color: v3.textSecondary,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 500,
                }}
              >
                {row.code}
              </td>
              <td style={{ padding: '8px 0', color: v3.textSecondary }}>{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

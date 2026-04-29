'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import AppHeader from '@/components/AppHeader'

type Step = 'org' | 'usecase' | 'apikey' | 'activate'

interface FormData {
  orgName: string
  orgType: 'brokerage' | 'property_mgmt' | 'insurer' | 'government' | 'other' | ''
  hqCity: string
  monthlyVolume: number
  primaryUseCase: 'tenant_screening' | 'listing_compliance' | 'dispute_mediation' | 'verified_passport' | 'multiple' | ''
  integrationTarget: 'direct_api' | 'webhook' | 'whitelabel_embed' | 'internal_dashboard' | ''
  launchDate: string
  notes: string
  testKey?: string
}

const STEPS: { key: Step; en: string; zh: string }[] = [
  { key: 'org', en: 'Organization', zh: '组织基本信息' },
  { key: 'usecase', en: 'Use case', zh: '使用场景' },
  { key: 'apikey', en: 'API key + sandbox', zh: 'API 密钥' },
  { key: 'activate', en: 'Activate', zh: '激活上线' },
]

const ORG_TYPES = [
  { id: 'brokerage', en: 'Brokerage', zh: '房产经纪公司' },
  { id: 'property_mgmt', en: 'Property Management', zh: '物业管理公司' },
  { id: 'insurer', en: 'Insurer', zh: '保险公司' },
  { id: 'government', en: 'Government', zh: '政府机构' },
  { id: 'other', en: 'Other', zh: '其他' },
]

const USE_CASES = [
  { id: 'tenant_screening', en: 'Tenant screening', zh: '租客筛查' },
  { id: 'listing_compliance', en: 'Listing compliance', zh: '列表合规性' },
  { id: 'dispute_mediation', en: 'Dispute mediation', zh: '争议调解' },
  { id: 'verified_passport', en: 'Verified Passport read', zh: 'Verified Passport 阅读' },
  { id: 'multiple', en: 'Multiple', zh: '多个' },
]

const INTEGRATION_TARGETS = [
  { id: 'direct_api', en: 'Direct API', zh: '直接 API' },
  { id: 'webhook', en: 'Webhook', zh: 'Webhook' },
  { id: 'whitelabel_embed', en: 'White-label embed', zh: '白标嵌入' },
  { id: 'internal_dashboard', en: 'Internal dashboard', zh: '内部仪表板' },
]

function generateTestKey(): string {
  const hex = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  return `sk_test_${hex.slice(0, 24)}`
}

export default function PartnerOnboardPage() {
  const { user, loading } = useUser({ redirectIfMissing: true })
  const { lang } = useT()
  const isZh = lang === 'zh'

  const [step, setStep] = useState<Step>('org')
  const [data, setData] = useState<FormData>({
    orgName: '',
    orgType: '',
    hqCity: '',
    monthlyVolume: 100,
    primaryUseCase: '',
    integrationTarget: '',
    launchDate: '',
    notes: '',
  })
  const [submitted, setSubmitted] = useState(false)

  const testKey = useMemo(() => {
    if (!data.testKey && step === 'apikey') {
      const key = generateTestKey()
      setData((d) => ({ ...d, testKey: key }))
      return key
    }
    return data.testKey
  }, [data.testKey, step])

  if (loading) {
    return (
      <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
        <AppHeader title="Partner onboarding" titleZh="合作方接入" />
        <div style={{ textAlign: 'center', padding: 48, color: v3.textMuted }}>
          {isZh ? '加载中…' : 'Loading…'}
        </div>
      </main>
    )
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === step)
  const isStepComplete = (stepKey: Step): boolean => {
    if (stepKey === 'org') {
      return !!data.orgName && !!data.orgType && !!data.hqCity && data.monthlyVolume > 0
    }
    if (stepKey === 'usecase') {
      return !!data.primaryUseCase && !!data.integrationTarget && !!data.launchDate
    }
    if (stepKey === 'apikey') {
      return !!testKey
    }
    if (stepKey === 'activate') {
      return submitted
    }
    return false
  }

  const canContinue = (): boolean => {
    if (step === 'org') {
      return !!data.orgName && !!data.orgType && !!data.hqCity && data.monthlyVolume > 0
    }
    if (step === 'usecase') {
      return !!data.primaryUseCase && !!data.integrationTarget && !!data.launchDate
    }
    if (step === 'apikey') {
      return !!testKey
    }
    return false
  }

  const handleNext = () => {
    if (step === 'org') setStep('usecase')
    else if (step === 'usecase') setStep('apikey')
    else if (step === 'apikey') setStep('activate')
  }

  const handleBack = () => {
    if (step === 'usecase') setStep('org')
    else if (step === 'apikey') setStep('usecase')
    else if (step === 'activate') setStep('apikey')
  }

  const handleSubmit = () => {
    setSubmitted(true)
  }

  // ─── Right rail content ─────────────────────────────────────────────────
  let rightContent: React.ReactNode = null

  if (step === 'org' || step === 'usecase') {
    rightContent = (
      <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          {isZh ? '为什么我们要问这个问题' : 'WHY WE ASK'}
        </div>
        <p style={{ fontSize: 13, color: v3.textSecondary, lineHeight: 1.6, margin: 0 }}>
          {step === 'org'
            ? isZh
              ? '了解您的组织帮助我们定制集成方案、配置沙盒环境，以及提供针对性的支持。'
              : 'Understanding your organization helps us customize the integration, configure sandboxes, and provide targeted support.'
            : isZh
            ? '您的使用场景决定了 API 权限范围、事件订阅和合规审查优先级。'
            : 'Your use case determines API scopes, event subscriptions, and compliance review priority.'}
        </p>
      </div>
    )
  } else if (step === 'apikey') {
    rightContent = (
      <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          {isZh ? '示例 API 调用' : 'EXAMPLE API CALL'}
        </div>
        <pre
          style={{
            background: v3.ink,
            color: v3.brandBright2,
            padding: 12,
            borderRadius: 8,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            overflow: 'auto',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {`curl -H "Authorization: Bearer ${testKey?.slice(0, 16)}..." \\
  https://sandbox.stayloop.ai/v1/screen \\
  -d '{"tenant_email":"..."}'`}
        </pre>
      </div>
    )
  } else if (step === 'activate') {
    rightContent = (
      <div style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          {isZh ? '确认信息摘要' : 'SUMMARY'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 2 }}>{isZh ? '组织' : 'Organization'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>{data.orgName}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 2 }}>{isZh ? '类型' : 'Type'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
              {ORG_TYPES.find((t) => t.id === data.orgType)?.[isZh ? 'zh' : 'en']}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 2 }}>{isZh ? '月度预期量' : 'Monthly volume'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>{data.monthlyVolume.toLocaleString()} screenings/mo</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 2 }}>{isZh ? '主要用途' : 'Use case'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>
              {USE_CASES.find((u) => u.id === data.primaryUseCase)?.[isZh ? 'zh' : 'en']}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 2 }}>{isZh ? '计划上线' : 'Launch date'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary }}>{data.launchDate}</div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Responsive layout grid ─────────────────────────────────────────────
  return (
    <main style={{ background: v3.surfaceMuted, minHeight: '100vh' }}>
      <AppHeader title="Partner onboarding" titleZh="合作方接入" />

      <div style={{ maxWidth: size.content.default, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '220px 1fr 320px', gap: 24 }} className="po-grid">
        <style jsx>{`
          @media (max-width: 1023px) {
            :global(.po-grid) {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 767px) {
            :global(.po-grid) {
              grid-template-columns: 1fr !important;
            }
            :global(.po-grid > aside:first-child) {
              display: none !important;
            }
            :global(.po-grid > aside:last-child) {
              display: none !important;
            }
          }
        `}</style>

        {/* LEFT SIDEBAR: Step indicator */}
        <aside style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STEPS.map((s, i) => {
              const isDone = STEPS.slice(0, i).every((step) => isStepComplete(step.key))
              const isActive = s.key === step
              return (
                <div
                  key={s.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: isActive ? v3.brandSoft : 'transparent',
                    color: isDone || isActive ? v3.brandStrong : v3.textMuted,
                    cursor: isDone ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (isDone) setStep(s.key)
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: isDone ? v3.brand : isActive ? v3.brand : v3.divider,
                      color: isDone || isActive ? '#fff' : v3.textMuted,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {isDone ? '✓' : i + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{isZh ? s.zh : s.en}</div>
                    <div style={{ fontSize: 10, color: v3.textMuted, fontFamily: 'var(--font-cn), system-ui' }}>
                      {isZh ? s.en : s.zh}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* CENTER: Form ─────────────────────────────────────────────────────── */}
        <section style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
          {/* Step 1: Organization */}
          {step === 'org' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                STEP 1 · {isZh ? '组织基本信息' : 'ORGANIZATION'}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                {isZh ? '告诉我们您的组织' : 'Tell us about your organization.'}
              </h1>
              <p style={{ fontSize: 13, color: v3.textMuted, marginBottom: 18 }}>
                {isZh ? '我们会根据这些信息定制您的集成' : "We'll customize your integration based on this info."}
              </p>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {isZh ? '组织名称' : 'Organization name'}
              </label>
              <input
                value={data.orgName}
                onChange={(e) => setData({ ...data, orgName: e.target.value })}
                placeholder={isZh ? '例如 Northbridge Insurance' : 'e.g. Northbridge Insurance'}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 10,
                  fontSize: 14,
                  color: v3.textPrimary,
                  fontFamily: 'inherit',
                  WebkitTextFillColor: v3.textPrimary,
                  caretColor: v3.textPrimary,
                  marginBottom: 18,
                }}
              />

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
                {isZh ? '组织类型' : 'Organization type'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 18 }}>
                {ORG_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setData({ ...data, orgType: type.id as FormData['orgType'] })}
                    style={{
                      padding: '10px 14px',
                      background: data.orgType === type.id ? v3.brand : v3.surfaceCard,
                      border: `1px solid ${data.orgType === type.id ? v3.brand : v3.border}`,
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: data.orgType === type.id ? '#fff' : v3.textPrimary,
                      cursor: 'pointer',
                      transition: 'all 200ms',
                    }}
                  >
                    {isZh ? type.zh : type.en}
                  </button>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {isZh ? 'HQ 城市' : 'HQ city'}
              </label>
              <input
                value={data.hqCity}
                onChange={(e) => setData({ ...data, hqCity: e.target.value })}
                placeholder={isZh ? '例如 Toronto' : 'e.g. Toronto'}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 10,
                  fontSize: 14,
                  color: v3.textPrimary,
                  fontFamily: 'inherit',
                  WebkitTextFillColor: v3.textPrimary,
                  caretColor: v3.textPrimary,
                  marginBottom: 18,
                }}
              />

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {isZh ? '预期月度筛查量' : 'Est. monthly screening volume'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step="100"
                  value={data.monthlyVolume}
                  onChange={(e) => setData({ ...data, monthlyVolume: parseInt(e.target.value) })}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary, minWidth: 80, textAlign: 'right' }}>
                  {data.monthlyVolume.toLocaleString()}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <div />
                <button
                  onClick={handleNext}
                  disabled={!canContinue()}
                  style={{
                    padding: '10px 22px',
                    background: canContinue() ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' : v3.borderStrong,
                    color: canContinue() ? '#fff' : v3.textMuted,
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: canContinue() ? 'pointer' : 'not-allowed',
                    boxShadow: canContinue() ? '0 8px 22px -10px rgba(52, 211, 153, 0.45)' : 'none',
                  }}
                >
                  {isZh ? '继续' : 'Continue'} →
                </button>
              </div>
            </>
          )}

          {/* Step 2: Use case */}
          {step === 'usecase' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                STEP 2 · {isZh ? '使用场景' : 'USE CASE'}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                {isZh ? '您的主要应用' : 'What will you build?'}
              </h1>
              <p style={{ fontSize: 13, color: v3.textMuted, marginBottom: 18 }}>
                {isZh ? '这确定了 API 权限、事件订阅和支持级别' : 'This determines API scopes, event subscriptions, and support.'}
              </p>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
                {isZh ? '主要用途' : 'Primary use case'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 18 }}>
                {USE_CASES.map((uc) => (
                  <button
                    key={uc.id}
                    onClick={() => setData({ ...data, primaryUseCase: uc.id as FormData['primaryUseCase'] })}
                    style={{
                      padding: '10px 14px',
                      background: data.primaryUseCase === uc.id ? v3.brand : v3.surfaceCard,
                      border: `1px solid ${data.primaryUseCase === uc.id ? v3.brand : v3.border}`,
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: data.primaryUseCase === uc.id ? '#fff' : v3.textPrimary,
                      cursor: 'pointer',
                      transition: 'all 200ms',
                    }}
                  >
                    {isZh ? uc.zh : uc.en}
                  </button>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
                {isZh ? '集成方式' : 'Integration target'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 18 }}>
                {INTEGRATION_TARGETS.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setData({ ...data, integrationTarget: it.id as FormData['integrationTarget'] })}
                    style={{
                      padding: '10px 14px',
                      background: data.integrationTarget === it.id ? v3.brand : v3.surfaceCard,
                      border: `1px solid ${data.integrationTarget === it.id ? v3.brand : v3.border}`,
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: data.integrationTarget === it.id ? '#fff' : v3.textPrimary,
                      cursor: 'pointer',
                      transition: 'all 200ms',
                    }}
                  >
                    {isZh ? it.zh : it.en}
                  </button>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {isZh ? '预计上线时间' : 'Estimated launch date'}
              </label>
              <input
                type="date"
                value={data.launchDate}
                onChange={(e) => setData({ ...data, launchDate: e.target.value })}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 10,
                  fontSize: 14,
                  color: v3.textPrimary,
                  fontFamily: 'inherit',
                  WebkitTextFillColor: v3.textPrimary,
                  caretColor: v3.textPrimary,
                  marginBottom: 18,
                }}
              />

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {isZh ? '补充说明（可选）' : 'Additional notes (optional)'}
              </label>
              <textarea
                value={data.notes}
                onChange={(e) => setData({ ...data, notes: e.target.value })}
                placeholder={isZh ? '例如：我们计划先在 staging 环境测试...' : 'e.g. We plan to test in staging first...'}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 10,
                  fontSize: 14,
                  color: v3.textPrimary,
                  fontFamily: 'inherit',
                  WebkitTextFillColor: v3.textPrimary,
                  caretColor: v3.textPrimary,
                  minHeight: 100,
                  resize: 'vertical',
                  marginBottom: 18,
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <button
                  onClick={handleBack}
                  style={{
                    padding: '10px 18px',
                    background: v3.surfaceCard,
                    border: `1px solid ${v3.border}`,
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    color: v3.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  ← {isZh ? '返回' : 'Back'}
                </button>
                <button
                  onClick={handleNext}
                  disabled={!canContinue()}
                  style={{
                    padding: '10px 22px',
                    background: canContinue() ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' : v3.borderStrong,
                    color: canContinue() ? '#fff' : v3.textMuted,
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: canContinue() ? 'pointer' : 'not-allowed',
                    boxShadow: canContinue() ? '0 8px 22px -10px rgba(52, 211, 153, 0.45)' : 'none',
                  }}
                >
                  {isZh ? '继续' : 'Continue'} →
                </button>
              </div>
            </>
          )}

          {/* Step 3: API key + sandbox */}
          {step === 'apikey' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                STEP 3 · {isZh ? 'API 密钥' : 'API KEY + SANDBOX'}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                {isZh ? '获取您的沙盒密钥' : 'Your sandbox credentials'}
              </h1>
              <p style={{ fontSize: 13, color: v3.textMuted, marginBottom: 18 }}>
                {isZh ? '使用这个密钥在沙盒环境测试集成' : 'Use these to test your integration in sandbox.'}
              </p>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {isZh ? '沙盒 API 密钥' : 'Sandbox API key'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <input
                  readOnly
                  value={testKey || ''}
                  style={{
                    flex: 1,
                    padding: '11px 14px',
                    background: v3.ink,
                    border: `1px solid ${v3.borderStrong}`,
                    borderRadius: 10,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: v3.brandBright2,
                    WebkitTextFillColor: v3.brandBright2,
                  }}
                />
                <button
                  onClick={() => {
                    if (testKey) navigator.clipboard.writeText(testKey)
                  }}
                  style={{
                    padding: '10px 16px',
                    background: v3.brand,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isZh ? '复制' : 'Copy'}
                </button>
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textPrimary, marginBottom: 6 }}>
                {isZh ? '沙盒基础 URL' : 'Sandbox base URL'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <input
                  readOnly
                  value="https://sandbox.stayloop.ai/v1"
                  style={{
                    flex: 1,
                    padding: '11px 14px',
                    background: v3.ink,
                    border: `1px solid ${v3.borderStrong}`,
                    borderRadius: 10,
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: v3.brandBright2,
                    WebkitTextFillColor: v3.brandBright2,
                  }}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('https://sandbox.stayloop.ai/v1')
                  }}
                  style={{
                    padding: '10px 16px',
                    background: v3.brand,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isZh ? '复制' : 'Copy'}
                </button>
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: v3.textSecondary, marginBottom: 6 }}>
                {isZh ? '生产基础 URL（激活后可用）' : 'Production base URL (after activation)'}
              </label>
              <div style={{ padding: '11px 14px', background: v3.divider, border: `1px solid ${v3.border}`, borderRadius: 10, fontSize: 12, fontFamily: 'var(--font-mono)', color: v3.textMuted, marginBottom: 18 }}>
                https://api.stayloop.ai/v1
              </div>

              <Link href="/trust-api/docs" target="_blank" style={{ fontSize: 12, fontWeight: 600, color: v3.brand, textDecoration: 'none' }}>
                {isZh ? '查看完整 API 文档 →' : 'View full API docs →'}
              </Link>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <button
                  onClick={handleBack}
                  style={{
                    padding: '10px 18px',
                    background: v3.surfaceCard,
                    border: `1px solid ${v3.border}`,
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    color: v3.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  ← {isZh ? '返回' : 'Back'}
                </button>
                <button
                  onClick={handleNext}
                  disabled={!canContinue()}
                  style={{
                    padding: '10px 22px',
                    background: canContinue() ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)' : v3.borderStrong,
                    color: canContinue() ? '#fff' : v3.textMuted,
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: canContinue() ? 'pointer' : 'not-allowed',
                    boxShadow: canContinue() ? '0 8px 22px -10px rgba(52, 211, 153, 0.45)' : 'none',
                  }}
                >
                  {isZh ? '继续' : 'Continue'} →
                </button>
              </div>
            </>
          )}

          {/* Step 4: Activate */}
          {step === 'activate' && !submitted && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: v3.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                STEP 4 · {isZh ? '激活上线' : 'ACTIVATE'}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                {isZh ? '确认并提交' : 'Ready to activate?'}
              </h1>
              <p style={{ fontSize: 13, color: v3.textMuted, marginBottom: 18 }}>
                {isZh ? 'Stayloop 团队将在 1 个工作日内审核您的申请' : 'Stayloop will review within 1 business day.'}
              </p>

              <div style={{ background: v3.surfaceCard, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                  {isZh ? '申请摘要' : 'Application summary'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{isZh ? '组织' : 'Organization'}</div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>{data.orgName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{isZh ? '类型' : 'Type'}</div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>
                      {ORG_TYPES.find((t) => t.id === data.orgType)?.[isZh ? 'zh' : 'en']}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{isZh ? '位置' : 'Location'}</div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>{data.hqCity}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{isZh ? '月度量' : 'Monthly volume'}</div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>{data.monthlyVolume.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{isZh ? '主要用途' : 'Use case'}</div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>
                      {USE_CASES.find((u) => u.id === data.primaryUseCase)?.[isZh ? 'zh' : 'en']}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: v3.textMuted, marginBottom: 4 }}>{isZh ? '集成方式' : 'Integration'}</div>
                    <div style={{ fontWeight: 600, color: v3.textPrimary }}>
                      {INTEGRATION_TARGETS.find((i) => i.id === data.integrationTarget)?.[isZh ? 'zh' : 'en']}
                    </div>
                  </div>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={submitted}
                  onChange={() => {}}
                  style={{ marginTop: 4, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: v3.textPrimary, lineHeight: 1.5 }}>
                  {isZh ? '我同意 Stayloop Trust API 合作方条款' : 'I agree to the Stayloop Trust API Partner Terms'}
                </span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
                <button
                  onClick={handleBack}
                  style={{
                    padding: '10px 18px',
                    background: v3.surfaceCard,
                    border: `1px solid ${v3.border}`,
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    color: v3.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  ← {isZh ? '返回' : 'Back'}
                </button>
                <button
                  onClick={handleSubmit}
                  style={{
                    padding: '10px 22px',
                    background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45)',
                  }}
                >
                  {isZh ? '提交激活申请' : 'Submit for activation'} →
                </button>
              </div>
            </>
          )}

          {/* Success state */}
          {step === 'activate' && submitted && (
            <>
              <div style={{ textAlign: 'center', paddingTop: 24 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px', color: v3.success }}>
                  {isZh ? '提交成功' : 'Submitted!'}
                </h1>
                <p style={{ fontSize: 14, color: v3.textSecondary, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                  {isZh
                    ? 'Stayloop 将在 1 个工作日内审核您的申请。我们会发送激活确认邮件到您的账户邮箱。'
                    : 'Stayloop will review your application within 1 business day. You\u2019ll receive an activation confirmation email at your account address.'}
                </p>

                <Link href="/partners" style={{ fontSize: 13, fontWeight: 600, color: v3.brand, textDecoration: 'none' }}>
                  ← {isZh ? '返回合作方页面' : 'Back to partners'}
                </Link>
              </div>
            </>
          )}
        </section>

        {/* RIGHT RAIL: Context / preview */}
        <aside style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, overflow: 'hidden', alignSelf: 'start', position: 'sticky', top: 24 }}>
          {rightContent}
        </aside>
      </div>
    </main>
  )
}

'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'
import { useIsMobile } from '@/lib/useMediaQuery'

interface PlanCard {
  name_zh: string
  name_en: string
  price: string
  period_zh: string
  period_en: string
  features: Array<{ zh: string; en: string }>
  recommended?: boolean
  ctaHref?: string
}

const TENANT_PLANS: PlanCard[] = [
  {
    name_zh: '基础版',
    name_en: 'Basic',
    price: '免费',
    period_zh: '',
    period_en: '',
    features: [
      { zh: '一份可重用 Passport', en: 'One reusable Passport' },
      { zh: '自动收入与信用验证', en: 'Automatic income & credit verification' },
      { zh: '租赁记录档案', en: 'Rental history archive' },
      { zh: '90 秒快速申请', en: '90-second quick apply' },
      { zh: '英法双语支持', en: 'Bilingual support' },
      { zh: '月度 Passport 续期', en: 'Monthly Passport renewal' },
    ],
    ctaHref: '/chat',
  },
  {
    name_zh: '可重用护照',
    name_en: 'Reusable Passport',
    price: '$9.99',
    period_zh: '/30 天',
    period_en: '/30 days',
    features: [
      { zh: '无限次申请（同一份 Passport）', en: 'Unlimited applications (same Passport)' },
      { zh: '优先验证处理', en: 'Priority verification' },
      { zh: '租赁历史永久保存', en: 'Permanent rental history' },
      { zh: '房东查询无限次', en: 'Unlimited landlord lookups' },
      { zh: 'Echo 中英双语助手', en: 'Echo bilingual concierge' },
      { zh: '实时保险比价', en: 'Insurance rate comparison' },
    ],
    ctaHref: '/chat',
  },
  {
    name_zh: '核证护照',
    name_en: 'Verified Passport',
    price: '$19',
    period_zh: '/30 天',
    period_en: '/30 days',
    features: [
      { zh: 'Persona + Flinks 身份核证', en: 'Persona + Flinks ID verification' },
      { zh: '二维码可分享护照', en: 'QR-shareable digital passport' },
      { zh: '无限次申请与房源查询', en: 'Unlimited applications & lookups' },
      { zh: '租赁合约自动分析', en: 'Automatic lease clause explanation' },
      { zh: '房东实时验证反馈', en: 'Real-time landlord verification' },
      { zh: '北美通用护照', en: 'Works across North America' },
    ],
    recommended: true,
    ctaHref: '/chat',
  },
]

const LANDLORD_PLANS: PlanCard[] = [
  {
    name_zh: '免费版',
    name_en: 'Free',
    price: '免费',
    period_zh: '',
    period_en: '',
    features: [
      { zh: '每月 5 份租客评估', en: '5 tenant screenings/month' },
      { zh: 'AI 风险评分', en: 'AI risk scoring' },
      { zh: '安省 LTB 记录查询', en: 'Ontario LTB record search' },
      { zh: '文件真伪鉴定', en: 'Document forensics' },
      { zh: '中英文双语报告', en: 'Bilingual reports' },
    ],
    ctaHref: '/login',
  },
  {
    name_zh: 'Lite',
    name_en: 'Lite',
    price: '$7',
    period_zh: '/月',
    period_en: '/month',
    features: [
      { zh: '每月 50 份评估', en: '50 screenings/month' },
      { zh: '所有免费功能', en: 'All Free features' },
      { zh: '优先评分处理', en: 'Priority scoring' },
      { zh: '房源信息库', en: 'Listing portfolio' },
      { zh: 'CSV 批量导出', en: 'CSV bulk export' },
    ],
    ctaHref: '/login',
  },
  {
    name_zh: 'Plus',
    name_en: 'Plus',
    price: '$15',
    period_zh: '/月',
    period_en: '/month',
    features: [
      { zh: '无限次评估', en: 'Unlimited screenings' },
      { zh: '安省法院门户查询', en: 'Ontario Courts Portal lookup' },
      { zh: '雇主背景验证（深度检查）', en: 'Employer arm\'s-length verification' },
      { zh: '合租人智能评分', en: 'Roommate group scoring' },
      { zh: '房东评分动态看板', en: 'Applicant pipeline dashboard' },
    ],
    recommended: true,
    ctaHref: '/login',
  },
  {
    name_zh: 'Pro',
    name_en: 'Pro',
    price: '$29',
    period_zh: '/月',
    period_en: '/month',
    features: [
      { zh: '企业级支持与集成', en: 'Enterprise support & integrations' },
      { zh: '所有 Plus 功能', en: 'All Plus features' },
      { zh: 'Equifax 信用报告查询', en: 'Equifax credit reports' },
      { zh: 'Stayloop 核证租客网络', en: 'Verified tenant network' },
      { zh: '自定义评分规则与权重', en: 'Custom scoring rules & weights' },
    ],
    ctaHref: '/login',
  },
]

const AGENT_PLANS: PlanCard[] = [
  {
    name_zh: '免费版',
    name_en: 'Free',
    price: '免费',
    period_zh: '',
    period_en: '',
    features: [
      { zh: '每月 20 个房源推荐包', en: '20 listing packages/month' },
      { zh: 'MLS PDF 一键提取', en: 'MLS PDF auto-extraction' },
      { zh: '房源信息库', en: 'Listing portfolio' },
      { zh: '租客评估集成', en: 'Tenant screening integration' },
      { zh: '英法双语支持', en: 'Bilingual support' },
    ],
    ctaHref: '/login',
  },
  {
    name_zh: 'Starter',
    name_en: 'Starter',
    price: '$15',
    period_zh: '/月',
    period_en: '/month',
    features: [
      { zh: '每月 200 个房源推荐', en: '200 listing packages/month' },
      { zh: '房源日报与统计', en: 'Daily briefing & analytics' },
      { zh: '自动 OHRC 合规检查', en: 'Auto OHRC compliance checker' },
      { zh: '与客户共享看板', en: 'Client co-view dashboard' },
      { zh: '优先技术支持', en: 'Priority support' },
    ],
    ctaHref: '/login',
  },
  {
    name_zh: 'Pro',
    name_en: 'Pro',
    price: '$39',
    period_zh: '/月',
    period_en: '/month',
    features: [
      { zh: '无限房源推荐', en: 'Unlimited listing packages' },
      { zh: '多团队协作账户', en: 'Team collaboration accounts' },
      { zh: '白标房源生成器', en: 'White-label listing generator' },
      { zh: '客户端与承包商管理', en: 'Client & contractor management' },
      { zh: '企业 API 集成', en: 'Enterprise API access' },
    ],
    recommended: true,
    ctaHref: '/login',
  },
  {
    name_zh: '团队版',
    name_en: 'Team',
    price: '$99',
    period_zh: '/月',
    period_en: '/month',
    features: [
      { zh: '团队成员无限账户', en: 'Unlimited team members' },
      { zh: '所有 Pro 功能', en: 'All Pro features' },
      { zh: '高级分析与报表', en: 'Advanced analytics & reporting' },
      { zh: '专属客户成功经理', en: 'Dedicated customer success' },
      { zh: '自定义工作流集成', en: 'Custom workflow integrations' },
    ],
    ctaHref: '/login',
  },
]

function PricingTabs() {
  const { lang } = useT()
  const isMobile = useIsMobile()
  const { user } = useUser({ redirectIfMissing: false, allowAnonymous: false })
  const isAuthed = !!user && !user.isAnonymous
  const [activeTab, setActiveTab] = useState<'tenants' | 'landlords' | 'agents'>('landlords')

  const tabs = [
    { id: 'tenants', label_en: 'Tenants', label_zh: '租客' },
    { id: 'landlords', label_en: 'Landlords', label_zh: '房东' },
    { id: 'agents', label_en: 'Agents', label_zh: '经纪人' },
  ]

  const plans = activeTab === 'tenants' ? TENANT_PLANS : activeTab === 'landlords' ? LANDLORD_PLANS : AGENT_PLANS

  return (
    <>
      {/* Tab buttons */}
      <div
        style={{
          display: 'flex',
          gap: isMobile ? 8 : 16,
          marginBottom: 48,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: isMobile ? '10px 16px' : '12px 24px',
              borderRadius: 10,
              border: 'none',
              fontSize: isMobile ? 13 : 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab.id ? v3.brand : 'transparent',
              color: activeTab === tab.id ? '#fff' : v3.textSecondary,
              borderBottom: activeTab === tab.id ? 'none' : `2px solid ${v3.divider}`,
            }}
          >
            {lang === 'zh' ? tab.label_zh : tab.label_en}
          </button>
        ))}
      </div>

      {/* Plan cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
          marginBottom: 64,
        }}
        className="pricing-cards"
      >
        {plans.map((plan) => (
          <div
            key={plan.name_en}
            style={{
              position: 'relative',
              background: v3.surfaceCard,
              border: plan.recommended ? `2px solid ${v3.brand}` : `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: isMobile ? 20 : 28,
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s',
              transform: plan.recommended ? 'scale(1.02)' : 'scale(1)',
            }}
            onMouseEnter={(e) => {
              if (!isMobile && !plan.recommended) {
                e.currentTarget.style.boxShadow = size.shadow.lg
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {/* Recommended pill */}
            {plan.recommended && (
              <div
                style={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: v3.brand,
                  color: '#fff',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {lang === 'zh' ? '最受欢迎' : 'Most Popular'}
              </div>
            )}

            {/* Plan name */}
            <h3 style={{ fontSize: 18, fontWeight: 700, color: v3.textPrimary, marginBottom: 12 }}>
              {lang === 'zh' ? plan.name_zh : plan.name_en}
            </h3>

            {/* Price */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: isMobile ? 32 : 36, fontWeight: 800, color: v3.textPrimary, letterSpacing: '-0.02em' }}>
                {plan.price}
              </div>
              <div style={{ fontSize: 13, color: v3.textMuted, marginTop: 2 }}>
                {lang === 'zh' ? plan.period_zh : plan.period_en}
              </div>
            </div>

            {/* Features */}
            <ul
              style={{
                flex: 1,
                listStyle: 'none',
                padding: 0,
                margin: '28px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {plan.features.map((feat, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: 14,
                    color: v3.textSecondary,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: v3.brand, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                  {lang === 'zh' ? feat.zh : feat.en}
                </li>
              ))}
            </ul>

            {/* CTA button */}
            <Link
              href={plan.ctaHref || '/login'}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '13px 20px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.2s',
                border: plan.recommended ? 'none' : `1px solid ${v3.border}`,
                background: plan.recommended
                  ? 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)'
                  : v3.surfaceCard,
                color: plan.recommended ? '#fff' : v3.textPrimary,
                cursor: 'pointer',
                boxShadow: plan.recommended
                  ? '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset'
                  : 'none',
              }}
              onMouseEnter={(e) => {
                if (!plan.recommended) {
                  e.currentTarget.style.borderColor = v3.brand
                }
              }}
              onMouseLeave={(e) => {
                if (!plan.recommended) {
                  e.currentTarget.style.borderColor = v3.border
                }
              }}
            >
              {isAuthed ? (lang === 'zh' ? '开始使用' : 'Get Started') : lang === 'zh' ? '登录' : 'Sign In'}
            </Link>
          </div>
        ))}
      </div>
    </>
  )
}

export default function PricingPage() {
  const { lang } = useT()
  const isMobile = useIsMobile()

  return (
    <div style={{ minHeight: '100vh', background: v3.surface }}>
      <MarketingNav />

      <main style={{ maxWidth: size.content.wide, margin: '0 auto', padding: isMobile ? '32px 16px' : '60px 28px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h1
            style={{
              fontSize: isMobile ? 28 : 42,
              fontWeight: 800,
              color: v3.textPrimary,
              letterSpacing: '-0.03em',
              marginBottom: 12,
            }}
          >
            {lang === 'zh' ? '选择适合你的方案' : 'Choose your plan'}
          </h1>
          <p
            style={{
              fontSize: isMobile ? 14 : 16,
              color: v3.textSecondary,
              maxWidth: 600,
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            {lang === 'zh'
              ? '每个角色都有适合的定价。简洁透明，无隐藏费用。'
              : 'Every role has pricing that fits. Simple. Transparent. No surprises.'}
          </p>
        </div>

        <PricingTabs />

        {/* One-off products section */}
        <div style={{ marginTop: 80, paddingTop: 40, borderTop: `1px solid ${v3.divider}` }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: v3.textPrimary, marginBottom: 32 }}>
            {lang === 'zh' ? '单次购买' : 'One-off products'}
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
            className="pricing-products"
          >
            {[
              { name_en: 'AI Screening Report', name_zh: 'AI 评估报告', price: '$4.99' },
              { name_en: 'Screening Plus', name_zh: '评估增强版', price: '$9.99' },
              { name_en: 'Verified Basic', name_zh: '核证基础版', price: '$19' },
              { name_en: 'Screening Plus+', name_zh: '评估专业版', price: '$29' },
              { name_en: 'Enterprise Check', name_zh: '企业级评估', price: '$39' },
            ].map((product) => (
              <div
                key={product.name_en}
                style={{
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 12,
                  padding: 16,
                  textAlign: 'center',
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary, marginBottom: 8 }}>
                  {lang === 'zh' ? product.name_zh : product.name_en}
                </p>
                <p style={{ fontSize: 20, fontWeight: 700, color: v3.brand }}>
                  {product.price}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.pricing-cards) {
            grid-template-columns: 1fr !important;
          }
          :global(.pricing-products) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 600px) {
          :global(.pricing-products) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

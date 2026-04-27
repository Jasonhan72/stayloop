'use client'
// -----------------------------------------------------------------------------
// /about — public company page
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

export default function AboutPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      <section
        style={{
          background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surface} 100%)`,
          padding: '72px 24px 64px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.default, margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              color: v3.brandStrong,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              padding: '4px 10px',
              borderRadius: 999,
              background: v3.brandSoft,
            }}
          >
            {isZh ? '关于 · ABOUT' : 'ABOUT · 关于'}
          </span>
          <h1
            style={{
              fontSize: 'clamp(36px, 5vw, 56px)',
              lineHeight: 1.06,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              margin: '24px 0 22px',
              maxWidth: 880,
            }}
          >
            {isZh
              ? '让租赁这件事，少一些纸、少一些信任成本。'
              : 'Less paperwork. Less trust friction. Better rental markets.'}
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.65,
              color: v3.textSecondary,
              maxWidth: 720,
              margin: 0,
            }}
          >
            {isZh
              ? 'Stayloop 是 AI-native 的租赁信任基础设施。我们用 8+1 个 agent 把租赁链条上的 23 个环节自动化 — 让租客一次验证、处处通行；让房东零文档审核找到合适租客；让经纪零行政跑完整个 leasing pipeline。'
              : 'Stayloop is AI-native trust infrastructure for the rental market. Eight agents automate 23 steps of the leasing chain so tenants verify once, landlords approve fast, and agents focus on the human moments.'}
          </p>
        </div>
      </section>

      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: size.content.default, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {[
            {
              k: 'principle',
              h_zh: '核心原则',
              h_en: 'Principle',
              b_zh: 'AI 做线上 80%，人做线下 20%。最终决策、合规红线、物理在场，全部是人类的事。',
              b_en: 'AI handles 80% online; humans handle the 20% offline. Final decisions, compliance red lines, and physical presence stay with humans.',
            },
            {
              k: 'agents',
              h_zh: 'AI Agent 体系 · 8+1',
              h_en: 'Agent stack · 8+1',
              b_zh: 'Echo · Logic · Nova · Sentinel · Beacon · Verify · Analyst · Aria + 人类 Field Agent。',
              b_en: 'Echo · Logic · Nova · Sentinel · Beacon · Verify · Analyst · Aria — plus the human Field Agent.',
            },
            {
              k: 'compliance',
              h_zh: '独立合规',
              h_en: 'Independent legal entity',
              b_zh: 'Stayloop Inc. 是完全独立的法律与商业实体，与 neos.rentals、JDL Realty、Sheng Chu Realty 等无控制或排他合作关系。',
              b_en: 'Stayloop Inc. is fully independent — no control or exclusivity with neos.rentals, JDL Realty, or any affiliated brokerage.',
            },
          ].map((b) => (
            <div key={b.k} style={{ background: v3.surface, border: `1px solid ${v3.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 10px', lineHeight: 1.3 }}>{isZh ? b.h_zh : b.h_en}</h3>
              <p style={{ color: v3.textSecondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{isZh ? b.b_zh : b.b_en}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="team" style={{ padding: '32px 24px 96px' }}>
        <div style={{ maxWidth: size.content.default, margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              color: v3.textPrimary,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            {isZh ? '团队 · TEAM' : 'TEAM · 团队'}
          </span>
          <div
            style={{
              background: v3.surface,
              border: `1px solid ${v3.border}`,
              borderRadius: 14,
              padding: 28,
              display: 'flex',
              gap: 20,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div
              aria-hidden
              style={{
                width: 56,
                height: 56,
                borderRadius: 999,
                background: v3.brand,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              JH
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Jason Han</h3>
              <div style={{ color: v3.textMuted, fontSize: 13, marginBottom: 10 }}>
                {isZh ? '创始人 · CEO · RECO 持牌经纪 #4827193' : 'Founder · CEO · RECO #4827193'}
              </div>
              <p style={{ color: v3.textSecondary, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                {isZh
                  ? '安省 RECO 持牌经纪。Field Agent #1。Stayloop 的整个工作流是从他亲手签的 47 套租约里跑出来的。'
                  : 'Ontario RECO-licensed agent. Field Agent #1. The Stayloop workflow is shaped directly by his 47 personally signed leases.'}
              </p>
            </div>
            <Link
              href="mailto:hello@stayloop.ai"
              style={{
                background: v3.surface,
                border: `1px solid ${v3.borderStrong}`,
                color: v3.textPrimary,
                fontSize: 14,
                fontWeight: 600,
                padding: '10px 16px',
                borderRadius: 8,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {isZh ? '联系我们' : 'Get in touch'}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  )
}

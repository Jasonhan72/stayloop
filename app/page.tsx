'use client'
// -----------------------------------------------------------------------------
// Homepage — Stayloop V4.1
// -----------------------------------------------------------------------------
// V4.1 repositions the homepage around AI Tenant Screening as the first
// standalone product landlords and rental agents can use right now. The
// broader "AI-native rental ecosystem" story is preserved but moved below
// the screening sections so the immediate value prop reads in the first
// screen.
//
// Visual language stays on V4 brand tokens (lib/brand v3); no new design
// system. All copy is bilingual via the existing useT() hook.
//
// Sections, top → bottom:
//   1. Hero — AI Tenant Screening headline + 2 CTAs + trust line
//   2. AI Tenant Screening — For Landlords / For Rental Agents (2 columns)
//   3. How it works — 4 steps
//   4. Sample report preview (#sample-report) + AI-assisted disclaimer
//   5. Pricing teaser ($19 Basic / $39 Verified)
//   6. More than screening — the Stayloop rental workflow platform
//   7. Closing CTA
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

export default function Home() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user } = useUser({ redirectIfMissing: false, allowAnonymous: false })
  const isAuthed = !!user && !user.isAnonymous

  // Hero CTAs are intentionally narrow to keep the screening message clear.
  const primaryCta = {
    label: isZh ? '开始筛查租客' : 'Start Screening a Tenant',
    href: '/screen',
  }
  const secondaryCta = {
    label: isZh ? '查看报告样例' : 'View Sample Report',
    href: '#sample-report',
  }

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* ── 1. HERO ─────────────────────────────────────────────────── */}
      <section style={{ padding: '56px 24px 36px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Tag tone="ai">
            {isZh ? 'AI 租客筛查' : 'AI Tenant Screening'}
          </Tag>
          <h1
            style={{
              fontFamily: isZh
                ? 'var(--font-cn), var(--font-inter), system-ui, sans-serif'
                : 'var(--font-inter), var(--font-cn), system-ui, sans-serif',
              fontSize: 'clamp(36px, 5.6vw, 60px)',
              fontWeight: 700,
              color: v3.textPrimary,
              lineHeight: 1.06,
              letterSpacing: '-0.03em',
              margin: '18px 0 18px',
              maxWidth: 980,
            }}
          >
            {isZh ? (
              <>
                面向房东与租赁经纪的<br />
                <span style={{ color: v3.brand }}>AI 租客筛查</span>
              </>
            ) : (
              <>
                AI Tenant Screening for<br />
                <span style={{ color: v3.brand }}>Landlords and Rental Agents</span>
              </>
            )}
          </h1>
          <p
            style={{
              fontSize: 18,
              color: v3.textSecondary,
              maxWidth: 760,
              lineHeight: 1.55,
              margin: '0 0 28px',
            }}
          >
            {isZh
              ? '上传租客资料，生成结构化筛查报告，涵盖收入、就业、文件一致性、申请完整度、租赁风险信号和公开记录参考。'
              : 'Upload tenant documents and get a structured screening report covering income, employment, document consistency, application completeness, rental risk signals, and public record references.'}
          </p>
          <div className="hero-cta-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href={primaryCta.href} style={btnPrimary} className="hero-cta-btn">
              {primaryCta.label} →
            </Link>
            <Link href={secondaryCta.href} style={btnGhost} className="hero-cta-btn">
              {secondaryCta.label}
            </Link>
          </div>
          {/* Trust signals row — refreshed for V4.1 */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 36,
              fontSize: 12,
              color: v3.textMuted,
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              flexWrap: 'wrap',
              letterSpacing: '0.04em',
            }}
            className="hp-trust-signals"
          >
            <span>{isZh ? '◆ 为安省租赁场景设计' : '◆ BUILT FOR ONTARIO RENTALS'}</span>
            <span>{isZh ? '◆ AI 辅助审查' : '◆ AI-ASSISTED REVIEW'}</span>
            <span>{isZh ? '◆ 清晰留痕' : '◆ CLEAR DECISION RECORD'}</span>
          </div>
        </div>
      </section>

      {/* ── 2. PRODUCT SECTION — AI Tenant Screening, two audiences ── */}
      <section style={{ padding: '32px 24px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? '独立产品' : 'Standalone product'}</Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(26px, 3vw, 34px)',
              fontWeight: 700,
              margin: '12px 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? 'AI 租客筛查' : 'AI Tenant Screening'}
          </h2>
          <p
            style={{
              fontSize: 16,
              color: v3.textSecondary,
              maxWidth: 760,
              lineHeight: 1.55,
              margin: '0 0 24px',
            }}
          >
            {isZh
              ? '上传租客资料，几分钟内生成清晰的筛查报告。'
              : 'Upload tenant documents. Get a clear screening report in minutes.'}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 18,
            }}
            className="hp-audience-cards"
          >
            <AudienceCard
              eyebrow={isZh ? '面向房东' : 'For Landlords'}
              tone={v3.brand}
              points={isZh
                ? [
                    '审查收入与就业资料的一致性',
                    '识别缺失或不一致文件',
                    '查询可用的公开租赁 / 法律记录',
                    '留存清晰的决策记录',
                  ]
                : [
                    'Review income and employment consistency',
                    'Identify missing or inconsistent documents',
                    'Check public rental/legal records where available',
                    'Keep a clear decision record',
                  ]}
              cta={{ label: isZh ? '筛查租客' : 'Screen a tenant', href: '/screen' }}
            />
            <AudienceCard
              eyebrow={isZh ? '面向租赁经纪' : 'For Rental Agents'}
              tone={v3.brandBright}
              points={isZh
                ? [
                    '快速整理申请人摘要',
                    '向房东客户分享结构化报告',
                    '减少申请审查中的反复沟通',
                    '保留专业筛查记录',
                  ]
                : [
                    'Prepare a professional applicant summary',
                    'Share a structured report with landlord clients',
                    'Reduce back-and-forth during offer review',
                    'Keep screening records organized',
                  ]}
              cta={{ label: isZh ? '为客户筛查申请' : 'Run a screening for a client', href: '/screen' }}
            />
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS — 4 steps ──────────────────────────────── */}
      <section style={{ padding: '32px 24px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? '运作方式' : 'How it works'}</Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(24px, 2.6vw, 30px)',
              fontWeight: 700,
              margin: '12px 0 24px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? '从上传到完成报告，四步走完。' : 'Four steps, from upload to finished report.'}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
            className="hp-steps-grid"
          >
            {[
              {
                n: '1',
                t: isZh ? '上传资料' : 'Upload documents',
                b: isZh
                  ? '提交申请表、ID、雇佣信、工资单、信用报告等。'
                  : 'Drop in applications, IDs, employment letters, paystubs, credit reports.',
              },
              {
                n: '2',
                t: isZh ? 'AI 整理并检查资料' : 'AI organizes and checks the file',
                b: isZh
                  ? '自动分类、抽取关键字段、做一致性核对。'
                  : 'Automatic classification, field extraction, and consistency checks.',
              },
              {
                n: '3',
                t: isZh ? '查看风险信号与公开记录参考' : 'Review risk signals and public record references',
                b: isZh
                  ? '关键提示按主题聚合，支持安省 LTB / CanLII 公开记录查询。'
                  : 'Surfaced as themed flags, with Ontario LTB / CanLII public record lookup where available.',
              },
              {
                n: '4',
                t: isZh ? '下载或分享筛查报告' : 'Download or share the screening report',
                b: isZh
                  ? '导出 PDF、留存决策记录，便于和客户/房东沟通。'
                  : 'Export the PDF, keep the decision record, share with the landlord client.',
              },
            ].map((s) => (
              <div
                key={s.n}
                style={{
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderRadius: 12,
                  padding: 18,
                  boxShadow: '0 1px 2px rgba(31, 25, 11, 0.05)',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: v3.brandSoft,
                    color: v3.brand,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono), monospace',
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {s.n}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, marginTop: 12 }}>
                  {s.t}
                </div>
                <div style={{ fontSize: 12.5, color: v3.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                  {s.b}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. SAMPLE REPORT PREVIEW + DISCLAIMER ────────────────────── */}
      <section id="sample-report" style={{ padding: '40px 24px', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? '报告样例' : 'Sample report'}</Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(24px, 2.6vw, 30px)',
              fontWeight: 700,
              margin: '12px 0 12px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? '一份结构化的筛查报告大概长这样。' : 'What a structured screening report looks like.'}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: v3.textSecondary,
              maxWidth: 760,
              lineHeight: 1.55,
              margin: '0 0 20px',
            }}
          >
            {isZh
              ? '示例数据，仅供说明结构。Stayloop 的报告是 AI 辅助的决策支持，不是租赁审批结论。'
              : 'Illustrative data only. Stayloop reports are AI-assisted decision support — not approval decisions.'}
          </p>

          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 16,
              padding: 'clamp(20px, 3vw, 28px)',
              boxShadow: '0 1px 3px rgba(31, 25, 11, 0.04), 0 12px 32px -8px rgba(31, 25, 11, 0.08)',
            }}
          >
            {/* Top row: applicant readiness + income/rent */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
                marginBottom: 18,
              }}
              className="hp-sample-top"
            >
              <SampleStat
                eyebrow={isZh ? '申请准备度' : 'Applicant readiness'}
                value="82 / 100"
                hint={isZh ? '资料齐全度高，需补一份近期工资单。' : 'Strong package; one recent paystub still missing.'}
                tone={v3.brand}
              />
              <SampleStat
                eyebrow={isZh ? '收入 / 租金比' : 'Income / rent ratio'}
                value="3.4×"
                hint={isZh ? '月毛收入约为目标租金的 3.4 倍。' : 'Gross monthly income is ~3.4× the target rent.'}
                tone={v3.trust}
              />
              <SampleStat
                eyebrow={isZh ? '文件一致性' : 'Document consistency'}
                value={isZh ? '通过' : 'Consistent'}
                hint={isZh ? 'ID / 收入 / 雇佣信中的姓名、地址一致。' : 'Names and addresses match across ID / income / letter.'}
                tone={v3.success}
              />
            </div>

            {/* Body: missing items / public record references / next step */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
              className="hp-sample-bottom"
            >
              <SampleBlock
                title={isZh ? '缺失项' : 'Missing items'}
                items={isZh
                  ? ['最近 30 天内的工资单 1 份', '推荐人确认信（可选）']
                  : ['1 paystub from the last 30 days', 'Reference confirmation letter (optional)']}
                accent={v3.warning}
              />
              <SampleBlock
                title={isZh ? '公开记录参考' : 'Public record references'}
                items={isZh
                  ? [
                      'CanLII：未发现以申请人姓名为被告的安省 LTB 案件',
                      'Ontario Courts Portal：未匹配到民事 / 小额诉讼记录',
                    ]
                  : [
                      'CanLII: no Ontario LTB cases found with applicant as respondent',
                      'Ontario Courts Portal: no matching civil/small claims records',
                    ]}
                accent={v3.trust}
              />
              <SampleBlock
                title={isZh ? '建议下一步' : 'Recommended next step'}
                items={isZh
                  ? [
                      '请申请人补一份最近 30 天内的工资单',
                      '若需更深入核对：开启雇主独立性深度检查',
                    ]
                  : [
                      'Ask the applicant for a paystub from the last 30 days',
                      'For deeper review: run the arm’s-length employer check',
                    ]}
                accent={v3.brand}
              />
            </div>

            {/* Disclaimer */}
            <div
              style={{
                marginTop: 22,
                padding: '12px 14px',
                background: v3.surface,
                border: `1px dashed ${v3.borderStrong}`,
                borderRadius: 10,
                fontSize: 12.5,
                color: v3.textSecondary,
                lineHeight: 1.55,
              }}
            >
              <strong style={{ color: v3.textPrimary }}>
                {isZh ? '提示：' : 'Disclaimer: '}
              </strong>
              {isZh
                ? 'Stayloop 提供 AI 辅助筛查与决策支持工具。最终的租赁决定权在房东，并须遵守适用的住房及隐私法规。'
                : 'Stayloop provides AI-assisted screening and decision-support tools. Final rental decisions remain with the landlord and must comply with applicable housing and privacy laws.'}
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. PRICING TEASER ────────────────────────────────────────── */}
      <section style={{ padding: '24px 24px 32px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? '价格' : 'Pricing'}</Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(22px, 2.4vw, 28px)',
              fontWeight: 700,
              margin: '12px 0 18px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? '按报告计费，先试再用。' : 'Per-report pricing. Try one, decide later.'}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
            className="hp-pricing-grid"
          >
            <PricingCard
              tier={isZh ? '基础筛查' : 'Basic Screening'}
              price="$19"
              unit={isZh ? '/ 份' : '/ report'}
              points={isZh
                ? [
                    'AI 文档整理',
                    '收入与就业一致性审查',
                    '申请完整度核查',
                    '基础风险摘要',
                  ]
                : [
                    'AI document organization',
                    'Income and employment consistency review',
                    'Application completeness check',
                    'Basic risk summary',
                  ]}
              tone={v3.trust}
            />
            <PricingCard
              tier={isZh ? '核证筛查' : 'Verified Screening'}
              price="$39"
              unit={isZh ? '/ 份' : '/ report'}
              points={isZh
                ? [
                    '包含基础筛查全部功能',
                    '文件不一致性审查',
                    '公开记录参考摘要',
                    '可下载的 PDF 报告',
                    '留存决策记录',
                  ]
                : [
                    'Everything in Basic',
                    'Document inconsistency review',
                    'Public record reference summary',
                    'Downloadable report',
                    'Decision record',
                  ]}
              tone={v3.brand}
              recommended
            />
          </div>
          <p
            style={{
              fontSize: 12,
              color: v3.textMuted,
              marginTop: 12,
              fontFamily: 'var(--font-mono), monospace',
            }}
          >
            {isZh
              ? '◆ 报告为 AI 辅助审查 · 不构成法律意见 · 最终决定由房东作出'
              : '◆ AI-assisted review · Not legal advice · Final decision made by the landlord'}
          </p>
        </div>
      </section>

      {/* ── 6. PLATFORM VISION (de-emphasized, moved below screening) ── */}
      <section style={{ padding: '40px 24px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? '不止筛查' : 'More than screening'}</Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(22px, 2.4vw, 28px)',
              fontWeight: 700,
              margin: '12px 0 12px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? 'Stayloop 租赁工作流平台' : 'The Stayloop rental workflow platform'}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: v3.textSecondary,
              maxWidth: 820,
              lineHeight: 1.6,
              margin: '0 0 22px',
            }}
          >
            {isZh
              ? '租客筛查只是第一步。Stayloop 正在拓展租客 Passport、申请工作流、租约自动生成、留痕审计与租赁服务。'
              : 'Tenant screening is the first step. Stayloop is expanding into tenant passport, application workflow, lease generation, audit trail, and rental services.'}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
            }}
            className="hp-pillars-grid"
          >
            {[
              {
                t: isZh ? '租客 Passport' : 'Tenant Passport',
                b: isZh ? '一次核实，按需分享。' : 'Verify once, share with permission.',
                href: '/passport',
                color: v3.trust,
              },
              {
                t: isZh ? '申请工作流' : 'Application workflow',
                b: isZh ? '从申请表到决策记录，全程留痕。' : 'From form to decision record, end to end.',
                href: '/dashboard/pipeline',
                color: v3.brandBright,
              },
              {
                t: isZh ? '租约生成' : 'Lease generation',
                b: isZh ? '自动起草安省标准租约，冲突检查。' : 'Auto-draft Ontario standard lease, conflict checks.',
                href: '/lease/explainer',
                color: v3.brand,
              },
              {
                t: isZh ? '留痕审计' : 'Audit trail',
                b: isZh ? '决策与沟通记录，可追溯。' : 'Searchable, append-only record of decisions.',
                href: '/about',
                color: v3.brandStrong,
              },
              {
                t: isZh ? '租赁服务' : 'Rental services',
                b: isZh ? '保险、水电、入住协调。' : 'Insurance, utilities, move-in coordination.',
                href: '/services',
                color: v3.success,
              },
            ].map((p) => (
              <Link
                key={p.t}
                href={p.href}
                style={{
                  display: 'block',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderTop: `3px solid ${p.color}`,
                  borderRadius: 12,
                  padding: 16,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>{p.t}</div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: v3.textSecondary,
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {p.b}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: p.color,
                    marginTop: 10,
                    fontWeight: 600,
                  }}
                >
                  {isZh ? '了解 →' : 'Learn more →'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. CLOSING CTA ──────────────────────────────────────────── */}
      <section style={{ padding: '24px 24px 80px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surfaceCard} 100%)`,
              border: `1px solid ${v3.brandSoft}`,
              borderRadius: 20,
              padding: 'clamp(28px, 4vw, 48px)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 'clamp(24px, 2.6vw, 30px)',
                fontWeight: 700,
                color: v3.textPrimary,
                letterSpacing: '-0.02em',
              }}
            >
              {isZh ? '今天就跑一份筛查报告。' : 'Run your first screening today.'}
            </div>
            <div style={{ fontSize: 14, color: v3.textSecondary, marginTop: 10 }}>
              {isZh ? '上传文件 · AI 协助审查 · 几分钟内拿到报告' : 'Upload files · AI-assisted review · Report in minutes'}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <Link href="/screen" style={btnPrimary}>
                {isZh ? '开始筛查租客' : 'Start Screening a Tenant'} →
              </Link>
              <Link href={isAuthed ? '/dashboard' : '/auth/signup'} style={btnGhost}>
                {isZh ? '注册账户' : 'Create an account'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
      <style jsx>{`
        @media (max-width: 860px) {
          :global(.hp-audience-cards),
          :global(.hp-pricing-grid),
          :global(.hp-sample-top),
          :global(.hp-sample-bottom) {
            grid-template-columns: 1fr !important;
          }
          :global(.hp-pillars-grid) {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          :global(.hp-trust-signals) {
            gap: 12px !important;
          }
        }
        @media (max-width: 600px) {
          :global(.hp-pillars-grid),
          :global(.hp-steps-grid) {
            grid-template-columns: 1fr !important;
          }
          :global(.hp-trust-signals) {
            gap: 8px !important;
            font-size: 11px !important;
          }
        }
      `}</style>
    </main>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────

function AudienceCard({
  eyebrow,
  tone,
  points,
  cta,
}: {
  eyebrow: string
  tone: string
  points: string[]
  cta: { label: string; href: string }
}) {
  return (
    <div
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderTop: `3px solid ${tone}`,
        borderRadius: 14,
        padding: 22,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: tone,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '14px 0 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {points.map((p, i) => (
          <li
            key={i}
            style={{
              fontSize: 14,
              color: v3.textSecondary,
              lineHeight: 1.55,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <span
              aria-hidden
              style={{
                color: tone,
                marginTop: 2,
                fontFamily: 'var(--font-mono), monospace',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              ✓
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        style={{
          color: tone,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {cta.label} →
      </Link>
    </div>
  )
}

function SampleStat({
  eyebrow,
  value,
  hint,
  tone,
}: {
  eyebrow: string
  value: string
  hint: string
  tone: string
}) {
  return (
    <div
      style={{
        background: v3.surface,
        border: `1px solid ${v3.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono), monospace',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: v3.textMuted,
          fontWeight: 700,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: tone,
          marginTop: 6,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: v3.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
        {hint}
      </div>
    </div>
  )
}

function SampleBlock({
  title,
  items,
  accent,
}: {
  title: string
  items: string[]
  accent: string
}) {
  return (
    <div
      style={{
        background: v3.surface,
        border: `1px solid ${v3.border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: v3.textPrimary }}>{title}</div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '8px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {items.map((it, i) => (
          <li
            key={i}
            style={{
              fontSize: 12.5,
              color: v3.textSecondary,
              lineHeight: 1.5,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <span aria-hidden style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PricingCard({
  tier,
  price,
  unit,
  points,
  tone,
  recommended = false,
}: {
  tier: string
  price: string
  unit: string
  points: string[]
  tone: string
  recommended?: boolean
}) {
  return (
    <div
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${recommended ? tone : v3.border}`,
        borderRadius: 14,
        padding: 20,
        position: 'relative',
        boxShadow: recommended
          ? `0 1px 3px rgba(31,25,11,0.04), 0 12px 32px -10px ${tone}40`
          : '0 1px 2px rgba(31, 25, 11, 0.04)',
      }}
    >
      {recommended && (
        <span
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            fontSize: 10,
            fontFamily: 'var(--font-mono), monospace',
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: tone,
            background: v3.brandSoft,
            padding: '3px 8px',
            borderRadius: 999,
            border: `1px solid ${tone}30`,
          }}
        >
          Recommended
        </span>
      )}
      <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary }}>{tier}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: v3.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          {price}
        </span>
        <span style={{ fontSize: 13, color: v3.textMuted }}>{unit}</span>
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '14px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {points.map((p, i) => (
          <li
            key={i}
            style={{
              fontSize: 13,
              color: v3.textSecondary,
              lineHeight: 1.5,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <span aria-hidden style={{ color: tone, fontWeight: 700, flexShrink: 0 }}>✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 22px',
  fontSize: 15,
  fontWeight: 600,
  color: '#FFFFFF',
  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
  borderRadius: 10,
  textDecoration: 'none',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 8px 22px -10px rgba(52, 211, 153, 0.45), 0 1px 0 rgba(255, 255, 255, 0.30) inset',
}

const btnGhost: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '12px 22px',
  fontSize: 15,
  fontWeight: 600,
  color: v3.textPrimary,
  background: v3.surfaceCard,
  border: `1px solid ${v3.borderStrong}`,
  borderRadius: 10,
  textDecoration: 'none',
  cursor: 'pointer',
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'ai' | 'pri' }) {
  const color = tone === 'ai' ? v3.trust : v3.brand
  const bg = tone === 'ai' ? v3.trustSoft : v3.brandSoft
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 700,
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        padding: '4px 10px',
        borderRadius: 999,
        background: bg,
        border: `1px solid ${tone === 'ai' ? 'rgba(124, 58, 237, 0.25)' : v3.brandSoft}`,
      }}
    >
      {children}
    </span>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 700,
        color: v3.brandStrong,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
      }}
    >
      {children}
    </span>
  )
}

'use client'
// -----------------------------------------------------------------------------
// Homepage — Stayloop V4 (AI-Native Rental Ecosystem)
// -----------------------------------------------------------------------------
// Implements the V4 Print spec, page 1: hero + three-audience trifecta +
// eight-step rental flow + eight AI modules + closing CTA. The headline
// pitch is the "one AI-native workflow from listing to signed lease" —
// this is NOT a screening-only page (that lives at /tenant-screening) and
// NOT a Passport-centric V3 page either.
//
// Sections, top → bottom:
//   1. Hero — "Renting, rebuilt with AI." + 3 CTAs + trust pills row
//   2. Three audiences — Tenants (Passport) / Landlords (Screen+Lease) /
//      Agents (branded report packages)
//   3. The full rental flow — 8 steps, Listing → Passport → Apply →
//      Screening → Approve → Lease → E-sign → Audit
//   4. AI is not a chat box — 8 AI modules grid
//   5. Closing CTA — "Ship your first signed lease this week"
//
// Bilingual via useT(). Reuses MarketingNav + MarketingFooter. No new deps.
// -----------------------------------------------------------------------------

import Link from 'next/link'
import { v3, size } from '@/lib/brand'
import { useT } from '@/lib/i18n'
import { useUser } from '@/lib/useUser'
import MarketingNav from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

// ─── 8-step rental flow ─────────────────────────────────────────────
const FLOW_STEPS: Array<{
  icon: string
  label_en: string
  label_zh: string
  sub_en: string
  sub_zh: string
}> = [
  { icon: '◇', label_en: 'Listing',   label_zh: '挂牌',  sub_en: 'Import or AI-draft',     sub_zh: '导入或 AI 起草' },
  { icon: '◈', label_en: 'Passport',  label_zh: 'Passport', sub_en: 'Tenant prepares',     sub_zh: '租客备齐资料' },
  { icon: '▤', label_en: 'Apply',     label_zh: '申请',  sub_en: 'Passport → Listing',     sub_zh: '一键申请房源' },
  { icon: '◉', label_en: 'Screening', label_zh: '筛查',  sub_en: 'AI report',              sub_zh: 'AI 报告生成' },
  { icon: '✓', label_en: 'Approve',   label_zh: '审批',  sub_en: 'Compare & decide',       sub_zh: '比对与决定' },
  { icon: '⎙', label_en: 'Lease',     label_zh: '租约',  sub_en: 'AI auto-draft',          sub_zh: 'AI 自动起草' },
  { icon: '✎', label_en: 'E-sign',    label_zh: '电子签', sub_en: 'Both parties',          sub_zh: '双方签署' },
  { icon: '⊠', label_en: 'Audit',     label_zh: '审计',  sub_en: 'Immutable trail',        sub_zh: '不可篡改留痕' },
]

// ─── 8 AI modules ───────────────────────────────────────────────────
const AI_MODULES: Array<{
  name_en: string
  name_zh: string
  desc_en: string
  desc_zh: string
}> = [
  {
    name_en: 'Task Router',
    name_zh: '任务路由',
    desc_en: 'Identifies the user goal, opens the right workflow.',
    desc_zh: '识别用户意图，打开对应工作流。',
  },
  {
    name_en: 'Document AI',
    name_zh: '文档 AI',
    desc_en: 'Classifies, extracts, flags missing & inconsistent fields.',
    desc_zh: '分类、抽字段、标缺失与不一致。',
  },
  {
    name_en: 'Screening AI',
    name_zh: '筛查 AI',
    desc_en: 'Generates Application Readiness — never a risk score.',
    desc_zh: '出申请就绪度评估，绝不输出风险评分。',
  },
  {
    name_en: 'Listing AI',
    name_zh: '挂牌 AI',
    desc_en: 'EN/ZH listing copy, missing fields, fair-housing check.',
    desc_zh: '中英双语文案、字段补全、公平住房检查。',
  },
  {
    name_en: 'Passport AI',
    name_zh: 'Passport AI',
    desc_en: 'Per-listing readiness — what to add next.',
    desc_zh: '针对每个房源给出"还差什么"建议。',
  },
  {
    name_en: 'Lease AI',
    name_zh: '租约 AI',
    desc_en: 'Auto-fill Ontario standard lease, conflict checks.',
    desc_zh: '自动填安省标准租约 + 条款冲突检查。',
  },
  {
    name_en: 'Compliance Guardrail',
    name_zh: '合规护栏',
    desc_en: 'No "newcomers" / pet deposit / damage deposit warnings.',
    desc_zh: '"新移民"歧视、宠物押金、损坏押金等违规警示。',
  },
  {
    name_en: 'Workflow AI',
    name_zh: '工作流 AI',
    desc_en: 'Reminders, message drafts, next-best-action.',
    desc_zh: '提醒、消息起草、下一步建议。',
  },
]

export default function Home() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const { user } = useUser({ redirectIfMissing: false, allowAnonymous: false })
  const isAuthed = !!user && !user.isAnonymous

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* ── 1. HERO ─────────────────────────────────────────────────── */}
      <section
        style={{
          background: `linear-gradient(180deg, ${v3.brandWash} 0%, ${v3.surface} 100%)`,
          padding: '80px 24px 64px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? 'AI 原生租赁生态' : 'AI-Native Rental Ecosystem'}</Eyebrow>
          <h1
            style={{
              fontSize: 'clamp(40px, 6.4vw, 78px)',
              lineHeight: 1.04,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              margin: '24px 0 24px',
              maxWidth: 920,
            }}
          >
            {isZh ? (
              <>
                租房，<br />
                <span style={{ color: v3.brand }}>用 AI 重建。</span>
              </>
            ) : (
              <>
                Renting,
                <br />
                <span style={{ color: v3.brand }}>rebuilt with AI.</span>
              </>
            )}
          </h1>
          <p
            style={{
              fontSize: 'clamp(15.5px, 1.4vw, 18px)',
              lineHeight: 1.6,
              color: v3.textSecondary,
              maxWidth: 720,
              margin: '0 0 32px',
            }}
          >
            {isZh
              ? '租客筛查、租客 Passport、申请、挂牌、租约起草和电子签 — 一个 AI 原生工作流，从挂牌走到签约。'
              : 'Tenant screening, rental passports, applications, listings, lease drafting and online signing — one AI-native workflow from listing to signed lease.'}
          </p>
          <div className="hero-cta-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
            <Link
              href="/screen"
              className="hero-cta-btn"
              style={btnPrimary}
            >
              {isZh ? '筛查租客' : 'Screen a Tenant'} →
            </Link>
            <Link
              href="/passport"
              className="hero-cta-btn"
              style={btnGhost}
            >
              {isZh ? '创建 Passport' : 'Create Rental Passport'}
            </Link>
            <Link
              href="/listings/new"
              className="hero-cta-btn"
              style={btnGhost}
            >
              {isZh ? '挂牌房源' : 'List a Property'}
            </Link>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 24,
              fontSize: 11.5,
              color: v3.textMuted,
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              flexWrap: 'wrap',
              letterSpacing: '0.08em',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            <span>{isZh ? '◆ 安省 LTB 对齐' : '◆ ONTARIO LTB-ALIGNED'}</span>
            <span>{isZh ? '◆ SOC 2 Type II' : '◆ SOC 2 TYPE II'}</span>
            <span>{isZh ? '◆ 电子签就绪' : '◆ E-SIGNATURE READY'}</span>
            <span>{isZh ? '◆ Stripe 计费' : '◆ STRIPE-BACKED BILLING'}</span>
          </div>
        </div>
      </section>

      {/* ── 2. THREE AUDIENCES ─────────────────────────────────────── */}
      <section style={{ padding: '64px 24px 32px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <AudienceCard
              eyebrow={isZh ? '租客' : 'For Tenants'}
              title={isZh ? '建立你的租客 Passport' : 'Build your rental passport'}
              desc={isZh
                ? 'AI 帮你整理身份、工资单、雇主信和信用资料。一键申请，每个房源都能复用。'
                : 'AI organizes your ID, pay stubs, employment letters and credit. Apply with one click. Reuse for every listing.'}
              cta={isZh ? '创建 Passport →' : 'Create Passport →'}
              href="/passport"
              tone={v3.trust}
            />
            <AudienceCard
              eyebrow={isZh ? '房东' : 'For Landlords'}
              title={isZh ? '筛查租客，签署租约' : 'Screen tenants. Sign leases.'}
              desc={isZh
                ? '从邮件 / 微信 / Kijiji 自动收件筛查。多申请人对比。AI 起草租约。一站式电子签。'
                : 'Auto-screening from email / WeChat / Kijiji files. Compare applicants. AI lease draft. E-sign in one place.'}
              cta={isZh ? '挂牌房源 →' : 'List a Property →'}
              href="/listings/new"
              tone={v3.brand}
            />
            <AudienceCard
              eyebrow={isZh ? '经纪' : 'For Agents'}
              title={isZh ? '房东可读的报告包' : 'Landlord-ready report packages'}
              desc={isZh
                ? '把零散的租客文件整理成你品牌的筛查报告包。安全分享链接 + 阅读追踪。'
                : 'Turn messy tenant files into agent-branded screening packages. Share secure links. Track engagement.'}
              cta={isZh ? '进入经纪门户 →' : 'Open Agent Portal →'}
              href={isAuthed && user?.role === 'agent' ? '/agent/dashboard' : '/agents'}
              tone="#7C3AED"
            />
          </div>
        </div>
      </section>

      {/* ── 3. RENTAL FLOW (8 steps) ───────────────────────────────── */}
      <section style={{ padding: '40px 24px 32px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>
            {isZh
              ? '完整租赁流程 · 一个产品'
              : 'THE FULL RENTAL FLOW · ONE PRODUCT'}
          </Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(26px, 3.4vw, 38px)',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              margin: '12px 0 28px',
              maxWidth: 720,
            }}
          >
            {isZh
              ? '从挂牌到签约 — 全程不离开 Stayloop。'
              : 'From listing to signed lease — without leaving Stayloop.'}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            {FLOW_STEPS.map((s, i) => (
              <FlowStep key={i} step={s} index={i} isZh={isZh} isLast={i === FLOW_STEPS.length - 1} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. AI MODULES (8 cards) ────────────────────────────────── */}
      <section style={{ padding: '32px 24px 64px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>
            {isZh
              ? 'AI 不是聊天框 · AI 跑流程'
              : 'AI IS NOT A CHAT BOX · IT RUNS THE WORKFLOW'}
          </Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(26px, 3.4vw, 38px)',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              margin: '12px 0 28px',
              maxWidth: 720,
            }}
          >
            {isZh
              ? '租赁流程里嵌着 8 个 AI 模块。'
              : 'Eight AI modules built into the rental flow.'}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {AI_MODULES.map((m) => (
              <AIModuleCard key={m.name_en} module={m} isZh={isZh} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. CLOSING CTA ─────────────────────────────────────────── */}
      <section
        style={{
          padding: '72px 24px 88px',
          background: v3.brandWash,
          borderTop: `1px solid ${v3.divider}`,
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <Eyebrow center>
            {isZh ? '本周就开始' : 'START THIS WEEK'}
          </Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              margin: '14px 0 16px',
              color: v3.textPrimary,
            }}
          >
            {isZh
              ? '本周就发出你的第一份签好的租约。'
              : 'Ship your first signed lease this week.'}
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: v3.textSecondary,
              margin: '0 0 24px',
            }}
          >
            {isZh
              ? '免费试用 14 天 — 无需信用卡。租客 Passport 永久免费。'
              : '14-day free trial — no credit card. Tenant Passport is free forever.'}
          </p>
          <div
            className="hero-cta-row"
            style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <Link href="/screen" className="hero-cta-btn" style={btnPrimary}>
              {isZh ? '筛查租客' : 'Screen a Tenant'} →
            </Link>
            <Link href="/pricing" className="hero-cta-btn" style={btnGhost}>
              {isZh ? '查看价格' : 'View Pricing'}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  )
}

// ─── Pieces ─────────────────────────────────────────────────────────

function Eyebrow({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        color: v3.brandStrong,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontFamily: 'JetBrains Mono, monospace',
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </div>
  )
}

function AudienceCard({
  eyebrow,
  title,
  desc,
  cta,
  href,
  tone,
}: {
  eyebrow: string
  title: string
  desc: string
  cta: string
  href: string
  tone: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 14,
        padding: '22px 22px 20px',
        textDecoration: 'none',
        color: 'inherit',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        transition: 'border-color .15s, transform .15s, box-shadow .15s',
        height: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tone
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 12px 28px -10px rgba(15,23,42,0.12)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = v3.border
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)'
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: tone,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          fontFamily: 'JetBrains Mono, monospace',
          marginBottom: 12,
        }}
      >
        {eyebrow}
      </div>
      <h3
        style={{
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: '-0.015em',
          margin: '0 0 10px',
          color: v3.textPrimary,
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, margin: '0 0 18px' }}>
        {desc}
      </p>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: tone }}>
        {cta}
      </span>
    </Link>
  )
}

function FlowStep({
  step,
  index,
  isZh,
  isLast,
}: {
  step: typeof FLOW_STEPS[number]
  index: number
  isZh: boolean
  isLast: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 12,
        padding: '14px 14px 16px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: v3.textMuted,
          letterSpacing: '0.10em',
          fontFamily: 'JetBrains Mono, monospace',
          marginBottom: 8,
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div
        style={{
          fontSize: 22,
          fontFamily: 'JetBrains Mono, monospace',
          color: v3.brand,
          marginBottom: 8,
          fontWeight: 700,
        }}
      >
        {step.icon}
      </div>
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: v3.textPrimary,
          marginBottom: 4,
        }}
      >
        {isZh ? step.label_zh : step.label_en}
      </div>
      <div style={{ fontSize: 11.5, color: v3.textMuted, lineHeight: 1.4 }}>
        {isZh ? step.sub_zh : step.sub_en}
      </div>
    </div>
  )
}

function AIModuleCard({
  module: m,
  isZh,
}: {
  module: typeof AI_MODULES[number]
  isZh: boolean
}) {
  return (
    <div
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 18,
          color: '#7C3AED',
          marginBottom: 8,
          lineHeight: 1,
        }}
      >
        ✦
      </div>
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          color: v3.textPrimary,
          letterSpacing: '-0.01em',
          marginBottom: 6,
        }}
      >
        {isZh ? m.name_zh : m.name_en}
      </div>
      <div style={{ fontSize: 12.5, color: v3.textSecondary, lineHeight: 1.55 }}>
        {isZh ? m.desc_zh : m.desc_en}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '13px 22px',
  background: v3.brand,
  color: '#fff',
  fontSize: 14.5,
  fontWeight: 650,
  textDecoration: 'none',
  borderRadius: 10,
  border: 'none',
  letterSpacing: '-0.005em',
  cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '13px 22px',
  background: v3.surfaceCard,
  color: v3.textPrimary,
  fontSize: 14.5,
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: 10,
  border: `1px solid ${v3.borderStrong}`,
  letterSpacing: '-0.005em',
  cursor: 'pointer',
}

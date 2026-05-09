'use client'
// -----------------------------------------------------------------------------
// Homepage — Stayloop V5 (final copy deck)
// -----------------------------------------------------------------------------
// Implements the V5 final copy deck (stayloop_v5_final_copy_deck.md). Keeps
// the V4 spec's eight-step rental-flow visual and the V4-style audience
// trifecta layout, but every line of user-facing copy comes from V5.
//
// V5 voice is softer than V4 — fewer hard claims ('AI replaces X'), more
// "the system helps you finish, you confirm key decisions." Reflected in
// section 5 (closing) which states the interaction principle explicitly:
// "AI doesn't decide for you — AI helps you finish the flow."
//
// Sections, top → bottom:
//   1. Hero — "让租住回到应有的秩序。" / "Tell us what you want."
//   2. V5 Product framing — "every user gets a personal AI agent…"
//   3. Three audiences — Tenants / Landlords / Agents (V5 deck §6)
//   4. The full rental flow — 8 steps (kept from V4 spec)
//   5. Trust API + Services — V5 deck §7, §8
//   6. Closing — interaction principle (V5 deck §9) + CTAs
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
  { icon: '◇', label_en: 'Listing',   label_zh: '挂牌',     sub_en: 'Import or AI-draft', sub_zh: '导入或 AI 起草' },
  { icon: '◈', label_en: 'Passport',  label_zh: 'Passport', sub_en: 'Tenant prepares',    sub_zh: '租客备齐资料' },
  { icon: '▤', label_en: 'Apply',     label_zh: '申请',     sub_en: 'Passport → Listing', sub_zh: '一键申请房源' },
  { icon: '◉', label_en: 'Screening', label_zh: '筛查',     sub_en: 'AI summary',         sub_zh: 'AI 整理摘要' },
  { icon: '✓', label_en: 'Approve',   label_zh: '审批',     sub_en: 'You confirm',        sub_zh: '由你确认' },
  { icon: '⎙', label_en: 'Lease',     label_zh: '租约',     sub_en: 'AI auto-draft',      sub_zh: 'AI 自动起草' },
  { icon: '✎', label_en: 'E-sign',    label_zh: '电子签',   sub_en: 'Both parties',       sub_zh: '双方签署' },
  { icon: '⊠', label_en: 'Audit',     label_zh: '审计',     sub_en: 'Immutable trail',    sub_zh: '不可篡改留痕' },
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
          padding: '88px 24px 72px',
          borderBottom: `1px solid ${v3.divider}`,
        }}
      >
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>
            {isZh ? 'AI 原生租赁工作流' : 'AI-Native Rental Workflow'}
          </Eyebrow>
          <h1
            style={{
              fontSize: 'clamp(38px, 6vw, 76px)',
              lineHeight: 1.06,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              margin: '24px 0 24px',
              maxWidth: 940,
            }}
          >
            {isZh ? (
              <>让租住回到<br /><span style={{ color: v3.brand }}>应有的秩序。</span></>
            ) : (
              <>Tell us what you want.<br /><span style={{ color: v3.brand }}>We&rsquo;ll guide you there.</span></>
            )}
          </h1>
          <p
            style={{
              fontSize: 'clamp(16px, 1.4vw, 19px)',
              lineHeight: 1.6,
              color: v3.textSecondary,
              maxWidth: 740,
              margin: '0 0 32px',
            }}
          >
            {isZh
              ? '你只需说出需求，其余从找房、申请到签约与后续服务，系统都会协助你轻松完成。'
              : 'AI-native, helping you through every step of renting.'}
          </p>
          <div className="hero-cta-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
            <Link
              href={isAuthed
                ? (user?.role === 'tenant' ? '/tenant/dashboard'
                  : user?.role === 'agent' ? '/agent/dashboard'
                  : '/landlord/dashboard')
                : '/passport'
              }
              className="hero-cta-btn"
              style={btnPrimary}
            >
              {isAuthed
                ? (isZh ? '进入工作台' : 'Open Workspace')
                : (isZh ? '开始使用' : 'Get started')} →
            </Link>
            <Link href="/listings" className="hero-cta-btn" style={btnGhost}>
              {isZh ? '浏览房源' : 'Browse Listings'}
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
            <span>{isZh ? '◆ PIPEDA 合规' : '◆ PIPEDA COMPLIANT'}</span>
            <span>{isZh ? '◆ 中英双语' : '◆ BILINGUAL EN / 中文'}</span>
          </div>
        </div>
      </section>

      {/* ── 2. V5 PRODUCT FRAMING ──────────────────────────────────── */}
      <section style={{ padding: '72px 24px 48px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <Eyebrow center>
            {isZh ? 'Stayloop 是什么' : 'What is Stayloop'}
          </Eyebrow>
          <p
            style={{
              fontSize: 'clamp(20px, 2.6vw, 30px)',
              lineHeight: 1.45,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: v3.textPrimary,
              margin: '20px 0 0',
              textAlign: 'center',
            }}
          >
            {isZh ? (
              <>
                每位用户都有自己的<span style={{ color: v3.brand }}>个人 AI Agent</span>。<br />
                它读取专属记忆、理解当前进度，协助完成租房流程；
                <br />跨角色协作由系统调度，关键节点由用户确认。
              </>
            ) : (
              <>
                Every user gets a <span style={{ color: v3.brand }}>personal AI agent</span>,
                <br />powered by private memory
                <br />and coordinated through a controlled workflow system.
              </>
            )}
          </p>
        </div>
      </section>

      {/* ── 3. THREE AUDIENCES ─────────────────────────────────────── */}
      <section style={{ padding: '32px 24px 48px' }}>
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
              title={isZh ? '一次验证，处处通行。' : 'Verify once. Use everywhere.'}
              desc={isZh
                ? '创建可复用的 Rental Passport，让你的身份、收入、信用与申请资料在租房流程中被清晰整理、可控分享。'
                : 'Create a reusable Rental Passport — your ID, income, credit and application materials, organized and shared on your terms.'}
              cta={isZh ? '创建 Passport →' : 'Create Passport →'}
              href="/passport"
              tone={v3.trust}
            />
            <AudienceCard
              eyebrow={isZh ? '房东' : 'For Landlords'}
              title={isZh ? '让出租更清晰，也更可靠。' : 'Renting out, made clearer.'}
              desc={isZh
                ? '从发布房源、筛选申请到准备租约，系统协助整理信息与流程；关键决策始终由你确认。'
                : 'From listing to screening to lease prep — the system organizes information and flow. Key decisions stay with you.'}
              cta={isZh ? '挂牌房源 →' : 'List a Property →'}
              href="/listings/new"
              tone={v3.brand}
            />
            <AudienceCard
              eyebrow={isZh ? '经纪' : 'For Agents'}
              title={isZh ? '把行政交给系统，把关系留给人。' : 'Admin to the system. Relationships to you.'}
              desc={isZh
                ? 'AI 协助整理客户、准备房源材料、安排看房与跟进申请，让经纪专注线下服务、谈判和信任关系。'
                : 'AI organizes clients, prepares listing materials, books showings and follows up on applications — so you focus on the human side.'}
              cta={isZh ? '进入经纪门户 →' : 'Open Agent Portal →'}
              href={isAuthed && user?.role === 'agent' ? '/agent/dashboard' : '/agents'}
              tone="#7C3AED"
            />
          </div>
        </div>
      </section>

      {/* ── 4. RENTAL FLOW (8 steps) ───────────────────────────────── */}
      <section style={{ padding: '40px 24px 48px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>
            {isZh
              ? '完整租赁流程 · 一个产品'
              : 'The full rental flow · One product'}
          </Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(26px, 3.4vw, 38px)',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.18,
              margin: '12px 0 28px',
              maxWidth: 760,
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
              <FlowStep key={i} step={s} index={i} isZh={isZh} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. TRUST API + SERVICES ────────────────────────────────── */}
      <section style={{ padding: '48px 24px 56px', background: v3.surfaceMuted }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 18,
            }}
          >
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 16,
                padding: 28,
              }}
            >
              <Eyebrow>{isZh ? 'Trust API' : 'Trust API'}</Eyebrow>
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  margin: '12px 0 10px',
                }}
              >
                {isZh
                  ? '把租赁信任变成可调用的 API。'
                  : 'Rental trust as a callable API.'}
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.65, color: v3.textSecondary, margin: '0 0 16px' }}>
                {isZh
                  ? '用统一接口完成身份、收入、信用、租房记录与合规审计，为租赁平台、保险和金融服务提供可信基础设施。'
                  : 'A unified interface for identity, income, credit, rental history and compliance — trust infrastructure for rental platforms, insurance, and financial services.'}
              </p>
              <Link
                href="/trust-api"
                style={{ fontSize: 13.5, fontWeight: 600, color: v3.brand, textDecoration: 'none' }}
              >
                {isZh ? '查看 API 文档 →' : 'View API docs →'}
              </Link>
            </div>
            <div
              style={{
                background: v3.surfaceCard,
                border: `1px solid ${v3.border}`,
                borderRadius: 16,
                padding: 28,
              }}
            >
              <Eyebrow>{isZh ? 'Services' : 'Services'}</Eyebrow>
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  margin: '12px 0 10px',
                }}
              >
                {isZh
                  ? '在正确的时机接入正确的服务。'
                  : 'The right service at the right moment.'}
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.65, color: v3.textSecondary, margin: '0 0 16px' }}>
                {isZh
                  ? '从清洁、搬家到维修、保险，Agent 会根据租房阶段主动推荐合适服务，用户确认后再继续。'
                  : 'From cleaning and moving to repair and insurance — your agent surfaces the right service for the stage you&rsquo;re in. You confirm, then it proceeds.'}
              </p>
              <Link
                href="/services"
                style={{ fontSize: 13.5, fontWeight: 600, color: v3.brand, textDecoration: 'none' }}
              >
                {isZh ? '了解服务市场 →' : 'Explore services →'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. CLOSING: INTERACTION PRINCIPLE + CTA ────────────────── */}
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
            {isZh ? '交互原则' : 'How it works'}
          </Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(26px, 3.6vw, 40px)',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.18,
              margin: '16px 0 18px',
              color: v3.textPrimary,
            }}
          >
            {isZh
              ? <>不是 AI 替你做决定，<br />而是 AI 协助你完成流程。</>
              : <>AI doesn&rsquo;t decide for you.<br />AI helps you finish the flow.</>}
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: v3.textSecondary,
              margin: '0 0 28px',
            }}
          >
            {isZh
              ? '提交申请、分享资料、签约、付款和服务预约等关键节点，必须由用户确认。'
              : 'Submitting applications, sharing documents, signing leases, paying, and booking services — every critical action requires your confirmation.'}
          </p>
          <div
            className="hero-cta-row"
            style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <Link
              href={isAuthed
                ? (user?.role === 'tenant' ? '/tenant/dashboard'
                  : user?.role === 'agent' ? '/agent/dashboard'
                  : '/landlord/dashboard')
                : '/passport'
              }
              className="hero-cta-btn"
              style={btnPrimary}
            >
              {isAuthed
                ? (isZh ? '进入工作台' : 'Open Workspace')
                : (isZh ? '开始使用' : 'Get started')} →
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
        padding: '24px 22px 22px',
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
          fontSize: 19.5,
          fontWeight: 700,
          letterSpacing: '-0.018em',
          lineHeight: 1.3,
          margin: '0 0 12px',
          color: v3.textPrimary,
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.65, color: v3.textSecondary, margin: '0 0 20px' }}>
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
}: {
  step: typeof FLOW_STEPS[number]
  index: number
  isZh: boolean
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

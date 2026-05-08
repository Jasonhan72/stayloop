'use client'
// -----------------------------------------------------------------------------
// Homepage — Stayloop (general product overview)
// -----------------------------------------------------------------------------
// As of 2026-05-08, the homepage covers the FULL Stayloop rental platform
// across all three roles (tenants, landlords, agents). The previous V4.1
// homepage was screening-only — that content moved to /tenant-screening
// for prospects arriving from screening-focused outbound (ads/decks).
//
// Sections, top → bottom:
//   1. Hero — Stayloop is the AI-native rental platform for Ontario
//   2. Three pillars — Listings · Tenant Screening · Leases
//   3. Three audiences — For Tenants / Landlords / Agents
//   4. Why Stayloop — bilingual, OHRC-compliant, AI-native
//   5. Closing CTA — browse listings or sign up
//
// Visual language stays on V4 brand tokens (lib/brand v3). All copy
// bilingual via the existing useT() hook. Links to deep marketing pages
// (/listings, /tenant-screening, /tenants, /landlords, /agents) for the
// audiences who want to drill in.
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

  // Hero CTAs:
  //   primary  → browse public listings (lowest-friction entry, works for
  //              tenants and landlords who want to see what's there)
  //   secondary → if authed, jump to workspace; otherwise the screening
  //              landing for the most-frequent landlord pitch
  const primaryCta = {
    label: isZh ? '浏览房源' : 'Browse Listings',
    href: '/listings',
  }
  const secondaryCta = isAuthed
    ? {
        label: isZh ? '进入工作台' : 'Open Workspace',
        href:
          user?.role === 'tenant' ? '/tenant/dashboard'
          : user?.role === 'agent' ? '/agent/dashboard'
          : '/landlord/dashboard',
      }
    : {
        label: isZh ? '了解 AI 租客筛查' : 'AI Tenant Screening',
        href: '/tenant-screening',
      }

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* ── 1. HERO ─────────────────────────────────────────────────── */}
      <section style={{ padding: '64px 24px 48px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto', textAlign: 'center' }}>
          <Tag tone="ai">
            {isZh ? '加拿大 · 安省 · AI 信任基础设施' : 'Canada · Ontario · AI Trust Infrastructure'}
          </Tag>
          <h1
            style={{
              fontFamily: isZh
                ? 'var(--font-cn), var(--font-inter), system-ui, sans-serif'
                : 'var(--font-inter), system-ui, sans-serif',
              fontSize: 'clamp(34px, 6vw, 64px)',
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: '-0.035em',
              margin: '20px 0 18px',
              color: v3.textPrimary,
            }}
          >
            {isZh
              ? '为安省租赁市场打造的'
              : 'The AI-native rental platform'}
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, #047857 0%, #2563EB 50%, #7C3AED 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {isZh ? 'AI 信任基础设施' : 'built for Ontario rentals.'}
            </span>
          </h1>
          <p
            style={{
              fontSize: 'clamp(15px, 1.4vw, 18px)',
              color: v3.textSecondary,
              lineHeight: 1.65,
              maxWidth: 720,
              margin: '0 auto 28px',
            }}
          >
            {isZh
              ? '从找房、筛查到签约 — Stayloop 把租赁全流程串起来。文档取证 + CanLII 法庭记录 + 双语 AI 助手，全程符合安省人权法和 PIPEDA 隐私规范。'
              : 'From listings to screening to signed leases — Stayloop connects the entire rental lifecycle. Document forensics, CanLII court records, and a bilingual AI assistant, all OHRC + PIPEDA compliant.'}
          </p>
          <div
            className="hero-cta-row"
            style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}
          >
            <Link href={primaryCta.href} style={btnPrimary} className="hero-cta-btn">
              {primaryCta.label} →
            </Link>
            <Link href={secondaryCta.href} style={btnGhost} className="hero-cta-btn">
              {secondaryCta.label}
            </Link>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 24,
              justifyContent: 'center',
              fontSize: 12,
              color: v3.textMuted,
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              flexWrap: 'wrap',
              letterSpacing: '0.04em',
              marginTop: 8,
            }}
            className="hp-trust-signals"
          >
            <span>◆ {isZh ? '为安省租赁场景设计' : 'BUILT FOR ONTARIO RENTALS'}</span>
            <span>◆ {isZh ? 'OHRC + PIPEDA 合规' : 'OHRC + PIPEDA COMPLIANT'}</span>
            <span>◆ {isZh ? '中英双语' : 'BILINGUAL EN / 中文'}</span>
          </div>
        </div>
      </section>

      {/* ── 2. THREE PILLARS ───────────────────────────────────────── */}
      <section style={{ padding: '40px 24px 24px', background: v3.brandWash }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <SecHead
            eyebrow={isZh ? '产品矩阵' : 'Product'}
            title={isZh ? '一个平台，覆盖租赁全流程' : 'One platform, the full rental lifecycle'}
            sub={isZh
              ? '找房 · 筛查 · 租约 — 三个核心模块互相串联，由 Stayloop AI 贯穿。'
              : 'Find a place · Vet your tenants · Sign the lease — three core modules, woven together by Stayloop AI.'}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 18,
              marginTop: 28,
            }}
          >
            <PillarCard
              icon="⌂"
              title={isZh ? '房源' : 'Listings'}
              desc={isZh
                ? '从 Realtor.ca / Kijiji 一键导入；AI 自动整理双语描述、OHRC 合规扫描；StreetEasy 风格的公开详情页。'
                : 'One-click import from Realtor.ca / Kijiji; AI drafts bilingual copy, runs OHRC compliance scans; StreetEasy-style public detail pages.'}
              href="/listings"
              cta={isZh ? '浏览房源 →' : 'Browse listings →'}
            />
            <PillarCard
              icon="◉"
              title={isZh ? 'AI 租客筛查' : 'AI Tenant Screening'}
              desc={isZh
                ? '5 维 v3 风险模型 + 文档取证 + CanLII 全省法庭记录 + 雇主公司注册交叉核对。10 分钟出报告。'
                : '5-dim v3 risk model + document forensics + CanLII Ontario-wide court records + employer registry cross-check. 10-minute report.'}
              href="/tenant-screening"
              cta={isZh ? '了解筛查 →' : 'Learn more →'}
              accent="ai"
            />
            <PillarCard
              icon="⎙"
              title={isZh ? '租约' : 'Leases'}
              desc={isZh
                ? '安省标准 2229E 租约自动生成；中英双语条款；电子签 + 链上存证；和筛查报告无缝衔接。'
                : 'Auto-generate Ontario standard 2229E leases; bilingual clauses; e-sign + immutable audit trail; seamless from screening report.'}
              href={isAuthed ? '/landlord/leases' : '/landlords'}
              cta={isZh ? '租约工作流 →' : 'Lease workflow →'}
            />
          </div>
        </div>
      </section>

      {/* ── 3. THREE AUDIENCES ─────────────────────────────────────── */}
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <SecHead
            eyebrow={isZh ? '为不同角色设计' : 'Built for'}
            title={isZh ? '租客 · 房东 · 经纪 — 各得其所' : 'Tenants · Landlords · Agents — each get their own surface'}
            sub={isZh
              ? '不是把同一个 SaaS 套到三个角色上 — 每个角色有专属的工作台、专属的 AI 助手语境。'
              : 'Not the same SaaS painted three colors — each role has its own workspace and AI-assistant context.'}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 18,
              marginTop: 28,
            }}
          >
            <AudienceCard
              role={isZh ? '租客' : 'Tenants'}
              tagline={isZh
                ? '一次完整的背调，无限次分享给房东。'
                : 'One verified profile, share it with unlimited landlords.'}
              bullets={isZh
                ? ['Renter Passport — JWT + QR 一键分享', '搜房 + 在线申请 + 申请进度跟踪', 'AI 找房助手 24/7 双语答疑']
                : ['Renter Passport — JWT + QR shareable link', 'Search + apply + track applications', '24/7 bilingual AI rental assistant']}
              cta={isZh ? '了解租客版' : 'For tenants →'}
              href="/tenants"
              tone="trust"
            />
            <AudienceCard
              role={isZh ? '房东' : 'Landlords'}
              tagline={isZh
                ? '从挂牌到签约，AI 全流程辅助。'
                : 'From listing to signed lease, AI on every step.'}
              bullets={isZh
                ? ['多房源管理 + Pipeline 看板', 'AI 筛查报告 + 深度雇主核查', '安省标准租约自动生成 + 电子签']
                : ['Multi-property + Pipeline kanban', 'AI screening reports + deep employer check', 'Ontario lease auto-draft + e-sign']}
              cta={isZh ? '了解房东版' : 'For landlords →'}
              href="/landlords"
              tone="brand"
            />
            <AudienceCard
              role={isZh ? '经纪' : 'Agents'}
              tagline={isZh
                ? '客户管理 + MLS 接入 + 报告分发一体化。'
                : 'Client CRM + MLS hookup + report distribution.'}
              bullets={isZh
                ? ['多客户 dashboard + 今日任务简报', '背调报告打包发送 / 客户授权', 'MLS 房源直接同步到 Stayloop']
                : ['Multi-client dashboard + day-brief', 'Bundle and send screening reports', 'MLS listings sync into Stayloop']}
              cta={isZh ? '了解经纪版' : 'For agents →'}
              href="/agents"
              tone="ai"
            />
          </div>
        </div>
      </section>

      {/* ── 4. WHY STAYLOOP ────────────────────────────────────────── */}
      <section style={{ padding: '40px 24px 64px', background: v3.surfaceMuted }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <SecHead
            eyebrow={isZh ? '为什么选 Stayloop' : 'Why Stayloop'}
            title={isZh ? '不是把美国 SaaS 翻译过来' : 'Not just U.S. SaaS, translated'}
            sub={isZh
              ? '从第一天就在加拿大设计 — CanLII 直连、OHRC 关键词扫描、PIPEDA 合规存档、Equifax 加拿大版接入路径明确。'
              : 'Designed in Canada from day one — CanLII direct API, OHRC keyword scanning, PIPEDA-compliant audit log, clear path to Equifax Canada integration.'}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginTop: 28,
            }}
          >
            <WhyCard
              num="184k"
              label={isZh ? '加拿大联邦公司库已索引' : 'Canadian federal corps indexed'}
              detail={isZh ? '雇主验证不再依赖海外数据库' : 'Employer verification, no foreign DB dependency'}
            />
            <WhyCard
              num="40+"
              label={isZh ? 'CanLII 安省数据库覆盖' : 'CanLII Ontario databases covered'}
              detail={isZh ? 'LTB / 小额法庭 / 高等法院全查' : 'LTB + Small Claims + Superior Court'}
            />
            <WhyCard
              num="13"
              label={isZh ? '硬性筛查闸门' : 'Hard screening gates'}
              detail={isZh ? '伪造工资单 / 身份码 / 截图等自动拦截' : 'Fake paystubs, SIN, screenshots — auto-flagged'}
            />
            <WhyCard
              num="100%"
              label={isZh ? '中英双语' : 'Bilingual coverage'}
              detail={isZh ? '从落地页到租约，每一处' : 'Every surface, from landing page to lease'}
            />
          </div>
        </div>
      </section>

      {/* ── 5. CLOSING CTA ─────────────────────────────────────────── */}
      <section style={{ padding: '64px 24px 80px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 'clamp(26px, 3.5vw, 38px)',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              color: v3.textPrimary,
              margin: '0 0 14px',
            }}
          >
            {isZh ? '准备好了吗？' : 'Ready when you are.'}
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
              ? '免费创建账号 — 浏览房源、试一次筛查、领取你的 Renter Passport。无信用卡。'
              : 'Free to start — browse listings, try a screening, claim your Renter Passport. No credit card.'}
          </p>
          <div
            className="hero-cta-row"
            style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <Link href="/listings" style={btnPrimary} className="hero-cta-btn">
              {isZh ? '浏览房源' : 'Browse Listings'} →
            </Link>
            <Link href="/pricing" style={btnGhost} className="hero-cta-btn">
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

function Tag({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'ai' | 'default' }) {
  const styles =
    tone === 'ai'
      ? { background: '#F3E8FF', color: '#7C3AED', border: '1px solid #D7C5FA' }
      : { background: v3.brandSoft, color: v3.brandStrong, border: `1px solid ${v3.borderStrong}` }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        borderRadius: 999,
        ...styles,
      }}
    >
      {children}
    </span>
  )
}

function SecHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: v3.brandStrong,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {eyebrow}
      </span>
      <h2
        style={{
          fontSize: 'clamp(24px, 3.2vw, 34px)',
          fontWeight: 800,
          letterSpacing: '-0.025em',
          lineHeight: 1.18,
          color: v3.textPrimary,
          margin: '8px 0 12px',
        }}
      >
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: 15, color: v3.textSecondary, lineHeight: 1.6, margin: 0 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function PillarCard({
  icon,
  title,
  desc,
  href,
  cta,
  accent,
}: {
  icon: string
  title: string
  desc: string
  href: string
  cta: string
  accent?: 'ai'
}) {
  const accentColor = accent === 'ai' ? '#7C3AED' : v3.brand
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
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accentColor
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
          width: 40,
          height: 40,
          borderRadius: 10,
          background: accent === 'ai' ? '#F3E8FF' : v3.brandSoft,
          color: accentColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: 20,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          marginBottom: 14,
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          fontSize: 19,
          fontWeight: 700,
          letterSpacing: '-0.015em',
          margin: '0 0 8px',
          color: v3.textPrimary,
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: v3.textSecondary, margin: '0 0 14px' }}>
        {desc}
      </p>
      <span style={{ fontSize: 13, fontWeight: 600, color: accentColor }}>
        {cta}
      </span>
    </Link>
  )
}

function AudienceCard({
  role,
  tagline,
  bullets,
  cta,
  href,
  tone,
}: {
  role: string
  tagline: string
  bullets: string[]
  cta: string
  href: string
  tone: 'trust' | 'brand' | 'ai'
}) {
  const accent =
    tone === 'trust' ? v3.trust :
    tone === 'ai' ? '#7C3AED' :
    v3.brand
  const accentSoft =
    tone === 'trust' ? v3.trustSoft :
    tone === 'ai' ? '#F3E8FF' :
    v3.brandSoft
  return (
    <div
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 14,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          alignSelf: 'flex-start',
          fontSize: 10.5,
          fontWeight: 700,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: accent,
          background: accentSoft,
          padding: '4px 9px',
          borderRadius: 999,
          marginBottom: 12,
        }}
      >
        {role}
      </span>
      <p
        style={{
          fontSize: 15.5,
          fontWeight: 600,
          color: v3.textPrimary,
          lineHeight: 1.45,
          letterSpacing: '-0.005em',
          margin: '0 0 14px',
        }}
      >
        {tagline}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bullets.map((b, i) => (
          <li
            key={i}
            style={{
              fontSize: 13.5,
              color: v3.textSecondary,
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <span aria-hidden style={{ color: accent, marginTop: 2, flexShrink: 0 }}>•</span>
            {b}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        style={{
          marginTop: 'auto',
          fontSize: 13.5,
          fontWeight: 600,
          color: accent,
          textDecoration: 'none',
          alignSelf: 'flex-start',
        }}
      >
        {cta}
      </Link>
    </div>
  )
}

function WhyCard({ num, label, detail }: { num: string; label: string; detail: string }) {
  return (
    <div
      style={{
        background: v3.surfaceCard,
        border: `1px solid ${v3.border}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: v3.brandStrong,
          fontFamily: 'JetBrains Mono, monospace',
          lineHeight: 1,
        }}
      >
        {num}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary, marginTop: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: v3.textMuted, marginTop: 4, lineHeight: 1.5 }}>
        {detail}
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
  background: 'linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)',
  color: '#fff',
  fontSize: 14.5,
  fontWeight: 650,
  textDecoration: 'none',
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 8px 22px -10px rgba(52,211,153,0.45), 0 1px 0 rgba(255,255,255,0.30) inset',
  letterSpacing: '-0.005em',
  cursor: 'pointer',
}

const btnGhost: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '13px 22px',
  background: '#FFFFFF',
  color: v3.textPrimary,
  fontSize: 14.5,
  fontWeight: 600,
  textDecoration: 'none',
  borderRadius: 10,
  border: `1px solid ${v3.borderStrong}`,
  letterSpacing: '-0.005em',
  cursor: 'pointer',
}

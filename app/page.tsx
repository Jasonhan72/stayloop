'use client'
// -----------------------------------------------------------------------------
// Homepage — Stayloop V4 marketing site
// -----------------------------------------------------------------------------
// Reproduces the V4 PgHome spec from the Claude Design bundle:
// hero "Renting, rebuilt with AI." → 3 role cards → 8-step rental flow →
// 7 AI modules grid → closing CTA strip. V3 cream palette (V4 ships cream).
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

  // Authed users get role-aware primary CTA (preserved from V3).
  const heroCta = !isAuthed
    ? { label: isZh ? '筛查租客' : 'Screen a Tenant', href: '/screen' }
    : user.role === 'tenant'
      ? { label: isZh ? '查看我的 Passport' : 'View my Passport', href: '/passport' }
      : user.role === 'agent'
        ? { label: isZh ? '今日任务' : 'My day brief', href: '/agent/day' }
        : { label: isZh ? '筛查租客' : 'Screen a Tenant', href: '/screen' }

  const heroCta2 = !isAuthed
    ? { label: isZh ? '创建 Passport' : 'Create Rental Passport', href: '/passport' }
    : { label: isZh ? '查看 Pipeline' : 'My pipeline', href: user.role === 'agent' ? '/dashboard/pipeline' : '/dashboard/pipeline' }

  const heroCta3 = !isAuthed
    ? { label: isZh ? '发布房源' : 'List a Property', href: '/listings/new' }
    : { label: isZh ? '发布房源' : 'List a Property', href: '/listings/new' }

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', color: v3.textPrimary }}>
      <MarketingNav />

      {/* HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ padding: '56px 24px 40px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Tag tone="ai">
            {isZh ? 'AI 原生租赁生态系统' : 'AI-Native Rental Ecosystem'}
          </Tag>
          <h1
            style={{
              fontFamily: 'var(--font-cn), var(--font-inter), system-ui, sans-serif',
              fontSize: 'clamp(40px, 6vw, 64px)',
              fontWeight: 700,
              color: v3.textPrimary,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              margin: '18px 0 18px',
              maxWidth: 900,
            }}
          >
            {isZh ? (
              <>
                租房，<br />用 <span style={{ color: v3.brand }}>AI</span> 重新做一遍。
              </>
            ) : (
              <>
                Renting,<br />rebuilt with <span style={{ color: v3.brand }}>AI</span>.
              </>
            )}
          </h1>
          <p
            style={{
              fontSize: 18,
              color: v3.textSecondary,
              maxWidth: 680,
              lineHeight: 1.55,
              margin: '0 0 28px',
            }}
          >
            {isZh
              ? '租客筛查、租客 Passport、申请、房源、租约起草和在线签署 — 一个 AI 原生的工作流程，从房源到签约全程不离开 Stayloop。'
              : 'Tenant screening, rental passports, applications, listings, lease drafting and online signing — one AI-native workflow from listing to signed lease.'}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href={heroCta.href} style={btnPrimary}>
              {heroCta.label} →
            </Link>
            <Link href={heroCta2.href} style={btnGhost}>
              {heroCta2.label}
            </Link>
            <Link href={heroCta3.href} style={btnGhost}>
              {heroCta3.label}
            </Link>
          </div>
          {/* Trust signals row */}
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
          >
            <span>◆ ONTARIO LTB-ALIGNED</span>
            <span>◆ SOC 2 TYPE II</span>
            <span>◆ E-SIGNATURE READY</span>
            <span>◆ STRIPE-BACKED BILLING</span>
          </div>
        </div>
      </section>

      {/* ROLE CARDS ───────────────────────────────────────────────────── */}
      <section style={{ padding: '24px 24px 8px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {[
              {
                tone: v3.trust,
                eb: isZh ? '租客' : 'For Tenants',
                t: isZh ? '建立你的租房 Passport' : 'Build your rental passport',
                b: isZh
                  ? 'AI 帮你整理身份证、工资单、雇佣信和信用记录。一键申请，所有房源复用。'
                  : 'AI organizes your ID, pay stubs, employment letters and credit. Apply with one click. Reuse for every listing.',
                cta: isZh ? '创建 Passport' : 'Create Passport',
                href: '/passport',
              },
              {
                tone: v3.brand,
                eb: isZh ? '房东' : 'For Landlords',
                t: isZh ? '筛查租客 · 签署租约' : 'Screen tenants. Sign leases.',
                b: isZh
                  ? '微信、邮件、Kijiji 收到的文件全部自动 screening。比较申请人。AI 起草租约。在线签署一站式搞定。'
                  : 'Auto-screening from email/WeChat/Kijiji files. Compare applicants. AI lease draft. E-sign in one place.',
                cta: isZh ? '发布房源' : 'List a Property',
                href: '/listings/new',
              },
              {
                tone: v3.brandBright,
                eb: isZh ? '经纪' : 'For Agents',
                t: isZh ? '房东可读的专业申请包' : 'Landlord-ready report packages',
                b: isZh
                  ? '把杂乱的租客文件变成 agent-branded screening 报告。安全分享链接。访问留痕。'
                  : 'Turn messy tenant files into agent-branded screening packages. Share secure links. Track engagement.',
                cta: isZh ? '打开经纪面板' : 'Open Agent Portal',
                href: '/agent/day',
              },
            ].map((r, i) => (
              <Link
                key={i}
                href={r.href}
                style={{
                  display: 'block',
                  background: v3.surfaceCard,
                  border: `1px solid ${v3.border}`,
                  borderTop: `3px solid ${r.tone}`,
                  borderRadius: 14,
                  padding: 24,
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'border-color .15s, transform .15s',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: r.tone,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                  }}
                >
                  {r.eb}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: v3.textPrimary,
                    margin: '10px 0 8px',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {r.t}
                </div>
                <div style={{ fontSize: 13, color: v3.textSecondary, lineHeight: 1.55, marginBottom: 14 }}>
                  {r.b}
                </div>
                <span style={{ color: r.tone, fontSize: 13, fontWeight: 600 }}>
                  {r.cta} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* THE FULL FLOW ────────────────────────────────────────────────── */}
      <section style={{ padding: '40px 24px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? '完整租房流程 · 一个产品' : 'The full rental flow · One product'}</Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(26px, 3vw, 34px)',
              fontWeight: 700,
              margin: '12px 0 24px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? '从房源到签约 — 全程不离开 Stayloop。' : 'From listing to signed lease — without leaving Stayloop.'}
          </h2>
          <div
            style={{
              background: v3.surfaceCard,
              border: `1px solid ${v3.border}`,
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 1px 3px rgba(31, 25, 11, 0.04), 0 12px 32px -8px rgba(31, 25, 11, 0.06)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: 12,
              }}
            >
              {[
                ['◇', isZh ? '房源' : 'Listing', isZh ? '导入或 AI 起草' : 'Import or AI-draft', v3.trust, v3.trustSoft],
                ['◈', 'Passport', isZh ? '租客准备资料' : 'Tenant prepares', v3.trust, v3.trustSoft],
                ['▤', isZh ? '申请' : 'Apply', isZh ? 'Passport → 房源' : 'Passport → Listing', v3.brandBright, v3.brandSoft],
                ['◉', isZh ? '筛查' : 'Screening', isZh ? 'AI 报告' : 'AI report', v3.brandBright, v3.brandSoft],
                ['✓', isZh ? '批准' : 'Approve', isZh ? '比较 & 决定' : 'Compare & decide', v3.brandBright, v3.brandSoft],
                ['⎙', isZh ? '租约' : 'Lease', isZh ? 'AI 自动起草' : 'AI auto-draft', v3.brandBright, v3.brandSoft],
                ['✎', isZh ? '电子签署' : 'E-sign', isZh ? '双方签字' : 'Both parties', v3.brand, v3.brandSoft],
                ['⊠', isZh ? '留痕' : 'Audit', isZh ? '不可篡改' : 'Immutable trail', v3.brand, v3.brandSoft],
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: s[4] as string,
                      color: s[3] as string,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {s[0] as string}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: v3.textPrimary, marginTop: 8 }}>
                    {s[1] as string}
                  </div>
                  <div style={{ fontSize: 11, color: v3.textMuted, marginTop: 2 }}>
                    {s[2] as string}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI MODULES ───────────────────────────────────────────────────── */}
      <section style={{ padding: '40px 24px' }}>
        <div style={{ maxWidth: size.content.wide, margin: '0 auto' }}>
          <Eyebrow>{isZh ? 'AI 不是聊天框 · AI 推动整个工作流' : 'AI is not a chat box · It runs the workflow'}</Eyebrow>
          <h2
            style={{
              fontSize: 'clamp(24px, 2.6vw, 30px)',
              fontWeight: 700,
              margin: '12px 0 24px',
              letterSpacing: '-0.02em',
            }}
          >
            {isZh ? '8 个 AI 模块嵌入到租房流程的每一步。' : 'Eight AI modules built into the rental flow.'}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {[
              [isZh ? '任务路由' : 'Task Router', isZh ? '识别用户目标，打开正确的工作流。' : 'Identifies the user goal, opens the right workflow.'],
              [isZh ? '文档 AI' : 'Document AI', isZh ? '分类、抽取，标记缺失和冲突字段。' : 'Classifies, extracts, flags missing & inconsistent fields.'],
              [isZh ? '筛查 AI' : 'Screening AI', isZh ? '生成 Application Readiness，绝不打风险标签。' : 'Generates Application Readiness, never risk score.'],
              [isZh ? '房源 AI' : 'Listing AI', isZh ? '中英双语房源文案，缺失字段，公平租赁检查。' : 'EN/中 listing copy, missing fields, fair-housing check.'],
              ['Passport AI', isZh ? '按房源给出 readiness 和下一步要补什么。' : 'Per-listing readiness, what to add next.'],
              [isZh ? '租约 AI' : 'Lease AI', isZh ? '自动填充 Ontario 标准租约，冲突检查。' : 'Auto-fill Ontario standard lease, conflict checks.'],
              [isZh ? '合规守门' : 'Compliance Guardrail', isZh ? '不收新移民 / 宠物押金 / 损坏押金等表达警告。' : 'No newcomers / pet deposit / damage deposit warnings.'],
              [isZh ? '工作流 AI' : 'Workflow AI', isZh ? '提醒、消息草稿、Next-best-action。' : 'Reminders, message drafts, next-best-action.'],
            ].map((c, i) => (
              <div
                key={i}
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
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: v3.trust,
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono), monospace',
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  ✦
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: v3.textPrimary, marginTop: 10 }}>
                  {c[0]}
                </div>
                <div style={{ fontSize: 12, color: v3.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
                  {c[1]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING CTA ─────────────────────────────────────────────────── */}
      <section style={{ padding: '40px 24px 80px' }}>
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
              {isZh ? '这一周就把第一份签约的租约发出去。' : 'Ship your first signed lease this week.'}
            </div>
            <div style={{ fontSize: 14, color: v3.textSecondary, marginTop: 10 }}>
              {isZh ? '14 天免费试用 · 无需信用卡 · Stripe 计费' : '14-day free trial · No credit card · Stripe-backed billing'}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <Link href={isAuthed ? '/dashboard' : '/auth/signup'} style={btnPrimary}>
                {isZh ? '开始使用' : 'Get started'}
              </Link>
              <Link href="/about" style={btnGhost}>
                {isZh ? '联系创始人' : 'Talk to founder'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  )
}

// ── Sub-components & styles ─────────────────────────────────────────────

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

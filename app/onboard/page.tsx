'use client'
// -----------------------------------------------------------------------------
// /onboard — Tenant Onboarding · Bank Connect (V3 section 12)
// -----------------------------------------------------------------------------
// Step 2 of 4 : the bank-connect step where Verify agent orchestrates
// Persona → Flinks → Equifax → Openroom. Mobile-first iOS-style layout.
// -----------------------------------------------------------------------------

import { useState } from 'react'
import Link from 'next/link'
import { v3 } from '@/lib/brand'
import { useT } from '@/lib/i18n'

interface VerifyStep {
  key: 'identity' | 'income' | 'credit' | 'history'
  title_zh: string
  title_en: string
  via: string
  status: 'done' | 'connecting' | 'pending'
  meta?: string
}

const STEPS: VerifyStep[] = [
  { key: 'identity', title_zh: '身份核验', title_en: 'Identity', via: 'via Persona', status: 'done', meta: '11s' },
  { key: 'income', title_zh: '收入验证', title_en: 'Income', via: 'via Flinks', status: 'connecting' },
  { key: 'credit', title_zh: '信用评分', title_en: 'Credit', via: 'via Equifax', status: 'pending' },
  { key: 'history', title_zh: '租房记录', title_en: 'History', via: 'via Openroom', status: 'pending' },
]

const BANKS = ['RBC', 'TD', 'Scotia', 'BMO', 'CIBC']

export default function OnboardPage() {
  const { lang } = useT()
  const isZh = lang === 'zh'
  const [bank, setBank] = useState('RBC')

  return (
    <main style={{ background: v3.surface, minHeight: '100vh', padding: '24px 16px 40px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* nav row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Link
            href="/passport"
            style={{ background: 'transparent', border: 'none', color: v3.textMuted, fontSize: 18, textDecoration: 'none' }}
          >
            ‹
          </Link>
          <div style={{ fontSize: 13, color: v3.textPrimary, fontWeight: 600 }}>
            {isZh ? '第 2 步 / 共 4 步 · 约 3 分钟' : 'Step 2 of 4 · ~3 min remaining'}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: v3.brandStrong }}>50%</span>
        </div>

        {/* progress bars */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: n <= 2 ? v3.brand : v3.divider,
              }}
            />
          ))}
        </div>

        {/* heading */}
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 6px', lineHeight: 1.15 }}>
          {isZh ? '连接你的银行' : 'Connect your bank'}
        </h1>
        <p style={{ fontSize: 13, color: v3.textMuted, margin: '0 0 16px' }}>
          {isZh ? '90 天数据 · 只读 · 不存储凭证' : '90 days · read-only · no credentials stored'}
        </p>

        <p style={{ fontSize: 14, lineHeight: 1.65, color: v3.textPrimary, margin: '0 0 24px' }}>
          {isZh ? (
            <>我们用 <strong style={{ fontWeight: 700 }}>Flinks</strong> 读取你最近 90 天的存款，仅作为加密的平均数。房东永远看不到具体交易。只读，约 <strong style={{ fontWeight: 700 }}>20 秒</strong> 完成。</>
          ) : (
            <>We use <strong style={{ fontWeight: 700 }}>Flinks</strong> to read your last 90 days of deposits — only as a sealed average. Landlords never see transactions. Read-only, takes <strong style={{ fontWeight: 700 }}>20 seconds</strong>.</>
          )}
        </p>

        {/* Verify orchestrating card */}
        <div
          style={{
            background: v3.surface,
            border: `1px solid ${v3.border}`,
            borderRadius: 14,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span
              aria-hidden
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: 24,
                height: 24,
                borderRadius: 6,
                background: v3.brand,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              +
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: v3.brandStrong,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Verify · {isZh ? '编排中' : 'Orchestrating'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STEPS.map((s, i) => (
              <StepRow key={s.key} step={s} index={i + 1} isZh={isZh} />
            ))}
          </div>
        </div>

        {/* bank picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: v3.textMuted, marginBottom: 8, fontWeight: 600 }}>
            {isZh ? '选择银行' : 'Pick your bank'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BANKS.map((b) => (
              <button
                key={b}
                onClick={() => setBank(b)}
                style={{
                  flex: '1 1 70px',
                  padding: '12px 8px',
                  borderRadius: 10,
                  border: `1px solid ${bank === b ? v3.brand : v3.border}`,
                  background: bank === b ? v3.brandSoft : v3.surface,
                  color: bank === b ? v3.brandStrong : v3.textSecondary,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          style={{
            width: '100%',
            background: v3.brand,
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            padding: '16px 20px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)',
          }}
        >
          {isZh ? `安全连接 ${bank}` : `Connect ${bank} securely`}
          {' · '}
          <span style={{ fontWeight: 500, opacity: 0.85 }}>
            {isZh ? '安全连接' : '安全连接'}
          </span>
        </button>

        <p style={{ fontSize: 11, color: v3.textFaint, textAlign: 'center', margin: '14px 0 0', lineHeight: 1.5 }}>
          {isZh
            ? '256-bit 加密 · PIPEDA 合规 · 你随时可以撤销访问'
            : '256-bit encryption · PIPEDA compliant · revoke access any time'}
        </p>
      </div>
    </main>
  )
}

// ── Step row ────────────────────────────────────────────────────────────────

function StepRow({ step, index, isZh }: { step: VerifyStep; index: number; isZh: boolean }) {
  const dim = step.status === 'pending'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: 10,
        background: step.status === 'connecting' ? v3.brandSoft : 'transparent',
        opacity: dim ? 0.55 : 1,
      }}
    >
      {/* leading icon: ✓ done / number pending */}
      {step.status === 'done' ? (
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: v3.brand,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          ✓
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: step.status === 'connecting' ? v3.brand : v3.divider,
            color: step.status === 'connecting' ? '#fff' : v3.textMuted,
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: v3.textPrimary, lineHeight: 1.25 }}>
          {isZh ? `${step.title_en} · ${step.title_zh}` : `${step.title_en} · ${step.title_zh}`}
        </div>
        <div style={{ fontSize: 11, color: v3.textMuted, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', marginTop: 2 }}>
          {step.via}
          {step.meta ? ` · ${step.meta}` : ''}
        </div>
      </div>
      {step.status === 'connecting' && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: v3.brandStrong,
            background: '#fff',
            border: `1px solid ${v3.brandSoft}`,
            padding: '4px 10px',
            borderRadius: 999,
            flexShrink: 0,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: v3.brand }} />
          {isZh ? '连接中' : 'Connecting'}
        </span>
      )}
      {step.status === 'done' && step.meta && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: v3.textSecondary,
            background: v3.divider,
            padding: '4px 10px',
            borderRadius: 999,
            flexShrink: 0,
          }}
        >
          {step.meta}
        </span>
      )}
    </div>
  )
}

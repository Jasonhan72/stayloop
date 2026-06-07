'use client'

import Link from 'next/link'
import OnboardingStage from '@/components/OnboardingStage'

/**
 * Tenant onboarding · STEP 02
 * Meet your AI agent — single big purple orb with intro copy.
 */

export default function OnboardingMeetPage() {
  return (
    <OnboardingStage
      step={2}
      totalSteps={4}
      eyebrow="MEET YOUR AGENT"
      back={{ href: '/onboarding/welcome', label: '回上一步' }}
    >
      <div className="flex justify-center" style={{ marginBottom: 26 }}>
        <BigOrb />
      </div>

      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        每位用户都有一个<br />专属 AI 经纪。
      </h1>
      <p
        style={{
          fontSize: 15,
          color: '#3F3F46',
          lineHeight: 1.6,
          margin: '14px 0 22px',
        }}
      >
        她记住你的预算、通勤、生活节奏，每天替你筛今天新上的房源，
        谈房东的时候第一时间提醒你，签约前帮你读完所有条款。
      </p>

      <div
        style={{
          background: 'linear-gradient(135deg,rgba(124,58,237,0.06),rgba(37,99,235,0.04))',
          border: '1px solid rgba(124,58,237,0.22)',
          borderRadius: 12,
          padding: '18px 20px',
          margin: '0 0 26px',
          textAlign: 'left',
        }}
      >
        {[
          { k: '会做的事', v: '筛房 · 询价 · 安排看房 · 写申请 · 读租约' },
          { k: '不会做的事', v: '替你签字 · 替你付款 · 替你拒绝（这些都你按按钮）' },
          { k: '她记得', v: '只有你授权她记的 — 任何时候可清除' },
        ].map((it) => (
          <div
            key={it.k}
            style={{
              display: 'grid',
              gridTemplateColumns: '92px 1fr',
              gap: 10,
              padding: '6px 0',
              fontSize: 12.5,
              lineHeight: 1.55,
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: 10.5,
                color: '#5B21B6',
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
              }}
            >
              {it.k}
            </span>
            <span style={{ color: '#171717' }}>{it.v}</span>
          </div>
        ))}
      </div>

      <Link
        href="/onboarding/name"
        style={{
          display: 'block',
          width: '100%',
          padding: '14px',
          background: '#171717',
          color: '#fff',
          borderRadius: 10,
          fontSize: 14.5,
          fontWeight: 700,
          textAlign: 'center',
          textDecoration: 'none',
        }}
      >
        给她起个名字 →
      </Link>
    </OnboardingStage>
  )
}

function BigOrb() {
  return (
    <span
      className="pulse"
      style={{
        width: 120,
        height: 120,
        borderRadius: '50%',
        background:
          'radial-gradient(circle at 32% 28%, rgba(196,181,253,0.95), #7C3AED 65%)',
        boxShadow:
          '0 0 60px rgba(124,58,237,0.45), 0 0 0 1px rgba(124,58,237,0.20)',
        display: 'inline-block',
        position: 'relative',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: -16,
          borderRadius: '50%',
          border: '2px solid rgba(124,58,237,0.30)',
          animation: 'orb-pulse 2s ease-out infinite',
        }}
      />
    </span>
  )
}

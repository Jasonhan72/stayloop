'use client'

import Link from 'next/link'
import OnboardingStage from '@/components/OnboardingStage'

/**
 * Tenant onboarding · STEP 01
 * Stayloop intro — what you get, why it's different.
 */

export default function OnboardingWelcomePage() {
  return (
    <OnboardingStage step={1} totalSteps={4} eyebrow="TENANT · STAYLOOP">
      {/* Three small orbs representing tenant / landlord / agent — same orb design system from Hi-Fi */}
      <div className="flex justify-center gap-3" style={{ marginBottom: 22 }}>
        <Orb color="#7C3AED" size={44} pulse />
        <Orb color="#047857" size={32} />
        <Orb color="#2563EB" size={32} />
      </div>

      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        欢迎来到 Stayloop。
      </h1>
      <p
        style={{
          fontSize: 15,
          color: '#3F3F46',
          lineHeight: 1.6,
          margin: '14px 0 24px',
        }}
      >
        Toronto 第一个 AI-native 的租房平台。<br />
        你的专属 AI 经纪会全程帮你 — 找房、谈价、签约、入住。
      </p>

      <ul
        style={{
          textAlign: 'left',
          background: '#F8F5EC',
          borderRadius: 10,
          padding: '16px 20px',
          margin: '0 0 28px',
          listStyle: 'none',
        }}
      >
        {[
          '一个 AI Agent 记住你的偏好，每天为你筛新房',
          'Rental Passport — 一次验证全城通用，不重复填表',
          '租客永远免费，关键决策永远你按按钮',
        ].map((line) => (
          <li
            key={line}
            style={{
              fontSize: 13.5,
              color: '#171717',
              lineHeight: 1.7,
              paddingLeft: 22,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 0,
                color: '#047857',
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            {line}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2.5">
        <Link
          href="/onboarding/meet"
          style={{
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
          继续 →
        </Link>
        <Link
          href="/listings"
          style={{
            width: '100%',
            padding: '12px',
            background: 'transparent',
            color: '#71717A',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          先随便看看房源
        </Link>
      </div>
    </OnboardingStage>
  )
}

function Orb({ color, size, pulse }: { color: string; size: number; pulse?: boolean }) {
  return (
    <span
      className={pulse ? 'pulse' : ''}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 35%, ${color}aa, ${color} 70%)`,
        boxShadow: `0 0 ${size / 2}px ${color}44`,
        display: 'inline-block',
      }}
    />
  )
}

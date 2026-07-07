'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import OnboardingStage from '@/components/OnboardingStage'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useOnboarded } from '@/lib/useOnboarding'

/**
 * Tenant onboarding · STEP 01
 * Stayloop intro — what you get, why it's different.
 */

export default function OnboardingWelcomePage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const router = useRouter()
  // A signed-in user who already finished onboarding for their active role
  // shouldn't see the intro again — send them to their workspace.
  const { role } = useAuth()
  const { ready, onboarded, home } = useOnboarded(role ?? 'tenant')
  useEffect(() => {
    if (ready && onboarded && role) router.replace(home)
  }, [ready, onboarded, role, home, router])
  const benefits = [
    { zh: '一个 AI Agent 记住你的偏好，每天为你筛新房', en: 'An AI agent that remembers your preferences and screens new listings for you daily' },
    { zh: 'Rental Passport — 一次验证全城通用，不重复填表', en: 'Rental Passport — verify once, reuse across the city, no repeat forms' },
    { zh: '租客永远免费，关键决策永远你按按钮', en: 'Always free for tenants, and you always make the key decisions' },
  ]
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
          fontSize: 'clamp(26px, 7vw, 32px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        {zh ? '欢迎来到 Stayloop。' : 'Welcome to Stayloop.'}
      </h1>
      <p
        style={{
          fontSize: 15,
          color: '#3F3F46',
          lineHeight: 1.6,
          margin: '14px 0 24px',
        }}
      >
        {zh ? (
          <>
            Toronto 第一个 AI-native 的租房平台。<br />
            你的专属 AI 经纪会全程帮你 — 找房、谈价、签约、入住。
          </>
        ) : (
          <>
            Toronto’s first AI-native rental platform.<br />
            Your personal AI agent helps end to end — finding, negotiating, signing, moving in.
          </>
        )}
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
        {benefits.map((line) => (
          <li
            key={line.en}
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
            {line[lang]}
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
          {zh ? '继续 →' : 'Continue →'}
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
          {zh ? '先随便看看房源' : 'Just browse listings first'}
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

'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import OnboardingStage from '@/components/OnboardingStage'
import { useT } from '@/lib/i18n'
import { useAuth } from '@/lib/useAuth'
import { useOnboarded } from '@/lib/useOnboarding'

/**
 * Tenant onboarding · STEP 02
 * Meet your AI agent — single big purple orb with intro copy.
 */

export default function OnboardingMeetPage() {
  const { lang } = useT()
  const zh = lang === 'zh'
  const router = useRouter()
  const { role } = useAuth()
  const { ready, onboarded, home } = useOnboarded(role ?? 'tenant')
  useEffect(() => {
    if (ready && onboarded && role) router.replace(home)
  }, [ready, onboarded, role, home, router])
  const rows = [
    { k: { zh: '会做的事', en: 'What it does' }, v: { zh: '筛房 · 询价 · 安排看房 · 写申请 · 读租约', en: 'Screen listings · ask prices · book showings · draft applications · read leases' } },
    { k: { zh: '不会做的事', en: 'What it won’t do' }, v: { zh: '替你签字 · 替你付款 · 替你拒绝（这些都你按按钮）', en: 'Sign for you · pay for you · decline for you (you press those buttons)' } },
    { k: { zh: '她记得', en: 'It remembers' }, v: { zh: '只有你授权她记的 — 任何时候可清除', en: 'Only what you authorize it to — clearable anytime' } },
  ]
  return (
    <OnboardingStage
      step={2}
      totalSteps={4}
      eyebrow="MEET YOUR AGENT"
      back={{ href: '/onboarding/welcome', label: zh ? '回上一步' : 'Back' }}
    >
      <div className="flex justify-center" style={{ marginBottom: 26 }}>
        <BigOrb />
      </div>

      <h1
        style={{
          fontSize: 'clamp(26px, 7vw, 32px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        {zh ? (
          <>每位用户都有一个<br />专属 AI 经纪。</>
        ) : (
          <>Every user gets their own<br />personal AI agent.</>
        )}
      </h1>
      <p
        style={{
          fontSize: 15,
          color: '#3F3F46',
          lineHeight: 1.6,
          margin: '14px 0 22px',
        }}
      >
        {zh
          ? '她记住你的预算、通勤、生活节奏，每天替你筛今天新上的房源，谈房东的时候第一时间提醒你，签约前帮你读完所有条款。'
          : 'It remembers your budget, commute, and lifestyle, screens new listings for you every day, alerts you the moment a landlord responds, and reads every clause before you sign.'}
      </p>

      <div
        style={{
          background: 'linear-gradient(135deg,rgba(0,172,228,0.06),rgba(37,99,235,0.04))',
          border: '1px solid rgba(0,172,228,0.22)',
          borderRadius: 12,
          padding: '18px 20px',
          margin: '0 0 26px',
          textAlign: 'left',
        }}
      >
        {rows.map((it) => (
          <div
            key={it.k.en}
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
              {it.k[lang]}
            </span>
            <span style={{ color: '#171717' }}>{it.v[lang]}</span>
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
        {zh ? '给她起个名字 →' : 'Give it a name →'}
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
          'radial-gradient(circle at 32% 28%, rgba(196,181,253,0.95), #00ACE4 65%)',
        boxShadow:
          '0 0 60px rgba(0,172,228,0.45), 0 0 0 1px rgba(0,172,228,0.20)',
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
          border: '2px solid rgba(0,172,228,0.30)',
          animation: 'orb-pulse 2s ease-out infinite',
        }}
      />
    </span>
  )
}

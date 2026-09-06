'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import Logo from './Logo'

/**
 * Centered onboarding stage matching the Hi-Fi `.stage` + `.stage-card`
 * spec. Used by the tenant onboarding flow (welcome → meet → name → first chat).
 */

interface Props {
  step?: number
  totalSteps?: number
  eyebrow?: string
  children: ReactNode
  /** Optional back link rendered top-left */
  back?: { href: string; label: string }
}

export default function OnboardingStage({ step, totalSteps, eyebrow, children, back }: Props) {
  return (
    <main
      className="px-4 sm:px-6"
      style={{
        background: 'linear-gradient(180deg,#F4F6F9 0%,#E4EEE3 100%)',
        minHeight: '100vh',
        position: 'relative',
        paddingTop: 60,
        paddingBottom: 80,
      }}
    >
      {/* Top bar */}
      <div
        className="mx-auto flex max-w-[1320px] items-center"
        style={{ paddingBottom: 36 }}
      >
        <Logo size="md" />

        {step && totalSteps && (
          <div
            className="ml-auto flex items-center gap-2 font-mono"
            style={{ fontSize: 11, color: '#71717A', letterSpacing: '0.10em' }}
          >
            <span>STEP {String(step).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}</span>
            <span className="flex gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span
                  key={i}
                  className="w-4 sm:w-7"
                  style={{
                    height: 3,
                    borderRadius: 2,
                    background: i < step ? '#1B1B3C' : '#E2E8F0',
                  }}
                />
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Card */}
      <div className="mx-auto flex justify-center">
        <div
          className="px-5 py-8 sm:px-12 sm:py-11"
          style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 18,
            maxWidth: 600,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 12px 40px rgba(0,0,0,0.06)',
          }}
        >
          {eyebrow && (
            <div
              className="font-mono"
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: '#1B1B3C',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              {eyebrow}
            </div>
          )}
          {children}
        </div>
      </div>

      {back && (
        <div className="mx-auto mt-6 max-w-[600px] text-center">
          <Link
            href={back.href}
            style={{ fontSize: 13, color: '#71717A', textDecoration: 'underline' }}
          >
            ← {back.label}
          </Link>
        </div>
      )}
    </main>
  )
}

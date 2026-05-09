'use client'

import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useI18n } from '@/lib/i18n'

/**
 * V5 ART 01 · Public Hero
 *
 * Spec (from Hi-Fi Vol 1):
 *   Background: linear-gradient(180deg, #F2EEE5 0%, #E4EEE3 100%)
 *   Padding: 80px 64px 60px
 *   Min-height: 820px
 *   H1: 64px / weight 700 / letter-spacing -0.035em / line-height 1.05 / max-width 780px
 *   Sub: 19px / #3F3F46 / line-height 1.55 / max-width 620px / margin 24px 0 36px
 *   Roles: 3-col grid, gap 14px, max-width 1080px, margin-top 64px
 *
 * The header sits over this hero gradient (variant="transparent").
 */
export default function HomePage() {
  const { t } = useI18n()

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #F2EEE5 0%, #E4EEE3 100%)',
        minHeight: '100vh',
      }}
    >
      <Header variant="transparent" />

      {/* Hero — spec: padding 80px 64px 60px (desktop), min-height 820px */}
      <section
        className="mx-auto max-w-[1320px] px-6 sm:px-8 lg:px-12"
        style={{ paddingTop: 80, paddingBottom: 60 }}
      >
        <h1
          className="font-bold text-body"
          style={{
            fontSize: 'clamp(40px, 6vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            maxWidth: 780,
            margin: 0,
          }}
        >
          {t('hero.title')}
        </h1>

        <p
          className="text-body-2"
          style={{
            fontSize: 19,
            lineHeight: 1.55,
            maxWidth: 620,
            margin: '24px 0 36px',
          }}
        >
          {t('hero.sub')}
        </p>

        <div className="flex flex-wrap items-center gap-[14px]">
          <Link
            href="/onboarding/tier1"
            className="inline-flex items-center justify-center rounded-[10px] text-white shadow-cta-mint"
            style={{
              background: 'linear-gradient(135deg,#6EE7B7,#34D399)',
              fontSize: 15,
              padding: '14px 28px',
              fontWeight: 600,
            }}
          >
            {t('hero.ctaPrimary')}
          </Link>
          <Link
            href="/pricing"
            className="text-body-2 underline-offset-4 hover:underline"
            style={{
              fontSize: 14,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
            }}
          >
            {t('hero.ctaPricing')}
          </Link>
        </div>

        {/* Role cards — spec: 3 columns, gap 14px, max-width 1080px, margin-top 64px */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 14,
            maxWidth: 1080,
            marginTop: 64,
          }}
        >
          <RoleCard
            tone="tenant"
            eyebrow={t('hero.tenantEyebrow')}
            title={t('hero.tenantTitle')}
            body={t('hero.tenantBody')}
            arrow={t('hero.tenantArrow')}
            href="/tenant"
          />
          <RoleCard
            tone="landlord"
            eyebrow={t('hero.landlordEyebrow')}
            title={t('hero.landlordTitle')}
            body={t('hero.landlordBody')}
            arrow={t('hero.landlordArrow')}
            href="/landlord"
          />
          <RoleCard
            tone="agent"
            eyebrow={t('hero.agentEyebrow')}
            title={t('hero.agentTitle')}
            body={t('hero.agentBody')}
            arrow={t('hero.agentArrow')}
            href="/agent"
          />
        </div>
      </section>

      <Footer />
    </div>
  )
}

const TONE: Record<'tenant' | 'landlord' | 'agent', { eb: string; arrow: string }> = {
  tenant:   { eb: '#7C3AED', arrow: '#7C3AED' },
  landlord: { eb: '#047857', arrow: '#047857' },
  agent:    { eb: '#2563EB', arrow: '#2563EB' },
}

function RoleCard({
  tone,
  eyebrow,
  title,
  body,
  arrow,
  href,
}: {
  tone: 'tenant' | 'landlord' | 'agent'
  eyebrow: string
  title: string
  body: string
  arrow: string
  href: string
}) {
  const c = TONE[tone]
  return (
    <Link
      href={href}
      className="block bg-white transition lift-hover"
      style={{
        border: '1px solid #E0DACE',
        borderRadius: 14,
        padding: 24,
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: c.eb,
        }}
      >
        {eyebrow}
      </div>
      <h3
        className="text-body"
        style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px', letterSpacing: '-0.01em' }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 13.5, color: '#3F3F46', lineHeight: 1.55, margin: '0 0 12px' }}>
        {body}
      </p>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.arrow }}>{arrow}</div>
    </Link>
  )
}

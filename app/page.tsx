'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useT, LanguageToggle } from '@/lib/i18n'

// ─────────────────────────────────────────────────────────────────────
// Stayloop — marketing home page
// Light, professional real-estate SaaS theme, scoped to .marketing in
// globals.css so /screen, /dashboard, and authenticated views keep
// their existing dark theme untouched.
// ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { t } = useT()
  // CTAs route directly to /screen — no login gate.
  // Anonymous Supabase sessions are auto-created on the screen page.
  const screenHref = '/screen'

  return (
    <main className="marketing">
      <MarketingNav />
      <Hero screenHref={screenHref} />
      <TrustBar />
      <DualAudience screenHref={screenHref} />
      <Architecture />
      <ScreeningFeature screenHref={screenHref} />
      <HowItWorks />
      <Security />
      <Pricing screenHref={screenHref} />
      <FAQ />
      <FinalCTA screenHref={screenHref} />
      <Footer />
    </main>
  )
}

// ─── Nav ─────────────────────────────────────────────────────────────
function MarketingNav() {
  const { t } = useT()
  return (
    <nav className="mk-nav">
      <div className="mk-nav-inner">
        <Link href="/" style={{ textDecoration: 'none', fontSize: 20, fontWeight: 800, color: 'var(--mk-navy)', letterSpacing: '-0.02em' }}>
          Stayloop
        </Link>

        <div className="mk-nav-links">
          <a href="#product">{t('mk.nav.product')}</a>
          <a href="#landlords">{t('mk.nav.landlords')}</a>
          <a href="#tenants">{t('mk.nav.tenants')}</a>
          <a href="#roadmap">{t('mk.nav.roadmap')}</a>
          <a href="#pricing">{t('mk.nav.pricing')}</a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LanguageToggle />
          <Link href="/login" className="mk-btn mk-btn-primary mk-btn-sm">
            {t('mk.nav.signin')}
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────
function Hero({ screenHref }: { screenHref: string }) {
  const { t } = useT()
  return (
    <section className="mk-section" style={{ paddingTop: 96, paddingBottom: 72 }}>
      <div className="mk-grid-hero">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(13, 148, 136, 0.08)', border: '1px solid rgba(13, 148, 136, 0.22)', marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0D9488', boxShadow: '0 0 8px rgba(13, 148, 136, 0.6)' }} />
            <span className="mk-eyebrow" style={{ fontSize: 10.5 }}>{t('mk.hero.eyebrow')}</span>
          </div>

          <h1 className="mk-display" style={{ marginBottom: 22 }}>
            {t('mk.hero.title1')}<br />
            <span className="mk-gradient">{t('mk.hero.title2')}</span>
          </h1>

          <p className="mk-lead" style={{ maxWidth: 580, marginBottom: 36 }}>
            {t('mk.hero.sub')}
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <Link href={screenHref} className="mk-btn mk-btn-primary mk-btn-lg">
              {t('mk.hero.ctaPrimary')}
            </Link>
            <a href="#tenants" className="mk-btn mk-btn-ghost mk-btn-lg">
              {t('mk.hero.ctaTenant')}
            </a>
          </div>

          <div className="mk-hero-trust-row" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--mk-text-muted)' }}>
            {[t('mk.hero.trust1'), t('mk.hero.trust2'), t('mk.hero.trust3')].map(txt => (
              <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 999, background: 'rgba(5, 150, 105, 0.12)', color: '#059669', fontSize: 11, fontWeight: 800,
                }}>✓</span>
                <span>{txt}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mk-hero-preview-wrap">
          <HeroPreview />
        </div>
      </div>
    </section>
  )
}

function HeroPreview() {
  const { t } = useT()
  return (
    <div className="mk-card-raised" style={{ overflow: 'hidden' }}>
      {/* Window chrome */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--mk-border)', background: 'var(--mk-surface-tint)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F87171' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBBF24' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#34D399' }} />
        <div style={{ marginLeft: 12, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--mk-text-muted)' }}>
          stayloop.ai / screen
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Applicant header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #0D9488 0%, #0EA5E9 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFFFFF', fontWeight: 800, fontSize: 16,
          }}>JC</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mk-navy)' }}>{t('mk.preview.name')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--mk-text-muted)', marginTop: 2 }}>{t('mk.preview.subtitle')}</div>
          </div>
          <div style={{
            padding: '5px 11px', borderRadius: 999,
            background: 'rgba(5, 150, 105, 0.12)',
            color: '#047857', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
          }}>{t('mk.preview.tier.val').toUpperCase()}</div>
        </div>

        {/* Score + stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 14, borderRadius: 12, background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDFA 100%)', border: '1px solid #D1FAE5' }}>
            <div className="mk-eyebrow" style={{ fontSize: 9, color: '#047857' }}>{t('mk.preview.score')}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#065F46', letterSpacing: '-0.03em', marginTop: 2 }}>87</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--mk-surface-tint)', border: '1px solid var(--mk-border)' }}>
            <div className="mk-eyebrow" style={{ fontSize: 9, color: 'var(--mk-text-muted)' }}>{t('mk.preview.ratio')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--mk-navy)', letterSpacing: '-0.02em', marginTop: 4 }}>3.4×</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--mk-surface-tint)', border: '1px solid var(--mk-border)' }}>
            <div className="mk-eyebrow" style={{ fontSize: 9, color: 'var(--mk-text-muted)' }}>{t('mk.preview.ltb')}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--mk-navy)', marginTop: 6 }}>{t('mk.preview.ltb.val')}</div>
          </div>
        </div>

        {/* Dimension bars */}
        <div style={{ marginBottom: 16 }}>
          {[
            { label: t('mk.preview.dim1'), val: 92, col: '#0D9488' },
            { label: t('mk.preview.dim2'), val: 85, col: '#0EA5E9' },
            { label: t('mk.preview.dim3'), val: 90, col: '#8B5CF6' },
            { label: t('mk.preview.dim4'), val: 82, col: '#F59E0B' },
          ].map(d => (
            <div key={d.label} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                <span style={{ color: 'var(--mk-text-secondary)', fontWeight: 600 }}>{d.label}</span>
                <span className="mono" style={{ color: 'var(--mk-navy)', fontWeight: 700 }}>{d.val}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: '#EEF2F7', overflow: 'hidden' }}>
                <div style={{ width: `${d.val}%`, height: '100%', background: d.col, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* AI note */}
        <div style={{ padding: 13, borderRadius: 10, background: 'var(--mk-surface-tint)', border: '1px solid var(--mk-border)' }}>
          <div className="mk-eyebrow" style={{ fontSize: 9, marginBottom: 5, color: 'var(--mk-brand-strong)' }}>CLAUDE ANALYSIS</div>
          <div style={{ fontSize: 12, color: 'var(--mk-text-secondary)', lineHeight: 1.6 }}>
            {t('mk.preview.note')}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Trust bar ───────────────────────────────────────────────────────
function TrustBar() {
  const { t } = useT()
  const items = [
    t('mk.trust.claude'),
    t('mk.trust.canlii'),
    t('mk.trust.supabase'),
    t('mk.trust.cloudflare'),
    t('mk.trust.pipeda'),
    t('mk.trust.ohrc'),
  ]
  return (
    <section className="mk-section-alt">
      <div className="mk-section mk-section-tight" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 18, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mk-text-muted)' }}>
          {t('mk.trust.heading')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '14px 36px' }}>
          {items.map(label => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, fontWeight: 600, color: 'var(--mk-text-secondary)',
              padding: '8px 14px', borderRadius: 10,
              background: 'var(--mk-surface)', border: '1px solid var(--mk-border)',
              boxShadow: 'var(--mk-shadow-xs)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0D9488' }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Dual audience ───────────────────────────────────────────────────
function DualAudience({ screenHref }: { screenHref: string }) {
  const { t } = useT()
  return (
    <section id="product" className="mk-section">
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div className="mk-eyebrow" style={{ marginBottom: 12 }}>{t('mk.dual.eyebrow')}</div>
        <h2 className="mk-h2" style={{ maxWidth: 760, margin: '0 auto 16px' }}>{t('mk.dual.title')}</h2>
        <p className="mk-lead" style={{ maxWidth: 720, margin: '0 auto', color: 'var(--mk-text-secondary)' }}>{t('mk.dual.sub')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
        {/* Landlord card */}
        <div id="landlords" className="mk-card mk-card-hover" style={{ padding: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFFFFF', fontSize: 16,
            }}>🏠</div>
            <div className="mk-eyebrow" style={{ color: 'var(--mk-brand-strong)' }}>{t('mk.dual.landlord.tag')}</div>
          </div>
          <h3 className="mk-h3" style={{ marginBottom: 10 }}>{t('mk.dual.landlord.title')}</h3>
          <p style={{ fontSize: 14, color: 'var(--mk-text-secondary)', lineHeight: 1.65, marginBottom: 22 }}>
            {t('mk.dual.landlord.desc')}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'grid', gap: 12 }}>
            {[t('mk.dual.landlord.b1'), t('mk.dual.landlord.b2'), t('mk.dual.landlord.b3')].map(b => (
              <li key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--mk-text)' }}>
                <CheckIcon />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Link href={screenHref} className="mk-btn mk-btn-primary">
            {t('mk.dual.landlord.cta')}
          </Link>
        </div>

        {/* Tenant card */}
        <div id="tenants" className="mk-card mk-card-hover" style={{ padding: 36, background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FFFFFF', fontSize: 16,
            }}>🔑</div>
            <div className="mk-eyebrow" style={{ color: '#6D28D9' }}>{t('mk.dual.tenant.tag')}</div>
            <span className="mk-chip mk-chip-amber" style={{ marginLeft: 'auto' }}>{t('mk.dual.tenant.soon')}</span>
          </div>
          <h3 className="mk-h3" style={{ marginBottom: 10 }}>{t('mk.dual.tenant.title')}</h3>
          <p style={{ fontSize: 14, color: 'var(--mk-text-secondary)', lineHeight: 1.65, marginBottom: 22 }}>
            {t('mk.dual.tenant.desc')}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'grid', gap: 12 }}>
            {[t('mk.dual.tenant.b1'), t('mk.dual.tenant.b2'), t('mk.dual.tenant.b3')].map(b => (
              <li key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--mk-text)' }}>
                <CheckIcon color="#7C3AED" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="mk-btn mk-btn-ghost" disabled style={{ cursor: 'not-allowed', opacity: 0.75 }}>
            {t('mk.dual.tenant.cta')}
          </button>
        </div>
      </div>
    </section>
  )
}

function CheckIcon({ color = '#0D9488' }: { color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 18, height: 18, borderRadius: 999, flexShrink: 0,
      background: `${color}15`, color, fontSize: 11, fontWeight: 800, marginTop: 1,
    }}>✓</span>
  )
}

// ─── Screening feature ───────────────────────────────────────────────
function ScreeningFeature({ screenHref }: { screenHref: string }) {
  const { t } = useT()
  const features = [
    { title: t('mk.screening.f1.title'), desc: t('mk.screening.f1.desc'), icon: '📊', col: '#0D9488' },
    { title: t('mk.screening.f2.title'), desc: t('mk.screening.f2.desc'), icon: '⚖️', col: '#0EA5E9' },
    { title: t('mk.screening.f3.title'), desc: t('mk.screening.f3.desc'), icon: '🔍', col: '#8B5CF6' },
    { title: t('mk.screening.f4.title'), desc: t('mk.screening.f4.desc'), icon: '🛡️', col: '#F59E0B' },
    { title: t('mk.screening.f5.title'), desc: t('mk.screening.f5.desc'), icon: '💾', col: '#059669' },
    { title: t('mk.screening.f6.title'), desc: t('mk.screening.f6.desc'), icon: '🌏', col: '#E11D48' },
  ]

  return (
    <section className="mk-section-alt">
      <div className="mk-section">
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div className="mk-chip" style={{ marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0D9488' }} />
            {t('mk.screening.eyebrow')}
          </div>
          <h2 className="mk-h2" style={{ maxWidth: 820, margin: '0 auto 16px' }}>
            {t('mk.screening.title')}
          </h2>
          <p className="mk-lead" style={{ maxWidth: 780, margin: '0 auto' }}>
            {t('mk.screening.sub')}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 40 }}>
          {features.map(f => (
            <div key={f.title} className="mk-card mk-card-hover" style={{ padding: 24 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 42, height: 42, borderRadius: 11,
                background: `${f.col}12`, border: `1px solid ${f.col}33`,
                fontSize: 18, marginBottom: 14,
              }}>{f.icon}</div>
              <h3 className="mk-h3" style={{ fontSize: 15.5, marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--mk-text-secondary)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <Link href={screenHref} className="mk-btn mk-btn-primary mk-btn-lg">
            {t('mk.screening.cta')}
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── How it works ────────────────────────────────────────────────────
function HowItWorks() {
  const { t } = useT()
  const steps = [
    { n: t('mk.how.1.n'), title: t('mk.how.1.title'), desc: t('mk.how.1.desc') },
    { n: t('mk.how.2.n'), title: t('mk.how.2.title'), desc: t('mk.how.2.desc') },
    { n: t('mk.how.3.n'), title: t('mk.how.3.title'), desc: t('mk.how.3.desc') },
    { n: t('mk.how.4.n'), title: t('mk.how.4.title'), desc: t('mk.how.4.desc') },
  ]
  return (
    <section className="mk-section">
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <div className="mk-eyebrow" style={{ marginBottom: 12 }}>{t('mk.how.eyebrow')}</div>
        <h2 className="mk-h2" style={{ maxWidth: 760, margin: '0 auto' }}>{t('mk.how.title')}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ position: 'relative' }}>
            <div className="mk-card" style={{ padding: 26, height: '100%' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: 10,
                background: 'var(--mk-brand-soft)', color: 'var(--mk-brand-strong)',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800,
                marginBottom: 16, border: '1px solid rgba(13, 148, 136, 0.25)',
              }}>{s.n}</div>
              <h3 className="mk-h3" style={{ fontSize: 15.5, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--mk-text-secondary)', lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
            </div>
            {i < steps.length - 1 && (
              <div aria-hidden style={{
                position: 'absolute', top: 44, right: -14, width: 24, height: 2,
                background: 'linear-gradient(90deg, rgba(13, 148, 136, 0.45), transparent)',
                display: 'none',
              }} className="hidden lg:block" />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Architecture (the four interlocking modules) ────────────────────
function Architecture() {
  const { t } = useT()
  const modules = [
    { tag: t('mk.arch.m1.tag'), title: t('mk.arch.m1.title'), desc: t('mk.arch.m1.desc'), num: '01' },
    { tag: t('mk.arch.m2.tag'), title: t('mk.arch.m2.title'), desc: t('mk.arch.m2.desc'), num: '02' },
    { tag: t('mk.arch.m3.tag'), title: t('mk.arch.m3.title'), desc: t('mk.arch.m3.desc'), num: '03' },
    { tag: t('mk.arch.m4.tag'), title: t('mk.arch.m4.title'), desc: t('mk.arch.m4.desc'), num: '04' },
  ]
  return (
    <section id="architecture" className="mk-section-alt">
      <div className="mk-section">
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div className="mk-eyebrow" style={{ marginBottom: 12 }}>{t('mk.arch.eyebrow')}</div>
          <h2 className="mk-h2" style={{ maxWidth: 820, margin: '0 auto 14px' }}>{t('mk.arch.title')}</h2>
          <p className="mk-lead" style={{ maxWidth: 760, margin: '0 auto' }}>{t('mk.arch.sub')}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
          {modules.map(m => (
            <div key={m.num} className="mk-card mk-card-hover" style={{ padding: 26, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 28, fontWeight: 800, lineHeight: 1,
                color: 'var(--mk-brand-soft)', flexShrink: 0, marginTop: 2,
              }}>{m.tag}</div>
              <div>
                <h3 className="mk-h3" style={{ fontSize: 16, marginBottom: 6 }}>{m.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--mk-text-secondary)', lineHeight: 1.6, margin: 0 }}>{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Roadmap — four phases over twelve months ────────────────────────
function Roadmap() {
  const { t } = useT()
  const phases = [
    {
      status: 'shipping',
      tag: t('mk.roadmap.p1.tag'),
      title: t('mk.roadmap.p1.title'),
      goal: t('mk.roadmap.p1.goal'),
      items: [
        t('mk.roadmap.p1.i1'),
        t('mk.roadmap.p1.i2'),
        t('mk.roadmap.p1.i3'),
        t('mk.roadmap.p1.i4'),
      ],
    },
    {
      status: 'next',
      tag: t('mk.roadmap.p2.tag'),
      title: t('mk.roadmap.p2.title'),
      goal: t('mk.roadmap.p2.goal'),
      items: [
        t('mk.roadmap.p2.i1'),
        t('mk.roadmap.p2.i2'),
        t('mk.roadmap.p2.i3'),
        t('mk.roadmap.p2.i4'),
      ],
    },
    {
      status: 'planned',
      tag: t('mk.roadmap.p3.tag'),
      title: t('mk.roadmap.p3.title'),
      goal: t('mk.roadmap.p3.goal'),
      items: [
        t('mk.roadmap.p3.i1'),
        t('mk.roadmap.p3.i2'),
        t('mk.roadmap.p3.i3'),
        t('mk.roadmap.p3.i4'),
      ],
    },
    {
      status: 'planned',
      tag: t('mk.roadmap.p4.tag'),
      title: t('mk.roadmap.p4.title'),
      goal: t('mk.roadmap.p4.goal'),
      items: [
        t('mk.roadmap.p4.i1'),
        t('mk.roadmap.p4.i2'),
        t('mk.roadmap.p4.i3'),
        t('mk.roadmap.p4.i4'),
      ],
    },
  ] as const

  const statusStyles: Record<string, { bg: string; color: string; border: string; label: string }> = {
    shipping: { bg: 'rgba(5, 150, 105, 0.12)', color: '#047857', border: 'rgba(5, 150, 105, 0.28)', label: t('mk.roadmap.status.shipping') },
    next: { bg: 'rgba(37, 99, 235, 0.12)', color: '#1D4ED8', border: 'rgba(37, 99, 235, 0.28)', label: t('mk.roadmap.status.next') },
    planned: { bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.28)', label: t('mk.roadmap.status.planned') },
  }

  return (
    <section id="roadmap" className="mk-section">
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <div className="mk-eyebrow" style={{ marginBottom: 12 }}>{t('mk.roadmap.eyebrow')}</div>
        <h2 className="mk-h2" style={{ maxWidth: 820, margin: '0 auto 14px' }}>{t('mk.roadmap.title')}</h2>
        <p className="mk-lead" style={{ maxWidth: 780, margin: '0 auto' }}>{t('mk.roadmap.sub')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 18 }}>
        {phases.map(phase => {
          const s = statusStyles[phase.status]
          return (
            <div key={phase.title} className="mk-card mk-card-hover" style={{ padding: 26, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 999,
                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>{s.label.toUpperCase()}</span>
              </div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                color: 'var(--mk-text-secondary)', marginBottom: 8,
              }}>{phase.tag}</div>
              <h3 className="mk-h3" style={{ fontSize: 16, marginBottom: 10 }}>{phase.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--mk-text-secondary)', lineHeight: 1.6, margin: '0 0 16px', fontStyle: 'italic' }}>{phase.goal}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {phase.items.map(it => (
                  <li key={it} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--mk-text)', lineHeight: 1.55 }}>
                    <span style={{
                      display: 'inline-block', width: 5, height: 5, borderRadius: 999,
                      background: s.color, marginTop: 7, flexShrink: 0,
                    }} />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Security / compliance ───────────────────────────────────────────
function Security() {
  const { t } = useT()
  const items = [
    { title: t('mk.sec.1.title'), desc: t('mk.sec.1.desc'), icon: '🔒' },
    { title: t('mk.sec.2.title'), desc: t('mk.sec.2.desc'), icon: '⚖️' },
    { title: t('mk.sec.3.title'), desc: t('mk.sec.3.desc'), icon: '📜' },
    { title: t('mk.sec.4.title'), desc: t('mk.sec.4.desc'), icon: '🛡️' },
  ]
  return (
    <section className="mk-section-alt">
      <div className="mk-section">
        <div className="mk-grid-split">
          <div>
            <div className="mk-eyebrow" style={{ marginBottom: 12 }}>{t('mk.sec.eyebrow')}</div>
            <h2 className="mk-h2" style={{ marginBottom: 18 }}>{t('mk.sec.title')}</h2>
            <p className="mk-lead" style={{ maxWidth: 480 }}>{t('mk.sec.sub')}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {items.map(it => (
              <div key={it.title} className="mk-card" style={{ padding: 22 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, marginBottom: 12,
                  background: 'var(--mk-brand-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17,
                }}>{it.icon}</div>
                <h3 className="mk-h3" style={{ fontSize: 14.5, marginBottom: 6 }}>{it.title}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--mk-text-secondary)', lineHeight: 1.6, margin: 0 }}>{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ─────────────────────────────────────────────────────────
function Pricing({ screenHref }: { screenHref: string }) {
  const { t } = useT()
  return (
    <section id="pricing" className="mk-section">
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="mk-eyebrow" style={{ marginBottom: 12 }}>{t('mk.pricing.eyebrow')}</div>
        <h2 className="mk-h2" style={{ marginBottom: 14 }}>{t('mk.pricing.title')}</h2>
        <p className="mk-lead" style={{ maxWidth: 560, margin: '0 auto' }}>{t('mk.pricing.sub')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, maxWidth: 920, margin: '0 auto' }}>
        {/* Free */}
        <div className="mk-card" style={{ padding: 36 }}>
          <div className="mk-eyebrow" style={{ color: 'var(--mk-text-muted)', marginBottom: 10 }}>{t('mk.pricing.free.label')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--mk-navy)' }}>{t('mk.pricing.free.price')}</span>
            <span style={{ fontSize: 14, color: 'var(--mk-text-muted)', fontWeight: 500 }}>{t('mk.pricing.free.unit')}</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--mk-text-secondary)', marginBottom: 22 }}>{t('mk.pricing.free.sub')}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'grid', gap: 11 }}>
            {[t('mk.pricing.free.f1'), t('mk.pricing.free.f2'), t('mk.pricing.free.f3'), t('mk.pricing.free.f4'), t('mk.pricing.free.f5')].map(f => (
              <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--mk-text)' }}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link href={screenHref} className="mk-btn mk-btn-ghost" style={{ width: '100%' }}>
            {t('mk.pricing.free.cta')}
          </Link>
        </div>

        {/* Pro */}
        <div className="mk-card-raised" style={{
          padding: 36,
          border: '1px solid rgba(13, 148, 136, 0.35)',
          boxShadow: '0 28px 70px -22px rgba(13, 148, 136, 0.35), 0 1px 0 rgba(255,255,255,0.6) inset',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: 20, right: 20,
            padding: '4px 10px', borderRadius: 999,
            background: 'linear-gradient(135deg, #0D9488, #0EA5E9)',
            color: '#FFFFFF', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
            fontFamily: 'JetBrains Mono, monospace',
          }}>{t('mk.pricing.pro.tag')}</div>
          <div className="mk-eyebrow" style={{ color: 'var(--mk-brand-strong)', marginBottom: 10 }}>{t('mk.pricing.pro.label')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--mk-navy)' }}>{t('mk.pricing.pro.price')}</span>
            <span style={{ fontSize: 14, color: 'var(--mk-text-muted)', fontWeight: 500 }}>{t('mk.pricing.pro.unit')}</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--mk-text-secondary)', marginBottom: 22 }}>{t('mk.pricing.pro.sub')}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'grid', gap: 11 }}>
            {[t('mk.pricing.pro.f1'), t('mk.pricing.pro.f2'), t('mk.pricing.pro.f3'), t('mk.pricing.pro.f4'), t('mk.pricing.pro.f5')].map(f => (
              <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--mk-text)' }}>
                <CheckIcon />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link href={screenHref} className="mk-btn mk-btn-primary" style={{ width: '100%' }}>
            {t('mk.pricing.pro.cta')}
          </Link>
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────
function FAQ() {
  const { t } = useT()
  const [open, setOpen] = useState<number | null>(0)
  const qa: [string, string][] = [
    [t('mk.faq.q1'), t('mk.faq.a1')],
    [t('mk.faq.q2'), t('mk.faq.a2')],
    [t('mk.faq.q3'), t('mk.faq.a3')],
    [t('mk.faq.q4'), t('mk.faq.a4')],
    [t('mk.faq.q5'), t('mk.faq.a5')],
    [t('mk.faq.q6'), t('mk.faq.a6')],
  ]
  return (
    <section className="mk-section">
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="mk-eyebrow" style={{ marginBottom: 12 }}>{t('mk.faq.eyebrow')}</div>
        <h2 className="mk-h2">{t('mk.faq.title')}</h2>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', display: 'grid', gap: 12 }}>
        {qa.map(([q, a], i) => {
          const isOpen = open === i
          return (
            <div key={q} className="mk-card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                style={{
                  width: '100%', padding: '20px 24px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                  background: 'transparent', border: 0, cursor: 'pointer',
                  fontSize: 15, fontWeight: 700, color: 'var(--mk-navy)', textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span>{q}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: 999,
                  background: isOpen ? 'var(--mk-brand)' : 'var(--mk-surface-tint)',
                  color: isOpen ? '#FFFFFF' : 'var(--mk-text-secondary)',
                  fontSize: 14, fontWeight: 800, flexShrink: 0,
                  transition: 'all 0.2s',
                }}>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 24px 22px', fontSize: 13.5, color: 'var(--mk-text-secondary)', lineHeight: 1.7 }}>
                  {a}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Final CTA ───────────────────────────────────────────────────────
function FinalCTA({ screenHref }: { screenHref: string }) {
  const { t } = useT()
  return (
    <section className="mk-section" style={{ paddingTop: 32, paddingBottom: 96 }}>
      <div className="mk-final-cta-inner" style={{
        position: 'relative',
        padding: '64px 48px',
        borderRadius: 28,
        background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 50%, #115E59 100%)',
        color: '#FFFFFF',
        overflow: 'hidden',
        boxShadow: '0 40px 100px -30px rgba(13, 148, 136, 0.4)',
      }}>
        {/* Decorative circles */}
        <div aria-hidden style={{
          position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 70%)',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: -120, left: -60, width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.08), transparent 70%)',
        }} />

        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(1.75rem, 3vw, 2.4rem)',
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: '#FFFFFF',
            marginBottom: 14,
          }}>
            {t('mk.finalcta.title')}
          </h2>
          <p style={{ fontSize: 15.5, color: 'rgba(255, 255, 255, 0.85)', marginBottom: 28, lineHeight: 1.65 }}>
            {t('mk.finalcta.sub')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link href={screenHref} className="mk-btn mk-btn-lg" style={{
              background: '#FFFFFF',
              color: '#0F766E',
              fontWeight: 700,
            }}>
              {t('mk.finalcta.primary')}
            </Link>
            <a href="#pricing" className="mk-btn mk-btn-lg" style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.25)',
            }}>
              {t('mk.finalcta.secondary')}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ──────────────────────────────────────────────────────────
function Footer() {
  const { t } = useT()
  const col = (heading: string, links: { label: string; href: string }[]) => (
    <div>
      <div className="mk-eyebrow" style={{ color: 'var(--mk-text-muted)', marginBottom: 14 }}>{heading}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {links.map(l => (
          <li key={l.label}>
            <a href={l.href} style={{ fontSize: 13.5, color: 'var(--mk-text-secondary)', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--mk-navy)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--mk-text-secondary)' }}
            >{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <footer style={{ background: 'var(--mk-bg-alt)', borderTop: '1px solid var(--mk-border)', marginTop: 0 }}>
      <div className="mk-section" style={{ paddingTop: 64, paddingBottom: 40 }}>
        <div className="mk-grid-footer">
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--mk-navy)', letterSpacing: '-0.02em', marginBottom: 14 }}>Stayloop</div>
            <p style={{ fontSize: 13.5, color: 'var(--mk-text-secondary)', lineHeight: 1.65, maxWidth: 320, marginBottom: 16 }}>
              {t('mk.footer.tagline')}
            </p>
            <div className="mono" style={{ fontSize: 11, color: 'var(--mk-text-muted)' }}>
              {t('mk.footer.compliance')}
            </div>
          </div>

          {col(t('mk.footer.product'), [
            { label: t('mk.footer.screen'), href: '/screen' },
            { label: t('mk.footer.roadmap'), href: '#roadmap' },
            { label: t('mk.footer.pricing'), href: '#pricing' },
          ])}
          {col(t('mk.footer.company'), [
            { label: t('mk.footer.about'), href: '#' },
            { label: t('mk.footer.contact'), href: 'mailto:hello@stayloop.ai' },
            { label: t('mk.footer.status'), href: '#' },
          ])}
          {col(t('mk.footer.legal'), [
            { label: t('mk.footer.privacy'), href: '#' },
            { label: t('mk.footer.terms'), href: '#' },
            { label: t('mk.footer.security'), href: '#' },
          ])}
        </div>

        <div style={{ paddingTop: 28, borderTop: '1px solid var(--mk-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--mk-text-muted)' }}>{t('mk.footer.copy')}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--mk-text-faint)' }}>stayloop.ai</div>
        </div>
      </div>
    </footer>
  )
}

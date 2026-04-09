'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useT, LanguageToggle } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const { t } = useT()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      // Only count non-anonymous sessions as "signed in" for CTA routing.
      const user = data.session?.user
      const isReal = !!user && !(user as any).is_anonymous
      setSignedIn(isReal)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      const user = sess?.user
      const isReal = !!user && !(user as any).is_anonymous
      setSignedIn(isReal)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const screenHref = signedIn ? '/screen' : '/login?next=/screen'

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="nav-bar">
        <Link href="/" className="nav-brand">
          <div className="relative">
            <div className="nav-logo">S</div>
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 pulse-dot" style={{ border: '2px solid #07090F' }} />
          </div>
          <div>
            <div className="nav-title">Stayloop</div>
            <div className="nav-sub mono">v0.1 · Ontario</div>
          </div>
        </Link>
        <div className="nav-actions">
          <LanguageToggle />
          <Link href={screenHref} className="btn btn-primary btn-sm">{t('nav.getStarted')}</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-24 text-center fade-up">
        <div className="chip chip-accent mb-8 mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          {t('home.badge')}
        </div>

        <h1 className="h-display mb-6">
          {t('home.hero.line1')}<br />
          <span className="text-gradient">{t('home.hero.line2')}</span>
        </h1>

        <p className="text-lg max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {t('home.hero.sub')}
        </p>

        <div className="flex gap-3 justify-center flex-wrap">
          <Link href={screenHref} className="btn btn-primary btn-lg">
            {t('home.cta.primary')} →
          </Link>
          <a href="#features" className="btn btn-ghost btn-lg">
            {t('home.cta.secondary')}
          </a>
        </div>

        {/* Floating dashboard preview */}
        <div className="mt-20 max-w-4xl mx-auto fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="card-hero" style={{ padding: 0, textAlign: 'left' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
              <div className="mono" style={{ marginLeft: 12, fontSize: 11, color: 'var(--text-muted)' }}>stayloop.ai/dashboard</div>
            </div>
            <div style={{ padding: 22 }}>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { l: t('home.preview.score'), v: '87', sub: t('home.preview.score.sub'), col: '#34D399' },
                  { l: t('home.preview.ltb'), v: '0', sub: t('home.preview.ltb.sub'), col: '#22D3EE' },
                  { l: t('home.preview.ratio'), v: '3.2×', sub: t('home.preview.ratio.sub'), col: '#C4B5FD' },
                ].map(s => (
                  <div key={s.l} style={{ padding: '16px', borderRadius: 12, background: 'rgba(148, 163, 184, 0.04)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{s.l}</div>
                    <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: s.col, letterSpacing: '-0.02em' }}>{s.v}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: 'rgba(148, 163, 184, 0.04)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{t('home.preview.analysisTitle')}</div>
                <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.7, margin: 0 }}>
                  {t('home.preview.analysis')}
                  <span style={{ color: '#34D399', fontWeight: 600 }}>{t('home.preview.recommend')}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dedicated free-screen entry */}
      <section id="free-screen" className="max-w-5xl mx-auto px-6 pt-4 pb-20 fade-up">
        <Link
          href={screenHref}
          className="card-hero"
          style={{
            display: 'block',
            padding: 0,
            textDecoration: 'none',
            color: 'inherit',
            overflow: 'hidden',
            border: '1px solid var(--border-accent)',
            boxShadow: '0 20px 60px -20px rgba(56, 189, 248, 0.25)',
          }}
        >
          <div style={{ padding: '28px 32px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="chip chip-accent mono" style={{ margin: 0 }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
              {t('home.screenEntry.tag')}
            </div>
            <div className="mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-faint)' }}>
              {t('home.screenEntry.notice')}
            </div>
          </div>

          <div style={{ padding: '32px' }}>
            <h2 className="h-hero" style={{ marginBottom: 12 }}>
              <span className="text-gradient">{t('home.screenEntry.title')}</span>
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 720, marginBottom: 28 }}>
              {t('home.screenEntry.subtitle')}
            </p>

            <div className="grid md:grid-cols-2 gap-4" style={{ marginBottom: 28 }}>
              {[
                { n: '01', t: t('home.screenEntry.b1.title'), d: t('home.screenEntry.b1.desc'), col: '#34D399' },
                { n: '02', t: t('home.screenEntry.b2.title'), d: t('home.screenEntry.b2.desc'), col: '#22D3EE' },
                { n: '03', t: t('home.screenEntry.b3.title'), d: t('home.screenEntry.b3.desc'), col: '#A78BFA' },
                { n: '04', t: t('home.screenEntry.b4.title'), d: t('home.screenEntry.b4.desc'), col: '#F472B6' },
              ].map(b => (
                <div key={b.n} style={{ padding: 16, borderRadius: 12, background: 'var(--bg-card-raised)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 10, color: b.col, letterSpacing: '0.08em', fontWeight: 700 }}>{b.n}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{b.t}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{b.d}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <span className="btn btn-primary btn-lg" style={{ pointerEvents: 'none' }}>
                {signedIn === false ? t('home.screenEntry.ctaLoggedOut') : t('home.screenEntry.cta')}
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                $0 · Ontario · CanLII · Claude Sonnet 4.5
              </span>
            </div>
          </div>
        </Link>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="chip chip-accent mono mb-4">{t('home.features.tag')}</div>
          <h2 className="h-hero">{t('home.features.title')}</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            { tag: '01', title: t('home.features.1.title'), desc: t('home.features.1.desc'), icon: '🔍', color: '#22D3EE' },
            { tag: '02', title: t('home.features.2.title'), desc: t('home.features.2.desc'), icon: '⚖️', color: '#A78BFA' },
            { tag: '03', title: t('home.features.3.title'), desc: t('home.features.3.desc'), icon: '📊', color: '#34D399' },
          ].map(f => (
            <div key={f.tag} className="card glow-border" style={{ padding: 28 }}>
              <div style={{ display: 'inline-flex', width: 48, height: 48, borderRadius: 12, background: `${f.color}14`, border: `1px solid ${f.color}33`, alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>
                {f.icon}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6, letterSpacing: '0.08em' }}>{f.tag}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>{f.title}</h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="chip chip-pro mono mb-4">{t('home.workflow.tag')}</div>
          <h2 className="h-hero">{t('home.workflow.title')}</h2>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          {[
            { n: '01', t: t('home.workflow.1.t'), d: t('home.workflow.1.d') },
            { n: '02', t: t('home.workflow.2.t'), d: t('home.workflow.2.d') },
            { n: '03', t: t('home.workflow.3.t'), d: t('home.workflow.3.d') },
            { n: '04', t: t('home.workflow.4.t'), d: t('home.workflow.4.d') },
          ].map((s, i) => (
            <div key={s.n} className="relative">
              <div className="card" style={{ padding: 22, height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(20, 184, 166, 0.12)', border: '1px solid rgba(20, 184, 166, 0.28)', color: '#5EEAD4', fontSize: 11, fontWeight: 700, marginBottom: 14 }} className="mono">{s.n}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.01em' }}>{s.t}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.d}</div>
              </div>
              {i < 3 && (
                <div className="hidden md:block" style={{ position: 'absolute', top: '50%', right: -10, width: 18, height: 1, background: 'linear-gradient(90deg, rgba(20, 184, 166, 0.4), transparent)' }} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="chip mono mb-4" style={{ background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34D399' }}>{t('home.pricing.tag')}</div>
          <h2 className="h-hero">{t('home.pricing.title')}</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="card" style={{ padding: 32 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t('home.pricing.free.label')}</div>
            <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.03em' }}>$0<span style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 500 }}>/mo</span></div>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 24 }}>{t('home.pricing.free.sub')}</div>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 24 }}>
              {[t('home.pricing.free.f1'), t('home.pricing.free.f2'), t('home.pricing.free.f3')].map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 10, alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 999, background: 'rgba(20, 184, 166, 0.14)', color: '#5EEAD4', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link href={screenHref} className="btn btn-ghost" style={{ width: '100%' }}>{t('home.pricing.free.cta')}</Link>
          </div>

          <div className="card-hero" style={{ padding: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="mono" style={{ fontSize: 11, color: '#5EEAD4', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{t('home.pricing.pro.label')}</div>
              <div className="chip chip-accent mono">{t('home.pricing.pro.popular')}</div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 4, letterSpacing: '-0.03em' }}>$29<span style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 500 }}>/mo</span></div>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 24 }}>{t('home.pricing.pro.sub')}</div>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 24 }}>
              {[t('home.pricing.pro.f1'), t('home.pricing.pro.f2'), t('home.pricing.pro.f3'), t('home.pricing.pro.f4')].map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 10, alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 999, background: 'rgba(20, 184, 166, 0.18)', color: '#5EEAD4', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link href={screenHref} className="btn btn-primary" style={{ width: '100%' }}>{t('home.pricing.pro.cta')}</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 80 }}>
        <div className="max-w-7xl mx-auto px-6 py-10" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)' }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800 }}>S</div>
            <span>{t('home.footer.copy')}</span>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>stayloop.ai</div>
        </div>
      </footer>
    </main>
  )
}

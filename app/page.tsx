'use client'
import Link from 'next/link'
import { useT, LanguageToggle } from '@/lib/i18n'

export default function Home() {
  const { t } = useT()
  return (
    <main className="min-h-screen text-slate-100">
      {/* Nav */}
      <nav className="sticky top-0 z-20 backdrop-blur-xl bg-[#060814]/60 border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/30">S</div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 pulse-dot border-2 border-[#060814]" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight">Stayloop</div>
              <div className="text-[10px] mono text-slate-500 -mt-0.5">v0.1 · ON</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Link href="/screen" className="btn-primary">{t('nav.getStarted')}</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass mono text-xs text-slate-300 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          {t('home.badge')}
        </div>

        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
          {t('home.hero.line1')}<br />
          <span className="text-gradient">{t('home.hero.line2')}</span>
        </h1>

        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t('home.hero.sub')}
        </p>

        <div className="flex gap-3 justify-center">
          <Link href="/screen" className="btn-primary text-base px-7 py-3.5">
            {t('home.cta.primary')}
          </Link>
          <a href="#features" className="btn-ghost text-base px-7 py-3.5">
            {t('home.cta.secondary')}
          </a>
        </div>

        {/* Floating dashboard preview */}
        <div className="mt-20 max-w-4xl mx-auto">
          <div className="glass rounded-2xl p-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 pointer-events-none" />
            <div className="relative bg-[#0a0e1a]/80 rounded-xl p-6 text-left">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                <div className="ml-3 mono text-[11px] text-slate-500">stayloop.ai/dashboard</div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { l: t('home.preview.score'), v: '87', sub: t('home.preview.score.sub'), col: 'text-emerald-400' },
                  { l: t('home.preview.ltb'), v: '0', sub: t('home.preview.ltb.sub'), col: 'text-cyan-400' },
                  { l: t('home.preview.ratio'), v: '3.2×', sub: t('home.preview.ratio.sub'), col: 'text-violet-400' },
                ].map(s => (
                  <div key={s.l} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{s.l}</div>
                    <div className={`text-3xl font-bold mono ${s.col}`}>{s.v}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{t('home.preview.analysisTitle')}</div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {t('home.preview.analysis')}
                  <span className="text-emerald-400">{t('home.preview.recommend')}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="mono text-xs text-cyan-400 mb-3">{t('home.features.tag')}</div>
          <h2 className="text-4xl font-bold tracking-tight">{t('home.features.title')}</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              tag: '01',
              title: t('home.features.1.title'),
              desc: t('home.features.1.desc'),
              accent: 'from-cyan-500/20 to-cyan-500/0',
            },
            {
              tag: '02',
              title: t('home.features.2.title'),
              desc: t('home.features.2.desc'),
              accent: 'from-violet-500/20 to-violet-500/0',
            },
            {
              tag: '03',
              title: t('home.features.3.title'),
              desc: t('home.features.3.desc'),
              accent: 'from-emerald-500/20 to-emerald-500/0',
            },
          ].map(f => (
            <div key={f.tag} className="glass rounded-2xl p-6 group hover:border-white/20 transition-colors">
              <div className={`inline-flex w-12 h-12 rounded-xl bg-gradient-to-br ${f.accent} border border-white/10 items-center justify-center mono text-xs text-slate-300 mb-4`}>
                {f.tag}
              </div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="mono text-xs text-violet-400 mb-3">{t('home.workflow.tag')}</div>
          <h2 className="text-4xl font-bold tracking-tight">{t('home.workflow.title')}</h2>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {[
            { n: '01', t: t('home.workflow.1.t'), d: t('home.workflow.1.d') },
            { n: '02', t: t('home.workflow.2.t'), d: t('home.workflow.2.d') },
            { n: '03', t: t('home.workflow.3.t'), d: t('home.workflow.3.d') },
            { n: '04', t: t('home.workflow.4.t'), d: t('home.workflow.4.d') },
          ].map((s, i) => (
            <div key={s.n} className="relative">
              <div className="glass rounded-2xl p-5">
                <div className="mono text-xs text-cyan-400 mb-2">{s.n}</div>
                <div className="font-semibold mb-1">{s.t}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{s.d}</div>
              </div>
              {i < 3 && (
                <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-cyan-500/40 to-transparent" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="mono text-xs text-emerald-400 mb-3">{t('home.pricing.tag')}</div>
          <h2 className="text-4xl font-bold tracking-tight">{t('home.pricing.title')}</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-8">
            <div className="mono text-xs text-slate-500 mb-2">{t('home.pricing.free.label')}</div>
            <div className="text-4xl font-bold mb-1">$0<span className="text-base text-slate-500 font-normal">/mo</span></div>
            <div className="text-sm text-slate-400 mb-6">{t('home.pricing.free.sub')}</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2"><span className="text-cyan-400">✓</span> {t('home.pricing.free.f1')}</li>
              <li className="flex gap-2"><span className="text-cyan-400">✓</span> {t('home.pricing.free.f2')}</li>
              <li className="flex gap-2"><span className="text-cyan-400">✓</span> {t('home.pricing.free.f3')}</li>
            </ul>
            <Link href="/screen" className="btn-ghost w-full inline-block text-center">{t('home.pricing.free.cta')}</Link>
          </div>

          <div className="glass rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="mono text-xs text-cyan-400">{t('home.pricing.pro.label')}</div>
                <div className="px-2 py-0.5 rounded-full text-[10px] mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">{t('home.pricing.pro.popular')}</div>
              </div>
              <div className="text-4xl font-bold mb-1">$29<span className="text-base text-slate-500 font-normal">/mo</span></div>
              <div className="text-sm text-slate-400 mb-6">{t('home.pricing.pro.sub')}</div>
              <ul className="space-y-2 text-sm text-slate-200 mb-6">
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> {t('home.pricing.pro.f1')}</li>
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> {t('home.pricing.pro.f2')}</li>
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> {t('home.pricing.pro.f3')}</li>
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> {t('home.pricing.pro.f4')}</li>
              </ul>
              <Link href="/screen" className="btn-primary w-full inline-block text-center">{t('home.pricing.pro.cta')}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-24">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold">S</div>
            <span>{t('home.footer.copy')}</span>
          </div>
          <div className="mono text-[11px] text-slate-600">stayloop.ai</div>
        </div>
      </footer>
    </main>
  )
}

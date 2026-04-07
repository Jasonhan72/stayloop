import Link from 'next/link'

export default function Home() {
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
            <Link href="/login" className="btn-ghost hidden sm:inline-block">Sign in</Link>
            <Link href="/login" className="btn-primary">Get started →</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass mono text-xs text-slate-300 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          Built for Ontario landlords · PIPEDA compliant
        </div>

        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
          Tenant screening,<br />
          <span className="text-gradient">re-engineered for AI.</span>
        </h1>

        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Stayloop scores every rental application in seconds — pulling income, employment, rental history, and Ontario LTB records into one clear decision.
        </p>

        <div className="flex gap-3 justify-center">
          <Link href="/login" className="btn-primary text-base px-7 py-3.5">
            Start screening free
          </Link>
          <a href="#features" className="btn-ghost text-base px-7 py-3.5">
            See how it works
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
                  { l: 'AI Score', v: '87', sub: '+ low risk', col: 'text-emerald-400' },
                  { l: 'LTB Records', v: '0', sub: 'clear', col: 'text-cyan-400' },
                  { l: 'Income / Rent', v: '3.2×', sub: 'healthy', col: 'text-violet-400' },
                ].map(s => (
                  <div key={s.l} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{s.l}</div>
                    <div className={`text-3xl font-bold mono ${s.col}`}>{s.v}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Claude analysis</div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Strong income-to-rent ratio at 3.2×. Stable two-year employment history, positive prior landlord reference, and zero LTB records.{' '}
                  <span className="text-emerald-400">Recommended for approval.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="mono text-xs text-cyan-400 mb-3">// FEATURES</div>
          <h2 className="text-4xl font-bold tracking-tight">Built on a real screening stack</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              tag: '01',
              title: 'AI risk scoring',
              desc: 'Claude analyzes income, employment, rental history, LTB records and references. Returns a 0–100 score with reasoning per category.',
              accent: 'from-cyan-500/20 to-cyan-500/0',
            },
            {
              tag: '02',
              title: 'LTB record search',
              desc: 'Automatic search of Ontario Landlord and Tenant Board records to surface eviction history and prior disputes.',
              accent: 'from-violet-500/20 to-violet-500/0',
            },
            {
              tag: '03',
              title: 'PIPEDA compliant',
              desc: 'Built-in consent forms, data minimization, and 90-day retention. Aligned with the Ontario Human Rights Code from day one.',
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
          <div className="mono text-xs text-violet-400 mb-3">// WORKFLOW</div>
          <h2 className="text-4xl font-bold tracking-tight">From listing to decision in minutes</h2>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {[
            { n: '01', t: 'Create listing', d: 'Add an address and rent. Get a unique application link.' },
            { n: '02', t: 'Share link', d: 'Send the link to applicants — works on any device.' },
            { n: '03', t: 'Run AI score', d: 'One click triggers Claude + LTB lookup in seconds.' },
            { n: '04', t: 'Decide', d: 'Approve or decline with full audit trail and reasoning.' },
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
          <div className="mono text-xs text-emerald-400 mb-3">// PRICING</div>
          <h2 className="text-4xl font-bold tracking-tight">Simple pricing for landlords</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-8">
            <div className="mono text-xs text-slate-500 mb-2">FREE</div>
            <div className="text-4xl font-bold mb-1">$0<span className="text-base text-slate-500 font-normal">/mo</span></div>
            <div className="text-sm text-slate-400 mb-6">Try Stayloop on your next vacancy.</div>
            <ul className="space-y-2 text-sm text-slate-300 mb-6">
              <li className="flex gap-2"><span className="text-cyan-400">✓</span> 1 active listing</li>
              <li className="flex gap-2"><span className="text-cyan-400">✓</span> 5 AI screenings / month</li>
              <li className="flex gap-2"><span className="text-cyan-400">✓</span> LTB record search</li>
            </ul>
            <Link href="/login" className="btn-ghost w-full inline-block text-center">Start free</Link>
          </div>

          <div className="glass rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className="mono text-xs text-cyan-400">PRO</div>
                <div className="px-2 py-0.5 rounded-full text-[10px] mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">POPULAR</div>
              </div>
              <div className="text-4xl font-bold mb-1">$29<span className="text-base text-slate-500 font-normal">/mo</span></div>
              <div className="text-sm text-slate-400 mb-6">For landlords with multiple units.</div>
              <ul className="space-y-2 text-sm text-slate-200 mb-6">
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> Unlimited listings</li>
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> Unlimited AI screenings</li>
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> LTB + court record search</li>
                <li className="flex gap-2"><span className="text-cyan-400">✓</span> Priority support</li>
              </ul>
              <Link href="/login" className="btn-primary w-full inline-block text-center">Upgrade to Pro</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-24">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold">S</div>
            <span>© 2026 Stayloop · Made for Ontario landlords</span>
          </div>
          <div className="mono text-[11px] text-slate-600">stayloop.ai</div>
        </div>
      </footer>
    </main>
  )
}

'use client'

// V5.3 role landing template — one rich, role-themed page used by
// /tenant (Luna), /landlord (Logic), /agent (Brief). Matches the V5.3
// design language of the homepage.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export type RoleLandingConfig = {
  role: 'tenant' | 'landlord' | 'agent'
  eyebrow: string
  agentName: string
  color: string
  h1: React.ReactNode
  sub: string
  primaryCta: { label: string; href: string }
  secondaryCta: { label: string; href: string }
  agentPoints: string[]
  journey: { h: string; b: string }[]
  scenario: { name: string; meta: string; quote: string; before: string; after: string; delta: string }
  stats: { k: string; v: string }[]
}

export default function RoleLanding({ cfg }: { cfg: RoleLandingConfig }) {
  const c = cfg.color
  return (
    <div style={{ background: '#FAF7EE', color: '#171717' }}>
      <Header variant="transparent" />

      {/* HERO */}
      <section style={{ background: `linear-gradient(180deg,#F2EEE5 0%, ${c}14 100%)` }}>
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-16 pt-16 sm:px-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pt-20">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: c }}>
              {cfg.eyebrow}
            </div>
            <h1 className="mt-4 text-[36px] font-extrabold leading-[1.08] tracking-tight sm:text-[46px]">{cfg.h1}</h1>
            <p className="mt-5 max-w-[540px] text-[16px] leading-relaxed text-body-2">{cfg.sub}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={cfg.primaryCta.href}
                className="inline-flex items-center justify-center rounded-[10px] px-6 py-[13px] text-[15px] font-semibold text-white"
                style={{ background: c }}
              >
                {cfg.primaryCta.label}
              </Link>
              <Link href={cfg.secondaryCta.href} className="text-[14px] font-semibold underline-offset-4 hover:underline" style={{ color: c }}>
                {cfg.secondaryCta.label}
              </Link>
            </div>
          </div>

          {/* agent card */}
          <div className="sl-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <span className={`orb ${cfg.role} h-12 w-12`} />
              <div>
                <div className="text-[18px] font-extrabold tracking-tight">{cfg.agentName}</div>
                <div className="font-mono text-[10.5px] uppercase tracking-eyebrow text-body-3">你的专属 AI 助手</div>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5 border-t border-line-divider pt-4 text-[13.5px]">
              {cfg.agentPoints.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <span className="mt-[2px] font-bold" style={{ color: c }}>✓</span>
                  <span className="text-body-2">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-y border-line-divider bg-white">
        <div className="mx-auto grid max-w-[1240px] grid-cols-3 divide-x divide-line-divider px-5 sm:px-7 lg:px-12">
          {cfg.stats.map((s) => (
            <div key={s.k} className="px-4 py-6 text-center">
              <div className="text-[24px] font-extrabold tracking-tight sm:text-[28px]" style={{ color: c }}>{s.v}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">{s.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* JOURNEY */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: c }}>怎么用 · 从头到尾</div>
          <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            {cfg.agentName} 陪你走完每一步。
          </h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cfg.journey.map((j, i) => (
              <div key={j.h} className="sl-card p-5">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow" style={{ color: c }}>STEP 0{i + 1}</div>
                <h4 className="mt-2 text-[14.5px] font-bold leading-snug">{j.h}</h4>
                <p className="mt-1.5 text-[12px] leading-relaxed text-body-3">{j.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCENARIO */}
      <section style={{ background: '#F2EEE5' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: c }}>真实场景</div>
          <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]">一段被 AI 改写的租住。</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="sl-card p-6">
              <div className="text-[20px] font-bold">{cfg.scenario.name}</div>
              <div className="font-mono text-[11.5px] text-body-3">{cfg.scenario.meta}</div>
              <p className="mt-4 text-[15px] font-semibold italic leading-relaxed text-body">“{cfg.scenario.quote}”</p>
              <div className="mt-4 inline-flex rounded-md px-2.5 py-1 font-mono text-[12px] font-bold" style={{ background: `${c}14`, color: c }}>
                {cfg.scenario.delta}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sl-card p-5">
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow text-body-3">之前</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{cfg.scenario.before}</p>
              </div>
              <div className="sl-card p-5" style={{ borderColor: `${c}44` }}>
                <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow" style={{ color: c }}>之后</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-body-2">{cfg.scenario.after}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-20 text-center sm:px-7 lg:px-12">
          <h2 className="mx-auto max-w-[640px] text-[30px] font-extrabold leading-tight tracking-tight sm:text-[38px]">
            现在就让 {cfg.agentName} 替你开始。
          </h2>
          <div className="mt-7">
            <Link
              href={cfg.primaryCta.href}
              className="inline-flex items-center justify-center rounded-[10px] px-7 py-[14px] text-[15px] font-semibold text-white"
              style={{ background: c }}
            >
              {cfg.primaryCta.label}
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

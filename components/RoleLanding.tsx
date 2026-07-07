'use client'

// V5.3 role landing template — one rich, role-themed page used by
// /tenant (Luna), /landlord (Logic), /agent (Brief). AI-native framing:
// the hero shows the agent WORKING (dark console card with a live-feeling
// conversation + background task), not a feature checklist.
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { useT } from '@/lib/i18n'
import { useOnboarded } from '@/lib/useOnboarding'

type Bi = { zh: string; en: string }

export type RoleLandingConfig = {
  role: 'tenant' | 'landlord' | 'agent'
  eyebrow: string
  agentName: string
  color: string
  h1: { zh: React.ReactNode; en: React.ReactNode }
  sub: Bi
  // href = the anonymous / not-yet-onboarded destination (onboarding).
  // authedHref = where an already-onboarded user of THIS role should go
  // instead (e.g. straight to the publish-listing flow), so they skip
  // re-onboarding. Falls back to href when omitted.
  primaryCta: { label: Bi; href: string; authedHref?: string }
  secondaryCta: { label: Bi; href: string }
  agentPoints: Bi[]
  // Hero console demo — one exchange that shows the agent actually working.
  demo: { ask: Bi; reply: Bi; task: Bi; note: Bi }
  journey: { h: Bi; b: Bi }[]
  scenario: { name: string; meta: Bi; quote: Bi; before: Bi; after: Bi; delta: Bi }
  stats: { k: Bi; v: Bi }[]
  ctaNote?: Bi
}

export default function RoleLanding({ cfg }: { cfg: RoleLandingConfig }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const c = cfg.color
  const { onboarded } = useOnboarded(cfg.role)
  const primaryHref = onboarded && cfg.primaryCta.authedHref ? cfg.primaryCta.authedHref : cfg.primaryCta.href
  return (
    <div className="bg-surface-nav text-body">
      <Header variant="transparent" />

      {/* HERO */}
      <section style={{ background: `linear-gradient(180deg,#F2EEE5 0%, ${c}14 100%)` }}>
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-16 pt-16 sm:px-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pt-20">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: c }}>
              {cfg.eyebrow}
            </div>
            <h1 className="mt-4 text-[28px] font-extrabold leading-[1.08] tracking-tight sm:text-[46px]">{cfg.h1[lang]}</h1>
            <p className="mt-5 max-w-[540px] text-[16px] leading-relaxed text-body-2">{cfg.sub[lang]}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className="inline-flex items-center justify-center rounded-[10px] px-6 py-[13px] text-[15px] font-semibold text-white transition active:translate-y-px"
                style={{ background: c, boxShadow: `0 8px 22px -10px ${c}88` }}
              >
                {cfg.primaryCta.label[lang]}
              </Link>
              <Link href={cfg.secondaryCta.href} className="text-[14px] font-semibold underline-offset-4 hover:underline" style={{ color: c }}>
                {cfg.secondaryCta.label[lang]}
              </Link>
            </div>
            {cfg.ctaNote && (
              <p className="mt-4 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">{cfg.ctaNote[lang]}</p>
            )}
          </div>

          {/* agent console — dark, alive, working */}
          <div className="min-w-0 rounded-2xl p-5 text-[13px] shadow-card" style={{ background: '#0E1320', color: '#E5E7EB' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className={`orb ${cfg.role} h-9 w-9`} />
                <div>
                  <div className="text-[14px] font-bold text-white">{cfg.agentName}</div>
                  <div className="font-mono text-[9.5px] uppercase tracking-eyebrow" style={{ color: '#94A3B8' }}>
                    {zh ? '你的专属 AI' : 'Your personal AI'}
                  </div>
                </div>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-[10.5px]" style={{ color: '#34D399' }}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#34D399' }} />
                {zh ? '在线 · 为你工作中' : 'Online · working for you'}
              </span>
            </div>
            <div className="mt-4 flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 leading-relaxed text-white" style={{ background: c }}>
                {cfg.demo.ask[lang]}
              </div>
            </div>
            <div className="mt-3 max-w-[92%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 leading-relaxed" style={{ background: '#1B2230' }}>
              {cfg.demo.reply[lang]}
            </div>
            <div className="mt-3 rounded-xl p-3" style={{ background: '#11192563', border: '1px solid #233047' }}>
              <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: '#34D399' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} />
                {zh ? '已接手 · 后台持续执行' : 'On it · running in the background'}
              </div>
              <div className="mt-1.5 font-mono text-[10.5px]" style={{ color: '#94A3B8' }}>{cfg.demo.task[lang]}</div>
              <div className="mt-1 text-[11.5px]" style={{ color: '#94A3B8' }}>{cfg.demo.note[lang]}</div>
            </div>
            <ul className="mt-4 grid gap-x-4 gap-y-1.5 border-t pt-3.5 text-[11.5px] sm:grid-cols-2" style={{ borderColor: '#233047', color: '#94A3B8' }}>
              {cfg.agentPoints.map((p) => (
                <li key={p.en} className="flex items-start gap-1.5">
                  <span className="mt-[1px] font-bold" style={{ color: '#34D399' }}>✓</span>
                  <span>{p[lang]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* PROMISES */}
      <section className="border-y border-line-divider bg-white">
        <div className="mx-auto grid max-w-[1240px] grid-cols-3 divide-x divide-line-divider px-5 sm:px-7 lg:px-12">
          {cfg.stats.map((s) => (
            <div key={s.k.en} className="px-4 py-6 text-center">
              <div className="text-[19px] font-extrabold tracking-tight sm:text-[26px]" style={{ color: c }}>{s.v[lang]}</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">{s.k[lang]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* JOURNEY */}
      <section>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: c }}>
            {lang === 'zh' ? '怎么用 · 从头到尾' : 'HOW IT WORKS · END TO END'}
          </div>
          <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            {lang === 'zh'
              ? <>{cfg.agentName} 陪你走完每一步。</>
              : <>{cfg.agentName} walks you through every step.</>}
          </h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cfg.journey.map((j, i) => (
              <div key={j.h.en} className="sl-card p-5 transition hover:shadow-card">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-[12.5px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${c}CC, ${c})` }}
                >
                  {i + 1}
                </div>
                <h4 className="mt-3 text-[14.5px] font-bold leading-snug">{j.h[lang]}</h4>
                <p className="mt-1.5 text-[12px] leading-relaxed text-body-3">{j.b[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCENARIO */}
      <section style={{ background: '#F2EEE5' }}>
        <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-7 lg:px-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-eyebrowLg" style={{ color: c }}>
            {lang === 'zh' ? '真实场景' : 'REAL SCENARIO'}
          </div>
          <h2 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
            {lang === 'zh' ? '一段被 AI 改写的租住。' : 'A tenancy rewritten by AI.'}
          </h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="sl-card p-6">
              <div className="text-[20px] font-bold">{cfg.scenario.name}</div>
              <div className="font-mono text-[11.5px] text-body-3">{cfg.scenario.meta[lang]}</div>
              <p className="mt-4 text-[15px] font-semibold italic leading-relaxed text-body">“{cfg.scenario.quote[lang]}”</p>
              <div className="mt-4 inline-flex rounded-md px-2.5 py-1 font-mono text-[12px] font-bold" style={{ background: `${c}14`, color: c }}>
                {cfg.scenario.delta[lang]}
              </div>
            </div>
            {/* before → after as one timeline card, not two half-empty twins */}
            <div className="sl-card p-6">
              <div className="grid grid-cols-[14px_1fr] gap-x-4">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full border-2 border-white" style={{ background: '#B45309', boxShadow: '0 0 0 1px #B4530944' }} />
                  <span className="w-[2px] flex-1" style={{ background: `linear-gradient(180deg,#B4530955, ${c})` }} />
                  <span className="mb-1.5 h-3 w-3 flex-shrink-0 rounded-full border-2 border-white" style={{ background: c, boxShadow: `0 0 0 1px ${c}44` }} />
                </div>
                <div className="space-y-6">
                  <div>
                    <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow" style={{ color: '#B45309' }}>
                      {lang === 'zh' ? '之前' : 'BEFORE'}
                    </div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-body-2">{cfg.scenario.before[lang]}</p>
                  </div>
                  <div>
                    <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrow" style={{ color: c }}>
                      {lang === 'zh' ? `之后 · ${cfg.agentName} 接手` : `AFTER · with ${cfg.agentName}`}
                    </div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-body-2">{cfg.scenario.after[lang]}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-20 text-center sm:px-7 lg:px-12">
          <h2 className="mx-auto max-w-[640px] text-[30px] font-extrabold leading-tight tracking-tight sm:text-[38px]">
            {lang === 'zh'
              ? <>现在就让 {cfg.agentName} 替你开始。</>
              : <>Let {cfg.agentName} start for you now.</>}
          </h2>
          <div className="mt-7">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-[10px] px-7 py-[14px] text-[15px] font-semibold text-white transition active:translate-y-px"
              style={{ background: c, boxShadow: `0 8px 22px -10px ${c}88` }}
            >
              {cfg.primaryCta.label[lang]}
            </Link>
          </div>
          {cfg.ctaNote && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-eyebrow text-body-3">{cfg.ctaNote[lang]}</p>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}

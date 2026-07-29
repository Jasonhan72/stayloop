'use client'

// V8 role landing template — one rich, role-themed page used by
// /tenant (Luna), /landlord (Logic), /agent (Brief). AI-native framing:
// the hero shows the agent WORKING (dark console card with a live-feeling
// conversation + background task), not a feature checklist.
//
// Visual layer aligned to design/v8-homepage.html (v8 design language):
// warm-paper surfaces (#FDFBF6 / #F6F3EA, hairlines #E5E1D4/#EEEAE0),
// brand purple as the only large accent (role colors stay button/badge-level),
// 16px cards + full-radius pills, purple-tinted shadows rgba(76,29,149,.2x),
// editorial ghost numerals, 96–112px section rhythm, .rv/.on scroll reveal.
import { useEffect } from 'react'
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
  // Storyboard strip (3 beats from the shot scripts). `file` is the final
  // persona still under /public/personas/ — until it exists the <img>
  // onError-falls back to `fallback` stock. See design/persona-images.md.
  story?: { file: string; fallback: string; label: Bi; text: Bi }[]
  stats: { k: Bi; v: Bi }[]
  ctaNote?: Bi
  // Optional value band ("what your passport does" etc.) — restrained
  // self-referential list rendered between JOURNEY and SCENARIO.
  valueBand?: {
    eyebrow: Bi
    h2: Bi
    items: { icon: string; h: Bi; b: Bi }[]
    cta?: { label: Bi; href: string }
  }
}

/* v8 token layer — scoped to .v8r so it can't leak into Header/Footer */
const V8_CSS = `
  .v8r { background: #FDFBF6; }
  .v8r .rv { opacity: 0; transform: translateY(20px); transition: opacity .65s ease, transform .65s ease; }
  .v8r .rv.on { opacity: 1; transform: none; }
  .v8r .d1 { transition-delay: .08s; } .v8r .d2 { transition-delay: .16s; }
  .v8r .d3 { transition-delay: .24s; } .v8r .d4 { transition-delay: .32s; }
  @media (prefers-reduced-motion: reduce) { .v8r .rv { opacity: 1; transform: none; transition: none; } }

  .v8r .v8-card { background: #fff; border: 1px solid #E5E1D4; border-radius: 16px;
    box-shadow: 0 1px 2px rgba(24,24,27,.04), 0 16px 40px -24px rgba(76,29,149,.12); }
  .v8r .v8-eyebrow { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; font-weight: 700; }
  .v8r .v8-tag { display: inline-flex; align-items: center; gap: 9px; font-size: 12px;
    letter-spacing: .15em; text-transform: uppercase; font-weight: 700; }
  .v8r .v8-tag::before { content: ""; width: 24px; height: 1.5px; background: currentColor; }
  .v8r .gn { position: absolute; top: 6px; right: 8px; font-size: 88px; font-weight: 800; line-height: 1;
    color: #18181B; opacity: .045; letter-spacing: -.04em; pointer-events: none; user-select: none; }

  .v8r .v8-hero { position: relative; overflow: hidden;
    background: linear-gradient(180deg, #FAF7EE 0%, #FDFBF6 40%); }
  .v8r .v8-atmo { position: absolute; inset: 0; pointer-events: none; }
  .v8r .v8-atmo::before { content: ""; position: absolute; top: -220px; right: -180px; width: 760px; height: 760px;
    background: radial-gradient(closest-side, rgba(124,58,237,.10), transparent 68%); }
  .v8r .v8-atmo::after { content: ""; position: absolute; bottom: -260px; left: -200px; width: 640px; height: 640px;
    background: radial-gradient(closest-side, rgba(59,130,246,.06), transparent 70%); }
  .v8r .v8-grid-tex { position: absolute; inset: 0; pointer-events: none;
    background-image: linear-gradient(rgba(24,24,27,.028) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(24,24,27,.028) 1px, transparent 1px);
    background-size: 56px 56px;
    -webkit-mask-image: radial-gradient(ellipse 75% 65% at 50% 0%, #000 30%, transparent 75%);
            mask-image: radial-gradient(ellipse 75% 65% at 50% 0%, #000 30%, transparent 75%); }

  .v8r .v8-dark { position: relative; overflow: hidden; background: #131316; }
  .v8r .v8-dark::before { content: ""; position: absolute; top: -200px; left: 50%; transform: translateX(-50%);
    width: 900px; height: 480px; background: radial-gradient(closest-side, rgba(124,58,237,.16), transparent 70%); }
`

export default function RoleLanding({ cfg }: { cfg: RoleLandingConfig }) {
  const { lang } = useT()
  const zh = lang === 'zh'
  const c = cfg.color
  const { onboarded } = useOnboarded(cfg.role)
  const primaryHref = onboarded && cfg.primaryCta.authedHref ? cfg.primaryCta.authedHref : cfg.primaryCta.href

  // Scroll reveal — v8 blueprint behavior: IO adds .on at threshold .12;
  // reduced motion (handled in CSS) and missing IO show everything at once.
  // Instant jumps can leave IO untriggered — catch up on scroll/load.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.v8r .rv'))
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('on'))
      return
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    const catchUp = () =>
      els.forEach((el) => {
        if (!el.classList.contains('on') && el.getBoundingClientRect().top < window.innerHeight) el.classList.add('on')
      })
    window.addEventListener('scroll', catchUp, { passive: true })
    window.addEventListener('load', catchUp)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', catchUp)
      window.removeEventListener('load', catchUp)
    }
  }, [])

  return (
    <div className="v8r text-body">
      <style dangerouslySetInnerHTML={{ __html: V8_CSS }} />
      <Header variant="transparent" />

      {/* HERO */}
      <section className="v8-hero">
        <div className="v8-atmo" aria-hidden />
        <div className="v8-grid-tex" aria-hidden />
        <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-16">
          <div className="min-w-0">
            <div className="v8-tag" style={{ color: c }}>
              {cfg.eyebrow}
            </div>
            <h1 className="mt-[18px] text-[clamp(32px,4.5vw,50px)] font-extrabold leading-[1.14] tracking-[-0.024em]">{cfg.h1[lang]}</h1>
            <p className="mt-[18px] max-w-[540px] text-[16.5px] leading-relaxed text-body-2">{cfg.sub[lang]}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className="inline-flex items-center justify-center rounded-full px-7 py-3 text-[15px] font-semibold text-white transition active:translate-y-px active:scale-[.98]"
                style={{ background: c, boxShadow: `0 1px 2px ${c}59, 0 10px 26px -12px rgba(76,29,149,.4)` }}
              >
                {cfg.primaryCta.label[lang]}
              </Link>
              <Link
                href={cfg.secondaryCta.href}
                className="inline-flex items-center justify-center rounded-full border border-[#E5E1D4] bg-white px-6 py-3 text-[14.5px] font-semibold transition hover:border-[#A1A1AA] active:translate-y-px"
              >
                {cfg.secondaryCta.label[lang]}
              </Link>
            </div>
            {cfg.ctaNote && <p className="mt-4 text-[13px] text-body-3">{cfg.ctaNote[lang]}</p>}
          </div>

          {/* Agent chat — mirrors the live thread (components/agent/AgentChat.tsx):
              white card, role orb, stacked name + "online / reading your memory"
              status, accent user bubble right, chip-surface agent bubble left. */}
          <div className="min-w-0 overflow-hidden rounded-2xl border border-line-divider bg-white"
               style={{ boxShadow: '0 1px 2px rgba(24,24,27,.04), 0 32px 72px -28px rgba(76,29,149,.22)' }}>
            {/* header */}
            <div className="flex items-center gap-3 border-b border-line-divider px-5 py-3.5">
              <span className={`orb ${cfg.role} h-9 w-9 flex-none`} />
              <div>
                <div className="text-[15px] font-bold tracking-tight">{cfg.agentName}</div>
                <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[.1em] text-body-3">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#34D399' }} />
                  {zh ? '在线 · 读取你的记忆' : 'ONLINE · READING YOUR MEMORY'}
                </div>
              </div>
            </div>

            {/* thread */}
            <div className="space-y-4 px-5 py-5">
              <div className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-[14px] leading-relaxed text-white"
                     style={{ background: c }}>
                  {cfg.demo.ask[lang]}
                </div>
              </div>

              <div className="flex justify-start">
                <span className={`orb ${cfg.role} mr-2 mt-0.5 h-7 w-7 flex-none`} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="rounded-2xl rounded-tl-sm bg-surface-chip px-4 py-2.5 text-[14px] leading-relaxed text-body">
                    {cfg.demo.reply[lang]}
                  </div>

                  {/* running-task card — the live thread's "working" state */}
                  <div className="rounded-xl border p-3"
                       style={{ background: `${c}0A`, borderColor: `${c}22` }}>
                    <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: c }}>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: c }} />
                      {zh ? '已接手 · 后台持续执行' : 'On it · running in the background'}
                    </div>
                    <div className="mt-1.5 font-mono text-[10.5px] text-body-3">{cfg.demo.task[lang]}</div>
                    <div className="mt-1 text-[11.5px] text-body-2">{cfg.demo.note[lang]}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* input bar — same affordances as components/agent/AgentInputBar */}
            <div className="flex items-center gap-2.5 border-t border-line-divider px-4 py-2.5">
              <span className="text-[13px] text-body-3">🔗</span>
              <span className="text-[13px] text-body-3">🎙</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-body-3">
                {zh ? `告诉 ${cfg.agentName} 你想做什么 —— 文字、语音或上传文件都行`
                    : `Tell ${cfg.agentName} what you need — text, voice or upload a file`}
              </span>
              <span className="flex-none rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-white" style={{ background: c }}>
                {zh ? '发送 →' : 'Send →'}
              </span>
            </div>

            {/* capability strip */}
            <ul className="grid gap-x-4 gap-y-1.5 border-t border-line-divider px-5 py-3.5 text-[11.5px] text-body-2 sm:grid-cols-2">
              {cfg.agentPoints.map((p) => (
                <li key={p.en} className="flex items-start gap-1.5">
                  <span className="mt-[1px] font-bold" style={{ color: '#6AB344' }}>✓</span>
                  <span>{p[lang]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* PROMISES — v8 trust-strip treatment */}
      <section style={{ background: '#F6F3EA', borderTop: '1px solid #EEEAE0', borderBottom: '1px solid #EEEAE0' }}>
        {/* [&>*]:min-w-0 is required, not cosmetic: grid items default to
            min-width:auto, so at 320px these three cells refused to go below
            their min-content and pushed the whole page 9px past the viewport. */}
        <div className="mx-auto grid max-w-[1180px] grid-cols-3 divide-x divide-[#EEEAE0] px-5 [&>*]:min-w-0 sm:px-8">
          {cfg.stats.map((s) => (
            <div key={s.k.en} className="px-2 py-6 text-center sm:px-4">
              <div className="text-[19px] font-extrabold tracking-[-0.02em] [font-variant-numeric:tabular-nums] sm:text-[26px]" style={{ color: c }}>
                {s.v[lang]}
              </div>
              <div className="mt-1 text-[11.5px] font-semibold uppercase tracking-[.1em] text-body-3">{s.k[lang]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* JOURNEY — ghost-numeral steps */}
      <section>
        <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
          <div className="v8-eyebrow" style={{ color: c }}>
            {lang === 'zh' ? '怎么用 · 从头到尾' : 'HOW IT WORKS · END TO END'}
          </div>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,42px)] font-extrabold leading-tight tracking-[-0.022em]">
            {lang === 'zh'
              ? <>{cfg.agentName} 陪你走完每一步。</>
              : <>{cfg.agentName} walks you through every step.</>}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {cfg.journey.map((j, i) => (
              <div key={j.h.en} className={`v8-card rv relative overflow-hidden p-5 ${i > 0 ? `d${Math.min(i, 4)}` : ''}`}>
                <span className="gn" aria-hidden style={{ color: c, opacity: 0.05 }}>
                  0{i + 1}
                </span>
                <div
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-[14px] font-extrabold"
                  style={{ border: `1.5px solid ${c}`, color: c }}
                >
                  {i + 1}
                </div>
                <h4 className="mt-4 text-[14.5px] font-extrabold leading-snug">{j.h[lang]}</h4>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-body-3">{j.b[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VALUE BAND (optional) */}
      {cfg.valueBand && (
        <section className="border-y border-[#E5E1D4] bg-white">
          <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
            <div className="v8-eyebrow" style={{ color: c }}>
              {cfg.valueBand.eyebrow[lang]}
            </div>
            <h2 className="mt-3 text-[clamp(28px,3.4vw,42px)] font-extrabold leading-tight tracking-[-0.022em]">
              {cfg.valueBand.h2[lang]}
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cfg.valueBand.items.map((it, i) => (
                <div key={it.h.en} className={`v8-card rv p-5 ${i > 0 ? `d${Math.min(i, 4)}` : ''}`} style={{ background: '#FDFBF6' }}>
                  <span className="text-[22px]">{it.icon}</span>
                  <h4 className="mt-3 text-[14.5px] font-extrabold leading-snug">{it.h[lang]}</h4>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-body-3">{it.b[lang]}</p>
                </div>
              ))}
            </div>
            {cfg.valueBand.cta && (
              <div className="mt-8">
                <Link
                  href={cfg.valueBand.cta.href}
                  className="inline-flex items-center justify-center rounded-full border border-[#E5E1D4] bg-white px-6 py-2.5 text-[14px] font-semibold transition hover:border-[#A1A1AA]"
                  style={{ color: c }}
                >
                  {cfg.valueBand.cta.label[lang]}
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SCENARIO */}
      <section style={{ background: '#F6F3EA' }}>
        <div className="mx-auto max-w-[1180px] px-5 py-24 sm:px-8 lg:py-28">
          <div className="v8-eyebrow" style={{ color: c }}>
            {lang === 'zh' ? '真实场景' : 'REAL SCENARIO'}
          </div>
          <h2 className="mt-3 text-[clamp(28px,3.4vw,42px)] font-extrabold leading-tight tracking-[-0.022em]">
            {lang === 'zh' ? '一段被 AI 改写的租住。' : 'A tenancy rewritten by AI.'}
          </h2>
          {/* Storyboard strip — three beats straight from the shot scripts */}
          {cfg.story && (
            <div className="mt-9 grid gap-4 sm:grid-cols-3">
              {cfg.story.map((s, i) => (
                <figure key={s.file} className={`v8-card rv overflow-hidden p-0 ${i > 0 ? `d${i}` : ''}`}>
                  <div className="relative">
                    <img
                      src={`/personas/${s.file}`}
                      alt={s.label[lang]}
                      className="h-[190px] w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        const el = e.currentTarget
                        if (el.src !== s.fallback) el.src = s.fallback
                      }}
                    />
                    <span
                      className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-[12.5px] font-extrabold text-white"
                      style={{ background: i === 0 ? '#B45309' : c }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <figcaption className="p-4">
                    <div className="text-[10.5px] font-bold uppercase tracking-[.12em]" style={{ color: i === 0 ? '#B45309' : c }}>
                      {s.label[lang]}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-body-2">{s.text[lang]}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="v8-card rv p-6">
              <div className="text-[20px] font-extrabold tracking-[-0.016em]">{cfg.scenario.name}</div>
              <div className="text-[12px] text-body-3">{cfg.scenario.meta[lang]}</div>
              <p className="mt-4 text-[15px] font-semibold italic leading-relaxed text-body">“{cfg.scenario.quote[lang]}”</p>
              <div
                className="mt-4 inline-flex rounded-full px-3.5 py-1 text-[12.5px] font-bold [font-variant-numeric:tabular-nums]"
                style={{ background: `${c}14`, color: c }}
              >
                {cfg.scenario.delta[lang]}
              </div>
            </div>
            {/* before → after as one timeline card, not two half-empty twins */}
            <div className="v8-card rv d1 p-6">
              <div className="grid grid-cols-[14px_1fr] gap-x-4">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full border-2 border-white" style={{ background: '#B45309', boxShadow: '0 0 0 1px #B4530944' }} />
                  <span className="w-[2px] flex-1" style={{ background: `linear-gradient(180deg,#B4530955, ${c})` }} />
                  <span className="mb-1.5 h-3 w-3 flex-shrink-0 rounded-full border-2 border-white" style={{ background: c, boxShadow: `0 0 0 1px ${c}44` }} />
                </div>
                <div className="space-y-6">
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-[.12em]" style={{ color: '#B45309' }}>
                      {lang === 'zh' ? '之前' : 'BEFORE'}
                    </div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-body-2">{cfg.scenario.before[lang]}</p>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-[.12em]" style={{ color: c }}>
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

      {/* CTA — v8 dark band with brand glow */}
      <section className="v8-dark">
        <div className="relative mx-auto max-w-[1180px] px-5 py-24 text-center sm:px-8 lg:py-28">
          <h2 className="rv mx-auto max-w-[640px] text-[clamp(28px,3.4vw,42px)] font-extrabold leading-tight tracking-[-0.022em] text-white">
            {lang === 'zh'
              ? <>现在就让 {cfg.agentName} 替你开始。</>
              : <>Let {cfg.agentName} start for you now.</>}
          </h2>
          <div className="rv d1 mt-8">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-full px-8 py-3.5 text-[15.5px] font-semibold text-white transition active:translate-y-px active:scale-[.98]"
              style={{ background: c, boxShadow: `0 1px 2px ${c}59, 0 12px 30px -12px rgba(76,29,149,.55)` }}
            >
              {cfg.primaryCta.label[lang]}
            </Link>
          </div>
          {cfg.ctaNote && <p className="rv d2 mt-4 text-[13px]" style={{ color: 'rgba(255,255,255,.55)' }}>{cfg.ctaNote[lang]}</p>}
        </div>
      </section>

      <Footer />
    </div>
  )
}

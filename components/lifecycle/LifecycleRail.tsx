'use client'

// The lifecycle rail — 租前 · 租中 · 租后 as the workspace's backbone
// (proposal 2026-09-23 §3.1). Desktop: three columns on a line. Phone
// (`compact`): one row of chips + the selected phase's card. Every "next"
// either links to a real page or prefills the composer via `onPrompt`.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Lang } from '@/lib/i18n'
import type { Lifecycle, Phase, PhaseKey } from '@/lib/lifecycle/stages'

const pick = (b: { zh: string; en: string }, lang: Lang) => (lang === 'zh' ? b.zh : b.en)

function Dot({ state }: { state: 'done' | 'current' | 'todo' }) {
  return <span className={'mt-[6px] h-2 w-2 flex-none rounded-full ' + (state === 'done' ? 'bg-success' : state === 'current' ? 'bg-brand ring-4 ring-brand/20' : 'bg-line-strong')} />
}

function ClockPill({ p, lang }: { p: Phase; lang: Lang }) {
  if (!p.clock) return null
  const c = p.clock
  const tone = c.tone === 'late' ? 'bg-danger/10 text-danger' : c.tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-surface-chip text-body-2'
  const text = lang === 'zh' ? `${pick(c.label, lang)} ${c.date}${c.days < 0 ? `（已过 ${-c.days} 天）` : `（${c.days} 天）`}` : `${pick(c.label, lang)} ${c.date}${c.days < 0 ? ` (${-c.days} days ago)` : ` (${c.days} days)`}`
  return <span className={'inline-block rounded-full px-2.5 py-[3px] font-mono text-[11px] font-bold ' + tone}>{text}</span>
}

function NextButton({ p, lang, onPrompt, size = 'sm' }: { p: Phase; lang: Lang; onPrompt?: (t: string) => void; size?: 'sm' | 'md' }) {
  if (!p.next) return null
  const cls = 'inline-flex items-center rounded-full bg-brand font-bold text-white transition hover:opacity-90 ' + (size === 'sm' ? 'px-3 py-1 text-[12px]' : 'px-4 py-1.5 text-[13px]')
  if (p.next.href) return <Link href={p.next.href} className={cls}>{pick(p.next.label, lang)} →</Link>
  if (p.next.prompt && onPrompt) return <button type="button" className={cls} onClick={() => onPrompt(pick(p.next!.prompt!, lang))}>{pick(p.next.label, lang)} →</button>
  return null
}

function Steps({ p, lang, onPrompt, dense }: { p: Phase; lang: Lang; onPrompt?: (t: string) => void; dense?: boolean }) {
  return (
    <ul className={'space-y-1.5 ' + (dense ? 'text-[12.5px]' : 'text-[13px]')}>
      {p.steps.map((s) => {
        const label = pick(s.label, lang)
        const inner = s.href ? <Link href={s.href} className="hover:underline underline-offset-2">{label}</Link>
          : s.prompt && onPrompt ? <button type="button" className="text-left hover:underline underline-offset-2" onClick={() => onPrompt(pick(s.prompt!, lang))}>{label}</button>
          : <span>{label}</span>
        return (
          <li key={s.key} className="flex items-start gap-2">
            <Dot state={s.state} />
            <span className={'min-w-0 ' + (s.state === 'current' ? 'font-semibold text-body' : s.state === 'done' ? 'text-body-2' : 'text-body-3')}>
              {inner}
              {s.detail && <span className="ml-1.5 text-[11.5px] text-body-3">{pick(s.detail, lang)}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function AiYou({ p, lang }: { p: Phase; lang: Lang }) {
  return (
    <div className="mt-3 grid gap-1 border-t border-line-divider pt-2.5 text-[11.5px] leading-snug text-body-3 sm:grid-cols-2">
      <div><span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-brand">AI</span> {pick(p.ai, lang)}</div>
      <div><span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-body-2">{lang === 'zh' ? '你' : 'YOU'}</span> {pick(p.you, lang)}</div>
    </div>
  )
}

export default function LifecycleRail({ lifecycle, lang, compact = false, onPrompt, full = false }: {
  lifecycle: Lifecycle
  lang: Lang
  /** Phone layout: chips + one card. */
  compact?: boolean
  /** Progress page: every phase expanded with the AI / you lines. */
  full?: boolean
  onPrompt?: (text: string) => void
}) {
  const zh = lang === 'zh'
  const [sel, setSel] = useState<PhaseKey>(lifecycle.current)
  // Re-sync when the derived phase moves (reload after an action).
  useEffect(() => { setSel(lifecycle.current) }, [lifecycle.current])
  const shown = lifecycle.phases.find((p) => p.key === sel) ?? lifecycle.phases[0]

  if (compact) {
    return (
      <div className="rounded-2xl border border-line-divider bg-white p-3" data-testid="lifecycle-rail-compact">
        <div className="grid grid-cols-3 gap-1.5">
          {lifecycle.phases.map((p) => {
            const active = p.key === sel
            const tone = active ? 'bg-brand text-white' : p.state === 'done' ? 'bg-success/10 text-success' : p.state === 'active' ? 'bg-brand/10 text-brand' : 'bg-surface-chip text-body-3'
            return (
              <button key={p.key} type="button" onClick={() => setSel(p.key)} className={'rounded-lg px-2 py-1.5 text-[12px] font-bold ' + tone} aria-pressed={active}>
                {pick(p.title, lang)}{p.state === 'done' ? ' ✓' : p.key === lifecycle.current ? ' ·' : ''}
              </button>
            )
          })}
        </div>
        <div className="mt-2.5 text-[13px] leading-snug text-body">{pick(shown.headline, lang)}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ClockPill p={shown} lang={lang} />
          <NextButton p={shown} lang={lang} onPrompt={onPrompt} />
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-[11.5px] text-body-3">{zh ? '这一段的步骤' : 'Steps in this phase'}</summary>
          <div className="mt-2"><Steps p={shown} lang={lang} onPrompt={onPrompt} dense /></div>
          <AiYou p={shown} lang={lang} />
        </details>
      </div>
    )
  }

  return (
    <div className="relative" data-testid="lifecycle-rail">
      <div className="absolute left-[12%] right-[12%] top-[15px] hidden h-px bg-line-strong md:block" aria-hidden />
      <div className="grid gap-4 md:grid-cols-3">
        {lifecycle.phases.map((p, i) => {
          const isCur = p.key === lifecycle.current
          return (
            <div key={p.key} className={'relative rounded-2xl border bg-white p-4 ' + (isCur ? 'border-brand shadow-[0_0_0_3px_rgba(0,172,228,0.12)]' : 'border-line-divider')}>
              <div className="flex items-center gap-2.5">
                <span className={'relative z-10 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full font-mono text-[12px] font-bold ' + (p.state === 'done' ? 'bg-success text-white' : isCur || p.state === 'active' ? 'bg-brand text-white' : 'border border-line-strong bg-white text-body-3')}>
                  {p.state === 'done' ? '✓' : i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[9.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{p.eyebrow}</div>
                  <div className="text-[16px] font-extrabold leading-tight">{pick(p.title, lang)}{isCur && <span className="ml-2 rounded-full bg-brand/10 px-2 py-[1px] font-mono text-[9.5px] font-bold text-brand">{zh ? '当前' : 'NOW'}</span>}</div>
                </div>
              </div>
              <p className="mt-2.5 text-[13px] leading-snug text-body-2">{pick(p.headline, lang)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ClockPill p={p} lang={lang} />
                <NextButton p={p} lang={lang} onPrompt={onPrompt} />
              </div>
              <div className="mt-3"><Steps p={p} lang={lang} onPrompt={onPrompt} dense={!full} /></div>
              {full && <AiYou p={p} lang={lang} />}
            </div>
          )
        })}
      </div>
      {!full && (
        <div className="mt-2 text-[11px] text-body-3">
          {zh ? '阶段由你账号里的真实记录推导，不由模型判断；每个「下一步」都指向真实页面或填进对话框。' : 'Phases are derived from your real records, never by the model; every "next" opens a real page or fills the composer.'}
        </div>
      )}
    </div>
  )
}

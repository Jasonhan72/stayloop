'use client'

// Phone-only header strip for the assistant pages (2026-09-24, user: the
// chat on a phone was too small because 今日 + the lifecycle rail + the hero
// took the top 530px). Muse keeps the conversation as the screen; the
// context collapses into one 44px line — "今日 · N 件 · <phase>" — that
// expands in place to the same TodayCard + compact rail. md+ is untouched.
import { useState } from 'react'
import type { Lang } from '@/lib/i18n'
import type { Lifecycle } from '@/lib/lifecycle/stages'
import { buildToday, type TodayPending } from '@/lib/lifecycle/today'
import TodayCard from '@/components/lifecycle/TodayCard'
import LifecycleRail from '@/components/lifecycle/LifecycleRail'

export default function ContextStrip({ lifecycle, pending, todoHref, lang, onPrompt }: {
  lifecycle: Lifecycle | null
  pending: TodayPending[]
  todoHref: string
  lang: Lang
  onPrompt?: (text: string) => void
}) {
  const zh = lang === 'zh'
  const [open, setOpen] = useState(false)
  const items = buildToday(lifecycle, pending, todoHref)
  const phase = lifecycle ? lifecycle.phases.find((p) => p.key === lifecycle.current) ?? null : null
  const late = items.some((i) => i.tone === 'late')
  const warn = items.some((i) => i.tone === 'warn')
  const dot = late ? 'bg-danger' : warn ? 'bg-amber-500' : items.length ? 'bg-brand' : 'bg-success'
  const first = items[0] ? (zh ? items[0].text.zh : items[0].text.en) : null
  const label = items.length
    ? (zh ? `今日 ${items.length} 件` : `Today · ${items.length}`)
    : (zh ? '今天没有要处理的事' : 'Nothing needs you today')
  return (
    <div className="border-b border-line-divider bg-white" data-testid="context-strip">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2 px-4 text-left"
      >
        <span className={`h-2 w-2 flex-none rounded-full ${dot}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] text-body">
          <span className="font-semibold">{label}</span>
          {first && !open && <span className="text-body-3"> · {first}</span>}
        </span>
        {phase && (
          <span className="flex-none rounded-full bg-brand/10 px-2 py-[2px] font-mono text-[10.5px] font-bold text-brand">
            {zh ? phase.title.zh : phase.title.en}
          </span>
        )}
        <span className={`flex-none text-[11px] text-body-3 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>▶</span>
      </button>
      {open && (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto border-t border-line-divider px-4 py-3" style={{ background: '#F3F8FC' }}>
          <TodayCard lifecycle={lifecycle} pending={pending} todoHref={todoHref} lang={lang} onPrompt={(t) => { setOpen(false); onPrompt?.(t) }} />
          {lifecycle && <LifecycleRail lifecycle={lifecycle} lang={lang} compact onPrompt={(t) => { setOpen(false); onPrompt?.(t) }} />}
        </div>
      )}
    </div>
  )
}

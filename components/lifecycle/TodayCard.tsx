'use client'

// 今日 — the short list of what needs attention now (P2 2026-09-23). Sits
// above the lifecycle rail on the consoles and at the top of 待办. Every
// line either opens a real page or prefills the composer.
import Link from 'next/link'
import type { Lang } from '@/lib/i18n'
import type { Lifecycle } from '@/lib/lifecycle/stages'
import { buildToday, type TodayPending } from '@/lib/lifecycle/today'

export default function TodayCard({ lifecycle, pending, todoHref, lang, onPrompt }: {
  lifecycle: Lifecycle | null
  pending: TodayPending[]
  todoHref: string
  lang: Lang
  onPrompt?: (text: string) => void
}) {
  const zh = lang === 'zh'
  const items = buildToday(lifecycle, pending, todoHref)
  const today = new Date()
  const dateLabel = zh ? `${today.getMonth() + 1} 月 ${today.getDate()} 日` : today.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  return (
    <div className="rounded-2xl border border-line-divider bg-white p-4" data-testid="today-card">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10.5px] font-bold uppercase tracking-eyebrowLg text-body-3">{zh ? '今日' : 'TODAY'} · {dateLabel}</div>
        {items.length === 0 && <span className="text-[12px] text-body-3">{zh ? '今天没有需要你处理的事。' : 'Nothing needs you today.'}</span>}
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.map((i) => {
            const text = zh ? i.text.zh : i.text.en
            const dot = i.tone === 'late' ? 'bg-danger' : i.tone === 'warn' ? 'bg-amber-500' : 'bg-brand'
            const inner = i.href
              ? <Link href={i.href} className="hover:underline underline-offset-2">{text}</Link>
              : i.prompt && onPrompt
                ? <button type="button" className="text-left hover:underline underline-offset-2" onClick={() => onPrompt(zh ? i.prompt!.zh : i.prompt!.en)}>{text}</button>
                : <span>{text}</span>
            return (
              <li key={i.id} className="flex items-start gap-2 text-[13px] text-body">
                <span className={'mt-[7px] h-1.5 w-1.5 flex-none rounded-full ' + dot} />
                <span className="min-w-0">{inner}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

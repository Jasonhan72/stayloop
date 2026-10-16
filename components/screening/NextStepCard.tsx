'use client'

// V1.0 · 阶段 1 · 甲 #1 — the "next step" block under a finished screening.
// Pure rendering of lib/screening/nextStep.ts output; mounted under the
// conclusion card on /screening/[id]/done and at the end of /screening/[id]/report.
// Says what the landlord can do next and nothing about whether they should.

import Link from 'next/link'
import type { NextStep } from '@/lib/screening/nextStep'

const ICON: Record<NextStep['kind'], string> = {
  lease: '📄',
  decision: '✉️',
  follow_up: '💬',
  import: '📥',
  queue: '📋',
  screen_again: '🔍',
  rerun: '↻',
}

export default function NextStepCard({ steps, zh, className }: { steps: NextStep[]; zh: boolean; className?: string }) {
  if (!steps.length) return null
  return (
    <section
      data-testid="screening-next-step"
      className={`rounded-2xl border border-line-divider bg-white p-6 shadow-sm sm:p-8 ${className || ''}`}
      aria-labelledby="screening-next-step-title"
    >
      <div id="screening-next-step-title" className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-body-3">
        {zh ? '下一步 · 由你决定' : 'NEXT STEP · YOUR CALL'}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-body-3">
        {zh
          ? '这里只列接下来可以做的事，不是录取或拒绝的建议；决定由房东本人做出。'
          : 'These are only the things you can do next, not a recommendation to accept or decline; the decision is the landlord’s own.'}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.kind + s.href} className="min-w-0">
            <Link
              href={s.href}
              data-kind={s.kind}
              className="flex h-full gap-3 rounded-xl border border-line-divider bg-surface-chip px-4 py-3.5 transition hover:border-line-strong hover:bg-white"
            >
              <span aria-hidden className="mt-0.5 text-[16px] leading-none">{ICON[s.kind]}</span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-body">{s.title} →</span>
                <span className="mt-1 block text-[12px] leading-relaxed text-body-2">{s.desc}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

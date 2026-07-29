'use client'

// Shared primitives for the workspace (sidebar) pages, built to
// design/v9-workspace-finance.html.
//
// Why these exist: every workspace page used to hand-roll its own header,
// KPI cards and tables, so scale drifted page to page — 36px marketing
// headlines, 40–44px display numbers and 28px card padding on what are
// working tools. These primitives fix the scale in one place:
//   · PageHeader  20px title, actions on the same line
//   · StatStrip   one divided row instead of N separate KPI cards
//   · SectionCard 18px padding, header row with an optional action
//   · Table       dense 40px rows, hairline rules, tabular numerals
//   · StatusPill  one status vocabulary with fixed semantics
//   · EmptyState  compact, never a full-height void
//   · AsideBlock  consistent right-rail section
//
// Layout only — no page changes its data, copy or routes to adopt these.
import type { ReactNode } from 'react'

/* ── PageHeader ─────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: ReactNode
  /** Optional context line — keeps personality without a 36px headline. */
  sub?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
        {sub && <div className="mt-0.5 text-[13px] text-body-2">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/* ── StatStrip ──────────────────────────────────────────────────────── */

export interface Stat {
  label: string
  value: string
  /** Sub-line under the value; `tone` colors it. */
  sub?: string
  tone?: 'default' | 'up' | 'warn' | 'down'
}

const TONE: Record<NonNullable<Stat['tone']>, string> = {
  default: 'text-body-2',
  up: 'text-success',
  warn: 'text-warning',
  down: 'text-danger',
}

export function StatStrip({ stats }: { stats: Stat[] }) {
  const cols =
    stats.length >= 5
      ? 'sm:grid-cols-5'
      : stats.length === 4
        ? 'sm:grid-cols-4'
        : stats.length === 3
          ? 'sm:grid-cols-3'
          : 'sm:grid-cols-2'
  return (
    <div className={`mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-line-divider bg-white ${cols}`}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={
            'px-4 py-3 ' +
            (i > 0 ? 'border-l border-line-divider ' : '') +
            // 2-up on mobile: every even cell starts a new row, so it owns no left rule
            (i > 0 && i % 2 === 0 ? 'max-sm:border-l-0 ' : '') +
            (i >= 2 ? 'max-sm:border-t max-sm:border-line-divider' : '')
          }
        >
          <div className="text-[11px] text-body-3">{s.label}</div>
          <div className="mt-0.5 text-[24px] font-extrabold tracking-tight [font-variant-numeric:tabular-nums]">
            {s.value}
          </div>
          {s.sub && <div className={`mt-0.5 text-[11.5px] ${TONE[s.tone ?? 'default']}`}>{s.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/* ── SectionCard ────────────────────────────────────────────────────── */

export function SectionCard({
  title,
  meta,
  action,
  children,
  /** Tables/lists render edge-to-edge; pass false to drop the body padding. */
  padded = true,
  className = '',
}: {
  title?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  padded?: boolean
  className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-line-divider bg-white ${className}`}>
      {(title || action || meta) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line-divider px-4 py-3">
          <div className="min-w-0 flex-1 basis-[12rem]">
            {title && <h2 className="text-[14px] font-bold tracking-tight">{title}</h2>}
          </div>
          <div className="flex flex-none items-center gap-3">
            {meta && <span className="text-[11px] text-body-3">{meta}</span>}
            {action}
          </div>
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

/* ── Table ──────────────────────────────────────────────────────────── */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] border-collapse text-[13px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className={
                  'whitespace-nowrap border-b border-line-divider bg-surface-chip px-4 py-2 text-[11px] font-semibold text-body-3 ' +
                  (i === 0 ? 'text-left' : 'text-right')
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-b border-line-divider last:border-b-0">{children}</tr>
}

export function Td({
  children,
  align = 'left',
  strong,
  mono,
  muted,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  strong?: boolean
  mono?: boolean
  muted?: boolean
}) {
  return (
    <td
      className={
        'h-10 px-4 align-middle ' +
        (align === 'right' ? 'text-right ' : '') +
        (strong ? 'font-semibold ' : '') +
        (mono ? 'font-mono [font-variant-numeric:tabular-nums] ' : '') +
        (muted ? 'text-body-2' : '')
      }
    >
      {children}
    </td>
  )
}

/* ── StatusPill ─────────────────────────────────────────────────────── */

/** One vocabulary across the workspace — semantics are fixed by tone. */
export type PillTone = 'ok' | 'pending' | 'warn' | 'danger' | 'neutral' | 'info'

const PILL: Record<PillTone, string> = {
  ok: 'bg-[#E9F5EF] text-[#047857]',
  pending: 'bg-[#FFF7E8] text-[#B45309]',
  warn: 'bg-[#FFF7E8] text-[#B45309]',
  danger: 'bg-[#FDECEC] text-[#B91C1C]',
  neutral: 'bg-surface-chip text-body-2',
  info: 'bg-[#EEF2FF] text-[#4338CA]',
}

export function StatusPill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PILL[tone]}`}>
      {children}
    </span>
  )
}

/* ── EmptyState ─────────────────────────────────────────────────────── */

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-[12.5px] text-body-3">{children}</p>
      {action && <div className="mt-2.5 flex justify-center">{action}</div>}
    </div>
  )
}

/* ── AsideBlock ─────────────────────────────────────────────────────── */

/** A titled block in the right rail — used for AI tips and page extras. */
export function AsideBlock({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="sl-eyebrow">{title}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

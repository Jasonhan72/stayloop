'use client'

// A section of the AI Agent panel that folds: its title on the left, a chevron on the right
// (2026-11-27, the Muse panel's 「9 scheduled tasks ⌄」 / 「Today ⌄」). The body stays mounted
// while folded — a half-filled form or a loaded list is still there when it opens again.
import { useId, useState, type ReactNode } from 'react'
import { ChevronIcon } from './panelIcons'

export default function PanelFold({ title, children, defaultOpen = true, testid }: {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  testid?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section data-testid={testid}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg text-left text-[15px] font-semibold tracking-tight text-ink"
        >
          <span className="min-w-0 truncate">{title}</span>
          <span className={`flex-none text-body-3 transition-transform ${open ? '' : '-rotate-90'}`}><ChevronIcon /></span>
        </button>
      </h3>
      <div id={id} hidden={!open}>{children}</div>
    </section>
  )
}

/** The round icon that starts a row (a bell, a chat bubble, a tick…). */
export function RowIcon({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-body-2'
  return <span className={`mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-chip ${color}`}>{children}</span>
}

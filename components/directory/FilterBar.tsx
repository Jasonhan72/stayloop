// The filter bar of the three directory tabs (2026-11-23 redesign, user: 「这个模块需要重新设计 UI/UX，要有
// 专业设计的感觉，并符合整体风格」). The tabs used to carry three or four separate boxes — two text
// inputs and two native selects, each with its own border and, in Safari, its own height. This is
// one white bar with a soft shadow: the fields sit in cells of a grid whose 1px gaps show the
// divider colour, so the same markup reads as one row on a desktop, two by two on a tablet and a
// stack on a phone. Selects lose the native chrome (appearance-none) and get the bar's own chevron,
// which also ends the WebKit height quirk the old boxes needed an explicit height for.
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const I = (d: string) => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
)
export const FilterIcon = {
  search: I('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z|M21 21l-5.6-5.6'),
  pin: I('M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z|M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'),
  globe: I('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M3 12h18|M12 3a13.5 13.5 0 0 1 0 18|M12 3a13.5 13.5 0 0 0 0 18'),
  tag: I('M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z|M7.5 7.5h.01'),
  tool: I('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z'),
}

/** `cols` are the grid columns from `sm` up, e.g. "sm:grid-cols-2 lg:grid-cols-4". */
export function FilterBar({ children, cols, testid }: { children: ReactNode; cols: string; testid?: string }) {
  return (
    <div className={`grid gap-px overflow-hidden rounded-2xl border border-line-divider bg-line-divider shadow-[0_12px_30px_-20px_rgba(27,27,60,0.30)] ${cols}`} data-testid={testid}>
      {children}
    </div>
  )
}

const CELL = 'flex min-w-0 items-center gap-2.5 bg-white px-4 text-body-3 transition focus-within:bg-[#F7FBFE] focus-within:text-brand'
const CONTROL = 'h-12 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-body-3'

export function FilterText({ icon, className = '', ...rest }: { icon: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`${CELL} ${className}`}>
      {icon}
      <input {...rest} className={CONTROL} />
    </label>
  )
}

export function FilterSelect({ icon, className = '', children, ...rest }: { icon: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`${CELL} relative ${className}`}>
      {icon}
      <select {...rest} className={`${CONTROL} cursor-pointer appearance-none pr-6`}>{children}</select>
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-body-3"><path d="M6 9l6 6 6-6" /></svg>
    </label>
  )
}

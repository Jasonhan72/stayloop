// Line icons for the AI Agent panel's tabs and menus (2026-10-04: the tabs
// show their names next to these).
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function MemoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z" />
      <path d="M4 18a2.5 2.5 0 0 1 2.5-2.5H20" />
      <path d="M8.5 7.5h7M8.5 11h5" />
    </svg>
  )
}

export function AvatarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18.5c1.2-2.3 3.2-3.5 5.5-3.5s4.3 1.2 5.5 3.5" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  )
}

/** 待办 tab — the same checked box as the rail's 待办 (2026-10-04). */
export function TodoTabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  )
}

/** 设置 tab — sliders, so it never reads as the rail's 账号设置 gear (2026-10-04). */
export function SlidersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  )
}

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

// ── 2026-11-27: four tabs (任务 · 批准 · 身份 · 收件) and the rows inside them ──────────────

/** 任务 tab — a list. */
export function TasksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4 6.5h.01M4 12h.01M4 17.5h.01" strokeWidth={2.6} />
    </svg>
  )
}

/** 批准 tab — a shield with a tick. */
export function ApprovalsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M12 3l7 2.8v5.4c0 4.3-2.9 7.9-7 9.3-4.1-1.4-7-5-7-9.3V5.8L12 3z" />
      <path d="M8.8 12l2.3 2.3 4.2-4.6" />
    </svg>
  )
}

/** 身份 tab — a fingerprint. */
export function IdentityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M6.2 8.6A6.8 6.8 0 0 1 18.8 12c0 2.6-.3 5-1 7" />
      <path d="M5.2 12.4c0 2.3-.3 4.2-1 5.8" />
      <path d="M8.6 20.5c.9-2.5 1.3-5.3 1.3-8.5a2.1 2.1 0 0 1 4.2 0c0 3.3-.4 6.3-1.3 9" />
      <path d="M12 12c0 1.2-.05 2.3-.15 3.4" />
    </svg>
  )
}

/** 收件 tab — an envelope. */
export function InboxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
    </svg>
  )
}

export function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5l1.5-2z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </svg>
  )
}

export function ChatBubbleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V16A2.5 2.5 0 0 1 5 13.5v-7z" />
    </svg>
  )
}

export function DoneIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...S} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </svg>
  )
}

export function FailedIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...S} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...S} aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
    </svg>
  )
}

export function WrenchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M14.5 5.2a4.3 4.3 0 0 0-5.3 5.3L4 15.7V20h4.3l5.2-5.2a4.3 4.3 0 0 0 5.3-5.3l-2.9 2.9-2.3-.6-.6-2.3 2.9-2.9a4.3 4.3 0 0 0-1.4-.4z" />
    </svg>
  )
}

export function DocIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
      <path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" />
    </svg>
  )
}

/** Points down; a closed fold turns it. */
export function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M14.5 6.5L9 12l5.5 5.5" />
    </svg>
  )
}


// Line icons for the assistant panel's segmented control and menus (Muse web
// reference, 2026-09-25: icons only, the name appears on hover).
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M12 3l7 3v5.2c0 4.4-3 8.1-7 9.8-4-1.7-7-5.4-7-9.8V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

export function MemoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z" />
      <path d="M4 18a2.5 2.5 0 0 1 2.5-2.5H20" />
      <path d="M8.5 7.5h7M8.5 11h5" />
    </svg>
  )
}

export function FingerprintIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...S} aria-hidden>
      <path d="M7.5 20.5c1.7-2.3 2.5-5 2.5-8.5a2 2 0 0 1 4 0c0 3 .5 5.6 1.5 7.7" />
      <path d="M4.8 17c1.1-2 1.7-3.7 1.7-5a5.5 5.5 0 0 1 11 0c0 .9-.1 1.8-.2 2.7" />
      <path d="M3.8 12.5A8.2 8.2 0 0 1 12 4a8.2 8.2 0 0 1 8.2 8.5" />
      <path d="M6.6 5.9A8.2 8.2 0 0 1 12 4" />
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

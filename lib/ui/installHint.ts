// "Add to Home Screen" nudge rules (components/workspace/rail.tsx InstallHint), pure.
//
// 2026-10-21 review: until it was dismissed the nudge sat over the bottom of every workspace
// page — on a message thread it covered the composer. It now stays off pages whose bottom is a
// composer, hides while the person is typing, leaves on its own after a while, and stops after
// a few appearances even if never dismissed.

export const INSTALL_HINT_MAX_SHOWS = 3
export const INSTALL_HINT_VISIBLE_MS = 15_000
export const INSTALL_HINT_DELAY_MS = 4_000
export const INSTALL_HINT_DISMISSED_KEY = 'sl-install-hint'
export const INSTALL_HINT_SHOWS_KEY = 'sl-install-hint-shows'

/** Pages that keep a composer at the bottom: message threads and the tenancy hub's conversation. */
export function installHintBlockedOn(path: string): boolean {
  return /^\/(messages|h)(\/|$)/.test(path)
}

/** Whether another appearance is allowed, from the stored count (missing / garbage = 0). */
export function installHintMayShow(storedCount: string | null): boolean {
  const n = Number(storedCount ?? '0')
  return !Number.isFinite(n) || n < INSTALL_HINT_MAX_SHOWS
}

/** A focused element the person types into. */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'].includes(type)
  }
  return !!(el as HTMLElement).isContentEditable
}

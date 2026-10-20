// Pure helpers shared by /verify/<token> (browser) and the bank routes. No server imports.

/** A Flinks loginId: a GUID-like hex string. */
export function isFlinksLoginId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{20,64}$/i.test(v)
}

/**
 * B1 (2026-10-19): the page used to accept any window's `{ step: 'REDIRECT', loginId }`.
 * Only a message from the Connect iframe we opened counts — same origin as its URL — and
 * only one carrying a well-formed loginId.
 */
export function connectRedirectLoginId(origin: string, frameUrl: string | null, data: unknown): string | null {
  if (!frameUrl) return null
  let frameOrigin: string
  try { frameOrigin = new URL(frameUrl).origin } catch { return null }
  if (origin !== frameOrigin) return null
  if (!data || typeof data !== 'object') return null
  const d = data as { step?: unknown; loginId?: unknown }
  if (d.step !== 'REDIRECT') return null
  return isFlinksLoginId(d.loginId) ? d.loginId : null
}

export const BANK_POLL_MS = 5000
/** The page polls for ~10 min, then leaves the rest to the hourly sweep (BANK_READ_TIMEOUT_MS = 2 h). */
export const BANK_POLL_MAX = 120

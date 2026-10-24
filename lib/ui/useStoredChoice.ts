'use client'
// A per-browser preference (localStorage / sessionStorage) read through useSyncExternalStore:
// the server snapshot is the fallback, so the first client render matches the server HTML and
// React applies the stored value in the hydration pass — no setState-in-effect, no React #418.
// Setting writes storage and notifies every subscriber in this tab (the storage event only
// fires in OTHER tabs). (react-hooks 7 `set-state-in-effect`, 2026-10-23.)
import { useCallback, useSyncExternalStore } from 'react'

const EVENT = 'sl-stored-choice'

function area(kind: 'local' | 'session'): Storage | null {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage } catch { return null }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('storage', cb)
  window.addEventListener(EVENT, cb)
  return () => { window.removeEventListener('storage', cb); window.removeEventListener(EVENT, cb) }
}

/** The raw stored string (null when unset, unreadable, or on the server). */
export function useStoredString(key: string, kind: 'local' | 'session' = 'local'): string | null {
  return useSyncExternalStore(
    subscribe,
    () => { try { return area(kind)?.getItem(key) ?? null } catch { return null } },
    () => null,
  )
}

export function writeStoredString(key: string, value: string | null, kind: 'local' | 'session' = 'local'): void {
  try {
    const s = area(kind)
    if (!s) return
    if (value === null) s.removeItem(key); else s.setItem(key, value)
  } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* no window */ }
}

/** A choice among known values, with a fallback for unset / unknown / server. */
export function useStoredChoice<T extends string>(key: string, fallback: T, valid: readonly T[], kind: 'local' | 'session' = 'local'): [T, (v: T) => void] {
  const raw = useStoredString(key, kind)
  const value = (valid as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback
  const set = useCallback((v: T) => writeStoredString(key, v, kind), [key, kind])
  return [value, set]
}

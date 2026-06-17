'use client'

import { useEffect, useState } from 'react'

const KEY = 'sl-tenant-ai-name'
const DEFAULT_NAME = 'Luna'

export function getAIName(): string {
  if (typeof window === 'undefined') return DEFAULT_NAME
  try {
    return localStorage.getItem(KEY) || DEFAULT_NAME
  } catch {
    return DEFAULT_NAME
  }
}

/** Raw stored value — null when the user has never chosen a name (vs the
 *  'Luna' default returned by getAIName). Used to reconcile local ↔ DB. */
export function getStoredAIName(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setAIName(name: string) {
  if (typeof window === 'undefined') return
  const trimmed = name.trim() || DEFAULT_NAME
  try {
    localStorage.setItem(KEY, trimmed)
  } catch {}
}

/** Reactive hook so components re-render when the name is set in another tab/route. */
export function useAIName(): string {
  const [name, setName] = useState<string>(DEFAULT_NAME)
  useEffect(() => {
    setName(getAIName())
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setName(e.newValue || DEFAULT_NAME)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return name
}

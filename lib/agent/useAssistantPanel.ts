'use client'

// Open / closed state of the assistant panel beside the conversation (web).
// Default open (user decision 2026-09-25); the choice is a per-browser
// convenience in localStorage, read through useSyncExternalStore so the first
// client render still matches the server HTML (2026-10-23).
import { useCallback } from 'react'
import { useStoredChoice } from '@/lib/ui/useStoredChoice'

const KEY = 'sl-assistant-panel'

export function useAssistantPanel(): [boolean, (open: boolean) => void] {
  const [stored, setStored] = useStoredChoice<'open' | 'closed'>(KEY, 'open', ['open', 'closed'])
  const setOpen = useCallback((next: boolean) => setStored(next ? 'open' : 'closed'), [setStored])
  return [stored === 'open', setOpen]
}

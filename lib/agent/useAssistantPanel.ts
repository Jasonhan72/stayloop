'use client'

// Open / closed state of the assistant panel beside the conversation (web).
// Default open (user decision 2026-09-25); the choice is a per-browser
// convenience in localStorage. Initial render is always "open" so server and
// client HTML agree; the stored choice is applied in an effect.
import { useCallback, useEffect, useState } from 'react'

const KEY = 'sl-assistant-panel'

export function useAssistantPanel(): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(true)
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === 'closed') setOpenState(false) } catch { /* private mode */ }
  }, [])
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    try { localStorage.setItem(KEY, next ? 'open' : 'closed') } catch { /* private mode */ }
  }, [])
  return [open, setOpen]
}

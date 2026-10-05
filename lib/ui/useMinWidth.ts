'use client'

// true once the viewport is at least `px` wide. False on the first render (matching the
// server HTML) and wherever matchMedia is missing (node tests), so hidden surfaces never
// mount or fetch before we know they will be seen (2026-10-04).
import { useEffect, useState } from 'react'

export function useMinWidth(px: number): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(`(min-width: ${px}px)`)
    const sync = () => setOk(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [px])
  return ok
}

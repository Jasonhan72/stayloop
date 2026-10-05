'use client'

// What every sheet / drawer here needs (2026-10-04): Esc closes it, Tab stays inside it,
// and focus goes back to whatever opened it when it closes.
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalA11y(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const box = ref.current
    // Focus the first control inside unless something inside already has it.
    if (box && !box.contains(document.activeElement)) (box.querySelector<HTMLElement>(FOCUSABLE) ?? box).focus?.()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // A nested menu or an inline editor handles its own Esc (it calls preventDefault, or is still open):
        // the first Esc closes that, not the whole sheet with the edit in it (review 2026-10-04).
        if (e.defaultPrevented || ref.current?.querySelector('[role="menu"]')) return
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus?.()
    }
  }, [open, ref])
}

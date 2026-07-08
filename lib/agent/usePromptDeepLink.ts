'use client'

import { useEffect, useRef } from 'react'

/**
 * Deep-link task hand-off: workspace CTAs navigate to /x/agent?prompt=<task>.
 * Once the session settles, auto-send the prompt once, then strip the param so
 * a refresh doesn't resend. Uses window.location (not useSearchParams) to avoid
 * the Suspense-boundary requirement. Shared by all three role consoles.
 */
export function usePromptDeepLink(
  loading: boolean,
  sendMessage: (message: string) => void | Promise<void>,
) {
  const sent = useRef(false)
  useEffect(() => {
    if (loading || sent.current) return
    const p = new URLSearchParams(window.location.search).get('prompt')
    if (!p || !p.trim()) return
    sent.current = true
    window.history.replaceState({}, '', window.location.pathname)
    void sendMessage(p.trim())
  }, [loading, sendMessage])
}

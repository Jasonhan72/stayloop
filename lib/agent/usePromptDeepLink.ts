'use client'

import { useEffect, useRef } from 'react'

/**
 * Deep-link task hand-off: workspace CTAs navigate to /x/agent?prompt=<task>.
 *
 * Default (2026-09-23): the prompt is PREFILLED into the composer — the user
 * reads it, fills any 【…】 placeholder, and presses send. Nothing goes to the
 * assistant on its own, so example wording from a demo page can never become
 * "the user's facts". Links whose text is built from the caller's own rows
 * (a real applicant's email, a real lease) may opt into auto-send with
 * `&send=1`; a prompt containing 【…】 is never auto-sent.
 *
 * Uses window.location (not useSearchParams) to avoid the Suspense-boundary
 * requirement. Shared by all three role consoles.
 */
export function usePromptDeepLink(
  loading: boolean,
  sendMessage: (message: string) => void | Promise<void>,
  prefill?: (message: string) => void,
) {
  const done = useRef(false)
  useEffect(() => {
    if (loading || done.current) return
    const params = new URLSearchParams(window.location.search)
    const p = params.get('prompt')
    if (!p || !p.trim()) return
    done.current = true
    const text = p.trim()
    const wantsSend = params.get('send') === '1' && !/【[^】]*】/.test(text)
    window.history.replaceState({}, '', window.location.pathname)
    if (wantsSend || !prefill) void sendMessage(text)
    else prefill(text)
  }, [loading, sendMessage, prefill])
}

'use client'

import { useEffect } from 'react'

/**
 * Defensive fallback: if Supabase OAuth redirects to the wrong page
 * (e.g. homepage instead of /auth/callback), detect #access_token in
 * the URL hash and bounce the user to /auth/callback so the token
 * gets processed properly.
 */
export default function HashRedirect() {
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('access_token=')) {
      const path = window.location.pathname
      // Already on callback or reset-password — let the page handler deal with it
      if (path === '/auth/callback' || path === '/auth/reset-password') return

      // If hash contains type=recovery, redirect to reset-password page
      if (hash.includes('type=recovery')) {
        window.location.replace('/auth/reset-password' + hash)
        return
      }

      // Otherwise redirect to /auth/callback, preserving the hash fragment
      window.location.replace('/auth/callback' + hash)
    }
  }, [])

  return null
}

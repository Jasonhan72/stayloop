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
      // Already on the callback page — let the callback handler deal with it
      if (window.location.pathname === '/auth/callback') return

      // Redirect to /auth/callback, preserving the hash fragment
      window.location.replace('/auth/callback' + hash)
    }
  }, [])

  return null
}

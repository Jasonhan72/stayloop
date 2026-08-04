'use client'

// Signed-in users skip the marketing landing entirely: every legacy bookmark,
// nav link and report back-link points at /screening, and for an existing
// user those must keep meaning "my screening workspace", exactly as before
// the landing page existed. Visitors without a session see the landing.
//
// Renders nothing — it only forwards. replace() rather than push() so the
// landing page doesn't pollute the back button for signed-in users.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AutoEnter() {
  const router = useRouter()
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) router.replace('/screening/app')
    })
    return () => { cancelled = true }
  }, [router])
  return null
}

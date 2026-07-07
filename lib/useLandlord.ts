'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'

export interface LandlordSession {
  authId: string
  email: string
  landlordId: string
  // Real name from landlords.full_name (falling back to the auth profile) —
  // use this for display instead of the email prefix.
  fullName: string | null
}

interface UseLandlordReturn {
  landlord: LandlordSession | null
  loading: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Reads the current Supabase auth session and resolves it to the
 * Stayloop `landlords` row (creating one via the `claim_landlord`
 * RPC on first login). Redirects to /login if there's no session.
 */
export function useLandlord(): UseLandlordReturn {
  const router = useRouter()
  const [landlord, setLandlord] = useState<LandlordSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (cancelled?: { current: boolean }) => {
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled?.current) return
      if (!session) {
        setLandlord(null)
        return
      }

      const authId = session.user.id
      const email = session.user.email || ''
      const metaName = ((session.user.user_metadata as Record<string, unknown> | null)?.full_name as string) || null

      // Try to find existing
      const { data: existing } = await supabase
        .from('landlords')
        .select('id, auth_id, email, full_name')
        .eq('auth_id', authId)
        .maybeSingle()

      if (cancelled?.current) return
      if (existing) {
        setLandlord({ authId, email, landlordId: existing.id, fullName: existing.full_name || metaName })
        return
      }

      // Claim via SECURITY DEFINER RPC (idempotent INSERT ON CONFLICT)
      const { data: claimed, error } = await supabase.rpc('claim_landlord')
      if (cancelled?.current) return
      if (!error && claimed) {
        const claimedId = typeof claimed === 'object' && claimed !== null ? (claimed as { id: string }).id : claimed
        setLandlord({ authId, email, landlordId: claimedId as string, fullName: metaName })
      } else {
        console.warn('claim_landlord failed', error?.message)
        setLandlord(null)
      }
    } finally {
      if (!cancelled?.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const cancelled = { current: false }
    refresh(cancelled)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh(cancelled)
    })
    return () => {
      cancelled.current = true
      sub.subscription.unsubscribe()
    }
  }, [refresh])

  // Redirect unauthenticated users to /login
  useEffect(() => {
    if (!loading && !landlord) {
      // Defer one tick so SSR doesn't redirect during hydration
      const timer = setTimeout(() => {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          router.replace('/login?redirect=' + encodeURIComponent(window.location.pathname))
        }
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [loading, landlord, router])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setLandlord(null)
    router.replace('/')
  }, [router])

  return { landlord, loading, signOut, refresh }
}

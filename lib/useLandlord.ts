'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'

export interface LandlordSession {
  authId: string
  email: string
  landlordId: string
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

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setLandlord(null)
        return
      }

      const authId = session.user.id
      const email = session.user.email || ''

      // Try to find existing
      const { data: existing } = await supabase
        .from('landlords')
        .select('id, auth_id, email')
        .eq('auth_id', authId)
        .maybeSingle()

      if (existing) {
        setLandlord({ authId, email, landlordId: existing.id })
        return
      }

      // Claim via SECURITY DEFINER RPC (matches by email)
      const { data: claimed, error } = await supabase.rpc('claim_landlord')
      if (!error && claimed) {
        setLandlord({ authId, email, landlordId: (claimed as any).id || claimed })
      } else {
        // Fall back: create manually
        const { data: created } = await supabase
          .from('landlords')
          .insert({ auth_id: authId, email, plan: 'free' })
          .select('id')
          .maybeSingle()
        if (created) setLandlord({ authId, email, landlordId: created.id })
        else setLandlord(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh()
    })
    return () => sub.subscription.unsubscribe()
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

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'

export interface LandlordSession {
  authId: string
  email: string
  landlordId: string
}

export function useLandlord(redirectIfMissing = true) {
  const router = useRouter()
  const [landlord, setLandlord] = useState<LandlordSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        if (active) {
          setLoading(false)
          if (redirectIfMissing) router.replace('/login')
        }
        return
      }

      const { data: row } = await supabase
        .from('landlords')
        .select('id, email')
        .eq('auth_id', session.user.id)
        .maybeSingle()

      if (!active) return

      if (!row) {
        // Should have been created at callback; bounce to login as a safety net
        setLoading(false)
        if (redirectIfMissing) router.replace('/login')
        return
      }

      setLandlord({
        authId: session.user.id,
        email: row.email,
        landlordId: row.id,
      })
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [router, redirectIfMissing])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return { landlord, loading, signOut }
}

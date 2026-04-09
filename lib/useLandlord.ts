'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './supabase'

export interface LandlordSession {
  authId: string
  email: string
  landlordId: string
  isAnonymous: boolean
}

export interface UseLandlordOptions {
  /** If true (default), redirect unauthenticated visitors to /login. */
  redirectIfMissing?: boolean
  /** If true, fall back to anonymous sign-in for visitors. Default: false (real login required). */
  allowAnonymous?: boolean
  /** Path to redirect back to after login completes. */
  redirectBackTo?: string
}

export function useLandlord(
  redirectIfMissingOrOpts: boolean | UseLandlordOptions = true,
) {
  const opts: UseLandlordOptions =
    typeof redirectIfMissingOrOpts === 'boolean'
      ? { redirectIfMissing: redirectIfMissingOrOpts }
      : redirectIfMissingOrOpts
  const redirectIfMissing = opts.redirectIfMissing ?? true
  const allowAnonymous = opts.allowAnonymous ?? false
  const redirectBackTo = opts.redirectBackTo

  const router = useRouter()
  const [landlord, setLandlord] = useState<LandlordSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    function bounceToLogin() {
      const next = redirectBackTo ? `?next=${encodeURIComponent(redirectBackTo)}` : ''
      router.replace(`/login${next}`)
    }

    async function load() {
      let { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        if (allowAnonymous) {
          const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously()
          if (anonErr || !anon?.session?.user) {
            if (active) {
              setLoading(false)
              if (redirectIfMissing) bounceToLogin()
            }
            return
          }
          session = anon.session
        } else {
          if (active) {
            setLoading(false)
            if (redirectIfMissing) bounceToLogin()
          }
          return
        }
      } else if (!allowAnonymous && (session.user as any).is_anonymous) {
        if (active) {
          setLoading(false)
          if (redirectIfMissing) bounceToLogin()
        }
        return
      }

      let { data: row } = await supabase
        .from('landlords')
        .select('id, email')
        .eq('auth_id', session.user.id)
        .maybeSingle()

      if (!active) return

      if (!row) {
        const { data: claimed, error: claimErr } = await supabase.rpc('claim_landlord')
        if (claimErr || !claimed) {
          console.error('claim_landlord failed', claimErr)
          setLoading(false)
          if (redirectIfMissing) bounceToLogin()
          return
        }
        row = { id: claimed.id, email: claimed.email }
      }

      setLandlord({
        authId: session.user.id,
        email: row.email,
        landlordId: row.id,
        isAnonymous: !!(session.user as any).is_anonymous,
      })
      setLoading(false)
    }

    load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, redirectIfMissing, allowAnonymous, redirectBackTo])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return { landlord, loading, signOut }
}

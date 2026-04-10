'use client'

import { supabase } from './supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export type UserRole = 'landlord' | 'tenant' | 'agent'

export interface UserSession {
  authId: string
  email: string
  profileId: string
  role: UserRole
  fullName: string
  plan: string
  isAnonymous: boolean
}

export interface UseUserOptions {
  redirectIfMissing?: boolean
  allowAnonymous?: boolean
  redirectPath?: string
}

export interface UseUserReturn {
  user: UserSession | null
  loading: boolean
  signOut: () => Promise<void>
}

export interface UseAnonTrialReturn {
  canScreen: boolean
  trialUsed: boolean
  markTrialUsed: () => void
}

/**
 * Hook to manage user authentication and profile data
 * Handles anonymous sign-in, profile fetching, and auto-claim logic
 */
export function useUser(opts: UseUserOptions = {}): UseUserReturn {
  const {
    redirectIfMissing = false,
    allowAnonymous = false,
    redirectPath = '/login',
  } = opts

  const router = useRouter()
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const initUser = async () => {
      try {
        // Check for existing session
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          if (redirectIfMissing && isMounted) {
            router.push(redirectPath)
          }
          return
        }

        // No session
        if (!sessionData?.session) {
          // If anonymous is allowed, sign in anonymously
          if (allowAnonymous) {
            const { data: anonData, error: anonError } =
              await supabase.auth.signInAnonymously()

            if (anonError) {
              console.error('Anonymous sign-in error:', anonError)
              if (redirectIfMissing && isMounted) {
                router.push(redirectPath)
              }
              return
            }

            if (!anonData.user) {
              if (redirectIfMissing && isMounted) {
                router.push(redirectPath)
              }
              return
            }

            // Claim a profile row for the anonymous user (needed for screenings FK)
            const { data: anonClaim } = await supabase.rpc('claim_landlord', { p_role: 'tenant' })
            if (isMounted) {
              setUser({
                authId: anonData.user.id,
                email: anonData.user.email || '',
                profileId: anonClaim?.id || '',
                role: 'tenant',
                fullName: '',
                plan: 'free',
                isAnonymous: true,
              })
              setLoading(false)
            }
            return
          }

          // No session and anonymous not allowed
          if (redirectIfMissing && isMounted) {
            router.push(redirectPath)
          }
          if (isMounted) {
            setLoading(false)
          }
          return
        }

        const authUser = sessionData.session.user
        const authId = authUser.id
        const email = authUser.email || ''

        // Fetch profile from landlords table (using auth_id)
        const { data: profileData, error: profileError } = await supabase
          .from('landlords')
          .select('*')
          .eq('auth_id', authId)
          .single()

        if (profileError && profileError.code !== 'PGRST116') {
          // PGRST116 = not found (which is expected, we'll create it)
          console.error('Profile fetch error:', profileError)
        }

        // Profile exists
        if (profileData) {
          if (isMounted) {
            setUser({
              authId,
              email,
              profileId: profileData.id,
              role: profileData.role || 'landlord',
              fullName: profileData.full_name || '',
              plan: profileData.plan || 'free',
              isAnonymous: false,
            })
            setLoading(false)
          }
          return
        }

        // No profile row — claim one via RPC
        const { data: claimData, error: claimError } = await supabase.rpc(
          'claim_landlord',
          { p_role: 'landlord' }
        )

        if (claimError) {
          console.error('Claim landlord error:', claimError)
          if (isMounted) {
            setLoading(false)
          }
          return
        }

        // Create session with claimed profile
        if (claimData && isMounted) {
          setUser({
            authId,
            email,
            profileId: claimData.id || authId,
            role: claimData.role || 'landlord',
            fullName: claimData.full_name || '',
            plan: claimData.plan || 'free',
            isAnonymous: false,
          })
        }

        if (isMounted) {
          setLoading(false)
        }
      } catch (err) {
        console.error('useUser error:', err)
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    initUser()

    return () => {
      isMounted = false
    }
  }, [redirectIfMissing, allowAnonymous, redirectPath, router])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push('/login')
  }

  return { user, loading, signOut }
}

/**
 * Simple shorthand to require authenticated user
 * Redirects to /login if not authenticated
 */
export function useRequireAuth(): UseUserReturn {
  return useUser({ redirectIfMissing: true })
}

/**
 * Hook to manage anonymous user trial screening limit
 * Tracks trial usage in localStorage and enforces the 1-screen limit
 */
export function useAnonTrialCheck(): UseAnonTrialReturn {
  const [canScreen, setCanScreen] = useState(true)
  const [trialUsed, setTrialUsed] = useState(false)

  useEffect(() => {
    const screens = localStorage.getItem('sl_anon_screens')
    const screensCount = screens ? parseInt(screens, 10) : 0

    if (screensCount >= 1) {
      setCanScreen(false)
      setTrialUsed(true)
    } else {
      setCanScreen(true)
      setTrialUsed(false)
    }
  }, [])

  const markTrialUsed = () => {
    const screens = localStorage.getItem('sl_anon_screens')
    const screensCount = (screens ? parseInt(screens, 10) : 0) + 1
    localStorage.setItem('sl_anon_screens', screensCount.toString())
    setCanScreen(false)
    setTrialUsed(true)
  }

  return { canScreen, trialUsed, markTrialUsed }
}

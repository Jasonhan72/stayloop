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

// ─── Module-level session cache ─────────────────────────────────────────────
// Every page that uses AppHeader (or MarketingNav, or any component that calls
// useUser) re-mounts on client-side navigation. Without a cache, each mount
// re-runs initUser() and the avatar briefly disappears as `loading` flips back
// to true. We cache the resolved session here so subsequent useUser() calls
// hydrate instantly from the last-known value, then re-validate in the
// background. The auth state listener invalidates this cache on sign-out /
// sign-in / token refresh so we never serve stale data.
let cachedUser: UserSession | null | undefined = undefined

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
  // Hydrate from module cache on mount so navigations between pages don't
  // flash the loading state. If the cache is empty (first ever mount this
  // session), we still go through the normal initUser() path below.
  const [user, setUser] = useState<UserSession | null>(cachedUser ?? null)
  const [loading, setLoading] = useState(cachedUser === undefined)

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
            const anonSession: UserSession = {
              authId: anonData.user.id,
              email: anonData.user.email || '',
              profileId: anonClaim?.id || '',
              role: 'tenant',
              fullName: '',
              plan: 'free',
              isAnonymous: true,
            }
            cachedUser = anonSession
            if (isMounted) {
              setUser(anonSession)
              setLoading(false)
            }
            return
          }

          // No session and anonymous not allowed
          cachedUser = null
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
          const session: UserSession = {
            authId,
            email,
            profileId: profileData.id,
            role: profileData.role || 'landlord',
            fullName: profileData.full_name || '',
            plan: profileData.plan || 'free',
            isAnonymous: false,
          }
          cachedUser = session
          if (isMounted) {
            setUser(session)
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
        if (claimData) {
          const session: UserSession = {
            authId,
            email,
            profileId: claimData.id || authId,
            role: claimData.role || 'landlord',
            fullName: claimData.full_name || '',
            plan: claimData.plan || 'free',
            isAnonymous: false,
          }
          cachedUser = session
          if (isMounted) {
            setUser(session)
          }
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

    // Listen for auth state changes (login/logout/token refresh) so the
    // header avatar + role-aware CTAs update without a hard refresh.
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      if (event === 'SIGNED_OUT' || !session) {
        cachedUser = null
        setUser(null)
        return
      }
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED' ||
        event === 'INITIAL_SESSION'
      ) {
        // Re-run initUser to fetch the fresh profile row. Don't flip the
        // loading state if we already have a cached session — we'll just
        // refresh in the background while the avatar stays visible.
        if (cachedUser === undefined) setLoading(true)
        void initUser()
      }
    })

    return () => {
      isMounted = false
      sub?.data?.subscription?.unsubscribe()
    }
  }, [redirectIfMissing, allowAnonymous, redirectPath, router])

  const signOut = async () => {
    cachedUser = null
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

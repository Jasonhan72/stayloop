// 2026-06-02 — Audit §9 P1 — Guard claim_landlord RPC against repeat calls.
// Before this patch, every empty-profile path in initUser() would dispatch
// `supabase.rpc('claim_landlord', ...)`, and because useUser() re-runs on
// every component mount (and again on every onAuthStateChange event that
// re-invokes initUser), a single page could fire the RPC several times in
// a few hundred milliseconds — once per mounted header / nav / sidebar.
// The new behaviour: track per-auth-user attempts in a module-level set so
// the RPC fires AT MOST ONCE per browser session per user. If profile
// fetch succeeds (the row already exists) we ALSO mark the user as
// "claimed" so a later cache miss won't redundantly hit the RPC. The
// auth-state listener clears the flag on SIGNED_OUT so a fresh sign-in by
// a different account behaves correctly.
//
// All other behaviour from the 2026-06-02 §1 P1 patch (cachedUser reset
// on getSession failure) is preserved exactly.
// -----------------------------------------------------------------------------
// 2026-06-02 — Code review §1 P1 — Clear cachedUser on session-fetch error so
// stale module-level state isn't served as a valid session. onAuthStateChange
// will re-hydrate the cache on the next successful sign-in/token-refresh.
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

// ─── §9 P1: per-user claim_landlord guard ───────────────────────────────────
// `claim_landlord` is idempotent server-side (it returns the existing row
// when one is present), but it still hits the DB and counts against our
// Supabase quota. Before this guard, a header + sidebar + dashboard widget
// each calling useUser() in parallel could fire 3+ identical RPCs within
// a single page paint. We key the guard by Supabase auth_id (NOT email)
// because the same user can have an auth_id swap across anonymous → real
// upgrades — keying by id catches that correctly.
//
// Reset by:
//   - SIGNED_OUT (auth-state listener clears the entire map)
//   - the user's existing profile row is fetched successfully (we mark
//     them claimed there too — the RPC's only side effect is to create
//     the row, and the row already exists)
const _claimAttempted: Record<string, boolean> = {}

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
          // 2026-06-02 — §1 P1 — Drop the stale cache on getSession failure.
          // Previously this branch returned early and kept cachedUser pointing
          // at the last-known session, which meant a user whose token had
          // actually expired (or been revoked) would keep seeing themselves
          // logged in across mounts until SIGNED_OUT fired. Clearing here
          // forces every subsequent useUser() mount to re-prove the session,
          // and the onAuthStateChange subscriber below will re-hydrate the
          // cache on the next successful SIGNED_IN/TOKEN_REFRESHED event.
          cachedUser = undefined
          if (isMounted) {
            setUser(null)
            setLoading(false)
            if (redirectIfMissing) {
              router.push(redirectPath)
            }
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

            // §9 P1: skip the claim_landlord RPC if we've already attempted
            // it for this anonymous auth_id this session.
            const anonAuthId = anonData.user.id
            let anonClaim: { id?: string } | null = null
            if (!_claimAttempted[anonAuthId]) {
              _claimAttempted[anonAuthId] = true
              const { data } = await supabase.rpc('claim_landlord', { p_role: 'tenant' })
              anonClaim = (data as { id?: string } | null) ?? null
            }
            const anonSession: UserSession = {
              authId: anonAuthId,
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

          // No session and anonymous not allowed.
          // If we have a hydrated cachedUser from a previous mount, the user
          // is already logged in — trust the cache instead of bouncing them
          // to /login. The Supabase auth state listener (registered below)
          // will fire SIGNED_OUT and clear the cache if they actually logged
          // out, so we'll redirect at that point.
          if (cachedUser) {
            if (isMounted) {
              setUser(cachedUser)
              setLoading(false)
            }
            return
          }
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
          // §9 P1: row already exists — no need to ever call claim_landlord
          // for this user this session. Set the flag so a later cache miss
          // (e.g. TOKEN_REFRESHED re-running initUser) won't dispatch the
          // RPC redundantly.
          _claimAttempted[authId] = true
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

        // No profile row — claim one via RPC, but only if we haven't
        // already done so this session. If the guard says we tried before,
        // we fall through to building a minimal session from the auth
        // user; the next page load (or token refresh that re-runs the
        // profile fetch) will pick up the row that the prior attempt
        // created. This avoids a thundering-herd of RPC calls when several
        // useUser() consumers mount in the same paint.
        if (_claimAttempted[authId]) {
          const session: UserSession = {
            authId,
            email,
            profileId: authId,
            role: 'landlord',
            fullName: '',
            plan: 'free',
            isAnonymous: false,
          }
          cachedUser = session
          if (isMounted) {
            setUser(session)
            setLoading(false)
          }
          return
        }

        _claimAttempted[authId] = true
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
        // §9 P1: forget every per-user claim flag on sign-out so a fresh
        // sign-in by a different account behaves correctly (and so the
        // same user signing back in after a deliberate logout gets a
        // fresh probe — they may have changed their role in the DB).
        for (const k of Object.keys(_claimAttempted)) {
          delete _claimAttempted[k]
        }
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
    // §9 P1: forget every per-user claim flag on explicit signOut() too.
    for (const k of Object.keys(_claimAttempted)) {
      delete _claimAttempted[k]
    }
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

'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { clearCachedAiNames } from '@/lib/aiName'
import { clearStoredAvatar } from '@/lib/agent/avatars'
import { rememberableRoleFromPath, roleFromPath } from '@/lib/activeRole'
export { roleFromPath }
import { getSupabaseBrowser } from './supabase'
import type { Session, User } from '@supabase/supabase-js'

export type Role = 'tenant' | 'landlord' | 'agent' | null

export interface AuthState {
  loading: boolean
  user: User | null
  session: Session | null
  role: Role
  fullName: string | null
  email: string | null
}

const ROLE_KEY = 'sl-active-role'
/** Fired by setRole() so every useAuth() instance on the page picks up the new hat. */
export const ROLE_CHANGED_EVENT = 'sl-role-changed'
/** The remembered hat is per account: a landlord signing in after an agent on
 *  the same browser was shown the agent identity on /settings (2026-09-25). */
export const roleStorageKey = (uid?: string | null): string => (uid ? `${ROLE_KEY}:${uid}` : ROLE_KEY)

/**
 * V5 client-side auth hook. Reads Supabase session and exposes the
 * "active role" (tenant / landlord / agent) selected during onboarding.
 *
 * The active role is purposely client-stored so a logged-in user can
 * switch contexts (e.g. landlord viewing tenant-side preview) without
 * a hard reload — the role guarding for sensitive RPCs still happens
 * server-side via Supabase RLS.
 */
export function useAuth(): AuthState & { setRole: (r: Role) => void; signOut: () => Promise<void> } {
  const pathname = usePathname()
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    session: null,
    role: null,
    fullName: null,
    email: null,
  })

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    let cancelled = false

    const readRole = (uid?: string | null): Role => {
      if (typeof window === 'undefined' || !uid) return null
      const v = window.localStorage.getItem(roleStorageKey(uid)) as Role
      return v === 'tenant' || v === 'landlord' || v === 'agent' ? v : null
    }

    // Both getSession() and the INITIAL_SESSION / SIGNED_IN events hand back a
    // freshly parsed session object for the SAME login. Every effect in the app
    // keyed on `auth.user` re-ran once per object — every REST query on a page
    // load fired twice (perf review 2026-09-23). Keep the previous references
    // when nothing about the login changed, and skip the state update entirely
    // when there is nothing new to render.
    const apply = (s: Session | null, event?: string) => {
      setState((prev) => {
        const sameUser = !!prev.user && !!s?.user && prev.user.id === s.user.id
        const sameToken = prev.session?.access_token === s?.access_token
        const role = readRole(s?.user?.id)
        if (!prev.loading && sameUser && sameToken && event !== 'USER_UPDATED' && prev.role === role) return prev
        if (!prev.loading && !prev.user && !s && prev.role === role) return prev
        const user = sameUser && event !== 'USER_UPDATED' ? prev.user : (s?.user ?? null)
        const session = sameUser && sameToken && event !== 'USER_UPDATED' ? prev.session : (s ?? null)
        return {
          loading: false,
          user,
          session,
          role,
          email: user?.email ?? null,
          fullName: (user?.user_metadata as any)?.full_name ?? (sameUser ? prev.fullName : null),
        }
      })
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      apply(data.session ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return
      // Clear the persisted role on sign-out so it can't bleed into the next
      // user who logs in on the same browser.
      if (event === 'SIGNED_OUT' && typeof window !== 'undefined') {
        for (const k of Object.keys(window.localStorage)) if (k === ROLE_KEY || k.startsWith(`${ROLE_KEY}:`)) window.localStorage.removeItem(k)
      }
      apply(s ?? null, event)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const setRole = (r: Role) => {
    // Persist OUTSIDE the state updater: an updater queued by a component that
    // unmounts in the same event never runs (the hero re-keys on a hat switch,
    // so the hat label that called setRole is gone before React gets to it —
    // prod 2026-09-25: the hero switched, localStorage kept the old hat).
    if (typeof window !== 'undefined' && state.user) {
      if (r) window.localStorage.setItem(roleStorageKey(state.user.id), r)
      else window.localStorage.removeItem(roleStorageKey(state.user.id))
    }
    setState((prev) => (prev.role === r ? prev : { ...prev, role: r }))
    // Every useAuth() instance keeps its own copy of the remembered role; a
    // switch made in one (the hat label in the homepage hero, 2026-09-25) must
    // reach the others on the page (the Header's identity menu, the hero).
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: r }))
  }
  useEffect(() => {
    const onChanged = (e: Event) => {
      const r = ((e as CustomEvent<Role>).detail ?? null) as Role
      setState((prev) => (prev.role === r ? prev : { ...prev, role: r }))
    }
    window.addEventListener(ROLE_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, onChanged)
  }, [])

  const signOut = async () => {
    clearCachedAiNames()
    clearStoredAvatar()
    const supabase = getSupabaseBrowser()
    await supabase.auth.signOut()
    setRole(null)
    // Hard navigation home: drops every in-memory cache (avatar, role,
    // agent state) so the next account on this browser starts clean, and
    // no page is left rendering a user-null state it never designed for
    // (the screening app sat on its "authenticating" spinner forever).
    if (typeof window !== 'undefined') window.location.assign('/')
  }

  // Active hat = route prefix first (design/multi-role-accounts-2026-09.md
  // §3: the URL is the truth), remembered role as the fallback on neutral
  // pages such as /settings or the home page.
  // Being on a role-prefixed page IS the choice: remember it for this account.
  // Before 2026-09-25 only the login callback and the hat menu wrote it, so an
  // account that never switched hats had nothing remembered on /settings.
  useEffect(() => {
    // Gate pages (/landlord/become, /agent/verify, the screening app) carry a
    // prefix without being a choice — review 2026-09-25.
    const r = rememberableRoleFromPath(pathname)
    if (!r || !state.user || typeof window === 'undefined') return
    const key = roleStorageKey(state.user.id)
    if (window.localStorage.getItem(key) !== r) window.localStorage.setItem(key, r)
    if (state.role !== r) setState((prev) => ({ ...prev, role: r }))
  }, [pathname, state.user, state.role])

  return { ...state, role: roleFromPath(pathname) ?? state.role, setRole, signOut }
}

'use client'

import { useEffect, useState } from 'react'
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

    const readRole = (): Role => {
      if (typeof window === 'undefined') return null
      const v = window.localStorage.getItem(ROLE_KEY) as Role
      return v === 'tenant' || v === 'landlord' || v === 'agent' ? v : null
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const s = data.session
      setState({
        loading: false,
        user: s?.user ?? null,
        session: s ?? null,
        role: readRole(),
        email: s?.user?.email ?? null,
        fullName: (s?.user?.user_metadata as any)?.full_name ?? null,
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return
      setState((prev) => ({
        ...prev,
        loading: false,
        user: s?.user ?? null,
        session: s ?? null,
        email: s?.user?.email ?? null,
        fullName: (s?.user?.user_metadata as any)?.full_name ?? prev.fullName,
        role: readRole(),
      }))
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const setRole = (r: Role) => {
    if (typeof window !== 'undefined') {
      if (r) window.localStorage.setItem(ROLE_KEY, r)
      else window.localStorage.removeItem(ROLE_KEY)
    }
    setState((prev) => ({ ...prev, role: r }))
  }

  const signOut = async () => {
    const supabase = getSupabaseBrowser()
    await supabase.auth.signOut()
    setRole(null)
  }

  return { ...state, setRole, signOut }
}

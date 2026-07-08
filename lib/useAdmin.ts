'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './useAuth'

export type AdminRole = 'admin' | 'superadmin'

// Header mounts on every page and calls this to gate one menu item, so cache
// the admin_users resolve per user for the session — otherwise every
// navigation issues an admin_users SELECT that returns null for ~all users.
const roleResolve = new Map<string, Promise<AdminRole | null>>()

function resolveAdminRole(userId: string): Promise<AdminRole | null> {
  const cached = roleResolve.get(userId)
  if (cached) return cached
  const p = (async () => {
    try {
      const { data } = await supabase.from('admin_users').select('role').eq('user_id', userId).maybeSingle()
      return (data?.role as AdminRole) ?? null
    } catch {
      return null
    }
  })()
  roleResolve.set(userId, p)
  return p
}

/**
 * Resolves whether the signed-in user belongs to the Stayloop back-office
 * admin group (admin_users). Client-side gate only — real enforcement is the
 * RLS policies / SECURITY DEFINER RPCs keyed on is_stayloop_admin().
 */
export function useAdmin(): { loading: boolean; role: AdminRole | null } {
  const auth = useAuth()
  const [state, setState] = useState<{ loading: boolean; role: AdminRole | null }>({ loading: true, role: null })

  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { setState({ loading: false, role: null }); return }
    let cancelled = false
    resolveAdminRole(auth.user.id).then((role) => {
      if (!cancelled) setState({ loading: false, role })
    })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])

  return state
}

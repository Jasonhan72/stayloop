'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './useAuth'

export type AdminRole = 'admin' | 'superadmin'

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
    supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', auth.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setState({ loading: false, role: (data?.role as AdminRole) ?? null })
      })
    return () => { cancelled = true }
  }, [auth.loading, auth.user])

  return state
}

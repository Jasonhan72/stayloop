'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

interface UseEntitlementsReturn {
  entitlements: Record<string, unknown> | null
  loading: boolean
}

/**
 * Fetches the per-role feature map from the `get_entitlements(p_role)` RPC
 * (plan-derived — see 20260608_billing_commission.sql) for the signed-in
 * user. Returns null entitlements when anonymous or on error; fetches once
 * per role.
 */
export function useEntitlements(role: string | null): UseEntitlementsReturn {
  const [entitlements, setEntitlements] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cancelled = { current: false }

    const load = async () => {
      setLoading(true)
      try {
        if (!role) {
          if (!cancelled.current) setEntitlements(null)
          return
        }
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (cancelled.current) return
        if (!session) {
          setEntitlements(null)
          return
        }
        const { data, error } = await supabase.rpc('get_entitlements', { p_role: role })
        if (cancelled.current) return
        if (!error && data && typeof data === 'object') {
          setEntitlements(data as Record<string, unknown>)
        } else {
          if (error) console.warn('get_entitlements failed', error.message)
          setEntitlements(null)
        }
      } finally {
        if (!cancelled.current) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled.current = true
    }
  }, [role])

  return { entitlements, loading }
}

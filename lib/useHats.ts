'use client'

// The hats an account holds (design/multi-role-accounts-2026-09.md):
// tenant (every signed-in user), landlord (a landlords row exists), agent
// (an agent_profiles row exists — its status decides what the hat may do)
// and admin. Read from the my_hats() RPC — the server's answer, not the
// localStorage "active role", which is only a UI preference.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import type { AgentStatus } from '@/lib/agentProfile'

export type Hats = {
  loading: boolean
  tenant: boolean
  landlord: boolean
  /** null = no agent profile; otherwise the verification status */
  agent: AgentStatus | null
  admin: boolean
}

const EMPTY: Hats = { loading: true, tenant: false, landlord: false, agent: null, admin: false }
let cache: { uid: string; hats: Hats } | null = null

export function useHats(): Hats & { refresh: () => Promise<void> } {
  const auth = useAuth()
  const [hats, setHats] = useState<Hats>(cache && cache.uid === auth.user?.id ? cache.hats : EMPTY)

  async function load(uid: string) {
    const { data, error } = await supabase.rpc('my_hats')
    if (error) { setHats((h) => ({ ...h, loading: true })); return }
    const d = (data || {}) as { tenant?: boolean; landlord?: boolean; agent?: AgentStatus | null; admin?: boolean }
    const next: Hats = { loading: false, tenant: true, landlord: !!d.landlord, agent: (d.agent as AgentStatus | null) ?? null, admin: !!d.admin }
    cache = { uid, hats: next }
    setHats(next)
  }

  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { cache = null; setHats({ ...EMPTY, loading: false }); return }
    if (cache && cache.uid === auth.user.id) { setHats(cache.hats); return }
    load(auth.user.id)
  }, [auth.loading, auth.user])

  return { ...hats, refresh: async () => { if (auth.user) await load(auth.user.id) } }
}

/** Invalidate after the user gains a hat (published a listing, submitted an agent profile). */
export function invalidateHats() { cache = null }

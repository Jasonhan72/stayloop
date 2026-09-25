'use client'

// The hats an account holds (design/multi-role-accounts-2026-09.md):
// tenant (every signed-in user), landlord (a landlords row exists), agent
// (an agent_profiles row exists — its status decides what the hat may do)
// and admin. Read from the my_hats() RPC — the server's answer, not the
// localStorage "active role", which is only a UI preference.
import { useEffect, useState } from 'react'
import { isRegistrationLive } from '@/lib/agentProfile'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import type { AgentStatus } from '@/lib/agentProfile'

export type Hats = {
  loading: boolean
  tenant: boolean
  landlord: boolean
  /** null = no agent profile; otherwise the verification status */
  agent: AgentStatus | null
  /** null = no service_providers row; otherwise pending / verified / rejected / suspended / expired */
  provider: string | null
  admin: boolean
}

const EMPTY: Hats = { loading: true, tenant: false, landlord: false, agent: null, provider: null, admin: false }
let cache: { uid: string; hats: Hats } | null = null
// Header, WorkspaceShell and pages all mount useHats in the same tick; before
// the cache is filled each instance issued its own my_hats RPC. One in-flight
// promise per user (perf review 2026-09-23).
let inflight: { uid: string; p: Promise<Hats | null> } | null = null

function fetchHats(uid: string): Promise<Hats | null> {
  if (inflight && inflight.uid === uid) return inflight.p
  const p = Promise.resolve(supabase.rpc('my_hats')).then(({ data, error }) => {
    if (error) return null
    const d = (data || {}) as { tenant?: boolean; landlord?: boolean; agent?: AgentStatus | null; provider?: string | null; admin?: boolean }
    const next: Hats = { loading: false, tenant: true, landlord: !!d.landlord, agent: (d.agent as AgentStatus | null) ?? null, provider: typeof d.provider === 'string' ? d.provider : null, admin: !!d.admin }
    cache = { uid, hats: next }
    return next
  }).finally(() => { if (inflight?.p === p) inflight = null })
  inflight = { uid, p }
  return p
}

export function useHats(): Hats & { refresh: () => Promise<void> } {
  const auth = useAuth()
  const [hats, setHats] = useState<Hats>(cache && cache.uid === auth.user?.id ? cache.hats : EMPTY)

  async function load(uid: string) {
    const next = await fetchHats(uid)
    if (!next) { setHats((h) => ({ ...h, loading: true })); return }
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
export function invalidateHats() { cache = null; inflight = null }

/** The hat to assume when nothing is remembered for this account (/settings,
 *  the header chip): a live agent registration, else landlord, else tenant. */
export function bestHat(h: Pick<Hats, 'landlord' | 'agent'>): 'tenant' | 'landlord' | 'agent' {
  if (h.agent && isRegistrationLive(h.agent)) return 'agent'
  return h.landlord ? 'landlord' : 'tenant'
}

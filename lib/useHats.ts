'use client'

// The hats an account holds (design/multi-role-accounts-2026-09.md):
// tenant (every signed-in user), landlord (a landlords row exists), agent
// (an agent_profiles row exists — its status decides what the hat may do)
// and admin. Read from the my_hats() RPC — the server's answer, not the
// localStorage "active role", which is only a UI preference.
import { useEffect, useState, useRef } from 'react'
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

/** Waits between retries of a failed my_hats call; the last one repeats. */
export const HATS_RETRY_MS = [1000, 3000, 8000, 15000]

export function useHats(): Hats & { refresh: () => Promise<void> } {
  const auth = useAuth()
  const [hats, setHats] = useState<Hats>(cache && cache.uid === auth.user?.id ? cache.hats : EMPTY)
  const retry = useRef<{ timer: ReturnType<typeof setTimeout> | null; tries: number }>({ timer: null, tries: 0 })

  async function load(uid: string) {
    // Loading is set before the RPC leaves: a consumer that decides once (the
    // homepage redirect, the landlord guard) must never read a stale "loaded"
    // answer while a fetch is in flight (V0.7 follow-up, 2026-09-27).
    setHats((h) => (h.loading ? h : { ...h, loading: true }))
    const next = await fetchHats(uid)
    if (!next) {
      // Still loading — answering "no hats" would bounce a landlord off their own pages — but not
      // for ever: one network blip used to leave /landlord/* and /messages blank until a manual
      // reload (code review 2026-11-15, S2-26). Try again after 1 s, 3 s, 8 s, then every 15 s.
      setHats((h) => ({ ...h, loading: true }))
      if (retry.current.timer) clearTimeout(retry.current.timer)
      const wait = HATS_RETRY_MS[Math.min(retry.current.tries, HATS_RETRY_MS.length - 1)]
      retry.current.tries += 1
      retry.current.timer = setTimeout(() => { retry.current.timer = null; void load(uid) }, wait)
      return
    }
    retry.current.tries = 0
    setHats(next)
  }

  useEffect(() => {
    if (auth.loading) return
    if (!auth.user) { cache = null; setHats({ ...EMPTY, loading: false }); return }
    if (cache && cache.uid === auth.user.id) { setHats(cache.hats); return }
    load(auth.user.id)
    // A pending retry belongs to this user and this mount.
    const r = retry.current
    return () => { if (r.timer) { clearTimeout(r.timer); r.timer = null } r.tries = 0 }
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

/** Does this account hold `role` right now? Tenant always; landlord = a
 *  landlords row; agent = a live RECO registration (verified / renewal_due).
 *  The remembered role is only a preference among held hats — review
 *  2026-09-25: a tenant who had merely visited /landlord/become had
 *  "landlord" remembered and was bounced off /settings by the hat guard. */
export function heldHat(h: Pick<Hats, 'landlord' | 'agent'>, role: string | null | undefined): role is 'tenant' | 'landlord' | 'agent' {
  if (role === 'tenant') return true
  if (role === 'landlord') return h.landlord
  if (role === 'agent') return !!h.agent && isRegistrationLive(h.agent)
  return false
}

/** The role the UI should act as: the remembered one when the account holds it, else the best hat it does hold. */
export function activeHat(h: Pick<Hats, 'landlord' | 'agent'>, remembered: string | null | undefined): 'tenant' | 'landlord' | 'agent' {
  return heldHat(h, remembered) ? remembered : bestHat(h)
}

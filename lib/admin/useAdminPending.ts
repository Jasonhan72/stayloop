'use client'
// Counts of what is waiting on the back office, for admins only (the header asks on every page).
// One RPC, shared for 30 s so the header and the admin home do not each ask;
// ADMIN_PENDING_CHANGED_EVENT (fired by the admin pages after a decision) refreshes it at once.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseAdminPending, type AdminPending } from '@/lib/admin/pendingCounts'

export const ADMIN_PENDING_CHANGED_EVENT = 'sl-admin-pending-changed'
const SHARE_MS = 30_000
let inflight: Promise<AdminPending | null> | null = null
let at = 0
let last: AdminPending | null = null

export function fetchAdminPending(force = false): Promise<AdminPending | null> {
  if (!force && inflight && Date.now() - at < SHARE_MS) return inflight
  at = Date.now()
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('admin_pending_counts')
      // A failed read keeps the last good answer: a network blip must not blank the count.
      if (!error) last = parseAdminPending(data)
    } catch { /* keep the last good answer */ }
    return last
  })()
  return inflight
}

/** Call after an admin decides something, so the header count follows without a reload. */
export function notifyAdminPendingChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ADMIN_PENDING_CHANGED_EVENT))
}

/** null until loaded, and always null for non-admins (no request is made). */
export function useAdminPending(isAdmin: boolean): AdminPending | null {
  const [p, setP] = useState<AdminPending | null>(null)
  useEffect(() => {
    if (!isAdmin) { setP(null); return }
    let on = true
    const load = (force = false) => fetchAdminPending(force).then((v) => { if (on) setP(v) })
    void load()
    const onEvt = () => void load(true)
    const onVis = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener(ADMIN_PENDING_CHANGED_EVENT, onEvt)
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 120_000)
    return () => { on = false; window.removeEventListener(ADMIN_PENDING_CHANGED_EVENT, onEvt); document.removeEventListener('visibilitychange', onVis); clearInterval(iv) }
  }, [isAdmin])
  return p
}

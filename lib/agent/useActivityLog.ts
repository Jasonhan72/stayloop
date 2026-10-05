'use client'

// The "something changed" event every client write fires (a turn, an approval,
// an undo, a rename), and the panel's 「最近替你办完」 hook. Conversations are
// listed by components/agent/ThreadList.tsx; the mixed activity log (and its
// hook) was retired on 2026-10-04.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isOutcomeAction, NOT_AN_OUTCOME, OUTCOME_EVENTS, outcomeHat } from './activityLog'

export { fmtRowTime } from './activityLog'

/** Dispatched after anything that writes a thread or an audit row from the client (a turn, an approval, an undo). */
export const ACTIVITY_CHANGED_EVENT = 'sl-activity-changed'
export function notifyActivityChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACTIVITY_CHANGED_EVENT))
}

export type OutcomeRow = { id: string; action: string; created_at: string; metadata: Record<string, unknown> | null; acting_role?: string | null }

/** 「最近替你办完」 in the panel's 待办 tab (2026-10-04, replacing the 活动 tab): what it finished for
 *  this hat in the last 7 days, newest first, at most `keep`. Filtered to outcome actions IN SQL, before the
 *  limit — every page load and every turn writes an audit row too, and they used to crowd the real outcomes
 *  out of a client-side filter (review 2026-10-04). `enabled` = the tab is on screen. */
export function useRecentOutcomes(live: boolean, role: string, enabled: boolean, keep = 5): OutcomeRow[] | null {
  const [rows, setRows] = useState<OutcomeRow[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(ACTIVITY_CHANGED_EVENT, h)
    return () => window.removeEventListener(ACTIVITY_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!live) { setRows([]); return }
    if (!enabled) return
    let cancelled = false
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    supabase
      .from('agent_audit_events')
      .select('id, action, created_at, metadata, acting_role')
      .or(`action.like.executed_%,action.in.(${OUTCOME_EVENTS.join(',')})`)
      .not('action', 'in', `(${NOT_AN_OUTCOME.join(',')})`)
      .or(`acting_role.eq.${role},acting_role.is.null`)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (cancelled) return
        const mine = ((data ?? []) as OutcomeRow[]).filter((r) => {
          if (!isOutcomeAction(r.action)) return false
          const hat = outcomeHat(r.action, r.acting_role)
          return hat === null || hat === role
        })
        setRows(mine.slice(0, keep))
      }, () => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [live, role, enabled, keep, tick])
  return rows
}

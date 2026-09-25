'use client'

// What the assistant has been doing: the user's own agent_audit_events under
// RLS. One hook for the phone sheet (ActivitySheet) and the web panel
// (AssistantPanel) plus the grouping / icon helpers both render with.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ActivityRow } from './activityLog'

export type { ActivityRow } from './activityLog'
export { activityGroups, activityIcon, fmtActivityTime } from './activityLog'

/** Dispatched after anything that writes an audit row from the client (a turn, an approval, an undo). */
export const ACTIVITY_CHANGED_EVENT = 'sl-activity-changed'
export function notifyActivityChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACTIVITY_CHANGED_EVENT))
}

export function useActivityLog(live: boolean, limit = 30): ActivityRow[] | null {
  const [rows, setRows] = useState<ActivityRow[] | null>(null)
  // Re-read after the session writes a new row (a turn a moment ago showed
  // up only after a reload — walk-through 2026-09-25).
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(ACTIVITY_CHANGED_EVENT, h)
    return () => window.removeEventListener(ACTIVITY_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!live) { setRows([]); return }
    let cancelled = false
    supabase
      .from('agent_audit_events')
      .select('id, action, actor_type, created_at, metadata')
      .order('created_at', { ascending: false })
      // Session bookkeeping is not something the assistant "did" for the user —
      // it drowned the log in "session started" rows (walk-through 2026-09-25).
      .not('action', 'ilike', '%session%')
      .limit(limit)
      .then(({ data }) => { if (!cancelled) setRows((data ?? []) as ActivityRow[]) })
    return () => { cancelled = true }
  }, [live, limit, tick])
  return rows
}


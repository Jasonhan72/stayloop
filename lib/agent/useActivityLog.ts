'use client'

// What the assistant has been doing: the user's own conversations
// (agent_threads) with the decisions taken inside them folded in, plus the
// audit events that happened outside any conversation — all under RLS. One
// hook for the phone sheet (ActivitySheet) and the web panel (AssistantPanel);
// the rows are built by the pure helpers in ./activityLog.ts.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listThreads } from './threads'
import { buildActivity, type ActivityItem, type ActivityRow } from './activityLog'
import type { AgentRole } from './types'

export type { ActionItem, ActivityItem, ActivityRow, ThreadItem } from './activityLog'
export { activityGroups, activityIcon, fmtRowTime, itemIcon, itemNote } from './activityLog'

/** Dispatched after anything that writes a thread or an audit row from the client (a turn, an approval, an undo). */
export const ACTIVITY_CHANGED_EVENT = 'sl-activity-changed'
export function notifyActivityChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACTIVITY_CHANGED_EVENT))
}

export function useActivityLog(live: boolean, role: AgentRole, limit = 30): ActivityItem[] | null {
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  // Re-read after the session writes a new row (a turn a moment ago showed
  // up only after a reload — walk-through 2026-09-25).
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(ACTIVITY_CHANGED_EVENT, h)
    return () => window.removeEventListener(ACTIVITY_CHANGED_EVENT, h)
  }, [])
  useEffect(() => {
    if (!live) { setItems([]); return }
    let cancelled = false
    const events = supabase
      .from('agent_audit_events')
      .select('id, action, actor_type, created_at, metadata')
      .order('created_at', { ascending: false })
      // Session bookkeeping is not something the assistant "did" for the user —
      // it drowned the log in "session started" rows (walk-through 2026-09-25).
      .not('action', 'ilike', '%session%')
      // Turns are messages inside a conversation; the conversation row stands for them.
      .not('action', 'ilike', '%turn')
      .limit(limit * 2)
      .then(({ data }) => (data ?? []) as ActivityRow[])
    Promise.all([listThreads(supabase, role, limit), events])
      .then(([threads, evs]) => { if (!cancelled) setItems(buildActivity(threads, evs)) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [live, role, limit, tick])
  return items
}

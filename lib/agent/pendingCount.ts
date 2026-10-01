'use client'

// The "cards waiting for you" badge is read by the Header AND the phone tab
// bar on every page, at the same moment — two identical HEAD queries per
// navigation. One in-flight promise per role, reused for a short window
// (perf review 2026-09-23). Callers still refetch on route change.
import { supabase } from '@/lib/supabase'
import { ACTIVITY_CHANGED_EVENT } from './useActivityLog'

const SHARE_MS = 2000
const inflight = new Map<string, { at: number; p: Promise<number> }>()

export function fetchPendingCount(role: string): Promise<number> {
  const hit = inflight.get(role)
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.p
  // Waiting on you = pending cards AND approved cards that never ran (a failed send, the hourly
  // limit, an interrupted countdown): those sit on the to-do list with 现在执行 / 放弃, and an
  // unsent renewal letter or decision notice must light the badge too (review 2026-10-01).
  const p = Promise.resolve(
    supabase
      .from('agent_pending_actions')
      .select('id', { count: 'exact', head: true })
      .or('status.eq.pending,and(status.eq.approved,executed_at.is.null)')
      .eq('role', role),
  ).then(({ count }) => count ?? 0)
  inflight.set(role, { at: Date.now(), p })
  return p
}

/** A card was decided / undone somewhere: drop the shared answer and tell
 *  every badge (Header, phone tabs) to refetch now instead of on the next
 *  navigation (three-role test report 2026-09-24, SL-T-05). */
export const PENDING_CHANGED_EVENT = 'sl-pending-changed'
export function notifyPendingChanged(): void {
  inflight.clear()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_CHANGED_EVENT))
    // A decision is also an audit row the activity panel should show now.
    window.dispatchEvent(new Event(ACTIVITY_CHANGED_EVENT))
  }
}

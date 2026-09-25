'use client'

// The "cards waiting for you" badge is read by the Header AND the phone tab
// bar on every page, at the same moment — two identical HEAD queries per
// navigation. One in-flight promise per role, reused for a short window
// (perf review 2026-09-23). Callers still refetch on route change.
import { supabase } from '@/lib/supabase'

const SHARE_MS = 2000
const inflight = new Map<string, { at: number; p: Promise<number> }>()

export function fetchPendingCount(role: string): Promise<number> {
  const hit = inflight.get(role)
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.p
  const p = Promise.resolve(
    supabase
      .from('agent_pending_actions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
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
    window.dispatchEvent(new Event('sl-activity-changed'))
  }
}

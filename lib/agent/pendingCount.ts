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

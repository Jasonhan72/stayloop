// 主对话 (第三批 ⑦, 2026-10-25): the one pinned conversation per user × hat. Plain module — the
// browser (RLS client) and the proactive cron (service role, explicit user id) both use it.
// Find-or-create, race-safe through the partial unique index (a loser re-selects the winner).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentRole } from './types'

export const MAIN_THREAD_LABEL = { zh: '主对话', en: 'Main chat' }

export async function findMainThread(client: SupabaseClient, userId: string, role: AgentRole | string): Promise<string | null> {
  const { data } = await client.from('agent_threads').select('id').eq('user_id', userId).eq('role', role).eq('is_main', true).limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function ensureMainThread(client: SupabaseClient, userId: string, role: AgentRole | string): Promise<string | null> {
  const found = await findMainThread(client, userId, role)
  if (found) return found
  const { data, error } = await client.from('agent_threads')
    .insert({ user_id: userId, role, is_main: true, title: null, messages: [], message_count: 0 })
    .select('id').maybeSingle()
  if (data) return (data as { id: string }).id
  if (error) return findMainThread(client, userId, role)
  return null
}

/** Cards the scans propose carry the person's main conversation as their thread (cached per user × hat). */
export async function attachMainThread<T extends { user_id: string; role: string; metadata?: Record<string, unknown> | null }>(client: SupabaseClient, rows: T[]): Promise<T[]> {
  const cache = new Map<string, string | null>()
  const out: T[] = []
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>
    if (typeof meta.thread_id === 'string' && meta.thread_id) { out.push(r); continue }
    const key = `${r.user_id}:${r.role}`
    if (!cache.has(key)) cache.set(key, await ensureMainThread(client, r.user_id, r.role).catch(() => null))
    const tid = cache.get(key)
    out.push(tid ? { ...r, metadata: { ...meta, thread_id: tid } } : r)
  }
  return out
}

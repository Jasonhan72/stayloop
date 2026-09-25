// Conversation threads (agent_threads): the assistant's message history per
// user × role, one row per conversation, messages stored as the same
// ChatMessage array the chat renders (attachments' data URLs stripped, last
// MAX_STORED kept). RLS = self; every call here runs under the user's client.
// The "current thread" pointer is a per-browser convenience in localStorage.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentRole, ChatMessage } from './types'

export const MAX_STORED_MESSAGES = 300
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ThreadRow = { id: string; title: string | null; messages: ChatMessage[]; created_at: string; updated_at: string }

export function stripForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_STORED_MESSAGES).map((m) => ({
    ...m,
    attachments: m.attachments?.map((a) => ({ ...a, dataUrl: '' })),
  }))
}

/** The first thing the user said, as the thread's title (≤ 60 chars). */
export function threadTitle(messages: ChatMessage[]): string | null {
  const u = messages.find((m) => m.role === 'user' && m.text.trim())
  return u ? u.text.trim().replace(/\s+/g, ' ').slice(0, 60) : null
}

const rowToThread = (r: Record<string, unknown>): ThreadRow => ({
  id: String(r.id),
  title: (r.title as string | null) ?? null,
  messages: Array.isArray(r.messages) ? (r.messages as ChatMessage[]) : [],
  created_at: String(r.created_at),
  updated_at: String(r.updated_at),
})

export async function loadThread(client: SupabaseClient, id: string): Promise<ThreadRow | null> {
  if (!UUID.test(id)) return null
  const { data } = await client.from('agent_threads').select('id, title, messages, created_at, updated_at').eq('id', id).maybeSingle()
  return data ? rowToThread(data as Record<string, unknown>) : null
}

export async function latestThread(client: SupabaseClient, role: AgentRole): Promise<ThreadRow | null> {
  const { data } = await client.from('agent_threads').select('id, title, messages, created_at, updated_at').eq('role', role).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return data ? rowToThread(data as Record<string, unknown>) : null
}

export async function createThread(client: SupabaseClient, userId: string, role: AgentRole, messages: ChatMessage[]): Promise<string | null> {
  const stored = stripForStorage(messages)
  const { data, error } = await client
    .from('agent_threads')
    .insert({ user_id: userId, role, title: threadTitle(messages), messages: stored, message_count: stored.length, last_message_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) { console.warn('[threads] create failed', error.message); return null }
  return (data as { id: string }).id
}

export async function saveThread(client: SupabaseClient, id: string, messages: ChatMessage[]): Promise<void> {
  const stored = stripForStorage(messages)
  const patch: Record<string, unknown> = { messages: stored, message_count: stored.length, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const title = threadTitle(messages)
  if (title) patch.title = title
  const { error } = await client.from('agent_threads').update(patch).eq('id', id)
  if (error) console.warn('[threads] save failed', error.message)
}

/** The thread that was current at a moment in time — for activity rows written
 *  before thread ids were logged. Rows older than every thread map to the
 *  earliest one: that is the pre-thread localStorage history migrated in. */
export async function threadAt(client: SupabaseClient, role: AgentRole, iso: string): Promise<string | null> {
  const { data } = await client.from('agent_threads').select('id').eq('role', role).lte('created_at', iso).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (data) return (data as { id: string }).id
  const { data: first } = await client.from('agent_threads').select('id').eq('role', role).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (first as { id: string } | null)?.id ?? null
}

// ---- per-browser "current thread" pointer ---------------------------------
const pointerKey = (role: AgentRole, scope: string) => `sl-thread-current-${role}-${scope}`
export function readPointer(role: AgentRole, scope: string): string | null {
  try { const v = localStorage.getItem(pointerKey(role, scope)); return v && UUID.test(v) ? v : null } catch { return null }
}
export function writePointer(role: AgentRole, scope: string, id: string | null): void {
  try { if (id) localStorage.setItem(pointerKey(role, scope), id); else localStorage.removeItem(pointerKey(role, scope)) } catch { /* private mode */ }
}

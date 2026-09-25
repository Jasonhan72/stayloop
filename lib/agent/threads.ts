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
/** A conversation as the activity log lists it — no messages, just what it amounted to. */
export type ThreadListRow = { id: string; title: string | null; summary: string | null; turn_count: number; message_count: number; created_at: string; updated_at: string; last_message_at: string | null }

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

/** What the conversation amounted to: the assistant's last reply, flattened
 *  to one line (≤ 240 chars). The activity log shows it under the title, the
 *  way Muse lists each chat with its outcome (user 2026-09-25: the log is
 *  one row per conversation, not per message). */
export function threadSummary(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'agent' || !m.text.trim()) continue
    const flat = m.text
      .replace(/^\s*[#>*\-·•]+\s*/gm, '')
      .replace(/[*_`]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return flat ? flat.slice(0, 240) : null
  }
  return null
}

/** How many times the user spoke — the "N 轮" on the activity row. */
export function userTurns(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user' && m.text.trim()).length
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
    .insert({ user_id: userId, role, title: threadTitle(messages), summary: threadSummary(messages), turn_count: userTurns(messages), messages: stored, message_count: stored.length, last_message_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) { console.warn('[threads] create failed', error.message); return null }
  return (data as { id: string }).id
}

export async function saveThread(client: SupabaseClient, id: string, messages: ChatMessage[]): Promise<void> {
  const stored = stripForStorage(messages)
  const patch: Record<string, unknown> = { messages: stored, message_count: stored.length, summary: threadSummary(messages), turn_count: userTurns(messages), last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const title = threadTitle(messages)
  if (title) patch.title = title
  const { error } = await client.from('agent_threads').update(patch).eq('id', id)
  if (error) console.warn('[threads] save failed', error.message)
}

/** The user's conversations for one role, newest first — the activity log's rows. */
export async function listThreads(client: SupabaseClient, role: AgentRole, limit = 30): Promise<ThreadListRow[]> {
  const { data } = await client
    .from('agent_threads')
    .select('id, title, summary, turn_count, message_count, created_at, updated_at, last_message_at')
    .eq('role', role)
    .order('updated_at', { ascending: false })
    .limit(limit)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    title: (r.title as string | null) ?? null,
    summary: (r.summary as string | null) ?? null,
    turn_count: Number(r.turn_count ?? 0),
    message_count: Number(r.message_count ?? 0),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    last_message_at: (r.last_message_at as string | null) ?? null,
  }))
}

// ---- per-browser "current thread" pointer ---------------------------------
const pointerKey = (role: AgentRole, scope: string) => `sl-thread-current-${role}-${scope}`
export function readPointer(role: AgentRole, scope: string): string | null {
  try { const v = localStorage.getItem(pointerKey(role, scope)); return v && UUID.test(v) ? v : null } catch { return null }
}
export function writePointer(role: AgentRole, scope: string, id: string | null): void {
  try { if (id) localStorage.setItem(pointerKey(role, scope), id); else localStorage.removeItem(pointerKey(role, scope)) } catch { /* private mode */ }
}

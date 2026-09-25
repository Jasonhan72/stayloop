// One AI assistant per account (user decision 2026-09-25: "一用户就只有一个 AI
// 助理，他能处理所有三个角色的事情，角色还是分开的"). Its name and avatar live in
// assistant_profiles — one row per account, RLS = self — instead of one
// agent_configs row per hat. Every read/write here runs on the caller's own
// client, so it can only ever touch the signed-in user's row.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AssistantProfile = { name: string | null; avatar: string | null }

export async function readAssistantProfile(client: SupabaseClient): Promise<AssistantProfile | null> {
  const { data, error } = await client.from('assistant_profiles').select('name, avatar').maybeSingle()
  if (error) {
    console.warn('[assistant] profile read failed', error.message)
    return null
  }
  if (!data) return null
  const row = data as { name?: string | null; avatar?: string | null }
  return { name: (row.name ?? '').trim() || null, avatar: row.avatar ?? null }
}

/** The name the person gave their assistant (≤ 40 chars, trimmed). */
export async function saveAssistantName(client: SupabaseClient, userId: string, name: string): Promise<boolean> {
  const trimmed = name.trim().slice(0, 40)
  if (!trimmed) return false
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, name: trimmed }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] name save failed', error.message)
  return !error
}

/** The chosen avatar preset (lib/agent/avatars.tsx); null = the default face. */
export async function saveAssistantAvatar(client: SupabaseClient, userId: string, avatar: string | null): Promise<boolean> {
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, avatar }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] avatar save failed', error.message)
  return !error
}

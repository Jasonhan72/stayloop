// One AI assistant per account (user decision 2026-09-25: "一用户就只有一个 AI
// 助理，他能处理所有三个角色的事情，角色还是分开的"). Its name, avatar and
// speaking style live in assistant_profiles — one row per account, RLS = self —
// instead of one agent_configs row per hat. Every read/write here runs on the
// caller's own client, so it can only ever touch the signed-in user's row.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AssistantProfile = { name: string | null; avatar: string | null; vibe: string | null; persona: string | null }

/** The speaking style is one short line. */
export const VIBE_MAX = 120
/** The persona — who the assistant is and how it works — is a few sentences. */
export const PERSONA_MAX = 600

// Explicit instruction-override phrases have no place in a tone description:
// the prompt frames the vibe as wording only, and this keeps the obvious
// jailbreak strings out of the system prompt altogether.
const VIBE_OVERRIDE =
  /ignore (all|any|the|every|previous|prior|above|earlier)\b|disregard (all|any|the|previous|prior|above)\b|忽略(以上|之前|前面|所有|全部|任何)|无视(以上|之前|前面|所有|全部|任何)|you are now|you're now|from now on you|你现在是|从现在起你|system prompt|系统提示|developer mode|jailbreak|\bDAN\b|pretend (you|to be)|<\/?system>|assistant:/i

/** One line, ≤ VIBE_MAX chars, no override phrases; null when nothing usable is left. Pure — tested. */
export function sanitizeVibe(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const one = raw.replace(/\s+/g, ' ').trim().slice(0, VIBE_MAX)
  if (!one) return null
  if (VIBE_OVERRIDE.test(one)) return null
  return one
}

/** Paragraph-length, line breaks kept, ≤ PERSONA_MAX chars, no override phrases; null when nothing usable is left. Pure — tested. */
export function sanitizePersona(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, PERSONA_MAX)
  if (!text) return null
  if (VIBE_OVERRIDE.test(text)) return null
  return text
}

export async function readAssistantProfile(client: SupabaseClient): Promise<AssistantProfile | null> {
  const { data, error } = await client.from('assistant_profiles').select('name, avatar, vibe, persona').maybeSingle()
  if (error) {
    console.warn('[assistant] profile read failed', error.message)
    return null
  }
  if (!data) return null
  const row = data as { name?: string | null; avatar?: string | null; vibe?: string | null; persona?: string | null }
  return { name: (row.name ?? '').trim() || null, avatar: row.avatar ?? null, vibe: sanitizeVibe(row.vibe), persona: sanitizePersona(row.persona) }
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

/** The speaking style (sanitized); null clears it. */
export async function saveAssistantVibe(client: SupabaseClient, userId: string, vibe: string | null): Promise<boolean> {
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, vibe: sanitizeVibe(vibe) }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] vibe save failed', error.message)
  return !error
}

/** The persona (sanitized); null clears it. */
export async function saveAssistantPersona(client: SupabaseClient, userId: string, persona: string | null): Promise<boolean> {
  const { error } = await client.from('assistant_profiles').upsert({ user_id: userId, persona: sanitizePersona(persona) }, { onConflict: 'user_id' })
  if (error) console.warn('[assistant] persona save failed', error.message)
  return !error
}

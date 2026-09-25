// Agent spine — private memory reads + display formatting.
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripNul } from '@/lib/screening/jsonSafe'
import type { AgentRole, MemoryItem } from './types'

/** The person's memories. One assistant per account (2026-09-25): without a
 *  role every hat's facts come back, each tagged with the hat it was learned
 *  under (`role`; 'self' = the whole-person reflection profile). */
export async function getUserMemories(
  client: SupabaseClient,
  role?: AgentRole
): Promise<MemoryItem[]> {
  let q = client.from('user_memories').select('key,label,value,confidence,memory_type,role')
  if (role) q = q.eq('role', role)
  const { data, error } = await q
    .order('updated_at', { ascending: false })
    // Every row here is serialized into every future system prompt — an
    // unbounded read grows token cost linearly forever. Keep the most
    // recently touched memories (upserts refresh updated_at, so actively
    // used facts stay in the window).
    .limit(role ? 60 : 80)

  if (error) {
    console.warn('[memory] read failed', error.message)
    return []
  }

  return (data ?? []).map((m) => ({
    key: m.key,
    label: m.label || m.key,
    value: m.value,
    confidence: Number(m.confidence ?? 1),
    memory_type: m.memory_type,
    role: m.role,
  }))
}

// Implicit memory capture (architecture §05 — "Memory > Prompt"). The agent
// writes durable preferences/facts it learned this turn. RLS-scoped: a user
// can only upsert their own rows. Best-effort — never blocks the chat flow.
// Conflict target (user_id, role, key) must have a unique index for upsert.
// DB check constraint allows only these memory_type values. The model is
// asked to use them, but we clamp defensively (e.g. fact→profile, pattern→
// semantic) so a stray value can never break the insert.
const ALLOWED_TYPES = new Set(['preference', 'profile', 'constraint', 'semantic', 'system'])
function clampType(t: string): string {
  if (ALLOWED_TYPES.has(t)) return t
  if (t === 'fact') return 'profile'
  if (t === 'pattern') return 'semantic'
  return 'preference'
}

export async function upsertMemories(
  client: SupabaseClient,
  userId: string,
  role: AgentRole,
  items: MemoryItem[]
): Promise<void> {
  if (!items.length) return
  // The model is told to REUSE an existing key when a fact changes, but it
  // only sees the key — the unique index also includes memory_type, so a
  // reused key under a different type inserted a second row (review
  // 2026-09-19). Pin the type to the row that already owns the key.
  const keys = Array.from(new Set(items.map((m) => String(m.key))))
  const existingType = new Map<string, string>()
  try {
    const { data } = await client.from('user_memories').select('key,memory_type').eq('user_id', userId).eq('role', role).in('key', keys)
    for (const r of (data ?? []) as { key: string; memory_type: string }[]) if (!existingType.has(r.key)) existingType.set(r.key, r.memory_type)
  } catch { /* fall back to the model's type */ }
  const rows = items.map((m) => ({
    user_id: userId,
    role,
    key: stripNul(m.key),
    label: stripNul(m.label),
    value: stripNul(m.value),
    confidence: Math.max(0, Math.min(1, m.confidence ?? 0.8)),
    memory_type: existingType.get(String(m.key)) ?? clampType(m.memory_type),
    source: 'agent_turn',
    updated_at: new Date().toISOString(),
  }))
  // Conflict target matches the table's unique (user_id, role, memory_type, key).
  const { error } = await client
    .from('user_memories')
    .upsert(rows, { onConflict: 'user_id,role,memory_type,key' })
  if (error) console.warn('[memory] upsert failed', error.message)
}

// Render a memory value as a short, human line for the snapshot panel.
export function formatMemoryValue(item: MemoryItem, lang: 'zh' | 'en' = 'zh'): string {
  const zh = lang === 'zh'
  const v = item.value as Record<string, unknown> | null
  if (v == null || typeof v !== 'object') return String(v ?? '—')

  switch (item.key) {
    case 'budget': {
      const min = v.min as number, max = v.max as number
      const cur = (v.currency as string) || ''
      if (min != null && max != null) return `$${min.toLocaleString()}–${max.toLocaleString()} ${cur}${zh ? '/月' : '/mo'}`
      return JSON.stringify(v)
    }
    case 'preferred_areas':
      return Array.isArray(v.areas) ? (v.areas as string[]).join(' · ') : JSON.stringify(v)
    case 'move_in_date':
      return `${v.target ?? ''}${v.flexible ? (zh ? ' · 可灵活' : ' · flexible') : ''}`
    case 'transit':
      return v.requires_transit
        ? (zh ? `需公交 · 步行 ≤ ${v.max_walk_minutes ?? '?'} 分` : `Transit needed · ≤ ${v.max_walk_minutes ?? '?'} min walk`)
        : (zh ? '无公交要求' : 'No transit requirement')
    case 'home_type': {
      const bits: string[] = []
      if (v.beds != null) bits.push(`${v.beds}BR`)
      if (v.in_unit_laundry) bits.push(zh ? '室内洗衣' : 'in-unit laundry')
      if (v.quiet) bits.push(zh ? '安静' : 'quiet')
      return bits.join(' · ') || JSON.stringify(v)
    }
    default: {
      // Best-effort: join scalar fields.
      const parts = Object.values(v).filter((x) => typeof x !== 'object')
      return parts.length ? parts.join(' · ') : JSON.stringify(v)
    }
  }
}

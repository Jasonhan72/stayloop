// Agent spine — private memory reads + display formatting.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentRole, MemoryItem } from './types'

export async function getUserMemories(
  client: SupabaseClient,
  role: AgentRole
): Promise<MemoryItem[]> {
  const { data, error } = await client
    .from('user_memories')
    .select('key,label,value,confidence,memory_type')
    .eq('role', role)
    .order('updated_at', { ascending: false })

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
  const rows = items.map((m) => ({
    user_id: userId,
    role,
    key: m.key,
    label: m.label,
    value: m.value,
    confidence: Math.max(0, Math.min(1, m.confidence ?? 0.8)),
    memory_type: clampType(m.memory_type),
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
export function formatMemoryValue(item: MemoryItem): string {
  const v = item.value as Record<string, unknown> | null
  if (v == null || typeof v !== 'object') return String(v ?? '—')

  switch (item.key) {
    case 'budget': {
      const min = v.min as number, max = v.max as number
      const cur = (v.currency as string) || ''
      if (min != null && max != null) return `$${min.toLocaleString()}–${max.toLocaleString()} ${cur}/月`
      return JSON.stringify(v)
    }
    case 'preferred_areas':
      return Array.isArray(v.areas) ? (v.areas as string[]).join(' · ') : JSON.stringify(v)
    case 'move_in_date':
      return `${v.target ?? ''}${v.flexible ? ' · 可灵活' : ''}`
    case 'transit':
      return v.requires_transit ? `需公交 · 步行 ≤ ${v.max_walk_minutes ?? '?'} 分` : '无公交要求'
    case 'home_type': {
      const bits: string[] = []
      if (v.beds != null) bits.push(`${v.beds}BR`)
      if (v.in_unit_laundry) bits.push('室内洗衣')
      if (v.quiet) bits.push('安静')
      return bits.join(' · ') || JSON.stringify(v)
    }
    default: {
      // Best-effort: join scalar fields.
      const parts = Object.values(v).filter((x) => typeof x !== 'object')
      return parts.length ? parts.join(' · ') : JSON.stringify(v)
    }
  }
}

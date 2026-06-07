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

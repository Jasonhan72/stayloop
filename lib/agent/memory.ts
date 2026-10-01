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
  let q = client.from('user_memories').select('key,label,value,confidence,memory_type,role,source')
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

  return toMemoryItems(data)
}

const MEMORY_COLS = 'key,label,value,confidence,memory_type,role,source'

/** Rows as stored → MemoryItem. `source` rides along: 'user_edit' is what tags a memory
 *  【用户亲自写的】 in the prompt (it was dropped here, so the tag never fired — sweep 2026-10-01). */
export function toMemoryItems(rows: unknown): MemoryItem[] {
  return ((rows ?? []) as Array<Record<string, unknown>>).map((m) => ({
    key: String(m.key),
    label: (m.label as string) || String(m.key),
    value: m.value,
    confidence: Number(m.confidence ?? 1),
    memory_type: String(m.memory_type),
    role: (m.role as string | undefined) ?? undefined,
    source: (m.source as string | undefined) ?? undefined,
  }))
}

/** The panel, settings and progress page write user_memories directly; this tells the open
 *  session to re-read them before its next turn (contract C3, sweep 2026-10-01). */
export const MEMORIES_CHANGED_EVENT = 'sl-memories-changed'
export function notifyMemoriesChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MEMORIES_CHANGED_EVENT))
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

/** Upsert the model's memory writes; returns the rows AS STORED (role, the pinned
 *  memory_type, source) — the session merges those, never the model's raw items, which
 *  can carry a type the row does not have (contract C3). [] on failure. */
export async function upsertMemories(
  client: SupabaseClient,
  userId: string,
  role: AgentRole,
  items: MemoryItem[]
): Promise<MemoryItem[]> {
  if (!items.length) return []
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
  const { data, error } = await client
    .from('user_memories')
    .upsert(rows, { onConflict: 'user_id,role,memory_type,key' })
    .select(MEMORY_COLS)
  if (error) {
    console.warn('[memory] upsert failed', error.message)
    return []
  }
  return toMemoryItems(data)
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

// ── Editing a stored value (the panel's 「改」) ────────────────────────────────
// The editor used to pre-fill formatMemoryValue's display string and write it
// back as the value: {min:2000,max:2800,currency:'CAD'} became the string
// "$2,000–2,800 CAD/月" (even with no change), which budgetFromMemories cannot
// parse, and arrays / key names in other objects were dropped (sweep
// 2026-10-01). Edits now go field by field and write a merged value of the
// same shape; nested objects are kept as stored.

export type MemoryEditKind = 'text' | 'number' | 'boolean' | 'list'
export type MemoryEditField = { path: string; kind: MemoryEditKind; text: string }

const isScalar = (x: unknown): x is string | number | boolean | null => x === null || ['string', 'number', 'boolean'].includes(typeof x)

function fieldOf(path: string, v: unknown): MemoryEditField | null {
  if (typeof v === 'number') return { path, kind: 'number', text: String(v) }
  if (typeof v === 'boolean') return { path, kind: 'boolean', text: v ? 'true' : 'false' }
  if (typeof v === 'string' || v === null || v === undefined) return { path, kind: 'text', text: v ?? '' }
  if (Array.isArray(v) && v.every(isScalar)) return { path, kind: 'list', text: v.map((x) => String(x ?? '')).join(', ') }
  return null
}

/** The editable parts of a stored value (path '' = the value itself), or null when nothing is
 *  editable without losing structure. Pure — tested. */
export function memoryEditFields(value: unknown): MemoryEditField[] | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: MemoryEditField[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const f = fieldOf(k, v)
      if (f) out.push(f)
    }
    return out.length ? out : null
  }
  const f = fieldOf('', value)
  return f ? [f] : null
}

const TRUE_RE = /^(true|yes|y|1|是|有|对|需要)$/i
const FALSE_RE = /^(false|no|n|0|否|无|没有|不|不需要)$/i

function parseField(f: MemoryEditField, raw: string, original: unknown): { ok: true; value: unknown } | { ok: false } {
  const t = raw.trim()
  if (f.kind === 'number') {
    if (!t) return f.path ? { ok: true, value: null } : { ok: false }
    const n = Number(t.replace(/[$,\s]/g, ''))
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false }
  }
  if (f.kind === 'boolean') {
    if (TRUE_RE.test(t)) return { ok: true, value: true }
    if (FALSE_RE.test(t)) return { ok: true, value: false }
    return { ok: false }
  }
  if (f.kind === 'list') {
    const items = t.split(/[,，、;；·\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 120))
    // a list of numbers stays numeric
    const numeric = Array.isArray(original) && original.length > 0 && original.every((x) => typeof x === 'number')
    if (numeric) {
      const ns = items.map((x) => Number(x.replace(/[$,\s]/g, '')))
      return ns.every(Number.isFinite) ? { ok: true, value: ns } : { ok: false }
    }
    return { ok: true, value: items }
  }
  if (!t && !f.path) return { ok: false }
  // an untouched empty field that was null stays null
  if (!t && original == null) return { ok: true, value: original ?? null }
  return { ok: true, value: t.slice(0, 500) }
}

/** Apply field drafts to a stored value: same shape, untouched fields and nested objects as
 *  stored. `changed` is false when every field parses back to what was there (skip the write).
 *  `invalid` lists the paths that did not parse. Pure — tested. */
export function applyMemoryEdit(value: unknown, drafts: Record<string, string>): { value: unknown; changed: boolean; invalid: string[] } {
  const fields = memoryEditFields(value)
  if (!fields) return { value, changed: false, invalid: [] }
  const invalid: string[] = []
  const isObject = !!value && typeof value === 'object' && !Array.isArray(value)
  const base: Record<string, unknown> = isObject ? { ...(value as Record<string, unknown>) } : {}
  let root: unknown = value
  for (const f of fields) {
    const raw = drafts[f.path]
    // a field still showing its pre-filled text was not touched: keep the stored value and type
    // (re-parsing it split 'Downtown, Toronto' in two, turned [1,'den'] into strings, trimmed text)
    if (raw === undefined || raw === f.text) continue
    const original = f.path ? base[f.path] : value
    const p = parseField(f, raw, original)
    if (!p.ok) { invalid.push(f.path); continue }
    if (f.path) base[f.path] = p.value
    else root = p.value
  }
  const next = isObject ? base : root
  return { value: next, changed: JSON.stringify(next) !== JSON.stringify(value), invalid }
}

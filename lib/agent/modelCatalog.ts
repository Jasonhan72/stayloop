'use client'

// The turn-model catalogue + the signed-in user's pick, shared by the input
// bar's selector and the assistant's settings tab (user 2026-09-25: every item
// that defines the assistant is edited in place and kept long-term). Same
// store as /settings/models: public.user_model_preferences, resolved
// server-side by getModelForUser(). The catalogue is the slowest call on the
// agent page (~1 s on a far network) and changes rarely, so a per-user copy
// lives in sessionStorage for a while; choosing a model clears it.
import { getSupabaseBrowser } from '@/lib/supabase'

export const CATALOG_CACHE_KEY = 'sl-model-catalog'
export const CATALOG_CACHE_MS = 10 * 60_000

export type TurnModelOption = { id: string; label: string }
export type TurnModelState = { options: TurnModelOption[]; selected: string; defaultLabel: string }
type Catalog = { defaults: Record<string, string>; models: { id: string; label: string; slots: string[] }[]; prefs: Record<string, string> }

function toState(j: Catalog): TurnModelState | null {
  const options = j.models.filter((m) => m.slots.includes('turn')).map((m) => ({ id: m.id, label: m.label }))
  if (!options.length) return null
  const def = options.find((o) => o.id === j.defaults.turn)
  return { options, selected: j.prefs.turn || '', defaultLabel: def?.label || j.defaults.turn || 'Auto' }
}

/** The turn-slot options + the user's current pick ('' = system default); null when unavailable. */
export async function loadTurnModels(userId: string): Promise<TurnModelState | null> {
  const cacheKey = `${CATALOG_CACHE_KEY}:${userId}`
  try {
    const raw = sessionStorage.getItem(cacheKey)
    if (raw) {
      const c = JSON.parse(raw) as { at: number; j: Catalog }
      if (Date.now() - c.at < CATALOG_CACHE_MS) return toState(c.j)
    }
  } catch { /* storage unavailable → just fetch */ }
  try {
    const sb = getSupabaseBrowser()
    const { data: sess } = await sb.auth.getSession()
    const token = sess.session?.access_token
    if (!token) return null
    const res = await fetch('/api/models/catalog', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const j = (await res.json()) as Catalog
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), j })) } catch { /* ignore */ }
    return toState(j)
  } catch {
    return null
  }
}

/** Save the user's turn-model pick ('' = back to the system default); best-effort, the server falls back anyway. */
export async function saveTurnModel(userId: string, id: string): Promise<boolean> {
  try { sessionStorage.removeItem(`${CATALOG_CACHE_KEY}:${userId}`) } catch { /* ignore */ }
  try {
    const sb = getSupabaseBrowser()
    if (id) {
      const { error } = await sb.from('user_model_preferences').upsert(
        { user_id: userId, slot: 'turn', model_id: id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,slot' },
      )
      return !error
    }
    const { error } = await sb.from('user_model_preferences').delete().eq('user_id', userId).eq('slot', 'turn')
    return !error
  } catch {
    return false
  }
}

'use client'

// The signed-in user's `tenants` row (id + passport tier) is the key for
// showing_intents / lease_documents / maintenance_tickets on the tenant side,
// and three components on the same page each looked it up in their own round
// trip. One shared, short-lived promise per user (perf review 2026-09-23).
// claim_tenant() creates the row lazily, so the cache is deliberately short.
import { supabase } from '@/lib/supabase'

export type TenantRow = { id: string; tier: number | null }

const TTL_MS = 30_000
const cache = new Map<string, { at: number; p: Promise<TenantRow | null> }>()

export function getTenantRow(uid: string): Promise<TenantRow | null> {
  const hit = cache.get(uid)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p
  const p = Promise.resolve(supabase.from('tenants').select('id, tier').eq('auth_id', uid).maybeSingle())
    .then(({ data }) => (data ? { id: (data as { id: string }).id, tier: ((data as { tier?: number | null }).tier ?? null) } : null))
    .catch(() => null)
  cache.set(uid, { at: Date.now(), p })
  return p
}

export function invalidateTenantRow(uid?: string) { if (uid) cache.delete(uid); else cache.clear() }

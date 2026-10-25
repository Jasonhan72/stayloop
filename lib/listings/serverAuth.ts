// Server-only helpers the listing routes share (2026-10-26): who is calling,
// which landlords.id values mark a listing as theirs (dual ID: landlords.id ≠
// auth.users.id — CLAUDE.md 关键不变量), and the service-role client.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const NO_STORE = { 'Cache-Control': 'no-store' }
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')

export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function callerOf(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await sb.auth.getUser()
  const u = data?.user
  return u && !u.is_anonymous && u.email ? { id: u.id, email: u.email } : null
}

/** landlords.id values (plus the auth id itself) that mark a listing as the caller's. */
export async function ownerIdsOf(svc: SupabaseClient, uid: string): Promise<string[]> {
  const { data } = await svc.from('landlords').select('id').or(`id.eq.${uid},auth_id.eq.${uid}`)
  return [uid, ...((data ?? []) as { id: string }[]).map((r) => r.id)]
}

export type OwnedListing = { id: string; slug: string | null; address: string; unit: string | null; city: string | null; landlord_id: string | null; is_active: boolean; status: string | null; is_test: boolean | null }
export const OWNED_LISTING_COLS = 'id, slug, address, unit, city, landlord_id, is_active, status, is_test'

/** The listing when it belongs to the caller, else null. */
export async function ownedListing(svc: SupabaseClient, uid: string, listingId: string): Promise<OwnedListing | null> {
  if (!UUID_RE.test(listingId)) return null
  const [mine, { data }] = await Promise.all([ownerIdsOf(svc, uid), svc.from('listings').select(OWNED_LISTING_COLS).eq('id', listingId).maybeSingle()])
  const l = data as OwnedListing | null
  return l && l.landlord_id && mine.includes(l.landlord_id) ? l : null
}

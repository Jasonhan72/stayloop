// Server side of the public agent profiles (service role). The routes return only
// toPublicAgent() fields; anon has no access to agent_profiles itself.
import type { SupabaseClient } from '@supabase/supabase-js'
import { LISTING_VISIBILITY_OR, hasUsablePhotos } from './listingVisibility'
import { PUBLIC_AGENT_COLUMNS, isPublishable, isValidSlug, toPublicAgent, type AgentActivity, type AgentProfileRow, type PublicAgent } from './agentPublic'

export async function loadPublicAgent(admin: SupabaseClient, slug: string): Promise<{ row: AgentProfileRow; agent: PublicAgent } | null> {
  if (!isValidSlug(slug)) return null
  const { data } = await admin.from('agent_profiles').select(PUBLIC_AGENT_COLUMNS).eq('profile_slug', slug).maybeSingle()
  const row = data as AgentProfileRow | null
  if (!row || !isPublishable(row)) return null
  return { row, agent: toPublicAgent(row) }
}

export async function listPublicAgents(admin: SupabaseClient): Promise<PublicAgent[]> {
  const { data } = await admin.from('agent_profiles').select(PUBLIC_AGENT_COLUMNS)
    .eq('public_profile', true).in('status', ['verified', 'renewal_due']).not('profile_slug', 'is', null)
    .order('verified_at', { ascending: false }).limit(200)
  return ((data ?? []) as AgentProfileRow[]).filter((r) => isPublishable(r)).map(toPublicAgent)
}

/** Listings this agent published on Stayloop (as their landlord profile). The page asks
 *  /api/listings/search?ids=… for the cards, so the public visibility rules apply there. */
export async function agentListingIds(admin: SupabaseClient, authId: string): Promise<string[]> {
  const { data: ll } = await admin.from('landlords').select('id').eq('auth_id', authId)
  const owners = Array.from(new Set([authId, ...((ll ?? []) as { id: string }[]).map((r) => r.id)]))
  // Same public rule as /api/listings/search (active, shown, verified, has photos), so the count matches the cards.
  const { data } = await admin.from('listings').select('id, images').in('landlord_id', owners).eq('is_active', true)
    .eq('display_internet', true).or(LISTING_VISIBILITY_OR)
    .order('created_at', { ascending: false }).limit(30)
  return ((data ?? []) as { id: string; images: unknown }[]).filter((r) => hasUsablePhotos(r.images)).slice(0, 24).map((r) => r.id)
}

/** Real counts from Stayloop, shown only when the agent ticked show_activity. */
export async function agentActivity(admin: SupabaseClient, authId: string, listings: number): Promise<AgentActivity> {
  const [{ count: clients }, { count: confirmed }] = await Promise.all([
    admin.from('agent_clients').select('id', { count: 'exact', head: true }).eq('agent_auth_id', authId),
    admin.from('delegations').select('id', { count: 'exact', head: true }).eq('delegate_auth_id', authId).not('confirmed_at', 'is', null),
  ])
  return { clients: clients ?? 0, confirmed_delegations: confirmed ?? 0, listings }
}

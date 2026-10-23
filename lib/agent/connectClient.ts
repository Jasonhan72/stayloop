// Server only. One agent_clients row per (agent, email) — the shape the public-profile
// contact route established (2026-10-21), now shared with the MLS® hand-off (2026-10-22):
// a signed-in person reaching an agent from anywhere lands in the agent's own client
// book, and the agent_client thread of that row is where both sides talk (party_for()
// matches the client's email).
import type { SupabaseClient } from '@supabase/supabase-js'
import { displayNameFor } from '@/lib/threads/server'

function ilikeExact(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export type ConnectedClient = { clientId: string; created: boolean; name: string; email: string }

export async function connectAgentClient(admin: SupabaseClient, input: {
  agentId: string
  user: { id: string; email: string }
  role: 'tenant' | 'landlord'
  area?: string | null
  budget?: string | null
  /** Written into `notes` only when the row is created. */
  note: string
}): Promise<ConnectedClient | null> {
  const email = input.user.email.trim().toLowerCase()
  const name = ((await displayNameFor(admin, input.user.id)) || email.split('@')[0]).slice(0, 120)
  const find = async () => {
    const { data } = await admin.from('agent_clients').select('id').eq('agent_auth_id', input.agentId).ilike('email', ilikeExact(email)).limit(1)
    return ((data ?? []) as { id: string }[])[0]?.id ?? null
  }
  let clientId: string | null = await find()
  let created = false
  if (!clientId) {
    const { data, error } = await admin.from('agent_clients').insert({
      agent_auth_id: input.agentId, name, client_role: input.role, email, area: input.area ?? null, budget: input.budget ?? null, stage: 'searching',
      notes: input.note.slice(0, 2000), last_contact_at: new Date().toISOString(),
    }).select('id').maybeSingle()
    // 23505 client_email_taken = a parallel request created it first.
    clientId = (data as { id: string } | null)?.id ?? (error ? await find() : null)
    created = !!data
  } else {
    await admin.from('agent_clients').update({ last_contact_at: new Date().toISOString() }).eq('id', clientId)
  }
  return clientId ? { clientId, created, name, email } : null
}

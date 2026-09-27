// Agent spine — audit trail. Every key action is traceable.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditInput = {
  actorId: string
  actorType?: 'user' | 'system' | 'agent'
  action: string
  targetType?: string
  targetId?: string | null
  metadata?: Record<string, unknown>
  /** The hat the actor was wearing (节点 2 2026-09-26): tenant / landlord / agent / provider / admin. */
  actingRole?: string | null
  /** The rental matter the action belongs to (lease / application / household / work_order / ticket / listing). */
  matterType?: string | null
  matterId?: string | null
  delegationId?: string | null
}

/** Derive the matter reference from the ids a caller already puts in metadata. */
export function matterRef(meta: Record<string, unknown> | null | undefined): { matterType: string | null; matterId: string | null } {
  const m = meta ?? {}
  const pick = (k: string) => (typeof m[k] === 'string' && /^[0-9a-f-]{36}$/i.test(m[k] as string) ? (m[k] as string) : null)
  for (const [k, t] of [['work_order_id', 'work_order'], ['ticket_id', 'ticket'], ['lease_id', 'lease'], ['application_id', 'application'], ['household_id', 'household'], ['listing_id', 'listing'], ['screening_id', 'screening']] as const) {
    const id = pick(k)
    if (id) return { matterType: t, matterId: id }
  }
  return { matterType: null, matterId: null }
}

export async function writeAuditEvent(client: SupabaseClient, input: AuditInput) {
  const ref = input.matterId ? { matterType: input.matterType ?? null, matterId: input.matterId } : matterRef(input.metadata)
  const { error } = await client.from('agent_audit_events').insert({
    actor_id: input.actorId,
    actor_type: input.actorType ?? 'user',
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
    acting_role: input.actingRole ?? null,
    matter_type: ref.matterType,
    matter_id: ref.matterId,
    delegation_id: input.delegationId ?? null,
  })
  // Audit is best-effort from the client; never block the user flow on it.
  if (error) console.warn('[audit] failed to write', input.action, error.message)
}

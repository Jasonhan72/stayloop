// Agent spine — audit trail. Every key action is traceable.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditInput = {
  actorId: string
  actorType?: 'user' | 'system' | 'agent'
  action: string
  targetType?: string
  targetId?: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditEvent(client: SupabaseClient, input: AuditInput) {
  const { error } = await client.from('agent_audit_events').insert({
    actor_id: input.actorId,
    actor_type: input.actorType ?? 'user',
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  })
  // Audit is best-effort from the client; never block the user flow on it.
  if (error) console.warn('[audit] failed to write', input.action, error.message)
}

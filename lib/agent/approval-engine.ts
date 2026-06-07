// Agent spine — pending actions + approve/reject.
// The non-negotiable control point: key actions never auto-execute.
// approve/reject route through the decide_pending_action RPC, which
// dual-writes approval_event + audit_event inside one transaction.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentRole, PendingAction } from './types'

function rowToAction(r: Record<string, unknown>): PendingAction {
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    workflow_id: (r.workflow_id as string) ?? null,
    role: r.role as AgentRole,
    action_type: r.action_type as string,
    title: r.title as string,
    summary: (r.summary as string) ?? '',
    recipient_label: (r.recipient_label as string) ?? null,
    data_scope: (r.data_scope as string[]) ?? [],
    excluded_data: (r.excluded_data as string[]) ?? [],
    risk_level: (r.risk_level as PendingAction['risk_level']) ?? 'medium',
    status: r.status as PendingAction['status'],
    requires_approval: (r.requires_approval as boolean) ?? true,
    created_at: r.created_at as string,
    expires_at: (r.expires_at as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }
}

export async function getPendingActions(
  client: SupabaseClient,
  role: AgentRole,
  status: PendingAction['status'] = 'pending'
): Promise<PendingAction[]> {
  const { data, error } = await client
    .from('agent_pending_actions')
    .select('*')
    .eq('role', role)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[approval] read failed', error.message)
    return []
  }
  return (data ?? []).map(rowToAction)
}

export async function decidePendingAction(
  client: SupabaseClient,
  actionId: string,
  decision: 'approved' | 'rejected',
  note?: string
): Promise<PendingAction> {
  const { data, error } = await client.rpc('decide_pending_action', {
    p_id: actionId,
    p_decision: decision,
    p_note: note ?? null,
  })
  if (error) throw new Error(error.message)
  return rowToAction(data as Record<string, unknown>)
}

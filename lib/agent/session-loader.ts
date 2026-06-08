// Agent spine — session loader. Execution spec §11.
// Bootstraps (get-or-create config + task_memory, open session, audit) via
// one RPC, optionally seeds demo content, then reads the RLS-scoped state
// and assembles the AgentSessionResponse the workspace renders from.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AgentConfig,
  AgentRole,
  AgentSession,
  AgentSessionResponse,
  WorkflowState,
} from './types'
import { getUserMemories } from './memory'
import { getPendingActions } from './approval-engine'
import {
  ROLE_META,
  buildRecommendations,
  deriveStatus,
} from './orchestrator'

type Options = { seedDemo?: boolean }

function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

export async function loadAgentSession(
  client: SupabaseClient,
  role: AgentRole,
  opts: Options = {}
): Promise<AgentSessionResponse> {
  // 1. Atomic bootstrap (config + active task_memory + session + audit).
  //    Time-bounded so a stalled request fails fast to the demo fallback
  //    rather than hanging the workspace on its loading skeleton.
  const { data: sessRow, error: bootErr } = await withTimeout(
    client.rpc('bootstrap_agent_session', { p_role: role }),
    4000,
    'bootstrap_agent_session'
  )
  if (bootErr) throw new Error(`bootstrap failed: ${bootErr.message}`)
  const session = sessRow as AgentSession

  // 2. Optional demo seed (idempotent, server-side guard).
  if (opts.seedDemo) {
    await client.rpc('seed_demo_agent_data', { p_role: role })
  }

  // 3. Read the RLS-scoped state in parallel.
  const [{ data: cfg }, { data: task }, memories, pendingActions] =
    await Promise.all([
      client
        .from('agent_configs')
        .select('*')
        .eq('id', session.agent_config_id)
        .single(),
      client
        .from('task_memories')
        .select('*')
        .eq('role', role)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getUserMemories(client, role),
      getPendingActions(client, role, 'pending'),
    ])

  const agent: AgentConfig = (cfg as AgentConfig) ?? {
    id: session.agent_config_id,
    user_id: session.user_id,
    agent_name: ROLE_META[role].name,
    role,
    tone: 'clear_supportive',
    model_tier: 'standard',
    automation_level: 'approval_required',
    memory_enabled: true,
  }

  const workflow: WorkflowState = {
    workflow_type: task?.workflow_type ?? ROLE_META[role].workflowType,
    workflow_id: task?.workflow_id ?? null,
    current_stage: task?.current_stage ?? 'intake',
    completed_steps: task?.completed_steps ?? [],
    status: task?.status ?? 'active',
  }

  return {
    session,
    agent,
    workflow,
    status: deriveStatus(pendingActions),
    memories,
    pendingActions,
    recommendations: buildRecommendations(role, workflow),
  }
}

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
import { readAssistantProfile } from './assistantProfile'
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
  //    The RLS-scoped reads that do not depend on its result (own config by
  //    role, active task, memories, pending cards) run alongside it — one
  //    round trip instead of two (perf review 2026-09-23).
  const bootP = withTimeout(
    client.rpc('bootstrap_agent_session', { p_role: role }),
    8000,
    'bootstrap_agent_session'
  )
  const [{ data: sessRow, error: bootErr }, { data: cfgByRole }, { data: task }, memories, pendingActions, profile] =
    await Promise.all([
      bootP,
      client
        .from('agent_configs')
        .select('*')
        .eq('role', role)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('task_memories')
        .select('*')
        .eq('role', role)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // One assistant per account (2026-09-25): it knows every hat's facts.
      getUserMemories(client),
      getPendingActions(client, role, 'pending'),
      readAssistantProfile(client),
    ])
  if (bootErr) throw new Error(`bootstrap failed: ${bootErr.message}`)
  const session = sessRow as AgentSession

  // 2. Optional demo seed (idempotent, server-side guard).
  if (opts.seedDemo) {
    await client.rpc('seed_demo_agent_data', { p_role: role })
  }

  // 3. The config row the bootstrap actually bound (first visit creates it
  //    inside the RPC, so the parallel read can miss or pick another row).
  let cfg = cfgByRole && (cfgByRole as { id: string }).id === session.agent_config_id ? cfgByRole : null
  if (!cfg) {
    const { data } = await client.from('agent_configs').select('*').eq('id', session.agent_config_id).single()
    cfg = data
  }

  const base: AgentConfig = (cfg as AgentConfig) ?? {
    id: session.agent_config_id,
    user_id: session.user_id,
    agent_name: ROLE_META[role].name,
    role,
    tone: 'clear_supportive',
    model_tier: 'standard',
    automation_level: 'approval_required',
    memory_enabled: true,
  }
  // The assistant is the account's, not the hat's: its name and face come from
  // assistant_profiles; agent_configs.agent_name (a per-hat persona default) is
  // no longer shown anywhere.
  const agent: AgentConfig = { ...base, agent_name: profile?.name || ROLE_META[role].name, avatar: profile?.avatar ?? null }

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

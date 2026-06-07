// Stayloop V5.3 — Agent spine types
// Source of truth: /tenant/agent execution spec §9–§10.
// Shared by all three roles (tenant · landlord · agent).

export type AgentRole = 'tenant' | 'landlord' | 'agent'

export type AgentStatus =
  | 'idle'
  | 'understanding'
  | 'working'
  | 'result'
  | 'approval'

export type PendingActionType =
  | 'share_passport_summary'
  | 'submit_application'
  | 'send_message'
  | 'schedule_viewing'
  | 'sign_lease'
  | 'payment_authorization'
  | string

export type PendingAction = {
  id: string
  user_id: string
  workflow_id?: string | null
  role: AgentRole
  action_type: PendingActionType
  title: string
  summary: string
  recipient_label?: string | null
  data_scope: string[]
  excluded_data: string[]
  risk_level: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  requires_approval: boolean
  created_at: string
  expires_at?: string | null
  metadata: Record<string, unknown>
}

export type AgentConfig = {
  id: string
  user_id: string
  agent_name: string
  role: AgentRole
  tone: string
  model_tier: string
  automation_level: 'approval_required' | string
  memory_enabled: boolean
}

export type AgentSession = {
  id: string
  user_id: string
  agent_config_id: string
  role: AgentRole
  status: 'active' | 'ended' | 'error'
  started_at: string
}

export type WorkflowState = {
  workflow_type: string
  workflow_id: string | null
  current_stage: string
  completed_steps: string[]
  status: 'active' | 'paused' | 'completed' | 'archived'
}

export type MemoryItem = {
  key: string
  label: string
  value: unknown
  confidence: number
  memory_type: string
}

export type AgentResult = {
  title: string
  body: string
  kind: 'summary' | 'recommendation' | 'warning' | 'approval_prompt'
}

export type Recommendation = {
  id: string
  title: string
  description: string
  href?: string
  badge?: string
}

export type AgentSessionResponse = {
  session: AgentSession
  agent: AgentConfig
  workflow: WorkflowState
  status: AgentStatus
  memories: MemoryItem[]
  pendingActions: PendingAction[]
  latestResult?: AgentResult
  recommendations: Recommendation[]
}

// The control principles that must hold for every role (handbook §03/§07).
export const CONTROL_RULES = {
  keyActionsRequireApproval: true,
  sensitiveDataScoped: true,
  suggestionIsNotExecution: true,
  dualWriteAudit: true,
} as const

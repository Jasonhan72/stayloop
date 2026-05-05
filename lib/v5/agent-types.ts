// -----------------------------------------------------------------------------
// Stayloop V5 — Agent type contracts
// -----------------------------------------------------------------------------
// V5 product mental model:
//   Agent is virtual, memory is persistent, execution is on-demand,
//   workflow is orchestrated by the system, key actions require user
//   approval. The AI may PREPARE / SUGGEST / SUMMARIZE / DRAFT, but it
//   may not SUBMIT applications, SHARE sensitive data, SIGN documents,
//   MAKE payments, or ACCEPT key terms without explicit user confirmation.
//
// This file defines the shapes that flow between:
//   - lib/v5/tenant-agent-mock.ts            (current source — mock data)
//   - app/api/agent/session/route.ts          (returns TenantAgentSession)
//   - app/api/agent/approvals/route.ts        (records ApprovalDecision)
//   - components/v5/tenant-agent/TenantAgentWorkspace.tsx (renders session)
//
// Naming conventions:
//   - All snake_case fields are persisted to Supabase later.
//   - All optional fields are nullable in the DB equivalent.
//   - Severity / status enums are kept narrow; widen them deliberately.
//
// This is a foundation draft. Do not over-engineer.
// -----------------------------------------------------------------------------

/** The role each Stayloop agent plays. Phase 1 only ships the tenant agent
 *  ("Luna"). Landlord ("Atlas") and agent-of-agents ("Compass") are reserved
 *  for later iterations and intentionally NOT implemented yet. */
export type AgentRole = 'tenant' | 'landlord' | 'agent_of_agents'

/** What Luna is doing right now. Drives the status pill in the page header
 *  and (later) what the system prompt/tooling looks like for the next turn.
 *
 *   active            — idle, ready to respond. Default state.
 *   understanding     — interpreting the user's last request.
 *   working           — running a non-sensitive task (drafting, comparing,
 *                       searching, summarizing). User intervention not needed.
 *   waiting_approval  — there is at least one PendingAction with status
 *                       'pending'. The agent has paused and needs the user.
 *   blocked           — agent paused due to missing data / external service
 *                       outage / user-revoked permission. User-actionable.
 */
export type AgentStatus =
  | 'active'
  | 'understanding'
  | 'working'
  | 'waiting_approval'
  | 'blocked'

/** A stage in the rental workflow that the Stayloop system orchestrates.
 *  These are the canonical macro-stages Luna walks the tenant through.
 *  Order matches typical rental progression. */
export type WorkflowStageId =
  | 'search_preferences'
  | 'passport_readiness'
  | 'application_preparation'
  | 'screening_review'
  | 'lease_review'
  | 'move_in_services'

/** Per-stage progress state. */
export type WorkflowStageStatus = 'completed' | 'current' | 'upcoming'

export interface WorkflowStage {
  id: WorkflowStageId
  /** Bilingual label keys; the page picks one based on the active language. */
  label_en: string
  label_zh: string
  /** Short one-liner describing what this stage produces / verifies. */
  description_en: string
  description_zh: string
  status: WorkflowStageStatus
  /** Optional small progress hint, e.g. "3 of 5 docs ready". */
  hint_en?: string
  hint_zh?: string
}

/** Sensitivity label for a pending action. Drives the visual treatment
 *  (border color, icon) and the approval-flow guard rails. */
export type ActionSensitivity =
  | 'low'           // routine drafting helpers
  | 'medium'        // sharing / messaging on the user's behalf
  | 'high'          // submitting an application package, signing documents,
                    // payments — anything that creates an external commitment

/** Approval state for a PendingAction. */
export type PendingActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'      // auto-expires after a TTL — will be backed by DB later

/** A discrete action Luna has prepared but cannot execute alone. The user
 *  must explicitly approve or reject. The full set of pending actions for
 *  a session is what the dashboard shows in the "Pending actions" block. */
export interface PendingAction {
  id: string
  title_en: string
  title_zh: string
  description_en: string
  description_zh: string
  /** Why approval is required — shown verbatim in the UI under the action.
   *  Keep this short and specific (don't write a wall of text). */
  reason_en: string
  reason_zh: string
  sensitivity: ActionSensitivity
  status: PendingActionStatus
  /** ISO timestamp the action was prepared. Drives sort order. */
  created_at: string
  /** Optional ISO timestamp by which the action will auto-expire. */
  expires_at?: string
  /** Optional payload preview — what the user will be approving. The UI
   *  may render this as a collapsible diff/summary later. Free-form for
   *  now, typed once the backend lands. */
  preview?: Record<string, unknown>
}

/** A single piece of private memory Luna uses to personalize the workflow.
 *  Memory items are categorized for grouping in the UI; values are stored
 *  as strings (multi-value items use string[]) to keep the v1 simple. */
export type MemoryCategory =
  | 'preferences'   // areas, budget, move-in date, etc.
  | 'household'     // size, pets, smokers
  | 'language'      // English / Chinese / French / etc.
  | 'priorities'    // transit access, quiet, verified landlord, ...
  | 'constraints'   // hard requirements: must allow pet, must have parking
  | 'context'       // misc — newcomer, student, work-from-home, ...

export interface PrivateMemoryItem {
  id: string
  category: MemoryCategory
  label_en: string
  label_zh: string
  /** Either a single string or an ordered list of strings (areas, etc). */
  value: string | string[]
  /** When this fact was learned/written. ISO timestamp. */
  updated_at: string
  /** True for items the user pinned themselves vs ones Luna inferred. */
  user_confirmed: boolean
}

/** Sensitivity tier for a recommendation — informational vs action-required. */
export type RecommendationKind = 'improvement' | 'comparison' | 'reminder'

/** A non-blocking suggestion Luna surfaces. Recommendations are visually
 *  distinct from PendingActions: they're nudges the user MAY follow, while
 *  PendingActions are decisions Luna NEEDS from the user before continuing. */
export interface AgentRecommendation {
  id: string
  kind: RecommendationKind
  title_en: string
  title_zh: string
  rationale_en: string
  rationale_zh: string
  /** Optional CTA. If set, the UI renders a button that navigates here. */
  cta_label_en?: string
  cta_label_zh?: string
  cta_href?: string
}

/** A short audit/trust note shown beneath the page so the user knows that
 *  approval decisions are durably recorded. Surfaced verbatim. */
export interface AuditNote {
  message_en: string
  message_zh: string
}

/** The complete payload returned by GET /api/agent/session for the tenant
 *  agent workspace. Today this is mock; later it'll be assembled from
 *  agent_configs + agent_sessions + user_memories + task_memories +
 *  approval_events live tables. */
export interface TenantAgentSession {
  /** Server-generated session id. Mock today; later: agent_sessions.id. */
  session_id: string
  /** Always 'tenant' on this route. Kept explicit for forward-compat. */
  role: AgentRole
  agent_name: string                // 'Luna'
  agent_role_label_en: string       // 'Tenant Personal Agent'
  agent_role_label_zh: string       // '租客个人助手'
  status: AgentStatus
  /** One-liner shown beneath the agent name in the header. */
  status_message_en: string
  status_message_zh: string
  /** ISO timestamp of the last meaningful agent activity. */
  last_active_at: string

  workflow_stages: WorkflowStage[]
  pending_actions: PendingAction[]
  private_memory: PrivateMemoryItem[]
  recommendations: AgentRecommendation[]
  audit_note: AuditNote
}

// ─── Approval flow request / response ───────────────────────────────────────

export type ApprovalDecisionValue = 'approve' | 'reject'

export interface ApprovalDecisionRequest {
  action_id: string
  decision: ApprovalDecisionValue
  /** Optional free-text reason from the user (esp. on reject). */
  note?: string
}

export interface ApprovalDecisionResponse {
  ok: true
  action_id: string
  status: PendingActionStatus
  /** ISO timestamp the decision was recorded. */
  recorded_at: string
}

export interface ApprovalDecisionError {
  ok: false
  error: string
}

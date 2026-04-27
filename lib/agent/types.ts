// -----------------------------------------------------------------------------
// AI-Native Agent Runtime — Core Types
// -----------------------------------------------------------------------------
// L1 Capability Layer: every callable backend operation is wrapped as a Tool.
// L2 Agent: a system prompt + tool subset + memory + output schema.
// L3 App: chat UI that streams agentic loop output.
//
// All types are framework-agnostic — no Anthropic / OpenAI imports here.
// The agent loop adapts these to whatever model SDK is in use.
// -----------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Tool definitions ───────────────────────────────────────────────────────

/**
 * A capability tool — pure async function with declared input/output schemas.
 * Tools are registered in lib/agent/registry.ts and invoked by agents during
 * their loop. Every invocation writes a row to tool_executions for audit.
 */
export interface CapabilityTool<TInput = unknown, TOutput = unknown> {
  /** Stable tool name in snake_case. Used by Sonnet / agent loop to refer. */
  name: string

  /** Semver. Bump on breaking input/output schema changes. Stored on each
   *  tool_executions row so historical audits remain reproducible. */
  version: string

  /** Bilingual description (English first, Chinese after a separator).
   *  Sonnet sees this and decides when to call the tool. */
  description: string

  /** JSONSchema for input. Validated before handler runs. */
  inputSchema: object

  /** JSONSchema for output. Documentation-only; not enforced (handlers
   *  declare their TypeScript return type). */
  outputSchema?: object

  /** True when the tool produces a side effect that affects the user or
   *  third parties (sends email, modifies external data). Such tools are
   *  wrapped in pending_actions, NOT executed directly during agent loop. */
  needsApproval: boolean

  /** Pure async handler. Should not throw — catch internally and surface
   *  errors as a structured output. The framework will still record the
   *  exception in tool_executions if it does throw. */
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>
}

/**
 * Runtime context passed to every tool handler. The agent loop populates
 * this from the request session.
 */
export interface ToolContext {
  /** Authenticated user id from Supabase auth. */
  userId: string

  /** Conversation that initiated this call. null when running synchronously
   *  outside a chat session (e.g. classic /screen flow calling tools). */
  conversationId: string | null

  /** Optional message id that triggered this call. Used to link the
   *  tool_execution row back to the assistant message that decided to call. */
  messageId?: string

  /** Anthropic API key — passed for tools that internally call Haiku/Sonnet
   *  (e.g. classify_files, run_pdf_forensics for the OCR step). */
  anthropicApiKey?: string

  /** Service-role Supabase client — bypasses RLS. Used for registry queries,
   *  tool_executions writes, ca_corp_registry lookups, etc. */
  supabaseAdmin: SupabaseClient

  /** Logger. Tools should log warnings via this rather than console directly
   *  so callers can capture / silence as needed. */
  log?: (level: 'info' | 'warn' | 'error', msg: string, meta?: any) => void
}

// ─── Agent definitions ──────────────────────────────────────────────────────

/**
 * An agent is a configured (system prompt, tool subset, model) tuple. The
 * agent loop uses this to drive a chat conversation.
 */
export interface AgentDefinition {
  /** Stable agent kind. Examples: 'logic', 'nova', 'echo', 'analyst', 'mediator'. */
  kind: string

  /** Display name shown in UI. */
  displayName: string

  /** Bilingual one-liner. */
  description: string

  /** Full system prompt. Bilingual content welcome. */
  systemPrompt: string

  /** Names of tools this agent is allowed to call. Subset of the global
   *  registry. Agents see only their allowed tools in function-calling
   *  metadata, so Sonnet won't try to call something out of scope. */
  toolNames: string[]

  /** Anthropic model. Typically claude-sonnet-4-6 for reasoning agents,
   *  claude-haiku-4-5 for high-frequency simple agents. */
  model: string

  /** Max tokens per turn. Tune per agent based on expected output verbosity. */
  maxTokens: number

  /** Soft cap on agentic loop turns to prevent runaway. Default 8. */
  maxTurns?: number
}

// ─── Tool execution audit ───────────────────────────────────────────────────

/**
 * Row written to tool_executions on every invocation. Constructed by the
 * registry runner, not by tool handlers themselves.
 */
export interface ToolExecutionRecord {
  conversation_id: string | null
  message_id: string | null
  tool_name: string
  tool_version: string
  input: unknown
  output: unknown
  status: 'success' | 'error' | 'timeout'
  error_message: string | null
  duration_ms: number
}

// ─── Output blocks (rendered by frontend) ───────────────────────────────────

/**
 * Discriminated union of UI blocks an agent can emit. The frontend has a
 * matching renderer per kind. New block kinds = new front-end component.
 *
 * MVP block set — extend as new agents need new visualizations.
 */
export type AssistantBlock =
  | { kind: 'text'; markdown: string }
  | {
      kind: 'screening_card'
      screening_id: string
      overall: number
      tier: 'approve' | 'conditional' | 'decline'
      flags: Array<{ code: string; severity: string; evidence_zh: string; evidence_en: string }>
      cited_tool_executions?: string[]
    }
  | {
      kind: 'document_viewer'
      file_name: string
      annotations?: Array<{ page: number; rect?: [number, number, number, number]; note: string }>
    }
  | {
      kind: 'action_proposal'
      pending_action_id: string
      action_kind: string
      preview: any
      label_zh: string
      label_en: string
    }
  | {
      kind: 'files_upload'
      accept: string[]  // mime types
      hint_zh?: string
      hint_en?: string
    }
  | {
      kind: 'followup_suggestions'
      suggestions: Array<{ label_zh: string; label_en: string; prompt: string }>
    }

// ─── Memory ─────────────────────────────────────────────────────────────────

export interface UserFact {
  id: number
  user_id: string
  fact: string
  fact_type: 'preference' | 'past_concern' | 'screening_pattern' | 'business_context'
  confidence: number
  source_message_id: string | null
  created_at: string
  superseded_at: string | null
}

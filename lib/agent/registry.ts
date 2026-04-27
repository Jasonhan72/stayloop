// -----------------------------------------------------------------------------
// Tool Registry
// -----------------------------------------------------------------------------
// Central registration + dispatch + audit logging for L1 capability tools.
//
// Tools register at module load time via `registerTool()`. The agent loop
// asks for tool definitions by name (via `getTool` / `toolsForAgent`) when
// building the function-calling metadata for Sonnet, and calls
// `executeTool()` when Sonnet emits a tool_use block.
//
// `executeTool()` handles:
//   - Input validation (rough — JSONSchema enforcement deferred to Sprint 2)
//   - Timeout / try-catch wrapping
//   - Writing the tool_execution audit row
//   - Surfacing errors as structured outputs rather than throws
// -----------------------------------------------------------------------------

import type {
  CapabilityTool,
  ToolContext,
  ToolExecutionRecord,
} from './types'

// Module-level registry. Populated once on import (each tool file calls
// registerTool at top level).
const REGISTRY = new Map<string, CapabilityTool<any, any>>()

/**
 * Register a tool. Throws if a tool with the same name already exists —
 * each name must be unique (tools are referenced by string from agent
 * definitions and Sonnet output).
 */
export function registerTool<I, O>(tool: CapabilityTool<I, O>): void {
  if (REGISTRY.has(tool.name)) {
    throw new Error(`Tool already registered: ${tool.name}`)
  }
  REGISTRY.set(tool.name, tool as CapabilityTool<any, any>)
}

/**
 * Look up a registered tool by name. Returns null if not found.
 */
export function getTool(name: string): CapabilityTool | null {
  return REGISTRY.get(name) ?? null
}

/**
 * Return all tools that an agent (with the given allow-list) can use.
 * Order preserved from the agent's toolNames array so prompt ordering
 * is deterministic.
 */
export function toolsForAgent(toolNames: string[]): CapabilityTool[] {
  const out: CapabilityTool[] = []
  for (const name of toolNames) {
    const t = REGISTRY.get(name)
    if (t) out.push(t)
    // Silently skip unknowns — they may be planned tools not yet built.
    // The agent's prompt may still mention them but Sonnet's tools list
    // simply won't include them.
  }
  return out
}

/**
 * Returns all registered tool names. Useful for diagnostics / dashboard.
 */
export function allRegisteredToolNames(): string[] {
  return Array.from(REGISTRY.keys()).sort()
}

// ─── Execution wrapper ────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000  // 60s — most tools should be much faster

export interface ExecuteResult<O = unknown> {
  status: 'success' | 'error' | 'timeout'
  output: O | { error: string }
  error_message?: string
  duration_ms: number
}

/**
 * Execute a tool by name with full audit logging.
 *
 * Design choices:
 * - Errors are caught and converted to a structured output so the agent
 *   loop never crashes on tool failure — the assistant message can decide
 *   how to respond ("the registry lookup failed, retrying" vs giving up).
 * - timeout_ms defaults to 60s but each tool can override via input.
 * - The tool_execution row is written via the service-role client so RLS
 *   doesn't block. The user can still SELECT their own rows.
 */
export async function executeTool<I, O>(
  name: string,
  input: I,
  ctx: ToolContext,
  options: { timeoutMs?: number } = {},
): Promise<ExecuteResult<O>> {
  const tool = REGISTRY.get(name) as CapabilityTool<I, O> | undefined
  const t0 = Date.now()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (!tool) {
    const result: ExecuteResult<O> = {
      status: 'error',
      output: { error: `tool_not_registered: ${name}` } as any,
      error_message: `Tool not registered: ${name}`,
      duration_ms: 0,
    }
    await writeAuditRow(ctx, name, '0.0.0', input, result.output, result)
    return result
  }

  // needsApproval tools should not be called directly — they're meant to be
  // wrapped in pending_actions. Refuse and log so the agent learns.
  if (tool.needsApproval) {
    const result: ExecuteResult<O> = {
      status: 'error',
      output: { error: 'needs_approval', action_kind: tool.name } as any,
      error_message: `Tool ${tool.name} requires user approval; route through pending_actions instead.`,
      duration_ms: 0,
    }
    await writeAuditRow(ctx, name, tool.version, input, result.output, result)
    return result
  }

  try {
    const output = await Promise.race([
      tool.handler(input, ctx),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('tool_timeout')), timeoutMs),
      ),
    ])
    const result: ExecuteResult<O> = {
      status: 'success',
      output,
      duration_ms: Date.now() - t0,
    }
    await writeAuditRow(ctx, name, tool.version, input, output, result)
    return result
  } catch (e: any) {
    const isTimeout = e?.message === 'tool_timeout'
    const result: ExecuteResult<O> = {
      status: isTimeout ? 'timeout' : 'error',
      output: { error: e?.message || 'unknown_error' } as any,
      error_message: e?.message?.slice(0, 500) || 'unknown_error',
      duration_ms: Date.now() - t0,
    }
    await writeAuditRow(ctx, name, tool.version, input, result.output, result)
    return result
  }
}

/**
 * Write a row to tool_executions. Failure to write is logged but not raised
 * — auditing is best-effort, never blocks the user.
 */
async function writeAuditRow(
  ctx: ToolContext,
  toolName: string,
  toolVersion: string,
  input: unknown,
  output: unknown,
  result: { status: string; error_message?: string; duration_ms: number },
): Promise<void> {
  try {
    const row: Omit<ToolExecutionRecord, 'duration_ms'> & { duration_ms: number } = {
      conversation_id: ctx.conversationId,
      message_id: ctx.messageId ?? null,
      tool_name: toolName,
      tool_version: toolVersion,
      // Defensive: don't store unbounded inputs. Cap at 32KB serialized.
      input: trimForStorage(input),
      output: trimForStorage(output),
      status: result.status as any,
      error_message: result.error_message ?? null,
      duration_ms: result.duration_ms,
    }
    const { error } = await ctx.supabaseAdmin.from('tool_executions').insert(row)
    if (error) {
      ctx.log?.('warn', `tool_executions insert failed for ${toolName}: ${error.message}`)
    }
  } catch (e: any) {
    ctx.log?.('warn', `tool_executions audit threw: ${e?.message}`)
  }
}

/**
 * Best-effort serialization cap so we don't blow the JSONB column on
 * unexpectedly large outputs (e.g. an OCR text field gone wild).
 */
function trimForStorage(x: unknown, maxBytes = 32 * 1024): unknown {
  try {
    const json = JSON.stringify(x)
    if (json.length <= maxBytes) return x
    return {
      _truncated: true,
      _original_bytes: json.length,
      preview: json.slice(0, maxBytes),
    }
  } catch {
    return { _unserializable: true }
  }
}

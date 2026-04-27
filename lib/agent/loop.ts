// -----------------------------------------------------------------------------
// Agentic Loop
// -----------------------------------------------------------------------------
// Drives a multi-turn conversation between the user and an agent (Logic /
// Nova / Echo / etc.), routing tool_use blocks emitted by the model through
// the registry's executeTool() and feeding results back. SSE-streams
// intermediate state to the frontend.
//
// Custom implementation per ADR-002 — no LangChain / Claude Agent SDK.
// ~200 lines is enough for one-agent + tools + memory + audit.
// -----------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentDefinition, AssistantBlock, ToolContext } from './types'
import { executeTool, toolsForAgent } from './registry'
import { toAnthropicTools } from './anthropic-adapter'
import { recallUserFacts, formatFactsForPrompt } from './memory'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

export interface LoopOptions {
  agent: AgentDefinition
  conversationId: string
  userId: string
  /** History before this turn — caller loads from messages table. */
  history: AnthropicMessage[]
  /** New user message (will be appended before invoking model). */
  userMessage: string | AnthropicContentBlock[]
  /** Service-role Supabase client (for tools + audit + memory). */
  supabaseAdmin: SupabaseClient
  anthropicApiKey: string
  /** Called for each streamed event so the frontend can render incrementally. */
  onEvent?: (event: LoopEvent) => void | Promise<void>
  /** Abort signal — wired from the SSE response. */
  signal?: AbortSignal
}

export interface LoopResult {
  /** All assistant + tool messages produced this turn (full content). */
  newMessages: AnthropicMessage[]
  /** Total tokens used (input + output) across all turns. */
  tokens: { input: number; output: number }
  /** Tool execution audit ids written. */
  toolExecutionIds: string[]
}

export type LoopEvent =
  | { type: 'turn_start'; turn: number }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; tool_name: string; tool_input: unknown }
  | { type: 'tool_result'; tool_name: string; output: unknown; status: string }
  | { type: 'block'; block: AssistantBlock }
  | { type: 'error'; message: string }
  | { type: 'done'; result: LoopResult }

// Anthropic content-block shapes (subset we use)
type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string | any[]; is_error?: boolean }
  | { type: 'document'; source: any; title?: string }
  | { type: 'image'; source: any }

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

const MAX_TURNS_DEFAULT = 8

/**
 * Execute one user-initiated round of the agentic loop.
 *
 * Anthropic's tool_use protocol:
 *   1. Send messages + tools list
 *   2. Model returns assistant content with text + tool_use blocks
 *   3. We execute each tool, build a user message with tool_result blocks
 *   4. Send back to model
 *   5. Repeat until model returns assistant content with no tool_use → done
 */
export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const tools = toolsForAgent(opts.agent.toolNames)
  const anthropicTools = toAnthropicTools(tools)

  // Build system prompt with memory injection
  const facts = await recallUserFacts(opts.supabaseAdmin, opts.userId)
  const memoryBlock = formatFactsForPrompt(facts)
  const systemPrompt = memoryBlock
    ? `${opts.agent.systemPrompt}\n\n${memoryBlock}`
    : opts.agent.systemPrompt

  // Compose messages: history + new user message
  const messages: AnthropicMessage[] = [...opts.history]
  const userContent =
    typeof opts.userMessage === 'string'
      ? [{ type: 'text', text: opts.userMessage } as AnthropicContentBlock]
      : opts.userMessage
  messages.push({ role: 'user', content: userContent })

  const newMessages: AnthropicMessage[] = []
  const toolExecutionIds: string[] = []
  let inputTokens = 0
  let outputTokens = 0

  const maxTurns = opts.agent.maxTurns ?? MAX_TURNS_DEFAULT

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) {
      await emit(opts, { type: 'error', message: 'aborted' })
      break
    }
    await emit(opts, { type: 'turn_start', turn })

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.agent.model,
        max_tokens: opts.agent.maxTokens,
        system: systemPrompt,
        messages,
        tools: anthropicTools,
      }),
      signal: opts.signal,
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      await emit(opts, { type: 'error', message: `anthropic_${res.status}: ${errText.slice(0, 300)}` })
      break
    }
    const json: any = await res.json()
    inputTokens += json?.usage?.input_tokens || 0
    outputTokens += json?.usage?.output_tokens || 0

    const assistantContent: AnthropicContentBlock[] = json?.content || []
    messages.push({ role: 'assistant', content: assistantContent })
    newMessages.push({ role: 'assistant', content: assistantContent })

    // Stream text + tool_use to frontend
    for (const block of assistantContent) {
      if (block.type === 'text') {
        await emit(opts, { type: 'text_delta', text: block.text })
      } else if (block.type === 'tool_use') {
        await emit(opts, { type: 'tool_use', tool_name: block.name, tool_input: block.input })
      }
    }

    // Find tool_uses; if none, model is done
    const toolUses = assistantContent.filter(
      (b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
    )
    if (toolUses.length === 0) break

    // Execute tools (parallel — most are read-only). For tools that mutate
    // state, the registry refuses (needsApproval=true) and returns an error
    // result, which Sonnet sees and can adapt.
    const ctx: ToolContext = {
      userId: opts.userId,
      conversationId: opts.conversationId,
      anthropicApiKey: opts.anthropicApiKey,
      supabaseAdmin: opts.supabaseAdmin,
      log: (level, msg, meta) =>
        console[level === 'info' ? 'log' : level](`[agent:${opts.agent.kind}]`, msg, meta ?? ''),
    }

    const results = await Promise.all(
      toolUses.map(async (tu) => {
        const result = await executeTool(tu.name, tu.input, ctx)
        await emit(opts, {
          type: 'tool_result',
          tool_name: tu.name,
          output: result.output,
          status: result.status,
        })
        return { tu, result }
      }),
    )

    // Build the user message containing tool_result blocks back to model
    const toolResultBlocks: AnthropicContentBlock[] = results.map(({ tu, result }) => ({
      type: 'tool_result',
      tool_use_id: tu.id,
      content:
        typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output).slice(0, 50_000),
      is_error: result.status !== 'success',
    }))
    messages.push({ role: 'user', content: toolResultBlocks })
    newMessages.push({ role: 'user', content: toolResultBlocks })
  }

  const result: LoopResult = {
    newMessages,
    tokens: { input: inputTokens, output: outputTokens },
    toolExecutionIds,
  }
  await emit(opts, { type: 'done', result })
  return result
}

async function emit(opts: LoopOptions, event: LoopEvent): Promise<void> {
  if (!opts.onEvent) return
  try {
    await opts.onEvent(event)
  } catch (e) {
    console.warn('[agent loop] onEvent threw:', (e as Error).message)
  }
}

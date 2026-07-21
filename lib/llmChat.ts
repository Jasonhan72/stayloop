// -----------------------------------------------------------------------------
// llmChat — unified chat-completion adapter (SERVER-ONLY, edge-safe).
//
// One entry point for every server-side LLM call that may route to either
// provider family:
//   • anthropic      → Messages API, byte-equivalent to the historical
//                      /api/agent/turn request shape (prompt caching on the
//                      system block, conditional temperature).
//   • openai-compat  → POST {baseUrl}/chat/completions with Bearer auth
//                      (DeepSeek / Moonshot Kimi / 阿里通义 / 智谱 GLM).
//
// NEVER import from client components — it reads process.env[apiKeyEnv].
// Image content blocks are Anthropic-only: the openai-compat branch throws,
// callers must check ModelDef.vision BEFORE routing an image turn here.
// -----------------------------------------------------------------------------
import { type ModelDef, supportsTemperature } from './modelConfig'

export type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

/** Anthropic-style message; the adapter converts for openai-compat. */
export type ChatMessage = { role: 'user' | 'assistant'; content: string | ChatContentBlock[] }

/** The model's provider API key env var is not configured on this server. */
export class LlmKeyMissingError extends Error {
  constructor(public readonly apiKeyEnv: string) {
    super(`LLM API key not configured: ${apiKeyEnv}`)
    this.name = 'LlmKeyMissingError'
  }
}

/** Non-2xx from the provider; `body` is the response text (truncated). */
export class LlmHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`llm http ${status}: ${body}`)
    this.name = 'LlmHttpError'
  }
}

/**
 * The provider returned an EMPTY visible answer because the token budget was
 * consumed before any content was produced — openai-compat reasoning models
 * (Kimi 思考型 etc.) burn max_tokens on reasoning_content, or the completion
 * was cut at finish_reason='length' with nothing emitted yet.
 */
export class LlmTruncatedError extends Error {
  constructor(detail: string) {
    super(`llm output truncated: reasoning budget exhausted before visible content (${detail})`)
    this.name = 'LlmTruncatedError'
  }
}

export interface LlmChatParams {
  model: ModelDef
  system: string
  messages: ChatMessage[]
  maxTokens: number
  temperature?: number
  /** openai-compat: response_format json_object（四家国产均支持）。anthropic 分支忽略（走 prompt 契约）。 */
  jsonMode?: boolean
  signal?: AbortSignal
}

export interface LlmChatResult {
  text: string
  /** 原始 usage（如有），形状因 provider 而异。 */
  usage?: Record<string, unknown>
}

export async function llmChat(p: LlmChatParams): Promise<LlmChatResult> {
  const apiKey = (process.env[p.model.apiKeyEnv] || '').trim()
  if (!apiKey) throw new LlmKeyMissingError(p.model.apiKeyEnv)
  return p.model.provider === 'anthropic' ? anthropicChat(p, apiKey) : openaiCompatChat(p, apiKey)
}

// ── Anthropic Messages API ───────────────────────────────────────────────────

async function anthropicChat(p: LlmChatParams, apiKey: string): Promise<LlmChatResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: p.model.id,
      max_tokens: p.maxTokens,
      // Sonnet 5 / Opus 4.8 reject sampling params (400) — omit there.
      ...(p.temperature !== undefined && supportsTemperature(p.model.id) ? { temperature: p.temperature } : {}),
      system: [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }],
      messages: p.messages,
    }),
    signal: p.signal,
  })
  if (!res.ok) {
    throw new LlmHttpError(res.status, (await res.text()).slice(0, 300))
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }>; usage?: Record<string, unknown> }
  return { text: data.content?.[0]?.text || '', usage: data.usage }
}

// ── OpenAI-compatible chat/completions ───────────────────────────────────────

/** Flatten Anthropic content blocks to plain text; image blocks are a caller bug here. */
function flattenContent(content: string | ChatContentBlock[], modelId: string): string {
  if (typeof content === 'string') return content
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'image') {
      throw new Error(`model ${modelId} has no vision support — route image turns to an Anthropic model (check ModelDef.vision before calling)`)
    }
    parts.push(block.text)
  }
  return parts.join('\n\n')
}

async function openaiCompatChat(p: LlmChatParams, apiKey: string): Promise<LlmChatResult> {
  const baseUrl = p.model.baseUrl
  if (!baseUrl) throw new Error(`model ${p.model.id}: openai-compat provider requires baseUrl in its ModelDef`)
  const messages = [
    { role: 'system' as const, content: p.system },
    ...p.messages.map((m) => ({ role: m.role, content: flattenContent(m.content, p.model.id) })),
  ]
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: p.model.id,
      max_tokens: p.maxTokens,
      messages,
      // Kimi 思考型模型只允许 temperature=1 —— 标了 omitTemperature 的省略该参数。
      ...(p.temperature !== undefined && !p.model.omitTemperature ? { temperature: p.temperature } : {}),
      ...(p.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: p.signal,
  })
  if (!res.ok) {
    throw new LlmHttpError(res.status, (await res.text()).slice(0, 300))
  }
  const data = (await res.json()) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string } }>
    usage?: Record<string, unknown>
  }
  const choice = data.choices?.[0]
  const text = choice?.message?.content || ''
  // Empty visible content + (cut at length, or the budget went to hidden
  // reasoning_content) = the answer never made it out. Surface it as a typed
  // error instead of returning '' — callers show a "拆小问题" hint for this.
  if (!text && (choice?.finish_reason === 'length' || choice?.message?.reasoning_content)) {
    throw new LlmTruncatedError(
      choice?.finish_reason === 'length' ? 'finish_reason=length' : 'reasoning_content only',
    )
  }
  return { text, usage: data.usage }
}

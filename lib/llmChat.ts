// -----------------------------------------------------------------------------
// llmChat — unified chat-completion adapter (SERVER-ONLY, edge-safe).
//
// One entry point for every server-side LLM call that may route to either
// provider family:
//   • anthropic      → Messages API (prompt caching on the system block,
//                      conditional temperature, optional assistant prefill).
//   • openai-compat  → POST {baseUrl}/chat/completions with Bearer auth
//                      (OpenAI / Gemini AI Studio / DeepSeek / Moonshot Kimi /
//                      阿里通义 / 智谱 GLM / OpenRouter / custom gateways).
//
// Content blocks are Anthropic-shaped (text / image / document, with url or
// base64 sources); the openai-compat branch converts them:
//   image    → image_url data URL (url sources are fetched server-side and
//              inlined — providers cannot be trusted to fetch signed URLs).
//   document → per ModelDef.pdfInput (measured 2026-08-22):
//              'file'      OpenAI / Qwen 3.8 Max  → {type:'file', file_data}
//              'image_url' Gemini                 → image_url with a
//                                                    data:application/pdf URL
//              'text'      everyone else          → text extracted with
//                                                    unpdf (scanned PDFs
//                                                    become an explicit
//                                                    "unreadable" note).
// Vision: callers must only route image/document content to models with
// vision=true (modelUsableForSlot enforces it for the document slots).
//
// NEVER import from client components — it reads process.env[apiKeyEnv].
// -----------------------------------------------------------------------------
import { type ModelDef, supportsAssistantPrefill, supportsTemperature } from './modelConfig'
import { normalizeUsage, recordUsage, type LlmUsageMeta, type UsageTokens } from './llmUsage'

export type ChatSource =
  | { type: 'base64'; media_type: string; data: string }
  | { type: 'url'; url: string }

export type ChatContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: ChatSource }
  | { type: 'document'; source: ChatSource; title?: string }

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
  /** openai-compat: response_format json_object. anthropic 分支忽略（走 prompt 契约 / prefill）。 */
  jsonMode?: boolean
  /**
   * Ask for a JSON object as deterministically as the provider allows:
   * anthropic + a prefill-capable model → assistant prefill "{" (the returned
   * text already includes the "{"); any other model → jsonMode. Callers
   * therefore never prepend "{" themselves.
   */
  prefillJson?: boolean
  /** anthropic: add cache_control to the system block (default true). */
  cacheSystem?: boolean
  signal?: AbortSignal
  /** Metering context (who / which screening / which slot) — recorded to ai_usage with tokens + cost. */
  meta?: LlmUsageMeta
}

export interface LlmChatResult {
  text: string
  /** 原始 usage（如有），形状因 provider 而异。 */
  usage?: Record<string, unknown>
  /** anthropic stop_reason / openai finish_reason, normalised: 'end' | 'max_tokens' | other. */
  stopReason?: string
}

export async function llmChat(p: LlmChatParams): Promise<LlmChatResult> {
  const apiKey = (process.env[p.model.apiKeyEnv] || '').trim()
  if (!apiKey) throw new LlmKeyMissingError(p.model.apiKeyEnv)
  const t0 = Date.now()
  try {
    const r = p.model.provider === 'anthropic' ? await anthropicChat(p, apiKey) : await openaiCompatChat(p, apiKey)
    await recordUsage({ model: p.model, usage: normalizeUsage(p.model.provider, r.usage), latencyMs: Date.now() - t0, ok: true, meta: p.meta })
    return r
  } catch (e) {
    await recordUsage({ model: p.model, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, latencyMs: Date.now() - t0, ok: false, error: (e as Error)?.message, meta: p.meta })
    throw e
  }
}

// ── Streaming ────────────────────────────────────────────────────────────────

export interface LlmStreamResult {
  text: string
  /** provider usage, normalised (present when the stream reported it) */
  usage?: UsageTokens
  stopReason: string
  /** Provider signalled an error mid-stream (Anthropic `error` event / OpenAI error chunk). */
  streamError: string | null
  /** Clean end-of-stream marker seen (Anthropic message_stop / OpenAI [DONE]). */
  sawStop: boolean
}

export interface LlmStreamParams extends LlmChatParams {
  /** Called after each text delta with the accumulated text so far. */
  onText?: (accumulated: string) => void
}

/** Streaming variant (used by screening for real generation progress). */
export async function llmChatStream(p: LlmStreamParams): Promise<LlmStreamResult> {
  const apiKey = (process.env[p.model.apiKeyEnv] || '').trim()
  if (!apiKey) throw new LlmKeyMissingError(p.model.apiKeyEnv)
  const t0 = Date.now()
  try {
    const r = p.model.provider === 'anthropic' ? await anthropicStream(p, apiKey) : await openaiCompatStream(p, apiKey)
    await recordUsage({ model: p.model, usage: r.usage || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, latencyMs: Date.now() - t0, ok: !r.streamError, error: r.streamError, meta: p.meta })
    return r
  } catch (e) {
    await recordUsage({ model: p.model, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, latencyMs: Date.now() - t0, ok: false, error: (e as Error)?.message, meta: p.meta })
    throw e
  }
}

// ── Anthropic Messages API ───────────────────────────────────────────────────

/**
 * First text block of an Anthropic Messages response. Claude 5 models (Opus 5
 * etc.) may put a `thinking` block FIRST — `content[0].text` is then
 * undefined and the reply silently became '' (found 2026-08-22 via the admin
 * model test: Opus 5 returned ok with empty text). Always use this.
 */
export function anthropicText(data: unknown): string {
  const content = (data as { content?: Array<{ type?: string; text?: string }> } | null)?.content
  if (!Array.isArray(content)) return ''
  const parts = content.filter((b) => b && (b.type === 'text' || (b.type === undefined && typeof b.text === 'string')) && typeof b.text === 'string').map((b) => b.text as string)
  return parts.join('')
}

function anthropicBody(p: LlmChatParams, stream: boolean) {
  const prefill = !!p.prefillJson && supportsAssistantPrefill(p.model.id)
  const messages: ChatMessage[] = prefill ? [...p.messages, { role: 'assistant', content: '{' }] : p.messages
  return {
    prefill,
    body: {
      model: p.model.id,
      max_tokens: p.maxTokens,
      // Sonnet 5 / Opus 4.8 / Claude 5 reject sampling params (400) — omit there.
      ...(p.temperature !== undefined && supportsTemperature(p.model.id) ? { temperature: p.temperature } : {}),
      system: [{ type: 'text', text: p.system, ...(p.cacheSystem === false ? {} : { cache_control: { type: 'ephemeral' } }) }],
      messages,
      ...(stream ? { stream: true } : {}),
    },
  }
}

const ANTHROPIC_HEADERS = (apiKey: string) => ({
  'Content-Type': 'application/json',
  'x-api-key': apiKey,
  'anthropic-version': '2023-06-01',
})

async function anthropicChat(p: LlmChatParams, apiKey: string): Promise<LlmChatResult> {
  const { prefill, body } = anthropicBody(p, false)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: ANTHROPIC_HEADERS(apiKey),
    body: JSON.stringify(body),
    signal: p.signal,
  })
  if (!res.ok) {
    throw new LlmHttpError(res.status, (await res.text()).slice(0, 300))
  }
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }>; usage?: Record<string, unknown>; stop_reason?: string }
  return { text: (prefill ? '{' : '') + anthropicText(data), usage: data.usage, stopReason: data.stop_reason === 'end_turn' ? 'end' : (data.stop_reason || undefined) }
}

async function anthropicStream(p: LlmStreamParams, apiKey: string): Promise<LlmStreamResult> {
  const { prefill, body } = anthropicBody(p, true)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: ANTHROPIC_HEADERS(apiKey),
    body: JSON.stringify(body),
    signal: p.signal,
  })
  if (!res.ok || !res.body) {
    throw new LlmHttpError(res.status, (await res.text()).slice(0, 500))
  }
  let text = prefill ? '{' : ''
  let stopReason = ''
  let streamError: string | null = null
  let sawStop = false
  const usageRaw: Record<string, unknown> = {}
  await readSse(res.body, (payload) => {
    let ev: { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; error?: { type?: string; message?: string }; message?: { usage?: Record<string, unknown> }; usage?: Record<string, unknown> }
    try { ev = JSON.parse(payload) } catch { return }
    if (ev.type === 'content_block_delta' && ev.delta?.text) { text += ev.delta.text; p.onText?.(text) }
    else if (ev.type === 'message_start' && ev.message?.usage) Object.assign(usageRaw, ev.message.usage)
    else if (ev.type === 'message_delta') {
      if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason === 'end_turn' ? 'end' : ev.delta.stop_reason
      if (ev.usage) Object.assign(usageRaw, ev.usage)
    }
    else if (ev.type === 'message_stop') sawStop = true
    else if (ev.type === 'error') streamError = ev.error?.type || 'stream_error'
  })
  return { text, usage: normalizeUsage('anthropic', usageRaw), stopReason, streamError, sawStop }
}

// ── OpenAI-compatible chat/completions ───────────────────────────────────────

const DATA_URL_RE = /^data:([^;,]+);base64,/i

async function sourceToBase64(src: ChatSource, signal?: AbortSignal): Promise<{ media_type: string; data: string } | null> {
  if (src.type === 'base64') return { media_type: src.media_type, data: src.data }
  try {
    const m = DATA_URL_RE.exec(src.url)
    if (m) return { media_type: m[1], data: src.url.slice(m[0].length) }
    const r = await fetch(src.url, { signal })
    if (!r.ok) return null
    const buf = new Uint8Array(await r.arrayBuffer())
    const media_type = (r.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim()
    return { media_type, data: bytesToBase64(buf) }
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Text of a PDF for providers that cannot ingest PDFs (layout lost; scans unreadable). */
async function pdfToTextBlock(b64: string, title: string | undefined, maxChars = 60_000, meta?: LlmUsageMeta): Promise<string> {
  const label = title ? `"${title}"` : 'document'
  try {
    const { readPdfTextDensity } = await import('./forensics/pdf-text')
    const bytes = base64ToBytes(b64)
    const d = await readPdfTextDensity(bytes)
    if (!d) return `[PDF ${label}: could not be parsed by this model path — treat as UNREADABLE and say so explicitly; do not guess its contents.]`
    const live = d.text_sample.trim()
    // Scanned / sparse PDFs: recover the page images with the Qwen OCR layer
    // (lib/ocr/qwenOcr.ts — DASHSCOPE_API_KEY). Null = no key, no extractable
    // page images (vector-outline pages, JPX/CCITT) or OCR failure.
    let ocr: Awaited<ReturnType<typeof import('./ocr/qwenOcr').ocrPdfScan>> = null
    if (!live || d.is_likely_image_pdf) {
      try {
        const { ocrPdfScan } = await import('./ocr/qwenOcr')
        ocr = await ocrPdfScan(bytes, { meta })
      } catch { ocr = null }
    }
    if (!live && !ocr) {
      return `[PDF ${label}: ${d.page_count} page(s), scanned/image-only and no OCR text could be recovered — this model cannot read it. Treat the file as UNREADABLE (not as missing, not as suspicious by itself) and say so explicitly.]`
    }
    const parts: string[] = []
    if (live) {
      const body = d.text_sample.length > maxChars ? d.text_sample.slice(0, maxChars) + `\n[… truncated at ${maxChars} chars]` : d.text_sample
      const sparse = d.is_likely_image_pdf && !ocr ? ' VERY LITTLE text was found — most pages are probably scanned images that this model cannot see; treat the document as only PARTIALLY readable.' : ''
      parts.push(`[PDF ${label}: ${d.page_count} page(s); text layer extracted — layout, images and signatures are NOT visible to you.${sparse}]\n${body}`)
    }
    if (ocr) {
      const body = ocr.text.length > maxChars ? ocr.text.slice(0, maxChars) + `\n[… truncated at ${maxChars} chars]` : ocr.text
      const coverage = ocr.pages_ocred < ocr.pages_total ? ` Only ${ocr.pages_ocred} of ${ocr.pages_total} pages had recoverable page images${ocr.unsupported ? ` (${ocr.unsupported} image(s) in an unsupported encoding)` : ''}; the remaining pages are NOT visible to you — say so if they matter.` : ''
      parts.push(`[PDF ${label}: scanned pages — text recovered by OCR (${ocr.model}); OCR may contain recognition errors, layout is approximate.${coverage}]\n${body}`)
    }
    return parts.join('\n\n') + `\n[end of PDF ${label}]`
  } catch {
    return `[PDF ${label}: text extraction failed — treat as UNREADABLE and say so explicitly.]`
  }
}

type OpenAIPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

/** Convert Anthropic-shaped blocks to OpenAI-compatible parts (exported for tests). */
export async function toOpenAIContent(
  content: string | ChatContentBlock[],
  model: ModelDef,
  signal?: AbortSignal,
  meta?: LlmUsageMeta,
): Promise<string | OpenAIPart[]> {
  if (typeof content === 'string') return content
  const parts: OpenAIPart[] = []
  let docIdx = 0
  for (const block of content) {
    if (block.type === 'text') { parts.push({ type: 'text', text: block.text }); continue }
    if (block.type === 'image') {
      if (!model.vision) throw new Error(`model ${model.id} has no vision support — route image content to a vision model (check ModelDef.vision before calling)`)
      const b = await sourceToBase64(block.source, signal)
      if (!b) { parts.push({ type: 'text', text: '[image: could not be fetched — treat as missing]' }); continue }
      parts.push({ type: 'image_url', image_url: { url: `data:${b.media_type};base64,${b.data}` } })
      continue
    }
    // document (PDF)
    docIdx += 1
    const title = block.title || `document ${docIdx}`
    const b = await sourceToBase64(block.source, signal)
    if (!b) { parts.push({ type: 'text', text: `[PDF "${title}": could not be fetched — treat as missing]` }); continue }
    const mode = model.pdfInput || 'text'
    if (mode === 'file') {
      parts.push({ type: 'text', text: `[attached PDF: ${title}]` })
      parts.push({ type: 'file', file: { filename: safeFilename(title), file_data: `data:application/pdf;base64,${b.data}` } })
    } else if (mode === 'image_url') {
      parts.push({ type: 'text', text: `[attached PDF: ${title}]` })
      parts.push({ type: 'image_url', image_url: { url: `data:application/pdf;base64,${b.data}` } })
    } else {
      parts.push({ type: 'text', text: await pdfToTextBlock(b.data, title, 60_000, meta) })
    }
  }
  // Merge adjacent text parts (some providers reject many tiny parts); a
  // text-only message collapses to a plain string (widest provider compat).
  const merged: OpenAIPart[] = []
  for (const part of parts) {
    const last = merged[merged.length - 1]
    if (part.type === 'text' && last && last.type === 'text') last.text += '\n\n' + part.text
    else merged.push(part)
  }
  if (merged.every((m) => m.type === 'text')) return merged.map((m) => (m as { text: string }).text).join('\n\n')
  return merged
}

function safeFilename(title: string): string {
  const base = title.replace(/[^\w.\- ]+/g, '_').trim().slice(0, 80) || 'document'
  return /\.pdf$/i.test(base) ? base : base + '.pdf'
}

async function openaiBody(p: LlmChatParams, stream: boolean) {
  const messages = [
    { role: 'system' as const, content: p.system },
    ...(await Promise.all(p.messages.map(async (m) => ({ role: m.role, content: await toOpenAIContent(m.content, p.model, p.signal, p.meta) })))),
  ]
  const jsonMode = !!(p.jsonMode || p.prefillJson)
  return {
    model: p.model.id,
    // OpenAI GPT-5 系列只认 max_completion_tokens（max_tokens → 400）；其余沿用 max_tokens。
    [p.model.maxTokensParam || 'max_tokens']: p.maxTokens,
    messages,
    // Kimi 思考型模型 / GPT-5 只允许默认 temperature —— 标了 omitTemperature 的省略该参数。
    ...(p.temperature !== undefined && !p.model.omitTemperature ? { temperature: p.temperature } : {}),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    // stream_options.include_usage makes the final chunk carry token usage
    // (OpenAI / DeepSeek / DashScope / Moonshot / Gemini-compat all accept it).
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  }
}

async function openaiCompatChat(p: LlmChatParams, apiKey: string): Promise<LlmChatResult> {
  const baseUrl = p.model.baseUrl
  if (!baseUrl) throw new Error(`model ${p.model.id}: openai-compat provider requires baseUrl in its ModelDef`)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(await openaiBody(p, false)),
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
  return { text, usage: data.usage, stopReason: choice?.finish_reason === 'length' ? 'max_tokens' : choice?.finish_reason === 'stop' ? 'end' : choice?.finish_reason }
}

async function openaiCompatStream(p: LlmStreamParams, apiKey: string): Promise<LlmStreamResult> {
  const baseUrl = p.model.baseUrl
  if (!baseUrl) throw new Error(`model ${p.model.id}: openai-compat provider requires baseUrl in its ModelDef`)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(await openaiBody(p, true)),
    signal: p.signal,
  })
  if (!res.ok || !res.body) {
    throw new LlmHttpError(res.status, (await res.text()).slice(0, 500))
  }
  let text = ''
  let stopReason = ''
  let streamError: string | null = null
  let sawStop = false
  let usageRaw: Record<string, unknown> | null = null
  await readSse(res.body, (payload) => {
    if (payload === '[DONE]') { sawStop = true; return }
    let ev: { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>; error?: { message?: string; type?: string }; usage?: Record<string, unknown> | null }
    try { ev = JSON.parse(payload) } catch { return }
    if (ev.error) { streamError = ev.error.type || ev.error.message || 'stream_error'; return }
    if (ev.usage && typeof ev.usage === 'object') usageRaw = ev.usage
    const c = ev.choices?.[0]
    if (c?.delta?.content) { text += c.delta.content; p.onText?.(text) }
    if (c?.finish_reason) stopReason = c.finish_reason === 'length' ? 'max_tokens' : c.finish_reason === 'stop' ? 'end' : c.finish_reason
  })
  // Some providers omit [DONE] but do send finish_reason — treat that as a clean stop.
  if (!sawStop && stopReason) sawStop = true
  return { text, usage: usageRaw ? normalizeUsage('openai-compat', usageRaw) : undefined, stopReason, streamError, sawStop }
}

/** Minimal SSE reader: calls onData with each `data:` payload (trimmed). Flushes a final unterminated line. */
async function readSse(body: ReadableStream<Uint8Array>, onData: (payload: string) => void): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const handle = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line.startsWith('data:')) return
    onData(line.slice(5).trim())
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      handle(buf.slice(0, nl))
      buf = buf.slice(nl + 1)
    }
  }
  buf += decoder.decode()
  for (const tail of buf.split('\n')) handle(tail)
}

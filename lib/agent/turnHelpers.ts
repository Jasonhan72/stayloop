// Pure helpers for /api/agent/turn — extracted verbatim from the route so the
// deterministic input/output plumbing is unit-testable without an edge
// runtime. NO behavior changes: each function is a straight lift of the
// route's previous inline logic. Keep this module dependency-free (types
// only) so tests never touch network/env.
import type { MemoryItem, WorkflowState } from './types'

/**
 * Anonymous rate-limit bucketing key for a caller IP.
 * IPv6 callers can rotate interface IDs trivially (privacy extensions /
 * whole-/64 allocations), so bucket them by the /64 prefix instead of the
 * full address — approximated as the first 4 colon groups of the string
 * form via split(':').slice(0,4). Exact for uncompressed addresses; for
 * '::'-compressed forms the prefix may still carry interface bits, so the
 * grouping is partial there — but never looser than the previous
 * full-address key. Anything containing ':' is treated as IPv6; IPv4
 * keys are unchanged.
 */
export function bucketAnonIp(rawIp: string): string {
  return rawIp.includes(':') ? rawIp.split(':').slice(0, 4).join(':') : rawIp
}

/**
 * Input clamp for client-supplied memories (anonymous AND authed): every
 * string here is interpolated into the system prompt, so unbounded client
 * payloads are unbounded token spend. Truncate, don't reject.
 */
export function clampMemories(raw: unknown): MemoryItem[] {
  return (Array.isArray(raw) ? (raw as MemoryItem[]) : [])
    .slice(0, 50)
    .map((m) => ({
      ...m,
      key: typeof m?.key === 'string' ? m.key.slice(0, 500) : m?.key,
      label: typeof m?.label === 'string' ? m.label.slice(0, 80) : m?.label,
      // Object values are serialised into the prompt too — clamp them by
      // their JSON length, not just strings (review 2026-09-17).
      value: typeof m?.value === 'string'
        ? m.value.slice(0, 500)
        : (m?.value !== undefined && JSON.stringify(m.value ?? null).length > 500 ? JSON.stringify(m.value).slice(0, 500) : m?.value),
    }))
}

/**
 * Field-level workflow normalization, not just `?? default` — a crafted
 * payload with a partial workflow object (missing completed_steps) used to
 * crash buildSystemPrompt's .join() into a bare worker 500.
 */
export function normalizeWorkflow(raw: unknown): WorkflowState {
  const w = (raw ?? {}) as Partial<WorkflowState>
  return {
    // Every string here lands in the system prompt — clamp lengths, not
    // just counts (review 2026-09-19: an anonymous payload inflated the
    // prompt to 12 MB through completed_steps / current_stage).
    workflow_type: typeof w.workflow_type === 'string' ? w.workflow_type.slice(0, 80) : '',
    workflow_id: typeof w.workflow_id === 'string' ? w.workflow_id.slice(0, 80) : null,
    current_stage: typeof w.current_stage === 'string' ? w.current_stage.slice(0, 80) : '',
    completed_steps: Array.isArray(w.completed_steps) ? w.completed_steps.slice(0, 20).map((s) => String(s).slice(0, 80)) : [],
    status: w.status === 'paused' || w.status === 'completed' || w.status === 'archived' ? w.status : 'active',
  }
}

/** The model is asked for bare JSON, but tolerate ```json fences / prose. */
export function safeParseJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Salvage a usable reply from UNPARSEABLE model output. The model
 * occasionally answers a factual question in plain prose despite the JSON
 * contract — losing a real answer behind a canned fallback is worse, so
 * plain prose is returned as-is (fences stripped). BUT never surface a
 * broken-JSON fragment as if it were prose: if the output still looks like
 * JSON (starts with '{' or carries a "reply" field — typically truncated
 * mid-object), pull just the value of "reply" out with an escape-aware
 * regex; if even that fails, return '' so the caller falls through to the
 * honest 重发 copy rather than echoing raw JSON at the user.
 */
export function salvageReply(raw: string): string {
  let salvage = raw.replace(/```(?:json)?|```/g, '').trim()
  if (salvage && (salvage.startsWith('{') || salvage.includes('"reply"'))) {
    const m = salvage.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (m) {
      try {
        salvage = JSON.parse(`"${m[1]}"`) as string
      } catch {
        salvage = m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')
      }
    } else {
      salvage = ''
    }
  }
  return salvage
}

/** Markdown the chat bubble would show verbatim → plain text. Headings lose
 *  their hashes, bold/italic markers go, "* " / "- " bullets become "· ",
 *  inline code loses its backticks. Links keep their visible text and URL. */
export function flattenMarkdown(text: string): string {
  if (!text || !/[#*_`[]/.test(text)) return text
  return text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/^\s*[*-]\s+/gm, '· ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 $2')
}

/** 5xx / 429 / "overloaded" / "high demand" from the model provider — the
 *  kind of failure another provider is immune to. Timeouts are excluded. */
export function isProviderCapacityError(e: unknown): boolean {
  const msg = String((e as Error)?.message || e || '')
  if (/timeout|abort/i.test(msg)) return false
  return /llm http (5\d\d|429)\b/.test(msg) || /overloaded|high demand|capacity|rate.?limit|resource.?exhausted|unavailable/i.test(msg)
}

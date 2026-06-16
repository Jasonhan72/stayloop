// /api/agent/turn — the Personal Agent reasoning step (architecture L3/L4).
// STATELESS by design: the client passes the RLS-scoped session context
// (memory + workflow), this route runs the role's reasoning through Claude,
// applies the Compliance Guardrail, and returns { reply, memory_writes,
// proposed_action, next_stage }. The client persists results via its own
// RLS-scoped Supabase client (same pattern as memory.ts / approval-engine.ts).
// The Anthropic key stays server-side only.
import { NextResponse } from 'next/server'
import type { AgentRole, MemoryItem, WorkflowState } from '@/lib/agent/types'
import { buildSystemPrompt } from '@/lib/agent/prompts'
import { applyGuardrail, type TurnOutput } from '@/lib/agent/guardrail'

export const runtime = 'edge'

type TurnRequest = {
  role: AgentRole
  agentName: string
  message: string
  memories: MemoryItem[]
  workflow: WorkflowState
  stageLabel?: string
}

const VALID_ROLES = new Set<AgentRole>(['tenant', 'landlord', 'agent'])

function safeParseJson(raw: string): Record<string, unknown> | null {
  // The model is asked for bare JSON, but tolerate ```json fences / prose.
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

function normalizeOutput(parsed: Record<string, unknown> | null, fallbackReply: string): TurnOutput {
  if (!parsed) return { reply: fallbackReply, memoryWrites: [], proposedAction: null, nextStage: null }

  const memoryWrites = Array.isArray(parsed.memory_writes)
    ? (parsed.memory_writes as Record<string, unknown>[])
        .filter((m) => m && typeof m.key === 'string')
        .map((m) => ({
          key: String(m.key),
          label: String(m.label ?? m.key),
          value: m.value ?? null,
          memory_type: String(m.memory_type ?? 'preference'),
          confidence: typeof m.confidence === 'number' ? m.confidence : 0.8,
        }))
    : []

  const pa = parsed.proposed_action as Record<string, unknown> | null | undefined
  const proposedAction =
    pa && typeof pa === 'object' && typeof pa.action_type === 'string'
      ? {
          action_type: String(pa.action_type),
          title: String(pa.title ?? '待你确认'),
          summary: String(pa.summary ?? ''),
          recipient_label: pa.recipient_label ? String(pa.recipient_label) : null,
          data_scope: Array.isArray(pa.data_scope) ? (pa.data_scope as unknown[]).map(String) : [],
          excluded_data: Array.isArray(pa.excluded_data) ? (pa.excluded_data as unknown[]).map(String) : [],
          risk_level: (['low', 'medium', 'high'].includes(String(pa.risk_level))
            ? String(pa.risk_level)
            : 'medium') as 'low' | 'medium' | 'high',
        }
      : null

  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply : fallbackReply,
    memoryWrites,
    proposedAction,
    nextStage: typeof parsed.next_stage === 'string' ? parsed.next_stage : null,
  }
}

export async function POST(req: Request) {
  let body: TurnRequest
  try {
    body = (await req.json()) as TurnRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { role, agentName, message } = body
  if (!VALID_ROLES.has(role) || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'role and message are required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'agent reasoning unavailable' }, { status: 503 })
  }

  const memories = Array.isArray(body.memories) ? body.memories : []
  const workflow: WorkflowState =
    body.workflow ?? { workflow_type: '', workflow_id: null, current_stage: '', completed_steps: [], status: 'active' }
  const system = buildSystemPrompt(role, agentName, memories, workflow, body.stageLabel)

  let raw = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        temperature: 0.4,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: message.slice(0, 4000) }],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: `reasoning error: ${errText.slice(0, 300)}` }, { status: 502 })
    }
    const data = (await res.json()) as { content?: Array<{ text?: string }> }
    raw = data.content?.[0]?.text || ''
  } catch (e) {
    return NextResponse.json({ error: `reasoning timeout: ${(e as Error).message}` }, { status: 504 })
  }

  const fallbackReply = `我记下了:"${message.trim().slice(0, 120)}"。需要对外分享或提交的动作,都会先作为待批准卡片让你确认。`
  const normalized = normalizeOutput(safeParseJson(raw), fallbackReply)

  // Compliance Guardrail — the deterministic backstop on every AI output.
  const { out, flags } = applyGuardrail(role, normalized)

  return NextResponse.json({
    reply: out.reply,
    memory_writes: out.memoryWrites,
    proposed_action: out.proposedAction,
    next_stage: out.nextStage,
    guardrail: { flagged: flags.length > 0, notes: flags },
  })
}

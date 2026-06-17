// /api/agent/turn — the Personal Agent reasoning step (architecture L3/L4).
// STATELESS by design: the client passes the RLS-scoped session context
// (memory + workflow), this route runs the role's reasoning through Claude,
// applies the Compliance Guardrail, and returns { reply, memory_writes,
// proposed_action, next_stage }. The client persists results via its own
// RLS-scoped Supabase client (same pattern as memory.ts / approval-engine.ts).
// The Anthropic key stays server-side only.
import { NextResponse } from 'next/server'
import type { AgentRole, ListingCard, MemoryItem, WorkflowState } from '@/lib/agent/types'
import { buildSystemPrompt } from '@/lib/agent/prompts'
import { applyGuardrail, type TurnOutput } from '@/lib/agent/guardrail'
import { searchListings } from '@/lib/agent/listingSearch'

export const runtime = 'edge'

type TurnRequest = {
  role: AgentRole
  agentName: string
  message: string
  memories: MemoryItem[]
  workflow: WorkflowState
  stageLabel?: string
  images?: { media_type: string; data: string }[]
  attachment_names?: string[]
  exclude?: string[]
  history?: { role: 'user' | 'agent'; text: string }[]
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
  const imgs = (Array.isArray(body.images) ? body.images : [])
    .filter((im) => im && typeof im.data === 'string' && /^image\//.test(im.media_type || ''))
    .slice(0, 3)
  const attachmentNames = Array.isArray(body.attachment_names) ? body.attachment_names.map(String) : []
  if (!VALID_ROLES.has(role) || typeof message !== 'string' || (!message.trim() && imgs.length === 0)) {
    return NextResponse.json({ error: 'role and message (or an image) are required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'agent reasoning unavailable' }, { status: 503 })
  }

  const memories = Array.isArray(body.memories) ? body.memories : []
  const workflow: WorkflowState =
    body.workflow ?? { workflow_type: '', workflow_id: null, current_stage: '', completed_steps: [], status: 'active' }
  const system = buildSystemPrompt(role, agentName, memories, workflow, body.stageLabel)

  // Build the user turn — text (+ attachment note) and any image blocks for Vision.
  const note = attachmentNames.length ? `\n\n[用户上传了文件：${attachmentNames.join('、')}]` : ''
  const hist = (Array.isArray(body.history) ? body.history : []).slice(-6)
  const histText = hist.length
    ? '[最近对话,供理解上下文]\n' +
      hist.map((h) => `${h.role === 'user' ? '用户' : agentName}: ${String(h.text || '').slice(0, 200)}`).join('\n') +
      '\n\n[当前消息]\n'
    : ''
  const userText = histText + (message.trim() || '（用户上传了文件,请查看并回应）').slice(0, 4000) + note
  const userContent: unknown = imgs.length
    ? [
        { type: 'text', text: userText },
        ...imgs.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
      ]
    : userText

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
        messages: [{ role: 'user', content: userContent }],
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
  const parsed = safeParseJson(raw)
  const normalized = normalizeOutput(parsed, fallbackReply)

  // Compliance Guardrail — the deterministic backstop on every AI output.
  const { out, flags } = applyGuardrail(role, normalized)

  // Listing search (tenant): when the model flags intent, search Stayloop's
  // own listings first, then fall back to external (Realtor.ca).
  let listings: ListingCard[] | undefined
  let listingsSource: 'stayloop' | 'realtor' | undefined
  const search = parsed?.search as Record<string, unknown> | null | undefined
  if (role === 'tenant' && search && typeof search === 'object') {
    try {
      const result = await searchListings({
        area: typeof search.area === 'string' ? search.area : null,
        max_price: typeof search.max_price === 'number' ? search.max_price : null,
        min_beds: typeof search.min_beds === 'number' ? search.min_beds : null,
        pets: typeof search.pets === 'boolean' ? search.pets : null,
        keywords: typeof search.keywords === 'string' ? search.keywords : null,
        count: typeof search.count === 'number' ? search.count : null,
      }, Array.isArray(body.exclude) ? body.exclude.map(String) : [])
      if (result.listings.length) {
        listings = result.listings
        // Stayloop-first results may be topped up with external — derive the
        // banner from what actually came back.
        const hasStay = result.listings.some((l) => l.source === 'stayloop')
        const hasRealtor = result.listings.some((l) => l.source === 'realtor')
        listingsSource = hasStay && !hasRealtor ? 'stayloop' : !hasStay && hasRealtor ? 'realtor' : undefined
      }
    } catch (e) {
      console.warn('[agent] listing search failed', (e as Error).message)
    }
  }

  return NextResponse.json({
    reply: out.reply,
    memory_writes: out.memoryWrites,
    proposed_action: out.proposedAction,
    next_stage: out.nextStage,
    listings,
    listings_source: listingsSource,
    guardrail: { flagged: flags.length > 0, notes: flags },
  })
}

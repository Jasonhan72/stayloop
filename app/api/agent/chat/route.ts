// -----------------------------------------------------------------------------
// /api/agent/chat — AI-Native chat entry point
// -----------------------------------------------------------------------------
// SSE-streaming endpoint that drives the agentic loop. Authenticates the
// caller via Supabase, loads or creates a conversation, runs the loop, and
// streams Loop events back as text/event-stream so the frontend can render
// incrementally (text, tool_use, tool_result, blocks, done).
//
// POST body: { conversation_id?, agent_kind, message, attachments? }
// Returns: SSE stream of events.
//
// Sprint 2 — wires together loop.ts + memory.ts + Logic agent.
// -----------------------------------------------------------------------------

export const runtime = 'edge'

import { createClient } from '@supabase/supabase-js'
import { runAgentLoop, type LoopEvent } from '@/lib/agent/loop'
import { summarizeAndPersistFacts } from '@/lib/agent/memory'
import logicAgent from '@/lib/agent/agents/logic'
// Importing the tools barrel side-effects all tool registrations:
import '@/lib/agent/tools'

interface ChatRequestBody {
  conversation_id?: string
  agent_kind: string
  message: string
  /** Optional file references (already uploaded to Supabase Storage). */
  attachments?: Array<{ path: string; name: string; mime: string; size?: number }>
}

const AGENTS_REGISTRY = {
  logic: logicAgent,
  // future: nova, echo, analyst, mediator
}

function makeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function makeRlsClient(authHeader: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
}

export async function POST(req: Request) {
  // Auth
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const rls = makeRlsClient(authHeader)
  const { data: userData, error: userErr } = await rls.auth.getUser()
  if (userErr || !userData?.user) {
    return Response.json({ error: 'invalid_session' }, { status: 401 })
  }
  const userId = userData.user.id

  // Parse body
  const body = (await req.json().catch(() => null)) as ChatRequestBody | null
  if (!body || !body.message || !body.agent_kind) {
    return Response.json({ error: 'bad_request: agent_kind + message required' }, { status: 400 })
  }
  const agent = AGENTS_REGISTRY[body.agent_kind as keyof typeof AGENTS_REGISTRY]
  if (!agent) {
    return Response.json({ error: `unknown_agent: ${body.agent_kind}` }, { status: 400 })
  }

  const admin = makeServiceClient()

  // Load or create conversation
  let conversationId = body.conversation_id
  if (!conversationId) {
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .insert({
        user_id: userId,
        user_kind: 'landlord',
        agent_kind: agent.kind,
      })
      .select('id')
      .single()
    if (convErr || !conv) {
      return Response.json({ error: `conversation_create_failed: ${convErr?.message}` }, { status: 500 })
    }
    conversationId = conv.id
  } else {
    // Verify ownership via RLS-client to enforce auth boundary
    const { data: own } = await rls
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!own) {
      return Response.json({ error: 'conversation_not_found' }, { status: 404 })
    }
  }

  // Load history
  const { data: historyRows } = await admin
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(50)
  const history = (historyRows || []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content as any,
  }))

  // Persist incoming user message
  await admin.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: [
      { type: 'text', text: body.message },
      ...(body.attachments?.length
        ? [{ type: 'attachments_meta' as any, attachments: body.attachments }]
        : []),
    ] as any,
  })

  // SSE stream setup
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: LoopEvent) => {
        const payload = `data: ${JSON.stringify(event)}\n\n`
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {
          // controller closed mid-flight (client disconnect) — ignore
        }
      }

      try {
        // Send initial conversation_id so frontend can persist before any
        // events arrive (helps with reconnect logic).
        const payload = `data: ${JSON.stringify({ type: 'conversation', conversation_id: conversationId })}\n\n`
        controller.enqueue(encoder.encode(payload))

        // Build the user message content for the loop. If attachments present,
        // we surface them as text references — the agent can decide to call
        // run_pdf_forensics / classify_files using their paths.
        let userMessage: any = body.message
        if (body.attachments?.length) {
          const fileList = body.attachments
            .map((a) => `- ${a.name} (${a.mime}, ${a.size ?? '?'}B) at storage path: ${a.path}`)
            .join('\n')
          userMessage = `${body.message}\n\nAttached files:\n${fileList}`
        }

        const result = await runAgentLoop({
          agent,
          conversationId,
          userId,
          history,
          userMessage,
          supabaseAdmin: admin,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
          onEvent: (event) => {
            send(event)
          },
          signal: req.signal,
        })

        // Persist new messages produced by the loop
        if (result.newMessages.length > 0) {
          await admin
            .from('messages')
            .insert(
              result.newMessages.map((m) => ({
                conversation_id: conversationId,
                role: m.role,
                content: m.content as any,
              })),
            )
        }

        // Bump last_message_at
        await admin
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)

        // Fire-and-forget memory summarization. Doesn't block the close().
        // We use waitUntil-style edge runtime fire by NOT awaiting — but we
        // do run it inside the same request lifetime so Cloudflare keeps
        // the worker alive.
        try {
          void summarizeAndPersistFacts(
            admin,
            userId,
            conversationId,
            process.env.ANTHROPIC_API_KEY!,
            { lookbackTurns: 8 },
          )
        } catch {
          // already logs internally
        }
      } catch (e: any) {
        send({ type: 'error', message: e?.message || 'unknown_error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}

// POST /api/threads/draft-reply { thread_id, seed?, lang? } — a reply drafted for the AGENT of an
// agent ↔ client conversation (V0.9, 2026-11-22). The rules and the prompt are in
// lib/threads/replyDraft.ts.
//
// What this route never does: post a message. It returns text for the composer; the agent edits
// it and sends it through the ordinary path, as their own message.
//
// Who may call it: the agent of that conversation, with a current RECO registration.
//   · the thread and its messages are read through the CALLER's JWT (RLS = party check);
//   · the client row behind the thread must name the caller as its agent (service role read);
//   · any other kind of thread, or the client side of this one, gets 403.
// What goes to the model: the last few messages' text, the agent's public profile fields, the
// client's first name / role / area / budget, and knowledge-base passages for the question. No
// e-mail address, no phone number, no attachment.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { llmChat, LlmHttpError, type LlmChatParams } from '@/lib/llmChat'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { underHourlyLimit } from '@/lib/rateLimit'
import { stripNul } from '@/lib/screening/jsonSafe'
import { categoryLabel, type AgentCategory, type AgentStatus } from '@/lib/agentProfile'
import { focusLabel, isRegistrationCurrent, languageLabel } from '@/lib/agentPublic'
import { loadKbConfig, kbEnabledFor } from '@/lib/kb/config'
import { kbSearch } from '@/lib/kb/search'
import { shouldRetrieve } from '@/lib/kb/trigger'
import { checkCitations, citationAllowance, kbPromptBlock, referenceList, shortSourceLabel } from '@/lib/kb/cite'
import {
  DRAFT_SEED_MAX, draftReminders, draftableTurns, flagMarketClaims, flagSensitiveAsks, lastClientTurn, parseReplyDraft, replyDraftSystemPrompt, replyDraftUserText, stripKbMarks,
} from '@/lib/threads/replyDraft'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }
const PER_USER_PER_HOUR = 40
const SITE_PER_HOUR = 400
/** Same setting as the conversation model: the default effort takes several seconds before the first word. */
const REASONING_EFFORT = 'low' as const

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return json({ error: 'sign_in_required' }, 401)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  const uid = ud?.user?.id
  if (!uid || ud?.user?.is_anonymous) return json({ error: 'sign_in_required' }, 401)

  let body: { thread_id?: string; seed?: string; lang?: string }
  try { body = (await req.json()) as typeof body } catch { return json({ error: 'invalid JSON body' }, 400) }
  const tid = String(body.thread_id || '')
  if (!UUID.test(tid)) return json({ error: 'thread_id required' }, 400)
  const notesLang: 'zh' | 'en' = body.lang === 'en' ? 'en' : 'zh'
  const seed = stripNul(typeof body.seed === 'string' ? body.seed : '').trim().slice(0, DRAFT_SEED_MAX)

  // The caller's own view of the thread: a non-party reads nothing.
  const [{ data: t }, { data: rows }] = await Promise.all([
    sb.from('threads').select('id, kind, ref_id').eq('id', tid).maybeSingle(),
    sb.from('thread_messages').select('id, sender_id, kind, body, ref_message_id, created_at').eq('thread_id', tid).order('id', { ascending: false }).limit(40),
  ])
  const thread = t as { id: string; kind: string; ref_id: string } | null
  if (!thread) return json({ error: 'not_found' }, 404)
  if (thread.kind !== 'agent_client') return json({ error: 'not_supported' }, 403)

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const [{ data: c }, { data: p }] = await Promise.all([
    admin.from('agent_clients').select('id, agent_auth_id, name, client_role, area, budget, info_guide_given_at').eq('id', thread.ref_id).maybeSingle(),
    admin.from('agent_profiles').select('legal_name, category, brokerage_name, languages, service_areas, focus, bio, status, expires_at').eq('auth_id', uid).maybeSingle(),
  ])
  const client = c as { id: string; agent_auth_id: string; name: string | null; client_role: string | null; area: string | null; budget: string | null; info_guide_given_at: string | null } | null
  // The client side of the conversation is a party too — the draft is for the agent only.
  if (!client || client.agent_auth_id !== uid) return json({ error: 'agent_only' }, 403)
  const prof = p as { legal_name: string | null; category: AgentCategory | null; brokerage_name: string | null; languages: string[] | null; service_areas: string[] | null; focus: string[] | null; bio: string | null; status: AgentStatus; expires_at: string | null } | null
  if (!prof || !prof.legal_name || !isRegistrationCurrent(prof)) return json({ error: 'registration_not_live' }, 403)

  const turns = draftableTurns(((rows ?? []) as Parameters<typeof draftableTurns>[0]), uid)
  const last = lastClientTurn(turns)
  if (!last) return json({ error: 'nothing_to_reply' }, 409)

  // Each call is a model call: a caller bucket and a site bucket, both failing open (cost, not mail).
  if (!(await underHourlyLimit(`thread-draft:${uid}`, PER_USER_PER_HOUR, true))) return json({ error: 'rate_limited' }, 429)
  if (!(await underHourlyLimit('thread-draft:global', SITE_PER_HOUR, true))) return json({ error: 'busy' }, 503)

  // A rules question gets the official passages, the same way the assistant's own answers do.
  let hits: Awaited<ReturnType<typeof kbSearch>>['hits'] = []
  let reference = ''
  if (shouldRetrieve(last.body)) {
    try {
      const cfg = await loadKbConfig()
      if (kbEnabledFor(cfg, { userId: uid, anonymous: false })) {
        hits = (await kbSearch(last.body, cfg, { province: 'ON', userId: uid, signal: AbortSignal.timeout(8000) })).hits
        if (hits.length) reference = kbPromptBlock(hits, notesLang, cfg.maxChars)
      }
    } catch { /* no passages: rule 6 of the prompt has the model say it will check */ }
  }

  const system = replyDraftSystemPrompt()
  const userText = replyDraftUserText({
    agent: {
      name: prof.legal_name,
      descriptor: prof.category ? categoryLabel(prof.category, 'zh') : '经纪',
      brokerage: prof.brokerage_name ?? '',
      languages: (prof.languages ?? []).map((x) => languageLabel(x, 'zh')),
      areas: prof.service_areas ?? [],
      focus: (prof.focus ?? []).map((x) => focusLabel(x, 'zh')),
      bio: prof.bio,
    },
    // First name only: the model has no use for more.
    client: { name: (client.name || '').trim().split(/\s+/)[0] || null, role: client.client_role === 'landlord' ? 'landlord' : client.client_role === 'tenant' ? 'tenant' : null, area: client.area, budget: client.budget },
    turns, seed, reference, notesLang,
  })

  const modelId = await getModel('turn')
  const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.turn)!
  const base: LlmChatParams = {
    model: def,
    system,
    messages: [{ role: 'user', content: userText }],
    maxTokens: 2000, // thinking-class models spend tokens before the JSON
    jsonMode: true,
    signal: AbortSignal.timeout(45_000),
    meta: { userId: uid, slot: 'turn', source: 'thread-draft' },
  }
  let raw = ''
  try {
    try {
      raw = (await llmChat({ ...base, reasoningEffort: REASONING_EFFORT })).text || ''
    } catch (e) {
      // A model that refuses the effort setting: once more without it (the turn route does the same).
      if (!(e instanceof LlmHttpError) || e.status !== 400) throw e
      raw = (await llmChat({ ...base, signal: AbortSignal.timeout(45_000) })).text || ''
    }
  } catch (e) {
    return json({ error: 'model_failed', message: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, 502)
  }

  const parsed = parseReplyDraft(stripNul(raw))
  if (!parsed.draft) return json({ error: 'empty_draft' }, 502)
  // Section numbers the model did not get from the passages or the conversation are rewritten, as in the assistant's replies.
  const cited = hits.length ? checkCitations(parsed.draft, hits, notesLang, citationAllowance(hits, userText)) : { reply: parsed.draft, invented: [] as string[] }
  // Which passages the draft leaned on — for the agent to check against — then the [K] marks come out of the text.
  const sources = Array.from(new Map((hits.length ? referenceList(cited.reply, hits).refs : []).map((r) => [shortSourceLabel(r.title, r.ref, notesLang), r.url] as const))).slice(0, 4).map(([label, url]) => ({ label, url }))
  const draft = stripKbMarks(cited.reply)
  if (!draft) return json({ error: 'empty_draft' }, 502)
  // The deterministic flags first: they are about what the agent must fix before sending.
  const notes = [...flagSensitiveAsks(draft, notesLang === 'zh'), ...flagMarketClaims(draft, notesLang === 'zh'), ...parsed.notes].slice(0, 5)

  await admin.from('agent_audit_events').insert({
    actor_id: uid, actor_type: 'user', action: 'thread_reply_drafted', target_type: 'thread', target_id: tid, acting_role: 'agent',
    // What was asked for, never the text: the conversation is the record of what was actually sent.
    metadata: { model: def.id, kb_hits: hits.length, had_seed: !!seed, draft_chars: draft.length, citations_rewritten: cited.invented.length },
  }).then(() => undefined, () => undefined)

  return json({ draft, notes, sources, reminders: draftReminders(client, notesLang === 'zh'), model: def.id })
}

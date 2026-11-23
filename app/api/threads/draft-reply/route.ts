// POST /api/threads/draft-reply { thread_id, seed?, lang? } — a reply drafted for the ANSWERING side of
// an inquiry (V0.9, 2026-11-22). The rules and the prompts are in lib/threads/replyDraft.ts.
//   · agent ↔ client conversation (`agent_client`)   → the agent, registration current;
//   · provider inquiry (`provider_inquiry`)           → the provider's own account, status verified.
//
// What this route never does: post a message. It returns text for the composer; the person edits
// it and sends it through the ordinary path, as their own message.
//
// Who may call it is decided twice: the thread and its messages are read through the CALLER's JWT
// (RLS = party check), and the row behind the thread must name the caller as the answering side
// (service role read) — the person who wrote in is a party too and gets 403.
// What goes to the model: the last few messages' text, the answering side's own public profile, the
// other person's first name and what they said they were, and — for agents — knowledge-base
// passages for the question. No e-mail address, no phone number, no attachment.
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { llmChat, LlmHttpError, type LlmChatParams } from '@/lib/llmChat'
import { DEFAULT_MODELS, getModel, getModelDef, getModelDefAsync } from '@/lib/modelConfig'
import { underHourlyLimit } from '@/lib/rateLimit'
import { stripNul } from '@/lib/screening/jsonSafe'
import { categoryLabel, type AgentCategory, type AgentStatus } from '@/lib/agentProfile'
import { focusLabel, isRegistrationCurrent, languageLabel } from '@/lib/agentPublic'
import { TRADES } from '@/lib/marketplace/trades'
import { displayNameFor } from '@/lib/threads/server'
import { loadKbConfig, kbEnabledFor } from '@/lib/kb/config'
import { kbSearch } from '@/lib/kb/search'
import { shouldRetrieve } from '@/lib/kb/trigger'
import { checkCitations, citationAllowance, kbPromptBlock, referenceList, shortSourceLabel } from '@/lib/kb/cite'
import {
  DRAFT_SEED_MAX, draftReminders, draftableTurns, flagMarketClaims, flagSensitiveAsks, flagUnlistedAmounts, lastClientTurn, parseReplyDraft,
  providerDraftSystemPrompt, providerDraftUserText, replyDraftSystemPrompt, replyDraftUserText, stripKbMarks, type DraftTurn,
} from '@/lib/threads/replyDraft'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }
const PER_USER_PER_HOUR = 40
const SITE_PER_HOUR = 400
/** Same setting as the conversation model: the default effort takes several seconds before the first word. */
const REASONING_EFFORT = 'low' as const
/** Licensed professions: the draft is intake only (no opinion, no premium). A photographer is a trade like any other. */
const LICENSED = new Set(['paralegal', 'lawyer', 'insurance_broker'])

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
type Hits = Awaited<ReturnType<typeof kbSearch>>['hits']
type Built = { side: 'agent' | 'provider'; system: string; userText: string; hits: Hits; reminders: string[]; flags: (draft: string, zh: boolean) => string[] }
type Refusal = { error: string; status: number }
const firstName = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || null

/** The agent of an agent ↔ client conversation. */
async function buildAgent(admin: SupabaseClient, uid: string, clientId: string, turns: DraftTurn[], question: string, seed: string, notesLang: 'zh' | 'en'): Promise<Built | Refusal> {
  const [{ data: c }, { data: p }] = await Promise.all([
    admin.from('agent_clients').select('id, agent_auth_id, name, client_role, area, budget, info_guide_given_at').eq('id', clientId).maybeSingle(),
    admin.from('agent_profiles').select('legal_name, category, brokerage_name, languages, service_areas, focus, bio, status, expires_at').eq('auth_id', uid).maybeSingle(),
  ])
  const client = c as { id: string; agent_auth_id: string; name: string | null; client_role: string | null; area: string | null; budget: string | null; info_guide_given_at: string | null } | null
  // The client side of the conversation is a party too — the draft is for the agent only.
  if (!client || client.agent_auth_id !== uid) return { error: 'agent_only', status: 403 }
  const prof = p as { legal_name: string | null; category: AgentCategory | null; brokerage_name: string | null; languages: string[] | null; service_areas: string[] | null; focus: string[] | null; bio: string | null; status: AgentStatus; expires_at: string | null } | null
  if (!prof || !prof.legal_name || !isRegistrationCurrent(prof)) return { error: 'registration_not_live', status: 403 }

  // A rules question gets the official passages, the same way the assistant's own answers do.
  let hits: Hits = []
  let reference = ''
  if (shouldRetrieve(question)) {
    try {
      const cfg = await loadKbConfig()
      if (kbEnabledFor(cfg, { userId: uid, anonymous: false })) {
        hits = (await kbSearch(question, cfg, { province: 'ON', userId: uid, signal: AbortSignal.timeout(8000) })).hits
        if (hits.length) reference = kbPromptBlock(hits, notesLang, cfg.maxChars)
      }
    } catch { /* no passages: rule 6 of the prompt has the model say it will check */ }
  }
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
    client: { name: firstName(client.name), role: client.client_role === 'landlord' ? 'landlord' : client.client_role === 'tenant' ? 'tenant' : null, area: client.area, budget: client.budget },
    turns, seed, reference, notesLang,
  })
  return {
    side: 'agent', system: replyDraftSystemPrompt(), userText, hits,
    reminders: draftReminders(client, notesLang === 'zh'),
    flags: (draft, zh) => [...flagSensitiveAsks(draft, zh), ...flagMarketClaims(draft, zh)],
  }
}

/** The provider of a provider inquiry (维修服务 / 专业服务). */
async function buildProvider(admin: SupabaseClient, uid: string, providerId: string | null, subjectUser: string | null, hat: string | null, turns: DraftTurn[], seed: string, notesLang: 'zh' | 'en'): Promise<Built | Refusal> {
  if (!providerId) return { error: 'provider_only', status: 403 }
  const { data: p } = await admin.from('service_providers').select('id, auth_id, legal_name, trade_name, trades, service_cities, pricing_mode, call_out_fee, hourly_rate, status').eq('id', providerId).maybeSingle()
  const prov = p as { id: string; auth_id: string | null; legal_name: string; trade_name: string | null; trades: string[] | null; service_cities: string[] | null; pricing_mode: string | null; call_out_fee: number | null; hourly_rate: number | null; status: string } | null
  // The person who wrote in is a party too — the draft is for the provider's own account only.
  if (!prov || !prov.auth_id || prov.auth_id !== uid) return { error: 'provider_only', status: 403 }
  if (prov.status !== 'verified') return { error: 'provider_not_verified', status: 403 }
  const trades = prov.trades ?? []
  const professional = trades.some((t) => LICENSED.has(t))
  const fee = prov.call_out_fee == null ? null : Number(prov.call_out_fee)
  const rate = prov.hourly_rate == null ? null : Number(prov.hourly_rate)
  const userText = providerDraftUserText({
    provider: {
      name: (prov.trade_name || '').trim() || prov.legal_name,
      trades: trades.map((t) => TRADES.find((x) => x.key === t)?.zh ?? t),
      cities: prov.service_cities ?? [],
      callOutFee: fee, hourlyRate: rate, fixedQuotes: prov.pricing_mode === 'fixed', professional,
    },
    person: { name: firstName(await displayNameFor(admin, subjectUser)), hat: hat === 'landlord' || hat === 'tenant' || hat === 'agent' ? hat : null },
    turns, seed, notesLang,
  })
  return {
    side: 'provider', system: providerDraftSystemPrompt(professional), userText, hits: [], reminders: [],
    // A licensed profession states no amount at all; a trade only its own registered prices.
    flags: (draft, zh) => [...flagSensitiveAsks(draft, zh), ...flagUnlistedAmounts(draft, professional ? [] : [fee, rate], zh)],
  }
}

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
    sb.from('threads').select('id, kind, ref_id, provider_id, subject_user').eq('id', tid).maybeSingle(),
    sb.from('thread_messages').select('id, sender_id, kind, body, ref_message_id, created_at, acting_role').eq('thread_id', tid).order('id', { ascending: false }).limit(40),
  ])
  const thread = t as { id: string; kind: string; ref_id: string; provider_id: string | null; subject_user: string | null } | null
  if (!thread) return json({ error: 'not_found' }, 404)
  if (thread.kind !== 'agent_client' && thread.kind !== 'provider_inquiry') return json({ error: 'not_supported' }, 403)

  const msgs = (rows ?? []) as (Parameters<typeof draftableTurns>[0][number] & { acting_role: string | null })[]
  const turns = draftableTurns(msgs, uid)
  const last = lastClientTurn(turns)

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  // The hat the person wrote under, as recorded on their own messages (newest first).
  const hat = msgs.find((m) => m.sender_id === thread.subject_user && m.acting_role)?.acting_role ?? null
  const built = thread.kind === 'agent_client'
    ? await buildAgent(admin, uid, thread.ref_id, turns, last?.body ?? '', seed, notesLang)
    : await buildProvider(admin, uid, thread.provider_id, thread.subject_user, hat, turns, seed, notesLang)
  if ('error' in built) return json({ error: built.error }, built.status)
  if (!last) return json({ error: 'nothing_to_reply' }, 409)

  // Each call is a model call: a caller bucket and a site bucket, both failing open (cost, not mail).
  if (!(await underHourlyLimit(`thread-draft:${uid}`, PER_USER_PER_HOUR, true))) return json({ error: 'rate_limited' }, 429)
  if (!(await underHourlyLimit('thread-draft:global', SITE_PER_HOUR, true))) return json({ error: 'busy' }, 503)

  const { hits, userText } = built
  const modelId = await getModel('turn')
  const def = (await getModelDefAsync(modelId)) ?? getModelDef(DEFAULT_MODELS.turn)!
  const base: LlmChatParams = {
    model: def,
    system: built.system,
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
  // Which passages the draft leaned on — for the sender to check against — then the [K] marks come out of the text.
  const sources = Array.from(new Map((hits.length ? referenceList(cited.reply, hits).refs : []).map((r) => [shortSourceLabel(r.title, r.ref, notesLang), r.url] as const))).slice(0, 4).map(([label, url]) => ({ label, url }))
  const draft = stripKbMarks(cited.reply)
  if (!draft) return json({ error: 'empty_draft' }, 502)
  // The deterministic flags first: they are about what must be fixed before sending.
  const notes = [...built.flags(draft, notesLang === 'zh'), ...parsed.notes].slice(0, 5)

  await admin.from('agent_audit_events').insert({
    actor_id: uid, actor_type: 'user', action: 'thread_reply_drafted', target_type: 'thread', target_id: tid, acting_role: built.side,
    // What was asked for, never the text: the conversation is the record of what was actually sent.
    metadata: { side: built.side, model: def.id, kb_hits: hits.length, had_seed: !!seed, draft_chars: draft.length, citations_rewritten: cited.invented.length },
  }).then(() => undefined, () => undefined)

  return json({ draft, notes, sources, reminders: built.reminders, model: def.id })
}

// POST /api/providers/<id>/contact { message, as? } — a signed-in person writes to a verified service
// provider from the 「找经纪和服务商」 directory (V0.9, 2026-11-22). The directory used to offer an
// e-mail address and a phone number only; the agent tab already had 「发消息」.
//
// It lands in one `provider_inquiry` thread per (provider, person) — created here with the service
// role, never by a client RPC (open_thread refuses the kind). party_for() makes the person 'member'
// and the provider's account 'provider'; the provider is told by push, or by one relay e-mail when
// the provider has no account (as on a work order). No address is shown to either side by this route.
//
// Anonymous visitors read no provider data and cannot write to one either: sign-in is required.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit, underMailLimits } from '@/lib/rateLimit'
import { stripNul } from '@/lib/screening/jsonSafe'
import { CONTACT_MAX, CONTACT_MIN } from '@/lib/agentPublic'
import { displayNameFor, ensureProviderThread, notifyThreadParties, postSystemMessage } from '@/lib/threads/server'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return json({ error: 'bad id' }, 400)
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return json({ error: 'sign_in_required' }, 401)
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud } = await sb.auth.getUser()
  const user = ud?.user
  if (!user || user.is_anonymous) return json({ error: 'sign_in_required' }, 401)

  let body: { message?: string; as?: string }
  try { body = (await req.json()) as typeof body } catch { return json({ error: 'invalid JSON body' }, 400) }
  const message = stripNul(String(body.message || '')).trim()
  if (message.length < CONTACT_MIN || message.length > CONTACT_MAX) return json({ error: 'message_length' }, 400)

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  // Only what the directory lists: a verified provider.
  const { data: p } = await admin.from('service_providers').select('id, auth_id, legal_name, trade_name, status').eq('id', id).maybeSingle()
  const prov = p as { id: string; auth_id: string | null; legal_name: string; trade_name: string | null; status: string } | null
  if (!prov || prov.status !== 'verified') return json({ error: 'not_found' }, 404)
  if (prov.auth_id && prov.auth_id === user.id) return json({ error: 'own_profile' }, 400)

  // Every contact sends a notification: fail CLOSED. Per person + site-wide, and per provider.
  const [mine, theirs] = await Promise.all([
    underMailLimits('provider-contact', user.id, 5, 120),
    underHourlyLimit(`provider-contact:p:${prov.id}`, 30, false),
  ])
  if (!mine || !theirs) return json({ error: 'rate_limited' }, 429)

  // The hat the person says they are writing under — kept only when the account really holds it.
  let actingRole: 'tenant' | 'landlord' | 'agent' | null = null
  if (body.as === 'tenant') actingRole = 'tenant'
  else if (body.as === 'landlord' || body.as === 'agent') {
    const { data: hats } = await sb.rpc('my_hats')
    const h = (hats ?? {}) as { landlord?: boolean; agent?: string | null }
    if (body.as === 'landlord' && h.landlord) actingRole = 'landlord'
    if (body.as === 'agent' && h.agent) actingRole = 'agent'
  }

  const providerName = (prov.trade_name || '').trim() || prov.legal_name
  const thread = await ensureProviderThread(admin, { id: prov.id, name: providerName }, user.id)
  if (!thread) return json({ error: 'could_not_create' }, 502)
  const name = (await displayNameFor(admin, user.id)) || '用户 / Member'
  const createdAt = new Date().toISOString()
  const messageId = await postSystemMessage(admin, thread.id, {
    kind: 'message', body: message, senderId: user.id, senderKind: 'member', actingRole, senderLabel: name, channel: 'app',
    meta: { via: 'provider_directory' },
  })
  if (!messageId) return json({ error: 'could_not_send' }, 502)

  await notifyThreadParties(admin, thread, { messageId, createdAt, exceptUserId: user.id, preview: message.slice(0, 120), body: message, senderLabel: name })
  await admin.from('agent_audit_events').insert({
    actor_id: user.id, actor_type: 'user', action: 'provider_directory_contact', target_type: 'service_provider', target_id: prov.id,
    metadata: { thread_id: thread.id, acting_role: actingRole },
  }).then(() => undefined, () => undefined)
  return json({ ok: true, thread_id: thread.id })
}

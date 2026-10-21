// POST /api/agents/<slug>/contact { role: 'tenant'|'landlord', message, area?, budget? }
// A signed-in person writes to an agent from the agent's public profile (2026-10-21).
// It lands where the agent already works: one agent_clients row per (agent, email) —
// reused if the person is already their client — and that client's agent_client
// thread, where party_for() lets both sides read and reply. The agent is notified by
// push / one email via the relay; no address is shown to either side.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { stripNul } from '@/lib/screening/jsonSafe'
import { CONTACT_MAX, CONTACT_MIN } from '@/lib/agentPublic'
import { loadPublicAgent } from '@/lib/agentPublicServer'
import { displayNameFor, ensureThread, notifyThreadParties, postSystemMessage } from '@/lib/threads/server'

const NO_STORE = { 'Cache-Control': 'no-store' }

function ilikeExact(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud } = await sb.auth.getUser()
  const user = ud?.user
  if (!user || user.is_anonymous || !user.email) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })

  let body: { role?: string; message?: string; area?: string; budget?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: NO_STORE }) }
  const role = body.role === 'landlord' ? 'landlord' : body.role === 'tenant' ? 'tenant' : null
  if (!role) return NextResponse.json({ error: 'role_required' }, { status: 400, headers: NO_STORE })
  const message = stripNul(String(body.message || '')).trim()
  if (message.length < CONTACT_MIN || message.length > CONTACT_MAX) return NextResponse.json({ error: 'message_length' }, { status: 400, headers: NO_STORE })
  const area = stripNul(String(body.area || '')).trim().slice(0, 160) || null
  const budget = stripNul(String(body.budget || '')).trim().slice(0, 80) || null

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const hit = await loadPublicAgent(admin, slug)
  if (!hit) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  const agentId = hit.row.auth_id
  if (agentId === user.id) return NextResponse.json({ error: 'own_profile' }, { status: 400, headers: NO_STORE })

  // Every contact sends mail: fail CLOSED (CLAUDE.md 工程规则). Per person, and per agent.
  const [mine, theirs] = await Promise.all([
    underHourlyLimit(`agent-contact:u:${user.id}`, 5, false),
    underHourlyLimit(`agent-contact:a:${agentId}`, 30, false),
  ])
  if (!mine || !theirs) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

  const email = user.email.trim().toLowerCase()
  const name = ((await displayNameFor(admin, user.id)) || email.split('@')[0]).slice(0, 120)
  const find = async () => {
    const { data } = await admin.from('agent_clients').select('id').eq('agent_auth_id', agentId).ilike('email', ilikeExact(email)).limit(1)
    return ((data ?? []) as { id: string }[])[0]?.id ?? null
  }
  let clientId: string | null = await find()
  let created = false
  if (!clientId) {
    const { data, error } = await admin.from('agent_clients').insert({
      agent_auth_id: agentId, name, client_role: role, email, area, budget, stage: 'searching',
      notes: '经公开主页联系 / Contacted via public profile', last_contact_at: new Date().toISOString(),
    }).select('id').maybeSingle()
    // 23505 client_email_taken = a parallel request created it first.
    clientId = (data as { id: string } | null)?.id ?? (error ? await find() : null)
    created = !!data
  } else {
    await admin.from('agent_clients').update({ last_contact_at: new Date().toISOString() }).eq('id', clientId as string)
  }
  if (!clientId) return NextResponse.json({ error: 'could_not_create' }, { status: 502, headers: NO_STORE })

  const thread = await ensureThread(admin, 'agent_client', clientId, { title: name, createdBy: user.id })
  if (!thread) return NextResponse.json({ error: 'could_not_create' }, { status: 502, headers: NO_STORE })
  const createdAt = new Date().toISOString()
  const messageId = await postSystemMessage(admin, thread.id, {
    kind: 'message', body: message, senderId: user.id, senderKind: role, actingRole: role, senderLabel: name, channel: 'app',
    meta: { via: 'agent_profile', ...(area ? { area } : {}), ...(budget ? { budget } : {}) },
  })
  if (!messageId) return NextResponse.json({ error: 'could_not_send' }, { status: 502, headers: NO_STORE })

  const roleZh = role === 'tenant' ? '租客' : '房东'
  const roleEn = role === 'tenant' ? 'Tenant' : 'Landlord'
  await notifyThreadParties(admin, thread, {
    messageId, createdAt, exceptUserId: user.id, exceptEmail: email, preview: message.slice(0, 120), body: message,
    senderLabel: `${name}（${roleZh}） / ${name} (${roleEn})`,
  })
  await admin.from('agent_audit_events').insert({
    actor_id: user.id, actor_type: 'user', action: 'agent_profile_contact', target_type: 'agent_client', target_id: clientId,
    metadata: { agent_slug: slug, role, new_client: created },
  }).then(() => undefined, () => undefined)
  return NextResponse.json({ ok: true, thread_id: thread.id, new_client: created }, { headers: NO_STORE })
}

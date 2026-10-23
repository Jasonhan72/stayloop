// MLS® hand-off between a landlord and a Stayloop-verified agent (V0.8 第二项 · 第 3 步, 2026-10-22;
// design/landlord-first-publishing-and-syndication-2026-10.md §三).
//
//   GET                       → the caller's hand-off rows (as the listing's landlord and/or the named agent)
//   POST { action: 'request', listing_id, agent_auth_id, message? }   landlord → agent (row + client + thread + first message)
//   POST { action: 'posted',  id, external_id, external_url? }        agent writes back the MLS® number and public link
//   POST { action: 'declined', id, note? }                            agent
//   POST { action: 'removed', id }                                    either side (withdraw a request / record the take-down)
//
// All writes are service role after the checks here; the API roles hold SELECT only.
// Nothing is read from MLS — the agent types the number and link in. Stayloop does not
// dispatch, charges nothing and takes no part in the trade.
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { stripNul } from '@/lib/screening/jsonSafe'
import { isRegistrationLive } from '@/lib/agentProfile'
import { connectAgentClient } from '@/lib/agent/connectClient'
import { ensureThread, notifyThreadParties, postSystemMessage } from '@/lib/threads/server'
import {
  HANDOFF_MESSAGE_MAX, HANDOFF_NOTE_MAX, allowedActions, isMlsNumber, isPublicListingUrl,
  type HandoffItem, type SyndicationRow,
} from '@/lib/listings/syndication'

const NO_STORE = { 'Cache-Control': 'no-store' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROW_COLS = 'id, listing_id, channel, status, external_id, external_url, agent_auth_id, client_id, thread_id, requested_by, note, posted_at, removed_at, created_at, updated_at'
type ListingRow = { id: string; slug: string | null; address: string; unit: string | null; city: string | null; landlord_id: string | null; source: string | null; status: string | null; is_active: boolean }
type AgentRow = { auth_id: string; legal_name: string; brokerage_name: string; status: string; expires_at: string | null; public_profile: boolean; profile_slug: string | null }

const site = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

async function caller(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await sb.auth.getUser()
  const u = data?.user
  return u && !u.is_anonymous && u.email ? { id: u.id, email: u.email } : null
}

/** landlords.id values (plus the auth id itself) that mark a listing as the caller's. */
async function ownerIds(svc: SupabaseClient, uid: string): Promise<string[]> {
  const { data } = await svc.from('landlords').select('id').or(`id.eq.${uid},auth_id.eq.${uid}`)
  return [uid, ...((data ?? []) as { id: string }[]).map((r) => r.id)]
}

const addressOf = (l: Pick<ListingRow, 'address' | 'unit'>) => `${l.address}${l.unit ? ` #${l.unit}` : ''}`
/** Address + city for the first message, without repeating a city the address already names. */
const placeOf = (l: Pick<ListingRow, 'address' | 'unit' | 'city'>, zh: boolean) => {
  const named = !!l.city && l.address.toLowerCase().includes(l.city.toLowerCase())
  return `${addressOf(l)}${l.city && !named ? `${zh ? '，' : ', '}${l.city}` : ''}`
}

export async function GET(req: Request) {
  const user = await caller(req)
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const svc = admin()
  const mine = await ownerIds(svc, user.id)
  const { data: owned } = await svc.from('listings').select('id').in('landlord_id', mine).limit(500)
  const ownedIds = ((owned ?? []) as { id: string }[]).map((r) => r.id)
  const ors = [`agent_auth_id.eq.${user.id}`, `requested_by.eq.${user.id}`]
  if (ownedIds.length) ors.push(`listing_id.in.(${ownedIds.join(',')})`)
  const { data, error } = await svc.from('listing_syndications').select(ROW_COLS).or(ors.join(',')).order('updated_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'read_failed' }, { status: 502, headers: NO_STORE })
  const rows = (data ?? []) as SyndicationRow[]
  const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)))
  const agentIds = Array.from(new Set(rows.map((r) => r.agent_auth_id).filter((x): x is string => !!x)))
  const [ls, ags] = await Promise.all([
    listingIds.length ? svc.from('listings').select('id, slug, address, unit, city, is_active').in('id', listingIds) : Promise.resolve({ data: [] }),
    agentIds.length ? svc.from('agent_profiles').select('auth_id, legal_name, brokerage_name, public_profile, profile_slug').in('auth_id', agentIds) : Promise.resolve({ data: [] }),
  ])
  const lById = new Map(((ls.data ?? []) as ListingRow[]).map((l) => [l.id, l]))
  const aById = new Map(((ags.data ?? []) as AgentRow[]).map((a) => [a.auth_id, a]))
  const ownedSet = new Set(ownedIds)
  const items: HandoffItem[] = rows.map((r) => {
    const l = lById.get(r.listing_id)
    const a = r.agent_auth_id ? aById.get(r.agent_auth_id) : null
    return {
      ...r,
      listing: l ? { id: l.id, slug: l.slug, address: l.address, unit: l.unit, city: l.city, is_active: l.is_active } : null,
      agent: a ? { name: a.legal_name, brokerage: a.brokerage_name, slug: a.public_profile ? a.profile_slug : null } : null,
      mine: r.agent_auth_id === user.id && !ownedSet.has(r.listing_id) ? 'agent' : 'landlord',
    }
  })
  return NextResponse.json({ items }, { headers: NO_STORE })
}

export async function POST(req: Request) {
  const user = await caller(req)
  if (!user) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: NO_STORE }) }
  const action = String(body.action || '')
  const svc = admin()

  if (action === 'request') {
    const listingId = String(body.listing_id || '')
    const agentId = String(body.agent_auth_id || '')
    if (!UUID_RE.test(listingId) || !UUID_RE.test(agentId)) return NextResponse.json({ error: 'ids_required' }, { status: 400, headers: NO_STORE })
    if (agentId === user.id) return NextResponse.json({ error: 'own_profile' }, { status: 400, headers: NO_STORE })
    const message = stripNul(String(body.message || '')).trim().slice(0, HANDOFF_MESSAGE_MAX)
    const { data: lr } = await svc.from('listings').select('id, slug, address, unit, city, landlord_id, source, status, is_active').eq('id', listingId).maybeSingle()
    const listing = lr as ListingRow | null
    if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    const mine = await ownerIds(svc, user.id)
    if (!listing.landlord_id || !mine.includes(listing.landlord_id)) return NextResponse.json({ error: 'not_owner' }, { status: 403, headers: NO_STORE })
    // An import is somebody else's listing already on MLS; an archived unit has nothing to list.
    if (listing.source === 'realtor' || listing.status === 'archived') return NextResponse.json({ error: 'listing_not_eligible' }, { status: 409, headers: NO_STORE })
    const { data: ar } = await svc.from('agent_profiles').select('auth_id, legal_name, brokerage_name, status, expires_at, public_profile, profile_slug').eq('auth_id', agentId).maybeSingle()
    const agent = ar as AgentRow | null
    if (!agent || !isRegistrationLive(agent.status) || (agent.expires_at && agent.expires_at < new Date().toISOString().slice(0, 10))) return NextResponse.json({ error: 'agent_not_verified' }, { status: 409, headers: NO_STORE })
    const { data: live } = await svc.from('listing_syndications').select('id, status').eq('listing_id', listingId).eq('channel', 'mls').in('status', ['requested', 'posted']).limit(1)
    if ((live ?? []).length) return NextResponse.json({ error: 'already_live' }, { status: 409, headers: NO_STORE })
    // Each request mails the agent: fail CLOSED, per landlord and per agent.
    const [a, b] = await Promise.all([underHourlyLimit(`mls-handoff:u:${user.id}`, 5, false), underHourlyLimit(`mls-handoff:a:${agentId}`, 30, false)])
    if (!a || !b) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

    const connected = await connectAgentClient(svc, { agentId, user, role: 'landlord', area: listing.city ?? null, note: `经房源页请求挂 MLS® / Asked to list on MLS® · ${addressOf(listing)}` })
    if (!connected) return NextResponse.json({ error: 'could_not_create' }, { status: 502, headers: NO_STORE })
    const thread = await ensureThread(svc, 'agent_client', connected.clientId, { title: connected.name, createdBy: user.id })
    if (!thread) return NextResponse.json({ error: 'could_not_create' }, { status: 502, headers: NO_STORE })
    const link = listing.slug ? `${site()}/listings/${listing.slug}` : site()
    const intro = `请帮我把这套房源挂到 MLS®：${placeOf(listing, true)}。房源页：${link}\nPlease list this unit on MLS®: ${placeOf(listing, false)}. Listing page: ${link}`
    const bodyText = message ? `${intro}\n\n${message}` : intro
    const { data: ins, error: insErr } = await svc.from('listing_syndications').insert({
      listing_id: listingId, channel: 'mls', status: 'requested', agent_auth_id: agentId, client_id: connected.clientId, thread_id: thread.id, requested_by: user.id,
      note: message ? message.slice(0, HANDOFF_NOTE_MAX) : null,
    }).select(ROW_COLS).maybeSingle()
    if (insErr || !ins) return NextResponse.json({ error: insErr?.code === '23505' ? 'already_live' : 'could_not_create' }, { status: insErr?.code === '23505' ? 409 : 502, headers: NO_STORE })
    const createdAt = new Date().toISOString()
    const messageId = await postSystemMessage(svc, thread.id, {
      kind: 'message', body: bodyText, senderId: user.id, senderKind: 'landlord', actingRole: 'landlord', senderLabel: connected.name, channel: 'app',
      meta: { via: 'mls_handoff', listing_id: listingId, syndication_id: (ins as SyndicationRow).id },
    })
    await notifyThreadParties(svc, thread, { messageId, createdAt, exceptUserId: user.id, exceptEmail: connected.email, preview: bodyText.slice(0, 120), body: bodyText, senderLabel: `${connected.name}（房东） / ${connected.name} (Landlord)` })
    await svc.from('agent_audit_events').insert({ actor_id: user.id, actor_type: 'user', action: 'mls_handoff_requested', target_type: 'listing', target_id: listingId, metadata: { agent_auth_id: agentId, syndication_id: (ins as SyndicationRow).id, new_client: connected.created } }).then(() => undefined, () => undefined)
    return NextResponse.json({ ok: true, row: ins, thread_id: thread.id }, { headers: NO_STORE })
  }

  if (action === 'posted' || action === 'declined' || action === 'removed') {
    const id = String(body.id || '')
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id_required' }, { status: 400, headers: NO_STORE })
    const { data: rr } = await svc.from('listing_syndications').select(ROW_COLS).eq('id', id).eq('channel', 'mls').maybeSingle()
    const row = rr as SyndicationRow | null
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    const { data: lr } = await svc.from('listings').select('id, slug, address, unit, city, landlord_id, source, status, is_active').eq('id', row.listing_id).maybeSingle()
    const listing = lr as ListingRow | null
    const isAgent = row.agent_auth_id === user.id
    const isLandlord = !!listing?.landlord_id && (await ownerIds(svc, user.id)).includes(listing.landlord_id)
    if (!isAgent && !isLandlord) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE })
    // The agent's transitions come first: an agent-landlord acting on their own listing's row is the agent here.
    const side: 'agent' | 'landlord' = isAgent ? 'agent' : 'landlord'
    if (!allowedActions(row, side).includes(action)) return NextResponse.json({ error: 'not_allowed', status: row.status }, { status: 409, headers: NO_STORE })

    const patch: Record<string, unknown> = { status: action }
    let line = ''
    if (action === 'posted') {
      const externalId = String(body.external_id || '').trim()
      const externalUrl = String(body.external_url || '').trim()
      if (!isMlsNumber(externalId)) return NextResponse.json({ error: 'mls_number_invalid' }, { status: 400, headers: NO_STORE })
      if (externalUrl && !isPublicListingUrl(externalUrl)) return NextResponse.json({ error: 'url_invalid' }, { status: 400, headers: NO_STORE })
      patch.external_id = externalId; patch.external_url = externalUrl || null; patch.posted_at = new Date().toISOString()
      line = `已挂牌 MLS® ${externalId}${externalUrl ? ` · ${externalUrl}` : ''} / Listed on MLS® ${externalId}${externalUrl ? ` · ${externalUrl}` : ''}`
    } else if (action === 'declined') {
      const note = stripNul(String(body.note || '')).trim().slice(0, HANDOFF_NOTE_MAX)
      patch.note = note || null
      line = `经纪未承接这次 MLS® 挂牌${note ? `：${note}` : ''} / The agent declined this MLS® listing${note ? `: ${note}` : ''}`
    } else {
      patch.removed_at = new Date().toISOString()
      line = row.status === 'requested'
        ? (side === 'landlord' ? '房东撤回了 MLS® 挂牌请求 / The landlord withdrew the MLS® request' : '经纪撤回了这条交接 / The agent closed this hand-off')
        : `MLS® 挂牌记录已撤下${row.external_id ? `（${row.external_id}）` : ''} / MLS® listing record taken down${row.external_id ? ` (${row.external_id})` : ''}`
    }
    const { data: upd, error: updErr } = await svc.from('listing_syndications').update(patch).eq('id', id).eq('status', row.status).select(ROW_COLS).maybeSingle()
    if (updErr || !upd) return NextResponse.json({ error: 'not_allowed', status: row.status }, { status: 409, headers: NO_STORE })
    if (row.thread_id) {
      const { data: th } = await svc.from('threads').select('*').eq('id', row.thread_id).maybeSingle()
      const messageId = await postSystemMessage(svc, row.thread_id, { body: line, meta: { via: 'mls_handoff', listing_id: row.listing_id, syndication_id: id, status: action } })
      if (th) await notifyThreadParties(svc, th as never, { messageId, exceptUserId: user.id, exceptEmail: user.email, preview: line.slice(0, 120), body: line, senderLabel: 'Stayloop' })
    }
    await svc.from('agent_audit_events').insert({ actor_id: user.id, actor_type: 'user', action: `mls_handoff_${action}`, target_type: 'listing', target_id: row.listing_id, metadata: { syndication_id: id, side, ...(action === 'posted' ? { external_id: patch.external_id } : {}) } }).then(() => undefined, () => undefined)
    return NextResponse.json({ ok: true, row: upd }, { headers: NO_STORE })
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400, headers: NO_STORE })
}

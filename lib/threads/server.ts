// Threads · server side (service role). Opens the thread of a matter, writes
// system / formal-copy messages, resolves the parties and notifies them.
// Never imported by client code; never imports the marketplace server (the
// marketplace imports this).
//
// 消息系统 A 期 (2026-09-29): seven kinds (listing inquiries, agent ↔ client and
// Stayloop support joined tenancies / applications / work orders / disputes);
// every email about a thread is sent "<sender> 经 Stayloop" from our own address
// with Reply-To t-<token>@reply.stayloop.ai, so the other side never sees a
// personal address and a reply by email lands in the same record
// (recordEmailReply, called by /api/threads/inbound). Every push / email is a
// row in message_deliveries.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, renderThreadMessageEmail } from '@/lib/email'
import { notifyUser } from '@/lib/push/notify'
import { FORMAL_COPY_NOTE, KIND_TAG, PARTY_LABEL, messageCenterHref, type MessageKind, type SenderKind, type ThreadKind } from './shared'
import { REPLY_MARKER, bareAddress, newReplyToken, replyAddress, stripQuotedReply, tokenFromAddress, htmlToText } from './emailReply'
import { ensureMatter, matterKindOfThread } from '@/lib/matters/server'

type Admin = SupabaseClient
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')
const COLS = 'id, kind, ref_id, household_id, title, listing_id, subject_user'

export type ThreadRow = { id: string; kind: ThreadKind; ref_id: string; household_id: string | null; title: string | null; listing_id?: string | null; subject_user?: string | null }

/** RFC 4122 v5 (SHA-1) — the ref of a listing inquiry is uuid_v5(listing, prospect). */
export async function uuidV5(namespace: string, name: string): Promise<string> {
  const ns = namespace.replace(/-/g, '')
  const bytes = new Uint8Array(16 + new TextEncoder().encode(name).length)
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(ns.slice(i * 2, i * 2 + 2), 16)
  bytes.set(new TextEncoder().encode(name), 16)
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = Array.from(h).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Get or create the thread of a matter. */
export async function ensureThread(admin: Admin, kind: ThreadKind, refId: string, opts: { householdId?: string | null; title?: string | null; createdBy?: string | null; listingId?: string | null; subjectUser?: string | null } = {}): Promise<ThreadRow | null> {
  const { data: hit } = await admin.from('threads').select(COLS).eq('kind', kind).eq('ref_id', refId).maybeSingle()
  if (hit) return hit as ThreadRow
  // 节点 5: every thread hangs off the rental matter of its ref (derived from the chain; null when there is none yet).
  const matterId = kind === 'listing_inquiry' && opts.listingId
    ? await ensureMatter(admin, 'listing', opts.listingId)
    : kind === 'agent_client' || kind === 'support' || kind === 'listing_inquiry' ? null
    : await ensureMatter(admin, matterKindOfThread(kind), refId)
  const { data, error } = await admin.from('threads').insert({
    kind, ref_id: refId, household_id: opts.householdId ?? null, title: (opts.title || '').slice(0, 200) || null, created_by: opts.createdBy ?? null, matter_id: matterId,
    listing_id: opts.listingId ?? null, subject_user: opts.subjectUser ?? null,
  }).select(COLS).maybeSingle()
  if (error) {
    // Lost a race: read the winner.
    const { data: again } = await admin.from('threads').select(COLS).eq('kind', kind).eq('ref_id', refId).maybeSingle()
    return (again as ThreadRow | null) ?? null
  }
  return (data as ThreadRow | null) ?? null
}

/** The one listing-inquiry thread between a listing and a prospect. */
export async function ensureListingThread(admin: Admin, listing: { id: string; address: string | null; unit: string | null }, prospectId: string): Promise<ThreadRow | null> {
  const ref = await uuidV5(listing.id, prospectId)
  const title = [listing.address, listing.unit ? `#${listing.unit}` : ''].filter(Boolean).join(' ') || 'Listing'
  return ensureThread(admin, 'listing_inquiry', ref, { title, createdBy: prospectId, listingId: listing.id, subjectUser: prospectId })
}

export type SystemMessageInput = {
  body: string
  kind?: Extract<MessageKind, 'system' | 'formal_copy' | 'message'>
  senderKind?: SenderKind
  senderId?: string | null
  actingRole?: string | null
  senderLabel?: string | null
  channel?: 'app' | 'email' | 'sms' | 'system'
  attachments?: unknown[]
  meta?: Record<string, unknown>
}

/** A server-written message (system line, formal-notice copy, or a party's message relayed by the server). Never throws. */
export async function postSystemMessage(admin: Admin, threadId: string, m: SystemMessageInput): Promise<number | null> {
  try {
    const kind = m.kind ?? 'system'
    const body = (kind === 'formal_copy' ? `${m.body}\n\n— ${FORMAL_COPY_NOTE.zh} / ${FORMAL_COPY_NOTE.en}` : m.body).slice(0, 4000)
    const { data } = await admin.from('thread_messages').insert({
      thread_id: threadId, sender_id: m.senderId ?? null, sender_kind: m.senderKind ?? 'system', acting_role: m.actingRole ?? null, sender_label: m.senderLabel ?? null,
      kind, body, meta: m.meta ?? {}, channel: m.channel ?? (kind === 'message' ? 'app' : 'system'), attachments: m.attachments ?? [],
    }).select('id').maybeSingle()
    return (data as { id: number } | null)?.id ?? null
  } catch (e) {
    console.warn('[threads] system message failed:', (e as Error).message)
    return null
  }
}

/** Open the work-order thread and write one system line (used by every transition). */
export async function noteOnWorkOrder(admin: Admin, wo: { id: string; household_id: string; scope?: string | null; landlord_auth_id?: string }, line: string, meta: Record<string, unknown> = {}): Promise<void> {
  const t = await ensureThread(admin, 'work_order', wo.id, { householdId: wo.household_id, title: wo.scope ?? null, createdBy: wo.landlord_auth_id ?? null })
  if (t) await postSystemMessage(admin, t.id, { body: line, meta: { work_order_id: wo.id, ...meta } })
}

/** pending = invited, not joined: relayed notice only (no reply address), link to accept the invitation. */
export type Party = { userId: string | null; email: string | null; kind: SenderKind; label: string | null; pending?: boolean; inviteToken?: string | null }

async function landlordOfListing(admin: Admin, landlordId: string | null | undefined): Promise<string | null> {
  if (!landlordId) return null
  const { data } = await admin.from('landlords').select('id, auth_id').or(`id.eq.${landlordId},auth_id.eq.${landlordId}`).limit(1)
  const row = ((data ?? []) as { id: string; auth_id: string | null }[])[0]
  return row?.auth_id ?? landlordId
}

/** Everyone in a thread, named (找得到人 2026-09-30): account holders get their display name, never an address. */
export async function threadParties(admin: Admin, t: ThreadRow): Promise<Party[]> {
  const raw = await threadPartiesRaw(admin, t)
  const generic = new Set(['landlord', 'tenant', 'agent', 'property_manager', 'member', 'provider'])
  const ids = Array.from(new Set(raw.filter((p) => p.userId && (!p.label || generic.has(p.label))).map((p) => p.userId as string)))
  if (!ids.length) return raw
  const { data } = await admin.rpc('person_names', { p_users: ids })
  const names = new Map(((data ?? []) as { user_id: string; name: string | null }[]).filter((r) => r.name).map((r) => [r.user_id, r.name as string]))
  return raw.map((p) => (p.userId && names.has(p.userId) && (!p.label || generic.has(p.label)) ? { ...p, label: names.get(p.userId)! } : p))
}

async function threadPartiesRaw(admin: Admin, t: ThreadRow): Promise<Party[]> {
  const out: Party[] = []
  const members = async (hh: string) => {
    const { data } = await admin.from('household_members').select('user_id, role').eq('household_id', hh).eq('status', 'active')
    for (const m of (data ?? []) as { user_id: string; role: string }[]) out.push({ userId: m.user_id, email: null, kind: m.role === 'landlord' || m.role === 'property_manager' ? 'landlord' : m.role === 'agent' ? 'agent' : 'tenant', label: m.role })
  }
  if (t.kind === 'tenancy') {
    await members(t.ref_id)
    // An invited counterpart who has not joined yet is reached by relay email at the
    // invited address (they already received the invitation there).
    const { data: inv } = await admin.from('household_invites').select('invited_email, invited_role, expires_at, token').eq('household_id', t.ref_id)
      .is('accepted_at', null).is('declined_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    for (const i of (inv ?? []) as { invited_email: string; invited_role: string; token: string }[]) {
      out.push({ userId: null, email: i.invited_email, kind: i.invited_role === 'landlord' || i.invited_role === 'property_manager' ? 'landlord' : i.invited_role === 'agent' ? 'agent' : 'tenant', label: null, pending: true, inviteToken: i.token })
    }
    return out
  }
  if (t.kind === 'work_order' || t.kind === 'dispute') {
    const { data: wo } = await admin.from('work_orders').select('landlord_auth_id, provider_id, external_email, external_name, household_id').eq('id', t.ref_id).maybeSingle()
    if (!wo) return out
    const w = wo as { landlord_auth_id: string; provider_id: string | null; external_email: string | null; external_name: string | null; household_id: string }
    out.push({ userId: w.landlord_auth_id, email: null, kind: 'landlord', label: 'landlord' })
    if (w.provider_id) {
      const { data: p } = await admin.from('service_providers').select('auth_id, contact_email, legal_name, trade_name').eq('id', w.provider_id).maybeSingle()
      const pr = p as { auth_id: string | null; contact_email: string | null; legal_name: string; trade_name: string | null } | null
      if (pr) out.push({ userId: pr.auth_id, email: pr.auth_id ? null : pr.contact_email, kind: 'provider', label: pr.trade_name || pr.legal_name })
    } else if (w.external_email) {
      out.push({ userId: null, email: w.external_email, kind: 'external', label: w.external_name || 'Contractor' })
    }
    const { data } = await admin.from('household_members').select('user_id, role').eq('household_id', w.household_id).eq('status', 'active').eq('role', 'tenant')
    for (const m of (data ?? []) as { user_id: string }[]) out.push({ userId: m.user_id, email: null, kind: 'tenant', label: 'tenant' })
    return out
  }
  if (t.kind === 'application') {
    const { data: a } = await admin.from('applications').select('email, first_name, last_name, listing:listings(landlord_id)').eq('id', t.ref_id).maybeSingle()
    if (!a) return out
    const app = a as { email: string | null; first_name: string | null; last_name: string | null; listing: { landlord_id: string } | { landlord_id: string }[] | null }
    const listing = Array.isArray(app.listing) ? app.listing[0] : app.listing
    const ll = await landlordOfListing(admin, listing?.landlord_id)
    if (ll) out.push({ userId: ll, email: null, kind: 'landlord', label: 'landlord' })
    if (app.email) out.push({ userId: null, email: app.email, kind: 'tenant', label: [app.first_name, app.last_name].filter(Boolean).join(' ') || 'Applicant' })
    return out
  }
  if (t.kind === 'listing_inquiry') {
    if (t.subject_user) out.push({ userId: t.subject_user, email: null, kind: 'tenant', label: 'tenant' })
    if (t.listing_id) {
      const { data: l } = await admin.from('listings').select('landlord_id').eq('id', t.listing_id).maybeSingle()
      const ll = await landlordOfListing(admin, (l as { landlord_id: string | null } | null)?.landlord_id)
      if (ll) out.push({ userId: ll, email: null, kind: 'landlord', label: 'landlord' })
    }
    return out
  }
  if (t.kind === 'agent_client') {
    const { data: c } = await admin.from('agent_clients').select('agent_auth_id, name, client_role, email').eq('id', t.ref_id).maybeSingle()
    const cl = c as { agent_auth_id: string; name: string; client_role: 'tenant' | 'landlord'; email: string | null } | null
    if (!cl) return out
    const { data: ap } = await admin.from('agent_profiles').select('legal_name').eq('auth_id', cl.agent_auth_id).maybeSingle()
    out.push({ userId: cl.agent_auth_id, email: null, kind: 'agent', label: (ap as { legal_name: string | null } | null)?.legal_name || 'Agent' })
    const { data: d } = await admin.from('delegations').select('principal_auth_id').eq('client_id', t.ref_id).eq('status', 'active').gt('expires_at', new Date().toISOString()).not('principal_auth_id', 'is', null).limit(1)
    const principal = ((d ?? []) as { principal_auth_id: string }[])[0]?.principal_auth_id ?? null
    if (principal) out.push({ userId: principal, email: null, kind: cl.client_role, label: cl.name })
    else if (cl.email) out.push({ userId: null, email: cl.email, kind: cl.client_role, label: cl.name })
    return out
  }
  if (t.kind === 'support') {
    out.push({ userId: t.ref_id, email: null, kind: 'member', label: 'member' })
    const { data } = await admin.from('admin_users').select('user_id')
    for (const r of (data ?? []) as { user_id: string }[]) out.push({ userId: r.user_id, email: null, kind: 'admin', label: 'Stayloop' })
    return out
  }
  return out
}

/** A party as the other side sees them: role + name when we know one, never an address. */
export function partyDisplay(p: Party, zh: boolean): string {
  const role = zh ? PARTY_LABEL[p.kind]?.zh : PARTY_LABEL[p.kind]?.en
  const generic = ['tenant', 'landlord', 'agent', 'provider', 'member', 'property_manager', 'landlord_owner']
  return p.label && !generic.includes(p.label) && !p.label.includes('@') ? `${p.label} · ${role}` : role || p.kind
}

/** External-contact link for a work-order thread (the token is their credential). */
async function externalLink(admin: Admin, t: ThreadRow): Promise<string | null> {
  if (t.kind !== 'work_order' && t.kind !== 'dispute') return null
  const { data } = await admin.from('work_orders').select('token').eq('id', t.ref_id).maybeSingle()
  const token = (data as { token: string | null } | null)?.token
  return token ? `${SITE()}/w/${token}` : null
}

/** The reply address for (thread, recipient); issued once, reused after. */
export async function replyTokenFor(admin: Admin, threadId: string, email: string, party: { kind: SenderKind; userId: string | null; label: string | null }): Promise<string | null> {
  const em = email.trim().toLowerCase()
  const { data: hit } = await admin.from('thread_reply_tokens').select('token, revoked_at').eq('thread_id', threadId).eq('email', em).maybeSingle()
  const h = hit as { token: string; revoked_at: string | null } | null
  if (h) return h.revoked_at ? null : h.token
  const token = newReplyToken()
  const partyKind = party.kind === 'system' ? 'member' : party.kind
  const { error } = await admin.from('thread_reply_tokens').insert({ token, thread_id: threadId, email: em, user_id: party.userId, party_kind: partyKind, label: party.label?.slice(0, 120) ?? null })
  if (error) {
    const { data: again } = await admin.from('thread_reply_tokens').select('token').eq('thread_id', threadId).eq('email', em).maybeSingle()
    return (again as { token: string } | null)?.token ?? null
  }
  return token
}

async function authEmail(admin: Admin, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch { return null }
}

/** A person's display name for "<name> 经 Stayloop" (metadata name, never the address). */
export async function displayNameFor(admin: Admin, userId: string | null): Promise<string | null> {
  if (!userId) return null
  // The same sanitised name the insert trigger stamps (person_name: 显示名 → full_name → name → landlords / tenants).
  try {
    const { data } = await admin.rpc('person_names', { p_users: [userId] })
    const n = ((data ?? []) as { name: string | null }[])[0]?.name
    return n ? n.slice(0, 60) : null
  } catch { return null }
}

async function recordDelivery(admin: Admin, row: { message_id: number | null; thread_id: string; channel: 'email' | 'push'; recipient_user_id?: string | null; recipient_address?: string | null; provider_message_id?: string | null; status: string; detail?: string | null }) {
  try { await admin.from('message_deliveries').insert({ ...row, detail: row.detail?.slice(0, 500) ?? null }) } catch { /* receipts never block delivery */ }
}

/**
 * Tell the other parties about a new message. Account holders get a push (their
 * own push level applies) and, when no push reached them, one email; parties
 * without an account get the email. Every email is relayed "<sender> 经
 * Stayloop" with a per-recipient reply address, so replying by email records
 * the reply. Never the sender. Never throws.
 */
export async function notifyThreadParties(admin: Admin, t: ThreadRow, opts: { messageId?: number | null; exceptUserId?: string | null; exceptEmail?: string | null; preview: string; body?: string; senderLabel: string; createdAt?: string }): Promise<{ pushed: number; emailed: number }> {
  let pushed = 0, emailed = 0
  try {
    const parties = await threadParties(admin, t)
    const title = `${t.title || ''}`.trim() || 'Stayloop'
    const kindTag = `${KIND_TAG[t.kind]?.zh ?? t.kind} / ${KIND_TAG[t.kind]?.en ?? t.kind}`
    const when = new Date(opts.createdAt || Date.now()).toLocaleString('zh-CN', { timeZone: 'America/Toronto', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '（多伦多 / Toronto）'
    const seenUsers = new Set<string>(); const seenEmails = new Set<string>()
    const except = (opts.exceptEmail || '').toLowerCase()
    const email = async (to: string, party: Party) => {
      // An invitee who has not joined gets a notice only — no reply address into the record
      // (review 2026-09-30) — and the link goes to the invitation, not a page they cannot open.
      const token = party.pending ? null : await replyTokenFor(admin, t.id, to, { kind: party.kind, userId: party.userId, label: party.label })
      const link = party.pending && party.inviteToken ? `${SITE()}/join/${party.inviteToken}` : party.kind === 'external' ? (await externalLink(admin, t)) || SITE() : party.userId ? `${SITE()}${messageCenterHref(t.id)}` : party.kind === 'tenant' && t.kind === 'application' ? `${SITE()}/tenant/applications/${t.ref_id}` : `${SITE()}${messageCenterHref(t.id)}`
      const { subject, html, text } = renderThreadMessageEmail({ threadTitle: title, kindLabel: kindTag, senderLabel: opts.senderLabel, when, body: (opts.body ?? opts.preview).slice(0, 4000), link, replyable: !!token, marker: REPLY_MARKER })
      const r = await sendEmail({ to, subject, html, text, replyTo: token ? replyAddress(token) : undefined, fromName: `${opts.senderLabel.split(' / ')[0]} 经 Stayloop` })
      await recordDelivery(admin, { message_id: opts.messageId ?? null, thread_id: t.id, channel: 'email', recipient_user_id: party.userId, recipient_address: to, provider_message_id: r.id ?? null, status: r.ok ? 'sent' : 'failed', detail: r.ok ? null : r.error })
      if (r.ok) emailed++
    }
    for (const p of parties) {
      if (p.userId) {
        if (p.userId === opts.exceptUserId || seenUsers.has(p.userId)) continue
        seenUsers.add(p.userId)
        const n = await notifyUser(admin, p.userId, { kind: 'event', title: `新消息 / New message · ${title}`.slice(0, 80), body: `${opts.senderLabel}: ${opts.preview}`.slice(0, 120), url: messageCenterHref(t.id) })
        pushed += n
        await recordDelivery(admin, { message_id: opts.messageId ?? null, thread_id: t.id, channel: 'push', recipient_user_id: p.userId, status: n > 0 ? 'sent' : 'skipped', detail: n > 0 ? `${n} device(s)` : 'no push subscription or muted' })
        if (n === 0) {
          const to = await authEmail(admin, p.userId)
          if (to && to.toLowerCase() !== except && !seenEmails.has(to.toLowerCase())) { seenEmails.add(to.toLowerCase()); await email(to, p) }
        }
      } else if (p.email) {
        const em = p.email.toLowerCase()
        if (em === except || seenEmails.has(em)) continue
        seenEmails.add(em)
        await email(p.email, p)
      }
    }
  } catch (e) {
    console.warn('[threads] notify failed:', (e as Error).message)
  }
  return { pushed, emailed }
}

/** The audit matter of a thread. */
export function threadMatter(t: Pick<ThreadRow, 'kind' | 'ref_id'>): { matterType: string; matterId: string } {
  const type = t.kind === 'tenancy' ? 'household' : t.kind === 'dispute' ? 'work_order' : t.kind
  return { matterType: type, matterId: t.ref_id }
}

// ── Email replies ───────────────────────────────────────────────────────────

export type InboundEmail = {
  raw: Uint8Array
  from: string | null
  to: string[]
  text: string | null
  html: string | null
  messageId: string | null
  attachmentCount: number
}

export type InboundOutcome = 'recorded' | 'unknown_token' | 'sender_mismatch' | 'empty' | 'revoked' | 'error'

async function sha256HexBytes(b: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Record an email reply. The raw MIME is stored (private bucket) with its
 * SHA-256 whatever the outcome; a message is written only when the reply
 * address is a live token and the From address is the one it was issued to.
 */
export async function recordEmailReply(admin: Admin, mail: InboundEmail): Promise<{ outcome: InboundOutcome; messageId?: number; threadId?: string }> {
  const sha = await sha256HexBytes(mail.raw)
  const from = bareAddress(mail.from)
  const toAddr = mail.to.find((a) => tokenFromAddress(a)) ?? mail.to[0] ?? null
  const token = mail.to.map(tokenFromAddress).find(Boolean) ?? null
  const month = new Date().toISOString().slice(0, 7)
  const rawPath = `${month}/${sha}.eml`
  try {
    await admin.storage.from('thread-inbound').upload(rawPath, mail.raw, { contentType: 'message/rfc822', upsert: true })
  } catch { /* the hash is still recorded */ }
  const log = async (outcome: InboundOutcome, threadId: string | null, messageId: number | null) => {
    await admin.from('thread_inbound').insert({ channel: 'email', thread_id: threadId, message_id: messageId, from_addr: from, to_addr: bareAddress(toAddr) ?? toAddr?.slice(0, 320) ?? null, raw_path: rawPath, raw_sha256: sha, raw_size: mail.raw.byteLength, outcome })
  }
  if (!token) { await log('unknown_token', null, null); return { outcome: 'unknown_token' } }
  const { data: tk } = await admin.from('thread_reply_tokens').select('token, thread_id, email, user_id, party_kind, label, revoked_at').eq('token', token).maybeSingle()
  const row = tk as { token: string; thread_id: string; email: string; user_id: string | null; party_kind: SenderKind; label: string | null; revoked_at: string | null } | null
  if (!row) { await log('unknown_token', null, null); return { outcome: 'unknown_token' } }
  if (row.revoked_at || !(await tokenStillParty(admin, row))) { await log('revoked', row.thread_id, null); return { outcome: 'revoked', threadId: row.thread_id } }
  if (!from || from !== row.email.toLowerCase()) { await log('sender_mismatch', row.thread_id, null); return { outcome: 'sender_mismatch', threadId: row.thread_id } }
  const plain = mail.text && mail.text.trim() ? mail.text : mail.html ? htmlToText(mail.html) : ''
  let body = stripQuotedReply(plain).slice(0, 3800)
  if (mail.attachmentCount > 0) body = `${body}${body ? '\n\n' : ''}（邮件带有 ${mail.attachmentCount} 个附件，未收录进对话；请在站内对话上传。 / ${mail.attachmentCount} email attachment(s) were not added; please upload them in the app.）`
  if (!body.trim()) { await log('empty', row.thread_id, null); return { outcome: 'empty', threadId: row.thread_id } }
  const msgId = await postSystemMessage(admin, row.thread_id, {
    kind: 'message', channel: 'email', senderId: row.user_id, senderKind: row.party_kind, actingRole: null,
    senderLabel: row.label && !row.label.includes('@') ? row.label : null,
    body, meta: { via: 'email_reply', raw_sha256: sha, email_message_id: mail.messageId?.slice(0, 200) ?? null, verified_by: 'reply_token+from_address' },
  })
  if (!msgId) { await log('error', row.thread_id, null); return { outcome: 'error', threadId: row.thread_id } }
  await log('recorded', row.thread_id, msgId)
  const { data: t } = await admin.from('threads').select(COLS).eq('id', row.thread_id).maybeSingle()
  if (t) {
    const label = row.label && !row.label.includes('@') ? row.label : (PARTY_LABEL[row.party_kind]?.zh ?? row.party_kind)
    await notifyThreadParties(admin, t as ThreadRow, { messageId: msgId, exceptUserId: row.user_id, exceptEmail: from, preview: body.slice(0, 120), body, senderLabel: label })
  }
  return { outcome: 'recorded', messageId: msgId, threadId: row.thread_id }
}


/**
 * Is the holder of a reply address still a party of that conversation? Checked
 * on every email reply (review 2026-09-30): an address stays live only while the
 * relationship that issued it does — a revoked delegation, a changed client email,
 * a tenant who left, a contractor swapped out: the reply is refused (logged, raw kept).
 */
async function tokenStillParty(admin: Admin, row: { thread_id: string; email: string; user_id: string | null; party_kind: string }): Promise<boolean> {
  const { data: t } = await admin.from('threads').select('kind, ref_id, listing_id, subject_user').eq('id', row.thread_id).maybeSingle()
  if (!t) return false
  const th = t as { kind: ThreadKind; ref_id: string; listing_id: string | null; subject_user: string | null }
  const em = row.email.toLowerCase()
  const emailOf = async (uid: string) => { try { const { data } = await admin.auth.admin.getUserById(uid); return (data?.user?.email || '').toLowerCase() } catch { return '' } }
  const activeMember = async (hh: string, uid: string) => {
    const { data } = await admin.from('household_members').select('user_id').eq('household_id', hh).eq('user_id', uid).eq('status', 'active').limit(1)
    return !!(data && data.length)
  }
  if (th.kind === 'tenancy') return !!row.user_id && (await activeMember(th.ref_id, row.user_id))
  if (th.kind === 'work_order' || th.kind === 'dispute') {
    const { data: w } = await admin.from('work_orders').select('landlord_auth_id, provider_id, external_email, household_id').eq('id', th.ref_id).maybeSingle()
    const wo = w as { landlord_auth_id: string; provider_id: string | null; external_email: string | null; household_id: string } | null
    if (!wo) return false
    if (row.party_kind === 'landlord') return !!row.user_id && row.user_id === wo.landlord_auth_id
    if (row.party_kind === 'external') return !wo.provider_id && (wo.external_email || '').toLowerCase() === em
    if (row.party_kind === 'provider') {
      if (!wo.provider_id) return false
      const { data: p } = await admin.from('service_providers').select('auth_id, contact_email').eq('id', wo.provider_id).maybeSingle()
      const pr = p as { auth_id: string | null; contact_email: string | null } | null
      return !!pr && (row.user_id ? pr.auth_id === row.user_id : (pr.contact_email || '').toLowerCase() === em)
    }
    if (row.party_kind === 'tenant') {
      if (row.user_id) return activeMember(wo.household_id, row.user_id)
      const { data: ms } = await admin.from('household_members').select('user_id').eq('household_id', wo.household_id).eq('status', 'active').eq('role', 'tenant')
      for (const m of (ms ?? []) as { user_id: string }[]) if ((await emailOf(m.user_id)) === em) return true
      return false
    }
    return false
  }
  if (th.kind === 'application') {
    const { data: a } = await admin.from('applications').select('email').eq('id', th.ref_id).maybeSingle()
    if (row.party_kind === 'tenant') return ((a as { email: string | null } | null)?.email || '').toLowerCase() === em
    if (row.party_kind === 'landlord' && row.user_id) {
      const people = await threadParties(admin, { id: row.thread_id, kind: th.kind, ref_id: th.ref_id, household_id: null, title: null })
      return people.some((p) => p.kind === 'landlord' && p.userId === row.user_id)
    }
    return false
  }
  if (th.kind === 'listing_inquiry') {
    if (row.party_kind === 'tenant') return !!row.user_id && row.user_id === th.subject_user
    return false
  }
  if (th.kind === 'agent_client') {
    const { data: c } = await admin.from('agent_clients').select('agent_auth_id, email').eq('id', th.ref_id).maybeSingle()
    const cl = c as { agent_auth_id: string; email: string | null } | null
    if (!cl) return false
    if (row.party_kind === 'agent') return row.user_id === cl.agent_auth_id
    return (cl.email || '').toLowerCase() === em
  }
  if (th.kind === 'support') return row.party_kind === 'admin' || (!!row.user_id && row.user_id === th.ref_id)
  return false
}

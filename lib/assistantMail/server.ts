// AI 助理的邮箱 · everything that writes (2026-11-27, design/assistant-inbox-plan-2026-11-27.md).
// Server only: every function takes the service-role client. The browser never writes these
// tables; it reads its own rows under RLS and asks the routes for the rest.
//
//   receiveMail      one delivery from the email Worker → accepted and stored, or a reason to refuse
//   mailboxState     what the 收件 tab needs to draw itself
//   openMailbox / rotateMailbox / closeMailbox / addSender / removeSender
//   markMail / deleteMail / fileLink
//   sweepExpired     the daily clean-up: rows, attachments and the raw original
import type { SupabaseClient, User } from '@supabase/supabase-js'
import PostalMime from 'postal-mime'
import { stripNul } from '@/lib/screening/jsonSafe'
import { htmlToText } from '@/lib/threads/emailReply'
import { bareAddress, fullAddress, newLocalPart, parseRecipient } from './address'
import { loadMailConfig, mailAvailableFor, type MailConfig } from './config'
import { MAIL_LIMITS, REJECT_TEXT, parseAuthResults, pickFiles, quotaVerdict, safeFileName, senderVerdict, storageKeyName, type RejectCode } from './policy'

export const MAIL_BUCKET = 'assistant-mail'

export type ReceiveOutcome =
  | { ok: true; id: string | null; duplicate?: boolean; /** For the route's push notice only — never sent back to the Worker. */ userId?: string; subject?: string }
  | { ok: false; code: RejectCode; reject: string }
const refuse = (code: RejectCode): ReceiveOutcome => ({ ok: false, code, reject: REJECT_TEXT[code] })

async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b as unknown as BufferSource))
  return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('')
}

async function isAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

/** The addresses that may write to this mailbox: the login email first, then the person's own additions. */
async function allowedSenders(admin: SupabaseClient, userId: string): Promise<{ login: string | null; extra: string[] }> {
  const [{ data: u }, { data: rows }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('assistant_inbox_senders').select('email').eq('user_id', userId).order('created_at', { ascending: true }).limit(MAIL_LIMITS.senders),
  ])
  const login = (u?.user?.email ?? '').trim().toLowerCase() || null
  return { login, extra: ((rows ?? []) as { email: string }[]).map((r) => r.email) }
}

/**
 * One delivery. `raw` is the message as received; `to` the envelope recipient; `authHeader`
 * Cloudflare's Authentication-Results as the Worker read it. Order: is the address ours and open →
 * is the sender on its list and verified → is there room → store. A refusal carries the text the
 * sending server is given; nothing is stored for a refused mail.
 */
export async function receiveMail(admin: SupabaseClient, i: { raw: Uint8Array; to: string; authHeader: string | null }): Promise<ReceiveOutcome> {
  const rcpt = parseRecipient(i.to)
  if (!rcpt) return refuse('unknown')
  if (i.raw.byteLength > MAIL_LIMITS.rawBytes) return refuse('too_large')
  const cfg = await loadMailConfig(admin)
  if (!cfg.enabled) return refuse('unknown')
  const { data: box } = await admin.from('assistant_inboxes').select('user_id, enabled').eq('local_part', rcpt.local).maybeSingle()
  const inbox = box as { user_id: string; enabled: boolean } | null
  if (!inbox || !inbox.enabled) return refuse('unknown')
  const userId = inbox.user_id

  let parsed: Awaited<ReturnType<typeof PostalMime.parse>>
  try { parsed = await PostalMime.parse(i.raw) } catch { return refuse('unverified') }
  const from = bareAddress(parsed.from?.address ?? null)
  const auth = parseAuthResults(i.authHeader)
  const senders = await allowedSenders(admin, userId)
  const who = senderVerdict(from, [senders.login, ...senders.extra].filter((x): x is string => !!x), auth)
  if (!who.ok) return refuse(who.code)

  const { data: usage } = await admin.rpc('assistant_mail_usage', { p_user: userId })
  const u = (Array.isArray(usage) ? usage[0] : usage) as { day_count?: number; stored_bytes?: number; site_day_count?: number } | null
  // The usage read failing must not open the gate: with no numbers, nothing is accepted.
  if (!u) return refuse('over_limit')
  const room = quotaVerdict({ rawBytes: i.raw.byteLength, dayCount: Number(u.day_count ?? 0), storedBytes: Number(u.stored_bytes ?? 0), siteDayCount: Number(u.site_day_count ?? 0) })
  if (!room.ok) return refuse(room.code)

  const messageId = (parsed.messageId ?? '').trim().slice(0, 300) || null
  if (messageId) {
    const { data: seen } = await admin.from('assistant_mail').select('id').eq('user_id', userId).eq('message_id', messageId).maybeSingle()
    if (seen) return { ok: true, id: (seen as { id: string }).id, duplicate: true }
  }

  const id = crypto.randomUUID()
  const dir = `${userId}/${id}`
  const atts = parsed.attachments ?? []
  const bytesOf = (c: unknown): Uint8Array => (c instanceof Uint8Array ? c : c instanceof ArrayBuffer ? new Uint8Array(c) : typeof c === 'string' ? new TextEncoder().encode(c) : new Uint8Array())
  const sized = atts.map((a) => ({ filename: a.filename, mimeType: a.mimeType, disposition: a.disposition, size: bytesOf(a.content).byteLength }))
  const { keep, skipped } = pickFiles(sized)

  const rawPath = `${dir}/raw.eml`
  const up = await admin.storage.from(MAIL_BUCKET).upload(rawPath, i.raw, { contentType: 'message/rfc822', upsert: true })
  if (up.error) return refuse('over_limit')
  const files: { idx: number; name: string; media_type: string; size_bytes: number; path: string }[] = []
  for (const [n, k] of keep.entries()) {
    const a = atts[k.index]
    const content = bytesOf(a.content)
    const path = `${dir}/${storageKeyName(n, k.type)}`
    const r = await admin.storage.from(MAIL_BUCKET).upload(path, content, { contentType: k.type, upsert: true })
    if (r.error) { skipped.push((a.filename ?? '').slice(0, 80) || k.type); continue }
    files.push({ idx: n, name: safeFileName(a.filename, n, k.type), media_type: k.type, size_bytes: content.byteLength, path })
  }

  const text = (parsed.text && parsed.text.trim() ? parsed.text : parsed.html ? htmlToText(parsed.html) : '').replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, MAIL_LIMITS.bodyChars)
  const row = stripNul({
    id,
    user_id: userId,
    from_addr: from as string,
    from_name: (parsed.from?.name ?? '').trim().slice(0, 200) || null,
    subject: (parsed.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    body_text: text,
    message_id: messageId,
    auth: { by: auth.by, spf: auth.spf, dkim: auth.dkim, dmarc: auth.dmarc, to: `${rcpt.local}@${rcpt.domain}`, header: (i.authHeader ?? '').replace(/\s+/g, ' ').slice(0, 600) },
    size_bytes: i.raw.byteLength,
    file_count: files.length,
    skipped_files: skipped.slice(0, 20),
    raw_path: rawPath,
    raw_sha256: await sha256Hex(i.raw),
    status: 'new',
    expires_at: new Date(Date.now() + MAIL_LIMITS.keepDays * 86_400_000).toISOString(),
  })
  const ins = await admin.from('assistant_mail').insert(row)
  if (ins.error) {
    // A second delivery of the same message won the race: this one's files go, the mail is already there.
    await admin.storage.from(MAIL_BUCKET).remove([rawPath, ...files.map((f) => f.path)])
    if (ins.error.code === '23505') return { ok: true, id: null, duplicate: true }
    return refuse('over_limit')
  }
  if (files.length) {
    const fr = await admin.from('assistant_mail_files').insert(files.map((f) => stripNul({ ...f, mail_id: id, user_id: userId })))
    if (fr.error) console.warn('[mailbox] file rows failed', fr.error.message)
  }
  return { ok: true, id, userId, subject: row.subject }
}

// ── the mailbox itself ──────────────────────────────────────────────────────────

export type MailboxState = {
  available: boolean
  address: string | null
  createdAt: string | null
  loginEmail: string | null
  senders: { id: string; email: string }[]
  limits: { keepDays: number; perDay: number; maxMb: number; files: number; senders: number }
}
const LIMITS_OUT = { keepDays: MAIL_LIMITS.keepDays, perDay: MAIL_LIMITS.perDay, maxMb: Math.round(MAIL_LIMITS.rawBytes / 1048576), files: MAIL_LIMITS.files, senders: MAIL_LIMITS.senders }

async function availability(admin: SupabaseClient, user: User): Promise<{ cfg: MailConfig; available: boolean }> {
  const cfg = await loadMailConfig(admin)
  const available = mailAvailableFor(cfg, { email: user.email, isAdmin: cfg.enabled && cfg.audience !== 'all' ? await isAdmin(admin, user.id) : false })
  return { cfg, available }
}

export async function mailboxState(admin: SupabaseClient, user: User): Promise<MailboxState> {
  const { cfg, available } = await availability(admin, user)
  const loginEmail = (user.email ?? '').toLowerCase() || null
  if (!available) return { available: false, address: null, createdAt: null, loginEmail, senders: [], limits: LIMITS_OUT }
  const [{ data: box }, { data: rows }] = await Promise.all([
    admin.from('assistant_inboxes').select('local_part, enabled, created_at').eq('user_id', user.id).maybeSingle(),
    admin.from('assistant_inbox_senders').select('id, email').eq('user_id', user.id).order('created_at', { ascending: true }).limit(MAIL_LIMITS.senders),
  ])
  const b = box as { local_part: string; enabled: boolean; created_at: string } | null
  return {
    available: true,
    address: b && b.enabled ? fullAddress(b.local_part, cfg.domain) : null,
    createdAt: b?.created_at ?? null,
    loginEmail,
    senders: ((rows ?? []) as { id: string; email: string }[]),
    limits: LIMITS_OUT,
  }
}

export type ActionResult = { ok: true } | { ok: false; error: string; status: number }
const fail = (error: string, status = 400): ActionResult => ({ ok: false, error, status })

/** A local part nobody has and nobody had. */
async function freshLocalPart(admin: SupabaseClient, name: string | null): Promise<string | null> {
  for (let i = 0; i < 6; i++) {
    const local = newLocalPart(name)
    const [{ data: a }, { data: r }] = await Promise.all([
      admin.from('assistant_inboxes').select('user_id').eq('local_part', local).maybeSingle(),
      admin.from('assistant_inbox_retired').select('local_part').eq('local_part', local).maybeSingle(),
    ])
    if (!a && !r) return local
  }
  return null
}

async function assistantName(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from('assistant_profiles').select('name').eq('user_id', userId).maybeSingle()
  return ((data as { name?: string | null } | null)?.name ?? '').trim() || null
}

export async function openMailbox(admin: SupabaseClient, user: User): Promise<ActionResult> {
  const { available } = await availability(admin, user)
  if (!available) return fail('not_available', 403)
  const { data: have } = await admin.from('assistant_inboxes').select('user_id').eq('user_id', user.id).maybeSingle()
  if (have) return { ok: true }
  const local = await freshLocalPart(admin, await assistantName(admin, user.id))
  if (!local) return fail('try_again', 503)
  const { error } = await admin.from('assistant_inboxes').insert({ user_id: user.id, local_part: local, enabled: true })
  // Two tabs pressing the button at once: the row is there either way.
  if (error && error.code !== '23505') return fail('try_again', 503)
  return { ok: true }
}

/** A new address; the old one stops working at once and is never given to anyone else. Mail already received stays. */
export async function rotateMailbox(admin: SupabaseClient, user: User): Promise<ActionResult> {
  const { data: box } = await admin.from('assistant_inboxes').select('local_part').eq('user_id', user.id).maybeSingle()
  const old = (box as { local_part: string } | null)?.local_part
  if (!old) return fail('no_mailbox', 404)
  const local = await freshLocalPart(admin, await assistantName(admin, user.id))
  if (!local) return fail('try_again', 503)
  const r = await admin.from('assistant_inbox_retired').upsert({ local_part: old }, { onConflict: 'local_part' })
  if (r.error) return fail('try_again', 503)
  const { error } = await admin.from('assistant_inboxes').update({ local_part: local, created_at: new Date().toISOString() }).eq('user_id', user.id)
  if (error) return fail('try_again', 503)
  return { ok: true }
}

/** Every stored object of one account's mailbox, in pages. */
async function removeAllObjects(admin: SupabaseClient, userId: string): Promise<boolean> {
  for (let guard = 0; guard < 200; guard++) {
    const { data: mails, error } = await admin.from('assistant_mail').select('id, raw_path').eq('user_id', userId).limit(100)
    if (error) return false
    const list = (mails ?? []) as { id: string; raw_path: string }[]
    if (!list.length) return true
    const { data: files } = await admin.from('assistant_mail_files').select('path').in('mail_id', list.map((m) => m.id))
    const paths = [...list.map((m) => m.raw_path), ...(((files ?? []) as { path: string }[]).map((f) => f.path))]
    const rm = await admin.storage.from(MAIL_BUCKET).remove(paths)
    if (rm.error) return false
    const del = await admin.from('assistant_mail').delete().in('id', list.map((m) => m.id))
    if (del.error) return false
  }
  return false
}

/** Close the mailbox: the address stops working, every mail, attachment and original is deleted, the sender list too. */
export async function closeMailbox(admin: SupabaseClient, user: User): Promise<ActionResult> {
  const { data: box } = await admin.from('assistant_inboxes').select('local_part').eq('user_id', user.id).maybeSingle()
  const old = (box as { local_part: string } | null)?.local_part
  if (old) {
    // Stop deliveries first, so nothing new arrives while the old mail is being removed.
    const r = await admin.from('assistant_inbox_retired').upsert({ local_part: old }, { onConflict: 'local_part' })
    if (r.error) return fail('try_again', 503)
    const d = await admin.from('assistant_inboxes').delete().eq('user_id', user.id)
    if (d.error) return fail('try_again', 503)
  }
  if (!(await removeAllObjects(admin, user.id))) return fail('partly_deleted', 500)
  await admin.from('assistant_inbox_senders').delete().eq('user_id', user.id)
  return { ok: true }
}

export async function addSender(admin: SupabaseClient, user: User, email: unknown): Promise<ActionResult> {
  const e = bareAddress(typeof email === 'string' ? email : null)
  if (!e) return fail('bad_email')
  if (e === (user.email ?? '').toLowerCase()) return { ok: true } // the login email is always allowed
  // Our own receiving domains can never be senders: a mailbox must not be able to feed another (or itself).
  if (/@(?:ai|reply)\.stayloop\.ai$/.test(e)) return fail('bad_email')
  const { count } = await admin.from('assistant_inbox_senders').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) >= MAIL_LIMITS.senders) return fail('too_many')
  const { error } = await admin.from('assistant_inbox_senders').insert({ user_id: user.id, email: e })
  if (error && error.code !== '23505') return fail('try_again', 503)
  return { ok: true }
}

export async function removeSender(admin: SupabaseClient, user: User, id: unknown): Promise<ActionResult> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return fail('bad_id')
  const { error } = await admin.from('assistant_inbox_senders').delete().eq('id', id).eq('user_id', user.id)
  return error ? fail('try_again', 503) : { ok: true }
}

// ── one mail ────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function markMail(admin: SupabaseClient, user: User, id: unknown, status: 'seen' | 'handed'): Promise<ActionResult> {
  if (typeof id !== 'string' || !UUID.test(id)) return fail('bad_id')
  // 'seen' never undoes 'handed'.
  let q = admin.from('assistant_mail').update({ status }).eq('id', id).eq('user_id', user.id)
  if (status === 'seen') q = q.eq('status', 'new')
  const { error } = await q
  return error ? fail('try_again', 503) : { ok: true }
}

export async function deleteMail(admin: SupabaseClient, user: User, id: unknown): Promise<ActionResult> {
  if (typeof id !== 'string' || !UUID.test(id)) return fail('bad_id')
  const { data: m } = await admin.from('assistant_mail').select('id, raw_path').eq('id', id).eq('user_id', user.id).maybeSingle()
  const mail = m as { id: string; raw_path: string } | null
  if (!mail) return fail('not_found', 404)
  const { data: files } = await admin.from('assistant_mail_files').select('path').eq('mail_id', mail.id)
  // Objects first: a row without its files is honest; files without a row would never be found again.
  const rm = await admin.storage.from(MAIL_BUCKET).remove([mail.raw_path, ...(((files ?? []) as { path: string }[]).map((f) => f.path))])
  if (rm.error) return fail('try_again', 503)
  const { error } = await admin.from('assistant_mail').delete().eq('id', mail.id).eq('user_id', user.id)
  return error ? fail('try_again', 503) : { ok: true }
}

/** A ten-minute link to one attachment of the caller's own mail, always served as a download. */
export async function fileLink(admin: SupabaseClient, user: User, id: unknown, idx: unknown): Promise<{ ok: true; url: string; name: string; mediaType: string } | { ok: false; error: string; status: number }> {
  if (typeof id !== 'string' || !UUID.test(id) || !Number.isInteger(idx) || (idx as number) < 0 || (idx as number) > 20) return { ok: false, error: 'bad_id', status: 400 }
  const { data } = await admin.from('assistant_mail_files').select('name, media_type, path').eq('mail_id', id).eq('user_id', user.id).eq('idx', idx as number).maybeSingle()
  const f = data as { name: string; media_type: string; path: string } | null
  if (!f) return { ok: false, error: 'not_found', status: 404 }
  const { data: signed, error } = await admin.storage.from(MAIL_BUCKET).createSignedUrl(f.path, 600, { download: f.name })
  if (error || !signed?.signedUrl) return { ok: false, error: 'try_again', status: 503 }
  return { ok: true, url: signed.signedUrl, name: f.name, mediaType: f.media_type }
}

// ── the daily sweep ─────────────────────────────────────────────────────────────

/** Delete what is past its date: storage objects first, then the rows. Returns how many mails went. */
export async function sweepExpired(admin: SupabaseClient, now: Date = new Date(), batch = 100, maxBatches = 20): Promise<{ deleted: number; failed: number }> {
  let deleted = 0
  let failed = 0
  for (let n = 0; n < maxBatches; n++) {
    const { data, error } = await admin.from('assistant_mail').select('id, raw_path').lt('expires_at', now.toISOString()).order('expires_at', { ascending: true }).range(failed, failed + batch - 1)
    if (error) { failed += 1; break }
    const list = (data ?? []) as { id: string; raw_path: string }[]
    if (!list.length) break
    const { data: files } = await admin.from('assistant_mail_files').select('path').in('mail_id', list.map((m) => m.id))
    const rm = await admin.storage.from(MAIL_BUCKET).remove([...list.map((m) => m.raw_path), ...(((files ?? []) as { path: string }[]).map((f) => f.path))])
    // Rows whose objects could not be removed are kept (and skipped past), so the next run finds them again.
    if (rm.error) { failed += list.length; continue }
    const del = await admin.from('assistant_mail').delete().in('id', list.map((m) => m.id))
    if (del.error) { failed += list.length; continue }
    deleted += list.length
  }
  return { deleted, failed }
}

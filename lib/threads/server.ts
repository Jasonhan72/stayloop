// Threads · server side (service role). Opens the thread of a matter, writes
// system / formal-copy messages, resolves the parties and notifies them.
// Never imported by client code; never imports the marketplace server (the
// marketplace imports this).
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'
import { notifyUser } from '@/lib/push/notify'
import { FORMAL_COPY_NOTE, threadHref, type MessageKind, type SenderKind, type ThreadKind } from './shared'

type Admin = SupabaseClient
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')

export type ThreadRow = { id: string; kind: ThreadKind; ref_id: string; household_id: string | null; title: string | null }

/** Get or create the thread of a matter. */
export async function ensureThread(admin: Admin, kind: ThreadKind, refId: string, opts: { householdId?: string | null; title?: string | null; createdBy?: string | null } = {}): Promise<ThreadRow | null> {
  const { data: hit } = await admin.from('threads').select('id, kind, ref_id, household_id, title').eq('kind', kind).eq('ref_id', refId).maybeSingle()
  if (hit) return hit as ThreadRow
  const { data, error } = await admin.from('threads').insert({ kind, ref_id: refId, household_id: opts.householdId ?? null, title: (opts.title || '').slice(0, 200) || null, created_by: opts.createdBy ?? null }).select('id, kind, ref_id, household_id, title').maybeSingle()
  if (error) {
    // Lost a race: read the winner.
    const { data: again } = await admin.from('threads').select('id, kind, ref_id, household_id, title').eq('kind', kind).eq('ref_id', refId).maybeSingle()
    return (again as ThreadRow | null) ?? null
  }
  return (data as ThreadRow | null) ?? null
}

export type SystemMessageInput = {
  body: string
  kind?: Extract<MessageKind, 'system' | 'formal_copy'>
  senderKind?: SenderKind
  senderId?: string | null
  actingRole?: string | null
  senderLabel?: string | null
  meta?: Record<string, unknown>
}

/** A system line or a formal-notice copy on a thread (service role; the insert guard does not touch it). Never throws. */
export async function postSystemMessage(admin: Admin, threadId: string, m: SystemMessageInput): Promise<number | null> {
  try {
    const body = (m.kind === 'formal_copy' ? `${m.body}\n\n— ${FORMAL_COPY_NOTE.zh} / ${FORMAL_COPY_NOTE.en}` : m.body).slice(0, 4000)
    const { data } = await admin.from('thread_messages').insert({
      thread_id: threadId, sender_id: m.senderId ?? null, sender_kind: m.senderKind ?? 'system', acting_role: m.actingRole ?? null, sender_label: m.senderLabel ?? null,
      kind: m.kind ?? 'system', body, meta: m.meta ?? {},
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

export type Party = { userId: string | null; email: string | null; kind: SenderKind; label: string }

/** Everyone in a thread, from the matter's own rows (never from message metadata). */
export async function threadParties(admin: Admin, t: ThreadRow): Promise<Party[]> {
  const out: Party[] = []
  const members = async (hh: string) => {
    const { data } = await admin.from('household_members').select('user_id, role').eq('household_id', hh).eq('status', 'active')
    for (const m of (data ?? []) as { user_id: string; role: string }[]) out.push({ userId: m.user_id, email: null, kind: m.role === 'landlord' || m.role === 'property_manager' ? 'landlord' : m.role === 'agent' ? 'agent' : 'tenant', label: m.role })
  }
  if (t.kind === 'tenancy') { await members(t.ref_id); return out }
  if (t.kind === 'work_order' || t.kind === 'dispute') {
    const { data: wo } = await admin.from('work_orders').select('landlord_auth_id, provider_id, external_email, external_name, household_id, token').eq('id', t.ref_id).maybeSingle()
    if (!wo) return out
    const w = wo as { landlord_auth_id: string; provider_id: string | null; external_email: string | null; external_name: string | null; household_id: string; token: string | null }
    out.push({ userId: w.landlord_auth_id, email: null, kind: 'landlord', label: 'landlord' })
    if (w.provider_id) {
      const { data: p } = await admin.from('service_providers').select('auth_id, contact_email, legal_name, trade_name').eq('id', w.provider_id).maybeSingle()
      const pr = p as { auth_id: string | null; contact_email: string | null; legal_name: string; trade_name: string | null } | null
      if (pr) out.push({ userId: pr.auth_id, email: pr.auth_id ? null : pr.contact_email, kind: 'provider', label: pr.trade_name || pr.legal_name })
    } else if (w.external_email) {
      out.push({ userId: null, email: w.external_email, kind: 'external', label: w.external_name || w.external_email })
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
    if (listing?.landlord_id) {
      const { data: ll } = await admin.from('landlords').select('id, auth_id').or(`id.eq.${listing.landlord_id},auth_id.eq.${listing.landlord_id}`).limit(1)
      const row = ((ll ?? []) as { id: string; auth_id: string | null }[])[0]
      out.push({ userId: row?.auth_id ?? listing.landlord_id, email: null, kind: 'landlord', label: 'landlord' })
    }
    if (app.email) out.push({ userId: null, email: app.email, kind: 'tenant', label: [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email })
    return out
  }
  return out
}

/** External-contact link for a work-order thread (the token is their credential). */
async function externalLink(admin: Admin, t: ThreadRow): Promise<string | null> {
  if (t.kind !== 'work_order' && t.kind !== 'dispute') return null
  const { data } = await admin.from('work_orders').select('token').eq('id', t.ref_id).maybeSingle()
  const token = (data as { token: string | null } | null)?.token
  return token ? `${SITE()}/w/${token}` : null
}

/**
 * Tell the other parties about a new message: push for account holders (their
 * own push level applies), one email for parties without an account (the
 * external contractor, an applicant). Never the sender. Never throws.
 */
export async function notifyThreadParties(admin: Admin, t: ThreadRow, opts: { exceptUserId?: string | null; exceptEmail?: string | null; preview: string; senderLabel: string }): Promise<{ pushed: number; emailed: number }> {
  let pushed = 0, emailed = 0
  try {
    const parties = await threadParties(admin, t)
    const title = `${t.title || ''}`.trim()
    const seenUsers = new Set<string>(); const seenEmails = new Set<string>()
    for (const p of parties) {
      if (p.userId) {
        if (p.userId === opts.exceptUserId || seenUsers.has(p.userId)) continue
        seenUsers.add(p.userId)
        const viewer = p.kind === 'provider' ? 'provider' : p.kind === 'landlord' ? 'landlord' : p.kind === 'agent' ? 'agent' : 'tenant'
        pushed += await notifyUser(admin, p.userId, { kind: 'event', title: `新消息 / New message · ${title}`.slice(0, 80), body: `${opts.senderLabel}: ${opts.preview}`.slice(0, 120), url: threadHref(t.kind, t.ref_id, t.household_id, viewer) })
      } else if (p.email) {
        const em = p.email.toLowerCase()
        if (em === (opts.exceptEmail || '').toLowerCase() || seenEmails.has(em)) continue
        seenEmails.add(em)
        const link = p.kind === 'external' ? await externalLink(admin, t) : p.kind === 'tenant' && t.kind === 'application' ? `${SITE()}/tenant/applications/${t.ref_id}` : SITE()
        const subject = `新消息 · ${title} / New message`
        const body = `${opts.senderLabel} 在 Stayloop 的对话里给你留了一条消息：\n\n${opts.preview}\n\n打开对话回复：\n${link || SITE()}\n\n${opts.senderLabel} left you a message on Stayloop:\n\n${opts.preview}\n\nOpen the thread to reply:\n${link || SITE()}`
        const { html, text } = renderAgentMessageEmail({ subject, body })
        const r = await sendEmail({ to: p.email, subject, html, text })
        if (r.ok) emailed++
      }
    }
  } catch (e) {
    console.warn('[threads] notify failed:', (e as Error).message)
  }
  return { pushed, emailed }
}

/** The audit matter of a thread. */
export function threadMatter(t: Pick<ThreadRow, 'kind' | 'ref_id'>): { matterType: string; matterId: string } {
  return { matterType: t.kind === 'tenancy' ? 'household' : t.kind === 'dispute' ? 'work_order' : t.kind, matterId: t.ref_id }
}

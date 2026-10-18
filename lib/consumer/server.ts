// Server-side glue for the consumer file routes (V0.8, G19). Service-role
// Supabase only — nothing here is imported by a page. The pure pieces live in
// match.ts / pack.ts / render.ts / alerts.ts; this file loads rows, mints and
// checks tokens, finds admins, writes audit rows.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addBusinessDays } from './businessDays'
import { sendEmail } from '@/lib/email'
import { activeAlertFor } from './alerts'
import { classify, dobMatches, findCandidateScreenings, nameMatches, type CandidateCheck } from './match'
import { PACK_SCREENING_COLUMNS, type BuildPackInput, type PackApplicationRow, type PackScreeningRow } from './pack'
import type { ConsumerAlert, ConsumerDispute, ConsumerLang, ConsumerRequest, PackRecipient, PackViewer, ScreeningCorrection } from './types'

export const CONSUMER_TOKEN_RE = /^[a-f0-9]{64}$/
export const TOKEN_HOURS = 24
export const DUE_BUSINESS_DAYS = 2
export const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } as const
const THREE_YEARS_MS = 3 * 365.25 * 86_400_000
const ONE_YEAR_MS = 365.25 * 86_400_000

export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** IP never stored in clear: sha256, first 16 hex. */
export async function hashIp(ip: string): Promise<string> {
  return (await sha256Hex(ip || 'anon')).slice(0, 16)
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
}

export function makeToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Byte-by-byte comparison that does not short-circuit on the first difference. */
export function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export function normalizeEmail(v: unknown): string | null {
  const e = String(v ?? '').trim().toLowerCase()
  if (e.length < 3 || e.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  return e
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const head = local.slice(0, Math.min(2, local.length))
  return `${head}${'*'.repeat(Math.max(1, local.length - head.length))}@${domain}`
}

export function langOf(v: unknown): ConsumerLang {
  return v === 'en' ? 'en' : 'zh'
}

const REQUEST_COLUMNS = 'id, email, token, token_expires_at, email_verified_at, name, date_of_birth, delivery, mail_address, phone, status, matched_screening_ids, candidate_screening_ids, due_at, fulfilled_at, closed_at, admin_note, handled_by, ip_hash, lang, created_at, updated_at'

/** The request behind a token: format check → one indexed lookup → constant-time compare → expiry. */
export async function loadRequestByToken(admin: SupabaseClient, token: string): Promise<ConsumerRequest | null> {
  if (!CONSUMER_TOKEN_RE.test(token)) return null
  const { data } = await admin.from('consumer_requests').select(REQUEST_COLUMNS).eq('token', token).maybeSingle()
  const row = data as ConsumerRequest | null
  if (!row || !constantTimeEqual(row.token, token)) return null
  if (new Date(row.token_expires_at).getTime() <= Date.now()) return null
  if (row.status === 'closed') return null
  return row
}

export async function audit(admin: SupabaseClient, action: string, request: Pick<ConsumerRequest, 'id'>, metadata: Record<string, unknown> = {}, targetType = 'consumer_request'): Promise<void> {
  await admin.from('agent_audit_events').insert({ actor_id: request.id, actor_type: 'system', action, target_type: targetType, target_id: request.id, metadata }).then(() => undefined, () => undefined)
}

export async function adminEmails(admin: SupabaseClient): Promise<string[]> {
  const { data: admins } = await admin.from('admin_users').select('user_id')
  const out: string[] = []
  for (const a of (admins ?? []) as { user_id: string }[]) {
    const { data } = await admin.auth.admin.getUserById(a.user_id)
    if (data?.user?.email) out.push(data.user.email)
  }
  return out
}

/** One email per admin (site test 2026-10-17, N-D1): Resend suppresses a whole message when any
 *  recipient is on its suppression list, so a shared To: line let one bounced inbox silence the alert
 *  that starts a s.12 / s.13 clock for everyone. */
export async function sendAdminAlert(to: string[], mail: { subject: string; html: string; text: string }): Promise<void> {
  await Promise.all(Array.from(new Set(to)).map((addr) => sendEmail({ to: addr, subject: mail.subject, html: mail.html, text: mail.text, fromName: 'Stayloop' }).catch(() => undefined)))
}

// ── matching ──────────────────────────────────────────────────────────────────

export type MatchOutcome = { status: 'matched' | 'needs_review'; matched: string[]; candidates: string[]; checks: CandidateCheck[] }

/** Run the email-chain lookup + name / DOB comparison for a request (the request row already holds name / DOB). */
export async function runMatch(admin: SupabaseClient, request: Pick<ConsumerRequest, 'email' | 'name' | 'date_of_birth'>): Promise<MatchOutcome> {
  const cands = await findCandidateScreenings(admin, request.email)
  if (!cands.length) return { status: 'needs_review', matched: [], candidates: [], checks: [] }
  const ids = cands.map((c) => c.screening_id)
  const { data: rows } = await admin.from('screenings').select('id, tenant_name, ai_extracted_name, application_id').in('id', ids)
  const appIds = Array.from(new Set(((rows ?? []) as { application_id: string | null }[]).map((r) => r.application_id).filter((x): x is string => !!x)))
  const apps = new Map<string, { first_name: string | null; last_name: string | null; date_of_birth: string | null }>()
  if (appIds.length) {
    const { data: a } = await admin.from('applications').select('id, first_name, last_name, date_of_birth').in('id', appIds)
    for (const r of (a ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; date_of_birth: string | null }>) apps.set(r.id, r)
  }
  const checks: CandidateCheck[] = ((rows ?? []) as Array<{ id: string; tenant_name: string | null; ai_extracted_name: string | null; application_id: string | null }>).map((r) => {
    const app = r.application_id ? apps.get(r.application_id) : undefined
    const name_ok = nameMatches(request.name, { tenant_name: r.tenant_name, ai_extracted_name: r.ai_extracted_name, first_name: app?.first_name, last_name: app?.last_name })
    const dob_ok = app?.date_of_birth && request.date_of_birth ? dobMatches(request.date_of_birth, app.date_of_birth) : null
    return { screening_id: r.id, name_ok, dob_ok }
  })
  const c = classify(checks)
  return { status: c.status, matched: c.matched, candidates: ids, checks }
}

// ── summaries (GET /request/<token> and the admin queue) ──────────────────────

export type ScreeningSummary = { screening_id: string; created_at: string; landlord_name: string | null; property: string | null }

async function landlordRows(admin: SupabaseClient, landlordIds: string[]): Promise<Map<string, { full_name: string | null; email: string | null; phone: string | null }>> {
  const out = new Map<string, { full_name: string | null; email: string | null; phone: string | null }>()
  const ids = Array.from(new Set(landlordIds.filter(Boolean)))
  if (!ids.length) return out
  const { data } = await admin.from('landlords').select('id, auth_id, full_name, email, phone').or(`id.in.(${ids.join(',')}),auth_id.in.(${ids.join(',')})`)
  for (const l of (data ?? []) as Array<{ id: string; auth_id: string | null; full_name: string | null; email: string | null; phone: string | null }>) {
    const v = { full_name: l.full_name, email: l.email, phone: l.phone }
    out.set(l.id, v)
    if (l.auth_id) out.set(l.auth_id, v)
  }
  // Screenings run by an agent (intake link / delegated) carry the agent's authId — fall back to the RECO registrant.
  const missing = ids.filter((i) => !out.has(i))
  if (missing.length) {
    const { data: ag } = await admin.from('agent_profiles').select('auth_id, legal_name, business_email, business_phone').in('auth_id', missing)
    for (const a of (ag ?? []) as Array<{ auth_id: string; legal_name: string | null; business_email: string | null; business_phone: string | null }>) out.set(a.auth_id, { full_name: a.legal_name, email: a.business_email, phone: a.business_phone })
  }
  return out
}

export async function screeningSummaries(admin: SupabaseClient, ids: string[]): Promise<ScreeningSummary[]> {
  if (!ids.length) return []
  const { data } = await admin.from('screenings').select('id, created_at, landlord_id, notes, application_id').in('id', ids).order('created_at', { ascending: false })
  const rows = (data ?? []) as Array<{ id: string; created_at: string; landlord_id: string | null; notes: string | null; application_id: string | null }>
  const lls = await landlordRows(admin, rows.map((r) => r.landlord_id ?? ''))
  const appIds = rows.map((r) => r.application_id).filter((x): x is string => !!x)
  const props = new Map<string, string>()
  if (appIds.length) {
    const { data: apps } = await admin.from('applications').select('id, listing:listings(address, unit, city)').in('id', appIds)
    for (const a of (apps ?? []) as Array<{ id: string; listing: { address?: string; unit?: string | null; city?: string | null } | Array<{ address?: string; unit?: string | null; city?: string | null }> | null }>) {
      const l = Array.isArray(a.listing) ? a.listing[0] : a.listing
      if (l?.address) props.set(a.id, `${l.address}${l.unit ? ` #${l.unit}` : ''}${l.city ? `, ${l.city}` : ''}`)
    }
  }
  return rows.map((r) => ({
    screening_id: r.id,
    created_at: r.created_at,
    landlord_name: (r.landlord_id && lls.get(r.landlord_id)?.full_name) || null,
    property: (r.application_id && props.get(r.application_id)) || (/^Listing:\s*(.+)$/m.exec(r.notes ?? '')?.[1]?.trim().slice(0, 200) ?? null),
  }))
}

export async function disputesFor(admin: SupabaseClient, requestId: string): Promise<ConsumerDispute[]> {
  const { data } = await admin.from('consumer_disputes').select('id, request_id, screening_id, item_kind, item_ref, item_label, statement, evidence_path, status, resolution_note, resolved_by, resolved_at, notified_at, notified_to, created_at').eq('request_id', requestId).order('created_at', { ascending: false })
  return (data ?? []) as ConsumerDispute[]
}

/** Public view of a dispute (no resolver id). */
export function disputePublic(d: ConsumerDispute) {
  return { id: d.id, screening_id: d.screening_id, item_kind: d.item_kind, item_ref: d.item_ref, item_label: d.item_label, statement: d.statement, status: d.status, resolution_note: d.resolution_note, resolved_at: d.resolved_at, notified_at: d.notified_at, created_at: d.created_at }
}

export function dueAtFor(created: Date): string {
  return addBusinessDays(created, DUE_BUSINESS_DAYS).toISOString()
}

// ── pack inputs ───────────────────────────────────────────────────────────────

export async function loadPackInputs(admin: SupabaseClient, request: ConsumerRequest, lang: ConsumerLang, alerts: ConsumerAlert[]): Promise<BuildPackInput> {
  const ids = request.matched_screening_ids ?? []
  const now = new Date()
  if (!ids.length) return { request, screenings: [], applications: [], verifications: [], corrections: [], viewers: [], recipients: [], alerts, lang, now }
  const { data: scr } = await admin.from('screenings').select(PACK_SCREENING_COLUMNS).in('id', ids)
  const screenings = (scr ?? []) as unknown as (PackScreeningRow & { delegation_id?: string | null; partner_key_id?: string | null })[]
  const lls = await landlordRows(admin, screenings.map((s) => s.landlord_id ?? ''))
  for (const s of screenings) s.landlord = s.landlord_id ? lls.get(s.landlord_id) ?? null : null

  const appIds = Array.from(new Set(screenings.map((s) => s.application_id).filter((x): x is string => !!x)))
  let applications: PackApplicationRow[] = []
  if (appIds.length) {
    const { data: apps } = await admin.from('applications').select('id, first_name, last_name, date_of_birth, listing:listings(address, unit, city)').in('id', appIds)
    applications = ((apps ?? []) as Array<Record<string, unknown>>).map((a) => ({ id: a.id as string, first_name: (a.first_name as string) ?? null, last_name: (a.last_name as string) ?? null, date_of_birth: (a.date_of_birth as string) ?? null, listing: (Array.isArray(a.listing) ? a.listing[0] : a.listing) as PackApplicationRow['listing'] }))
  }
  const { data: vr } = await admin.from('verification_requests').select('screening_id, steps, updated_at').in('screening_id', ids)
  const verifications = (vr ?? []) as BuildPackInput['verifications']
  const { data: corr } = await admin.from('screening_corrections').select('id, screening_id, dispute_id, item_kind, item_ref, item_label, action, note, created_by, created_at').in('screening_id', ids).order('created_at', { ascending: true })
  const corrections = (corr ?? []) as ScreeningCorrection[]

  // ── viewers (3 years) ──
  const viewers: PackViewer[] = []
  const recipients: PackRecipient[] = []
  const since3y = new Date(now.getTime() - THREE_YEARS_MS).toISOString()
  const since1y = now.getTime() - ONE_YEAR_MS
  for (const s of screenings) {
    const receivedAt = s.scored_at ?? s.created_at
    const ll = s.landlord
    viewers.push({ name: ll?.full_name || (lang === 'zh' ? '筛查房东' : 'Screening landlord'), role: 'landlord', phone: ll?.phone ?? null, email: ll?.email ?? null, when: receivedAt, what: lang === 'zh' ? '筛查报告' : 'screening report' })
    if (new Date(receivedAt).getTime() >= since1y) recipients.push({ name: ll?.full_name || (lang === 'zh' ? '筛查房东' : 'Screening landlord'), role: 'landlord', phone: ll?.phone ?? null, email: ll?.email ?? null, received_at: receivedAt, screening_id: s.id })
  }
  // Delegated agents: the screening landlord_id IS the agent; the principal is the client who can read it.
  const delIds = screenings.map((s) => s.delegation_id).filter((x): x is string => !!x)
  if (delIds.length) {
    const { data: dels } = await admin.from('delegations').select('id, principal_name, principal_email, confirmed_at, status').in('id', delIds)
    for (const d of (dels ?? []) as Array<{ id: string; principal_name: string | null; principal_email: string; confirmed_at: string | null; status: string }>) {
      for (const s of screenings.filter((x) => x.delegation_id === d.id)) {
        const at = s.scored_at ?? s.created_at
        if (new Date(at).getTime() >= since1y) recipients.push({ name: d.principal_name || d.principal_email, role: 'principal', phone: null, email: d.principal_email, received_at: at, screening_id: s.id })
      }
    }
  }
  const partnerIds = screenings.map((s) => s.partner_key_id).filter((x): x is string => !!x)
  if (partnerIds.length) {
    const { data: keys } = await admin.from('trust_api_keys').select('id, partner_name').in('id', partnerIds)
    for (const k of (keys ?? []) as Array<{ id: string; partner_name: string }>) {
      for (const s of screenings.filter((x) => x.partner_key_id === k.id)) {
        const at = s.scored_at ?? s.created_at
        viewers.push({ name: k.partner_name, role: 'partner', phone: null, email: null, when: at, what: lang === 'zh' ? '筛查（合作方接口）' : 'screening (partner API)' })
        if (new Date(at).getTime() >= since1y) recipients.push({ name: k.partner_name, role: 'partner', phone: null, email: null, received_at: at, screening_id: s.id })
      }
    }
  }
  // Application files opened / downloaded by the landlord.
  if (appIds.length) {
    const { data: ev } = await admin.from('agent_audit_events').select('actor_id, action, created_at, metadata').in('action', ['application_file_viewed', 'application_file_downloaded']).in('target_id', appIds).gte('created_at', since3y).limit(500)
    const actorIds = Array.from(new Set(((ev ?? []) as Array<{ actor_id: string | null }>).map((e) => e.actor_id).filter((x): x is string => !!x)))
    const actors = await landlordRows(admin, actorIds)
    for (const e of (ev ?? []) as Array<{ actor_id: string | null; action: string; created_at: string; metadata: { file?: string } | null }>) {
      const a = e.actor_id ? actors.get(e.actor_id) : undefined
      viewers.push({ name: a?.full_name || (lang === 'zh' ? '房东' : 'Landlord'), role: 'landlord', phone: a?.phone ?? null, email: a?.email ?? null, when: e.created_at, what: `${e.action === 'application_file_downloaded' ? (lang === 'zh' ? '下载申请材料' : 'downloaded application file') : (lang === 'zh' ? '查看申请材料' : 'viewed application file')}${e.metadata?.file ? ` · ${e.metadata.file}` : ''}` })
    }
  }
  // Passport: partner API checks and share-link opens for accounts on this email.
  const { data: tenants } = await admin.from('tenants').select('auth_id').ilike('email', request.email.replace(/[\\%_]/g, (m) => `\\${m}`)).limit(5)
  const uids = Array.from(new Set(((tenants ?? []) as Array<{ auth_id: string | null }>).map((t) => t.auth_id).filter((x): x is string => !!x)))
  if (uids.length) {
    const { data: pv } = await admin.from('agent_audit_events').select('created_at, metadata').eq('action', 'trust_api_passport_verify').in('actor_id', uids).gte('created_at', since3y).limit(200)
    for (const e of (pv ?? []) as Array<{ created_at: string; metadata: { partner_name?: string; scopes?: string[] } | null }>) viewers.push({ name: e.metadata?.partner_name || 'API partner', role: 'partner', phone: null, email: null, when: e.created_at, what: `${lang === 'zh' ? '护照核验（接口）' : 'passport check (API)'}${e.metadata?.scopes?.length ? ` · ${e.metadata.scopes.join(', ')}` : ''}` })
    const { data: toks } = await admin.from('passport_share_tokens').select('token').in('tenant_user_id', uids).limit(50)
    const tokens = ((toks ?? []) as Array<{ token: string }>).map((t) => t.token)
    if (tokens.length) {
      const { data: views } = await admin.from('passport_share_views').select('viewed_at').in('token', tokens).gte('viewed_at', since3y).order('viewed_at', { ascending: false }).limit(500)
      for (const v of (views ?? []) as Array<{ viewed_at: string }>) viewers.push({ name: lang === 'zh' ? '分享链接被打开（匿名）' : 'Share link opened (anonymous)', role: 'share_link', phone: null, email: null, when: v.viewed_at, what: lang === 'zh' ? '护照分享页' : 'passport share page' })
    }
  }
  return { request, screenings, applications, verifications, corrections, viewers, recipients, alerts, lang, now }
}

// ── the applicant-facing view (GET /request/<token> and the verify response) ──

export async function requestView(admin: SupabaseClient, request: ConsumerRequest) {
  const [matched, disputes, alert] = await Promise.all([
    screeningSummaries(admin, request.matched_screening_ids ?? []),
    disputesFor(admin, request.id),
    activeAlertFor(admin, request.email),
  ])
  return {
    status: request.status,
    email_masked: maskEmail(request.email),
    name: request.name,
    delivery: request.delivery,
    due_at: request.due_at,
    email_verified: !!request.email_verified_at,
    fulfilled_at: request.fulfilled_at,
    lang: request.lang,
    matched,
    disputes: disputes.map(disputePublic),
    alert: alert ? { statement: alert.statement, created_at: alert.created_at, expires_at: alert.expires_at } : null,
    pack_available: (request.status === 'matched' || request.status === 'fulfilled') && !!request.email_verified_at,
  }
}

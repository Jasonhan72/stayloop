// POST /api/matters/export { matter_id, lang?, acting_role? } — the evidence
// pack of one rental matter as printable HTML (节点 6 「可收口」, 2026-09-27).
// The caller must be a party (matter_party through their own JWT); the server
// gathers the record with the service role, renders it (lib/export/evidencePack,
// no scores), fingerprints the structured record and writes an audit row that
// carries the matter and the hat. Attachments are listed by name / size /
// SHA-256 only — the files themselves stay behind the audited signed-URL route.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { canonicalJson, renderEvidencePack, type EvidencePackData, type PackMessage, type PackThread, type PackWorkOrder } from '@/lib/export/evidencePack'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i
const HATS = new Set(['tenant', 'landlord', 'agent', 'provider', 'admin'])
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: { matter_id?: string; lang?: string; acting_role?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const mid = String(body.matter_id || '')
  if (!UUID.test(mid)) return NextResponse.json({ error: 'matter_id required' }, { status: 400 })
  if (!(await underHourlyLimit(`matter-export:${ud.user.id}`, 20, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const { data: party } = await sb.rpc('matter_party', { p_matter: mid })
  if (!party) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })
  const lang: 'zh' | 'en' = body.lang === 'en' ? 'en' : 'zh'

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: matter } = await admin.from('rental_matters').select('id, address, unit, landlord_auth_id, tenant_auth_id, tenant_email, created_at').eq('id', mid).maybeSingle()
  if (!matter) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const M = matter as { id: string; address: string | null; unit: string | null; landlord_auth_id: string; tenant_auth_id: string | null; tenant_email: string | null; created_at: string }
  const { data: links } = await admin.from('rental_matter_links').select('kind, ref_id').eq('matter_id', mid)
  const ids = (k: string) => ((links ?? []) as { kind: string; ref_id: string }[]).filter((l) => l.kind === k).map((l) => l.ref_id)

  // People are named by email domain-safe labels: the parties already know each other; the pack names them as the platform does.
  const emailOf = async (uid: string | null): Promise<string> => { if (!uid) return '—'; const { data } = await admin.auth.admin.getUserById(uid); return data?.user?.email ?? uid.slice(0, 8) }
  const landlordLabel = await emailOf(M.landlord_auth_id)
  const tenantLabel = M.tenant_auth_id ? await emailOf(M.tenant_auth_id) : M.tenant_email

  const [{ data: apps }, { data: scr }, { data: leases }, { data: hhs }, { data: wos }, { data: threads }, { data: audit }, { data: delegs }] = await Promise.all([
    ids('application').length ? admin.from('applications').select('id, first_name, last_name, email, status, created_at, decision_notified_at, decision_reason').in('id', ids('application')) : Promise.resolve({ data: [] }),
    ids('screening').length ? admin.from('screenings').select('id, status, created_at').in('id', ids('screening')) : Promise.resolve({ data: [] }),
    ids('lease').length ? admin.from('lease_documents').select('id, status, start_date, end_date, monthly_rent, sent_at, signed_at').in('id', ids('lease')) : Promise.resolve({ data: [] }),
    ids('household').length ? admin.from('households').select('id, verified, status, current_lease_id').in('id', ids('household')) : Promise.resolve({ data: [] }),
    ids('work_order').length ? admin.from('work_orders').select('*').in('id', ids('work_order')).order('created_at') : Promise.resolve({ data: [] }),
    admin.from('threads').select('id, kind, title, created_at').eq('matter_id', mid).order('created_at'),
    admin.from('agent_audit_events').select('created_at, action, actor_id, actor_type, acting_role, delegation_id, matter_type, matter_id, rental_matter_id').or(`rental_matter_id.eq.${mid}${ids('work_order').length || ids('application').length || ids('lease').length || ids('household').length ? `,matter_id.in.(${[...ids('work_order'), ...ids('application'), ...ids('lease'), ...ids('household')].join(',')})` : ''}`).order('created_at', { ascending: true }).limit(500),
    admin.from('delegations').select('id, principal_auth_id, principal_email, principal_name, delegate_auth_id, scope, allowed_actions, status, confirmed_at, revoked_at, expires_at, basis_version').or(`principal_auth_id.eq.${M.landlord_auth_id}${M.tenant_auth_id ? `,principal_auth_id.eq.${M.tenant_auth_id}` : ''}${M.tenant_email ? `,principal_email.eq.${M.tenant_email.toLowerCase()}` : ''}`),
  ])

  // Threads with every message (retractions folded onto their target, never dropped).
  const threadRows = (threads ?? []) as { id: string; kind: string; title: string | null; created_at: string }[]
  const packThreads: PackThread[] = []
  for (const t of threadRows) {
    const { data: msgs } = await admin.from('thread_messages').select('id, created_at, sender_kind, acting_role, sender_label, kind, body, ref_message_id, attachments').eq('thread_id', t.id).order('id').limit(1000)
    const list = (msgs ?? []) as { id: number; created_at: string; sender_kind: string; acting_role: string | null; sender_label: string | null; kind: string; body: string; ref_message_id: number | null; attachments: PackMessage['attachments'] }[]
    const retracted = new Map<number, string>()
    for (const x of list) if (x.kind === 'retraction' && x.ref_message_id != null) retracted.set(x.ref_message_id, x.created_at)
    packThreads.push({ id: t.id, kind: t.kind, title: t.title, created_at: t.created_at, messages: list.filter((x) => x.kind !== 'retraction').map((x) => ({ id: x.id, created_at: x.created_at, sender_kind: x.sender_kind, acting_role: x.acting_role, sender_label: x.sender_label, kind: x.kind, body: x.body, retracted_at: retracted.get(x.id) ?? null, attachments: (x.attachments || []).map((a) => ({ name: a.name, size: a.size, sha256: a.sha256, path: a.path })) })) })
  }
  // Work orders with their event log and a contractor label.
  const woRows = (wos ?? []) as Record<string, unknown>[]
  const providerIds = Array.from(new Set(woRows.map((w) => w.provider_id).filter(Boolean))) as string[]
  const { data: provs } = providerIds.length ? await admin.from('service_providers').select('id, legal_name, trade_name').in('id', providerIds) : { data: [] }
  const provName = new Map(((provs ?? []) as { id: string; legal_name: string; trade_name: string | null }[]).map((p) => [p.id, p.trade_name || p.legal_name]))
  const packWos: PackWorkOrder[] = []
  for (const w of woRows) {
    const { data: ev } = await admin.from('work_order_events').select('created_at, actor_kind, event, payload').eq('work_order_id', w.id as string).order('id')
    packWos.push({
      id: w.id as string, status: w.status as string, trade: (w.trade as string) ?? null, scope: (w.scope as string) ?? null, emergency: !!w.emergency,
      contractor: w.provider_id ? provName.get(w.provider_id as string) ?? 'provider' : ((w.external_name as string) || (w.external_email as string) || 'contractor'),
      quote_amount: (w.quote_amount as number) ?? null, quote_version: (w.quote_version as number) ?? null, approved_amount: (w.approved_amount as number) ?? null, invoice_amount: (w.invoice_amount as number) ?? null,
      created_at: w.created_at as string, quoted_at: (w.quoted_at as string) ?? null, approved_at: (w.approved_at as string) ?? null, arrived_at: (w.arrived_at as string) ?? null, completed_at: (w.completed_at as string) ?? null, accepted_at: (w.accepted_at as string) ?? null, paid_at: (w.paid_at as string) ?? null,
      decline_code: (w.decline_code as string) ?? null, cancel_reason: (w.cancel_reason as string) ?? null,
      events: ((ev ?? []) as { created_at: string; actor_kind: string; event: string; payload: Record<string, unknown> }[]),
    })
  }
  const hh = ((hhs ?? []) as { id: string; verified: boolean | null; status: string | null; current_lease_id: string | null }[])[0] ?? null
  const { data: rent } = hh?.current_lease_id ? await admin.from('rent_payments').select('due_date, status, paid_at, amount').eq('lease_id', hh.current_lease_id).order('due_date') : { data: [] }
  const app = ((apps ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null; status: string | null; created_at: string; decision_notified_at: string | null; decision_reason: string | null }[])[0] ?? null
  const lease = ((leases ?? []) as { id: string; status: string | null; start_date: string | null; end_date: string | null; monthly_rent: number | null; sent_at: string | null; signed_at: string | null }[])[0] ?? null
  const screening = ((scr ?? []) as { id: string; status: string | null; created_at: string }[])[0] ?? null
  // Actor labels for the audit table (few distinct actors; resolve once each).
  const auditRows = (audit ?? []) as { created_at: string; action: string; actor_id: string | null; actor_type: string | null; acting_role: string | null; delegation_id: string | null }[]
  const actorCache = new Map<string, string>()
  const actorLabel = async (r: typeof auditRows[number]) => { if (!r.actor_id) return r.actor_type || '—'; if (!actorCache.has(r.actor_id)) actorCache.set(r.actor_id, await emailOf(r.actor_id)); return actorCache.get(r.actor_id)! }
  const packAudit = [] as EvidencePackData['audit']
  for (const r of auditRows.filter((r) => !/session|turn$|thread_/.test(r.action)).slice(-300)) packAudit.push({ created_at: r.created_at, action: r.action, actor: await actorLabel(r), acting_role: r.acting_role, delegation_id: r.delegation_id })
  const delegRows = (delegs ?? []) as { id: string; principal_auth_id: string | null; principal_email: string; principal_name: string | null; delegate_auth_id: string; scope: string[]; allowed_actions: string[]; status: string; confirmed_at: string | null; revoked_at: string | null; expires_at: string; basis_version: string }[]
  const agentIds = Array.from(new Set(delegRows.map((d) => d.delegate_auth_id)))
  const { data: agents } = agentIds.length ? await admin.from('agent_profiles').select('auth_id, legal_name, reco_number').in('auth_id', agentIds) : { data: [] }
  const agentName = new Map(((agents ?? []) as { auth_id: string; legal_name: string; reco_number: string }[]).map((a) => [a.auth_id, `${a.legal_name} · RECO #${a.reco_number}`]))

  const data: EvidencePackData = {
    matter: { id: M.id, address: M.address, unit: M.unit, created_at: M.created_at },
    parties: { landlord: landlordLabel, tenant: tenantLabel },
    application: app ? { id: app.id, applicant: [app.first_name, app.last_name].filter(Boolean).join(' ') || app.email || '—', status: app.status, created_at: app.created_at, decision_notified_at: app.decision_notified_at, decision_reason: app.decision_reason } : null,
    screening: screening ? { id: screening.id, status: screening.status, created_at: screening.created_at } : null,
    lease: lease ? { id: lease.id, status: lease.status, start_date: lease.start_date, end_date: lease.end_date, monthly_rent: lease.monthly_rent, sent_at: lease.sent_at, signed_at: lease.signed_at } : null,
    household: hh ? { id: hh.id, verified: hh.verified, status: hh.status, rent: ((rent ?? []) as { due_date: string; status: string | null; paid_at: string | null; amount: number | null }[]) } : null,
    work_orders: packWos,
    threads: packThreads,
    audit: packAudit,
    delegations: delegRows.map((d) => ({ id: d.id, principal: d.principal_name || d.principal_email, delegate: agentName.get(d.delegate_auth_id) || d.delegate_auth_id.slice(0, 8), scope: d.scope, allowed_actions: d.allowed_actions, status: d.status, confirmed_at: d.confirmed_at, revoked_at: d.revoked_at, expires_at: d.expires_at, basis_version: d.basis_version })),
  }
  const fingerprint = await sha256Hex(canonicalJson(data))
  const generatedAt = new Date().toISOString()
  const actingRole = HATS.has(String(body.acting_role)) ? String(body.acting_role) : String(party)
  const html = renderEvidencePack(data, { lang, generatedAt, generatedBy: `${ud.user.email ?? ud.user.id.slice(0, 8)} (${actingRole})`, fingerprint, siteUrl: SITE() })
  await admin.from('agent_audit_events').insert({
    actor_id: ud.user.id, actor_type: 'user', action: 'matter_export_generated', target_type: 'rental_matter', target_id: mid, acting_role: actingRole, rental_matter_id: mid,
    metadata: { fingerprint, threads: packThreads.length, messages: packThreads.reduce((n, t) => n + t.messages.length, 0), attachments: packThreads.reduce((n, t) => n + t.messages.reduce((k, x) => k + x.attachments.length, 0), 0), work_orders: packWos.length, audit_rows: packAudit.length, lang },
  }).then(() => undefined, () => undefined)
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Fingerprint': fingerprint } })
}

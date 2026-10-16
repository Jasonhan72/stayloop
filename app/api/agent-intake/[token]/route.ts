// /api/agent-intake/[token] — the applicant's side of an agent intake link
// (V1.0 阶段 2 · 丙 #13, 2026-10-16). Public, by token.
//   GET  → who issued the link (registered name · category · brokerage · RECO # —
//          O. Reg. 567/05 s.12.1), the unit label, whether the link is live, and
//          whether public-record lookups would run (CRA_MODE).
//   POST → the submission: name / email / move-in + the files already uploaded
//          under tenant-files/agent-intake/<link_id>/<kind>/… + the versioned
//          authorisation. Writes agent_intake_submissions (service role only) and
//          creates the screening under the AGENT's authId with the same manifest
//          shape /api/screening/from-application uses; the agent is emailed and
//          pushed. A live delegation that allows 'screen' for the link's client is
//          recorded on the screening so the landlord client can read it.
// Rate limit: 10 submissions per IP per hour, fail-closed (it sends mail).
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'
import { notifyUser } from '@/lib/push/notify'
import { personalRecordLookupsAllowed } from '@/lib/compliance/craMode'
import { categoryLabel, type AgentCategory } from '@/lib/agentProfile'
import {
  AGENT_INTAKE_CONSENT_VERSION, INTAKE_TOKEN_RE, intakeLinkState, intakeScreeningHref, intakeScreeningNotes, validateIntakeSubmission,
  type IntakeManifestFile,
} from '@/lib/agent/intakeLinks'

export const runtime = 'edge'

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')
const NO_STORE = { 'Cache-Control': 'no-store' }
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

type LinkRow = { id: string; agent_auth_id: string; client_id: string | null; label: string | null; expires_at: string; revoked_at: string | null; used_count: number }
type AgentRow = { legal_name: string; reco_number: string; brokerage_name: string; category: AgentCategory; status: string; expires_at: string | null }

async function lookup(a: SupabaseClient, token: string): Promise<{ link: LinkRow; agent: AgentRow | null } | null> {
  const { data: l } = await a.from('agent_intake_links').select('id, agent_auth_id, client_id, label, expires_at, revoked_at, used_count').eq('token', token).maybeSingle()
  if (!l) return null
  const link = l as LinkRow
  const { data: p } = await a.from('agent_profiles').select('legal_name, reco_number, brokerage_name, category, status, expires_at').eq('auth_id', link.agent_auth_id).maybeSingle()
  return { link, agent: (p as AgentRow | null) ?? null }
}

/** Live link AND an agent whose RECO registration is still live: a revoked registration stops intake too. */
function usable(v: { link: LinkRow; agent: AgentRow | null }, now = new Date()): 'ok' | 'revoked' | 'expired' | 'agent_not_live' {
  const st = intakeLinkState(v.link, now)
  if (st !== 'active') return st
  const a = v.agent
  if (!a || !(a.status === 'verified' || a.status === 'renewal_due') || (a.expires_at && a.expires_at < now.toISOString().slice(0, 10))) return 'agent_not_live'
  return 'ok'
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!INTAKE_TOKEN_RE.test(token)) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  const v = await lookup(admin(), token)
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  const state = usable(v)
  const a = v.agent
  return NextResponse.json({
    state,
    link: { id: v.link.id, label: v.link.label, expires_at: v.link.expires_at },
    agent: a ? { legal_name: a.legal_name, reco_number: a.reco_number, brokerage_name: a.brokerage_name, category: a.category, category_zh: categoryLabel(a.category, 'zh'), category_en: categoryLabel(a.category, 'en') } : null,
    consent_version: AGENT_INTAKE_CONSENT_VERSION,
    // CRA_MODE=tool: no public-record lookups about the applicant — the page's consent text says so.
    personal_record_lookups: personalRecordLookupsAllowed(),
  }, { status: state === 'ok' ? 200 : 410, headers: NO_STORE })
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!INTAKE_TOKEN_RE.test(token)) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  const ip = req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon'
  if (!(await underHourlyLimit(`agent-intake-submit:${ip}`, 10, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400, headers: NO_STORE }) }

  const a = admin()
  const v = await lookup(a, token)
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  const state = usable(v)
  if (state !== 'ok') return NextResponse.json({ error: state }, { status: 410, headers: NO_STORE })
  const parsed = validateIntakeSubmission(body, v.link.id)
  if (!parsed.ok) return NextResponse.json({ error: `invalid_${parsed.reason}` }, { status: 400, headers: NO_STORE })
  const sub = parsed.value

  // Only files that actually landed in the bucket under this link's folder count (the manifest is client-supplied).
  const present: IntakeManifestFile[] = []
  for (const kind of Array.from(new Set(sub.files.map((f) => f.kind)))) {
    const { data: objs } = await a.storage.from('tenant-files').list(`agent-intake/${v.link.id}/${kind}`, { limit: 200 })
    const names = new Set(((objs ?? []) as { name: string }[]).map((o) => o.name))
    for (const f of sub.files) if (f.kind === kind && names.has(f.path.split('/').pop() || '')) present.push(f)
  }
  if (!present.length) return NextResponse.json({ error: 'no_documents' }, { status: 422, headers: NO_STORE })

  const lookupsAllowed = personalRecordLookupsAllowed()
  const { data: subRow, error: subErr } = await a.from('agent_intake_submissions').insert({
    link_id: v.link.id, applicant_name: sub.applicant_name, applicant_email: sub.applicant_email, move_in_date: sub.move_in_date,
    consent_version: sub.consent_version, consent_at: new Date().toISOString(), consent_name: sub.consent_name, files: present,
  }).select('id').maybeSingle()
  if (subErr || !subRow) return NextResponse.json({ error: subErr?.message || 'insert failed' }, { status: 500, headers: NO_STORE })

  // A live delegation (client confirmed, allows screening) makes the landlord client a reader of the report.
  let delegationId: string | null = null
  if (v.link.client_id) {
    const { data: d } = await a.from('delegations').select('id').eq('delegate_auth_id', v.link.agent_auth_id).eq('client_id', v.link.client_id)
      .eq('status', 'active').gt('expires_at', new Date().toISOString()).contains('allowed_actions', ['screen']).limit(1).maybeSingle()
    delegationId = (d as { id: string } | null)?.id ?? null
  }
  // The screening lives under the agent's authId (RLS landlord_id = auth.uid(); guard_screening_role lets service role through).
  const { data: scr, error: sErr } = await a.from('screenings').insert({
    landlord_id: v.link.agent_auth_id,
    tenant_name: sub.applicant_name,
    status: 'uploading',
    files: present.map((f) => ({ path: f.path, name: f.name, size: f.size, mime: f.mime, kind: f.kind })),
    notes: intakeScreeningNotes({ linkId: v.link.id, clientId: v.link.client_id, label: v.link.label, submission: { ...sub, files: present }, lookupsAllowed }),
    delegation_id: delegationId,
  }).select('id').maybeSingle()
  if (sErr || !scr) return NextResponse.json({ error: sErr?.message || 'could not create screening' }, { status: 500, headers: NO_STORE })
  const screeningId = (scr as { id: string }).id
  await Promise.all([
    a.from('agent_intake_submissions').update({ screening_id: screeningId }).eq('id', (subRow as { id: string }).id),
    a.from('agent_intake_links').update({ used_count: (v.link.used_count || 0) + 1 }).eq('id', v.link.id),
    a.from('agent_audit_events').insert({ actor_id: v.link.agent_auth_id, actor_type: 'system', action: 'agent_intake_received', target_type: 'screening', target_id: screeningId, acting_role: 'agent', metadata: { link_id: v.link.id, client_id: v.link.client_id, files: present.length, delegation_id: delegationId, consent_version: sub.consent_version } }).then(() => undefined, () => undefined),
  ])

  // Tell the agent: email (their login address) + push. Best effort; the submission stands either way.
  const href = `${SITE()}${intakeScreeningHref(screeningId)}`
  const unit = v.link.label ? `（${v.link.label}）` : ''
  const unitEn = v.link.label ? ` (${v.link.label})` : ''
  const subject = `${sub.applicant_name} 已交材料，去筛查 / ${sub.applicant_name} submitted documents — run the screening`
  const text = `${sub.applicant_name} 通过你的收件链接${unit}交来了 ${present.length} 份材料，并在线签了信息授权（${sub.consent_version}）。\n去筛查：${href}\n\n${sub.applicant_name} sent ${present.length} document(s) through your intake link${unitEn} and signed the online authorisation (${sub.consent_version}).\nRun the screening: ${href}`
  const { html, text: plain } = renderAgentMessageEmail({ subject, body: text })
  const { data: au } = await a.auth.admin.getUserById(v.link.agent_auth_id)
  const to = au?.user?.email
  if (to) await sendEmail({ to, subject, html, text: plain, fromName: 'Stayloop' })
  await notifyUser(a, v.link.agent_auth_id, { kind: 'event', title: `${sub.applicant_name} 已交材料 / submitted documents`, body: `${present.length} 份材料${v.link.label ? ` · ${v.link.label}` : ''} · 去筛查 / run the screening`, url: intakeScreeningHref(screeningId) })
  return NextResponse.json({ ok: true, files: present.length }, { headers: NO_STORE })
}

// POST /api/rent/evidence (multipart: lease_id, due_date, file, paid_on?, note?)
// — a receipt for one rent period (V1.0 阶段 3 · 甲 #4 · G9, 2026-10-16).
//
// The caller proves membership through their own RLS client (the household
// whose current / previous / next lease this is); the SERVER computes the
// SHA-256 and writes the file into the private tenancy-files bucket under the
// household's folder (tenancy_files_member_read keys on that first segment),
// then stamps the row's evidence_* columns with the service role — members
// have no UPDATE path on rent_payments. If the period is not recorded yet and
// the caller gives the day it was paid, mark_rent_paid runs first through the
// caller's client so every check in that RPC still applies. Evidence is only
// ever appended: there is no DELETE here, a wrong file is answered in the
// tenancy thread, and a dispute reads what was attached and when.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { writeAuditEvent } from '@/lib/agent/audit'
import { acceptEvidenceFile, evidencePath } from '@/lib/household/rentEvidence'

const UUID = /^[0-9a-f-]{36}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

function status(code: string): number {
  if (/not_a_member|not_authenticated/.test(code)) return 403
  if (/not_recorded|evidence_exists/.test(code)) return 409
  return 422
}

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const uid = ud.user.id
  // Each upload is stored for good: 30 per member per hour, and no limiter means no upload.
  if (!(await underHourlyLimit(`rent-evidence:${uid}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'multipart form required' }, { status: 400 }) }
  const leaseId = String(form.get('lease_id') || '')
  const due = String(form.get('due_date') || '').slice(0, 10)
  const paidOn = String(form.get('paid_on') || '').slice(0, 10)
  const note = String(form.get('note') || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const file = form.get('file')
  if (!UUID.test(leaseId)) return NextResponse.json({ error: 'lease_id required' }, { status: 400 })
  if (!DAY.test(due)) return NextResponse.json({ error: 'due_date required' }, { status: 400 })
  if (paidOn && !DAY.test(paidOn)) return NextResponse.json({ error: 'bad_paid_date' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  const accept = acceptEvidenceFile({ name: file.name, type: file.type, size: file.size })
  if (!accept.ok) return NextResponse.json({ error: accept.reason }, { status: accept.reason === 'file_size' ? 413 : accept.reason === 'file_type' ? 415 : 400 })

  // Membership: the caller's RLS shows the household only to its members.
  const { data: hh } = await sb
    .from('households')
    .select('id, current_lease_id, previous_lease_id, next_lease_id')
    .or(`current_lease_id.eq.${leaseId},previous_lease_id.eq.${leaseId},next_lease_id.eq.${leaseId}`)
    .limit(1)
    .maybeSingle()
  if (!hh) return NextResponse.json({ error: 'not_a_member' }, { status: 403 })
  const householdId = (hh as { id: string }).id
  const { data: mem } = await sb.from('household_members').select('role').eq('household_id', householdId).eq('user_id', uid).eq('status', 'active').maybeSingle()
  const memberRole = (mem as { role: string } | null)?.role ?? null
  const actingRole = memberRole === 'landlord' || memberRole === 'property_manager' ? 'landlord' : memberRole === 'agent' ? 'agent' : 'tenant'

  // The period: recorded already, or recorded now with the day it was paid.
  type Row = { id: string; status: string | null; tenant_id: string | null; evidence_path: string | null; evidence_sha256: string | null }
  let row: Row | null = null
  {
    const { data } = await sb.from('rent_payments').select('id, status, tenant_id, evidence_path, evidence_sha256').eq('lease_id', leaseId).eq('due_date', due).maybeSingle()
    row = (data as Row | null) ?? null
  }
  let recordedNow = false
  if (!row || (row.status !== 'paid' && row.status !== 'late')) {
    if (!paidOn) return NextResponse.json({ error: 'not_recorded' }, { status: 409 })
    const { data: rec, error: recErr } = await sb.rpc('mark_rent_paid', { p_lease: leaseId, p_due: due, p_paid_on: paidOn })
    if (recErr) return NextResponse.json({ error: recErr.message }, { status: status(recErr.message) })
    row = (rec as Row | null) ?? null
    if (!row || (row.status !== 'paid' && row.status !== 'late')) return NextResponse.json({ error: 'not_recorded' }, { status: 409 })
    recordedNow = true
  }

  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  if (row.evidence_path) {
    // Appended once: the same bytes again is a no-op, different bytes are refused (no overwrite).
    if (row.evidence_sha256 === sha256) return NextResponse.json({ ok: true, evidence: { path: row.evidence_path, sha256 }, recorded: recordedNow, duplicate: true })
    return NextResponse.json({ error: 'evidence_exists' }, { status: 409 })
  }
  const path = evidencePath(householdId, leaseId, due, sha256, accept.ext)
  const name = file.name.replace(/[\r\n]/g, ' ').trim().slice(0, 160) || `receipt.${accept.ext}`

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const up = await admin.storage.from('tenancy-files').upload(path, buf, { contentType: accept.mime, upsert: false })
  // The same bytes for the same period already sit at this path (a retry): keep going and stamp the row.
  if (up.error && !/already exists|duplicate/i.test(up.error.message)) return NextResponse.json({ error: up.error.message }, { status: 500 })
  const stamp = {
    evidence_path: path, evidence_sha256: sha256, evidence_name: name, evidence_size: file.size, evidence_mime: accept.mime,
    evidence_by: uid, evidence_at: new Date().toISOString(), ...(note ? { note } : {}),
  }
  const { data: updated, error: upErr } = await admin
    .from('rent_payments')
    .update(stamp)
    .eq('id', row.id)
    .in('status', ['paid', 'late'])
    .is('evidence_path', null)
    .select('id')
    .maybeSingle()
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'evidence_exists' }, { status: 409 })

  await writeAuditEvent(admin, {
    actorId: uid,
    action: 'rent_evidence_attached',
    targetType: 'rent_payment',
    targetId: row.id,
    actingRole,
    metadata: { lease_id: leaseId, household_id: householdId, due_date: due, sha256, name, size: file.size, mime: accept.mime, recorded_now: recordedNow, ...(note ? { note } : {}) },
  })
  return NextResponse.json({ ok: true, evidence: { path, name, size: file.size, mime: accept.mime, sha256 }, recorded: recordedNow })
}

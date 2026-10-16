// POST /api/profile/attach { application_id, file_ids[] } — present pack files to
// one application (V1.0 阶段 4 · 乙 #7 · G13, 2026-10-16).
//
// The signed-in applicant copies files from their pack into the application's
// folder (<application_id>/<kind>/<sha8>-<safe-name>), where the landlord's
// existing application_file_readable policy already applies. The application
// must be the caller's own (lower(email) = JWT email), fresh (created within the
// hour) and still without files — the same window attach_application_files
// enforces. This route does NOT call attach_application_files: the apply page
// merges the returned manifest with what it uploaded itself and calls the RPC
// once. Copying is service role (storage.copy, falling back to download+upload);
// nothing here changes the pack. Audit: applicant_pack_presented (to:'application').
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ApplicationFile } from '@/types'
import { underHourlyLimit } from '@/lib/rateLimit'
import { writeAuditEvent } from '@/lib/agent/audit'
import { presentedMetadata } from '@/lib/profile/consent'
import { attachedFilePath, toApplicationFile, type ProfileFile } from '@/lib/profile/types'

export const runtime = 'edge'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'tenant-files'
const MAX_IDS = 20

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const uid = ud.user.id
  const jwtEmail = (ud.user.email || '').trim().toLowerCase()
  if (!jwtEmail) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  // Each call copies objects into an application: 30 per applicant per hour, limiter outage = no copy.
  if (!(await underHourlyLimit(`profile-attach:${uid}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let body: { application_id?: unknown; file_ids?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'json body required' }, { status: 400 }) }
  const appId = typeof body.application_id === 'string' ? body.application_id : ''
  if (!UUID.test(appId)) return NextResponse.json({ error: 'application_id required' }, { status: 400 })
  const rawIds = Array.isArray(body.file_ids) ? body.file_ids : []
  const fileIds = Array.from(new Set(rawIds.filter((v): v is string => typeof v === 'string' && UUID.test(v))))
  if (!fileIds.length || fileIds.length !== rawIds.length) return NextResponse.json({ error: 'file_ids required' }, { status: 400 })
  if (fileIds.length > MAX_IDS) return NextResponse.json({ error: 'too_many_files' }, { status: 422 })

  // The application: read with the service role (anonymous inserts have no owner
  // column), then checked against the caller's JWT email — never trusted from the body.
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: app } = await svc.from('applications').select('id, email, created_at, files').eq('id', appId).maybeSingle()
  const a = app as { id: string; email: string | null; created_at: string | null; files: unknown } | null
  if (!a) return NextResponse.json({ error: 'application_not_found' }, { status: 404 })
  if ((a.email || '').trim().toLowerCase() !== jwtEmail) return NextResponse.json({ error: 'not_your_application' }, { status: 403 })
  const createdAt = a.created_at ? Date.parse(a.created_at) : NaN
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 60 * 60 * 1000) return NextResponse.json({ error: 'application_too_old' }, { status: 409 })
  if (Array.isArray(a.files) ? a.files.length > 0 : a.files != null && a.files !== '[]') return NextResponse.json({ error: 'application_has_files' }, { status: 409 })

  // The pack files: the caller's own rows (RLS), every requested id must be theirs.
  const { data: rows } = await sb.from('applicant_profile_files').select('id, auth_id, kind, path, name, size, mime, sha256, as_of, uploaded_at').in('id', fileIds).limit(MAX_IDS)
  const files = ((rows ?? []) as ProfileFile[]).filter((f) => f.auth_id === uid && f.path.startsWith(`profile/${uid}/`))
  if (files.length !== fileIds.length) return NextResponse.json({ error: 'file_not_found' }, { status: 404 })

  const out: ApplicationFile[] = []
  const failed: string[] = []
  const now = new Date().toISOString()
  for (const f of files) {
    const sha = f.sha256 || ''
    if (!/^[0-9a-f]{64}$/.test(sha)) { failed.push(f.id); continue }
    const ext = (f.path.split('.').pop() || 'bin').toLowerCase()
    const dest = attachedFilePath(appId, f.kind, sha, f.name || f.path.split('/').pop() || 'file', ext)
    let ok = false
    const cp = await svc.storage.from(BUCKET).copy(f.path, dest)
    if (!cp.error || /already exists|duplicate/i.test(cp.error.message)) ok = true
    else {
      // Fallback for a storage build without copy: read the bytes and write them.
      const dl = await svc.storage.from(BUCKET).download(f.path)
      if (!dl.error && dl.data) {
        const buf = await dl.data.arrayBuffer()
        const up = await svc.storage.from(BUCKET).upload(dest, buf, { contentType: f.mime || 'application/octet-stream', upsert: true })
        ok = !up.error
      }
    }
    if (!ok) { failed.push(f.id); continue }
    out.push(toApplicationFile(f, dest, now))
  }
  if (!out.length) return NextResponse.json({ error: 'copy_failed', failed }, { status: 500 })

  await writeAuditEvent(svc, {
    actorId: uid,
    action: 'applicant_pack_presented',
    targetType: 'application',
    targetId: appId,
    actingRole: 'tenant',
    metadata: { ...presentedMetadata('application', files.map((f) => f.kind), appId), file_count: out.length, ...(failed.length ? { failed } : {}) },
  })
  return NextResponse.json({ ok: true, files: out, ...(failed.length ? { failed } : {}) })
}

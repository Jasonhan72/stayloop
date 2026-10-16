// /api/profile/files — the applicant pack's document index (V1.0 阶段 4 · 乙 #7 · G13, 2026-10-16).
//
//   POST   multipart { kind, file, as_of? }  → stores the file, returns the row
//   DELETE ?id=<uuid>                          → removes the object, then the row
//
// The caller is the signed-in owner (JWT). The SERVER computes the SHA-256 and is
// the ONLY writer of the bytes and the row (service role): applicant_profile_files
// has no client INSERT policy and the tenant-files bucket has no INSERT policy for
// the profile/ prefix, so a row can never name bytes the server did not store.
// Path profile/<auth_id>/<kind>/<sha8>-<safe-name>; the owner previews through the
// bucket's profile_file_readable SELECT policy. Same bytes + same kind again is a
// no-op (duplicate: true). Limits: 6 per kind, 20 in total, 25 MB each.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { writeAuditEvent } from '@/lib/agent/audit'
import {
  acceptProfileFile,
  isProfileFileKind,
  profileFilePath,
  PROFILE_FILES_PER_KIND,
  PROFILE_FILES_TOTAL,
  type ProfileFileOut,
} from '@/lib/profile/types'

export const runtime = 'edge'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const BUCKET = 'tenant-files'
const OUT_COLS = 'id, kind, path, name, size, mime, sha256, as_of, uploaded_at'

async function caller(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return null
  return { sb, uid: ud.user.id }
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: Request) {
  const c = await caller(req)
  if (!c) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const { sb, uid } = c
  // Each upload is stored: 30 per owner per hour, and no limiter means no upload.
  if (!(await underHourlyLimit(`profile-files:${uid}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'multipart form required' }, { status: 400 }) }
  const kind = String(form.get('kind') || '')
  const asOf = String(form.get('as_of') || '').trim().slice(0, 10)
  const file = form.get('file')
  if (!isProfileFileKind(kind)) return NextResponse.json({ error: 'bad_kind' }, { status: 400 })
  if (asOf && !DAY.test(asOf)) return NextResponse.json({ error: 'bad_as_of' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  const accept = acceptProfileFile({ name: file.name, type: file.type, size: file.size })
  if (!accept.ok) return NextResponse.json({ error: accept.reason }, { status: accept.reason === 'file_size' ? 413 : accept.reason === 'file_type' ? 415 : 400 })

  // What the owner already has (their own rows, through RLS).
  const { data: existingRows } = await sb.from('applicant_profile_files').select('id, kind, sha256').eq('auth_id', uid).limit(100)
  const existing = (existingRows ?? []) as { id: string; kind: string; sha256: string | null }[]

  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')

  // Idempotent: the same bytes under the same kind is the row already there.
  const dup = existing.find((r) => r.kind === kind && r.sha256 === sha256)
  if (dup) {
    const { data: row } = await sb.from('applicant_profile_files').select(OUT_COLS).eq('id', dup.id).maybeSingle()
    return NextResponse.json({ ok: true, file: row as ProfileFileOut, duplicate: true })
  }
  if (existing.filter((r) => r.kind === kind).length >= PROFILE_FILES_PER_KIND) return NextResponse.json({ error: 'kind_limit' }, { status: 422 })
  if (existing.length >= PROFILE_FILES_TOTAL) return NextResponse.json({ error: 'total_limit' }, { status: 422 })

  const path = profileFilePath(uid, kind, sha256, file.name, accept.ext)
  const name = file.name.replace(/[\r\n]/g, ' ').trim().slice(0, 160) || `${kind}.${accept.ext}`

  const svc = admin()
  const up = await svc.storage.from(BUCKET).upload(path, buf, { contentType: accept.mime, upsert: false })
  // The same bytes may already sit at this path (a retry whose row insert failed): keep going.
  if (up.error && !/already exists|duplicate/i.test(up.error.message)) return NextResponse.json({ error: up.error.message }, { status: 500 })

  const { data: inserted, error: insErr } = await svc
    .from('applicant_profile_files')
    .insert({ auth_id: uid, kind, path, name, size: file.size, mime: accept.mime, sha256, as_of: asOf || null })
    .select(OUT_COLS)
    .maybeSingle()
  if (insErr || !inserted) {
    // The path is unique: a row for it exists (a concurrent retry) — return that one.
    const { data: row } = await sb.from('applicant_profile_files').select(OUT_COLS).eq('path', path).maybeSingle()
    if (row) return NextResponse.json({ ok: true, file: row as ProfileFileOut, duplicate: true })
    return NextResponse.json({ error: insErr?.message || 'insert_failed' }, { status: 500 })
  }

  await writeAuditEvent(svc, {
    actorId: uid,
    action: 'applicant_pack_file_added',
    targetType: 'applicant_profile_file',
    targetId: (inserted as ProfileFileOut).id,
    actingRole: 'tenant',
    metadata: { kind, sha256, name, size: file.size, mime: accept.mime, ...(asOf ? { as_of: asOf } : {}) },
  })
  return NextResponse.json({ ok: true, file: inserted as ProfileFileOut })
}

export async function DELETE(req: Request) {
  const c = await caller(req)
  if (!c) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const { sb, uid } = c
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!UUID.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!(await underHourlyLimit(`profile-files-del:${uid}`, 60, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  // The owner's own row (RLS): anyone else's id reads as not found.
  const { data: row } = await sb.from('applicant_profile_files').select('id, kind, path, sha256').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const r = row as { id: string; kind: string; path: string; sha256: string | null }
  if (!r.path.startsWith(`profile/${uid}/`)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const svc = admin()
  // Object first, then the row — a missing object is fine (the row is the index).
  const rm = await svc.storage.from(BUCKET).remove([r.path])
  if (rm.error && !/not found|does not exist/i.test(rm.error.message)) return NextResponse.json({ error: rm.error.message }, { status: 500 })
  const { error: delErr } = await svc.from('applicant_profile_files').delete().eq('id', r.id).eq('auth_id', uid)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  await writeAuditEvent(svc, {
    actorId: uid,
    action: 'applicant_pack_file_removed',
    targetType: 'applicant_profile_file',
    targetId: r.id,
    actingRole: 'tenant',
    metadata: { kind: r.kind, ...(r.sha256 ? { sha256: r.sha256 } : {}) },
  })
  return NextResponse.json({ ok: true, id: r.id })
}

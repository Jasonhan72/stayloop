// POST /api/threads/upload (multipart: thread_id, file) — an attachment for a
// thread message (节点 4 2026-09-26). The caller must be a party (RLS read of
// the thread proves it); the SERVER computes the SHA-256, stores the file in
// the private tenancy-files bucket under <household or thread>/threads/<thread>/
// and registers it in thread_attachments. The message insert trigger accepts
// only registered paths and copies the registered hash, so the hash on a
// message is always the server's, never the client's.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i
const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  if (!(await underHourlyLimit(`thread-upload:${ud.user.id}`, 60, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'multipart form required' }, { status: 400 }) }
  const tid = String(form.get('thread_id') || '')
  const file = form.get('file')
  if (!UUID.test(tid)) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'file_size' }, { status: 413 })
  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED.test(mime)) return NextResponse.json({ error: 'file_type' }, { status: 415 })

  // RLS: only a party can read the thread row.
  const { data: t } = await sb.from('threads').select('id, household_id').eq('id', tid).maybeSingle()
  if (!t) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })

  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const folder = (t as { household_id: string | null }).household_id ?? tid
  const path = `${folder}/threads/${tid}/${crypto.randomUUID()}.${ext}`
  const name = file.name.replace(/[\r\n]/g, ' ').slice(0, 200) || `attachment.${ext}`

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const up = await admin.storage.from('tenancy-files').upload(path, buf, { contentType: mime, upsert: false })
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
  const { error } = await admin.from('thread_attachments').insert({ path, thread_id: tid, uploaded_by: ud.user.id, name, mime, size: file.size, sha256 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attachment: { path, name, mime, size: file.size, sha256 } })
}

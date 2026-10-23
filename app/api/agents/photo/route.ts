// POST /api/agents/photo (multipart: image) · DELETE /api/agents/photo — the agent's own
// profile photo (2026-10-23). The browser crops to a 512px square and sends WebP (JPEG
// fallback); here the bytes are sniffed, stored under agent-photos/<uid>/<id>.<ext> with
// the service role, the previous file removed, and agent_profiles.photo_key set. The
// profile guard stops a direct client write of photo_key, so this route is its only writer.
// Signed-in agents with a profile row only (any status — it shows publicly only on a
// verified, live registration, like everything else on the public pages).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { AGENT_PHOTO_BUCKET, AGENT_PHOTO_MAX_BYTES, agentPhotoUrl, isAgentPhotoKey, sniffPhoto } from '@/lib/agentPhotoKeys'

const NO_STORE = { 'Cache-Control': 'no-store' }
const PER_USER_PER_HOUR = 20

async function who(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return null
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await sb.auth.getUser()
  return data?.user && !data.user.is_anonymous ? data.user.id : null
}
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

async function currentKey(svc: ReturnType<typeof admin>, uid: string): Promise<{ exists: boolean; key: string | null }> {
  const { data } = await svc.from('agent_profiles').select('photo_key').eq('auth_id', uid).maybeSingle()
  const row = data as { photo_key: string | null } | null
  return { exists: !!row, key: row?.photo_key ?? null }
}

export async function POST(req: Request) {
  const uid = await who(req)
  if (!uid) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  let file: Blob | null = null
  try {
    const fd = await req.formData()
    const f = fd.get('image')
    file = f instanceof Blob ? f : null
  } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE }) }
  if (!file || file.size === 0) return NextResponse.json({ error: 'photo_required' }, { status: 400, headers: NO_STORE })
  if (file.size > AGENT_PHOTO_MAX_BYTES) return NextResponse.json({ error: 'photo_too_large' }, { status: 413, headers: NO_STORE })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = sniffPhoto(bytes)
  if (!ext) return NextResponse.json({ error: 'photo_type' }, { status: 415, headers: NO_STORE })
  // Storage costs money and the photo is public: fail closed.
  if (!(await underHourlyLimit(`agent-photo:${uid}`, PER_USER_PER_HOUR, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

  const svc = admin()
  const cur = await currentKey(svc, uid)
  if (!cur.exists) return NextResponse.json({ error: 'agent_profile_required' }, { status: 403, headers: NO_STORE })
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const key = `${uid}/${id}.${ext}`
  if (!isAgentPhotoKey(key)) return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
  const { error: upErr } = await svc.storage.from(AGENT_PHOTO_BUCKET).upload(key, bytes, { contentType: ext === 'webp' ? 'image/webp' : 'image/jpeg', upsert: false, cacheControl: '31536000' })
  if (upErr) return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
  const { error: dbErr } = await svc.from('agent_profiles').update({ photo_key: key }).eq('auth_id', uid)
  if (dbErr) {
    await svc.storage.from(AGENT_PHOTO_BUCKET).remove([key]).then(() => undefined, () => undefined)
    return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
  }
  if (cur.key && cur.key !== key) await svc.storage.from(AGENT_PHOTO_BUCKET).remove([cur.key]).then(() => undefined, () => undefined)
  await svc.from('agent_audit_events').insert({ actor_id: uid, actor_type: 'user', action: 'agent_photo_set', target_type: 'agent_profile', target_id: uid, metadata: { bytes: bytes.length, ext } }).then(() => undefined, () => undefined)
  return NextResponse.json({ ok: true, key, url: agentPhotoUrl(key) }, { headers: NO_STORE })
}

export async function DELETE(req: Request) {
  const uid = await who(req)
  if (!uid) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const svc = admin()
  const cur = await currentKey(svc, uid)
  if (!cur.exists) return NextResponse.json({ error: 'agent_profile_required' }, { status: 403, headers: NO_STORE })
  if (cur.key) {
    const { error } = await svc.from('agent_profiles').update({ photo_key: null }).eq('auth_id', uid)
    if (error) return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
    await svc.storage.from(AGENT_PHOTO_BUCKET).remove([cur.key]).then(() => undefined, () => undefined)
    await svc.from('agent_audit_events').insert({ actor_id: uid, actor_type: 'user', action: 'agent_photo_removed', target_type: 'agent_profile', target_id: uid, metadata: {} }).then(() => undefined, () => undefined)
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}

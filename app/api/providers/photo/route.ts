// POST /api/providers/photo (multipart: image) · DELETE /api/providers/photo — the photo or logo
// on a service provider's own record (2026-11-23). The same shape as the agent photo
// (app/api/agents/photo/route.ts): the browser crops to a 512px square and sends WebP (JPEG
// fallback); here the bytes are sniffed, stored under provider-photos/<provider id>/<id>.<ext>
// with the service role, the previous file removed, and service_providers.photo_key set. The
// provider guard stops a direct client write of photo_key, so this route is its only writer.
// Signed-in accounts with a provider record only (any status — the photo shows to other people
// only once the record is verified, like everything else in the directory).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { sniffPhoto } from '@/lib/agentPhotoKeys'
import { PROVIDER_PHOTO_BUCKET, PROVIDER_PHOTO_MAX_BYTES, isProviderPhotoKeyOf, providerPhotoUrl } from '@/lib/providerPhotoKeys'

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

/** The caller's own provider record: found by the account, never by anything the request says. */
async function ownRecord(svc: ReturnType<typeof admin>, uid: string): Promise<{ id: string; key: string | null } | null> {
  const { data } = await svc.from('service_providers').select('id, photo_key').eq('auth_id', uid).maybeSingle()
  const row = data as { id: string; photo_key: string | null } | null
  return row ? { id: row.id, key: row.photo_key ?? null } : null
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
  if (file.size > PROVIDER_PHOTO_MAX_BYTES) return NextResponse.json({ error: 'photo_too_large' }, { status: 413, headers: NO_STORE })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = sniffPhoto(bytes)
  if (!ext) return NextResponse.json({ error: 'photo_type' }, { status: 415, headers: NO_STORE })
  // Storage costs money and the photo is public: fail closed.
  if (!(await underHourlyLimit(`provider-photo:${uid}`, PER_USER_PER_HOUR, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: NO_STORE })

  const svc = admin()
  const cur = await ownRecord(svc, uid)
  if (!cur) return NextResponse.json({ error: 'provider_record_required' }, { status: 403, headers: NO_STORE })
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  const key = `${cur.id}/${id}.${ext}`
  if (!isProviderPhotoKeyOf(key, cur.id)) return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
  const { error: upErr } = await svc.storage.from(PROVIDER_PHOTO_BUCKET).upload(key, bytes, { contentType: ext === 'webp' ? 'image/webp' : 'image/jpeg', upsert: false, cacheControl: '31536000' })
  if (upErr) return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
  const { error: dbErr } = await svc.from('service_providers').update({ photo_key: key }).eq('id', cur.id).eq('auth_id', uid)
  if (dbErr) {
    await svc.storage.from(PROVIDER_PHOTO_BUCKET).remove([key]).then(() => undefined, () => undefined)
    return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
  }
  // Only a file in this provider's own folder is ever removed.
  if (cur.key && cur.key !== key && isProviderPhotoKeyOf(cur.key, cur.id)) await svc.storage.from(PROVIDER_PHOTO_BUCKET).remove([cur.key]).then(() => undefined, () => undefined)
  await svc.from('agent_audit_events').insert({ actor_id: uid, actor_type: 'user', action: 'provider_photo_set', target_type: 'service_provider', target_id: cur.id, metadata: { bytes: bytes.length, ext } }).then(() => undefined, () => undefined)
  return NextResponse.json({ ok: true, key, url: providerPhotoUrl(key) }, { headers: NO_STORE })
}

export async function DELETE(req: Request) {
  const uid = await who(req)
  if (!uid) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const svc = admin()
  const cur = await ownRecord(svc, uid)
  if (!cur) return NextResponse.json({ error: 'provider_record_required' }, { status: 403, headers: NO_STORE })
  if (cur.key) {
    const { error } = await svc.from('service_providers').update({ photo_key: null }).eq('id', cur.id).eq('auth_id', uid)
    if (error) return NextResponse.json({ error: 'store_failed' }, { status: 500, headers: NO_STORE })
    if (isProviderPhotoKeyOf(cur.key, cur.id)) await svc.storage.from(PROVIDER_PHOTO_BUCKET).remove([cur.key]).then(() => undefined, () => undefined)
    await svc.from('agent_audit_events').insert({ actor_id: uid, actor_type: 'user', action: 'provider_photo_removed', target_type: 'service_provider', target_id: cur.id, metadata: {} }).then(() => undefined, () => undefined)
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}

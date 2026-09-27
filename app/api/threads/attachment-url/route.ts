// POST /api/threads/attachment-url { thread_id, path, download?, acting_role? }
// — a short-lived signed URL for a thread attachment (节点 4 2026-09-26). The
// registry row is readable only by a party (RLS), so a hit proves the caller
// may see the file; every view / download is written to the audit log with
// the acting hat and the matter (the review asked for access auditing on
// attachments, like application documents already have).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { threadMatter } from '@/lib/threads/server'
import type { ThreadKind } from '@/lib/threads/shared'

export const runtime = 'edge'
const UUID = /^[0-9a-f-]{36}$/i
const HATS = new Set(['tenant', 'landlord', 'agent', 'provider', 'admin'])

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: { thread_id?: string; path?: string; download?: unknown; acting_role?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const tid = String(body.thread_id || ''); const path = String(body.path || '')
  if (!UUID.test(tid) || !path || path.length > 400 || path.includes('..')) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  if (!(await underHourlyLimit(`thread-att:${ud.user.id}`, 240, true))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const [{ data: att }, { data: t }] = await Promise.all([
    sb.from('thread_attachments').select('path, name, mime').eq('path', path).eq('thread_id', tid).maybeSingle(),
    sb.from('threads').select('id, kind, ref_id').eq('id', tid).maybeSingle(),
  ])
  if (!att || !t) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const download = body.download === true
  const { data: signed, error } = await admin.storage.from('tenancy-files').createSignedUrl(path, 600, download ? { download: (att as { name: string }).name } : undefined)
  if (error || !signed?.signedUrl) return NextResponse.json({ error: error?.message || 'sign failed' }, { status: 500 })
  const ref = threadMatter(t as { kind: ThreadKind; ref_id: string })
  await admin.from('agent_audit_events').insert({
    actor_id: ud.user.id, actor_type: 'user', action: download ? 'thread_attachment_downloaded' : 'thread_attachment_viewed',
    target_type: 'thread', target_id: tid, acting_role: HATS.has(String(body.acting_role)) ? body.acting_role : null,
    matter_type: ref.matterType, matter_id: ref.matterId, metadata: { path, name: (att as { name: string }).name },
  }).then(() => undefined, () => undefined)
  return NextResponse.json({ url: signed.signedUrl, kind: /^image\//.test((att as { mime: string | null }).mime || '') ? 'image' : (att as { mime: string | null }).mime === 'application/pdf' ? 'pdf' : 'other' })
}

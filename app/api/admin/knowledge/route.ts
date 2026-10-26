// /api/admin/knowledge — the knowledge base's admin view (design/rag-knowledge-base-plan-2026-10-27.md §7.3).
//   GET          → { sources: kb_source_status(), changes: knowledge_changes (newest first, 200) }
//   PATCH { id, status, note? } → set the review state of one change (pending | reviewed | no_impact | rule_updated)
// Admin JWT only (is_stayloop_admin RPC); reads and writes with the service role.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const STATUSES = new Set(['pending', 'reviewed', 'no_impact', 'rule_updated'])

async function requireAdmin(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }
  const { data: isAdmin } = await sb.rpc('is_stayloop_admin')
  if (isAdmin !== true) return { error: NextResponse.json({ error: 'admin only' }, { status: 403 }) }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  return { admin, userId: ud.user.id }
}

export async function GET(req: Request) {
  const gate = await requireAdmin(req)
  if ('error' in gate) return gate.error
  const [src, ch] = await Promise.all([
    gate.admin.rpc('kb_source_status'),
    gate.admin.from('knowledge_changes').select('id, source_key, source_title, old_date, new_date, detected_at, sections_added, sections_removed, sections_changed, affected_rule_ids, status, note, reviewed_at').order('detected_at', { ascending: false }).limit(200),
  ])
  if (src.error) return NextResponse.json({ error: src.error.message }, { status: 500 })
  if (ch.error) return NextResponse.json({ error: ch.error.message }, { status: 500 })
  return NextResponse.json({ sources: src.data || [], changes: ch.data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin(req)
  if ('error' in gate) return gate.error
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown; note?: unknown }
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : null
  if (!id || !status) return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 })
  const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : null
  const { error } = await gate.admin.from('knowledge_changes').update({ status, note, reviewed_by: status === 'pending' ? null : gate.userId, reviewed_at: status === 'pending' ? null : new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

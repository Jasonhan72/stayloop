// POST /api/threads/export { thread_id, format: 'html' | 'json', lang?, acting_role? }
// One conversation's record (消息系统 A 期): printable HTML or machine-checkable
// JSON. The caller must be a party (thread_party under their JWT). The JSON
// carries every message with the fields the hash chain is computed over, the
// chain algorithm and the server's verification, so a third party can recompute
// it. Names only — never an email address. Writes an audit row.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { canonicalJson, renderThreadPack } from '@/lib/export/evidencePack'
import { loadPackThread } from '@/lib/export/threadRecord'
import { partyDisplay, threadParties, type ThreadRow } from '@/lib/threads/server'
import { CHAIN_VERSION, GENESIS } from '@/lib/threads/hashChain'

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
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  let body: { thread_id?: string; format?: string; lang?: string; acting_role?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const tid = String(body.thread_id || '')
  if (!UUID.test(tid)) return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
  if (!(await underHourlyLimit(`thread-export:${ud.user.id}`, 30, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const { data: party } = await sb.rpc('thread_party', { p_thread: tid })
  if (!party) return NextResponse.json({ error: 'not_a_party' }, { status: 403 })
  const lang: 'zh' | 'en' = body.lang === 'en' ? 'en' : 'zh'
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: t } = await admin.from('threads').select('id, kind, ref_id, household_id, title, listing_id, subject_user, matter_id, created_at').eq('id', tid).maybeSingle()
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const T = t as ThreadRow & { matter_id: string | null; created_at: string }
  const { pack } = await loadPackThread(admin, T)
  const parties = (await threadParties(admin, T)).filter((p, i, a) => p.kind !== 'admin' || a.findIndex((q) => q.kind === 'admin') === i).map((p) => (p.kind === 'admin' ? 'Stayloop' : partyDisplay(p, lang === 'zh')))
  const actingRole = HATS.has(String(body.acting_role)) ? String(body.acting_role) : String(party)
  const generatedAt = new Date().toISOString()
  const record = {
    format: 'stayloop-thread-export', version: 1, generated_at: generatedAt, site: SITE(),
    thread: { id: T.id, kind: T.kind, title: T.title, matter_id: T.matter_id, created_at: T.created_at, parties },
    chain: {
      algorithm: 'sha256', version: CHAIN_VERSION, genesis: GENESIS,
      canonical: 'join("\\n", [version, prev_hash, id, thread_id, created_at as YYYY-MM-DDTHH:MM:SS.ffffffZ (UTC), sender_id or "", sender_kind, acting_role or "", kind, channel, ref_message_id or "", attachments as "path:sha256" joined by ",", body])',
      verification: pack.chain,
    },
    messages: pack.messages.map((m) => ({ ...m })),
  }
  const fingerprint = await sha256Hex(canonicalJson(record))
  await admin.from('agent_audit_events').insert({
    actor_id: ud.user.id, actor_type: 'user', action: 'thread_export_generated', target_type: 'thread', target_id: tid, acting_role: actingRole, rental_matter_id: T.matter_id,
    metadata: { fingerprint, format: body.format === 'json' ? 'json' : 'html', messages: pack.messages.length, chain_ok: pack.chain?.ok ?? null },
  }).then(() => undefined, () => undefined)
  if (body.format === 'json') {
    return new NextResponse(JSON.stringify({ ...record, fingerprint }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="stayloop-thread-${tid.slice(0, 8)}.json"`, 'X-Content-Fingerprint': fingerprint } })
  }
  const html = renderThreadPack(pack, { lang, generatedAt, generatedBy: actingRole, fingerprint, siteUrl: SITE(), parties })
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Fingerprint': fingerprint } })
}

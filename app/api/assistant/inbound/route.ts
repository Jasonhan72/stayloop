// POST /api/assistant/inbound — one mail for an assistant's address, handed over by the email
// Worker (workers/reply-email) exactly as it was received (AI 助理的邮箱 · 第一期, 2026-11-27).
//
// Auth: the shared secret INBOUND_EMAIL_SECRET, the same one the thread-reply path uses. The body
// is the raw message (message/rfc822), not JSON: no base64, so a 10 MB mail costs 10 MB here.
// x-mail-to is the envelope recipient; x-mail-auth-results is Cloudflare's own
// Authentication-Results header as the Worker read it.
//
// The answer is always 200 with { ok } — and { reject } when the mail is refused, which the
// Worker passes to the sending server (setReject). Whether a mail is accepted is decided in
// receiveMail: is the address ours and open, is the sender on its list and verified, is there room.
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { secretMatches } from '@/lib/cron/secret'
import { afterResponse } from '@/lib/afterResponse'
import { notifyUser } from '@/lib/push/notify'
import { MAIL_LIMITS, REJECT_TEXT } from '@/lib/assistantMail/policy'
import { receiveMail } from '@/lib/assistantMail/server'

/** The hat whose assistant page the push opens: the account's landlord page if it has one, else agent, else tenant. */
async function assistantPath(admin: SupabaseClient, userId: string): Promise<string> {
  const [{ data: l }, { data: a }] = await Promise.all([
    admin.from('landlords').select('id').eq('auth_id', userId).limit(1),
    admin.from('agent_profiles').select('auth_id').eq('auth_id', userId).limit(1),
  ])
  const role = (l ?? []).length ? 'landlord' : (a ?? []).length ? 'agent' : 'tenant'
  return `/${role}/agent?panel=inbox`
}

export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET || ''
  if (!secret || !(await secretMatches(req.headers.get('x-inbound-secret') || '', secret))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const to = (req.headers.get('x-mail-to') || '').slice(0, 400)
  const authHeader = req.headers.get('x-mail-auth-results')
  if (Number(req.headers.get('content-length') || 0) > MAIL_LIMITS.rawBytes + 4096) return NextResponse.json({ ok: false, code: 'too_large', reject: REJECT_TEXT.too_large })
  let raw: Uint8Array
  try { raw = new Uint8Array(await req.arrayBuffer()) } catch { return NextResponse.json({ error: 'unreadable body' }, { status: 400 }) }
  if (!raw.byteLength) return NextResponse.json({ error: 'empty body' }, { status: 400 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const out = await receiveMail(admin, { raw, to, authHeader })
  if (out.ok && out.id && !out.duplicate && out.userId) {
    const userId = out.userId
    const subject = out.subject || ''
    afterResponse(async () => {
      await notifyUser(admin, userId, {
        kind: 'event',
        title: 'AI 助理收到一封你转来的邮件 / Your AI Agent received an email you forwarded',
        body: subject.slice(0, 120),
        url: await assistantPath(admin, userId),
      })
    })
  }
  // The Worker needs ok / reject and nothing else: who owns the address stays here.
  return NextResponse.json(out.ok ? { ok: true, duplicate: out.duplicate === true } : { ok: false, code: out.code, reject: out.reject })
}

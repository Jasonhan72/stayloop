// POST /api/threads/inbound — an email reply, forwarded by the Cloudflare Email
// Worker on reply.stayloop.ai (workers/reply-email, 消息系统 A 期 2026-09-29).
// Auth: the shared secret INBOUND_EMAIL_SECRET (constant-time compare). The
// worker has already parsed the MIME; the raw bytes come along so the server
// stores them and records their SHA-256 whatever happens. Whether a message is
// written is decided in recordEmailReply (live token + From = the address the
// token was issued to).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordEmailReply } from '@/lib/threads/server'

export const runtime = 'edge'
const MAX_RAW = 25 * 1024 * 1024

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET || ''
  if (!secret || !safeEqual(req.headers.get('x-inbound-secret') || '', secret)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  let body: { raw?: string; from?: string; to?: string[]; text?: string | null; html?: string | null; message_id?: string | null; attachments?: number }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  if (!body.raw) return NextResponse.json({ error: 'raw required' }, { status: 400 })
  const raw = fromBase64(body.raw)
  if (raw.byteLength > MAX_RAW) return NextResponse.json({ error: 'too_large' }, { status: 413 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const r = await recordEmailReply(admin, {
    raw,
    from: typeof body.from === 'string' ? body.from.slice(0, 400) : null,
    to: Array.isArray(body.to) ? body.to.filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 400)) : [],
    text: typeof body.text === 'string' ? body.text.slice(0, 200_000) : null,
    html: typeof body.html === 'string' ? body.html.slice(0, 400_000) : null,
    messageId: typeof body.message_id === 'string' ? body.message_id : null,
    attachmentCount: Number(body.attachments) || 0,
  })
  // 200 either way: the worker must not retry a reply we chose not to record.
  return NextResponse.json({ ok: true, outcome: r.outcome })
}

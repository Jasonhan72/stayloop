// /api/w/[token] — the external contractor's door (Phase 0 "派给自己的联系人"):
// no account, the token in the emailed link is the credential. GET returns
// what they may see (full address only after accepting); POST performs the
// contractor-side actions. Rate-limited per IP; the token is 64 hex chars.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { actOnWorkOrder, peekByToken } from '@/lib/marketplace/server'
import type { WoAction } from '@/lib/marketplace/workOrders'
import { underHourlyLimit } from '@/lib/rateLimit'
import { ensureThread, notifyThreadParties } from '@/lib/threads/server'

export const runtime = 'edge'

const EXTERNAL_ACTIONS: WoAction[] = ['accept', 'quote', 'decline', 'arrive', 'complete', 'cancel', 'dispute']

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
}
const ip = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!/^[A-Za-z0-9]{32,80}$/.test(token)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!(await underHourlyLimit(`wo-token:${ip(req)}`, 120, true))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const a = admin()
  const v = await peekByToken(a, token)
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404, headers: { 'Referrer-Policy': 'no-referrer' } })
  const w = v.wo
  // 节点 4: the work-order thread, read through the token (service role; the token is the party).
  const { data: th } = await a.from('threads').select('id').eq('kind', 'work_order').eq('ref_id', w.id).maybeSingle()
  const { data: msgs } = th ? await a.from('thread_messages').select('id, sender_kind, sender_label, kind, body, created_at').eq('thread_id', (th as { id: string }).id).order('id', { ascending: true }).limit(200) : { data: [] }
  return NextResponse.json({
    thread: { id: (th as { id: string } | null)?.id ?? null, messages: msgs ?? [] },
    work_order: { id: w.id, status: w.status, trade: w.trade, scope: w.scope, emergency: w.emergency, entry_permission: w.entry_permission, quote_amount: w.quote_amount, quote_type: w.quote_type, quote_note: w.quote_note, approved_amount: w.approved_amount, schedule_start: w.schedule_start, schedule_end: w.schedule_end, arrived_at: w.arrived_at, completed_at: w.completed_at, completion_note: w.completion_note, invoice_amount: w.invoice_amount, accepted_at: w.accepted_at, paid_at: w.paid_at, external_name: w.external_name, created_at: w.created_at, quote_due_at: w.quote_due_at, quote_version: w.quote_version, quote_valid_until: w.quote_valid_until, decline_code: w.decline_code, cancel_reason: w.cancel_reason },
    ticket: v.ticket, address: v.address, landlord_email: v.landlordEmail,
  }, { headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!/^[A-Za-z0-9]{32,80}$/.test(token)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!(await underHourlyLimit(`wo-token-act:${ip(req)}`, 40, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let body: { action?: string; payload?: Record<string, unknown> }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const a = admin()
  const v = await peekByToken(a, token)
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // 节点 4: a message from the external contractor into the work-order thread (no account: sender_kind 'external').
  if (body.action === 'message') {
    const text = String((body.payload || {}).body || '').trim().slice(0, 4000)
    if (text.length < 1) return NextResponse.json({ error: 'body required' }, { status: 400 })
    if (['declined', 'cancelled', 'expired', 'closed'].includes(v.wo.status)) return NextResponse.json({ error: 'thread_closed' }, { status: 409 })
    const th = await ensureThread(a, 'work_order', v.wo.id, { householdId: v.wo.household_id, title: v.ticket.title, createdBy: v.wo.landlord_auth_id })
    if (!th) return NextResponse.json({ error: 'thread unavailable' }, { status: 500 })
    // Never show the contractor's address as their name (relay, 消息系统 A 期).
    const label = v.wo.external_name || 'Contractor'
    const { data: ins, error } = await a.from('thread_messages').insert({ thread_id: th.id, sender_id: null, sender_kind: 'external', acting_role: 'provider', sender_label: label, kind: 'message', body: text, meta: { via: 'token' } }).select('id, created_at').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const row = ins as { id: number; created_at: string } | null
    void notifyThreadParties(a, th, { messageId: row?.id ?? null, createdAt: row?.created_at, exceptEmail: v.wo.external_email, preview: text.slice(0, 120), body: text, senderLabel: `${label}（服务商） / ${label} (Contractor)` })
    return NextResponse.json({ ok: true }, { headers: { 'Referrer-Policy': 'no-referrer' } })
  }
  const action = body.action as WoAction
  if (!EXTERNAL_ACTIONS.includes(action)) return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  // Photos are for providers with an account (private bucket); the token door takes notes only.
  const payload = { ...(body.payload || {}) }; delete payload.photos
  const r = await actOnWorkOrder(a, { woId: v.wo.id, action, by: v.wo.provider_id ? 'provider' : 'external', actorId: null, payload })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, status: r.wo.status }, { headers: { 'Referrer-Policy': 'no-referrer' } })
}

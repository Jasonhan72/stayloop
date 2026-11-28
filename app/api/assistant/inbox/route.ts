// /api/assistant/inbox — the caller's own mailbox (AI 助理的邮箱 · 第一期, 2026-11-27).
//   GET   what the panel's 收件 tab needs: is a mailbox available to this account, its address,
//         who may write to it, the limits it says out loud.
//   POST  { action } — create · rotate · close · add_sender { email } · remove_sender { id }.
//         Answers with the new state, so the tab never shows what it merely hopes happened.
// Signed-in accounts only; every write is for the caller's own user id.
import { NextResponse } from 'next/server'
import { readJsonBody, INVALID_BODY } from '@/lib/api/body'
import { underHourlyLimit } from '@/lib/rateLimit'
import { callerOf } from '@/lib/assistantMail/caller'
import { addSender, closeMailbox, mailboxState, openMailbox, removeSender, rotateMailbox, type ActionResult } from '@/lib/assistantMail/server'

export async function GET(req: Request) {
  const c = await callerOf(req)
  if (!c) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await mailboxState(c.admin, c.user))
}

export async function POST(req: Request) {
  const c = await callerOf(req)
  if (!c) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await readJsonBody<{ action?: unknown; email?: unknown; id?: unknown }>(req)
  if (!body) return NextResponse.json(INVALID_BODY, { status: 400 })
  // A changed address retires the old one for good; nobody needs thirty of those an hour.
  if (!(await underHourlyLimit(`assistant-inbox:${c.user.id}`, 30, true))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  let r: ActionResult
  switch (body.action) {
    case 'create': r = await openMailbox(c.admin, c.user); break
    case 'rotate': r = await rotateMailbox(c.admin, c.user); break
    case 'close': r = await closeMailbox(c.admin, c.user); break
    case 'add_sender': r = await addSender(c.admin, c.user, body.email); break
    case 'remove_sender': r = await removeSender(c.admin, c.user, body.id); break
    default: return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(await mailboxState(c.admin, c.user))
}

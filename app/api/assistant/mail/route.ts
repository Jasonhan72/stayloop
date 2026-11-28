// POST /api/assistant/mail — one mail of the caller's own (AI 助理的邮箱 · 第一期, 2026-11-27).
//   { id, action: 'seen' }      opened in the tab
//   { id, action: 'handed' }    put into the conversation's composer (「交给 AI 助理」)
//   { id, action: 'delete' }    the mail, its attachments and the original, gone
//   { id, action: 'file', idx } a ten-minute download link for one attachment
// Reading the list and the text is the browser's own, under RLS; everything that changes or
// leaves the private bucket goes through here.
import { NextResponse } from 'next/server'
import { readJsonBody, INVALID_BODY } from '@/lib/api/body'
import { callerOf } from '@/lib/assistantMail/caller'
import { deleteMail, fileLink, markMail } from '@/lib/assistantMail/server'

export async function POST(req: Request) {
  const c = await callerOf(req)
  if (!c) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await readJsonBody<{ id?: unknown; action?: unknown; idx?: unknown }>(req)
  if (!body) return NextResponse.json(INVALID_BODY, { status: 400 })
  if (body.action === 'file') {
    const f = await fileLink(c.admin, c.user, body.id, body.idx)
    return f.ok ? NextResponse.json({ url: f.url, name: f.name, mediaType: f.mediaType }) : NextResponse.json({ error: f.error }, { status: f.status })
  }
  const r = body.action === 'seen' || body.action === 'handed'
    ? await markMail(c.admin, c.user, body.id, body.action)
    : body.action === 'delete'
      ? await deleteMail(c.admin, c.user, body.id)
      : null
  if (!r) return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status })
}

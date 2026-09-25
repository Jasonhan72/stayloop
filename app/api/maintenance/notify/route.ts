// POST /api/maintenance/notify { ticket_id } — V0.6 (2026-09-24).
// Tickets filed from the tenant repair form or the hub's maintenance tab were
// written straight through RLS and only appeared on the other side's board.
// This route tells the counterpart right away: tenant files → landlord gets
// an email + push (+ the dispatch suggestion card); landlord files → tenants
// get a push + email. Recipients come from household membership, never from
// the request. Idempotent via maintenance_tickets.counterpart_notified_at.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { underHourlyLimit } from '@/lib/rateLimit'
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'
import { notifyUser } from '@/lib/push/notify'
import { isEmergencyMaintenance } from '@/lib/agent/maintenanceTriage'
import { suggestDispatch, ticketContext, SITE } from '@/lib/marketplace/server'

export const runtime = 'edge'

const UUID = /^[0-9a-f-]{36}$/i

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })
  const user = ud.user

  let body: { ticket_id?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const ticketId = String(body.ticket_id || '')
  if (!UUID.test(ticketId)) return NextResponse.json({ error: 'ticket_id required' }, { status: 400 })

  // RLS read proves the caller is a member of the ticket's household; only
  // the person who opened it may announce it.
  const { data: own } = await sb.from('maintenance_tickets').select('id, opened_by').eq('id', ticketId).maybeSingle()
  if (!own || own.opened_by !== user.id) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (!(await underHourlyLimit(`ticket-notify:${user.id}`, 20, false))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: claimed } = await admin.from('maintenance_tickets')
    .update({ counterpart_notified_at: new Date().toISOString() })
    .eq('id', ticketId).is('counterpart_notified_at', null).select('id')
  if (!claimed?.length) return NextResponse.json({ ok: true, already: true })

  const ctx = await ticketContext(admin, ticketId)
  if (!ctx) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const openerIsTenant = ctx.tenantAuthIds.includes(user.id)
  const emergency = ctx.ticket.priority === 'high' || isEmergencyMaintenance({ title: ctx.ticket.title, description: ctx.ticket.description ?? '', category: ctx.ticket.category })
  const unit = [ctx.household.address, ctx.household.unit ? `#${ctx.household.unit}` : null].filter(Boolean).join(' ')
  const url = `${SITE()}/h/${ctx.household.id}?tab=maintenance`
  const subject = `${emergency ? '【紧急】' : ''}报修工单 · ${unit} · ${ctx.ticket.title} — ${emergency ? 'URGENT ' : ''}Repair ticket`
  const who = openerIsTenant ? { zh: '租客', en: 'Your tenant' } : { zh: '房东', en: 'Your landlord' }
  const text = `你好，

${who.zh}在 Stayloop 在管租约里提交了一张报修工单：

  • 问题：${ctx.ticket.title}
  • 说明：${ctx.ticket.description || '（无）'}
  • 紧急程度：${emergency ? 'high（影响居住安全或基本服务）' : ctx.ticket.priority}

查看工单与照片、指派维修：${url}${emergency && openerIsTenant ? '\n按 RTA s.20 房东须保持单位适合居住；供暖、供水、燃气、门锁这类问题请今天联系租客。' : ''}

Hi,

${who.en} filed a repair ticket on your Stayloop tenancy hub:

  • Issue: ${ctx.ticket.title}
  • Details: ${ctx.ticket.description || '(none)'}
  • Priority: ${emergency ? 'high (habitability)' : ctx.ticket.priority}

See the ticket and photos: ${url}${emergency && openerIsTenant ? '\nUnder RTA s.20 heat, water, gas and locks cannot wait — please contact your tenant today.' : ''}`
  const { html, text: plain } = renderAgentMessageEmail({ subject, body: text })

  const sent: string[] = []
  if (openerIsTenant) {
    if (ctx.landlordAuthId) {
      const { data: ll } = await admin.auth.admin.getUserById(ctx.landlordAuthId)
      if (ll?.user?.email) { const r = await sendEmail({ to: ll.user.email, subject, html, text: plain }); if (r.ok) sent.push(ll.user.email) }
      await notifyUser(admin, ctx.landlordAuthId, { kind: 'event', title: emergency ? '紧急报修 / Urgent repair' : '新的报修工单 / New repair ticket', body: ctx.ticket.title, url: `/h/${ctx.household.id}?tab=maintenance` })
      await suggestDispatch(admin, ctx.landlordAuthId, ticketId)
    }
  } else {
    for (const email of ctx.tenantEmails) { const r = await sendEmail({ to: email, subject, html, text: plain }); if (r.ok) sent.push(email) }
    for (const uid of ctx.tenantAuthIds) await notifyUser(admin, uid, { kind: 'event', title: '房东登记了维修 / Repair logged', body: ctx.ticket.title, url: `/h/${ctx.household.id}?tab=maintenance` })
  }
  await admin.from('agent_audit_events').insert({ actor_id: user.id, actor_type: 'user', action: 'maintenance_ticket_notified', target_type: 'maintenance_ticket', target_id: ticketId, metadata: { household_id: ctx.household.id, opener: openerIsTenant ? 'tenant' : 'landlord', emailed: sent.length } })
  return NextResponse.json({ ok: true, emailed: sent.length })
}

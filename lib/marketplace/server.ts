// Server side of the marketplace (service role only): create a work order,
// apply an action, keep the ticket in step, write the event log, send the
// emails and cards. Routes and executors are thin wrappers around this.
// Rules live in ./workOrders (pure) and ./trades (pure).
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'
import { notifyUser } from '@/lib/push/notify'
import { canAct, entryNoticeText, invoiceWithinEstimate, TICKET_STATUS_FOR, validateQuote, type ActorKind, type WoAction, type WorkOrderStatus } from './workOrders'
import { tradeForCategory, type Trade } from './trades'

export type Admin = SupabaseClient
export const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')

export type WorkOrderRow = {
  id: string; ticket_id: string; household_id: string; landlord_auth_id: string; provider_id: string | null
  external_email: string | null; external_name: string | null; token: string | null; trade: string | null; scope: string | null
  emergency: boolean; entry_permission: string | null
  quote_amount: number | null; quote_type: string | null; quote_note: string | null; quote_valid_until: string | null; quoted_at: string | null
  approved_amount: number | null; approved_at: string | null; schedule_start: string | null; schedule_end: string | null; entry_notice_sent_at: string | null
  arrived_at: string | null; completed_at: string | null; completion_note: string | null; completion_photos: string[]
  invoice_amount: number | null; invoice_note: string | null; tenant_confirmed_at: string | null; accepted_at: string | null; accepted_by: string | null
  paid_at: string | null; payment_mode: string | null; dispute_reason: string | null; disputed_at: string | null; resolution_note: string | null; cancel_reason: string | null
  status: WorkOrderStatus; created_at: string; updated_at: string
}

const mintToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')

async function event(admin: Admin, woId: string, actorKind: ActorKind, actorId: string | null, ev: string, payload: Record<string, unknown> = {}) {
  await admin.from('work_order_events').insert({ work_order_id: woId, actor_kind: actorKind, actor_id: actorId, event: ev, payload })
}

async function setTicketStatus(admin: Admin, ticketId: string, status: WorkOrderStatus) {
  const t = TICKET_STATUS_FOR[status]
  if (!t) return
  await admin.from('maintenance_tickets').update({ status: t, resolved_at: t === 'done' ? new Date().toISOString() : null }).eq('id', ticketId)
}

/** Household + landlord + tenant contact for a ticket, resolved from membership (never from card metadata). */
export async function ticketContext(admin: Admin, ticketId: string): Promise<{ ticket: { id: string; title: string; description: string | null; category: string | null; priority: string; household_id: string; status: string }; household: { id: string; address: string; unit: string | null; city: string | null }; landlordAuthId: string | null; tenantEmails: string[]; tenantAuthIds: string[] } | null> {
  const { data: t } = await admin.from('maintenance_tickets').select('id, title, description, category, priority, household_id, status').eq('id', ticketId).maybeSingle()
  if (!t || !t.household_id) return null
  const { data: hh } = await admin.from('households').select('id, address, unit, city').eq('id', t.household_id).maybeSingle()
  if (!hh) return null
  const { data: members } = await admin.from('household_members').select('user_id, role').eq('household_id', hh.id).eq('status', 'active')
  const landlord = (members ?? []).find((m: { role: string }) => m.role === 'landlord' || m.role === 'property_manager') as { user_id: string } | undefined
  const tenantIds = ((members ?? []) as { user_id: string; role: string }[]).filter((m) => m.role === 'tenant').map((m) => m.user_id)
  const emails: string[] = []
  for (const uid of tenantIds) {
    const { data } = await admin.auth.admin.getUserById(uid)
    if (data?.user?.email) emails.push(data.user.email)
  }
  return { ticket: t as never, household: hh as never, landlordAuthId: landlord?.user_id ?? null, tenantEmails: emails, tenantAuthIds: tenantIds }
}

export type CreateInput = {
  ticketId: string
  landlordAuthId: string
  providerId?: string | null
  externalEmail?: string | null
  externalName?: string | null
  scope?: string | null
  entryPermission?: 'anytime' | 'call_first' | 'tenant_present' | null
  emergency?: boolean
  actor?: ActorKind
}

/** Step ③: create the offer and invite the contractor (email + push for providers with an account). */
export async function createWorkOrder(admin: Admin, i: CreateInput): Promise<{ ok: true; wo: WorkOrderRow } | { ok: false; error: string; status: number }> {
  const ctx = await ticketContext(admin, i.ticketId)
  if (!ctx) return { ok: false, error: 'ticket not found', status: 404 }
  if (ctx.landlordAuthId !== i.landlordAuthId) return { ok: false, error: 'not the landlord of this household', status: 403 }
  const { data: open } = await admin.from('work_orders').select('id, status').eq('ticket_id', i.ticketId).in('status', ['offered', 'quoted', 'scheduled', 'in_progress', 'completed', 'rework', 'disputed']).limit(1)
  if (open && open.length) return { ok: false, error: 'this ticket already has an open work order', status: 409 }
  type ProviderLite = { id: string; auth_id: string; legal_name: string; trade_name: string | null; contact_email: string | null; status: string }
  let provider: ProviderLite | null = null
  if (i.providerId) {
    const { data } = await admin.from('service_providers').select('id, auth_id, legal_name, trade_name, contact_email, status').eq('id', i.providerId).maybeSingle()
    const row = (data as ProviderLite | null) ?? null
    if (!row || row.status !== 'verified') return { ok: false, error: 'provider not verified', status: 422 }
    provider = row
  } else if (!i.externalEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.externalEmail)) {
    return { ok: false, error: 'provider_id or a valid external_email required', status: 400 }
  }
  const trade: Trade = tradeForCategory(ctx.ticket.category)
  const emergency = i.emergency ?? ctx.ticket.priority === 'high'
  const token = mintToken()
  const { data: wo, error } = await admin.from('work_orders').insert({
    ticket_id: i.ticketId, household_id: ctx.household.id, landlord_auth_id: i.landlordAuthId,
    provider_id: provider?.id ?? null, external_email: provider ? null : i.externalEmail!.trim().toLowerCase(), external_name: provider ? null : (i.externalName || '').trim().slice(0, 120) || null,
    token, trade, scope: (i.scope || ctx.ticket.title).slice(0, 2000), emergency, entry_permission: i.entryPermission ?? null, status: 'offered',
  }).select('*').single()
  if (error || !wo) return { ok: false, error: error?.message || 'insert failed', status: 500 }
  await event(admin, wo.id, i.actor ?? 'landlord', i.landlordAuthId, 'offered', { provider_id: provider?.id ?? null, external_email: wo.external_email, trade, emergency })
  await setTicketStatus(admin, i.ticketId, 'offered')

  const unit = [ctx.household.address, ctx.household.unit ? `#${ctx.household.unit}` : null].filter(Boolean).join(' ')
  const link = provider ? `${SITE()}/provider/jobs` : `${SITE()}/w/${token}`
  const subject = `${emergency ? '【紧急】' : ''}维修派单 · ${ctx.household.city || ''} · ${ctx.ticket.title} / ${emergency ? 'URGENT ' : ''}Work order`
  const body =
    `您好${provider ? `，${provider.trade_name || provider.legal_name}` : i.externalName ? `，${i.externalName}` : ''}，\n\n房东通过 Stayloop 向您派了一张维修工单：\n\n  • 问题：${ctx.ticket.title}\n  • 说明：${ctx.ticket.description || '（无）'}\n  • 位置：${ctx.household.city || ''}（详细地址接单后可见）\n  • 紧急程度：${emergency ? '紧急' : '一般'}\n  • 进入方式：${i.entryPermission === 'tenant_present' ? '须租客在场' : i.entryPermission === 'call_first' ? '进入前先电话' : '按 24 小时通知进入'}\n\n请打开链接接单并报价，或婉拒：\n${link}\n\n费用由房东承担；报价一经房东批准，最终账单不得超出报价 10%（安省《消费者保护法》）。\n\n` +
    `Hi${provider ? ` ${provider.trade_name || provider.legal_name}` : i.externalName ? ` ${i.externalName}` : ''},\n\nA landlord sent you a work order on Stayloop:\n\n  • Issue: ${ctx.ticket.title}\n  • Details: ${ctx.ticket.description || '(none)'}\n  • Location: ${ctx.household.city || ''} (full address after you accept)\n  • Urgency: ${emergency ? 'urgent' : 'normal'}\n\nOpen the link to accept with a quote, or decline:\n${link}\n\nThe landlord pays; once a quote is approved the invoice may not exceed it by more than 10% (Ontario Consumer Protection Act).`
  const to = provider ? (provider.contact_email || null) : wo.external_email
  if (to) {
    const { html, text } = renderAgentMessageEmail({ subject, body })
    await sendEmail({ to, subject, html, text })
  }
  if (provider?.auth_id) void notifyUser(admin, provider.auth_id, { kind: 'approval', title: `新工单 / New work order · ${ctx.ticket.title}`, body: unit, url: '/provider/jobs' })
  return { ok: true, wo: wo as WorkOrderRow }
}

export type ActInput = {
  woId: string
  action: WoAction
  by: ActorKind
  actorId: string | null
  payload?: Record<string, unknown>
}

/** Every transition after the offer. Validates the actor + state, writes the row, event, ticket status, emails and cards. */
export async function actOnWorkOrder(admin: Admin, i: ActInput): Promise<{ ok: true; wo: WorkOrderRow } | { ok: false; error: string; status: number }> {
  const { data: wo } = await admin.from('work_orders').select('*').eq('id', i.woId).maybeSingle<WorkOrderRow>()
  if (!wo) return { ok: false, error: 'work order not found', status: 404 }
  const gate = canAct(i.action, wo.status, i.by)
  if (!gate.ok) return { ok: false, error: gate.reason || 'not allowed', status: 409 }
  const p = i.payload || {}
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: gate.to }
  const evPayload: Record<string, unknown> = {}

  switch (i.action) {
    case 'accept':
    case 'quote': {
      const q = validateQuote({ amount: Number(p.amount), type: p.type as never, note: String(p.note || ''), valid_until: p.valid_until ? String(p.valid_until) : undefined, schedule_start: p.schedule_start ? String(p.schedule_start) : undefined, schedule_end: p.schedule_end ? String(p.schedule_end) : undefined })
      if (!q.ok) return { ok: false, error: `quote_${q.reason}`, status: 400 }
      Object.assign(patch, { quote_amount: q.value!.amount, quote_type: q.value!.type, quote_note: q.value!.note ?? null, quote_valid_until: q.value!.valid_until ?? null, quoted_at: now, schedule_start: q.value!.schedule_start ?? null, schedule_end: q.value!.schedule_end ?? null })
      Object.assign(evPayload, q.value)
      break
    }
    case 'decline':
    case 'cancel':
      patch.cancel_reason = String(p.reason || '').slice(0, 1000) || null
      evPayload.reason = patch.cancel_reason
      break
    case 'approve_quote':
      Object.assign(patch, { approved_amount: wo.quote_amount, approved_at: now })
      break
    case 'reject_quote':
      patch.cancel_reason = String(p.reason || 'quote rejected').slice(0, 1000)
      break
    case 'arrive':
      patch.arrived_at = now
      break
    case 'complete': {
      const invoice = p.invoice_amount == null || p.invoice_amount === '' ? null : Number(p.invoice_amount)
      if (invoice != null && (!Number.isFinite(invoice) || invoice < 0)) return { ok: false, error: 'invoice_amount', status: 400 }
      const photos = Array.isArray(p.photos) ? (p.photos as unknown[]).filter((x) => typeof x === 'string').slice(0, 12) as string[] : []
      Object.assign(patch, { completed_at: now, completion_note: String(p.note || '').slice(0, 2000) || null, completion_photos: photos, invoice_amount: invoice, invoice_note: String(p.invoice_note || '').slice(0, 1000) || null })
      const cpa = invoiceWithinEstimate(wo.approved_amount, invoice)
      Object.assign(evPayload, { invoice_amount: invoice, over_estimate_pct: cpa.ok ? null : cpa.overBy })
      break
    }
    case 'tenant_confirm':
      patch.tenant_confirmed_at = now
      break
    case 'accept_completion':
      Object.assign(patch, { accepted_at: now, accepted_by: i.actorId })
      break
    case 'request_rework':
      patch.resolution_note = String(p.reason || '').slice(0, 2000) || null
      evPayload.reason = patch.resolution_note
      break
    case 'dispute':
      Object.assign(patch, { dispute_reason: String(p.reason || '').slice(0, 2000) || null, disputed_at: now, disputed_by: i.actorId })
      evPayload.reason = patch.dispute_reason
      break
    case 'resolve_dispute':
      Object.assign(patch, { resolution_note: String(p.note || '').slice(0, 2000) || null, accepted_at: wo.accepted_at ?? now })
      break
    case 'mark_paid':
      Object.assign(patch, { paid_at: now, payment_mode: 'offline' })
      break
    case 'close':
      break
  }
  const { data: updated, error } = await admin.from('work_orders').update(patch).eq('id', wo.id).eq('status', wo.status).select('*').maybeSingle<WorkOrderRow>()
  if (error || !updated) return { ok: false, error: error?.message || 'state changed, retry', status: 409 }
  await event(admin, wo.id, i.by, i.actorId, i.action, evPayload)
  if (gate.to !== wo.status) await setTicketStatus(admin, wo.ticket_id, gate.to!)
  await sideEffects(admin, updated, i)
  return { ok: true, wo: updated }
}

async function providerLabel(admin: Admin, wo: WorkOrderRow): Promise<{ name: string; email: string | null; authId: string | null }> {
  if (wo.provider_id) {
    const { data } = await admin.from('service_providers').select('legal_name, trade_name, contact_email, auth_id').eq('id', wo.provider_id).maybeSingle()
    if (data) return { name: data.trade_name || data.legal_name, email: data.contact_email, authId: data.auth_id }
  }
  return { name: wo.external_name || wo.external_email || 'Contractor', email: wo.external_email, authId: null }
}

/** Emails / cards after a transition. Never throws — the state change already happened. */
async function sideEffects(admin: Admin, wo: WorkOrderRow, i: ActInput): Promise<void> {
  try {
    const ctx = await ticketContext(admin, wo.ticket_id)
    if (!ctx) return
    const unit = [ctx.household.address, ctx.household.unit ? `#${ctx.household.unit}` : null].filter(Boolean).join(' ')
    const prov = await providerLabel(admin, wo)
    const money = (n: number | null) => (n == null ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    const landlordUrl = `/h/${wo.household_id}?tab=maintenance`

    if (i.action === 'accept' || i.action === 'quote') {
      // Step ⑤ card for the landlord: approve the quote (executor sends the entry notice).
      const { data: existing } = await admin.from('agent_pending_actions').select('id').eq('user_id', wo.landlord_auth_id).eq('action_type', 'approve_quote').eq('status', 'pending').contains('metadata', { work_order_id: wo.id }).limit(1)
      const title = `批准报价：${prov.name} · ${money(wo.quote_amount)} · ${ctx.ticket.title}`
      const summary = `${prov.name} 对「${ctx.ticket.title}」（${unit}）报价 ${money(wo.quote_amount)}${wo.quote_type === 'hourly_estimate' ? '（按工时估算）' : '（固定价）'}${wo.schedule_start ? `，可到场 ${new Date(wo.schedule_start).toLocaleString('en-CA', { timeZone: 'America/Toronto' })}` : ''}。${wo.quote_note ? `说明：${wo.quote_note} ` : ''}批准后：${wo.emergency ? '紧急件按 RTA s.26 可不提前通知，仍会通知租客。' : '我会给租客发 RTA s.27 的 24 小时进入通知。'}最终账单不得超出报价 10%。`
      if (existing && existing.length) {
        await admin.from('agent_pending_actions').update({ title, summary }).eq('id', existing[0].id)
      } else {
        await admin.from('agent_pending_actions').insert({
          user_id: wo.landlord_auth_id, role: 'landlord', action_type: 'approve_quote', title, summary,
          recipient_label: ctx.tenantEmails[0] ?? null, data_scope: ['工单', '报价', '进入时间'], excluded_data: ['租约', '筛查报告'], risk_level: 'low', status: 'pending', requires_approval: true,
          metadata: { work_order_id: wo.id, ticket_id: wo.ticket_id, household_id: wo.household_id, source: 'work_order' },
        })
      }
      void notifyUser(admin, wo.landlord_auth_id, { kind: 'approval', title: `报价 ${money(wo.quote_amount)} · ${ctx.ticket.title}`, body: prov.name, url: '/landlord/todo' })
    }
    if (i.action === 'decline') {
      void notifyUser(admin, wo.landlord_auth_id, { kind: 'event', title: `服务商婉拒 · ${ctx.ticket.title}`, body: prov.name, url: landlordUrl })
    }
    if (i.action === 'approve_quote') {
      // Entry notice to the tenant (RTA s.27 / s.26) + tell the contractor.
      const notice = entryNoticeText({ unit, scheduleStart: wo.schedule_start, scheduleEnd: wo.schedule_end, provider: prov.name, scope: ctx.ticket.title, entryPermission: wo.entry_permission, emergency: wo.emergency })
      if (ctx.tenantEmails.length) {
        const { html, text } = renderAgentMessageEmail({ subject: notice.subject, body: notice.body })
        const r = await sendEmail({ to: ctx.tenantEmails, subject: notice.subject, html, text })
        if (r.ok) await admin.from('work_orders').update({ entry_notice_sent_at: new Date().toISOString() }).eq('id', wo.id)
        await admin.from('compliance_events').insert({ user_id: wo.landlord_auth_id, role: 'landlord', source: 'work_order', rule_id: wo.emergency ? 'RTA-26-emergency-entry' : 'RTA-27-entry-notice', severity: 'info', target_type: 'work_order', target_id: wo.id, metadata: { household_id: wo.household_id, notice_sent: true } }).then(() => undefined, () => undefined)
      }
      for (const uid of ctx.tenantAuthIds) void notifyUser(admin, uid, { kind: 'event', title: `进入通知 · ${ctx.ticket.title}`, body: notice.subject, url: `/h/${wo.household_id}` })
      const cSubject = `报价已批准 · ${ctx.ticket.title} · ${unit} / Quote approved`
      const cBody = `房东已批准您的报价 ${money(wo.approved_amount)}。地址：${unit}。${wo.entry_permission === 'tenant_present' ? '须租客在场。' : wo.entry_permission === 'call_first' ? '进入前请先电话联系租客。' : ''}到场后请在工单页点「已到场」，完工后上传说明与账单。\n${wo.provider_id ? `${SITE()}/provider/jobs` : `${SITE()}/w/${wo.token}`}\n\nQuote ${money(wo.approved_amount)} approved. Address: ${unit}. Tap "Arrived" on the job page when on site; add notes and the invoice when done.`
      if (prov.email) { const { html, text } = renderAgentMessageEmail({ subject: cSubject, body: cBody }); await sendEmail({ to: prov.email, subject: cSubject, html, text }) }
      if (prov.authId) void notifyUser(admin, prov.authId, { kind: 'event', title: '报价已批准 / Quote approved', body: `${ctx.ticket.title} · ${unit}`, url: '/provider/jobs' })
    }
    if (i.action === 'reject_quote' || i.action === 'cancel') {
      const subj = `工单已取消 · ${ctx.ticket.title} / Work order cancelled`
      if (prov.email && i.by === 'landlord') { const { html, text } = renderAgentMessageEmail({ subject: subj, body: `房东取消了这张工单。${wo.cancel_reason ? `原因：${wo.cancel_reason}` : ''}\n\nThe landlord cancelled this work order.` }); await sendEmail({ to: prov.email, subject: subj, html, text }) }
      if (i.by !== 'landlord') void notifyUser(admin, wo.landlord_auth_id, { kind: 'event', title: `服务商取消 · ${ctx.ticket.title}`, body: prov.name, url: landlordUrl })
    }
    if (i.action === 'arrive') {
      for (const uid of ctx.tenantAuthIds) void notifyUser(admin, uid, { kind: 'event', title: `服务商已到场 · ${ctx.ticket.title}`, body: prov.name, url: `/h/${wo.household_id}` })
      void notifyUser(admin, wo.landlord_auth_id, { kind: 'event', title: `已到场 · ${ctx.ticket.title}`, body: prov.name, url: landlordUrl })
    }
    if (i.action === 'complete') {
      const cpa = invoiceWithinEstimate(wo.approved_amount, wo.invoice_amount)
      const title = `验收完工：${prov.name} · ${ctx.ticket.title}${wo.invoice_amount != null ? ` · 账单 ${money(wo.invoice_amount)}` : ''}`
      const summary = `${prov.name} 报告「${ctx.ticket.title}」（${unit}）已完工。${wo.completion_note ? `说明：${wo.completion_note} ` : ''}${wo.invoice_amount != null ? `账单 ${money(wo.invoice_amount)}（批准报价 ${money(wo.approved_amount)}）。` : ''}${cpa.ok ? '' : `⚠ 账单超出批准报价 ${cpa.overBy}%，超过《消费者保护法》允许的 10%，除非你批准过增项——请先核对。`}${wo.tenant_confirmed_at ? '租客已确认问题解决。' : '租客尚未确认，可以先问租客。'}批准 = 验收；不满意请在工单页选「要求返工」或「争议」。`
      await admin.from('agent_pending_actions').insert({
        user_id: wo.landlord_auth_id, role: 'landlord', action_type: 'accept_completion', title, summary,
        recipient_label: null, data_scope: ['完工说明', '账单'], excluded_data: ['租约', '筛查报告'], risk_level: cpa.ok ? 'low' : 'medium', status: 'pending', requires_approval: true,
        metadata: { work_order_id: wo.id, ticket_id: wo.ticket_id, household_id: wo.household_id, source: 'work_order' },
      })
      void notifyUser(admin, wo.landlord_auth_id, { kind: 'approval', title: `完工待验收 · ${ctx.ticket.title}`, body: prov.name, url: '/landlord/todo' })
      for (const uid of ctx.tenantAuthIds) void notifyUser(admin, uid, { kind: 'approval', title: `问题解决了吗？· ${ctx.ticket.title}`, body: '请在租约页确认 / Please confirm on your tenancy page', url: `/h/${wo.household_id}?tab=maintenance` })
    }
    if (i.action === 'tenant_confirm') {
      void notifyUser(admin, wo.landlord_auth_id, { kind: 'event', title: `租客确认已解决 · ${ctx.ticket.title}`, body: unit, url: landlordUrl })
    }
    if (i.action === 'accept_completion' || i.action === 'request_rework' || i.action === 'mark_paid') {
      const label = i.action === 'accept_completion' ? '房东已验收 / Accepted' : i.action === 'request_rework' ? `房东要求返工 / Rework requested${wo.resolution_note ? `：${wo.resolution_note}` : ''}` : '房东已标记付款 / Marked as paid'
      if (prov.email) { const { html, text } = renderAgentMessageEmail({ subject: `${label} · ${ctx.ticket.title}`, body: `${label}\n${ctx.ticket.title} · ${unit}\n${wo.provider_id ? `${SITE()}/provider/jobs` : `${SITE()}/w/${wo.token}`}` }); await sendEmail({ to: prov.email, subject: `${label} · ${ctx.ticket.title}`, html, text }) }
      if (prov.authId) void notifyUser(admin, prov.authId, { kind: 'event', title: label, body: ctx.ticket.title, url: '/provider/jobs' })
    }
    if (i.action === 'dispute') {
      void notifyUser(admin, wo.landlord_auth_id, { kind: 'event', title: `工单进入争议 · ${ctx.ticket.title}`, body: wo.dispute_reason || '', url: landlordUrl })
    }
  } catch (e) {
    console.warn('[marketplace] side effects failed:', (e as Error).message)
  }
}

/** Public token view for an external contractor (no account): what they may see before / after accepting. */
export async function peekByToken(admin: Admin, token: string): Promise<{ wo: WorkOrderRow; ticket: { title: string; description: string | null; category: string | null; priority: string }; address: { city: string | null; full: string | null }; landlordEmail: string | null } | null> {
  if (!/^[A-Za-z0-9]{32,}$/.test(token)) return null
  const { data: wo } = await admin.from('work_orders').select('*').eq('token', token).maybeSingle<WorkOrderRow>()
  if (!wo) return null
  const ctx = await ticketContext(admin, wo.ticket_id)
  if (!ctx) return null
  const accepted = !['offered', 'declined', 'cancelled', 'expired'].includes(wo.status)
  let landlordEmail: string | null = null
  if (accepted) { const { data } = await admin.auth.admin.getUserById(wo.landlord_auth_id); landlordEmail = data?.user?.email ?? null }
  return { wo, ticket: { title: ctx.ticket.title, description: ctx.ticket.description, category: ctx.ticket.category, priority: ctx.ticket.priority }, address: { city: ctx.household.city, full: accepted ? [ctx.household.address, ctx.household.unit ? `#${ctx.household.unit}` : null, ctx.household.city].filter(Boolean).join(', ') : null }, landlordEmail }
}

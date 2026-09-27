// Services marketplace · daily sweep (节点 3 「可执行」, 2026-09-26). Runs in
// the proactive cron (service role) after the renewal sweep:
//
//   1. Overdue quotes — an offer past its quote_due_at with no answer is
//      stamped sla_overdue_at once, the contractor is reminded (email + push),
//      the timeline gets a system `quote_overdue` event and the landlord gets a
//      `work_order_overdue` card: approval = cancel the offer and re-suggest
//      (never the same contractor); rejection = keep waiting.
//   2. Credential expiry ladder — 90 / 60 / 30 / 7 days before a credential
//      expires, and once on expiry, the provider gets one email + push listing
//      what expires and what it costs them (coverage → no dispatch). Each tier
//      goes out once (provider_credentials.reminders_sent).
//
// Idempotent by construction: both passes only touch rows that carry no stamp
// for the step they are about to take.
import { sendEmail, renderAgentMessageEmail } from '@/lib/email'
import { notifyUser } from '@/lib/push/notify'
import { dueReminder, type ReminderTier } from './sla'
import { CREDENTIAL_LABEL, type CredentialKind } from './trades'
import { providerLabel, SITE, ticketContext, type Admin, type WorkOrderRow } from './server'

const fmt = (iso: string, zh: boolean) => new Date(iso).toLocaleString(zh ? 'zh-CN' : 'en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' })

export async function sweepOverdueQuotes(admin: Admin, now = new Date()): Promise<{ overdue: number; cards: number }> {
  const { data: rows } = await admin.from('work_orders').select('*').eq('status', 'offered').is('sla_overdue_at', null).lt('quote_due_at', now.toISOString()).order('quote_due_at', { ascending: true }).limit(100)
  let overdue = 0, cards = 0
  for (const wo of (rows ?? []) as WorkOrderRow[]) {
    // Stamp first; whoever stamps handles the row (a second sweep in flight skips it).
    const { data: hit } = await admin.from('work_orders').update({ sla_overdue_at: now.toISOString() }).eq('id', wo.id).eq('status', 'offered').is('sla_overdue_at', null).select('id')
    if (!hit || !hit.length) continue
    overdue++
    await admin.from('work_order_events').insert({ work_order_id: wo.id, actor_kind: 'system', actor_id: null, event: 'quote_overdue', payload: { due_at: wo.quote_due_at } })
    const ctx = await ticketContext(admin, wo.ticket_id)
    if (!ctx) continue
    const prov = await providerLabel(admin, wo)
    const hours = wo.quote_due_at ? Math.max(1, Math.round((now.getTime() - new Date(wo.quote_due_at).getTime()) / 3_600_000)) : 0
    const link = wo.provider_id ? `${SITE()}/provider/jobs` : wo.token ? `${SITE()}/w/${wo.token}` : SITE()
    // Remind the contractor: this is their own obligation, no approval involved.
    if (prov.email) {
      const subject = `报价已逾期 · ${ctx.ticket.title} / Quote overdue`
      const body =
        `您好${prov.name ? `，${prov.name}` : ''}，\n\n房东 ${wo.quote_due_at ? fmt(wo.quote_due_at, true) : ''} 前等着您对「${ctx.ticket.title}」（${ctx.household.city || ''}）的回应，现已逾期 ${hours} 小时。请今天内接单并报价、或选原因婉拒；否则房东可能改派他人。\n${link}\n\n` +
        `Hi${prov.name ? ` ${prov.name}` : ''},\n\nThe landlord was waiting for your answer on "${ctx.ticket.title}" (${ctx.household.city || ''}) by ${wo.quote_due_at ? fmt(wo.quote_due_at, false) : ''}; it is now ${hours} h overdue. Please accept with a quote or decline (with a reason) today, or the landlord may reassign the job.\n${link}`
      const { html, text } = renderAgentMessageEmail({ subject, body })
      await sendEmail({ to: prov.email, subject, html, text })
    }
    if (prov.authId) void notifyUser(admin, prov.authId, { kind: 'approval', title: `报价已逾期 ${hours} 小时 / Quote overdue`, body: ctx.ticket.title, url: '/provider/jobs' })
    // The landlord's card: approve = withdraw this offer and get the next candidate.
    const { data: existing } = await admin.from('agent_pending_actions').select('id').eq('user_id', wo.landlord_auth_id).eq('action_type', 'work_order_overdue').eq('status', 'pending').contains('metadata', { work_order_id: wo.id }).limit(1)
    if (!existing || !existing.length) {
      const unit = [ctx.household.address, ctx.household.unit ? `#${ctx.household.unit}` : null].filter(Boolean).join(' ')
      await admin.from('agent_pending_actions').insert({
        user_id: wo.landlord_auth_id, role: 'landlord', action_type: 'work_order_overdue',
        title: `${prov.name} 逾期 ${hours} 小时未报价：${ctx.ticket.title} · 改派？`,
        summary: `你 ${fmt(wo.created_at, true)} 把「${ctx.ticket.title}」（${unit}）派给了 ${prov.name}，要求 ${wo.quote_due_at ? fmt(wo.quote_due_at, true) : ''} 前回应，至今没有接单也没有婉拒。我已经提醒了对方。批准 = 撤回这张派单并按你的派单策略给你下一位候选（不会再派给同一家）；拒绝 = 继续等。${wo.emergency ? '这是紧急件，建议尽快改派。' : ''}`,
        recipient_label: prov.name, data_scope: ['工单', '派单时间'], excluded_data: ['租约', '筛查报告', '租金记录'], risk_level: 'low', status: 'pending', requires_approval: true,
        metadata: { work_order_id: wo.id, ticket_id: wo.ticket_id, household_id: wo.household_id, provider_id: wo.provider_id, quote_due_at: wo.quote_due_at, overdue_hours: hours, source: 'work_order' },
      })
      cards++
      void notifyUser(admin, wo.landlord_auth_id, { kind: 'approval', title: `服务商逾期未报价 · ${ctx.ticket.title}`, body: `${prov.name} · 改派？`, url: '/landlord/todo' })
    }
    await admin.from('agent_audit_events').insert({ actor_id: wo.landlord_auth_id, actor_type: 'system', action: 'work_order_quote_overdue', target_type: 'work_order', target_id: wo.id, acting_role: 'landlord', matter_type: 'work_order', matter_id: wo.id, metadata: { provider_id: wo.provider_id, quote_due_at: wo.quote_due_at, overdue_hours: hours } }).then(() => undefined, () => undefined)
  }
  return { overdue, cards }
}

type CredRow = { id: string; provider_id: string; kind: CredentialKind; expires_at: string; reminders_sent: number[] | null }
type ProvRow = { id: string; auth_id: string | null; legal_name: string; trade_name: string | null; contact_email: string | null; status: string }

export async function sweepCredentialReminders(admin: Admin, today = new Date()): Promise<{ providers: number; credentials: number }> {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const iso = (d: number) => new Date(t + d * 86_400_000).toISOString().slice(0, 10)
  const { data: creds } = await admin.from('provider_credentials').select('id, provider_id, kind, expires_at, reminders_sent').not('expires_at', 'is', null).lte('expires_at', iso(90)).gte('expires_at', iso(-30)).limit(500)
  const list = (creds ?? []) as CredRow[]
  if (!list.length) return { providers: 0, credentials: 0 }
  const ids = Array.from(new Set(list.map((c) => c.provider_id)))
  const { data: provs } = await admin.from('service_providers').select('id, auth_id, legal_name, trade_name, contact_email, status').in('id', ids).in('status', ['verified', 'pending'])
  const byId = new Map(((provs ?? []) as ProvRow[]).map((p) => [p.id, p]))
  const perProvider = new Map<string, { kind: CredentialKind; expires_at: string; daysLeft: number; tier: ReminderTier }[]>()
  let credentials = 0
  for (const c of list) {
    const prov = byId.get(c.provider_id)
    if (!prov) continue
    const due = dueReminder(c.expires_at, c.reminders_sent ?? [], today)
    if (due.send == null) continue
    const merged = Array.from(new Set([...(c.reminders_sent ?? []), ...due.mark])).sort((a, b) => b - a)
    const { data: hit } = await admin.from('provider_credentials').update({ reminders_sent: merged }).eq('id', c.id).select('id')
    if (!hit || !hit.length) continue
    credentials++
    perProvider.set(prov.id, [...(perProvider.get(prov.id) ?? []), { kind: c.kind, expires_at: c.expires_at, daysLeft: due.daysLeft, tier: due.send }])
  }
  for (const [pid, items] of perProvider) {
    const prov = byId.get(pid)!
    const name = prov.trade_name || prov.legal_name
    const zhLines = items.map((i) => `  • ${CREDENTIAL_LABEL[i.kind]?.zh ?? i.kind} · 到期 ${i.expires_at}（${i.daysLeft < 0 ? `已过期 ${-i.daysLeft} 天` : i.daysLeft === 0 ? '今天到期' : `还有 ${i.daysLeft} 天`}）`).join('\n')
    const enLines = items.map((i) => `  • ${CREDENTIAL_LABEL[i.kind]?.en ?? i.kind} · expires ${i.expires_at} (${i.daysLeft < 0 ? `expired ${-i.daysLeft} day(s) ago` : i.daysLeft === 0 ? 'expires today' : `${i.daysLeft} day(s) left`})`).join('\n')
    const worst = Math.min(...items.map((i) => i.daysLeft))
    const subject = worst < 0 ? `资质已过期 · 派单已跳过你 / Credential expired · dispatch paused` : `资质 ${worst} 天后到期 / Credential expires in ${worst} day(s)`
    const body =
      `您好，${name}，\n\n${zhLines}\n\n到期的资质不再计入工种覆盖，派单会跳过你，直到你在入驻页更新编号与到期日并由 Stayloop 重新核验。更新：${SITE()}/provider/onboard\n\n` +
      `Hi ${name},\n\n${enLines}\n\nAn expired credential no longer counts toward trade coverage and dispatch skips you until you update the number and expiry on the onboarding page and Stayloop re-verifies it. Update: ${SITE()}/provider/onboard`
    if (prov.contact_email) { const { html, text } = renderAgentMessageEmail({ subject, body }); await sendEmail({ to: prov.contact_email, subject, html, text }) }
    if (prov.auth_id) {
      void notifyUser(admin, prov.auth_id, { kind: 'approval', title: subject, body: items.map((i) => CREDENTIAL_LABEL[i.kind]?.zh ?? i.kind).join(' · '), url: '/provider/onboard' })
      await admin.from('agent_audit_events').insert({ actor_id: prov.auth_id, actor_type: 'system', action: 'credential_expiry_reminder', target_type: 'service_provider', target_id: prov.id, acting_role: 'provider', metadata: { items } }).then(() => undefined, () => undefined)
    }
  }
  return { providers: perProvider.size, credentials }
}

export async function runMarketplaceSweep(admin: Admin, now = new Date()): Promise<{ overdue: number; cards: number; reminder_providers: number; reminder_credentials: number }> {
  const a = await sweepOverdueQuotes(admin, now)
  const b = await sweepCredentialReminders(admin, now)
  return { overdue: a.overdue, cards: a.cards, reminder_providers: b.providers, reminder_credentials: b.credentials }
}

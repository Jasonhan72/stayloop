// /api/cron/agent-routines — runs the routines that are due (第三批 ⑥, 2026-10-25).
//
//   • Cron mode (x-cron-secret = CRON_SECRET, hourly at :10 from pg_cron): every enabled routine
//     with next_run_at <= now, across users, service role.
//   • Signed-in mode ({ id } with the owner's JWT): run ONE of the caller's own routines now
//     (the panel's 「现在运行」); the row's next_run_at is left alone.
//
// What a run does depends on the kind (lib/agent/routines.ts):
//   reach 'others' (rent_reminder_cards) → the usual approval cards, attached to the 主对话 —
//     nothing reaches a tenant until the landlord approves; the executor is unchanged.
//   reach 'self' → one assistant message in the person's 主对话 (with a receipt card) and a push.
// Each run writes last_run_at / last_result on the row and a `routine_ran` audit event, so the
// panel's timeline lists it. Nothing here moves money or touches LTB forms.
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { IN_FORCE_STATUSES } from '@/lib/agent/renewalStages'
import { ensureMainThread } from '@/lib/agent/mainThread'
import { appendToThread } from '@/lib/agent/threads'
import { daysUntilDueDay, dueDateIso, nextRunAt, routineDef, torontoParts, type RoutineRow } from '@/lib/agent/routines'
import type { ChatMessage } from '@/lib/agent/types'
import { notifyUser } from '@/lib/push/notify'

const NO_STORE = { 'Cache-Control': 'no-store' }
const ROW_COLS = 'id, user_id, role, kind, title, params, schedule, next_run_at, last_run_at, last_result, enabled, created_at'
type Row = RoutineRow & { user_id: string }
type RunResult = { ok: boolean; count: number; note: string; cards?: number }

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const money = (n: number | null | undefined) => `$${Number(n ?? 0).toLocaleString()}`
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d)

async function landlordIds(svc: SupabaseClient, uid: string): Promise<string[]> {
  const { data } = await svc.from('landlords').select('id').or(`id.eq.${uid},auth_id.eq.${uid}`)
  return Array.from(new Set([uid, ...((data ?? []) as { id: string }[]).map((r) => r.id)]))
}
async function userEmail(svc: SupabaseClient, uid: string): Promise<string | null> {
  const { data } = await svc.auth.admin.getUserById(uid)
  return data?.user?.email?.toLowerCase() ?? null
}

/** A report to the person: an assistant message in the 主对话 (with a receipt) + a push. */
async function report(svc: SupabaseClient, r: Row, lines: string[], readLine: { zh: string; en: string }, push: { title: string; body: string }): Promise<string | null> {
  const mainId = await ensureMainThread(svc, r.user_id, r.role)
  if (mainId) {
    const msg: ChatMessage = {
      id: `rt-${r.id.slice(0, 8)}-${Date.now().toString(36)}`, role: 'agent',
      text: `⏱ 例行任务「${r.title}」\n${lines.filter(Boolean).join('\n')}\n\n办完了。`,
      receipt: { read: [{ kind: 'snapshot', ...readLine }], did: [{ kind: 'routine', zh: `按例行任务「${r.title}」汇报`, en: `Reported for the routine “${r.title}”` }] },
    }
    await appendToThread(svc, mainId, [msg])
  }
  await notifyUser(svc, r.user_id, { kind: 'event', title: push.title.slice(0, 80), body: push.body.slice(0, 120), url: `/${r.role}/agent${mainId ? `?thread=${mainId}` : ''}` }).catch(() => 0)
  return mainId
}

async function runOne(svc: SupabaseClient, r: Row, now: Date): Promise<RunResult> {
  const def = routineDef(r.role, r.kind)
  if (!def) return { ok: false, count: 0, note: 'unknown kind' }
  const p = { ...def.params, ...(r.params as Record<string, number>) }
  const todayIso = now.toISOString().slice(0, 10)

  if (r.kind === 'rent_reminder_cards') {
    const dueDay = Math.min(28, Math.max(1, num(p.due_day, 1)))
    const left = daysUntilDueDay(dueDay, now)
    if (left > num(p.days_before, 3)) return { ok: true, count: 0, note: `due in ${left} days — not yet` }
    const dueDate = dueDateIso(dueDay, now)
    const ids = await landlordIds(svc, r.user_id)
    const { data: leases } = await svc.from('lease_documents').select('id, tenant_name, tenant_email, unit_label, monthly_rent, status, end_date').in('landlord_id', ids).in('status', [...IN_FORCE_STATUSES]).limit(50)
    const live = ((leases ?? []) as { id: string; tenant_name: string | null; tenant_email: string | null; unit_label: string | null; monthly_rent: number | null; end_date: string | null }[]).filter((l) => l.tenant_email && (!l.end_date || l.end_date >= todayIso))
    if (!live.length) return { ok: true, count: 0, note: 'no lease in force with a tenant email' }
    const { data: existing } = await svc.from('agent_pending_actions').select('metadata').eq('user_id', r.user_id).eq('action_type', 'rent_reminder').in('status', ['pending', 'approved', 'executed']).gte('created_at', new Date(now.getTime() - 40 * 86_400_000).toISOString())
    const seen = new Set(((existing ?? []) as { metadata: Record<string, unknown> | null }[]).map((e) => `${e.metadata?.lease_id}:${e.metadata?.due_date}`))
    const mainId = await ensureMainThread(svc, r.user_id, r.role)
    const inserts = live.filter((l) => !seen.has(`${l.id}:${dueDate}`)).map((l) => ({
      user_id: r.user_id, role: 'landlord', action_type: 'rent_reminder',
      title: `租金提醒：${l.tenant_name || '租客'} · ${dueDate} 应付 / Rent reminder`,
      summary: `${l.unit_label || '你的单元'} 月租 ${money(l.monthly_rent)}，${dueDate} 到期。批准后我会给 ${l.tenant_email} 发送一封友好的双语提醒邮件。 / Friendly bilingual reminder for ${l.unit_label || 'the unit'} (${money(l.monthly_rent)}/mo, due ${dueDate}) — emailed to ${l.tenant_email} after your approval.`,
      recipient_label: l.tenant_email, data_scope: ['租金金额', '应付日期'], excluded_data: ['筛查报告', '支付历史'], risk_level: 'low', status: 'pending', requires_approval: true,
      metadata: { lease_id: l.id, tenant_name: l.tenant_name, tenant_email: l.tenant_email, unit_label: l.unit_label, rent: l.monthly_rent, due_date: dueDate, source: 'routine', routine_id: r.id, thread_id: mainId },
    }))
    if (!inserts.length) return { ok: true, count: 0, note: 'cards for this due date already exist', cards: 0 }
    const { error } = await svc.from('agent_pending_actions').insert(inserts)
    if (error) return { ok: false, count: 0, note: error.message.slice(0, 120) }
    await notifyUser(svc, r.user_id, { kind: 'approval', title: `租金提醒待批 · ${inserts.length} 张 / Rent reminders to approve`, body: `${dueDate} 应付 · 例行任务「${r.title}」`, url: `/landlord/todo` }).catch(() => 0)
    return { ok: true, count: inserts.length, note: `${inserts.length} card(s) for ${dueDate}`, cards: inserts.length }
  }

  if (r.kind === 'renewal_window_check') {
    const ids = await landlordIds(svc, r.user_id)
    const horizon = new Date(now.getTime() + 120 * 86_400_000).toISOString().slice(0, 10)
    const { data } = await svc.from('lease_documents').select('tenant_name, unit_label, monthly_rent, end_date').in('landlord_id', ids).in('status', [...IN_FORCE_STATUSES]).gte('end_date', todayIso).lte('end_date', horizon).order('end_date').limit(20)
    const rows = (data ?? []) as { tenant_name: string | null; unit_label: string | null; monthly_rent: number | null; end_date: string }[]
    const lines = rows.length ? rows.map((l) => `· ${l.unit_label || '?'} · ${l.tenant_name || '?'} · ${money(l.monthly_rent)}/月 · ${l.end_date} 到期`) : ['· 120 天内没有到期的租约。']
    await report(svc, r, [`120 天内到期的租约：${rows.length} 份`, ...lines, rows.length ? '续约要提前 90 天：去 /landlord/leases 看每份的 N1 / N2 期限。' : ''], { zh: `读了你的租约 ${rows.length} 份（120 天窗口）`, en: `Read ${rows.length} lease(s) in the 120-day window` }, { title: `续约窗口 · ${rows.length} 份 / Renewal window`, body: rows.map((l) => `${l.unit_label || '?'} ${l.end_date}`).join(' · ') || '无' })
    return { ok: true, count: rows.length, note: `${rows.length} lease(s) in window` }
  }

  if (r.kind === 'applications_digest') {
    const ids = await landlordIds(svc, r.user_id)
    const since = r.last_run_at ?? new Date(now.getTime() - 7 * 86_400_000).toISOString()
    const { data: ls } = await svc.from('listings').select('id, address, unit').in('landlord_id', ids).limit(200)
    const listingIds = ((ls ?? []) as { id: string }[]).map((l) => l.id)
    const byId = new Map(((ls ?? []) as { id: string; address: string; unit: string | null }[]).map((l) => [l.id, `${l.address}${l.unit ? ` #${l.unit}` : ''}`]))
    const { data: apps } = listingIds.length ? await svc.from('applications').select('first_name, last_name, status, created_at, listing_id').in('listing_id', listingIds).gte('created_at', since).order('created_at', { ascending: false }).limit(30) : { data: [] }
    const rows = (apps ?? []) as { first_name: string | null; last_name: string | null; status: string | null; created_at: string; listing_id: string | null }[]
    const lines = rows.length ? rows.map((a) => `· ${[a.first_name, a.last_name].filter(Boolean).join(' ') || '(未具名)'} → ${byId.get(a.listing_id || '') || '?'} · ${a.status || 'pending'} · ${a.created_at.slice(0, 10)}`) : ['· 这段时间没有新申请。']
    await report(svc, r, [`自 ${since.slice(0, 10)} 以来的新申请：${rows.length} 份`, ...lines, rows.length ? '去 /landlord/applicants 处理。' : ''], { zh: `读了你的申请 ${rows.length} 份`, en: `Read ${rows.length} application(s)` }, { title: `新申请 · ${rows.length} 份 / New applications`, body: rows.slice(0, 3).map((a) => [a.first_name, a.last_name].filter(Boolean).join(' ')).join(' · ') || '无' })
    return { ok: true, count: rows.length, note: `${rows.length} application(s) since ${since.slice(0, 10)}` }
  }

  if (r.kind === 'overdue_rent_check') {
    const ids = await landlordIds(svc, r.user_id)
    const { data: leases } = await svc.from('lease_documents').select('id, tenant_name, unit_label').in('landlord_id', ids).in('status', [...IN_FORCE_STATUSES]).limit(100)
    const lmap = new Map(((leases ?? []) as { id: string; tenant_name: string | null; unit_label: string | null }[]).map((l) => [l.id, l]))
    const leaseIds = Array.from(lmap.keys())
    const { data: pays } = leaseIds.length ? await svc.from('rent_payments').select('lease_id, due_date, amount, status').in('lease_id', leaseIds).lt('due_date', todayIso).neq('status', 'paid').order('due_date').limit(50) : { data: [] }
    const rows = (pays ?? []) as { lease_id: string; due_date: string; amount: number | null; status: string | null }[]
    const lines = rows.length ? rows.map((x) => { const l = lmap.get(x.lease_id); return `· ${l?.unit_label || '?'} · ${l?.tenant_name || '?'} · ${x.due_date} · ${money(x.amount)} · ${x.status || '未记收'}` }) : ['· 没有逾期未记收的租金。']
    await report(svc, r, [`逾期未记收的租金：${rows.length} 期`, ...lines, rows.length ? '在 /landlord/finance 记收，或在待办页看持续迟付提示。' : ''], { zh: `读了你的租金记录（${leaseIds.length} 份租约）`, en: `Read the rent ledger of ${leaseIds.length} lease(s)` }, { title: `逾期租金 · ${rows.length} 期 / Overdue rent`, body: rows.slice(0, 3).map((x) => `${lmap.get(x.lease_id)?.unit_label || '?'} ${x.due_date}`).join(' · ') || '无' })
    return { ok: true, count: rows.length, note: `${rows.length} overdue period(s)` }
  }

  if (r.kind === 'monthly_brief') {
    // Last month, Toronto time, as the landlord lives it.
    const t = torontoParts(now)
    const y = t.m === 1 ? t.y - 1 : t.y
    const mth = t.m === 1 ? 12 : t.m - 1
    const mm = String(mth).padStart(2, '0')
    const first = `${y}-${mm}-01`
    const last = `${y}-${mm}-${String(new Date(Date.UTC(y, mth, 0)).getUTCDate()).padStart(2, '0')}`
    const ids = await landlordIds(svc, r.user_id)
    const { data: leases } = await svc.from('lease_documents').select('id, tenant_name, unit_label, monthly_rent, end_date').in('landlord_id', ids).in('status', [...IN_FORCE_STATUSES]).limit(100)
    const ls = (leases ?? []) as { id: string; tenant_name: string | null; unit_label: string | null; monthly_rent: number | null; end_date: string | null }[]
    const leaseIds = ls.map((l) => l.id)
    const { data: pays } = leaseIds.length
      ? await svc.from('rent_payments').select('lease_id, due_date, amount, status, paid_at').in('lease_id', leaseIds).gte('due_date', first).lte('due_date', last)
      : { data: [] as unknown[] }
    const payRows = (pays ?? []) as { lease_id: string; due_date: string; amount: number | null; status: string | null; paid_at: string | null }[]
    const { data: wos } = await svc.from('work_orders').select('status, invoice_amount, approved_amount, quote_amount, completed_at').eq('landlord_auth_id', r.user_id).limit(500)
    const woRows = (wos ?? []) as { status: string; invoice_amount: number | null; approved_amount: number | null; quote_amount: number | null; completed_at: string | null }[]
    const done = woRows.filter((w) => w.completed_at && w.completed_at.slice(0, 10) >= first && w.completed_at.slice(0, 10) <= last)
    const spend = done.reduce((s, w) => s + Number(w.invoice_amount ?? w.approved_amount ?? w.quote_amount ?? 0), 0)
    const openWo = woRows.filter((w) => !['accepted', 'paid', 'closed', 'declined', 'cancelled'].includes(w.status)).length
    const { data: lst } = await svc.from('listings').select('id, address, unit, published_at, created_at').in('landlord_id', ids).eq('is_active', true).neq('status', 'archived').limit(100)
    const live = (lst ?? []) as { id: string; address: string; unit: string | null; published_at: string | null; created_at: string }[]
    const { data: apps } = live.length
      ? await svc.from('applications').select('listing_id').in('listing_id', live.map((l) => l.id)).gte('created_at', `${first}T00:00:00Z`).lte('created_at', `${last}T23:59:59Z`)
      : { data: [] as unknown[] }
    const appsBy = new Map<string, number>()
    for (const a of (apps ?? []) as { listing_id: string }[]) appsBy.set(a.listing_id, (appsBy.get(a.listing_id) ?? 0) + 1)

    let unpaid = 0
    const rentLines = ls.map((l) => {
      const rows = payRows.filter((p) => p.lease_id === l.id)
      const recorded = rows.find((p) => (p.status === 'paid' || p.status === 'late') && p.paid_at)
      let state: string
      if (recorded) {
        const lateDays = Math.max(0, Math.round((Date.parse(recorded.paid_at!) - Date.parse(`${recorded.due_date}T00:00:00Z`)) / 86_400_000))
        state = lateDays > 7 ? `已记收（迟 ${lateDays} 天）` : '已记收'
      } else { state = '未记收'; unpaid++ }
      return `· ${l.unit_label || '?'} · ${l.tenant_name || '?'} · ${money(l.monthly_rent)} · ${state}`
    })
    const todayIso2 = now.toISOString().slice(0, 10)
    const endingSoon = ls.filter((l) => l.end_date && l.end_date >= todayIso2 && (Date.parse(l.end_date) - now.getTime()) / 86_400_000 <= 120)
    const listingLines = live.map((l) => {
      const since = l.published_at || l.created_at
      const days = Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / 86_400_000))
      return `· ${l.address}${l.unit ? ` #${l.unit}` : ''} · 在市 ${days} 天 · 上月申请 ${appsBy.get(l.id) ?? 0} 份`
    })
    const stale = live.find((l) => { const since = l.published_at || l.created_at; return (now.getTime() - Date.parse(since)) / 86_400_000 > 14 && !(appsBy.get(l.id) ?? 0) })
    const suggestion = unpaid
      ? `建议：有 ${unpaid} 份租约上月的租金还没记收——先到 /landlord/finance 记收，或看待办里的逾期提示。`
      : endingSoon.length
        ? `建议：${endingSoon.length} 份租约 120 天内到期，续约要提前 90 天（N1 / N2），去 /landlord/leases 看期限。`
        : stale
          ? `建议：${stale.address} 在市超过 14 天还没有申请，让我从定价、文案、照片三方面诊断一下。`
          : '建议：上月没有需要动的地方。'
    const lines = [
      `${y} 年 ${mth} 月 · 一页纸`,
      `租金（${ls.length} 份生效租约）：`,
      ...(rentLines.length ? rentLines : ['· 没有生效中的租约记录。']),
      `维修：上月完工 ${done.length} 张工单${spend ? `，有记录的支出 ${money(spend)}` : ''}；进行中 ${openWo} 张。`,
      `在市房源 ${live.length} 套：`,
      ...(listingLines.length ? listingLines : ['· 没有在市房源。']),
      suggestion,
      '没有记录的，这里不猜。',
    ]
    await report(svc, r, lines, { zh: `读了你 ${ls.length} 份租约、${woRows.length} 张工单、${live.length} 套在市房源的记录`, en: `Read ${ls.length} leases, ${woRows.length} work orders and ${live.length} live listings` }, { title: `${y} 年 ${mth} 月一页纸简报 / Monthly brief`, body: `${ls.length} 份租约 · ${unpaid} 份未记收 · 维修 ${done.length} 张 / ${ls.length} leases · ${unpaid} unrecorded · ${done.length} repairs` })
    return { ok: true, count: ls.length, note: `${y}-${mm}: ${ls.length} lease(s), ${unpaid} unrecorded, ${done.length} work order(s), ${live.length} listing(s)` }
  }

  if (r.kind === 'rent_due_reminder') {
    const dueDay = Math.min(28, Math.max(1, num(p.due_day, 1)))
    const left = daysUntilDueDay(dueDay, now)
    if (left > num(p.days_before, 3)) return { ok: true, count: 0, note: `due in ${left} days — not yet` }
    const email = await userEmail(svc, r.user_id)
    const { data } = email ? await svc.from('lease_documents').select('unit_label, monthly_rent, status, end_date').ilike('tenant_email', email).in('status', [...IN_FORCE_STATUSES]).order('created_at', { ascending: false }).limit(3) : { data: [] }
    const leases = ((data ?? []) as { unit_label: string | null; monthly_rent: number | null; end_date: string | null }[]).filter((l) => !l.end_date || l.end_date >= todayIso)
    const dueDate = dueDateIso(dueDay, now)
    const lines = leases.length ? leases.map((l) => `· ${l.unit_label || '你的单元'} · ${money(l.monthly_rent)} · ${dueDate} 到期`) : [`· ${dueDate} 是约定的交租日（Stayloop 里没有你的在管租约，金额以租约为准）。`]
    await report(svc, r, [`交租提醒：还有 ${left} 天`, ...lines, '付了之后在 /tenant/payments 记一笔，房东那边会看到。'], { zh: `读了你的租约 ${leases.length} 份`, en: `Read ${leases.length} lease(s)` }, { title: `交租提醒 · ${dueDate} / Rent due`, body: leases.map((l) => `${l.unit_label || ''} ${money(l.monthly_rent)}`).join(' · ') || `还有 ${left} 天` })
    return { ok: true, count: leases.length, note: `reminded, due ${dueDate}` }
  }

  if (r.kind === 'maintenance_followup') {
    const { data: hm } = await svc.from('household_members').select('household_id').eq('user_id', r.user_id).eq('role', 'tenant').eq('status', 'active').limit(10)
    const hh = ((hm ?? []) as { household_id: string }[]).map((m) => m.household_id)
    const { data: tk } = hh.length ? await svc.from('maintenance_tickets').select('title, status, priority, created_at').in('household_id', hh).not('status', 'in', '(done,cancelled)').order('created_at', { ascending: false }).limit(10) : { data: [] }
    const rows = (tk ?? []) as { title: string | null; status: string | null; priority: string | null; created_at: string }[]
    const lines = rows.length ? rows.map((t) => `· ${t.title || '?'} · ${t.status || '?'}${t.priority ? ` / ${t.priority}` : ''} · 提交于 ${t.created_at.slice(0, 10)}`) : ['· 没有未关闭的报修。']
    await report(svc, r, [`未关闭的报修：${rows.length} 条`, ...lines, rows.length ? '在 /tenant/maintenance 的工单对话里追问房东。' : ''], { zh: `读了你的报修 ${rows.length} 条`, en: `Read ${rows.length} repair ticket(s)` }, { title: `报修跟进 · ${rows.length} 条 / Repairs`, body: rows.slice(0, 3).map((t) => t.title || '').join(' · ') || '无' })
    return { ok: true, count: rows.length, note: `${rows.length} open ticket(s)` }
  }

  if (r.kind === 'client_followup_digest') {
    const quiet = num(p.quiet_days, 5)
    const cutoff = new Date(now.getTime() - quiet * 86_400_000).toISOString()
    const { data } = await svc.from('agent_clients').select('name, stage, last_contact_at, updated_at').eq('agent_auth_id', r.user_id).not('stage', 'in', '(leased,closed)').or(`last_contact_at.lt.${cutoff},and(last_contact_at.is.null,updated_at.lt.${cutoff})`).order('last_contact_at', { ascending: true, nullsFirst: true }).limit(20)
    const rows = (data ?? []) as { name: string; stage: string; last_contact_at: string | null; updated_at: string }[]
    const lines = rows.length ? rows.map((c) => `· ${c.name} · ${c.stage} · 上次联系 ${(c.last_contact_at || c.updated_at).slice(0, 10)}`) : [`· 没有静默超过 ${quiet} 天的客户。`]
    await report(svc, r, [`静默超过 ${quiet} 天的客户：${rows.length} 位`, ...lines, rows.length ? '跟进由你自己发；在 /agent/clients 记一笔联系时间。' : ''], { zh: `读了你的客户表（静默 > ${quiet} 天）`, en: `Read your client book (quiet > ${quiet} days)` }, { title: `客户跟进 · ${rows.length} 位 / Follow-ups`, body: rows.slice(0, 3).map((c) => c.name).join(' · ') || '无' })
    return { ok: true, count: rows.length, note: `${rows.length} quiet client(s)` }
  }
  return { ok: false, count: 0, note: 'no runner' }
}

async function runRows(svc: SupabaseClient, rows: Row[], advance: boolean): Promise<{ ran: number; results: { id: string; kind: string; ok: boolean; count: number; note: string }[] }> {
  const now = new Date()
  const results: { id: string; kind: string; ok: boolean; count: number; note: string }[] = []
  for (const r of rows) {
    let res: RunResult
    try { res = await runOne(svc, r, now) } catch (e) { res = { ok: false, count: 0, note: String((e as Error).message || e).slice(0, 120) } }
    const patch: Record<string, unknown> = { last_run_at: now.toISOString(), last_result: { ...res, at: now.toISOString() } }
    if (advance) patch.next_run_at = nextRunAt(r.schedule, now).toISOString()
    await svc.from('agent_routines').update(patch).eq('id', r.id)
    await svc.from('agent_audit_events').insert({ actor_id: r.user_id, actor_type: 'system', action: 'routine_ran', acting_role: r.role, target_type: 'routine', target_id: r.id, metadata: { kind: r.kind, title: r.title, ok: res.ok, count: res.count, reason: res.ok ? undefined : res.note, cards: res.cards ?? 0 } }).then(() => undefined, () => undefined)
    results.push({ id: r.id, kind: r.kind, ok: res.ok, count: res.count, note: res.note })
  }
  return { ran: rows.length, results }
}

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const given = (req.headers.get('x-cron-secret') || '').trim()
  const svc = admin()
  if (cronSecret && given && timingSafeEqual(given, cronSecret)) {
    const { data, error } = await svc.from('agent_routines').select(ROW_COLS).eq('enabled', true).lte('next_run_at', new Date().toISOString()).order('next_run_at').limit(200)
    if (error) return NextResponse.json({ error: 'read_failed' }, { status: 502, headers: NO_STORE })
    const out = await runRows(svc, (data ?? []) as Row[], true)
    return NextResponse.json(out, { headers: NO_STORE })
  }
  // Signed-in: run one of my own routines now.
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud } = await sb.auth.getUser()
  if (!ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'sign_in_required' }, { status: 401, headers: NO_STORE })
  let body: { id?: unknown } = {}
  try { body = await req.json() } catch { /* empty */ }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id_required' }, { status: 400, headers: NO_STORE })
  const { data: row } = await svc.from('agent_routines').select(ROW_COLS).eq('id', id).eq('user_id', ud.user.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  const out = await runRows(svc, [row as Row], false)
  return NextResponse.json(out.results[0], { headers: NO_STORE })
}

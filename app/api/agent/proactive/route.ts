// /api/agent/proactive — the agent's "works while you sleep" sweep.
//
// Scans REAL leases (lease_documents) for renewal windows — Ontario N2
// requires 90 days' notice, so anything ending within 120 days needs a
// decision soon — and idempotently creates a `send_renewal_letter` pending
// action for each. The proposal carries computed options (keep / +2.5%
// guideline) in metadata; the landlord approves on the agent page and
// /api/agent/execute then actually sends the letter.
//
// Two entry modes:
//   • User mode (default): runs on the caller's OWN JWT (RLS-scoped) — it can
//     only ever see the caller's leases and only ever write pending actions
//     for the caller. Invoked on workspace load today.
//   • Cron mode: when the request carries `x-cron-secret` matching env
//     CRON_SECRET (path disabled entirely if the env var is unset), the sweep
//     runs with the service role across ALL landlords' leases, resolving each
//     lease's landlord to an auth user id (dual-ID invariant: landlord_id may
//     hold landlords.id OR an auth id — map via the landlords table). Cron
//     mode ALSO proposes month-end `rent_reminder` actions for the 1st of the
//     coming month. Scheduled daily by pg_cron + pg_net
//     (supabase/migrations/20260708_pg_cron_proactive.sql).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'edge'

// Ontario rent increase guideline for 2026 (post-Nov-2018 first-occupancy
// units are exempt — the proposal says so instead of pretending to know).
const GUIDELINE_PCT = 2.5
const WINDOW_DAYS = 120
const NOTICE_DAYS = 90
const CRON_SCAN_LIMIT = 200
// Rent reminders are proposed only in the last N days of a month, for the 1st
// of the next month.
const REMINDER_TAIL_DAYS = 5

const iso = (d: Date) => d.toISOString().slice(0, 10)

type LeaseRow = {
  id: string
  landlord_id?: string | null
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  monthly_rent: number | string | null
  end_date: string
}

// Shared proposal shape — used verbatim by both the user-JWT path and cron.
function buildRenewalProposal(userId: string, l: LeaseRow, today: Date) {
  const rent = Number(l.monthly_rent) || 0
  const raised = Math.round(rent * (1 + GUIDELINE_PCT / 100) * 100) / 100
  const end = new Date(l.end_date)
  const noticeDeadline = new Date(end.getTime() - NOTICE_DAYS * 86_400_000)
  const daysToEnd = Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
  const tenant = l.tenant_name || '租客'
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'send_renewal_letter',
    title: `续约窗口：${tenant} · ${l.end_date} 到期（还有 ${daysToEnd} 天）`,
    summary:
      `${l.unit_label || '你的单元'} 月租 $${rent.toLocaleString()}。` +
      `方案 A 不涨续约；方案 B 按 2026 指导上限 +${GUIDELINE_PCT}% → $${raised.toLocaleString()}` +
      `（2018-11-15 后首次入住的单位不受上限约束）。` +
      `N1/N2 需提前 ${NOTICE_DAYS} 天送达 — 最晚 ${iso(noticeDeadline)}。批准后我会把续约函真实发送给 ${l.tenant_email || tenant}。`,
    recipient_label: l.tenant_email || tenant,
    data_scope: ['租约条款摘要', '续约方案'],
    excluded_data: ['筛查报告', '收入证明原件'],
    risk_level: 'medium',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      current_rent: rent,
      guideline_rent: raised,
      guideline_pct: GUIDELINE_PCT,
      end_date: l.end_date,
      notice_deadline: iso(noticeDeadline),
      source: 'proactive_sweep',
    },
  }
}

function buildRentReminderProposal(userId: string, l: LeaseRow, dueDate: string) {
  const rent = Number(l.monthly_rent) || 0
  const tenant = l.tenant_name || '租客'
  const unit = l.unit_label || '你的单元'
  return {
    user_id: userId,
    role: 'landlord',
    action_type: 'rent_reminder',
    title: `租金提醒：${tenant} · ${dueDate} 应付 / Rent reminder`,
    summary:
      `${unit} 月租 $${rent.toLocaleString()}，${dueDate} 到期。批准后我会给 ${l.tenant_email} 发送一封友好的双语提醒邮件。` +
      ` / Friendly bilingual reminder for ${unit} ($${rent.toLocaleString()}/mo, due ${dueDate}) — emailed to ${l.tenant_email} after your approval.`,
    recipient_label: l.tenant_email,
    data_scope: ['租金金额', '应付日期'],
    excluded_data: ['筛查报告', '支付历史'],
    risk_level: 'low',
    status: 'pending',
    requires_approval: true,
    metadata: {
      lease_id: l.id,
      tenant_name: l.tenant_name,
      tenant_email: l.tenant_email,
      unit_label: l.unit_label,
      monthly_rent: rent,
      due_date: dueDate,
      source: 'proactive_sweep',
    },
  }
}

// ---------------------------------------------------------------------------
// Cron mode — service role, all landlords, dual-ID resolved
// ---------------------------------------------------------------------------
async function runCronSweep(): Promise<NextResponse> {
  const admin: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const today = new Date()
  const horizon = new Date(today.getTime() + WINDOW_DAYS * 86_400_000)

  // 1) Renewal windows across ALL landlords.
  const { data: renewalLeases, error: leaseErr } = await admin
    .from('lease_documents')
    .select('id, landlord_id, tenant_name, tenant_email, unit_label, monthly_rent, end_date')
    .in('status', ['active', 'signed_both'])
    .gte('end_date', iso(today))
    .lte('end_date', iso(horizon))
    .order('end_date', { ascending: true })
    .limit(CRON_SCAN_LIMIT)
  if (leaseErr) {
    return NextResponse.json({ error: `lease scan failed: ${leaseErr.message}` }, { status: 500 })
  }

  // 2) Month-end rent reminders for the 1st of next month (cron mode only).
  //    Only proposed when today falls in the last REMINDER_TAIL_DAYS of the
  //    month, and only for leases with a tenant email still in force on the
  //    due date.
  const lastDayOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate()
  const inReminderWindow = today.getUTCDate() > lastDayOfMonth - REMINDER_TAIL_DAYS
  const dueDate = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)))
  let reminderLeases: LeaseRow[] = []
  if (inReminderWindow) {
    const { data, error } = await admin
      .from('lease_documents')
      .select('id, landlord_id, tenant_name, tenant_email, unit_label, monthly_rent, end_date')
      .in('status', ['active', 'signed_both'])
      .gte('end_date', dueDate)
      .not('tenant_email', 'is', null)
      .limit(CRON_SCAN_LIMIT)
    if (error) {
      return NextResponse.json({ error: `reminder scan failed: ${error.message}` }, { status: 500 })
    }
    reminderLeases = (data ?? []) as LeaseRow[]
  }

  const allLeases = [...((renewalLeases ?? []) as LeaseRow[]), ...reminderLeases]
  if (allLeases.length === 0) {
    return NextResponse.json({ created: 0, mode: 'cron' })
  }

  // Dual-ID invariant: lease_documents.landlord_id may hold landlords.id
  // (profileId) OR an auth id. Resolve via the landlords table:
  // user_id = matched row's auth_id, falling back to the raw value when the
  // row itself was matched by auth_id. Leases whose landlord can't be
  // resolved to an auth user are skipped — a pending action nobody can see
  // is worse than none.
  const landlordIds = Array.from(new Set(allLeases.map((l) => l.landlord_id).filter(Boolean))) as string[]
  const toAuthId = new Map<string, string>()
  if (landlordIds.length > 0) {
    const inList = `(${landlordIds.join(',')})`
    const { data: landlordRows, error } = await admin
      .from('landlords')
      .select('id, auth_id')
      .or(`id.in.${inList},auth_id.in.${inList}`)
    if (error) {
      return NextResponse.json({ error: `landlord resolve failed: ${error.message}` }, { status: 500 })
    }
    for (const r of (landlordRows ?? []) as { id: string; auth_id: string | null }[]) {
      if (r.auth_id) {
        toAuthId.set(r.id, r.auth_id)
        toAuthId.set(r.auth_id, r.auth_id)
      }
    }
  }
  const resolve = (l: LeaseRow) => (l.landlord_id ? toAuthId.get(l.landlord_id) ?? null : null)

  const affectedUserIds = Array.from(
    new Set(allLeases.map(resolve).filter(Boolean))
  ) as string[]
  if (affectedUserIds.length === 0) {
    return NextResponse.json({ created: 0, mode: 'cron' })
  }

  // Idempotency, checked across each affected user's existing actions:
  // renewals are one-per-lease ever; reminders are one per lease per due_date.
  const { data: existing, error: existErr } = await admin
    .from('agent_pending_actions')
    .select('action_type, metadata')
    .in('action_type', ['send_renewal_letter', 'rent_reminder'])
    .in('user_id', affectedUserIds)
  if (existErr) {
    return NextResponse.json({ error: `idempotency scan failed: ${existErr.message}` }, { status: 500 })
  }
  const renewalProposed = new Set<string>()
  const reminderProposed = new Set<string>()
  for (const r of existing ?? []) {
    const m = r.metadata as { lease_id?: string; due_date?: string } | null
    if (!m?.lease_id) continue
    if (r.action_type === 'send_renewal_letter') renewalProposed.add(m.lease_id)
    else if (m.due_date) reminderProposed.add(`${m.lease_id}:${m.due_date}`)
  }

  const inserts: Record<string, unknown>[] = []
  for (const l of (renewalLeases ?? []) as LeaseRow[]) {
    const userId = resolve(l)
    if (!userId || renewalProposed.has(l.id)) continue
    inserts.push(buildRenewalProposal(userId, l, today))
  }
  for (const l of reminderLeases) {
    const userId = resolve(l)
    if (!userId || !l.tenant_email || reminderProposed.has(`${l.id}:${dueDate}`)) continue
    inserts.push(buildRentReminderProposal(userId, l, dueDate))
  }

  if (inserts.length === 0) {
    return NextResponse.json({ created: 0, mode: 'cron' })
  }
  const { error: insErr } = await admin.from('agent_pending_actions').insert(inserts)
  if (insErr) {
    return NextResponse.json({ error: `proposal insert failed: ${insErr.message}` }, { status: 500 })
  }
  return NextResponse.json({ created: inserts.length, mode: 'cron' })
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  // Cron mode: shared-secret header, only when CRON_SECRET is configured —
  // an unset env var disables the path entirely (no empty-matches-empty).
  const cronSecret = process.env.CRON_SECRET
  const givenSecret = (req.headers.get('x-cron-secret') || '').trim()
  if (cronSecret && givenSecret && givenSecret === cronSecret) {
    return runCronSweep()
  }

  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  const userId = ud.user.id

  // Leases ending inside the renewal window. RLS (leases_parties) scopes
  // this to the caller's own rows — no explicit landlord filter needed.
  const today = new Date()
  const horizon = new Date(today.getTime() + WINDOW_DAYS * 86_400_000)
  const { data: leases, error: leaseErr } = await sb
    .from('lease_documents')
    .select('id, tenant_name, tenant_email, unit_label, monthly_rent, start_date, end_date, status')
    .in('status', ['active', 'signed_both'])
    .gte('end_date', iso(today))
    .lte('end_date', iso(horizon))
    .order('end_date', { ascending: true })
    .limit(20)
  if (leaseErr) {
    return NextResponse.json({ error: `lease scan failed: ${leaseErr.message}` }, { status: 500 })
  }
  if (!leases || leases.length === 0) {
    return NextResponse.json({ created: 0, actions: [] })
  }

  // Idempotency: one renewal proposal per lease, ever (approved, rejected or
  // still pending — never re-nag a decided lease).
  const { data: existing } = await sb
    .from('agent_pending_actions')
    .select('metadata')
    .eq('user_id', userId)
    .eq('action_type', 'send_renewal_letter')
  const proposedLeaseIds = new Set(
    (existing ?? []).map((r) => (r.metadata as { lease_id?: string } | null)?.lease_id).filter(Boolean)
  )

  const inserts = (leases as LeaseRow[])
    .filter((l) => !proposedLeaseIds.has(l.id))
    .map((l) => buildRenewalProposal(userId, l, today))

  if (inserts.length === 0) {
    return NextResponse.json({ created: 0, actions: [] })
  }
  const { data: created, error: insErr } = await sb
    .from('agent_pending_actions')
    .insert(inserts)
    .select('id, title, summary, recipient_label, action_type, risk_level, data_scope, excluded_data, status, created_at')
  if (insErr) {
    return NextResponse.json({ error: `proposal insert failed: ${insErr.message}` }, { status: 500 })
  }
  return NextResponse.json({ created: created?.length ?? 0, actions: created ?? [] })
}

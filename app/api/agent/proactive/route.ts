// /api/agent/proactive — the agent's "works while you sleep" sweep.
//
// Scans the caller's REAL leases (lease_documents) for renewal windows —
// Ontario N2 requires 90 days' notice, so anything ending within 120 days
// needs a decision soon — and idempotently creates a `send_renewal_letter`
// pending action for each. The proposal carries computed options (keep /
// +2.5% guideline) in metadata; the landlord approves on the agent page and
// /api/agent/execute then actually sends the letter.
//
// Runs on the caller's OWN JWT (RLS-scoped): it can only ever see the
// caller's leases and only ever write pending actions for the caller.
// Invoked on workspace load today; a cron can call the same logic later.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

// Ontario rent increase guideline for 2026 (post-Nov-2018 first-occupancy
// units are exempt — the proposal says so instead of pretending to know).
const GUIDELINE_PCT = 2.5
const WINDOW_DAYS = 120
const NOTICE_DAYS = 90

export async function POST(req: Request) {
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
  const iso = (d: Date) => d.toISOString().slice(0, 10)
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

  const inserts = leases
    .filter((l) => !proposedLeaseIds.has(l.id))
    .map((l) => {
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
    })

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

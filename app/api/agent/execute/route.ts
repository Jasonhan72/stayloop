// /api/agent/execute — the agent's "hands". Closes the AI-native loop:
//   perceive → propose (proactive/turn) → approve (decide RPC) → EXECUTE → audit
//
// Until now approving a card changed a status row and nothing else. This
// route performs the real effect for an approved action and stamps what
// happened. Guarantees:
//   • Ownership: the action row must belong to the authenticated caller.
//   • Idempotency: executed_at is claimed with a conditional update — a
//     double-click or retry can never send twice. A failed send releases
//     the claim so retry works.
//   • Unskippable audit: the execution audit event is written HERE with the
//     service role — no client can execute without leaving a trail.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export const runtime = 'edge'

type ActionRow = {
  id: string
  user_id: string
  action_type: string
  title: string
  summary: string | null
  recipient_label: string | null
  status: string
  executed_at: string | null
  metadata: {
    lease_id?: string
    tenant_name?: string
    tenant_email?: string
    unit_label?: string
    current_rent?: number
    guideline_rent?: number
    guideline_pct?: number
    end_date?: string
    notice_deadline?: string
  } | null
}

export async function POST(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sbAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: ud, error: ue } = await sbAuth.auth.getUser()
  if (ue || !ud?.user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  const userId = ud.user.id

  let body: { action_id?: string; option?: 'A' | 'B' }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.action_id) return NextResponse.json({ error: 'action_id required' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: action } = await admin
    .from('agent_pending_actions')
    .select('id, user_id, action_type, title, summary, recipient_label, status, executed_at, metadata')
    .eq('id', body.action_id)
    .maybeSingle<ActionRow>()
  if (!action) return NextResponse.json({ error: 'action not found' }, { status: 404 })
  if (action.user_id !== userId) return NextResponse.json({ error: 'not your action' }, { status: 403 })
  if (action.status !== 'approved') {
    return NextResponse.json({ executed: false, reason: `action is ${action.status}, not approved` }, { status: 409 })
  }
  if (action.executed_at) {
    return NextResponse.json({ executed: true, already: true, result: null })
  }

  // Only action types with a real executor get claimed; everything else is
  // approval-only for now (the approval itself was already recorded).
  if (action.action_type !== 'send_renewal_letter') {
    return NextResponse.json({ executed: false, reason: 'no_executor_for_type' })
  }
  const m = action.metadata || {}
  if (!m.tenant_email) {
    return NextResponse.json({ executed: false, reason: 'lease has no tenant email on file' }, { status: 422 })
  }

  // Atomic idempotency claim — exactly one request wins.
  const { data: claimed } = await admin
    .from('agent_pending_actions')
    .update({ executed_at: new Date().toISOString() })
    .eq('id', action.id)
    .is('executed_at', null)
    .eq('status', 'approved')
    .select('id')
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ executed: true, already: true, result: null })
  }

  const option = body.option === 'A' ? 'A' : 'B'
  const rent = option === 'A' ? m.current_rent : (m.guideline_rent ?? m.current_rent)
  const tenant = m.tenant_name || 'Tenant'
  const unit = m.unit_label || 'your unit'
  const subject = `Lease renewal offer — ${unit}`
  const text = `Hi ${tenant},

Your current lease for ${unit} ends on ${m.end_date}. Your landlord would like to offer a renewal:

  • Proposed monthly rent: $${(rent ?? 0).toLocaleString()}${option === 'B' ? ` (current $${(m.current_rent ?? 0).toLocaleString()} + ${m.guideline_pct ?? 2.5}% — within Ontario's 2026 rent increase guideline)` : ' (unchanged)'}
  • New term: 12 months from ${m.end_date}

Reply to this email to accept, discuss, or ask questions. Under Ontario's Residential Tenancies Act you may also choose to continue month-to-month on your existing terms.

— Sent by Logic, the landlord's assistant on Stayloop, after landlord approval.
此邮件由房东在 Stayloop 上批准后由其助手 Logic 发送：${unit} 的租约将于 ${m.end_date} 到期，房东提议以月租 $${(rent ?? 0).toLocaleString()} 续约 12 个月。你也可以依据安省 RTA 按原条款转为月租。直接回复本邮件即可沟通。`

  const result = await sendEmail({
    to: m.tenant_email,
    subject,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    text,
  })

  if (!result.ok) {
    // Release the claim so a retry can send.
    await admin.from('agent_pending_actions')
      .update({ executed_at: null, execution_result: { ok: false, error: result.error, at: new Date().toISOString() } })
      .eq('id', action.id)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }

  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: m.tenant_email, option, rent }
  await admin.from('agent_pending_actions')
    .update({ execution_result: executionResult })
    .eq('id', action.id)

  // Unskippable audit — written server-side with the service role.
  const { error: auditErr } = await admin.from('agent_audit_events').insert({
    actor_id: userId,
    actor_type: 'agent',
    action: 'executed_send_renewal_letter',
    target_type: 'agent_pending_action',
    target_id: action.id,
    metadata: { lease_id: m.lease_id, sent_to: m.tenant_email, option, rent, email_id: result.id },
  })
  if (auditErr) console.error('[agent/execute] audit insert failed:', auditErr.message)

  return NextResponse.json({ executed: true, result: executionResult, audited: !auditErr })
}

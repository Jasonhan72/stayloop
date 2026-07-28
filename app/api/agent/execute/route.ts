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
//
// Executors are registered per action_type in the dispatch switch at the
// bottom of POST. Each executor validates its metadata contract BEFORE
// claiming, then claim → effect → stamp execution_result → audit, using the
// shared claim/release/finalize plumbing below.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, renderAgentMessageEmail, renderRentReminderEmail } from '@/lib/email'

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
    // send_renewal_letter + rent_reminder (lease-derived)
    lease_id?: string
    tenant_name?: string
    tenant_email?: string
    unit_label?: string
    current_rent?: number
    guideline_rent?: number
    guideline_pct?: number
    end_date?: string
    notice_deadline?: string
    // rent_reminder
    monthly_rent?: number
    due_date?: string
    // send_message
    to_email?: string
    subject?: string
    body?: string
  } | null
}

type Admin = SupabaseClient

// ---------------------------------------------------------------------------
// Shared plumbing — claim / release / finalize+audit
// ---------------------------------------------------------------------------

// Atomic idempotency claim — exactly one request wins. Returns false when
// another request already holds (or completed) the execution.
async function claimExecution(admin: Admin, actionId: string): Promise<boolean> {
  const { data: claimed } = await admin
    .from('agent_pending_actions')
    .update({ executed_at: new Date().toISOString() })
    .eq('id', actionId)
    .is('executed_at', null)
    .eq('status', 'approved')
    .select('id')
  return !!claimed && claimed.length > 0
}

// Release the claim so a retry can send. When the release is caused by a
// failed effect, stamp the failure so the row explains itself.
async function releaseClaim(admin: Admin, actionId: string, error?: string): Promise<void> {
  const patch: Record<string, unknown> = { executed_at: null }
  if (error) patch.execution_result = { ok: false, error, at: new Date().toISOString() }
  await admin.from('agent_pending_actions').update(patch).eq('id', actionId)
}

// Stamp the successful execution_result and write the unskippable audit event
// (service role — no client can execute without leaving a trail).
async function finalizeExecution(
  admin: Admin,
  userId: string,
  actionId: string,
  auditAction: string,
  executionResult: Record<string, unknown>,
  auditMetadata: Record<string, unknown>,
): Promise<NextResponse> {
  await admin.from('agent_pending_actions')
    .update({ execution_result: executionResult })
    .eq('id', actionId)

  const { error: auditErr } = await admin.from('agent_audit_events').insert({
    actor_id: userId,
    actor_type: 'agent',
    action: auditAction,
    target_type: 'agent_pending_action',
    target_id: actionId,
    metadata: auditMetadata,
  })
  if (auditErr) console.error('[agent/execute] audit insert failed:', auditErr.message)

  return NextResponse.json({ executed: true, result: executionResult, audited: !auditErr })
}

const ALREADY = () => NextResponse.json({ executed: true, already: true, result: null })

// ---------------------------------------------------------------------------
// Executor: send_renewal_letter
// metadata: { lease_id, tenant_name, tenant_email, unit_label, current_rent,
//             guideline_rent, guideline_pct, end_date, notice_deadline }
// ---------------------------------------------------------------------------
async function executeSendRenewalLetter(
  admin: Admin,
  userId: string,
  action: ActionRow,
  option: 'A' | 'B' | undefined,
): Promise<NextResponse> {
  const m = action.metadata || {}
  if (!m.tenant_email) {
    return NextResponse.json({ executed: false, reason: 'lease has no tenant email on file' }, { status: 422 })
  }

  if (!(await claimExecution(admin, action.id))) return ALREADY()

  // A rent increase must be an explicit landlord choice — never a silent
  // default. If the approval didn't carry a valid option, release the claim
  // and refuse rather than emailing the tenant an unauthorized increase.
  if (option !== 'A' && option !== 'B') {
    await releaseClaim(admin, action.id)
    return NextResponse.json(
      { executed: false, reason: 'no_renewal_option_chosen' },
      { status: 422 },
    )
  }
  const rent = option === 'A' ? m.current_rent : (m.guideline_rent ?? m.current_rent)
  const tenant = m.tenant_name || 'Tenant'
  const unit = m.unit_label || 'your unit'
  const subject = `Lease renewal offer — ${unit}`
  const text = `Hi ${tenant},

Your current lease for ${unit} ends on ${m.end_date}. Your landlord would like to offer a renewal:

  • Proposed monthly rent: $${(rent ?? 0).toLocaleString()}${option === 'B' ? ` (current $${(m.current_rent ?? 0).toLocaleString()} + ${m.guideline_pct ?? 2.5}% — within Ontario's 2026 rent increase guideline)` : ' (unchanged)'}
  • New term: 12 months from ${m.end_date}

Reply to this email to accept, discuss, or ask questions. Under Ontario's Residential Tenancies Act you may also choose to continue month-to-month on your existing terms.

— Sent by the landlord's AI assistant on Stayloop, after landlord approval.
此邮件由房东在 Stayloop 上批准后由其 AI 助手发送：${unit} 的租约将于 ${m.end_date} 到期，房东提议以月租 $${(rent ?? 0).toLocaleString()} 续约 12 个月。你也可以依据安省 RTA 按原条款转为月租。直接回复本邮件即可沟通。`

  const result = await sendEmail({
    to: m.tenant_email,
    subject,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
    text,
  })

  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }

  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: m.tenant_email, option, rent }
  return finalizeExecution(admin, userId, action.id, 'executed_send_renewal_letter', executionResult, {
    lease_id: m.lease_id,
    sent_to: m.tenant_email,
    option,
    rent,
    email_id: result.id,
  })
}

// ---------------------------------------------------------------------------
// Executor: send_message
// metadata: { to_email, subject?, body } — body is treated as plain text
// (any HTML is stripped); recipient_label is the fallback recipient when it
// looks like an email address.
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The set of addresses a caller is allowed to message.
 *
 * Pending actions are written client-side under RLS, so `metadata.to_email` is
 * attacker-controlled — without this check /api/agent/execute is an open mail
 * relay on the Stayloop sending domain. A recipient is allowed only when the
 * caller is a party to a lease with that address, or the address belongs to an
 * applicant on one of the caller's listings.
 */
async function isKnownCounterparty(admin: Admin, userId: string, email: string): Promise<boolean> {
  const target = email.trim().toLowerCase()
  if (!target) return false

  const { data: landlordRows } = await admin.from('landlords').select('id').eq('auth_id', userId)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  const { data: tenantRows } = await admin.from('tenants').select('id').eq('auth_id', userId)
  const tenantIds = (tenantRows ?? []).map((r: { id: string }) => r.id)

  // Counterparties on the caller's leases.
  if (landlordIds.length > 0) {
    const { data } = await admin
      .from('lease_documents')
      .select('tenant_email')
      .in('landlord_id', landlordIds)
      .not('tenant_email', 'is', null)
    if ((data ?? []).some((l: { tenant_email: string | null }) => l.tenant_email?.trim().toLowerCase() === target)) {
      return true
    }
  }
  if (tenantIds.length > 0) {
    const { data } = await admin
      .from('lease_documents')
      .select('landlord_id')
      .in('tenant_id', tenantIds)
    const ids = (data ?? []).map((l: { landlord_id: string | null }) => l.landlord_id).filter(Boolean)
    if (ids.length > 0) {
      const { data: ll } = await admin.from('landlords').select('email').in('id', ids as string[])
      if ((ll ?? []).some((l: { email: string | null }) => l.email?.trim().toLowerCase() === target)) return true
    }
  }

  // Applicants on the caller's listings.
  if (landlordIds.length > 0) {
    const { data: listings } = await admin.from('listings').select('id').in('landlord_id', landlordIds)
    const listingIds = (listings ?? []).map((l: { id: string }) => l.id)
    if (listingIds.length > 0) {
      const { data: apps } = await admin
        .from('applications')
        .select('email')
        .in('listing_id', listingIds)
        .not('email', 'is', null)
      if ((apps ?? []).some((a: { email: string | null }) => a.email?.trim().toLowerCase() === target)) return true
    }
  }
  return false
}

async function executeSendMessage(
  admin: Admin,
  userId: string,
  action: ActionRow,
): Promise<NextResponse> {
  const m = action.metadata || {}
  const candidate = (typeof m.to_email === 'string' ? m.to_email : '').trim()
  const fallback = (action.recipient_label || '').trim()
  const to = EMAIL_RE.test(candidate) ? candidate : (EMAIL_RE.test(fallback) ? fallback : null)
  if (!to) {
    return NextResponse.json({ executed: false, reason: 'no valid recipient email' }, { status: 422 })
  }
  if (!(await isKnownCounterparty(admin, userId, to))) {
    return NextResponse.json(
      { executed: false, reason: 'recipient is not a counterparty on any of your leases or applications' },
      { status: 403 },
    )
  }
  const bodyText = String(m.body ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 5000)
  if (!bodyText) {
    return NextResponse.json({ executed: false, reason: 'message body is empty' }, { status: 422 })
  }
  const subject =
    (typeof m.subject === 'string' && m.subject.trim()) ||
    '来自您的 Stayloop 代理的消息 / Message from your Stayloop agent'

  if (!(await claimExecution(admin, action.id))) return ALREADY()

  const { html, text } = renderAgentMessageEmail({ subject, body: bodyText })
  const result = await sendEmail({ to, subject, html, text })

  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }

  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: to }
  return finalizeExecution(admin, userId, action.id, 'executed_send_message', executionResult, {
    sent_to: to,
    subject,
    email_id: result.id,
  })
}

// ---------------------------------------------------------------------------
// Executor: rent_reminder
// metadata: { lease_id, tenant_email, tenant_name, unit_label, monthly_rent,
//             due_date }
// ---------------------------------------------------------------------------
async function executeRentReminder(
  admin: Admin,
  userId: string,
  action: ActionRow,
): Promise<NextResponse> {
  const m = action.metadata || {}
  if (!m.tenant_email) {
    return NextResponse.json({ executed: false, reason: 'lease has no tenant email on file' }, { status: 422 })
  }
  if (!m.due_date) {
    return NextResponse.json({ executed: false, reason: 'reminder has no due date' }, { status: 422 })
  }

  if (!(await claimExecution(admin, action.id))) return ALREADY()

  const { subject, html, text } = renderRentReminderEmail({
    tenantName: m.tenant_name,
    unitLabel: m.unit_label,
    monthlyRent: Number(m.monthly_rent) || 0,
    dueDate: m.due_date,
  })
  const result = await sendEmail({ to: m.tenant_email, subject, html, text })

  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }

  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: m.tenant_email }
  return finalizeExecution(admin, userId, action.id, 'executed_rent_reminder', executionResult, {
    lease_id: m.lease_id,
    sent_to: m.tenant_email,
    due_date: m.due_date,
    monthly_rent: Number(m.monthly_rent) || 0,
    email_id: result.id,
  })
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

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
  if (ud.user.is_anonymous) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
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
    return ALREADY()
  }

  // Per-type dispatch. Only action types with a real executor get claimed;
  // everything else is approval-only for now (the approval itself was
  // already recorded).
  switch (action.action_type) {
    case 'send_renewal_letter':
      return executeSendRenewalLetter(admin, userId, action, body.option)
    case 'send_message':
      return executeSendMessage(admin, userId, action)
    case 'rent_reminder':
      return executeRentReminder(admin, userId, action)
    default:
      return NextResponse.json({ executed: false, reason: 'no_executor_for_type' })
  }
}

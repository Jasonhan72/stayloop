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
import { underHourlyLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, renderAgentMessageEmail, renderRentReminderEmail } from '@/lib/email'
import { sendLeaseInvitation, leaseSendPreflight, buildLeaseInvite, type LeaseForSend } from '@/lib/lease/sendLease'
import { decisionNoticeFooter, guidelineFor } from '@/lib/ontario/rules'
import { notifyUser } from '@/lib/push/notify'

export const runtime = 'edge'

type ActionRow = {
  id: string
  user_id: string
  role?: string | null
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
    // renewal_checkpoint
    stage?: string
    // showing_request / listing_inquiry
    intent_id?: string
    listing_id?: string
    // send_decision
    application_id?: string
    decision?: 'approved' | 'declined' | 'needs_more'
    reason?: string
    // maintenance_request (turn-proposed; strings only, clamped by the turn route)
    title?: string
    description?: string
    priority?: string
  } | null
}

// Preview mode (lifecycle plan §2.5): the same executor code builds the exact
// subject/body it would send, but returns it instead of claiming/sending.
type Preview = { subject: string; body: string; to: string | null }
const PREVIEW = (p: Preview) => NextResponse.json({ preview: p })

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

/**
 * Review 2026-09-14: pending actions are written client-side under RLS, so
 * every field in `metadata` is caller-controlled. The two lease-derived
 * executors used to email `metadata.tenant_email` verbatim — an open mail
 * relay on the Stayloop domain. Resolve the lease by id, prove the caller
 * is its landlord, and take recipient + facts from the lease row itself.
 */
async function loadOwnedLease(admin: Admin, userId: string, leaseId: unknown): Promise<{
  id: string; tenant_email: string | null; tenant_name: string | null; unit_label: string | null
  monthly_rent: number | null; end_date: string | null
} | null> {
  if (typeof leaseId !== 'string' || !/^[0-9a-f-]{36}$/i.test(leaseId)) return null
  const { data: landlordRows } = await admin.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  if (!landlordIds.length) return null
  const { data: lease } = await admin
    .from('lease_documents')
    .select('id, tenant_email, tenant_name, unit_label, monthly_rent, end_date, landlord_id')
    .eq('id', leaseId)
    .in('landlord_id', landlordIds)
    .maybeSingle()
  return (lease as { id: string; tenant_email: string | null; tenant_name: string | null; unit_label: string | null; monthly_rent: number | null; end_date: string | null } | null) ?? null
}

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
  preview = false,
): Promise<NextResponse> {
  const m0 = action.metadata || {}
  const lease = await loadOwnedLease(admin, userId, m0.lease_id)
  if (!lease) {
    return NextResponse.json({ executed: false, reason: 'lease not found or not yours' }, { status: 403 })
  }
  if (!lease.tenant_email) {
    return NextResponse.json({ executed: false, reason: 'lease has no tenant email on file' }, { status: 422 })
  }
  // Facts come from the lease row; only the option/guideline maths may come
  // from the proposal, and the guideline is re-derived from the lease rent.
  // Guideline for the year the increase takes effect (RTA s.120): 2026 is
  // 2.1%, 2027 is 1.9% — never a hard-coded 2.5%.
  const g = guidelineFor(lease.end_date)
  const m = {
    ...m0,
    tenant_email: lease.tenant_email,
    tenant_name: lease.tenant_name,
    unit_label: lease.unit_label,
    current_rent: lease.monthly_rent,
    guideline_rent: lease.monthly_rent != null ? Math.round(lease.monthly_rent * (1 + g.pct / 100) * 100) / 100 : undefined,
    guideline_pct: g.pct,
    guideline_year: g.year,
    end_date: lease.end_date,
  }

  // A rent increase must be an explicit landlord choice — never a silent
  // default. Without a valid option, refuse before touching the claim rather
  // than emailing the tenant an unauthorized increase.
  if (option !== 'A' && option !== 'B') {
    return NextResponse.json(
      { executed: false, reason: 'no_renewal_option_chosen' },
      { status: 422 },
    )
  }
  if (!preview && !(await claimExecution(admin, action.id))) return ALREADY()
  const rent = option === 'A' ? m.current_rent : (m.guideline_rent ?? m.current_rent)
  const tenant = m.tenant_name || 'Tenant'
  const unit = m.unit_label || 'your unit'
  const subject = `Lease renewal offer — ${unit}`
  const text = `Hi ${tenant},

Your current lease for ${unit} ends on ${m.end_date}. Your landlord would like to offer a renewal:

  • Proposed monthly rent: $${(rent ?? 0).toLocaleString()}${option === 'B' ? ` (current $${(m.current_rent ?? 0).toLocaleString()} + ${m.guideline_pct}% — within Ontario's ${m.guideline_year} rent increase guideline)` : ' (unchanged)'}
  • New term: 12 months from ${m.end_date}

Reply to this email to accept, discuss, or ask questions. Under Ontario's Residential Tenancies Act you may also choose to continue month-to-month on your existing terms.

— Sent by the landlord's AI assistant on Stayloop, after landlord approval.
此邮件由房东在 Stayloop 上批准后由其 AI 助手发送：${unit} 的租约将于 ${m.end_date} 到期，房东提议以月租 $${(rent ?? 0).toLocaleString()} 续约 12 个月。你也可以依据安省 RTA 按原条款转为月租。直接回复本邮件即可沟通。`

  if (preview) return PREVIEW({ subject, body: text, to: m.tenant_email ?? null })
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

// ---------------------------------------------------------------------------
// The tenant's landlord, from rows the tenant cannot forge: a verified managed
// tenancy they are a member of (landlord member → auth email), else a lease
// addressed to their login email (landlord row → email). Turn-proposed cards
// carry no recipient (user report 2026-09-23: 「no valid recipient email」 on
// a repair request), so executors derive it here instead of trusting metadata.
// ---------------------------------------------------------------------------
async function resolveTenantLandlord(admin: Admin, userId: string, callerEmail: string | null): Promise<{ email: string; auth_id: string | null; household_id: string | null; unit: string | null } | null> {
  const { data: mem } = await admin.from('household_members').select('household_id, role').eq('user_id', userId).eq('role', 'tenant')
  const hhIds = (mem ?? []).map((r: { household_id: string }) => r.household_id)
  if (hhIds.length) {
    const { data: hhs } = await admin.from('households').select('id, verified, status, address, unit').in('id', hhIds).eq('verified', true).order('created_at', { ascending: false })
    for (const hh of (hhs ?? []) as { id: string; status: string | null; address: string | null; unit: string | null }[]) {
      if (hh.status && !['active', 'pending'].includes(hh.status)) continue
      const { data: ll } = await admin.from('household_members').select('user_id').eq('household_id', hh.id).eq('role', 'landlord').limit(1)
      const landlordAuth = (ll?.[0] as { user_id: string } | undefined)?.user_id ?? null
      if (!landlordAuth) continue
      const { data: u } = await admin.auth.admin.getUserById(landlordAuth)
      const email = u?.user?.email ?? null
      if (email && EMAIL_RE.test(email)) return { email, auth_id: landlordAuth, household_id: hh.id, unit: [hh.address, hh.unit ? `#${hh.unit}` : ''].filter(Boolean).join(' ') || null }
    }
  }
  if (callerEmail) {
    const { data: leases } = await admin.from('lease_documents').select('landlord_id, unit_label, status').ilike('tenant_email', callerEmail).in('status', ['signed_both', 'active', 'sent', 'signed_tenant']).order('created_at', { ascending: false }).limit(3)
    for (const l of (leases ?? []) as { landlord_id: string | null; unit_label: string | null }[]) {
      if (!l.landlord_id) continue
      const { data: row } = await admin.from('landlords').select('email, auth_id').eq('id', l.landlord_id).maybeSingle()
      let email = (row?.email as string | null) ?? null
      if ((!email || !EMAIL_RE.test(email)) && row?.auth_id) {
        const { data: u } = await admin.auth.admin.getUserById(row.auth_id as string)
        email = u?.user?.email ?? null
      }
      if (email && EMAIL_RE.test(email)) return { email, auth_id: (row?.auth_id as string | null) ?? null, household_id: null, unit: l.unit_label }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Executor: maintenance_request (tenant). metadata: { title, description,
// priority }. Creates the ticket on the tenant's verified managed tenancy
// (the same table /h/[id] uses) and tells the landlord by email + push. No
// tenancy on file → 422 no_household_on_file (the assistant explains).
// ---------------------------------------------------------------------------
async function executeMaintenanceRequest(admin: Admin, userId: string, action: ActionRow, callerEmail: string | null, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const title = String(m.title || action.title || '').replace(/<[^>]*>/g, '').trim().slice(0, 140)
  const description = String(m.description || action.summary || '').replace(/<[^>]*>/g, '').trim().slice(0, 2000)
  const priority = ['low', 'medium', 'high'].includes(String(m.priority)) ? String(m.priority) : 'medium'
  if (!title) return NextResponse.json({ executed: false, reason: 'ticket title missing' }, { status: 422 })
  const ll = await resolveTenantLandlord(admin, userId, callerEmail)
  if (!ll || !ll.household_id) return NextResponse.json({ executed: false, reason: 'no_household_on_file' }, { status: 422 })
  const subject = `报修工单 · ${ll.unit || ''} · ${title} — Repair request`
  const body = `你好，

租客通过 Stayloop 提交了一张报修工单：

  • 位置 / 问题：${title}
  • 说明：${description || '（无）'}
  • 紧急程度：${priority}

工单已记录在你们的在管租约共享中心，处理进度双方可见。

Hi,

Your tenant filed a repair ticket on Stayloop:

  • Issue: ${title}
  • Details: ${description || '(none)'}
  • Priority: ${priority}

The ticket is on your shared tenancy hub; both sides see its progress.`
  if (preview) return PREVIEW({ subject, body, to: ll.email })
  if (!(await claimExecution(admin, action.id))) return ALREADY()
  const { data: ticket, error: tErr } = await admin.from('maintenance_tickets').insert({ household_id: ll.household_id, opened_by: userId, title, description: description || null, priority, status: 'new', category: 'repair' }).select('id').single()
  if (tErr || !ticket) {
    await releaseClaim(admin, action.id, tErr?.message || 'ticket insert failed')
    return NextResponse.json({ executed: false, reason: tErr?.message || 'ticket insert failed' }, { status: 500 })
  }
  const { html, text } = renderAgentMessageEmail({ subject, body })
  const result = await sendEmail({ to: ll.email, subject, html, text })
  if (ll.auth_id) void notifyUser(admin, ll.auth_id, { kind: 'event', title: '新的报修工单 / New repair ticket', body: title, url: `/h/${ll.household_id}` })
  const executionResult = { ok: true, kind: 'ticket', ticket_id: ticket.id, household_id: ll.household_id, email_id: result.ok ? result.id : null, sent_to: ll.email, email_error: result.ok ? null : result.error }
  return finalizeExecution(admin, userId, action.id, 'executed_maintenance_request', executionResult, { ticket_id: ticket.id, household_id: ll.household_id, sent_to: ll.email })
}

async function executeSendMessage(
  admin: Admin,
  userId: string,
  action: ActionRow,
  callerEmail: string | null,
  preview = false,
): Promise<NextResponse> {
  const m = action.metadata || {}
  const candidate = (typeof m.to_email === 'string' ? m.to_email : '').trim()
  const fallback = (action.recipient_label || '').trim()
  let to = EMAIL_RE.test(candidate) ? candidate : (EMAIL_RE.test(fallback) ? fallback : null)
  let derived = false
  if (!to && action.role === 'tenant') {
    // Turn-proposed cards carry no address; the landlord comes from the
    // tenant's own tenancy rows (see resolveTenantLandlord).
    const ll = await resolveTenantLandlord(admin, userId, callerEmail)
    if (ll) { to = ll.email; derived = true }
  }
  if (!to) {
    return NextResponse.json({ executed: false, reason: action.role === 'tenant' ? 'no_landlord_on_file' : 'no valid recipient email' }, { status: 422 })
  }
  if (!derived && !(await isKnownCounterparty(admin, userId, to))) {
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
  if (preview) return PREVIEW({ subject, body: bodyText, to })

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
  preview = false,
): Promise<NextResponse> {
  const m0 = action.metadata || {}
  const lease = await loadOwnedLease(admin, userId, m0.lease_id)
  if (!lease) {
    return NextResponse.json({ executed: false, reason: 'lease not found or not yours' }, { status: 403 })
  }
  if (!lease.tenant_email) {
    return NextResponse.json({ executed: false, reason: 'lease has no tenant email on file' }, { status: 422 })
  }
  const m = { ...m0, tenant_email: lease.tenant_email, tenant_name: lease.tenant_name, unit_label: lease.unit_label, monthly_rent: lease.monthly_rent }
  if (!m.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(m.due_date))) {
    return NextResponse.json({ executed: false, reason: 'reminder has no due date' }, { status: 422 })
  }

  const { subject, html, text } = renderRentReminderEmail({
    tenantName: m.tenant_name,
    unitLabel: m.unit_label,
    monthlyRent: Number(m.monthly_rent) || 0,
    dueDate: m.due_date,
  })
  if (preview) return PREVIEW({ subject, body: text, to: m.tenant_email })
  if (!(await claimExecution(admin, action.id))) return ALREADY()
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

// ---------------------------------------------------------------------------
// Executor: renewal_checkpoint (60d / 30d touchpoints, lib/agent/renewalStages)
// Approval = "acknowledged". No side effect beyond the stamp + audit.
// ---------------------------------------------------------------------------
async function executeRenewalCheckpoint(admin: Admin, userId: string, action: ActionRow): Promise<NextResponse> {
  if (!(await claimExecution(admin, action.id))) return ALREADY()
  const m = action.metadata || {}
  const executionResult = { ok: true, kind: 'acknowledged', stage: m.stage ?? null, lease_id: m.lease_id ?? null }
  return finalizeExecution(admin, userId, action.id, 'executed_renewal_checkpoint', executionResult, {
    stage: m.stage ?? null,
    lease_id: m.lease_id ?? null,
  })
}

// ---------------------------------------------------------------------------
// Executor: showing_request / listing_inquiry
// metadata: { intent_id, listing_id }. The tenant's request is loaded from
// showing_intents (server-written by /api/showing-intent), the recipient is
// the tenant's login email, and the listing must belong to the caller.
// Approval = the landlord accepts: the tenant gets an email with the
// landlord's contact so the two continue directly; the intent row flips to
// `accepted`.
// ---------------------------------------------------------------------------
async function executeShowingRequest(admin: Admin, userId: string, action: ActionRow, callerEmail: string | null, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const intentId = typeof m.intent_id === 'string' ? m.intent_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(intentId)) {
    return NextResponse.json({ executed: false, reason: 'intent_id missing' }, { status: 422 })
  }
  const { data: intent } = await admin
    .from('showing_intents')
    .select('id, tenant_id, listing_id, move_in_date, message, status')
    .eq('id', intentId)
    .maybeSingle()
  if (!intent) return NextResponse.json({ executed: false, reason: 'intent not found' }, { status: 404 })
  const { data: landlordRows } = await admin.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  const { data: listing } = await admin
    .from('listings')
    .select('id, address, unit, landlord_id')
    .eq('id', intent.listing_id)
    .maybeSingle()
  if (!listing || !landlordIds.includes(listing.landlord_id as string)) {
    return NextResponse.json({ executed: false, reason: 'listing is not yours' }, { status: 403 })
  }
  const { data: tenant } = await admin.from('tenants').select('email, full_name').eq('id', intent.tenant_id).maybeSingle()
  const to = (tenant?.email || '').trim()
  if (!EMAIL_RE.test(to)) return NextResponse.json({ executed: false, reason: 'tenant has no email' }, { status: 422 })

  const addr = [listing.address, listing.unit ? `#${listing.unit}` : ''].filter(Boolean).join(' ')
  const isShowing = action.action_type === 'showing_request'
  const contact = callerEmail ? `房东联系邮箱：${callerEmail}` : '房东会通过 Stayloop 继续联系你。'
  const contactEn = callerEmail ? `Landlord contact: ${callerEmail}` : 'The landlord will follow up through Stayloop.'
  const body = isShowing
    ? `${tenant?.full_name || ''} 你好，

你对 ${addr} 的看房请求房东已经收到并同意安排。` +
      (intent.move_in_date ? `你填写的期望入住日期：${intent.move_in_date}。` : '') +
      `
请直接与房东约定时间。${contact}

` +
      `Hi ${tenant?.full_name || ''},

The landlord has received your showing request for ${addr} and agreed to arrange a viewing.` +
      (intent.move_in_date ? ` Your preferred move-in date: ${intent.move_in_date}.` : '') +
      `
Please arrange the time directly with the landlord. ${contactEn}`
    : `${tenant?.full_name || ''} 你好，

你关于 ${addr} 的提问房东已经收到。${contact}

你的问题：
${String(intent.message || '').slice(0, 2000)}

` +
      `Hi ${tenant?.full_name || ''},

The landlord has received your question about ${addr}. ${contactEn}`
  const subject = isShowing
    ? `看房请求已确认 · ${addr} / Showing request accepted`
    : `房东已收到你的提问 · ${addr} / Your question was received`
  if (preview) return PREVIEW({ subject, body, to })
  if (!(await claimExecution(admin, action.id))) return ALREADY()
  const { html, text } = renderAgentMessageEmail({ subject, body })
  const result = await sendEmail({ to, subject, html, text })
  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }
  await admin.from('showing_intents').update({ status: 'accepted' }).eq('id', intent.id)
  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: to, intent_id: intent.id }
  return finalizeExecution(admin, userId, action.id, isShowing ? 'executed_showing_request' : 'executed_listing_inquiry', executionResult, {
    sent_to: to,
    subject,
    email_id: result.id,
    intent_id: intent.id,
    listing_id: listing.id,
  })
}

// ---------------------------------------------------------------------------
// Executor: send_decision (lifecycle plan §2.1)
// metadata: { application_id, decision: approved|declined|needs_more, reason? }
// The landlord decided on the applicant page; approving this card sends the
// notice. The application row is loaded server-side and must belong to a
// listing the caller owns; the recipient is the application's email.
// ---------------------------------------------------------------------------
async function executeSendDecision(admin: Admin, userId: string, action: ActionRow, callerEmail: string | null, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const appId = typeof m.application_id === 'string' ? m.application_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(appId)) return NextResponse.json({ executed: false, reason: 'application_id missing' }, { status: 422 })
  const decision = m.decision === 'approved' || m.decision === 'declined' || m.decision === 'needs_more' ? m.decision : null
  if (!decision) return NextResponse.json({ executed: false, reason: 'decision missing' }, { status: 422 })
  const { data: app } = await admin
    .from('applications')
    .select('id, first_name, last_name, email, status, listing:listings(id, address, unit, landlord_id)')
    .eq('id', appId)
    .maybeSingle()
  if (!app) return NextResponse.json({ executed: false, reason: 'application not found' }, { status: 404 })
  const listing = (Array.isArray(app.listing) ? app.listing[0] : app.listing) as { id: string; address: string; unit: string | null; landlord_id: string } | null
  const { data: landlordRows } = await admin.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  if (!listing || !landlordIds.includes(listing.landlord_id)) return NextResponse.json({ executed: false, reason: 'application is not on your listing' }, { status: 403 })
  const to = String(app.email || '').trim()
  if (!EMAIL_RE.test(to)) return NextResponse.json({ executed: false, reason: 'applicant has no email' }, { status: 422 })

  const name = [app.first_name, app.last_name].filter(Boolean).join(' ') || 'there'
  const addr = [listing.address, listing.unit ? `#${listing.unit}` : ''].filter(Boolean).join(' ')
  const reason = typeof m.reason === 'string' ? m.reason.replace(/<[^>]*>/g, '').trim().slice(0, 600) : ''
  const contact = callerEmail ? `房东联系邮箱 / Landlord contact: ${callerEmail}` : ''
  const footer = `${decisionNoticeFooter('zh')}\n\n${decisionNoticeFooter('en')}`
  let subject: string
  let body: string
  if (decision === 'approved') {
    subject = `申请已录取 · ${addr} / Your application was approved`
    body = `${name} 你好，\n\n关于 ${addr} 的租房申请，房东已决定录取你。接下来房东会通过 Stayloop 把安省标准租约发到这个邮箱，请留意签署链接。\n${contact}\n\nHi ${name},\n\nGood news — the landlord has approved your application for ${addr}. The Ontario standard lease will follow to this address through Stayloop; watch for the signing link.\n\n${footer}`
  } else if (decision === 'needs_more') {
    subject = `申请需要补充材料 · ${addr} / Your application needs more information`
    body = `${name} 你好，\n\n关于 ${addr} 的租房申请，房东需要你补充以下材料后才能继续：\n${reason || '（房东未填写具体项目，请直接回复询问）'}\n${contact}\n\nHi ${name},\n\nBefore the landlord can continue with your application for ${addr}, they need the following:\n${reason || '(not specified — reply to ask)'}\n\n${footer}`
  } else {
    subject = `申请结果 · ${addr} / Your application decision`
    body = `${name} 你好，\n\n很遗憾，关于 ${addr} 的租房申请，房东这次没有选择你。${reason ? `房东给出的理由：${reason}` : ''}\n${contact}\n\nHi ${name},\n\nWe are sorry — the landlord did not select your application for ${addr} this time.${reason ? ` The landlord's stated reason: ${reason}` : ''}\n\n${footer}`
  }
  if (preview) return PREVIEW({ subject, body, to })
  if (!(await underHourlyLimit(`mail:agent-execute:${userId}`, 20, false))) {
    return NextResponse.json({ executed: false, reason: 'hourly send limit reached' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }
  if (!(await claimExecution(admin, action.id))) return ALREADY()
  const { html, text } = renderAgentMessageEmail({ subject, body })
  const result = await sendEmail({ to, subject, html, text })
  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }
  const newStatus = decision === 'approved' ? 'approved' : decision === 'declined' ? 'declined' : 'reviewing'
  await admin.from('applications').update({ status: newStatus, decision_notified_at: new Date().toISOString(), decision_reason: reason || null }).eq('id', app.id)
  await admin.from('compliance_events').insert({ user_id: userId, role: 'landlord', source: 'decision_notice', rule_id: 'CRA-10-7-notice', severity: 'info', target_type: 'application', target_id: app.id, metadata: { decision } })
  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: to, decision }
  return finalizeExecution(admin, userId, action.id, 'executed_send_decision', executionResult, { application_id: app.id, decision, sent_to: to, email_id: result.id, reason_given: !!reason })
}

// ---------------------------------------------------------------------------
// Executor: send_lease (lifecycle plan §2.1)
// metadata: { lease_id }. Same path as /api/lease/send, with the assistant's
// proposal + the landlord's approval in front of it.
// ---------------------------------------------------------------------------
async function executeSendLease(admin: Admin, userId: string, action: ActionRow, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const leaseId = typeof m.lease_id === 'string' ? m.lease_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(leaseId)) return NextResponse.json({ executed: false, reason: 'lease_id missing' }, { status: 422 })
  const { data: landlordRows } = await admin.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  const { data: lease } = await admin
    .from('lease_documents')
    .select('id, landlord_id, form_type, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature')
    .eq('id', leaseId)
    .maybeSingle<LeaseForSend>()
  if (!lease || !lease.landlord_id || !landlordIds.includes(lease.landlord_id)) return NextResponse.json({ executed: false, reason: 'lease not found or not yours' }, { status: 403 })
  const pre = leaseSendPreflight(lease)
  if (!pre.ok) return NextResponse.json({ executed: false, reason: pre.error }, { status: pre.status })
  if (preview) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
    const mail = buildLeaseInvite(lease, `${siteUrl}/lease/sign/<签署链接 · 批准后生成>`)
    return PREVIEW({ subject: mail.subject, body: mail.text, to: lease.tenant_email })
  }
  if (!(await claimExecution(admin, action.id))) return ALREADY()
  const sent = await sendLeaseInvitation(admin, lease, userId)
  if (!sent.ok) {
    await releaseClaim(admin, action.id, sent.error)
    return NextResponse.json({ executed: false, reason: sent.error }, { status: sent.status })
  }
  const executionResult = { ok: true, kind: 'email', email_id: sent.email_id, sent_to: sent.sent_to, lease_id: lease.id }
  return finalizeExecution(admin, userId, action.id, 'executed_send_lease', executionResult, { lease_id: lease.id, sent_to: sent.sent_to, email_id: sent.email_id })
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
  if (ud.user.is_anonymous) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const userId = ud.user.id

  let body: { action_id?: string; option?: 'A' | 'B'; preview?: boolean }
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
    .select('id, user_id, role, action_type, title, summary, recipient_label, status, executed_at, metadata')
    .eq('id', body.action_id)
    .maybeSingle<ActionRow>()
  if (!action) return NextResponse.json({ error: 'action not found' }, { status: 404 })
  if (action.user_id !== userId) return NextResponse.json({ error: 'not your action' }, { status: 403 })
  const preview = body.preview === true
  // Preview is allowed while the card is still pending (that is the point);
  // execution needs the approval.
  if (preview ? !['pending', 'approved'].includes(action.status) : action.status !== 'approved') {
    return NextResponse.json({ executed: false, reason: `action is ${action.status}, not approved` }, { status: 409 })
  }
  if (!preview && action.executed_at) {
    return ALREADY()
  }

  // Every executor below sends mail from the Stayloop domain to an address
  // that ultimately traces back to rows the caller can write (their own
  // lease's tenant_email, an application on their own listing). The
  // counterparty checks narrow WHO; this caps HOW MANY (review 2026-09-19).
  if (!preview && ['send_renewal_letter', 'send_message', 'rent_reminder', 'showing_request', 'listing_inquiry', 'send_lease', 'send_decision', 'maintenance_request'].includes(action.action_type)) {
    if (!(await underHourlyLimit(`mail:agent-execute:${userId}`, 20, false))) {
      return NextResponse.json({ executed: false, reason: 'hourly send limit reached' }, { status: 429, headers: { 'Retry-After': '3600' } })
    }
  }

  // Per-type dispatch. Only action types with a real executor get claimed;
  // everything else is approval-only for now (the approval itself was
  // already recorded).
  switch (action.action_type) {
    case 'send_renewal_letter':
      return executeSendRenewalLetter(admin, userId, action, body.option, preview)
    case 'send_message':
      return executeSendMessage(admin, userId, action, ud.user.email ?? null, preview)
    case 'maintenance_request':
      return executeMaintenanceRequest(admin, userId, action, ud.user.email ?? null, preview)
    case 'rent_reminder':
      return executeRentReminder(admin, userId, action, preview)
    case 'renewal_checkpoint':
      if (preview) return PREVIEW({ subject: action.title, body: action.summary || '', to: null })
      return executeRenewalCheckpoint(admin, userId, action)
    case 'showing_request':
    case 'listing_inquiry':
      return executeShowingRequest(admin, userId, action, ud.user.email ?? null, preview)
    case 'send_decision':
      return executeSendDecision(admin, userId, action, ud.user.email ?? null, preview)
    case 'send_lease':
      return executeSendLease(admin, userId, action, preview)
    default:
      if (preview) return NextResponse.json({ preview: null, reason: 'no_executor_for_type' })
      return NextResponse.json({ executed: false, reason: 'no_executor_for_type' })
  }
}

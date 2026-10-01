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
//
// Sweep 2026-10-01: a card is a snapshot, the world moves on. Every executor
// re-reads the rows its card is about (lease, application, invite, rent
// ledger, listing, ticket) and refuses a card that can no longer do what it
// says: the row is stamped `expired` with the reason and the response is
// 409 {executed:false, reason, expired:true}. A failure that leaves the card
// valid keeps it `approved` with executed_at null, so a retry runs it.
// Preview failures come back as {preview:null, reason, expired?} with the
// executor's status.
import { underHourlyLimit } from '@/lib/rateLimit'
import { ENTRY_PERMISSIONS, isEmergencyMaintenance, MAINTENANCE_CATEGORIES, triageLines } from '@/lib/agent/maintenanceTriage'
import { NextResponse } from 'next/server'
import { matterRef } from '@/lib/agent/audit'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, renderAgentMessageEmail, renderRentReminderEmail } from '@/lib/email'
import { sendLeaseInvitation, leaseSendPreflight, buildLeaseInvite, type LeaseForSend } from '@/lib/lease/sendLease'
import { decisionNoticeFooter, guidelineFor, n1DeadlineFor } from '@/lib/ontario/rules'
import { rentAmount } from '@/lib/agent/chatCopy'
import { notifyUser } from '@/lib/push/notify'
import { actOnWorkOrder, createWorkOrder, suggestDispatch } from '@/lib/marketplace/server'
import { findOpenDuplicate, type OpenTicketLite } from '@/lib/agent/userContext'
import { displayNameFor, ensureListingThread, ensureThread, notifyThreadParties, postSystemMessage, replyTokenFor } from '@/lib/threads/server'
import { messageCenterHref } from '@/lib/threads/shared'
import { replyAddress } from '@/lib/threads/emailReply'
import { matterOfRef } from '@/lib/matters/server'
import { SUCCESSOR_STATUSES, latestIntentFor, renewalSkipReason, type LeaseSlot, type RenewalIntent } from '@/lib/agent/renewalStages'

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
  created_at?: string | null
  /** set by decide_pending_action (sweep 2026-10-01) */
  decided_at?: string | null
  expires_at?: string | null
  execution_result?: Record<string, unknown> | null
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
    // send_message · invite reminder (lib/agent/proactiveExtras)
    invite_id?: string
    // send_message · repayment plan (components/household/PaymentPlanDraft)
    missed_due_dates?: string[]
    installments?: number
    first_due?: string
    arrears_total?: number
    // renewal_checkpoint / send_message stage (30d, payment_plan, invite_reminder)
    stage?: string
    // showing_request / listing_inquiry
    intent_id?: string
    listing_id?: string
    tenant_auth_id?: string
    kind?: string
    messages?: { kind?: string; message?: string | null; move_in_date?: string | null; intent_id?: string; at?: string }[]
    // send_decision
    application_id?: string
    decision?: 'approved' | 'declined' | 'needs_more'
    reason?: string
    // maintenance_request (turn-proposed; strings only, clamped by the turn route)
    title?: string
    description?: string
    priority?: string
    category?: string
    location?: string
    entry_permission?: string
    pets?: string
    // work orders (services marketplace)
    work_order_id?: string
    ticket_id?: string
    household_id?: string
    candidates?: { provider_id: string; name: string }[]
    expected_amount?: number | string | null
    provider_id?: string
    external_email?: string
    external_name?: string
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
  // The card stays approved with executed_at null: a retry runs it (C2).
  if (error) patch.execution_result = { ok: false, reason: error, error, at: new Date().toISOString() }
  await admin.from('agent_pending_actions').update(patch).eq('id', actionId)
}

const UUID_RE = /^[0-9a-f-]{36}$/i
const STALE_APPROVAL_DAYS = 7

// Ontario calendar date (YYYY-MM-DD): due dates, lease ends and N1 deadlines are local dates.
function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
const dayAfter = (iso: string) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
const isRecordedPaid = (p: { status?: string | null; paid_at?: string | null }) => p.status === 'paid' || p.status === 'late' || !!p.paid_at

// The card can no longer do what it says (sweep 2026-10-01): stamp it expired
// while it is still unexecuted, so it leaves every list, and say why.
// When no row changed, another request got there first (a retry and a resumed
// countdown, two tabs): its sending can itself trip this card's "already
// notified" check, so read what happened instead of calling it expired.
async function expireCard(admin: Admin, actionId: string, result: { reason: string } & Record<string, unknown>): Promise<NextResponse> {
  const expire = () => admin.from('agent_pending_actions')
    .update({ status: 'expired', execution_result: { ok: false, ...result, at: new Date().toISOString() } })
    .eq('id', actionId)
    .in('status', ['pending', 'approved'])
    .is('executed_at', null)
    .select('id')
  const expiredNow = () => NextResponse.json({ executed: false, reason: result.reason, expired: true }, { status: 409 })
  const { data: changed } = await expire()
  if (changed && changed.length) return expiredNow()
  const { data: row } = await admin.from('agent_pending_actions').select('status, executed_at, execution_result').eq('id', actionId).maybeSingle()
  const cur = row as { status: string; executed_at: string | null; execution_result: Record<string, unknown> | null } | null
  if (!cur) return expiredNow()
  if (cur.executed_at) return afterLostClaim(admin, actionId, cur)
  if (cur.status === 'expired') {
    const why = typeof cur.execution_result?.reason === 'string' ? cur.execution_result.reason : result.reason
    return NextResponse.json({ executed: false, reason: why, expired: true }, { status: 409 })
  }
  if (cur.status === 'pending' || cur.status === 'approved') {
    // The other request released its claim in between: the card is still unexecuted, expire it now.
    const { data: again } = await expire()
    if (again && again.length) return expiredNow()
    return NextResponse.json({ executed: false, reason: 'state changed, retry' }, { status: 409 })
  }
  return NextResponse.json({ executed: false, reason: `action is ${cur.status}, not approved` }, { status: 409 })
}

// The workflow's "已完成" list is fed to the next system prompt: only an action
// that actually ran belongs there (decide_pending_action no longer appends on
// approval — an approved card whose email bounced is not done).
async function markStepCompleted(admin: Admin, userId: string, role: string | null | undefined, actionType: string): Promise<void> {
  if (!role || !actionType) return
  try {
    const { data } = await admin.from('task_memories').select('id, completed_steps').eq('user_id', userId).eq('role', role).eq('status', 'active')
    for (const t of (data ?? []) as { id: string; completed_steps: string[] | null }[]) {
      const steps = Array.isArray(t.completed_steps) ? t.completed_steps : []
      if (steps.includes(actionType)) continue
      await admin.from('task_memories').update({ completed_steps: [...steps, actionType], updated_at: new Date().toISOString() }).eq('id', t.id)
    }
  } catch (e) {
    console.warn('[agent/execute] completed_steps update failed:', (e as Error).message)
  }
}

// Stamp the successful execution_result and write the unskippable audit event
// (service role — no client can execute without leaving a trail).
async function finalizeExecution(
  admin: Admin,
  userId: string,
  action: Pick<ActionRow, 'id' | 'metadata' | 'action_type'> & { role?: string | null },
  auditAction: string,
  executionResult: Record<string, unknown>,
  auditMetadata: Record<string, unknown>,
): Promise<NextResponse> {
  const actionId = action.id
  await admin.from('agent_pending_actions')
    .update({ execution_result: executionResult })
    .eq('id', actionId)
  if (executionResult.ok === true) await markStepCompleted(admin, userId, action.role, action.action_type)

  // The receipt names the hat and the matter (节点 2 2026-09-26): which ids the
  // executor put in its metadata decide the matter reference.
  const ref = matterRef({ ...(action.metadata as Record<string, unknown> | null), ...auditMetadata })
  // 节点 5: the receipt also carries the rental matter (one id from application to move-out).
  const rentalMatterId = await matterOfRef(admin, ref.matterType, ref.matterId)
  const { error: auditErr } = await admin.from('agent_audit_events').insert({
    actor_id: userId,
    actor_type: 'agent',
    action: auditAction,
    target_type: 'agent_pending_action',
    target_id: actionId,
    acting_role: action.role ?? null,
    matter_type: ref.matterType,
    matter_id: ref.matterId,
    rental_matter_id: rentalMatterId,
    // thread_id = the conversation the card was proposed in (null for cron /
    // to-do-page cards) — the activity log folds the execution into that row.
    metadata: { ...auditMetadata, thread_id: (action.metadata as Record<string, unknown> | null)?.thread_id ?? null },
  })
  if (auditErr) console.error('[agent/execute] audit insert failed:', auditErr.message)

  return NextResponse.json({ executed: true, result: executionResult, audited: !auditErr })
}

const ALREADY = () => NextResponse.json({ executed: true, already: true, result: null })

type ClaimState = { status: string; executed_at: string | null; execution_result: Record<string, unknown> | null }
/**
 * Another request holds this card, or its status moved, between the read and
 * the claim. executed_at is stamped when a request CLAIMS the card, not when
 * it finishes: that request may still be sending, and it can fail and release
 * the claim. Only a success stamp means it ran (review 2026-10-01) — anything
 * else must not reach the chat as 「已经在另一个页面执行了」.
 */
async function afterLostClaim(admin: Admin, actionId: string, known?: ClaimState | null): Promise<NextResponse> {
  let cur = known ?? null
  if (!cur) {
    const { data } = await admin.from('agent_pending_actions').select('status, executed_at, execution_result').eq('id', actionId).maybeSingle()
    cur = (data as ClaimState | null) ?? null
  }
  if (!cur) return NextResponse.json({ executed: false, reason: 'action not found' }, { status: 404 })
  if (cur.executed_at && cur.execution_result?.ok === true) return ALREADY()
  if (cur.status === 'expired') {
    const why = typeof cur.execution_result?.reason === 'string' ? cur.execution_result.reason : 'expired'
    return NextResponse.json({ executed: false, reason: why, expired: true }, { status: 409 })
  }
  if (cur.status !== 'approved') return NextResponse.json({ executed: false, reason: `action is ${cur.status}, not approved` }, { status: 409 })
  // Claimed elsewhere and still running (or it failed and the release is on its way).
  if (cur.executed_at) return NextResponse.json({ executed: false, reason: 'in_flight' }, { status: 409 })
  // The other request released its claim in between: the card is unexecuted again.
  return NextResponse.json({ executed: false, reason: 'state changed, retry' }, { status: 409 })
}

/**
 * Review 2026-09-14: pending actions are written client-side under RLS, so
 * every field in `metadata` is caller-controlled. The two lease-derived
 * executors used to email `metadata.tenant_email` verbatim — an open mail
 * relay on the Stayloop domain. Resolve the lease by id, prove the caller
 * is its landlord, and take recipient + facts from the lease row itself.
 */
type OwnedLease = {
  id: string; tenant_email: string | null; tenant_name: string | null; unit_label: string | null
  monthly_rent: number | null; start_date: string | null; end_date: string | null; status: string | null
  listing_id: string | null; created_at: string | null; landlord_id: string | null; landlord_ids: string[]
}
// No status filter: an imported (paper) lease is a lease the landlord runs like any other.
async function loadOwnedLease(admin: Admin, userId: string, leaseId: unknown): Promise<OwnedLease | null> {
  if (typeof leaseId !== 'string' || !UUID_RE.test(leaseId)) return null
  const { data: landlordRows } = await admin.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  if (!landlordIds.length) return null
  const { data: lease } = await admin
    .from('lease_documents')
    .select('id, tenant_email, tenant_name, unit_label, monthly_rent, start_date, end_date, status, listing_id, created_at, landlord_id')
    .eq('id', leaseId)
    .in('landlord_id', landlordIds)
    .maybeSingle()
  return lease ? { ...(lease as Omit<OwnedLease, 'landlord_ids'>), landlord_ids: landlordIds } : null
}

/**
 * A tenant-imported tenancy has a lease row with no landlord_id (create_household_import):
 * the landlord who joined by invite runs it from the hub but loadOwnedLease cannot see it
 * as theirs, so every repayment-plan card they drafted failed 403 (review 2026-10-01).
 * Authorise by the household instead: the caller is an active landlord member, and the
 * lease is the household's current one (or the one a renewal replaced). Only the
 * payment-plan path uses this.
 */
async function loadHouseholdLease(admin: Admin, userId: string, householdId: unknown, leaseId: unknown): Promise<OwnedLease | null> {
  if (typeof householdId !== 'string' || !UUID_RE.test(householdId) || typeof leaseId !== 'string' || !UUID_RE.test(leaseId)) return null
  const [{ data: hh }, { data: mem }] = await Promise.all([
    admin.from('households').select('id, current_lease_id, previous_lease_id').eq('id', householdId).maybeSingle(),
    admin.from('household_members').select('user_id').eq('household_id', householdId).eq('user_id', userId).eq('role', 'landlord').eq('status', 'active').limit(1),
  ])
  // The current lease, or the one a renewal replaced (its unrecorded periods stay on the hub).
  const hr = hh as { current_lease_id: string | null; previous_lease_id?: string | null } | null
  if (!hr || (hr.current_lease_id !== leaseId && hr.previous_lease_id !== leaseId) || !((mem ?? []) as unknown[]).length) return null
  const { data: lease } = await admin
    .from('lease_documents')
    .select('id, tenant_email, tenant_name, unit_label, monthly_rent, start_date, end_date, status, listing_id, created_at, landlord_id')
    .eq('id', leaseId)
    .maybeSingle()
  if (!lease) return null
  const row = lease as Omit<OwnedLease, 'landlord_ids'>
  // No tenant email on the imported lease row: the household's tenant member is the recipient.
  if (!(row.tenant_email || '').trim()) {
    const { data: tm } = await admin.from('household_members').select('user_id').eq('household_id', householdId).eq('role', 'tenant').eq('status', 'active').limit(1)
    const tid = (tm?.[0] as { user_id: string } | undefined)?.user_id
    if (tid) {
      const { data: u } = await admin.auth.admin.getUserById(tid)
      if (u?.user?.email) row.tenant_email = u.user.email
    }
  }
  return { ...row, landlord_ids: [] }
}

/**
 * Why a renewal touchpoint (the letter, the 30-day intent ask) about this lease
 * is moot, or null. The lease already ended; or the planner's own skip rule
 * (lib/agent/renewalStages renewalSkipReason) says so — a signed successor on
 * the same unit (successorLease: SUCCESSOR_STATUSES, same landlord, same unit,
 * starting after this one; a sent-but-unsigned draft is not a renewal), or the
 * tenant's latest recorded intent is to leave. One rule for both, so the
 * proactive sweep never proposes a card the executor then refuses, or the
 * other way round (B1 2026-10-01).
 */
async function renewalBlocker(admin: Admin, lease: OwnedLease, today: string): Promise<string | null> {
  return (await renewalState(admin, lease, today)).blocked
}

/** renewalBlocker plus the tenant's newest recorded answer (same rows, same matching as the planner). */
async function renewalState(admin: Admin, lease: OwnedLease, today: string): Promise<{ blocked: string | null; intent: RenewalIntent | null }> {
  if (lease.status === 'ended' || (lease.end_date && lease.end_date < today)) return { blocked: 'lease_ended', intent: null }
  const [{ data: others }, { data: hh }] = await Promise.all([
    admin
      .from('lease_documents')
      .select('id, landlord_id, unit_label, listing_id, tenant_email, start_date, end_date, status')
      .in('landlord_id', lease.landlord_ids)
      .neq('id', lease.id)
      .in('status', [...SUCCESSOR_STATUSES]),
    // Intents saved without a lease id count when they sit on the household this lease is current on.
    admin.from('households').select('id').eq('current_lease_id', lease.id).limit(5),
  ])
  // Same successor set the planner loads: signed and not already over.
  const laterLeases = ((others ?? []) as LeaseSlot[]).filter((o) => !o.end_date || o.end_date >= today)
  const hhIds = ((hh ?? []) as { id: string }[]).map((h) => h.id)
  const [byLease, byHousehold] = await Promise.all([
    admin.from('renewal_intents').select('lease_id, household_id, intent, created_at').eq('lease_id', lease.id).order('created_at', { ascending: false }).limit(20),
    hhIds.length ? admin.from('renewal_intents').select('lease_id, household_id, intent, created_at').in('household_id', hhIds).is('lease_id', null).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] as unknown[] }),
  ])
  const intents: RenewalIntent[] = [
    ...((byLease.data ?? []) as RenewalIntent[]),
    // Household-level answers are about this lease (the household it is current on).
    ...((byHousehold.data ?? []) as RenewalIntent[]).map((i) => ({ ...i, lease_id: lease.id })),
  ]
  const slot = { ...lease, household_id: hhIds[0] ?? null, end_date: lease.end_date ?? '' }
  return { blocked: renewalSkipReason(slot, { laterLeases, intents }), intent: latestIntentFor(slot, intents) }
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
  if (!lease.end_date) {
    return NextResponse.json({ executed: false, reason: 'lease has no end date' }, { status: 422 })
  }
  // A letter about a lease that ended, was renewed another way, or whose
  // tenant said they are leaving would contradict the record (sweep 2026-10-01).
  const today = torontoToday()
  const blocked = await renewalBlocker(admin, lease, today)
  if (blocked) return expireCard(admin, action.id, { reason: blocked, lease_id: lease.id })
  // Facts come from the lease row; only the option/guideline maths may come
  // from the proposal, and the guideline is re-derived from the lease rent.
  // Guideline for the year the increase takes effect (RTA s.120): 2026 is
  // 2.1%, 2027 is 1.9% — never a hard-coded 2.5%.
  const effective = dayAfter(lease.end_date)
  const g = guidelineFor(effective)
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
  // An increase effective the day after the lease ends needs an N1 at least 90
  // days before (RTA s.116). Past that date option B would promise an increase
  // the landlord can no longer give on that date; option A is still valid, so
  // the card stays approved for a retry with A.
  const n1Deadline = n1DeadlineFor(effective)
  if (option === 'B' && today > n1Deadline) {
    // blocks_option: only B is refused — the same card still sends option A.
    return NextResponse.json({ executed: false, reason: 'past_n1_deadline', n1_deadline: n1Deadline, blocks_option: 'B' }, { status: 409 })
  }
  if (!preview && !(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const rent = option === 'A' ? m.current_rent : (m.guideline_rent ?? m.current_rent)
  const tenant = m.tenant_name || 'Tenant'
  const unit = m.unit_label || 'your unit'
  const subject = `Lease renewal offer — ${unit}`
  const text = `Hi ${tenant},

Your current lease for ${unit} ends on ${m.end_date}. Your landlord would like to offer a renewal:

  • Proposed monthly rent: $${rentAmount(rent ?? 0)}${option === 'B' ? ` (current $${rentAmount(m.current_rent ?? 0)} + ${m.guideline_pct}% — within Ontario's ${m.guideline_year} rent increase guideline)` : ' (unchanged)'}
  • New term: 12 months from ${m.end_date}

Reply to this email to accept, discuss, or ask questions. Under Ontario's Residential Tenancies Act you may also choose to continue month-to-month on your existing terms.

— Sent by the landlord's AI Agent on Stayloop, after landlord approval.
此邮件由房东在 Stayloop 上批准后由其 AI 助理发送：${unit} 的租约将于 ${m.end_date} 到期，房东提议以月租 $${rentAmount(rent ?? 0)} 续约 12 个月。你也可以依据安省 RTA 按原条款转为月租。直接回复本邮件即可沟通。`

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

  // 节点 4: a copy of the letter in the tenancy thread (household by lease); the email is the letter.
  {
    const { data: hhRow } = await admin.from('households').select('id, address, unit').eq('current_lease_id', String(m.lease_id)).maybeSingle()
    const hh = hhRow as { id: string; address: string; unit: string | null } | null
    if (hh) {
      const th = await ensureThread(admin, 'tenancy', hh.id, { householdId: hh.id, title: `${hh.address}${hh.unit ? ` #${hh.unit}` : ''}`, createdBy: userId })
      if (th) await postSystemMessage(admin, th.id, { kind: 'formal_copy', senderKind: 'landlord', senderId: userId, actingRole: 'landlord', senderLabel: '房东 · 续约函 / Landlord · renewal letter', body: `${subject}\n\n${text}`, meta: { notice: 'renewal_letter', lease_id: m.lease_id, sent_to: m.tenant_email, option } })
    }
  }
  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: m.tenant_email, option, rent }
  return finalizeExecution(admin, userId, action, 'executed_send_renewal_letter', executionResult, {
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
 * Has the arrears a repayment-plan card demands changed since it was drafted?
 * The card lists the unpaid periods it was built from (missed_due_dates, C5):
 * any of them now recorded paid → the stated total is wrong. A card from
 * before the list existed changes on any payment recorded after it was made.
 */
async function paymentPlanChange(
  admin: Admin,
  leaseId: string,
  m: { missed_due_dates?: unknown },
  cardCreatedAt: string | null,
): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from('rent_payments').select('due_date, status, paid_at').eq('lease_id', leaseId)
  const rows = (data ?? []) as { due_date: string; status: string | null; paid_at: string | null }[]
  if (Array.isArray(m.missed_due_dates)) {
    const listed = Array.from(new Set(m.missed_due_dates.map((d) => String(d).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))))
    if (!listed.length) return { why: 'no_missed_periods' }
    const recorded = listed.filter((d) => rows.some((p) => String(p.due_date).slice(0, 10) === d && isRecordedPaid(p)))
    return recorded.length ? { recorded_due_dates: recorded } : null
  }
  const since = cardCreatedAt ? Date.parse(cardCreatedAt) : NaN
  if (!Number.isFinite(since)) return null
  const recorded = rows.filter((p) => isRecordedPaid(p) && p.paid_at && Date.parse(p.paid_at) >= since).map((p) => String(p.due_date).slice(0, 10))
  return recorded.length ? { recorded_due_dates: recorded } : null
}

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

  // Tenants the caller invited to a managed tenancy (invite reminders, P1 2026-09-23).
  // A revoked invite was a mistake (wrong person): never a counterparty.
  {
    const { data } = await admin.from('household_invites').select('invited_email').eq('invited_by', userId).is('revoked_at', null).limit(200)
    if ((data ?? []).some((i: { invited_email: string | null }) => i.invited_email?.trim().toLowerCase() === target)) return true
  }
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
  const { data: mem } = await admin.from('household_members').select('household_id, role').eq('user_id', userId).eq('role', 'tenant').eq('status', 'active')
  const hhIds = (mem ?? []).map((r: { household_id: string }) => r.household_id)
  if (hhIds.length) {
    const { data: hhs } = await admin.from('households').select('id, verified, status, address, unit').in('id', hhIds).eq('verified', true).order('created_at', { ascending: false })
    for (const hh of (hhs ?? []) as { id: string; status: string | null; address: string | null; unit: string | null }[]) {
      if (hh.status && !['active', 'pending'].includes(hh.status)) continue
      const { data: ll } = await admin.from('household_members').select('user_id').eq('household_id', hh.id).eq('role', 'landlord').eq('status', 'active').limit(1)
      const landlordAuth = (ll?.[0] as { user_id: string } | undefined)?.user_id ?? null
      if (!landlordAuth) continue
      const { data: u } = await admin.auth.admin.getUserById(landlordAuth)
      const email = u?.user?.email ?? null
      if (email && EMAIL_RE.test(email)) return { email, auth_id: landlordAuth, household_id: hh.id, unit: [hh.address, hh.unit ? `#${hh.unit}` : ''].filter(Boolean).join(' ') || null }
    }
  }
  if (callerEmail) {
    const { data: leases } = await admin.from('lease_documents').select('landlord_id, unit_label, status').ilike('tenant_email', callerEmail).in('status', ['signed_both', 'active', 'imported', 'sent', 'signed_tenant']).order('created_at', { ascending: false }).limit(3)
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
  // Triage (P1 2026-09-23): habitability emergencies are always high and
  // carry a "call now" line; category / entry permission / pets ride along.
  const emergency = isEmergencyMaintenance(m)
  const priority = emergency ? 'high' : ['low', 'medium', 'high'].includes(String(m.priority)) ? String(m.priority) : 'medium'
  if (!title) return NextResponse.json({ executed: false, reason: 'ticket title missing' }, { status: 422 })
  const ll = await resolveTenantLandlord(admin, userId, callerEmail)
  if (!ll || !ll.household_id) return NextResponse.json({ executed: false, reason: 'no_household_on_file' }, { status: 422 })
  const category = typeof m.category === 'string' && (MAINTENANCE_CATEGORIES as readonly string[]).includes(m.category) ? m.category : 'repair'
  // The same problem already has an open ticket on this tenancy (the tenant
  // filed it from the hub, or approved an earlier card): add the new detail to
  // it instead of a second ticket, second landlord email and second dispatch.
  const { data: openRows } = await admin
    .from('maintenance_tickets')
    .select('id, title, description, category, priority, status, created_at')
    .eq('household_id', ll.household_id)
    .not('status', 'in', '(done,cancelled)')
    .order('created_at', { ascending: false })
    .limit(20)
  const dup = findOpenDuplicate({ title, description, category, location: typeof m.location === 'string' ? m.location : null, emergency }, (openRows ?? []) as OpenTicketLite[])
  if (dup) return appendToOpenTicket(admin, userId, action, { household_id: ll.household_id, landlord_auth_id: ll.auth_id }, dup, { title, description, emergency }, preview)
  const entryPermission = (ENTRY_PERMISSIONS as readonly string[]).includes(String(m.entry_permission)) ? String(m.entry_permission) : null
  const zhLines = triageLines(m, true).map((l) => `  • ${l}`).join('\n')
  const enLines = triageLines(m, false).map((l) => `  • ${l}`).join('\n')
  const subject = `${emergency ? '【紧急】' : ''}报修工单 · ${ll.unit || ''} · ${title} — ${emergency ? 'URGENT ' : ''}Repair request`
  const body = `你好，

租客通过 Stayloop 提交了一张报修工单：

  • 位置 / 问题：${title}
  • 说明：${description || '（无）'}
  • 紧急程度：${priority}${emergency ? '（影响居住安全或基本服务，请今天联系租客）' : ''}
${zhLines ? zhLines + '\n' : ''}
工单已记录在你们的在管租约共享中心，处理进度双方可见。${emergency ? '\n按 RTA s.20 房东须保持单位适合居住；供暖、供水、燃气、门锁这类问题不能等。' : ''}

Hi,

Your tenant filed a repair ticket on Stayloop:

  • Issue: ${title}
  • Details: ${description || '(none)'}
  • Priority: ${priority}${emergency ? ' (habitability — please contact your tenant today)' : ''}
${enLines ? enLines + '\n' : ''}
The ticket is on your shared tenancy hub; both sides see its progress.${emergency ? '\nUnder RTA s.20 the landlord must keep the unit fit for habitation; heat, water, gas and locks cannot wait.' : ''}`
  // Relay (找得到人 2026-09-30): the tenant never sees the landlord's personal address, not even in the preview.
  if (preview) return PREVIEW({ subject, body, to: null })
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  // entry_permission is a ticket column (C4): the dispatch and the RTA entry notice read it from the ticket.
  const ticketRow: Record<string, unknown> = { household_id: ll.household_id, opened_by: userId, title, description: [description, ...triageLines(m, true)].filter(Boolean).join('\n') || null, priority, status: 'new', category, entry_permission: entryPermission, emergency }
  let { data: ticket, error: tErr } = await admin.from('maintenance_tickets').insert(ticketRow).select('id').single()
  // Deployed ahead of the 20261001_A3 columns: retry without them (as the repair modal does) — the
  // ticket itself must not be lost to a missing column.
  if (tErr && /entry_permission|emergency|PGRST204|42703/i.test(`${tErr.message} ${tErr.code ?? ''}`)) {
    const { entry_permission: _ep, emergency: _em, ...legacy } = ticketRow
    void _ep; void _em
    ;({ data: ticket, error: tErr } = await admin.from('maintenance_tickets').insert(legacy).select('id').single())
  }
  if (tErr || !ticket) {
    await releaseClaim(admin, action.id, tErr?.message || 'ticket insert failed')
    return NextResponse.json({ executed: false, reason: tErr?.message || 'ticket insert failed' }, { status: 500 })
  }
  const { html, text } = renderAgentMessageEmail({ subject, body })
  const hhThread = await ensureThread(admin, 'tenancy', ll.household_id, { householdId: ll.household_id, createdBy: userId })
  const llToken = hhThread ? await replyTokenFor(admin, hhThread.id, ll.email, { kind: 'landlord', userId: ll.auth_id, label: null }) : null
  const result = await sendEmail({ to: ll.email, subject, html, text, replyTo: llToken ? replyAddress(llToken) : undefined, fromName: '租客 经 Stayloop' })
  if (ll.auth_id) void notifyUser(admin, ll.auth_id, { kind: 'event', title: '新的报修工单 / New repair ticket', body: title, url: `/h/${ll.household_id}` })
  // Services marketplace step ③: suggest the dispatch to the landlord as a card
  // (candidates = verified providers covering the trade and city; own contact
  // always possible). Never auto-dispatches.
  if (ll.auth_id) void suggestDispatch(admin, ll.auth_id, ticket.id)
  // The ticket exists either way; only an email that went out may be called "sent to the landlord".
  const executionResult = { ok: true, kind: 'ticket', ticket_id: ticket.id, household_id: ll.household_id, email_id: result.ok ? result.id : null, sent_to: result.ok ? '房东' : null, email_error: result.ok ? null : (result.error || 'send failed') }
  return finalizeExecution(admin, userId, action, 'executed_maintenance_request', executionResult, { ticket_id: ticket.id, household_id: ll.household_id, sent_to: result.ok ? '房东' : null, emailed: result.ok })
}

const OPEN_WORK_ORDER = ['offered', 'quoted', 'scheduled', 'in_progress', 'completed', 'rework', 'disputed']

// A repeat report of an open ticket: the new detail becomes the tenant's
// message in the tenancy conversation — only the landlord and the tenant read
// it, which is what the tenant approved ("→ 房东"); a contractor on the work
// order hears it from the landlord, never behind the tenant's back (review
// 2026-10-01). No new ticket. An emergency (it only merges on a near-identical
// title) raises the ticket to high; with no work order yet the landlord's
// dispatch policy runs again for it, so auto_emergency still fires.
async function appendToOpenTicket(
  admin: Admin,
  userId: string,
  action: ActionRow,
  hh: { household_id: string; landlord_auth_id: string | null },
  ticket: OpenTicketLite,
  d: { title: string; description: string; emergency: boolean },
  preview: boolean,
): Promise<NextResponse> {
  const detail = [d.title, d.description && d.description !== d.title ? d.description : ''].filter(Boolean).join('\n').slice(0, 3000)
  const body = `补充（报修「${ticket.title || '未命名'}」）：\n${detail}\n\nUpdate on the open repair ticket "${ticket.title || 'untitled'}":\n${detail}`
  const subject = `补充到已开的报修 · ${ticket.title || ''} / Added to your open repair ticket`
  if (preview) return PREVIEW({ subject, body, to: null })
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const th = await ensureThread(admin, 'tenancy', hh.household_id, { householdId: hh.household_id, createdBy: userId })
  if (!th) { await releaseClaim(admin, action.id, 'thread unavailable'); return NextResponse.json({ executed: false, reason: 'thread unavailable' }, { status: 500 }) }
  const label = await displayNameFor(admin, userId)
  const msgId = await postSystemMessage(admin, th.id, { kind: 'message', channel: 'app', senderId: userId, senderKind: 'tenant', actingRole: 'tenant', senderLabel: label, body: body.slice(0, 4000), meta: { via: 'agent_maintenance_request', action_id: action.id, ticket_id: ticket.id } })
  if (!msgId) { await releaseClaim(admin, action.id, 'message insert failed'); return NextResponse.json({ executed: false, reason: 'message insert failed' }, { status: 500 }) }
  let redispatched = false
  if (d.emergency && ticket.priority !== 'high') {
    await admin.from('maintenance_tickets').update({ priority: 'high' }).eq('id', ticket.id)
    // The dispatch and the entry notice read emergency from the ticket (RTA s.26), not from priority.
    await admin.from('maintenance_tickets').update({ emergency: true }).eq('id', ticket.id).then(() => undefined, () => undefined)
    const { data: wo } = await admin.from('work_orders').select('id').eq('ticket_id', ticket.id).in('status', OPEN_WORK_ORDER).limit(1)
    if (!((wo ?? []) as { id: string }[]).length && ticket.status === 'new' && hh.landlord_auth_id) {
      // The pending suggestion was written for a non-emergency (24 h RTA s.27 wording):
      // retire it and suggest again at high priority — or auto-dispatch under the policy.
      await admin.from('agent_pending_actions').update({ status: 'expired', execution_result: { ok: false, reason: 'superseded' } }).eq('status', 'pending').eq('action_type', 'dispatch_work_order').contains('metadata', { ticket_id: ticket.id })
      await suggestDispatch(admin, hh.landlord_auth_id, ticket.id)
      redispatched = true
    }
  }
  await notifyThreadParties(admin, th, { messageId: msgId, exceptUserId: userId, preview: body.slice(0, 120), body, senderLabel: label ? `${label}（租客） / ${label} (Tenant)` : '租客 / Tenant' })
  const executionResult = { ok: true, kind: 'existing_ticket', ticket_id: ticket.id, household_id: hh.household_id, thread_id: th.id, message_id: msgId, sent_to: '房东', raised_to_high: d.emergency && ticket.priority !== 'high', redispatched }
  return finalizeExecution(admin, userId, action, 'executed_maintenance_request', executionResult, { ticket_id: ticket.id, household_id: hh.household_id, thread_id: th.id, existing_ticket: true, sent_to: '房东' })
}

// ---------------------------------------------------------------------------
// Services marketplace executors (design/services-marketplace-plan-2026-09 §3)
// ---------------------------------------------------------------------------
async function executeDispatchWorkOrder(admin: Admin, userId: string, action: ActionRow, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const ticketId = typeof m.ticket_id === 'string' ? m.ticket_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return NextResponse.json({ executed: false, reason: 'ticket_id missing' }, { status: 422 })
  const providerId = typeof m.provider_id === 'string' && m.provider_id ? m.provider_id : null
  const external = typeof m.external_email === 'string' && m.external_email ? m.external_email : null
  // Nobody to send it to: the card can never run (the landlord dispatches from the ticket).
  if (!providerId && !external) return expireCard(admin, action.id, { reason: 'no_candidate', ticket_id: ticketId })
  const { data: tk } = await admin.from('maintenance_tickets').select('id, status').eq('id', ticketId).maybeSingle()
  const tkStatus = (tk as { status: string | null } | null)?.status ?? null
  if (tkStatus === 'done' || tkStatus === 'cancelled') return expireCard(admin, action.id, { reason: 'ticket_closed', ticket_id: ticketId, ticket_status: tkStatus })
  if (preview) return PREVIEW({ subject: action.title, body: action.summary || '', to: external ?? (action.recipient_label || null) })
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  // No entry permission on the card → createWorkOrder reads the tenant's choice from the ticket (C4).
  const r = await createWorkOrder(admin, { ticketId, landlordAuthId: userId, providerId, externalEmail: external, externalName: typeof m.external_name === 'string' ? m.external_name : null, entryPermission: (['anytime', 'call_first', 'tenant_present'] as const).find((x) => x === m.entry_permission) ?? null, actor: 'landlord' })
  if (!r.ok) {
    await releaseClaim(admin, action.id, r.error)
    // 409 = the ticket closed or another work order is already on it: this card is spent.
    if (r.status === 409) return expireCard(admin, action.id, { reason: r.error, ticket_id: ticketId })
    return NextResponse.json({ executed: false, reason: r.error }, { status: r.status })
  }
  return finalizeExecution(admin, userId, action, 'executed_dispatch_work_order', { ok: true, kind: 'work_order', work_order_id: r.wo.id, status: r.wo.status }, { work_order_id: r.wo.id, ticket_id: ticketId, provider_id: r.wo.provider_id })
}

// actOnWorkOrder answers 409 both for a card that is spent (canAct refused:
// not_from_<status>, the work order moved on; quote_changed / quote_expired)
// and for a transient miss (a DB error, or the optimistic lock losing a race:
// 'state changed, retry'). Expiring on the latter would drop a card whose
// quote is still waiting (review 2026-10-01): anything not clearly spent is
// decided by re-reading the row — spent only if it left the status the card
// is about. Returns the reason to expire with, or null to keep the card.
async function spentWorkOrderReason(admin: Admin, woId: string, r: { error: string; status: number }, expected: string, movedOn: string): Promise<string | null> {
  if (r.error === 'quote_changed' || r.error === 'quote_expired') return r.error
  if (r.error.startsWith('not_from_')) return movedOn
  if (r.status !== 409) return null
  const { data } = await admin.from('work_orders').select('status').eq('id', woId).maybeSingle()
  const status = (data as { status?: string | null } | null)?.status ?? null
  return status && status !== expected ? movedOn : null
}

async function executeWorkOrderDecision(admin: Admin, userId: string, action: ActionRow, kind: 'approve_quote' | 'accept_completion', preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const woId = typeof m.work_order_id === 'string' ? m.work_order_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(woId)) return NextResponse.json({ executed: false, reason: 'work_order_id missing' }, { status: 422 })
  if (preview) return PREVIEW({ subject: action.title, body: action.summary || '', to: action.recipient_label || null })
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  // Approve the quote the card showed: amount, version and quote time (a re-quote → quote_changed).
  const mr = m as Record<string, unknown>
  const seen: Record<string, unknown> = {}
  if (m.expected_amount != null) seen.expected_amount = m.expected_amount
  if (mr.quote_version != null) seen.expected_version = mr.quote_version
  if (typeof mr.quoted_at === 'string' && mr.quoted_at) seen.expected_quoted_at = mr.quoted_at
  const r = await actOnWorkOrder(admin, { woId, action: kind, by: 'landlord', actorId: userId, payload: kind === 'approve_quote' ? seen : {} })
  if (!r.ok) {
    await releaseClaim(admin, action.id, r.error)
    const spent = await spentWorkOrderReason(admin, woId, r, kind === 'approve_quote' ? 'quoted' : 'completed', 'work_order_moved_on')
    if (spent) return expireCard(admin, action.id, { reason: spent, work_order_id: woId, error: r.error })
    return NextResponse.json({ executed: false, reason: r.error }, { status: r.status })
  }
  // Whether the tenant's entry notice actually went out (no tenant email, or every send failed → no):
  // the receipt and the activity label must not say it was sent when it was not (review 2026-10-01).
  let entryNotice: { entry_notice_sent?: boolean } = {}
  if (kind === 'approve_quote') {
    const { data: after } = await admin.from('work_orders').select('entry_notice_sent_at').eq('id', woId).maybeSingle()
    entryNotice = { entry_notice_sent: !!(after as { entry_notice_sent_at?: string | null } | null)?.entry_notice_sent_at }
  }
  return finalizeExecution(admin, userId, action, `executed_${kind}`, { ok: true, kind, work_order_id: woId, status: r.wo.status, ...entryNotice }, { work_order_id: woId, status: r.wo.status, ...entryNotice })
}

// ---------------------------------------------------------------------------
// Executor: work_order_overdue (节点 3 2026-09-26)
// metadata: { work_order_id, ticket_id }. The daily sweep found an offer past
// its quote deadline with no answer. Approval = withdraw the offer (cancel as
// the row's landlord, reason on the timeline) and put the ticket back through
// suggestDispatch without the contractor who went silent — a fresh card, or an
// auto-dispatch under the landlord's policy. If the contractor answered in the
// meantime, nothing is cancelled and the card says so.
// ---------------------------------------------------------------------------
async function executeWorkOrderOverdue(admin: Admin, userId: string, action: ActionRow, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const woId = typeof m.work_order_id === 'string' ? m.work_order_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(woId)) return NextResponse.json({ executed: false, reason: 'work_order_id missing' }, { status: 422 })
  const { data: wo } = await admin.from('work_orders').select('id, status, ticket_id, provider_id, landlord_auth_id').eq('id', woId).maybeSingle()
  if (!wo) return NextResponse.json({ executed: false, reason: 'work_order_not_found' }, { status: 404 })
  if ((wo as { status: string }).status !== 'offered') {
    // The contractor answered (or the offer was withdrawn) after the card was written: nothing to withdraw.
    return expireCard(admin, action.id, { reason: 'work_order_already_answered', status: (wo as { status: string }).status })
  }
  if (preview) return PREVIEW({ subject: action.title, body: action.summary || '', to: action.recipient_label || null })
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const r = await actOnWorkOrder(admin, { woId, action: 'cancel', by: 'landlord', actorId: userId, payload: { reason: '逾期未报价，房东改派 / Quote overdue — reassigned by the landlord' } })
  if (!r.ok) {
    await releaseClaim(admin, action.id, r.error)
    const spent = await spentWorkOrderReason(admin, woId, r, 'offered', 'work_order_already_answered')
    if (spent) return expireCard(admin, action.id, { reason: spent, work_order_id: woId, error: r.error })
    return NextResponse.json({ executed: false, reason: r.error }, { status: r.status })
  }
  const row = wo as { ticket_id: string; provider_id: string | null }
  await suggestDispatch(admin, userId, row.ticket_id, { excludeProviderIds: row.provider_id ? [row.provider_id] : [], because: 'overdue' })
  return finalizeExecution(admin, userId, action, 'executed_work_order_overdue', { ok: true, kind: 'reassign', work_order_id: woId, cancelled: true }, { work_order_id: woId, ticket_id: row.ticket_id })
}

async function executeSendMessage(
  admin: Admin,
  userId: string,
  action: ActionRow,
  callerEmail: string | null,
  preview = false,
): Promise<NextResponse> {
  const m = action.metadata || {}
  // Cards written about a specific row are re-checked against it, and the
  // recipient then comes from that row, never from the card (sweep 2026-10-01).
  const stage = typeof m.stage === 'string' ? m.stage : null
  let rowTo: string | null = null
  if (stage === 'payment_plan') {
    // Repayment plan: the frozen body demands the arrears listed when it was drafted.
    const lease = (await loadOwnedLease(admin, userId, m.lease_id)) ?? (await loadHouseholdLease(admin, userId, m.household_id, m.lease_id))
    if (!lease) return NextResponse.json({ executed: false, reason: 'lease not found or not yours' }, { status: 403 })
    const leaseTo = (lease.tenant_email || '').trim()
    if (!EMAIL_RE.test(leaseTo)) return NextResponse.json({ executed: false, reason: 'lease has no tenant email on file' }, { status: 422 })
    const changed = await paymentPlanChange(admin, lease.id, m, action.created_at ?? null)
    if (changed) return expireCard(admin, action.id, { reason: 'arrears_changed', lease_id: lease.id, ...changed })
    rowTo = leaseTo
  } else if (stage === 'invite_reminder' || typeof m.invite_id === 'string') {
    // Invite reminder: only while the invitation is still open.
    const inviteId = String(m.invite_id ?? '')
    if (!UUID_RE.test(inviteId)) return NextResponse.json({ executed: false, reason: 'invite_id missing' }, { status: 422 })
    const { data: invRow } = await admin.from('household_invites').select('id, invited_email, invited_by, accepted_at, declined_at, revoked_at, expires_at').eq('id', inviteId).maybeSingle()
    const inv = invRow as { invited_email: string | null; invited_by: string; accepted_at: string | null; declined_at: string | null; revoked_at: string | null; expires_at: string | null } | null
    if (!inv || inv.invited_by !== userId) return NextResponse.json({ executed: false, reason: 'invite not found or not yours' }, { status: 403 })
    const state = inv.accepted_at ? 'accepted' : inv.declined_at ? 'declined' : inv.revoked_at ? 'revoked' : inv.expires_at && Date.parse(inv.expires_at) <= Date.now() ? 'expired' : null
    if (state) return expireCard(admin, action.id, { reason: 'invite_closed', invite_state: state })
    rowTo = (inv.invited_email || '').trim() || null
  } else if (stage === '30d' && typeof m.lease_id === 'string') {
    // 30-day renewal intent ask: moot once the lease ended, was renewed another way, or the tenant said they are leaving.
    const lease = await loadOwnedLease(admin, userId, m.lease_id)
    if (!lease) return NextResponse.json({ executed: false, reason: 'lease not found or not yours' }, { status: 403 })
    const st = await renewalState(admin, lease, torontoToday())
    if (st.blocked) return expireCard(admin, action.id, { reason: st.blocked, lease_id: lease.id })
    // The tenant answered on the hub after the card was proposed: asking again would contradict
    // what the rail and the lease list already show (review 2026-10-01).
    if (st.intent) return expireCard(admin, action.id, { reason: 'tenant_answered', lease_id: lease.id, intent: st.intent.intent })
    const leaseTo = (lease.tenant_email || '').trim()
    if (EMAIL_RE.test(leaseTo)) rowTo = leaseTo
  }
  const candidate = (typeof m.to_email === 'string' ? m.to_email : '').trim()
  const fallback = (action.recipient_label || '').trim()
  let to = rowTo && EMAIL_RE.test(rowTo) ? rowTo : EMAIL_RE.test(candidate) ? candidate : (EMAIL_RE.test(fallback) ? fallback : null)
  let derived = false
  let tenancyId: string | null = null
  if (!to && action.role === 'tenant') {
    // Turn-proposed cards carry no address; the landlord comes from the
    // tenant's own tenancy rows (see resolveTenantLandlord).
    const ll = await resolveTenantLandlord(admin, userId, callerEmail)
    if (ll) { to = ll.email; derived = true; tenancyId = ll.household_id }
  }
  if (!to) {
    return NextResponse.json({ executed: false, reason: action.role === 'tenant' ? 'no_landlord_on_file' : 'no valid recipient email' }, { status: 422 })
  }
  if (!derived && to !== rowTo && !(await isKnownCounterparty(admin, userId, to))) {
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
  // A tenant writing to their own landlord: the message goes into the tenancy
  // conversation (recorded, relayed by email with a reply address); the tenant
  // never sees the landlord's personal address (找得到人 2026-09-30).
  if (derived && tenancyId) {
    if (preview) return PREVIEW({ subject: '', body: bodyText, to: null })
    if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
    const th = await ensureThread(admin, 'tenancy', tenancyId, { householdId: tenancyId, createdBy: userId })
    if (!th) { await releaseClaim(admin, action.id, 'thread unavailable'); return NextResponse.json({ executed: false, reason: 'thread unavailable' }, { status: 500 }) }
    const label = await displayNameFor(admin, userId)
    const msgId = await postSystemMessage(admin, th.id, { kind: 'message', channel: 'app', senderId: userId, senderKind: 'tenant', actingRole: 'tenant', senderLabel: label, body: bodyText.slice(0, 4000), meta: { via: 'agent_send_message', action_id: action.id } })
    if (!msgId) { await releaseClaim(admin, action.id, 'message insert failed'); return NextResponse.json({ executed: false, reason: 'message insert failed' }, { status: 500 }) }
    await notifyThreadParties(admin, th, { messageId: msgId, exceptUserId: userId, preview: bodyText.slice(0, 120), body: bodyText, senderLabel: label ? `${label}（租客） / ${label} (Tenant)` : '租客 / Tenant' })
    const shown = '房东（在管租约对话）'
    return finalizeExecution(admin, userId, action, 'executed_send_message', { ok: true, kind: 'thread', thread_id: th.id, message_id: msgId, sent_to: shown }, { sent_to: shown, subject, thread_id: th.id, message_id: msgId })
  }
  if (preview) return PREVIEW({ subject, body: bodyText, to: derived ? null : to })

  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)

  const { html, text } = renderAgentMessageEmail({ subject, body: bodyText })
  const result = await sendEmail({ to, subject, html, text })

  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }

  const shownTo = derived ? '房东' : to
  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: shownTo }
  return finalizeExecution(admin, userId, action, 'executed_send_message', executionResult, {
    sent_to: shownTo,
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
  // "Rent is due soon" is only true before the due date, for a period not yet
  // recorded, on a lease still running then (sweep 2026-10-01).
  const dueDate = String(m.due_date)
  if (dueDate < torontoToday()) return expireCard(admin, action.id, { reason: 'past_due_date', due_date: dueDate })
  if (lease.status === 'ended' || (lease.end_date && lease.end_date < dueDate)) return expireCard(admin, action.id, { reason: 'lease_ended', due_date: dueDate })
  const { data: periodRows } = await admin.from('rent_payments').select('status, paid_at').eq('lease_id', lease.id).eq('due_date', dueDate)
  if (((periodRows ?? []) as { status: string | null; paid_at: string | null }[]).some(isRecordedPaid)) {
    return expireCard(admin, action.id, { reason: 'period_paid', due_date: dueDate })
  }

  const { subject, html, text } = renderRentReminderEmail({
    tenantName: m.tenant_name,
    unitLabel: m.unit_label,
    monthlyRent: Number(m.monthly_rent) || 0,
    dueDate: m.due_date,
  })
  if (preview) return PREVIEW({ subject, body: text, to: m.tenant_email })
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const result = await sendEmail({ to: m.tenant_email, subject, html, text })

  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }

  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: m.tenant_email }
  return finalizeExecution(admin, userId, action, 'executed_rent_reminder', executionResult, {
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
async function executeRenewalCheckpoint(admin: Admin, userId: string, action: ActionRow, auditAction = 'executed_renewal_checkpoint'): Promise<NextResponse> {
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const m = action.metadata || {}
  const executionResult = { ok: true, kind: 'acknowledged', stage: m.stage ?? null, lease_id: m.lease_id ?? null }
  return finalizeExecution(admin, userId, action, auditAction, executionResult, {
    stage: m.stage ?? null,
    lease_id: m.lease_id ?? null,
  })
}

// ---------------------------------------------------------------------------
// Executor: showing_request / listing_inquiry
// metadata: { intent_id, listing_id, messages[] }. The tenant's requests are
// loaded from showing_intents (server-written by /api/showing-intent), the
// recipient is the tenant's login email, and the listing must belong to the
// caller and still be on the market. Approval = the landlord accepts: every
// request merged into the card is answered in one email (a viewing if any of
// them is a viewing; the questions are quoted), and all of them flip to
// `accepted` (sweep 2026-10-01: only the first used to, the rest waited forever).
// ---------------------------------------------------------------------------
type IntentRow = { id: string; tenant_id: string; listing_id: string; kind: string | null; move_in_date: string | null; message: string | null; status: string | null; created_at: string | null }

async function executeShowingRequest(admin: Admin, userId: string, action: ActionRow, callerEmail: string | null, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const ids = Array.from(new Set([m.intent_id, ...((Array.isArray(m.messages) ? m.messages : []).map((x) => x?.intent_id))].filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))))
  if (!ids.length) {
    return NextResponse.json({ executed: false, reason: 'intent_id missing' }, { status: 422 })
  }
  const { data: intentRows } = await admin
    .from('showing_intents')
    .select('id, tenant_id, listing_id, kind, move_in_date, message, status, created_at')
    .in('id', ids)
  const all = (intentRows ?? []) as IntentRow[]
  const intent = all.find((r) => r.id === ids[0]) ?? all[0]
  if (!intent) return NextResponse.json({ executed: false, reason: 'intent not found' }, { status: 404 })
  // One prospect, one listing: a merged entry that is not that pair is ignored.
  const intents = all
    .filter((r) => r.listing_id === intent.listing_id && r.tenant_id === intent.tenant_id)
    .sort((a, b) => Date.parse(a.created_at || '') - Date.parse(b.created_at || ''))
  const { data: landlordRows } = await admin.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  const { data: listing } = await admin
    .from('listings')
    .select('id, address, unit, landlord_id, is_active, status')
    .eq('id', intent.listing_id)
    .maybeSingle()
  if (!listing || !landlordIds.includes(listing.landlord_id as string)) {
    return NextResponse.json({ executed: false, reason: 'listing is not yours' }, { status: 403 })
  }
  // Off the market: "the landlord agreed to arrange a viewing" would be false (C7).
  if (listing.is_active === false || listing.status === 'archived') {
    return expireCard(admin, action.id, { reason: 'listing_inactive', listing_id: listing.id })
  }
  const open = intents.filter((r) => (r.status ?? 'pending') === 'pending')
  if (!open.length) return expireCard(admin, action.id, { reason: 'already_notified', intent_ids: intents.map((r) => r.id) })
  const { data: tenant } = await admin.from('tenants').select('email, full_name').eq('id', intent.tenant_id).maybeSingle()
  const to = (tenant?.email || '').trim()
  if (!EMAIL_RE.test(to)) return NextResponse.json({ executed: false, reason: 'tenant has no email' }, { status: 422 })

  const addr = [listing.address, listing.unit ? `#${listing.unit}` : ''].filter(Boolean).join(' ')
  const kindOf = (r: IntentRow) => (r.kind === 'showing' || r.kind === 'question' ? r.kind : action.action_type === 'showing_request' ? 'showing' : 'question')
  const isShowing = action.action_type === 'showing_request' || open.some((r) => kindOf(r) === 'showing')
  const lastShowing = [...open].reverse().find((r) => kindOf(r) === 'showing') ?? null
  const moveIn = lastShowing?.move_in_date ?? null
  const questions = open.filter((r) => kindOf(r) === 'question' && String(r.message || '').trim()).map((r) => String(r.message).trim())
  const questionText = (questions.length === 1 ? questions[0] : questions.map((q) => `· ${q}`).join('\n')).slice(0, 2000)
  // 消息系统 A 期: no personal address changes hands — both sides continue in the
  // listing-inquiry conversation (reply to this email and it lands there too).
  void callerEmail
  const tenantAuth = typeof m.tenant_auth_id === 'string' ? m.tenant_auth_id : null
  const th = tenantAuth ? await ensureListingThread(admin, { id: listing.id as string, address: listing.address as string | null, unit: listing.unit as string | null }, tenantAuth) : null
  const link = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai').replace(/\/$/, '')}${th ? messageCenterHref(th.id) : '/messages'}`
  const contact = `请在 Stayloop 的对话里约定时间（直接回复本邮件也会进对话）：${link}`
  const contactEn = `Arrange it in your Stayloop conversation (replying to this email also lands there): ${link}`
  const body = isShowing
    ? `${tenant?.full_name || ''} 你好，

你对 ${addr} 的看房请求房东已经收到并同意安排。` +
      (moveIn ? `你填写的期望入住日期：${moveIn}。` : '') +
      (questions.length ? `\n你的提问房东也已收到，会在对话里回答：\n${questionText}\n` : '') +
      `
请直接与房东约定时间。${contact}

` +
      `Hi ${tenant?.full_name || ''},

The landlord has received your showing request for ${addr} and agreed to arrange a viewing.` +
      (moveIn ? ` Your preferred move-in date: ${moveIn}.` : '') +
      (questions.length ? ` Your question${questions.length > 1 ? 's were' : ' was'} received too and will be answered in the conversation.` : '') +
      `
Please arrange the time directly with the landlord. ${contactEn}`
    : `${tenant?.full_name || ''} 你好，

你关于 ${addr} 的提问房东已经收到。${contact}

你的问题：
${questionText}

` +
      `Hi ${tenant?.full_name || ''},

The landlord has received your question${questions.length > 1 ? 's' : ''} about ${addr}. ${contactEn}`
  const subject = isShowing
    ? `看房请求已确认 · ${addr} / Showing request accepted`
    : `房东已收到你的提问 · ${addr} / Your question was received`
  if (preview) return PREVIEW({ subject, body, to })
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const { html, text } = renderAgentMessageEmail({ subject, body })
  const token = th ? await replyTokenFor(admin, th.id, to, { kind: 'tenant', userId: tenantAuth, label: tenant?.full_name || null }) : null
  const result = await sendEmail({ to, subject, html, text, replyTo: token ? replyAddress(token) : undefined, fromName: '房东 经 Stayloop' })
  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }
  const acceptedIds = open.map((r) => r.id)
  await admin.from('showing_intents').update({ status: 'accepted' }).in('id', acceptedIds)
  if (th) await postSystemMessage(admin, th.id, { body: isShowing ? '房东同意安排看房，请在这里约定时间 / The landlord agreed to arrange a viewing — pick a time here' : '房东已收到提问，会在这里回复 / The landlord received the question and will answer here', meta: { intent_id: intent.id, intent_ids: acceptedIds, action_id: action.id } })
  // The landlord's receipt names the prospect, never their address (relay).
  // One role word (executedText translates it), never a mixed-language string.
  const shownTo = tenant?.full_name || '咨询的租客'
  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: shownTo, intent_id: intent.id, intent_ids: acceptedIds, thread_id: th?.id ?? null }
  return finalizeExecution(admin, userId, action, isShowing ? 'executed_showing_request' : 'executed_listing_inquiry', executionResult, {
    sent_to: shownTo,
    subject,
    email_id: result.id,
    intent_id: intent.id,
    intent_ids: acceptedIds,
    listing_id: listing.id,
  })
}

// ---------------------------------------------------------------------------
// Executor: send_decision (lifecycle plan §2.1)
// metadata: { application_id, decision: approved|declined|needs_more, reason? }
// The landlord decided on the applicant page; approving this card sends the
// notice. The application row is loaded server-side and must belong to a
// listing the caller owns; the recipient is the application's email.
// The decision is recorded HERE, when the notice goes out (C6): approved /
// declined set the status; needs_more only moves an undecided application to
// 'reviewing' and never touches a recorded decision or its reason. A card
// older than the last notice, or contradicting a recorded decision, is spent.
// ---------------------------------------------------------------------------
const UNDECIDED_APPLICATION = [null, '', 'new', 'pending', 'reviewing']
async function executeSendDecision(admin: Admin, userId: string, action: ActionRow, callerEmail: string | null, preview = false): Promise<NextResponse> {
  const m = action.metadata || {}
  const appId = typeof m.application_id === 'string' ? m.application_id : ''
  if (!/^[0-9a-f-]{36}$/i.test(appId)) return NextResponse.json({ executed: false, reason: 'application_id missing' }, { status: 422 })
  const decision = m.decision === 'approved' || m.decision === 'declined' || m.decision === 'needs_more' ? m.decision : null
  if (!decision) return NextResponse.json({ executed: false, reason: 'decision missing' }, { status: 422 })
  const { data: app } = await admin
    .from('applications')
    .select('id, first_name, last_name, email, status, decision_notified_at, listing:listings(id, address, unit, landlord_id)')
    .eq('id', appId)
    .maybeSingle()
  if (!app) return NextResponse.json({ executed: false, reason: 'application not found' }, { status: 404 })
  const listing = (Array.isArray(app.listing) ? app.listing[0] : app.listing) as { id: string; address: string; unit: string | null; landlord_id: string } | null
  const { data: landlordRows } = await admin.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (landlordRows ?? []).map((r: { id: string }) => r.id)
  if (!listing || !landlordIds.includes(listing.landlord_id)) return NextResponse.json({ executed: false, reason: 'application is not on your listing' }, { status: 403 })
  const to = String(app.email || '').trim()
  if (!EMAIL_RE.test(to)) return NextResponse.json({ executed: false, reason: 'applicant has no email' }, { status: 422 })
  // A notice already went out after this card was drafted (the landlord changed
  // their mind and sent the newer card): this one would contradict it.
  const notifiedAt = (app as { decision_notified_at?: string | null }).decision_notified_at ?? null
  if (notifiedAt && action.created_at && Date.parse(notifiedAt) > Date.parse(action.created_at)) {
    return expireCard(admin, action.id, { reason: 'already_notified', application_id: app.id })
  }
  // Legacy 'rejected' is a decline (lib/matters/states); a withdrawn application gets no notice of any kind.
  const rawStatus = (app.status as string | null) ?? null
  if (rawStatus === 'withdrawn') return expireCard(admin, action.id, { reason: 'application_withdrawn', application_id: app.id, status: rawStatus })
  const current = rawStatus === 'rejected' ? 'declined' : rawStatus
  if (decision !== 'needs_more' && (current === 'approved' || current === 'declined') && current !== decision) {
    return expireCard(admin, action.id, { reason: 'decision_changed', application_id: app.id, status: rawStatus })
  }

  const name = [app.first_name, app.last_name].filter(Boolean).join(' ') || 'there'
  const addr = [listing.address, listing.unit ? `#${listing.unit}` : ''].filter(Boolean).join(' ')
  const reason = typeof m.reason === 'string' ? m.reason.replace(/<[^>]*>/g, '').trim().slice(0, 600) : ''
  // Relay (消息系统 A 期): no personal address — the applicant replies to this email and it lands in the application conversation.
  void callerEmail
  const contact = '有问题直接回复这封邮件，回复会进这份申请的对话记录，房东会看到。 / Questions? Reply to this email — it goes into this application’s conversation and the landlord sees it.'
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
  // (The per-user send cap is bumped once in POST for every mail executor.)
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const { html, text } = renderAgentMessageEmail({ subject, body })
  const appThread = await ensureThread(admin, 'application', app.id, { title: addr, createdBy: userId })
  const appToken = appThread ? await replyTokenFor(admin, appThread.id, to, { kind: 'tenant', userId: null, label: name === 'there' ? null : name }) : null
  const result = await sendEmail({ to, subject, html, text, replyTo: appToken ? replyAddress(appToken) : undefined, fromName: '房东 经 Stayloop' })
  if (!result.ok) {
    await releaseClaim(admin, action.id, result.error)
    return NextResponse.json({ executed: false, reason: result.error || 'send failed' }, { status: 502 })
  }
  if (decision === 'needs_more') {
    // A request for documents is not a decision: no decision_notified_at (that marks it decided everywhere).
    if (UNDECIDED_APPLICATION.includes(current)) await admin.from('applications').update({ status: 'reviewing' }).eq('id', app.id)
  } else {
    await admin.from('applications').update({ status: decision, decision_notified_at: new Date().toISOString(), decision_reason: reason || null }).eq('id', app.id)
  }
  await admin.from('compliance_events').insert({ user_id: userId, role: 'landlord', source: 'decision_notice', rule_id: 'CRA-10-7-notice', severity: 'info', target_type: 'application', target_id: app.id, metadata: { decision } })
  // 节点 4: a copy of the decision notice in the application thread; the email is the notice.
  {
    const th = await ensureThread(admin, 'application', app.id, { title: addr, createdBy: userId })
    if (th) await postSystemMessage(admin, th.id, { kind: 'formal_copy', senderKind: 'landlord', senderId: userId, actingRole: 'landlord', senderLabel: '房东 · 决定通知 / Landlord · decision notice', body: `${subject}\n\n${body}`, meta: { notice: 'decision', decision, sent_to: to, rule: 'CRA-10-7-notice' } })
  }
  const executionResult = { ok: true, kind: 'email', email_id: result.id, sent_to: to, decision }
  return finalizeExecution(admin, userId, action, 'executed_send_decision', executionResult, { application_id: app.id, decision, sent_to: to, email_id: result.id, reason_given: !!reason })
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
    .select('id, landlord_id, form_type, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature, sent_at')
    .eq('id', leaseId)
    .maybeSingle<LeaseForSend>()
  if (!lease || !lease.landlord_id || !landlordIds.includes(lease.landlord_id)) return NextResponse.json({ executed: false, reason: 'lease not found or not yours' }, { status: 403 })
  const pre = leaseSendPreflight(lease)
  // 409 = signed, ended or not a signable record any more: the card is spent.
  if (!pre.ok) return pre.status === 409 ? expireCard(admin, action.id, { reason: pre.error, lease_id: lease.id }) : NextResponse.json({ executed: false, reason: pre.error }, { status: pre.status })
  // Sent from the lease page after this card was proposed: a second invitation is noise.
  if (lease.sent_at && action.created_at && Date.parse(lease.sent_at) > Date.parse(action.created_at)) {
    return expireCard(admin, action.id, { reason: 'already_notified', lease_id: lease.id })
  }
  if (preview) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
    const mail = buildLeaseInvite(lease, `${siteUrl}/lease/sign/<签署链接 · 批准后生成>`)
    return PREVIEW({ subject: mail.subject, body: mail.text, to: lease.tenant_email })
  }
  if (!(await claimExecution(admin, action.id))) return afterLostClaim(admin, action.id)
  const sent = await sendLeaseInvitation(admin, lease, userId)
  if (!sent.ok) {
    await releaseClaim(admin, action.id, sent.error)
    return NextResponse.json({ executed: false, reason: sent.error }, { status: sent.status })
  }
  const executionResult = { ok: true, kind: 'email', email_id: sent.email_id, sent_to: sent.sent_to, lease_id: lease.id }
  return finalizeExecution(admin, userId, action, 'executed_send_lease', executionResult, { lease_id: lease.id, sent_to: sent.sent_to, email_id: sent.email_id })
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

  // '*': decided_at / expires_at / execution_result / created_at drive the staleness checks below.
  const { data: action } = await admin
    .from('agent_pending_actions')
    .select('*')
    .eq('id', body.action_id)
    .maybeSingle<ActionRow>()
  if (!action) return NextResponse.json({ error: 'action not found' }, { status: 404 })
  if (action.user_id !== userId) return NextResponse.json({ error: 'not your action' }, { status: 403 })
  const preview = body.preview === true
  const res = await runAction(admin, userId, ud.user.email ?? null, action, body.option, preview)
  if (!preview) {
    // A refusal that leaves the card valid keeps it approved and unexecuted; the
    // row says why, so the to-do list can offer an honest retry (finding #1).
    if (res.status >= 400 && action.status === 'approved' && !action.executed_at) {
      const j = (await res.clone().json().catch(() => ({}))) as { reason?: string; expired?: boolean }
      // in_flight: another request holds the claim — its own result is what the row should say.
      if (!j.expired && j.reason && j.reason !== 'in_flight') {
        await admin.from('agent_pending_actions')
          .update({ execution_result: { ok: false, reason: j.reason, at: new Date().toISOString() } })
          .eq('id', action.id).eq('status', 'approved').is('executed_at', null)
      }
    }
    return res
  }
  const j = (await res.clone().json().catch(() => ({}))) as { reason?: string; error?: string; expired?: boolean; executed?: boolean; already?: boolean } & Record<string, unknown>
  // A card another request just ran has nothing left to preview.
  if (res.status === 200 && j.already) return NextResponse.json({ preview: null, reason: 'already_executed' }, { status: 409 })
  if (res.status === 200) return res
  // C2: a preview that cannot be built says why, in the preview shape, with the
  // executor's status and its extra fields (n1_deadline, blocks_option: a
  // B-only refusal must not read as the whole card being blocked).
  const extra: Record<string, unknown> = { ...j }
  delete extra.executed
  delete extra.already
  delete extra.error
  return NextResponse.json({ ...extra, preview: null, reason: j.reason || j.error || 'preview_unavailable', ...(j.expired ? { expired: true } : {}) }, { status: res.status })
}

async function runAction(admin: Admin, userId: string, callerEmail: string | null, action: ActionRow, option: 'A' | 'B' | undefined, preview: boolean): Promise<NextResponse> {
  if (action.status === 'expired') {
    const why = action.execution_result && typeof action.execution_result.reason === 'string' ? action.execution_result.reason : 'expired'
    return NextResponse.json({ executed: false, reason: why, expired: true }, { status: 409 })
  }
  // Preview is allowed while the card is still pending (that is the point);
  // execution needs the approval.
  if (preview ? !['pending', 'approved'].includes(action.status) : action.status !== 'approved') {
    return NextResponse.json({ executed: false, reason: `action is ${action.status}, not approved` }, { status: 409 })
  }
  if (!preview && action.executed_at) {
    // Claimed by another request: done only when it stamped success (see afterLostClaim).
    return afterLostClaim(admin, action.id)
  }
  // A pending card past its expiry can no longer be approved (decide_pending_action
  // refuses too); an approval that never ran for a week is not run now.
  if (action.status === 'pending' && action.expires_at && Date.parse(action.expires_at) < Date.now()) {
    return expireCard(admin, action.id, { reason: 'expired' })
  }
  // (decided_at undefined = the column is not there yet: no clock to go by.)
  if (!preview && action.status === 'approved' && action.decided_at !== undefined) {
    const decided = Date.parse(action.decided_at || action.created_at || '')
    if (Number.isFinite(decided) && Date.now() - decided > STALE_APPROVAL_DAYS * 86_400_000) {
      return expireCard(admin, action.id, { reason: 'stale_approval' })
    }
  }

  // Every executor below sends mail from the Stayloop domain to an address
  // that ultimately traces back to rows the caller can write (their own
  // lease's tenant_email, an application on their own listing). The
  // counterparty checks narrow WHO; this caps HOW MANY (review 2026-09-19).
  if (!preview && ['send_renewal_letter', 'dispatch_work_order', 'approve_quote', 'accept_completion', 'send_message', 'rent_reminder', 'showing_request', 'listing_inquiry', 'send_lease', 'send_decision', 'maintenance_request'].includes(action.action_type)) {
    if (!(await underHourlyLimit(`mail:agent-execute:${userId}`, 20, false))) {
      return NextResponse.json({ executed: false, reason: 'hourly send limit reached' }, { status: 429, headers: { 'Retry-After': '3600' } })
    }
  }

  // Per-type dispatch. Only action types with a real executor get claimed;
  // a card of any other type can never do anything, so approving it expires it
  // (reason no_executor_for_type) instead of leaving it "approved" forever.
  switch (action.action_type) {
    case 'send_renewal_letter':
      return executeSendRenewalLetter(admin, userId, action, option, preview)
    case 'send_message':
      return executeSendMessage(admin, userId, action, callerEmail, preview)
    case 'maintenance_request':
      return executeMaintenanceRequest(admin, userId, action, callerEmail, preview)
    case 'rent_reminder':
      return executeRentReminder(admin, userId, action, preview)
    case 'renewal_checkpoint':
      if (preview) return PREVIEW({ subject: action.title, body: action.summary || '', to: null })
      return executeRenewalCheckpoint(admin, userId, action)
    case 'relist_prompt':
      // Approval = acknowledged (P1 2026-09-23); nothing is sent.
      if (preview) return PREVIEW({ subject: action.title, body: action.summary || '', to: null })
      return executeRenewalCheckpoint(admin, userId, action, 'executed_relist_prompt')
    case 'dispatch_work_order':
      return executeDispatchWorkOrder(admin, userId, action, preview)
    case 'approve_quote':
      return executeWorkOrderDecision(admin, userId, action, 'approve_quote', preview)
    case 'accept_completion':
      return executeWorkOrderDecision(admin, userId, action, 'accept_completion', preview)
    case 'work_order_overdue':
      return executeWorkOrderOverdue(admin, userId, action, preview)
    case 'showing_request':
    case 'listing_inquiry':
      return executeShowingRequest(admin, userId, action, callerEmail, preview)
    case 'send_decision':
      return executeSendDecision(admin, userId, action, callerEmail, preview)
    case 'send_lease':
      return executeSendLease(admin, userId, action, preview)
    default:
      if (preview) return NextResponse.json({ preview: null, reason: 'no_executor_for_type' })
      return expireCard(admin, action.id, { reason: 'no_executor_for_type' })
  }
}

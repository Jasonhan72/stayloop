// /api/agent/proactive — the agent's "works while you sleep" sweep.
//
// Scans REAL leases (lease_documents) for renewal windows — Ontario N2
// requires 90 days' notice, so anything ending within 120 days needs a
// decision soon — and idempotently creates a `send_renewal_letter` pending
// action for each. The proposal carries computed options (keep / the
// guideline for the year the increase takes effect) in metadata; the landlord
// approves on the agent page and /api/agent/execute then actually sends the
// letter.
//
// "In force" is the shared definition (lib/matters/states isLeaseInForce):
// signed_both / active / imported (a signed lease keyed in from paper),
// started, not ended. Sweep 2026-10-01: imported leases used to be shown as
// "options prepared" on /landlord/leases while both scans skipped them.
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
import { isoDate, todayUtc } from '@/lib/dates'
import { isLeaseInForce } from '@/lib/matters/states'
import { IN_FORCE_STATUSES, SCAN_WINDOW_DAYS, STALE_EXPIRED_BY, SUCCESSOR_STATUSES, marketFromRows, planRenewalActions, replacedInForceBy, staleRenewalCards, type ExistingRenewalAction, type LeaseSlot, type MarketLine, type RenewalIntent, type StaleRenewalReason } from '@/lib/agent/renewalStages'
import { buildInviteReminderProposal, buildRelistProposal, inviteNeedsReminder, leaseNeedsRelist, RELIST_LOOKBACK_DAYS, type EndedLeaseRow, type InviteRow } from '@/lib/agent/proactiveExtras'
import { notifyUser } from '@/lib/push/notify'
import { runMarketplaceSweep } from '@/lib/marketplace/sweep'
import { leaseProvince, unitTermsOf } from '@/lib/provinces/lease'
import type { ProvinceCode, ProvinceRow } from '@/lib/provinces/detect'

export const runtime = 'edge'

// Renewal touchpoints (90 / 60 / 30 days) are planned by
// lib/agent/renewalStages.ts — see its header. The route only loads leases,
// existing actions and the TRREB market line, then inserts what is missing.
const RENEWAL_TYPES = ['send_renewal_letter', 'renewal_checkpoint', 'send_message']
// P1 2026-09-23: invite reminders ride on send_message (metadata.invite_id);
// re-list prompts are their own approval-only type.
const EXTRA_TYPES = ['relist_prompt']
const CRON_SCAN_LIMIT = 200
// Rent reminders are proposed only in the last N days of a month, for the 1st
// of the next month.
const REMINDER_TAIL_DAYS = 5

const iso = isoDate

type LeaseRow = {
  id: string
  household_id?: string | null
  landlord_id?: string | null
  listing_id?: string | null
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  monthly_rent: number | string | null
  start_date?: string | null
  end_date: string
  status: string | null
  unit_place?: unknown
  province?: ProvinceCode
}

/**
 * Stamp each lease with the province whose rules it follows: the linked
 * listing when readable, else the managed tenancy's address, else the lease's
 * own §2 block (lib/provinces/lease). Also attaches household_id (the 30-day
 * e-mail links the tenant to /h/<household>?intent=…).
 */
async function attachPlaces(client: SupabaseClient, leases: LeaseRow[]): Promise<void> {
  if (!leases.length) return
  const listingIds = Array.from(new Set(leases.map((l) => l.listing_id).filter(Boolean))) as string[]
  const [{ data: lst }, { data: hhs }] = await Promise.all([
    listingIds.length ? client.from('listings').select('id, province, address, city, postal_code').in('id', listingIds) : Promise.resolve({ data: [] as unknown[] }),
    client.from('households').select('id, current_lease_id, address, city').in('current_lease_id', leases.map((l) => l.id)),
  ])
  const listingById = new Map(((lst ?? []) as (ProvinceRow & { id: string })[]).map((r) => [r.id, r]))
  const hhByLease = new Map(((hhs ?? []) as { id: string; current_lease_id: string | null; address: string | null; city: string | null }[]).map((h) => [h.current_lease_id as string, h]))
  for (const l of leases) {
    const hh = hhByLease.get(l.id) ?? null
    l.household_id = hh?.id ?? null
    l.province = leaseProvince({ listing: l.listing_id ? listingById.get(l.listing_id) ?? null : null, household: hh, unit: unitTermsOf({ unit: l.unit_place }), unit_label: l.unit_label })
  }
}

// unit_place = terms.unit (street / city / postal of the standard lease) — with
// the linked listing and the managed tenancy it decides the lease's province
// (lib/provinces/lease), which picks the Ontario or the provincial planner.
const LEASE_COLS = 'id, landlord_id, listing_id, tenant_name, tenant_email, unit_label, monthly_rent, start_date, end_date, status, unit_place:terms->unit'
// Existing renewal cards carry their execution stamp: a letter counts as sent
// only when executed_at is set and execution_result.ok is true (contract C8).
const EXISTING_COLS = 'id, action_type, status, metadata, executed_at, execution_result'
// What the client merges into its pending list — the same shape
// approval-engine reads, so the A/B buttons have their rent figures (#59).
const CREATED_COLS = 'id, user_id, workflow_id, role, action_type, title, summary, recipient_label, data_scope, excluded_data, risk_level, status, requires_approval, created_at, expires_at, metadata'

/**
 * Successor leases on the same units (signed, not ended) and the tenants'
 * recorded renewal intents — the planner skips renewed tenancies and does not
 * ask questions the tenant already answered (sweep 2026-10-01). Runs under
 * whichever client the mode uses (service role, or the caller's RLS).
 */
async function loadRenewalContext(sb: SupabaseClient, leases: LeaseRow[], intentLeaseIds: string[], today: Date): Promise<{ laterLeases: LeaseSlot[]; intents: RenewalIntent[] }> {
  if (!leases.length) return { laterLeases: [], intents: [] }
  const landlordIds = Array.from(new Set(leases.map((l) => l.landlord_id).filter(Boolean))) as string[]
  const loadLater = async (): Promise<LeaseSlot[]> => {
    if (!landlordIds.length) return []
    const { data, error } = await sb
      .from('lease_documents')
      .select('id, landlord_id, unit_label, listing_id, tenant_email, start_date, end_date, status')
      .in('landlord_id', landlordIds)
      .in('status', [...SUCCESSOR_STATUSES])
      .or(`end_date.is.null,end_date.gte.${iso(todayUtc(today))}`)
      .limit(1000)
    if (error) console.error('proactive successor scan failed:', error.message)
    return (data ?? []) as LeaseSlot[]
  }
  // The hub writes lease_id = the household's current lease; an answer saved with
  // no lease id belongs to the household the lease is current on. The execute
  // route's renewalBlocker and the rail read both, so the planner must too — a
  // household-level 'leave' used to reach only the executor, which then refused
  // the letter the sweep had just proposed (review 2026-10-01).
  const loadIntents = async (): Promise<RenewalIntent[]> => {
    if (!intentLeaseIds.length) return []
    const wanted = new Set(intentLeaseIds)
    const hhIds = Array.from(new Set(leases.filter((l) => wanted.has(l.id)).map((l) => l.household_id).filter(Boolean))) as string[]
    const [byLease, byHousehold] = await Promise.all([
      sb.from('renewal_intents').select('lease_id, household_id, intent, created_at').in('lease_id', intentLeaseIds).order('created_at', { ascending: false }).limit(500),
      hhIds.length
        ? sb.from('renewal_intents').select('lease_id, household_id, intent, created_at').in('household_id', hhIds).is('lease_id', null).order('created_at', { ascending: false }).limit(500)
        : Promise.resolve({ data: [] as RenewalIntent[], error: null }),
    ])
    if (byLease.error) console.error('proactive intent scan failed:', byLease.error.message)
    if (byHousehold.error) console.error('proactive household intent scan failed:', byHousehold.error.message)
    return [...((byLease.data ?? []) as RenewalIntent[]), ...((byHousehold.data ?? []) as RenewalIntent[])]
  }
  const [laterLeases, intents] = await Promise.all([loadLater(), loadIntents()])
  return { laterLeases, intents }
}

/**
 * Expire touchpoint cards the planner no longer stands behind (renewed /
 * re-let lease, tenant leaving — staleRenewalCards). Only rows that never ran
 * and still await a person; the `by` marker lets the planner propose again if
 * the reason stops being true. Runs under the mode's client (the caller's own
 * rows under RLS, or the service role scoped to `userId`).
 */
async function expireStaleRenewalCards(sb: SupabaseClient, userId: string, stale: { id: string; reason: StaleRenewalReason }[]): Promise<number> {
  let n = 0
  for (const reason of ['lease_superseded', 'tenant_leaving', 'tenant_answered'] as const) {
    const ids = stale.filter((c) => c.reason === reason).map((c) => c.id)
    if (!ids.length) continue
    const { data, error } = await sb
      .from('agent_pending_actions')
      .update({ status: 'expired', execution_result: { ok: false, reason, by: STALE_EXPIRED_BY, at: new Date().toISOString() } })
      .eq('user_id', userId)
      .in('id', ids)
      .in('status', ['pending', 'approved'])
      .is('executed_at', null)
      .select('id')
    if (error) console.error('proactive stale-card expiry failed:', error.message)
    else n += data?.length ?? 0
  }
  return n
}

async function loadMarket(sb: SupabaseClient): Promise<MarketLine | null> {
  // The cache holds every quarter since 2019 × every TRREB area × apartment /
  // townhouse (1,000+ rows). An unordered 64-row read returned the oldest 64
  // rows (all 2019 Q1) and the renewal card quoted seven-year-old rents
  // (found by the 2026-09-23 end-to-end run). Pin the board-wide apartment
  // series, newest first: marketFromRows then picks the latest quarter.
  const { data } = await sb
    .from('trreb_rent_stats')
    .select('period, bed_type, avg_rent')
    .eq('area', 'All TRREB Areas')
    .eq('property_type', 'apartment')
    .order('period', { ascending: false })
    .limit(8)
  return marketFromRows((data ?? []) as { period: string; bed_type: number; avg_rent: number }[])
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
async function runRenewalSweep(): Promise<NextResponse> {
  const admin: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const today = new Date()
  const horizon = new Date(today.getTime() + SCAN_WINDOW_DAYS * 86_400_000)

  // 1) Renewal windows across ALL landlords (the horizon is the widest
  //    provincial window; each lease's own planner decides when a card is due).
  const { data: renewalRows, error: leaseErr } = await admin
    .from('lease_documents')
    .select(LEASE_COLS)
    .in('status', [...IN_FORCE_STATUSES])
    // Not yet started = not in force: no renewal touchpoints for it (节点 1 2026-09-26).
    .or(`start_date.is.null,start_date.lte.${iso(todayUtc(today))}`)
    .gte('end_date', iso(todayUtc(today)))
    .lte('end_date', iso(horizon))
    .order('end_date', { ascending: true })
    .limit(CRON_SCAN_LIMIT)
  if (leaseErr) {
    console.error('proactive lease scan failed:', leaseErr.message)
    return NextResponse.json({ error: 'lease scan failed' }, { status: 500 })
  }
  const renewalLeases = ((renewalRows ?? []) as LeaseRow[]).filter((l) => isLeaseInForce(l, today))

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
      .select(LEASE_COLS)
      .in('status', [...IN_FORCE_STATUSES])
      // Rent is only due once the term has begun (节点 1 2026-09-26).
      .or(`start_date.is.null,start_date.lte.${dueDate}`)
      .gte('end_date', dueDate)
      .not('tenant_email', 'is', null)
      .limit(CRON_SCAN_LIMIT)
    if (error) {
      console.error('proactive reminder scan failed:', error.message)
      return NextResponse.json({ error: 'reminder scan failed' }, { status: 500 })
    }
    reminderLeases = (data ?? []) as LeaseRow[]
  }

  // The 30-day email links the tenant to /h/<household>?intent=… — attach the
  // managed tenancy created from each lease (P1 2026-09-23).
  const renewalIds = renewalLeases.map((l) => l.id)
  await attachPlaces(admin, renewalLeases)
  // Renewed / re-let units and recorded intents, for both the renewal planner
  // and the rent reminders (a lease replaced by the due date is not billed).
  const renewalCtx = await loadRenewalContext(admin, [...renewalLeases, ...reminderLeases], renewalIds, today)

  // 3) Unaccepted tenancy invitations older than a few days (P1 2026-09-23).
  const { data: inviteRows } = await admin
    .from('household_invites')
    .select('id, household_id, invited_email, invited_role, invited_by, created_at, expires_at, accepted_at, declined_at, revoked_at')
    .is('accepted_at', null).is('declined_at', null).is('revoked_at', null)
    .eq('invited_role', 'tenant')
    .gt('expires_at', today.toISOString())
    .limit(CRON_SCAN_LIMIT)
  const invites = ((inviteRows ?? []) as InviteRow[]).filter((i) => inviteNeedsReminder(i, today))
  if (invites.length) {
    const { data: hhs } = await admin.from('households').select('id, address, unit').in('id', Array.from(new Set(invites.map((i) => i.household_id))))
    const byId = new Map(((hhs ?? []) as { id: string; address: string | null; unit: string | null }[]).map((h) => [h.id, h]))
    for (const i of invites) { const h = byId.get(i.household_id); i.address = h?.address ?? null; i.unit = h?.unit ?? null }
  }

  // 4) Leases that ended in the last RELIST_LOOKBACK_DAYS with no newer lease
  //    on the same unit → re-list prompt (approval-only).
  const lookback = new Date(today.getTime() - RELIST_LOOKBACK_DAYS * 86_400_000)
  const { data: endedRows } = await admin
    .from('lease_documents')
    .select('id, landlord_id, listing_id, tenant_name, unit_label, end_date, status, unit_place:terms->unit')
    .in('status', ['active', 'signed_both', 'ended', 'imported'])
    .gte('end_date', iso(todayUtc(lookback)))
    .lt('end_date', iso(todayUtc(today)))
    .limit(CRON_SCAN_LIMIT)
  const endedLeases = (endedRows ?? []) as (EndedLeaseRow & { landlord_id: string | null })[]
  let newerOnUnit = new Set<string>()
  if (endedLeases.length) {
    const llIds = Array.from(new Set(endedLeases.map((l) => l.landlord_id).filter(Boolean))) as string[]
    const { data: newer } = await admin.from('lease_documents').select('id, landlord_id, unit_label, start_date, status').in('landlord_id', llIds).in('status', ['sent', 'signed_tenant', 'signed_both', 'active', 'imported']).gte('start_date', iso(todayUtc(lookback))).limit(CRON_SCAN_LIMIT)
    newerOnUnit = new Set(((newer ?? []) as { id: string; landlord_id: string | null; unit_label: string | null }[]).filter((n) => n.unit_label).map((n) => `${n.landlord_id}:${n.unit_label!.trim().toLowerCase()}`))
  }
  // No unit label → we cannot tell units apart → no re-list card (review 2026-09-23).
  let relistLeases = endedLeases.filter((l) => !!l.unit_label && leaseNeedsRelist(l, today, newerOnUnit.has(`${l.landlord_id}:${l.unit_label!.trim().toLowerCase()}`)))
  // The original listing is already live again → nothing to prompt.
  const relistListingIds = Array.from(new Set(relistLeases.map((l) => l.listing_id).filter(Boolean))) as string[]
  if (relistListingIds.length) {
    const { data: lst } = await admin.from('listings').select('id, is_active').in('id', relistListingIds)
    const live = new Set(((lst ?? []) as { id: string; is_active: boolean | null }[]).filter((x) => x.is_active).map((x) => x.id))
    relistLeases = relistLeases.filter((l) => !l.listing_id || !live.has(l.listing_id))
  }
  // The re-list card's "if the tenant stays" sentence is the lease's province's.
  await attachPlaces(admin, relistLeases as unknown as LeaseRow[])

  const allLeases = [...renewalLeases, ...reminderLeases, ...relistLeases.map((l) => ({ ...l, tenant_email: null, monthly_rent: null, end_date: l.end_date || '' }) as LeaseRow)]
  if (allLeases.length === 0 && invites.length === 0) {
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
      console.error('proactive landlord resolve failed:', error.message)
      return NextResponse.json({ error: 'landlord resolve failed' }, { status: 500 })
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
    new Set([...allLeases.map(resolve), ...invites.map((i) => i.invited_by)].filter(Boolean))
  ) as string[]
  if (affectedUserIds.length === 0) {
    return NextResponse.json({ created: 0, mode: 'cron' })
  }

  // Idempotency, checked across each affected user's existing actions:
  // renewals are one-per-lease ever; reminders are one per lease per due_date.
  const { data: existing, error: existErr } = await admin
    .from('agent_pending_actions')
    .select('id, user_id, action_type, status, metadata, executed_at, execution_result')
    .in('action_type', [...RENEWAL_TYPES, ...EXTRA_TYPES, 'rent_reminder'])
    .in('user_id', affectedUserIds)
  if (existErr) {
    console.error('proactive idempotency scan failed:', existErr.message)
    return NextResponse.json({ error: 'idempotency scan failed' }, { status: 500 })
  }
  const reminderProposed = new Set<string>()
  const inviteReminded = new Set<string>()
  const relistProposed = new Set<string>()
  const renewalExisting: (ExistingRenewalAction & { user_id: string })[] = []
  for (const r of existing ?? []) {
    const m = r.metadata as { lease_id?: string; due_date?: string; stage?: string; invite_id?: string } | null
    if (m?.invite_id) { inviteReminded.add(m.invite_id); continue }
    if (r.action_type === 'relist_prompt') { if (m?.lease_id) relistProposed.add(m.lease_id); continue }
    if (!m?.lease_id) continue
    if (r.action_type === 'rent_reminder') { if (m.due_date) reminderProposed.add(`${m.lease_id}:${m.due_date}`) }
    else renewalExisting.push({ id: r.id as string, user_id: r.user_id as string, action_type: r.action_type as string, status: r.status as string, metadata: m, executed_at: (r.executed_at as string | null) ?? null, execution_result: (r.execution_result as ExistingRenewalAction['execution_result']) ?? null })
  }

  const market = await loadMarket(admin)
  const inserts: Record<string, unknown>[] = []
  // Plan per landlord so the (lease, stage) idempotency is scoped to the
  // user who will see the card.
  const byUser = new Map<string, LeaseRow[]>()
  for (const l of renewalLeases) {
    const userId = resolve(l)
    if (!userId) continue
    byUser.set(userId, [...(byUser.get(userId) ?? []), l])
  }
  let expired = 0
  for (const [userId, leases] of byUser) {
    const ex = renewalExisting.filter((a) => a.user_id === userId)
    expired += await expireStaleRenewalCards(admin, userId, staleRenewalCards(leases, ex, renewalCtx))
    inserts.push(...planRenewalActions(userId, leases, ex, today, market, renewalCtx))
  }
  for (const l of reminderLeases) {
    const userId = resolve(l)
    if (!userId || !l.tenant_email || reminderProposed.has(`${l.id}:${dueDate}`)) continue
    // Rent on the due date is owed under a newer lease on the unit that is in
    // force by then (and that lease gets its own reminder) — not under this one.
    if (replacedInForceBy(l, renewalCtx.laterLeases, dueDate)) continue
    inserts.push(buildRentReminderProposal(userId, l, dueDate))
  }
  for (const i of invites) {
    if (!i.invited_by || inviteReminded.has(i.id)) continue
    inserts.push(buildInviteReminderProposal(i.invited_by, i, today))
  }
  for (const l of relistLeases) {
    const userId = l.landlord_id ? toAuthId.get(l.landlord_id) ?? null : null
    if (!userId || relistProposed.has(l.id)) continue
    inserts.push(buildRelistProposal(userId, l, today))
  }

  if (inserts.length === 0) {
    return NextResponse.json({ created: 0, expired, mode: 'cron' })
  }
  const { error: insErr } = await admin.from('agent_pending_actions').insert(inserts)
  if (insErr) {
    console.error('proactive proposal insert failed:', insErr.message)
    return NextResponse.json({ error: 'proposal insert failed' }, { status: 500 })
  }
  // Push (Muse benchmark item F): one message per user for this sweep —
  // "N cards waiting" — never one per card.
  const perUser = new Map<string, { n: number; first: string }>()
  for (const i of inserts) {
    const uid = String(i.user_id)
    const cur = perUser.get(uid)
    perUser.set(uid, { n: (cur?.n ?? 0) + 1, first: cur?.first ?? String(i.title) })
  }
  let pushed = 0
  await Promise.all(Array.from(perUser).map(async ([uid, v]) => {
    pushed += await notifyUser(admin, uid, {
      kind: 'approval',
      title: v.n === 1 ? v.first.slice(0, 80) : `${v.n} 件事等你点头 / ${v.n} waiting on you`,
      body: v.n === 1 ? '批准后才会执行 / Runs only after you approve' : v.first.slice(0, 80),
      url: '/landlord/todo',
    })
  }))
  return NextResponse.json({ created: inserts.length, expired, pushed, mode: 'cron' })
}

// Cron mode = the renewal / reminder sweep above + the marketplace sweep
// (overdue quotes, credential expiry ladder; 节点 3 2026-09-26). The two are
// independent: a failure in one is reported, not allowed to hide the other.
async function runCronSweep(): Promise<NextResponse> {
  const admin: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const marketplace = await runMarketplaceSweep(admin).catch((e: Error) => ({ error: e.message }))
  const res = await runRenewalSweep()
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return NextResponse.json({ ...body, marketplace }, { status: res.status })
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

// Constant-time string comparison (edge runtime has no node:crypto
// timingSafeEqual). XORs every byte so runtime does not depend on where
// the first mismatch occurs.
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export async function POST(req: Request) {
  // Cron mode: shared-secret header, only when CRON_SECRET is configured —
  // an unset env var disables the path entirely (no empty-matches-empty).
  const cronSecret = process.env.CRON_SECRET
  const givenSecret = (req.headers.get('x-cron-secret') || '').trim()
  if (cronSecret && givenSecret && timingSafeEqual(givenSecret, cronSecret)) {
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

  // Leases ending inside the renewal window. RLS (leases_parties) returns
  // rows where the caller is EITHER party; a multi-hat account would have
  // been offered a renewal letter for its own tenancy (review 2026-09-14),
  // so filter to the caller's landlord ids explicitly.
  const { data: llRows } = await sb.from('landlords').select('id').or(`auth_id.eq.${userId},id.eq.${userId}`)
  const landlordIds = (llRows ?? []).map((r: { id: string }) => r.id)
  if (!landlordIds.length) return NextResponse.json({ created: 0, skipped: 'not_a_landlord' })
  const today = new Date()
  const horizon = new Date(today.getTime() + SCAN_WINDOW_DAYS * 86_400_000)
  const { data: leaseRows, error: leaseErr } = await sb
    .from('lease_documents')
    .select(LEASE_COLS)
    .in('landlord_id', landlordIds)
    .in('status', [...IN_FORCE_STATUSES])
    // Not yet started = not in force: no renewal touchpoints for it (节点 1 2026-09-26).
    .or(`start_date.is.null,start_date.lte.${iso(todayUtc(today))}`)
    .gte('end_date', iso(todayUtc(today)))
    .lte('end_date', iso(horizon))
    .order('end_date', { ascending: true })
    .limit(20)
  if (leaseErr) {
    console.error('proactive lease scan failed:', leaseErr.message)
    return NextResponse.json({ error: 'lease scan failed' }, { status: 500 })
  }
  const leases = ((leaseRows ?? []) as LeaseRow[]).filter((l) => isLeaseInForce(l, today))
  if (leases.length === 0) {
    return NextResponse.json({ created: 0, actions: [] })
  }
  await attachPlaces(sb, leases)

  // Idempotency: one proposal per lease per stage, ever (approved, rejected
  // or still pending — never re-nag a decided touchpoint).
  const [{ data: existing }, market, renewalCtx] = await Promise.all([
    sb
      .from('agent_pending_actions')
      .select(EXISTING_COLS)
      .eq('user_id', userId)
      .in('action_type', RENEWAL_TYPES),
    loadMarket(sb),
    loadRenewalContext(sb, leases, leases.map((l) => l.id), today),
  ])
  const existingCards = (existing ?? []) as ExistingRenewalAction[]
  const expired = await expireStaleRenewalCards(sb, userId, staleRenewalCards(leases, existingCards, renewalCtx))
  const inserts = planRenewalActions(
    userId,
    leases,
    existingCards,
    today,
    market,
    renewalCtx,
  )

  if (inserts.length === 0) {
    return NextResponse.json({ created: 0, expired, actions: [] })
  }
  const { data: created, error: insErr } = await sb
    .from('agent_pending_actions')
    .insert(inserts)
    .select(CREATED_COLS)
  if (insErr) {
    console.error('proactive proposal insert failed:', insErr.message)
    return NextResponse.json({ error: 'proposal insert failed' }, { status: 500 })
  }
  return NextResponse.json({ created: created?.length ?? 0, expired, actions: created ?? [] })
}

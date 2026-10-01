import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  IN_FORCE_STATUSES,
  buildCheckpointProposal,
  latestIntentFor,
  planRenewalActions,
  renewalLetterSent,
  renewalSkipReason,
  replacedInForceBy,
  sameUnit,
  STALE_EXPIRED_BY,
  staleRenewalCards,
  successorLease,
  type ExistingRenewalAction,
  type RenewalLease,
} from '../lib/agent/renewalStages'
import { buildRelistProposal, relistHref } from '../lib/agent/proactiveExtras'
import { landlordLifecycle, type LandlordFacts } from '../lib/lifecycle/stages'
import { landlordFactsToLifecycle } from '../lib/facts/toLifecycle'
import { landlordStats } from '../lib/facts/stats'
import { LEASE_SIGNED_STATUSES } from '../lib/matters/states'
import type { LandlordFactsRaw } from '../lib/facts/useFacts'

// Sweep 2026-10-01 · group A5 (renewal & lifecycle): findings #4, #11, #14,
// #19, #55, #56, #59.

const today = new Date('2026-10-01T12:00:00Z')
const plusDays = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString().slice(0, 10)
const lease = (endDate: string, over: Partial<RenewalLease> = {}): RenewalLease => ({
  id: 'l1', landlord_id: 'LL', tenant_name: 'Mia', tenant_email: 'mia@example.com', unit_label: 'Unit 1207', monthly_rent: 2800, start_date: '2025-12-01', end_date: endDate, ...over,
})
const letter = (over: Partial<ExistingRenewalAction> = {}): ExistingRenewalAction => ({ action_type: 'send_renewal_letter', status: 'approved', metadata: { lease_id: 'l1', stage: '90d' }, ...over })
const SENT = { executed_at: '2026-08-10T13:00:00Z', execution_result: { ok: true } }
const read = (f: string) => readFileSync(f, 'utf8')

describe('#4 — a renewal letter is "sent" only when it really executed (contract C8)', () => {
  it('renewalLetterSent needs executed_at AND execution_result.ok === true', () => {
    expect(renewalLetterSent(letter())).toBe(false) // approved, never ran (tab closed in the undo window)
    expect(renewalLetterSent(letter({ executed_at: '2026-08-10T00:00:00Z' }))).toBe(false) // claimed, result not stamped
    expect(renewalLetterSent(letter({ executed_at: null, execution_result: { ok: false } }))).toBe(false) // failed + released
    expect(renewalLetterSent(letter({ executed_at: 'x', execution_result: { ok: 'true' } }))).toBe(false)
    expect(renewalLetterSent(letter(SENT))).toBe(true)
    expect(renewalLetterSent({ ...letter(SENT), action_type: 'renewal_checkpoint' })).toBe(false)
  })

  it('approved-but-unsent letter: the 60d N1 checkpoint still comes, and it says the letter can still be sent from the to-do list', () => {
    const out = planRenewalActions('u', [lease(plusDays(50))], [letter()], today)
    expect(out.map((o) => o.action_type)).toEqual(['renewal_checkpoint'])
    expect(out[0].metadata.stage).toBe('60d')
    expect(out[0].summary).toContain('N1')
    expect(out[0].summary).toContain('90 天那张续约函已批准但没有发出，可在待办里点「现在执行」')
    expect(out[0].summary).not.toContain('仍可批准')
    // Rejected / expired letters keep the other sentence.
    for (const st of ['rejected', 'expired']) {
      const o = planRenewalActions('u', [lease(plusDays(50))], [letter({ status: st })], today)
      expect(o[0].summary).toContain('没有发出（已拒绝、已过期或发送未完成）')
      expect(o[0].summary).not.toContain('现在执行')
    }
    // A still-pending card is the one that may be called approvable.
    const pend = planRenewalActions('u', [lease(plusDays(50))], [letter({ status: 'pending' })], today)
    expect(pend[0].summary).toContain('上方 90 天那张卡仍可批准发送续约函')
  })

  it('approved-but-unsent letter at 30d: a "call them" checkpoint, never the email claiming the offer went out', () => {
    for (const ex of [letter(), letter({ executed_at: null, execution_result: { ok: false } })]) {
      const out = planRenewalActions('u', [lease(plusDays(25))], [ex], today)
      expect(out.map((o) => o.action_type)).toEqual(['renewal_checkpoint'])
      expect(JSON.stringify(out[0])).not.toContain('此前已把续约方案发给您')
      expect(out[0].summary).not.toContain('续约函已发出')
    }
    const sent = planRenewalActions('u', [lease(plusDays(25))], [letter(SENT)], today)
    expect(sent[0].action_type).toBe('send_message')
    expect(String(sent[0].metadata.body)).toContain('此前已把续约方案发给您')
  })

  it('a sent letter but no tenant e-mail: the checkpoint says the letter went out, not that it did not', () => {
    const out = planRenewalActions('u', [lease(plusDays(25), { tenant_email: null })], [letter(SENT)], today)
    expect(out[0].action_type).toBe('renewal_checkpoint')
    expect(out[0].summary).toContain('续约函已发出')
    expect(out[0].summary).not.toContain('续约函没有发出')
  })

  const base: LandlordFacts = { listings: [], showingsPending: 0, applications: [], screenings: [], leases: [{ id: 'l1', status: 'signed_both', start_date: '2025-12-01', end_date: plusDays(80), unit_label: 'U' }], households: [], rent: [], tickets: [], renewalCards: [] }
  it('the rail: approved-but-unsent is not done, says so, and sends the landlord to 「现在执行」 on the to-do list', () => {
    const lc = landlordLifecycle({ ...base, renewalCards: [{ action_type: 'send_renewal_letter', status: 'approved', lease_id: 'l1', stage: '90d', executed_at: null }] }, today)
    const step = lc.phases[2].steps.find((s) => s.key === 'letter')!
    expect(step.state).toBe('current')
    expect(step.detail?.zh).toBe('续约函已批准，但还没有发出 · 去待办点「现在执行」')
    expect(lc.phases[2].next?.label.zh).toBe('发出已批准的续约函')
    expect(lc.phases[2].next?.href).toBe('/landlord/todo')
    // Claimed but failed without release (not offered as 现在执行): no to-do promise.
    const claimed = landlordLifecycle({ ...base, renewalCards: [{ action_type: 'send_renewal_letter', status: 'approved', lease_id: 'l1', stage: '90d', executed_at: '2026-08-10T00:00:00Z', execution_result: { ok: false } }] }, today)
    expect(claimed.phases[2].steps.find((s) => s.key === 'letter')!.detail?.zh).toBe('续约函已批准，但还没有发出')
    expect(claimed.phases[2].next?.label.zh).toBe('查看续约窗口')
    expect(claimed.phases[2].next?.href).toBe('/landlord/leases')
    // Rejected letter: nothing to run, look at the window.
    const rejected = landlordLifecycle({ ...base, renewalCards: [{ action_type: 'send_renewal_letter', status: 'rejected', lease_id: 'l1', stage: '90d', executed_at: null }] }, today)
    expect(rejected.phases[2].next?.label.zh).toBe('查看续约窗口')
    const sent = landlordLifecycle({ ...base, renewalCards: [{ action_type: 'send_renewal_letter', status: 'approved', lease_id: 'l1', stage: '90d', ...SENT }] }, today)
    expect(sent.phases[2].steps.find((s) => s.key === 'letter')!.state).toBe('done')
  })

  it('facts → rail carries executed_at / execution_result; the RPC exposes them', () => {
    const raw = { listings: [], applications: [], screenings: [], households: [], rent: [], rent_month: [], tickets: [], intents: [], leases: base.leases, cards: [{ action_type: 'send_renewal_letter', status: 'approved', metadata: { lease_id: 'l1', stage: '90d' }, ...SENT }] } as unknown as LandlordFactsRaw
    expect(landlordFactsToLifecycle(raw, today).phases[2].steps.find((s) => s.key === 'letter')!.state).toBe('done')
    const unsent = { ...raw, cards: [{ action_type: 'send_renewal_letter', status: 'approved', metadata: { lease_id: 'l1', stage: '90d' }, executed_at: null, execution_result: null }] } as unknown as LandlordFactsRaw
    expect(landlordFactsToLifecycle(unsent, today).phases[2].steps.find((s) => s.key === 'letter')!.state).toBe('current')
    // An RPC that predates the stamp (no executed_at key): unknown → read the
    // approval as before, never "approved but not sent" for every sent letter.
    const legacy = { ...raw, cards: [{ action_type: 'send_renewal_letter', status: 'approved', metadata: { lease_id: 'l1', stage: '90d' } }] } as unknown as LandlordFactsRaw
    const legacyStep = landlordFactsToLifecycle(legacy, today).phases[2].steps.find((s) => s.key === 'letter')!
    expect(legacyStep.state).toBe('done')
    expect(legacyStep.detail).toBeUndefined()
    const sql = read('supabase/migrations/20261001_A5_renewal_lifecycle.sql')
    const fn = sql.slice(sql.indexOf('create or replace function public.lifecycle_facts_landlord'), sql.indexOf('revoke all on function public.lifecycle_facts_landlord'))
    expect(fn).toContain('executed_at')
    expect(fn).toContain("jsonb_build_object('ok', execution_result -> 'ok'")
    expect(fn).toContain('security invoker')
    expect(sql).toContain('revoke all on function public.lifecycle_facts_landlord() from public, anon;')
  })

  it('both proactive scans read the execution stamp of existing cards', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).toContain("const EXISTING_COLS = 'id, action_type, status, metadata, executed_at, execution_result'")
    expect(src).toContain(".select('id, user_id, action_type, status, metadata, executed_at, execution_result')")
    expect(src).toContain('.select(EXISTING_COLS)')
    expect(read('lib/lifecycle/stages.ts')).toContain('renewalLetterSent(c)')
  })
})

describe('#11 — re-list goes to the original listing, no "one-click" claim', () => {
  const ended = { id: 'L9', listing_id: '11111111-2222-3333-4444-555555555555', tenant_name: 'Old', unit_label: 'Unit 3', end_date: '2026-09-20', status: 'signed_both' }
  it('the card carries listing_id and the edit-page href; the summary promises nothing that does not exist', () => {
    const p = buildRelistProposal('u', ended, today)
    expect(p.metadata.listing_id).toBe(ended.listing_id)
    expect(p.metadata.href).toBe(`/dashboard/listings/${ended.listing_id}/edit?relist=1`)
    expect(p.summary).not.toMatch(/一键/)
    expect(p.summary).toContain('已上架')
    const bare = buildRelistProposal('u', { ...ended, listing_id: null }, today)
    expect(bare.metadata.href).toBe('/dashboard')
    expect(bare.summary).not.toMatch(/一键/)
    expect(relistHref(undefined)).toBe('/dashboard')
  })

  it('the rail points at the edit page (never the new-listing wizard) for a move-out', () => {
    const lc = landlordLifecycle({ listings: [], showingsPending: 0, applications: [], screenings: [], leases: [{ ...ended, start_date: '2025-09-21' }], households: [], rent: [], tickets: [], renewalCards: [] }, today)
    const step = lc.phases[2].steps.find((s) => s.key === 'turnover')!
    expect(step.state).toBe('current')
    expect(step.href).toBe(`/dashboard/listings/${ended.listing_id}/edit?relist=1`)
    expect(lc.phases[2].next?.href).toBe(`/dashboard/listings/${ended.listing_id}/edit?relist=1`)
    expect(lc.phases[2].next?.label.zh).toBe('重新上架原房源')
    const noListing = landlordLifecycle({ listings: [], showingsPending: 0, applications: [], screenings: [], leases: [{ ...ended, listing_id: null, start_date: '2025-09-21' }], households: [], rent: [], tickets: [], renewalCards: [] }, today)
    expect(noListing.phases[2].steps.find((s) => s.key === 'turnover')!.href).toBe('/dashboard')
    expect(read('lib/lifecycle/stages.ts')).not.toMatch(/turnover'[^\n]*\/dashboard\/listings\/new/)
  })

  it('the cron sweep loads listing_id, skips a listing that is already live again, and the RPC exposes lease listing_id', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).toContain(".select('id, landlord_id, listing_id, tenant_name, unit_label, end_date, status')")
    expect(src).toContain("from('listings').select('id, is_active').in('id', relistListingIds)")
    expect(read('supabase/migrations/20261001_A5_renewal_lifecycle.sql')).toMatch(/application_id, listing_id, sent_at/)
  })
})

describe('#14 / #55 — renewed tenancies and recorded intents', () => {
  const l = lease(plusDays(80))
  it('a signed successor on the same unit (starting after this lease) supersedes it; an unsigned or other-unit one does not', () => {
    const next = { id: 'l2', landlord_id: 'LL', unit_label: ' unit 1207 ', start_date: plusDays(81), end_date: plusDays(445), status: 'signed_both' }
    expect(successorLease(l, [next])?.id).toBe('l2')
    expect(successorLease(l, [{ ...next, status: 'signed_tenant' }])?.id).toBe('l2')
    expect(successorLease(l, [{ ...next, status: 'imported' }])?.id).toBe('l2')
    expect(successorLease(l, [{ ...next, status: 'sent' }])).toBeNull()
    expect(successorLease(l, [{ ...next, status: 'draft' }])).toBeNull()
    expect(successorLease(l, [{ ...next, unit_label: 'Unit 1208' }])).toBeNull()
    expect(successorLease(l, [{ ...next, landlord_id: 'OTHER' }])).toBeNull()
    expect(successorLease(l, [{ ...next, start_date: '2025-06-01' }])).toBeNull() // older lease, not a successor
    expect(successorLease(l, [{ ...l }])).toBeNull() // itself
    // Without unit labels the listing, then the tenant e-mail, identify the unit.
    expect(sameUnit({ id: 'a', listing_id: 'X' }, { id: 'b', listing_id: 'X' })).toBe(true)
    expect(sameUnit({ id: 'a', tenant_email: 'A@x.ca' }, { id: 'b', tenant_email: 'a@x.ca' })).toBe(true)
    expect(sameUnit({ id: 'a' }, { id: 'b' })).toBe(false)
    // Two buildings with a "1203" each: different listings win over the same label.
    expect(sameUnit({ id: 'a', unit_label: '1203', listing_id: 'X' }, { id: 'b', unit_label: '1203', listing_id: 'Y' })).toBe(false)
  })

  it('the planner proposes nothing for a superseded lease, at any stage', () => {
    const later = [{ id: 'l2', landlord_id: 'LL', unit_label: 'Unit 1207', start_date: plusDays(81), end_date: plusDays(445), status: 'signed_both' }]
    for (const d of [100, 50, 20]) {
      expect(planRenewalActions('u', [lease(plusDays(d))], [], today, null, { laterLeases: later.map((x) => ({ ...x, start_date: plusDays(d + 1) })) })).toHaveLength(0)
    }
    expect(planRenewalActions('u', [l], [], today, null, { laterLeases: [] })).toHaveLength(1)
  })

  const intent = (i: string, at = '2026-09-15T10:00:00Z') => ({ lease_id: 'l1', household_id: 'h1', intent: i, created_at: at })
  it('latestIntentFor takes the newest answer for this lease (or its household when the lease link is gone)', () => {
    expect(latestIntentFor({ id: 'l1' }, [intent('leave', '2026-09-01T00:00:00Z'), intent('renew', '2026-09-20T00:00:00Z')])?.intent).toBe('renew')
    expect(latestIntentFor({ id: 'l1', household_id: 'h1' }, [{ lease_id: null, household_id: 'h1', intent: 'negotiate', created_at: 'x' }])?.intent).toBe('negotiate')
    expect(latestIntentFor({ id: 'l1' }, [{ ...intent('renew'), lease_id: 'other' }])).toBeNull()
  })

  it('"leave" stops every touchpoint; an answered tenant is never asked again', () => {
    for (const d of [100, 50, 20]) expect(planRenewalActions('u', [lease(plusDays(d))], [letter(SENT)].filter(() => d < 90), today, null, { intents: [intent('leave')] })).toHaveLength(0)
    // renew + sent letter at 30d → nothing left to ask
    expect(planRenewalActions('u', [lease(plusDays(20))], [letter(SENT)], today, null, { intents: [intent('renew')] })).toHaveLength(0)
    // negotiate + sent letter → a checkpoint naming the answer, not a second e-mail
    const neg = planRenewalActions('u', [lease(plusDays(20))], [letter(SENT)], today, null, { intents: [intent('negotiate')] })
    expect(neg.map((o) => o.action_type)).toEqual(['renewal_checkpoint'])
    expect(neg[0].summary).toContain('想谈谈条件')
    expect(neg[0].metadata.tenant_intent).toBe('negotiate')
    // renew + letter never sent → the checkpoint does not claim "no intent received"
    const ren = planRenewalActions('u', [lease(plusDays(20))], [letter({ status: 'rejected' })], today, null, { intents: [intent('renew')] })
    expect(ren[0].action_type).toBe('renewal_checkpoint')
    expect(ren[0].summary).toContain('表示「续约」')
    expect(ren[0].summary).not.toContain('也没有收到')
    // no intent → the old behaviour
    expect(planRenewalActions('u', [lease(plusDays(20))], [letter(SENT)], today)[0].action_type).toBe('send_message')
  })

  it('the 30d checkpoint without an intent keeps its "call them" wording; with one it never says none was received', () => {
    const c = buildCheckpointProposal('u', lease(plusDays(20)), today, '30d', { intent: intent('renew') })
    expect(c.title).toContain('已表示续约')
    expect(buildCheckpointProposal('u', lease(plusDays(20)), today, '30d').summary).toContain('也没有收到')
  })

  it('rail and status tile drop a superseded lease from the renewal window', () => {
    const leases = [
      { id: 'l1', status: 'signed_both', start_date: '2025-12-01', end_date: plusDays(80), unit_label: 'U1' },
      { id: 'l2', status: 'signed_both', start_date: plusDays(81), end_date: plusDays(445), unit_label: 'U1' },
    ]
    const lc = landlordLifecycle({ listings: [], showingsPending: 0, applications: [], screenings: [], leases, households: [], rent: [], tickets: [], renewalCards: [] }, today)
    expect(lc.phases[2].steps.find((s) => s.key === 'window')!.state).toBe('todo')
    const raw = { listings: [], cards: [], applications: [], screenings: [], households: [], rent: [], rent_month: [], tickets: [], intents: [], leases } as unknown as LandlordFactsRaw
    expect(landlordStats(raw, today).expiringLeases).toBe(0)
    expect(landlordStats({ ...raw, leases: [leases[0]] } as LandlordFactsRaw, today).expiringLeases).toBe(1)
  })

  it('both proactive modes load successors and intents and hand them to the planner', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).toContain('async function loadRenewalContext(')
    expect(src).toContain(".from('renewal_intents')")
    expect(src).toContain('.in(\'status\', [...SUCCESSOR_STATUSES])')
    expect(src).toContain('planRenewalActions(userId, leases, ex, today, market, renewalCtx)')
    expect(src).toMatch(/market,\s+renewalCtx,\s+\)/)
    // rent reminders are not proposed for a lease replaced (in force) by the due date
    expect(src).toContain('if (replacedInForceBy(l, renewalCtx.laterLeases, dueDate)) continue')
  })
})

describe('#19 — imported leases are in force for every proactive scan', () => {
  it('IN_FORCE_STATUSES = the shared signed statuses minus "ended"', () => {
    expect([...IN_FORCE_STATUSES].sort()).toEqual([...LEASE_SIGNED_STATUSES].filter((s) => s !== 'ended').sort())
  })
  it('the renewal, reminder and workspace-load scans use it plus isLeaseInForce', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).not.toContain(".in('status', ['active', 'signed_both'])")
    expect(src.match(/\.in\('status', \[\.\.\.IN_FORCE_STATUSES\]\)/g)?.length).toBe(3)
    expect(src.match(/isLeaseInForce\(l, today\)/g)?.length).toBe(2)
  })
  it('an imported lease gets its 90d letter and shows in the rail window', () => {
    expect(planRenewalActions('u', [lease(plusDays(100))], [], today)[0].action_type).toBe('send_renewal_letter')
    const lc = landlordLifecycle({ listings: [], showingsPending: 0, applications: [], screenings: [], leases: [{ id: 'l1', status: 'imported', start_date: '2025-12-01', end_date: plusDays(80), unit_label: 'U' }], households: [], rent: [], tickets: [], renewalCards: [] }, today)
    expect(lc.phases[2].steps.find((s) => s.key === 'window')!.state).toBe('current')
  })
})

describe('#56 — invite-reminder cards expire when the invite closes', () => {
  const sql = read('supabase/migrations/20261001_A5_renewal_lifecycle.sql')
  it('a definer trigger on accept / decline / revoke / delete expires the unexecuted cards for that invite', () => {
    expect(sql).toContain('create or replace function public.expire_invite_reminder_cards()')
    expect(sql).toMatch(/returns trigger language plpgsql security definer set search_path = public/)
    expect(sql).toContain('after update of accepted_at, declined_at, revoked_at or delete on public.household_invites')
    expect(sql).toContain("'reason', 'invite_closed'")
    expect(sql).toContain("a.metadata ->> 'invite_id' = v_id::text")
    expect(sql).toContain("a.status in ('pending', 'approved')")
    expect(sql).toContain('a.executed_at is null')
    expect(sql).toContain('revoke all on function public.expire_invite_reminder_cards() from public, anon, authenticated, service_role;')
    expect(sql).toContain('drop trigger if exists trg_expire_invite_reminder_cards on public.household_invites;')
  })
  it('cards already stale are expired once', () => {
    expect(sql).toMatch(/and not exists \(\s+select 1 from public\.household_invites i/)
  })
})

describe('#59 — cards created on workspace load come back with metadata', () => {
  it('the user-mode insert returns the full card shape the client renders', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).toContain('.select(CREATED_COLS)')
    const cols = src.slice(src.indexOf('const CREATED_COLS = '), src.indexOf('\n', src.indexOf('const CREATED_COLS = ')))
    for (const c of ['metadata', 'role', 'requires_approval', 'user_id', 'expires_at']) expect(cols).toContain(c)
  })
})

describe('review of the A5 fixes', () => {
  const LST = '11111111-2222-3333-4444-555555555555'
  const emptyLL: LandlordFacts = { listings: [], showingsPending: 0, applications: [], screenings: [], leases: [], households: [], rent: [], tickets: [], renewalCards: [] }

  it('re-list: an original listing that is live again is not "to re-list" (same rule as the cron)', () => {
    const endedLease = { id: 'L9', status: 'signed_both', start_date: '2025-09-21', end_date: '2026-09-21', unit_label: 'Unit 3', listing_id: LST }
    const live = landlordLifecycle({ ...emptyLL, leases: [endedLease], listings: [{ id: LST, verification_status: 'verified', is_active: true }] }, today)
    expect(live.phases[2].steps.find((s) => s.key === 'turnover')!.state).toBe('todo')
    expect(live.phases[2].next).toBeUndefined()
    const off = landlordLifecycle({ ...emptyLL, leases: [endedLease], listings: [{ id: LST, verification_status: 'verified', is_active: false }] }, today)
    expect(off.phases[2].steps.find((s) => s.key === 'turnover')!.state).toBe('current')
    expect(off.phases[2].next?.href).toBe(`/dashboard/listings/${LST}/edit?relist=1`)
    // relistTo comes from the filtered list: the live one is skipped, the other one is offered.
    const two = landlordLifecycle({ ...emptyLL, leases: [endedLease, { ...endedLease, id: 'L8', unit_label: 'Unit 4', listing_id: 'OTHER' }], listings: [{ id: LST, verification_status: 'verified', is_active: true }, { id: 'OTHER', verification_status: 'verified', is_active: false }] }, today)
    expect(two.phases[2].next?.href).toBe('/dashboard/listings/OTHER/edit?relist=1')
  })

  it('a tenant who said "leave" needs no letter: the letter step does not wait for one, the window still counts the lease', () => {
    const facts: LandlordFacts = {
      ...emptyLL,
      leases: [{ id: 'l1', status: 'signed_both', start_date: '2025-12-01', end_date: plusDays(80), unit_label: 'U' }],
      households: [{ id: 'h1', current_lease_id: 'l1', verified: true, status: 'active', end_date: plusDays(80) }],
      renewalIntents: [{ household_id: 'h1', lease_id: 'l1', intent: 'leave' }],
    }
    const lc = landlordLifecycle(facts, today)
    const post = lc.phases[2]
    expect(post.steps.find((s) => s.key === 'window')!.state).toBe('current')
    const letterStep = post.steps.find((s) => s.key === 'letter')!
    expect(letterStep.state).toBe('done')
    expect(letterStep.detail?.zh).toBe('租客已表示搬离，无需续约函')
    expect(post.steps.find((s) => s.key === 'intent')!.detail?.zh).toContain('走 1')
    expect(post.next).toBeUndefined()
    // A newer "renew" overrides an older "leave" (newest first).
    const flipped = landlordLifecycle({ ...facts, renewalIntents: [{ household_id: 'h1', lease_id: 'l1', intent: 'renew' }, { household_id: 'h1', lease_id: 'l1', intent: 'leave' }] }, today)
    expect(flipped.phases[2].steps.find((s) => s.key === 'letter')!.state).toBe('current')
    expect(flipped.phases[2].next?.label.zh).toBe('查看续约窗口')
    // Mixed: one leaving, one not — the other lease still drives the letter step.
    const mixed = landlordLifecycle({ ...facts, leases: [...facts.leases, { id: 'l2', status: 'signed_both', start_date: '2025-12-01', end_date: plusDays(70), unit_label: 'V' }] }, today)
    expect(mixed.phases[2].steps.find((s) => s.key === 'letter')!.state).toBe('current')
    expect(mixed.phases[2].steps.find((s) => s.key === 'window')!.detail?.zh).toContain('2 份')
  })

  it('rent reminders: only an IN-FORCE successor that started by the due date takes the reminder away', () => {
    const l1 = { id: 'L1', landlord_id: 'LL', unit_label: 'U1', start_date: '2025-11-01', end_date: '2026-11-30', status: 'signed_both' }
    const due = '2026-11-01'
    const l2 = { id: 'L2', landlord_id: 'LL', unit_label: 'U1', start_date: '2026-11-01', end_date: '2027-10-31', status: 'signed_both' }
    const l3 = { id: 'L3', landlord_id: 'LL', unit_label: 'U1', start_date: '2026-12-01', end_date: '2027-11-30', status: 'signed_both' }
    // Order no longer matters: L3 first (starts after the due date), L2 second (starts on it).
    expect(replacedInForceBy(l1, [l3, l2], due)).toBe(true)
    expect(replacedInForceBy(l1, [l3], due)).toBe(false)
    // Signed by the tenant only → not in force → L1 is still the lease that is billed.
    expect(replacedInForceBy(l1, [{ ...l2, status: 'signed_tenant' }], due)).toBe(false)
    expect(replacedInForceBy(l1, [{ ...l2, unit_label: 'U2' }], due)).toBe(false)
    expect(replacedInForceBy(l2, [l1], due)).toBe(false) // an older lease never replaces a newer one
  })

  const card = (over: Partial<ExistingRenewalAction> & { id: string }): ExistingRenewalAction => ({ action_type: 'send_renewal_letter', status: 'pending', metadata: { lease_id: 'l1', stage: '90d' }, executed_at: null, ...over })
  const successor = { id: 'l2', landlord_id: 'LL', unit_label: 'Unit 1207', start_date: plusDays(81), end_date: plusDays(445), status: 'signed_both' }

  it('cards the planner no longer stands behind are listed for expiry (never ones that ran, never invite / payment-plan messages)', () => {
    const l = lease(plusDays(25), { household_id: 'h1' })
    const existing = [
      card({ id: 'a' }),
      card({ id: 'b', action_type: 'renewal_checkpoint', metadata: { lease_id: 'l1', stage: '60d' }, status: 'approved' }),
      card({ id: 'c', action_type: 'send_message', metadata: { lease_id: 'l1', stage: '30d' } }),
      card({ id: 'd', ...SENT, status: 'approved' }), // already ran
      card({ id: 'e', status: 'rejected' }),
      card({ id: 'f', action_type: 'send_message', metadata: { lease_id: 'l1', stage: 'payment_plan' } }),
      card({ id: 'g', metadata: { lease_id: 'other', stage: '90d' } }),
    ]
    expect(staleRenewalCards([l], existing, { laterLeases: [successor] })).toEqual([
      { id: 'a', reason: 'lease_superseded' }, { id: 'b', reason: 'lease_superseded' }, { id: 'c', reason: 'lease_superseded' },
    ])
    const leave = [{ lease_id: 'l1', household_id: 'h1', intent: 'leave', created_at: '2026-09-20T00:00:00Z' }]
    expect(staleRenewalCards([l], existing, { intents: leave }).map((x) => x.reason)).toEqual(['tenant_leaving', 'tenant_leaving', 'tenant_leaving'])
    expect(staleRenewalCards([l], existing, {})).toEqual([])
    expect(renewalSkipReason(l, { laterLeases: [successor], intents: leave })).toBe('lease_superseded')
  })

  it('a card the planner expired comes back if the reason goes away; one the executor refused does not', () => {
    const l = lease(plusDays(100))
    const byPlanner = card({ id: 'a', status: 'expired', execution_result: { ok: false, reason: 'tenant_leaving', by: STALE_EXPIRED_BY } })
    expect(planRenewalActions('u', [l], [byPlanner], today).map((o) => o.action_type)).toEqual(['send_renewal_letter'])
    // Reason still true → still nothing.
    expect(planRenewalActions('u', [l], [byPlanner], today, null, { intents: [{ lease_id: 'l1', household_id: null, intent: 'leave', created_at: '2026-09-20T00:00:00Z' }] })).toHaveLength(0)
    const byExecutor = card({ id: 'b', status: 'expired', execution_result: { ok: false, reason: 'tenant_leaving' } })
    expect(planRenewalActions('u', [l], [byExecutor], today)).toHaveLength(0)
  })

  it('both proactive modes expire stale cards before planning, scoped to the user, only unexecuted pending/approved rows', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).toContain('expired += await expireStaleRenewalCards(admin, userId, staleRenewalCards(leases, ex, renewalCtx))')
    expect(src).toContain('const expired = await expireStaleRenewalCards(sb, userId, staleRenewalCards(leases, existingCards, renewalCtx))')
    const fn = src.slice(src.indexOf('async function expireStaleRenewalCards('), src.indexOf('async function loadMarket('))
    expect(fn).toContain(".eq('user_id', userId)")
    expect(fn).toContain(".in('status', ['pending', 'approved'])")
    expect(fn).toContain(".is('executed_at', null)")
    expect(fn).toContain('by: STALE_EXPIRED_BY')
  })
})

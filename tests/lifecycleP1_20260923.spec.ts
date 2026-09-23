// P1 of the lifecycle proposals (2026-09-23): applicant tracker, stage-grouped
// applicant queue, renewal intent, invite reminder / re-list cards,
// maintenance triage. Pure-function guards; the routes are edge.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { applicationTrack, trackSummary } from '@/lib/lifecycle/applicationTrack'
import { applicantStage, STAGE_SECTIONS } from '@/lib/landlord/applicantStages'
import { landlordLifecycle, tenantLifecycle } from '@/lib/lifecycle/stages'
import { buildInviteReminderProposal, buildRelistProposal, inviteNeedsReminder, leaseNeedsRelist } from '@/lib/agent/proactiveExtras'
import { buildIntentAskProposal, intentLinks } from '@/lib/agent/renewalStages'
import { isEmergencyMaintenance, sanitizeActionMetadata, triageLines } from '@/lib/agent/maintenanceTriage'
import { buildSystemPrompt } from '@/lib/agent/prompts'
import { tenancyClock } from '@/lib/household/clock'

const TODAY = new Date('2026-09-23T12:00:00Z')

describe('applicant tracker (tenant side)', () => {
  it('walks 已提交 → 房东已查看 → 筛查已发起 → 决定 → 租约 → 在管', () => {
    const steps = applicationTrack({ status: 'new', created_at: '2026-09-20T10:00:00Z' })
    expect(steps.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo', 'todo', 'todo'])
    const viewed = applicationTrack({ status: 'new', created_at: '2026-09-20T10:00:00Z', viewed_at: '2026-09-21T10:00:00Z' })
    expect(viewed.find((s) => s.key === 'screened')?.state).toBe('current')
    const screened = applicationTrack({ status: 'scored', created_at: '2026-09-20T10:00:00Z', viewed_at: '2026-09-21T10:00:00Z', screened_at: '2026-09-21T11:00:00Z' })
    expect(screened.find((s) => s.key === 'decision')?.state).toBe('current')
    expect(trackSummary(screened, true).text).toContain('房东决定')
  })
  it('declined stops the row; approved continues into lease and tenancy', () => {
    const declined = applicationTrack({ status: 'declined', created_at: '2026-09-20T10:00:00Z', decision_notified_at: '2026-09-22T00:00:00Z' })
    expect(declined.at(-1)?.key).toBe('decision')
    expect(trackSummary(declined, true)).toEqual({ text: '未被选中', tone: 'bad' })
    const approved = applicationTrack({ status: 'approved', created_at: '2026-09-20T10:00:00Z', viewed_at: 'x', screened_at: 'x', decision_notified_at: '2026-09-22T00:00:00Z', lease: { status: 'sent', sent_at: '2026-09-22T01:00:00Z' } })
    expect(approved.find((s) => s.key === 'lease')?.state).toBe('current')
    const signed = applicationTrack({ status: 'approved', created_at: 'x', viewed_at: 'x', screened_at: 'x', decision_notified_at: 'x', lease: { status: 'signed_both' }, household: { id: 'h', joined: false } })
    expect(signed.find((s) => s.key === 'lease')?.state).toBe('done')
    expect(signed.find((s) => s.key === 'tenancy')?.state).toBe('current')
    expect(trackSummary(signed, false).text).toContain('Managed tenancy')
  })
  it('a decided row from before the tracker columns reads left to right', () => {
    const legacy = applicationTrack({ status: 'approved', created_at: '2026-09-20T10:00:00Z', decision_notified_at: '2026-09-22T00:00:00Z', lease: { status: 'signed_both' }, household: { id: 'h', joined: true } })
    // A decision implies the landlord looked; it does not imply a screening ran (review 2026-09-23).
    expect(legacy.map((s) => s.state)).toEqual(['done', 'done', 'todo', 'done', 'done', 'done'])
    expect(trackSummary(legacy, true).text).toBe('在管租约')
  })
  it('never exposes a score', () => {
    const src = readFileSync('lib/lifecycle/applicationTrack.ts', 'utf8') + readFileSync('components/tenant/MyApplications.tsx', 'utf8')
    expect(src).not.toMatch(/ai_score/)
  })
})

describe('landlord queue grouped by stage, not by threshold', () => {
  it('stage derives from screening / decision, score is not the key', () => {
    expect(applicantStage({ status: 'new', ai_score: null })).toBe('unscreened')
    expect(applicantStage({ status: 'scored', ai_score: 32 })).toBe('scored')
    expect(applicantStage({ status: 'scored', ai_score: 95 })).toBe('scored')
    expect(applicantStage({ status: 'approved', ai_score: 40 })).toBe('decided')
    expect(applicantStage({ status: 'new', ai_score: 70, decision_notified_at: '2026-09-22' })).toBe('decided')
    expect(STAGE_SECTIONS.map((s) => s.stage)).toEqual(['unscreened', 'scored', 'decided'])
  })
  it('the live page no longer renders the credit / DTI policy card or threshold copy', () => {
    const src = readFileSync('app/landlord/applicants/page.tsx', 'utf8')
    expect(src).toContain('{!liveMode && <PolicyCard')
    expect(src).not.toMatch(/liveMode\s*\?\s*lang === 'zh'\s*\?\s*'按默认门槛/)
  })
})

describe('renewal intent 回流', () => {
  it('30-day email carries the three one-click links when a household exists', () => {
    const p = buildIntentAskProposal('u1', { id: 'L1', household_id: 'H1', tenant_name: 'Mia', tenant_email: 'mia@x.ca', unit_label: 'Unit 7', monthly_rent: 2000, end_date: '2026-10-20' }, TODAY)
    const body = String(p.metadata.body)
    expect(body).toContain('/h/H1?intent=renew')
    expect(body).toContain('/h/H1?intent=leave')
    expect(body).toContain('/h/H1?intent=negotiate')
    expect(intentLinks(null, 'zh')).toBe('')
  })
  it('rail: landlord counts intents against leases in the window; tenant shows the answer', () => {
    const base = { listings: [], showingsPending: 0, applications: [], screenings: [], rent: [], tickets: [], renewalCards: [] }
    const lc = landlordLifecycle({ ...base, leases: [{ id: 'L1', status: 'signed_both', start_date: '2025-11-01', end_date: '2026-10-31', unit_label: 'Unit 7' }], households: [{ id: 'H1', current_lease_id: 'L1', verified: true, status: 'active', end_date: '2026-10-31' }], renewalIntents: [{ household_id: 'H1', lease_id: 'L1', intent: 'renew' }] }, TODAY)
    const step = lc.phases[2].steps.find((s) => s.key === 'intent')!
    expect(step.state).toBe('done')
    expect(step.detail?.zh).toContain('续 1')
    const tl = tenantLifecycle({ showings: [], applications: [], leases: [{ id: 'L1', status: 'signed_both', start_date: '2025-11-01', end_date: '2026-10-31', unit_label: 'Unit 7' }], households: [{ id: 'H1', current_lease_id: 'L1', verified: true, status: 'active', end_date: '2026-10-31' }], memberOf: ['H1'], rent: [], tickets: [], passportShares: 0, renewalIntent: { intent: 'negotiate', created_at: '2026-09-22T00:00:00Z' } }, TODAY)
    const ts = tl.phases[2].steps.find((s) => s.key === 'intent')!
    expect(ts.state).toBe('done')
    expect(ts.detail?.zh).toContain('想谈谈')
    expect(ts.href).toBe('/h/H1')
  })
  it('tenant rail shows what the landlord did with the application', () => {
    const tl = tenantLifecycle({ showings: [], applications: [{ id: 'a', status: 'new', decision_notified_at: null, viewed_at: '2026-09-22', screened_at: null }], leases: [], households: [], memberOf: [], rent: [], tickets: [], passportShares: 0 }, TODAY)
    expect(tl.phases[0].steps.find((s) => s.key === 'apply')?.detail?.zh).toContain('房东已查看')
  })
  it('tenancy clock: month index and days to end from the dates alone', () => {
    expect(tenancyClock('2026-01-01', '2026-12-31', TODAY)).toEqual({ month: 9, daysToEnd: 99 })
    expect(tenancyClock(null, null, TODAY)).toEqual({ month: null, daysToEnd: null })
    expect(tenancyClock('2025-01-01', '2025-12-31', TODAY).daysToEnd).toBeLessThan(0)
  })
})

describe('proactive extras: invite reminder + re-list prompt', () => {
  const inv = { id: 'I1', household_id: 'H1', invited_email: 'mia@x.ca', invited_role: 'tenant', invited_by: 'u1', created_at: '2026-09-18T00:00:00Z', expires_at: '2026-10-18T00:00:00Z', accepted_at: null, declined_at: null, revoked_at: null, address: '100 Test Ave', unit: '1' }
  it('reminds after 3 days, never for accepted / declined / expired / non-tenant invites', () => {
    expect(inviteNeedsReminder(inv, TODAY)).toBe(true)
    expect(inviteNeedsReminder({ ...inv, created_at: '2026-09-22T00:00:00Z' }, TODAY)).toBe(false)
    expect(inviteNeedsReminder({ ...inv, accepted_at: 'x' }, TODAY)).toBe(false)
    expect(inviteNeedsReminder({ ...inv, declined_at: 'x' }, TODAY)).toBe(false)
    expect(inviteNeedsReminder({ ...inv, expires_at: '2026-09-01T00:00:00Z' }, TODAY)).toBe(false)
    expect(inviteNeedsReminder({ ...inv, invited_role: 'agent' }, TODAY)).toBe(false)
    const p = buildInviteReminderProposal('u1', inv, TODAY)
    expect(p.action_type).toBe('send_message')
    expect(p.metadata.invite_id).toBe('I1')
    expect(p.metadata.to_email).toBe('mia@x.ca')
    // A reminder only — it never asks for money.
    expect(String(p.metadata.body)).not.toMatch(/应付|到期未付|overdue|pay now|please pay/i)
  })
  it('re-list only for a lease ended within 30 days with no newer lease on the unit', () => {
    const l = { id: 'L9', tenant_name: 'Old Tenant', unit_label: 'Unit 3', end_date: '2026-09-10', status: 'signed_both' }
    expect(leaseNeedsRelist(l, TODAY, false)).toBe(true)
    expect(leaseNeedsRelist(l, TODAY, true)).toBe(false)
    expect(leaseNeedsRelist({ ...l, end_date: '2026-07-01' }, TODAY, false)).toBe(false)
    expect(leaseNeedsRelist({ ...l, end_date: '2026-10-01' }, TODAY, false)).toBe(false)
    expect(leaseNeedsRelist({ ...l, status: 'draft' }, TODAY, false)).toBe(false)
    const p = buildRelistProposal('u1', l, TODAY)
    expect(p.action_type).toBe('relist_prompt')
    expect(p.recipient_label).toBeNull()
    expect(p.summary).toContain('s.38')
  })
  it('the executor treats relist_prompt as acknowledge-only', () => {
    const src = readFileSync('app/api/agent/execute/route.ts', 'utf8')
    expect(src).toMatch(/case 'relist_prompt':[\s\S]*?executeRenewalCheckpoint\(admin, userId, action, 'executed_relist_prompt'\)/)
  })
})

describe('maintenance triage', () => {
  it('keeps only known keys and legal enum values', () => {
    const m = sanitizeActionMetadata({ title: '厨房水槽漏水', category: 'plumbing', entry_permission: 'call_first', pets: '一只猫', priority: 'urgent', foo: 'bar', location: '厨房' })
    expect(m).toEqual({ title: '厨房水槽漏水', category: 'plumbing', entry_permission: 'call_first', pets: '一只猫', location: '厨房' })
    expect(sanitizeActionMetadata({ category: 'roof' }).category).toBeUndefined()
  })
  it('habitability problems are emergencies; a dripping tap is not', () => {
    expect(isEmergencyMaintenance({ title: '没有暖气', description: '外面零下 5 度' })).toBe(true)
    expect(isEmergencyMaintenance({ title: 'Smell of gas in the kitchen' })).toBe(true)
    expect(isEmergencyMaintenance({ title: '门锁坏了，锁不上' })).toBe(true)
    expect(isEmergencyMaintenance({ title: '水龙头滴水', category: 'plumbing' })).toBe(false)
    expect(triageLines({ category: 'pest', entry_permission: 'tenant_present', pets: 'dog' }, true).join(' ')).toContain('须租客在场')
  })
  it('tenant prompt asks the four triage questions and names emergencies', () => {
    const wf = { workflow_type: 'general', workflow_id: null, current_stage: 'idle', completed_steps: [], status: 'active' as const }
    const p = buildSystemPrompt('tenant', 'Luna', [], wf as never, undefined, 'zh')
    expect(p).toContain('报修整理')
    expect(p).toContain('RTA s.27')
    expect(p).toContain('entry_permission')
    const l = buildSystemPrompt('landlord', 'Logic', [], wf as never, undefined, 'zh')
    expect(l).not.toContain('报修整理')
  })
})

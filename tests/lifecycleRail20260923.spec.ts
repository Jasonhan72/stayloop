import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { landlordLifecycle, tenantLifecycle, agentLifecycle } from '../lib/lifecycle/stages'

const today = new Date('2026-09-23T12:00:00Z')

describe('lifecycle stages are derived from rows, not from the model', () => {
  it('landlord with a signed lease in the renewal window is in 租后 with an N1 clock', () => {
    const lc = landlordLifecycle({
      listings: [{ id: 'L1', verification_status: 'verified', is_active: true }],
      showingsPending: 0,
      applications: [{ id: 'A1', listing_id: 'L1', status: 'approved', decision_notified_at: '2026-09-23T02:25:05Z' }],
      screenings: [{ application_id: 'A1', status: 'scored' }],
      leases: [{ id: 'LE1', status: 'signed_both', start_date: '2026-11-01', end_date: '2026-12-19', unit_label: 'Unit 1 · 100 Test Ave' }],
      households: [{ id: 'H1', current_lease_id: 'LE1', verified: true, status: 'active', end_date: '2026-12-19' }],
      rent: [{ lease_id: 'LE1', due_date: '2026-11-01', status: 'due' }],
      tickets: [{ household_id: 'H1', status: 'new' }],
      renewalCards: [{ action_type: 'send_renewal_letter', status: 'approved', lease_id: 'LE1', stage: '90d' }],
    }, today)
    expect(lc.current).toBe('post')
    const [pre, mid, post] = lc.phases
    expect(pre.state).toBe('done')
    expect(mid.state).toBe('active')
    expect(mid.steps.find((s) => s.key === 'repairs')?.state).toBe('current')
    expect(post.clock?.date).toBe('2026-12-19')
    // The increase takes effect the day after the term ends → N1 90 days before that (review 2026-09-23).
    expect(post.headline.zh).toContain('N1 最晚 2026-09-21')
    expect(post.steps.find((s) => s.key === 'letter')?.state).toBe('done')
  })
  it('landlord with nothing is idle in 租前 with "publish" as the next step', () => {
    const lc = landlordLifecycle({ listings: [], showingsPending: 0, applications: [], screenings: [], leases: [], households: [], rent: [], tickets: [], renewalCards: [] }, today)
    expect(lc.empty).toBe(true)
    expect(lc.current).toBe('pre')
    expect(lc.phases[0].next?.href).toBe('/dashboard/listings/new')
  })
  it('landlord with an unscreened application: next step is one-click screening', () => {
    const lc = landlordLifecycle({ listings: [{ id: 'L1', verification_status: 'verified', is_active: true }], showingsPending: 0, applications: [{ id: 'A1', listing_id: 'L1', status: 'new', decision_notified_at: null }], screenings: [], leases: [], households: [], rent: [], tickets: [], renewalCards: [] }, today)
    expect(lc.current).toBe('pre')
    expect(lc.phases[0].steps.find((s) => s.key === 'screening')?.state).toBe('current')
    expect(lc.phases[0].next?.label.zh).toBe('一键筛查')
  })
  it('tenant who signed but has not accepted the household invite is in 租中 with "accept" as next', () => {
    const lc = tenantLifecycle({
      showings: [{ kind: 'showing', status: 'accepted' }],
      applications: [{ id: 'A1', status: 'approved', decision_notified_at: '2026-09-23T02:25:05Z' }],
      leases: [{ id: 'LE1', status: 'signed_both', start_date: '2026-11-01', end_date: '2027-10-31', unit_label: 'Unit 1 · 100 Test Ave' }],
      households: [{ id: 'H1', current_lease_id: 'LE1', verified: true, status: 'active', end_date: '2027-10-31' }],
      memberOf: [],
      rent: [], tickets: [], passportShares: 0,
    }, today)
    expect(lc.current).toBe('mid')
    // An invitee cannot open /h/<id> before joining; the emailed link is the door.
    expect(lc.phases[1].next?.href).toBe('/tenant/lease')
    expect(lc.phases[1].clock?.label.zh).toBe('入住日')
    expect(lc.phases[0].state).toBe('done')
  })
  it('tenant with no rows starts in 租前 and the next step prefills a template, never sends', () => {
    const lc = tenantLifecycle({ showings: [], applications: [], leases: [], households: [], memberOf: [], rent: [], tickets: [], passportShares: 0 }, today)
    expect(lc.current).toBe('pre')
    expect(lc.phases[0].next?.prompt?.zh).toContain('【')
    expect(lc.phases[0].next?.href).toBeUndefined()
  })
  it('agent rail turns on RECO status and never mentions commission settlement', () => {
    const lc = agentLifecycle({ profileStatus: 'verified', pendingCards: 0 })
    expect(lc.phases[0].steps[0].state).toBe('done')
    expect(JSON.stringify(lc)).not.toMatch(/分成结算|payout/)
  })
  it('rails never carry scores or percentages', () => {
    const lc = landlordLifecycle({ listings: [{ id: 'L1', verification_status: 'verified', is_active: true }], showingsPending: 2, applications: [{ id: 'A1', listing_id: 'L1', status: 'new', decision_notified_at: null }], screenings: [{ application_id: 'A1', status: 'scored' }], leases: [], households: [], rent: [], tickets: [], renewalCards: [] }, today)
    expect(JSON.stringify(lc)).not.toMatch(/\d+%|评分 \d|score \d/)
  })
  it('the rail lives in the phone context strip and on the progress page — never above the conversation (user 2026-09-24); the status line uses the phase', () => {
    for (const f of ['components/agent/AgentWorkspacePage.tsx']) { // the shared assistant page (2026-09-25)
      const src = readFileSync(f, 'utf8')
      // The web version mixed the workbench (今日 + rail) into the chat page; the user
      // asked for it back: chat as the hero, nothing above it.
      expect(src, f).not.toContain('<LifecycleRail')
      expect(src, f).not.toContain('<TodayCard')
      // Phones: the compact rail lives inside the context strip.
      expect(src, f).toMatch(/<ContextStrip lifecycle=\{lifecycle\}/)
      expect(src, f).toMatch(/phaseLabel=\{/)
    }
    // Desktop still reaches the full rail from the controls column.
    expect(readFileSync('components/agent/RelatedPagesCard.tsx', 'utf8')).toContain("href: '/landlord/progress'")
    expect(readFileSync('components/mobile/ContextStrip.tsx', 'utf8')).toMatch(/<LifecycleRail lifecycle=\{lifecycle\} lang=\{lang\} compact/)
    expect(readFileSync('components/mobile/RolePages.tsx', 'utf8')).toMatch(/<LifecycleRail lifecycle=\{lifecycle\} lang=\{lang\} full \/>/)
  })
})

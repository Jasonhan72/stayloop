// V1.0 阶段 1 · 甲 #3 — post-screening follow-up e-mails (d3 / d14).
// Pure rules in lib/landlord/followUp.ts; wiring and migration pinned by source grep.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  FOLLOWUP_LINKS,
  FOLLOWUP_MAX_AGE_DAYS,
  isTestAccountUser,
  planFollowUps,
  renderFollowUpEmail,
  skipReason,
  type FollowUpCandidate,
} from '@/lib/landlord/followUp'

const NOW = new Date('2026-10-15T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const A = '11111111-1111-1111-1111-111111111111'
const S = '99999999-9999-9999-9999-999999999999'

function cand(over: Partial<FollowUpCandidate> = {}): FollowUpCandidate {
  return {
    authId: A,
    email: 'owner@example.com',
    isTest: false,
    firstScreenedAt: daysAgo(5),
    firstScreeningId: S,
    hasLease: false,
    hasHousehold: false,
    sent: [],
    ...over,
  }
}

describe('planFollowUps — six situations', () => {
  it('1 · less than 3 days since the first screening → nothing yet', () => {
    const c = cand({ firstScreenedAt: daysAgo(2) })
    expect(planFollowUps([c], NOW)).toEqual([])
    expect(skipReason(c, NOW)).toBe('too_early')
  })

  it('2 · ≥ 3 days, no lease and no household → d3 with the first screening id', () => {
    const plans = planFollowUps([cand({ firstScreenedAt: daysAgo(3) })], NOW)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ authId: A, email: 'owner@example.com', stage: 'd3', screeningId: S, daysSinceFirstScreening: 3 })
  })

  it('3 · d3 already sent → nothing until day 14', () => {
    const c = cand({ firstScreenedAt: daysAgo(9), sent: ['d3'] })
    expect(planFollowUps([c], NOW)).toEqual([])
    expect(skipReason(c, NOW)).toBe('already_sent')
  })

  it('4 · a lease or a managed tenancy exists → never e-mailed, at any age', () => {
    expect(planFollowUps([cand({ hasLease: true })], NOW)).toEqual([])
    expect(planFollowUps([cand({ firstScreenedAt: daysAgo(20), hasHousehold: true })], NOW)).toEqual([])
    expect(skipReason(cand({ hasLease: true }), NOW)).toBe('has_lease_or_household')
  })

  it('5 · ≥ 14 days with d3 sent → d14; d14 sent → done; ≥ 14 with nothing sent → d14 only (never two in one sweep, never d3 after d14)', () => {
    expect(planFollowUps([cand({ firstScreenedAt: daysAgo(14), sent: ['d3'] })], NOW)[0]?.stage).toBe('d14')
    expect(planFollowUps([cand({ firstScreenedAt: daysAgo(30), sent: ['d3', 'd14'] })], NOW)).toEqual([])
    const late = planFollowUps([cand({ firstScreenedAt: daysAgo(16), sent: [] })], NOW)
    expect(late).toHaveLength(1)
    expect(late[0].stage).toBe('d14')
    // After d14 went out, a later sweep must not fall back to d3.
    expect(planFollowUps([cand({ firstScreenedAt: daysAgo(17), sent: ['d14'] })], NOW)).toEqual([])
  })

  it('6 · test / Muse / reviewer accounts and @stayloop.ai addresses are excluded', () => {
    expect(planFollowUps([cand({ isTest: true })], NOW)).toEqual([])
    expect(isTestAccountUser({ email: 'a@b.com', user_metadata: { test_account: true } })).toBe(true)
    expect(isTestAccountUser({ email: 'a@b.com', user_metadata: { muse_account: true } })).toBe(true)
    expect(isTestAccountUser({ email: 'a@b.com', user_metadata: { reviewer_account: true } })).toBe(true)
    expect(isTestAccountUser({ email: 'landlord-test@stayloop.ai', user_metadata: {} })).toBe(true)
    expect(isTestAccountUser({ email: 'Owner@Example.com', user_metadata: { test_account: false } })).toBe(false)
    expect(isTestAccountUser({ email: '', user_metadata: {} })).toBe(true)
    expect(isTestAccountUser(null)).toBe(true)
  })

  it('one plan per landlord per sweep; no e-mail / no screening are skipped; very old first screenings are not chased', () => {
    const plans = planFollowUps([cand(), cand({ firstScreenedAt: daysAgo(20) })], NOW)
    expect(plans).toHaveLength(1)
    expect(planFollowUps([cand({ email: null })], NOW)).toEqual([])
    expect(planFollowUps([cand({ firstScreenedAt: null })], NOW)).toEqual([])
    const old = cand({ firstScreenedAt: daysAgo(FOLLOWUP_MAX_AGE_DAYS + 1) })
    expect(planFollowUps([old], NOW)).toEqual([])
    expect(skipReason(old, NOW)).toBe('too_old')
    expect(planFollowUps([old], NOW, { maxAgeDays: 400 })[0]?.stage).toBe('d14')
  })
})

describe('renderFollowUpEmail', () => {
  it('both stages list the three links and the "no rent handling" sentence; wording differs between stages', () => {
    for (const stage of ['d3', 'd14'] as const) {
      const m = renderFollowUpEmail(stage, 'both', 'https://www.stayloop.ai')
      for (const path of Object.values(FOLLOWUP_LINKS)) {
        expect(m.html).toContain(`https://www.stayloop.ai${path}`)
        expect(m.text).toContain(`https://www.stayloop.ai${path}`)
      }
      expect(m.text).toMatch(/不经手租金/)
      expect(m.text).toMatch(/never handles rent/)
      expect(m.subject).toMatch(/ \/ /) // bilingual subject
    }
    const d3 = renderFollowUpEmail('d3', 'zh').subject
    const d14 = renderFollowUpEmail('d14', 'zh').subject
    expect(d3).toContain('你的筛查报告之后')
    expect(d14).toContain('还没录入租约')
    expect(d3).not.toBe(d14)
    expect(renderFollowUpEmail('d3', 'en').text).not.toMatch(/[一-鿿]/)
    expect(renderFollowUpEmail('d3', 'zh').text).not.toMatch(/Ontario Standard Lease/)
  })
})

describe('wiring', () => {
  it('the proactive cron calls runLandlordFollowUps after the other sweeps and returns followups {sent, skipped}', () => {
    const src = readFileSync('app/api/agent/proactive/route.ts', 'utf8')
    expect(src).toMatch(/import \{ runLandlordFollowUps \} from '@\/lib\/landlord\/followUp'/)
    const i = src.indexOf('async function runCronSweep')
    const cron = src.slice(i)
    expect(cron.indexOf('runMarketplaceSweep(admin)')).toBeLessThan(cron.indexOf('runLandlordFollowUps(admin)'))
    expect(cron.indexOf('runRenewalSweep()')).toBeLessThan(cron.indexOf('runLandlordFollowUps(admin)'))
    expect(cron).toMatch(/runLandlordFollowUps\(admin\)\.catch\(/)
    expect(cron).toMatch(/\{ \.\.\.body, marketplace, followups(, rent)? \}/)
    expect(cron).toMatch(/sent: 0, skipped: 0/)
  })

  it('the server part sends with sendEmail, stamps landlord_followups only on success, and writes the audit action', () => {
    const src = readFileSync('lib/landlord/followUp.ts', 'utf8')
    expect(src).toMatch(/await sendEmail\(\{ to: p\.email/)
    expect(src).toMatch(/if \(!res\.ok\)[\s\S]*continue \}/)
    expect(src.indexOf("from('landlord_followups').insert(")).toBeGreaterThan(src.indexOf('if (!res.ok)'))
    expect(src).toMatch(/action: FOLLOWUP_ACTION/)
    expect(src).toMatch(/FOLLOWUP_ACTION = 'landlord_followup_emailed'/)
    expect(src).toMatch(/metadata: \{ stage: p\.stage, screening_id: p\.screeningId/)
    expect(src).toMatch(/admin\.auth\.admin\.getUserById\(a\)/)
    expect(src).toMatch(/eq\('status', 'scored'\)/)
  })

  it('migration: service-role-only table with the (landlord, stage) unique constraint', () => {
    const sql = readFileSync('supabase/migrations/20261015_landlord_followups.sql', 'utf8')
    expect(sql).toMatch(/create table if not exists public\.landlord_followups/)
    expect(sql).toMatch(/landlord_auth_id uuid not null/)
    expect(sql).toMatch(/stage\s+text not null check \(stage in \('d3', 'd14'\)\)/)
    expect(sql).toMatch(/sent_at\s+timestamptz/)
    expect(sql).toMatch(/unique \(landlord_auth_id, stage\)/)
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/revoke all on table public\.landlord_followups from public, anon, authenticated/)
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.landlord_followups to service_role/)
    expect(sql).not.toMatch(/create policy/)
  })
})

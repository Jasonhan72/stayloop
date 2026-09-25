// Services marketplace P2 (V0.6): dispatch policy — ranking, auto-dispatch,
// emergency pre-authorisation. No money handling.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePolicy, rankCandidates, rankReason, shouldAutoApprove, shouldAutoDispatch, EMERGENCY_CAP_MAX } from '@/lib/marketplace/dispatchPolicy'

const P = '11111111-1111-1111-1111-111111111111'
const Q = '22222222-2222-2222-2222-222222222222'
const R = '33333333-3333-3333-3333-333333333333'

describe('normalizePolicy', () => {
  it('defaults to suggest with auto-approve off', () => {
    expect(normalizePolicy(null)).toEqual({ mode: 'suggest', emergency_auto_approve: false, emergency_cap: 500, preferred: {} })
  })
  it('clamps the cap, rejects unknown modes and non-uuid preferences', () => {
    const p = normalizePolicy({ mode: 'yolo', emergency_auto_approve: true, emergency_cap: 99999, preferred: { plumbing: P, electrical: 'nope' } })
    expect(p.mode).toBe('suggest')
    expect(p.emergency_cap).toBe(EMERGENCY_CAP_MAX)
    expect(p.preferred).toEqual({ plumbing: P })
    expect(normalizePolicy({ emergency_cap: -5 }).emergency_cap).toBe(0)
    expect(normalizePolicy({ emergency_auto_approve: 'true' }).emergency_auto_approve).toBe(false)
  })
})

describe('rankCandidates', () => {
  const cands = [
    { provider_id: P, name: 'Alpha', rating: 5, reviews: 1 },
    { provider_id: Q, name: 'Bravo', landlordJobsDone: 2 },
    { provider_id: R, name: 'Charlie', rating: 4.2, reviews: 6 },
  ]
  it('preferred beats history beats rating; one review does not count', () => {
    expect(rankCandidates(cands, R).map((c) => c.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])
    expect(rankCandidates(cands, null).map((c) => c.name)).toEqual(['Bravo', 'Charlie', 'Alpha'])
  })
  it('explains the choice', () => {
    expect(rankReason(cands[1], null)).toMatch(/派过 2 单/)
    expect(rankReason(cands[2], R)).toMatch(/首选/)
    expect(rankReason(cands[0], null, false)).toMatch(/credentials valid/)
  })
})

describe('auto-dispatch and pre-authorisation', () => {
  const auto = normalizePolicy({ mode: 'auto_emergency', emergency_auto_approve: true, emergency_cap: 400 })
  it('auto_emergency only sends urgent tickets; nothing without a candidate', () => {
    expect(shouldAutoDispatch(auto, true, 2)).toBe(true)
    expect(shouldAutoDispatch(auto, false, 2)).toBe(false)
    expect(shouldAutoDispatch(auto, true, 0)).toBe(false)
    expect(shouldAutoDispatch(normalizePolicy({ mode: 'auto_all' }), false, 1)).toBe(true)
    expect(shouldAutoDispatch(normalizePolicy(null), true, 3)).toBe(false)
  })
  it('only emergency quotes, > 0 and within the cap', () => {
    expect(shouldAutoApprove(auto, { emergency: true, quote_amount: 400 })).toBe(true)
    expect(shouldAutoApprove(auto, { emergency: true, quote_amount: 401 })).toBe(false)
    expect(shouldAutoApprove(auto, { emergency: true, quote_amount: 0 })).toBe(false)
    expect(shouldAutoApprove(auto, { emergency: false, quote_amount: 50 })).toBe(false)
    expect(shouldAutoApprove(normalizePolicy({ mode: 'auto_all' }), { emergency: true, quote_amount: 50 })).toBe(false)
  })
})

describe('server wiring', () => {
  const server = readFileSync('lib/marketplace/server.ts', 'utf8')
  it('suggestDispatch ranks and may auto-dispatch through createWorkOrder (same eligibility checks)', () => {
    expect(server).toMatch(/rankCandidates\(/)
    expect(server).toMatch(/shouldAutoDispatch\(policy/)
    expect(server).toMatch(/createWorkOrder\(admin, \{[^}]*actor: 'system'/)
  })
  it('emergency pre-authorisation approves through actOnWorkOrder as the row landlord and skips the card', () => {
    expect(server).toMatch(/shouldAutoApprove\(policy, wo\)/)
    expect(server).toMatch(/action: 'approve_quote', by: 'landlord', actorId: wo\.landlord_auth_id/)
  })
  it('never moves money: payment_mode stays offline', () => {
    expect(server).not.toMatch(/payment_mode: 'connect'/)
  })
})

describe('Pro gate on the curated network', () => {
  const server = readFileSync('lib/marketplace/server.ts', 'utf8')
  it('network dispatch needs Pro/Team or the test window; own contacts stay free', () => {
    expect(server).toMatch(/if \(i\.providerId && !\(await networkDispatchAllowed\(admin, i\.landlordAuthId\)\)\) return \{ ok: false, error: 'pro_required', status: 402 \}/)
    expect(server).toMatch(/inInternalTestWindow\(\)\) return true/)
    expect(server).toMatch(/if \(network\) for \(const p of/)
  })
  it('pricing page says so, and that Stayloop takes no commission', () => {
    const pricing = readFileSync('app/pricing/page.tsx', 'utf8')
    expect(pricing).toContain('维修工单 + 派给你自己的联系人')
    expect(pricing).toMatch(/已核验服务商网络 \+ 派单策略[^']*不抽成/)
  })
})

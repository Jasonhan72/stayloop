// 2026-10-06 (V0.7) — renewal touchpoints and the tenancy hub outside Ontario.
// The 90 / 60 / 30 planner, the renewal-letter executor, the lifecycle rail,
// the re-list card and /h/[id] all spoke Ontario (guideline A/B, N1, N9, s.38,
// s.58, the repayment draft) to every lease. A lease in another province now
// gets that province's own timing and sentences (lib/provinces/renewal, built
// only from the verified facts in lib/provinces/rules) — and Ontario's path is
// byte-for-byte what it was.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PROVINCE_RULES } from '../lib/provinces/rules'
import {
  MAX_RENEWAL_WINDOW_DAYS, leaseEndFact, provinceNoticeDeadline, provinceNoticeEarliest, provinceTouchpoint, provinceWindowDays, renewalTiming,
} from '../lib/provinces/renewal'
import { leaseProvince, unitTermsOf } from '../lib/provinces/lease'
import {
  SCAN_WINDOW_DAYS, buildIntentAskProposal, buildProvinceNoticeProposal, isOntarioLease, planRenewalActions, provinceStageForDays, type RenewalLease,
} from '../lib/agent/renewalStages'
import { buildRelistProposal } from '../lib/agent/proactiveExtras'
import { landlordLifecycle, tenantLifecycle, type LandlordFacts, type TenantFacts } from '../lib/lifecycle/stages'
import { MOVE_IN_ITEMS, moveInItemsFor, moveInProgress } from '../lib/household/moveIn'
import type { NonOntarioCode } from '../lib/provinces/detect'

const read = (p: string) => readFileSync(p, 'utf8')
const CODES = Object.keys(PROVINCE_RULES) as NonOntarioCode[]
const ONTARIO_WORDS = /\bRTA\b|\bLTB\b|OHRC|RECO|TRESA|Ontario|安省|安大略|\bN1\b|\bN9\b|s\.38|指导上限/
const TODAY = new Date('2027-02-01T12:00:00Z')

const lease = (over: Partial<RenewalLease> & { end_date: string }): RenewalLease => ({
  id: '11111111-1111-4111-8111-111111111111', household_id: 'hh-1', landlord_id: 'll-1', listing_id: null,
  tenant_name: 'Mia Chen', tenant_email: 'mia@example.com', unit_label: 'Apt 4, 1569 rue St-Hubert', monthly_rent: 1500, start_date: '2026-07-01', ...over,
})

describe('timing numbers are read out of the verified facts', () => {
  const NUM: Record<number, string> = { 2: '(2|两|二)', 3: '(3|三)', 4: '(4|四)', 6: '(6|六)' }
  it('every noticeMonths / earliestMonths appears as "N 个月" in that province\'s rentIncrease or leaseEnd fact', () => {
    for (const code of CODES) {
      const t = renewalTiming(code)!
      const facts = PROVINCE_RULES[code].rentIncrease.zh + PROVINCE_RULES[code].leaseEnd.zh
      for (const n of [t.noticeMonths, t.earliestMonths]) {
        if (n == null) continue
        // 「3–6 个月」 (Quebec's window) counts for 3 as well as 6.
        expect(facts, `${code} ${n} 个月`).toMatch(new RegExp(`${NUM[n]}([–-]\\d)?\\s*个(整)?月`))
      }
      if (t.step) for (const name of t.step.zh.match(/RTB-7|Form 1A|Form 8/g) ?? []) expect(facts, `${code} ${name}`).toContain(name)
    }
  })
  it('Alberta records no landlord step before a fixed term ends; Quebec has a six-month earliest date; Ontario is null everywhere', () => {
    expect(renewalTiming('AB')).toMatchObject({ step: null, noticeMonths: null })
    expect(renewalTiming('QC')).toMatchObject({ noticeMonths: 3, earliestMonths: 6 })
    expect(renewalTiming('ON')).toBeNull()
    expect(renewalTiming(null)).toBeNull()
    expect(provinceTouchpoint('ON', '2027-06-30', 'zh')).toBeNull()
    expect(leaseEndFact('ON', 'zh')).toBeNull()
    expect(provinceWindowDays('ON')).toBe(120)
  })
  it('deadlines are calendar months before the day after the term ends', () => {
    expect(provinceNoticeDeadline('QC', '2027-06-30')).toBe('2027-04-01')
    expect(provinceNoticeEarliest('QC', '2027-06-30')).toBe('2027-01-01')
    expect(provinceNoticeDeadline('NB', '2027-01-31')).toBe('2026-08-01')
    expect(provinceNoticeDeadline('SK', '2027-03-31')).toBe('2027-02-01')
    expect(provinceNoticeDeadline('AB', '2027-06-30')).toBeNull()
    expect(provinceNoticeDeadline('BC', '2027-02-27')).toBe('2026-11-28')
    // Jan 31 − 1 month → Dec 31 (clamped, never Dec 31 + overflow)
    expect(provinceNoticeDeadline('PE', '2027-04-30')).toBe('2027-02-01')
  })
  it('the scan horizon reaches the widest provincial window (Quebec six months, NB / NL six-month notices)', () => {
    expect(provinceWindowDays('QC')).toBe(186)
    expect(provinceWindowDays('NB')).toBe(216)
    expect(provinceWindowDays('BC')).toBe(123)
    expect(provinceWindowDays('AB')).toBe(120)
    expect(MAX_RENEWAL_WINDOW_DAYS).toBe(216)
    expect(SCAN_WINDOW_DAYS).toBe(MAX_RENEWAL_WINDOW_DAYS)
    expect(provinceStageForDays('QC', 150)).toBe('notice')
    expect(provinceStageForDays('QC', 200)).toBeNull()
    expect(provinceStageForDays('QC', 20)).toBe('30d')
    expect(provinceStageForDays('BC', 100)).toBe('notice')
    expect(provinceStageForDays('BC', 124)).toBeNull()
  })
})

describe('which province a lease follows', () => {
  it('the linked listing wins; else the household address; else the lease\'s own §2 block; empty = Ontario', () => {
    expect(leaseProvince({ listing: { province: 'ON', postal_code: 'H2L 3Z1' }, household: { address: '1 King St W, Toronto' } })).toBe('QC')
    expect(leaseProvince({ household: { address: '1569 rue St-Hubert', city: 'Montréal' } })).toBe('QC')
    expect(leaseProvince({ unit: { street: '12 Main St', city: 'Halifax', postal: 'B3H 1A1' } })).toBe('NS')
    expect(leaseProvince({ unit_label: 'Unit 1207, 1 King St W, Toronto ON' })).toBe('ON')
    expect(leaseProvince({})).toBe('ON')
    expect(leaseProvince(null)).toBe('ON')
    expect(unitTermsOf({ unit: { street: 'a', city: 'b', postal: 'c', extra: 1 } })).toEqual({ street: 'a', city: 'b', postal: 'c' })
    expect(unitTermsOf({})).toBeNull()
    expect(unitTermsOf(null)).toBeNull()
    expect(isOntarioLease({})).toBe(true)
    expect(isOntarioLease({ province: 'ON' })).toBe(true)
    expect(isOntarioLease({ province: 'QC' })).toBe(false)
  })
})

describe('the planner outside Ontario', () => {
  it('a Quebec lease 150 days out gets ONE notice card — no renewal letter, no N1, the TAL named', () => {
    const l = lease({ province: 'QC', end_date: '2027-07-01' })
    const out = planRenewalActions('u1', [l], [], TODAY, { period: '2026 Q4', avg_by_bed: { 1: 2400 } })
    expect(out).toHaveLength(1)
    expect(out[0].action_type).toBe('renewal_checkpoint')
    expect(out[0].metadata).toMatchObject({ lease_id: l.id, stage: 'notice', province: 'QC', notice_deadline: '2027-04-02', notice_earliest: '2027-01-02' })
    expect(out[0].title).toContain('魁北克省')
    expect(out[0].summary).toContain('书面修改通知（涨租或改条款）最晚 2027-04-02 送达（到期前 3 个月），最早 2027-01-02。')
    expect(out[0].summary).toContain('距最晚送达日还有 60 天')
    expect(out[0].summary).toContain('住房行政法庭（TAL）')
    expect(out[0].summary).toContain('Stayloop 不代发魁北克省的法定通知')
    expect(out[0].summary).not.toContain('TRREB')
    expect(out[0].title + out[0].summary).not.toMatch(ONTARIO_WORDS)
  })
  it('idempotent by (lease, notice); the 30-day ask follows and quotes the province\'s end-of-term fact', () => {
    const l = lease({ province: 'QC', end_date: '2027-07-01' })
    const existing = [{ action_type: 'renewal_checkpoint', status: 'approved', metadata: { lease_id: l.id, stage: 'notice' } }]
    expect(planRenewalActions('u1', [l], existing, TODAY)).toEqual([])
    const late = new Date('2027-06-11T12:00:00Z')
    const out = planRenewalActions('u1', [l], existing, late)
    expect(out).toHaveLength(1)
    expect(out[0].action_type).toBe('send_message')
    expect(out[0].metadata).toMatchObject({ stage: '30d', province: 'QC', to_email: 'mia@example.com' })
    const body = String(out[0].metadata.body)
    expect(body).toContain(PROVINCE_RULES.QC.leaseEnd.zh)
    expect(body).toContain(PROVINCE_RULES.QC.leaseEnd.en)
    expect(body).toContain('/h/hh-1?intent=renew')
    expect(body).not.toMatch(ONTARIO_WORDS)
    expect(body).not.toContain('此前已把续约方案发给您')
    expect(out[0].summary).toContain('还没有收到租客的意向')
  })
  it('no tenant email → a 30-day checkpoint in the province\'s words; a recorded "renew" → nothing', () => {
    const l = lease({ province: 'BC', end_date: '2027-02-20', tenant_email: null })
    const existing = [{ action_type: 'renewal_checkpoint', status: 'approved', metadata: { lease_id: l.id, stage: 'notice' } }]
    const out = planRenewalActions('u1', [l], existing, TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].action_type).toBe('renewal_checkpoint')
    expect(out[0].metadata).toMatchObject({ stage: '30d', province: 'BC' })
    expect(out[0].summary).toContain(PROVINCE_RULES.BC.leaseEnd.zh)
    expect(out[0].summary).toContain('没有租客邮箱')
    expect(out[0].summary).not.toMatch(ONTARIO_WORDS)
    const renewed = planRenewalActions('u1', [l], existing, TODAY, null, { intents: [{ lease_id: l.id, household_id: null, intent: 'renew', created_at: '2027-01-20T00:00:00Z' }] })
    expect(renewed).toEqual([])
  })
  it('a provincial lease that enters the scan in its last month skips the moot notice card and gets the 30-day ask', () => {
    const l = lease({ province: 'BC', end_date: '2027-02-20' })
    const out = planRenewalActions('u1', [l], [], TODAY)
    expect(out).toHaveLength(1)
    expect(out[0].action_type).toBe('send_message')
    expect(out[0].metadata).toMatchObject({ stage: '30d', province: 'BC' })
    // and the Ontario late entry still gets its letter first (unchanged)
    const on = planRenewalActions('u1', [lease({ end_date: '2027-02-20' })], [], TODAY)
    expect(on[0].action_type).toBe('send_renewal_letter')
  })
  it('Alberta: the notice card says no landlord step is required before the term ends', () => {
    const l = lease({ province: 'AB', end_date: '2027-05-15' })
    const p = buildProvinceNoticeProposal('u1', l, TODAY)
    expect(p.summary).toContain('到期前没有房东必须送达的通知')
    expect(p.metadata).toMatchObject({ notice_deadline: null, notice_earliest: null, province: 'AB' })
    expect(p.summary).not.toMatch(ONTARIO_WORDS)
  })
  it('never a 60-day N1 checkpoint outside Ontario, whatever the day count', () => {
    for (const code of CODES) {
      const l = lease({ province: code, end_date: '2027-03-20' })
      const existing = [{ action_type: 'renewal_checkpoint', status: 'approved', metadata: { lease_id: l.id, stage: 'notice' } }]
      const out = planRenewalActions('u1', [l], existing, TODAY)
      expect(out.map((o) => o.metadata.stage)).not.toContain('60d')
      expect(out.map((o) => o.action_type)).not.toContain('send_renewal_letter')
    }
  })
  it('an Ontario lease plans exactly as before — with or without the province field', () => {
    const on1 = lease({ end_date: '2027-05-01' })
    const on2 = lease({ end_date: '2027-05-01', province: 'ON' })
    const a = planRenewalActions('u1', [on1], [], TODAY, { period: '2026 Q4', avg_by_bed: { 1: 2400 } })
    const b = planRenewalActions('u1', [on2], [], TODAY, { period: '2026 Q4', avg_by_bed: { 1: 2400 } })
    expect(a).toHaveLength(1)
    expect(a[0].action_type).toBe('send_renewal_letter')
    expect(a[0].summary).toContain('指导上限')
    expect(b).toEqual(a)
    const ask = buildIntentAskProposal('u1', on1, new Date('2027-04-10T00:00:00Z'))
    expect(String(ask.metadata.body)).toContain('N9')
    expect(ask.metadata).not.toHaveProperty('province')
  })
  it('the re-list card\'s "if the tenant stays" sentence is the province\'s', () => {
    const on = buildRelistProposal('u1', { id: 'l1', tenant_name: 'Mia', unit_label: 'Apt 4', end_date: '2027-01-20', status: 'ended' }, TODAY)
    expect(on.summary).toContain('RTA s.38')
    const qc = buildRelistProposal('u1', { id: 'l1', tenant_name: 'Mia', unit_label: 'Apt 4', end_date: '2027-01-20', status: 'ended', province: 'QC' }, TODAY)
    expect(qc.summary).toContain(`如果租客继续住：${PROVINCE_RULES.QC.leaseEnd.zh}`)
    expect(qc.summary).not.toMatch(ONTARIO_WORDS)
  })
  it('no Ontario words in anything a provincial card or ask can say, in either language', () => {
    const strings: string[] = []
    for (const code of CODES) {
      const l = lease({ province: code, end_date: '2027-05-01' })
      const p = buildProvinceNoticeProposal('u1', l, TODAY)
      strings.push(p.title, p.summary)
      const ask = buildIntentAskProposal('u1', l, TODAY)
      strings.push(ask.summary, String(ask.metadata.body))
      for (const lang of ['zh', 'en'] as const) {
        const t = provinceTouchpoint(code, '2027-05-01', lang)!
        strings.push(t.stepLine, t.rentIncrease, t.leaseEnd, t.tribunal.name)
      }
    }
    expect(strings.length).toBeGreaterThan(90)
    for (const s of strings) expect(s, s.slice(0, 100)).not.toMatch(ONTARIO_WORDS)
  })
})

describe('the lifecycle rail outside Ontario', () => {
  const base: LandlordFacts = { listings: [], showingsPending: 0, applications: [], screenings: [], leases: [], households: [], rent: [], tickets: [], renewalCards: [] }
  const qcLease = { id: 'L1', status: 'active', start_date: '2026-07-01', end_date: '2027-05-01', unit_label: 'Apt 4', tenant_email: 't@example.com', listing_place: { province: 'QC', address: '1569 rue St-Hubert', city: 'Montréal', postal_code: 'H2L 3Z1' } }
  it('landlord: a Quebec lease in the window — provincial headline, touchpoint step, no N1', () => {
    const lc = landlordLifecycle({ ...base, leases: [qcLease] }, TODAY)
    const post = lc.phases.find((p) => p.key === 'post')!
    expect(post.headline!.zh).toContain('魁北克省')
    expect(post.headline!.zh).toContain('书面修改通知（涨租或改条款）最晚 2027-02-02 送达')
    expect(post.headline!.en).toContain('Quebec')
    expect(post.headline!.zh + post.headline!.en).not.toMatch(ONTARIO_WORDS)
    const letter = post.steps.find((s) => s.key === 'letter')!
    expect(letter.label.zh).toBe('续约触点（按该省规则）')
    expect(letter.state).toBe('current')
    const withCard = landlordLifecycle({ ...base, leases: [qcLease], renewalCards: [{ action_type: 'renewal_checkpoint', status: 'pending', lease_id: 'L1', stage: 'notice' }] }, TODAY)
    const p2 = withCard.phases.find((p) => p.key === 'post')!
    expect(p2.steps.find((s) => s.key === 'letter')!.state).toBe('done')
    expect(p2.next).toMatchObject({ href: '/landlord/todo' })
    expect(p2.next!.label.zh).toBe('查看续约触点')
  })
  it('the rail\'s window is the province\'s: a Quebec lease 170 days out is in it, an Ontario one is not', () => {
    const far = { ...qcLease, end_date: '2027-07-21' }
    const qc = landlordLifecycle({ ...base, leases: [far] }, TODAY).phases.find((p) => p.key === 'post')!
    expect(qc.steps.find((s) => s.key === 'window')!.detail!.zh).toBe('1 份进入续约窗口')
    expect(qc.headline!.zh).toContain('魁北克省')
    const on = landlordLifecycle({ ...base, leases: [{ ...far, listing_place: { province: 'ON', address: '1 King St W', city: 'Toronto', postal_code: 'M5H 1A1' } }] }, TODAY).phases.find((p) => p.key === 'post')!
    expect(on.steps.find((s) => s.key === 'window')!.detail).toBeUndefined()
  })
  it('landlord: an Ontario lease keeps the N1 headline and the A/B letter step', () => {
    const on = { ...qcLease, listing_place: { province: 'ON', address: '1 King St W', city: 'Toronto', postal_code: 'M5H 1A1' } }
    const lc = landlordLifecycle({ ...base, leases: [on] }, TODAY)
    const post = lc.phases.find((p) => p.key === 'post')!
    expect(post.headline!.zh).toContain('涨租 N1 最晚 2027-02-01')
    expect(post.steps.find((s) => s.key === 'letter')!.label.zh).toBe('续约函 A/B')
  })
  it('tenant: the move-out step is the province\'s rule and links to its tribunal; Ontario keeps the N9', () => {
    const tb: TenantFacts = { showings: [], applications: [], leases: [], households: [], memberOf: [], rent: [], tickets: [], passportShares: 0 }
    const hh = { id: 'H1', current_lease_id: 'L1', verified: true, status: 'active', end_date: '2027-05-01', address: '1569 rue St-Hubert', city: 'Montréal' }
    const lc = tenantLifecycle({ ...tb, leases: [{ ...qcLease, listing_place: null }], households: [hh], memberOf: ['H1'] }, TODAY)
    const post = lc.phases.find((p) => p.key === 'post')!
    const step = post.steps.find((s) => s.key === 'notice')!
    expect(step.href).toBe('https://www.tal.gouv.qc.ca/en')
    expect(step.detail!.zh).toContain('魁北克省')
    expect(post.steps.some((s) => s.key === 'n9')).toBe(false)
    expect(post.headline!.zh).toContain('按魁北克省规则')
    expect(post.headline!.zh + post.headline!.en).not.toMatch(ONTARIO_WORDS)
    const on = tenantLifecycle({ ...tb, leases: [{ ...qcLease, listing_place: null, unit_label: 'Unit 1207, 1 King St W' }], households: [{ ...hh, address: '1 King St W', city: 'Toronto' }], memberOf: ['H1'] }, TODAY)
    const onPost = on.phases.find((p) => p.key === 'post')!
    expect(onPost.steps.some((s) => s.key === 'n9')).toBe(true)
    expect(onPost.headline!.zh).toContain('N9')
  })
})

describe('the move-in checklist outside Ontario', () => {
  it('Quebec: no deposit item, lease copy within 10 days, no Ontario sentence; Ontario unchanged', () => {
    const qc = moveInItemsFor('QC')
    expect(qc.some((i) => i.key === 'deposit_receipt')).toBe(false)
    expect(qc.find((i) => i.key === 'lease_copy')!.note!.zh).toContain('10 天内')
    expect(qc.find((i) => i.key === 'insurance')!.note!.zh).not.toContain('安省')
    for (const i of qc) for (const s of [i.label.zh, i.label.en, i.note?.zh, i.note?.en]) if (s) expect(s).not.toMatch(ONTARIO_WORDS)
    expect(moveInProgress([{ item_key: 'lease_copy', done: true }], qc)).toEqual({ done: 1, total: 12 })
    const bc = moveInItemsFor('BC')
    expect(bc.find((i) => i.key === 'deposit_receipt')!.note!.zh).toBe(PROVINCE_RULES.BC.deposit.zh)
    expect(moveInItemsFor('ON')).toBe(MOVE_IN_ITEMS)
    expect(moveInItemsFor(null)).toBe(MOVE_IN_ITEMS)
    expect(MOVE_IN_ITEMS.find((i) => i.key === 'deposit_receipt')!.note!.zh).toContain('RTA s.106')
  })
})

describe('wiring', () => {
  it('both proactive paths stamp each lease with its province and scan the widest window', () => {
    const src = read('app/api/agent/proactive/route.ts')
    expect(src).not.toMatch(/\bWINDOW_DAYS \* 86_400_000/)
    expect(src.match(/SCAN_WINDOW_DAYS \* 86_400_000/g)).toHaveLength(2)
    expect(src.match(/await attachPlaces\(/g)!.length).toBeGreaterThanOrEqual(3)
    expect(src).toContain("unit_place:terms->unit")
    expect(src).toContain("from('listings').select('id, province, address, city, postal_code')")
  })
  it('the Ontario renewal letter is never sent for a lease elsewhere (card retired with a reason the client can explain)', () => {
    const src = read('app/api/agent/execute/route.ts')
    const guard = src.indexOf("reason: 'province_unsupported'")
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(src.indexOf('const blocked = await renewalBlocker(admin, lease, today)'))
    expect(src).toContain('async function ownedLeaseProvince(')
    expect(read('lib/agent/chatCopy.ts')).toContain('province_unsupported:')
  })
  it('the facts RPCs return listing_place and unit_place on every lease row', () => {
    const sql = read('supabase/migrations/20261006_facts_lease_place.sql')
    expect(sql.match(/as listing_place/g)).toHaveLength(2)
    expect(sql.match(/as unit_place/g)).toHaveLength(2)
    expect(sql).toContain('security invoker')
    expect(sql).not.toContain('security definer')
  })
  it('the hub shows s.38 / s.58 / the repayment draft only for an Ontario tenancy', () => {
    const src = read('app/h/[id]/page.tsx')
    expect(src).toContain("const province = leaseProvince({ listing: leasePlace.listing ?? null, household: { address: household.address, city: household.city }, unit: leasePlace.unit ?? null })")
    expect(src).toContain("select('start_date, listing_id, unit_place:terms->unit')")
    expect(src).toContain('const lateness = ontario ? persistentLatePayment(')
    expect(src).toContain('{lateness && lateness.late.length > 0 && (')
    expect(src.match(/\{ontario && myRole === 'landlord' && /g)).toHaveLength(2)
    expect(src).toContain("leaseEndFact(province, 'zh')")
    expect(src).toContain('province={province}')
  })
  it('the lease page, the planner and the executor share lib/provinces/lease', () => {
    for (const p of ['app/landlord/leases/[id]/page.tsx', 'app/api/agent/proactive/route.ts', 'app/api/agent/execute/route.ts', 'lib/lifecycle/stages.ts', 'app/tenant/move-in/page.tsx']) {
      expect(read(p), p).toContain("from '@/lib/provinces/lease'")
    }
  })
})

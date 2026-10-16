// V1.0 stage 2 · 乙 #10 (tenant-side N1 check + move-out tools) and 乙 #11
// (a letter / repair still goes out when no managed tenancy names the landlord:
// the tenant's own recorded landlord email). design/v1-scope-and-roadmap-2026-10.md.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkN1 } from '../lib/tenant/n1Check'
import { MOVE_OUT_ITEMS, depositInterest, moveOutProgress, n9Timing } from '../lib/tenant/moveOut'
import { INTAKES, composeIntake, withStepCount } from '../lib/agent/intake'
import { executionReasonText } from '../lib/agent/chatCopy'
import { RENT_GUIDELINE } from '../lib/ontario/rules'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')

describe('checkN1 — checks and cites, never rules a notice void', () => {
  it('compliant: within the guideline of the effective year, ≥ 90 days, 12 months elapsed', () => {
    const r = checkN1({ currentRent: 2000, newRent: 2042, servedDate: '2026-05-01', effectiveDate: '2026-09-01', lastIncreaseDate: '2025-09-01' })!
    expect(r.pct).toBe(2.1)
    expect(r.guidelineYear).toBe(2026)
    expect(r.guideline).toBe(RENT_GUIDELINE[2026])
    expect(r.overGuideline).toBe(false)
    expect(r.noticeShort).toBe(false)
    expect(r.within12Months).toBe(false)
    expect(r.published).toBe(true)
    expect(r.findings.map((f) => f.code)).toEqual(['within_guideline', 'notice_ok', 'twelve_months_ok'])
    expect(r.findings.every((f) => f.tone === 'ok')).toBe(true)
    for (const f of r.findings) { expect(f.statute).toMatch(/^RTA s\./); expect(f.message.zh).toBeTruthy(); expect(f.message.en).toBeTruthy() }
  })
  it('over the guideline: a "check" finding that names the AGI and the 2018-11-15 exemption — no「无效」verdict', () => {
    const r = checkN1({ currentRent: 2000, newRent: 2100, servedDate: '2026-05-01', effectiveDate: '2026-09-01' })!
    expect(r.pct).toBe(5)
    expect(r.overGuideline).toBe(true)
    const f = r.findings.find((x) => x.code === 'over_guideline')!
    expect(f.tone).toBe('check')
    expect(f.message.zh).toContain('超过')
    expect(f.message.zh).toContain('AGI')
    expect(f.message.zh).toContain('2018-11-15')
    expect(f.message.en).toMatch(/above the 2026 guideline/)
    const all = r.findings.map((x) => x.message.zh + x.message.en).join(' ')
    expect(all).not.toMatch(/无效|不合法|违法|\binvalid\b|\bvoid\b|\billegal\b/)
    expect(r.links.ltb).toMatch(/^https:\/\/tribunalsontario\.ca/)
    expect(r.links.rules).toBe('/rules')
  })
  it('notice shorter than 90 days: cites s.116 with the day count and the latest service date', () => {
    const r = checkN1({ currentRent: 2000, newRent: 2042, servedDate: '2026-07-01', effectiveDate: '2026-09-01' })!
    expect(r.noticeDays).toBe(62)
    expect(r.noticeShort).toBe(true)
    expect(r.n1Deadline).toBe('2026-06-03')
    const f = r.findings.find((x) => x.code === 'notice_short')!
    expect(f.statute).toContain('s.116')
    expect(f.message.zh).toContain('通知期不足 90 天')
    expect(f.message.zh).toContain('2026-06-03')
  })
  it('a second increase within 12 months: s.119 with the earliest lawful effective date', () => {
    const r = checkN1({ currentRent: 2000, newRent: 2042, servedDate: '2026-02-01', effectiveDate: '2026-06-01', lastIncreaseDate: '2025-09-01' })!
    expect(r.within12Months).toBe(true)
    expect(r.earliestBy12Months).toBe('2026-09-01')
    const f = r.findings.find((x) => x.code === 'within_12_months')!
    expect(f.statute).toContain('s.119')
    expect(f.message.en).toContain('2026-09-01')
  })
  it('an effective year the province has not published: the latest figure is used and the result says so', () => {
    const r = checkN1({ currentRent: 2000, newRent: 2030, servedDate: '2029-09-01', effectiveDate: '2030-01-01' })!
    expect(r.published).toBe(false)
    expect(r.guidelineYear).toBe(2030)
    const latest = Math.max(...Object.keys(RENT_GUIDELINE).map(Number))
    expect(r.guideline).toBe(RENT_GUIDELINE[latest])
    expect(r.findings.some((x) => x.code === 'guideline_unpublished' && x.tone === 'info')).toBe(true)
  })
  it('refuses unreadable input instead of guessing', () => {
    expect(checkN1({ currentRent: 0, newRent: 10, servedDate: '2026-01-01', effectiveDate: '2026-05-01' })).toBeNull()
    expect(checkN1({ currentRent: 2000, newRent: 2042, servedDate: 'not a date', effectiveDate: '2026-05-01' })).toBeNull()
  })
})

describe('n9Timing — RTA s.44 / s.47', () => {
  it('fixed term with ≥ 60 days left: the term’s last day, notice due 60 days before it', () => {
    const r = n9Timing({ leaseEndDate: '2027-05-31', termType: 'fixed', today: '2026-10-16' })!
    expect(r.earliest).toBe('2027-05-31')
    expect(r.basis).toBe('term_end')
    expect(r.serveBy).toBe('2027-04-01')
    expect(r.afterTermEnd).toBe(false)
    expect(r.noticeDays).toBe(60)
  })
  it('fixed term with < 60 days left: the tenancy runs monthly (s.38) and the date is the next period end', () => {
    const r = n9Timing({ leaseEndDate: '2026-11-30', termType: 'fixed', today: '2026-10-16' })!
    expect(r.basis).toBe('period_end')
    expect(r.afterTermEnd).toBe(true)
    expect(r.earliest).toBe('2026-12-30')
    expect(r.serveBy).toBe('2026-10-31')
    expect(r.notes.some((n) => n.statute.includes('s.38'))).toBe(true)
  })
  it('monthly, periods ending on the last day of the month', () => {
    const r = n9Timing({ leaseEndDate: '2025-05-31', termType: 'monthly', today: '2026-10-16' })!
    expect(r.periodEndDay).toBe(31)
    expect(r.earliest).toBe('2026-12-31')
    expect(r.serveBy).toBe('2026-11-01')
  })
  it('monthly, periods ending mid-month: 60 days lands past the 14th, so the following 14th', () => {
    const r = n9Timing({ leaseEndDate: '2025-05-14', termType: 'monthly', today: '2026-10-16' })!
    expect(r.earliest).toBe('2027-01-14')
    expect(r.serveBy).toBe('2026-11-15')
  })
})

describe('depositInterest — s.106(6) · (9) · (10)', () => {
  it('two anniversaries across two guideline years, at the guideline in effect on each due date', () => {
    const r = depositInterest({ deposit: 2000, paidOn: '2024-06-01', today: '2026-10-16' })!
    expect(r.rows.map((x) => [x.dueOn, x.pct, x.amount])).toEqual([
      ['2025-06-01', RENT_GUIDELINE[2025], 50],
      ['2026-06-01', RENT_GUIDELINE[2026], 42],
    ])
    expect(r.total).toBe(92)
    expect(r.accrued).not.toBeNull()
    expect(r.accrued!.nextDueOn).toBe('2027-06-01')
    expect(r.accrued!.pct).toBe(RENT_GUIDELINE[2027])
    expect(r.accrued!.amount).toBeGreaterThan(0)
    expect(r.accrued!.amount).toBeLessThan(38)
    const statutes = r.notes.map((n) => n.statute)
    expect(statutes).toEqual(['RTA s.106(6)', 'RTA s.106(9)', 'RTA s.106(10)'])
    // legal-check list 3: deduct from a SUBSEQUENT payment, not only the last month
    expect(r.notes[1].text.zh).toContain('随后任何一期')
    expect(r.notes[1].text.zh).toContain('不限于最后一个月')
  })
  it('under a year: no row due yet', () => {
    const r = depositInterest({ deposit: 1500, paidOn: '2026-03-01', today: '2026-10-16' })!
    expect(r.rows).toEqual([])
    expect(r.total).toBe(0)
  })
  it('move-out checklist: the six items the plan names, grouped, with the s.106 facts', () => {
    const keys = MOVE_OUT_ITEMS.map((i) => i.key)
    for (const k of ['n9_copy', 'deposit_interest', 'photos_out', 'keys_return', 'address_change', 'utilities_cancel']) expect(keys).toContain(k)
    expect(new Set(keys).size).toBe(keys.length)
    for (const i of MOVE_OUT_ITEMS) { expect(i.label.zh).toBeTruthy(); expect(i.label.en).toBeTruthy(); expect(['notice', 'money', 'handover']).toContain(i.group) }
    expect(MOVE_OUT_ITEMS.find((i) => i.key === 'deposit_interest')!.note!.zh).toContain('s.106(9)')
    expect(moveOutProgress(['n9_copy', 'nope'])).toEqual({ done: 1, total: MOVE_OUT_ITEMS.length })
  })
})

describe('tenant lease page carries the two tools; move-in links to them', () => {
  it('app/tenant/lease/page.tsx renders N1CheckCard and MoveOutTools above the sample lease', () => {
    const src = read('app/tenant/lease/page.tsx')
    expect(src).toContain("import N1CheckCard from '@/components/tenant/N1CheckCard'")
    expect(src).toContain("import MoveOutTools from '@/components/tenant/MoveOutTools'")
    const n1 = src.indexOf('<N1CheckCard />')
    const mo = src.indexOf('<MoveOutTools />')
    const header = src.indexOf('<PageHeader')
    expect(n1).toBeGreaterThan(0)
    expect(mo).toBeGreaterThan(n1)
    expect(header).toBeGreaterThan(mo)
  })
  it('the components are real tools (no model, no DB) with the anchors the links use', () => {
    const n1 = read('components/tenant/N1CheckCard.tsx')
    expect(n1).toContain('id="n1-check"')
    expect(n1).toContain("from '@/lib/tenant/n1Check'")
    expect(n1).not.toMatch(/supabase|fetch\(/)
    const mo = read('components/tenant/MoveOutTools.tsx')
    expect(mo).toContain('id="move-out"')
    expect(mo).toContain("from '@/lib/tenant/moveOut'")
    expect(mo).not.toMatch(/supabase|fetch\(/)
    for (const f of [n1, mo]) expect(f).not.toMatch(/助手|管家/)
  })
  it('/tenant/move-in ends with a link to /tenant/lease#move-out', () => {
    expect(read('app/tenant/move-in/page.tsx')).toContain('href="/tenant/lease#move-out"')
  })
})

describe('乙 #11 — no managed tenancy: the tenant’s recorded landlord email', () => {
  const route = read('app/api/agent/execute/route.ts')
  it('the execute route reads tenant_landlord_contacts before it gives up with no_landlord_on_file / no_household_on_file', () => {
    const contacts = route.indexOf("from('tenant_landlord_contacts')")
    expect(contacts).toBeGreaterThan(0)
    // the send_message fallback runs resolveLandlordContact before the 422
    const sendBlock = route.slice(route.indexOf('async function executeSendMessage('))
    expect(sendBlock.indexOf('resolveLandlordContact(')).toBeLessThan(sendBlock.indexOf("reason: action.role === 'tenant' ? 'no_landlord_on_file'"))
    const maint = route.slice(route.indexOf('async function executeMaintenanceRequest('), route.indexOf('const OPEN_WORK_ORDER'))
    expect(maint.indexOf('resolveLandlordContact(')).toBeLessThan(maint.indexOf("reason: 'no_household_on_file'"))
    // the address is saved for next time, and only an address the tenant gave is used
    expect(route).toContain("upsert({ tenant_auth_id: userId, landlord_email: email")
    expect(route).toContain("{ onConflict: 'tenant_auth_id' }")
  })
  it('the letter says it was sent by the tenant through Stayloop and does not claim a relay that does not exist', () => {
    expect(route).toContain('经 Stayloop 发出')
    expect(route).toContain('回复此邮件不会转给租客')
    expect(route).toMatch(/fromName: label \? `\$\{label\} 经 Stayloop` : '租客 经 Stayloop'/)
  })
  it('the intake line「房东邮箱：…」is what the route’s label regex reads', () => {
    const m = /const LANDLORD_EMAIL_LABEL_RE = \/(.+)\/([a-z]*)\n/.exec(route)!
    const re = new RegExp(m[1], m[2])
    const zh = composeIntake(INTAKES.repair, { where: { picks: ['kitchen'], text: '' }, what: { picks: ['clog'], text: '' }, since: { picks: ['today'], text: '' }, urgency: { picks: ['can_wait'], text: '' }, entry: { picks: ['call_first'], text: '' }, landlord_email: { picks: [], text: ' Owner@Example.ca ' } }, 'zh', 0)
    expect(zh).toContain('房东邮箱：Owner@Example.ca')
    expect(re.exec(zh)?.[1]).toBe('Owner@Example.ca')
    const en = composeIntake(INTAKES.contact_landlord, { topic: { picks: ['deposit'], text: '' }, message: { picks: [], text: 'Please pay the deposit interest due June 1.' }, landlord_email: { picks: [], text: 'owner@example.ca' } }, 'en', 0)
    expect(en).toContain("Landlord's email: owner@example.ca")
    expect(re.exec(en)?.[1]).toBe('owner@example.ca')
    // a malformed address is simply left out
    const bad = composeIntake(INTAKES.repair, { where: { picks: ['kitchen'], text: '' }, what: { picks: ['clog'], text: '' }, since: { picks: ['today'], text: '' }, urgency: { picks: ['can_wait'], text: '' }, entry: { picks: ['call_first'], text: '' }, landlord_email: { picks: [], text: 'not-an-email' } }, 'zh', 0)
    expect(bad).not.toContain('房东邮箱')
  })
  it('intakes: repair has an optional landlord_email step; contact_landlord exists with 3 steps counted by withStepCount', () => {
    const step = INTAKES.repair.steps.find((s) => s.key === 'landlord_email')!
    expect(step.optional).toBe(true)
    expect(step.input).toBe('text')
    const c = INTAKES.contact_landlord
    expect(c).toBeTruthy()
    expect(c.steps.map((s) => s.key)).toEqual(['topic', 'message', 'landlord_email'])
    expect(c.steps[0].optional).toBeFalsy()
    expect(c.outline.zh).toMatch(/^3 步 · /)
    expect(c.outline.en).toMatch(/^3 steps · /)
    const raw = { ...c, outline: { zh: '说什么 · 具体内容 · 房东邮箱', en: 'topic · the message · landlord email' } }
    expect(withStepCount(raw).outline.zh).toBe(c.outline.zh)
    const zh = composeIntake(c, { topic: { picks: ['renewal'], text: '' }, message: { picks: [], text: '我想续约一年。' } }, 'zh', 0)
    expect(zh).toContain('续约')
    expect(zh).toContain('确认后再发')
    expect(zh).not.toContain('【')
  })
  it('migration: one row per tenant, owner RLS, revoked from public and anon', () => {
    const sql = read('supabase/migrations/20261016_tenant_landlord_contacts.sql')
    expect(sql).toContain('create table if not exists public.tenant_landlord_contacts')
    expect(sql).toContain('tenant_auth_id uuid not null')
    expect(sql).toContain('landlord_email text not null')
    expect(sql).toContain('unique (tenant_auth_id)')
    expect(sql).toContain('enable row level security')
    expect(sql).toMatch(/using \(tenant_auth_id = auth\.uid\(\)\) with check \(tenant_auth_id = auth\.uid\(\)\)/)
    expect(sql).toContain('revoke all on public.tenant_landlord_contacts from public, anon')
  })
  it('the receipt for a tenant with nothing on file now asks for the landlord’s email', () => {
    expect(executionReasonText('no_landlord_on_file', true)).toContain('告诉我房东的邮箱')
    expect(executionReasonText('no_household_on_file', false)).toMatch(/landlord's email/)
  })
})

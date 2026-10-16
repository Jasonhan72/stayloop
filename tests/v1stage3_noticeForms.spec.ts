// V1.0 · 阶段 3 · 甲 #5 — N 表工具箱 (design/v1-scope-and-roadmap-2026-10.md 3.1 / §6).
//
// 1. The four calculators' block / warn edges: N1 90 days + 12 months +
//    guideline by effective year (+ the s.6.1 tick); N4 7 / 12 days and
//    served-after-due; N12 60 days, last day of a rental period, 120-day
//    waiver (not for purchasers); L1 the day after the N4 termination date.
// 2. deemedServedOn: mail adds the deemed-service days, nothing else does.
// 3. fillSheet escapes user strings and says it is not the official form.
// 4. NOTICE_FORMS has exactly the four forms, official links on the LTB host,
//    and no source of the toolbox recommends a form or a service method
//    (LSA s.1(5) boundary).
// 5. The migration is append-only (no update / delete policy or grant);
//    the rail has 通知; the leases page's N_FORMS no longer carries prompts.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  computeL1, computeN1, computeN12, computeN4, deemedServedOn, dueDayFromText, fillSheet, isLastDayOfRentalPeriod,
  nextRentalPeriodEnd, NOTICE_FORMS, noticeForm, SERVICE_METHODS,
} from '../lib/ontario/noticeForms'
import { N4_MAIL_DEEMED_SERVICE_DAYS, RENT_GUIDELINE } from '../lib/ontario/rules'

vi.mock('@/lib/supabase', () => ({ supabase: {}, getSupabaseBrowser: () => ({}) }))
vi.mock('@/lib/messages/unread', () => ({ useUnreadMessages: () => 0 }))
vi.mock('@/lib/agent/pendingCount', () => ({ fetchPendingCount: async () => 0, PENDING_CHANGED_EVENT: 'x' }))

const read = (p: string) => readFileSync(p, 'utf8')
const blocks = (r: { flags: { level: string; rule?: string }[] }) => r.flags.filter((f) => f.level === 'block')
const rulesOf = (r: { flags: { level: string; rule?: string }[] }, level: string) => r.flags.filter((f) => f.level === level).map((f) => f.rule)

describe('deemedServedOn (RTA s.191)', () => {
  it('mail adds the deemed-service days; every other method is the same day', () => {
    expect(deemedServedOn('2026-10-16', 'mail')).toBe('2026-10-21')
    for (const m of ['hand', 'mailbox', 'fax', 'email'] as const) expect(deemedServedOn('2026-10-16', m)).toBe('2026-10-16')
    expect(SERVICE_METHODS.find((m) => m.id === 'mail')?.deemedDays).toBe(N4_MAIL_DEEMED_SERVICE_DAYS)
    expect(deemedServedOn('', 'hand')).toBe('')
  })
})

describe('computeN1', () => {
  const base = { currentRent: 2000, newRent: 2030, servedOn: '2026-10-16', method: 'hand' as const, leaseStart: '2025-06-01' }
  it('90 days: effective date earlier than deemed service + 90 blocks; on the 90th day passes', () => {
    expect(rulesOf(computeN1({ ...base, effectiveOn: '2027-01-13' }), 'block')).toContain('RTA-116-n1-90-days')
    expect(blocks(computeN1({ ...base, effectiveOn: '2027-01-14' }))).toEqual([])
  })
  it('mail moves the 90-day start by the deemed-service days', () => {
    expect(blocks(computeN1({ ...base, method: 'mail', effectiveOn: '2027-01-18' })).length).toBe(1)
    expect(blocks(computeN1({ ...base, method: 'mail', effectiveOn: '2027-01-19' }))).toEqual([])
  })
  it('12 months since the last increase (or the lease start) — clamped month arithmetic', () => {
    const r = computeN1({ ...base, leaseStart: '2026-03-01', effectiveOn: '2027-02-01' })
    expect(r.flags.filter((f) => f.level === 'block').map((f) => f.zh).join(' ')).toMatch(/不满 12 个月/)
    expect(blocks(computeN1({ ...base, leaseStart: '2026-03-01', effectiveOn: '2027-03-01' }))).toEqual([])
    expect(blocks(computeN1({ ...base, lastIncreaseOn: '2026-05-01', leaseStart: '2020-01-01', effectiveOn: '2027-04-01' })).length).toBe(1)
  })
  it('guideline is the one for the year the increase takes effect', () => {
    // 2.0% is inside 2026 (2.1%) but outside 2027 (1.9%).
    expect(RENT_GUIDELINE[2026]).toBe(2.1); expect(RENT_GUIDELINE[2027]).toBe(1.9)
    const in2026 = computeN1({ ...base, servedOn: '2026-08-01', effectiveOn: '2026-12-01', newRent: 2040 })
    expect(rulesOf(in2026, 'block')).not.toContain('RTA-120-guideline')
    const in2027 = computeN1({ ...base, effectiveOn: '2027-02-01', newRent: 2040 })
    expect(rulesOf(in2027, 'block')).toContain('RTA-120-guideline')
    expect(in2027.fields.find((f) => f.key === 'guideline')?.value).toBe('2027 · 1.9%')
  })
  it('ticking the post-2018 exemption turns the guideline block into an info that names N2 without choosing it', () => {
    const r = computeN1({ ...base, effectiveOn: '2027-02-01', newRent: 2100, firstOccupiedAfter2018: true })
    expect(rulesOf(r, 'block')).not.toContain('RTA-120-guideline')
    const info = r.flags.find((f) => f.level === 'info' && f.rule === 'RTA-120-guideline')
    expect(info?.zh).toMatch(/N2/); expect(info?.zh).toMatch(/由你自行判断/)
  })
  it('effective date not on the rent due day is a warn, not a block; new rent ≤ current is a warn', () => {
    const r = computeN1({ ...base, effectiveOn: '2027-02-15', dueDay: 1 })
    expect(r.flags.some((f) => f.level === 'warn' && /租期首日/.test(f.zh))).toBe(true)
    expect(computeN1({ ...base, effectiveOn: '2027-02-01', newRent: 2000 }).flags.some((f) => f.level === 'warn' && /涨租通知/.test(f.zh))).toBe(true)
  })
  it('unknown future year: info says the guideline is not published and compares with the latest', () => {
    const r = computeN1({ ...base, effectiveOn: '2031-01-01', leaseStart: '2020-01-01', newRent: 2010 })
    expect(r.flags.some((f) => f.level === 'info' && /尚未公布/.test(f.zh))).toBe(true)
  })
})

describe('computeN4', () => {
  const periods = [{ due: '2026-09-01', amountOwed: 2000 }, { due: '2026-10-01', amountOwed: 2000 }]
  it('termination date at least 7 days after service by hand, 12 by mail', () => {
    expect(rulesOf(computeN4({ monthlyRent: 2000, unpaidPeriods: periods, servedOn: '2026-10-16', method: 'hand', terminationOn: '2026-10-22' }), 'block')).toContain('RTA-59-n4-7-days')
    expect(blocks(computeN4({ monthlyRent: 2000, unpaidPeriods: periods, servedOn: '2026-10-16', method: 'hand', terminationOn: '2026-10-23' }))).toEqual([])
    expect(blocks(computeN4({ monthlyRent: 2000, unpaidPeriods: periods, servedOn: '2026-10-16', method: 'mail', terminationOn: '2026-10-27' })).length).toBe(1)
    const ok = computeN4({ monthlyRent: 2000, unpaidPeriods: periods, servedOn: '2026-10-16', method: 'mail', terminationOn: '2026-10-28' })
    expect(blocks(ok)).toEqual([])
    expect(ok.fields.find((f) => f.key === 'earliest_termination')?.value).toBe('2026-10-28')
  })
  it('service on or before a listed due date blocks; the total is the sum of the ticked periods', () => {
    const r = computeN4({ monthlyRent: 2000, unpaidPeriods: periods, servedOn: '2026-10-01', method: 'hand', terminationOn: '2026-10-20' })
    expect(r.flags.filter((f) => f.level === 'block').map((f) => f.zh).join(' ')).toMatch(/到期日之后/)
    expect(r.fields.find((f) => f.key === 'total_owing')?.value).toBe('$4,000.00')
    expect(rulesOf(r, 'info')).toContain('LTB-forms-2026-09')
  })
  it('no period ticked is a warn (the form lists periods), not silence', () => {
    expect(computeN4({ monthlyRent: 2000, unpaidPeriods: [], servedOn: '2026-10-16', method: 'hand', terminationOn: '2026-10-30' }).flags.some((f) => f.level === 'warn')).toBe(true)
  })
})

describe('computeN12', () => {
  const base = { servedOn: '2026-10-16', method: 'hand' as const, dueDay: 1, who: 'landlord' as const, compensationOffered: 'one_month' as const }
  it('rental-period end: the day before the due day', () => {
    expect(isLastDayOfRentalPeriod('2026-12-31', 1)).toBe(true)
    expect(isLastDayOfRentalPeriod('2026-12-30', 1)).toBe(false)
    expect(isLastDayOfRentalPeriod('2026-11-14', 15)).toBe(true)
    // Due day 31 clamps to the 28th in February, so the period ends on the 27th (lib/dates utcDateClamped).
    expect(isLastDayOfRentalPeriod('2027-02-27', 31)).toBe(true)
    expect(isLastDayOfRentalPeriod('2027-02-28', 31)).toBe(false)
    expect(isLastDayOfRentalPeriod('2027-02-28', 1)).toBe(true)
    expect(nextRentalPeriodEnd('2026-12-15', 1)).toBe('2026-12-31')
  })
  it('60 days and last-day-of-period are both blocks', () => {
    expect(rulesOf(computeN12({ ...base, terminationOn: '2026-11-30' }), 'block')).toContain('RTA-48-1-n12-120-days')
    expect(computeN12({ ...base, terminationOn: '2026-12-15' }).flags.filter((f) => f.level === 'block').map((f) => f.zh).join(' ')).toMatch(/租期末日/)
    expect(blocks(computeN12({ ...base, terminationOn: '2026-12-31' }))).toEqual([])
  })
  it('under 120 days with no compensation blocks; 120+ days (landlord side) waives it as info', () => {
    expect(blocks(computeN12({ ...base, terminationOn: '2026-12-31', compensationOffered: 'none' })).length).toBe(1)
    const waived = computeN12({ ...base, terminationOn: '2027-02-28', compensationOffered: 'none' })
    expect(blocks(waived)).toEqual([])
    expect(waived.flags.some((f) => f.level === 'info' && /s\.48\.1\(2\)/.test(f.zh))).toBe(true)
  })
  it('purchaser’s own use never gets the 120-day waiver', () => {
    const r = computeN12({ ...base, who: 'purchaser', terminationOn: '2027-02-28', compensationOffered: 'none' })
    expect(blocks(r).length).toBe(1)
    expect(blocks(r)[0]).toMatchObject({ rule: 'RTA-48-1-n12-120-days' })
    expect(blocks(computeN12({ ...base, who: 'purchaser', terminationOn: '2027-02-28', compensationOffered: 'alt_unit' }))).toEqual([])
  })
  it('mail adds the deemed-service days before the 60', () => {
    expect(blocks(computeN12({ ...base, method: 'mail', terminationOn: '2026-12-15' })).length).toBeGreaterThan(0)
    expect(computeN12({ ...base, method: 'mail', terminationOn: '2026-12-31' }).fields.find((f) => f.key === 'earliest_termination')?.value).toBe('2026-12-20')
  })
})

describe('computeL1', () => {
  it('earliest filing is the day after the N4 termination date', () => {
    expect(blocks(computeL1({ n4TerminationOn: '2026-10-23', today: '2026-10-23' })).length).toBe(1)
    const ok = computeL1({ n4TerminationOn: '2026-10-23', today: '2026-10-24', totalOwing: 4000 })
    expect(blocks(ok)).toEqual([])
    expect(ok.fields.find((f) => f.key === 'earliest_filing')?.value).toBe('2026-10-24')
    expect(ok.flags.some((f) => f.level === 'info' && /失效/.test(f.zh))).toBe(true)
  })
})

describe('dueDayFromText', () => {
  it('reads the standard lease free text and numbers', () => {
    expect(dueDayFromText('first day of each month')).toBe(1)
    expect(dueDayFromText('15th')).toBe(15)
    expect(dueDayFromText('1')).toBe(1)
    expect(dueDayFromText(31)).toBe(31)
    expect(dueDayFromText('')).toBeNull()
    expect(dueDayFromText('monthly')).toBeNull()
    expect(dueDayFromText(40)).toBeNull()
  })
})

describe('fillSheet', () => {
  it('escapes user strings and says it is not the official form', () => {
    const r = computeN1({ currentRent: 2000, newRent: 2040, servedOn: '2026-10-16', method: 'hand', effectiveOn: '2027-02-01', leaseStart: '2025-01-01' })
    const fields = [{ key: 'tenant', label: { zh: '租客', en: 'Tenant' }, value: '<script>alert(1)</script> & "Mia"', source: 'lease' as const }, ...r.fields]
    for (const lang of ['zh', 'en'] as const) {
      const html = fillSheet(noticeForm('N1'), fields, r.flags, lang, '2026-10-16')
      expect(html).not.toContain('<script>alert')
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Mia&quot;')
      expect(html).toMatch(lang === 'zh' ? /不是官方表格/ : /not the official form/)
      expect(html).toMatch(/Crown copyright/)
      expect(html).toContain('@media print')
      expect(html).toContain(noticeForm('N1').official.form)
    }
  })
  it('marks failing values red (block class) and checks amber (warn class)', () => {
    const r = computeN1({ currentRent: 2000, newRent: 2100, servedOn: '2026-10-16', method: 'hand', effectiveOn: '2026-11-15', leaseStart: '2026-06-01', dueDay: 1 })
    const html = fillSheet(noticeForm('N1'), r.fields, r.flags, 'zh')
    expect(html).toMatch(/<li class="block">/)
    expect(html).toMatch(/<li class="warn">/)
    expect(html).toMatch(/li\.block\{background:#FEF2F2/)
  })
})

describe('NOTICE_FORMS and the LSA s.1(5) boundary', () => {
  it('exactly N1 / N4 / N12 / L1, each with an official LTB link and a version label', () => {
    expect(NOTICE_FORMS.map((f) => f.code)).toEqual(['N1', 'N4', 'N12', 'L1'])
    for (const f of NOTICE_FORMS) {
      expect(f.official.form.startsWith('https://tribunalsontario.ca/documents/ltb/')).toBe(true)
      expect(f.official.form.endsWith('.pdf')).toBe(true)
      expect(f.version).toMatch(/^(2026\/09|current)$/)
      expect(f.what.zh.length).toBeGreaterThan(20)
    }
    expect(noticeForm('N4').version).toBe('2026/09')
    expect(noticeForm('L1').version).toBe('2026/09')
  })
  it('no source of the toolbox recommends a form, a service method or whether to serve', () => {
    const files = ['lib/ontario/noticeForms.ts', 'components/landlord/NoticeToolbox.tsx', 'app/landlord/notices/page.tsx']
    for (const f of files) {
      const src = read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
      expect(src, f).not.toMatch(/建议|推荐|你应该/)
      expect(src, f).not.toMatch(/should serve|we recommend|recommended|best way to serve|you should/i)
    }
    // The service-method list is neutral: one entry per RTA s.191 / LTB Rule 3 method, each only a deemed-days number.
    expect(SERVICE_METHODS.map((m) => m.id)).toEqual(['hand', 'mailbox', 'mail', 'fax', 'email'])
    // No `?form=` preselection: the form is never chosen for the landlord.
    expect(read('components/landlord/NoticeToolbox.tsx')).not.toMatch(/params\.get\('form'\)/)
    // The official PDF is linked, never fetched or embedded.
    const comp = read('components/landlord/NoticeToolbox.tsx')
    expect(comp).not.toMatch(/fetch\(\s*noticeForm|<iframe|<embed|<object/)
    expect(comp).toMatch(/notice-boundary/)
  })
})

describe('wiring', () => {
  it('migration: own select + insert only, no update / delete policy or grant for API roles', () => {
    const sql = read('supabase/migrations/20261016_notice_service_records.sql')
    expect(sql).toMatch(/create table if not exists public\.notice_service_records/)
    expect(sql).toMatch(/check \(form in \('N1', 'N4', 'N12', 'L1'\)\)/)
    expect(sql).toMatch(/for select to authenticated/)
    expect(sql).toMatch(/for insert to authenticated/)
    expect(sql).not.toMatch(/for update/i)
    expect(sql).not.toMatch(/for delete/i)
    expect(sql).not.toMatch(/for all/i)
    expect(sql).toMatch(/revoke all on table public\.notice_service_records from public, anon, authenticated/)
    expect(sql).toMatch(/grant select, insert on table public\.notice_service_records to authenticated/)
    expect(sql).not.toMatch(/grant [^\n]*(update|delete)[^\n]* to authenticated/i)
    expect(sql).toMatch(/references public\.lease_documents \(id\) on delete set null/)
  })
  it('rail: landlords get 通知 → /landlord/notices after 租约', async () => {
    const { RAIL_BY_ROLE } = await import('@/components/workspace/rail')
    const items = RAIL_BY_ROLE.landlord
    const i = items.findIndex((it) => it.key === 'notices')
    expect(i).toBeGreaterThan(0)
    expect(items[i].href).toBe('/landlord/notices')
    expect(items[i].group).toBe('pages')
    expect(items[i].label.zh).toBe('通知')
    expect(items[i - 1].key).toBe('lease')
  })
  it('leases page: N_FORMS cards link to the toolbox and carry no AI prompt; the detail page links the toolbox', () => {
    const page = read('app/landlord/leases/page.tsx')
    const nforms = page.slice(page.indexOf('const N_FORMS'), page.indexOf('/** Display code for a real lease row'))
    expect(nforms).not.toMatch(/prompt/)
    expect(page).toMatch(/href="\/landlord\/notices"/)
    expect(page).not.toMatch(/N1 和 N2 涨租通知模板/)
    const detail = read('app/landlord/leases/[id]/page.tsx')
    expect(detail).toMatch(/\/landlord\/notices\?lease=\$\{l\.id\}/)
    expect(detail).not.toMatch(/起草 \$\{lease\.tenant\} 的 N1 涨租通知/)
    // The toolbox page itself exists inside the landlord shell.
    expect(read('app/landlord/notices/page.tsx')).toMatch(/<WorkspaceShell role="landlord">/)
    expect(read('app/landlord/notices/page.tsx')).toMatch(/<Suspense/)
  })
  it('the component writes the audit action notice_served_recorded with the caller’s client', () => {
    const comp = read('components/landlord/NoticeToolbox.tsx')
    expect(comp).toMatch(/action: 'notice_served_recorded'/)
    expect(comp).toMatch(/writeAuditEvent\(supabase,/)
    expect(comp).toMatch(/from\('notice_service_records'\)\.insert\(/)
    expect(comp).not.toMatch(/window\.(confirm|alert)\(/)
  })
})

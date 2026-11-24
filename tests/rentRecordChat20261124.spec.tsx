// @vitest-environment jsdom
// V0.9 (2026-11-24, user: 「接着做记租金」 — the second product module finished in the AI conversation).
// A signed-in landlord or tenant who says rent was received or paid gets the rent record card under
// the reply: the periods of their managed tenancy that the tenancy page's rent tab would let them
// mark, the month they named ticked, a payment date for each — and only 「确认」 records anything,
// through mark_rent_paid, by the person's own call. The model is told the card is there; it never
// decides to show it, never sees its rows and cannot record. It is a form the person submits, so a
// landlord's conversation still proposes no approval card.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import React from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { all, only, textOf } from './helpers/dom'

const read = (p: string) => readFileSync(p, 'utf8')

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  user: { id: 'u-landlord' } as null | { id: string },
  tables: {} as Record<string, Row[]>,
  fail: null as string | null,
  reads: [] as string[],
  rpc: [] as [string, Row | undefined][],
  refuse: {} as Record<string, string>,
  facts: 0,
  pending: 0,
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children) }))
vi.mock('@/lib/useAuth', () => ({ useAuth: () => ({ loading: false, user: db.user, role: null }) }))
vi.mock('@/lib/facts/useFacts', () => ({ notifyFactsChanged: () => { db.facts++ } }))
vi.mock('@/lib/agent/pendingCount', () => ({ notifyPendingChanged: () => { db.pending++ } }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      db.reads.push(table)
      const q: Record<string, unknown> = {}
      for (const k of ['select', 'eq', 'in', 'order', 'limit']) q[k] = () => q
      q.then = (res: (v: unknown) => unknown) => res(db.fail === table ? { data: null, error: { message: 'boom' } } : { data: db.tables[table] ?? [], error: null })
      return q
    },
    rpc: async (name: string, args?: Row) => {
      db.rpc.push([name, args])
      const why = db.refuse[String(args?.p_due)]
      return why ? { data: null, error: { message: why } } : { data: null, error: null }
    },
  },
}))

import { I18nProvider } from '../lib/i18n'
import RentRecordChatCard, { rentRecordDoneKey } from '../components/agent/RentRecordChatCard'
import { RENT_RECORD_TURN_NOTE, rentMonthHint, wantsRentRecord } from '../lib/agent/rentRecordIntent'
import { wantsLeaseImport } from '../lib/agent/leaseImportIntent'
import { buildRentTenancies, defaultPaidOn, memberRolesFor, openPeriods, paidOnNote, pickPeriods, pickTenancy, tenancyLabel, type RentHousehold } from '../lib/household/rentRecord'
import { rentLedger } from '../lib/household/ledger'
import { rentSchedule } from '../lib/household/schedule'
import { replyClaimsExecution } from '../lib/agent/guardrail'

const NOW = new Date('2026-11-24T15:00:00Z') // 10:00 in Toronto
const H1: RentHousehold = { id: 'h1', address: '100 Test Ave', unit: '1', city: 'Toronto', current_lease_id: 'L1', next_lease_id: null, start_date: '2026-09-01', rent_due_day: 1, monthly_rent: 2450, status: 'active' }
const H2: RentHousehold = { id: 'h2', address: '9 Elm Street', unit: null, city: 'Toronto', current_lease_id: 'L2', next_lease_id: null, start_date: '2026-10-15', rent_due_day: 15, monthly_rent: 1800, status: 'active' }
const seed = (households: RentHousehold[] = [H1]) => {
  db.tables = {
    household_members: households.map((h) => ({ household_id: h.id, role: 'landlord' })),
    households,
    lease_documents: [{ id: 'L1', start_date: '2026-09-01', tenant_name: '[TEST] Mia Tenant' }, { id: 'L2', start_date: '2026-10-15', tenant_name: 'Jordan Park' }],
    rent_payments: [{ lease_id: 'L1', due_date: '2026-09-01', status: 'paid', paid_at: '2026-09-01T14:00:00Z', amount: 2450 }],
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
  localStorage.setItem('stayloop_lang', 'zh')
  db.user = { id: 'u-landlord' }; db.fail = null; db.reads.length = 0; db.rpc.length = 0; db.refuse = {}; db.facts = 0; db.pending = 0
  seed()
})
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear() })

const mount = (props: Partial<React.ComponentProps<typeof RentRecordChatCard>> = {}) => render(<I18nProvider><RentRecordChatCard offer={{ id: 'offer-1' }} role="landlord" {...props} /></I18nProvider>)
const card = (c: ParentNode) => only<HTMLElement>(c, '[data-testid="rent-record-card"]')
const ready = async (c: ParentNode, step = 'pick') => { await waitFor(() => expect(card(c).dataset.step).toBe(step)) }
const periods = (c: ParentNode) => all<HTMLElement>(c, '[data-testid="rent-record-period"]').map((li) => [li.dataset.due, li.dataset.on])
const period = (c: ParentNode, due: string) => only<HTMLElement>(c, `[data-testid="rent-record-period"][data-due="${due}"]`)

describe('when the card is offered: the person’s own words, read deterministically', () => {
  it('saying rent was received or paid, or asking to record it', () => {
    for (const said of [
      '这个月的租金租客已经转给我了，帮我记一下', '10 月的租金收到了', '租客交了 10 月房租', '帮我记一下这个月的租金', '记租金', '房租到账了', '租金怎么记',
      '我交了这个月的房租，帮我记一下', '收到 11 月房租了', '租金帮我记上', '把十月的租金记为已收',
      'I received October\'s rent', 'The rent came in today', 'Mark this month\'s rent as paid', 'Record the rent for November', 'I paid my rent',
    ]) expect(wantsRentRecord(said), said).toBe(true)
  })
  it('not: rent that has not come in, chasing it, asking whether it came, an increase, a receipt, anything else', () => {
    for (const said of [
      '租客还没交租金', '这个月租金没收到', '租金逾期了怎么办', '提醒租客交租金', '帮我催一下房租', '租金收到了吗', '房租到账了没', '租金多少合适',
      '2027 年租金最多涨多少', '租金记录怎么导出', '给租客开一张租金收据', '押金收到了', '帮我导入租约', '我想发布房源', '帮我解读租约',
      'The tenant hasn\'t paid rent', 'Did the rent come in?', 'Remind my tenant about the rent', 'How much rent can I charge?', 'rent is overdue', '', '  ',
    ]) expect(wantsRentRecord(said), said).toBe(false)
    expect(wantsRentRecord(null)).toBe(false)
  })
  it('the month the person named, as a start for the card', () => {
    const t = '2026-11-24'
    expect(rentMonthHint('10 月的租金收到了', t)).toBe('2026-10')
    expect(rentMonthHint('十月房租到账了', t)).toBe('2026-10')
    expect(rentMonthHint('11月份的房租', t)).toBe('2026-11')
    expect(rentMonthHint('这个月的租金租客已经转给我了', t)).toBe('2026-11')
    expect(rentMonthHint('上个月的房租', t)).toBe('2026-10')
    // a bare month is its most recent occurrence that is not past next month
    expect(rentMonthHint('12 月的租金', t)).toBe('2026-12')
    expect(rentMonthHint('12 月的租金', '2027-01-05')).toBe('2026-12')
    expect(rentMonthHint('2 月的租金', t)).toBe('2026-02')
    expect(rentMonthHint('I received October\'s rent', t)).toBe('2026-10')
    expect(rentMonthHint('rent for Nov came in', t)).toBe('2026-11')
    expect(rentMonthHint('last month', '2027-01-05')).toBe('2026-12')
    // 「11 月 3 号收到的」 is a date, not the period: no month is taken from it
    expect(rentMonthHint('租金 11 月 3 号收到了', t)).toBeNull()
    expect(rentMonthHint('租金收到了', t)).toBeNull()
  })
})

describe('the turn: the server decides, the model is told, one card a turn', () => {
  const route = read('app/api/agent/turn/route.ts')
  it('offered from the message, for a signed-in landlord or tenant; never with the import card, never to an agent or a visitor', () => {
    expect(route).toContain("const rentRecordOffer = !anonymous && !!turnUserId && !leaseImportOffer && (role === 'landlord' || role === 'tenant') && wantsRentRecord(message)")
    expect(route).toContain("(rentRecordOffer ? RENT_RECORD_TURN_NOTE : '') +")
    expect(route).toContain('rent_record: rentRecordOffer ? { id: crypto.randomUUID() } : undefined,')
    expect(route).not.toMatch(/parsed\??\.rent_record/)
    expect(read('lib/agent/prompts.ts')).not.toContain('"rent_record"')
    expect(read('lib/agent/orchestrator.ts')).toContain("rentRecord: !anonymous && turn.rent_record && typeof turn.rent_record.id === 'string' ? { id: turn.rent_record.id } : undefined,")
    // the product page's sentence asks for both: the import comes first — there is nothing to record against before it
    const both = '我有一份签好的租约，怎么导入进来、每月记租金？'
    expect([wantsLeaseImport(both), wantsRentRecord(both)]).toEqual([true, true])
  })
  it('a visitor is told to sign in, not to say it again: the preview never has these cards', () => {
    // 2026-11-24, seen on production: the anonymous landlord preview answered 「说一句 X 月的租金收到了，下面会弹出卡」 — and no card can come
    const anon = route.match(/const ANON_PROMPT_ADDENDUM = `([\s\S]*?)`\n/)?.[1] ?? ''
    expect(anon).toContain('(导入租约的卡、记租金的卡)只在登录后的对话里出现,这个预览会话里不会有')
    expect(anon).toContain('【不要】让他在这里「再说一句」来唤起卡片,也不要说下面有卡')
  })
  it('the note keeps the reply in step with the card', () => {
    expect(RENT_RECORD_TURN_NOTE).toContain('系统会在你这条回复下面放一张「记租金」卡')
    expect(RENT_RECORD_TURN_NOTE).toContain('点确认之后才会记上')
    expect(RENT_RECORD_TURN_NOTE).toContain('【不要】说「已经记好了」「已记为已收」「已更新租金记录」')
    expect(RENT_RECORD_TURN_NOTE).toContain('【不要】自己说是哪一期、多少钱、迟了几天')
    expect(RENT_RECORD_TURN_NOTE).toContain('Stayloop 不经手资金')
    expect(replyClaimsExecution('下面有一张记租金的卡：请核对是哪一期、哪一天收到的，再点确认；确认之前什么都不会记。')).toBe(false)
  })
  it('the approval-card rule is as it was: a landlord’s and an agent’s conversation propose none', () => {
    const p = read('lib/agent/prompts.ts')
    expect(p).toContain("landlord: '2. 房东身份下你【不产出任何 proposed_action】")
    expect(p).toContain("agent: '2. 经纪身份下你【不产出任何 proposed_action】")
    // and recording rent is not an action the executor carries out for anyone
    expect(read('lib/agent/approval-engine.ts')).not.toMatch(/mark_rent|rent_paid|record_rent/)
  })
  it('the chat shows the card under the reply, in a live session only, started from what the person said', () => {
    const chat = read('components/agent/AgentChat.tsx')
    expect(chat).toContain("{m.role === 'agent' && m.rentRecord && live && (")
    expect(chat).toContain("<RentRecordChatCard offer={m.rentRecord} role={role} said={messages[i - 1]?.role === 'user' ? messages[i - 1].text : undefined} />")
    expect(read('lib/agent/useAgentSession.ts')).toContain('rentRecord = turn.rentRecord')
  })
})

describe('the periods are the tenancy page’s own', () => {
  it('what can be recorded is what the rent tab marks 「标记已付」: due with nothing recorded, oldest first; a signed renewal’s periods are not this lease’s', () => {
    const paid = [{ lease_id: 'L1', due_date: '2026-09-01', status: 'paid', paid_at: '2026-09-01T14:00:00Z', amount: 2450 }]
    expect(openPeriods(H1, '2026-09-01', null, paid, NOW)).toEqual([{ due: '2026-10-01', amount: 2450, overdue: true }, { due: '2026-11-01', amount: 2450, overdue: true }])
    // the same rows as the page's own computation
    const page = rentLedger(rentSchedule('2026-09-01', 1, NOW), paid, NOW).periods.filter((p) => p.canMarkPaid).map((p) => p.due).sort()
    expect(openPeriods(H1, '2026-09-01', null, paid, NOW).map((p) => p.due)).toEqual(page)
    // an e-sign placeholder is recordable and carries its own amount, even before its date
    const withPlaceholder = [...paid, { lease_id: 'L1', due_date: '2026-12-01', status: 'due', paid_at: null, amount: 2500 }]
    expect(openPeriods(H1, '2026-09-01', null, withPlaceholder, NOW).at(-1)).toEqual({ due: '2026-12-01', amount: 2500, overdue: false })
    expect(openPeriods({ ...H1, next_lease_id: 'L9' }, '2026-09-01', '2026-11-01', paid, NOW).map((p) => p.due)).toEqual(['2026-10-01'])
    // unusable inputs list nothing rather than a made-up schedule
    expect(openPeriods({ ...H1, rent_due_day: null }, '2026-09-01', null, [], NOW)).toEqual([])
    const src = read('lib/household/rentRecord.ts')
    expect(src).toContain("import { checkPaidOn, ledgerStart, rentLedger, type LedgerRow } from './ledger'")
    expect(src).toContain("import { rentSchedule } from './schedule'")
  })
  it('tenancies: running leases only, with the tenant’s name from the lease; which member roles record in which conversation', () => {
    const list = buildRentTenancies([H1, H2, { ...H1, id: 'h3', current_lease_id: null }, { ...H1, id: 'h4', status: 'ended' }], [{ id: 'L1', start_date: '2026-09-01', tenant_name: ' [TEST] Mia Tenant ' }, { id: 'L2', start_date: '2026-10-15', tenant_name: 'Jordan Park' }], [], NOW)
    expect(list.map((t) => [t.id, t.leaseId, t.tenant, t.periods.map((p) => p.due)])).toEqual([
      ['h1', 'L1', '[TEST] Mia Tenant', ['2026-09-01', '2026-10-01', '2026-11-01']],
      ['h2', 'L2', 'Jordan Park', ['2026-10-15', '2026-11-15']],
    ])
    expect(tenancyLabel(list[0])).toBe('100 Test Ave · 1')
    expect(tenancyLabel(list[1])).toBe('9 Elm Street')
    expect(memberRolesFor('landlord')).toEqual(['landlord', 'property_manager'])
    expect(memberRolesFor('tenant')).toEqual(['tenant'])
  })
  it('where the card starts: the tenancy named, the month named — and never a guess beyond the latest period due', () => {
    const list = buildRentTenancies([H1, H2], [{ id: 'L1', start_date: '2026-09-01', tenant_name: '[TEST] Mia Tenant' }, { id: 'L2', start_date: '2026-10-15', tenant_name: 'Jordan Park' }], [], NOW)
    expect(pickTenancy(list, 'Jordan 的租金收到了')).toBe(1)
    expect(pickTenancy(list, 'Mia Tenant 交了 10 月房租')).toBe(0)
    expect(pickTenancy(list, '9 Elm Street 的房租到账了')).toBe(1)
    expect(pickTenancy(list, '租金收到了')).toBe(0)
    expect(pickTenancy([{ ...list[0], periods: [] }, list[1]], '租金收到了')).toBe(1)
    expect(pickTenancy([], '租金收到了')).toBe(-1)
    // nobody named: the tenancy that has the month they named, before one whose only open period is not due yet
    const future = { ...list[0], id: 'h0', address: '1 Ahead Rd', periods: [{ due: '2027-01-01', amount: 2100, overdue: false }] }
    expect(pickTenancy([future, list[1]], '这个月的租金收到了', '2026-11')).toBe(1)
    expect(pickTenancy([future, list[1]], '租金收到了', null)).toBe(1)
    expect(pickTenancy([future, { ...list[1], periods: [] }], '租金收到了', null)).toBe(0)
    expect(pickTenancy([future, list[1]], '1 月的租金收到了', '2027-01')).toBe(0)
    // a name still wins over the month
    expect(pickTenancy([future, list[1]], '1 Ahead Rd 这个月的租金收到了', '2026-11')).toBe(0)
    const p = list[0].periods
    expect(pickPeriods(p, '2026-10')).toEqual(['2026-10-01'])
    expect(pickPeriods(p, '2026-12')).toEqual([])
    expect(pickPeriods(p, null)).toEqual(['2026-11-01'])
    expect(pickPeriods([{ due: '2026-12-01', amount: 2450, overdue: false }], null)).toEqual([])
  })
  it('the date decides paid or late, said in the page’s own words', () => {
    expect(paidOnNote('2026-11-01', '2026-11-01', '2026-11-24', true)).toEqual({ ok: true, late: false, text: null })
    expect(paidOnNote('2026-11-01', '2026-11-05', '2026-11-24', true)).toEqual({ ok: true, late: true, text: '将记为迟付 4 天 · 不是这天付的请改成实际日期' })
    expect(paidOnNote('2026-11-01', '2026-11-24', '2026-11-24', true).text).toBe('将记为迟付 23 天（超过 7 天，计入 s.58 次数） · 不是这天付的请改成实际日期')
    expect(paidOnNote('2026-11-01', '2026-11-25', '2026-11-24', true)).toEqual({ ok: false, late: false, text: '付款日期不能晚于今天，也不能早于到期日 62 天以上。' })
    const page = read('app/h/[id]/page.tsx')
    for (const s of ['将记为迟付 ${chk.daysLate} 天${chk.countsTowardS58 ? \'（超过 7 天，计入 s.58 次数）\' : \'\'} · 不是这天付的请改成实际日期', '付款日期不能晚于今天，也不能早于到期日 62 天以上。']) {
      expect(page, s).toContain(s)
      expect(read('lib/household/rentRecord.ts'), s).toContain(s)
    }
  })
  it('the same write as the page: mark_rent_paid with the lease, the due date and the day paid — by the person, never the service role', () => {
    const client = read('lib/household/rentClient.ts')
    const call = "supabase.rpc('mark_rent_paid', { p_lease: leaseId, p_due: due, p_paid_on: "
    expect(client).toContain(`${call}paidOn })`)
    expect(read('app/h/[id]/page.tsx')).toContain(`${call}paidOnDate })`)
    expect(client).toContain("import { markPaidErrorText } from './csvReconcile'")
    expect(client).not.toMatch(/service_role|SERVICE_ROLE|createClient\(|\.insert\(|\.update\(|\.delete\(/)
    const cardSrc = read('components/agent/RentRecordChatCard.tsx')
    expect(cardSrc).not.toMatch(/supabase\.|fetch\(|window\.confirm|alert\(/)
  })
})

describe('the card', () => {
  it('lists the periods nobody has recorded and ticks the month the person named', async () => {
    const { container: c } = mount({ said: '10 月的租金收到了' })
    await ready(c)
    expect(textOf(only(c, '[data-testid="rent-record-tenancy-one"]'))).toBe('100 Test Ave · 1 · [TEST] Mia Tenant')
    expect(periods(c)).toEqual([['2026-10-01', '1'], ['2026-11-01', '0']])
    expect(textOf(period(c, '2026-10-01'))).toContain('10 月 1 日到期')
    expect(textOf(period(c, '2026-10-01'))).toContain('$2,450')
    expect(textOf(only(c, '[data-testid="rent-record-confirm"]'))).toBe('确认记为已收')
    // reading recorded nothing
    expect(db.rpc).toEqual([])
    expect(new Set(db.reads)).toEqual(new Set(['household_members', 'households', 'lease_documents', 'rent_payments']))
  })
  it('with no month named: the latest period already due; 「这个月」 is this month’s', async () => {
    const a = mount({ said: '租金收到了' })
    await ready(a.container)
    expect(periods(a.container)).toEqual([['2026-10-01', '0'], ['2026-11-01', '1']])
    cleanup()
    const b = mount({ said: '这个月的租金租客已经转给我了，帮我记一下', offer: { id: 'offer-2' } })
    await ready(b.container)
    expect(periods(b.container)).toEqual([['2026-10-01', '0'], ['2026-11-01', '1']])
  })
  it('a period that would be late if recorded today has no date until the person gives one — the card asks, it does not guess', async () => {
    const { container: c } = mount({ said: '这个月的租金收到了' })
    await ready(c)
    const date = () => only<HTMLInputElement>(period(c, '2026-11-01'), '[data-testid="rent-record-paid-on"]')
    expect([date().value, date().max, date().min]).toEqual(['', '2026-11-24', '2026-08-31'])
    expect(textOf(only(period(c, '2026-11-01'), '[data-testid="rent-record-date-ask"]'))).toContain('日期决定记成准时还是迟付，记上之后不能改')
    expect(only<HTMLButtonElement>(c, '[data-testid="rent-record-confirm"]').disabled).toBe(true)
    // 「今天」 says what today would record, in the page's words
    fireEvent.click(only(period(c, '2026-11-01'), '[data-testid="rent-record-day-today"]'))
    expect(date().value).toBe('2026-11-24')
    expect(textOf(only(period(c, '2026-11-01'), '[data-testid="rent-record-date-note"]'))).toBe('将记为迟付 23 天（超过 7 天，计入 s.58 次数） · 不是这天付的请改成实际日期')
    expect(only<HTMLButtonElement>(c, '[data-testid="rent-record-confirm"]').disabled).toBe(false)
    // 「到期当天」 is on time: no warning
    fireEvent.click(only(period(c, '2026-11-01'), '[data-testid="rent-record-day-due"]'))
    expect(date().value).toBe('2026-11-01')
    expect(period(c, '2026-11-01').querySelector('[data-testid="rent-record-date-note"]')).toBeNull()
    expect(period(c, '2026-11-01').querySelector('[data-testid="rent-record-date-ask"]')).toBeNull()
    // a day after today cannot be confirmed
    fireEvent.change(date(), { target: { value: '2026-11-30' } })
    expect(only<HTMLButtonElement>(c, '[data-testid="rent-record-confirm"]').disabled).toBe(true)
    expect(db.rpc).toEqual([])
    // the rule: today, unless today would be late
    expect([defaultPaidOn('2026-11-01', '2026-11-24'), defaultPaidOn('2026-11-24', '2026-11-24'), defaultPaidOn('2026-12-01', '2026-11-24'), defaultPaidOn('2026-11-23', '2026-11-24')]).toEqual(['', '2026-11-24', '2026-11-24', ''])
    expect(paidOnNote('2026-11-01', '', '2026-11-24', true)).toEqual({ ok: false, late: false, text: null })
  })
  it('only 「确认」 records: one mark_rent_paid per ticked period, with the day the person set', async () => {
    const { container: c } = mount({ said: '10 月的租金收到了' })
    await ready(c)
    fireEvent.change(only(period(c, '2026-10-01'), '[data-testid="rent-record-paid-on"]'), { target: { value: '2026-10-03' } })
    fireEvent.click(only(period(c, '2026-11-01'), '[data-testid="rent-record-tick"]'))
    fireEvent.change(only(period(c, '2026-11-01'), '[data-testid="rent-record-paid-on"]'), { target: { value: '2026-11-01' } })
    expect(textOf(only(c, '[data-testid="rent-record-confirm"]'))).toBe('确认记为已收（2 期）')
    fireEvent.click(only(c, '[data-testid="rent-record-confirm"]'))
    await ready(c, 'done')
    expect(db.rpc).toEqual([
      ['mark_rent_paid', { p_lease: 'L1', p_due: '2026-10-01', p_paid_on: '2026-10-03' }],
      ['mark_rent_paid', { p_lease: 'L1', p_due: '2026-11-01', p_paid_on: '2026-11-01' }],
    ])
    const done = only(c, '[data-testid="rent-record-done"]')
    expect(textOf(done)).toContain('✓ 已记 2 期')
    expect(textOf(done)).toContain('10 月 1 日到期 · $2,450 · 记为 2026-10-03 已收（迟付）')
    expect(textOf(done)).toContain('11 月 1 日到期 · $2,450 · 记为 2026-11-01 已收')
    expect(only<HTMLAnchorElement>(c, '[data-testid="rent-record-open"]').getAttribute('href')).toBe('/h/h1?tab=rent')
    expect([db.facts, db.pending]).toEqual([1, 1])
    expect(JSON.parse(localStorage.getItem(rentRecordDoneKey('u-landlord', 'offer-1'))!).recorded.map((r: { due: string }) => r.due)).toEqual(['2026-10-01', '2026-11-01'])
  })
  it('with several tenancies and none named, it opens on the one that has the month the person said', async () => {
    seed([{ ...H1, id: 'h0', address: '1 Ahead Rd', current_lease_id: 'L0', start_date: '2027-01-01' }, H2])
    db.tables.lease_documents = [...db.tables.lease_documents, { id: 'L0', start_date: '2027-01-01', tenant_name: 'Ahead Tenant' }]
    db.tables.rent_payments = [{ lease_id: 'L0', due_date: '2027-01-01', status: 'due', paid_at: null, amount: 2100 }]
    const { container: c } = mount({ said: '这个月的租金租客已经转给我了，帮我记一下' })
    await ready(c)
    expect(only<HTMLSelectElement>(c, '[data-testid="rent-record-tenancy"]').selectedOptions[0].textContent).toBe('9 Elm Street · Jordan Park')
    expect(periods(c)).toEqual([['2026-10-15', '0'], ['2026-11-15', '1']])
  })
  it('nothing ticked, nothing to confirm', async () => {
    const { container: c } = mount({ said: '12 月的租金收到了' })
    await ready(c)
    expect(periods(c).map((p) => p[1])).toEqual(['0', '0'])
    expect(only<HTMLButtonElement>(c, '[data-testid="rent-record-confirm"]').disabled).toBe(true)
    fireEvent.click(only(c, '[data-testid="rent-record-confirm"]'))
    expect(db.rpc).toEqual([])
  })
  it('several tenancies: the one named is chosen, and the person can change it', async () => {
    seed([H1, H2])
    const { container: c } = mount({ said: 'Jordan 的房租到账了' })
    await ready(c)
    const sel = only<HTMLSelectElement>(c, '[data-testid="rent-record-tenancy"]')
    expect(all(sel, 'option').map(textOf)).toEqual(['100 Test Ave · 1 · [TEST] Mia Tenant', '9 Elm Street · Jordan Park'])
    expect(sel.value).toBe('1')
    expect(periods(c)).toEqual([['2026-10-15', '0'], ['2026-11-15', '1']])
    fireEvent.change(sel, { target: { value: '0' } })
    expect(periods(c)).toEqual([['2026-10-01', '0'], ['2026-11-01', '1']])
    fireEvent.click(only(period(c, '2026-11-01'), '[data-testid="rent-record-day-due"]'))
    fireEvent.click(only(c, '[data-testid="rent-record-confirm"]'))
    await ready(c, 'done')
    expect(db.rpc).toEqual([['mark_rent_paid', { p_lease: 'L1', p_due: '2026-11-01', p_paid_on: '2026-11-01' }]])
  })
  it('a refusal is shown on its period, in the page’s words; what went through is recorded and said', async () => {
    db.refuse = { '2026-11-01': 'bad_paid_date' }
    const { container: c } = mount({ said: '10 月的租金收到了' })
    await ready(c)
    fireEvent.click(only(period(c, '2026-10-01'), '[data-testid="rent-record-day-today"]'))
    fireEvent.click(only(period(c, '2026-11-01'), '[data-testid="rent-record-tick"]'))
    fireEvent.click(only(period(c, '2026-11-01'), '[data-testid="rent-record-day-today"]'))
    // after the first went through, the ledger no longer lists it
    db.tables.rent_payments = [...db.tables.rent_payments, { lease_id: 'L1', due_date: '2026-10-01', status: 'late', paid_at: '2026-11-24T15:00:00Z', amount: 2450 }]
    fireEvent.click(only(c, '[data-testid="rent-record-confirm"]'))
    await waitFor(() => expect(c.querySelector('[data-testid="rent-record-error"]')).not.toBeNull())
    expect(card(c).dataset.step).toBe('pick')
    expect(textOf(only(c, '[data-testid="rent-record-error"]'))).toBe('付款日期不对：不能晚于今天，也不能早于到期日 62 天以上。')
    expect(periods(c)).toEqual([['2026-11-01', '1']])
    expect(textOf(only(c, '[data-testid="rent-record-partial"]'))).toContain('10 月 1 日到期')
    expect(localStorage.getItem(rentRecordDoneKey('u-landlord', 'offer-1'))).toBeNull()
  })
  it('no managed tenancy: says so and how to get one; every period recorded: says so', async () => {
    db.tables.household_members = []
    const a = mount({ said: '租金收到了' })
    await ready(a.container, 'empty')
    expect(textOf(only(a.container, '[data-testid="rent-record-empty"]'))).toContain('你名下还没有在管租约')
    expect(textOf(only(a.container, '[data-testid="rent-record-empty"]'))).toContain('导入租约')
    cleanup()
    seed()
    db.tables.rent_payments = ['2026-09-01', '2026-10-01', '2026-11-01'].map((d) => ({ lease_id: 'L1', due_date: d, status: 'paid', paid_at: `${d}T14:00:00Z`, amount: 2450 }))
    const b = mount({ said: '租金收到了', offer: { id: 'offer-2' } })
    await ready(b.container)
    expect(textOf(only(b.container, '[data-testid="rent-record-none"]'))).toContain('都已经记上了')
    expect(b.container.querySelector('[data-testid="rent-record-confirm"]')).toBeNull()
  })
  it('a read that fails is not 「no tenancy」: it says it could not read, and offers a retry', async () => {
    db.fail = 'households'
    const { container: c } = mount({ said: '租金收到了' })
    await ready(c, 'failed')
    expect(textOf(only(c, '[data-testid="rent-record-failed"]'))).toContain('没有读出来')
    expect(c.querySelector('[data-testid="rent-record-empty"]')).toBeNull()
  })
  it('recorded from this card already: after a reload it says so and reads nothing', async () => {
    localStorage.setItem(rentRecordDoneKey('u-landlord', 'offer-1'), JSON.stringify({ id: 'h1', label: '100 Test Ave · 1', recorded: [{ due: '2026-11-01', paidOn: '2026-11-01', late: false, amount: 2450 }] }))
    const { container: c } = mount({ said: '这个月的租金收到了' })
    await ready(c, 'done')
    expect(db.reads).toEqual([])
    expect(c.querySelector('[data-testid="rent-record-confirm"]')).toBeNull()
  })
  it('a tenant’s conversation records as the tenant: paid, not received', async () => {
    db.user = { id: 'u-tenant' }
    db.tables.household_members = [{ household_id: 'h1', role: 'tenant' }]
    const { container: c } = mount({ role: 'tenant', said: '我交了这个月的房租，帮我记一下' })
    await ready(c)
    expect(textOf(only(c, '[data-testid="rent-record-tenancy-one"]'))).toBe('100 Test Ave · 1')
    expect(textOf(only(c, '[data-testid="rent-record-confirm"]'))).toBe('确认记为已付')
    expect(textOf(card(c))).toContain('付款日期')
    // a landlord's membership row is not a tenant's tenancy
    cleanup()
    db.tables.household_members = [{ household_id: 'h1', role: 'landlord' }]
    const b = mount({ role: 'tenant', said: '房租交了', offer: { id: 'offer-2' } })
    await ready(b.container, 'empty')
  })
  it('an agent’s conversation, or nobody signed in: no card', () => {
    expect(mount({ role: 'agent', said: '租金收到了' }).container.querySelector('[data-testid="rent-record-card"]')).toBeNull()
    cleanup()
    db.user = null
    expect(mount({ said: '租金收到了' }).container.querySelector('[data-testid="rent-record-card"]')).toBeNull()
    expect(db.reads).toEqual([])
  })
  it('in English the card is English', async () => {
    localStorage.setItem('stayloop_lang', 'en')
    const { container: c } = mount({ said: 'I received October\'s rent' })
    await ready(c)
    await waitFor(() => expect(textOf(only(c, '[data-testid="rent-record-confirm"]'))).toBe('Confirm as received'))
    expect(periods(c)).toEqual([['2026-10-01', '1'], ['2026-11-01', '0']])
    expect(textOf(card(c))).not.toMatch(/[一-鿿]/)
    expect(textOf(period(c, '2026-10-01'))).toContain('Due Oct 1')
  })
})

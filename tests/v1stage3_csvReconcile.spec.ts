// V1.0 stage 3 · 甲 #4 (G10): bank-statement CSV reconciliation. The CSV is
// parsed in the browser only; the component writes nothing but mark_rent_paid.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseAmount, parseBankCsv, parseDateCell, proposeMatches, reconcileRecords, slashOrder, splitCsv, matchReasonText,
} from '../lib/household/csvReconcile'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')
const TODAY = '2026-10-16'

// ---------------------------------------------------------------------------
// Fixtures — one per bank, deposits and withdrawals mixed, mixed number formats.

const RBC = `﻿"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"
Chequing,01234-5678901,8/1/2026,,"e-Transfer received","MIA CHEN",2800.00,
Chequing,01234-5678901,8/3/2026,,"Payment","HYDRO ONE, ONLINE",-142.17,
Chequing,01234-5678901,9/2/2026,,"e-Transfer received","MIA CHEN","2,800.00",
Chequing,01234-5678901,9/15/2026,,"Payroll Deposit","ACME INC",3450.55,
`

const TD = `08/01/2026,E-TRANSFER MIA CHEN,,2800.00,5120.33
08/06/2026,ROGERS BILL PAYMENT,95.40,,5024.93
09/01/2026,E-TRANSFER MIA CHEN,,2800.00,7824.93
09/20/2026,GC 1234-DEPOSIT,,250.00,8074.93
`

const SCOTIA = `8/1/2026,2800.00,*,DEP,E-TFR FROM MIA CHEN
8/8/2026,-60.00,*,POS,PURCHASE CANADIAN TIRE
9/1/2026,2800.00,*,DEP,E-TFR FROM MIA CHEN
`

const CIBC = `2026-08-01,"INTERAC E-TRANSFER MIA CHEN",,2800.00
2026-08-11,"BELL CANADA",88.70,
2026-09-01,"INTERAC E-TRANSFER MIA CHEN",,2800.00
2026-09-01,"INTERAC E-TRANSFER J SMITH",,2800.00
`

const BMO = `Following data is valid as of 10/16/2026 9:12:04 AM

First Bank Card,Transaction Type,Date Posted,Transaction Amount,Description
'5555****1234',CREDIT,20260801,2800.00,[IN]E-TRANSFER MIA CHEN
'5555****1234',DEBIT,20260805,-45.00,[PR]PRESTO
'5555****1234',CREDIT,20260901,2800.00,[IN]E-TRANSFER MIA CHEN
`

const TANGERINE = `Date,Transaction,Name,Memo,Amount
8/1/2026,OTHER,INTERAC e-Transfer From: Mia Chen,RENT AUG,2800
8/9/2026,DEBIT,Netflix,,-22.99
9/1/2026,OTHER,INTERAC e-Transfer From: Mia Chen,RENT SEP,2800
`

const GENERIC = `Date,Description,Debit,Credit,Balance
2026-08-01,"Deposit, rent Aug (Chen)",,"$2,800.00","$5,000.00"
2026-08-02,Groceries,(120.50),,"$4,879.50"
`

// Ledger periods as rentLedger() hands them to the hub.
const periods = (dues: string[], extra: Partial<{ state: string; upcoming: boolean }> = {}) =>
  dues.map((due) => ({ due, state: 'due', upcoming: false, record: null, ...extra }))

describe('parseBankCsv — six bank formats', () => {
  it('RBC: header with Description 1/2 and CAD$; BOM and quoted thousands handled; withdrawals dropped', () => {
    const p = parseBankCsv(RBC)
    expect(p.format).toBe('rbc')
    expect(p.total).toBe(4)
    expect(p.rows.map((r) => [r.date, r.amount])).toEqual([['2026-08-01', 2800], ['2026-09-02', 2800], ['2026-09-15', 3450.55]])
    expect(p.rows[0].description).toContain('MIA CHEN')
    expect(p.rows[0].raw).toContain('e-Transfer received')
  })
  it('TD: no header, debit/credit/balance columns', () => {
    const p = parseBankCsv(TD)
    expect(p.format).toBe('td')
    expect(p.rows.map((r) => [r.date, r.amount])).toEqual([['2026-08-01', 2800], ['2026-09-01', 2800], ['2026-09-20', 250]])
  })
  it('Scotiabank: date, amount, *, type, description', () => {
    const p = parseBankCsv(SCOTIA)
    expect(p.format).toBe('scotiabank')
    expect(p.rows.map((r) => r.date)).toEqual(['2026-08-01', '2026-09-01'])
    expect(p.rows[0].description).toMatch(/E-TFR FROM MIA CHEN/)
  })
  it('CIBC: ISO date, description, debit, credit', () => {
    const p = parseBankCsv(CIBC)
    expect(p.format).toBe('cibc')
    expect(p.rows).toHaveLength(3)
    expect(p.rows.every((r) => r.amount === 2800)).toBe(true)
  })
  it('BMO: preamble lines, YYYYMMDD dates, signed Transaction Amount', () => {
    const p = parseBankCsv(BMO)
    expect(p.format).toBe('bmo')
    expect(p.rows.map((r) => [r.date, r.amount])).toEqual([['2026-08-01', 2800], ['2026-09-01', 2800]])
    expect(p.rows[0].description).toContain('E-TRANSFER MIA CHEN')
  })
  it('Tangerine / Simplii: Date, Transaction, Name, Memo, Amount', () => {
    const p = parseBankCsv(TANGERINE)
    expect(p.format).toBe('tangerine_simplii')
    expect(p.rows).toHaveLength(2)
    expect(p.rows[0].description).toContain('Mia Chen')
    expect(p.rows[0].description).toContain('RENT AUG')
  })
  it('generic header: Debit / Credit columns, $ and thousands, parenthesised negatives', () => {
    const p = parseBankCsv(GENERIC)
    expect(p.format).toBe('generic')
    expect(p.rows).toEqual([expect.objectContaining({ date: '2026-08-01', amount: 2800, description: 'Deposit, rent Aug (Chen)' })])
    expect(parseAmount('(120.50)')).toBe(-120.5)
    expect(parseAmount('$2,800.00')).toBe(2800)
    expect(parseAmount('2 800,50')).toBe(2800.5)
    expect(parseAmount('45.00 CR')).toBe(45)
    expect(parseAmount('abc')).toBeNull()
  })
  it('unrecognised or empty input does not throw', () => {
    expect(parseBankCsv('').format).toBe('unknown')
    expect(parseBankCsv('hello,world\nfoo,bar\n').format).toBe('unknown')
    expect(parseBankCsv('hello,world\nfoo,bar\n').warnings).toContain('unrecognized')
  })
  it('splitCsv keeps commas inside quotes and doubled quotes', () => {
    const r = splitCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')
    expect(r[0].cells).toEqual(['a', 'b, c', 'say "hi"'])
    expect(r[1].cells).toEqual(['1', '2', '3'])
  })
})

describe('dates — MDY vs DMY decided once per file', () => {
  it('any day > 12 in the first slot makes the whole file DMY', () => {
    expect(slashOrder(['01/09/2026', '15/09/2026'])).toBe('dmy')
    expect(parseDateCell('01/09/2026', 'dmy')).toBe('2026-09-01')
  })
  it('a day > 12 in the second slot makes it MDY; all ambiguous defaults to MDY with a warning', () => {
    expect(slashOrder(['9/15/2026', '9/1/2026'])).toBe('mdy')
    expect(slashOrder(['9/1/2026', '8/1/2026'])).toBe('mdy')
    const p = parseBankCsv(SCOTIA)
    expect(p.warnings).toContain('date_order_assumed_mdy')
    const td = parseBankCsv(TD)
    expect(td.warnings).not.toContain('date_order_assumed_mdy')
  })
  it('a DMY file is read as DMY throughout', () => {
    const csv = `Date,Description,Amount
01/09/2026,E-TRANSFER MIA CHEN,2800.00
15/09/2026,PAYROLL,3000.00
`
    const p = parseBankCsv(csv)
    expect(p.rows.map((r) => r.date)).toEqual(['2026-09-01', '2026-09-15'])
  })
  it('other spellings', () => {
    expect(parseDateCell('20260901')).toBe('2026-09-01')
    expect(parseDateCell('2026/09/01')).toBe('2026-09-01')
    expect(parseDateCell('Sep 1, 2026')).toBe('2026-09-01')
    expect(parseDateCell('1 Sep 2026')).toBe('2026-09-01')
    expect(parseDateCell('13/13/2026')).toBeNull()
    expect(parseDateCell('')).toBeNull()
  })
})

describe('proposeMatches', () => {
  const rows = parseBankCsv(RBC).rows
  it('matches each unrecorded period to the rent-sized deposit in its window and ignores recorded / upcoming periods', () => {
    const ps = [
      ...periods(['2026-08-01', '2026-09-01']),
      { due: '2026-07-01', state: 'paid', upcoming: false, record: { status: 'paid' } },
      { due: '2026-11-01', state: 'upcoming', upcoming: true, record: null },
    ]
    const r = proposeMatches(rows, ps, { monthlyRent: 2800, tenantName: 'Mia Chen', today: TODAY })
    expect(r.eligible).toBe(2)
    expect(r.matches.map((m) => [m.due, m.tx?.date, m.confidence])).toEqual([
      ['2026-08-01', '2026-08-01', 'exact'],
      ['2026-09-01', '2026-09-02', 'exact'],
    ])
    expect(r.unmatched).toEqual([])
    expect(reconcileRecords(r.matches)).toEqual([{ due: '2026-08-01', paid_on: '2026-08-01' }, { due: '2026-09-01', paid_on: '2026-09-02' }])
    expect(reconcileRecords(r.matches, ['2026-09-01'])).toEqual([{ due: '2026-09-01', paid_on: '2026-09-02' }])
  })
  it('a deposit is used once: two periods, one deposit → the second stays unmatched', () => {
    const one = rows.filter((x) => x.date === '2026-08-01')
    const r = proposeMatches(one, periods(['2026-08-01', '2026-09-01']), { monthlyRent: 2800, today: TODAY })
    expect(r.matches[0].tx?.date).toBe('2026-08-01')
    expect(r.matches[1]).toMatchObject({ due: '2026-09-01', confidence: 'none', reason: 'no_candidate' })
    expect(reconcileRecords(r.matches)).toHaveLength(1)
  })
  it('several candidates: the tenant-named one wins (exact), an unnamed tie falls back to the nearest date (likely)', () => {
    const cibc = parseBankCsv(CIBC).rows
    const r = proposeMatches(cibc, periods(['2026-09-01']), { monthlyRent: 2800, tenantName: 'Mia Chen', today: TODAY })
    expect(r.matches[0].tx?.description).toContain('MIA CHEN')
    expect(r.matches[0]).toMatchObject({ confidence: 'exact', reason: 'keyword' })
    // The J Smith deposit (and the August one with no August period) are rent-sized but unassigned → listed for the landlord.
    expect(r.unmatched.map((u) => [u.date, u.description])).toEqual([['2026-08-01', 'INTERAC E-TRANSFER MIA CHEN'], ['2026-09-01', 'INTERAC E-TRANSFER J SMITH']])

    const anon = [
      { date: '2026-09-03', description: 'DEPOSIT', amount: 2800, raw: '' },
      { date: '2026-09-20', description: 'DEPOSIT', amount: 2800, raw: '' },
    ]
    const r2 = proposeMatches(anon, periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY })
    expect(r2.matches[0]).toMatchObject({ confidence: 'likely', reason: 'closest' })
    expect(r2.matches[0].tx?.date).toBe('2026-09-03')
  })
  it('a deposit on the later period\'s due date is not stolen by the earlier period whose window also contains it', () => {
    const late = [
      { date: '2026-09-01', description: 'E-TRANSFER MIA CHEN', amount: 2800, raw: '' },
      { date: '2026-09-10', description: 'E-TRANSFER MIA CHEN', amount: 2800, raw: '' },
    ]
    const r = proposeMatches(late, periods(['2026-08-01', '2026-09-01']), { monthlyRent: 2800, tenantName: 'Mia Chen', today: TODAY })
    expect(r.matches.map((m) => [m.due, m.tx?.date])).toEqual([['2026-08-01', '2026-09-10'], ['2026-09-01', '2026-09-01']])
  })
  it('amount within ±1% but not exact → likely / near_amount; outside → none', () => {
    const near = [{ date: '2026-09-01', description: 'E-TRANSFER', amount: 2815, raw: '' }]
    const r = proposeMatches(near, periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY })
    expect(r.matches[0]).toMatchObject({ confidence: 'likely', reason: 'near_amount' })
    const far = [{ date: '2026-09-01', description: 'E-TRANSFER', amount: 2900, raw: '' }]
    expect(proposeMatches(far, periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY }).matches[0].confidence).toBe('none')
  })
  it('two periods paid together: one 2 × rent deposit covers two adjacent unmatched periods', () => {
    const dbl = [{ date: '2026-09-03', description: 'E-TRANSFER MIA CHEN', amount: 5600, raw: '' }]
    const r = proposeMatches(dbl, periods(['2026-08-01', '2026-09-01']), { monthlyRent: 2800, tenantName: 'Mia Chen', today: TODAY })
    expect(r.matches.map((m) => [m.due, m.tx?.amount, m.confidence, m.reason, m.pairedWith])).toEqual([
      ['2026-08-01', 5600, 'likely', 'double', '2026-09-01'],
      ['2026-09-01', 5600, 'likely', 'double', '2026-08-01'],
    ])
    expect(reconcileRecords(r.matches)).toEqual([{ due: '2026-08-01', paid_on: '2026-09-03' }, { due: '2026-09-01', paid_on: '2026-09-03' }])
    expect(r.unmatched).toEqual([])
    // Not adjacent (a recorded period in between) → no double match.
    const r2 = proposeMatches(dbl, periods(['2026-07-01', '2026-09-01']), { monthlyRent: 2800, today: TODAY })
    expect(r2.matches.every((m) => m.confidence === 'none')).toBe(true)
    expect(r2.unmatched).toHaveLength(1)
  })
  it('deposits outside the window (10 days before to 45 days after) do not match', () => {
    const early = [{ date: '2026-08-15', description: 'E-TRANSFER MIA CHEN', amount: 2800, raw: '' }]
    expect(proposeMatches(early, periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY }).matches[0].confidence).toBe('none')
    const late = [{ date: '2026-10-20', description: 'E-TRANSFER MIA CHEN', amount: 2800, raw: '' }]
    expect(proposeMatches(late, periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY }).matches[0].confidence).toBe('none')
    const edge = [{ date: '2026-08-22', description: 'E-TRANSFER MIA CHEN', amount: 2800, raw: '' }]
    expect(proposeMatches(edge, periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY }).matches[0].confidence).toBe('exact')
  })
  it('unmatched list: rent-sized deposits with no period, plus anything that says RENT', () => {
    const r = proposeMatches(rows, periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY })
    // Aug 1 deposit (rent-sized, no Aug period) is listed; the $3,450.55 payroll is not.
    expect(r.unmatched.map((u) => u.date)).toEqual(['2026-08-01'])
    const r2 = proposeMatches([{ date: '2026-09-01', description: 'RENT PARTIAL', amount: 1500, raw: '' }], periods(['2026-09-01']), { monthlyRent: 2800, today: TODAY })
    expect(r2.unmatched).toHaveLength(1)
  })
  it('a future-dated period is never eligible (mark_rent_paid would refuse it)', () => {
    const r = proposeMatches(rows, periods(['2026-11-01']), { monthlyRent: 2800, today: TODAY })
    expect(r.eligible).toBe(0)
  })
  it('reason text exists in both languages for every reason', () => {
    for (const reason of ['single', 'keyword', 'closest', 'near_amount', 'double', 'no_candidate'] as const) {
      const m = { due: '2026-09-01', confidence: 'likely' as const, reason, pairedWith: '2026-08-01' }
      expect(matchReasonText(m, true)).toBeTruthy()
      expect(matchReasonText(m, false)).toBeTruthy()
    }
  })
})

describe('the module and the component never leave the browser with the statement', () => {
  const mod = read('lib/household/csvReconcile.ts')
  const cmp = read('components/household/CsvReconcile.tsx')
  it('pure module: no React, no Supabase, no network', () => {
    expect(mod).not.toMatch(/from ['"]react['"]/)
    expect(mod).not.toMatch(/import .*supabase/i)
    expect(mod).not.toMatch(/\.rpc\(|\.from\(|fetch\(|localStorage|sessionStorage/)
  })
  it('component: reads with FileReader, writes only via mark_rent_paid; no upload, fetch, confirm or alert', () => {
    expect(cmp).toContain('FileReader')
    expect(cmp).toContain("supabase.rpc('mark_rent_paid'")
    expect(cmp).not.toMatch(/\.upload\(/)
    expect(cmp).not.toMatch(/fetch\(/)
    expect(cmp).not.toMatch(/window\.confirm|\bconfirm\(|\balert\(/)
    expect(cmp).not.toMatch(/\.from\(/)
    expect(cmp).toMatch(/不会上传或保存/)
    expect(cmp).toMatch(/never uploaded or saved/)
  })
})

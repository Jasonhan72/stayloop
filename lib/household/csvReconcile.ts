// Bank-statement CSV → rent-ledger reconciliation — pure (no React, no Supabase).
//
// V1.0 stage 3 甲 #4 (G10). Stayloop never handles money and never sees the
// statement: the CSV is parsed once in the landlord's browser, matched against
// the ledger periods, and the only thing that leaves the page is a list of
// `mark_rent_paid(p_lease, p_due, p_paid_on)` RPC calls the landlord ticked
// (the component makes them). Nothing here uploads, stores, or fetches.
//
// Formats (Canadian personal-banking exports, 2026):
//   RBC        header  "Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"
//   TD         no header: MM/DD/YYYY, description, debit, credit, balance
//   Scotiabank no header: date, amount, *, type, description
//   CIBC       no header: date, description, debit, credit[, card]
//   BMO        header  First Bank Card, Transaction Type, Date Posted, Transaction Amount, Description   (YYYYMMDD, preamble lines before it)
//   Tangerine / Simplii  header  Date, Transaction, Name, Memo, Amount
//   generic    any header with a date column + description + (amount | debit/credit)
//
// Slash dates (MM/DD vs DD/MM) are decided once for the whole file, the way
// the screening forensics do it (lib/forensics/recency.ts): any day > 12 in the
// first slot → DMY, in the second → MDY, otherwise MDY (every Canadian bank
// export above is month-first).

import { torontoDate } from './ledger'
import { isoDate, parseDateOnly } from '../dates'

export type BankCsvFormat = 'rbc' | 'td' | 'scotiabank' | 'cibc' | 'bmo' | 'tangerine_simplii' | 'generic' | 'unknown'

export type BankRow = {
  /** YYYY-MM-DD */
  date: string
  description: string
  /** Positive = money in. Only deposits are kept. */
  amount: number
  /** The CSV line as written, for the landlord to recognise. */
  raw: string
}

export type ParsedBankCsv = {
  rows: BankRow[]
  format: BankCsvFormat
  warnings: string[]
  /** How many records were read (deposits + withdrawals + unparseable). */
  total: number
}

export const BANK_FORMAT_LABEL: Record<BankCsvFormat, string> = {
  rbc: 'RBC',
  td: 'TD',
  scotiabank: 'Scotiabank',
  cibc: 'CIBC',
  bmo: 'BMO',
  tangerine_simplii: 'Tangerine / Simplii',
  generic: 'CSV',
  unknown: '?',
}

// ---------------------------------------------------------------------------
// CSV tokenising

/** RFC-4180-ish: quoted fields, doubled quotes, commas inside quotes, CRLF, BOM. */
export function splitCsv(text: string): { cells: string[]; raw: string }[] {
  const src = text.replace(/^﻿/, '')
  const out: { cells: string[]; raw: string }[] = []
  let cells: string[] = []
  let cell = ''
  let raw = ''
  let quoted = false
  const flushRecord = () => {
    cells.push(cell)
    if (cells.some((c) => c.trim() !== '')) out.push({ cells: cells.map((c) => c.trim()), raw })
    cells = []
    cell = ''
    raw = ''
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; raw += '""'; i++ } else { quoted = false; raw += ch }
      } else { cell += ch; raw += ch }
      continue
    }
    if (ch === '"') { quoted = true; raw += ch }
    else if (ch === ',') { cells.push(cell); cell = ''; raw += ch }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      flushRecord()
    } else { cell += ch; raw += ch }
  }
  if (cell !== '' || cells.length) flushRecord()
  return out
}

// ---------------------------------------------------------------------------
// Scalars

/** "$1,234.56" / "(45.00)" / "-45" / "45.00 CR" / "1 234,56" → number, or null. */
export function parseAmount(s: string | undefined | null): number | null {
  if (s == null) return null
  let t = String(s).trim()
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  if (/\bDR\b/i.test(t)) neg = true
  t = t.replace(/\b(CR|DR|CAD|USD)\b/gi, '').replace(/[$\s]/g, '')
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1) }
  else if (t.endsWith('-')) { neg = !neg; t = t.slice(0, -1) }
  else if (t.startsWith('+')) t = t.slice(1)
  // European style "1.234,56" only when a comma is the LAST separator with two digits after it.
  if (/^\d+(\.\d{3})*,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function ymd(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return isoDate(dt)
}

/**
 * One date cell → YYYY-MM-DD. `order` resolves the two-numbers-then-year case
 * (slash or dash); decide it once per file with `slashOrder`.
 */
export function parseDateCell(s: string | undefined | null, order: 'mdy' | 'dmy' = 'mdy'): string | null {
  if (!s) return null
  const t = String(s).trim()
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/))) return ymd(+m[1], +m[2], +m[3])
  if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) return ymd(+m[1], +m[2], +m[3])
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    const a = +m[1], b = +m[2], y = +m[3]
    return order === 'dmy' ? ymd(y, b, a) : ymd(y, a, b)
  }
  if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/))) {
    const a = +m[1], b = +m[2], y = 2000 + +m[3]
    return order === 'dmy' ? ymd(y, b, a) : ymd(y, a, b)
  }
  // "Jan 5, 2026" / "5 Jan 2026" / "January 05 2026"
  if ((m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()] ?? MONTHS[m[1].toLowerCase()]
    return mo ? ymd(+m[3], mo, +m[2]) : null
  }
  if ((m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()] ?? MONTHS[m[2].toLowerCase()]
    return mo ? ymd(+m[3], mo, +m[1]) : null
  }
  return null
}

const NUMERIC_DATE_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/

/** Whole-file decision for ambiguous two-number dates: any first slot > 12 → DMY; any second slot > 12 → MDY; else MDY. */
export function slashOrder(cells: string[]): 'mdy' | 'dmy' {
  let firstOver = false
  let secondOver = false
  for (const c of cells) {
    const m = c.trim().match(NUMERIC_DATE_RE)
    if (!m) continue
    if (+m[1] > 12) firstOver = true
    if (+m[2] > 12) secondOver = true
  }
  if (firstOver && !secondOver) return 'dmy'
  return 'mdy'
}

function looksLikeDate(s: string): boolean {
  return parseDateCell(s, 'mdy') !== null || parseDateCell(s, 'dmy') !== null
}

function looksLikeNumber(s: string): boolean {
  return s.trim() !== '' && parseAmount(s) !== null
}

// ---------------------------------------------------------------------------
// Format detection

type ColumnMap = {
  format: BankCsvFormat
  headerIndex: number // -1 = headerless
  date: number
  desc: number[]
  amount?: number
  debit?: number
  credit?: number
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9$]+/g, ' ').trim()
}

function detectHeader(records: { cells: string[] }[]): ColumnMap | null {
  const limit = Math.min(records.length, 12)
  for (let i = 0; i < limit; i++) {
    const cells = records[i].cells.map(norm)
    const has = (...names: string[]) => cells.findIndex((c) => names.includes(c))
    // RBC
    if (has('transaction date') >= 0 && has('cad$') >= 0 && has('account type') >= 0) {
      return {
        format: 'rbc', headerIndex: i, date: has('transaction date'),
        desc: [has('description 1'), has('description 2')].filter((x) => x >= 0),
        amount: has('cad$'),
      }
    }
    // BMO (preamble lines before the header)
    if (has('date posted') >= 0 && has('transaction amount') >= 0) {
      return {
        format: 'bmo', headerIndex: i, date: has('date posted'),
        desc: [has('description'), has('transaction type')].filter((x) => x >= 0),
        amount: has('transaction amount'),
      }
    }
    // Tangerine / Simplii
    if (has('date') >= 0 && has('transaction') >= 0 && has('name') >= 0 && has('amount') >= 0) {
      return {
        format: 'tangerine_simplii', headerIndex: i, date: has('date'),
        desc: [has('name'), has('memo'), has('transaction')].filter((x) => x >= 0),
        amount: has('amount'),
      }
    }
    // Generic header
    const preferred = cells.findIndex((c) => /\bdate\b/.test(c) && !/\b(due|value)\b/.test(c))
    const dateIdx = preferred >= 0 ? preferred : cells.findIndex((c) => /\bdate\b/.test(c))
    if (dateIdx < 0) continue
    const inOut = /\b(in|out|debit|debits|credit|credits|deposit|deposits|withdrawal|withdrawals)\b/
    const amountIdx = cells.findIndex((c) => (/\bamount\b/.test(c) || c === 'cad$' || c === 'cad') && !inOut.test(c))
    const creditIdx = cells.findIndex((c) => /\b(credit|credits|deposit|deposits|money in|in|received)\b/.test(c) && !/\bcard\b/.test(c))
    const debitIdx = cells.findIndex((c) => /\b(debit|debits|withdrawal|withdrawals|money out|out|paid out)\b/.test(c) && !/\bcard\b/.test(c))
    if (amountIdx < 0 && creditIdx < 0) continue
    const desc = cells
      .map((c, k) => (/\b(description|desc|memo|details|detail|name|payee|narrative|transaction|particulars|reference)\b/.test(c) ? k : -1))
      .filter((k) => k >= 0 && k !== dateIdx && k !== amountIdx && k !== creditIdx && k !== debitIdx)
    if (!desc.length) continue
    return {
      format: 'generic', headerIndex: i, date: dateIdx, desc,
      amount: amountIdx >= 0 ? amountIdx : undefined,
      credit: creditIdx >= 0 ? creditIdx : undefined,
      debit: debitIdx >= 0 ? debitIdx : undefined,
    }
  }
  return null
}

function detectHeaderless(records: { cells: string[] }[]): ColumnMap | null {
  const sample = records.slice(0, 8).filter((r) => r.cells.length >= 4)
  if (!sample.length) return null
  const all = (pred: (c: string[]) => boolean) => sample.every((r) => pred(r.cells))
  // Scotiabank: date, amount, *, type, description
  if (all((c) => looksLikeDate(c[0]) && looksLikeNumber(c[1]) && c.length >= 5 && (c[2] === '*' || c[2] === '') && !looksLikeNumber(c[4] ?? 'x'))) {
    return { format: 'scotiabank', headerIndex: -1, date: 0, desc: [4, 3], amount: 1 }
  }
  // TD: MM/DD/YYYY, description, debit, credit, balance
  if (all((c) => c.length >= 5 && looksLikeDate(c[0]) && !looksLikeNumber(c[1]) && (c[2] === '' || looksLikeNumber(c[2])) && (c[3] === '' || looksLikeNumber(c[3])) && looksLikeNumber(c[4]))) {
    const iso = sample.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.cells[0]))
    return { format: iso ? 'cibc' : 'td', headerIndex: -1, date: 0, desc: [1], debit: 2, credit: 3 }
  }
  // CIBC: date, description, debit, credit[, card number]
  if (all((c) => looksLikeDate(c[0]) && !looksLikeNumber(c[1]) && (c[2] === '' || looksLikeNumber(c[2])) && (c[3] === '' || looksLikeNumber(c[3])))) {
    return { format: 'cibc', headerIndex: -1, date: 0, desc: [1], debit: 2, credit: 3 }
  }
  // Headerless date, description, amount
  if (all((c) => looksLikeDate(c[0]) && !looksLikeNumber(c[1]) && looksLikeNumber(c[2]))) {
    return { format: 'generic', headerIndex: -1, date: 0, desc: [1], amount: 2 }
  }
  return null
}

// ---------------------------------------------------------------------------
// Parse

export function parseBankCsv(text: string): ParsedBankCsv {
  const warnings: string[] = []
  const records = splitCsv(text)
  if (!records.length) return { rows: [], format: 'unknown', warnings: ['empty'], total: 0 }
  const map = detectHeader(records) ?? detectHeaderless(records)
  if (!map) return { rows: [], format: 'unknown', warnings: ['unrecognized'], total: records.length }
  const body = records.slice(map.headerIndex + 1)
  const order = slashOrder(body.map((r) => r.cells[map.date] ?? ''))
  const ambiguous = body.some((r) => { const m = (r.cells[map.date] ?? '').trim().match(NUMERIC_DATE_RE); return !!m && +m[1] <= 12 && +m[2] <= 12 })
  if (ambiguous && !body.some((r) => { const m = (r.cells[map.date] ?? '').trim().match(NUMERIC_DATE_RE); return !!m && (+m[1] > 12 || +m[2] > 12) })) {
    warnings.push('date_order_assumed_mdy')
  }
  const rows: BankRow[] = []
  let bad = 0
  let deposits = 0
  for (const r of body) {
    const c = r.cells
    if (c.length <= map.date) { bad++; continue }
    const date = parseDateCell(c[map.date], order)
    if (!date) { bad++; continue }
    let amount: number | null = null
    if (map.amount != null) amount = parseAmount(c[map.amount])
    if (amount == null && (map.credit != null || map.debit != null)) {
      const cr = map.credit != null ? parseAmount(c[map.credit]) : null
      const db = map.debit != null ? parseAmount(c[map.debit]) : null
      if (cr != null && cr !== 0) amount = Math.abs(cr)
      else if (db != null && db !== 0) amount = -Math.abs(db)
      else if (cr != null || db != null) amount = 0
    }
    if (amount == null) { bad++; continue }
    const description = map.desc.map((k) => c[k] ?? '').filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim()
    if (amount > 0) {
      deposits++
      rows.push({ date, description, amount: Math.round(amount * 100) / 100, raw: r.raw })
    }
  }
  if (bad) warnings.push(`skipped_rows:${bad}`)
  if (!deposits) warnings.push('no_deposits')
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { rows, format: map.format, warnings, total: body.length }
}

// ---------------------------------------------------------------------------
// Matching

export type MatchConfidence = 'exact' | 'likely' | 'none'
export type MatchReason =
  | 'single'          // one deposit of the rent amount in the window
  | 'keyword'         // several candidates; this one names the tenant / e-transfer / rent
  | 'closest'         // several candidates, none decisive; the one nearest the due date
  | 'near_amount'     // within tolerance but not the exact rent
  | 'double'          // one deposit of 2 × rent covering this and the adjacent period
  | 'no_candidate'    // nothing in the window of the right amount

export type PeriodMatch = {
  due: string
  tx?: BankRow
  confidence: MatchConfidence
  reason: MatchReason
  /** For 'double': the other period the same deposit covers. */
  pairedWith?: string
}

export type ReconcileResult = {
  matches: PeriodMatch[]
  /** Deposits that look like rent (≈ rent or ≈ 2 × rent, or say RENT) but found no period. */
  unmatched: BankRow[]
  eligible: number
}

type PeriodLike = { due: string; state: string; upcoming?: boolean; record?: { status?: string | null } | null }

export const MATCH_WINDOW_BEFORE_DAYS = 10
export const MATCH_WINDOW_AFTER_DAYS = 45

function addDays(iso: string, days: number): string {
  const d = parseDateOnly(iso)
  return d ? isoDate(new Date(d.getTime() + days * 86_400_000)) : iso
}

function dayDiff(a: string, b: string): number {
  const x = parseDateOnly(a), y = parseDateOnly(b)
  return x && y ? Math.round((x.getTime() - y.getTime()) / 86_400_000) : Number.MAX_SAFE_INTEGER
}

function nameTokens(name: string | undefined | null): string[] {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9一-鿿]+/)
    .filter((t) => t.length >= 2)
}

/** 0 = nothing; name tokens count 2 each, RENT / E-TRANSFER / INTERAC 1 each. */
export function keywordScore(description: string, tenantName?: string | null): number {
  const d = description.toLowerCase()
  let s = 0
  for (const t of nameTokens(tenantName)) if (d.includes(t)) s += 2
  if (/\brent\b|租/.test(d)) s += 1
  if (/e-?transfer|etfr|interac|e-tfr|email money|emt\b/.test(d)) s += 1
  return s
}

function within(amount: number, target: number, tolerance: number): boolean {
  return Math.abs(amount - target) <= Math.max(0.005, target * tolerance) + 1e-9
}

function exactAmount(amount: number, target: number): boolean {
  return Math.abs(amount - target) < 0.005
}

export function isEligiblePeriod(p: PeriodLike, today: string): boolean {
  if (p.state !== 'due' && p.state !== 'late') return false
  if (p.upcoming) return false
  if (p.due > today) return false
  const st = p.record?.status
  if (st === 'paid' || st === 'late') return false
  return true
}

export function proposeMatches(
  rows: BankRow[],
  periods: PeriodLike[],
  opts: { monthlyRent: number; tenantName?: string | null; tolerance?: number; today?: string },
): ReconcileResult {
  const rent = Math.round(opts.monthlyRent * 100) / 100
  const tol = opts.tolerance ?? 0.01
  const today = opts.today ?? torontoDate()
  const eligible = periods.filter((p) => isEligiblePeriod(p, today)).map((p) => p.due).sort()
  if (!(rent > 0) || !eligible.length) {
    return { matches: eligible.map((due) => ({ due, confidence: 'none', reason: 'no_candidate' })), unmatched: rentLike(rows, rent, tol), eligible: eligible.length }
  }
  const used = new Set<BankRow>()
  const assigned = new Map<string, PeriodMatch>()

  // Pass 1 — single-period deposits. Score every (period, deposit) pair and take the best
  // pair first across the whole file, so a deposit that sits on one period's due date is not
  // grabbed by an earlier period whose window also happens to contain it.
  type Pair = { due: string; tx: BankRow; kw: number; dist: number; exact: boolean; nCand: number }
  const pairs: Pair[] = []
  const candCount = new Map<string, number>()
  for (const due of eligible) {
    const lo = addDays(due, -MATCH_WINDOW_BEFORE_DAYS)
    const hi = addDays(due, MATCH_WINDOW_AFTER_DAYS)
    const cands = rows.filter((r) => r.date >= lo && r.date <= hi && within(r.amount, rent, tol))
    candCount.set(due, cands.length)
    for (const tx of cands) {
      pairs.push({ due, tx, kw: keywordScore(tx.description, opts.tenantName), dist: Math.abs(dayDiff(tx.date, due)), exact: exactAmount(tx.amount, rent), nCand: cands.length })
    }
  }
  pairs.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || b.kw - a.kw || a.dist - b.dist || (a.tx.date < b.tx.date ? -1 : 1))
  for (const p of pairs) {
    if (assigned.has(p.due) || used.has(p.tx)) continue
    used.add(p.tx)
    let reason: MatchReason
    let confidence: MatchConfidence
    if (!p.exact) { reason = 'near_amount'; confidence = 'likely' }
    else if (p.nCand === 1) { reason = 'single'; confidence = 'exact' }
    else if (p.kw > 0) { reason = 'keyword'; confidence = 'exact' }
    else { reason = 'closest'; confidence = 'likely' }
    assigned.set(p.due, { due: p.due, tx: p.tx, confidence, reason })
  }

  // Pass 2 — one deposit of 2 × rent covering two adjacent unmatched periods.
  const remaining = eligible.filter((d) => !assigned.has(d))
  for (let i = 0; i + 1 < remaining.length; i++) {
    const a = remaining[i], b = remaining[i + 1]
    if (assigned.has(a) || assigned.has(b)) continue
    if (dayDiff(b, a) > 35) continue
    const lo = addDays(a, -MATCH_WINDOW_BEFORE_DAYS)
    const hi = addDays(b, MATCH_WINDOW_AFTER_DAYS)
    const cands = rows
      .filter((r) => !used.has(r) && r.date >= lo && r.date <= hi && within(r.amount, rent * 2, tol))
      .map((tx) => ({ tx, kw: keywordScore(tx.description, opts.tenantName), dist: Math.min(Math.abs(dayDiff(tx.date, a)), Math.abs(dayDiff(tx.date, b))) }))
      .sort((x, y) => y.kw - x.kw || x.dist - y.dist)
    if (!cands.length) continue
    const { tx } = cands[0]
    used.add(tx)
    assigned.set(a, { due: a, tx, confidence: 'likely', reason: 'double', pairedWith: b })
    assigned.set(b, { due: b, tx, confidence: 'likely', reason: 'double', pairedWith: a })
    i++
  }

  // Pass 2b — a 2 × rent deposit where only ONE of the two adjacent periods is still unrecorded
  // (the other is already paid / late): the unrecorded period gets a 'likely' double match, paired
  // with the recorded neighbour. Only the unrecorded period is ever written (D-F-03).
  const recorded = periods.filter((p) => !isEligiblePeriod(p, today) && (p.record?.status === 'paid' || p.record?.status === 'late')).map((p) => p.due)
  for (const a of eligible) {
    if (assigned.has(a)) continue
    const neighbour = recorded.find((r) => Math.abs(dayDiff(r, a)) <= 35)
    if (!neighbour) continue
    const first = neighbour < a ? neighbour : a, last = neighbour < a ? a : neighbour
    const lo = addDays(first, -MATCH_WINDOW_BEFORE_DAYS)
    const hi = addDays(last, MATCH_WINDOW_AFTER_DAYS)
    const cands = rows
      .filter((r) => !used.has(r) && r.date >= lo && r.date <= hi && within(r.amount, rent * 2, tol))
      .map((tx) => ({ tx, kw: keywordScore(tx.description, opts.tenantName), dist: Math.min(Math.abs(dayDiff(tx.date, a)), Math.abs(dayDiff(tx.date, neighbour))) }))
      .sort((x, y) => y.kw - x.kw || x.dist - y.dist)
    if (!cands.length) continue
    used.add(cands[0].tx)
    assigned.set(a, { due: a, tx: cands[0].tx, confidence: 'likely', reason: 'double', pairedWith: neighbour })
  }

  const matches: PeriodMatch[] = eligible.map((due) => assigned.get(due) ?? { due, confidence: 'none', reason: 'no_candidate' })
  const unmatched = rentLike(rows.filter((r) => !used.has(r)), rent, tol)
  return { matches, unmatched, eligible: eligible.length }
}

function rentLike(rows: BankRow[], rent: number, tol: number): BankRow[] {
  if (!(rent > 0)) return rows.filter((r) => /\brent\b|租/i.test(r.description))
  return rows.filter((r) => within(r.amount, rent, tol) || within(r.amount, rent * 2, tol) || (/\brent\b|租/i.test(r.description) && r.amount >= rent * 0.5))
}

// ---------------------------------------------------------------------------
// What to write

export type MarkPaidParams = { due: string; paid_on: string }

/**
 * The `mark_rent_paid` calls for the ticked matches: paid_on is the deposit's date.
 * `selected` restricts to those dues (the landlord's checkboxes); omitted = every match with a deposit.
 */
export function reconcileRecords(matches: PeriodMatch[], selected?: Iterable<string>): MarkPaidParams[] {
  const sel = selected ? new Set(selected) : null
  return matches
    .filter((m) => m.tx && m.confidence !== 'none' && (!sel || sel.has(m.due)))
    .map((m) => ({ due: m.due, paid_on: m.tx!.date }))
}

// ---------------------------------------------------------------------------
// Copy (the component shows these; kept here so tests pin the wording)

export function matchReasonText(m: PeriodMatch, zh: boolean): string {
  switch (m.reason) {
    case 'single': return zh ? '窗口内只有这一笔等于月租的入账' : 'The only deposit of the rent amount in the window'
    case 'keyword': return zh ? '多笔候选，这笔的描述里有租客姓名或 e-Transfer / 租金字样' : 'Several candidates; this one names the tenant or says e-Transfer / rent'
    case 'closest': return zh ? '多笔候选，取离到期日最近的一笔——请核对' : 'Several candidates; the one nearest the due date — please check'
    case 'near_amount': return zh ? '金额接近但不等于月租（±1%）——请核对' : 'Close to the rent but not exact (±1%) — please check'
    case 'double': return zh ? `一笔两倍月租的入账，同时覆盖 ${m.pairedWith ?? ''} 那一期` : `One deposit of twice the rent, also covering ${m.pairedWith ?? ''}`
    case 'no_candidate': return zh ? '到期日前 10 天到后 45 天内没有等于月租的入账' : 'No deposit of the rent amount from 10 days before to 45 days after the due date'
  }
}

export function warningText(w: string, zh: boolean): string {
  if (w === 'empty') return zh ? '文件是空的。' : 'The file is empty.'
  if (w === 'unrecognized') return zh ? '认不出这个文件的列：需要有日期、描述和金额（或借方 / 贷方）列。' : 'Could not recognise the columns: a date, a description and an amount (or debit / credit) column are needed.'
  if (w === 'no_deposits') return zh ? '文件里没有入账（金额为正的行）。' : 'No deposits (rows with a positive amount) in the file.'
  if (w === 'date_order_assumed_mdy') return zh ? '日期里月和日都不超过 12，按「月/日/年」读取（加拿大银行导出的惯例）。' : 'Every date has month and day ≤ 12; read as month/day/year (the Canadian bank-export convention).'
  const m = w.match(/^skipped_rows:(\d+)$/)
  if (m) return zh ? `跳过了 ${m[1]} 行读不出日期或金额的记录。` : `Skipped ${m[1]} row(s) with no readable date or amount.`
  return w
}

/** The same wording the hub uses for mark_rent_paid failures. */
export function markPaidErrorText(message: string, zh: boolean): string {
  if (/future_period/.test(message)) return zh ? '这一期还没到期，到期后再标记。' : 'This period is not due yet; mark it once it is due.'
  if (/not_a_member/.test(message)) return zh ? '只有这份租约的成员可以记录租金。' : 'Only members of this tenancy can record rent.'
  if (/before_lease/.test(message)) return zh ? '这一期早于起租日，不能记录。' : 'This period is before the lease start.'
  if (/no_rent_amount/.test(message)) return zh ? '租约上没有月租金额，无法记录。' : 'The lease has no monthly rent to record.'
  if (/bad_paid_date/.test(message)) return zh ? '付款日期不对：不能晚于今天，也不能早于到期日 62 天以上。' : 'Check the payment date: it cannot be after today or more than 62 days before the due date.'
  if (/after_lease/.test(message)) return zh ? '这一期在上一期租约结束之后，属于新租约的账期。' : 'This period is after the previous lease ended; it belongs to the new lease.'
  return zh ? `没有记录成功：${message}` : `Not recorded: ${message}`
}

// Is a Realtor.ca-imported listing still listed? Pure functions; the cron
// route (app/api/cron/realtor-freshness) does the I/O.
//
// Measured 2026-10-03: a withdrawn/leased listing's detail URL answers with
// "The listing you are looking for no longer exists." followed by Similar
// Listings (whose $X/Monthly lines are OTHER units), while its CDN photos keep
// returning 200 — so only the page itself can say it's gone. A live page
// carries "MLS® Number: <mls>" and its own price as the first $X/Monthly.
import { classifyRealtorPage } from '@/lib/agent/listingSearch'

export type RealtorReading =
  | { kind: 'live'; rent: number | null }
  | { kind: 'gone' }
  | { kind: 'blocked' }
  | { kind: 'unknown' }
  | { kind: 'error'; status: number }
  | { kind: 'no_url' }

export type RealtorCheckState = RealtorReading['kind']

export type RealtorCheck = {
  checked_at: string
  state: RealtorCheckState
  /** Consecutive "no longer exists" readings. */
  gone_streak: number
  /** Consecutive readings that were neither live nor gone (bot check, layout change, Jina down). */
  miss_streak: number
  last_live_at?: string | null
  rent_seen?: number | null
  delisted_at?: string | null
  rent_changed_at?: string | null
}

/** Two independent "no longer exists" readings (at least an hour apart) before going offline. */
export const GONE_CONFIRMATIONS = 2
/** Readings per cron run. */
export const REALTOR_BATCH = 20

const GONE_RE = /The listing you are looking for no longer exists|L['’]inscription que vous recherchez n['’]existe plus/i

export function classifyRealtorDetail(text: string, mls: string | null | undefined): RealtorReading {
  if (classifyRealtorPage(text) === 'blocked') return { kind: 'blocked' }
  if (GONE_RE.test(text)) return { kind: 'gone' }
  const own = text.split(/^#+\s*Similar Listings/im)[0]
  const id = (mls || '').trim()
  const live =
    !!id &&
    (new RegExp(`MLS®?\\s*Number:?\\s*${escapeRe(id)}\\b`, 'i').test(own) ||
      new RegExp(`/${escapeRe(id.toLowerCase())}_\\d+\\.jpg`).test(own))
  if (!live) return { kind: 'unknown' }
  const m = own.match(/\$([\d,]+(?:\.\d{2})?)\s*\/\s*Monthly/i)
  const rent = m ? Number(m[1].replace(/,/g, '')) : null
  return { kind: 'live', rent: rent && Number.isFinite(rent) && rent > 0 ? rent : null }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A price on the page we'd trust enough to replace the stored rent. */
export function plausibleRentChange(seen: number | null | undefined, current: number | null | undefined): boolean {
  if (!seen || !current) return false
  if (Math.round(seen) === Math.round(current)) return false
  const r = seen / current
  return r >= 0.5 && r <= 2
}

export function applyReading(
  prev: RealtorCheck | null | undefined,
  reading: RealtorReading,
  currentRent: number | null,
  now: Date,
): { check: RealtorCheck; delist: boolean; newRent: number | null } {
  const at = now.toISOString()
  const goneStreak = reading.kind === 'gone' ? (prev?.gone_streak ?? 0) + 1 : reading.kind === 'live' ? 0 : prev?.gone_streak ?? 0
  const missStreak = reading.kind === 'live' || reading.kind === 'gone' ? 0 : (prev?.miss_streak ?? 0) + 1
  const delist = reading.kind === 'gone' && goneStreak >= GONE_CONFIRMATIONS
  const seen = reading.kind === 'live' ? reading.rent : null
  const newRent = reading.kind === 'live' && plausibleRentChange(seen, currentRent) ? seen : null
  const check: RealtorCheck = {
    checked_at: at,
    state: reading.kind,
    gone_streak: goneStreak,
    miss_streak: missStreak,
    last_live_at: reading.kind === 'live' ? at : prev?.last_live_at ?? null,
    rent_seen: seen ?? prev?.rent_seen ?? null,
    delisted_at: delist ? at : prev?.delisted_at ?? null,
    rent_changed_at: newRent != null ? at : prev?.rent_changed_at ?? null,
  }
  return { check, delist, newRent }
}

type Candidate = { id: string; source_url: string | null; realtor_check: RealtorCheck | null }

/**
 * Which rows to read this run: suspected-gone first (so the confirming read
 * comes on the next run, not hours later), then never-checked, then oldest.
 * A suspect is re-read only after an hour, so the two readings are independent.
 */
export function pickBatch<T extends Candidate>(rows: T[], now: Date, size = REALTOR_BATCH): T[] {
  const hourAgo = now.getTime() - 3600_000
  const t = (r: T) => (r.realtor_check?.checked_at ? Date.parse(r.realtor_check.checked_at) : 0)
  const suspect = (r: T) => (r.realtor_check?.gone_streak ?? 0) > 0
  return rows
    .filter((r) => !(suspect(r) && t(r) > hourAgo))
    .sort((a, b) => Number(suspect(b)) - Number(suspect(a)) || t(a) - t(b))
    .slice(0, size)
}

export type FreshnessSummary = {
  total: number
  live: number
  suspect: number
  stale: number
  never: number
  noUrl: number
  delisted: number
  lastRun: string | null
}

/** Admin card numbers. `stale` = 3+ readings in a row that couldn't tell (needs a human look). */
export function summarize(
  active: { source_url: string | null; realtor_check: RealtorCheck | null }[],
  delistedCount: number,
): FreshnessSummary {
  let lastRun: string | null = null
  const s: FreshnessSummary = { total: active.length, live: 0, suspect: 0, stale: 0, never: 0, noUrl: 0, delisted: delistedCount, lastRun }
  for (const r of active) {
    const c = r.realtor_check
    if (!r.source_url) { s.noUrl++; continue }
    if (!c) { s.never++; continue }
    if (!lastRun || c.checked_at > lastRun) lastRun = c.checked_at
    if (c.gone_streak > 0) s.suspect++
    else if (c.miss_streak >= 3) s.stale++
    else if (c.state === 'live' || c.last_live_at) s.live++
  }
  s.lastRun = lastRun
  return s
}

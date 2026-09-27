// Services marketplace · 节点 3 「可执行」 (2026-09-26). Pure rules for the
// contractor SLA, the decline reason, quote versions, on-time arrival and the
// credential-expiry reminder ladder. The server (lib/marketplace/server.ts,
// lib/marketplace/sweep.ts) loads rows and acts; the cards and pages only
// display what these functions say.

export const QUOTE_HOURS_DEFAULT = 48
export const QUOTE_HOURS_MIN = 24
export const QUOTE_HOURS_MAX = 72
/** "Soon" = the last third of a 48 h window; the card turns amber. */
export const QUOTE_SOON_HOURS = 12

export function clampQuoteHours(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return QUOTE_HOURS_DEFAULT
  return Math.min(Math.max(Math.round(n), QUOTE_HOURS_MIN), QUOTE_HOURS_MAX)
}

/** ISO due date for an offer made at `offeredAt` under a policy of `hours`. */
export function quoteDueAt(offeredAt: string | Date, hours: number): string {
  const t = typeof offeredAt === 'string' ? new Date(offeredAt).getTime() : offeredAt.getTime()
  return new Date(t + clampQuoteHours(hours) * 3_600_000).toISOString()
}

export type SlaState = { kind: 'due' | 'soon' | 'overdue'; hours: number; dueAt: string }

/** Where an unanswered offer stands against its deadline (null when the row has none). Hours are whole, ≥ 0. */
export function slaState(quoteDueAtIso: string | null | undefined, now = new Date()): SlaState | null {
  if (!quoteDueAtIso) return null
  const due = new Date(quoteDueAtIso).getTime()
  if (isNaN(due)) return null
  const diffH = (due - now.getTime()) / 3_600_000
  if (diffH < 0) return { kind: 'overdue', hours: Math.max(1, Math.floor(-diffH)), dueAt: quoteDueAtIso }
  return { kind: diffH <= QUOTE_SOON_HOURS ? 'soon' : 'due', hours: Math.max(0, Math.ceil(diffH)), dueAt: quoteDueAtIso }
}

export function slaLabel(s: SlaState, zh: boolean): string {
  if (s.kind === 'overdue') return zh ? `报价已逾期 ${s.hours} 小时 · 房东可能改派` : `Quote overdue by ${s.hours} h · the landlord may reassign`
  if (s.kind === 'soon') return zh ? `报价截止：还有 ${s.hours} 小时` : `Quote due in ${s.hours} h`
  return zh ? `请在 ${s.hours} 小时内报价` : `Quote within ${s.hours} h`
}

// ── Decline reasons ────────────────────────────────────────────────────────
export const DECLINE_CODES = ['no_capacity', 'out_of_area', 'not_my_trade', 'scope_unclear', 'price', 'other'] as const
export type DeclineCode = (typeof DECLINE_CODES)[number]
export const DECLINE_LABEL: Record<DeclineCode, { zh: string; en: string }> = {
  no_capacity: { zh: '近期排不开', en: 'No capacity right now' },
  out_of_area: { zh: '不在服务范围', en: 'Outside my service area' },
  not_my_trade: { zh: '不是我的工种', en: 'Not my trade' },
  scope_unclear: { zh: '问题描述不清 / 需先看现场', en: 'Scope unclear / needs a site visit first' },
  price: { zh: '预算或价格不合', en: 'Budget / price' },
  other: { zh: '其他（请说明）', en: 'Other (please say)' },
}

/** A decline must carry a code; "other" must carry a note. Notes are capped at 1000 chars. */
export function validateDecline(p: { code?: unknown; reason?: unknown }): { ok: true; value: { code: DeclineCode; note: string | null } } | { ok: false; reason: 'decline_reason_required' } {
  const code = typeof p.code === 'string' && (DECLINE_CODES as readonly string[]).includes(p.code) ? (p.code as DeclineCode) : null
  const note = String(p.reason ?? '').trim().slice(0, 1000) || null
  if (!code) return { ok: false, reason: 'decline_reason_required' }
  if (code === 'other' && (!note || note.length < 2)) return { ok: false, reason: 'decline_reason_required' }
  return { ok: true, value: { code, note } }
}

export function declineText(code: string | null | undefined, note: string | null | undefined, zh: boolean): string {
  const label = code && (DECLINE_CODES as readonly string[]).includes(code) ? (zh ? DECLINE_LABEL[code as DeclineCode].zh : DECLINE_LABEL[code as DeclineCode].en) : null
  return [label, note].filter(Boolean).join(zh ? ' · ' : ' · ') || '—'
}

// ── Arrival ────────────────────────────────────────────────────────────────
/** On time = arrived no later than `graceMin` after the start of the window (null when either stamp is missing). */
export function arrivedOnTime(scheduleStart: string | null | undefined, arrivedAt: string | null | undefined, graceMin = 15): boolean | null {
  if (!scheduleStart || !arrivedAt) return null
  const s = new Date(scheduleStart).getTime(); const a = new Date(arrivedAt).getTime()
  if (isNaN(s) || isNaN(a)) return null
  return a <= s + graceMin * 60_000
}

// ── Credential expiry reminder ladder ──────────────────────────────────────
/** Days before expiry at which one reminder goes out; 0 = the day it has expired. */
export const REMINDER_TIERS = [90, 60, 30, 7] as const
export type ReminderTier = 90 | 60 | 30 | 7 | 0

export function daysUntil(dateOnly: string, today = new Date()): number {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((new Date(dateOnly + 'T00:00:00Z').getTime() - t) / 86_400_000)
}

/**
 * Which tiers are due for a credential given what was already sent. `send` is
 * the single tier to notify now (the lowest due one, so a credential added with
 * 50 days left gets one "60 天" mail, not a 90 + 60 pair); `mark` lists every
 * tier that should be recorded as sent so the ladder never back-fills.
 * Nothing is due more than 30 days after expiry (the provider has been told
 * twice; coverage already excludes it).
 */
export function dueReminder(expiresAt: string, sent: readonly number[], today = new Date()): { daysLeft: number; send: ReminderTier | null; mark: ReminderTier[] } {
  const daysLeft = daysUntil(expiresAt, today)
  const mark: ReminderTier[] = []
  if (daysLeft < 0) {
    if (daysLeft >= -30 && !sent.includes(0)) mark.push(0)
    for (const t of REMINDER_TIERS) if (!sent.includes(t)) mark.push(t)
    return { daysLeft, send: mark.includes(0) ? 0 : null, mark }
  }
  for (const t of REMINDER_TIERS) if (daysLeft <= t && !sent.includes(t)) mark.push(t)
  const send = mark.length ? (Math.min(...mark) as ReminderTier) : null
  return { daysLeft, send, mark }
}

/** Banner tone for a credential `days` from expiry (the page colours by tier). */
export function expiryTone(days: number): 'expired' | 'critical' | 'warn' | 'notice' | 'info' | null {
  if (days < 0) return 'expired'
  if (days <= 7) return 'critical'
  if (days <= 30) return 'warn'
  if (days <= 60) return 'notice'
  if (days <= 90) return 'info'
  return null
}

// Thread hash chain · v1 (消息系统 A 期, 2026-09-29).
//
// Every thread_messages row carries prev_hash and hash, written by the database
// trigger thread_messages_chain(): hash = sha256(canonical(row, prev_hash)),
// where the first message of a thread uses prev_hash 'genesis'. This file
// reproduces public.thread_message_canonical() byte for byte, so anyone holding
// an export can recompute the chain; a deleted, inserted or edited message
// breaks every hash after it.
//
// Pure (WebCrypto only) — runs in the browser, on the edge and in tests.

export const CHAIN_VERSION = 'stayloop-thread-v1'
export const GENESIS = 'genesis'

export type ChainAttachment = { path: string; sha256: string }
export type ChainMessage = {
  id: number
  thread_id: string
  created_at: string
  sender_id: string | null
  sender_kind: string
  acting_role: string | null
  kind: string
  channel: string | null
  ref_message_id: number | null
  attachments: ChainAttachment[] | null
  body: string
  prev_hash?: string | null
  hash?: string | null
}

/**
 * Postgres `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
 * from a PostgREST timestamp ("2026-09-27T00:17:12.34567+00:00"). Keeps
 * microseconds (a JS Date would drop them) and normalises any offset to UTC.
 */
export function canonicalTimestamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(iso.trim())
  if (!m) throw new Error(`bad timestamp: ${iso}`)
  const [, y, mo, d, h, mi, s, frac = '', tz = 'Z'] = m
  const micro = (frac + '000000').slice(0, 6)
  let offMin = 0
  if (tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1
    const digits = tz.slice(1).replace(':', '')
    offMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0'))
  }
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offMin * 60_000
  const u = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${u.getUTCFullYear()}-${p(u.getUTCMonth() + 1)}-${p(u.getUTCDate())}T${p(u.getUTCHours())}:${p(u.getUTCMinutes())}:${p(u.getUTCSeconds())}.${micro}Z`
}

export function canonicalMessage(m: ChainMessage, prev: string): string {
  const atts = (m.attachments ?? []).map((a) => `${a.path}:${a.sha256}`).join(',')
  return [
    CHAIN_VERSION,
    prev,
    String(m.id),
    m.thread_id,
    canonicalTimestamp(m.created_at),
    m.sender_id ?? '',
    m.sender_kind,
    m.acting_role ?? '',
    m.kind,
    m.channel ?? 'app',
    m.ref_message_id == null ? '' : String(m.ref_message_id),
    atts,
    m.body,
  ].join('\n')
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type ChainReport = {
  ok: boolean
  count: number
  /** Hash of the last message — the thread's fingerprint. */
  head: string | null
  /** First message id whose stored hash does not match, or whose prev_hash is not the previous hash. */
  brokenAt: number | null
  reason: 'hash_mismatch' | 'prev_mismatch' | 'missing_hash' | null
}

/** Recompute a thread's chain (messages in id order, one thread). */
export async function verifyChain(msgs: ChainMessage[]): Promise<ChainReport> {
  const sorted = [...msgs].sort((a, b) => a.id - b.id)
  let prev = GENESIS
  for (const m of sorted) {
    if (!m.hash) return { ok: false, count: sorted.length, head: null, brokenAt: m.id, reason: 'missing_hash' }
    if ((m.prev_hash ?? GENESIS) !== prev) return { ok: false, count: sorted.length, head: null, brokenAt: m.id, reason: 'prev_mismatch' }
    const h = await sha256Hex(canonicalMessage(m, prev))
    if (h !== m.hash) return { ok: false, count: sorted.length, head: null, brokenAt: m.id, reason: 'hash_mismatch' }
    prev = h
  }
  return { ok: true, count: sorted.length, head: sorted.length ? prev : null, brokenAt: null, reason: null }
}

export const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 4)}…${h.slice(-4)}` : '—')

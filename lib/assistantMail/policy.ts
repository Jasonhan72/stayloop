// AI 助理的邮箱 · who may deliver, and how much (2026-11-27). Pure — the inbound route and the tests share it.
//
// The address is not a secret, so anyone can try to send to it. Two things have to hold:
//   1. the From address is on this mailbox's list — the account's login email, plus whatever the
//      person added themselves;
//   2. that From address is real: Cloudflare checked SPF / DKIM / DMARC before handing the mail
//      over and wrote the outcome into ITS OWN Authentication-Results header. Only dmarc=pass
//      counts. The From line alone can be written by anybody.
// A mail that fails either is refused while the sending server is still connected (the email
// Worker calls setReject), so the sender's own server tells them — we never send a bounce.

export const MAIL_LIMITS = {
  /** One mail, as received. Cloudflare's own ceiling is 25 MiB. */
  rawBytes: 10 * 1024 * 1024,
  /** Attachments kept per mail. */
  files: 5,
  /** Mails per account in any 24 hours. */
  perDay: 20,
  /** Everything stored for one account. */
  storageBytes: 200 * 1024 * 1024,
  /** Mails for the whole site in any 24 hours — the total gate behind the per-account one. */
  siteDay: 2000,
  /** Body text kept. */
  bodyChars: 100_000,
  /** Days a mail is kept; the daily sweep deletes it after that, attachments and original included. */
  keepDays: 30,
  /** Extra sender addresses a person may allow. */
  senders: 10,
} as const

export type MailAuth = { by: string | null; spf: string | null; dkim: string | null; dmarc: string | null }

/**
 * The verdict Cloudflare wrote. `value` is what Headers.get('authentication-results') returns:
 * every such header joined by ", ", Cloudflare's first because it prepends its own.
 *
 * Read defensively — parts of that header are text the SENDER chose (the envelope address inside
 * an SPF comment, a quoted local part), and a sender can add an Authentication-Results header of
 * their own behind it:
 *   · quoted strings and (comments) are dropped before anything is read;
 *   · a bare comma is where another header was joined on — everything after it is ignored;
 *   · the first item must be Cloudflare's own id, or nothing is trusted;
 *   · a result counts only at the START of a ";"-separated item ("dmarc=pass …"), never inside one;
 *   · dmarc is "pass" only when EVERY dmarc item says pass, so one smuggled in beside a real
 *     "dmarc=fail" changes nothing.
 * Anything malformed reads as not verified.
 */
export function parseAuthResults(value: string | null | undefined): MailAuth {
  const none: MailAuth = { by: null, spf: null, dkim: null, dmarc: null }
  let v = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!v) return none
  v = v.replace(/"(?:[^"\\]|\\.)*"/g, '""')
  for (let i = 0; i < 6 && /\([^()]*\)/.test(v); i++) v = v.replace(/\([^()]*\)/g, ' ')
  const comma = v.indexOf(',')
  if (comma >= 0) v = v.slice(0, comma)
  const items = v.split(';').map((x) => x.trim())
  const by = (items.shift() ?? '').split(' ')[0].toLowerCase()
  if (by !== 'mx.cloudflare.net') return { ...none, by: by.slice(0, 80) || null }
  // An unbalanced bracket or quote left over: the header is not what we expect — verify nothing.
  if (/[()]/.test(v) || (v.match(/"/g) ?? []).length % 2 === 1) return { ...none, by }
  const results = (k: string): string[] => items
    .map((it) => new RegExp(`^${k}\\s*=\\s*([a-z]+)(?=$|\\s)`, 'i').exec(it)?.[1]?.toLowerCase())
    .filter((x): x is string => !!x)
  const every = (k: string): string | null => {
    const r = results(k)
    if (!r.length) return null
    return r.every((x) => x === 'pass') ? 'pass' : (r.find((x) => x !== 'pass') ?? null)
  }
  const dkim = results('dkim')
  return { by, spf: every('spf'), dkim: dkim.includes('pass') ? 'pass' : (dkim[0] ?? null), dmarc: every('dmarc') }
}

export type RejectCode = 'unknown' | 'sender' | 'unverified' | 'too_large' | 'over_limit'
/** What the sending server is told. Plain, and the same for a closed mailbox as for one that never existed. */
export const REJECT_TEXT: Record<RejectCode, string> = {
  unknown: 'Unknown address',
  sender: 'This address only accepts mail from its owner. Forward the message from the email address you sign in to Stayloop with.',
  unverified: 'The sender could not be verified (DMARC did not pass), so the message was not accepted.',
  too_large: 'Message too large: the limit is 10 MB.',
  over_limit: 'This mailbox has reached its limit for now. Try again tomorrow, or delete older mail in Stayloop.',
}
export type Verdict = { ok: true } | { ok: false; code: RejectCode }

/** From on the list AND verified. `allowed` are bare lower-case addresses (the login email first). */
export function senderVerdict(from: string | null, allowed: readonly string[], auth: MailAuth): Verdict {
  if (!from || !allowed.includes(from.toLowerCase())) return { ok: false, code: 'sender' }
  if (auth.by !== 'mx.cloudflare.net' || auth.dmarc !== 'pass') return { ok: false, code: 'unverified' }
  return { ok: true }
}

export function quotaVerdict(i: { rawBytes: number; dayCount: number; storedBytes: number; siteDayCount: number }): Verdict {
  if (i.rawBytes > MAIL_LIMITS.rawBytes) return { ok: false, code: 'too_large' }
  if (i.dayCount >= MAIL_LIMITS.perDay) return { ok: false, code: 'over_limit' }
  if (i.storedBytes + i.rawBytes > MAIL_LIMITS.storageBytes) return { ok: false, code: 'over_limit' }
  if (i.siteDayCount >= MAIL_LIMITS.siteDay) return { ok: false, code: 'over_limit' }
  return { ok: true }
}

/** PDF and images only: what the conversation can read, and nothing that runs. */
const FILE_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}
const EXT_TYPE: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }

/** The type we store a file under: its declared type when that is one we keep, else what its extension says
 *  (mail clients send PDFs as application/octet-stream often enough); null = not kept. */
export function keptType(mimeType: string | null | undefined, filename: string | null | undefined): string | null {
  const t = (mimeType ?? '').split(';')[0].trim().toLowerCase()
  if (FILE_EXT[t]) return t
  if (t && t !== 'application/octet-stream' && t !== 'binary/octet-stream') return null
  const ext = /\.([a-z0-9]{2,5})$/i.exec((filename ?? '').trim())?.[1]?.toLowerCase() ?? ''
  return EXT_TYPE[ext] ?? null
}

export type IncomingFile = { filename?: string | null; mimeType?: string | null; disposition?: string | null; size: number }
/** Small pictures a mail carries inside its body — a logo in a signature — are not attachments anyone forwarded. */
const INLINE_NOISE_BYTES = 30 * 1024

/** Which attachments are kept (by index, in order, at most MAIL_LIMITS.files) and which are named as not kept. */
export function pickFiles(files: readonly IncomingFile[]): { keep: { index: number; type: string }[]; skipped: string[] } {
  const keep: { index: number; type: string }[] = []
  const skipped: string[] = []
  files.forEach((f, index) => {
    const type = keptType(f.mimeType, f.filename)
    const label = (f.filename ?? '').trim().slice(0, 80) || (f.mimeType ?? 'file')
    if (type && type.startsWith('image/') && (f.disposition ?? '').toLowerCase() === 'inline' && f.size < INLINE_NOISE_BYTES) return
    if (!type || f.size <= 0) { skipped.push(label); return }
    if (keep.length >= MAIL_LIMITS.files) { skipped.push(label); return }
    keep.push({ index, type })
  })
  return { keep, skipped: skipped.slice(0, 20) }
}

/** A storage-safe name: the person's own file name with anything but letters, digits, CJK, dot, dash and underscore
 *  replaced, and the right extension for the stored type. Never a path. */
export function safeFileName(name: string | null | undefined, idx: number, type: string): string {
  const ext = FILE_EXT[type] ?? 'bin'
  const base = (name ?? '').replace(/\.[a-z0-9]{1,5}$/i, '').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._]+|[._]+$/g, '').slice(0, 60)
  return `${base || `file-${idx + 1}`}.${ext}`
}

/** The storage key cannot carry arbitrary Unicode safely; the display name can. */
export function storageKeyName(idx: number, type: string): string {
  return `${idx}.${FILE_EXT[type] ?? 'bin'}`
}

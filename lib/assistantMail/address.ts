// AI 助理的邮箱 · addresses (2026-11-27, design/assistant-inbox-plan-2026-11-27.md). Pure.
//
// An address is <slug>-<six random characters>@<domain>: the slug comes from the assistant's name
// when it has plain letters in it ('ashley-7k3f9q'), else 'ai'. The random part makes it
// unguessable and replaceable; it is not the gate — the gate is the sender check (./policy.ts).
// Two domains are accepted on delivery so the one shown to people can change without breaking an
// address already saved in a contact or a forwarding rule.

/** Accepted on delivery, in order of preference. The one shown on new addresses is app_config's. */
export const MAIL_DOMAINS = ['ai.stayloop.ai', 'reply.stayloop.ai'] as const
export type MailDomain = (typeof MAIL_DOMAINS)[number]
export const DEFAULT_MAIL_DOMAIN: MailDomain = 'reply.stayloop.ai'

/** No i, l, o, 0, 1: the address is read aloud and typed by hand. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
/** Thread reply addresses are t-<20 to 40 characters>; a slug has at least two characters, so the two never collide. */
export const LOCAL_RE = /^[a-z0-9]{2,16}-[a-z2-9]{6}$/

export function isMailDomain(v: unknown): v is MailDomain {
  return typeof v === 'string' && (MAIL_DOMAINS as readonly string[]).includes(v)
}

/** The plain letters and digits of the assistant's name, lower-cased; 'ai' when it has fewer than two (a Chinese name, an emoji, none). */
export function slugFromName(name: string | null | undefined): string {
  const s = (name ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)
  return s.length >= 2 ? s : 'ai'
}

/** A fresh local part. `rand` fills a byte array (crypto.getRandomValues by default; injectable for tests). */
export function newLocalPart(name: string | null | undefined, rand: (b: Uint8Array) => void = (b) => { crypto.getRandomValues(b) }): string {
  // Rejection sampling: 248 is the largest multiple of 31 under 256, so every character is equally likely.
  let tail = ''
  while (tail.length < 6) {
    const b = new Uint8Array(12)
    rand(b)
    for (const x of b) { if (x < 248 && tail.length < 6) tail += ALPHABET[x % ALPHABET.length] }
  }
  return `${slugFromName(name)}-${tail}`
}

export function fullAddress(localPart: string, domain: string): string {
  return `${localPart}@${isMailDomain(domain) ? domain : DEFAULT_MAIL_DOMAIN}`
}

/** "Name <a@b.c>" or "a@b.c" → the bare lower-case address, or null. */
export function bareAddress(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /<([^<>]+)>\s*$/.exec(v.trim())
  const a = (m ? m[1] : v).trim().toLowerCase()
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(a) && a.length <= 254 ? a : null
}

/** The envelope recipient → the local part, when it is one of ours on one of our domains; else null. */
export function parseRecipient(addr: string | null | undefined): { local: string; domain: MailDomain } | null {
  const a = bareAddress(addr)
  if (!a) return null
  const at = a.lastIndexOf('@')
  const local = a.slice(0, at)
  const domain = a.slice(at + 1)
  if (!isMailDomain(domain) || !LOCAL_RE.test(local)) return null
  return { local, domain }
}

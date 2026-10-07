// Contact form — pure validation + email rendering, kept out of the edge route
// so it can be unit-tested (tests/contactRoute.spec.ts).

import { escapeHtml } from '@/lib/email'

export const CONTACT_TO = 'privacy@stayloop.ai'

export const CONTACT_LIMITS = {
  name: 120,
  company: 120,
  email: 200,
  topic: 120,
  messageMin: 10,
  messageMax: 5000,
} as const

export interface ContactInput {
  name: string
  company: string
  email: string
  topic: string
  message: string
}

export type ContactError =
  | 'invalid_name'
  | 'invalid_company'
  | 'invalid_email'
  | 'invalid_topic'
  | 'invalid_message'

export type ContactValidation =
  | { ok: true; value: ContactInput }
  | { ok: false; error: ContactError }

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/

// Header-bound fields (subject, reply_to) must never carry line breaks or
// other control characters.
function oneLine(v: unknown): string {
  if (typeof v !== 'string') return ''
  let out = ''
  for (const ch of v) {
    const c = ch.charCodeAt(0)
    out += c < 32 || c === 127 ? ' ' : ch
  }
  return out.replace(/ {2,}/g, ' ').trim()
}

function stripNulChars(v: string): string {
  return v.split(String.fromCharCode(0)).join('')
}

export function validateContact(body: unknown): ContactValidation {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const name = oneLine(b.name)
  const company = oneLine(b.company)
  const email = oneLine(b.email)
  const topic = oneLine(b.topic)
  const message = typeof b.message === 'string' ? stripNulChars(b.message).trim() : ''

  if (!name || name.length > CONTACT_LIMITS.name) return { ok: false, error: 'invalid_name' }
  if (company.length > CONTACT_LIMITS.company) return { ok: false, error: 'invalid_company' }
  if (!email || email.length > CONTACT_LIMITS.email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'invalid_email' }
  }
  if (topic.length > CONTACT_LIMITS.topic) return { ok: false, error: 'invalid_topic' }
  if (message.length < CONTACT_LIMITS.messageMin || message.length > CONTACT_LIMITS.messageMax) {
    return { ok: false, error: 'invalid_message' }
  }
  return { ok: true, value: { name, company, email, topic, message } }
}

export function renderContactEmail(i: ContactInput): { subject: string; html: string; text: string } {
  const subject = `[Contact] ${i.topic || 'General'} — ${i.name}`.slice(0, 200)
  const rows: Array<[string, string]> = [
    ['Name', i.name],
    ['Company', i.company || '—'],
    ['Email', i.email],
    ['Topic', i.topic || '—'],
  ]
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;">
  <h2 style="margin:0 0 12px 0;font-size:16px;">stayloop.ai contact form</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#64748b;">${k}</td><td style="padding:4px 0;">${escapeHtml(v)}</td></tr>`,
      )
      .join('')}
  </table>
  <p style="margin:16px 0 0 0;line-height:1.6;">${escapeHtml(i.message).split('\n').join('<br>')}</p>
</div>`
  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${i.message}`
  return { subject, html, text }
}

// Per-isolate sliding window. Not a durable limit — it only blunts one client
// hammering one isolate; the honeypot and Resend's own limits do the rest.
export function makeThrottle(max: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (key: string, now: number = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) {
      hits.set(key, recent)
      return false
    }
    recent.push(now)
    hits.set(key, recent)
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
    }
    return true
  }
}

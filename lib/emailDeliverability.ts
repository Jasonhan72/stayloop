// Pure helpers about whether an address can receive mail at all, and about
// turning a mail-provider failure into a reason a person can act on
// (四角色审计 2026-10-12 · P1-4: a client was recorded as
// `qa-test-wang1@example.com`, Resend answered 422 "Invalid `to` field …
// domains like example.com", and the UI only said 「邮件服务出错」).
//
// No imports and no 'use client': safe in edge routes and in client components.

export type EmailFailureReason = 'undeliverable_domain' | 'rate_limited' | 'provider_error'

export interface EmailFailure {
  reason: EmailFailureReason
  /** The provider's own message, trimmed to ≤200 chars (never the whole JSON body). */
  detail: string
}

/** RFC 2606 / RFC 6761 reserved names: mail to them is never delivered. */
const RESERVED_TLDS = new Set(['test', 'invalid', 'localhost', 'example'])

/**
 * True when nothing can be delivered to this address because the domain is a
 * reserved or test name: example.com / example.net / example.org (and any
 * subdomain), example.<tld>, *.test, *.invalid, *.localhost, bare localhost.
 * Shape errors (no @) are not this helper's job — it answers false for them.
 */
export function isUndeliverableEmailDomain(email: string | null | undefined): boolean {
  const at = (email ?? '').trim().toLowerCase().lastIndexOf('@')
  if (at < 0) return false
  const domain = (email as string).trim().toLowerCase().slice(at + 1).replace(/\.$/, '')
  if (!domain) return false
  const labels = domain.split('.')
  if (labels.length === 1) return labels[0] === 'localhost'
  if (RESERVED_TLDS.has(labels[labels.length - 1])) return true
  // example.<tld> and anything under it (example.com, mail.example.org, example.ca …)
  return labels[labels.length - 2] === 'example'
}

/** Pull the provider's human message out of `resend 422: {"message":…}` style errors. */
function providerMessage(error: string): string {
  const m = /\{[\s\S]*\}/.exec(error)
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { message?: unknown; error?: unknown }
      const msg = typeof j.message === 'string' ? j.message : typeof j.error === 'string' ? j.error : ''
      if (msg) return msg
    } catch { /* fall through to the raw text */ }
  }
  return error
}

/**
 * Classify a failed send. `to` lets a reserved domain be named even when the
 * provider's wording changes; the provider message is still the detail.
 */
export function classifyEmailFailure(error: string | null | undefined, to?: string | null): EmailFailure {
  const raw = (error ?? '').replace(/\s+/g, ' ').trim()
  const detail = providerMessage(raw).replace(/\s+/g, ' ').trim().slice(0, 200)
  const lower = raw.toLowerCase()
  if (
    (to && isUndeliverableEmailDomain(to)) ||
    /example\.(com|net|org)/.test(lower) ||
    lower.includes('invalid `to`') ||
    lower.includes('invalid "to"') ||
    lower.includes('testing email address')
  ) return { reason: 'undeliverable_domain', detail }
  if (/\b429\b|rate.?limit|too many requests|daily quota|monthly quota/.test(lower)) return { reason: 'rate_limited', detail }
  return { reason: 'provider_error', detail }
}

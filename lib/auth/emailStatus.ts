// "Does this email already have an account, and how does it sign in?" — the
// lookup behind the homepage sign-in's first step (user decision 2026-09-29
//「当然要加上这个判断」, accepting that it tells a visitor whether an address is
// registered). Shared by the edge route (/api/auth/email-status), which asks
// the service-role-only SQL function auth_email_status(), and the login card,
// which routes on the answer. No 'use client': the route imports it too.
//
// The answer is three booleans and nothing else. Any failure — rate limit,
// network, timeout, a malformed reply — comes back as null, and the card falls
// back to the manual path (password step with「第一次来？创建账户」).

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type EmailStatus = { exists: boolean; password: boolean; google: boolean }

/** Trimmed, lower-cased address fit for the lookup, or null when it is not one. */
export function normalizeLookupEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  if (e.length < 3 || e.length > 254 || !EMAIL_RE.test(e)) return null
  return e
}

/** Coerces the SQL function's jsonb into exactly three booleans. */
export function toEmailStatus(data: unknown): EmailStatus {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const exists = d.exists === true
  return { exists, password: exists && d.password === true, google: exists && d.google === true }
}

/** Which step the email lookup sends the visitor to.
 *  `known` = the lookup answered, so the card can hide the cross-links
 *  (「第一次来？创建账户」 on a known account, 「已有账户？」 on a new email). */
export type LoginRoute = { step: 'password' | 'create' | 'nopassword'; known: boolean; google: boolean }

export function routeForEmail(s: EmailStatus | null): LoginRoute {
  if (!s) return { step: 'password', known: false, google: false }
  if (!s.exists) return { step: 'create', known: true, google: false }
  if (s.password) return { step: 'password', known: true, google: s.google }
  return { step: 'nopassword', known: true, google: s.google }
}

/** Client side: ask the route. Null on any failure or after `timeoutMs`. */
export async function lookupEmailStatus(email: string, timeoutMs = 5000): Promise<EmailStatus | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    const res = await fetch('/api/auth/email-status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: ctrl?.signal,
    })
    if (!res.ok) return null
    const j: unknown = await res.json()
    if (!j || typeof j !== 'object' || typeof (j as { exists?: unknown }).exists !== 'boolean') return null
    return toEmailStatus(j)
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

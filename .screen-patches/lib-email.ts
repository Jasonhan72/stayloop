// 2026-06-02 — Audit §5 P2 — replyTo: app.email exposed the applicant's
// email address (and let a malicious applicant set any Reply-To they want,
// turning Stayloop into a spoofing reflector). Caller-supplied replyTo is
// now ignored — sendEmail always emits a safe Reply-To from
// `RESEND_REPLY_TO || 'notifications@stayloop.ai'`. Templates that need
// the landlord to reach the applicant must surface that email IN THE BODY
// (see renderNewApplicationEmail — the "Email" row is rendered there)
// rather than relying on the header.
// 2026-06-02 — Code review §5 P3 — Retry Resend POST with exponential
// backoff (3 attempts at 0/500/2000 ms) on network errors or 5xx responses.
// 4xx is NOT retried (bad request, invalid recipient — retrying won't help).
// On final failure, captureException at warning level so we hear about
// transient sender outages without paging.
// 2026-06-02 — Code review §5 P1 — CASL-compliant unsubscribe: add
// List-Unsubscribe and List-Unsubscribe-Post headers to every Resend send,
// honour the email_unsubscribes table by skipping suppressed addresses, and
// expose HMAC token generation + verification for the /unsubscribe page.

// Tiny Resend wrapper. Uses the bare REST API via fetch so we stay edge-safe
// on Cloudflare Pages without pulling in the Resend SDK (which currently ships
// Node-only helpers).
//
// Docs: https://resend.com/docs/api-reference/emails/send-email

import { createClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'

export interface SendEmailArgs {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /**
   * §5 P2 — DEPRECATED / IGNORED. Caller-supplied replyTo values are no
   * longer honoured to prevent applicant-email exposure and Reply-To
   * spoofing. The field stays in the interface so existing call sites
   * keep type-checking, but sendEmail() overrides it with a safe default
   * (RESEND_REPLY_TO env var, falling back to notifications@stayloop.ai).
   * If you need the landlord to reach an applicant, include the
   * applicant's email inside the message body.
   */
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
  skipped?: 'unsubscribed'
}

// ─── Unsubscribe HMAC helpers ────────────────────────────────────────────
// CASL requires a working one-click unsubscribe in every commercial email.
// We generate a tamper-resistant token by HMAC-SHA256'ing the recipient
// email with a server-side secret, then base64url-encoding the result.
// The /unsubscribe page (server-rendered) re-derives the expected token
// and compares it in constant time before honouring the request.

const STATIC_FALLBACK_TOKEN = 'sl-no-secret-configured'

function base64UrlEncode(bytes: ArrayBuffer): string {
  // Edge-runtime safe: convert to binary string, then btoa, then URL-safe.
  const arr = new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return base64UrlEncode(sig)
}

/** Generate the unsubscribe token for a given email. */
export async function generateUnsubscribeToken(email: string): Promise<string> {
  const secret = process.env.SECRET_UNSUBSCRIBE_KEY
  if (!secret) {
    console.warn(
      'SECRET_UNSUBSCRIBE_KEY not set — using static fallback token (NOT secure for production)',
    )
    return STATIC_FALLBACK_TOKEN
  }
  return hmacSha256(secret, email.toLowerCase().trim())
}

/** Constant-time string compare (string lengths must already match). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Verify an unsubscribe token. Returns true only if it matches the HMAC of
 * the supplied email. If SECRET_UNSUBSCRIBE_KEY isn't set, accept the static
 * fallback token (still better than no unsubscribe) but log a warning — this
 * mode is intended for local dev only.
 */
export async function verifyUnsubscribeToken(
  email: string,
  token: string,
): Promise<boolean> {
  if (!email || !token) return false
  const expected = await generateUnsubscribeToken(email)
  return constantTimeEqual(expected, token)
}

// ─── Suppression list lookup ─────────────────────────────────────────────

async function isUnsubscribed(email: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    // Can't check — fail open so dev / preview environments without a
    // service role key still send.
    return false
  }
  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.rpc('is_email_unsubscribed', {
      p_email: email.toLowerCase().trim(),
    })
    if (error) {
      console.warn('is_email_unsubscribed RPC failed', error)
      return false
    }
    return data === true
  } catch (err) {
    console.warn('is_email_unsubscribed threw', err)
    return false
  }
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from) {
    return { ok: false, error: 'RESEND_API_KEY or RESEND_FROM not configured' }
  }

  const recipients = Array.isArray(args.to) ? args.to : [args.to]

  // ─── §5 P1: honour unsubscribes ─────────────────────────────────────────
  // We send to one logical recipient per email in practice (notify-landlord,
  // welcome, etc.), so when the first/only recipient is on the suppression
  // list we just skip the send entirely. For multi-recipient sends we filter
  // out suppressed addresses and only abort if ALL recipients are suppressed.
  const suppressionFlags = await Promise.all(recipients.map(isUnsubscribed))
  const kept = recipients.filter((_, i) => !suppressionFlags[i])
  if (kept.length === 0) {
    return { ok: true, skipped: 'unsubscribed' }
  }

  // Headers: one-click unsubscribe (RFC 2369 + RFC 8058) for each recipient.
  // We only emit a single set of headers per message, so pick the first
  // surviving recipient as the unsubscribe target. Bulk sends should call
  // sendEmail once per recipient if per-recipient tokens are needed.
  const primary = kept[0]
  const token = await generateUnsubscribeToken(primary)
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
  const unsubUrl = `${siteUrl.replace(/\/$/, '')}/unsubscribe?email=${encodeURIComponent(
    primary,
  )}&token=${encodeURIComponent(token)}`
  const listUnsubscribe = `<${unsubUrl}>, <mailto:unsubscribe@stayloop.ai?subject=unsubscribe>`

  // ─── §5 P3: send with bounded retry/backoff ──────────────────────────
  // Resend's edge endpoint is generally reliable but a handful of times
  // per week it returns 502/504 during deploys. We retry up to 3 attempts
  // with delays [0, 500, 2000] ms — the upper bound (~2.5 s total) keeps
  // us well under the 5 s edge function budget the callers run inside.
  //
  // Retry semantics (deliberate):
  //   - network thrown errors (DNS, timeout, abort)     → retry
  //   - HTTP 5xx (incl. 502/503/504)                    → retry
  //   - HTTP 429 (rate limit)                           → retry
  //   - HTTP 4xx (bad recipient, missing fields, etc.)  → DON'T retry
  //
  // If the last attempt still fails, captureException at 'warning' level
  // so it surfaces in Sentry without paging (email is non-critical for
  // most flows — the in-app dashboard already shows the application).
  // ─── §5 P2: safe Reply-To ────────────────────────────────────────────────
  // We deliberately IGNORE args.replyTo. Honouring caller-supplied values
  // (notably applicant email on the new-application notification) leaks
  // the applicant's address into mailbox headers AND lets a malicious
  // applicant set any Reply-To they want — landlords reflexively hit
  // "Reply" and unwittingly send sensitive information to a third party.
  // Every Stayloop email now Reply-To's a Stayloop-owned address.
  const safeReplyTo =
    process.env.RESEND_REPLY_TO || 'notifications@stayloop.ai'

  const body = JSON.stringify({
    from,
    to: kept,
    subject: args.subject,
    html: args.html,
    text: args.text,
    reply_to: safeReplyTo,
    headers: {
      'List-Unsubscribe': listUnsubscribe,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  const RETRY_DELAYS_MS = [0, 500, 2000]
  let lastError = 'resend send failed (no attempts ran)'
  let attemptCount = 0

  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay)
    attemptCount += 1
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      })
      if (res.ok) {
        const data = (await res.json()) as { id?: string }
        return { ok: true, id: data.id }
      }
      const text = await res.text()
      lastError = `resend ${res.status}: ${text.slice(0, 300)}`
      // 4xx is a permanent failure — bail out without further attempts.
      // 429 is the one exception in the 4xx range that benefits from retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        captureException(new Error(lastError), {
          route: 'lib-email',
          level: 'warning',
          tags: { resend_status: String(res.status), retry_attempt: String(attemptCount) },
        })
        return { ok: false, error: lastError }
      }
      // Otherwise (5xx / 429) fall through to the next iteration's delay.
    } catch (err: unknown) {
      // Network-class failure (DNS / timeout / abort). Always retried up
      // to the budget.
      lastError = err instanceof Error ? err.message : 'resend fetch failed'
    }
  }

  // All retries exhausted.
  captureException(new Error(lastError), {
    route: 'lib-email',
    level: 'warning',
    tags: { retry_attempt: String(attemptCount), exhausted: 'true' },
  })
  return { ok: false, error: lastError }
}

/** Small helper so the retry loop reads top-to-bottom. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

export interface NewApplicationEmailInput {
  applicantName: string
  applicantEmail: string
  propertyAddress: string
  monthlyRent: number | null
  monthlyIncome: number | null
  fileCount: number
  dashboardUrl: string
}

export function renderNewApplicationEmail(i: NewApplicationEmailInput): {
  subject: string
  html: string
  text: string
} {
  const subject = `New application from ${i.applicantName} — ${i.propertyAddress}`

  const rent = i.monthlyRent ? `$${i.monthlyRent.toLocaleString()}/mo` : 'N/A'
  const income = i.monthlyIncome ? `$${i.monthlyIncome.toLocaleString()}/mo` : 'N/A'
  const ratio =
    i.monthlyRent && i.monthlyIncome
      ? `${(i.monthlyIncome / i.monthlyRent).toFixed(1)}x rent`
      : '—'

  const text = `New rental application on Stayloop

Applicant: ${i.applicantName}
Email:     ${i.applicantEmail}
Property:  ${i.propertyAddress}
Rent:      ${rent}
Income:    ${income} (${ratio})
Documents: ${i.fileCount} uploaded

Review it here:
${i.dashboardUrl}

— Stayloop`

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <div style="font-size:11px;letter-spacing:0.12em;color:#06b6d4;text-transform:uppercase;font-weight:600;">Stayloop</div>
                <h1 style="margin:8px 0 0 0;font-size:20px;font-weight:700;color:#0f172a;">New rental application</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px 28px;color:#334155;font-size:14px;line-height:1.55;">
                <p style="margin:16px 0 8px 0;">
                  <strong style="color:#0f172a;">${escapeHtml(i.applicantName)}</strong>
                  just applied for:
                </p>
                <p style="margin:0 0 20px 0;color:#0f172a;font-weight:600;">${escapeHtml(i.propertyAddress)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
                  ${row('Email', escapeHtml(i.applicantEmail))}
                  ${row('Monthly rent', rent)}
                  ${row('Self-reported income', `${income} <span style="color:#64748b;">(${ratio})</span>`)}
                  ${row('Documents uploaded', String(i.fileCount))}
                </table>

                <div style="margin:28px 0 8px 0;">
                  <a href="${i.dashboardUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;">Review application →</a>
                </div>

                <p style="margin:24px 0 0 0;font-size:12px;color:#94a3b8;">
                  You can run AI screening and LTB record search from the application detail page.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;">
                Stayloop · AI tenant screening for Ontario landlords · stayloop.ai
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#64748b;width:160px;">${label}</td>
    <td style="padding:6px 0;color:#0f172a;">${value}</td>
  </tr>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

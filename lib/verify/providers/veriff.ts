// Veriff — hosted identity verification (liveness + document). Edge-safe:
// plain fetch + WebCrypto HMAC. Docs: devdocs.veriff.com/apidocs/v1sessions,
// /apidocs/decision-webhook, /apidocs/hmac-authentication-and-endpoint-security.
import type { IdResult } from '../types'

export function veriffConfigured(): boolean {
  return !!(process.env.VERIFF_API_KEY && process.env.VERIFF_SECRET_KEY)
}

const BASE = () => (process.env.VERIFF_BASE_URL || 'https://stationapi.veriff.com').replace(/\/$/, '')

export async function veriffCreateSession(args: {
  vendorData: string            // our verify token — comes back on the webhook
  callbackUrl: string           // where Veriff sends the person after the flow
  firstName?: string | null
  lastName?: string | null
}): Promise<{ id: string; url: string }> {
  const res = await fetch(`${BASE()}/v1/sessions`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      'X-AUTH-CLIENT': process.env.VERIFF_API_KEY!,
    },
    body: JSON.stringify({
      verification: {
        callback: args.callbackUrl,
        vendorData: args.vendorData,
        ...(args.firstName || args.lastName
          ? { person: { firstName: args.firstName || undefined, lastName: args.lastName || undefined } }
          : {}),
        timestamp: new Date().toISOString(),
      },
    }),
  })
  const data = await res.json().catch(() => ({})) as { status?: string; verification?: { id?: string; url?: string } }
  if (!res.ok || !data.verification?.id || !data.verification?.url) {
    throw new Error(`veriff ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return { id: data.verification.id, url: data.verification.url }
}

// HMAC-SHA256 of the raw body with the shared secret, hex, compared in
// constant time against X-HMAC-SIGNATURE.
export async function veriffVerifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = process.env.VERIFF_SECRET_KEY
  if (!secret || !signature) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const a = hex.toLowerCase(), b = signature.trim().toLowerCase()
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

type DecisionPayload = {
  status?: string
  vendorData?: string
  verification?: {
    id?: string
    status?: string
    code?: number
    reason?: string | null
    vendorData?: string
    person?: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null }
    document?: { type?: string | null; number?: string | null; country?: string | null }
  }
}

// Only what the screening needs. Document number is reduced to last 4.
export function veriffParseDecision(payload: DecisionPayload): { sessionId: string | null; vendorData: string | null; result: IdResult } | null {
  const v = payload.verification
  if (!v) return null
  const status = (v.status || '').toLowerCase()
  const decision: IdResult['decision'] =
    status === 'approved' ? 'approved'
    : status === 'declined' ? 'declined'
    : status === 'resubmission_requested' ? 'resubmission_requested'
    : status === 'expired' ? 'expired'
    : status === 'abandoned' ? 'abandoned'
    : 'review'
  const num = v.document?.number ? String(v.document.number) : null
  return {
    sessionId: v.id ?? null,
    vendorData: v.vendorData ?? payload.vendorData ?? null,
    result: {
      decision,
      first_name: v.person?.firstName ?? null,
      last_name: v.person?.lastName ?? null,
      date_of_birth: v.person?.dateOfBirth ?? null,
      document_type: v.document?.type ?? null,
      document_country: v.document?.country ?? null,
      document_last4: num ? num.slice(-4) : null,
      reason: v.reason ?? null,
    },
  }
}

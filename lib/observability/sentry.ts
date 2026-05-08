// -----------------------------------------------------------------------------
// Observability — error capture (Sentry-compatible interface)
// -----------------------------------------------------------------------------
// Lightweight wrapper that's a no-op when SENTRY_DSN is unset. When set,
// posts events to Sentry's HTTP intake API directly (keeps bundle size
// small — no @sentry/* dependency, edge-compatible, ~80 LOC).
//
// We POST to /api/<project>/store/ with the v7 envelope payload format,
// authenticated by the public DSN's project key. This is exactly what
// the Sentry browser SDK does under the hood.
//
// Usage from API routes:
//   import { captureException, captureMessage } from '@/lib/observability/sentry'
//   try { ... } catch (e) { captureException(e, { route: 'screen-score', userId }); throw e }
//
// To enable: set SENTRY_DSN in Cloudflare Pages env (Production + Preview).
// Get the DSN from sentry.io → project settings → Client Keys (DSN).
// -----------------------------------------------------------------------------

interface ParsedDSN {
  publicKey: string
  projectId: string
  host: string
  protocol: string
}

function parseDSN(dsn: string): ParsedDSN | null {
  // DSN format: https://<publicKey>@<host>/<projectId>
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.replace(/^\//, '')
    if (!url.username || !projectId) return null
    return {
      publicKey: url.username,
      projectId,
      host: url.host,
      protocol: url.protocol.replace(':', ''),
    }
  } catch {
    return null
  }
}

function readDSN(): string {
  return (
    (typeof process !== 'undefined' && process.env?.SENTRY_DSN) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).SENTRY_DSN) ||
    ''
  )
}

interface CaptureContext {
  /** Logical area: 'screen-score', 'agent-chat', 'import-listing', etc. */
  route?: string
  /** Authenticated user (auth_id), if known. */
  userId?: string
  /** Additional tags (low-cardinality, indexed). */
  tags?: Record<string, string>
  /** Extra unindexed payload (request body, headers, etc.). */
  extra?: Record<string, unknown>
  /** Severity. Default 'error'. */
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
}

/**
 * Send an event to Sentry. No-ops if SENTRY_DSN is not configured —
 * callers don't need to gate on env. Fire-and-forget; we don't block
 * the response on Sentry intake.
 */
export function captureException(
  error: unknown,
  context: CaptureContext = {},
): void {
  const dsn = readDSN()
  if (!dsn) return // No-op when DSN not configured

  const parsed = parseDSN(dsn)
  if (!parsed) {
    console.warn('[sentry] invalid SENTRY_DSN, capture skipped')
    return
  }

  const err = error instanceof Error ? error : new Error(String(error))
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: context.level || 'error',
    logger: context.route || 'stayloop',
    server_name: 'cf-pages',
    tags: {
      route: context.route || 'unknown',
      ...(context.tags || {}),
    },
    user: context.userId ? { id: context.userId } : undefined,
    extra: context.extra,
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: err.message?.slice(0, 1000) || 'unknown',
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split('\n')
                  .slice(1, 21)
                  .map((line) => ({ filename: line.trim().slice(0, 200) })),
              }
            : undefined,
        },
      ],
    },
  }

  // Sentry envelope format (v7). Fire-and-forget.
  const url = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/store/?sentry_version=7&sentry_key=${parsed.publicKey}`
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    // Don't block — Sentry intake is sometimes slow.
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Swallow — observability tool errors must never break the request path.
  })
}

/**
 * Capture a non-error message (for high-severity warnings). Same no-op
 * fallback as captureException.
 */
export function captureMessage(
  message: string,
  context: CaptureContext = {},
): void {
  captureException(new Error(message), {
    ...context,
    level: context.level || 'warning',
  })
}

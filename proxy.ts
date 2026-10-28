// proxy.ts (Next 16, 2026-10-23) — was middleware.ts. Same logic; `proxy` runs on the Node.js
// runtime (Next 16 deprecates `middleware`; 17 drops it). On Cloudflare, OpenNext re-bundles the
// Node middleware into `.open-next/middleware/handler.mjs` — its maintainers call that path
// experimental, so every change here is verified on a no-traffic preview version first
// (smoke + route audit), as the Next 16 upgrade was.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { homeAskRedirect } from '@/lib/homeDeepLink'

// Security headers on every routed response. Full CSP is deliberately
// omitted (Next inline scripts/styles would need nonces); frame-ancestors
// is covered by X-Frame-Options.
const PERMISSIONS_POLICY = 'camera=(), microphone=(self), geolocation=(self)'

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.headers.set('X-Frame-Options', 'DENY')
  // microphone=(self): the 🎙 voice-input button on every chat surface uses the
  // browser's SpeechRecognition, which Chromium refuses outright while the
  // origin's policy is microphone=() (site test 2026-10-02, L4:D1). Third-party
  // frames (Flinks) still get no microphone. Nothing here uses the camera — the
  // ID step hands off to Veriff by full navigation, and <input capture> opens
  // the native camera without this policy — so camera stays off.
  res.headers.set('Permissions-Policy', PERMISSIONS_POLICY)
  // Pages rendered by the worker and every API response lacked nosniff; only
  // static assets got it from the Pages platform (L4:D5).
  res.headers.set('X-Content-Type-Options', 'nosniff')
  return res
}

// /verify/<token>: the token IS the credential and the page hands the
// person to Veriff / Flinks by full navigation — never send it as Referer
// (review 2026-09-13). /intake/<token> (V1.0 stage 2): same — the agent's
// client intake link is the credential. /my-file/<token> (V0.8, Consumer
// Reporting Act s.12): the applicant's one-time file-access link, same rule.
// Everything else: origin only across sites.
const TOKEN_PAGE_PREFIXES = ['/verify/', '/intake/', '/my-file/', '/w/', '/lease/sign/', '/p/', '/join/', '/delegate/', '/api/w/', '/api/consumer/request/', '/api/verify/']  // + the token APIs (site test 2026-10-28, E-D1)

function withReferrerPolicy(res: NextResponse, pathname: string): NextResponse {
  // Every token page in the route table (site test 2026-10-17, G-D3: /w /lease/sign /p /join /delegate were missing).
  const tokenPage = TOKEN_PAGE_PREFIXES.some((p) => pathname.startsWith(p))
  res.headers.set('Referrer-Policy', tokenPage ? 'no-referrer' : 'strict-origin-when-cross-origin')
  return res
}

// Apex (stayloop.ai) → www.stayloop.ai
// screening.stayloop.ai → www.stayloop.ai/screening — a vanity door, not a
// second site. The session (implicit flow, localStorage) is origin-scoped, so
// the subdomain must never HOST the app; it forwards to the one canonical
// origin where login, billing and the passport all live.
export function proxy(request: NextRequest) {
  const host = request.headers.get('host') || ''
  // Plain HTTP → HTTPS (site test 2026-10-28, T6-D12): since the 10-19 move to the Worker the zone
  // route hands http:// requests to the app too, and the Pages platform's 301 is gone — a whole page
  // was served in clear and HSTS sent over http is ignored by browsers. One 308 to the canonical
  // https://www host; the apex / screening hops below then only ever see https.
  const scheme = (request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')).toLowerCase()
  if (scheme === 'http' && /stayloop\.ai$/.test(host)) {
    const url = new URL(request.url)
    url.protocol = 'https:'
    url.host = host === 'stayloop.ai' ? 'www.stayloop.ai' : host
    return withSecurityHeaders(NextResponse.redirect(url, 308))
  }
  if (host === 'stayloop.ai') {
    const url = new URL(request.url)
    url.protocol = 'https:'
    url.host = 'www.stayloop.ai'
    return withSecurityHeaders(NextResponse.redirect(url, 308))
  }
  if (host === 'screening.stayloop.ai') {
    const url = new URL(request.url)
    url.host = 'www.stayloop.ai'
    // Deep paths forward too (screening.stayloop.ai/abc → /screening landing;
    // only the root is advertised, anything else is someone typing).
    url.pathname = '/screening'
    url.search = ''
    return withSecurityHeaders(NextResponse.redirect(url, 308))
  }
  {
    // /landlord/settings is the address people guess for the landlord
    // workspace's settings and it 404'd (external fix list 2026-09-22,
    // SL-LL-008). A server redirect — the page-level redirect() on a
    // static route only runs after hydration.
    const url = new URL(request.url)
    if (/^\/(landlord|tenant|agent)\/settings\/?$/.test(url.pathname)) {
      url.pathname = '/settings'
      return withSecurityHeaders(NextResponse.redirect(url, 308))
    }
    // One message centre for every hat (消息系统 A 期, 2026-09-29).
    if (/^\/(landlord|tenant|agent|provider)\/messages\/?$/.test(url.pathname)) {
      url.pathname = '/messages'
      return withSecurityHeaders(NextResponse.redirect(url, 308))
    }
    // /landlord/applications is the guessed plural (three-role test report
    // 2026-09-24, SL-L-04); the page is /landlord/applicants.
    const apps = url.pathname.match(/^\/landlord\/applications(\/.*)?$/)
    if (apps) {
      url.pathname = '/landlord/applicants' + (apps[1] || '')
      return withSecurityHeaders(NextResponse.redirect(url, 308))
    }
    // /dashboard/applications/<id> was the V4 applicant page (six legacy score bars, no one-click
    // screening, no decision notice or thread) that the dashboard rows and the new-application
    // email still pointed at; the applicant page is /landlord/applicants/<id> (2026-09-28).
    const legacyApp = url.pathname.match(/^\/dashboard\/applications(\/[^/]+)?\/?$/)
    if (legacyApp) {
      url.pathname = '/landlord/applicants' + (legacyApp[1] || '')
      return withSecurityHeaders(NextResponse.redirect(url, 308))
    }
    // /dashboard/listings never existed as a page (listings live on /dashboard;
    // only /new and /[id]/edit are under it) but the assistant used to point
    // landlords there (three-role walkthrough 2026-09-26).
    if (/^\/dashboard\/listings\/?$/.test(url.pathname)) {
      url.pathname = '/dashboard'
      return withSecurityHeaders(NextResponse.redirect(url, 308))
    }
    // Trust API was renamed Stayloop API (2026-09-23); old links keep working.
    if (/^\/trust-api(\/docs)?\/?$/.test(url.pathname)) {
      url.pathname = url.pathname.replace('/trust-api', '/stayloop-api')
      return withSecurityHeaders(NextResponse.redirect(url, 308))
    }
    // `/?role=<r>&ask=<q>` used to feed a question into the homepage's hero
    // conversation. The homepage is a marketing + login page since V0.7
    // (2026-09-27); the same links land in that role's assistant page, which
    // sends the question once (anonymous → preview, signed in → the real one).
    const ask = homeAskRedirect(url)
    if (ask) return withSecurityHeaders(NextResponse.redirect(ask, 308))
  }
  return withCorsScope(withReferrerPolicy(withSecurityHeaders(NextResponse.next()), new URL(request.url).pathname), new URL(request.url).pathname)
}

// Cross-origin reads (site test 2026-10-17, T6-D9): HTML pages came back with
// `Access-Control-Allow-Origin: *` (the Pages asset server's default). Only the open API
// (/api/v1/*, the remote MCP endpoint) and /.well-known discovery files need it; every other
// response is pinned to the site's own origin. Those paths keep what their handler sets.
const CORS_OPEN_PATH = /^\/(?:api\/v1(?:\/|$)|api\/mcp(?:\/|$)|\.well-known\/)/
function withCorsScope(res: NextResponse, pathname: string): NextResponse {
  if (!CORS_OPEN_PATH.test(pathname)) res.headers.set('Access-Control-Allow-Origin', 'https://www.stayloop.ai')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

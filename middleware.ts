import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { homeAskRedirect } from '@/lib/homeDeepLink'

// Security headers on every routed response. Full CSP is deliberately
// omitted (Next inline scripts/styles would need nonces); frame-ancestors
// is covered by X-Frame-Options.
function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)')
  return res
}

// /verify/<token>: the token IS the credential and the page hands the
// person to Veriff / Flinks by full navigation — never send it as Referer
// (review 2026-09-13). Everything else: origin only across sites.
function withReferrerPolicy(res: NextResponse, pathname: string): NextResponse {
  res.headers.set('Referrer-Policy', pathname.startsWith('/verify/') ? 'no-referrer' : 'strict-origin-when-cross-origin')
  return res
}

// Apex (stayloop.ai) → www.stayloop.ai
// screening.stayloop.ai → www.stayloop.ai/screening — a vanity door, not a
// second site. The session (implicit flow, localStorage) is origin-scoped, so
// the subdomain must never HOST the app; it forwards to the one canonical
// origin where login, billing and the passport all live.
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  if (host === 'stayloop.ai') {
    const url = new URL(request.url)
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
  return withReferrerPolicy(withSecurityHeaders(NextResponse.next()), new URL(request.url).pathname)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Security headers on every routed response. Full CSP is deliberately
// omitted (Next inline scripts/styles would need nonces); frame-ancestors
// is covered by X-Frame-Options.
function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)')
  return res
}

// Apex (stayloop.ai) → www.stayloop.ai
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  if (host === 'stayloop.ai') {
    const url = new URL(request.url)
    url.host = 'www.stayloop.ai'
    return withSecurityHeaders(NextResponse.redirect(url, 308))
  }
  return withSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

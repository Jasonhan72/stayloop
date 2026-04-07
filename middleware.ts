import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Force apex stayloop.ai → www.stayloop.ai so PKCE verifier / session / cookies
// always live on a single canonical origin. This prevents the magic-link login
// loop caused by Supabase /verify redirecting between apex and www.
export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const host = req.headers.get('host') || ''
  if (host === 'stayloop.ai') {
    url.host = 'www.stayloop.ai'
    url.protocol = 'https'
    return NextResponse.redirect(url, 308)
  }
  return NextResponse.next()
}

export const config = {
  // Run on every request except Next internals and static assets
  matcher: ['/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)'],
}

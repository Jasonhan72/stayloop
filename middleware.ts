import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Apex (stayloop.ai) → www.stayloop.ai
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || ''
  if (host === 'stayloop.ai') {
    const url = new URL(request.url)
    url.host = 'www.stayloop.ai'
    return NextResponse.redirect(url, 308)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

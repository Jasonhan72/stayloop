// 2026-06-02 — Code review §5 P1 — One-click List-Unsubscribe-Post handler.
// RFC 8058 says the mail client may POST to the List-Unsubscribe URL with
// body "List-Unsubscribe=One-Click". We accept either the original query
// params (email + token) on the request URL, or POST form-encoded values
// of the same names, and record the unsubscribe in email_unsubscribes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/email'

export const runtime = 'edge'

async function recordUnsubscribe(email: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return { ok: false, error: 'Server not configured' }
  }
  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await admin.from('email_unsubscribes').insert({
      email: email.toLowerCase().trim(),
      source: 'list_unsubscribe_one_click',
    })
    // Unique-violation = already unsubscribed; treat as success.
    if (error && error.code !== '23505') {
      console.warn('unsubscribe POST insert failed', error)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'insert threw' }
  }
}

async function extractCreds(req: NextRequest): Promise<{ email: string; token: string }> {
  // Prefer query params (we always include them in the List-Unsubscribe URL).
  const u = new URL(req.url)
  let email = (u.searchParams.get('email') || '').trim()
  let token = (u.searchParams.get('token') || '').trim()

  if (!email || !token) {
    // Fall back to form-urlencoded body. Mail clients sending the
    // one-click POST will include List-Unsubscribe=One-Click in the body;
    // if the URL didn't carry credentials we can't honour the request.
    const ctype = (req.headers.get('content-type') || '').toLowerCase()
    if (ctype.includes('application/x-www-form-urlencoded')) {
      try {
        const text = await req.text()
        const params = new URLSearchParams(text)
        email = email || (params.get('email') || '').trim()
        token = token || (params.get('token') || '').trim()
      } catch {
        /* ignore */
      }
    }
  }

  return { email: email.toLowerCase(), token }
}

export async function POST(req: NextRequest) {
  const { email, token } = await extractCreds(req)
  if (!email || !token) {
    return NextResponse.json({ error: 'missing email or token' }, { status: 400 })
  }

  const valid = await verifyUnsubscribeToken(email, token)
  if (!valid) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 })
  }

  const result = await recordUnsubscribe(email)
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'failed' }, { status: 500 })
  }
  // RFC 8058 — 200 OK with any short body is fine. Some clients render the
  // response; keep it neutral and language-agnostic.
  return NextResponse.json({ ok: true, unsubscribed: email })
}

// Some senders also send a GET to the same URL when the user clicks the
// "Unsubscribe" link rendered by Gmail/Outlook. Redirect those to the
// full page so we get the EN/ZH confirmation UI instead of raw JSON.
export async function GET(req: NextRequest) {
  const u = new URL(req.url)
  const email = u.searchParams.get('email') || ''
  const token = u.searchParams.get('token') || ''
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    req.headers.get('origin') ||
    'https://www.stayloop.ai'
  const target = `${siteUrl.replace(/\/$/, '')}/unsubscribe?email=${encodeURIComponent(
    email,
  )}&token=${encodeURIComponent(token)}`
  return NextResponse.redirect(target, 302)
}

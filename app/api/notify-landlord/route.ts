// -----------------------------------------------------------------------------
// 2026-06-02 — Code review Top 10 #6 — Auth gate + ownership check on
// /api/notify-landlord: previously anyone with an application_id could
// trigger the landlord notification email; now require an authenticated
// bearer token, and only allow the landlord who owns the listing (or a
// service-role token) to fire the send.
// -----------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, renderNewApplicationEmail } from '@/lib/email'

export const runtime = 'edge'

/**
 * POST /api/notify-landlord
 *
 * Auth: requires a Supabase bearer token. The caller MUST be one of:
 *   (a) the landlord who owns the listing this application was submitted to
 *       — verified by joining applications → listings → landlords.auth_id
 *   (b) the Supabase service role JWT (server-to-server, e.g. an internal
 *       cron) — detected by the user role coming back as 'service_role'
 *
 * Abuse protection:
 * - Single-shot: we set applications.notified_at on success, and refuse to
 *   send again for the same application_id. Idempotent under retries.
 * - All sensitive lookups happen server-side via the service role key — the
 *   client just passes an application_id; we use that to look up the email.
 *
 * Request body: { application_id: string }
 */
export async function POST(req: NextRequest) {
  // --- Auth gate -----------------------------------------------------------
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const sbAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: ud, error: ue } = await sbAuth.auth.getUser()
  if (ue || !ud?.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  const authUserId = ud.user.id
  // Service-role tokens decode with role 'service_role' — they bypass the
  // ownership check (used by internal cron / server-to-server callers).
  const isServiceRole = (ud.user as { role?: string } | null)?.role === 'service_role'

  let body: { application_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const applicationId = body.application_id
  if (!applicationId || typeof applicationId !== 'string') {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Pull the application + listing + landlord in one shot.
  const { data: app, error: fetchErr } = await admin
    .from('applications')
    .select(`
      id, first_name, last_name, email, monthly_income, files, notified_at,
      listing:listings (
        id, address, unit, city, monthly_rent,
        landlord:landlords ( id, auth_id, email, full_name )
      )
    `)
    .eq('id', applicationId)
    .maybeSingle()

  if (fetchErr) {
    console.error('notify-landlord fetch error', fetchErr)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }
  if (!app) {
    return NextResponse.json({ error: 'application not found' }, { status: 404 })
  }

  const listing = Array.isArray(app.listing) ? app.listing[0] : app.listing
  const landlord = listing
    ? Array.isArray(listing.landlord)
      ? listing.landlord[0]
      : listing.landlord
    : null

  // --- Ownership check ----------------------------------------------------
  // The caller must either be the landlord that owns the underlying listing,
  // OR a service-role JWT. Anything else gets 403. We compare auth_id (the
  // FK to auth.users on landlords) — never the email — to avoid edge cases
  // where two landlord rows share an email through manual fixes.
  if (!isServiceRole) {
    const ownerAuthId = (landlord as { auth_id?: string } | null)?.auth_id
    if (!ownerAuthId || ownerAuthId !== authUserId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  if (app.notified_at) {
    // Already notified — treat as success so retries from the client are
    // a no-op, not a visible error.
    return NextResponse.json({ ok: true, already_notified: true })
  }

  if (!landlord?.email) {
    console.warn('notify-landlord: no landlord email on file', { applicationId })
    return NextResponse.json(
      { error: 'landlord email missing' },
      { status: 500 },
    )
  }

  const propertyAddress = [
    listing?.address,
    listing?.unit ? `#${listing.unit}` : null,
    listing?.city,
  ]
    .filter(Boolean)
    .join(', ')

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    req.headers.get('origin') ||
    'https://www.stayloop.ai'

  const files = Array.isArray(app.files) ? app.files : []

  const { subject, html, text } = renderNewApplicationEmail({
    applicantName: `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Unknown applicant',
    applicantEmail: app.email ?? '',
    propertyAddress: propertyAddress || 'your listing',
    monthlyRent: listing?.monthly_rent ?? null,
    monthlyIncome: app.monthly_income ?? null,
    fileCount: files.length,
    dashboardUrl: `${siteUrl}/dashboard/applications/${app.id}`,
  })

  const result = await sendEmail({
    to: landlord.email,
    replyTo: app.email ?? undefined,
    subject,
    html,
    text,
  })

  if (!result.ok) {
    console.error('notify-landlord send failed', result.error)
    // Do NOT mark notified_at — we want the next retry to try again.
    return NextResponse.json(
      { error: result.error || 'send failed' },
      { status: 502 },
    )
  }

  // Stamp the application so we never re-send for this submission.
  const { error: stampErr } = await admin
    .from('applications')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', applicationId)

  if (stampErr) {
    // Not fatal — email already went out. Just log.
    console.warn('notify-landlord stamp failed', stampErr)
  }

  return NextResponse.json({ ok: true, id: result.id })
}

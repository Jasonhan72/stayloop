import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, renderNewApplicationEmail } from '@/lib/email'

export const runtime = 'edge'

/**
 * POST /api/notify-landlord
 *
 * Public endpoint, called from the /apply/[slug] page right after a tenant
 * finishes submitting. Sends the landlord an email notification about the
 * new application.
 *
 * Abuse protection:
 * - Single-shot: we set applications.notified_at on success, and refuse to
 *   send again for the same application_id. Idempotent under retries.
 * - No auth required because the caller is an unauthenticated tenant
 *   browser. All sensitive lookups happen server-side via the service role
 *   key — the client just passes an application_id.
 *
 * Request body: { application_id: string }
 */
export async function POST(req: NextRequest) {
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
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Pull the application + listing + landlord in one shot.
  const { data: app, error: fetchErr } = await admin
    .from('applications')
    .select(`
      id, first_name, last_name, email, monthly_income, files, notified_at,
      listing:listings (
        id, address, unit, city, monthly_rent,
        landlord:landlords ( id, email, full_name )
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

  if (app.notified_at) {
    // Already notified — treat as success so retries from the client are
    // a no-op, not a visible error.
    return NextResponse.json({ ok: true, already_notified: true })
  }

  const listing = Array.isArray(app.listing) ? app.listing[0] : app.listing
  const landlord = listing
    ? Array.isArray(listing.landlord) ? listing.landlord[0] : listing.landlord
    : null

  if (!landlord?.email) {
    console.warn('notify-landlord: no landlord email on file', { applicationId })
    return NextResponse.json(
      { error: 'landlord email missing' },
      { status: 500 }
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
      { status: 502 }
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

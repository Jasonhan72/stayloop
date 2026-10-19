// GET /api/consumer/alert?screening=<id> — the applicant's live identity alert
// for a screening (s.12.2: every disclosure carries it; V0.8 G19). Landlord
// JWT: whoever can read the screening under its RLS may ask. The applicant's
// email is found through the same three chains as the file request
// (application / verification request / agent intake) — never by name — and
// the response never includes the email, only {alert:{statement, created_at,
// expires_at}|null}.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { activeAlertFor, alertPublic } from '@/lib/consumer/alerts'
import { NO_STORE, adminClient } from '@/lib/consumer/server'


/** Emails this screening was addressed to, from the application / verification / intake rows. */
async function applicantEmailsFor(screeningId: string, applicationId: string | null): Promise<string[]> {
  const admin = adminClient()
  const out = new Set<string>()
  if (applicationId) {
    const { data: app } = await admin.from('applications').select('email').eq('id', applicationId).maybeSingle()
    const e = (app as { email?: string | null } | null)?.email?.trim().toLowerCase()
    if (e) out.add(e)
  }
  const { data: vrs } = await admin.from('verification_requests').select('tenant_email').eq('screening_id', screeningId).limit(5)
  for (const v of (vrs ?? []) as Array<{ tenant_email: string | null }>) if (v.tenant_email) out.add(v.tenant_email.trim().toLowerCase())
  const { data: subs } = await admin.from('agent_intake_submissions').select('applicant_email').eq('screening_id', screeningId).limit(5)
  for (const s of (subs ?? []) as Array<{ applicant_email: string | null }>) if (s.applicant_email) out.add(s.applicant_email.trim().toLowerCase())
  return Array.from(out)
}

export async function GET(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: NO_STORE })
  const screeningId = new URL(req.url).searchParams.get('screening') || ''
  if (!/^[0-9a-f-]{36}$/i.test(screeningId)) return NextResponse.json({ error: 'invalid_input', field: 'screening' }, { status: 400, headers: NO_STORE })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user) return NextResponse.json({ error: 'Invalid session' }, { status: 401, headers: NO_STORE })
  // RLS: reading the row is the proof of access.
  const { data: scr } = await sb.from('screenings').select('id, application_id').eq('id', screeningId).maybeSingle()
  if (!scr) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  const emails = await applicantEmailsFor(screeningId, (scr as { application_id: string | null }).application_id)
  const admin = adminClient()
  for (const e of emails) {
    const a = await activeAlertFor(admin, e)
    if (a) return NextResponse.json({ alert: alertPublic(a) }, { headers: NO_STORE })
  }
  return NextResponse.json({ alert: null }, { headers: NO_STORE })
}

// POST /api/screening/from-application — one-click screening from an
// application (lifecycle plan 2026-09-22 §2.1). The applicant's uploaded
// files become the screening's file manifest as-is (same bucket, paths the
// landlord may already read via application_file_readable()), the form
// fields prefill the record, and the caller is sent to
// /screening/app?screening=<id>&run=1 which scores it.
//
// Idempotent: an application that already has a screening returns it.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

type AppFile = { path?: string; name?: string; size?: number; mime?: string; kind?: string; type?: string }

export async function POST(req: Request) {
  const rawAuth = req.headers.get('authorization') || ''
  const authHeader = rawAuth.replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: ud, error: ue } = await sb.auth.getUser()
  if (ue || !ud?.user || ud.user.is_anonymous) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  const userId = ud.user.id

  let body: { application_id?: string }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 }) }
  const appId = String(body.application_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(appId)) return NextResponse.json({ error: 'application_id required' }, { status: 400 })

  // RLS ("Landlords see own applications") proves the caller owns the listing.
  const { data: app, error: aErr } = await sb
    .from('applications')
    .select('id, first_name, last_name, email, phone, monthly_income, employer_name, move_in_date, files, additional_notes, consent_screening, listing:listings(id, address, unit, monthly_rent)')
    .eq('id', appId)
    .maybeSingle()
  if (aErr || !app) return NextResponse.json({ error: 'application not found' }, { status: 404 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: existing } = await admin.from('screenings').select('id, status').eq('application_id', appId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existing) {
    await admin.from('applications').update({ screened_at: new Date().toISOString() }).eq('id', appId).is('screened_at', null)
    return NextResponse.json({ ok: true, screening_id: existing.id, existing: true, status: existing.status })
  }

  const listing = Array.isArray(app.listing) ? app.listing[0] : app.listing
  const files = (Array.isArray(app.files) ? (app.files as AppFile[]) : [])
    .filter((f) => typeof f.path === 'string' && f.path)
    .map((f) => ({ path: f.path!, name: f.name || f.path!.split('/').pop() || 'file', size: Number(f.size) || 0, mime: f.mime || 'application/octet-stream', kind: f.kind || f.type || 'other' }))
  const name = [app.first_name, app.last_name].filter(Boolean).join(' ').trim()
  const rent = listing && listing.monthly_rent != null ? Number(listing.monthly_rent) : null
  const notes = [
    `[from application ${appId}]`,
    listing ? `Listing: ${listing.address}${listing.unit ? ` #${listing.unit}` : ''}` : null,
    app.email ? `Applicant email: ${app.email}` : null,
    app.phone ? `Applicant phone: ${app.phone}` : null,
    app.monthly_income ? `Stated monthly income: $${app.monthly_income}` : null,
    app.employer_name ? `Stated employer: ${app.employer_name}` : null,
    app.move_in_date ? `Requested move-in: ${app.move_in_date}` : null,
    app.consent_screening ? 'Applicant consented to screening on the application form.' : 'NOTE: consent_screening not ticked on the application form.',
    app.additional_notes ? `Applicant notes: ${String(app.additional_notes).slice(0, 500)}` : null,
  ].filter(Boolean).join('\n')

  const { data: row, error: sErr } = await admin
    .from('screenings')
    .insert({
      landlord_id: userId,
      tenant_name: name || null,
      monthly_rent: rent,
      status: 'uploading',
      files,
      notes,
      application_id: appId,
    })
    .select('id')
    .single()
  if (sErr || !row) return NextResponse.json({ error: sErr?.message || 'could not create screening' }, { status: 500 })

  // Applicant tracker (P1 2026-09-23): the tenant sees "筛查已发起", never the result.
  await admin.from('applications').update({ screened_at: new Date().toISOString() }).eq('id', appId).is('screened_at', null)
  await admin.from('agent_audit_events').insert({
    actor_id: userId,
    actor_type: 'user',
    action: 'screening_created_from_application',
    target_type: 'screening',
    target_id: row.id,
    metadata: { application_id: appId, files: files.length },
  })
  return NextResponse.json({ ok: true, screening_id: row.id, files: files.length })
}

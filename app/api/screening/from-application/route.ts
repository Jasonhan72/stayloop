// POST /api/screening/from-application — one-click screening from an
// application (lifecycle plan 2026-09-22 §2.1). The applicant's uploaded
// files become the screening's file manifest as-is (same bucket, paths the
// landlord may already read via application_file_readable()), the form
// fields prefill the record, and the caller is sent to
// /screening/app?screening=<id>&run=1 which scores it.
//
// Four-role audit 2026-10-12 (P1-1): an application submitted with no files
// used to produce a screening row that the scorer immediately marked
// `error: no_documents`, and because "an application that already has a
// screening returns it" the landlord could never run it again — the button
// just said "open the screening report" forever. Now:
//   • documents the applicant uploads later in the application conversation
//     (thread_attachments on the application thread, uploaded by the applicant,
//     not by the landlord) count as application material — they are copied
//     into tenant-files under `<application_id>/thread/<name>` so the usual
//     prefix policies (application_file_readable) and /api/file-url apply;
//   • with still nothing to read we answer 422 `no_documents` and create no row;
//   • a previous screening that ended in `error` does not block a new run —
//     only a live or scored one is returned as "existing".
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'edge'

type AppFile = { path?: string; name?: string; size?: number; mime?: string; kind?: string; type?: string }
type Manifest = { path: string; name: string; size: number; mime: string; kind: string }

/** Attachments the applicant put in the application conversation, as a
 *  tenant-files manifest. `landlordId` uploads are excluded (the landlord may
 *  drop their own notes there; those are not applicant material). */
async function threadAttachmentsAsFiles(admin: SupabaseClient, appId: string, landlordId: string, already: Manifest[]): Promise<{ files: Manifest[]; failed: number }> {
  const { data: th } = await admin.from('threads').select('id').eq('kind', 'application').eq('ref_id', appId).limit(1).maybeSingle()
  if (!th) return { files: [], failed: 0 }
  const { data: atts } = await admin
    .from('thread_attachments')
    .select('path, name, mime, size, sha256, uploaded_by, created_at')
    .eq('thread_id', (th as { id: string }).id)
    .order('created_at', { ascending: true })
    .limit(40)
  const rows = ((atts ?? []) as { path: string; name: string; mime: string | null; size: number; sha256: string; uploaded_by: string | null }[])
    .filter((a) => a.uploaded_by && a.uploaded_by !== landlordId)
  const out: Manifest[] = []
  const seen = new Set<string>()
  let failed = 0
  for (const a of rows) {
    // The same PDF sent twice (the audit's applicant did exactly that) is one document.
    if (seen.has(a.sha256)) continue
    seen.add(a.sha256)
    const safe = (a.name || 'file').replace(/[^\w.\-一-鿿]+/g, '_').slice(0, 120)
    const dest = `${appId}/thread/${a.sha256.slice(0, 12)}-${safe}`
    if (already.some((f) => f.path === dest)) continue
    const dl = await admin.storage.from('tenancy-files').download(a.path)
    if (dl.error || !dl.data) { failed += 1; continue }
    const buf = await dl.data.arrayBuffer()
    const up = await admin.storage.from('tenant-files').upload(dest, buf, { contentType: a.mime || 'application/octet-stream', upsert: true })
    if (up.error) { failed += 1; continue }
    out.push({ path: dest, name: a.name || safe, size: Number(a.size) || buf.byteLength, mime: a.mime || 'application/octet-stream', kind: 'other' })
  }
  return { files: out, failed }
}

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
  // A run that is live or finished is the application's screening; one that
  // ended in `error` is history — the landlord may run again.
  if (existing && existing.status !== 'error') {
    await admin.from('applications').update({ screened_at: new Date().toISOString() }).eq('id', appId).is('screened_at', null)
    return NextResponse.json({ ok: true, screening_id: existing.id, existing: true, status: existing.status })
  }

  const listing = Array.isArray(app.listing) ? app.listing[0] : app.listing
  const formFiles: Manifest[] = (Array.isArray(app.files) ? (app.files as AppFile[]) : [])
    .filter((f) => typeof f.path === 'string' && f.path)
    .map((f) => ({ path: f.path!, name: f.name || f.path!.split('/').pop() || 'file', size: Number(f.size) || 0, mime: f.mime || 'application/octet-stream', kind: f.kind || f.type || 'other' }))
  const fromThread = await threadAttachmentsAsFiles(admin, appId, userId, formFiles)
  const files = [...formFiles, ...fromThread.files]
  if (!files.length) {
    return NextResponse.json({ error: 'no_documents', copy_failed: fromThread.failed }, { status: 422 })
  }
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
    fromThread.files.length ? `${fromThread.files.length} document(s) came from the application conversation (uploaded by the applicant after submitting): ${fromThread.files.map((f) => f.name).join(', ')}` : null,
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
    metadata: { application_id: appId, files: files.length, from_thread: fromThread.files.length, retry_after_error: !!existing },
  })
  return NextResponse.json({ ok: true, screening_id: row.id, files: files.length, from_thread: fromThread.files.length })
}

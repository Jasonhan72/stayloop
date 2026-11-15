import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureException } from '@/lib/observability/sentry'


/**
 * DELETE /api/screening/<id> — the landlord removes one screening and
 * everything it holds about the applicant: the uploaded files in the
 * tenant-files bucket, the applicant-verification requests (consent,
 * Veriff / Flinks / credit results) and the row itself (forensics text
 * samples, transcribed bureau data, OCR, court results).
 *
 * Review 2026-09-13: there was no way to delete a record at all, and the
 * DELETE policy only matched profileId-keyed rows while new rows are keyed
 * by authId — so even an API delete affected nothing. Ownership is proven
 * by reading the row through the caller's RLS client; the removal itself
 * runs with the service role so storage objects go with it.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader.toLowerCase().startsWith('bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const rls = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await rls.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    // A row the caller cannot read does not exist.
    const { data: row } = await rls.from('screenings').select('id, files, status, progress, landlord_id').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
    // A run that reported progress in the last 10 minutes is still writing.
    const at = Date.parse((row.progress as { at?: string } | null)?.at || '')
    if (row.status === 'scoring' && Number.isFinite(at) && Date.now() - at < 10 * 60_000) {
      return NextResponse.json({ error: 'still running', code: 'in_progress' }, { status: 409 })
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Reading is not owning (code review 2026-11-15, S2-4): the principal of a delegation can
    // read their agent's screening, and this route deletes with the service role. Only the
    // account the row belongs to — by auth id, or by its landlords row for older rows.
    const ownerKey = typeof row.landlord_id === 'string' ? row.landlord_id : ''
    let owner = ownerKey === user.id
    if (!owner && ownerKey) {
      const { data: mine } = await admin.from('landlords').select('id').eq('id', ownerKey).eq('auth_id', user.id).maybeSingle()
      owner = !!mine
    }
    if (!owner) return NextResponse.json({ error: 'only the owner can delete a screening', code: 'not_owner' }, { status: 403 })
    // `files` is a column the owner can write: only objects in this screening's own folder
    // (screenings/<owner>/<screening id>/…) or the owner's own tree are removed, never a
    // path that merely starts with screenings/.
    const ownFolder = new RegExp(`^screenings/[^/]+/${id}/`)
    const paths = (Array.isArray(row.files) ? row.files : [])
      .map((f: { path?: unknown }) => (typeof f?.path === 'string' ? f.path : null))
      .filter((p): p is string => !!p && !p.includes('..') && (ownFolder.test(p) || p.startsWith(`screenings/${user.id}/`) || (!!ownerKey && p.startsWith(`screenings/${ownerKey}/`))))
    let filesRemoved = 0
    if (paths.length) {
      const { data: removed, error: rmErr } = await admin.storage.from('tenant-files').remove(paths)
      if (rmErr) captureException(new Error(`screening delete: storage remove failed: ${rmErr.message}`), { route: 'screening-delete', level: 'warning', extra: { id } })
      filesRemoved = removed?.length ?? 0
    }
    await admin.from('verification_requests').delete().eq('screening_id', id)
    const { error: delErr } = await admin.from('screenings').delete().eq('id', id)
    if (delErr) throw delErr
    return NextResponse.json({ ok: true, files_removed: filesRemoved })
  } catch (e: any) {
    captureException(e, { route: 'screening-delete', level: 'error', extra: { id } })
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

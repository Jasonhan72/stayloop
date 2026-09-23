// /api/lease/send — landlord sends the drafted lease to the tenant for
// online signing. Generates the tenant's capability token (the signing link
// doubles as the tenant's PERMANENT read-only access to the document after
// signing — no account required), emails the invitation, audits the send.
import { underHourlyLimit } from '@/lib/rateLimit'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendLeaseInvitation, type LeaseForSend } from '@/lib/lease/sendLease'

export const runtime = 'edge'

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
  if (ue || !ud?.user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

  let body: { lease_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }
  if (!body.lease_id) return NextResponse.json({ error: 'lease_id required' }, { status: 400 })

  // RLS proves the caller can READ the lease — but tenants and household
  // members can read too, so sending additionally requires the caller to be
  // the lease's landlord (review 2026-09-19).
  const { data: lease, error: le } = await sb
    .from('lease_documents')
    .select('id, landlord_id, form_type, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature')
    .eq('id', body.lease_id)
    .maybeSingle()
  if (le || !lease) return NextResponse.json({ error: 'lease not found' }, { status: 404 })
  const { data: mine } = await sb.from('landlords').select('id').eq('auth_id', ud.user.id)
  if (!(mine ?? []).some((l: { id: string }) => l.id === lease.landlord_id)) {
    return NextResponse.json({ error: 'only the landlord can send this lease' }, { status: 403 })
  }
  if (!(await underHourlyLimit(`mail:lease-send:${ud.user.id}`, 10, false))) {
    return NextResponse.json({ error: 'hourly send limit reached' }, { status: 429, headers: { 'Retry-After': '3600' } })
  }

  const adminSb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const sent = await sendLeaseInvitation(adminSb, lease as LeaseForSend, ud.user.id)
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status })
  return NextResponse.json({ ok: true, sent_to: lease.tenant_email })
}

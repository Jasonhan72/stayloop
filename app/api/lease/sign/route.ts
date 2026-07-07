// /api/lease/sign — records an electronic signature on the lease.
// Two signer modes:
//   • tenant: token capability (no account needed) — { token, name }
//   • landlord: Bearer auth — { lease_id, name }
// Signatures are written with a CONDITIONAL update (only if that party
// hasn't signed yet) so a double-click can never overwrite a signature.
// When both parties have signed: status → signed_both, signed_at stamped,
// both parties emailed their permanent view/download links, audit written.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

export const runtime = 'edge'

type LeaseRow = {
  id: string
  status: string
  terms: Record<string, unknown>
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  sign_token: string | null
  landlord_signature: { name: string } | null
  tenant_signature: { name: string } | null
  landlord_id: string | null
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function POST(req: Request) {
  let body: { token?: string; lease_id?: string; name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }) }
  const name = (body.name || '').trim()
  if (!name || name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: 'a full legal name is required to sign' }, { status: 400 })
  }
  const admin = adminClient()

  let lease: LeaseRow | null = null
  let signer: 'tenant' | 'landlord'
  let actorId: string | null = null

  if (body.token) {
    signer = 'tenant'
    const { data } = await admin
      .from('lease_documents')
      .select('id, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature, landlord_id')
      .eq('sign_token', body.token.trim())
      .maybeSingle<LeaseRow>()
    lease = data
  } else if (body.lease_id) {
    signer = 'landlord'
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
    actorId = ud.user.id
    // RLS-scoped read = ownership check.
    const { data } = await sb
      .from('lease_documents')
      .select('id, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature, landlord_id')
      .eq('id', body.lease_id)
      .maybeSingle<LeaseRow>()
    lease = data
  } else {
    return NextResponse.json({ error: 'token or lease_id required' }, { status: 400 })
  }

  if (!lease) return NextResponse.json({ error: 'lease not found' }, { status: 404 })
  if (lease.status === 'ended') return NextResponse.json({ error: 'lease has ended' }, { status: 409 })
  if (signer === 'tenant' && lease.tenant_signature) {
    return NextResponse.json({ ok: true, already: true, status: lease.status })
  }
  if (signer === 'landlord' && lease.landlord_signature) {
    return NextResponse.json({ ok: true, already: true, status: lease.status })
  }

  const signature = { name, signed_at: new Date().toISOString(), role: signer }
  const otherSigned = signer === 'tenant' ? !!lease.landlord_signature : !!lease.tenant_signature
  const newStatus = otherSigned ? 'signed_both' : signer === 'tenant' ? 'signed_tenant' : lease.status === 'draft' ? 'sent' : lease.status

  // Conditional write: only land the signature if that slot is still empty.
  const patch: Record<string, unknown> = {
    [`${signer}_signature`]: signature,
    status: newStatus,
  }
  if (otherSigned) patch.signed_at = signature.signed_at
  const { data: updated } = await admin
    .from('lease_documents')
    .update(patch)
    .eq('id', lease.id)
    .is(`${signer}_signature`, null)
    .select('id')
  if (!updated || updated.length === 0) {
    return NextResponse.json({ ok: true, already: true, status: lease.status })
  }

  // Unskippable audit.
  await admin.from('agent_audit_events').insert({
    actor_id: actorId,
    actor_type: 'user',
    action: `lease_signed_${signer}`,
    target_type: 'lease_document',
    target_id: lease.id,
    metadata: { signer_name: name, fully_executed: otherSigned },
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
  const unit = lease.unit_label || 'the rental unit'
  const tenantLink = lease.sign_token ? `${siteUrl}/lease/sign/${lease.sign_token}` : null

  if (otherSigned) {
    // Fully executed — both parties get their permanent copies.
    if (lease.tenant_email && tenantLink) {
      await sendEmail({
        to: lease.tenant_email,
        subject: `Fully signed — your lease for ${unit}`,
        text: `Your Residential Tenancy Agreement for ${unit} is now fully signed by both parties.\n\nView and download your permanent copy anytime:\n${tenantLink}\n\n租约已由双方签署完成。上方链接长期有效，可随时查看和下载 PDF 备份。\n\n— Stayloop`,
        html: `<p>Your Residential Tenancy Agreement for <b>${unit}</b> is now <b>fully signed</b> by both parties.</p><p><a href="${tenantLink}">View &amp; download your permanent copy →</a></p><p style="color:#64748b;font-size:13px">该链接长期有效，可随时查看和下载 PDF 备份。</p>`,
      })
    }
  } else if (signer === 'tenant') {
    // Tell the landlord to countersign. Resolve their email via the lease row.
    if (lease.landlord_id) {
      const { data: ll } = await admin.from('landlords').select('email').eq('id', lease.landlord_id).maybeSingle()
      if (ll?.email) {
        await sendEmail({
          to: ll.email,
          subject: `${lease.tenant_name || 'Your tenant'} signed the lease for ${unit} — countersign to complete`,
          text: `${lease.tenant_name || 'Your tenant'} has signed the Residential Tenancy Agreement for ${unit}.\n\nCountersign in your Stayloop workspace:\n${siteUrl}/landlord/leases\n\n租客已签署租约，请在工作台回签完成签约。\n\n— Stayloop`,
          html: `<p><b>${lease.tenant_name || 'Your tenant'}</b> has signed the lease for <b>${unit}</b>.</p><p><a href="${siteUrl}/landlord/leases">Countersign in your workspace →</a></p>`,
        })
      }
    }
  }

  return NextResponse.json({ ok: true, status: newStatus, fully_executed: otherSigned, signature })
}

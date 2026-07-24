// /api/lease/send — landlord sends the drafted lease to the tenant for
// online signing. Generates the tenant's capability token (the signing link
// doubles as the tenant's PERMANENT read-only access to the document after
// signing — no account required), emails the invitation, audits the send.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

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

  // RLS scopes this to the caller's own leases — ownership check for free.
  const { data: lease, error: le } = await sb
    .from('lease_documents')
    .select('id, form_type, status, terms, tenant_name, tenant_email, unit_label, sign_token, landlord_signature, tenant_signature')
    .eq('id', body.lease_id)
    .maybeSingle()
  if (le || !lease) return NextResponse.json({ error: 'lease not found' }, { status: 404 })
  if (!lease.tenant_email) return NextResponse.json({ error: 'lease has no tenant email' }, { status: 422 })
  if (lease.tenant_signature) return NextResponse.json({ error: 'tenant has already signed' }, { status: 409 })
  // Both terms schemas (ontario_standard and trreb) carry these paths.
  const terms = lease.terms as { landlord_legal_name?: string; rent?: { amount?: number } } | null
  if (!terms?.landlord_legal_name || !terms?.rent?.amount) {
    return NextResponse.json({ error: 'lease terms incomplete — fill the form first' }, { status: 422 })
  }

  const token = lease.sign_token || (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const { error: upErr } = await sb
    .from('lease_documents')
    .update({ sign_token: token, sent_at: new Date().toISOString(), status: lease.status === 'draft' ? 'sent' : lease.status })
    .eq('id', lease.id)
  if (upErr) {
    console.error('lease send update failed:', upErr.message)
    return NextResponse.json({ error: 'send failed' }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
  const link = `${siteUrl}/lease/sign/${token}`
  const tenant = lease.tenant_name || 'there'
  const unit = lease.unit_label || 'your new home'
  const isTrreb = lease.form_type === 'trreb'
  const formLabel = isTrreb ? 'TRREB Agreement to Lease (Form 400)' : 'Ontario Standard Lease'
  const docName = isTrreb
    ? 'Agreement to Lease — Residential (TRREB Form 400 style)'
    : 'Residential Tenancy Agreement (Ontario Standard Form of Lease)'
  const result = await sendEmail({
    to: lease.tenant_email,
    subject: `Your lease for ${unit} is ready to sign — ${formLabel}`,
    text: `Hi ${tenant},

Your landlord has prepared your ${docName} for ${unit}.

Review and sign it online here:
${link}

This link is yours to keep — after signing it remains your permanent access to view and download the agreement anytime.

你的租约（${isTrreb ? 'TRREB Form 400 租赁协议' : '安省标准租约'}）已备好，点击上方链接在线查看并签署。签署完成后该链接长期有效，可随时查看和下载备份。

— Stayloop`,
    html: `<p>Hi ${tenant},</p><p>Your landlord has prepared your <b>${docName}</b> for <b>${unit}</b>.</p><p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; sign online →</a></p><p style="color:#64748b;font-size:13px">This link is yours to keep — after signing it remains your permanent access to view and download the agreement anytime.<br/>你的租约已备好，签署完成后该链接长期有效，可随时查看和下载备份。</p><p>— Stayloop</p>`,
  })
  if (!result.ok) return NextResponse.json({ error: result.error || 'email failed' }, { status: 502 })

  // Unskippable audit — service role.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  await admin.from('agent_audit_events').insert({
    actor_id: ud.user.id,
    actor_type: 'user',
    action: 'lease_sent_for_signature',
    target_type: 'lease_document',
    target_id: lease.id,
    metadata: { sent_to: lease.tenant_email, email_id: result.id, form_type: lease.form_type || 'ontario_standard' },
  })

  return NextResponse.json({ ok: true, sent_to: lease.tenant_email })
}

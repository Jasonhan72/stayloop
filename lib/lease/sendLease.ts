// Send a drafted lease for e-signature — shared by /api/lease/send (the
// landlord clicks) and the send_lease executor (the assistant proposed, the
// landlord approved). Lifecycle plan 2026-09-22 §2.1.
import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeHtml, sendEmail } from '@/lib/email'

export type LeaseForSend = {
  id: string
  landlord_id: string | null
  form_type: string | null
  status: string | null
  terms: unknown
  tenant_name: string | null
  tenant_email: string | null
  unit_label: string | null
  sign_token: string | null
  landlord_signature: unknown
  tenant_signature: unknown
}

export function leaseSendPreflight(lease: LeaseForSend): { ok: true } | { ok: false; status: number; error: string } {
  if (!lease.tenant_email) return { ok: false, status: 422, error: 'lease has no tenant email' }
  if (lease.tenant_signature) return { ok: false, status: 409, error: 'tenant has already signed' }
  const terms = lease.terms as { landlord_legal_name?: string; rent?: { amount?: number } } | null
  if (!terms?.landlord_legal_name || !terms?.rent?.amount) return { ok: false, status: 422, error: 'lease terms incomplete — fill the form first' }
  return { ok: true }
}

export function buildLeaseInvite(lease: LeaseForSend, link: string): { subject: string; text: string; html: string } {
  const tenant = escapeHtml(lease.tenant_name || 'there')
  const unit = escapeHtml(lease.unit_label || 'your new home')
  const isTrreb = lease.form_type === 'trreb'
  const formLabel = isTrreb ? 'TRREB Agreement to Lease (Form 400)' : 'Ontario Standard Lease'
  const docName = isTrreb
    ? 'Agreement to Lease — Residential (TRREB Form 400 style)'
    : 'Residential Tenancy Agreement (Ontario Standard Form of Lease)'
  return {
    subject: `Your lease for ${lease.unit_label || 'your new home'} is ready to sign — ${formLabel}`,
    text: `Hi ${lease.tenant_name || 'there'},

Your landlord has prepared your ${docName} for ${lease.unit_label || 'your new home'}.

Review and sign it online here:
${link}

This link is yours to keep — after signing it remains your permanent access to view and download the agreement anytime.

你的租约（${isTrreb ? 'TRREB Form 400 租赁协议' : '安省标准租约'}）已备好，点击上方链接在线查看并签署。签署完成后该链接长期有效，可随时查看和下载备份。

— Stayloop`,
    html: `<p>Hi ${tenant},</p><p>Your landlord has prepared your <b>${docName}</b> for <b>${unit}</b>.</p><p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; sign online →</a></p><p style="color:#64748b;font-size:13px">This link is yours to keep — after signing it remains your permanent access to view and download the agreement anytime.<br/>你的租约已备好，签署完成后该链接长期有效，可随时查看和下载备份。</p><p>— Stayloop</p>`,
  }
}

/**
 * Mint (or reuse) the signing token, stamp sent_at / status, email the
 * invitation, audit. `admin` must be the service role (the guard trigger
 * reverts sign_token on direct client writes). Ownership must already be
 * proven by the caller.
 */
export async function sendLeaseInvitation(admin: SupabaseClient, lease: LeaseForSend, actorId: string): Promise<{ ok: true; sent_to: string; email_id?: string } | { ok: false; status: number; error: string }> {
  const pre = leaseSendPreflight(lease)
  if (!pre.ok) return pre
  const token = lease.sign_token || (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const { error: upErr } = await admin
    .from('lease_documents')
    .update({ sign_token: token, sent_at: new Date().toISOString(), status: lease.status === 'draft' ? 'sent' : lease.status })
    .eq('id', lease.id)
  if (upErr) return { ok: false, status: 500, error: 'send failed' }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
  const link = `${siteUrl}/lease/sign/${token}`
  const mail = buildLeaseInvite(lease, link)
  const result = await sendEmail({ to: lease.tenant_email!, subject: mail.subject, html: mail.html, text: mail.text })
  if (!result.ok) return { ok: false, status: 502, error: result.error || 'email failed' }
  await admin.from('agent_audit_events').insert({
    actor_id: actorId,
    actor_type: 'user',
    action: 'lease_sent_for_signature',
    target_type: 'lease_document',
    target_id: lease.id,
    metadata: { sent_to: lease.tenant_email, email_id: result.id, form_type: lease.form_type || 'ontario_standard' },
  })
  return { ok: true, sent_to: lease.tenant_email!, email_id: result.id }
}

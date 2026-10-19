// POST /api/legal/terms-confirmation — email the signed-in user a confirmation that they accepted
// the current Terms (PropTx 8.05(b): the member must send an email confirming the consumer agreed to
// the Terms of Use). Sent once per terms version; the service role marks
// user_metadata.terms_confirm_sent_version so the client never asks twice. Logged in agent_audit_events.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { underHourlyLimit } from '@/lib/rateLimit'
import { API_CLAUSES, LISTING_DATA_CLAUSES, TERMS_VERSION, accountName } from '@/lib/legal/terms'


const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export async function POST(req: Request) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7E]/g, '').trim()
  if (!authHeader) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ud, error } = await sb.auth.getUser()
  const user = ud?.user
  if (error || !user || user.is_anonymous || !user.email) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  const meta = (user.user_metadata || {}) as Record<string, unknown>
  if (meta.terms_version !== TERMS_VERSION) return NextResponse.json({ error: 'terms_not_accepted' }, { status: 409 })
  if (meta.terms_confirm_sent_version === TERMS_VERSION) return NextResponse.json({ ok: true, already: true })
  if (!(await underHourlyLimit(`terms-confirm:${user.id}`, 3, false))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '3600' } })

  // Claim before sending: the primary key on (user_id, terms_version) lets exactly one of two
  // racing requests through (D-A8). Other DB errors (e.g. table not yet migrated) fall through.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: claimErr } = await admin.from('terms_confirm_claims').insert({ user_id: user.id, terms_version: TERMS_VERSION })
  if (claimErr?.code === '23505') return NextResponse.json({ ok: true, already: true })
  const claimed = !claimErr

  const zh = (req.headers.get('accept-language') || '').toLowerCase().startsWith('zh')
  const name = accountName(user)
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
  const acceptedAt = typeof meta.terms_accepted_at === 'string' ? meta.terms_accepted_at : new Date().toISOString()
  const items = LISTING_DATA_CLAUSES.map((c) => `<li style="margin:0 0 6px">${esc(zh ? c.zh : c.en)}</li>`).join('')
  const apiItems = API_CLAUSES.map((c) => `<li style="margin:0 0 6px">${esc(zh ? c.zh : c.en)}</li>`).join('')
  const subject = zh ? `你已同意 Stayloop 服务条款（${TERMS_VERSION} 版）` : `You accepted the Stayloop Terms of Service (version ${TERMS_VERSION})`
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1B1B3C;max-width:600px">
<p>${esc(name ? (zh ? `${name}，你好：` : `Hi ${name},`) : (zh ? '你好：' : 'Hello,'))}</p>
<p>${zh ? `这封邮件确认：${esc(user.email)} 这个账号已于 ${esc(acceptedAt)} 同意 Stayloop 服务条款（${TERMS_VERSION} 版）与隐私政策，其中包括房源信息的使用规则：` : `This confirms that the account ${esc(user.email)} accepted the Stayloop Terms of Service (version ${TERMS_VERSION}) and Privacy Policy on ${esc(acceptedAt)}, including the listing-data rules:`}</p>
<ol style="padding-left:20px;font-size:13.5px;color:#4A4A6A">${items}</ol>
<p>${zh ? '以及第 7 节「API 使用规则」（只对接入 Stayloop API 或 MCP 端点的开发者生效）：' : 'and section 7, the API usage rules (they apply only if you call the Stayloop API or MCP endpoint):'}</p>
<ol style="padding-left:20px;font-size:13.5px;color:#4A4A6A">${apiItems}</ol>
<p><a href="${site}/terms" style="color:#0094C6">${zh ? '查看完整条款' : 'Read the full Terms'}</a> · <a href="${site}/privacy" style="color:#0094C6">${zh ? '隐私政策' : 'Privacy Policy'}</a></p>
<p style="font-size:12.5px;color:#6E6E8A">${zh ? '同意本条款不产生任何费用，也不构成代表协议。如果这不是你本人的操作，请回复本邮件。' : 'Accepting the Terms creates no fee and no representation agreement. If this was not you, reply to this email.'}</p>
</div>`
  const text = zh ? `${esc(user.email)} 已于 ${acceptedAt} 同意 Stayloop 服务条款（${TERMS_VERSION} 版）与隐私政策。全文：${site}/terms` : `${user.email} accepted the Stayloop Terms of Service (version ${TERMS_VERSION}) and Privacy Policy on ${acceptedAt}. Full text: ${site}/terms`
  const sent = await sendEmail({ to: user.email, subject, html, text })
  if (!sent.ok) {
    if (claimed) await admin.from('terms_confirm_claims').delete().eq('user_id', user.id).eq('terms_version', TERMS_VERSION)
    return NextResponse.json({ error: 'send_failed' }, { status: 502 })
  }

  await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, terms_confirm_sent_version: TERMS_VERSION, terms_confirm_sent_at: new Date().toISOString() } })
  const { error: auditErr } = await admin.from('agent_audit_events').insert({ actor_id: user.id, actor_type: 'system', action: 'terms_confirmation_emailed', target_type: 'account', target_id: user.id, metadata: { terms_version: TERMS_VERSION, email_id: sent.id ?? null } })
  if (auditErr) console.error('terms-confirmation audit failed', auditErr.message)
  return NextResponse.json({ ok: true })
}

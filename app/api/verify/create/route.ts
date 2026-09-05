import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasProAccess } from '@/lib/billing/access'
import { newVerifyToken } from '@/lib/verify/token'
import { adminClient } from '@/lib/verify/store'
import { sendEmail } from '@/lib/email'

export const runtime = 'edge'

/**
 * POST /api/verify/create — landlord creates an applicant-verification link
 * for one of their screenings. Body: { screening_id, tenant_name?, tenant_email?, send_email? }
 * Gate: Pro/Team, or the screening is unlocked (or a credit is spent) — the
 * providers bill us per use. Returns { token, url, status }.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const rls = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await rls.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { screening_id?: string; tenant_name?: string; tenant_email?: string; send_email?: boolean }
    const screeningId = typeof body.screening_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.screening_id) ? body.screening_id : null
    if (!screeningId) return NextResponse.json({ error: 'screening_id required' }, { status: 400 })

    // Ownership through RLS: a screening the caller cannot read does not exist.
    const { data: screening } = await rls.from('screenings').select('id, tenant_name, ai_extracted_name').eq('id', screeningId).maybeSingle()
    if (!screening) return NextResponse.json({ error: 'screening not found' }, { status: 404 })

    const access = await hasProAccess(rls, user.id, screeningId)
    if (!access.ok) {
      return NextResponse.json({ error: 'verification requires Pro or a one-time unlock for this screening', code: 'locked' }, { status: 403 })
    }

    const admin = adminClient()
    // Reuse a live link for the same screening rather than minting a second one.
    const { data: existing } = await admin
      .from('verification_requests')
      .select('token, status, expires_at')
      .eq('screening_id', screeningId)
      .gt('expires_at', new Date().toISOString())
      .neq('status', 'declined')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
    let token = existing?.token as string | undefined
    let status = (existing?.status as string | undefined) || 'pending'
    const tenantName = (body.tenant_name || screening.tenant_name || screening.ai_extracted_name || '').toString().trim().slice(0, 120) || null
    const tenantEmail = typeof body.tenant_email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.tenant_email) ? body.tenant_email.trim() : null

    if (!token) {
      const { data: me } = await rls.from('landlords').select('full_name, email').or(`id.eq.${user.id},auth_id.eq.${user.id}`).limit(1).maybeSingle()
      const landlordName = ((me?.full_name as string | null) || (user.user_metadata?.full_name as string | undefined) || (me?.email as string | null) || '').toString().trim() || null
      token = newVerifyToken()
      const { error } = await admin.from('verification_requests').insert({
        token, screening_id: screeningId, landlord_id: user.id,
        landlord_name: landlordName, tenant_name: tenantName, tenant_email: tenantEmail,
      })
      if (error) throw error
      status = 'pending'
    } else if (tenantEmail) {
      await admin.from('verification_requests').update({ tenant_email: tenantEmail, ...(tenantName ? { tenant_name: tenantName } : {}) }).eq('token', token)
    }

    const url = `${siteUrl}/verify/${token}`
    let emailed = false
    if (body.send_email && tenantEmail) {
      const r = await sendEmail({
        to: tenantEmail,
        subject: 'Stayloop · 租房申请核验 / Rental application verification',
        html: `<p>你好${tenantName ? ' ' + tenantName : ''}，</p><p>你正在申请的房东通过 Stayloop 邀请你完成身份、银行流水（与征信）核验。整个过程由你本人授权，每一项都可以选择跳过。</p><p><a href="${url}">${url}</a></p><p>链接 7 天内有效。</p><hr><p>Hello${tenantName ? ' ' + tenantName : ''},</p><p>The landlord you are applying to has invited you, through Stayloop, to verify your identity and bank statements (and credit, once available). You authorise each step yourself and may skip any of them.</p><p><a href="${url}">${url}</a></p><p>The link is valid for 7 days.</p>`,
        text: `Stayloop verification link (valid 7 days): ${url}`,
      })
      emailed = r.ok
    }
    return NextResponse.json({ token, url, status, emailed, via: access.via })
  } catch (err: any) {
    console.error('verify/create error', err?.message || err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

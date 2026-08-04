// POST /api/household/invite — create invites for a household and email them.
//
// The insert runs through the CALLER'S RLS client (policy: invited_by =
// auth.uid() AND active member), so this route adds only what RLS cannot:
// the Resend send, and the caps. Caps are deliberate — Resend's free tier is
// 100 emails/day shared with magic-link logins, and an invite fan-out bug
// must not eat the login budget.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, INVALID_BODY } from '@/lib/api/body'
import { renderHouseholdInviteEmail, sendEmail } from '@/lib/email'

export const runtime = 'edge'

const MAX_PER_REQUEST = 5
const MAX_PER_HOUSEHOLD = 20
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLE_ZH: Record<string, string> = {
  landlord: '房东', tenant: '租客', agent: '经纪', property_manager: '物业管理',
}

export async function POST(req: NextRequest) {
  const authHeader = (req.headers.get('authorization') || '').replace(/[^\x20-\x7e]/g, '')
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  const user = userData?.user
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }

  const body = await readJsonBody<{
    household_id?: string
    invites?: Array<{ email?: string; role?: string }>
  }>(req)
  if (!body) return NextResponse.json(INVALID_BODY, { status: 400 })
  const householdId = typeof body.household_id === 'string' ? body.household_id : ''
  const wanted = (Array.isArray(body.invites) ? body.invites : [])
    .map((i) => ({
      email: typeof i?.email === 'string' ? i.email.trim().toLowerCase() : '',
      role: typeof i?.role === 'string' ? i.role : '',
    }))
    .filter((i) => EMAIL_RE.test(i.email) && i.email.length <= 254 && i.role in ROLE_ZH)
    .slice(0, MAX_PER_REQUEST)
  if (!householdId || !wanted.length) {
    return NextResponse.json({ error: 'household_id and at least one valid invite required' }, { status: 400 })
  }

  // Membership + household facts, under the caller's RLS: a non-member reads
  // zero rows here and the request dies as not-found, leaking nothing.
  const { data: household } = await supabase
    .from('households')
    .select('id, address, unit, city, status')
    .eq('id', householdId)
    .maybeSingle()
  if (!household) return NextResponse.json({ error: 'household not found' }, { status: 404 })
  if (household.status !== 'active') {
    return NextResponse.json({ error: 'household is not active' }, { status: 400 })
  }

  const { count } = await supabase
    .from('household_invites')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
  if ((count ?? 0) + wanted.length > MAX_PER_HOUSEHOLD) {
    return NextResponse.json({ error: 'invite limit reached for this household' }, { status: 429 })
  }

  const inviterName =
    (user.user_metadata as Record<string, unknown> | null)?.full_name as string
    || user.email?.split('@')[0]
    || 'A Stayloop user'
  const address = [household.address, household.unit ? `#${household.unit}` : null, household.city]
    .filter(Boolean).join(', ')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'

  const results: Array<{ email: string; ok: boolean }> = []
  for (const w of wanted) {
    const { data: inv, error: insErr } = await supabase
      .from('household_invites')
      .insert({ household_id: householdId, invited_email: w.email, invited_role: w.role, invited_by: user.id })
      .select('token')
      .single()
    if (insErr || !inv) {
      results.push({ email: w.email, ok: false })
      continue
    }
    const { subject, html, text } = renderHouseholdInviteEmail({
      inviterName,
      address,
      roleZh: ROLE_ZH[w.role],
      roleEn: w.role.replace('_', ' '),
      joinUrl: `${siteUrl}/join/${inv.token}`,
    })
    const sent = await sendEmail({ to: w.email, subject, html, text })
    results.push({ email: w.email, ok: sent.ok })
  }

  return NextResponse.json({ ok: true, results })
}

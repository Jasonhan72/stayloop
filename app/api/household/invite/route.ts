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

  // Per-inviter daily budget across all households (review 2026-09-14: the
  // caps were per request / per household only, and households are
  // unlimited — one account could send hundreds of Stayloop-branded mails).
  const { count: sentToday } = await supabase
    .from('household_invites')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', user.id)
    .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
  if ((sentToday ?? 0) + wanted.length > 30) {
    return NextResponse.json({ error: 'daily invite limit reached' }, { status: 429 })
  }

  const rawName =
    (user.user_metadata as Record<string, unknown> | null)?.full_name as string
    || user.email?.split('@')[0]
    || 'A Stayloop user'
  const inviterName = String(rawName).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'A Stayloop user'
  const address = [household.address, household.unit ? `#${household.unit}` : null, household.city]
    .filter(Boolean).join(', ')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'

  const results: Array<{ email: string; ok: boolean }> = []
  for (const w of wanted) {
    // Insert under the caller's RLS (membership + invited_by enforced by the
    // policy); the token column is no longer readable by `authenticated`
    // (review 2026-09-14 — it is a bearer credential other members could
    // read and decline/accept on the invitee's behalf), so read it back with
    // the service role by the row id we just created.
    const { data: inv, error: insErr } = await supabase
      .from('household_invites')
      .insert({ household_id: householdId, invited_email: w.email, invited_role: w.role, invited_by: user.id })
      .select('id')
      .single()
    if (insErr || !inv) {
      results.push({ email: w.email, ok: false })
      continue
    }
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const admin = serviceKey ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } }) : null
    const { data: tokRow } = admin ? await admin.from('household_invites').select('token').eq('id', inv.id).single() : { data: null }
    if (!tokRow?.token) {
      results.push({ email: w.email, ok: false })
      continue
    }
    const { subject, html, text } = renderHouseholdInviteEmail({
      inviterName,
      address,
      roleZh: ROLE_ZH[w.role],
      roleEn: w.role.replace('_', ' '),
      joinUrl: `${siteUrl}/join/${tokRow.token}`,
    })
    const sent = await sendEmail({ to: w.email, subject, html, text })
    results.push({ email: w.email, ok: sent.ok })
  }

  return NextResponse.json({ ok: true, results })
}

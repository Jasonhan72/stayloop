import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

export const runtime = 'edge'

/**
 * POST /api/stripe/connect/onboard
 *
 * Authenticated endpoint. Ensures the caller has a brokerage row (creating
 * one on first call), creates a Stripe Connect Express account for it if
 * needed, and returns { url } — an account-onboarding link the client
 * redirects to. The Express account id is stored on
 * brokerages.stripe_connect_id for future outbound transfers.
 *
 * Same JWT-auth pattern as /api/stripe/checkout: the browser forwards its
 * Supabase JWT in the Authorization header and all reads/writes run under
 * the caller's RLS (brokerages_owner is a FOR ALL self policy).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    let body: { name?: string } = {}
    try {
      body = await req.json()
    } catch {
      // Empty body is fine — name falls back to the email prefix.
    }

    // Load (or lazily create) the caller's brokerage.
    let { data: brokerage } = await supabase
      .from('brokerages')
      .select('id, name, registered, stripe_connect_id')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!brokerage) {
      const name =
        (body.name || '').trim() ||
        `${(user.email || 'agent').split('@')[0]} Brokerage`
      const { data: created, error: createErr } = await supabase
        .from('brokerages')
        .insert({ name, registered: false, owner_id: user.id })
        .select('id, name, registered, stripe_connect_id')
        .single()
      if (createErr || !created) {
        console.error('brokerage create failed', createErr?.message)
        return NextResponse.json({ error: 'brokerage create failed' }, { status: 500 })
      }
      brokerage = created
    }

    const stripe = getStripe()

    let accountId = brokerage.stripe_connect_id as string | null
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        email: user.email || undefined,
        metadata: { brokerage_id: brokerage.id, user_id: user.id },
      })
      accountId = account.id

      // brokerages_owner RLS (FOR ALL, self-scoped) permits this update with
      // the user's client. Fall back to the service-role client only if the
      // user-scoped write is somehow blocked, so the account id isn't lost.
      const { error: updErr } = await supabase
        .from('brokerages')
        .update({ stripe_connect_id: accountId })
        .eq('id', brokerage.id)
      if (updErr) {
        console.warn('user-scoped stripe_connect_id update blocked, using service role', updErr.message)
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
          return NextResponse.json({ error: 'not configured' }, { status: 500 })
        }
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          serviceKey,
          { auth: { persistSession: false, autoRefreshToken: false } }
        )
        const { error: adminErr } = await admin
          .from('brokerages')
          .update({ stripe_connect_id: accountId })
          .eq('id', brokerage.id)
          .eq('owner_id', user.id)
        if (adminErr) {
          console.error('stripe_connect_id persist failed', adminErr.message)
          return NextResponse.json({ error: 'persist failed' }, { status: 500 })
        }
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/agent/earnings?connect=refresh`,
      return_url: `${siteUrl}/agent/earnings?connect=done`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: link.url })
  } catch (err: any) {
    console.error('stripe/connect/onboard error', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

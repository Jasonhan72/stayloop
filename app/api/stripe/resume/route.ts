import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { pickLandlordRow } from '@/lib/billing/subscriptionState'

export const runtime = 'edge'

/**
 * POST /api/stripe/resume
 *
 * Authenticated. Un-cancels a subscription that is set to cancel at period
 * end (the "恢复订阅" button on the settings card). This is the one billing
 * mutation done in-app rather than through the portal: it is a single flag
 * flip on the landlord's own subscription with no payment surface, and the
 * portal has no deep-linkable flow for it.
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

    const { data: rows } = await supabase
      .from('landlords')
      .select('id, auth_id, stripe_subscription_id')
      .or(`id.eq.${user.id},auth_id.eq.${user.id}`)
    const landlord = pickLandlordRow(rows, user.id)
    if (!landlord?.stripe_subscription_id) {
      return NextResponse.json({ error: 'no subscription on file' }, { status: 400 })
    }

    const stripe = getStripe()
    const sub = await stripe.subscriptions.update(landlord.stripe_subscription_id, {
      cancel_at_period_end: false,
    })

    // Reflect immediately so the card re-renders without waiting for the
    // customer.subscription.updated delivery (which will write the same value).
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (serviceKey) {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      await admin
        .from('landlords')
        .update({ plan_cancel_at_period_end: false, plan_status: sub.status })
        .eq('id', landlord.id)
    }

    return NextResponse.json({ ok: true, status: sub.status })
  } catch (err: any) {
    console.error('stripe/resume error', err?.message || err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

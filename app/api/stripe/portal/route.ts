import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { pickLandlordRow } from '@/lib/billing/subscriptionState'

export const runtime = 'edge'

/**
 * POST /api/stripe/portal
 *
 * Authenticated endpoint. Creates a Stripe Billing Portal session for the
 * current landlord so they can update payment method, view invoices, or
 * cancel their subscription. Returns { url } for redirect.
 *
 * Body (optional): { return?: 'settings', flow?: 'payment_method_update' | 'subscription_cancel' }
 * `flow` deep-links straight into that portal flow and returns to the same
 * page when it completes; without it the portal opens on its home page
 * (invoice history lives there).
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
      .select('id, auth_id, stripe_customer_id, stripe_subscription_id')
      // Dual-ID invariant (CLAUDE.md): legacy landlord rows are keyed by
      // profileId with no auth_id backfill — match either column.
      .or(`id.eq.${user.id},auth_id.eq.${user.id}`)
    const landlord = pickLandlordRow(rows, user.id)

    if (!landlord?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'no stripe customer on file' },
        { status: 400 }
      )
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'

    // Optional whitelisted return target — /settings hosts the subscription
    // card, /dashboard the upgrade modal. Anything else falls back to the
    // dashboard (never echo caller-supplied URLs into Stripe).
    let returnPath = '/dashboard'
    let flow: 'payment_method_update' | 'subscription_cancel' | null = null
    try {
      const body = await req.json()
      if (body?.return === 'settings') returnPath = '/settings'
      if (body?.flow === 'payment_method_update' || body?.flow === 'subscription_cancel') flow = body.flow
    } catch { /* no body — default */ }

    const returnUrl = `${siteUrl}${returnPath}`
    const afterCompletion: Stripe.BillingPortal.SessionCreateParams.FlowData.AfterCompletion = {
      type: 'redirect',
      redirect: { return_url: returnUrl },
    }
    let flowData: Stripe.BillingPortal.SessionCreateParams.FlowData | undefined
    if (flow === 'payment_method_update') {
      flowData = { type: 'payment_method_update', after_completion: afterCompletion }
    } else if (flow === 'subscription_cancel' && landlord.stripe_subscription_id) {
      flowData = {
        type: 'subscription_cancel',
        subscription_cancel: { subscription: landlord.stripe_subscription_id },
        after_completion: afterCompletion,
      }
    }

    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: landlord.stripe_customer_id,
      return_url: returnUrl,
      ...(flowData ? { flow_data: flowData } : {}),
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('stripe/portal error', err)
    return NextResponse.json(
      { error: 'internal error' },
      { status: 500 }
    )
  }
}

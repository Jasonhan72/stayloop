import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe, stripeCryptoProvider } from '@/lib/stripe'

export const runtime = 'edge'

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook receiver. NO auth header — Stripe authenticates itself via
 * the `stripe-signature` header, which we verify with the webhook secret
 * using the edge-safe async constructor.
 *
 * Writes subscription state into public.landlords using the Supabase service
 * role key (bypasses RLS, server-only).
 *
 * Configure on Stripe Dashboard → Developers → Webhooks:
 *   URL:    https://www.stayloop.ai/api/stripe/webhook
 *   Events: checkout.session.completed
 *           customer.subscription.created
 *           customer.subscription.updated
 *           customer.subscription.deleted
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 })
  }

  const whSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!whSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      whSecret,
      undefined,
      stripeCryptoProvider
    )
  } catch (err: any) {
    console.error('webhook signature verification failed', err?.message)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  // Service-role client — bypasses RLS, never exposed to the browser.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const landlordId =
          (session.metadata?.landlord_id as string | undefined) ||
          (session.client_reference_id as string | undefined)
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id

        if (!landlordId || !customerId) {
          console.warn('checkout.session.completed missing ids', {
            landlordId, customerId, subscriptionId,
          })
          break
        }

        // Persist the customer id so future sessions reuse it.
        await admin
          .from('landlords')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId ?? null,
            plan: 'pro',
            plan_status: 'active',
          })
          .eq('id', landlordId)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id

        // Map Stripe subscription status → our plan flag.
        // 'active' and 'trialing' unlock Pro features; anything else drops to free.
        const unlocked = sub.status === 'active' || sub.status === 'trialing'

        await admin
          .from('landlords')
          .update({
            stripe_subscription_id: sub.id,
            plan: unlocked ? 'pro' : 'free',
            plan_status: sub.status,
            plan_current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq('stripe_customer_id', customerId)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id

        await admin
          .from('landlords')
          .update({
            plan: 'free',
            plan_status: 'canceled',
            stripe_subscription_id: null,
            plan_current_period_end: null,
          })
          .eq('stripe_customer_id', customerId)
        break
      }

      default:
        // Ignore events we don't care about. Stripe will still get 200.
        break
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('webhook handler error', err)
    // Return 500 so Stripe retries.
    return NextResponse.json({ error: err?.message || 'internal' }, { status: 500 })
  }
}

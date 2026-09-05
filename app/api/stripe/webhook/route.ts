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
 * role key (bypasses RLS, server-only). Checkout sessions tagged with
 * metadata.kind === 'referral_fee' instead settle the referral-commission
 * engine (public.commission / public.referral).
 *
 * Configure on Stripe Dashboard → Developers → Webhooks:
 *   URL:    https://www.stayloop.ai/api/stripe/webhook
 *   Events: checkout.session.completed
 *           customer.subscription.created
 *           customer.subscription.updated
 *           customer.subscription.deleted
 *
 * Idempotency: subscription handlers write fixed values (replay-safe). The
 * per-applicant unlock handler INCREMENTS a credit, so it goes through the
 * stripe_events ledger first — a redelivered event is acknowledged, not
 * re-credited.
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

  const stripe = getStripe()
  let event: Stripe.Event
  try {
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

  // Stripe retries a delivery until it gets a 2xx, so every handler below must
  // be safe to run twice on the same event. The subscription handlers are
  // .update()s to fixed values, so a replay writes the identical row. The
  // unlock handler increments a credit and therefore records event.id in
  // stripe_events first (unique violation = already processed). Any future
  // handler that INSERTS, increments, transfers funds or sends mail must use
  // that ledger the same way.
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // Per-applicant unlock (one-time payment, /api/stripe/unlock).
        if (session.metadata?.kind === 'unlock') {
          const landlordId = session.metadata.landlord_id as string | undefined
          const screeningId = (session.metadata.screening_id as string | undefined) || null
          const payer = session.metadata.payer === 'tenant' ? 'tenant' : 'landlord'
          if (!landlordId) {
            console.warn('unlock session missing landlord_id', session.id)
            break
          }
          // Ledger first: a replayed delivery must not credit twice.
          const { error: ledgerErr } = await admin
            .from('stripe_events')
            .insert({ id: event.id, type: event.type })
          if (ledgerErr) {
            if ((ledgerErr as { code?: string }).code === '23505') break // already processed
            throw ledgerErr
          }
          if (screeningId) {
            await admin
              .from('screenings')
              .update({ unlocked_at: new Date().toISOString(), unlock_paid_by: payer })
              .eq('id', screeningId)
              .is('unlocked_at', null)
          } else {
            const { data: row } = await admin
              .from('landlords')
              .select('unlock_credits')
              .eq('id', landlordId)
              .maybeSingle()
            await admin
              .from('landlords')
              .update({ unlock_credits: ((row?.unlock_credits as number | null) ?? 0) + 1 })
              .eq('id', landlordId)
          }
          break
        }

        // Referral-fee payments (Connect commission engine) are tagged with
        // metadata.kind by /api/stripe/connect/settle. Stamp the payment
        // reference on the commission row and flip the referral to
        // fee_settled — completely separate from the subscription flow below.
        if (session.metadata?.kind === 'referral_fee') {
          const commissionId = session.metadata.commission_id as string | undefined
          const referralId = session.metadata.referral_id as string | undefined
          const paymentIntent =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id

          if (!commissionId || !referralId) {
            console.warn('referral_fee session missing metadata ids', {
              commissionId, referralId,
            })
            break
          }

          await admin
            .from('commission')
            .update({ stripe_transfer_id: paymentIntent ?? session.id })
            .eq('id', commissionId)

          await admin
            .from('referral')
            .update({ status: 'fee_settled', updated_at: new Date().toISOString() })
            .eq('id', referralId)
          break
        }

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
            plan_cancel_at_period_end: false,
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

        // In recent Stripe API versions current_period_end moved off the
        // Subscription onto its items — fall back so the date isn't lost.
        const periodEnd =
          sub.current_period_end ??
          (sub.items?.data?.[0] as { current_period_end?: number } | undefined)
            ?.current_period_end ??
          null

        // Card on file is best-effort display data; a lookup failure must
        // not fail the delivery (Stripe would retry a state write that
        // already succeeded). Existing brand/last4 is left untouched when
        // nothing is found.
        const card = await describeCard(stripe, sub).catch(() => null)

        await admin
          .from('landlords')
          .update({
            stripe_subscription_id: sub.id,
            plan: unlocked ? 'pro' : 'free',
            plan_status: sub.status,
            plan_current_period_end: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
            // Stripe keeps status='active' until the period actually ends;
            // this flag is what turns "renews on" into "cancels on".
            plan_cancel_at_period_end: !!sub.cancel_at_period_end,
            ...(card ? { plan_card_brand: card.brand, plan_card_last4: card.last4 } : {}),
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
            plan_cancel_at_period_end: false,
            plan_card_brand: null,
            plan_card_last4: null,
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
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

// Brand + last4 of the card the subscription will charge next: the
// subscription's own default payment method, else the customer's.
async function describeCard(
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<{ brand: string; last4: string } | null> {
  let pm: Stripe.PaymentMethod | null = null
  const subPm = sub.default_payment_method
  if (typeof subPm === 'string') {
    pm = await stripe.paymentMethods.retrieve(subPm)
  } else if (subPm && typeof subPm === 'object') {
    pm = subPm
  } else {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    const customer = await stripe.customers.retrieve(customerId)
    if (!('deleted' in customer)) {
      const custPm = customer.invoice_settings?.default_payment_method
      if (typeof custPm === 'string') pm = await stripe.paymentMethods.retrieve(custPm)
      else if (custPm && typeof custPm === 'object') pm = custPm
    }
  }
  if (!pm?.card?.last4) return null
  return { brand: pm.card.brand || '', last4: pm.card.last4 }
}

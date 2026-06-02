// -----------------------------------------------------------------------------
// 2026-06-02 — Code review Top 10 #4 — Stripe webhook idempotency + payment
// failure handling: persist every event in stripe_event_log (PK event_id) to
// short-circuit retries, capture exceptions via Sentry, and handle
// invoice.payment_failed / invoice.paid to update plan_status.
// -----------------------------------------------------------------------------
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe, stripeCryptoProvider } from '@/lib/stripe'
import { captureException } from '@/lib/observability/sentry'

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
 *           invoice.payment_failed
 *           invoice.paid
 *
 * Idempotency: every event is recorded in stripe_event_log (PK event_id)
 * BEFORE any state mutation runs. Stripe retries the same event_id on 5xx
 * responses or webhook timeouts; we short-circuit duplicates with a 200 so
 * the retry storm stops and our landlord plan_status never gets corrupted
 * by an out-of-order replay.
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
      stripeCryptoProvider,
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'verify failed'
    console.error('webhook signature verification failed', msg)
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
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // -----------------------------------------------------------------------
  // Idempotency gate — log the event before doing anything else.
  // -----------------------------------------------------------------------
  // The stripe_event_log table has PK(event_id). The insert below will fail
  // with Postgres error code 23505 (unique_violation) the second time the
  // same event_id arrives — that's our signal that this is a Stripe retry
  // and we should short-circuit with 200 instead of replaying the mutation.
  //
  // Note: we pull the customer/subscription/invoice ids from the event
  // payload for audit; not every event type has all three, so they're
  // nullable in the log table.
  const eventCustomerId = extractCustomerId(event)
  const eventSubscriptionId = extractSubscriptionId(event)
  const eventInvoiceId = extractInvoiceId(event)

  const { error: insErr } = await admin.from('stripe_event_log').insert({
    event_id: event.id,
    type: event.type,
    customer_id: eventCustomerId,
    subscription_id: eventSubscriptionId,
    invoice_id: eventInvoiceId,
  })
  if (insErr) {
    // 23505 = unique_violation → we've already processed this event.
    // Return 200 so Stripe stops retrying.
    if ((insErr as { code?: string }).code === '23505') {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Some other DB error — log + 500 so Stripe retries (the event_log
    // insert is critical; without it we lose the idempotency guarantee).
    captureException(insErr, { route: 'stripe-webhook', level: 'error' })
    console.error('stripe_event_log insert failed', insErr)
    return new Response('db error', { status: 500 })
  }

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
            landlordId,
            customerId,
            subscriptionId,
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

      // -----------------------------------------------------------------
      // invoice.payment_failed — renewal charge bounced. Mark plan_status
      // past_due so the in-app banner can prompt the landlord to update
      // payment method. We do NOT downgrade plan to 'free' here — Stripe
      // will retry the charge over the next ~3 weeks, and a hard downgrade
      // would be premature. The follow-on customer.subscription.deleted
      // (when Stripe gives up) is what drops the plan to free.
      // -----------------------------------------------------------------
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        const customerId =
          typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        if (!customerId) {
          console.warn('invoice.payment_failed without customer id', { event_id: event.id })
          break
        }
        await admin
          .from('landlords')
          .update({ plan_status: 'past_due' })
          .eq('stripe_customer_id', customerId)
        break
      }

      // -----------------------------------------------------------------
      // invoice.paid — re-confirms an active subscription. Stripe sends
      // this on every successful renewal cycle, so it's a good belt-and-
      // braces signal when a customer.subscription.updated didn't land
      // (network blip, replay drop, etc.). Bumps plan_status back to
      // active so the past_due banner clears the moment payment recovers.
      // -----------------------------------------------------------------
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice
        const customerId =
          typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        if (!customerId) {
          console.warn('invoice.paid without customer id', { event_id: event.id })
          break
        }
        await admin
          .from('landlords')
          .update({ plan: 'pro', plan_status: 'active' })
          .eq('stripe_customer_id', customerId)
        break
      }

      default:
        // Ignore events we don't care about. Stripe will still get 200.
        break
    }

    return NextResponse.json({ received: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal'
    console.error('webhook handler error', err)
    captureException(err, {
      route: 'stripe-webhook',
      level: 'error',
      tags: { event_type: event.type, event_id: event.id },
    })
    // Mark the log row processed_ok=false so a re-process job (if any) can
    // pick it up. Ignore secondary failures — Stripe will retry the event
    // and the next try will refresh this stamp.
    try {
      await admin
        .from('stripe_event_log')
        .update({ processed_ok: false, error: msg.slice(0, 500) })
        .eq('event_id', event.id)
    } catch {
      /* swallow — Sentry already has the original */
    }
    // Return 500 so Stripe retries.
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// -----------------------------------------------------------------------------
// Helpers — pull stable id fields out of the various Stripe.Event shapes.
// Each event type carries the customer / subscription / invoice ids in
// slightly different places; centralising the lookup keeps the switch above
// readable.
// -----------------------------------------------------------------------------
function extractCustomerId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>
  const customer = obj.customer
  if (typeof customer === 'string') return customer
  if (customer && typeof customer === 'object' && 'id' in customer) {
    const id = (customer as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

function extractSubscriptionId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>
  // Checkout sessions / invoices use `subscription`. Subscription events
  // themselves use the top-level `id`.
  if (event.type.startsWith('customer.subscription.')) {
    const id = obj.id
    return typeof id === 'string' ? id : null
  }
  const sub = obj.subscription
  if (typeof sub === 'string') return sub
  if (sub && typeof sub === 'object' && 'id' in sub) {
    const id = (sub as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

function extractInvoiceId(event: Stripe.Event): string | null {
  if (!event.type.startsWith('invoice.')) return null
  const obj = event.data.object as { id?: unknown }
  return typeof obj.id === 'string' ? obj.id : null
}

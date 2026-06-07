// 2026-06-02 — Code review §9 P3 — Switched import from '@/lib/stripe' to
// '@/lib/stripe-client' so this route picks up the singleton instance
// instead of re-instantiating Stripe on every request.
// 2026-06-02 — Code review §2 P1 — Verify subscription status with Stripe
// before short-circuiting "already subscribed". Trusting the cached `plan`
// column let a user with plan='pro' but a past_due/canceled subscription
// remain locked out of checkout. Now we fetch fresh subscription state from
// Stripe and only block if status is 'active' or 'trialing'.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe-client'
import { captureException } from '@/lib/observability/sentry'

export const runtime = 'edge'

/**
 * POST /api/stripe/checkout
 *
 * Authenticated endpoint. Creates a Stripe Checkout Session for the Pro plan
 * for the currently signed-in landlord and returns { url } for redirect.
 *
 * The caller (Dashboard) must forward its Supabase JWT in the Authorization
 * header so we can resolve the landlord row under RLS.
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

    // Fetch the landlord row for this auth user (RLS: "own profile")
    // 2026-06-02 — §2 P1 — also pull stripe_subscription_id so we can ask
    // Stripe whether the cached plan is still actually active.
    const { data: landlord, error: landlordErr } = await supabase
      .from('landlords')
      .select('id, email, plan, stripe_customer_id, stripe_subscription_id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (landlordErr || !landlord) {
      return NextResponse.json({ error: 'landlord not found' }, { status: 404 })
    }

    const stripe = getStripe()

    // ─── §2 P1: confirm subscription is really active ─────────────────────
    // Only short-circuit if (a) the cached plan claims paid AND (b) Stripe
    // confirms the subscription is in a billable state. A user whose card
    // failed (status='past_due') or who canceled (status='canceled') MUST
    // be allowed to re-enter checkout — otherwise they're stuck.
    if (
      (landlord.plan === 'pro' || landlord.plan === 'enterprise') &&
      landlord.stripe_subscription_id
    ) {
      try {
        const sub = await stripe.subscriptions.retrieve(
          landlord.stripe_subscription_id
        )
        const billable = sub.status === 'active' || sub.status === 'trialing'
        if (billable) {
          return NextResponse.json(
            { error: 'already subscribed' },
            { status: 400 }
          )
        }
        // Subscription is in a non-billable state (past_due, canceled,
        // incomplete_expired, unpaid, paused, incomplete). Cache the
        // canonical Stripe status back into plan_status so the rest of
        // the app reflects reality, then fall through to create a new
        // Checkout session. We use the service role for the writeback so
        // the column is updated even if the user's RLS policy on
        // landlords disallows direct updates to billing fields.
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (serviceKey) {
          const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceKey,
            { auth: { persistSession: false, autoRefreshToken: false } }
          )
          await admin
            .from('landlords')
            .update({ plan_status: sub.status })
            .eq('id', landlord.id)
        }
      } catch (subErr) {
        // If Stripe says the subscription doesn't exist (deleted, wrong id,
        // etc.) we deliberately do NOT short-circuit — let the user pay
        // again. Anything else (network, 5xx) we also let through so a
        // transient Stripe blip can't permanently lock the upgrade button.
        console.warn(
          'stripe/checkout: subscription retrieve failed, falling through',
          subErr
        )
      }
    } else if (landlord.plan === 'pro' || landlord.plan === 'enterprise') {
      // Plan column says pro/enterprise but there is no subscription id on
      // file (legacy data, manual fix, etc.). Treat as already subscribed
      // — same behaviour as the pre-patch code path.
      return NextResponse.json({ error: 'already subscribed' }, { status: 400 })
    }

    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
    if (!priceId) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_STRIPE_PRICE_ID not configured' },
        { status: 500 }
      )
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'https://www.stayloop.ai'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse existing customer if we've seen this landlord pay before,
      // otherwise prefill the email and let Stripe create one.
      ...(landlord.stripe_customer_id
        ? { customer: landlord.stripe_customer_id }
        : { customer_email: landlord.email }),
      // Primary correlation id. The webhook reads this back from
      // session.metadata to find the right landlord row.
      client_reference_id: landlord.id,
      metadata: { landlord_id: landlord.id },
      subscription_data: {
        metadata: { landlord_id: landlord.id },
      },
      allow_promotion_codes: true,
      // Pro users return here; the Dashboard then polls until webhook lands.
      success_url: `${siteUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/dashboard?checkout=cancel`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'stripe session missing url' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('stripe/checkout error', err)
    captureException(err, { route: 'stripe-checkout', level: 'error' })
    return NextResponse.json(
      { error: err?.message || 'internal error' },
      { status: 500 }
    )
  }
}

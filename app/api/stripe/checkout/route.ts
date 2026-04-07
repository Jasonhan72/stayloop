import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

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
    const { data: landlord, error: landlordErr } = await supabase
      .from('landlords')
      .select('id, email, plan, stripe_customer_id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (landlordErr || !landlord) {
      return NextResponse.json({ error: 'landlord not found' }, { status: 404 })
    }

    if (landlord.plan === 'pro' || landlord.plan === 'enterprise') {
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

    const stripe = getStripe()

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
    return NextResponse.json(
      { error: err?.message || 'internal error' },
      { status: 500 }
    )
  }
}

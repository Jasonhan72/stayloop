import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

export const runtime = 'edge'

/**
 * POST /api/stripe/portal
 *
 * Authenticated endpoint. Creates a Stripe Billing Portal session for the
 * current landlord so they can update payment method, view invoices, or
 * cancel their subscription. Returns { url } for redirect.
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

    const { data: landlord } = await supabase
      .from('landlords')
      .select('stripe_customer_id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (!landlord?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'no stripe customer on file' },
        { status: 400 }
      )
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get('origin') ||
      'https://www.stayloop.ai'

    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: landlord.stripe_customer_id,
      return_url: `${siteUrl}/dashboard`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('stripe/portal error', err)
    return NextResponse.json(
      { error: err?.message || 'internal error' },
      { status: 500 }
    )
  }
}

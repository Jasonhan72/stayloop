import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

export const runtime = 'edge'

/**
 * POST /api/stripe/connect/settle
 *
 * Authenticated endpoint. Body: { referral_id, gross }.
 *
 * Runs the 25% referral-commission engine (settle_referral_commission RPC —
 * enforces caller owns the paying to_brokerage, referral is 'closed', and
 * both brokerages are registered), then creates a Stripe Checkout Session
 * (payment mode) to collect the fee from the payer. The fee is INBOUND to
 * Stayloop: the partner brokerage that closed the deal owes the platform.
 *
 * The webhook stamps commission.stripe_transfer_id with the payment intent
 * and flips referral → 'fee_settled' on checkout.session.completed.
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

    let body: { referral_id?: string; gross?: number } = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    }

    const referralId = body.referral_id
    const gross = Number(body.gross)
    if (!referralId || !Number.isFinite(gross) || gross < 0) {
      return NextResponse.json({ error: 'referral_id and gross required' }, { status: 400 })
    }

    // The RPC runs under the USER's client — it enforces ownership,
    // referral status and ComplianceGuard itself, and is idempotent
    // (returns already_settled for an existing commission).
    const { data: settled, error: rpcErr } = await supabase.rpc(
      'settle_referral_commission',
      { ref_id: referralId, gross }
    )
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 })
    }

    // Repaired RPC returns jsonb {commission_id, ...} or {already_settled: true, ...};
    // older shape returned the commission row itself ({id, ...}).
    const settledObj = (settled ?? {}) as Record<string, unknown>
    const commissionId =
      (settledObj.commission_id as string | undefined) ||
      (settledObj.id as string | undefined)
    if (!commissionId) {
      console.error('settle RPC returned no commission id', settled)
      return NextResponse.json({ error: 'settlement failed' }, { status: 500 })
    }

    // Load the commission row (RLS: payer brokerage owner = caller).
    const { data: commission, error: comErr } = await supabase
      .from('commission')
      .select('id, referral_id, fee_amount, stripe_transfer_id')
      .eq('id', commissionId)
      .maybeSingle()
    if (comErr || !commission) {
      return NextResponse.json({ error: 'commission not found' }, { status: 404 })
    }

    if (commission.stripe_transfer_id) {
      return NextResponse.json({
        paid: true,
        already: true,
        commission_id: commission.id,
        fee_amount: Number(commission.fee_amount),
      })
    }

    const feeAmount = Number(commission.fee_amount)
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
      return NextResponse.json({ error: 'invalid fee amount' }, { status: 500 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
    const stripe = getStripe()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            unit_amount: Math.round(feeAmount * 100),
            product_data: { name: 'Stayloop referral fee — 25%' },
          },
          quantity: 1,
        },
      ],
      ...(user.email ? { customer_email: user.email } : {}),
      // The webhook branches on kind === 'referral_fee' to stamp the
      // commission and flip the referral status.
      metadata: {
        kind: 'referral_fee',
        commission_id: commission.id,
        referral_id: commission.referral_id,
      },
      success_url: `${siteUrl}/agent/earnings?fee=paid`,
      cancel_url: `${siteUrl}/agent/earnings?fee=cancelled`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'stripe session missing url' }, { status: 500 })
    }

    return NextResponse.json({
      url: session.url,
      commission_id: commission.id,
      fee_amount: feeAmount,
    })
  } catch (err: any) {
    console.error('stripe/connect/settle error', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

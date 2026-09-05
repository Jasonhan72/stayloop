import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import { pickLandlordRow } from '@/lib/billing/subscriptionState'

export const runtime = 'edge'

/**
 * POST /api/stripe/unlock
 *
 * One-time, per-applicant unlock of Pro-level checks (deep cross-check today;
 * ID / bank / credit direct verification as they launch) — the industry's
 * "pay per report" door, without touching the Pro subscription.
 *
 * Body: { screening_id?: string, payer?: 'landlord' | 'tenant', tenant_email?: string }
 *   · payer 'landlord' (default): the signed-in landlord pays and is
 *     redirected to Stripe now. The unlock lands on `screening_id` when
 *     given, otherwise as a prepaid credit (landlords.unlock_credits).
 *   · payer 'tenant': returns a Checkout URL the landlord sends to the
 *     applicant. The applicant pays; the unlock still lands on the
 *     landlord's screening (metadata carries landlord_id + screening_id).
 *     Checkout links expire after 24 h — the UI says so.
 *
 * Fulfilment is in the webhook (checkout.session.completed, metadata.kind =
 * 'unlock'), guarded by the stripe_events ledger because crediting is an
 * increment and Stripe retries deliveries.
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

    const body = (await req.json().catch(() => ({}))) as {
      screening_id?: string; payer?: string; tenant_email?: string
    }
    const payer: 'landlord' | 'tenant' = body.payer === 'tenant' ? 'tenant' : 'landlord'
    const screeningId = typeof body.screening_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.screening_id)
      ? body.screening_id : null
    const tenantEmail = typeof body.tenant_email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.tenant_email)
      ? body.tenant_email.trim() : null

    const { data: rows } = await supabase
      .from('landlords')
      .select('id, auth_id, email, stripe_customer_id')
      .or(`id.eq.${user.id},auth_id.eq.${user.id}`)
    let landlord = pickLandlordRow(rows, user.id)
    if (!landlord) {
      // Same self-heal as /api/stripe/checkout: the row is created lazily.
      const { data: claimed } = await supabase.rpc('claim_landlord')
      const row = Array.isArray(claimed) ? claimed[0] : claimed
      if (row && typeof row === 'object' && 'id' in row) landlord = row as any
    }
    if (!landlord) {
      return NextResponse.json({ error: 'landlord not found' }, { status: 404 })
    }

    // The screening must belong to the caller (RLS scopes the read) and
    // must not already be unlocked — never charge twice for the same one.
    if (screeningId) {
      const { data: s } = await supabase
        .from('screenings')
        .select('id, unlocked_at')
        .eq('id', screeningId)
        .maybeSingle()
      if (!s) return NextResponse.json({ error: 'screening not found' }, { status: 404 })
      if (s.unlocked_at) return NextResponse.json({ error: 'already unlocked' }, { status: 400 })
    }

    const priceId = process.env.NEXT_PUBLIC_STRIPE_UNLOCK_PRICE_ID
    if (!priceId) {
      return NextResponse.json({ error: 'not configured' }, { status: 500 })
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.stayloop.ai'
    const back = screeningId
      ? `${siteUrl}/screening/app?screening=${screeningId}`
      : `${siteUrl}/screening/app`

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // Landlord pays: reuse their Stripe customer so it shows in their
      // portal invoices. Tenant pays: a fresh guest checkout — the tenant
      // must never be attached to the landlord's customer record.
      ...(payer === 'landlord'
        ? (landlord.stripe_customer_id
            ? { customer: landlord.stripe_customer_id }
            : { customer_email: landlord.email ?? undefined })
        : (tenantEmail ? { customer_email: tenantEmail } : {})),
      client_reference_id: landlord.id,
      metadata: {
        kind: 'unlock',
        landlord_id: landlord.id,
        screening_id: screeningId ?? '',
        payer,
      },
      allow_promotion_codes: true,
      success_url: `${back}${back.includes('?') ? '&' : '?'}unlocked=1`,
      cancel_url: back,
      // 24 h for a link the landlord forwards to the applicant.
      ...(payer === 'tenant' ? { expires_at: Math.floor(Date.now() / 1000) + 24 * 3600 } : {}),
    })

    return NextResponse.json({ url: session.url, payer })
  } catch (err: any) {
    console.error('stripe/unlock error', err?.message || err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

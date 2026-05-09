# Stayloop 🏠

AI-powered tenant screening platform for Ontario landlords.

## Features
- 📋 Online tenant application forms with shareable links
- 🤖 AI scoring using Claude API (income ratio, employment, rental history)
- ⚖️ LTB record search via CanLII API
- 🔒 PIPEDA & Ontario Human Rights Code compliant
- 📊 Landlord dashboard with real-time analytics

## Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: Anthropic Claude API
- **LTB Records**: CanLII API
- **Deployment**: Cloudflare Pages

## Getting Started

```bash
npm install
cp .env.example .env.local
# Fill in your API keys
npm run dev
```

## Environment Variables
See `.env.example` for required variables.

## Database Schema
Run `/supabase/schema.sql` against your Supabase project.

## Email notifications (Resend)

When a tenant submits an application on `/apply/[slug]`, Stayloop fires a
one-off notification email to the landlord via Resend with the applicant's
name, property address, income/rent ratio, document count, and a deep link
to the application detail page.

The route `/api/notify-landlord` is public but idempotent: it stamps
`applications.notified_at` on success and refuses to re-send for the same
application id. It uses `SUPABASE_SERVICE_ROLE_KEY` to look up the landlord
email server-side — no auth required from the tenant's browser.

### Setup
1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/mo).
2. Add and verify `stayloop.ai` as a sending domain (Resend will print the
   DNS records to add to Cloudflare).
3. Create an API key and paste it into `RESEND_API_KEY`.
4. Set `RESEND_FROM="Stayloop <notifications@stayloop.ai>"`.
5. Add the same values to Cloudflare Pages env for production.

Until the env vars are set, the route returns 500 and the apply page
silently carries on (the applicant still sees the success screen — the
email is fire-and-forget).

## Stripe (Pro subscription)

Stayloop uses Stripe Checkout + Customer Portal for the $29/mo Pro plan.
All Stripe routes live under `app/api/stripe/` and run on the edge runtime.

### One-time Stripe Dashboard setup
1. Create a product **Stayloop Pro** with a recurring monthly price at **$29**.
   Copy the `price_...` id into `NEXT_PUBLIC_STRIPE_PRICE_ID`.
2. Enable the Customer Portal under **Settings → Billing → Customer portal**
   and turn on cancellation, payment method updates, and invoice history.
3. Add a webhook endpoint pointing at
   `https://www.stayloop.ai/api/stripe/webhook` with events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

### Local dev
```bash
# 1. Fill in STRIPE_SECRET_KEY (test key) and NEXT_PUBLIC_STRIPE_PRICE_ID in .env.local
# 2. Forward webhooks from Stripe to your local server:
stripe listen --forward-to localhost:3000/api/stripe/webhook
# 3. Paste the whsec_... it prints into STRIPE_WEBHOOK_SECRET and restart `npm run dev`.
```

### Required env vars
```
STRIPE_SECRET_KEY          # sk_test_... locally, sk_live_... in prod
STRIPE_WEBHOOK_SECRET      # whsec_... from `stripe listen` or Dashboard
NEXT_PUBLIC_STRIPE_PRICE_ID # price_...
SUPABASE_SERVICE_ROLE_KEY  # used by the webhook to bypass RLS
NEXT_PUBLIC_SITE_URL       # e.g. https://www.stayloop.ai
```

### How it flows
1. Free landlord clicks **Upgrade** → Dashboard POSTs to `/api/stripe/checkout`
   → Stripe redirects to hosted Checkout.
2. Landlord pays → Stripe fires `checkout.session.completed` →
   `/api/stripe/webhook` writes `plan='pro'` on the landlord row (service role).
3. User returns to `/dashboard?checkout=success` → Dashboard polls
   `landlords.plan` every second until it flips to `pro`, then shows a banner.
4. Pro landlords see a **Manage billing** button that opens the Stripe
   Customer Portal via `/api/stripe/portal`.

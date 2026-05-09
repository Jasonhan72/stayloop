# Deploy: Stripe Pro checkout + Resend landlord notifications

The patch file `stripe-resend.patch` next to this README contains the
finished, build-tested commit that wires up Stripe self-serve checkout
and Resend landlord email notifications. It applies cleanly on top of
`origin/main` at `f935328`.

## What's in the commit

- `app/api/stripe/{checkout,webhook,portal}/route.ts` — edge routes,
  signature verification via `constructEventAsync` so it works on
  Cloudflare Pages
- `app/api/notify-landlord/route.ts` — public edge endpoint, idempotent
  via `applications.notified_at`
- `lib/stripe.ts`, `lib/email.ts` — edge-safe clients for Stripe and
  Resend (fetch-based, no Node-only deps)
- `app/dashboard/page.tsx` — Upgrade modal now POSTs to
  `/api/stripe/checkout`, post-checkout polling banner, "Manage billing"
  button for Pro users
- `app/apply/[slug]/page.tsx` — fire-and-forget call to
  `/api/notify-landlord` after a successful submit
- `package.json` / `package-lock.json` — adds `stripe@^17.7.0`
- `.env.example` — documents the new env vars

## Verified before commit

- [x] `npm run build` — clean, all 9 edge routes compile
- [x] `npm run pages:build` (`@cloudflare/next-on-pages`) — clean
- [x] Supabase columns already exist on `upbkcbicjjpznojkpqtg`:
      `applications.notified_at`, `landlords.stripe_customer_id`,
      `stripe_subscription_id`, `plan_status`, `plan_current_period_end`

## To deploy

In your real local stayloop repo (whichever folder has the actual
`.git` pointing at `Jasonhan72/stayloop`), run:

```bash
git fetch origin
git checkout main
git pull --ff-only
git am < ~/path/to/this/folder/stripe-resend.patch
git push origin main
```

If you'd rather not bother with `git am`, this also works:

```bash
git apply --3way ~/path/to/this/folder/stripe-resend.patch
git add -A
git commit -m "feat: wire up Stripe Pro checkout + Resend landlord notifications"
git push origin main
```

Cloudflare Pages will pick up the push and deploy automatically.

## After Cloudflare deploy lands

Smoke-test in test mode:

1. Sign in to https://www.stayloop.ai/dashboard as a free landlord
2. Click **Upgrade** → **Upgrade to Pro →**
3. In Stripe Checkout, use card `4242 4242 4242 4242`, any future
   expiry, any CVC
4. You should land back on `/dashboard?checkout=success`, see the
   "Payment received — unlocking Pro…" banner, and within ~5s see it
   flip to "Welcome to Pro!" with a Pro badge in the nav
5. Click **Manage billing** → confirms the portal opens
6. Submit a test application from a listing's `/apply/[slug]` page
   and confirm the landlord email arrives via Resend

If the polling banner gets stuck on "unlocking Pro…", check the
Cloudflare Pages function logs for `/api/stripe/webhook` — usually
either `STRIPE_WEBHOOK_SECRET` is wrong or the webhook event types
in the Stripe Dashboard don't include `checkout.session.completed`.

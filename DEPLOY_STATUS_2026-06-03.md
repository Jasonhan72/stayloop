# Stayloop Production Hardening — Status Snapshot 2026-06-03

## Production is healthy

Live commit on main: **`a818777d`**
- All DB migrations applied (see below)
- Top-10 P0 patches deployed
- Batch A (lazy Supabase + useUser cache fix)
- Batch B (dashboard pagination)

## What's LIVE in production

### Database (migrations applied)

| Migration | What it does |
|---|---|
| `unique_landlords_stripe_customer_id` | UNIQUE INDEX prevents customer-id collisions |
| `harden_claim_landlord_role` | RPC drops the role-taking overload; defaults role to `landlord` |
| `tighten_applications_anon_insert` | RLS now requires listing-exists + email + ai-fields-null + 30/24h throttle |
| `stripe_event_log_idempotency` | Webhook idempotency table |
| `missing_rls_join_indexes_and_unsubscribe` | 6 hot-path indexes + email_unsubscribes table + is_email_unsubscribed RPC |
| `storage_orphan_cleanup_trigger` | pending_storage_deletions queue + 3 BEFORE-DELETE triggers (PIPEDA) |
| `consent_screening_and_storage_drain` | RLS requires consent_screening=true + claim_pending_storage_deletions / mark_storage_deletion_done RPCs |
| `fix_dead_registry_urls_in_deep_check` | One-shot fix of cached bad URLs |

### Code (live in `a818777d`)

- All screening engine fixes (rent extraction precision, OCR Vision fingerprinting, dimension zeroing fix, AI credit-report judgment, `lease` classification, etc.)
- Top-10 P0:
  - Agent tools (classify-files / run-pdf-forensics / import-listing) sign only caller-owned paths
  - import-listing SSRF guard
  - Stripe webhook idempotency + invoice.payment_failed / paid handlers
  - classify-files + notify-landlord bearer-token auth gate
  - Sentry `captureException` wired into 12 routes
  - app/error.tsx + app/not-found.tsx + app/loading.tsx
- Phase-2 partial:
  - `lib/supabase.ts` — lazy Proxy (prerender-safe)
  - `lib/useUser.ts` — clears stale cache on getSession error
  - `app/dashboard/page.tsx` — listings query capped at 50 rows

## What's PENDING in `.screen-patches/`

These patches exist but failed CF Pages build when pushed together. They need to be **debugged locally with `npm run build`** before re-pushing.

### Confirmed broken when pushed (lib-email + unsubscribe trio)

| File | Suspected issue |
|---|---|
| `lib-email.ts` | Uses crypto.subtle + Resend retry + supabase RPC suppression check. TS-clean but webpack fails. |
| `app-unsubscribe-page.tsx` | Next.js 15 `searchParams` Promise typing |
| `app-unsubscribe-route.ts` | Edge route + form-body parsing |
| `notify-landlord-route.ts` | Imports new `verifyUnsubscribeToken` from lib-email |

### Not yet attempted as a batch

| File | Purpose |
|---|---|
| `stripe-webhook-route.ts` | charge.dispute.created + charge.refunded handlers |
| `stripe-checkout-route.ts` | plan_status verification via Stripe API |
| `stripe-portal-route.ts` | Uses lib/stripe-client singleton |
| `lib-stripe-client.ts` | Singleton wrapper |
| `cron-drain-storage-route.ts` | Drains pending_storage_deletions |
| `file-url-route.ts` | DB-backed path ownership check |
| `screen-score-route.ts` (extended) | CanLII circuit breaker (12s aggregate budget) |
| `agent-chat-route.ts` | Prompt-injection attachment wrapping |
| `agent-classify-files.ts` / `agent-run-pdf-forensics.ts` / `agent-import-listing.ts` / `agent-lookup-corp-registry.ts` / `agent-save-listing.ts` | Hand-rolled tool input validators |
| `next-config.js` + `listings-page.tsx` + `listings-slug-page.tsx` | next/image migration |
| `ai-score-route.ts` / `ltb-search-route.ts` / `agent-action-route.ts` | (Were in Top-10 already, dup) |

## How to debug the build failure

GitHub Actions runs `npx @cloudflare/next-on-pages@latest` which internally runs `next build`. The failure surfaces as `Next.js build worker exited with code: null and signal: SIGBUS`. **`tsc --noEmit` passes** — the failure is during webpack compilation, not type checking.

To get the real error:

```bash
cd /Users/neos/Documents/Claude/Projects/stayloop
git clone --depth=1 -b main https://github.com/Jasonhan72/stayloop.git /tmp/stayloop-debug
cd /tmp/stayloop-debug
npm ci
# Copy ONE patch from .screen-patches/ to its target
cp ../../stayloop/.screen-patches/lib-email.ts lib/email.ts
# Run the build locally
NEXT_PUBLIC_SUPABASE_URL=https://upbkcbicjjpznojkpqtg.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
NODE_OPTIONS='--max-old-space-size=4096' \
npx next build 2>&1 | tail -100
```

The actual error will appear in the last 100 lines. Common culprits:
- Edge-incompatible npm package (e.g. `crypto` Node built-in instead of `crypto.subtle`)
- Circular import
- Sentry instrumentation pulling in Node-only code
- Bundle size exceeding CF Workers' 1 MB limit (gzipped)

## Action items by priority

1. **Set `CRON_SECRET` env var** in CF Pages — needed before deploying `cron-drain-storage-route.ts`
2. **Set `SECRET_UNSUBSCRIBE_KEY`** env var — needed for HMAC token security in `lib-email.ts`
3. **Stripe Dashboard** — add `charge.dispute.created` + `charge.refunded` to webhook event subscriptions
4. **Local-build verify the patches** before re-pushing — use the debug recipe above
5. **Patches that need careful local testing first** (highest impact, but currently broken):
   - lib-email + unsubscribe trio (CASL compliance)
   - cron-drain-storage (PIPEDA actually deletes orphaned files)
   - Stripe webhook charge.dispute / refund handlers

## Scripts available in this folder

| Script | What it does |
|---|---|
| `apply-screen-fixes.command` | Apply ALL patches in PATCH_MAP — used for big multi-file pushes |
| `apply-batch.command` | Apply a SINGLE batch defined inline in the script |
| `restore-prod.command` | Hard-reset main to `ec97b9d` (the original Top-10 commit) |
| `revert-to-batch-b.command` | Hard-reset main to `a818777d` (current state) |
| `revert-failed-c2.command` | Same as above (used after the lib-email batch failed) |
| `fetch-build-log.command` | Pull failing CF Pages build log via `gh` CLI |
| `cf-deploy-v5.command` | (Legacy) Cloudflare Pages deploy from local build |

## Final tally

| Phase | Status | Commits |
|---|---|---|
| Screening engine bug-fix wave | ✅ Live | `60ecd14 → ffa3040` (7) |
| Top-10 P0 patches | ✅ Live | `ec97b9d` |
| Batch A + B | ✅ Live | `a818777d` (current) |
| Phase-2 unsubscribe + Phase-3 cron + Phase-4 next/image + agent-chat | ❌ Patches saved, build needs local debug | — |

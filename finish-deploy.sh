#!/bin/bash
# Finish the Stripe + Resend deploy.
#
# Current state:
#   - Branch `stripe-resend-deploy` exists on GitHub
#   - 4/11 files already committed on that branch:
#       .env.example, lib/stripe.ts, lib/email.ts,
#       app/api/notify-landlord/route.ts
#   - 7 files still missing
#
# This script:
#   1. Clones stayloop fresh into a temp dir
#   2. Checks out the stripe-resend-deploy branch
#   3. Applies the rest of the changes from stripe-resend.patch
#      (the patch contains the FULL 11-file commit, but the 4 already-
#       committed files will just merge cleanly as no-ops)
#   4. Pushes to origin
#   5. Merges stripe-resend-deploy -> main so Cloudflare Pages deploys
#
# Usage:
#   cd ~/path/to/folder/containing/this/script
#   bash finish-deploy.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATCH="$SCRIPT_DIR/stripe-resend.patch"

if [ ! -f "$PATCH" ]; then
  echo "ERROR: stripe-resend.patch not found next to this script."
  echo "Expected at: $PATCH"
  exit 1
fi

TMP="$(mktemp -d)"
echo "→ Working in $TMP"
cd "$TMP"

echo "→ Cloning stayloop..."
git clone --depth 20 https://github.com/Jasonhan72/stayloop.git
cd stayloop

echo "→ Fetching stripe-resend-deploy branch..."
git fetch origin stripe-resend-deploy:stripe-resend-deploy
git checkout stripe-resend-deploy

echo "→ Resetting branch to main so we can re-apply the full clean commit..."
git reset --hard origin/main

echo "→ Applying stripe-resend.patch..."
git am --3way "$PATCH" || {
  echo "git am failed, trying git apply + manual commit..."
  git am --abort || true
  git apply "$PATCH"
  git add -A
  git commit -m "feat: Stripe Pro checkout + Resend landlord notifications"
}

echo "→ Force-pushing stripe-resend-deploy (overwrite partial commits)..."
git push --force-with-lease origin stripe-resend-deploy

echo "→ Merging into main..."
git checkout main
git pull --ff-only origin main
git merge --no-ff stripe-resend-deploy -m "Merge stripe-resend-deploy: Stripe Pro + Resend notifications"
git push origin main

echo ""
echo "✅ Done. Cloudflare Pages should pick up the push to main within ~1 min."
echo "   Watch: https://dash.cloudflare.com/?to=/:account/pages"
echo ""
echo "Next steps:"
echo "   1. Verify Cloudflare env vars are set (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,"
echo "      NEXT_PUBLIC_STRIPE_PRICE_ID, RESEND_API_KEY, RESEND_FROM, SUPABASE_SERVICE_ROLE_KEY)"
echo "   2. Smoke test: click Upgrade on dashboard, use test card 4242 4242 4242 4242"
echo "   3. Submit a test application and confirm Resend email lands"

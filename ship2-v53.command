#!/bin/bash
# Build for Cloudflare Workers (OpenNext) + deploy to production with GLOBAL wrangler (npx hangs).
#
# Since 2026-10-19 production is the Worker "stayloop-web" (wrangler.jsonc),
# reached through zone routes www.stayloop.ai/* and stayloop.ai/*. The old
# Pages project "stayloop" and its last deployment are kept as the emergency
# fallback (see ROLLBACK at the bottom). History: design/history/.
cd "$(dirname "$0")" || exit 1

# Pin the toolchain to Node 22 LTS (node 26 runs all JS 10-100x slower).
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
echo "node $(node --version) · npm $(npm --version) · wrangler $(wrangler --version 2>/dev/null)"
LOG=ship2.log
exec > >(tee "$LOG") 2>&1

rollback_help() {
  echo "ROLLBACK, fastest first:"
  echo "  1) previous Worker version:   wrangler rollback --name stayloop-web -y"
  echo "     (or a specific one:        wrangler versions list --name stayloop-web ; wrangler rollback <version-id> --name stayloop-web -y)"
  echo "  2) back to the Pages project:  bash scripts/worker-routes.sh off"
  echo "     (removes the zone routes; www/apex fall through to Pages, whose last deployment is the pre-migration build)"
}
fail() { echo; echo "!!!!! $* !!!!!"; echo "NOT DEPLOYED. Nothing was pushed to production."; exit 1; }

echo "===== pre-flight: types + tests ($(date)) ====="
npx tsc --noEmit || fail "TYPE CHECK FAILED"
npm test --silent || fail "TESTS FAILED"
echo "pre-flight OK"

echo "===== commit + push ====="
rm -f .git/HEAD.lock .git/index.lock
git add -A
git commit -m "chore(deploy): ship $(date '+%Y-%m-%d %H:%M')" || echo "(nothing new to commit)"
git push origin HEAD:v5.3-launch || echo "(push skipped)"

echo "===== clean stale build cache ====="
rm -rf .open-next .next
# ~/Documents is an iCloud Drive domain: strip "name 2.js" duplicates and mark the
# build dirs not-synced before the build (and again after — OpenNext recreates
# .open-next). See scripts/icloud-nosync.sh and design/history/2026-10.md.
bash scripts/icloud-nosync.sh

echo "===== build (OpenNext) ====="
export NODE_OPTIONS=--max-old-space-size=4096
npx opennextjs-cloudflare build || fail "BUILD FAILED"
bash scripts/icloud-nosync.sh

# A build can succeed and still emit a bundle without the server function,
# which would 404/405 every API and dynamic route (the app/icon.svg incident
# under next-on-pages). worker.js is only a ~2 KB shell; the server lives in
# handler.mjs, so require both.
[ -s .open-next/worker.js ] || fail ".open-next/worker.js MISSING or empty"
[ -s .open-next/server-functions/default/handler.mjs ] || fail "server handler MISSING — static-only bundle would kill all API/dynamic routes"

# OpenNext copies every .env* file (service-role, Stripe LIVE…) into the
# bundle. Strip it to NEXT_PUBLIC_* and refuse to ship if any private value
# is still anywhere in .open-next. Server secrets live in Worker secrets.
node scripts/opennext-env-guard.mjs || fail "PRIVATE ENV VALUES IN THE BUNDLE"

PREV_VERSION=$(wrangler deployments list --name stayloop-web --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const d=a[a.length-1];console.log(d.versions[0].version_id)}catch{console.log("")}})')
echo "current production version (rollback target): ${PREV_VERSION:-unknown}"

echo "===== deploy to production (global wrangler) ====="
wrangler deploy || fail "WRANGLER DEPLOY FAILED"

echo "===== post-deploy smoke ====="
# One retry: two probes legitimately flake right after a deploy (edge cache
# propagation). A real regression fails both attempts.
if bash scripts/smoke.sh; then
  echo "===== route & API contract audit ====="
  node scripts/route-audit.mjs | grep -E '^FAIL|^SUMMARY' || true
  echo "================ SHIP2 DONE — smoke green $(date) ================"
else
  echo
  echo "----- a probe was red; waiting 30s and retrying once -----"
  sleep 30
  if bash scripts/smoke.sh; then
    echo "================ SHIP2 DONE — smoke green on retry $(date) ================"
  else
    echo
    echo "!!!!! SMOKE FAILED TWICE — the deploy is LIVE but a probe is genuinely red !!!!!"
    echo "This is a rollback trigger."
    [ -n "$PREV_VERSION" ] && echo "  previous version id: $PREV_VERSION  →  wrangler rollback $PREV_VERSION --name stayloop-web -y"
    rollback_help
    exit 1
  fi
fi
echo "(You can close this window.)"

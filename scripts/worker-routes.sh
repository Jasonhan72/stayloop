#!/usr/bin/env bash
# Zone routes that send www / apex / screening.stayloop.ai to the Worker "stayloop-web".
#
#   bash scripts/worker-routes.sh status   # list the zone's Worker routes
#   bash scripts/worker-routes.sh off      # EMERGENCY FALLBACK: delete the stayloop-web routes;
#                                          # traffic falls through to the Pages project "stayloop"
#   bash scripts/worker-routes.sh on       # (re)create them; `wrangler deploy` leaves existing routes alone
#
# The routes are managed here, not in wrangler.jsonc. Credential: CLOUDFLARE_API_TOKEN
# from the repo's .env.local (fallback: wrangler's OAuth file); only ever sent in a
# header, never printed.
set -euo pipefail
ZONE_NAME=stayloop.ai
SCRIPT=stayloop-web
PATTERNS=("www.stayloop.ai/*" "stayloop.ai/*" "screening.stayloop.ai/*")
[ -n "${ONLY:-}" ] && PATTERNS=("$ONLY")   # e.g. ONLY='screening.stayloop.ai/*' for a canary

cd "$(dirname "$0")/.." || exit 1
HDR=$(mktemp); trap 'rm -f "$HDR"' EXIT
chmod 600 "$HDR"
# Same credential wrangler uses here: CLOUDFLARE_API_TOKEN from the repo's .env.local
# (falls back to wrangler's OAuth login file).
TOKEN=$(sed -nE 's/^CLOUDFLARE_API_TOKEN *= *"?([^"]*)"?$/\1/p' .env.local 2>/dev/null | head -1)
if [ -z "$TOKEN" ]; then
  CFG="$HOME/Library/Preferences/.wrangler/config/default.toml"
  [ -f "$CFG" ] || CFG="$HOME/.wrangler/config/default.toml"
  TOKEN=$(sed -nE 's/^oauth_token *= *"(.*)"/\1/p' "$CFG" 2>/dev/null)
fi
[ -n "$TOKEN" ] || { echo "no Cloudflare credential (CLOUDFLARE_API_TOKEN in .env.local or wrangler login)"; exit 1; }
printf 'Authorization: Bearer %s\n' "$TOKEN" > "$HDR"; unset TOKEN
api() { curl -sS -H @"$HDR" -H 'Content-Type: application/json' "$@"; }

ZONE_ID=$(api "https://api.cloudflare.com/client/v4/zones?name=$ZONE_NAME" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.success||!j.result.length){console.error(JSON.stringify(j.errors));process.exit(1)}console.log(j.result[0].id)})')
ROUTES_URL="https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes"
list() { api "$ROUTES_URL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.success){console.error(JSON.stringify(j.errors));process.exit(1)}for(const r of j.result)console.log([r.id,r.pattern,r.script||"(none)"].join("\t"))})'; }

case "${1:-status}" in
  status) list ;;
  off)
    list | awk -F'\t' -v s="$SCRIPT" '$3==s{print $1"\t"$2}' | while IFS=$'\t' read -r id pat; do
      api -X DELETE "$ROUTES_URL/$id" >/dev/null && echo "deleted $pat"
    done
    echo "remaining:"; list ;;
  on)
    existing=$(list)
    for p in "${PATTERNS[@]}"; do
      if printf '%s\n' "$existing" | awk -F'\t' -v p="$p" '$2==p{f=1}END{exit !f}'; then echo "exists $p"; continue; fi
      api -X POST "$ROUTES_URL" --data "{\"pattern\":\"$p\",\"script\":\"$SCRIPT\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.success?"created":"FAILED "+JSON.stringify(j.errors))})'
    done
    list ;;
  *) echo "usage: $0 status|on|off"; exit 2 ;;
esac

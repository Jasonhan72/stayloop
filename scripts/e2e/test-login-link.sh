#!/usr/bin/env bash
# Print a one-time sign-in link for one of the test accounts (2026-11-25).
#
# The test accounts have no usable password: the shared one was voided because
# it had been written in this public repository. This is how a person signs in
# as one of them by hand. Run it in your own terminal and open the link within
# ten minutes; it works once.
#
#   bash scripts/e2e/test-login-link.sh tenant
#   bash scripts/e2e/test-login-link.sh landlord /dashboard
#
# Only the five test accounts. Anything else is refused, so this cannot mint a
# link for a real user or for admin@stayloop.ai. The service role key is read
# from .env.local and reaches curl through a 0600 header file only.
set -u
case "${1:-}" in
  tenant|landlord|agent|provider|admin) EMAIL="$1-test@stayloop.ai" ;;
  *) echo "usage: bash scripts/e2e/test-login-link.sh tenant|landlord|agent|provider|admin [/path]"; exit 2 ;;
esac
LAND="${2:-/settings}"
case "$LAND" in
  //*|*[[:space:]]*) echo "the path must be a plain site path such as /dashboard"; exit 2 ;;
  /*) ;;
  *) echo "the path must start with /"; exit 2 ;;
esac
SITE="https://www.stayloop.ai"
BASE="${SUPABASE_URL:-https://auth.stayloop.ai}"
SERVICE="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
if [ -z "$SERVICE" ]; then echo "run from the repo root: .env.local must hold the service role key"; exit 1; fi
HDR=$(mktemp); chmod 600 "$HDR"
trap 'rm -f "$HDR"' EXIT
printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SERVICE" "$SERVICE" > "$HDR"
unset SERVICE
# redirect_to has to travel in the query string; in the body it is ignored.
TO=$(python3 -c "import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=''))" "$SITE$LAND")
LINK=$(curl -s -X POST "$BASE/auth/v1/admin/generate_link?redirect_to=$TO" -H @"$HDR" -H 'Content-Type: application/json' \
  -d "{\"type\":\"magiclink\",\"email\":\"$EMAIL\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('action_link') or (d.get('properties') or {}).get('action_link') or '')")
if [ -z "$LINK" ]; then echo "no link came back for $EMAIL"; exit 1; fi
echo "$EMAIL — valid about ten minutes, works once:"
echo "$LINK"

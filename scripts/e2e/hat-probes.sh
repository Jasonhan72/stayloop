#!/usr/bin/env bash
# Cross-hat access probes against production with the four test accounts
# (节点 2 · 清楚, 2026-09-26). Every request carries a real user JWT; the
# assertions are "a hat you do not hold sees nothing", not "the page hides a
# menu".
#
# Sign-in is a one-time link minted with the service role (2026-11-25). The test
# accounts have no usable password, so there is none to pass in and none to
# leak. The service role key is read from .env.local inside this script and
# reaches curl only through a 0600 header file: never argv, never the output.
#
#   bash scripts/e2e/hat-probes.sh
set -u
BASE="${SUPABASE_URL:-https://auth.stayloop.ai}"
envval() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
ANON="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$(envval NEXT_PUBLIC_SUPABASE_ANON_KEY)}"
SERVICE="$(envval SUPABASE_SERVICE_ROLE_KEY)"
if [ -z "$ANON" ] || [ -z "$SERVICE" ]; then echo "run from the repo root: .env.local must hold the anon and the service role key"; exit 1; fi
OUT=$(mktemp); HDR=$(mktemp); chmod 600 "$HDR"
printf 'apikey: %s\nAuthorization: Bearer %s\n' "$SERVICE" "$SERVICE" > "$HDR"
unset SERVICE
T=''; L=''; A=''; P=''
finish() {
  # One session per account was opened for this run; close exactly those
  # (scope=local), not every session the account has.
  for t in "$T" "$L" "$A" "$P"; do
    [ -n "$t" ] && curl -s -o /dev/null -X POST "$BASE/auth/v1/logout?scope=local" -H "apikey: $ANON" -H "Authorization: Bearer $t"
  done
  rm -f "$HDR" "$OUT"
}
trap finish EXIT
pass=0; fail=0

jwt() {
  local hashed
  hashed=$(curl -s -X POST "$BASE/auth/v1/admin/generate_link" -H @"$HDR" -H 'Content-Type: application/json' \
    -d "{\"type\":\"magiclink\",\"email\":\"$1\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hashed_token') or (d.get('properties') or {}).get('hashed_token') or '')")
  [ -n "$hashed" ] || return 0
  printf '{"type":"magiclink","token_hash":"%s"}' "$hashed" \
    | curl -s -X POST "$BASE/auth/v1/verify" -H "apikey: $ANON" -H 'Content-Type: application/json' --data @- \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
}
rest() { curl -s -o "$OUT" -w '%{http_code}' -H "apikey: $ANON" -H "Authorization: Bearer $1" "$BASE/rest/v1/$2"; }
rpc()  { curl -s -o "$OUT" -w '%{http_code}' -X POST -H "apikey: $ANON" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' "$BASE/rest/v1/rpc/$2" -d '{}'; }
rows() { python3 -c "import json; d=json.load(open('$OUT')); print(len(d) if isinstance(d,list) else 'x')"; }
lists_total() { python3 -c "import json; d=json.load(open('$OUT')); print(sum(len(v) for v in d.values() if isinstance(v,list)) if isinstance(d,dict) else 'x')"; }
denied() { grep -c 'permission denied' "$OUT"; }
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then pass=$((pass+1)); echo "  ok   $name"
  else fail=$((fail+1)); echo "  FAIL $name  (got: $got, want: $want)"; head -c 200 "$OUT"; echo; fi
}

T=$(jwt tenant-test@stayloop.ai); L=$(jwt landlord-test@stayloop.ai); A=$(jwt agent-test@stayloop.ai); P=$(jwt provider-test@stayloop.ai)
if [ -z "$T" ] || [ -z "$L" ] || [ -z "$A" ] || [ -z "$P" ]; then echo "sign-in failed for one of the test accounts"; exit 1; fi

echo "tenant-test:"
rest "$T" 'landlords?select=id' >/dev/null;                 check 'holds no landlord row' "$(rows)" 0
rest "$T" 'work_orders?select=token&limit=1' >/dev/null;    check 'work_orders.token is not readable' "$(denied)" 1
rpc  "$T" lifecycle_facts_landlord >/dev/null;              check 'landlord facts are empty' "$(lists_total)" 0
echo "agent-test:"
rest "$A" 'landlords?select=id' >/dev/null;                 check 'holds no landlord row' "$(rows)" 0
rest "$A" 'lease_documents?select=id&limit=5' >/dev/null;   check 'reads no leases' "$(rows)" 0
rpc  "$A" lifecycle_facts_landlord >/dev/null;              check 'landlord facts are empty' "$(lists_total)" 0
echo "provider-test:"
rest "$P" 'households?select=id&limit=5' >/dev/null;        check 'reads no households directly' "$(rows)" 0
rest "$P" 'maintenance_tickets?select=id&limit=5' >/dev/null; check 'reads no tickets directly' "$(rows)" 0
rest "$P" 'applications?select=id&limit=5' >/dev/null;      check 'reads no applications' "$(rows)" 0
echo "landlord-test:"
rest "$L" 'work_orders?select=token&limit=1' >/dev/null;    check 'work_orders.token is not readable either' "$(denied)" 1
echo
echo "SUMMARY: $pass passed, $fail failed"
[ "$fail" -eq 0 ]

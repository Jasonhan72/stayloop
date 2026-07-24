#!/usr/bin/env bash
# Stayloop post-deploy smoke — read-only probes against prod (or any base URL).
#
#   bash scripts/smoke.sh                      # probes https://www.stayloop.ai
#   bash scripts/smoke.sh https://preview.url  # probes a preview deploy
#
# All probes are READ-ONLY: GETs on public pages plus at most TWO anonymous
# /api/agent/turn calls (the anon lane is limited to 8/hour per IP — do not
# add more turn probes, and re-runs within the hour may see 429 → SKIP).
set -u

BASE="${1:-https://www.stayloop.ai}"
PASS=0; FAIL=0; SKIP=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()   { PASS=$((PASS+1)); echo "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1${2:+ — $2}"; }
skip() { SKIP=$((SKIP+1)); echo "SKIP  $1${2:+ — $2}"; }

# ── Page probes: 200 + expected content ─────────────────────────────────────
probe_page() { # name path [needle (grep -Ei)]
  local name="$1" path="$2" needle="${3:-}" code
  code=$(curl -sS -o "$TMP/page" -w '%{http_code}' --max-time 30 "$BASE$path" 2>"$TMP/err") || { bad "$name" "curl: $(cat "$TMP/err")"; return; }
  [ "$code" = "200" ] || { bad "$name" "http $code"; return; }
  if [ -n "$needle" ] && ! grep -qiE "$needle" "$TMP/page"; then
    bad "$name" "200 but expected content missing (/$needle/)"; return
  fi
  ok "$name"
}

echo "── Stayloop smoke → $BASE ──"

probe_page "home 200 + brand string"        "/?v=$(date +%s)" "stayloop"

# Security headers (middleware-set) must be present on document responses.
probe_headers() {
  local hdrs
  hdrs=$(curl -sSI --max-time 30 "$BASE/?h=$(date +%s)" 2>"$TMP/err") || { bad "security headers" "curl: $(cat "$TMP/err")"; return; }
  if echo "$hdrs" | grep -qi '^strict-transport-security:' && echo "$hdrs" | grep -qi '^x-frame-options:'; then
    ok "security headers (HSTS + XFO)"
  else
    bad "security headers (HSTS + XFO)" "missing from response"
  fi
}
probe_headers
probe_page "pricing 200"                    "/pricing"        "stayloop"
probe_page "listings browse 200"            "/listings"       "stayloop"
probe_page "tenant role page 200"           "/tenant"         "stayloop"
probe_page "screening page 200"             "/screening"      "stayloop"
# Invalid/expired public passport share must render the friendly dead-link
# page (never a 500, never someone's data).
probe_page "public share invalid-token page" \
  "/p/smoke-invalid-token-000000000000000000" \
  "已失效|no longer active"

# ── Anonymous agent-turn probes (max 2 — anon limit is 8/h per IP) ──────────
turn_probe() { # name payload_file assert_py
  local name="$1" payload="$2" assert="$3" code
  code=$(curl -sS -o "$TMP/turn" -w '%{http_code}' --max-time 120 \
    -H 'Content-Type: application/json' \
    -X POST --data @"$payload" "$BASE/api/agent/turn" 2>"$TMP/err") || { bad "$name" "curl: $(cat "$TMP/err")"; return; }
  if [ "$code" = "429" ]; then skip "$name" "anon rate limit (8/h) — rerun later"; return; fi
  [ "$code" = "200" ] || { bad "$name" "http $code: $(head -c 160 "$TMP/turn")"; return; }
  if out=$(python3 -c "$assert" "$TMP/turn" 2>&1); then
    ok "$name${out:+ ($out)}"
  else
    bad "$name" "$(echo "$out" | tail -1 | head -c 200)"
  fi
}

WORKFLOW='{"workflow_type":"","workflow_id":null,"current_stage":"","completed_steps":[],"status":"active"}'

cat > "$TMP/p1.json" <<EOF
{"role":"tenant","agentName":"Luna","message":"安省租房押金一般交多少？第一个月还要交什么？","memories":[],"workflow":$WORKFLOW,"history":[],"lang":"zh"}
EOF
# Full-workflow anon turn: reply exists; ZERO persistence (no memory_writes,
# no proposed_action); model_used present = model-config resolution (incl.
# whitelist/dirty-value fallback) produced a servable model.
ASSERT_ANON='
import json, sys
d = json.loads(open(sys.argv[1]).read())
assert "error" not in d, "turn error: %s" % d.get("error")
assert isinstance(d.get("reply"), str) and d["reply"].strip(), "reply missing/empty"
assert not d.get("memory_writes"), "anon turn must not write memory: %r" % d.get("memory_writes")
assert d.get("proposed_action") is None, "anon turn must not propose actions"
assert isinstance(d.get("model_used"), str) and d["model_used"], "model_used missing — model config fallback broken"
print("model_used=%s" % d["model_used"])
'
turn_probe "anon turn: reply + zero persistence + model fallback" "$TMP/p1.json" "$ASSERT_ANON"

cat > "$TMP/p2.json" <<EOF
{"role":"tenant","agentName":"Luna","message":"房东说明年要给我涨租到 \$3200，我住在 Liberty Village 两居室，该怎么应对？","memories":[],"workflow":$WORKFLOW,"history":[],"lang":"zh"}
EOF
# Renewal lane: negotiation turns must NEVER return listing cards, but should
# carry the market-evidence card.
ASSERT_RENEWAL='
import json, sys
d = json.loads(open(sys.argv[1]).read())
assert "error" not in d, "turn error: %s" % d.get("error")
assert isinstance(d.get("reply"), str) and d["reply"].strip(), "reply missing/empty"
assert not d.get("listings"), "renewal turn returned listing cards: %d" % len(d.get("listings") or [])
assert d.get("market"), "renewal turn missing the market evidence card"
print("market keys=%s" % ",".join(sorted(d["market"].keys()))[:80])
'
turn_probe "anon renewal turn: no listings, market card present" "$TMP/p2.json" "$ASSERT_RENEWAL"

echo "──────────────────────────────────────"
echo "SUMMARY: $PASS passed, $FAIL failed, $SKIP skipped (base: $BASE)"
[ "$FAIL" -eq 0 ] || exit 1

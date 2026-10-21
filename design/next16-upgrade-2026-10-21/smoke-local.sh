#!/usr/bin/env bash
# Local smoke against wrangler dev (no runtime secrets). Read-only GETs.
B="${1:-http://127.0.0.1:8799}"
T=$(mktemp -d)
PASS=0; FAIL=0
res() { if [ "$1" = ok ]; then PASS=$((PASS+1)); echo "PASS  $2"; else FAIL=$((FAIL+1)); echo "FAIL  $2 — $3"; fi; }
page() { # name path needle
  local c t; t=$(date +%s%N)
  c=$(curl -sS -o $T/b -w '%{http_code} %{time_total}' --max-time 60 "$B$2")
  local code=${c%% *} tm=${c##* }
  if [ "$code" != 200 ]; then res bad "$1 $2" "http $code"; return; fi
  if [ -n "$3" ] && ! grep -qiE "$3" $T/b; then res bad "$1 $2" "200 but /$3/ missing"; return; fi
  res ok "$1 $2 (${tm}s, $(wc -c < $T/b | tr -d ' ') B)"
}
redirect() { # name path expected-location [host]
  local h=(); [ -n "${4:-}" ] && h=(-H "Host: $4")
  local out; out=$(curl -sS -o /dev/null -D - "${h[@]}" --max-time 30 "$B$2")
  local code; code=$(echo "$out" | head -1 | awk '{print $2}')
  local loc; loc=$(echo "$out" | grep -i '^location:' | tr -d '\r' | cut -d' ' -f2-)
  if [ "$code" = 308 ] && echo "$loc" | grep -q "$3"; then res ok "$1 $2 → $loc"; else res bad "$1 $2" "got $code $loc"; fi
}
header() { # name path header-regex
  if curl -sSI --max-time 30 "$B$2" | tr -d '\r' | grep -qiE "$3"; then res ok "$1 $2"; else res bad "$1 $2" "missing /$3/"; fi
}
status() { # name path expected-code
  local code; code=$(curl -sS -o $T/b -w '%{http_code}' --max-time 60 "$B$2")
  if [ "$code" = "$3" ]; then res ok "$1 $2 ($code)"; else res bad "$1 $2" "http $code (want $3): $(head -c 120 $T/b)"; fi
}
echo "── pages"
page home / 'stayloop'
page home-zh-title / '租房的事'
for p in /pricing /listings /tenant /landlord /agent /screening /rules /platform /services /about /partners /contact /disputes /login /register /privacy /terms /consumer-rights /my-file /stayloop-api /stayloop-api/docs /agents /onboarding/name /settings /messages /tenant/agent /landlord/agent /dashboard /provider/jobs /landlord/applicants /tenant/applications; do page page "$p" 'stayloop'; done
page token-dead-link /p/smoke-invalid-token-000000000000000000 '已失效|no longer active'
page sitemap /sitemap.xml '<urlset'
page robots /robots.txt 'sitemap'
page manifest /manifest.json 'Stayloop'
status not-found /no-such-page-xyz 404
echo "── static chunk from home"
chunk=$(curl -sS "$B/" | grep -oE '/_next/static/[^"]+\.js' | head -1)
page chunk "$chunk" ''
echo "── open API (no secrets needed)"
page api-rules '/api/v1/rules' '"'
page api-guideline '/api/v1/guideline?effective=2027-03-01' '1\.9'
page api-openapi '/api/v1/openapi.json' 'openapi'
page api-n4 '/api/v1/n4/earliest-termination?served=2026-11-03&rent_period=monthly' '"'
header api-cors-open /api/v1/rules '^access-control-allow-origin: \*'
echo "── middleware"
redirect apex / '://www.stayloop.ai/' stayloop.ai
redirect screening-sub /abc '://www.stayloop.ai/screening' screening.stayloop.ai
redirect settings /landlord/settings '/settings'
redirect messages /tenant/messages '/messages'
redirect applications /landlord/applications/abc '/landlord/applicants/abc'
redirect trust-api /trust-api/docs '/stayloop-api/docs'
redirect home-ask '/?role=tenant&ask=hi' '/tenant/agent'
header hsts / '^strict-transport-security: max-age=31536000'
header xfo / '^x-frame-options: DENY'
header nosniff / '^x-content-type-options: nosniff'
header perm / '^permissions-policy: camera=\(\), microphone=\(self\)'
header refpol-normal / '^referrer-policy: strict-origin-when-cross-origin'
header refpol-token /verify/abc '^referrer-policy: no-referrer'
header cors-pinned / '^access-control-allow-origin: https://www.stayloop.ai'
if curl -sSI "$B/" | grep -qi '^x-powered-by'; then res bad "no x-powered-by" "present"; else res ok "no x-powered-by"; fi
echo "SUMMARY: $PASS passed, $FAIL failed"

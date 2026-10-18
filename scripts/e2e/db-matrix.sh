#!/usr/bin/env bash
# Runs scripts/e2e/db-matrix.sql against production through the Supabase Management API
# (runs as postgres; the SQL itself is one begin … rollback block, so nothing persists).
#   SUPABASE_ACCESS_TOKEN=… bash scripts/e2e/db-matrix.sh            # token from env, or
#   bash scripts/e2e/db-matrix.sh                                     # falls back to .env.local
# Prints every failing assertion plus the two SUMMARY rows; exit 1 when any probe/audit fails.
# Full JSON result is written to ${OUT:-/tmp/db-matrix-result.json}.
set -u
REF="${SUPABASE_PROJECT_REF:-uotcczsfeiptnabamzcd}"
PAT="${SUPABASE_ACCESS_TOKEN:-$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env.local 2>/dev/null | cut -d= -f2-)}"
[ -n "$PAT" ] || { echo "SUPABASE_ACCESS_TOKEN missing (env or .env.local)"; exit 2; }
OUT="${OUT:-/tmp/db-matrix-result.json}"
jq -Rs '{query: .}' scripts/e2e/db-matrix.sql > "${OUT}.req"
code=$(curl -s -o "$OUT" -w '%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $PAT" -H 'Content-Type: application/json' --data-binary @"${OUT}.req")
rm -f "${OUT}.req"
[ "$code" = "201" ] || { echo "HTTP $code"; head -c 600 "$OUT"; echo; exit 2; }
python3 - "$OUT" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1]))
fails = [r for r in rows if r['who'] != 'SUMMARY' and r['pass'] is False]
for r in fails:
    print(f"FAIL #{r['n']:<5} {r['who']:<10} {r['tbl']:<28} {r['action']}\n      expected {r['expected']!r}  actual {r['actual']!r}  {r['detail']}")
for r in rows:
    if r['who'] == 'SUMMARY':
        print(f"{r['tbl']}: {r['action']} · {r['expected']} · {r['actual']}")
sys.exit(1 if fails else 0)
PY

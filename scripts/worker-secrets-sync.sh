#!/usr/bin/env bash
# Copy the server-side secrets onto the Worker "stayloop-web" (Pages → Worker migration, 2026-10-19).
#
#   bash scripts/worker-secrets-sync.sh            # all keys below, from the main checkout's .env.local
#   bash scripts/worker-secrets-sync.sh --cron     # also CRON_SECRET, read from Supabase Vault
#                                                  # (needs the temporary RPC public.tmp_ops_cron_secret)
#
# Key set = the Pages project's production env (names checked 2026-10-19) minus
# NEXT_PUBLIC_* (inlined at build) and two Cloudflare keys the code never reads.
# OPTIONAL keys are synced only when .env.local has them (Flinks: added when the
# production credentials arrive — design/flinks-production-plan-2026-10-19.md).
# Values go through a 0600 temp file straight into `wrangler secret bulk`; only
# key names are ever printed.
set -euo pipefail
# wrangler authenticates with CLOUDFLARE_API_TOKEN from the repo's .env.local,
# which it only loads from the current directory.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
ENV_FILE="${ENV_FILE:-/Users/neos/Documents/Claude/Projects/stayloop/.env.local}"
WORKER=stayloop-web
OPTIONAL="FLINKS_INSTANCE FLINKS_CUSTOMER_ID FLINKS_AUTH_KEY FLINKS_API_SECRET FLINKS_API_BASE FLINKS_BEARER"
KEYS="ANTHROPIC_API_KEY CANLII_API_KEY DASHSCOPE_API_KEY DEEPSEEK_API_KEY GEMINI_API_KEY INBOUND_EMAIL_SECRET JINA_API_KEY MOONSHOT_API_KEY OPENAI_API_KEY RESEND_API_KEY RESEND_FROM STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET SUPABASE_SERVICE_ROLE_KEY VAPID_PRIVATE_KEY VERIFF_API_KEY VERIFF_SECRET_KEY ZHIPU_API_KEY"

umask 077
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

KEYS="$KEYS" OPTIONAL="$OPTIONAL" ENV_FILE="$ENV_FILE" WANT_CRON="${1:-}" OUT="$TMP/secrets.json" HDR="$TMP/hdr" node -e '
const fs = require("fs")
const env = {}
for (const l of fs.readFileSync(process.env.ENV_FILE, "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if (/^(["\x27]).*\1$/.test(v)) v = v.slice(1, -1)
  env[m[1]] = v
}
const out = {}, missing = []
for (const k of process.env.KEYS.split(" ")) env[k] ? (out[k] = env[k]) : missing.push(k)
const optional = process.env.OPTIONAL.split(" ").filter((k) => env[k])
for (const k of optional) out[k] = env[k]
fs.writeFileSync(process.env.OUT, JSON.stringify(out))
// Supabase header file for the optional Vault read.
fs.writeFileSync(process.env.HDR, `apikey: ${env.SUPABASE_SERVICE_ROLE_KEY}\nAuthorization: Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}\n`)
fs.writeFileSync(process.env.OUT + ".url", (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""))
console.log(`from .env.local: ${Object.keys(out).length} keys` + (optional.length ? ` (optional: ${optional.join(", ")})` : "") + (missing.length ? `; MISSING: ${missing.join(", ")}` : ""))
'

if [ "${1:-}" = "--cron" ]; then
  URL=$(cat "$TMP/secrets.json.url")
  curl -sS -X POST -H @"$TMP/hdr" -H 'Content-Type: application/json' -d '{}' "$URL/rest/v1/rpc/tmp_ops_cron_secret" > "$TMP/cron.json"
  OUT="$TMP/secrets.json" CRON="$TMP/cron.json" node -e '
const fs = require("fs")
const v = JSON.parse(fs.readFileSync(process.env.CRON, "utf8"))
if (typeof v !== "string" || v.length < 12) { console.error("CRON_SECRET: Vault read failed"); process.exit(1) }
const o = JSON.parse(fs.readFileSync(process.env.OUT, "utf8")); o.CRON_SECRET = v
fs.writeFileSync(process.env.OUT, JSON.stringify(o)); console.log("CRON_SECRET: read from Vault")
'
fi

wrangler secret bulk "$TMP/secrets.json" --name "$WORKER" 2>&1 | grep -vE '^\s*$|telemetry'
echo "secret names now on $WORKER:"
wrangler secret list --name "$WORKER" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).map(x=>x.name).sort().join(" "))}catch{console.log(s)}})'

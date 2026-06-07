# Stayloop Screening Engine Patches — 2026-06-02 / 2026-06-03

Production hardening patches applied to `main` branch via
`apply-screen-fixes.command`.

## 2026-06-03 — Build hardening (Phase 5)

`lib-supabase.ts` — overwrites `lib/supabase.ts`

Root cause of CF Pages build failures from commits 626835a → 8a19c80:

The previous `lib/supabase.ts` called `createClient(URL!, KEY!)` at module
import time. Next.js 15 pre-renders client-marked pages during the build,
so if the build environment is missing `NEXT_PUBLIC_SUPABASE_URL` (or the
anon key), the prerender of /score, /landlord/leases, etc. throws
"supabaseUrl is required." and the whole build aborts before any page is
emitted.

Local reproduction:
  cd /tmp && git clone --depth=1 -b main https://github.com/Jasonhan72/stayloop.git
  cd stayloop && npm install
  npx tsc --noEmit                 # ✓ passes (0 errors)
  unset NEXT_PUBLIC_SUPABASE_URL
  npx next build --turbopack       # ✗ fails: "supabaseUrl is required."

After the patch (Proxy<SupabaseClient> that defers instantiation until
first property access), the same command succeeds with 66/66 static
pages generated, even without env vars present.

This patch is safe to ship even when env vars ARE set — the Proxy only
materializes the client on first use.



## What's in here

- `classify-files-route.ts` — overwrites `app/api/classify-files/route.ts`
  - Stronger Haiku prompt for `monthly_rent`: explicitly distinguish base rent
    from parking / deposit / last month / utilities. Bumps model to Sonnet
    for higher accuracy on multi-line lease tables.

- `forensics-index.ts` — overwrites `lib/forensics/index.ts`
  - Re-runs `checkSourceSpecific()` after Haiku Vision OCR completes, so
    image-only credit reports / bank statements can be fingerprinted on
    their OCR'd text. Previously: text_sample was empty for scans, so
    `credit_report_no_bureau_markers` always fired even on real Equifax
    scans.

- `screen-score-route.ts` — overwrites `app/api/screen-score/route.ts`
  - Removes the "ANY forge → ALL dims = 0" block. Only the dimension whose
    underlying evidence file was forged gets zeroed; other dimensions keep
    their AI scores. Adds a top-level `fraud_warning` flag the UI can
    surface as a banner.

## How to deploy

Run `apply-screen-fixes.command` from the repo root (double-click in Finder).
It will:
  1. Stash any uncommitted v5 changes
  2. Clone main into a tmp dir
  3. Copy the 3 patched files in
  4. Commit + push to origin/main
  5. Cloudflare Pages auto-deploys (~2 min)
  6. Switch your working tree back to v5

You'll see a "✓ pushed" line when it's done.

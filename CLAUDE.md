# Stayloop — Project Context for Claude

> This file lives in the repo root so every new Cowork session that mounts
> `/Users/neos/stayloop` automatically picks up the full project context.
> **Update this file whenever significant changes are made.**

## Owner
- Jason Han (jasonhan72@gmail.com)
- GitHub: Jasonhan72 (repo is PRIVATE)
- Mac mini path: /Users/neos/stayloop

## Tech Stack
- **Framework**: Next.js 14 (App Router, TypeScript)
- **Hosting**: Cloudflare Pages (project name: `stayloop`)
- **Database**: Supabase (project: upbkcbicjjpznojkpqtg)
- **AI**: Claude API (Sonnet 4.5) — direct HTTP to api.anthropic.com
- **Court Records**: CanLII API — searches ALL Ontario databases (free for all tiers)
- **Payments**: Stripe (test mode)
- **Email**: Resend
- **Domain**: stayloop.ai

## GitHub
- Repo: https://github.com/Jasonhan72/stayloop (private)
- The git remote in the local clone contains a PAT token in the URL for auth
- Default branch: main
- Cloudflare Pages auto-deploys on push to main

## Branch hygiene — READ BEFORE WRITING ANY CODE
- Before modifying any file, run `git fetch origin && git log HEAD..origin/main --oneline | head` and verify local is not behind `origin/main`.
- If local is behind `origin/main` by more than 3 commits, STOP. Sync first (`git update-ref refs/heads/master origin/main` if master isn't pushed, or `git pull --ff-only` if it is) before touching code. Writing on top of a stale baseline causes parallel re-implementations that overwrite working production code.
- All feature work should branch from `origin/main`, not from a local branch that may be stale.
- Cowork sandbox note: the FUSE mount at `/sessions/.../mnt/stayloop` blocks `rm` / `unlink` but allows `mv`. If git complains about a stale `.git/*.lock`, rename the lock file out of the way (`mv .git/index.lock .git/_cowork-trash/index.lock.stale`) instead of trying to delete it. For heavy git work (rebase, reset --hard, stash), clone the repo into `/tmp` via the existing origin URL (PAT is embedded) and push from there.

## Cloudflare Environment Variables (Production)
All env vars are set in Cloudflare Pages > stayloop > Settings > Variables and Secrets:
- ANTHROPIC_API_KEY (Secret, encrypted)
- CANLII_API_KEY = lZ97H9EkN62lfy35Qzgbw7ZCvLQsf7OzuYrcRjnh
- NEXT_PUBLIC_SITE_URL = https://www.stayloop.ai
- NEXT_PUBLIC_STRIPE_PRICE_ID
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_URL = https://upbkcbicjjpznojkpqtg.supabase.co
- RESEND_API_KEY
- RESEND_FROM = Stayloop <notifications@neos.rentals>
- STRIPE_SECRET_KEY (test)
- STRIPE_WEBHOOK_SECRET
- SUPABASE_SERVICE_ROLE_KEY

## Key API Routes
| Route | Purpose |
|-------|---------|
| /api/classify-files | Lightweight file classification (edge runtime) |
| /api/screen-score | Full screening: AI scoring + CanLII court search + forensics |
| /api/deep-check | Arm's-length employment verification (PRO only) — OpenCorporates company registry lookup + director cross-reference |
| /api/ai-score | Legacy 6-dim AI scoring with Vision OCR |
| /api/ltb-search | Standalone CanLII LTB lookup |
| /api/file-url | Signed URL for tenant-uploaded files |
| /api/stripe/checkout | Create Stripe Checkout Session for Pro upgrade |
| /api/stripe/webhook | Stripe webhook handler (checkout.session.completed) |
| /api/stripe/portal | Stripe billing portal for subscription management |

## Important Technical Notes
- `anthropic-version` header MUST be `2023-06-01` (the only valid values are 2023-06-01 and 2023-01-01)
- CanLII integration queries ALL Ontario databases in parallel (not just LTB) — this is FREE for all users
- The screen-score route does: classify files → extract name → CanLII court search + Ontario Courts Portal → forensics → AI scoring → return results
- Multi-name court search: if multiple names are extracted from uploaded IDs, each name gets its own court search with a name separator in the results
- Court record sources: CanLII (free, all Ontario DBs), Ontario Courts Portal (free, Civil & Small Claims), Equifax (pro, coming soon), Stayloop Verified Network (pro, coming soon)

## Scoring Model (v3)
- **5 dimensions**: ability_to_pay (40%), credit_health (25%), rental_history (20%), verification (10%), communication (5%)
- **Hard gates** cap the overall score: income_severe (65), ltb_eviction (40), doc_tampering (55), identity_mismatch (50), employer_fraud (45), self_issued_employment (50), court_record_defendant (35), court_record_defendant_multi (25), court_record_active (20), pdf_is_screenshot (30), paystub_math_impossible (35), cross_doc_collision (40), producer_consumer_tool (50)
- **Red flags**: rush_move_in (-4), cross_doc_contradictions (-8), hr_phone_is_applicant (-10), self_issued_employment_letter (-15), no_linkedin_for_professional_role (-3), volunteered_sin (-2)
- **Forensics pipeline** (lib/forensics/): PDF metadata, text density, paystub math, source-specific markers, cross-doc entity extraction, arm's-length company verification
- **Self-issued employment detection**: AI checks if employment letter signatory matches applicant name/family, numbered company, sole proprietorship
- **Arm's-length deep check** (PRO only): OpenCorporates API company registry lookup, director/officer cross-reference, incorporation date check, address overlap

## Deep Check (Arm's-Length Verification)
- **API**: POST /api/deep-check with { screening_id }
- **Module**: lib/forensics/arm-length.ts
- **Data source**: OpenCorporates free API (no key needed, 500 req/mo)
- **Checks**: company registry lookup (Canadian jurisdictions), director/officer name cross-reference with applicant, numbered company detection, recent incorporation (<2yr), address overlap
- **Access**: PRO only — free users clicking the button are redirected to Stripe checkout
- **Results**: persisted to screenings.deep_check_result and forensics_detail.arm_length

## CanLII API Reference
- **Docs**: https://github.com/canlii/API_documentation/blob/master/EN.md
- **Base URL**: `https://api.canlii.org/v1/`
- **Key endpoints**:
  1. **List all databases**: `GET /caseBrowse/{lang}/?api_key={key}` — returns `{ caseDatabases: [...] }`, filter by `jurisdiction === 'on'` for Ontario
  2. **Search cases (full-text)**: `GET /caseBrowse/{lang}/{databaseId}/?api_key={key}&resultCount=10&offset=0&fullText={query}` — optional filters: `publishedBefore`, `publishedAfter`, `decisionDateBefore`, `decisionDateAfter`, `modifiedBefore`, `modifiedAfter`. Returns `{ cases: [{ databaseId, caseId: { en: string }, title, citation }] }`
  3. **Case metadata**: `GET /caseBrowse/{lang}/{databaseId}/{caseId}?api_key={key}` — returns `{ databaseId, caseId, url, title, citation, language, docketNumber, decisionDate, keywords, topics }`. The `url` field is a short link like `https://canlii.ca/t/kk01c` — **always use this for case links** instead of constructing URLs manually
  4. **Case citator**: `GET /caseCitator/{lang}/{databaseId}/{caseId}/{type}?api_key={key}` — types: `citedCases`, `citingCases`, `citedLegislations`, `citingLegislations`
  5. **Legislation browse**: `GET /legislationBrowse/{lang}/?api_key={key}` and `GET /legislationBrowse/{lang}/{databaseId}/{legislationId}?api_key={key}`
- **caseId format**: e.g. `2026onltb23231` = year (2026) + db code (onltb) + number (23231)
- **Max resultCount**: 10,000 per request
- **Rate limits**: not documented, but keep parallel requests reasonable

## Product: Tiers
- **Free (Starter)**: 5 screenings/month, full CanLII coverage, document forensics, bilingual reports
- **Pro ($29/mo)**: Unlimited screenings, Ontario Courts Portal, priority AI, bulk export

## Recent Changes (2026-04-23)
- **Deep-check redesign (4 phases, all live)**:
  - **Phase 1** — stateless API: `/api/deep-check` no longer needs `screening_id`, takes `{employer_names, applicant_name, applicant_phone?, applicant_email?, applicant_address?, signatory_name?, hr_phone_collision?}`; frontend builds the payload from local forensics state and persists `deep_check_result` back via its own RLS'd supabase client. Legacy `{screening_id}` fallback preserved. Eliminates schema-drift class of failures (e.g. the old `ai_result` column bug).
  - **Phase 2** — signals: common-surname whitelist (150 surnames EN/ZH/KR/VN/SA/ME) so e.g. "Chen/Li/Han" don't trigger `arm_length_family_business` without corroborating signals; `canonicalizeEmployerName()` strips legal suffixes (Inc/Ltd/Corp/Corporation/Incorporée/GmbH/…) for dedup; new `arm_length_hr_phone_collision` flag when applicant's personal phone == HR contact on employment letter.
  - **Phase 3** — cost & latency: new `employer_lookup_cache` table (primary key `normalized_name`, 7d TTL, service-role RLS) with fire-and-forget upserts in the route layer; `searchOpenCorporates` parallelizes the 9 Canadian jurisdictions (was serial, 72s worst case → now ~6s budget total). Fan-out capped at 3 distinct employers per check.
  - **Phase 4** — UX: manual employer input fallback when auto-extraction fails (instead of dead-end alert); staged progress text (查询注册 → 核对董事 → 交叉比对); cleaner error messages from the API with `error_zh` bilingual field.
  - Key files: `lib/forensics/arm-length.ts`, `lib/forensics/index.ts#runDeepCheck`, `app/api/deep-check/route.ts`, `app/screen/page.tsx#runDeepCheck`
- **Enhanced PDF Forensics (3-layer)**: Layer 1 `lib/forensics/pdf-structure.ts` (DPI estimate, font count, mod/creation gap), Layer 2 `lib/forensics/image-ocr.ts` (Haiku OCR for image-only PDFs, triggered when text density < 50 chars/page), Layer 3 Sonnet prompt injection via `forensicsToPromptBlock`. Only adds flags, no hard gates.
- **Ontario Courts Portal — exact name matching**: search type changed from 300054 (fuzzy, 612 results) to 10462 (exact, 1-2 results); strict first+last name party matching with swapped-name support (nameSwapped flag for UI verification badge)
- **Portal case links**: direct links to case detail page via caseInstanceUUID, fallback to search-by-case-number URL
- **PDF forensics — 4-tier producer classification**: editing tools (Photoshop/GIMP/Canva → critical), doc creation (Word/Pages → high for bank/pay, ignored for letters), scan/print (iOS Notes/Print to PDF → NOT flagged), image converters (Image2PDF → high)
- **Image PDF scan detection**: image-only PDFs from legitimate scan tools (Quartz PDFContext, Microsoft Print to PDF, CamScanner) no longer flagged as suspicious
- **Equifax markers expanded**: added 4 new markers for Chrome-printed consumer reports; text_sample increased 500→2000 chars; severity lowered high→medium
- **Forensics zeroing scoped**: only zeros the specific dimension tied to the forged file (not ALL dimensions)
- **Deep check screening_id**: fixed "Screening not found" by passing screening_id through loadPastScreening
- **credit_report_no_equifax_markers** removed from FORGERY_INDICATING_CODES (not conclusive)
- **CanLII word-boundary matching**: prevents short names like "bo" matching inside "board"

## Pending / Future Deep-Check Enhancements
- **Server-side PRO plan gate** on `/api/deep-check` (currently client-gated only — anyone could hit the API if they guess the payload shape)
- **Canada Business Number (BN) verification**: many employment letters print a BN (9 digits + RT0001). CRA GST/HST registry can verify. Need to find a free lookup endpoint or pay for one
- **Per-flag dismiss with risk recalculation**: UI control to mark a flag as false-positive (e.g., common surname collision), re-compute `arm_length_risk` with that flag excluded. Today the flag display is final
- **Signatory name extraction from employment letters**: Haiku extraction currently only pulls employer name — adding signatory + signatory phone would unlock more precise officer cross-reference
- **OpenCorporates bulk import**: if quota becomes an issue, bulk import Ontario's Open Data (registered companies since 2016) into Supabase as a fallback source

## Recent Changes (2026-04-18)
- **Arm's-length deep check** (NEW): OpenCorporates company registry lookup + director cross-reference, gated behind PRO subscription
- **Self-issued employment letter detection**: AI prompt + hard gate (caps at 50) + red flag (-15) for self-issued employment letters
- **Court records — name separator**: when multiple names are searched, first group now also shows name label
- **Screen page alignment**: file type badges use CSS grid, consistent file list sizing, improved drop zone and history card layout
- **Aggressive court record scoring**: 1 defendant record caps overall at 35, 2+ at 25, active case at 20; rental_history and credit_health also capped
- **Forensics zeroing**: only zeros the specific dimension tied to the forged file type (changed from zeroing ALL)
- **PDF report download**: button in results section to generate downloadable screening report

## Recent Changes (2026-04-10)
- Fixed anthropic-version from 2024-10-22 → 2023-06-01 across all 3 API routes
- Added CANLII_API_KEY to Cloudflare production env (was missing, causing CanLII queries to fail)
- Authenticity card: each sub-row now shows a unique description instead of generic "从文件中直接测得"
- Court record display: CanLII (tier=free) no longer shows "需 Pro 版" when unavailable
- Fixed CanLII case URLs: now fetches real short URLs from metadata API instead of constructing manually (was causing 404s)

## UI Language
- App supports bilingual EN/ZH toggle
- Jason prefers Chinese for communication

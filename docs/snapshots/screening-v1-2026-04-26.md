# Screening Module Snapshot — v1.0 Classic (2026-04-26)

> **Frozen reference**. This document captures the state of the screening
> module the moment before Sprint 1 of the AI-Native L0-L3 rewrite begins.
> Use this when you need to compare "what we have now" vs "what we're
> rebuilding into".

## Restore points

| Mechanism | Identifier | Use when |
|---|---|---|
| Git tag | `v1.0-classic-2026-04-26` | Roll back code to this exact state: `git checkout v1.0-classic-2026-04-26` |
| Git branch | `archive/v1-classic-screening` | Long-lived reference branch — never gets deleted |
| HEAD commit | `c7d2ef4` (post-review-2 fixes) | Direct SHA reference |
| Supabase migrations | through `20260424020656` | All 17 migrations applied as of this snapshot — listed below |

## What "the screening module" is at v1.0

The user-facing flow:

```
Landlord uploads applicant docs → /api/classify-files → /api/screen-score
       │                                                         │
       │                                                         ▼
       └────────────────────────► forensics + court records + AI scoring
                                                                 │
                                                                 ▼
                                              Result rendered in /screen page
                                              Optional: PRO landlord clicks
                                              "Deep Check" → /api/deep-check
                                              for arm's-length verification
```

## Code surface

### API routes
| Route | Purpose | Lines |
|---|---|---|
| `/api/classify-files/route.ts` | Lightweight file-type detection (Haiku) | ~210 |
| `/api/screen-score/route.ts` | Main scoring pipeline — orchestrates classify → forensics → court → AI score | ~1700 |
| `/api/deep-check/route.ts` | Arm's-length employer verification (PRO) — registry lookup + BN cross-check | ~430 |
| `/api/file-url/route.ts` | Signed URL for tenant-uploaded files | ~50 |
| `/api/ai-score/route.ts` | Legacy 6-dim scoring (kept for backwards compat) | ~250 |
| `/api/ltb-search/route.ts` | Standalone CanLII LTB lookup | ~120 |

### Forensics library (`lib/forensics/`)
| File | Purpose |
|---|---|
| `index.ts` | Orchestrator — `runForensics()`, `runDeepCheck()`, `forensicsToPromptBlock()` |
| `types.ts` | Shared types: ForensicFlag, ForensicsReport, OcrResult, etc. |
| `pdf-metadata.ts` | PDF Producer/Creator/Title/dates → 4-tier producer classification |
| `pdf-text.ts` | Text extraction + density detection (image-PDF heuristic) |
| `image-ocr.ts` | Haiku Vision OCR for image-only PDFs and image files |
| `paystub-math.ts` | Haiku field extraction + 3 internal-consistency checks (YTD ratio, hourly×hours, period_net×count) + `normalizeExtraction` defense |
| `source-specific.ts` | Equifax markers (credit_report) + bank Producer whitelist |
| `cross-doc.ts` | Cross-document entity extraction + collision detection (HR phone == applicant phone) |
| `arm-length.ts` | Common-surname whitelist, employer canonicalization, OpenCorporates fallback path |
| `bn-check.ts` | BN extraction from text + `lookup_corp_by_bn` RPC call + name-match heuristic |
| `id-validation.ts` | SIN Luhn / Ontario DL surname / OHIP format checks; ID_KINDS = 18 variants |

### Anthropic infrastructure
| File | Purpose |
|---|---|
| `lib/anthropic/page-budget.ts` | 100-PDF-page hard limit guard — per-kind budget + proportional scaling + low-priority drop + first/last truncation |

### Frontend
| File | Purpose |
|---|---|
| `app/screen/page.tsx` | ~3000-line single-page landlord screening UI (refactor target for AI-Native rewrite) |
| `app/dashboard/*` | Multi-applicant dashboard + history |

### Scripts + workflows
| File | Purpose |
|---|---|
| `scripts/ingest-ca-corp-registry.mjs` | Monthly Corporations Canada open-data ingestion |
| `.github/workflows/refresh-ca-corp-registry.yml` | Cron + manual dispatch trigger |

## Database state (Supabase project `upbkcbicjjpznojkpqtg`)

### Tables
| Table | Cols | Purpose |
|---|---|---|
| `landlords` | 14 | User profiles + Stripe customer_id + plan |
| `screenings` | 46 | Single screening record (files + AI result + forensics + court records + deep_check) |
| `listings` | 13 | Property listings (forward-looking, lightly used) |
| `applications` | 53 | Renter application data (forward-looking) |
| `anon_screening_log` | 4 | Anonymous trial use tracking |
| `ca_corp_registry` | 22 | 184,901 Canadian federal corporations from open data |
| `employer_lookup_cache` | 4 | OpenCorporates fallback cache (7-day TTL) |

### Migrations (17 total, in apply order)
```
20260407050439_*  RLS + listings + claims + six-dim scores + Stripe
20260407144504_*
...
20260408032332_*  screenings table + court records detail + anonymous claim
20260408195702_*
...
20260409025022_*  risk model v3 + role column
20260410061957_*
...
20260414034914_*  landlord auth policy + forensics columns
20260415044018_*
...
20260419003041_*  deep-check columns + employer cache
20260424020656_*  ca_corp_registry v1 + v2 (search_corp_registry + lookup_corp_by_bn RPCs)
```

Get the exact list any time via the Supabase MCP `list_migrations` tool.

## Capabilities at this snapshot

✅ **Document forensics** — PDF metadata 4-tier producer classification, image-only detection, paystub math (3 checks), Equifax marker detection, bank Producer whitelist, cross-document entity collision

✅ **Image-only PDF OCR** — Haiku Vision recovers text from photo-of-ID / scanned PR card / camera bank statement

✅ **ID number format validation** — SIN Luhn checksum (→ identity_mismatch hard gate), Ontario DL surname-letter, OHIP 4-3-3, Canadian passport pattern

✅ **Court records** — CanLII (all Ontario databases) free + Ontario Courts Portal (Civil & Small Claims) free with 3-tier search (exact / swap / fuzzy + surname-position filter)

✅ **AI scoring v3** — 5-dim weighted (ability_to_pay 40% / credit_health 25% / rental_history 20% / verification 10% / communication 5%), 14 hard gates, 8 red flags, deterministic backend enforcement of court / affordability / forensics gates

✅ **Arm's-length deep check** (PRO) — Local CA federal registry primary, OpenCorporates fallback (only when token set), arm-length signals (applicant_is_officer, family_business with common-surname whitelist, recent incorporation, address overlap, HR phone collision)

✅ **BN employer cross-check** — Extract BN from employment docs, verify against `lookup_corp_by_bn` RPC, fire `bn_employer_mismatch` critical if BN registered to different company than claimed

✅ **100-PDF-page budget** — Pre-fetch + count + per-kind allocation + truncation + base64 fallback

✅ **Bilingual UI** — EN/ZH toggle throughout, all flags emit both `evidence_en` + `evidence_zh`

✅ **Stripe billing** — Free 5/mo + Pro $29/mo subscription + portal + webhook (server-side PRO gate enforced on /api/deep-check)

## Known limitations at v1.0

- `app/screen/page.tsx` is 3000 lines (UI + state + business logic + API calls all inline) — primary refactor target for AI-Native rewrite
- All client-driven flows; no chat / agentic interaction yet
- No memory layer (each screening is stateless)
- Trust API not exposed publicly (deferred per ADR-005)
- Tenant side / Verified Renter Passport not built (Phase 2+)
- Listing import / Nova agent not built (Phase 2+)
- Mediator agent + LTB rulings dataset not built (Phase 3+)

## How to roll back to this state

If Sprint 1 breaks production:

```bash
# Read-only checkout to inspect the snapshot
git fetch origin
git checkout v1.0-classic-2026-04-26

# Or hard-reset main back to this state (DESTRUCTIVE — only when sure)
git checkout main
git reset --hard v1.0-classic-2026-04-26
git push --force-with-lease origin main
```

For Supabase: this snapshot adds tables but doesn't drop any. Sprint 1 will
ADD `conversations`, `messages`, `tool_executions`, `pending_actions`,
`user_facts`. Existing tables are not modified. Supabase has point-in-time
recovery available on Pro plans for data-level rollback.

## Start of next phase

Sprint 1 begins from `c7d2ef4`. Goal: AI-Native L1 capability layer + L2
Logic agent + L3 `/chat` UI. See:

- [Architecture](../architecture.md)
- [Logic agent spec](../agents/logic.md)
- [Screening flow (target)](../flows/screening.md)
- [ADR-002: custom agent loop](../adr/002-custom-agent-loop.md)

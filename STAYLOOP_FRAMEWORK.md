# Stayloop — System Framework

> Engineering reference for the Stayloop AI-native rental ecosystem.
> Last updated: 2026-05-02 · V4 design system live.

Stayloop is a Toronto-based residential rental platform that automates tenant
screening, rental passports, applications, listings, lease drafting, and
e-signing as a single AI-native workflow. The product is split into three
role-scoped portals (Tenant, Landlord, Agent) plus a public marketing site
and a B2B Trust API.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript, RSC) |
| Hosting | Cloudflare Pages — auto-deploys on push to `main` |
| Domain | `stayloop.ai` (production) · `*.pages.dev` (preview) |
| Database | Supabase (Postgres + RLS) — project `upbkcbicjjpznojkpqtg` |
| Auth | Supabase Auth (magic link + OAuth + anonymous trial) |
| AI · scoring | Claude Sonnet 4.5 (HTTP `api.anthropic.com`, header `anthropic-version: 2023-06-01`) |
| AI · vision OCR | Claude Haiku 4.5 (image PDFs, scanned IDs) |
| Payments | Stripe (test mode) — checkout, billing portal, webhooks |
| Email | Resend (`notifications@neos.rentals`) |
| Court records | CanLII API (free, all Ontario databases) + Ontario Courts Portal scraper |
| Corporate registry | Federal `ca_corp_registry` (Supabase, refreshed monthly from Corporations Canada open data) + OpenCorporates fallback |

---

## 2. Repository layout

```
stayloop/
  app/                       Next.js App Router routes — see §4
    api/                       Server routes (edge runtime where dynamic)
    (route folders)            One folder per page route
  components/
    AppHeader.tsx              Legacy top-only header (deprecated, replaced by v4/PageShell)
    AuthModal.tsx              Sign-in / sign-up modal (used by MarketingNav)
    marketing/                 Public-site chrome
      MarketingNav.tsx           V4 PubNav: Product / Pricing / For Tenants /
                                 For Landlords / For Agents / Docs
      MarketingFooter.tsx
      AudienceLanding.tsx        Generic role landing template (uses MarketingNav)
      UserAvatar.tsx             Avatar + dropdown menu (used in MarketingNav + AppBar)
    v4/                        V4 prototype primitives
      PageShell.tsx              Sidebar + AppBar wrapper for authed pages
      Sidebar.tsx                220px role-scoped nav + AI Copilot card
      AppBar.tsx                 56px top bar: role badge + breadcrumb +
                                 ⌘K + bell + language + avatar
      AICopilotCard.tsx          Live count of pending_actions
      SecHead.tsx                Eyebrow + title + sub + right slot + emerald rule
      Tabs.tsx                   Sub-section navigator with tone-mapped count badges
      AuditRow.tsx               4-col grid row (when · actor · action+target · ip)
      Avatar.tsx                 Circular initials badge with role-derived color
    v3/                        V3-era components (legacy, gradually superseded by v4)
  lib/
    brand.ts                   v3 design tokens (cream + emerald palette)
    i18n.tsx                   useT() hook + LanguageToggle (zh/en)
    supabase.ts                Browser client (anon key)
    supabase-server.ts         Service-role client for server routes
    useUser.ts                 Cached useUser() hook with redirect-if-missing
    agent/                     AI agent runtime
      agents/                    logic.ts, nova.ts, echo.ts, …
      tools/                     Tool implementations registered with agents
      registry.ts                Agent registry + tool registry
      types.ts                   AssistantBlock, PendingAction, ConversationContext
      runtime.ts                 The ~200-line custom agent loop (per ADR-002)
    forensics/                 Document-screening pipeline (see §8)
      pdf-metadata.ts, pdf-text.ts, image-ocr.ts, paystub-math.ts,
      id-validation.ts, arm-length.ts, equifax-markers.ts, cross-doc.ts,
      page-budget.ts, source-markers.ts, index.ts (orchestrator)
    canlii/                    CanLII API client + Ontario court parsers
    ontario-courts/            Civil court portal scraper (exact + fuzzy match)
  .v4-source/                  V4 prototype source files (read-only design canon)
    primitives.jsx             KPI / SecHead / Tag / Dot / Avatar / AIPanel / Steps / AuditRow / PageShell
    pages-public.jsx           PgHome / PgPricing / PubNav (for MarketingNav spec)
    pages-tenant.jsx           PgTenantDashboard / PgTenantPassport / PgTenantListings / …
    pages-landlord.jsx         PgLandlordDashboard / PgLandlordPipeline / PgLandlordCompare / …
    pages-agent.jsx            PgAgentDashboard / PgAgentClients / PgAgentPackages / …
    pages-shared.jsx           PgNotifications / PgBilling / PgAudit / PgProfile
    v4-tokens.css              Cream surface + deep emerald + Inter Tight + JetBrains Mono
  docs/                        Architecture docs (ADRs, agent specs, flow diagrams)
  CLAUDE.md                    Project context for Claude Code (auto-loaded)
  STAYLOOP_FRAMEWORK.md        This file
```

---

## 3. Architecture — high level

```
                 ┌────────── Public marketing site ──────────┐
                 │  / · /pricing · /tenants · /landlords ·    │
                 │  /agents · /trust-api · /trust-api/docs ·  │
                 │  /about · /partners                        │
                 │            ↑ MarketingNav                  │
                 └────────────────────────────────────────────┘
                                  │  Sign in
                                  ▼
                 ┌──────────── Authenticated app ─────────────┐
                 │  PageShell = Sidebar (220px, role-scoped)  │
                 │            + AppBar (56px, ⌘K + bell + 🧑) │
                 │  ───────────────────────────────────────── │
                 │  Tenant Portal     Landlord Portal         │
                 │  /tenant/*         /dashboard, /listings,  │
                 │  /passport         /screen, /landlord/*    │
                 │                                            │
                 │  Agent Portal      Cross-role              │
                 │  /agent/*          /chat, /billing,        │
                 │                    /notifications,         │
                 │                    /audit, /profile        │
                 └────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼──────────────────┐
                ▼                 ▼                  ▼
         ┌──────────┐      ┌───────────┐      ┌────────────┐
         │ Supabase │      │ Anthropic │      │  Stripe    │
         │ Postgres │      │  Claude   │      │  Checkout  │
         │  + RLS   │      │ (Sonnet + │      │  + portal  │
         │  + Auth  │      │  Haiku)   │      │  + webhook │
         └──────────┘      └───────────┘      └────────────┘
                                  │
                                  ▼
                          ┌───────────────┐
                          │  External     │
                          │  data sources │
                          ├───────────────┤
                          │  CanLII       │
                          │  Ontario Cts  │
                          │  CA Corp Reg  │
                          │  OpenCorp     │
                          │  Resend       │
                          └───────────────┘
```

---

## 4. Page inventory — by surface

### 4.1 Public marketing (uses `<MarketingNav />` — V4 PubNav)

| Route | Purpose |
|---|---|
| `/` | V4 home: hero "Renting, rebuilt with AI." + 3 role cards + 8-step flow + 8 AI module cards |
| `/pricing` | Three-tier pricing: Free / Plus / Enterprise |
| `/tenants` | Tenant audience landing |
| `/landlords` | Landlord audience landing |
| `/agents` | Agent audience landing |
| `/trust-api` | Trust API audience landing |
| `/trust-api/docs` | Developer docs (Overview, Auth, endpoints, Webhooks, SDKs, rate limits, errors) |
| `/about` | Company / mission |
| `/partners` | Partner Console (B2B onboarding for insurers, brokerages, govt) |
| `/login`, `/register`, `/auth/callback`, `/auth/signup`, `/auth/reset-password` | Auth flows |
| `/onboard` | Tenant onboarding (Step 2/4 — Bank Connect via Flinks). Mobile-first, custom progress nav |

### 4.2 Tenant portal (`<PageShell role="tenant">`)

| Route | Purpose |
|---|---|
| `/tenant/dashboard` | KPIs (Passport readiness · Active applications · Lease drafts) + Your applications + Steps timeline + AI Next-best-actions + Recent activity |
| `/passport` | Rental Passport v3 — Avatar + Verified ID badge + 9-row documents list + Active share links + Compliance card. PIPEDA-friendly. |
| `/tenant/listings` | Listing browse, sorted by Passport fit (96% / 88% / 74% etc.) + AI "Boost fit" hints |
| `/tenant/applications` | List of submitted applications |
| `/tenant/applications/[id]` | Detail: 6-step Steps timeline, application summary, communication thread, "Lease ready" dark card, AI What's next, audit trail |
| `/tenant/leases` | Tenant-side lease workspace |
| `/lease/[id]/review` | Public lease review + e-sign (sent via email link) |
| `/lease/escrow` | Escrow status + 6-step timeline |
| `/lease/explainer` | AI lease summary card (key clauses + dates) |
| `/score` | Score breakdown card (5 dimensions) |
| `/history` | Rental history audit log |
| `/disputes`, `/disputes/[id]` | Dispute mediator (Mediator agent) |
| `/insurance`, `/roommates`, `/services` | Mobile-first add-on flows |

### 4.3 Landlord portal (`<PageShell role="landlord">`)

| Route | Purpose |
|---|---|
| `/dashboard` | Eyebrow "Landlord Workspace" + KPI strip + Pipeline this-week strip + Top applicants table + AI Next-best-actions + Activity log |
| `/dashboard/pipeline` | 4-column kanban (NEW / SCREENING / APPROVED / LEASE / SIGNED) + Property filter chips + Logic recommendation banner |
| `/dashboard/portfolio` | Listings grid · status tabs (Live / Drafts / Closed) + 8-col table |
| `/dashboard/applications/[id]` | Single applicant detail with Logic AI scoring breakdown |
| `/dashboard/find-agent` | Agent directory grid |
| `/dashboard/onboarding` | Landlord onboarding wizard |
| `/listings/new` | **Nova listing composer** — paste text/URL/MLS PDF → AI extracts → OHRC compliance check → save listing |
| `/screen` | **Single-applicant tenant screening** — upload IDs/pay stubs/bank statements → classify → CanLII court search → forensics → AI score |
| `/landlord/leases` | Lease workspace + create-lease modal (from approved applicants) |
| `/landlord/screening` | Manual screening flow |
| `/landlord/applications/compare` | Side-by-side compare 2-3 applicants |

### 4.4 Agent portal (`<PageShell role="agent">`)

| Route | Purpose |
|---|---|
| `/agent/dashboard` | 4-col KPI + Today's package pipeline + AI Today's actions |
| `/agent/clients` | 3-col card grid + Tabs (All / Tenant / Landlord / Archived) + readiness Progress |
| `/agent/day` | Field-agent day brief |
| `/agent/leases` | Lease assistance table + 6-step timeline |
| `/agent/mls` | MLS listings table (mobile Phone frame) |
| `/agent/screening-packages` | Agent-branded report packages |
| `/agent/showings/[id]` | Showing detail card |

### 4.5 Cross-role / shared (`<PageShell>` reads `user.role`)

| Route | Purpose |
|---|---|
| `/notifications` | EN/SMS/in-app preference matrix + quiet hours + AI digests |
| `/billing` | Current Stripe plan + usage + invoices + add-ons + AI cost insights |
| `/audit` | Append-only 90-day audit log via `<AuditRow />` |
| `/profile` | 4-tab Settings (Profile / Org / Security / Integrations) |
| `/chat` | Conversational UI — Logic / Nova / Echo / Mediator agents |
| `/echo` | Echo agent chat (conversational tenant assistant) |
| `/market` | "Stayloop Index" — market analytics dashboard |
| `/reports/[id]` | Public screening report viewer (shareable link) |
| `/apply/[slug]` | Public application form (linked from a listing) |

**Total**: 60+ routes, ~41 of them authenticated, behind PageShell.

---

## 5. V4 Design system

### 5.1 Tokens (from `lib/brand.ts` + `.v4-source/v4-tokens.css`)

| Token | Hex | Use |
|---|---|---|
| `surface` | `#F2EEE5` | Warm cream — main page background |
| `surfaceMuted` | `#EAE5D9` | Slightly deeper cream — sidebars, inputs |
| `surfaceCard` | `#FFFFFF` | Pure white — cards, panels |
| `border` | `#D8D2C2` | Default 1px border |
| `borderStrong` | `#C5BDAA` | Hovered / emphasized borders |
| `textPrimary` | `#171717` | Body text |
| `textSecondary` | `#3F3F46` | Sub-headings |
| `textMuted` | `#71717A` | Eyebrows, captions |
| `textFaint` | `#A1A1AA` | Mono timestamps |
| `brand` | `#047857` | Deep emerald — buttons, accent text |
| `brandStrong` | `#065F46` | Hover state |
| `brandBright` | `#10B981` | Brighter emerald — dark panels, agent badge |
| `trust` | `#7C3AED` | Violet — AI accents, Trust API, tenant role |
| `success` / `warning` / `danger` / `info` | `#16A34A` / `#D97706` / `#DC2626` / `#2563EB` | Status |

Soft-mint primary CTA gradient: `linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)`.

### 5.2 Typography

- Sans: `Inter Tight, system-ui, sans-serif` (weights 400/500/600/700)
- Mono: `JetBrains Mono, monospace` (zero, ss01)
- "Serif" slot: Inter Tight 600 (intentional Stayloop choice — no actual serif)

### 5.3 Chrome — `<PageShell>`

Composes `<Sidebar/>` (220px, sticky) + `<AppBar/>` (56px, sticky) + scrollable `<main>` (default 32px padding). Calls `useUser({ redirectIfMissing: !allowAnonymous })`.

```
┌─────────┬──────────────────────────────────────┐
│ Sidebar │  AppBar (no logo here — Sidebar has │
│ (220px) │  it). Role badge › /breadcrumb.      │
│         │  ⌘K · 🔔 · 🌐 · 🧑                   │
│ Logo    ├──────────────────────────────────────┤
│ Stayloop│                                      │
│ Portal  │            page content              │
│         │      (default 32px padding)          │
│ ◇ Dash  │                                      │
│ ◈ Pass  │                                      │
│ ⌂ List  │                                      │
│ …       │                                      │
│         │                                      │
│ AICopil │                                      │
└─────────┴──────────────────────────────────────┘
```

### 5.4 Sidebar nav — by role

**Tenant** (purple accent): Dashboard · Passport · Listings · Applications · Leases · Messages · Settings.
**Landlord** (emerald accent): Dashboard · Listings · Applications · Screening · Leases · Tenants · Messages · Billing · Settings.
**Agent** (bright-mint accent): Dashboard · Clients · Packages · Listings · Leases · Messages · Billing · Settings.

Active link highlights via `usePathname()` with `pathname === href || pathname.startsWith(href + '/')`. Sidebar bottom holds an `<AICopilotCard />` that pulls live `pending_actions` count for the user's `conversations`.

### 5.5 Reusable primitives

| Component | Purpose |
|---|---|
| `<SecHead eyebrow title sub right/>` | Section header — eyebrow chip + 24px serif title + emerald gradient rule |
| `<Tabs items active onChange/>` | Sub-section nav with tone-mapped count badges |
| `<AuditRow when actor action target ip/>` | One row in a 90-day audit log |
| `<Avatar name size/>` | Circular initials, name-derived palette |
| `<AICopilotCard user/>` | Sidebar bottom card — live `pending_actions` count + "Open →" |
| Eyebrow class (`fp-eb`) | `JetBrains Mono` 10.5px, 0.10em letter-spacing, uppercase |
| `fp-card` | White bg, 14px radius, 1px border, `0 1px 3px ... + 0 12px 32px -8px ...` shadow |
| `fp-btn` | Soft-mint gradient primary CTA |
| `fp-btn-2` | White secondary with border |
| `fp-btn-gold` | Solid emerald (replaces V3 "gold") |
| `fp-btn-ghost` | Link-style brand-colored button |

---

## 6. Database schema (Supabase, all RLS-enabled unless noted)

### 6.1 Core domain

| Table | Purpose | Key columns |
|---|---|---|
| `landlords` | Landlord/tenant/agent profile (single table — disambiguated by `role`) | `id`, `auth_id`, `email`, `full_name`, `phone`, `role`, `plan`, `company_name` |
| `field_agents` | Agent-specific extension (extends `landlords` where `role='agent'`) | `landlord_id`, `service_areas`, `commission_split` |
| `listings` | Rental listings | `id`, `landlord_id`, `address`, `unit`, `city`, `monthly_rent`, `is_active`, `status` |
| `applications` | Tenant applications to listings | `id`, `listing_id`, `applicant_name`, `applicant_email`, `monthly_income`, `ai_score`, `status` |
| `screenings` | AI screening reports (1 per applicant per listing) | `id`, `application_id`, `final_score`, `tier`, `dimensions` (jsonb), `forensics_detail` (jsonb), `deep_check_result` (jsonb) |
| `tenancies` | Active lease record (after sign) | `id`, `lease_id`, `tenant_id`, `landlord_id`, `start`, `end`, `monthly_rent` |
| `lease_agreements` | Lease drafts + signed | `id`, `landlord_id`, `tenant_id`, `body_md`, `monthly_rent`, `lease_start`, `lease_end`, `status` (draft/tenant_review/landlord_review/signed) |
| `lease_clauses` | Per-clause breakdown for the AI explainer | `lease_id`, `clause_kind`, `body_md`, `risk_level` |
| `lease_signatures` | Audit trail per signing party | `lease_id`, `signer_id`, `role`, `signed_at`, `ip_address` |
| `consent_records` | PIPEDA-style data-sharing consent | `tenant_id`, `landlord_id`, `scope`, `expires_at`, `revoked_at` |
| `screening_cases` | Sharable screening report (public viewer) | `id`, `screening_id`, `share_slug` |

### 6.2 AI agent runtime

| Table | Purpose |
|---|---|
| `conversations` | One per user × agent (`logic` / `nova` / `echo` / `mediator`) |
| `messages` | Conversation transcript — role + content (jsonb) + tool_calls |
| `pending_actions` | AI-proposed mutations awaiting user approve/reject/modify |
| `tool_executions` | Audit log of tool runs |
| `user_facts` | Long-term memory — facts the agent has learned about the user |

### 6.3 Cross-cutting

| Table | Purpose |
|---|---|
| `audit_events` | Append-only 90-day log (every share, view, sign, download) |
| `disputes` / `dispute_messages` | Mediator agent threads |
| `showings` | Booked viewings (agent-managed) |
| `service_providers` / `service_bookings` | Add-on services (insurance, moving, locksmith) |
| `partner_orgs` / `webhook_endpoints` / `webhook_events` | Trust API B2B integrations |
| `anon_screening_log` | Anonymous trial screening counter |
| `ca_corp_registry` | Federal Canadian corp registry — 184k rows, refreshed monthly. RPCs: `search_corp_registry(q, min_sim)` (trigram + token-overlap), `lookup_corp_by_bn(bn)` (exact BN match) |
| `employer_lookup_cache` | 7-day TTL cache for OpenCorporates fallback queries |

Migration files live in Supabase MCP; the most recent application-level migration was `v4_lease_audit_consent_tables` (5 new tables).

---

## 7. API routes (`app/api/*/route.ts`)

| Route | Purpose | Runtime |
|---|---|---|
| `POST /api/classify-files` | Lightweight file classifier (id_document / pay_stub / employment_letter / bank_statement / credit_report / …) | edge |
| `POST /api/screen-score` | **Full screening orchestrator**: classify → extract names → CanLII multi-DB search + Ontario Civil Court Portal → forensics → AI scoring → return | edge |
| `POST /api/deep-check` | Arm's-length employment verification (PRO-only): CA corp registry → OpenCorporates fallback → director cross-reference | edge |
| `POST /api/ai-score` | Legacy 6-dim scorer (Vision OCR + scoring) | edge |
| `POST /api/ltb-search` | Standalone CanLII LTB lookup | edge |
| `GET /api/file-url` | Signed URL for tenant-uploaded files (Supabase Storage) | edge |
| `POST /api/notify-landlord` | Email landlord on new application (via Resend) | edge |
| `POST /api/agent/chat` | **Agent loop entrypoint** — accepts user message, runs agent, returns AssistantBlocks | edge |
| `POST /api/agent/action` | Approve/reject/modify a `pending_actions` row | edge |
| `POST /api/stripe/checkout` | Create checkout session (Plus / Pro upgrade) | edge |
| `POST /api/stripe/portal` | Stripe billing portal redirect | edge |
| `POST /api/stripe/webhook` | Stripe events → update `landlords.plan` | node (signature verification) |

---

## 8. Forensics pipeline (`lib/forensics/`)

Runs inside `/api/screen-score`. Every uploaded document gets layered checks:

```
Layer 0 — File classification (Haiku)
   classify-files: id_document | pay_stub | employment_letter | bank_statement | credit_report | other
        │
Layer 1 — Zero-cost PDF analysis
   pdf-metadata: producer signature, creation date, modification date, multiple-edit detection
   pdf-text:     density check (text-vs-image PDF), lorem-ipsum / template detection
   source-markers: Equifax / TD / RBC / Service Canada layout fingerprints
        │
Layer 2 — Vision OCR (Haiku, only when needed)
   image-ocr: image-only PDFs (photo IDs, scanned letters) get full-page OCR
              + apparent_doc_type, apparent_name, visible_issuer, has_watermark, visible_dates
        │
Layer 3 — Domain-specific math + cross-doc
   id-validation:  18 ID kinds — SIN Luhn, OHIP, DL province codes, Passport MRZ, PR card
   paystub-math:   Period × hourly_rate ≈ gross — defensive normalizeExtraction kicks in
                   on annual-salary-as-hourly-rate, hourly-rate noise floor
   cross-doc:      Entity extraction — name, address, phone collisions across files
   arm-length:     Employer name + signatory name → CA corp registry lookup
                   → director cross-ref → numbered-company / recent-incorp / address-overlap
   equifax-markers: 14+ specific markers for legitimate Equifax consumer report
   page-budget:    Anthropic 100-PDF-page guard — proportional scaling per kind
        │
Layer 4 — Sonnet authenticity judgment (final scoring)
   index.ts:       Orchestrates above layers, builds the prompt, calls Sonnet.
   v3 scoring:     5 dimensions — ability_to_pay 40% · credit_health 25% ·
                   rental_history 20% · verification 10% · communication 5%.
   Hard gates:     Cap overall when triggered (e.g. ltb_eviction → 40,
                   self_issued_employment → 50, court_record_defendant → 35,
                   producer_consumer_tool (Photoshop) → 50).
```

Forensics writes back to `screenings.forensics_detail` (jsonb) and surfaces flags in the screening report UI.

### 8.1 Why the AI doesn't read every page — and how it's still complete

Anthropic's API caps each request at **100 PDF pages**. A typical screening upload is 5 files totalling 100–200 pages, so something has to give. The pipeline solves this by running two **independent** tracks against every uploaded file and merging them at the prompt:

```
                ┌──────────────────────────────────────────────┐
                │            EVERY UPLOADED FILE               │
                └──────────────┬───────────────────────────────┘
                               │
              ┌────────────────┴─────────────────┐
              ▼                                  ▼
   ┌───────────────────────┐         ┌─────────────────────────┐
   │   FORENSICS TRACK     │         │  AI SCORING TRACK       │
   │   reads ENTIRE file   │         │  page-budgeted (≤95)    │
   ├───────────────────────┤         ├─────────────────────────┤
   │ • PDF metadata        │         │ page-budget.ts caps     │
   │ • text density        │         │   each file by kind:    │
   │ • source markers      │         │     pay_stub → 4 pp     │
   │ • Haiku Vision OCR    │         │     emp_letter → 5 pp   │
   │ • paystub-math        │         │     bank_stmt → 8 pp    │
   │ • ID-validation       │         │     credit_report→12 pp │
   │ • cross-doc collisions│         │   bundles SUM the caps  │
   │ • arm-length lookup   │         │ Truncates over-quota    │
   │ • Equifax markers     │         │   files; tells Sonnet   │
   │                       │         │   which pages it didn't │
   │ Output:               │         │   see ('[NOTE] you only │
   │   structured JSON     │         │   got pages 1–21')      │
   │   stored on           │         │                         │
   │   screenings          │         │ Output:                 │
   │   .forensics_detail   │         │   PDF blocks attached   │
   │                       │         │   to Sonnet prompt      │
   └──────────┬────────────┘         └────────────┬────────────┘
              │                                   │
              ▼                                   ▼
              ┌────────────────────────────────────────┐
              │   SONNET SCORING PROMPT                │
              │   visual access:  budgeted PDF pages   │
              │   factual access: forensics summary    │
              │                   (paystub_math,       │
              │                    equifax_markers,    │
              │                    id_validation, etc) │
              │                                        │
              │   → 5-dim score + hard gates + flags   │
              └────────────────────────────────────────┘
```

**Two consequences worth knowing:**

The forensics track has **no page limit** — it processes the full file via signed URLs and pdf-lib. So claims like *"Photoshop produced this PDF"*, *"the gross-pay math is impossible"*, *"this Equifax PDF is missing the canonical markers"*, or *"Bo Han appears as defendant in CV-20-00634472"* never depend on whether Sonnet visually saw the page — they're already proven facts before the prompt is even built.

The AI track gets **role-aware page budgets** that aim at the high-density pages (first 4 of an ID, the most-recent pay-period summary, the Equifax score + tradelines). For a single-kind file these budgets fit comfortably under 95. For a **bundled PDF** that contains multiple kinds (e.g. one "Supporting Documents.pdf" with employment letter + 2 pay stubs + a 30-page Equifax) the budgets are **summed across kinds** so each embedded document keeps its share — a 38-page bundle gets `5 + 4 + 12 = 21` pages instead of the default 6. Truncation always emits a `[NOTE]` line in the prompt so Sonnet knows which pages it didn't see and avoids hallucinating about them.

**Why we don't just send every page**:

- *Cost.* A 100-page vision request is ~$0.05; at 1k screenings/month that's $50 in marginal Sonnet spend with little upside, since most extra pages are repetitive (closed accounts, historical YTD).
- *Latency.* 100 PDF pages take 30–60s to process server-side; users want results in 8–15s.
- *Signal density.* Pages 25–38 of a credit report are usually already-closed historical lines — paystub math + the visible recent score carry the decision; deeper pages don't change tier.

**Net effect**: every fact that affects the score is either visible to Sonnet **or** is a structured forensics finding embedded in the prompt as text. The AI never has to guess about a page it didn't see.

---

## 9. AI agent system

### 9.1 Agents (`lib/agent/agents/`)

| Agent | Purpose | Status |
|---|---|---|
| **Logic** | Landlord screening assistant — runs the screening flow, scores applicants, recommends approve/conditional/decline | Live |
| **Nova** | Listing composer — extracts a listing from pasted text / URL / MLS PDF, runs OHRC compliance check, saves to `listings` table | Live |
| **Echo** | Tenant conversational assistant | Stub |
| **Analyst** | Market data + portfolio insights | Reserved |
| **Mediator** | Dispute resolution | Reserved |

### 9.2 Runtime — the ~200-line custom loop (`lib/agent/runtime.ts`)

Per ADR-002 we deliberately wrote our own loop instead of using LangChain or the Claude Agent SDK. The loop:

1. Reads conversation context (user, role, listing/application focus).
2. Loads latest `messages` rows.
3. Builds the system prompt from the agent definition + injected context.
4. Calls Sonnet with the full tool catalog the agent has registered.
5. Parses tool_calls — for each, dispatches to the registered tool implementation.
6. **Pending-action gate**: tool_calls that mutate user data (e.g. `save_listing`) write to `pending_actions` instead of executing — UI renders `<ActionProposal>` with `[批准]/[驳回]/[修改]` buttons.
7. Returns `AssistantBlock[]` for the chat UI to render (text, tool execution badge, screening_card, action_proposal, …).

### 9.3 Tools registered

`import_listing`, `check_ohrc_compliance`, `save_listing`, `screen_applicant`, `summarize_lease`, `book_showing`, `request_document`, etc. Each tool has a JSON schema and a TypeScript implementation under `lib/agent/tools/`.

---

## 10. Auth flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Visitor lands on /                                      │
│  2. Clicks "Get started" → AuthModal opens                  │
│  3. Magic link to email or OAuth                            │
│  4. Supabase Auth issues access_token (httpOnly cookie)     │
│  5. /auth/callback resolves session, redirects home         │
│  6. useUser() hook resolves: looks up landlords row by      │
│     auth_id; if missing creates one with role='landlord'    │
│  7. Cached in module-level cachedUser to prevent flicker    │
│     on every page navigation                                │
│  8. PageShell calls useUser({ redirectIfMissing: true })    │
│     → bounces to /login if no session                       │
└─────────────────────────────────────────────────────────────┘
```

Anonymous-trial flow exists for `/screen` so first-time visitors can run one screening before signing up; tracked in `anon_screening_log`.

---

## 11. Deployment

- Repo: `https://github.com/Jasonhan72/stayloop` (private, PAT-authenticated)
- Default branch: `main`
- Cloudflare Pages auto-deploys on push to `main`
- All dynamic `[param]` routes use `export const runtime = 'edge'`
- `useSearchParams` callsites are wrapped in `<Suspense>` (Next 14 requirement)
- Environment variables (Cloudflare Pages → stayloop → Settings → Variables):
  - `ANTHROPIC_API_KEY` (secret)
  - `CANLII_API_KEY`
  - `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PRICE_ID`
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`, `RESEND_FROM`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

## 12. Bilingual

The app is fully bilingual EN ↔ ZH via `useT()` from `lib/i18n.tsx` and a `<LanguageToggle/>` in MarketingNav + AppBar. Pattern:

```tsx
const { lang } = useT()
const isZh = lang === 'zh'
return <span>{isZh ? '仪表盘' : 'Dashboard'}</span>
```

Jason's preference is Chinese for product copy. Code comments stay in English.

---

## 13. Where to read more

- `CLAUDE.md` — running changelog and tech notes (auto-loaded by Claude Code)
- `docs/architecture.md` — engineer-facing L0–L3 architecture
- `docs/architecture-detailed.md` — pitch view + 8+1 agents + competitor matrix
- `docs/data-model.md` — current + planned tables ERD
- `docs/agents/{logic,nova,echo,analyst,mediator}.md` — agent specs
- `docs/flows/{screening,verified-passport,listing-import}.md` — flow diagrams
- `docs/adr/001-005.md` — Architecture Decision Records
- `.v4-source/README.md` — V4 prototype structure
- `DESIGN.md` — design system reference

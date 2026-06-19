# Stayloop — Project Context for Claude Code

AI-powered tenant screening SaaS for Ontario landlords. Live at **www.stayloop.ai**.

## Tech Stack

- **Framework:** Next.js 15.5.2 App Router + TypeScript + Tailwind CSS
- **Hosting:** Cloudflare Pages (`@cloudflare/next-on-pages` v1.13.16)
- **Auth:** Supabase JS v2, implicit flow (`lib/supabase.ts`, `lib/useAuth.ts`)
- **AI:** Claude Sonnet via Anthropic API (Vision + text, edge runtime)
- **Email:** Resend SMTP via Supabase Auth (magic links)
- **Payments:** Stripe (test mode)
- **Maps:** Google Maps API
- **DB:** Supabase (project `upbkcbicjjpznojkpqtg`)

## Repo & Branches

- GitHub: `github.com/Jasonhan72/stayloop` (private, PAT in `.git/config`)
- Local branch: `v5`
- Push target: `v5.3-launch`
- CF Pages prod branch: **`main`** — deploy always uses `--branch main`

## Deploy

Double-click `ship2-v53.command` in Finder. It does:
1. `git add -A && git commit && git push origin HEAD:v5.3-launch`
2. `npx @cloudflare/next-on-pages@1` (build)
3. `wrangler pages deploy .vercel/output/static --project-name stayloop --branch main --commit-dirty=true`

**Critical:** use global `wrangler`, NOT `npx wrangler` (hangs on install prompt).

Verify deploy: `curl -s 'https://www.stayloop.ai/?v=<timestamp>' | head`

## Env Vars

All in `.env.local` (git-ignored). Keys needed:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CANLII_API_KEY
RESEND_API_KEY
RESEND_FROM
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PRICE_ID
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_GOOGLE_MAPS_KEY
```

Optional (guarded with `if (process.env.X)` — features degrade gracefully when absent):

```
JINA_API_KEY                # agent listing search → realtor.ca scrape (lib/agent/listingSearch.ts)
OPENCORPORATES_API_TOKEN    # deep-check / forensics arm's-length lookup (lib/forensics/arm-length.ts)
```

Same vars are set in Cloudflare Pages dashboard for production.

## Key Files

### Core
- `lib/supabase.ts` — Supabase client (implicit flow)
- `lib/useAuth.ts` — auth hook
- `lib/useLandlord.ts` — landlord hook, calls `claim_landlord()` RPC
- `lib/i18n.tsx` — i18n (zh primary; `t(key, fallback)`)
- `middleware.ts` — apex → www 308 redirect
- `tailwind.config.ts` + `app/globals.css` — design tokens (`.sl-card`, `.sl-btn-primary`, `.orb`, role colors)

### Components
- `components/Header.tsx` — global nav: 房源·租客·房东·经纪·审核 (Trust API NOT in nav)
- `components/Footer.tsx` — footer with v5.3 label
- `components/Logo.tsx` — `stayloop.AI` (`.AI` in purple→blue gradient)
- `components/WorkspaceShell.tsx` — all workspace pages use this (role-based theming)
- `components/RoleLanding.tsx` — shared template for /tenant /landlord /agent marketing pages
- `components/agent/*` — 9 agent UI components (AgentHeroStatus, ApprovalActionCard, etc.)

### Agent Spine
- `lib/agent/*` — types, session-loader, approval-engine, memory, audit, orchestrator, demo, prompts, guardrail, `useAgentSession` hook
- `/tenant/agent` (Luna), `/landlord/agent` (Logic), `/agent/agent` (Brief)
- `useAgentSession` has 5s render deadline + 4s RPC timeout (falls back to demo if stalled)

### Agent Brain (2026-06-16 — AI-native reasoning loop)
- **`app/api/agent/turn/route.ts`** (edge) = the Personal Agent reasoning step. STATELESS: client passes `{role, message, memories, workflow}`, route runs Claude (`claude-sonnet-4-6`) with a role system prompt (`lib/agent/prompts.ts` — Luna/Logic/Brief persona + 5 principles + "propose, don't decide"), returns `{reply, memory_writes, proposed_action, next_stage}`. Anthropic key stays server-side.
- **Split**: server = reasoning only; client (`runAgentTurn` in orchestrator.ts) persists via RLS-scoped browser client — implicit memory → `user_memories` (`upsertMemories`, onConflict `user_id,role,memory_type,key`; memory_type clamped to preference/profile/constraint/semantic/system), proposed action → `agent_pending_actions`, turn → `agent_audit_events`. Same pattern as existing memory.ts/approval-engine.ts.
- **Compliance Guardrail** (`lib/agent/guardrail.ts`) = deterministic server-side filter on every turn output: blocks OHRC-protected-ground rejections, flags illegal lease terms, strips false "already done" claims, demotes over-reach scope. The LLM is also instructed but the guardrail is the backstop.
- **Fallback**: anonymous/preview or any failure → canned acknowledgement (no LLM cost, no persistence). Real reasoning only for authed live sessions.
- **Entry IA**: login → role's `/x/agent` (was: everyone → `/dashboard`). Header workspace link + WorkspaceShell rail treat the Agent home as the primary entry; V4 pages are related flows.
- **Note**: prod has BOTH the V4 AI-native tables (`conversations`/`messages`/`user_facts`/`pending_actions` — empty/dead) and the active `agent_*` layer (has rows). The brain writes to the `agent_*` layer.

### API Routes (all edge runtime)
- `app/api/screen-score/route.ts` — Vision OCR + 6-dim scoring + streaming progress
- `app/api/deep-check/route.ts` — deep background check
- `app/api/ltb-search/route.ts` — CanLII court records
- `app/api/file-url/route.ts` — signed URL for file viewing
- `app/api/ai-score/route.ts` — legacy scoring
- `app/api/trust/verify/route.ts` — Trust API endpoint
- `app/api/notify-landlord/route.ts` — email notifications

### Screening Module
- `app/screening/page.tsx` — main screening page with streaming progress
- `app/screening/[id]/{report,done,graph,ltb,share}/page.tsx` — sub-pages
- `lib/generateReport.ts` — PDF report (browser-print HTML)
- `lib/forensics/` — document forensics engine

## DO NOT TOUCH — Screening Module

The screening module (`app/screening/`, `app/api/screen-score/`, `app/api/deep-check/`, `lib/generateReport.ts`, `lib/forensics/`) has been through deep independent iteration. **Do not modify these files** unless explicitly asked to work on screening.

## Dual-ID Invariant (Critical)

`landlords.id` (profileId, e.g. `62d71545...`) ≠ `auth.users.id` (authId, e.g. `90138c49...`).

- Legacy `screenings.landlord_id` rows store profileId; new inserts store authId
- The `screenings → landlords` FK was **DROPPED** — PostgREST embeds (`landlord:landlords(...)`) will fail
- Plan lookups: always use `.or('id.eq.X,auth_id.eq.X')` on landlords table
- Ownership filters on screenings: rely on RLS, don't hard-filter by `user.id`
- `applications → listings → landlords` FK chain is intact

## Database Migrations

In `supabase/migrations/`:
- `20260509_v5_schema.sql` — V5 base schema
- `20260606_agent_core.sql` — 7 agent tables (`agent_configs`, `user_memories`, `task_memories`, `agent_sessions`, `agent_pending_actions`, `approval_events`, `agent_audit_events`)
- `20260606_agent_core_seed_all_roles.sql` — `seed_demo_agent_data(role)` RPC
- `20260608_billing_commission.sql` — billing/commission tables + `get_entitlements(role)` + `settle_referral_commission` (25% engine + ComplianceGuard)
- `20260608_security_fixes.sql` — security patches

**Two agent DB layers coexist** (reconciliation TODO):
1. Old AI-native: `conversations`, `messages`, `user_facts`, `tool_executions`, `pending_actions`, `audit_events`
2. New spine: `agent_*` namespaced tables

## Design Source of Truth

- `design/v53-handbook-complete-zh.html` — full engineering handbook
- `design/v53-vol1.html` through `v53-vol8.html` + `v53-vol-arch.html` — extracted volumes
- VOL1=homepage, VOL2=workspace flows, VOL3=settings/pricing/agent, VOL4=more UI, VOL5-7=screening(skip), VOL8=disputes/LTB/legal
- **Rule: build STRICTLY to these designs — exact copy, exact routes, exact layout. Don't improvise.**

### Design Alignment Status (as of 2026-06-16)

**Done (earlier):**
- Homepage (`app/page.tsx`) — fully aligned with real images, LunaChatDemo, JourneyIcon flow, products section
- All public/marketing pages — verified aligned
- Tenant: payments right column, maintenance NewTicketModal (pill buttons + photo grid), passport authorization cards
- Landlord: finance hero (personal greeting style + aligned KPIs)
- Agent: calendar (KPI cards + settlement section), earnings hero

**Done (2026-06-16 full alignment pass — audited all VOL1/2/3/4/8 vs implementation):**
- HIGH correctness: leases OREA Form 400 → Ontario LTB Standard Lease; rent-cap 2.5% now notes post-2018 exemption; applicants/[id] RTA anti-discrimination warning + corrected decision CTAs; finance KPI labels fixed (净利/空置率/税务待缴); passport garbled copy fixed; pricing rebuilt to design's 3-role static cards + Trust API band (removed invented paid tiers)
- Disputes (`app/disputes/page.tsx`) realigned to VOL8: 4 real cases (DSP-1J5N 骚扰投诉 replaces fabricated DSP-1Z9K, DAY x/14, 等你回 pulse), 三阶递进 stages, 4 real lawyers w/ full fields + 不抽佣 disclosure, closed-cases table, RTA notes, Logic-Legal + AI-generated warning
- New pages built: `/tenant/audit` + `/landlord/audit` (VOL3 ART30, shared `components/AuditLog.tsx`), `/notifications` (ART31), `/tenant/move-in` (VOL2 Day-1), `/agent/showings/[id]` + `/feedback` (VOL2/ART37), `/tenant/lease` signature page (第6页 + Luna SIGNING aside), landlord `RenewalPack` (Thompson A/B/C), `/dashboard/listings/new` expanded to 5 steps + one-click import (ART33/34)
- Data canon unified: Sarah Wang / Mia Chen / David Park / Unit 1207 King West $2,800 / Liberty Village 2B / RBC 8721; "Mike Park" → "Kevin Tran" (avoided David Park collision); terminology Tier N / Trust Tier → 认证 N 级 (CSS classes + data fields untouched)
- Onboarding `name` screen reworked to design (@ input, PREVIEW quote, capability grid, Chinese names, CTA → 90s 验证/tier1); homepage 02 4th "合规·可审计" card; listing detail "房客信用门槛·房东设置" + "让 Luna 替我问" / "派 Field Agent 看房 ($80)" CTAs
- `lib/agent/demo.ts` aligned to canon so agent spine renders design content (incl. RECO 授权/不授权 via data_scope/excluded_data)
- Nav wired: Header bell → `/notifications`; tenant+landlord rail 审计 icon → audit pages; lease page → move-in link; agent tasks showing → `/agent/showings/[slug]`

**Remaining (next session — deferred deliberately):**
- Agent workspaces: hard-author the design's fixed KPI strip / YOUR PROFILE aside / RECO checklist as components (currently fed via demo data through the intentional spine — true rebuild conflicts with spine architecture, needs a design call)
- Disputes: ART70 three-party arbitration workbench + ART71 4-step LTB prefill wizard (deeper net-new flows; rest of disputes aligned)
- Onboarding: design has 2 screens (name → tier1); we kept extra `welcome` + `meet` screens — decide whether to remove
- `/agent/onboarding` vs design route `/agent/onboard` — reconcile name; rework into Brief-voiced ART35 flow (RECO pledge, 3 steps, 画 3 个小区)
- Wire billing engine (`get_entitlements`) into UI; Stripe Connect real payouts; reconcile two agent DB layers

## Route Map

### Public
`/` `/pricing` `/tenant` `/landlord` `/agent` `/trust-api` `/screening` `/about` `/partners` `/contact` `/disputes` `/listings` `/listings/[slug]` `/privacy` `/terms`

### Auth
`/login` `/onboarding/welcome` `/onboarding/name` `/onboarding/meet` `/onboarding/tier1` `/auth/callback` `/apply/[slug]`

### Tenant Workspace
`/tenant/agent` `/tenant/applications` `/tenant/lease` `/tenant/maintenance` `/tenant/passport` `/tenant/payments`

### Landlord Workspace
`/landlord/agent` `/landlord/applicants` `/landlord/applicants/[id]` `/landlord/finance` `/landlord/leases` `/landlord/maintenance`

### Agent Workspace
`/agent/agent` `/agent/calendar` `/agent/clients` `/agent/earnings` `/agent/tasks`

### Other
`/dashboard` `/settings`

## Preferences

- No comments inside copyable command blocks — put explanations outside the code block
- Design is authoritative — production should match the design HTML volumes exactly
- Chinese (zh) is the primary UI language

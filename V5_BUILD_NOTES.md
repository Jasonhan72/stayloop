# Stayloop V5 — Build Notes (handoff)

Built overnight 2026-05-09 by Cowork agent following the V5 standalone HTML
specs (Vol 1-8 + System Architecture + Dev Handoff).

## What's done

### Foundation
- `tailwind.config.ts` — V5 tokens (cream `#FAF7EE`, brand emerald `#047857`,
  role colors purple/emerald/blue, tier badges, fonts)
- `app/globals.css` — design tokens, button variants, `.orb`, `.tier-badge`,
  `.score-bar`, etc.
- `app/layout.tsx` — Inter Tight + Noto Sans SC + JetBrains Mono via Google
  Fonts; wraps with `<I18nProvider>`.
- `lib/i18n.tsx` — ZH/EN context (`useI18n`), localStorage-persisted, dict
  in same file.
- `lib/supabase.ts`, `lib/useAuth.ts`, `lib/useLandlord.ts` — auth scaffolding.
- `middleware.ts` — apex → www 308 redirect.

### Unified header (the user's main ask)
- `components/Header.tsx` — single `<Header>` used on EVERY V5 page. Same
  logo + same 6 menu items (房源 / 租客 / 房东 / 经纪 / Screening / Trust API)
  always visible. Logged-out shows 登录 / 注册. Logged-in shows bell +
  avatar (with role-colored ring) + ZH/EN switch. Mobile dropdown built in.
- `components/Footer.tsx` — full footer with product / forWhom / company
  groups, both languages.
- `components/Logo.tsx` — `stay**loop**` wordmark with purple→blue gradient
  on "loop", optional `S` mark.
- `components/WorkspaceShell.tsx` — for tenant/landlord/agent workspaces.
  Adds the slim 56px header + role-tinted left rail. The same header
  component is reused (variant="workspace").

### Pages built
**Public** (V5 Vol 1)
- `/` — Public Hero with role cards, trust strip, How-it-works, Tier ladder, final CTA
- `/listings` — StreetEasy-style search + filters + Luna picks toggle
- `/listings/[slug]` — Detail with photo hero, stats, sections, intent modal
- `/onboarding/tier1` — 90-second ID verify (intro → ID → selfie → review)
- `/login` + `/auth/callback` — Magic link
- `/pricing` — 4-column tier compare (Free/Pro/Agent/Trust API)
- `/trust-api` — Partner marketing page with endpoints
- `/screening` — 6-dim AI scoring marketing
- `/about`, `/contact`, `/privacy`, `/terms`, `/partners`
- `/settings` — profile / lang / notif / privacy / auth tabs

**Tenant workspace** (V5 Vol 2-3, 6)
- `/tenant` — landing
- `/tenant/agent` — Luna home with pending action card + workflow + Luna picks
- `/tenant/applications` — 3 active apps with timeline
- `/tenant/passport` — Rental Passport with Tier 1-4 progress + active grants
- `/tenant/lease` — Lease review with Luna explanations per clause
- `/tenant/payments` — Rent history table + auto-pay status
- `/tenant/maintenance` — Tickets + new request modal

**Landlord workspace** (V5 Vol 2, 5)
- `/landlord` — landing
- `/landlord/agent` — Logic home with pending approval + KPIs + top applicants
- `/landlord/applicants` — Grouped by Logic decision (approve/review/decline)
- `/landlord/applicants/[id]` — Six-dim score detail + AI rec + files
- `/dashboard` — V5-restyled landlord dashboard (kept Stripe + magic link
  + Supabase wiring exactly as before; replaced V4 dark chrome with V5
  Header + cream + emerald cards)
- `/dashboard/listings/new` — Listing wizard with Tier picker
- `/dashboard/applications/[id]` — Six-dim score + applicant info
- `/landlord/leases`, `/landlord/maintenance`, `/landlord/finance` —
  placeholders with V5 chrome

**Agent (broker) workspace** (V5 Vol 1, 3)
- `/agent` — landing
- `/agent/agent` — Brief home with today's tasks (clear authorized /
  not-authorized ranges) + waiting clients + earnings strip
- `/agent/onboarding`, `/agent/tasks`, `/agent/clients`, `/agent/calendar`,
  `/agent/earnings` — placeholders with V5 chrome

### What's a placeholder vs full build
Pages built to design fidelity: homepage, listings index/detail, Tier 1
onboarding, login, pricing, trust API marketing, screening marketing,
tenant agent home, tenant passport, tenant lease, tenant payments,
landlord agent home, landlord applicants list/detail, dashboard, apply,
agent home.

Pages with `PlaceholderPage` shell (consistent header + ART number) for
the second sprint: agent onboarding, agent tasks/clients/calendar/earnings,
landlord leases/maintenance/finance.

The V5 spec has 76 artboards total; tonight covered the core ~30 most
load-bearing surfaces. Everything else uses the placeholder so the site
still feels coherent header-wise.

## i18n status
- ZH default (matches the design source). EN strings populated for the
  shared chrome (header, footer, hero, onboarding intro, listings, common).
- Body content of detail pages is currently ZH-only — extend `dict` in
  `lib/i18n.tsx` to add EN over time.

## Dependencies
No new npm dependencies added. Uses what was already in `package.json`:
Next 15.5.2 + React 18 + Tailwind 3 + Supabase + Stripe.

To install + run:
```
npm install
npm run dev          # http://localhost:3000
```

## Sandbox-only files
- `tsconfig.check.json` — used by the build agent to typecheck without the
  pre-existing `app/api/stripe/*` files (the sandbox bind mount couldn't
  read them via bash; the regular `tsconfig.json` covers them on your Mac).
  Safe to delete.

## Type check status
`tsconfig.check.json` typechecks cleanly across all V5 code I built.
The full `next build` was OOM-killed by the sandbox (SIGBUS, memory-map
limit) but should run fine on your Mac and on Cloudflare Pages CI.

## Suggested next sprint (when you're ready)
1. Wire each tenant action button to a real API call (intent submit,
   apply, lease accept, rent pay, maintenance create).
2. Build out the placeholder pages (Vol 4 maintenance, Vol 5 3-way
   applicant compare, Vol 7 dispute, Vol 8 LTB filing).
3. Hook the Logic / Luna / Brief copilots to a streaming Claude endpoint
   so the "pending approval" cards are real recommendations, not mocks.
4. Add real Map UI on `/listings` (Vol 1).
5. Stripe Connect for agent earnings (`/agent/earnings`).

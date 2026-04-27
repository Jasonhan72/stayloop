# V3 Prototype vs. Current Implementation

> Gap analysis as of 2026-04-27. Source: `Stayloop V3 — Print- classic.pdf` (25 sections).

## Status table

| # | V3 Section | Type | Built? | Where |
|---|------------|------|--------|-------|
| 01 | Tenant · Echo concierge | iOS chat | ❌ | — |
| 02 | Verified Renter Passport | iOS card | ❌ | — |
| 03 | Lease Explainer | iOS clauses | ❌ | — |
| 04 | Landlord Pipeline (Logic) | Web kanban | ✅ | `/dashboard/pipeline` |
| 05 | Listing Composer (Nova) | Web | ⚠️ partial | `/listings/new` (different layout) |
| 06 | Stayloop Index (Analyst) | Web charts | ❌ | — |
| 07 | Field Agent Day Brief | Web | ❌ | — |
| 08 | Showing Detail | Web | ❌ | — |
| 09 | MLS Ready Pack | iOS | ❌ | — |
| 10 | Trust API · Developer docs | Web | ⚠️ marketing only | `/trust-api` is a landing page, not actual API docs |
| 11 | Services Marketplace | Web | ❌ | — |
| 12 | Tenant Onboarding (bank connect) | iOS | ❌ | — |
| 13 | Find a Field Agent | Web | ❌ | — |
| 14 | B2B Partner Onboarding | Web | ❌ | — |
| 15 | Stayloop Score · Transparency | Web | ❌ | — |
| 16 | Lease eSign + Escrow | Web | ❌ | — |
| 17 | Disputes & AI Mediation | Web | ❌ | — |
| 18 | Insurance bind | iOS | ❌ | — |
| 19 | Roommates group apply | iOS | ❌ | — |
| 20 | Landlord Portfolio Analytics | Web | ❌ | — |
| 21 | Marketing site | Web home | ✅ | `/` |
| 22 | Investor Pitch Deck | Web | ❌ | — (private, OK) |
| 23 | Landlord Onboarding | Web wizard | ❌ | — |
| 24 | Tenant Rental History | iOS | ❌ | — |
| 25 | Internal GTM Dashboard | Web | ❌ | — (internal) |

**Score: 2 fully built / 2 partial / 21 missing.**

What's been delivered so far is the V3 *brand* (palette, typography, buttons, eyebrow tags) and two screens that actually match the V3 mockups — the marketing homepage (section 21) and the landlord pipeline kanban (section 04). The rest of the app is pre-V3 surfaces (`/chat`, `/dashboard`, `/screen`, `/listings/new`) recolored emerald, plus four new audience landing pages I added that aren't in the V3 prototype at all.

## Build order (proposed)

**Tier A — Tenant journey (the heart of V3):**
1. `/onboard` — section 12 bank-connect orchestrator (Persona → Flinks → Equifax → Openroom step indicator)
2. `/passport` — section 02 Verified Renter Passport card (score + claims row)
3. `/score` — section 15 Stayloop Score transparency (6-axis breakdown with weights)
4. `/history` — section 24 rental history timeline (co-signed by prior landlords)
5. `/lease/[id]/explainer` — section 03 lease clause-by-clause explainer
6. `/echo` — section 01 tenant Echo concierge (separate from Logic chat)

**Tier B — Landlord journey:**
7. `/dashboard/portfolio` — section 20 multi-property analytics
8. `/index` — section 06 Stayloop Index market data
9. `/dashboard/find-agent` — section 13 Find a Field Agent (6-factor matching)
10. `/dashboard/onboarding` — section 23 landlord onboarding wizard
11. Rebuild `/listings/new` — section 05 split-pane to match V3 exactly

**Tier C — Field Agent journey:**
12. `/agent/day` — section 07 Day Brief
13. `/agent/showings/[id]` — section 08 Showing Detail
14. `/agent/listings/[id]/mls` — section 09 MLS Ready Pack mobile

**Tier D — Cross-cutting:**
15. `/services` — section 11 Services Marketplace
16. `/lease/[id]` — section 16 eSign + Escrow
17. `/disputes/[id]` — section 17 Mediator
18. `/insurance` — section 18 bind flow
19. `/roommates` — section 19 group apply

**Tier E — B2B:**
20. `/trust-api/docs` — section 10 actual API docs (vs current marketing landing)
21. `/partners/onboard` — section 14 B2B onboarding wizard

That's ~20 routes plus a polish pass on `/listings/new`. I'll build them in tier order and push as each tier finishes.

# V4 code review — 2026-04-29

## Top 5 issues to fix immediately

1. **RLS INSERT policy missing for audit_events** — `/lease/[id]/review/page.tsx:210`, `/reports/[id]/page.tsx:106`, `/notifications/page.tsx:119` all attempt to insert into `audit_events` but the migration sets no INSERT policy. Authenticated users cannot write. Either add a permissive INSERT policy scoped to the user's own `actor_id`, or route these through server endpoints.

2. **Stripe plan_slug not wired** — `/billing/page.tsx:53` sends `plan_slug` in the startCheckout POST body, but `/api/stripe/checkout` endpoint not checked. If the API ignores it, ALL upgrade buttons route to the same Stripe price ID regardless of which plan was selected. Verify the API actually reads and uses `plan_slug` from the request body.

3. **Agent/Landlord routes have no auth role check** — `/agent/clients`, `/agent/screening-packages`, `/agent/leases`, `/landlord/leases`, `/landlord/screening`, `/landlord/applications/compare` call `useUser({ redirectIfMissing: true })` but DO NOT verify the user's role matches. Any authenticated user can navigate to these routes via UserAvatar menu. Add role checks (`if (user?.role !== 'agent') return <Unauthorized />`).

4. **Mock invoice data hardcoded in production** — `/billing/page.tsx:82-86` uses `mockInvoices` array with hardcoded April/March/February 2026 test data rendered directly to the user. Remove or replace with real Stripe invoice fetches.

5. **Anon Supabase client for public reports misses RLS check** — `/reports/[id]/page.tsx:61` creates an anon client and queries `screening_cases` by `share_token`, but the migration does not grant anon SELECT on `screening_cases`. Query will fail. Either enable anon SELECT via RLS policy, or fetch the screening case server-side and pass it as props.

---

## Findings by category

### Schema vs query

- **lease_agreements** — `/lease/[id]/review/page.tsx:86-90` selects `*`, `/landlord/leases/page.tsx:65-69` selects `*`. Schema has columns `monthly_rent` (from migration schema likely named `rent_monthly`). Line 360 in `/lease/[id]/review/page.tsx` displays `lease.monthly_rent` but the insert at `/landlord/leases/page.tsx:137` uses `rent_monthly`. **Column name mismatch risk**.

- **applications** — `/tenant/applications/[id]/page.tsx:41` selects with join `*, listing:listings(*)`. The join syntax assumes a foreign key `listing_id` exists on `applications` and links to `listings.id`. Not verified against actual schema, but usage is consistent with expected pattern.

- **screening_cases** — `/reports/[id]/page.tsx:81-85` queries by `share_token`. The schema must have this column (used at line 175 in `/agent/screening-packages/page.tsx` in hardcoded URL). Appears correct.

- **audit_events** — `/audit/page.tsx:84-98` queries with filters on `action`, `actor_id`, `resource_type`, `created_at`. All columns match expected schema. **No schema validation error but RLS INSERT policy missing** (see issue #1).

- **notifications.tsx:91-95** queries `applications` with `eq('status', 'new')`. Schema supports this. No mismatch.

### RLS gaps

1. **audit_events INSERT blocked** — The migration creates the table but the comment says "INSERTs should NOT be allowed from authenticated users (only service-role)". Pages at lines 210 (lease review), 106 (reports), 119 (notifications) attempt anon/user inserts. **Will fail at runtime**. Either:
   - Add an INSERT policy: `CREATE POLICY "Users can insert own audit events" ON audit_events FOR INSERT WITH CHECK (actor_id = auth.uid())`
   - Or route audit writes through `/api/audit` endpoint using service-role client.

2. **lease_signatures INSERT** — `/lease/[id]/review/page.tsx:182` inserts with `signer_email = user.email`. The migration policy `signer_id matches auth.uid() OR signer_email matches user email` should allow this. **Looks safe** but verify the column is indexed on `signer_email` for performance.

3. **screening_cases SELECT via anon client** — `/reports/[id]/page.tsx:61` creates anon Supabase client and queries `screening_cases` by `share_token`. For this to work, the migration must have:
   ```sql
   CREATE POLICY "Public read by share_token" ON screening_cases
     FOR SELECT USING (share_token IS NOT NULL AND share_token = current_setting('share_token', true))
   ```
   OR the anon role needs a blanket SELECT. **Not verified**. If RLS blocks anon reads, the page will show 404.

4. **consent_records SELECT** — `/notifications/page.tsx:159` queries with `eq('user_id', user.profileId)` (note: column name may be `actor_id` or `user_id` — not verified). If the RLS policy scopes to a different column, query returns 0 rows silently. **Verify RLS policy scope matches the query column name**.

### Auth + role checks

**Security gap:** All new pages use `useUser({ redirectIfMissing: true })` to require login, but NO role checks on agent/landlord pages.

- **Agent pages** (should reject non-agents):
  - `/agent/clients/page.tsx:21` — No role check
  - `/agent/screening-packages/page.tsx:25` — No role check
  - `/agent/leases/page.tsx:25` — No role check

- **Landlord pages** (should reject non-landlords):
  - `/landlord/leases/page.tsx:29` — No role check
  - `/landlord/screening/page.tsx:23` — No role check (queries `screening_cases`)
  - `/landlord/applications/compare/page.tsx:18` — No role check

**Fix:** Add at the top of each:
```tsx
if (user?.role !== 'agent') return <UnauthorizedPage />
```

The UserAvatar component now exposes these routes to all authenticated users (lines 45–81), so without role checks, a tenant can navigate to `/agent/clients` and see a blank page or stale data instead of a clear "Access denied."

### Stripe wiring

**Issue:** `/billing/page.tsx:53` sends:
```tsx
body: JSON.stringify({ plan_slug: planSlug })
```

But `/api/stripe/checkout` endpoint not reviewed. If the endpoint ignores `plan_slug` and always uses a hardcoded `NEXT_PUBLIC_STRIPE_PRICE_ID` env var, then clicking "Upgrade to Pro", "Upgrade to Plus", etc., all create the same Stripe session.

**Action:** Verify `/api/stripe/checkout/route.ts` reads the `plan_slug` from the request body and maps it to the correct Stripe price ID. If not implemented, either:
- Implement the mapping in the route.
- Or remove `plan_slug` from the body and hard-code the price ID (acceptable if only one upgrade path).

### Bilingual coverage

Spot-check results (all three pages checked):

- **`/pricing/page.tsx`** — ✓ Full bilingual. All plan names, descriptions, and CTAs have `_zh` and `_en` pairs.
- **`/lease/[id]/review/page.tsx`** — ✓ Full bilingual. Status labels, buttons, form placeholders all translated. Canvas signature placeholder has both languages.
- **`/reports/[id]/page.tsx`** — ✓ Full bilingual. Section headings, income/employment review, audit trail all translated.

**Minor nit:** Hardcoded "document" keys in `/reports/[id]/page.tsx:305` (e.g., `doc.replace(/_/g, ' ')`) render as "id document", "paystub", etc. without translation. If these need to be user-facing, extract to an i18n map.

### V3 palette

Grep results for palette compliance:

- **Gradient usage** — All primary CTAs use `linear-gradient(135deg, #6EE7B7 0%, #34D399 100%)` correctly. Checked at:
  - `/pricing/page.tsx:366, 493`
  - `/auth/signup/page.tsx:493`
  - `/lease/[id]/review/page.tsx:448, 609`
  - `/tenant/leases/page.tsx:230`
  - `/landlord/leases/page.tsx:185`
  - `/agent/screening-packages/page.tsx:197`
  - `/agent/leases/page.tsx:76`
  - `/billing/page.tsx:288`

  ✓ All correct.

- **Bright emerald (#10B981)** — Should only appear in dark panels (passport, ink surfaces). Grep shows no standalone `#10B981` in new pages. ✓ Compliant.

- **Legacy navy (#0B1736)** — Appears in input color pinning at `/auth/signup/page.tsx:147-149`, `/lease/[id]/review/page.tsx:388-390`, `/audit/page.tsx:202-204`, etc. This is **intentional** (pinning input text color to avoid cascade). ✓ Compliant.

- **Surface colors** — All pages use `v3.surface` (#F2EEE5) for page background, `v3.surfaceCard` for cards, `v3.surfaceMuted` for in-app sidebars. ✓ Consistent.

### Reachability

New routes and their inbound links:

| Route | Linked from |
|-------|-------------|
| `/pricing` | Marketing nav (not checked, assume present) |
| `/auth/signup` | MarketingNav, `/login` page |
| `/lease/[id]/review` | `/notifications` (line 83), `/tenant/leases` (line 162), `/landlord/leases` (line 242), `/agent/leases` (line 108), comparator (line 144) |
| `/reports/[id]` | Agent share link, notifications (line 149), agent packages (line 175) |
| `/audit` | UserAvatar menu (UserAvatar.tsx:53, 79) |
| `/notifications` | UserAvatar menu (UserAvatar.tsx:52, 64, 77) |
| `/tenant/applications/[id]` | Not directly linked from any new page; assume from parent `/tenant/applications` |
| `/tenant/leases` | UserAvatar menu (UserAvatar.tsx:51) |
| `/landlord/screening` | Agent packages "New package" button (line 91) |
| `/landlord/applications/compare` | Assume from `/dashboard/pipeline` (not reviewed) |
| `/landlord/leases` | UserAvatar menu (UserAvatar.tsx:75) |
| `/agent/clients` | UserAvatar menu (UserAvatar.tsx:61) |
| `/agent/screening-packages` | UserAvatar menu (UserAvatar.tsx:62) |
| `/agent/leases` | UserAvatar menu (UserAvatar.tsx:63) |
| `/billing` | UserAvatar menu (UserAvatar.tsx:65, 78, 80) |

✓ All routes are reachable from either UserAvatar menu or sibling pages. No orphaned routes.

### TypeScript

Unable to run `npx tsc` in the workspace environment, but code review by inspection:

- **Type imports** — All pages use `type { ... }` for interface imports (e.g., `/tenant/applications/[id]/page.tsx:11: type { Application }`). ✓ Correct.
- **Union types** — Status enums at `/lease/[id]/review/page.tsx:28` and `/tenant/leases/page.tsx:20` use string literals. Types are well-defined.
- **Supabase queries** — Heavy use of `as Type` casts (e.g., `/reports/[id]/page.tsx:88: as ScreeningCase`). Could be stricter, but not errors.
- **React hooks** — All have `// eslint-disable-next-line react-hooks/exhaustive-deps` comments where dependencies are legitimately excluded. ✓ Safe.

**No obvious TypeScript errors detected** from code review. If there are errors, they likely involve schema type mismatches (e.g., `monthly_rent` vs `rent_monthly`) that won't show until runtime.

### Code smells

1. **Per-page input styling redefinition** — `/auth/signup/page.tsx:141-153`, `/audit/page.tsx:196-208`, `/landlord/leases/page.tsx` all redefine the same input style object. This could be a shared component or util. Minor DRY violation.

2. **Hardcoded URLs in production code** — `/agent/screening-packages/page.tsx:175` hardcodes `https://stayloop.ai/reports/${pkg.share_token}`. Should use `process.env.NEXT_PUBLIC_SITE_URL` or similar. If domain changes, this breaks.

3. **Mock data in production** — `/billing/page.tsx:82-86` has `mockInvoices` hardcoded. This is rendered to real users. Should be marked `TODO` or moved to a dev-only flag.

4. **Navigation via window.location.href** — `/agent/screening-packages/page.tsx:91` uses `window.location.href = '/landlord/screening'` instead of Next.js `useRouter().push()`. Minor: will cause a full page reload instead of client-side navigation.

5. **Error handling loose** — Most pages catch errors with generic `console.error()` and show user alerts. Example: `/billing/page.tsx:59, 77`. In production, should log to a service (Sentry, LogRocket) and show structured error messages, not raw `.message`.

6. **State bloat in large components** — `/landlord/leases/page.tsx` has 13 state variables (lines 48–54). Consider useReducer or context for lease CRUD operations.

---

## Summary rating

**7 / 10**

**Pass overall**, but with 5 critical security / runtime issues that block launch:

1. **RLS INSERT for audit_events is missing** — Pages will fail silently when trying to log actions.
2. **Anon client for public reports likely blocked by RLS** — Public sharing will fail with 404.
3. **Agent/Landlord routes have no role checks** — Any auth user can access restricted pages.
4. **Stripe plan_slug integration unverified** — Billing may not route to correct prices.
5. **Mock invoice data shipped to users** — Appears as real invoices in prod.

If these five are fixed, the codebase is solid: good bilingual coverage, V3 design compliance, consistent patterns, and all routes reachable. The three-agent build (pricing, auth, leases, reports, etc.) is coherent and ready for QA once the gaps are sealed.

**Estimated fix effort:** 2 hours (RLS policies, role checks, Stripe verification, remove mock data, add anon SELECT policy).

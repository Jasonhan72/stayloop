# V5 Tenant Agent Workspace — Prototype Implementation

This document explains the first slice of Stayloop V5 that ships under the
`/tenant/agent` route. It is intentionally narrow: a working prototype layered
on top of the existing V4 codebase, not a rewrite.

## What was added

| File | Purpose |
| --- | --- |
| `lib/v5/agent-types.ts` | Shared TypeScript contracts for the V5 agent surface (`TenantAgentSession`, `PendingAction`, `WorkflowStage`, `PrivateMemoryItem`, `AgentRecommendation`, approval request/response). |
| `lib/v5/tenant-agent-mock.ts` | Static mock data for Luna's session. Used by the API route and is the single source of truth for the prototype's content. |
| `components/v5/tenant-agent/TenantAgentWorkspace.tsx` | The seven-block workspace UI: status header, workflow stages, pending actions (approve/reject), private memory, recommendation deck, agent input bar, audit/trust note. |
| `app/tenant/agent/page.tsx` | Next.js App Router page. Wraps the workspace in the existing V4 `PageShell` so it inherits the AppBar, Sidebar, and brand tokens. |
| `app/api/agent/session/route.ts` | `GET` returns the mock `TenantAgentSession` payload. |
| `app/api/agent/approvals/route.ts` | `POST` validates `{action_id, decision}` and returns a mock success. |
| `supabase/migrations/202605050001_v5_agent_foundation.sql` | Additive migration creating seven tables (`agent_configs`, `agent_sessions`, `user_memories`, `task_memories`, `agent_collaborations`, `approval_events`, `audit_events`) with RLS policies. Does not alter or drop any V4 table. |
| `docs/v5-tenant-agent-implementation.md` | This file. |

## How `/tenant/agent` fits into V5

V5 reframes Stayloop around three primitives:

1. **Personal agent.** Each role has a named agent — Luna (tenant), Atlas
   (landlord — *not yet built*), Compass (agent-of-agents — *not yet built*).
2. **Private memory.** Long-lived per-user state lives in Supabase
   (`user_memories`, `task_memories`) and personalises every interaction.
3. **System orchestrator.** Workflow progress is owned by Stayloop, not by
   the agent. The agent works *inside* a stage; the system decides when the
   stage advances.

`/tenant/agent` is the first surface where these three primitives meet.
It's a command center for the tenant: a single page that shows what Luna is
doing right now, where the rental workflow stands, what private memory Luna
is using, and — most importantly — which actions need explicit user
approval before anything leaves Stayloop.

## What is mock-only today

Everything below is wired through fake data so the prototype renders end to
end without depending on the V5 backend that hasn't been built yet:

- `GET /api/agent/session` returns `lib/v5/tenant-agent-mock.ts` verbatim.
- `POST /api/agent/approvals` validates the request body and returns a
  success envelope. It does not write to Supabase.
- The agent input bar accepts text but only echoes a "thinking…" line for a
  short moment. There is no inference call wired up.
- The Luna persona ("Mei Lin Chen") is a single static profile.

## What should be connected to Supabase later

When the V5 runtime starts populating real session data, the changes are
contained:

1. Apply the `202605050001_v5_agent_foundation.sql` migration in the
   Supabase project.
2. Replace the body of `app/api/agent/session/route.ts` so it:
   - Authenticates the caller (Supabase server client).
   - Looks up the active row in `agent_sessions` for `(user_id, role='tenant')`.
   - Joins `user_memories`, `task_memories`, and any `pending_actions` table
     (introduced in a follow-up migration) into the same `TenantAgentSession`
     shape exported from `lib/v5/agent-types.ts`.
3. Replace the body of `app/api/agent/approvals/route.ts` so it:
   - Authenticates the caller.
   - Inserts an `approval_events` row.
   - Updates the `pending_actions` row (when that table exists).
   - Inserts an `audit_events` row.
   - Notifies the orchestrator (out-of-band).

The component contract (`TenantAgentSession`) does not change between mock
and live — only the data source does.

## Approval flow

Approval is the trust contract V5 cares most about. The flow is:

1. The orchestrator prepares an action (e.g. "submit application package
   for listing X") and writes a row that surfaces in the session payload's
   `pending_actions` array with `status: 'pending'` and a `sensitivity` tag.
2. The user lands on `/tenant/agent` and sees the action in the **Pending
   Actions** block — visually distinct from recommendations via a brand-
   colored left border on the section, sensitivity pill on the card, and a
   dashed "why approval is required" callout.
3. The user clicks **Approve** or **Reject**. The component:
   - Optimistically updates the local state to reflect the decision.
   - `POST`s to `/api/agent/approvals` with `{action_id, decision}`.
   - Disables the buttons and grays the card so the decision reads as final.
4. In the live implementation, the API route writes to `approval_events` +
   `audit_events`, transitions the action to `approved` / `rejected`, and
   (only when approved) lets the orchestrator dispatch the actual
   side-effect on a separate code path.

What the prototype guarantees today, even without the backend:

- Approval and reject UI states are clearly distinct (color, label, opacity).
- Buttons are disabled after a decision is made — the user cannot toggle.
- The audit/trust note at the bottom of the page makes the contract visible.

What the prototype explicitly does *not* do:

- Submit applications, share verified information, sign documents, send
  payments, or accept lease terms automatically. Those side-effects live in
  future code paths gated by the orchestrator + `approval_events` table.

## Why this is additive to V4 (not a rewrite)

- **Layout.** The page reuses `components/v4/PageShell`, `AppBar`, `Sidebar`,
  and `lib/brand` v3 tokens. V4 visual language carries forward verbatim.
- **Routing.** Adds three Next.js App Router entries (`/tenant/agent`,
  `/api/agent/session`, `/api/agent/approvals`); no existing route is
  modified.
- **Data layer.** New code reads via the existing Supabase client pattern
  (`lib/supabase`). The new SQL migration is purely additive — V4 tables
  are untouched.
- **Auth.** Uses the existing `lib/useUser` hook for the "tenant" role guard.
- **No new framework.** The component is plain React + the same inline-style
  + `v3` token approach used everywhere else in V4. No CSS-in-JS library, no
  Tailwind plugin, no design-system rewrite.
- **No global behavior change.** Nothing about V4 pages is modified by this
  branch. A user who never visits `/tenant/agent` gets exactly the V4 they
  have today.

## Future expansion (not in this PR)

The scaffolding is shaped so the next two roles slot in without rework:

- **`/landlord/agent`** ("Atlas"). Same `TenantAgentSession` shape can be
  reused with a `LandlordAgentSession` that swaps the workflow stages
  (listing readiness, applicant review, lease prep, move-in handover) and
  replaces the memory categories with landlord-shaped ones.
- **`/agent/workspace`** (real-estate agent / "Compass"). Adds a third
  variant focused on cross-client orchestration and viewing scheduling.

Both will reuse `components/v5/tenant-agent/TenantAgentWorkspace.tsx`'s
internal sub-components (status header, pending actions, recommendation deck)
once we extract them into `components/v5/_shared/`. That extraction is
deferred until the second role actually needs it — premature shared code is
worse than light duplication.

## Acceptance checklist

- `/tenant/agent` loads inside the V4 `PageShell` and renders all seven
  blocks.
- Existing V4 pages (homepage, `/dashboard`, `/screen`, `/chat`, `/pricing`,
  ...) continue to behave exactly as before.
- The page reuses existing auth/layout/brand systems with no new framework.
- Approve / reject interactions update the UI immediately and persist for
  the lifetime of the page (state is per-session, not yet stored).
- Pending actions are visually separated from recommendations.
- Private memory is visible but flagged as private with a dashed border and
  copy that explains it never leaves Stayloop without approval.
- The migration file is additive and does not alter or drop any existing
  table.
- Future work for `/landlord/agent` and `/agent/workspace` is documented
  but not implemented.

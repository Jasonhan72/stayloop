-- Showing intents become a real inbox item (2026-09-22, EliseAI benchmark
-- item G): the tenant's "book a viewing" / "ask the landlord" from a listing
-- page is written here by /api/showing-intent and mirrored as a pending
-- action on the landlord's agent. `kind` tells the two apart.
alter table public.showing_intents
  add column if not exists kind text not null default 'showing'
  check (kind in ('showing','question'));

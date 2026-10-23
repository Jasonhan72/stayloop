-- V0.8 第二项 · 第 3 / 4 步 (2026-10-22): one record per (listing, outside channel).
--
--   mls     the landlord asks a Stayloop-verified agent to list the unit on MLS®
--           (design/landlord-first-publishing-and-syndication-2026-10.md §三). The
--           agent lists it in their own brokerage system and writes back ONLY the
--           MLS® number and the public link — no MLS data ever flows into Stayloop
--           (PropTx 2026-10-13). Stayloop does not dispatch, charges nothing and
--           takes no part in the trade (2026-09-13).
--   other channels (facebook_page / instagram / kijiji / rentsync / wechat /
--           xiaohongshu / facebook_group) are reserved for the automatic lines of
--           §二 — nothing writes them yet; the manual line (copy + photo pack) keeps
--           no record.
--
-- Every write goes through POST /api/listings/mls-handoff with the service role
-- (ownership, agent registration and state transitions are checked there), so the
-- API roles get SELECT only: the landlord sees their listing's rows, the agent sees
-- the rows naming them, admins see all. The public listing page learns of a
-- `posted` MLS row through /api/listings/[slug] (service role), never a grant.

create table if not exists public.listing_syndications (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings(id) on delete cascade,
  channel        text not null check (channel in ('mls','facebook_page','instagram','kijiji','rentsync','wechat','xiaohongshu','facebook_group')),
  status         text not null default 'requested' check (status in ('requested','posted','declined','removed','failed')),
  -- MLS® number (letters / digits / dash) or the channel's own post id.
  external_id    text check (external_id is null or external_id ~ '^[A-Za-z0-9-]{3,40}$'),
  external_url   text check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 500)),
  agent_auth_id  uuid references auth.users(id) on delete set null,
  client_id      uuid references public.agent_clients(id) on delete set null,
  thread_id      uuid references public.threads(id) on delete set null,
  requested_by   uuid references auth.users(id) on delete set null,
  note           text check (note is null or char_length(note) <= 500),
  error          text check (error is null or char_length(error) <= 500),
  posted_at      timestamptz,
  removed_at     timestamptz,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- One live record per (listing, channel): a declined / removed one may be followed by a new request.
create unique index if not exists listing_syndications_live_uniq
  on public.listing_syndications (listing_id, channel) where status in ('requested','posted');
create index if not exists listing_syndications_agent_idx on public.listing_syndications (agent_auth_id, updated_at desc);
create index if not exists listing_syndications_listing_idx on public.listing_syndications (listing_id);

drop trigger if exists trg_listing_syndications_touch on public.listing_syndications;
create trigger trg_listing_syndications_touch
  before update on public.listing_syndications
  for each row execute function public.touch_updated_at();

alter table public.listing_syndications enable row level security;
drop policy if exists listing_syndications_read on public.listing_syndications;
create policy listing_syndications_read on public.listing_syndications
  for select to authenticated using (
    agent_auth_id = auth.uid()
    or requested_by = auth.uid()
    or exists (
      select 1 from public.listings l
       where l.id = listing_syndications.listing_id
         and (l.landlord_id = auth.uid()
              or l.landlord_id in (select ld.id from public.landlords ld where ld.auth_id = auth.uid()))
    )
    or public.is_stayloop_admin()
  );
revoke all on public.listing_syndications from public, anon, authenticated, service_role;
grant select on public.listing_syndications to authenticated;
grant all on public.listing_syndications to service_role;

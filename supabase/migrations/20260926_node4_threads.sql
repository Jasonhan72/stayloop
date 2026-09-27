-- 节点 4 · 连贯 (2026-09-26): one message thread per matter.
--
--   threads          — kind ∈ work_order | application | tenancy | dispute, one per ref_id.
--   thread_messages  — APPEND-ONLY. No update / delete grant, no policy, and a
--                      trigger that refuses UPDATE for every role; retraction =
--                      a new row (kind 'retraction') pointing at the original,
--                      which stays in the record. Server time only: the insert
--                      trigger overwrites created_at for direct client writes.
--                      sender_kind = the party the sender is in THIS thread
--                      (thread_party), acting_role = the hat they wore.
--   message_reads    — one high-water mark per (thread, user): delivered / opened /
--                      acknowledged (送达 · 打开 · 确认). Own row only.
--   thread_attachments — registry written by /api/threads/upload (service role):
--                      the server computes SHA-256 and stores the file under
--                      tenancy-files/<household>/threads/<thread>/; the message
--                      insert trigger checks each attachment path exists here and
--                      copies the registered hash (a client cannot forge one).
--
-- Migration: every household_messages row becomes a message on that
-- household's tenancy thread (legacy id kept in meta). The old table stays
-- read-only for a release, then goes.

create table if not exists public.threads (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('work_order', 'application', 'tenancy', 'dispute')),
  ref_id       uuid not null,
  household_id uuid references public.households(id) on delete cascade,
  title        text check (title is null or char_length(title) <= 200),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz,
  unique (kind, ref_id)
);
create index if not exists threads_household_idx on public.threads (household_id) where household_id is not null;

create table if not exists public.thread_messages (
  id             bigserial primary key,
  thread_id      uuid not null references public.threads(id) on delete cascade,
  sender_id      uuid,
  sender_kind    text not null check (sender_kind in ('tenant', 'landlord', 'provider', 'external', 'agent', 'system', 'admin')),
  acting_role    text check (acting_role is null or acting_role in ('tenant', 'landlord', 'agent', 'provider', 'admin')),
  sender_label   text check (sender_label is null or char_length(sender_label) <= 120),
  kind           text not null default 'message' check (kind in ('message', 'system', 'formal_copy', 'retraction')),
  body           text not null check (char_length(body) between 1 and 4000),
  ref_message_id bigint references public.thread_messages(id) on delete restrict,
  attachments    jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  meta           jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  created_at     timestamptz not null default now()
);
create index if not exists thread_messages_thread_idx on public.thread_messages (thread_id, id);
create index if not exists thread_messages_ref_idx on public.thread_messages (ref_message_id) where ref_message_id is not null;

create table if not exists public.message_reads (
  thread_id            uuid not null references public.threads(id) on delete cascade,
  user_id              uuid not null,
  last_delivered_id    bigint not null default 0,
  last_opened_id       bigint not null default 0,
  last_acknowledged_id bigint not null default 0,
  updated_at           timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.thread_attachments (
  path        text primary key check (char_length(path) <= 400),
  thread_id   uuid not null references public.threads(id) on delete cascade,
  uploaded_by uuid,
  name        text not null check (char_length(name) <= 200),
  mime        text check (mime is null or char_length(mime) <= 100),
  size        bigint not null check (size between 0 and 26214400),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now()
);
create index if not exists thread_attachments_thread_idx on public.thread_attachments (thread_id);

-- ── Who is a party (definer: reads work_orders / applications / households the caller may not) ──
create or replace function public.thread_party(p_thread uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  t record;
  r text;
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then return null; end if;
  select * into t from public.threads where id = p_thread;
  if not found then return null; end if;
  if public.is_stayloop_admin() then return 'admin'; end if;
  if t.kind = 'tenancy' then
    select case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end into r
      from public.household_members m where m.household_id = t.ref_id and m.user_id = uid and m.status = 'active' limit 1;
    return r;
  elsif t.kind in ('work_order', 'dispute') then
    if exists (select 1 from public.work_orders w where w.id = t.ref_id and w.landlord_auth_id = uid) then return 'landlord'; end if;
    if exists (select 1 from public.work_orders w join public.service_providers p on p.id = w.provider_id where w.id = t.ref_id and p.auth_id = uid) then return 'provider'; end if;
    select case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end into r
      from public.work_orders w join public.household_members m on m.household_id = w.household_id and m.user_id = uid and m.status = 'active'
     where w.id = t.ref_id limit 1;
    return r;
  elsif t.kind = 'application' then
    if exists (
      select 1 from public.applications a join public.listings l on l.id = a.listing_id
       where a.id = t.ref_id and (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid))
    ) then return 'landlord'; end if;
    if em <> '' and exists (select 1 from public.applications a where a.id = t.ref_id and lower(a.email) = em) then return 'tenant'; end if;
    return null;
  end if;
  return null;
end $$;
revoke execute on function public.thread_party(uuid) from public, anon;
grant execute on function public.thread_party(uuid) to authenticated, service_role;

-- ── Open (get or create) the thread of a matter; only a party may ──
create or replace function public.open_thread(p_kind text, p_ref uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
  created boolean := false;
  hh uuid;
  ttl text;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if p_kind not in ('work_order', 'application', 'tenancy', 'dispute') then raise exception 'bad_kind'; end if;
  select id into tid from public.threads where kind = p_kind and ref_id = p_ref;
  if tid is null then
    if p_kind = 'tenancy' then
      select h.id, h.address || coalesce(' #' || h.unit, '') into hh, ttl from public.households h where h.id = p_ref;
    elsif p_kind in ('work_order', 'dispute') then
      select w.household_id, t.title into hh, ttl from public.work_orders w join public.maintenance_tickets t on t.id = w.ticket_id where w.id = p_ref;
    else
      select null::uuid, l.address || coalesce(' #' || l.unit, '') into hh, ttl from public.applications a join public.listings l on l.id = a.listing_id where a.id = p_ref;
    end if;
    if ttl is null and p_kind <> 'application' then raise exception 'not_found'; end if;
    insert into public.threads (kind, ref_id, household_id, title, created_by) values (p_kind, p_ref, hh, left(ttl, 200), auth.uid())
    on conflict (kind, ref_id) do update set kind = excluded.kind
    returning id into tid;
    created := true;
  end if;
  if public.thread_party(tid) is null then
    if created then delete from public.threads where id = tid; end if;
    raise exception 'not_a_party';
  end if;
  return tid;
end $$;
revoke execute on function public.open_thread(text, uuid) from public, anon;
grant execute on function public.open_thread(text, uuid) to authenticated, service_role;

-- ── Migrate household_messages → tenancy threads (before the guard triggers exist) ──
insert into public.threads (kind, ref_id, household_id, title, created_by, created_at)
select 'tenancy', h.id, h.id, left(h.address || coalesce(' #' || h.unit, ''), 200), h.created_by, h.created_at
  from public.households h
 where exists (select 1 from public.household_messages m where m.household_id = h.id)
on conflict (kind, ref_id) do nothing;

insert into public.thread_messages (thread_id, sender_id, sender_kind, acting_role, kind, body, meta, created_at)
select t.id, m.sender_id,
       coalesce((select case when hm.role in ('landlord', 'property_manager') then 'landlord' when hm.role = 'agent' then 'agent' else 'tenant' end
                   from public.household_members hm where hm.household_id = m.household_id and hm.user_id = m.sender_id limit 1), 'tenant'),
       null, 'message', m.body, jsonb_build_object('migrated_from', 'household_messages', 'legacy_id', m.id), m.created_at
  from public.household_messages m
  join public.threads t on t.kind = 'tenancy' and t.ref_id = m.household_id
 where not exists (select 1 from public.thread_messages x where x.meta ->> 'legacy_id' = m.id::text)
 order by m.id;

-- ── Guards ──
-- Insert: server time, the sender is the caller, the party is the truth, only
-- message / retraction from clients, retractions only of your own message and
-- only once, attachments only from the registry (hash copied from it).
create or replace function public.thread_messages_before_insert()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  party text;
  a jsonb;
  reg record;
  fixed jsonb := '[]'::jsonb;
begin
  if not public.is_direct_client_write() then return new; end if;
  new.created_at := now();
  new.sender_id := auth.uid();
  party := public.thread_party(new.thread_id);
  if party is null then raise exception 'not_a_party'; end if;
  new.sender_kind := party;
  new.meta := '{}'::jsonb;
  if new.kind not in ('message', 'retraction') then raise exception 'kind_not_allowed'; end if;
  if new.acting_role is not null and new.acting_role not in ('tenant', 'landlord', 'agent', 'provider', 'admin') then new.acting_role := null; end if;
  if new.kind = 'retraction' then
    if new.ref_message_id is null then raise exception 'retraction_needs_ref'; end if;
    if not exists (select 1 from public.thread_messages m where m.id = new.ref_message_id and m.thread_id = new.thread_id and m.sender_id = auth.uid() and m.kind = 'message') then raise exception 'retraction_not_yours'; end if;
    if exists (select 1 from public.thread_messages m where m.kind = 'retraction' and m.ref_message_id = new.ref_message_id) then raise exception 'already_retracted'; end if;
    new.attachments := '[]'::jsonb;
  else
    new.ref_message_id := null;
  end if;
  if jsonb_array_length(new.attachments) > 6 then raise exception 'too_many_attachments'; end if;
  for a in select * from jsonb_array_elements(new.attachments) loop
    select * into reg from public.thread_attachments r where r.path = a ->> 'path' and r.thread_id = new.thread_id;
    if not found then raise exception 'attachment_not_registered'; end if;
    fixed := fixed || jsonb_build_object('path', reg.path, 'name', reg.name, 'mime', reg.mime, 'size', reg.size, 'sha256', reg.sha256);
  end loop;
  new.attachments := fixed;
  return new;
end $$;
revoke execute on function public.thread_messages_before_insert() from public, anon, authenticated, service_role;
drop trigger if exists trg_thread_messages_before_insert on public.thread_messages;
create trigger trg_thread_messages_before_insert before insert on public.thread_messages
  for each row execute function public.thread_messages_before_insert();

-- Append-only: nobody edits history (the service role included); clients never delete.
create or replace function public.thread_messages_append_only()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'UPDATE' then raise exception 'append_only'; end if;
  if public.is_direct_client_write() then raise exception 'append_only'; end if;
  return old;
end $$;
revoke execute on function public.thread_messages_append_only() from public, anon, authenticated, service_role;
drop trigger if exists trg_thread_messages_append_only on public.thread_messages;
create trigger trg_thread_messages_append_only before update or delete on public.thread_messages
  for each row execute function public.thread_messages_append_only();

-- Read marks only move forward and only for the caller.
create or replace function public.message_reads_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_direct_client_write() then
    new.user_id := auth.uid();
    if tg_op = 'UPDATE' then
      new.thread_id := old.thread_id;
      new.last_delivered_id := greatest(new.last_delivered_id, old.last_delivered_id);
      new.last_opened_id := greatest(new.last_opened_id, old.last_opened_id);
      new.last_acknowledged_id := greatest(new.last_acknowledged_id, old.last_acknowledged_id);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.message_reads_guard() from public, anon, authenticated, service_role;
drop trigger if exists trg_message_reads_guard on public.message_reads;
create trigger trg_message_reads_guard before insert or update on public.message_reads
  for each row execute function public.message_reads_guard();

-- ── RLS ──
alter table public.threads enable row level security;
alter table public.thread_messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.thread_attachments enable row level security;

drop policy if exists threads_party_read on public.threads;
create policy threads_party_read on public.threads for select to authenticated using (public.thread_party(id) is not null);
drop policy if exists thread_messages_party_read on public.thread_messages;
create policy thread_messages_party_read on public.thread_messages for select to authenticated using (public.thread_party(thread_id) is not null);
drop policy if exists thread_messages_party_insert on public.thread_messages;
create policy thread_messages_party_insert on public.thread_messages for insert to authenticated
  with check (sender_id = auth.uid() and kind in ('message', 'retraction') and public.thread_party(thread_id) is not null);
drop policy if exists message_reads_party_read on public.message_reads;
create policy message_reads_party_read on public.message_reads for select to authenticated using (public.thread_party(thread_id) is not null);
drop policy if exists message_reads_own_insert on public.message_reads;
create policy message_reads_own_insert on public.message_reads for insert to authenticated with check (user_id = auth.uid() and public.thread_party(thread_id) is not null);
drop policy if exists message_reads_own_update on public.message_reads;
create policy message_reads_own_update on public.message_reads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists thread_attachments_party_read on public.thread_attachments;
create policy thread_attachments_party_read on public.thread_attachments for select to authenticated using (public.thread_party(thread_id) is not null);

-- ── Grants (the project's default privileges hand ALL to the API roles) ──
revoke all on public.threads, public.thread_messages, public.message_reads, public.thread_attachments from anon, authenticated, service_role;
revoke all on sequence public.thread_messages_id_seq from anon, authenticated, service_role;
grant select on public.threads to authenticated;
grant select, insert on public.thread_messages to authenticated;           -- no update / delete: append-only
grant select, insert, update on public.message_reads to authenticated;
grant select on public.thread_attachments to authenticated;
grant all on public.threads, public.thread_messages, public.message_reads, public.thread_attachments to service_role;
grant usage on sequence public.thread_messages_id_seq to authenticated, service_role;

-- The bucket read policy keys on the household folder; the provider (not a
-- member) reaches attachments only through /api/threads/attachment-url, which
-- checks thread_party and writes the access audit. Nothing to add here.

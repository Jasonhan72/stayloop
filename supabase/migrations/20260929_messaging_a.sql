-- 消息系统 A 期 (2026-09-29 · design/messaging-redesign-2026-09.html)
--
-- On top of 节点 4 (threads / append-only thread_messages / read marks):
--   1. Three new conversation kinds
--        listing_inquiry — prospect ↔ listing landlord. ref_id = uuid_v5(listing, prospect),
--                          so one thread per (listing, prospect); listing_id + subject_user stored.
--        agent_client    — agent ↔ a client in their client book (ref = agent_clients.id).
--        support         — any member ↔ Stayloop (ref = the member's auth id).
--      thread_party is refactored into party_for(kind, ref, listing, subject) so a
--      party can be checked before a thread exists (new-message step 2).
--   2. Evidence: messages carry channel + a hash chain (hash = sha256 of the
--      previous hash and this row's canonical content, computed here, serialised
--      per thread with an advisory lock). Deleting a message is refused for every
--      role, the service role included; threads cannot be deleted while they
--      hold messages (FK restrict); TRUNCATE is refused. The database owner can
--      still drop a trigger — the chain is what makes that detectable.
--   3. Channels: reply tokens (one per thread × recipient address, the Reply-To of
--      every email we send about the thread), per-channel delivery receipts, and
--      the raw-inbound registry (raw MIME kept in the private bucket thread-inbound).
--   4. Realtime: thread_messages + message_reads join supabase_realtime (RLS applies).
--   5. my_threads() / my_message_targets() for the message centre.

-- ── 1. schema ─────────────────────────────────────────────────────────────
alter table public.threads drop constraint if exists threads_kind_check;
alter table public.threads add constraint threads_kind_check
  check (kind in ('work_order', 'application', 'tenancy', 'dispute', 'listing_inquiry', 'agent_client', 'support'));
alter table public.threads add column if not exists listing_id uuid;
alter table public.threads add column if not exists subject_user uuid;
create index if not exists threads_subject_idx on public.threads (subject_user) where subject_user is not null;
create index if not exists threads_listing_idx on public.threads (listing_id) where listing_id is not null;

-- Deleting a household must not take the record with it.
alter table public.threads drop constraint if exists threads_household_id_fkey;
alter table public.threads add constraint threads_household_id_fkey
  foreign key (household_id) references public.households(id) on delete set null;
alter table public.thread_messages drop constraint if exists thread_messages_thread_id_fkey;
alter table public.thread_messages add constraint thread_messages_thread_id_fkey
  foreign key (thread_id) references public.threads(id) on delete restrict;

alter table public.thread_messages drop constraint if exists thread_messages_sender_kind_check;
alter table public.thread_messages add constraint thread_messages_sender_kind_check
  check (sender_kind in ('tenant', 'landlord', 'provider', 'external', 'agent', 'system', 'admin', 'member'));
alter table public.thread_messages add column if not exists channel text not null default 'app';
alter table public.thread_messages drop constraint if exists thread_messages_channel_check;
alter table public.thread_messages add constraint thread_messages_channel_check check (channel in ('app', 'email', 'sms', 'system'));
alter table public.thread_messages add column if not exists prev_hash text;
alter table public.thread_messages add column if not exists hash text;

-- ── 2. who is a party ─────────────────────────────────────────────────────
create or replace function public.party_for(p_kind text, p_ref uuid, p_listing uuid default null, p_subject uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  r text;
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then return null; end if;
  if public.is_stayloop_admin() then return 'admin'; end if;
  if p_kind = 'tenancy' then
    select case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end into r
      from public.household_members m where m.household_id = p_ref and m.user_id = uid and m.status = 'active' limit 1;
    return r;
  elsif p_kind in ('work_order', 'dispute') then
    if exists (select 1 from public.work_orders w where w.id = p_ref and w.landlord_auth_id = uid) then return 'landlord'; end if;
    if exists (select 1 from public.work_orders w join public.service_providers p on p.id = w.provider_id where w.id = p_ref and p.auth_id = uid) then return 'provider'; end if;
    select case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end into r
      from public.work_orders w join public.household_members m on m.household_id = w.household_id and m.user_id = uid and m.status = 'active'
     where w.id = p_ref limit 1;
    return r;
  elsif p_kind = 'application' then
    if exists (
      select 1 from public.applications a join public.listings l on l.id = a.listing_id
       where a.id = p_ref and (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid))
    ) then return 'landlord'; end if;
    if em <> '' and exists (select 1 from public.applications a where a.id = p_ref and lower(a.email) = em) then return 'tenant'; end if;
    return null;
  elsif p_kind = 'listing_inquiry' then
    if p_subject = uid then return 'tenant'; end if;
    if p_listing is not null and exists (
      select 1 from public.listings l where l.id = p_listing and (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid))
    ) then return 'landlord'; end if;
    return null;
  elsif p_kind = 'agent_client' then
    if exists (select 1 from public.agent_clients c where c.id = p_ref and c.agent_auth_id = uid) then return 'agent'; end if;
    select c.client_role into r from public.agent_clients c
     where c.id = p_ref and ((em <> '' and lower(c.email) = em)
        or exists (select 1 from public.delegations d where d.client_id = c.id and d.principal_auth_id = uid and d.status = 'active'))
     limit 1;
    return r;
  elsif p_kind = 'support' then
    if p_ref = uid then return 'member'; end if;
    return null;
  end if;
  return null;
end $$;
revoke execute on function public.party_for(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.party_for(text, uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.thread_party(p_thread uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t record;
begin
  if auth.uid() is null then return null; end if;
  select kind, ref_id, listing_id, subject_user into t from public.threads where id = p_thread;
  if not found then return null; end if;
  return public.party_for(t.kind, t.ref_id, t.listing_id, t.subject_user);
end $$;
revoke execute on function public.thread_party(uuid) from public, anon;
grant execute on function public.thread_party(uuid) to authenticated, service_role;

-- Open (get or create) a thread; only a party may. listing_inquiry threads are
-- opened by the server (/api/showing-intent) — the prospect is the subject.
create or replace function public.open_thread(p_kind text, p_ref uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
  hh uuid;
  ttl text;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if p_kind not in ('work_order', 'application', 'tenancy', 'dispute', 'agent_client', 'support') then raise exception 'bad_kind'; end if;
  select id into tid from public.threads where kind = p_kind and ref_id = p_ref;
  if tid is not null then
    if public.thread_party(tid) is null then raise exception 'not_a_party'; end if;
    return tid;
  end if;
  if public.party_for(p_kind, p_ref, null, case when p_kind = 'support' then p_ref end) is null then raise exception 'not_a_party'; end if;
  if p_kind = 'tenancy' then
    select h.id, h.address || coalesce(' #' || h.unit, '') into hh, ttl from public.households h where h.id = p_ref;
  elsif p_kind in ('work_order', 'dispute') then
    select w.household_id, t.title into hh, ttl from public.work_orders w join public.maintenance_tickets t on t.id = w.ticket_id where w.id = p_ref;
  elsif p_kind = 'application' then
    select null::uuid, l.address || coalesce(' #' || l.unit, '') into hh, ttl from public.applications a join public.listings l on l.id = a.listing_id where a.id = p_ref;
    ttl := coalesce(ttl, 'Application');
  elsif p_kind = 'agent_client' then
    select null::uuid, c.name into hh, ttl from public.agent_clients c where c.id = p_ref;
  else
    hh := null; ttl := 'Stayloop';
  end if;
  if ttl is null then raise exception 'not_found'; end if;
  insert into public.threads (kind, ref_id, household_id, title, created_by, subject_user)
  values (p_kind, p_ref, hh, left(ttl, 200), auth.uid(), case when p_kind = 'support' then p_ref end)
  on conflict (kind, ref_id) do update set kind = excluded.kind
  returning id into tid;
  return tid;
end $$;
revoke execute on function public.open_thread(text, uuid) from public, anon;
grant execute on function public.open_thread(text, uuid) to authenticated, service_role;

-- ── 3. insert guard (client writes) + hash chain (every write) ────────────
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
  new.channel := 'app';
  party := public.thread_party(new.thread_id);
  if party is null then raise exception 'not_a_party'; end if;
  new.sender_kind := party;
  new.meta := '{}'::jsonb;
  new.sender_label := null;
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

-- The canonical content of a message (v1). lib/threads/hashChain.ts reproduces
-- this byte for byte so anyone can recompute the chain from an export.
create or replace function public.thread_message_canonical(m public.thread_messages, p_prev text)
returns text language sql immutable set search_path = public as $$
  select concat_ws(E'\n',
    'stayloop-thread-v1',
    p_prev,
    m.id::text,
    m.thread_id::text,
    to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(m.sender_id::text, ''),
    m.sender_kind,
    coalesce(m.acting_role, ''),
    m.kind,
    m.channel,
    coalesce(m.ref_message_id::text, ''),
    coalesce((select string_agg((a ->> 'path') || ':' || (a ->> 'sha256'), ',' order by ord)
                from jsonb_array_elements(m.attachments) with ordinality as x(a, ord)), ''),
    m.body)
$$;
revoke execute on function public.thread_message_canonical(public.thread_messages, text) from public, anon;
grant execute on function public.thread_message_canonical(public.thread_messages, text) to authenticated, service_role;

create or replace function public.thread_messages_chain()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare prev text;
begin
  -- One writer per thread at a time, so "previous" is well defined.
  perform pg_advisory_xact_lock(hashtextextended(new.thread_id::text, 42));
  select m.hash into prev from public.thread_messages m where m.thread_id = new.thread_id order by m.id desc limit 1;
  new.prev_hash := coalesce(prev, 'genesis');
  if new.channel is null then new.channel := 'app'; end if;
  new.hash := encode(extensions.digest(convert_to(public.thread_message_canonical(new, new.prev_hash), 'UTF8'), 'sha256'), 'hex');
  return new;
end $$;
revoke execute on function public.thread_messages_chain() from public, anon, authenticated, service_role;
drop trigger if exists trg_thread_messages_zz_chain on public.thread_messages;
create trigger trg_thread_messages_zz_chain before insert on public.thread_messages
  for each row execute function public.thread_messages_chain();

-- Backfill the chain for existing rows (history is immutable; this is the one
-- time the chain columns are written after the fact, inside this migration).
alter table public.thread_messages disable trigger trg_thread_messages_append_only;
do $$
declare
  r public.thread_messages;
  prev text;
  cur uuid := null;
begin
  for r in select * from public.thread_messages order by thread_id, id loop
    if cur is distinct from r.thread_id then prev := 'genesis'; cur := r.thread_id; end if;
    update public.thread_messages
       set prev_hash = prev,
           hash = encode(extensions.digest(convert_to(public.thread_message_canonical(r, prev), 'UTF8'), 'sha256'), 'hex')
     where id = r.id
     returning hash into prev;
  end loop;
end $$;
alter table public.thread_messages enable trigger trg_thread_messages_append_only;

-- Nobody deletes or edits a message — the service role included.
create or replace function public.thread_messages_append_only()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  raise exception 'append_only';
end $$;
revoke execute on function public.thread_messages_append_only() from public, anon, authenticated, service_role;
drop trigger if exists trg_thread_messages_no_truncate on public.thread_messages;
create trigger trg_thread_messages_no_truncate before truncate on public.thread_messages
  for each statement execute function public.thread_messages_append_only();

-- ── 4. channels: reply tokens, receipts, raw inbound ──────────────────────
create table if not exists public.thread_reply_tokens (
  token       text primary key check (token ~ '^[a-z0-9]{20,40}$'),
  thread_id   uuid not null references public.threads(id) on delete restrict,
  email       text not null check (char_length(email) <= 320),
  user_id     uuid,
  party_kind  text not null check (party_kind in ('tenant', 'landlord', 'provider', 'external', 'agent', 'admin', 'member')),
  label       text check (label is null or char_length(label) <= 120),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (thread_id, email)
);

create table if not exists public.message_deliveries (
  id                  bigserial primary key,
  message_id          bigint references public.thread_messages(id) on delete restrict,
  thread_id           uuid not null references public.threads(id) on delete restrict,
  channel             text not null check (channel in ('email', 'push', 'sms')),
  recipient_user_id   uuid,
  recipient_address   text check (recipient_address is null or char_length(recipient_address) <= 320),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  status              text not null check (status in ('sent', 'delivered', 'opened', 'bounced', 'failed', 'skipped')),
  detail              text check (detail is null or char_length(detail) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists message_deliveries_msg_idx on public.message_deliveries (message_id);
create index if not exists message_deliveries_thread_idx on public.message_deliveries (thread_id, id);

create table if not exists public.thread_inbound (
  id           bigserial primary key,
  channel      text not null check (channel in ('email', 'sms')),
  thread_id    uuid references public.threads(id) on delete restrict,
  message_id   bigint references public.thread_messages(id) on delete restrict,
  from_addr    text check (from_addr is null or char_length(from_addr) <= 320),
  to_addr      text check (to_addr is null or char_length(to_addr) <= 320),
  raw_path     text check (raw_path is null or char_length(raw_path) <= 400),
  raw_sha256   text not null check (raw_sha256 ~ '^[0-9a-f]{64}$'),
  raw_size     bigint not null,
  outcome      text not null check (outcome in ('recorded', 'unknown_token', 'sender_mismatch', 'empty', 'revoked', 'error')),
  received_at  timestamptz not null default now()
);
create index if not exists thread_inbound_thread_idx on public.thread_inbound (thread_id) where thread_id is not null;

-- Receipts and inbound rows are records too.
create or replace function public.messaging_records_immutable()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only'; end if;
  if tg_table_name = 'thread_inbound' then raise exception 'append_only'; end if;
  -- message_deliveries: status may move forward (sent → delivered → opened / bounced); nothing else changes.
  if new.message_id is distinct from old.message_id or new.thread_id is distinct from old.thread_id or new.channel <> old.channel
     or new.recipient_user_id is distinct from old.recipient_user_id or new.recipient_address is distinct from old.recipient_address
     or new.created_at <> old.created_at then raise exception 'append_only'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.messaging_records_immutable() from public, anon, authenticated, service_role;
drop trigger if exists trg_message_deliveries_immutable on public.message_deliveries;
create trigger trg_message_deliveries_immutable before update or delete on public.message_deliveries
  for each row execute function public.messaging_records_immutable();
drop trigger if exists trg_thread_inbound_immutable on public.thread_inbound;
create trigger trg_thread_inbound_immutable before update or delete on public.thread_inbound
  for each row execute function public.messaging_records_immutable();

alter table public.thread_reply_tokens enable row level security;
alter table public.message_deliveries enable row level security;
alter table public.thread_inbound enable row level security;
drop policy if exists message_deliveries_party_read on public.message_deliveries;
create policy message_deliveries_party_read on public.message_deliveries for select to authenticated using (public.thread_party(thread_id) is not null);
drop policy if exists thread_inbound_party_read on public.thread_inbound;
create policy thread_inbound_party_read on public.thread_inbound for select to authenticated using (thread_id is not null and public.thread_party(thread_id) is not null);
revoke all on public.thread_reply_tokens, public.message_deliveries, public.thread_inbound from public, anon, authenticated, service_role;
revoke all on sequence public.message_deliveries_id_seq, public.thread_inbound_id_seq from public, anon, authenticated, service_role;
grant select (id, message_id, thread_id, channel, recipient_user_id, provider_message_id, status, created_at, updated_at) on public.message_deliveries to authenticated;
grant select (id, channel, thread_id, message_id, raw_sha256, raw_size, outcome, received_at) on public.thread_inbound to authenticated;
grant all on public.thread_reply_tokens, public.message_deliveries, public.thread_inbound to service_role;
grant usage on sequence public.message_deliveries_id_seq, public.thread_inbound_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('thread-inbound', 'thread-inbound', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- ── 5. realtime ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'thread_messages') then
    alter publication supabase_realtime add table public.thread_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_reads') then
    alter publication supabase_realtime add table public.message_reads;
  end if;
end $$;

-- ── 6. message centre RPCs ────────────────────────────────────────────────
-- Every thread the caller is a party to that has at least one message, with the
-- last message, the caller's party, and unread count. SECURITY INVOKER: RLS on
-- threads / thread_messages / message_reads decides what is visible.
create or replace function public.my_threads()
returns table (
  id uuid, kind text, ref_id uuid, household_id uuid, listing_id uuid, matter_id uuid, title text,
  party text, last_id bigint, last_at timestamptz, last_body text, last_kind text, last_sender_kind text,
  last_sender_id uuid, last_channel text, unread integer, awaiting_reply boolean, message_count integer
) language sql stable security invoker set search_path = public as $$
  with t as (
    select th.*, public.thread_party(th.id) as party from public.threads th
  ), last as (
    select distinct on (m.thread_id) m.thread_id, m.id, m.created_at, m.body, m.kind, m.sender_kind, m.sender_id, m.channel
      from public.thread_messages m join t on t.id = m.thread_id
     where m.kind <> 'retraction'
     order by m.thread_id, m.id desc
  ), counts as (
    select m.thread_id,
           count(*) filter (where m.kind <> 'retraction')::int as n,
           count(*) filter (where m.kind in ('message', 'formal_copy') and m.sender_id is distinct from auth.uid()
                             and m.id > coalesce(r.last_opened_id, 0))::int as unread
      from public.thread_messages m join t on t.id = m.thread_id
      left join public.message_reads r on r.thread_id = m.thread_id and r.user_id = auth.uid()
     group by m.thread_id
  )
  select t.id, t.kind, t.ref_id, t.household_id, t.listing_id, t.matter_id, t.title, t.party,
         l.id, l.created_at, left(l.body, 240), l.kind, l.sender_kind, l.sender_id, l.channel,
         coalesce(c.unread, 0),
         (l.kind = 'message' and l.sender_id is distinct from auth.uid()),
         coalesce(c.n, 0)
    from t join last l on l.thread_id = t.id left join counts c on c.thread_id = t.id
   where t.party is not null
   order by l.id desc
   limit 300
$$;
revoke execute on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated, service_role;

create or replace function public.my_unread_messages()
returns integer language sql stable security invoker set search_path = public as $$
  select coalesce(sum(unread), 0)::int from public.my_threads()
$$;
revoke execute on function public.my_unread_messages() from public, anon;
grant execute on function public.my_unread_messages() to authenticated, service_role;

-- What the caller may start a message about (step 1 of "新消息"): only matters
-- they are a party to. SECURITY DEFINER so it can walk the chains, but every row
-- is filtered by the same party rules as party_for.
create or replace function public.my_message_targets()
returns table (kind text, ref_id uuid, title text, subtitle text, party text, thread_id uuid, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then return; end if;
  -- tenancies
  return query
    select 'tenancy'::text, h.id, (h.address || coalesce(' #' || h.unit, ''))::text, null::text,
           case when m.role in ('landlord', 'property_manager') then 'landlord' when m.role = 'agent' then 'agent' else 'tenant' end,
           (select x.id from public.threads x where x.kind = 'tenancy' and x.ref_id = h.id), h.created_at
      from public.household_members m join public.households h on h.id = m.household_id
     where m.user_id = uid and m.status = 'active';
  -- work orders (open or recently closed)
  return query
    select 'work_order'::text, w.id, coalesce(tk.title, 'Work order')::text, (h.address || coalesce(' #' || h.unit, ''))::text,
           case when w.landlord_auth_id = uid then 'landlord' when p.auth_id = uid then 'provider' else 'tenant' end,
           (select x.id from public.threads x where x.kind = 'work_order' and x.ref_id = w.id), w.created_at
      from public.work_orders w
      join public.maintenance_tickets tk on tk.id = w.ticket_id
      left join public.households h on h.id = w.household_id
      left join public.service_providers p on p.id = w.provider_id
     where (w.landlord_auth_id = uid or p.auth_id = uid
            or exists (select 1 from public.household_members hm where hm.household_id = w.household_id and hm.user_id = uid and hm.status = 'active' and hm.role = 'tenant'))
       and (w.status not in ('closed', 'cancelled', 'declined') or w.updated_at > now() - interval '60 days')
     order by w.created_at desc limit 40;
  -- applications (landlord side: received; applicant side: by login email)
  return query
    select 'application'::text, a.id, (l.address || coalesce(' #' || l.unit, ''))::text,
           nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '')::text,
           case when em <> '' and lower(a.email) = em and not (l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid)) then 'tenant' else 'landlord' end,
           (select x.id from public.threads x where x.kind = 'application' and x.ref_id = a.id), a.created_at
      from public.applications a join public.listings l on l.id = a.listing_id
     where ((l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid)) and a.archived_at is null)
        or (em <> '' and lower(a.email) = em)
     order by a.created_at desc limit 40;
  -- listing inquiries that already exist (they are opened from the listing page)
  return query
    select 'listing_inquiry'::text, x.ref_id, coalesce(x.title, 'Listing')::text, null::text,
           public.party_for(x.kind, x.ref_id, x.listing_id, x.subject_user), x.id, x.created_at
      from public.threads x
     where x.kind = 'listing_inquiry' and public.party_for(x.kind, x.ref_id, x.listing_id, x.subject_user) is not null
     order by x.created_at desc limit 40;
  -- agent ↔ client
  return query
    select 'agent_client'::text, c.id,
           case when c.agent_auth_id = uid then c.name else coalesce((select ap.legal_name from public.agent_profiles ap where ap.auth_id = c.agent_auth_id), 'Agent') end::text,
           case when c.agent_auth_id = uid then c.client_role else 'agent' end::text,
           case when c.agent_auth_id = uid then 'agent' else c.client_role end,
           (select x.id from public.threads x where x.kind = 'agent_client' and x.ref_id = c.id), c.created_at
      from public.agent_clients c
     where c.agent_auth_id = uid
        or (em <> '' and lower(c.email) = em)
        or exists (select 1 from public.delegations d where d.client_id = c.id and d.principal_auth_id = uid and d.status = 'active')
     order by c.created_at desc limit 60;
  -- Stayloop
  return query
    select 'support'::text, uid, 'Stayloop'::text, null::text, 'member'::text,
           (select x.id from public.threads x where x.kind = 'support' and x.ref_id = uid), now();
end $$;
revoke execute on function public.my_message_targets() from public, anon;
grant execute on function public.my_message_targets() to authenticated, service_role;

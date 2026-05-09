-- =============================================================
-- Stayloop V5 — Schema upgrade
-- Run order: this migration is additive on top of the existing
-- (V4) tables: landlords, listings, applications.
-- =============================================================

-- ---- 1. Listings: V5 columns ---------------------------------
alter table public.listings
  add column if not exists neighborhood       text,
  add column if not exists bedrooms           int,
  add column if not exists bathrooms          numeric(3,1),
  add column if not exists sqft               int,
  add column if not exists has_den            boolean default false,
  add column if not exists trust_tier         smallint default 2 check (trust_tier between 1 and 4),
  add column if not exists pet_policy         text,        -- e.g. 'cats' | 'both' | 'none'
  add column if not exists amenities          text[] default array[]::text[],
  add column if not exists match_score        smallint,    -- 0-100 Luna match (per current viewer; left null in DB and computed at query time)
  add column if not exists pin_x              numeric(5,2),
  add column if not exists pin_y              numeric(5,2),
  add column if not exists thumb_a            text,
  add column if not exists thumb_b            text,
  add column if not exists luna_note          text,
  add column if not exists badge              text,        -- e.g. 'LUNA · 92% 匹配' | 'NEW · 6h'
  add column if not exists photo_count        int default 12;

-- ---- 2. Tenants table (companion to landlords) ---------------
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid unique references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  phone         text,
  tier          smallint default 1 check (tier between 1 and 4),
  created_at    timestamptz default now()
);

-- ---- 3. Field agents -----------------------------------------
create table if not exists public.field_agents (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid unique references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  phone         text,
  rating        numeric(2,1) default 5.0,
  license_no    text,
  created_at    timestamptz default now()
);

-- ---- 4. Rental Passport --------------------------------------
create table if not exists public.rental_passports (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete cascade,
  tier          smallint default 1 check (tier between 1 and 4),
  -- Identity (Tier 1)
  legal_name    text,
  date_of_birth date,
  id_doc_path   text,
  id_verified   boolean default false,
  id_verified_at timestamptz,
  -- Income (Tier 2)
  monthly_income numeric(10,2),
  employer       text,
  income_verified boolean default false,
  -- Bank transparency (Tier 3)
  plaid_token    text,
  bank_verified  boolean default false,
  -- Credit + Court (Tier 4)
  credit_score   int,
  court_records_json jsonb,
  updated_at     timestamptz default now()
);

create table if not exists public.passport_grants (
  id            uuid primary key default gen_random_uuid(),
  passport_id   uuid references public.rental_passports(id) on delete cascade,
  grantee_id    uuid not null,         -- landlord or agent id
  grantee_type  text not null check (grantee_type in ('landlord','agent','partner')),
  scopes        text[] default array[]::text[],   -- ['identity','income','bank','credit','court']
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz default now()
);

-- ---- 5. Showing intents --------------------------------------
create table if not exists public.showing_intents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete cascade,
  listing_id    uuid references public.listings(id) on delete cascade,
  move_in_date  date,
  lease_term    text,
  message       text,
  status        text default 'pending' check (status in ('pending','accepted','declined','expired')),
  created_at    timestamptz default now()
);

-- ---- 6. Lease documents --------------------------------------
create table if not exists public.lease_documents (
  id            uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  listing_id    uuid references public.listings(id),
  tenant_id     uuid references public.tenants(id),
  landlord_id   uuid references public.landlords(id),
  status        text default 'draft' check (status in ('draft','sent','signed_tenant','signed_both','active','ended')),
  pdf_path      text,
  monthly_rent  numeric(10,2),
  start_date    date,
  end_date      date,
  signed_at     timestamptz,
  created_at    timestamptz default now()
);

-- ---- 7. Rent payments ---------------------------------------
create table if not exists public.rent_payments (
  id            uuid primary key default gen_random_uuid(),
  lease_id      uuid references public.lease_documents(id) on delete cascade,
  due_date      date not null,
  paid_at       timestamptz,
  amount        numeric(10,2) not null,
  method        text,
  status        text default 'due' check (status in ('due','paid','late','failed'))
);

-- ---- 8. Maintenance tickets ---------------------------------
create table if not exists public.maintenance_tickets (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references public.listings(id),
  tenant_id     uuid references public.tenants(id),
  category      text,
  priority      text default 'medium' check (priority in ('low','medium','high')),
  title         text not null,
  description   text,
  photos        text[],
  status        text default 'new' check (status in ('new','assigned','in_progress','review','done','cancelled')),
  created_at    timestamptz default now(),
  resolved_at   timestamptz
);

-- ---- 9. Agent tasks -----------------------------------------
create table if not exists public.agent_tasks (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references public.field_agents(id),
  listing_id    uuid references public.listings(id),
  client_tenant_id uuid references public.tenants(id),
  kind          text check (kind in ('showing','listing_prep','photos','intake','followup')),
  title         text not null,
  scheduled_at  timestamptz,
  payout_cents  int,
  authorized_actions text[],
  unauthorized_actions text[],
  status        text default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled','disputed')),
  created_at    timestamptz default now()
);

-- ---- 10. Cross-role chat ------------------------------------
create table if not exists public.chat_threads (
  id            uuid primary key default gen_random_uuid(),
  participants  uuid[],
  context       text,           -- 'listing:<uuid>', 'app:<uuid>', etc.
  created_at    timestamptz default now()
);

create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid references public.chat_threads(id) on delete cascade,
  sender_id     uuid not null,
  sender_role   text not null,   -- 'tenant'|'landlord'|'agent'|'system'
  body          text,
  attachments   text[],
  created_at    timestamptz default now()
);

-- ---- 11. Audit log ------------------------------------------
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid,
  actor_role    text,
  action        text not null,
  target_type   text,
  target_id     uuid,
  metadata      jsonb,
  created_at    timestamptz default now()
);

-- ---- 12. Notifications --------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null,
  recipient_role text not null,
  kind          text not null,
  title         text not null,
  body          text,
  link          text,
  read_at       timestamptz,
  created_at    timestamptz default now()
);

-- =============================================================
-- Row-level security
-- =============================================================
alter table public.tenants               enable row level security;
alter table public.field_agents          enable row level security;
alter table public.rental_passports      enable row level security;
alter table public.passport_grants       enable row level security;
alter table public.showing_intents       enable row level security;
alter table public.lease_documents       enable row level security;
alter table public.rent_payments         enable row level security;
alter table public.maintenance_tickets   enable row level security;
alter table public.agent_tasks           enable row level security;
alter table public.chat_threads          enable row level security;
alter table public.chat_messages         enable row level security;
alter table public.audit_log             enable row level security;
alter table public.notifications         enable row level security;

-- Listings: anyone can read active listings (public marketing)
drop policy if exists "listings_public_select" on public.listings;
create policy "listings_public_select" on public.listings
  for select using (is_active = true);

drop policy if exists "tenants_self" on public.tenants;
create policy "tenants_self" on public.tenants
  for all using (auth_id = auth.uid()) with check (auth_id = auth.uid());

drop policy if exists "agents_self" on public.field_agents;
create policy "agents_self" on public.field_agents
  for all using (auth_id = auth.uid()) with check (auth_id = auth.uid());

drop policy if exists "passport_self" on public.rental_passports;
create policy "passport_self" on public.rental_passports
  for all using (
    tenant_id in (select id from public.tenants where auth_id = auth.uid())
  ) with check (
    tenant_id in (select id from public.tenants where auth_id = auth.uid())
  );

drop policy if exists "grants_self" on public.passport_grants;
create policy "grants_self" on public.passport_grants
  for all using (
    passport_id in (
      select rp.id from public.rental_passports rp
      join public.tenants t on t.id = rp.tenant_id
      where t.auth_id = auth.uid()
    )
  );

drop policy if exists "intents_self" on public.showing_intents;
create policy "intents_self" on public.showing_intents
  for all using (
    tenant_id in (select id from public.tenants where auth_id = auth.uid())
    or listing_id in (
      select l.id from public.listings l
      join public.landlords ll on ll.id = l.landlord_id
      where ll.auth_id = auth.uid()
    )
  );

drop policy if exists "leases_parties" on public.lease_documents;
create policy "leases_parties" on public.lease_documents
  for all using (
    tenant_id in (select id from public.tenants where auth_id = auth.uid())
    or landlord_id in (select id from public.landlords where auth_id = auth.uid())
  );

drop policy if exists "payments_parties" on public.rent_payments;
create policy "payments_parties" on public.rent_payments
  for select using (
    lease_id in (
      select id from public.lease_documents ld
      where ld.tenant_id in (select id from public.tenants where auth_id = auth.uid())
         or ld.landlord_id in (select id from public.landlords where auth_id = auth.uid())
    )
  );

drop policy if exists "maint_parties" on public.maintenance_tickets;
create policy "maint_parties" on public.maintenance_tickets
  for all using (
    tenant_id in (select id from public.tenants where auth_id = auth.uid())
    or listing_id in (
      select l.id from public.listings l
      join public.landlords ll on ll.id = l.landlord_id
      where ll.auth_id = auth.uid()
    )
  );

drop policy if exists "agent_tasks_self" on public.agent_tasks;
create policy "agent_tasks_self" on public.agent_tasks
  for all using (
    agent_id in (select id from public.field_agents where auth_id = auth.uid())
    or listing_id in (
      select l.id from public.listings l
      join public.landlords ll on ll.id = l.landlord_id
      where ll.auth_id = auth.uid()
    )
  );

drop policy if exists "chat_participants" on public.chat_threads;
create policy "chat_participants" on public.chat_threads
  for all using (
    auth.uid() = any(participants)
  );

drop policy if exists "chat_msg_participants" on public.chat_messages;
create policy "chat_msg_participants" on public.chat_messages
  for all using (
    thread_id in (select id from public.chat_threads where auth.uid() = any(participants))
  );

drop policy if exists "notif_recipient" on public.notifications;
create policy "notif_recipient" on public.notifications
  for all using (recipient_id = auth.uid());

-- =============================================================
-- claim_tenant() RPC — first-time tenant onboarding
-- =============================================================
create or replace function public.claim_tenant()
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_row     public.tenants;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  -- Look up by auth_id first
  select * into v_row from public.tenants where auth_id = v_user_id;
  if found then
    return v_row;
  end if;

  -- Else by email (linked later)
  select * into v_row from public.tenants where email = v_email;
  if found then
    update public.tenants set auth_id = v_user_id where id = v_row.id;
    return (select * from public.tenants where id = v_row.id);
  end if;

  -- Else create
  insert into public.tenants (auth_id, email, tier)
  values (v_user_id, v_email, 1)
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.claim_tenant() to authenticated;

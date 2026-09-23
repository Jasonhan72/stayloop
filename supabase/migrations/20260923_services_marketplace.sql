-- Services marketplace, Phase 0 + 1 (design/services-marketplace-plan-2026-09,
-- user go-ahead 2026-09-23: "先做 P0-P1"). Providers onboard and are verified
-- by hand (same pattern as agent_profiles); a work order hangs off a
-- maintenance ticket and moves only through the server (routes / RPC); the
-- three parties read it through RLS. No money moves through Stayloop here.

-- A V4-era demo table of the same name (six fabricated vendors with ratings,
-- no code consumer) is parked, not dropped.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='service_providers' and column_name='jobs_completed') then
    alter table public.service_providers rename to service_providers_v4_demo;
  end if;
end $$;

-- ── Providers ────────────────────────────────────────────────────────────
create table if not exists public.service_providers (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique,
  legal_name text not null check (char_length(legal_name) between 2 and 160),
  trade_name text check (trade_name is null or char_length(trade_name) <= 160),
  business_number text check (business_number is null or char_length(business_number) <= 40),
  service_cities text[] not null default '{}',
  trades text[] not null default '{}',
  pricing_mode text not null default 'hourly' check (pricing_mode in ('fixed', 'hourly')),
  call_out_fee numeric check (call_out_fee is null or call_out_fee >= 0),
  hourly_rate numeric check (hourly_rate is null or hourly_rate >= 0),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  website text check (website is null or char_length(website) <= 200),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'suspended', 'expired')),
  verified_at timestamptz,
  verified_by uuid,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  attested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.service_providers enable row level security;

-- Self-service can never touch status / verified_*; changing the facts an
-- admin verified re-queues the row (copy of guard_agent_profile_fields).
create or replace function public.guard_service_provider_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_direct_client_write() and not public.is_stayloop_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.verified_at := null; new.verified_by := null; new.review_note := null;
    else
      new.status := old.status; new.verified_at := old.verified_at; new.verified_by := old.verified_by; new.review_note := old.review_note;
      new.auth_id := old.auth_id;
      if new.legal_name is distinct from old.legal_name or new.business_number is distinct from old.business_number or new.trades is distinct from old.trades then
        new.status := 'pending'; new.verified_at := null; new.verified_by := null;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_guard_service_provider_fields on public.service_providers;
create trigger trg_guard_service_provider_fields before insert or update on public.service_providers
  for each row execute function public.guard_service_provider_fields();

drop policy if exists service_providers_own on public.service_providers;
create policy service_providers_own on public.service_providers
  for all to authenticated using (auth_id = auth.uid()) with check (auth_id = auth.uid());
drop policy if exists service_providers_verified_read on public.service_providers;
create policy service_providers_verified_read on public.service_providers
  for select to authenticated using (status = 'verified');
drop policy if exists service_providers_admin on public.service_providers;
create policy service_providers_admin on public.service_providers
  for all to authenticated using (public.is_stayloop_admin()) with check (public.is_stayloop_admin());

-- ── Credentials (public-register numbers + expiry; files in a private bucket) ─
create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  kind text not null check (kind in ('sto_coq', 'esa_contractor', 'tssa_gas', 'wsib_clearance', 'liability_insurance', 'business_registration', 'mecp_exterminator')),
  number text check (number is null or char_length(number) <= 80),
  holder_name text check (holder_name is null or char_length(holder_name) <= 160),
  expires_at date,
  file_path text check (file_path is null or char_length(file_path) <= 300),
  verified_at timestamptz,
  verified_by uuid,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_credentials_provider_idx on public.provider_credentials (provider_id);
alter table public.provider_credentials enable row level security;

create or replace function public.guard_provider_credential_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.is_direct_client_write() and not public.is_stayloop_admin() then
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verified_by := null;
    else
      new.provider_id := old.provider_id;
      -- Any change to what was verified un-verifies it.
      if new.number is distinct from old.number or new.expires_at is distinct from old.expires_at or new.kind is distinct from old.kind or new.file_path is distinct from old.file_path then
        new.verified_at := null; new.verified_by := null;
      else
        new.verified_at := old.verified_at; new.verified_by := old.verified_by;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_guard_provider_credential_fields on public.provider_credentials;
create trigger trg_guard_provider_credential_fields before insert or update on public.provider_credentials
  for each row execute function public.guard_provider_credential_fields();

drop policy if exists provider_credentials_own on public.provider_credentials;
create policy provider_credentials_own on public.provider_credentials
  for all to authenticated
  using (exists (select 1 from public.service_providers p where p.id = provider_id and p.auth_id = auth.uid()))
  with check (exists (select 1 from public.service_providers p where p.id = provider_id and p.auth_id = auth.uid()));
drop policy if exists provider_credentials_verified_read on public.provider_credentials;
create policy provider_credentials_verified_read on public.provider_credentials
  for select to authenticated using (exists (select 1 from public.service_providers p where p.id = provider_id and p.status = 'verified'));
drop policy if exists provider_credentials_admin on public.provider_credentials;
create policy provider_credentials_admin on public.provider_credentials
  for all to authenticated using (public.is_stayloop_admin()) with check (public.is_stayloop_admin());

-- ── Work orders ──────────────────────────────────────────────────────────
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.maintenance_tickets(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  landlord_auth_id uuid not null,
  provider_id uuid references public.service_providers(id) on delete set null,
  external_email text check (external_email is null or char_length(external_email) <= 200),
  external_name text check (external_name is null or char_length(external_name) <= 120),
  token text unique check (token is null or char_length(token) >= 32),
  trade text,
  scope text check (scope is null or char_length(scope) <= 2000),
  emergency boolean not null default false,
  entry_permission text check (entry_permission is null or entry_permission in ('anytime', 'call_first', 'tenant_present')),
  quote_amount numeric check (quote_amount is null or quote_amount >= 0),
  quote_type text check (quote_type is null or quote_type in ('fixed', 'hourly_estimate')),
  quote_note text check (quote_note is null or char_length(quote_note) <= 2000),
  quote_valid_until date,
  quoted_at timestamptz,
  approved_amount numeric,
  approved_at timestamptz,
  schedule_start timestamptz,
  schedule_end timestamptz,
  entry_notice_sent_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  completion_note text check (completion_note is null or char_length(completion_note) <= 2000),
  completion_photos text[] not null default '{}',
  invoice_amount numeric check (invoice_amount is null or invoice_amount >= 0),
  invoice_note text check (invoice_note is null or char_length(invoice_note) <= 1000),
  tenant_confirmed_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  paid_at timestamptz,
  payment_mode text check (payment_mode is null or payment_mode in ('offline')),
  dispute_reason text check (dispute_reason is null or char_length(dispute_reason) <= 2000),
  disputed_at timestamptz,
  disputed_by uuid,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 2000),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  status text not null default 'offered' check (status in ('offered', 'declined', 'quoted', 'scheduled', 'in_progress', 'completed', 'accepted', 'rework', 'disputed', 'paid', 'closed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_id is not null or external_email is not null)
);
create index if not exists work_orders_ticket_idx on public.work_orders (ticket_id, created_at desc);
create index if not exists work_orders_provider_idx on public.work_orders (provider_id, updated_at desc);
create index if not exists work_orders_landlord_idx on public.work_orders (landlord_auth_id, updated_at desc);
alter table public.work_orders enable row level security;
-- Parties read; every write goes through the server (routes with the
-- service role) so the transition rules live in one place.
drop policy if exists work_orders_party_read on public.work_orders;
create policy work_orders_party_read on public.work_orders
  for select to authenticated using (
    landlord_auth_id = auth.uid()
    or exists (select 1 from public.service_providers p where p.id = provider_id and p.auth_id = auth.uid())
    or public.is_household_member(household_id)
    or public.is_stayloop_admin()
  );

create table if not exists public.work_order_events (
  id bigserial primary key,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('landlord', 'tenant', 'provider', 'external', 'system', 'admin')),
  actor_id uuid,
  event text not null check (char_length(event) <= 60),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists work_order_events_wo_idx on public.work_order_events (work_order_id, id);
alter table public.work_order_events enable row level security;
drop policy if exists work_order_events_party_read on public.work_order_events;
create policy work_order_events_party_read on public.work_order_events
  for select to authenticated using (exists (select 1 from public.work_orders w where w.id = work_order_id and (
    w.landlord_auth_id = auth.uid()
    or exists (select 1 from public.service_providers p where p.id = w.provider_id and p.auth_id = auth.uid())
    or public.is_household_member(w.household_id)
    or public.is_stayloop_admin()
  )));

create table if not exists public.provider_reviews (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  provider_id uuid references public.service_providers(id) on delete cascade,
  by_kind text not null check (by_kind in ('landlord', 'tenant')),
  by_user uuid not null,
  on_time smallint check (on_time between 1 and 5),
  communication smallint check (communication between 1 and 5),
  quality smallint check (quality between 1 and 5),
  overall smallint not null check (overall between 1 and 5),
  nps smallint check (nps between 0 and 10),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (work_order_id, by_user)
);
alter table public.provider_reviews enable row level security;
drop policy if exists provider_reviews_insert on public.provider_reviews;
create policy provider_reviews_insert on public.provider_reviews
  for insert to authenticated with check (
    by_user = auth.uid() and exists (
      select 1 from public.work_orders w where w.id = work_order_id and w.status in ('accepted', 'paid', 'closed')
        and w.accepted_at > now() - interval '14 days'
        and ((by_kind = 'landlord' and w.landlord_auth_id = auth.uid()) or (by_kind = 'tenant' and public.is_household_member(w.household_id)))
    )
  );
drop policy if exists provider_reviews_read on public.provider_reviews;
create policy provider_reviews_read on public.provider_reviews
  for select to authenticated using (
    by_user = auth.uid()
    or exists (select 1 from public.service_providers p where p.id = provider_id and (p.status = 'verified' or p.auth_id = auth.uid()))
    or public.is_stayloop_admin()
  );

-- ── Grants (the project's default privileges hand ALL to the API roles) ──
revoke all on public.service_providers, public.provider_credentials, public.work_orders, public.work_order_events, public.provider_reviews from anon, authenticated, service_role;
revoke all on sequence public.work_order_events_id_seq from anon, authenticated, service_role;
grant select, insert, update on public.service_providers to authenticated;
grant select, insert, update, delete on public.provider_credentials to authenticated;
grant select on public.work_orders to authenticated;
grant select on public.work_order_events to authenticated;
grant select, insert on public.provider_reviews to authenticated;
grant all on public.service_providers, public.provider_credentials, public.work_orders, public.work_order_events, public.provider_reviews to service_role;
grant usage on sequence public.work_order_events_id_seq to service_role;

-- ── The fifth hat ────────────────────────────────────────────────────────
create or replace function public.my_hats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenant', true,
    'landlord', exists (select 1 from public.landlords l where l.auth_id = auth.uid() or l.id = auth.uid()),
    'agent', (select status from public.agent_profiles a where a.auth_id = auth.uid()),
    'provider', (select status from public.service_providers p where p.auth_id = auth.uid()),
    'admin', public.is_stayloop_admin()
  )
$$;

-- Entry notices are compliance events of a new source.
alter table public.compliance_events drop constraint if exists compliance_events_source_check;
alter table public.compliance_events add constraint compliance_events_source_check check (source in ('guardrail','listing_publish','lease_terms','compliance_api','decision_notice','work_order'));

-- Ticket status was written as 'resolved' by the hub (CHECK allows done) —
-- the column keeps its CHECK; the page is fixed in code.

-- Marketplace review fixes (E2E + code review 2026-09-23).
--
-- 1. Household members could read work_orders.token and act as the
--    contractor through /api/w/<token>. Column-level: every column but token.
-- 2. Providers read the whole households row (rent, lease pointer). Replace
--    the table policies with a definer RPC that returns only address / unit /
--    city / ticket title for the provider's live work orders.
-- 3. Any household member could DELETE a ticket (cascading the work order and
--    its audit trail) or flip its status under a live work order.
-- 4. Reviews could be attached to any provider_id.
-- 5. review_note / verified_by / business_number / credential file paths were
--    readable by every signed-in user through the verified-read policies.
--    Directory reads go through definer views with display columns only.

-- ── 1. token is not a party-readable column ─────────────────────────────
revoke select on public.work_orders from authenticated;
grant select (id, ticket_id, household_id, landlord_auth_id, provider_id, external_email, external_name, trade, scope, emergency, entry_permission,
  quote_amount, quote_type, quote_note, quote_valid_until, quoted_at, approved_amount, approved_at, schedule_start, schedule_end, entry_notice_sent_at,
  arrived_at, completed_at, completion_note, completion_photos, invoice_amount, invoice_note, tenant_confirmed_at, accepted_at, accepted_by,
  paid_at, payment_mode, dispute_reason, disputed_at, disputed_by, resolution_note, cancel_reason, status, created_at, updated_at)
  on public.work_orders to authenticated;

-- ── 2. provider job context via RPC, not table policies ─────────────────
drop policy if exists households_provider_read on public.households;
drop policy if exists maintenance_tickets_provider_read on public.maintenance_tickets;
create or replace function public.provider_job_context()
returns table (work_order_id uuid, ticket_title text, ticket_description text, address text, unit text, city text)
language sql stable security definer set search_path = public as $$
  select w.id, t.title,
         case when w.status in ('offered') then null else t.description end,
         case when w.status in ('offered', 'declined', 'cancelled', 'expired', 'closed') then null else h.address end,
         case when w.status in ('offered', 'declined', 'cancelled', 'expired', 'closed') then null else h.unit end,
         h.city
  from public.work_orders w
  join public.service_providers p on p.id = w.provider_id and p.auth_id = auth.uid()
  join public.maintenance_tickets t on t.id = w.ticket_id
  join public.households h on h.id = w.household_id
$$;
revoke all on function public.provider_job_context() from public, anon;
grant execute on function public.provider_job_context() to authenticated;

-- ── 3. tickets under a work order are protected ─────────────────────────
alter table public.work_orders drop constraint if exists work_orders_ticket_id_fkey;
alter table public.work_orders add constraint work_orders_ticket_id_fkey foreign key (ticket_id) references public.maintenance_tickets(id) on delete restrict;
create or replace function public.guard_ticket_with_work_order()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_direct_client_write() or public.is_stayloop_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.work_orders w where w.ticket_id = old.id) then
      raise exception 'ticket_has_work_orders';
    end if;
    return old;
  end if;
  if new.status is distinct from old.status and exists (
    select 1 from public.work_orders w where w.ticket_id = old.id and w.status not in ('declined', 'cancelled', 'expired', 'closed')
  ) then
    raise exception 'ticket_has_open_work_order';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_ticket_with_work_order on public.maintenance_tickets;
create trigger trg_guard_ticket_with_work_order before update or delete on public.maintenance_tickets
  for each row execute function public.guard_ticket_with_work_order();

-- ── 4. a review names the provider of its own work order ────────────────
drop policy if exists provider_reviews_insert on public.provider_reviews;
create policy provider_reviews_insert on public.provider_reviews
  for insert to authenticated with check (
    by_user = auth.uid() and exists (
      select 1 from public.work_orders w where w.id = work_order_id and w.status in ('accepted', 'paid', 'closed')
        and w.accepted_at > now() - interval '14 days'
        and provider_id is not distinct from w.provider_id
        and ((by_kind = 'landlord' and w.landlord_auth_id = auth.uid()) or (by_kind = 'tenant' and public.is_household_member(w.household_id)))
    )
  );

-- ── 5. directory reads through definer views (display columns only) ─────
drop policy if exists service_providers_verified_read on public.service_providers;
drop policy if exists provider_credentials_verified_read on public.provider_credentials;
create or replace view public.provider_directory with (security_invoker = false) as
  select id, legal_name, trade_name, service_cities, trades, pricing_mode, call_out_fee, hourly_rate, contact_email, contact_phone, website, verified_at, status
  from public.service_providers where status = 'verified';
create or replace view public.provider_credentials_public with (security_invoker = false) as
  select c.provider_id, c.kind, c.expires_at, c.verified_at
  from public.provider_credentials c join public.service_providers p on p.id = c.provider_id where p.status = 'verified';
revoke all on public.provider_directory, public.provider_credentials_public from anon, public;
grant select on public.provider_directory, public.provider_credentials_public to authenticated, service_role;
-- provider_reviews_read still lets any signed-in user read reviews of verified providers (directory average); keep.

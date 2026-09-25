-- 2026-09-25 (V0.6 review of the listing detail rebuild)
--
-- 1. price_history / transit / enriched_at / lat / lng are server-owned facts
--    (the price trigger, the enrich route and the Realtor import write them),
--    but the landlord's FOR ALL policy let a direct client write all five:
--    a verified listing could show a fabricated "↓ $1,250 (−35.7%)" price
--    drop, a fake subway stop 15 m away, or a moved map pin (probed in prod in
--    a rollback transaction as the landlord test account). The price trigger
--    is SECURITY INVOKER, so it can tell a direct client apart the same way
--    the other guards do (is_direct_client_write) and keep the old values.
--    Realtor imports seed their first history row as 'imported' — the import
--    date is not a listing date.
-- 2. The verified badge survived a change of `neighborhood`: it is free text
--    the landlord types, and since today it names the neighbourhood in the AI
--    primer prompt and drives the median sample — so it re-queues like the
--    address does.
-- 3. applicant_applications: a JWT without an email must match nothing (the
--    coalesce('') could match a row whose email was blanked). Both views state
--    security_invoker = false explicitly instead of relying on the default.
-- 4. agent_threads.messages: the client keeps 300; the table now says so.
create or replace function public.listings_price_history()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare direct boolean := public.is_direct_client_write() and not public.is_stayloop_admin();
begin
  if tg_op = 'INSERT' then
    if direct then
      new.price_history := jsonb_build_array(jsonb_build_object('date', current_date, 'price', new.monthly_rent, 'event', 'listed'));
      new.transit := null; new.enriched_at := null; new.lat := null; new.lng := null;
    elsif new.price_history is null or jsonb_typeof(new.price_history) <> 'array' or jsonb_array_length(new.price_history) = 0 then
      new.price_history := jsonb_build_array(jsonb_build_object('date', current_date, 'price', new.monthly_rent,
        'event', case when new.source = 'realtor' then 'imported' else 'listed' end));
    end if;
    return new;
  end if;
  if direct then
    new.price_history := old.price_history;
    new.transit := old.transit;
    new.enriched_at := old.enriched_at;
    new.lat := old.lat;
    new.lng := old.lng;
  end if;
  if new.monthly_rent is distinct from old.monthly_rent then
    new.price_history := (case when jsonb_typeof(new.price_history) = 'array' then new.price_history else '[]'::jsonb end)
      || jsonb_build_object('date', current_date, 'price', new.monthly_rent, 'prev', old.monthly_rent, 'event', 'changed');
  end if;
  return new;
end $$;
revoke execute on function public.listings_price_history() from public, anon, authenticated;

update public.listings
   set price_history = jsonb_set(price_history, '{0,event}', '"imported"')
 where source = 'realtor' and jsonb_typeof(price_history) = 'array' and price_history->0->>'event' = 'listed';

create or replace function public.guard_listing_trust_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Admins (via /admin/verify) and the service role (backend / migrations)
  -- may change trust fields; landlord self-service cannot.
  if auth.role() = 'service_role' or public.is_stayloop_admin() then
    return new;
  end if;
  new.source := old.source;
  -- A verified listing that changes what was verified goes back to the
  -- queue instead of carrying the badge onto a different property.
  if old.verification_status = 'verified' and (
       new.address is distinct from old.address
    or new.unit is distinct from old.unit
    or new.city is distinct from old.city
    or new.postal_code is distinct from old.postal_code
    or new.neighborhood is distinct from old.neighborhood
    or new.monthly_rent is distinct from old.monthly_rent
    or new.bedrooms is distinct from old.bedrooms
    or new.property_type is distinct from old.property_type
  ) then
    new.verification_status := 'pending';
    new.verified_at := null;
  else
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
  end if;
  return new;
end $$;
revoke execute on function public.guard_listing_trust_fields() from public, anon, authenticated;

create or replace view public.applicant_applications with (security_invoker = false) as
  select a.id, a.listing_id, a.first_name, a.last_name, a.email, a.status, a.created_at, a.move_in_date,
         a.viewed_at, a.screened_at, a.decision_notified_at, a.notified_at,
         l.slug as listing_slug, l.address as listing_address, l.unit as listing_unit, l.is_active as listing_active
    from public.applications a
    left join public.listings l on l.id = a.listing_id
   where a.email is not null
     and coalesce(auth.jwt() ->> 'email', '') <> ''
     and lower(a.email) = lower(auth.jwt() ->> 'email');

create or replace view public.my_showing_intents with (security_invoker = false) as
  select i.id, i.kind, i.status, i.move_in_date, i.message, i.created_at, i.listing_id,
         l.slug as listing_slug, l.address as listing_address, l.unit as listing_unit, l.is_active as listing_active
    from public.showing_intents i
    left join public.listings l on l.id = i.listing_id
   where i.tenant_id in (select t.id from public.tenants t where t.auth_id = auth.uid());

alter table public.agent_threads drop constraint if exists agent_threads_messages_cap;
alter table public.agent_threads add constraint agent_threads_messages_cap
  check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 300);

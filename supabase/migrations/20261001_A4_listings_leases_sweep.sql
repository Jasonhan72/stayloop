-- Sweep 2026-10-01 · group A4 (listings & leases)
--
-- 1. listings.updated_at is the optimistic-concurrency token for the AI rewrite
--    card and the listing editor. It used to move on EVERY update, including the
--    public enrich route's cache writes (lat / lng / transit / enriched_at) and
--    the admin's verification stamp, so opening the public listing page made a
--    fresh "更新房源" card stale although nobody had edited the listing (#22).
--    Now it moves only when landlord-editable content changes; a write that only
--    touches server-owned / cache columns keeps the old value, and a client can
--    no longer set it directly either.
-- 2. When a listing goes off market or is deleted (archived), its pending
--    showing_request / listing_inquiry cards expire (reason listing_inactive)
--    with a system line in the inquiry thread — approving an old card used to
--    email "the landlord agreed to arrange a viewing" for a unit no longer
--    listed (#69, contract C7).
-- 3. /leases/import: the page now checks for a household the caller is already
--    in (or invited to) at the same address + unit before creating another one,
--    and the creator of an unconfirmed import can correct its facts instead of
--    re-importing (#18).

-- ── 1. content-only updated_at ──────────────────────────────────────────────
create or replace function public.listings_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  -- Server-owned and cache columns: writing them is not an edit of the listing.
  cache_cols constant text[] := array[
    'updated_at', 'lat', 'lng', 'transit', 'enriched_at', 'price_history',
    'verification_status', 'verified_at', 'match_score', 'badge', 'luna_note',
    'pin_x', 'pin_y', 'thumb_a', 'thumb_b', 'trust_tier'
  ];
begin
  if (to_jsonb(new) - cache_cols) is distinct from (to_jsonb(old) - cache_cols) then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
revoke execute on function public.listings_touch_updated_at() from public, anon, authenticated, service_role;
drop trigger if exists trg_listings_touch_updated_at on public.listings;
create trigger trg_listings_touch_updated_at before update on public.listings
  for each row execute function public.listings_touch_updated_at();

-- ── 2. off market → pending showing / inquiry cards expire ──────────────────
create or replace function public.expire_listing_showing_cards()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  if not (
       (coalesce(old.is_active, true) and new.is_active is false)
    or (new.status = 'archived' and old.status is distinct from 'archived')
  ) then
    return null;
  end if;
  for r in
    update public.agent_pending_actions a
       set status = 'expired',
           execution_result = jsonb_build_object('ok', false, 'reason', 'listing_inactive')
     where a.status = 'pending'
       and a.action_type in ('showing_request', 'listing_inquiry')
       and a.metadata ->> 'listing_id' = new.id::text
    returning a.id, a.metadata ->> 'thread_id' as thread_id
  loop
    if r.thread_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      begin
        insert into public.thread_messages (thread_id, sender_kind, kind, channel, body)
        values (r.thread_id::uuid, 'system', 'system', 'system',
                '房源已下架，这条看房请求 / 提问没有被房东确认。 · The listing is off market; this request was not confirmed by the landlord.');
      exception when others then
        -- The card still expires; a missing thread must never block taking a listing down.
        null;
      end;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.expire_listing_showing_cards() from public, anon, authenticated, service_role;
drop trigger if exists trg_listings_expire_showing_cards on public.listings;
create trigger trg_listings_expire_showing_cards
  after update of is_active, status on public.listings
  for each row execute function public.expire_listing_showing_cards();

-- ── 3a. households the caller already has (or is invited to) ────────────────
-- Matching on address + unit is done by the page (lib/lease/householdMatch.ts,
-- the same normaliser the e-sign route uses), so this returns the caller's own
-- small set. An invitee (JWT email) gets the address and their own invite token
-- only — rent and dates stay behind the invite, as on /join. The lease's tenant
-- name / email come back only to the household's creator (what they typed).
drop function if exists public.my_households_for_import();
create or replace function public.my_households_for_import()
returns table (
  id uuid, address text, unit text, city text, status text, verified boolean, source text,
  monthly_rent numeric, rent_due_day int, start_date date, end_date date,
  relation text, my_role text, is_creator boolean, invite_token text, lease_status text,
  tenant_name text, tenant_email text, others_joined boolean
)
language sql stable security definer set search_path = public
as $$
  with me as (
    select auth.uid() as uid, lower(coalesce(auth.jwt() ->> 'email', '')) as email
  )
  select h.id, h.address, h.unit, h.city, h.status, h.verified, h.source,
         h.monthly_rent, h.rent_due_day, h.start_date, h.end_date,
         'member'::text, m.role, h.created_by = (select uid from me), null::text, ld.status,
         case when h.created_by = (select uid from me) then ld.tenant_name end,
         case when h.created_by = (select uid from me) then ld.tenant_email end,
         exists (select 1 from public.household_members o
                  where o.household_id = h.id and o.user_id <> (select uid from me) and o.status = 'active')
    from public.households h
    join public.household_members m
      on m.household_id = h.id and m.user_id = (select uid from me) and m.status = 'active'
    left join public.lease_documents ld on ld.id = h.current_lease_id
   where (select uid from me) is not null
     and h.status = 'active'
  union all
  select h.id, h.address, h.unit, h.city, h.status, h.verified, h.source,
         null::numeric, null::int, null::date, null::date,
         'invited'::text, i.invited_role, false, i.token, null::text,
         null::text, null::text, null::boolean
    from public.household_invites i
    join public.households h on h.id = i.household_id
   where (select uid from me) is not null
     and (select email from me) <> ''
     and lower(i.invited_email) = (select email from me)
     and i.accepted_at is null and i.declined_at is null and i.revoked_at is null
     and i.expires_at > now()
     and h.status = 'active'
     and not exists (
       select 1 from public.household_members m2
        where m2.household_id = h.id and m2.user_id = (select uid from me) and m2.status = 'active'
     )
  limit 100
$$;
revoke all on function public.my_households_for_import() from public, anon;
grant execute on function public.my_households_for_import() to authenticated;

-- ── 3b. correct an unconfirmed import instead of importing it again ─────────
-- Only the creator, only while the other side has not joined, only an imported
-- household; the imported lease row follows. A confirmed household's facts are
-- what both parties agreed to and stay as they are. "Joined" is any other active
-- member, not only verified = true: an invitee who accepted under another login
-- email (or an agent / PM) is a member while verified stays false, and has seen
-- the rent, dates and names (review 2026-10-01).
create or replace function public.update_household_import(
  p_household     uuid,
  p_address       text,
  p_unit          text,
  p_city          text,
  p_monthly_rent  numeric,
  p_rent_due_day  int,
  p_start_date    date,
  p_end_date      date,
  p_tenant_name   text,
  p_tenant_email  text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  h record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into h from public.households where id = p_household for update;
  if not found then raise exception 'not found'; end if;
  if h.created_by <> v_uid then raise exception 'not_creator'; end if;
  if h.verified then raise exception 'household_verified'; end if;
  if exists (select 1 from public.household_members m
              where m.household_id = p_household and m.user_id <> v_uid and m.status = 'active') then
    raise exception 'counterparty_joined';
  end if;
  if h.source <> 'imported' or h.status <> 'active' then raise exception 'not_editable'; end if;
  if p_address is null or length(trim(p_address)) < 5 then raise exception 'address required'; end if;
  if p_rent_due_day is not null and (p_rent_due_day < 1 or p_rent_due_day > 31) then raise exception 'invalid rent due day'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then raise exception 'end before start'; end if;

  update public.households
     set address = trim(p_address),
         unit = nullif(trim(coalesce(p_unit, '')), ''),
         city = nullif(trim(coalesce(p_city, '')), ''),
         monthly_rent = p_monthly_rent,
         rent_due_day = coalesce(p_rent_due_day, rent_due_day),
         start_date = p_start_date,
         end_date = p_end_date
   where id = p_household;

  update public.lease_documents
     set monthly_rent = p_monthly_rent,
         start_date = p_start_date,
         end_date = p_end_date,
         tenant_name = nullif(trim(coalesce(p_tenant_name, '')), ''),
         tenant_email = nullif(lower(trim(coalesce(p_tenant_email, ''))), ''),
         unit_label = nullif(trim(coalesce(p_unit, '')), '')
   where id = h.current_lease_id
     and status = 'imported'
     and sent_at is null and landlord_signature is null and tenant_signature is null;

  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_uid, 'user', 'household_import_corrected', 'household', p_household, jsonb_build_object('lease_id', h.current_lease_id));
end $$;
revoke all on function public.update_household_import(uuid, text, text, text, numeric, int, date, date, text, text) from public, anon;
grant execute on function public.update_household_import(uuid, text, text, text, numeric, int, date, date, text, text) to authenticated;

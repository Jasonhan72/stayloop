-- V0.9 (2026-11-22): the numbers the back office watches, counted over REAL accounts only.
--
-- /admin's 「平台实况」 strip counts every non-anonymous account as a "real user" and every screening
-- as a screening. On 2026-11-22 the site had 243 screenings, of which 182 had been run from admin
-- accounts and 10 from test accounts, and 24 accounts, of which 10 were test accounts — the headline
-- numbers said nothing about outside use. These four are the ones worth watching instead:
--   1. screenings run by real accounts            (how thick the data is)
--   2. active managed tenancies of real accounts  (how big the ledger is)
--   3. rent records on those tenancies            (whether the ledger is being kept)
--   4. landlords an agent brought in              (whether the distribution lever works)
-- plus new real accounts per week.
--
-- "Real" = an existing auth user that is not anonymous, carries no test / Muse / reviewer flag, is
-- not on our own domains, and is not a back-office admin (the founder's own use is not outside use).

create or replace function public.is_real_account(uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select uid is not null and exists (
    select 1 from auth.users u
     where u.id = uid
       and not coalesce(u.is_anonymous, false)
       and coalesce(u.raw_user_meta_data->>'test_account', '') <> 'true'
       and coalesce(u.raw_user_meta_data->>'muse_account', '') <> 'true'
       and coalesce(u.raw_user_meta_data->>'reviewer_account', '') <> 'true'
       and coalesce(lower(u.email), '') not like '%@stayloop.ai'
       and coalesce(lower(u.email), '') not like '%@stayloop-test.local'
       and not exists (select 1 from public.admin_users a where a.user_id = u.id)
  )
$function$;

-- Reads auth.users: for the admin RPC below only, never callable through the API.
revoke execute on function public.is_real_account(uuid) from public, anon, authenticated;
grant execute on function public.is_real_account(uuid) to service_role;

create or replace function public.admin_north_star()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with scr as (
    -- old rows keep landlords.id in landlord_id, new ones the auth id: resolve both to the account
    select s.id, s.created_at,
           coalesce((select ld.auth_id from public.landlords ld where ld.id = s.landlord_id limit 1), s.landlord_id) as owner
      from public.screenings s
  ),
  scr_real as (select * from scr where public.is_real_account(owner)),
  hh as (
    select h.id, h.status, h.current_lease_id, h.previous_lease_id, h.next_lease_id
      from public.households h
     where public.is_real_account(h.created_by)
  ),
  rent as (
    select rp.id, rp.paid_at, rp.confirmed_at
      from public.rent_payments rp
     where exists (select 1 from hh where rp.lease_id in (hh.current_lease_id, hh.previous_lease_id, hh.next_lease_id))
  ),
  via as (
    -- a landlord client who confirmed an agent's delegation (ever — a later revocation does not undo
    -- having been brought in); both ends real accounts
    select distinct d.principal_auth_id as landlord
      from public.delegations d
     where d.confirmed_at is not null
       and public.is_real_account(d.principal_auth_id)
       and public.is_real_account(d.delegate_auth_id)
       and (exists (select 1 from public.landlords ld where ld.auth_id = d.principal_auth_id)
            or exists (select 1 from public.agent_clients c where c.id = d.client_id and c.client_role = 'landlord'))
  )
  select case when not coalesce(public.is_stayloop_admin(), false) then jsonb_build_object('error', 'forbidden')
  else jsonb_build_object(
    'real_accounts',           (select count(*) from auth.users u where public.is_real_account(u.id)),
    'real_accounts_30d',       (select count(*) from auth.users u where public.is_real_account(u.id) and u.created_at > now() - interval '30 days'),
    'screenings_real',         (select count(*) from scr_real),
    'screenings_real_30d',     (select count(*) from scr_real where created_at > now() - interval '30 days'),
    'screeners_real',          (select count(distinct owner) from scr_real),
    -- trial sessions from before screening needed an account (2026-09-29): not accounts, not internal either
    'screenings_anon',         (select count(*) from scr where exists (select 1 from auth.users u where u.id = scr.owner and coalesce(u.is_anonymous, false))),
    'screenings_total',        (select count(*) from scr),
    'households_active_real',  (select count(*) from hh where status = 'active'),
    'households_active_total', (select count(*) from public.households where status = 'active'),
    'rent_recorded_real',      (select count(*) from rent where paid_at is not null),
    'rent_confirmed_real',     (select count(*) from rent where confirmed_at is not null),
    'landlords_via_agent',     (select count(*) from via),
    'signups_by_week',         (select coalesce(jsonb_agg(jsonb_build_object(
                                   'week', to_char(w.wk, 'YYYY-MM-DD'),
                                   'n', (select count(*) from auth.users u where public.is_real_account(u.id) and date_trunc('week', u.created_at) = w.wk)
                                 ) order by w.wk), '[]'::jsonb)
                                  from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as w(wk))
  ) end
$function$;

revoke execute on function public.admin_north_star() from public, anon, authenticated;
grant execute on function public.admin_north_star() to authenticated, service_role;

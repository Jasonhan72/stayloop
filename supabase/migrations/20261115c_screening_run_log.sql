-- Code review 2026-11-15, S2-11: the free plan's monthly screening allowance counted rows
-- created this month, once each. A row from an earlier month scored again, or one row scored
-- over and over with different files, cost nothing. This adds the missing fact — when each
-- scoring run happened — and the function /api/screen-score reads it through.

-- One row per scoring run. No foreign key on purpose: deleting a screening must not hand its
-- month's allowance back. Service-only (RLS on, no policies; written and read by the two
-- SECURITY DEFINER functions below).
create table if not exists public.screening_runs (
  id           bigint generated always as identity primary key,
  screening_id uuid not null,
  landlord_key uuid not null,
  user_id      uuid,
  started_at   timestamptz not null default now()
);
create index if not exists screening_runs_landlord_month_idx on public.screening_runs (landlord_key, started_at);
create index if not exists screening_runs_screening_month_idx on public.screening_runs (screening_id, started_at);
alter table public.screening_runs enable row level security;
revoke all on public.screening_runs from anon, authenticated;

-- Every id a landlord's screenings may be keyed under (the dual-ID rule: landlords.id for old
-- rows, auth.users.id for new ones), starting from whichever one a screening carries.
create or replace function public.screening_landlord_keys(p_landlord uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select array_agg(distinct k) from (
    select p_landlord as k
    union select l.id from public.landlords l where l.id = p_landlord or l.auth_id = p_landlord
    union select l.auth_id from public.landlords l where (l.id = p_landlord or l.auth_id = p_landlord) and l.auth_id is not null
  ) x
$function$;
revoke execute on function public.screening_landlord_keys(uuid) from public, anon, authenticated;

-- What the allowance needs to know about one screening, for the calendar month in progress:
--   rows_this_month  distinct screenings of this landlord that count this month — created this
--                    month and scored (the old rule), or scored this month per the run log;
--   counted          whether this screening is already one of them;
--   runs_this_row    scoring runs of this screening this month.
-- Only the screening's own landlord (or an admin, or the service role) may ask.
create or replace function public.screening_quota_usage(p_screening_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_ll uuid;
  v_keys uuid[];
  v_month timestamptz := date_trunc('month', now());
  v_rows integer;
  v_counted boolean;
  v_runs integer;
begin
  select landlord_id into v_ll from public.screenings where id = p_screening_id;
  if v_ll is null then return null; end if;
  v_keys := public.screening_landlord_keys(v_ll);
  if auth.uid() is not null and not (auth.uid() = any(v_keys)) and not coalesce(public.is_stayloop_admin(), false) then
    raise exception 'not_your_screening' using errcode = '42501';
  end if;
  with ids as (
    select s.id from public.screenings s
     where s.landlord_id = any(v_keys) and s.created_at >= v_month and s.status in ('scored', 'scoring')
    union
    select r.screening_id from public.screening_runs r
     where r.landlord_key = any(v_keys) and r.started_at >= v_month
  )
  select count(*)::integer, coalesce(bool_or(id = p_screening_id), false) into v_rows, v_counted from ids;
  select count(*)::integer into v_runs from public.screening_runs r where r.screening_id = p_screening_id and r.started_at >= v_month;
  return jsonb_build_object('rows_this_month', v_rows, 'counted', v_counted, 'runs_this_row', v_runs);
end
$function$;
revoke execute on function public.screening_quota_usage(uuid) from public, anon;
grant execute on function public.screening_quota_usage(uuid) to authenticated, service_role;

-- Called by /api/screen-score as a run starts. Same ownership rule: nobody can write runs
-- against another landlord's screening (that would spend their allowance for them).
create or replace function public.record_screening_run(p_screening_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ll uuid;
begin
  select landlord_id into v_ll from public.screenings where id = p_screening_id;
  if v_ll is null then return; end if;
  if auth.uid() is not null and not (auth.uid() = any(public.screening_landlord_keys(v_ll))) and not coalesce(public.is_stayloop_admin(), false) then
    return;
  end if;
  insert into public.screening_runs (screening_id, landlord_key, user_id) values (p_screening_id, v_ll, auth.uid());
end
$function$;
revoke execute on function public.record_screening_run(uuid) from public, anon;
grant execute on function public.record_screening_run(uuid) to authenticated, service_role;

-- 2026-10-01 sweep (B1 · renewal lease timing) — a renewal waits for its start date.
--
-- The e-sign route attached a fully signed renewal to the existing household by
-- switching households.current_lease_id at once, even when the new term starts
-- months later. The hub reads rent for the current lease only, so the running
-- term's remaining periods disappeared, and mark_rent_paid (which requires
-- current_lease_id = p_lease) refused to record them.
--
-- 1. households.next_lease_id: the signed lease that takes over on its start date.
--    The sign route sets it (instead of current_lease_id) when the new lease starts
--    after today in Toronto; the running term keeps its lease, end date, rent and
--    due day until then.
-- 2. promote_household_leases(): daily, next_lease_id → current_lease_id once the
--    lease's start_date <= today (America/Toronto), with the same household fields
--    the attach code updates (end_date, monthly_rent, rent_due_day from the terms,
--    start_date kept). A next lease that is no longer signed is cleared, not promoted.
--    A new-term period already recorded under the old lease moves to the new one.
-- 3. The household trust guard freezes next_lease_id for direct client writes, like
--    current_lease_id: promoting a lease a member slipped in would make
--    mark_rent_paid accept it. Review 2026-10-01: it also freezes the household's
--    facts (address, unit, city, monthly_rent, rent_due_day, start_date, end_date,
--    status). households_creator_update let the creator rewrite rent, dates and the
--    due day at any time — after both sides signed, after the other side joined —
--    and those columns drive the hub's schedule and mark_rent_paid's amount.
--    Corrections go through update_household_import (definer, gated); the sign
--    route and promote_household_leases write as owner. Nothing in the code updates
--    households directly, so the policy is dropped too.
-- 4. households.previous_lease_id (review 2026-10-01): when a renewal takes over
--    (promotion, or the sign route's 'current' slot) the running term's unrecorded
--    periods used to vanish — the hub read only current_lease_id and mark_rent_paid
--    refused the old lease, so a December nobody marked before the switch could
--    never be recorded, and a repayment plan already pending for it demanded rent
--    nobody could mark paid. The lease it replaced is kept here: members can read
--    it and its rent rows, and mark_rent_paid records its periods (bounded by that
--    lease's own start..end).
-- 5. A renewal waiting in next_lease_id gets its first-period placeholder when it
--    is promoted, not at signing: the facts / rail counted a 'due' row the hub did
--    not show yet.

-- ── 1. Column ────────────────────────────────────────────────────────────────
alter table public.households
  add column if not exists next_lease_id uuid references public.lease_documents(id) on delete set null;

create index if not exists households_next_lease_idx
  on public.households (next_lease_id) where next_lease_id is not null;

alter table public.households
  add column if not exists previous_lease_id uuid references public.lease_documents(id) on delete set null;

create index if not exists households_previous_lease_idx
  on public.households (previous_lease_id) where previous_lease_id is not null;

-- ── 2. Guard: next_lease_id is server-written only ───────────────────────────
-- Same function as 20260914_paid_and_trust_field_guards.sql plus next_lease_id.
create or replace function public.guard_household_trust_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.verified := false;
    new.next_lease_id := null;
    new.previous_lease_id := null;
    return new;
  end if;
  new.verified := old.verified;
  new.current_lease_id := old.current_lease_id;
  new.next_lease_id := old.next_lease_id;
  new.previous_lease_id := old.previous_lease_id;
  new.created_by := old.created_by;
  new.source := old.source;
  -- The tenancy's facts: only the gated definer paths change them.
  new.address := old.address;
  new.unit := old.unit;
  new.city := old.city;
  new.monthly_rent := old.monthly_rent;
  new.rent_due_day := old.rent_due_day;
  new.start_date := old.start_date;
  new.end_date := old.end_date;
  new.status := old.status;
  return new;
end $$;

drop policy if exists households_creator_update on public.households;

-- ── 3. promote_household_leases() ────────────────────────────────────────────
create or replace function public.promote_household_leases()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_n integer := 0;
  v_due integer;
  r record;
begin
  for r in
    select h.id as household_id, h.current_lease_id as previous_lease_id, h.created_by,
           ld.id as lease_id, ld.status, ld.start_date, ld.end_date, ld.monthly_rent,
           ld.terms->'rent'->>'due_day' as due_day_text
      from public.households h
      join public.lease_documents ld on ld.id = h.next_lease_id
     where h.next_lease_id is not null
     for update of h skip locked
  loop
    if r.status is null or r.status not in ('signed_both', 'active', 'imported') then
      -- No longer a signed lease (ended / withdrawn): nothing to take over.
      update public.households set next_lease_id = null
       where id = r.household_id and next_lease_id = r.lease_id;
      continue;
    end if;
    if r.start_date is null or r.start_date > v_today then
      continue;
    end if;
    -- Due day from the terms (1–31), else the household keeps its own. Parsed in
    -- plpgsql, never cast inside the UPDATE (a bad value must not abort the batch).
    v_due := null;
    if r.due_day_text ~ '^[0-9]{1,2}$' then
      v_due := r.due_day_text::integer;
      if v_due < 1 or v_due > 31 then v_due := null; end if;
    end if;
    update public.households h
       set current_lease_id = r.lease_id,
           next_lease_id = null,
           end_date = r.end_date,
           monthly_rent = coalesce(r.monthly_rent, h.monthly_rent),
           rent_due_day = coalesce(v_due, h.rent_due_day),
           start_date = coalesce(h.start_date, r.start_date),
           previous_lease_id = coalesce(r.previous_lease_id, h.previous_lease_id)
     where h.id = r.household_id and h.next_lease_id = r.lease_id;
    if found then
      v_n := v_n + 1;
      -- A period of the new term recorded under the old lease just before the switch
      -- (the hub's UTC schedule can reach it the evening before) moves with the term:
      -- the new lease's 'due' placeholder for that date gives way to the record.
      if r.previous_lease_id is not null then
        delete from public.rent_payments np
         using public.rent_payments op
         where np.lease_id = r.lease_id and op.lease_id = r.previous_lease_id
           and np.due_date = op.due_date and op.due_date >= r.start_date
           and op.status in ('paid', 'late')
           and np.status is distinct from 'paid' and np.status is distinct from 'late';
        update public.rent_payments op
           set lease_id = r.lease_id
         where op.lease_id = r.previous_lease_id and op.due_date >= r.start_date
           and op.status in ('paid', 'late')
           and not exists (select 1 from public.rent_payments x where x.lease_id = r.lease_id and x.due_date = op.due_date);
      end if;
      -- The new term's first-period placeholder, now that the hub shows its ledger (the sign
      -- route no longer writes it for a 'next' lease): the first due date on/after the start,
      -- clamped to the month's last day. A record moved over above wins (on conflict).
      if r.monthly_rent is not null then
        declare
          v_dd integer := coalesce(v_due, (select h2.rent_due_day from public.households h2 where h2.id = r.household_id), 1);
          v_first date := make_date(extract(year from r.start_date)::int, extract(month from r.start_date)::int,
                                    least(v_dd, extract(day from (date_trunc('month', r.start_date) + interval '1 month - 1 day'))::int));
        begin
          if v_first < r.start_date then
            v_first := (date_trunc('month', r.start_date) + interval '1 month')::date;
            v_first := make_date(extract(year from v_first)::int, extract(month from v_first)::int,
                                 least(v_dd, extract(day from (date_trunc('month', v_first) + interval '1 month - 1 day'))::int));
          end if;
          insert into public.rent_payments (lease_id, due_date, amount, status)
          values (r.lease_id, v_first, r.monthly_rent, 'due')
          on conflict (lease_id, due_date) do nothing;
        end;
      end if;
      insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
      values (r.created_by, 'system', 'household_lease_promoted', 'household', r.household_id,
              jsonb_build_object('lease_id', r.lease_id, 'previous_lease_id', r.previous_lease_id,
                                 'start_date', to_char(r.start_date, 'YYYY-MM-DD')));
    end if;
  end loop;
  return v_n;
end $$;

revoke all on function public.promote_household_leases() from public, anon, authenticated;
grant execute on function public.promote_household_leases() to service_role;

-- ── 3b. Members read the lease a renewal replaced, and its rent rows ─────────
drop policy if exists leases_household_members on public.lease_documents;
create policy leases_household_members on public.lease_documents
  for select using (exists (
    select 1 from public.households h
    where (h.current_lease_id = lease_documents.id or h.previous_lease_id = lease_documents.id)
      and public.is_household_member(h.id)
  ));
drop policy if exists rent_household_members on public.rent_payments;
create policy rent_household_members on public.rent_payments
  for select using (exists (
    select 1 from public.households h
    where (h.current_lease_id = rent_payments.lease_id or h.previous_lease_id = rent_payments.lease_id)
      and public.is_household_member(h.id)
  ));

-- ── 3c. mark_rent_paid: the current lease, or the one it replaced ───────────
-- Same function as 20261001_A6_tenancy_ui_rent_ledger.sql, plus the previous
-- lease: a period of the replaced term is recordable while it lies within that
-- lease's own start..end (never a period of the new term under the old lease).
create or replace function public.mark_rent_paid(p_lease uuid, p_due date, p_paid_on date default null)
returns public.rent_payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hh public.households%rowtype;
  v_row public.rent_payments%rowtype;
  v_amount numeric;
  v_utc date := (now() at time zone 'utc')::date;
  v_local date := (now() at time zone 'America/Toronto')::date;
  v_paid date;
  v_term_start date;
  v_prev boolean := false;
  v_lease_start date;
  v_lease_end date;
  v_lease_rent numeric;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_lease is null or p_due is null then
    raise exception 'bad_request' using errcode = '22023';
  end if;
  select h.* into v_hh
    from public.households h
   where (h.current_lease_id = p_lease or h.previous_lease_id = p_lease) and public.is_household_member(h.id)
   limit 1;
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  v_prev := v_hh.current_lease_id is distinct from p_lease;
  select ld.start_date, ld.end_date, ld.monthly_rent into v_lease_start, v_lease_end, v_lease_rent
    from public.lease_documents ld where ld.id = p_lease;
  -- A period after the replaced lease ended belongs to the new term's ledger.
  if v_prev and v_lease_end is not null and p_due > v_lease_end then
    raise exception 'after_lease' using errcode = '22023';
  end if;

  select * into v_row from public.rent_payments
   where lease_id = p_lease and due_date = p_due
   for update;

  if not found or v_row.status is null or v_row.status not in ('paid', 'late') then
    -- A period nobody recorded yet must be due (the hub schedule is UTC; one day of
    -- slack); a system placeholder row may be recorded early (first month at signing).
    if v_row.id is null then
      if p_due > v_utc + 1 then
        raise exception 'future_period' using errcode = '22023';
      end if;
      -- The lease's own term: a renewal keeps the household's original start, but its
      -- ledger is the lease's (rows are keyed by lease_id).
      v_term_start := greatest(v_hh.start_date, v_lease_start);
      if v_term_start is not null and p_due < v_term_start then
        raise exception 'before_lease' using errcode = '22023';
      end if;
    end if;
    -- The day it was paid: not in the future, not more than 62 days ahead of the due date
    -- (unless that is today — a placeholder recorded at signing).
    v_paid := coalesce(p_paid_on, v_local);
    if v_paid > v_local or v_paid < least(p_due - 62, v_local) then
      raise exception 'bad_paid_date' using errcode = '22023';
    end if;
    -- The replaced lease's own rent first: the household already carries the new term's.
    v_amount := case when v_prev then coalesce(v_row.amount, v_lease_rent, v_hh.monthly_rent)
                     else coalesce(v_row.amount, v_hh.monthly_rent, v_lease_rent) end;
    if v_amount is null then
      raise exception 'no_rent_amount' using errcode = '22023';
    end if;
    insert into public.rent_payments as rp (lease_id, tenant_id, due_date, amount, paid_at, status)
    values (p_lease, v_uid, p_due, v_amount,
            (v_paid::timestamp + time '12:00') at time zone 'America/Toronto',
            case when v_paid <= p_due then 'paid' else 'late' end)
    on conflict (lease_id, due_date) do update
       set paid_at = excluded.paid_at,
           status = excluded.status,
           tenant_id = excluded.tenant_id,
           amount = coalesce(rp.amount, excluded.amount)
     where rp.status is distinct from 'paid' and rp.status is distinct from 'late'
    returning rp.* into v_row;
    if v_row.id is null then
      -- Another member recorded it first: return their record, never re-stamp it.
      select * into v_row from public.rent_payments where lease_id = p_lease and due_date = p_due;
    end if;
  end if;

  -- A repayment-plan card that listed this period now demands rent the ledger shows
  -- as paid. Cards drafted before missed_due_dates existed expire on any record.
  update public.agent_pending_actions a
     set status = 'expired',
         execution_result = jsonb_build_object('ok', false, 'reason', 'arrears_changed', 'recorded_due_date', to_char(p_due, 'YYYY-MM-DD'))
   where a.status = 'pending'
     and a.action_type = 'send_message'
     and a.metadata->>'stage' = 'payment_plan'
     and a.metadata->>'lease_id' = p_lease::text
     and (jsonb_typeof(a.metadata->'missed_due_dates') is distinct from 'array'
          or (a.metadata->'missed_due_dates') ? to_char(p_due, 'YYYY-MM-DD'));

  return v_row;
end $$;

revoke all on function public.mark_rent_paid(uuid, date, date) from public, anon;
grant execute on function public.mark_rent_paid(uuid, date, date) to authenticated, service_role;

-- ── 4. Daily at 05:05 UTC (01:05 / 00:05 Toronto) — re-running never duplicates the job ──
select cron.unschedule('household-lease-promote') where exists (select 1 from cron.job where jobname = 'household-lease-promote');
select cron.schedule('household-lease-promote', '5 5 * * *', 'select public.promote_household_leases()');

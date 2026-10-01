-- 2026-10-01 sweep (A6 · tenancy UI) — rent ledger one-row-per-period + move-in checklist writes.
--
-- 1. rent_payments had no (lease_id, due_date) uniqueness and no UPDATE path for
--    members: the e-sign flow's first-month placeholder {status:'due'} rendered as
--    LATE and could never be marked paid, and the hub's Mark-paid would have
--    inserted a second row beside it. Duplicates are archived (not dropped), the
--    pair becomes unique, and mark_rent_paid() records a period or fills the
--    placeholder in place. paid_at is the day the rent was PAID (the member says
--    when; default today), not the day it is entered: recording an on-time month a
--    week later must not turn it into a late payment or feed the s.58 count.
-- 2. Recording a period expires pending repayment-plan cards that listed it, for
--    whichever member records it (the tenant cannot touch the landlord's cards
--    through RLS, so this lives in the definer function).
-- 3. move_in_checklist: the update policy required done_by = caller on the
--    resulting row, so a note on an item the other party ticked failed RLS, and
--    clients wrote full-row snapshots. done_by / done_at are now stamped by a
--    trigger (who ticked, server time; a note edit keeps the original stamp),
--    so the policies only need membership.

-- ── 1. Archive duplicate (lease_id, due_date) rows, keep the best one ───────────
create table if not exists public.rent_payments_dedupe_20261001 (like public.rent_payments including defaults);
alter table public.rent_payments_dedupe_20261001 add column if not exists archived_at timestamptz not null default now();
alter table public.rent_payments_dedupe_20261001 enable row level security;
revoke all on table public.rent_payments_dedupe_20261001 from anon, authenticated;
grant all on table public.rent_payments_dedupe_20261001 to service_role;

-- Keep a recorded row over a placeholder, then the earliest record, then the oldest row.
with ranked as (
  select id, row_number() over (
           partition by lease_id, due_date
           order by coalesce(status in ('paid', 'late'), false) desc,
                    (paid_at is not null) desc,
                    paid_at asc nulls last,
                    created_at asc nulls last,
                    id asc
         ) as rn
    from public.rent_payments
   where lease_id is not null
),
moved as (
  delete from public.rent_payments rp
   using ranked r
   where rp.id = r.id and r.rn > 1
  returning rp.*
)
insert into public.rent_payments_dedupe_20261001
select moved.*, now() from moved;

create unique index if not exists rent_payments_lease_due_uniq
  on public.rent_payments (lease_id, due_date);

-- Members write the ledger only through mark_rent_paid() (review 2026-10-01). The
-- 2026-08-03 direct-insert policy checked membership only: any member could write
-- {status:'paid', paid_at:<the due date>} for a period paid late, a future period
-- or one before the lease — skipping every check below, and mark_rent_paid's
-- ON CONFLICT would then never re-stamp it. Those rows feed the s.58 lateness
-- count and the public passport. The only other writer is the e-sign route
-- (service role), which RLS does not affect.
drop policy if exists rent_household_members_insert on public.rent_payments;

-- ── 2. mark_rent_paid(lease, due, paid_on) ─────────────────────────────────────
-- An earlier two-argument draft would sit beside the three-argument version and make
-- PostgREST's named-argument call ambiguous.
drop function if exists public.mark_rent_paid(uuid, date);
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
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_lease is null or p_due is null then
    raise exception 'bad_request' using errcode = '22023';
  end if;
  select h.* into v_hh
    from public.households h
   where h.current_lease_id = p_lease and public.is_household_member(h.id)
   limit 1;
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
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
      -- The current lease's term: a renewal keeps the household's original start, but its
      -- ledger is the new lease's (rows are keyed by lease_id).
      v_term_start := greatest(v_hh.start_date, (select ld.start_date from public.lease_documents ld where ld.id = p_lease));
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
    v_amount := coalesce(v_row.amount, v_hh.monthly_rent,
                         (select ld.monthly_rent from public.lease_documents ld where ld.id = p_lease));
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

-- ── 3. move_in_checklist: server-stamped ticks, membership-only policies ──────
create or replace function public.guard_move_in_checklist()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.is_direct_client_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.done then
      new.done_by := auth.uid(); new.done_at := now();
    else
      new.done_by := null; new.done_at := null;
    end if;
  else
    new.household_id := old.household_id;
    new.item_key := old.item_key;
    if new.done is distinct from old.done then
      if new.done then
        new.done_by := auth.uid(); new.done_at := now();
      else
        new.done_by := null; new.done_at := null;
      end if;
    else
      -- A note edit (or a stale "tick" of an already ticked item) keeps who ticked and when.
      new.done_by := old.done_by; new.done_at := old.done_at;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.guard_move_in_checklist() from public, anon, authenticated;

drop trigger if exists trg_guard_move_in_checklist on public.move_in_checklist;
create trigger trg_guard_move_in_checklist
  before insert or update on public.move_in_checklist
  for each row execute function public.guard_move_in_checklist();

drop policy if exists move_in_member_write on public.move_in_checklist;
create policy move_in_member_write on public.move_in_checklist
  for insert to authenticated with check (public.is_household_member(household_id));
drop policy if exists move_in_member_update on public.move_in_checklist;
create policy move_in_member_update on public.move_in_checklist
  for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

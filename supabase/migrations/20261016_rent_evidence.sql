-- 2026-10-16 (V1.0 阶段 3 · 甲 #4 · G9) — every rent period can carry evidence:
-- who recorded it, the OTHER side's confirmation, and a receipt file.
--
-- rent_payments already has one row per (lease_id, due_date); tenant_id is the
-- RECORDER (mark_rent_paid writes auth.uid() there, whatever the member's role).
-- Three marks are added to the row and nothing is ever removed:
--   confirmed_by / confirmed_at — confirm_rent_payment(), by a member who is NOT
--     the recorder (a self-confirmation is worth nothing in a dispute);
--   evidence_* — written only by the service role from /api/rent/evidence, which
--     computes the SHA-256 server-side and stores the file in the private
--     tenancy-files bucket under <household>/rent/<lease>/; members read it
--     through the existing tenancy_files_member_read policy;
--   note — a short line the attaching member adds ("e-transfer ref 1234").
-- Members keep SELECT only on the table (no UPDATE policy exists), so the only
-- writers remain the two definer RPCs and the server. Stayloop still moves no money.
--
-- The two lifecycle facts RPCs are re-created verbatim from 20261006_facts_lease_place
-- with the evidence columns added to rent_month (landlord) and rent_all (tenant);
-- `language sql` validates columns at definition time, so the ALTER comes first.

-- ── 1. Columns ─────────────────────────────────────────────────────────────────
alter table public.rent_payments
  add column if not exists confirmed_by uuid,
  add column if not exists confirmed_at timestamptz,
  add column if not exists evidence_path text,
  add column if not exists evidence_sha256 text,
  add column if not exists evidence_name text,
  add column if not exists evidence_size integer,
  add column if not exists evidence_mime text,
  add column if not exists evidence_by uuid,
  add column if not exists evidence_at timestamptz,
  add column if not exists note text;

alter table public.rent_payments drop constraint if exists rent_payments_evidence_name_len;
alter table public.rent_payments add constraint rent_payments_evidence_name_len
  check (evidence_name is null or char_length(evidence_name) <= 160);
alter table public.rent_payments drop constraint if exists rent_payments_evidence_mime_len;
alter table public.rent_payments add constraint rent_payments_evidence_mime_len
  check (evidence_mime is null or char_length(evidence_mime) <= 80);
alter table public.rent_payments drop constraint if exists rent_payments_evidence_sha256_fmt;
alter table public.rent_payments add constraint rent_payments_evidence_sha256_fmt
  check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$');
alter table public.rent_payments drop constraint if exists rent_payments_note_len;
alter table public.rent_payments add constraint rent_payments_note_len
  check (note is null or char_length(note) <= 200);

-- ── 2. confirm_rent_payment(lease, due) — the other side's confirmation ────────
-- Same membership test as mark_rent_paid (the household whose current, previous
-- or next lease this is, and the caller an active member). The row must exist
-- and be recorded (paid / late); the caller must not be the recorder
-- (`self_confirm`); a second confirmation is idempotent (the first stamp stays).
create or replace function public.confirm_rent_payment(p_lease uuid, p_due date)
returns public.rent_payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hh public.households%rowtype;
  v_row public.rent_payments%rowtype;
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_lease is null or p_due is null then
    raise exception 'bad_request' using errcode = '22023';
  end if;
  select h.* into v_hh
    from public.households h
   where (h.current_lease_id = p_lease or h.previous_lease_id = p_lease or h.next_lease_id = p_lease)
     and public.is_household_member(h.id)
   limit 1;
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select * into v_row from public.rent_payments
   where lease_id = p_lease and due_date = p_due
   for update;
  if not found or v_row.status is null or v_row.status not in ('paid', 'late') then
    raise exception 'not_recorded' using errcode = '22023';
  end if;
  if v_row.confirmed_by is not null then
    return v_row;
  end if;
  if v_row.tenant_id is not null and v_row.tenant_id = v_uid then
    raise exception 'self_confirm' using errcode = '22023';
  end if;

  update public.rent_payments
     set confirmed_by = v_uid, confirmed_at = now()
   where id = v_row.id
  returning * into v_row;

  -- The hat the confirming member wears in this tenancy (property manager counts as landlord).
  select case when m.role in ('landlord', 'property_manager') then 'landlord'
              when m.role = 'agent' then 'agent' else 'tenant' end
    into v_role
    from public.household_members m
   where m.household_id = v_hh.id and m.user_id = v_uid and m.status = 'active'
   limit 1;

  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, acting_role, matter_type, matter_id, metadata)
  values (v_uid, 'user', 'rent_confirmed', 'rent_payment', v_row.id, v_role, 'lease', p_lease,
          jsonb_build_object('lease_id', p_lease, 'household_id', v_hh.id, 'due_date', to_char(p_due, 'YYYY-MM-DD'),
                             'recorded_by', v_row.tenant_id, 'status', v_row.status));

  return v_row;
end $$;

revoke all on function public.confirm_rent_payment(uuid, date) from public, anon, authenticated;
grant execute on function public.confirm_rent_payment(uuid, date) to authenticated, service_role;

-- ── 3. Facts RPCs — verbatim 20261006_facts_lease_place + evidence columns ──────
create or replace function public.lifecycle_facts_landlord()
returns jsonb language sql stable security invoker set search_path = public as $$
  with me as (select auth.uid() as uid),
  ll as (select id from landlords where id = (select uid from me) or auth_id = (select uid from me)),
  lst as (select id, address, unit, verification_status, is_active, source from listings where landlord_id in (select id from ll) limit 200),
  cards as (select action_type, status, metadata, executed_at,
                   case when execution_result is null then null
                        else jsonb_build_object('ok', execution_result -> 'ok', 'reason', execution_result -> 'reason') end as execution_result
              from agent_pending_actions
             where user_id = (select uid from me) and action_type in ('showing_request','listing_inquiry','send_renewal_letter','renewal_checkpoint')
             order by created_at desc limit 200),
  lse as (select l.id, l.status, l.start_date, l.end_date, l.unit_label, l.tenant_name, l.tenant_email, l.monthly_rent, l.application_id, l.listing_id, l.sent_at, l.signed_at, l.created_at,
                 (select jsonb_build_object('province', li.province, 'address', li.address, 'city', li.city, 'postal_code', li.postal_code)
                    from listings li where li.id = l.listing_id) as listing_place,
                 case when l.terms ? 'unit' then jsonb_build_object('street', l.terms -> 'unit' ->> 'street', 'city', l.terms -> 'unit' ->> 'city', 'postal', l.terms -> 'unit' ->> 'postal') end as unit_place
            from lease_documents l where l.landlord_id in (select id from ll) limit 200),
  -- Households where this account is the landlord: created by it, tied to one of
  -- its leases, or where it is an active landlord / PM member.
  hh as (select id, current_lease_id, verified, status, end_date, address, unit, city, monthly_rent, created_by from households
          where created_by = (select uid from me) or current_lease_id in (select id from lse)
             or id in (select household_id from household_members where user_id = (select uid from me) and role in ('landlord','property_manager') and status = 'active')
          limit 200),
  apps as (select id, listing_id, status, decision_notified_at, screened_at, archived_at, created_at from applications where listing_id in (select id from lst) limit 300),
  rent as (select lease_id, due_date, status, amount from rent_payments
            where lease_id in (select id from lse) and status in ('due','late') limit 100),
  rent_month as (select lease_id, due_date, status, amount, tenant_id as recorded_by, confirmed_by, confirmed_at, evidence_path, evidence_name, evidence_at, note from rent_payments
            where lease_id in (select id from lse)
              and due_date >= date_trunc('month', current_date)::date
              and due_date < (date_trunc('month', current_date) + interval '1 month')::date limit 200),
  tix as (select household_id, status from maintenance_tickets where household_id in (select id from hh) limit 200),
  intents as (select household_id, lease_id, intent from renewal_intents where household_id in (select id from hh)
               order by created_at desc limit 100),
  scr as (select application_id, status from screenings where application_id in (select id from apps) limit 300)
  select jsonb_build_object(
    'listings', coalesce((select jsonb_agg(to_jsonb(x)) from lst x), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg(to_jsonb(x)) from cards x), '[]'::jsonb),
    'leases', coalesce((select jsonb_agg(to_jsonb(x)) from lse x), '[]'::jsonb),
    'households', coalesce((select jsonb_agg(to_jsonb(x)) from hh x), '[]'::jsonb),
    'applications', coalesce((select jsonb_agg(to_jsonb(x)) from apps x), '[]'::jsonb),
    'rent', coalesce((select jsonb_agg(to_jsonb(x)) from rent x), '[]'::jsonb),
    'rent_month', coalesce((select jsonb_agg(to_jsonb(x)) from rent_month x), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(x)) from tix x), '[]'::jsonb),
    'intents', coalesce((select jsonb_agg(to_jsonb(x)) from intents x), '[]'::jsonb),
    'screenings', coalesce((select jsonb_agg(to_jsonb(x)) from scr x), '[]'::jsonb)
  )
$$;

create or replace function public.lifecycle_facts_tenant()
returns jsonb language sql stable security invoker set search_path = public as $$
  with me as (select auth.uid() as uid, lower(coalesce(auth.jwt() ->> 'email', '')) as email),
  t as (select id, tier from tenants where auth_id = (select uid from me) limit 1),
  apps as (select id, status, created_at, move_in_date, viewed_at, screened_at, decision_notified_at, listing_id,
                  listing_slug, listing_address, listing_unit, listing_active, files_count, decision_reason
             from applicant_applications order by created_at desc limit 50),
  lse as (select l.id, l.status, l.start_date, l.end_date, l.unit_label, l.tenant_name, l.monthly_rent, l.application_id, l.listing_id, l.sent_at, l.signed_at, l.created_at,
                 (select jsonb_build_object('province', li.province, 'address', li.address, 'city', li.city, 'postal_code', li.postal_code)
                    from listings li where li.id = l.listing_id) as listing_place,
                 case when l.terms ? 'unit' then jsonb_build_object('street', l.terms -> 'unit' ->> 'street', 'city', l.terms -> 'unit' ->> 'city', 'postal', l.terms -> 'unit' ->> 'postal') end as unit_place
            from lease_documents l
           where ((select email from me) <> '' and lower(l.tenant_email) = (select email from me))
              or l.tenant_id in (select id from t)
           order by l.created_at desc limit 50),
  mem as (select household_id, role from household_members where user_id = (select uid from me) and status = 'active' limit 50),
  hh as (select id, current_lease_id, verified, status, end_date, address, unit, city, monthly_rent, created_by from households limit 50),
  inv as (select * from my_pending_invites()),
  lease_ids as (select id from lse union select current_lease_id from hh where current_lease_id is not null),
  sh as (select kind, status from showing_intents where tenant_id in (select id from t) limit 50),
  rent as (select lease_id, due_date, status, amount from rent_payments
            where lease_id in (select id from lease_ids) and status in ('due','late') limit 100),
  rent_all as (select id, lease_id, due_date, status, amount, paid_at, method, tenant_id as recorded_by, confirmed_by, confirmed_at, evidence_path, evidence_name, evidence_at, note from rent_payments
            where lease_id in (select current_lease_id from hh where current_lease_id is not null and id in (select household_id from mem where role = 'tenant'))
            order by due_date desc limit 36),
  tix as (select household_id, status from maintenance_tickets where household_id in (select id from hh) limit 100),
  intent as (select intent, created_at from renewal_intents
              where tenant_user_id = (select uid from me) and household_id in (select id from hh)
              order by created_at desc limit 1)
  select jsonb_build_object(
    'tier', (select tier from t),
    'applications', coalesce((select jsonb_agg(to_jsonb(x)) from apps x), '[]'::jsonb),
    'leases', coalesce((select jsonb_agg(to_jsonb(x)) from lse x), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(household_id) from mem), '[]'::jsonb),
    'member_roles', coalesce((select jsonb_agg(to_jsonb(x)) from mem x), '[]'::jsonb),
    'households', coalesce((select jsonb_agg(to_jsonb(x)) from hh x), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(to_jsonb(x)) from inv x), '[]'::jsonb),
    'shares', (select count(*) from passport_share_tokens where tenant_user_id = (select uid from me) and revoked_at is null),
    'showings', coalesce((select jsonb_agg(to_jsonb(x)) from sh x), '[]'::jsonb),
    'rent', coalesce((select jsonb_agg(to_jsonb(x)) from rent x), '[]'::jsonb),
    'rent_all', coalesce((select jsonb_agg(to_jsonb(x)) from rent_all x), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(x)) from tix x), '[]'::jsonb),
    'intent', (select to_jsonb(x) from intent x)
  )
$$;

revoke all on function public.lifecycle_facts_landlord() from public, anon;
revoke all on function public.lifecycle_facts_tenant() from public, anon;
grant execute on function public.lifecycle_facts_landlord() to authenticated;
grant execute on function public.lifecycle_facts_tenant() to authenticated;

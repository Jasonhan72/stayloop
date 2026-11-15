-- Code review 2026-11-15 (design/code-review-2026-11-15.md): the database half of the
-- remaining items — S2-6, S2-9, and S3-7 / 12 / 15 / 16 / 17 / 18.

-- ── S2-6 · a delegation opens the client's matters only when its scope says so ──
-- matter_party() and my_matters() looked only at "is there a live delegation from
-- one of the parties". The scope the client confirmed has three separate items
-- (lib/delegations/shared.ts): leasing, home search, and「事务跟进 / Matter
-- follow-up — enter the client's rental matters and threads」. A client who ticked
-- only the first two still handed over every matter: full thread text, work-order
-- conversations and the rent ledger through /api/matters/export. The matter item
-- is now what it says: no 'matter' in scope, no matter access. (All three
-- delegations on record carry it; ProposeDelegation ticks it by default.)
create or replace function public.matter_party(p_matter uuid)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare m record; uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then return null; end if;
  select * into m from public.rental_matters where id = p_matter;
  if not found then return null; end if;
  if public.is_stayloop_admin() then return 'admin'; end if;
  if m.landlord_auth_id = uid then return 'landlord'; end if;
  if m.tenant_auth_id = uid or (em <> '' and lower(m.tenant_email) = em) then return 'tenant'; end if;
  if exists (
    select 1 from public.delegations d
     where d.delegate_auth_id = uid and d.status = 'active' and d.expires_at > now()
       and 'matter' = any (coalesce(d.scope, '{}'::text[]))
       and (d.principal_auth_id = m.landlord_auth_id or (m.tenant_auth_id is not null and d.principal_auth_id = m.tenant_auth_id) or (m.tenant_email is not null and lower(d.principal_email) = lower(m.tenant_email)))
  ) then return 'agent'; end if;
  return null;
end $function$;

create or replace function public.my_matters()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', '')); r record;
begin
  if uid is null then return '[]'::jsonb; end if;
  for r in select a.id from public.applications a join public.listings l on l.id = a.listing_id
            where l.landlord_id = uid or l.landlord_id in (select id from public.landlords where auth_id = uid) or (em <> '' and lower(a.email) = em)
  loop perform public.ensure_matter('application', r.id); end loop;
  for r in select d.id from public.lease_documents d
            where d.landlord_id = uid or d.landlord_id in (select id from public.landlords where auth_id = uid) or (em <> '' and lower(d.tenant_email) = em)
  loop perform public.ensure_matter('lease', r.id); end loop;
  for r in select h.id from public.households h join public.household_members mm on mm.household_id = h.id and mm.user_id = uid and mm.status = 'active'
  loop perform public.ensure_matter('household', r.id); end loop;
  return coalesce((
    select jsonb_agg(public.matter_summary(m.id) order by m.updated_at desc)
      from public.rental_matters m
     where m.landlord_auth_id = uid or m.tenant_auth_id = uid or (em <> '' and lower(m.tenant_email) = em)
        or exists (select 1 from public.delegations d where d.delegate_auth_id = uid and d.status = 'active' and d.expires_at > now()
                     and 'matter' = any (coalesce(d.scope, '{}'::text[]))
                     and (d.principal_auth_id = m.landlord_auth_id or (m.tenant_auth_id is not null and d.principal_auth_id = m.tenant_auth_id) or (m.tenant_email is not null and lower(d.principal_email) = lower(m.tenant_email))))
  ), '[]'::jsonb);
end $function$;

-- ── S2-9 · whose verification is it ───────────────────────────────────────────
-- verification_requests.tenant_email is typed by the landlord who starts the
-- request; the passport API and the passport page matched on it, so one person's
-- identity / bank result could be reported under another account. The request
-- now carries the account it belongs to, set by /api/verify/<token>/consent when
-- the person consenting is signed in to the account that owns that (confirmed)
-- address. Only bound requests reach a passport. Writes stay service-role only.
alter table public.verification_requests add column if not exists tenant_auth_id uuid;
create index if not exists verification_requests_tenant_auth_idx on public.verification_requests (tenant_auth_id) where tenant_auth_id is not null;
-- The applicant reads their own bound requests (the passport page shows which steps are done).
drop policy if exists "Applicants read own bound verification requests" on public.verification_requests;
create policy "Applicants read own bound verification requests" on public.verification_requests
  for select to authenticated
  using (tenant_auth_id is not null and tenant_auth_id = (select auth.uid()));

-- ── S3-7 · an automatic email reply is logged as such ─────────────────────────
alter table public.thread_inbound drop constraint if exists thread_inbound_outcome_check;
alter table public.thread_inbound add constraint thread_inbound_outcome_check
  check (outcome in ('recorded', 'unknown_token', 'sender_mismatch', 'empty', 'revoked', 'auto_reply', 'error'));

-- ── S3-12 · one payment, one unlock: ledger, grant and stamp in one transaction ─
-- The webhook wrote the ledger row, granted, then stamped fulfilled_at in three
-- separate requests. A worker that died after the grant and before the stamp left
-- an unfulfilled ledger row; Stripe's retry then granted again (the screening was
-- already unlocked, so the retry fell through to "prepaid credit" — one payment,
-- one unlock plus one credit). Here all three happen or none does.
create or replace function public.fulfil_unlock_payment(p_event_id text, p_event_type text, p_landlord_id uuid, p_screening_id uuid, p_payer text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_done timestamptz; v_rows int := 0;
begin
  if coalesce(p_event_id, '') = '' or p_landlord_id is null then raise exception 'event id and landlord id are required'; end if;
  insert into public.stripe_events (id, type) values (p_event_id, coalesce(p_event_type, 'unknown')) on conflict (id) do nothing;
  select fulfilled_at into v_done from public.stripe_events where id = p_event_id for update;
  if v_done is not null then return 'already'; end if;
  if p_screening_id is not null then
    update public.screenings
       set unlocked_at = now(), unlock_paid_by = case when p_payer = 'tenant' then 'tenant' else 'landlord' end
     where id = p_screening_id and unlocked_at is null;
    get diagnostics v_rows = row_count;
  end if;
  if v_rows = 0 then
    -- No such screening any more, or it was unlocked another way: the payment becomes a prepaid credit.
    update public.landlords set unlock_credits = coalesce(unlock_credits, 0) + 1 where id = p_landlord_id;
    get diagnostics v_rows = row_count;
    update public.stripe_events set fulfilled_at = now() where id = p_event_id;
    -- The account is gone (admin_delete_user): nothing can be granted and a retry would not help.
    -- Stamped so Stripe stops retrying; the webhook reports it.
    if v_rows = 0 then return 'no_landlord'; end if;
    return 'credited';
  end if;
  update public.stripe_events set fulfilled_at = now() where id = p_event_id;
  return 'unlocked';
end $function$;
revoke execute on function public.fulfil_unlock_payment(text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fulfil_unlock_payment(text, text, uuid, uuid, text) to service_role;

-- ── S3-15 · the demo seed is gone ─────────────────────────────────────────────
-- seed_demo_agent_data() was executable by every signed-in account and wrote five
-- invented preferences («最低 720», «DTI ≤ 35%» …) into the caller's real memory plus
-- a card no executor can run. Nothing has called it since the sample pages moved
-- to client-side demo data; the loader option that reached it is removed too.
drop function if exists public.seed_demo_agent_data(text);

-- ── S3-16 · email_unsubscribes: a dead table anyone could write to ────────────
-- INSERT … WITH CHECK (true) for everyone; no code reads or writes the table
-- (0 rows). The table stays, the open door does not.
drop policy if exists "Anyone can unsubscribe with token" on public.email_unsubscribes;
revoke all on public.email_unsubscribes from anon, authenticated;

-- ── S3-17 · an expired or revoked invite cannot dispute a tenancy ─────────────
-- decline_household_invite() checked only "not accepted": a token that was
-- revoked or had run out still flipped the managed tenancy to 'disputed'.
create or replace function public.decline_household_invite(p_token text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inv record;
begin
  select * into v_inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  if v_inv.accepted_at is not null then raise exception 'already accepted'; end if;
  if v_inv.revoked_at is not null then raise exception 'invite revoked'; end if;
  -- Declined before: nothing more to do (the first decline already did it).
  if v_inv.declined_at is not null then return; end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then raise exception 'invite expired'; end if;
  update public.household_invites set declined_at = now() where id = v_inv.id;
  update public.households set status = 'disputed' where id = v_inv.household_id and status = 'active';
end $function$;

-- ── S3-18 · public listings = active AND verified, nothing else ───────────────
-- The policy still let an imported Realtor.ca row through unverified. Those
-- imports were archived on 2026-10-13 (0 rows match today).
drop policy if exists "Public can read verified listings" on public.listings;
create policy "Public can read verified listings" on public.listings
  for select to public
  using (is_active = true and verification_status = 'verified');

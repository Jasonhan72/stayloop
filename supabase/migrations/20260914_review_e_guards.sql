-- Full-site review 2026-09-14 (slices A, C, E): lease e-sign integrity,
-- agent directory exposure, unlock credit atomicity, RECO number squatting,
-- anonymous application file attachment, household invite hat side-effect.

-- 1. lease_documents: signatures / status / terms are written by the e-sign
--    routes with the service role. The single FOR ALL party policy let a
--    landlord forge the tenant's signature or rewrite signed terms from the
--    browser.
create or replace function public.guard_lease_document_fields()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_direct_client_write() then return new; end if;
  new.landlord_signature := old.landlord_signature;
  new.tenant_signature := old.tenant_signature;
  new.signed_at := old.signed_at;
  new.sign_token := old.sign_token;
  if old.signed_at is not null or old.landlord_signature is not null or old.tenant_signature is not null then
    -- once anyone has signed, the paper is frozen
    new.terms := old.terms;
    new.tenant_email := old.tenant_email;
    new.tenant_name := old.tenant_name;
    new.unit_label := old.unit_label;
    new.monthly_rent := old.monthly_rent;
    new.start_date := old.start_date;
    new.end_date := old.end_date;
    new.status := old.status;
    new.form_type := old.form_type;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_lease_document on public.lease_documents;
create trigger trg_guard_lease_document
  before update on public.lease_documents
  for each row execute function public.guard_lease_document_fields();

-- 2. agent_profiles: the public directory is a VIEW of the public columns of
--    verified rows. The table-wide anon grant + status='verified' policy
--    exposed review_note / trade_name / verified_by to anyone.
drop policy if exists agent_profiles_public_verified on public.agent_profiles;
revoke select on public.agent_profiles from anon;
create or replace view public.agent_directory
with (security_invoker = false) as
  select ap.auth_id, l.id as landlord_id, ap.legal_name, ap.reco_number, ap.category, ap.brokerage_name,
         ap.business_email, ap.business_phone, ap.crea_member, ap.verified_at, ap.status
    from public.agent_profiles ap
    left join public.landlords l on l.auth_id = ap.auth_id
   where ap.status = 'verified';
grant select on public.agent_directory to anon, authenticated;

-- 3. RECO number uniqueness only among verified rows: an unverified row
--    could squat a real registrant's number forever.
alter table public.agent_profiles drop constraint if exists agent_profiles_reco_number_key;
drop index if exists agent_profiles_reco_number_key;
create unique index if not exists agent_profiles_reco_number_verified_key
  on public.agent_profiles (reco_number) where status = 'verified';

-- 4. consume_unlock_credit: claim the screening first (atomic), then decrement
--    exactly one landlord row; two concurrent calls spent two credits.
create or replace function public.consume_unlock_credit(p_screening_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_landlord_id uuid;
  v_row uuid;
  v_claimed integer;
begin
  if v_user is null then return false; end if;
  select s.landlord_id into v_landlord_id from public.screenings s where s.id = p_screening_id;
  if v_landlord_id is null then return false; end if;
  if not exists (
    select 1 from public.landlords l
     where (l.auth_id = v_user or l.id = v_user)
       and (l.id = v_landlord_id or l.auth_id = v_landlord_id)
  ) and v_landlord_id <> v_user then
    return false;
  end if;
  -- already unlocked → nothing to spend
  if exists (select 1 from public.screenings where id = p_screening_id and unlocked_at is not null) then return true; end if;
  select l.id into v_row from public.landlords l
   where (l.auth_id = v_user or l.id = v_user) and l.unlock_credits > 0
   order by (l.auth_id = v_user) desc, l.created_at asc
   limit 1
   for update skip locked;
  if v_row is null then return false; end if;
  update public.screenings set unlocked_at = now(), unlock_paid_by = 'landlord'
   where id = p_screening_id and unlocked_at is null;
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then return true; end if;
  update public.landlords set unlock_credits = unlock_credits - 1 where id = v_row;
  return true;
end $$;

-- 4b. grant_unlock_credit: the webhook's prepaid-credit path, atomic.
create or replace function public.grant_unlock_credit(p_landlord_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.landlords set unlock_credits = coalesce(unlock_credits, 0) + 1 where id = p_landlord_id;
$$;
revoke execute on function public.grant_unlock_credit(uuid) from public, anon, authenticated;
grant execute on function public.grant_unlock_credit(uuid) to service_role;

-- 5. attach_application_files: anonymous applicants have no UPDATE policy on
--    applications, so the client's `update({files})` matched zero rows and
--    every uploaded document was orphaned. The RPC attaches a manifest to a
--    fresh (<1h), still-empty row only, and only paths under that application.
create or replace function public.attach_application_files(p_application_id uuid, p_files jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
  f jsonb;
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 or jsonb_array_length(p_files) > 20 then
    return false;
  end if;
  for f in select * from jsonb_array_elements(p_files) loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    if coalesce(f->>'path', '') not like p_application_id::text || '/%' then return false; end if;
    if position('..' in coalesce(f->>'path', '')) > 0 then return false; end if;
  end loop;
  update public.applications
     set files = p_files
   where id = p_application_id
     and (files is null or files = '[]'::jsonb)
     and created_at > now() - interval '1 hour';
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;
revoke execute on function public.attach_application_files(uuid, jsonb) from public;
grant execute on function public.attach_application_files(uuid, jsonb) to anon, authenticated, service_role;

-- 6. accept_household_invite: a tenant accepting an invite must not gain the
--    landlord hat (my_hats.landlord = a landlords row exists).
create or replace function public.accept_household_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  if v_inv.revoked_at is not null then raise exception 'invite revoked'; end if;
  if v_inv.expires_at < now() then raise exception 'invite expired'; end if;
  if v_inv.accepted_at is not null and v_inv.accepted_by <> v_uid then
    raise exception 'invite already used';
  end if;

  if v_inv.invited_role in ('landlord', 'property_manager') then
    select email into v_email from auth.users where id = v_uid;
    if not exists (select 1 from public.landlords where auth_id = v_uid) then
      insert into public.landlords (auth_id, email, plan, role)
      values (v_uid, coalesce(v_email, 'guest_' || v_uid::text || '@stayloop.local'), 'free', 'landlord')
      on conflict do nothing;
    end if;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_inv.household_id, v_uid, v_inv.invited_role)
  on conflict (household_id, user_id) do update set status = 'active';

  update public.household_invites
     set accepted_by = v_uid, accepted_at = coalesce(accepted_at, now())
   where id = v_inv.id;

  return v_inv.household_id;
end $$;

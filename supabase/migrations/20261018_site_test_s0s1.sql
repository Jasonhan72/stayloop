-- Site test 2026-10-17 · S0 / S1 database fixes (T4-01, T4-02, T4-03, T4-04, T6-D2).
-- Every statement here was first run inside a rollback transaction on prod.

-- ── T4-01 (S0) · definer views must never be writable ────────────────────────
-- provider_directory is a single-table view with security_invoker=false and the default
-- privileges handed authenticated INSERT/UPDATE/DELETE: any signed-in user could edit or
-- delete a verified provider through it. Same root cause as applicant_applications (09-25).
revoke insert, update, delete, truncate, references, trigger on public.provider_directory from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.provider_credentials_public from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.agent_directory from public, anon, authenticated;

-- ── T4-02 (S1) · anonymous applications broken since 2026-10-11 ──────────────
-- The anon INSERT policy on applications subqueried listings directly; 20261011_listings_anon_no_select
-- revoked anon's SELECT on listings, so every anonymous application failed with 42501.
-- The listing check now runs in a SECURITY DEFINER helper (same pattern as recent_application_count).
create or replace function public.listing_accepts_applications(p_listing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.listings l
     where l.id = p_listing and coalesce(l.is_active, true) = true
  );
$$;
revoke execute on function public.listing_accepts_applications(uuid) from public, anon, authenticated;
grant execute on function public.listing_accepts_applications(uuid) to anon, authenticated, service_role;

drop policy if exists "Public can insert applications (constrained)" on public.applications;
create policy "Public can insert applications (constrained)" on public.applications
  for insert with check (
    public.listing_accepts_applications(listing_id)
    and email is not null and email <> ''
    and phone is not null and phone <> ''
    and ai_score is null and ai_summary is null and ai_income_score is null and ai_employment_score is null
    and ai_rental_history_score is null and ai_ltb_score is null and ai_reference_score is null
    and status is distinct from 'scored'
    and public.recent_application_count(listing_id) < 30
    and consent_screening = true
  );
-- The landlord FOR ALL policy also subqueries listings and was bound to {public}: permissive
-- policies are OR-ed into one expression, so for an anon INSERT its subselect still raised
-- 42501 even after the helper above. It only ever applies to signed-in landlords.
alter policy "Landlords see own applications" on public.applications to authenticated;

-- ── T4-03 (S1) · a member cannot promote themselves to landlord ──────────────
-- household_members_leave (UPDATE, user_id = auth.uid()) had no column restriction, so a tenant
-- member could set role='landlord' and then dispatch work orders / approve quotes as the landlord.
-- Direct client writes may only change `status` (active → left). RPCs run as owner and are unaffected.
create or replace function public.guard_household_member_update()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if public.is_direct_client_write() then
    if new.role is distinct from old.role
       or new.household_id is distinct from old.household_id
       or new.user_id is distinct from old.user_id
       or new.joined_at is distinct from old.joined_at then
      raise exception 'household_member_fields_frozen' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_household_member_update() from public, anon, authenticated, service_role;
drop trigger if exists trg_guard_household_member_update on public.household_members;
create trigger trg_guard_household_member_update
  before update on public.household_members
  for each row execute function public.guard_household_member_update();

-- ── T6-D2 (S1) · the tenant's signing token is not a landlord-readable column ─
-- lease_documents.sign_token was selectable by authenticated/anon; a landlord reading their own
-- lease row got the tenant's capability token and could sign as the tenant. The token now reaches
-- the tenant only by email (sendLease / resend); /api/lease/view and /api/lease/sign use service role.
revoke select on public.lease_documents from anon, authenticated;
grant select (id, application_id, listing_id, tenant_id, landlord_id, status, pdf_path, monthly_rent, start_date, end_date,
  signed_at, created_at, tenant_name, tenant_email, unit_label, form_type, terms, landlord_signature, tenant_signature, sent_at)
  on public.lease_documents to anon, authenticated;

-- ── T4-04 (S2) · corrections follow their screening when it is deleted ───────
-- consumer_append_only raised on every DELETE, including the FK cascade from screenings, so a
-- screening with a correction could never be deleted (DELETE /api/screening/<id> — the applicant
-- data-deletion path). Cascaded deletes run at trigger depth > 1; direct deletes stay refused.
create or replace function public.consumer_append_only()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'append_only' using errcode = 'P0001';
end $$;

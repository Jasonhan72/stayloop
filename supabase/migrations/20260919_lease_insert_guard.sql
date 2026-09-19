-- Review 2026-09-19 (security slice, finding 1): the lease guard fired on
-- UPDATE only and `leases_parties` was FOR ALL with no WITH CHECK, so
--   a) a landlord could INSERT a row already `signed_both` with a forged
--      tenant_signature and a sign_token of their choosing, and
--   b) any account with a tenants row could INSERT a lease carrying a
--      victim's landlord_id (public via listings.landlord_id) — a forged
--      executed lease appearing in someone else's workspace.
-- Fix: guard INSERT too (direct client inserts can never carry signatures,
-- tokens or a signed status) and split the policy — landlord side writes,
-- tenant side reads; executed leases cannot be deleted by a client.

create or replace function public.guard_lease_document_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.landlord_signature := null;
    new.tenant_signature := null;
    new.signed_at := null;
    new.sign_token := null;
    new.sent_at := null;
    -- The two statuses the app inserts from the browser: a draft to be sent,
    -- or the landlord's own record of an existing tenancy.
    if new.status is null or new.status not in ('draft', 'active') then
      new.status := 'draft';
    end if;
    return new;
  end if;
  new.landlord_signature := old.landlord_signature;
  new.tenant_signature := old.tenant_signature;
  new.signed_at := old.signed_at;
  new.sign_token := old.sign_token;
  new.landlord_id := old.landlord_id;
  new.sent_at := old.sent_at;
  -- Signed / sent states are reached only through the send and sign routes
  -- (service role); a browser can move a lease between draft/active/ended.
  if new.status is distinct from old.status and new.status not in ('draft', 'active', 'ended') then
    new.status := old.status;
  end if;
  -- Terms freeze from the moment the lease is SENT, not just once signed:
  -- the tenant must sign what they were shown (review 2026-09-19, slice E #9).
  if old.sent_at is not null or old.signed_at is not null or old.landlord_signature is not null or old.tenant_signature is not null then
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
end $function$;

drop trigger if exists trg_guard_lease_document on public.lease_documents;
create trigger trg_guard_lease_document
  before insert or update on public.lease_documents
  for each row execute function public.guard_lease_document_fields();

drop policy if exists leases_parties on public.lease_documents;

create policy leases_parties_read on public.lease_documents
  for select using (
    tenant_id in (select id from public.tenants where auth_id = auth.uid())
    or landlord_id in (select id from public.landlords where auth_id = auth.uid())
  );

create policy leases_landlord_insert on public.lease_documents
  for insert with check (
    landlord_id in (select id from public.landlords where auth_id = auth.uid())
  );

create policy leases_landlord_update on public.lease_documents
  for update using (
    landlord_id in (select id from public.landlords where auth_id = auth.uid())
  ) with check (
    landlord_id in (select id from public.landlords where auth_id = auth.uid())
  );

create policy leases_landlord_delete on public.lease_documents
  for delete using (
    landlord_id in (select id from public.landlords where auth_id = auth.uid())
    and signed_at is null and landlord_signature is null and tenant_signature is null
  );

-- Slice E #10: an agent could write action='verified' about themselves.
drop policy if exists agent_events_admin_write on public.agent_verification_events;
create policy agent_events_admin_write on public.agent_verification_events
  for insert with check (
    public.is_stayloop_admin()
    or (auth.uid() = agent_auth_id and actor = auth.uid() and action in ('submitted', 'edited'))
  );

-- Slice E #4: one RECO number, one live profile.
create unique index if not exists agent_profiles_reco_live_uniq on public.agent_profiles (reco_number)
  where status in ('pending', 'verified', 'renewal_due');

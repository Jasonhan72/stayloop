-- 2026-09-24 (V0.6) — one round trip for the lifecycle rail.
-- useLifecycle ran four sequential waves for a landlord (landlords → listings /
-- cards / leases / households → applications / rent / tickets / intents →
-- screenings) and two for a tenant; each wave pays the full network RTT.
-- These are SECURITY INVOKER: every read below goes through the caller's own
-- RLS exactly like the client queries did — the RPC only removes the hops.
-- The shapes match lib/lifecycle/stages.ts inputs; the client keeps the old
-- loaders as a fallback.

create or replace function public.lifecycle_facts_landlord()
returns jsonb language sql stable security invoker set search_path = public as $$
  with ll as (select id from landlords where id = auth.uid() or auth_id = auth.uid()),
  lst as (select id, verification_status, is_active from listings where landlord_id in (select id from ll) limit 200),
  cards as (select action_type, status, metadata from agent_pending_actions
             where user_id = auth.uid() and action_type in ('showing_request','listing_inquiry','send_renewal_letter','renewal_checkpoint') limit 200),
  lse as (select id, status, start_date, end_date, unit_label, tenant_name, monthly_rent from lease_documents
           where landlord_id in (select id from ll) limit 200),
  hh as (select id, current_lease_id, verified, status, end_date, address, unit, monthly_rent, created_by from households
          where created_by = auth.uid() or current_lease_id in (select id from lse) limit 200),
  apps as (select id, listing_id, status, decision_notified_at from applications where listing_id in (select id from lst) limit 300),
  rent as (select lease_id, due_date, status, amount from rent_payments
            where lease_id in (select id from lse) and status in ('due','late') limit 100),
  tix as (select household_id, status from maintenance_tickets where household_id in (select id from hh) limit 100),
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
    'tickets', coalesce((select jsonb_agg(to_jsonb(x)) from tix x), '[]'::jsonb),
    'intents', coalesce((select jsonb_agg(to_jsonb(x)) from intents x), '[]'::jsonb),
    'screenings', coalesce((select jsonb_agg(to_jsonb(x)) from scr x), '[]'::jsonb)
  )
$$;

create or replace function public.lifecycle_facts_tenant()
returns jsonb language sql stable security invoker set search_path = public as $$
  with me as (select auth.uid() as uid, lower(coalesce(auth.jwt() ->> 'email', '')) as email),
  t as (select id from tenants where auth_id = (select uid from me) limit 1),
  apps as (select id, status, decision_notified_at, viewed_at, screened_at from applicant_applications limit 50),
  lse as (select id, status, start_date, end_date, unit_label, tenant_name, monthly_rent from lease_documents
           where (select email from me) <> '' and lower(tenant_email) = (select email from me) limit 50),
  mem as (select household_id from household_members where user_id = (select uid from me) limit 50),
  hh as (select id, current_lease_id, verified, status, end_date, address, unit, monthly_rent, created_by from households limit 50),
  inv as (select * from my_pending_invites()),
  lease_ids as (select id from lse union select current_lease_id from hh where current_lease_id is not null),
  sh as (select kind, status from showing_intents where tenant_id in (select id from t) limit 50),
  rent as (select lease_id, due_date, status, amount from rent_payments
            where lease_id in (select id from lease_ids) and status in ('due','late') limit 100),
  tix as (select household_id, status from maintenance_tickets where household_id in (select id from hh) limit 100),
  intent as (select intent, created_at from renewal_intents
              where tenant_user_id = (select uid from me) and household_id in (select id from hh)
              order by created_at desc limit 1)
  select jsonb_build_object(
    'applications', coalesce((select jsonb_agg(to_jsonb(x)) from apps x), '[]'::jsonb),
    'leases', coalesce((select jsonb_agg(to_jsonb(x)) from lse x), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(household_id) from mem), '[]'::jsonb),
    'households', coalesce((select jsonb_agg(to_jsonb(x)) from hh x), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(to_jsonb(x)) from inv x), '[]'::jsonb),
    'shares', (select count(*) from passport_share_tokens where tenant_user_id = (select uid from me) and revoked_at is null),
    'showings', coalesce((select jsonb_agg(to_jsonb(x)) from sh x), '[]'::jsonb),
    'rent', coalesce((select jsonb_agg(to_jsonb(x)) from rent x), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(x)) from tix x), '[]'::jsonb),
    'intent', (select to_jsonb(x) from intent x)
  )
$$;

revoke all on function public.lifecycle_facts_landlord() from public, anon;
revoke all on function public.lifecycle_facts_tenant() from public, anon;
grant execute on function public.lifecycle_facts_landlord() to authenticated;
grant execute on function public.lifecycle_facts_tenant() to authenticated;

-- Site test 2026-10-17 · D-F-04: the tenant rent list (components/tenant/MyRent.tsx) now also lists the periods
-- nobody has recorded yet, from the same schedule as the landlord ledger. Its schedule inputs ride on the
-- facts payload (the one-facts-source rule): households gain previous / next lease, start date, due day.
create or replace function public.lifecycle_facts_tenant()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
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
  hh as (select id, current_lease_id, previous_lease_id, next_lease_id, start_date, rent_due_day, verified, status, end_date, address, unit, city, monthly_rent, created_by from households limit 50),
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
$function$;

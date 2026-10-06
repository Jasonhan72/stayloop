-- 2026-10-06 (V0.7) — the lifecycle facts carry where each lease is.
-- The rail's 租后 column spoke Ontario to everyone (N1 deadline, N9, s.38).
-- A lease outside Ontario now gets its province's own renewal timing
-- (lib/provinces/renewal), which needs the same three inputs the lease page
-- already uses to decide the province (lib/provinces/lease): the linked
-- listing's place, the lease's own §2 rental-unit block, and the household's
-- address (already returned). Same RPC bodies as 20261001_A5 (landlord) and
-- 20260926_facts_v2b (tenant) plus `listing_place` / `unit_place` on each lease
-- row; still SECURITY INVOKER — the listing subquery sees only what the
-- caller's RLS allows (a tenant's delisted listing comes back null and the
-- client falls through to the household address / the §2 block).

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
  rent_month as (select lease_id, due_date, status, amount from rent_payments
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
  rent_all as (select id, lease_id, due_date, status, amount, paid_at, method from rent_payments
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

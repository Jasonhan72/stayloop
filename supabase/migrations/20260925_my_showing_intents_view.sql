-- 2026-09-25 (V0.6 walk-through) — the tenant's showing requests / questions
-- with a listing snapshot: the public listings RLS hides an inactive listing
-- from the tenant, so the "我的看房与提问" block rendered "—" for it. Read-only
-- (the intent rows themselves stay under showing_intents' own policy).
create or replace view public.my_showing_intents as
 select i.id, i.kind, i.status, i.move_in_date, i.message, i.created_at, i.listing_id,
        l.slug as listing_slug, l.address as listing_address, l.unit as listing_unit, l.is_active as listing_active
   from public.showing_intents i
   left join public.listings l on l.id = i.listing_id
  where i.tenant_id in (select t.id from public.tenants t where t.auth_id = auth.uid());
revoke all on public.my_showing_intents from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.my_showing_intents from authenticated;
grant select on public.my_showing_intents to authenticated;

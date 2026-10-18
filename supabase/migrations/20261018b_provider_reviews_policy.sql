-- Site test 2026-10-17 · G-D2: a review could name any provider.
-- The insert policy compared the work order's provider_id with itself (an unqualified column bound to w),
-- so a tenant could file a review of a work order against a different provider. Compare the review row.
drop policy if exists provider_reviews_insert on public.provider_reviews;
create policy provider_reviews_insert on public.provider_reviews
  for insert with check (
    by_user = auth.uid()
    and exists (
      select 1 from public.work_orders w
       where w.id = provider_reviews.work_order_id
         and w.status = any (array['accepted', 'paid', 'closed'])
         and w.accepted_at > now() - interval '14 days'
         and w.provider_id is not distinct from provider_reviews.provider_id
         and ((provider_reviews.by_kind = 'landlord' and w.landlord_auth_id = auth.uid())
           or (provider_reviews.by_kind = 'tenant' and public.is_household_member(w.household_id)))
    )
  );

-- Property type on listings — lets the agent distinguish 公寓 (apartment/condo)
-- from house/townhouse when searching. Applied to prod 2026-07-07.
alter table public.listings add column if not exists property_type text
  check (property_type in ('apartment','condo','house','townhouse','basement','duplex','other'));

-- Backfill (classified from titles): houses vs everything-else-condo.
update public.listings set property_type = 'house'
  where address in ('89 ESTELLE AVENUE','8 COLVESTONE ROAD');
update public.listings set property_type = 'condo'
  where property_type is null;

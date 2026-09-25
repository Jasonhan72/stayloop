-- 2026-09-25 (V0.6 walk-through) — listings.trust_tier defaulted to 2, so
-- every listing (Realtor imports included) rendered "需 收入章 · 房东设置" and a
-- "房客信用门槛" block no landlord ever set. Nothing in the product writes
-- this column; drop the default and clear the rows so the badge only ever
-- appears once a real setting exists.
alter table public.listings alter column trust_tier drop default;
update public.listings set trust_tier = null where trust_tier is not null;

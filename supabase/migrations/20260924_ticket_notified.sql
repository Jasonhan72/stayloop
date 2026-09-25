-- 2026-09-24 (V0.6) — tickets filed on the hub / the tenant repair form now
-- notify the other side directly (/api/maintenance/notify). The stamp makes
-- the send idempotent: the route claims it with `where counterpart_notified_at is null`.
alter table public.maintenance_tickets add column if not exists counterpart_notified_at timestamptz;

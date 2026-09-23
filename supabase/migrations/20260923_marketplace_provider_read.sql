-- First production run of the marketplace (2026-09-23): a provider could
-- read the work order but not the household behind it, so /provider/jobs
-- showed no address even after accepting. Providers (and the household's
-- ticket) become readable while they hold a live work order on it.
drop policy if exists households_provider_read on public.households;
create policy households_provider_read on public.households
  for select to authenticated using (exists (
    select 1 from public.work_orders w join public.service_providers p on p.id = w.provider_id
    where w.household_id = households.id and p.auth_id = auth.uid()
      and w.status not in ('declined', 'cancelled', 'expired')
  ));
drop policy if exists maintenance_tickets_provider_read on public.maintenance_tickets;
create policy maintenance_tickets_provider_read on public.maintenance_tickets
  for select to authenticated using (exists (
    select 1 from public.work_orders w join public.service_providers p on p.id = w.provider_id
    where w.ticket_id = maintenance_tickets.id and p.auth_id = auth.uid()
      and w.status not in ('declined', 'cancelled', 'expired')
  ));

-- 2026-11-15 · what is waiting on the back office, in one call.
--
-- An agent submitted a RECO registration and nothing told the admins: the only way to find out
-- was to open /admin/agents and look. The header now shows admins a count and a notice after
-- sign-in; this is the one read behind it. Counts only — no rows, no names.
--
-- "Waiting on an admin" per queue (same definition as each admin page's pending tab):
--   agents     registrations pending, or verified-but-expiring and due a re-check
--   listings   listings a landlord published, not yet reviewed
--   providers  service providers awaiting credential review
--   disputes   work orders in dispute
--   consumer   file requests that are matched / need review, plus open disputes
--              (pending_verification waits on the applicant's own email, not on us)
--   knowledge  amended source texts whose rules have not been re-checked
--
-- consumer_* and knowledge_* are service-role-only tables, hence SECURITY DEFINER; the admin
-- check is inside, coalesced, so a NULL answer is a refusal.

create or replace function public.admin_pending_counts()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when not coalesce(public.is_stayloop_admin(), false) then jsonb_build_object('error', 'forbidden')
  else jsonb_build_object(
    'agents',    (select count(*) from public.agent_profiles where status in ('pending', 'renewal_due')),
    'listings',  (select count(*) from public.listings where verification_status = 'pending'),
    'providers', (select count(*) from public.service_providers where status = 'pending'),
    'disputes',  (select count(*) from public.work_orders where status = 'disputed'),
    'consumer',  (select count(*) from public.consumer_requests where status in ('matched', 'needs_review'))
               + (select count(*) from public.consumer_disputes where status = 'open'),
    'knowledge', (select count(*) from public.knowledge_changes where status = 'pending')
  ) end
$function$;

revoke execute on function public.admin_pending_counts() from public, anon, authenticated;
grant execute on function public.admin_pending_counts() to authenticated, service_role;

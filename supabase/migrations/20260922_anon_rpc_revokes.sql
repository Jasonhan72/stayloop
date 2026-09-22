-- 2026-09-22 full-site test, L5 (Supabase security advisor 0028): 33
-- SECURITY DEFINER functions were executable by `anon` through /rest/v1/rpc.
-- Every one of them checks auth.uid() and simply does nothing for an
-- anonymous caller, so nothing was exposed — but the anonymous client
-- never calls them (the workspace falls back to demo mode before any RPC),
-- so the grant has no purpose. Kept for anon: the /join and /apply flows
-- (peek/decline_household_invite, recent_application_count,
-- application_upload_allowed, application_file_readable,
-- attach_application_files, is_household_member) and the helpers RLS
-- policies evaluate under anon (is_stayloop_admin, is_stayloop_superadmin,
-- is_email_unsubscribed). Trigger / event-trigger functions need no EXECUTE
-- from API roles at all (privilege is checked at CREATE TRIGGER time only).
revoke execute on function public.admin_add_member(text, text) from anon;
revoke execute on function public.admin_list_members() from anon;
revoke execute on function public.admin_remove_member(uuid) from anon;
revoke execute on function public.seed_demo_agent_data(text) from anon;
revoke execute on function public.decide_pending_action(uuid, text, text) from anon;
revoke execute on function public.bootstrap_agent_session(text) from anon;
revoke execute on function public.claim_landlord() from anon;
revoke execute on function public.claim_tenant() from anon;
revoke execute on function public.lookup_corp_by_bn(text) from anon;
revoke execute on function public.search_corp_registry(text, real) from anon;
revoke execute on function public.bump_agent_rate_limit(integer) from anon;
revoke execute on function public.get_entitlements(text) from anon;
revoke execute on function public.my_hats() from anon;
-- trigger / event-trigger bodies: no API role needs EXECUTE
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.queue_application_files_for_deletion() from anon, authenticated;
revoke execute on function public.queue_listing_descendant_files_for_deletion() from anon, authenticated;
revoke execute on function public.queue_screening_files_for_deletion() from anon, authenticated;
revoke execute on function public.app_config_set_updated_by() from anon, authenticated;
revoke execute on function public.agent_profile_insert_defaults() from anon, authenticated;
revoke execute on function public.guard_agent_profile_fields() from anon, authenticated;
revoke execute on function public.guard_listing_insert_trust_fields() from anon, authenticated;
revoke execute on function public.guard_listing_trust_fields() from anon, authenticated;
revoke execute on function public.guard_not_own_listing() from anon, authenticated;
-- advisor 0011: pin search_path on the three helper functions
alter function public.is_direct_client_write() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.update_screenings_updated_at() set search_path = public, pg_temp;

-- Site test 2026-10-28 (T6-D13): kb_source_status() is read only by /api/admin/knowledge, which runs
-- with the service role after its own is_stayloop_admin() check — no reason for every signed-in user
-- to be able to call it directly. Service role only. Applied to prod via Supabase MCP.
revoke execute on function public.kb_source_status() from public, anon, authenticated;
grant execute on function public.kb_source_status() to service_role;

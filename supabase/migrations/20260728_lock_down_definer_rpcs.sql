-- Security review 2026-07-28 — three SECURITY DEFINER functions were executable
-- by PUBLIC (and therefore by `anon` through PostgREST) with no authorization
-- check anywhere in their bodies. Verified against production ACLs before this
-- migration: has_function_privilege('anon', …, 'execute') = true for all three.
--
--   create_trust_api_key(text)
--     Mints a partner key that passes /api/trust/verify's gate. Anyone holding
--     the public anon key could self-issue Trust API credentials.
--
--   claim_pending_storage_deletions(int) / mark_storage_deletion_done(uuid,text)
--     Return the bucket+path of tenant-uploaded documents (IDs, pay stubs) and
--     let a caller mark them deleted without deleting them — leaking paths and
--     silently defeating the retention promise.
--
-- None of the three is called from application code; they are operator/worker
-- entry points, so service_role is the only caller that should exist.
--
-- NOTE: bump_agent_rate_limit is deliberately left executable — /api/agent/turn
-- calls it with the caller's own (possibly anonymous) JWT, and it is
-- fail-closed by design.

revoke execute on function public.create_trust_api_key(text) from public, anon, authenticated;
revoke execute on function public.claim_pending_storage_deletions(integer) from public, anon, authenticated;
revoke execute on function public.mark_storage_deletion_done(uuid, text) from public, anon, authenticated;

grant execute on function public.create_trust_api_key(text) to service_role;
grant execute on function public.claim_pending_storage_deletions(integer) to service_role;
grant execute on function public.mark_storage_deletion_done(uuid, text) to service_role;

-- Defence in depth: even if the grant is restored by a future migration, the
-- key minter refuses to run for anyone but the service role.
create or replace function public.create_trust_api_key(p_partner_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), current_user) <> 'service_role'
     and current_user <> 'postgres' then
    raise exception 'create_trust_api_key is service-role only';
  end if;

  -- body preserved verbatim from the deployed function
  v_key := 'sk_trust_' || encode(gen_random_bytes(24), 'hex');
  insert into public.trust_api_keys (partner_name, api_key, api_key_hash, key_prefix, active)
  values (p_partner_name, null, encode(digest(v_key, 'sha256'), 'hex'), left(v_key, 16), true);
  return v_key;
end;
$$;

revoke execute on function public.create_trust_api_key(text) from public, anon, authenticated;
grant execute on function public.create_trust_api_key(text) to service_role;

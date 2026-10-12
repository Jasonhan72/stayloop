-- 2026-10-12: audit_hat_activation() referenced new.id, but agent_profiles has no id column (its key is
-- auth_id) — so every INSERT into agent_profiles has failed with 42703 since the trigger was added on
-- 2026-09-26: nobody could register as an agent. Found while creating the Muse test accounts.
-- Fix: take the row id from the record as JSON when it exists, otherwise fall back to auth_id.
create or replace function public.audit_hat_activation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_hat text := tg_argv[0];
  v_actor uuid := coalesce(auth.uid(), new.auth_id);
  v_row jsonb := to_jsonb(new);
  v_target uuid := coalesce((v_row->>'id')::uuid, new.auth_id);
begin
  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, acting_role, matter_type, matter_id, metadata)
  values (
    v_actor,
    case when auth.uid() is null then 'system' else 'user' end,
    'hat_activated',
    v_hat,
    v_target,
    v_hat,
    v_hat,
    v_target,
    jsonb_build_object('hat', v_hat, 'holder', new.auth_id, 'via', coalesce(current_setting('request.jwt.claim.role', true), current_user), 'by_self', auth.uid() is not distinct from new.auth_id)
  );
  return new;
end $$;
revoke all on function public.audit_hat_activation() from public, anon, authenticated, service_role;

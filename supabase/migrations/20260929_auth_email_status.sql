-- The homepage sign-in asks for the email first and then routes like Muse:
-- an existing password account goes to the password step, a new email goes
-- straight to create-account, a Google-only account is offered Google (user
-- decision 2026-09-29「当然要加上这个判断」, accepting that the lookup tells a
-- visitor whether an address is registered).
--
-- Only the server route /api/auth/email-status calls this, with the service
-- role, behind a per-IP and a global hourly limit. It answers three booleans
-- and nothing else: no id, no name, no confirmation state, no timestamps.
create or replace function public.auth_email_status(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_password boolean;
begin
  if p_email is null or length(p_email) > 320 then
    return jsonb_build_object('exists', false, 'password', false, 'google', false);
  end if;

  select u.id, coalesce(u.encrypted_password, '') <> ''
    into v_id, v_password
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
     and u.deleted_at is null
     and not coalesce(u.is_anonymous, false)
   order by u.created_at
   limit 1;

  if v_id is null then
    return jsonb_build_object('exists', false, 'password', false, 'google', false);
  end if;

  return jsonb_build_object(
    'exists', true,
    'password', v_password,
    'google', exists (select 1 from auth.identities i where i.user_id = v_id and i.provider = 'google')
  );
end;
$$;

-- PUBLIC holds EXECUTE by default and the project's default privileges grant
-- anon / authenticated too; revoke all three, then allow the service role only.
revoke all on function public.auth_email_status(text) from public, anon, authenticated;
grant execute on function public.auth_email_status(text) to service_role;

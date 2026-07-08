-- Admin member management RPCs (SECURITY DEFINER — the client cannot read
-- auth.users, so email lookup and member listing go through these, each
-- guarded by the admin/superadmin switch).

create or replace function public.admin_list_members()
returns table(user_id uuid, email text, role text, note text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.user_id, u.email::text, a.role, a.note, a.created_at
  from public.admin_users a
  join auth.users u on u.id = a.user_id
  where public.is_stayloop_admin()
  order by a.created_at
$$;

create or replace function public.admin_add_member(p_email text, p_role text default 'admin')
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  if not public.is_stayloop_superadmin() then
    return jsonb_build_object('ok', false, 'error', 'not_superadmin');
  end if;
  if p_role not in ('admin', 'superadmin') then
    return jsonb_build_object('ok', false, 'error', 'invalid_role');
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  insert into public.admin_users (user_id, role)
  values (v_uid, p_role)
  on conflict (user_id) do update set role = excluded.role;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_member(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_stayloop_superadmin() then
    return jsonb_build_object('ok', false, 'error', 'not_superadmin');
  end if;
  -- Never let the group lose its last superadmin.
  if (select role from public.admin_users where user_id = p_user_id) = 'superadmin'
     and (select count(*) from public.admin_users where role = 'superadmin') <= 1 then
    return jsonb_build_object('ok', false, 'error', 'last_superadmin');
  end if;
  delete from public.admin_users where user_id = p_user_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_list_members() from public;
revoke all on function public.admin_add_member(text, text) from public;
revoke all on function public.admin_remove_member(uuid) from public;
grant execute on function public.admin_list_members() to authenticated;
grant execute on function public.admin_add_member(text, text) to authenticated;
grant execute on function public.admin_remove_member(uuid) to authenticated;

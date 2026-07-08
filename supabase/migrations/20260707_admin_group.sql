-- Stayloop back-office admin group.
--   · admin_users membership = back-office permission (listing verification etc.)
--   · superadmin can manage the group itself; admins get resource policies.
--   · All admin RLS checks go through is_stayloop_admin() so future admin
--     surfaces (screening review, disputes, billing) reuse the same switch.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','superadmin')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
grant select, insert, update, delete on public.admin_users to authenticated;

-- SECURITY DEFINER: runs as table owner (bypasses RLS), so policies that call
-- these helpers don't recurse into admin_users' own policies.
create or replace function public.is_stayloop_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;

create or replace function public.is_stayloop_superadmin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'superadmin') $$;

revoke all on function public.is_stayloop_admin() from public;
revoke all on function public.is_stayloop_superadmin() from public;
grant execute on function public.is_stayloop_admin() to authenticated, anon;
grant execute on function public.is_stayloop_superadmin() to authenticated;

-- Members can see their own membership; superadmins see and manage everyone.
drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read on public.admin_users
  for select using (auth.uid() = user_id or public.is_stayloop_superadmin());
drop policy if exists admin_users_superadmin_write on public.admin_users;
create policy admin_users_superadmin_write on public.admin_users
  for all using (public.is_stayloop_superadmin()) with check (public.is_stayloop_superadmin());

-- Listings: admins read everything (incl. pending/inactive) and may update
-- (verification decisions). Adds on top of landlord-own + public-active.
drop policy if exists listings_admin_read on public.listings;
create policy listings_admin_read on public.listings
  for select using (public.is_stayloop_admin());
drop policy if exists listings_admin_update on public.listings;
create policy listings_admin_update on public.listings
  for update using (public.is_stayloop_admin()) with check (public.is_stayloop_admin());

-- Seed: founder account as superadmin.
insert into public.admin_users (user_id, role, note)
values ('90138c49-7a68-4ce8-9ec8-14e10304ccad', 'superadmin', 'Jason Han — founder')
on conflict (user_id) do update set role = excluded.role;

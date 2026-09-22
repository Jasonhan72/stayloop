-- Web Push subscriptions (2026-09-22, Muse benchmark item F).
-- One row per device. The user writes their own rows through RLS
-- (lib/push/client.ts); the service role reads them to send
-- (lib/push/notify.ts) and disables dead endpoints.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  level        text not null default 'default' check (level in ('default','quiet')),
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at  timestamptz,
  fail_count   int not null default 0
);
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_self on public.push_subscriptions;
create policy push_subscriptions_self on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The project's default privileges hand every new table to anon as well;
-- push endpoints are capability URLs and must never be readable anonymously.
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create index if not exists push_subscriptions_user_live_idx
  on public.push_subscriptions(user_id) where disabled_at is null;

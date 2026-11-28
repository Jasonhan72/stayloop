-- AI 助理的邮箱 · 第一期 (2026-11-27, design/assistant-inbox-plan-2026-11-27.md).
--
-- An account may give its assistant a receiving address. The person FORWARDS mail to it; the mail
-- and its attachments show under the panel's 收件 tab. Receive only — nothing is ever sent from
-- these addresses, and nothing happens to a mail until the person hands it to the assistant.
--
-- Who writes what:
--   · every write is the server's (service role): the inbound route, the inbox / mail routes, the
--     daily sweep. The browser only reads, and only its own rows (RLS = self, explicit columns).
--   · admins get no policy here: nobody at Stayloop reads a user's mail through the API.
--   · storage keys (raw_path, path) are not granted to the browser; files leave the private bucket
--     only as ten-minute signed download links minted by the mail route.

-- The address. One per account (one assistant per account), shared by every hat.
create table if not exists public.assistant_inboxes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  local_part text not null unique check (local_part ~ '^[a-z0-9]{2,16}-[a-z2-9]{6}$'),
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

-- A local part that was given up (address changed, mailbox closed) is never handed out again:
-- mail still arriving for it must not land in somebody else's mailbox. No link to who had it.
create table if not exists public.assistant_inbox_retired (
  local_part text primary key,
  retired_at timestamptz not null default now()
);

-- Extra addresses the person allows to write to their assistant. The login email is always
-- allowed and is read from auth.users at delivery time, so it is not stored here.
create table if not exists public.assistant_inbox_senders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(email) <= 254),
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create table if not exists public.assistant_mail (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  from_addr     text not null,
  from_name     text,
  subject       text not null default '',
  body_text     text not null default '',
  message_id    text,
  auth          jsonb not null default '{}'::jsonb,
  size_bytes    integer not null check (size_bytes >= 0),
  file_count    smallint not null default 0,
  skipped_files jsonb not null default '[]'::jsonb,
  raw_path      text not null,
  raw_sha256    text not null,
  status        text not null default 'new' check (status in ('new', 'seen', 'handed')),
  received_at   timestamptz not null default now(),
  expires_at    timestamptz not null
);
-- The same message delivered twice (a retry, two recipients on one mail) is stored once.
create unique index if not exists assistant_mail_user_message on public.assistant_mail (user_id, message_id) where message_id is not null;
create index if not exists assistant_mail_user_received on public.assistant_mail (user_id, received_at desc);
create index if not exists assistant_mail_expires on public.assistant_mail (expires_at);
create index if not exists assistant_mail_received on public.assistant_mail (received_at);

create table if not exists public.assistant_mail_files (
  id         uuid primary key default gen_random_uuid(),
  mail_id    uuid not null references public.assistant_mail(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  idx        smallint not null,
  name       text not null,
  media_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  path       text not null,
  unique (mail_id, idx)
);
create index if not exists assistant_mail_files_user on public.assistant_mail_files (user_id);

alter table public.assistant_inboxes        enable row level security;
alter table public.assistant_inbox_retired  enable row level security;
alter table public.assistant_inbox_senders  enable row level security;
alter table public.assistant_mail           enable row level security;
alter table public.assistant_mail_files     enable row level security;

-- Table-level grants first (a table grant would make the column grants below a no-op), then columns.
revoke all on public.assistant_inboxes, public.assistant_inbox_retired, public.assistant_inbox_senders, public.assistant_mail, public.assistant_mail_files from public, anon, authenticated;
grant all on public.assistant_inboxes, public.assistant_inbox_retired, public.assistant_inbox_senders, public.assistant_mail, public.assistant_mail_files to service_role;

grant select (user_id, local_part, enabled, created_at) on public.assistant_inboxes to authenticated;
grant select (id, user_id, email, created_at) on public.assistant_inbox_senders to authenticated;
grant select (id, user_id, from_addr, from_name, subject, body_text, size_bytes, file_count, skipped_files, status, received_at, expires_at) on public.assistant_mail to authenticated;
grant select (id, mail_id, user_id, idx, name, media_type, size_bytes) on public.assistant_mail_files to authenticated;

drop policy if exists assistant_inboxes_self on public.assistant_inboxes;
create policy assistant_inboxes_self on public.assistant_inboxes for select to authenticated using (user_id = auth.uid());
drop policy if exists assistant_inbox_senders_self on public.assistant_inbox_senders;
create policy assistant_inbox_senders_self on public.assistant_inbox_senders for select to authenticated using (user_id = auth.uid());
drop policy if exists assistant_mail_self on public.assistant_mail;
create policy assistant_mail_self on public.assistant_mail for select to authenticated using (user_id = auth.uid());
drop policy if exists assistant_mail_files_self on public.assistant_mail_files;
create policy assistant_mail_files_self on public.assistant_mail_files for select to authenticated using (user_id = auth.uid());
-- assistant_inbox_retired: no policy at all — the server's only.

-- What the delivery gate needs in one read: this account's last 24 hours and stored bytes, and the
-- whole site's last 24 hours. Server only.
create or replace function public.assistant_mail_usage(p_user uuid)
returns table (day_count integer, stored_bytes bigint, site_day_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*)::integer from public.assistant_mail where user_id = p_user and received_at > now() - interval '24 hours'),
    (select coalesce(sum(size_bytes), 0)::bigint from public.assistant_mail where user_id = p_user),
    (select count(*)::integer from public.assistant_mail where received_at > now() - interval '24 hours');
$$;
revoke execute on function public.assistant_mail_usage(uuid) from public, anon, authenticated;
grant execute on function public.assistant_mail_usage(uuid) to service_role;

-- The private bucket: <user id>/<mail id>/raw.eml and <user id>/<mail id>/<n>-<name>. No storage
-- policy is created for it, so only the service role reads or writes it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('assistant-mail', 'assistant-mail', false, 12582912)
on conflict (id) do nothing;

-- The switch (lib/assistantMail/config.ts). audience 'test' = admins and @stayloop.ai accounts;
-- 'all' = every signed-in account. domain = the one shown on new addresses; both ai.stayloop.ai
-- and reply.stayloop.ai are accepted on delivery, so flipping it breaks no address already in use.
insert into public.app_config (key, value)
values ('assistant_mail', '{"enabled": true, "audience": "test", "domain": "reply.stayloop.ai"}'::jsonb)
on conflict (key) do nothing;

-- Thirty days, then gone: rows, attachments and the raw original (the route deletes the storage
-- objects, which SQL alone cannot). Daily at 13:35 UTC, between the other daily jobs.
select cron.schedule(
  'assistant-mail-sweep',
  '35 13 * * *',
  $$ select net.http_post(
       url := 'https://www.stayloop.ai/api/cron/assistant-mail-sweep',
       headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'content-type', 'application/json'),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000) $$
);

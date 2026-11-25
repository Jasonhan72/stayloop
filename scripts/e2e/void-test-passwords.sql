-- Void the passwords of the test accounts (first run 2026-11-25).
--
-- Why: the shared test password had been written in CLAUDE.md since 2026-09,
-- and this repository is public. Each account now gets its own random value,
-- generated here inside the database: it never leaves it, nobody knows it.
-- Every session of those accounts is closed in the same transaction.
--
-- Signing in afterwards is by one-time link only:
--   bash scripts/e2e/test-login-link.sh tenant        (a person, by hand)
--   bash scripts/e2e/hat-probes.sh                    (the probes mint their own)
--
-- Run it again
--   * whenever a test password may have been seen by someone, or
--   * about 90 days after the last run: these are password accounts, so the
--     90-day sheet (components/legal/PasswordAgeGate.tsx) reads
--     user_metadata.password_changed_at, which this stamps. Re-running moves
--     the date; nobody has to type a password into that sheet.
--
-- Run as postgres (Supabase SQL editor, or the MCP execute_sql). There is no
-- secret in this file and none in its output.

begin;

update auth.users u set
  encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(48), 'base64'), extensions.gen_salt('bf', 10)),
  raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('password_changed_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at = now()
where u.email in (
  'tenant-test@stayloop.ai', 'landlord-test@stayloop.ai', 'agent-test@stayloop.ai',
  'provider-test@stayloop.ai', 'admin-test@stayloop.ai', 'tester@stayloop.ai'
);

delete from auth.sessions s
where s.user_id in (
  select id from auth.users where email in (
    'tenant-test@stayloop.ai', 'landlord-test@stayloop.ai', 'agent-test@stayloop.ai',
    'provider-test@stayloop.ai', 'admin-test@stayloop.ai', 'tester@stayloop.ai'
  )
);

commit;

-- What to see: six rows, six different hashes, no session, nothing but the
-- email identity, no pending email change, no MFA factor.
select u.email,
       left(u.raw_user_meta_data->>'password_changed_at', 19) as password_changed_at,
       (select count(distinct x.encrypted_password) from auth.users x
         where x.email in ('tenant-test@stayloop.ai', 'landlord-test@stayloop.ai', 'agent-test@stayloop.ai',
                           'provider-test@stayloop.ai', 'admin-test@stayloop.ai', 'tester@stayloop.ai')) as distinct_hashes,
       (select count(*) from auth.sessions s where s.user_id = u.id) as sessions,
       (select string_agg(i.provider, ',') from auth.identities i where i.user_id = u.id) as identities,
       coalesce(u.email_change, '') as email_change,
       (select count(*) from auth.mfa_factors f where f.user_id = u.id) as mfa_factors
from auth.users u
where u.email in ('tenant-test@stayloop.ai', 'landlord-test@stayloop.ai', 'agent-test@stayloop.ai',
                  'provider-test@stayloop.ai', 'admin-test@stayloop.ai', 'tester@stayloop.ai')
order by u.email;

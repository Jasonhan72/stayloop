-- Code review 2026-11-15 (design/code-review-2026-11-15.md): the database half of the S2 fixes
-- — S2-1, S2-3, S2-22, S2-23.

-- ── S2-1 · agent_pending_actions: a card's owner cannot approve, replay or rewrite it directly ──
-- The FOR ALL policy lets the owner UPDATE any column of their own cards, so
-- `status = 'approved'` could be set without decide_pending_action (no approval event, no
-- audit row), `executed_at` cleared to run a card again, and an expired card revived.
-- Executors re-check ownership and facts, so this was not an authorisation hole; it made the
-- approval record untrustworthy. The policy stays; this guard allows a direct client exactly
-- the moves the app makes:
--   · edit the content of a card that is still pending (the payment-plan draft);
--   · pending → expired; approved-and-not-executed → pending (undo), rejected or expired;
--   · set execution_result while the card is approved, expired or rejected.
-- Everything else — approving, touching an executed card, reviving a decided one, changing
-- whose card it is or what it does — goes through decide_pending_action or the service role.
-- SECURITY INVOKER + is_direct_client_write(): RPCs (definer) and the service role pass.
create or replace function public.guard_pending_action_update()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  why text := null;
  content_changed boolean;
begin
  if not public.is_direct_client_write() then return new; end if;
  content_changed := (new.title, new.summary, new.recipient_label, new.data_scope, new.excluded_data, new.risk_level, new.requires_approval, new.metadata, new.expires_at, new.workflow_id)
    is distinct from (old.title, old.summary, old.recipient_label, old.data_scope, old.excluded_data, old.risk_level, old.requires_approval, old.metadata, old.expires_at, old.workflow_id);
  if (new.id, new.user_id, new.role, new.action_type, new.created_at) is distinct from (old.id, old.user_id, old.role, old.action_type, old.created_at) then
    why := 'identity columns are fixed';
  elsif old.executed_at is not null then
    why := 'an executed card is read-only';
  elsif new.executed_at is not null then
    why := 'executed_at is set by the executor';
  elsif new.status = 'approved' and old.status <> 'approved' then
    why := 'approve through decide_pending_action';
  elsif old.status in ('rejected', 'expired') and new.status <> old.status then
    why := 'a decided card does not come back';
  elsif new.decided_at is not null and new.decided_at is distinct from old.decided_at then
    why := 'decided_at is set by decide_pending_action';
  elsif content_changed and old.status <> 'pending' then
    why := 'content can change only while the card is pending';
  elsif new.execution_result is distinct from old.execution_result and new.status = 'pending' then
    why := 'a pending card has no execution result';
  end if;
  if why is not null then
    raise exception 'pending_action_guard: %', why using errcode = '42501';
  end if;
  return new;
end
$function$;
revoke execute on function public.guard_pending_action_update() from public, anon, authenticated;
drop trigger if exists trg_guard_pending_action_update on public.agent_pending_actions;
create trigger trg_guard_pending_action_update
  before update on public.agent_pending_actions
  for each row execute function public.guard_pending_action_update();

-- ── S2-3 · tenants: tier and email are not the tenant's to set; claim only an unclaimed row ──
-- `tier` feeds the assistant's prompt (「租客护照认证 N 级」) and `email` is used as a recipient
-- address and as the match key of a consumer file; both were writable by the row's owner.
-- A direct client now keeps whatever the row had (the freeze is silent, like the billing
-- columns on landlords); a new row starts at tier 1 with the address in the caller's JWT.
create or replace function public.guard_tenants_columns()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_direct_client_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.tier := 1;
    new.email := coalesce(nullif(auth.jwt() ->> 'email', ''), new.email);
    return new;
  end if;
  new.id := old.id;
  new.auth_id := old.auth_id;
  new.tier := old.tier;
  new.email := old.email;
  new.created_at := old.created_at;
  return new;
end
$function$;
revoke execute on function public.guard_tenants_columns() from public, anon, authenticated;
drop trigger if exists trg_guard_tenants_columns on public.tenants;
create trigger trg_guard_tenants_columns
  before insert or update on public.tenants
  for each row execute function public.guard_tenants_columns();

-- claim_tenant matched a row by email without asking whether it already belonged to somebody:
-- after a person changed their sign-in address, whoever registered the old one took over the
-- row with its leases, repair tickets and showing history. Like claim_landlord, only a row
-- nobody holds is claimed. A row still carrying this address under another account is that
-- account's stale copy: it gets its owner's current address, and the caller gets a new row.
create or replace function public.claim_tenant()
 returns tenants
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_row     public.tenants;
begin
  if v_user_id is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = v_user_id;
  select * into v_row from public.tenants where auth_id = v_user_id;
  if found then return v_row; end if;
  select * into v_row from public.tenants where email = v_email and auth_id is null order by created_at limit 1;
  if found then
    update public.tenants set auth_id = v_user_id where id = v_row.id and auth_id is null;
    return (select t from public.tenants t where t.id = v_row.id);
  end if;
  update public.tenants t
     set email = u.email
    from auth.users u
   where t.email = v_email and t.auth_id is not null and t.auth_id <> v_user_id
     and u.id = t.auth_id and u.email is distinct from t.email;
  insert into public.tenants (auth_id, email, tier)
  values (v_user_id, v_email, 1)
  returning * into v_row;
  return v_row;
end
$function$;
revoke execute on function public.claim_tenant() from public, anon;
grant execute on function public.claim_tenant() to authenticated, service_role;

-- ── S2-22 · the daily proactive cron gets a real timeout ─────────────────────────────────────
-- Every other HTTP cron passes timeout_milliseconds; this one ran on pg_net's default of
-- 5 seconds while its route chains five scans. With more data the later scans (follow-up
-- emails, rent reminders, takedown reminders) would silently stop running.
select cron.schedule(
  'agent-proactive-daily',
  '0 13 * * *',
  $cron$
  select net.http_post(
    url     := 'https://www.stayloop.ai/api/agent/proactive',
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'content-type', 'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $cron$
);

-- ── S2-23 · message hash chain: take the id after the lock ───────────────────────────────────
-- `id` is a bigserial, so its value is drawn before any BEFORE trigger runs, while the
-- per-thread advisory lock is only taken here, in the last trigger. Two concurrent inserts in
-- one thread could therefore lock in the opposite order of their ids: message N would chain to
-- N+1, and an export would show a broken chain for ever (the table is append-only). Drawing
-- the id again once the lock is held makes id order and lock order the same. The canonical
-- form (stayloop-thread-v1) and the verifier are untouched; ids only gain gaps.
create or replace function public.thread_messages_chain()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare prev text;
begin
  -- One writer per thread at a time, so "previous" is well defined.
  perform pg_advisory_xact_lock(hashtextextended(new.thread_id::text, 42));
  new.id := nextval('public.thread_messages_id_seq');
  select m.hash into prev from public.thread_messages m where m.thread_id = new.thread_id order by m.id desc limit 1;
  new.prev_hash := coalesce(prev, 'genesis');
  if new.channel is null then new.channel := 'app'; end if;
  new.hash := encode(extensions.digest(convert_to(public.thread_message_canonical(new, new.prev_hash), 'UTF8'), 'sha256'), 'hex');
  return new;
end $function$;
revoke execute on function public.thread_messages_chain() from public, anon, authenticated;

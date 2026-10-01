-- Sweep 2026-10-01 · A8 (profiles & settings).
--   1. set_user_model_field — the settings tab changes ONE field of the 画像 row
--      (value[f] + value.user_overrides[f]) server-side, upserting when there is
--      no row. It used to write its whole snapshot back: a reflection that
--      finished after the tab opened was replaced by the old profile, and with
--      no row loaded the insert hit a raw duplicate-key error.
--   2. guard_agent_profile_fields — a rejected or expired agent who edits and
--      resubmits anything goes back to 'pending' (only the five registration
--      facts used to re-queue, so a contact-only fix stayed rejected forever
--      while the page said 「等待人工核验」).
--   3. delegations.link_emailed / link_emailed_at — whether the confirmation
--      link actually left (the client book said 「链接已发到客户邮箱」 even
--      when the send failed).
--   4. agent_clients — one row per client email per agent (re-adding a client
--      to fix an email created a duplicate with a separate thread).

-- ── 1. The 画像 field merge ────────────────────────────────────────────────
create or replace function public.set_user_model_field(p_field text, p_value jsonb, p_release boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today text := to_char((now() at time zone 'America/Toronto')::date, 'YYYY-MM-DD');
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_field is null or p_field not in ('current_focus', 'communication_style', 'goals', 'preferences', 'constraints', 'worked_well', 'avoid') then
    raise exception 'invalid_field' using errcode = '22023';
  end if;

  -- 「交回自动」: drop the person's wording for this field; the next reflection fills it.
  if coalesce(p_release, false) then
    update public.user_memories m
       set value = jsonb_set(
             case when jsonb_typeof(m.value) = 'object' then m.value else '{}'::jsonb end,
             '{user_overrides}',
             (case when jsonb_typeof(m.value -> 'user_overrides') = 'object' then m.value -> 'user_overrides' else '{}'::jsonb end) - p_field,
             true),
           source = 'user_edit'
     where m.user_id = v_uid and m.role = 'self' and m.memory_type = 'system' and m.key = 'user_model'
     returning jsonb_build_object('value', m.value, 'updated_at', m.updated_at) into v_out;
    return v_out;
  end if;

  if p_field in ('current_focus', 'communication_style') then
    if p_value is null or jsonb_typeof(p_value) <> 'string' or char_length(p_value #>> '{}') > 160 then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
  else
    if p_value is null or jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 8
       or exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 80) then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
  end if;

  -- The row's updated_at is the reflection cadence (needsReflection) and is left alone on an
  -- edit; value.updated_at records the edit date.
  insert into public.user_memories as m (user_id, role, memory_type, key, label, value, confidence, source, updated_at)
  values (v_uid, 'self', 'system', 'user_model', '用户画像',
          jsonb_build_object(p_field, p_value, 'user_overrides', jsonb_build_object(p_field, p_value), 'updated_at', v_today),
          1, 'user_edit', now())
  on conflict (user_id, role, memory_type, key) do update
    set value = (case when jsonb_typeof(m.value) = 'object' then m.value else '{}'::jsonb end)
                || jsonb_build_object(
                     p_field, p_value,
                     'updated_at', v_today,
                     'user_overrides', (case when jsonb_typeof(m.value -> 'user_overrides') = 'object' then m.value -> 'user_overrides' else '{}'::jsonb end)
                                       || jsonb_build_object(p_field, p_value)),
        source = 'user_edit'
  returning jsonb_build_object('value', m.value, 'updated_at', m.updated_at) into v_out;
  return v_out;
end $$;
revoke all on function public.set_user_model_field(text, jsonb, boolean) from public, anon;
grant execute on function public.set_user_model_field(text, jsonb, boolean) to authenticated;

-- ── 2. Agent verification: a rejected / expired agent's resubmission re-queues ──
create or replace function public.guard_agent_profile_fields()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_stayloop_admin() then
    new.updated_at := now();
    return new;
  end if;
  new.status      := old.status;
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;
  new.review_note := old.review_note;
  if (new.legal_name, new.reco_number, new.brokerage_name, new.category, coalesce(new.expires_at, date '1900-01-01'))
     is distinct from
     (old.legal_name, old.reco_number, old.brokerage_name, old.category, coalesce(old.expires_at, date '1900-01-01')) then
    new.status      := 'pending';
    new.verified_at := null;
    new.verified_by := null;
  elsif old.status in ('rejected', 'expired')
     and (new.trade_name, new.business_email, new.business_phone, new.crea_member, new.attested_at)
         is distinct from
         (old.trade_name, old.business_email, old.business_phone, old.crea_member, old.attested_at) then
    -- A rejection is often about a contact field (a personal email); fixing it and
    -- resubmitting must reach the review queue. The old note stays for the reviewer.
    new.status      := 'pending';
    new.verified_at := null;
    new.verified_by := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.guard_agent_profile_fields() from public, anon, authenticated, service_role;

-- ── 3. Did the delegation confirmation link actually go out? ─────────────────
alter table public.delegations add column if not exists link_emailed boolean;
alter table public.delegations add column if not exists link_emailed_at timestamptz;
grant select (link_emailed, link_emailed_at) on public.delegations to authenticated;

-- ── 4. One client row per email per agent ────────────────────────────────────
-- Existing duplicates are left alone; only a new insert, or an email change, that
-- would collide with another of the agent's rows is refused.
create or replace function public.guard_agent_client_email()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if new.email is not null then
    new.email := nullif(btrim(new.email), '');
  end if;
  if new.email is not null
     and (tg_op = 'INSERT' or lower(coalesce(old.email, '')) <> lower(new.email))
     and exists (
       select 1 from public.agent_clients c
        where c.agent_auth_id = new.agent_auth_id
          and c.id <> new.id
          and lower(btrim(c.email)) = lower(new.email)
     ) then
    raise exception 'client_email_taken' using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_client_email() from public, anon, authenticated, service_role;
drop trigger if exists trg_guard_agent_client_email on public.agent_clients;
create trigger trg_guard_agent_client_email
  before insert or update of email on public.agent_clients
  for each row execute function public.guard_agent_client_email();

-- Site test 2026-10-17 · S3 database fixes, second batch.

-- ── T6-D10 · the corporate-registry lookups are server-only ──
-- Their one caller is /api/deep-check through the service-role client; any signed-in account could
-- call search_corp_registry directly with a low min_sim and burn up to 8 s of CPU per call.
revoke execute on function public.search_corp_registry(text, real) from public, anon, authenticated;
revoke execute on function public.lookup_corp_by_bn(text) from public, anon, authenticated;
grant execute on function public.search_corp_registry(text, real) to service_role;
grant execute on function public.lookup_corp_by_bn(text) to service_role;

-- ── I-D3 · 「交回自动」 also clears the person's wording, not only the override flag ──
-- The field kept the user's own text until the next reflection (which skips short histories), so the
-- settings page still showed it after handing it back. Same body as before; the release branch now
-- empties the field ('' for the two text fields, [] for the lists).
create or replace function public.set_user_model_field(p_field text, p_value jsonb, p_release boolean default false)
returns jsonb language plpgsql set search_path to 'public' as $function$
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
             jsonb_set(
               case when jsonb_typeof(m.value) = 'object' then m.value else '{}'::jsonb end,
               '{user_overrides}',
               (case when jsonb_typeof(m.value -> 'user_overrides') = 'object' then m.value -> 'user_overrides' else '{}'::jsonb end) - p_field,
               true),
             array[p_field],
             case when p_field in ('current_focus', 'communication_style') then '""'::jsonb else '[]'::jsonb end,
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
end $function$;

-- 2026-09-26 (V0.6 · 节点 2 清楚) — identity on every audit row, hat
-- activation on the record, and the applicant's own material count.

-- 1) The audit row answers "who, as which hat, on which matter, under which
--    delegation" (external review 2026-09-26 p.11). Writers fill what they
--    know; delegation_id stays null until 节点 5.
alter table public.agent_audit_events add column if not exists acting_role text;
alter table public.agent_audit_events add column if not exists matter_type text;
alter table public.agent_audit_events add column if not exists matter_id uuid;
alter table public.agent_audit_events add column if not exists delegation_id uuid;
create index if not exists agent_audit_events_matter_idx on public.agent_audit_events (matter_type, matter_id) where matter_id is not null;

-- 2) Getting a hat is an audited event, whoever minted the row: claim_landlord
--    (definer), the agent registration form, the provider onboarding form, or
--    an admin. The agent test account grew a landlords row nobody could account
--    for (2026-09-25 03:54 UTC) — this is the missing record.
create or replace function public.audit_hat_activation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hat text := tg_argv[0];
  v_actor uuid := coalesce(auth.uid(), new.auth_id);
begin
  insert into public.agent_audit_events (actor_id, actor_type, action, target_type, target_id, acting_role, matter_type, matter_id, metadata)
  values (
    v_actor,
    case when auth.uid() is null then 'system' else 'user' end,
    'hat_activated',
    v_hat,
    new.id,
    v_hat,
    v_hat,
    new.id,
    jsonb_build_object('hat', v_hat, 'holder', new.auth_id, 'via', coalesce(current_setting('request.jwt.claim.role', true), current_user), 'by_self', auth.uid() is not distinct from new.auth_id)
  );
  return new;
end $$;
revoke execute on function public.audit_hat_activation() from public, anon, authenticated, service_role;

drop trigger if exists trg_audit_hat_landlord on public.landlords;
create trigger trg_audit_hat_landlord after insert on public.landlords for each row execute function public.audit_hat_activation('landlord');
drop trigger if exists trg_audit_hat_agent on public.agent_profiles;
create trigger trg_audit_hat_agent after insert on public.agent_profiles for each row execute function public.audit_hat_activation('agent');
drop trigger if exists trg_audit_hat_provider on public.service_providers;
create trigger trg_audit_hat_provider after insert on public.service_providers for each row execute function public.audit_hat_activation('provider');

-- 3) The tenant's application detail page lists how many materials were
--    submitted and the decision it was given — never a score. Same view,
--    same filter, two columns appended.
create or replace view public.applicant_applications as
 select a.id, a.listing_id, a.first_name, a.last_name, a.email, a.status, a.created_at, a.move_in_date, a.viewed_at, a.screened_at, a.decision_notified_at, a.notified_at,
        l.slug as listing_slug, l.address as listing_address, l.unit as listing_unit, l.is_active as listing_active,
        case when jsonb_typeof(a.files) = 'array' then jsonb_array_length(a.files) else 0 end as files_count,
        a.decision_reason
   from public.applications a
   left join public.listings l on l.id = a.listing_id
  where a.email is not null and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
revoke insert, update, delete, truncate, references, trigger on public.applicant_applications from authenticated, anon, public;
grant select on public.applicant_applications to authenticated;

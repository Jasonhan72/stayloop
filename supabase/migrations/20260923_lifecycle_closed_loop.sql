-- Lifecycle closed loop + Trust API groundwork (2026-09-23, plan
-- design/lifecycle-and-trust-api-plan-2026-09.md).

-- 1. Application ↔ screening link (one-click screening from an application).
alter table public.screenings add column if not exists application_id uuid references public.applications(id) on delete set null;
create index if not exists screenings_application_idx on public.screenings(application_id) where application_id is not null;
alter table public.applications add column if not exists decision_notified_at timestamptz;
alter table public.applications add column if not exists decision_reason text;

-- 2. Compliance events — every deterministic rule hit (guardrail, listing
--    publish check, lease terms check). Feeds the "合规拦截" ROI metric.
create table if not exists public.compliance_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  role        text check (role in ('tenant','landlord','agent')),
  source      text not null check (source in ('guardrail','listing_publish','lease_terms','compliance_api','decision_notice')),
  rule_id     text not null,
  severity    text not null check (severity in ('block','warn','info')),
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.compliance_events enable row level security;
drop policy if exists compliance_events_self_insert on public.compliance_events;
create policy compliance_events_self_insert on public.compliance_events
  for insert with check (user_id = auth.uid());
drop policy if exists compliance_events_self_select on public.compliance_events;
create policy compliance_events_self_select on public.compliance_events
  for select using (user_id = auth.uid() or public.is_stayloop_admin());
revoke all on public.compliance_events from anon;
grant select, insert on public.compliance_events to authenticated;
grant all on public.compliance_events to service_role;
create index if not exists compliance_events_created_idx on public.compliance_events(created_at desc);

-- 3. Trust API keys: which landlord account a partner's screenings run under,
--    plus a usage counter surface.
alter table public.trust_api_keys add column if not exists landlord_auth_id uuid references auth.users(id) on delete set null;
alter table public.trust_api_keys add column if not exists created_by uuid;
alter table public.trust_api_keys add column if not exists last_used_at timestamptz;
alter table public.trust_api_keys add column if not exists notes text;
alter table public.screenings add column if not exists partner_key_id uuid references public.trust_api_keys(id) on delete set null;
alter table public.screenings add column if not exists external_ref text;
alter table public.screenings add column if not exists webhook_url text;

-- 4. Applicant-issued passport tokens can opt into third-party API reads,
--    scope by scope. null = not exposed to the API at all (default).
alter table public.passport_share_tokens add column if not exists api_scopes text[];

-- 5. Lifecycle stats for /admin/usage (admin-gated, SECURITY DEFINER).
create or replace function public.admin_lifecycle_stats(p_days int default 90)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
  since timestamptz := now() - make_interval(days => greatest(1, least(365, p_days)));
begin
  if not public.is_stayloop_admin() then raise exception 'admin only'; end if;
  select jsonb_build_object(
    'days', p_days,
    'vacancy_days', (
      select jsonb_build_object('n', count(*), 'median', percentile_cont(0.5) within group (order by extract(epoch from (l.signed_at - li.created_at))/86400))
      from lease_documents l join listings li on li.id = l.listing_id
      where l.signed_at is not null and l.signed_at >= since),
    'application_turnaround_days', (
      select jsonb_build_object('n', count(*), 'median', percentile_cont(0.5) within group (order by extract(epoch from (a.decision_notified_at - a.created_at))/86400))
      from applications a where a.decision_notified_at is not null and a.decision_notified_at >= since),
    'screening_minutes', (
      select jsonb_build_object('n', count(*), 'median', percentile_cont(0.5) within group (order by extract(epoch from (coalesce((s.progress->>'at')::timestamptz, s.created_at) - s.created_at))/60))
      from screenings s where s.status = 'scored' and s.created_at >= since),
    'screenings_scored', (select count(*) from screenings where status = 'scored' and created_at >= since),
    'compliance_blocks', (select count(*) from compliance_events where severity = 'block' and created_at >= since),
    'compliance_by_rule', (select coalesce(jsonb_object_agg(rule_id, n), '{}'::jsonb) from (select rule_id, count(*) n from compliance_events where created_at >= since group by rule_id) r),
    'renewal_touchpoints', (
      select jsonb_build_object(
        'leases_in_window', (select count(*) from lease_documents where status in ('active','signed_both') and end_date between current_date and current_date + 120),
        'first_card_90d', (select count(distinct metadata->>'lease_id') from agent_pending_actions where action_type = 'send_renewal_letter' and metadata->>'stage' = '90d'),
        'approved_within_30d', (select count(*) from agent_pending_actions where action_type in ('send_renewal_letter','renewal_checkpoint','send_message') and metadata->>'stage' is not null and status = 'approved' and executed_at is not null and executed_at - created_at <= interval '30 days'))),
    'actions', (
      select jsonb_build_object('proposed', count(*), 'approved', count(*) filter (where status = 'approved'), 'rejected', count(*) filter (where status = 'rejected'), 'executed', count(*) filter (where executed_at is not null))
      from agent_pending_actions where created_at >= since),
    'push_subscriptions', (select count(*) from push_subscriptions where disabled_at is null)
  ) into v;
  return v;
end $$;
revoke execute on function public.admin_lifecycle_stats(int) from public, anon;
grant execute on function public.admin_lifecycle_stats(int) to authenticated;

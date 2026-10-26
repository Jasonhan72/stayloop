-- 第三批站内部分 (2026-10-27; design/ai-rebuild-report-review-2026-10-25.md):
--   listings.first_occupied_after_2018   the landlord's own statement that the unit was first occupied for
--                                        residential purposes after 2018-11-15 (RTA s.6.1: not bound by the
--                                        annual guideline). NULL = not stated. Shown on the public page as a
--                                        plain fact; the N1 tool already takes the same flag.
--   agent_public_signals(auth_ids)       the directory's in-platform signals for public agent profiles:
--                                        screenings completed (365 d), clients leased / closed, and the median
--                                        minutes to the agent's first reply in a thread (90 d, with the sample
--                                        count so the card can say "not enough data"). Service role only; the
--                                        API attaches them only for agents who ticked show_activity.
alter table public.listings add column if not exists first_occupied_after_2018 boolean;

create or replace function public.agent_public_signals(p_auth_ids uuid[])
returns table (auth_id uuid, screenings integer, leases integer, response_samples integer, response_median_minutes integer)
language sql
security definer
set search_path = public
as $$
  select a.id as auth_id,
         (select count(*)::int from public.screenings s
           where s.landlord_id = a.id and s.scored_at is not null and s.created_at >= now() - interval '365 days') as screenings,
         (select count(*)::int from public.agent_clients c
           where c.agent_auth_id = a.id and c.stage in ('leased', 'closed')) as leases,
         coalesce(r.n, 0)::int as response_samples,
         r.med::int as response_median_minutes
    from unnest(p_auth_ids) as a(id)
    left join lateral (
      select count(*) as n,
             percentile_cont(0.5) within group (order by extract(epoch from (m.created_at - prev.created_at)) / 60.0) as med
        from public.thread_messages m
        join lateral (
          select p.id, p.created_at from public.thread_messages p
           where p.thread_id = m.thread_id and p.id < m.id and p.kind = 'message' and p.sender_id is distinct from a.id
           order by p.id desc limit 1
        ) prev on true
       where m.sender_id = a.id and m.kind = 'message' and m.created_at >= now() - interval '90 days'
         and not exists (select 1 from public.thread_messages q
                          where q.thread_id = m.thread_id and q.sender_id = a.id and q.id > prev.id and q.id < m.id)
    ) r on true;
$$;
revoke execute on function public.agent_public_signals(uuid[]) from public, anon, authenticated;
grant execute on function public.agent_public_signals(uuid[]) to service_role;

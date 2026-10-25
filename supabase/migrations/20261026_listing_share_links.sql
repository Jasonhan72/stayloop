-- 分享包 v2 + 回流闭环 (2026-10-26; design/ai-rebuild-report-review-2026-10-25.md 第一批 2 / 3).
--
--   listing_share_links   one short code per (listing, outside channel): /go/<code> counts the
--                         click and sends the visitor to the Stayloop listing page with ?src=<channel>.
--                         Created by POST /api/listings/share-links (service role) when the landlord
--                         opens the share pack; the API roles get SELECT only (owner / admin).
--   bump_share_link()     the redirect's single call: +1 click, returns slug + channel. Service role only.
--   listing_syndications  the manual channels the landlord pastes a post link back from gain
--                         facebook_marketplace (Meta: personal accounts only, no API) and other.

create table if not exists public.listing_share_links (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  channel         text not null check (channel in ('wechat','xiaohongshu','facebook_group','facebook_marketplace','kijiji','instagram','reply','poster')),
  code            text not null unique check (code ~ '^[a-z0-9]{8}$'),
  clicks          integer not null default 0,
  last_clicked_at timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (listing_id, channel)
);
create index if not exists listing_share_links_listing_idx on public.listing_share_links (listing_id);

alter table public.listing_share_links enable row level security;
drop policy if exists listing_share_links_read on public.listing_share_links;
create policy listing_share_links_read on public.listing_share_links
  for select to authenticated using (
    exists (
      select 1 from public.listings l
       where l.id = listing_share_links.listing_id
         and (l.landlord_id = auth.uid()
              or l.landlord_id in (select ld.id from public.landlords ld where ld.auth_id = auth.uid()))
    )
    or public.is_stayloop_admin()
  );
revoke all on public.listing_share_links from public, anon, authenticated, service_role;
grant select on public.listing_share_links to authenticated;
grant all on public.listing_share_links to service_role;

-- One call per redirect. SECURITY DEFINER so the anonymous visitor's request (service role on the
-- server) never needs a grant on the table; locked to service_role.
create or replace function public.bump_share_link(p_code text)
returns table (slug text, channel text, listing_active boolean)
language sql
security definer
set search_path = public
as $$
  with bumped as (
    update public.listing_share_links s
       set clicks = s.clicks + 1, last_clicked_at = now()
     where s.code = p_code
    returning s.listing_id, s.channel
  )
  select li.slug, bumped.channel, (li.is_active and li.verification_status = 'verified') as listing_active
    from bumped
    join public.listings li on li.id = bumped.listing_id;
$$;
revoke execute on function public.bump_share_link(text) from public, anon, authenticated;
grant execute on function public.bump_share_link(text) to service_role;

alter table public.listing_syndications drop constraint if exists listing_syndications_channel_check;
alter table public.listing_syndications add constraint listing_syndications_channel_check
  check (channel in ('mls','facebook_page','instagram','kijiji','rentsync','wechat','xiaohongshu','facebook_group','facebook_marketplace','other'));
